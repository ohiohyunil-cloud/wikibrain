"""Mac 로컬 MLX 브리지 (설계서 v2 Phase 4). 127.0.0.1:8001, 요청마다 X-Bridge-Token 검사.
사용: BRIDGE_TOKEN=... .venv/bin/python backend/mlx_bridge.py
  /api/embed   e5 임베딩 + 코사인 최근접 위키 항성 9개(중심 1 + 8)
  /api/rag     선택 노드 본문 앞 2000자로 문맥 조립 (data/bodies.db)
  /api/chat    mlx_lm.server 프록시 (127.0.0.1:8090, 스트리밍 그대로 전달)
  /api/augment 3관점 증강 → LoRA 학습 큐(1개). 8GB: 학습 중 채팅 서버 정지 후 어댑터로 재기동
  /api/status  학습 상태
"""
import hashlib, json, os, re, sqlite3, subprocess, sys, threading, time, urllib.request
from typing import List, Optional
import numpy as np
from fastapi import FastAPI, BackgroundTasks, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(PROJECT, "pipeline"))

RAM_GB = int(os.popen("sysctl -n hw.memsize").read()) // 2**30
BASE_MODEL = ("mlx-community/Qwen2.5-7B-Instruct-4bit" if RAM_GB >= 32 else
              "mlx-community/Qwen2.5-3B-Instruct-4bit" if RAM_GB >= 16 else
              "mlx-community/Qwen2.5-1.5B-Instruct-4bit")
ROOT = f"{PROJECT}/data/lora"  # 어댑터·학습 데이터·로그 (data/는 git 제외)
ADAPTERS, DATA = f"{ROOT}/adapters", f"{ROOT}/data"
TOKEN = os.environ["BRIDGE_TOKEN"]
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
CHAT_PORT = 18090  # 흔한 개발 포트와 겹치지 않게
TRAIN_LOCK, CHAT_LOCK = threading.Lock(), threading.Lock()
STATUS = {}  # clusterId → {state, ...}
os.makedirs(ADAPTERS, exist_ok=True); os.makedirs(DATA, exist_ok=True)
app = FastAPI(title="Mac Native MLX Knowledge Engine v2")
# 공개 사이트가 방문자 자신의 Mac 브리지를 부를 수 있게 그 출처만 허용. 토큰은 여전히 필요
SITE_ORIGINS = {"https://site-ten-mocha-46.vercel.app"}
SITE_ORIGINS |= set(os.environ.get("WIKIBRAIN_ORIGINS", "").split())  # 테스트용 추가 출처 (기본 없음)
OK_HOSTS = {"127.0.0.1:8001", "localhost:8001"}


@app.middleware("http")
async def guard(request, call_next):
    from fastapi.responses import Response
    if request.headers.get("host", "") not in OK_HOSTS:  # DNS 리바인딩 차단
        return Response(status_code=403)
    origin = request.headers.get("origin")
    if origin and origin not in SITE_ORIGINS:  # 다른 웹사이트에서 온 요청 차단 (같은 Mac 프록시는 Origin 없음)
        return Response(status_code=403)
    if request.method == "OPTIONS":  # CORS 사전 요청 + 크롬 로컬 네트워크 접근 허가
        r = Response(status_code=204)
    else:
        r = await call_next(request)
    if origin:
        r.headers.update({"Access-Control-Allow-Origin": origin, "Vary": "Origin",
                          "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type, X-Bridge-Token",
                          "Access-Control-Allow-Private-Network": "true", "Access-Control-Max-Age": "600"})
    return r

# ── 은하 데이터 (float16 memmap: float32 전체 변환 시 2.4GB)
META = json.load(open(f"{PROJECT}/data/emb_meta.json"))
N, DIM = META["n"], META["dim"]
EMB = np.memmap(f"{PROJECT}/data/emb.f16", np.float16, "r", shape=(N, DIM))
TITLES = json.load(open(f"{PROJECT}/data/brain_titles.json"))
BODIES = f"{PROJECT}/data/bodies.db"
_e5 = None


E5_LOCK = threading.Lock()


def e5():
    global _e5
    with E5_LOCK:  # 수집 스레드와 요청이 동시에 처음 올리면 torch meta tensor 오류
        return _e5_load()


def enc(texts, **kw):
    with E5_LOCK:  # MPS 위 동시 encode도 직렬화
        return _e5_load().encode(texts, **kw)


def _e5_load():
    global _e5
    if _e5 is None:
        from models import load  # safetensors만 허용
        assert META["model"] == "e5-base", "은하와 같은 모델이어야 코사인 비교 가능"
        _e5, _ = load("e5-base")
    return _e5


def nearest_many(V, k=9):
    """질의 여러 개를 한 번의 77만 스캔으로 처리 (질의마다 스캔하면 건당 4~5초)."""
    V = np.atleast_2d(V).astype(np.float32); q = len(V)
    best_s, best_i = np.full((q, k), -2.0, np.float32), np.zeros((q, k), np.int64)
    for a in range(0, N, 65536):  # 청크 내적: 77만×768을 한 번에 float32로 올리지 않는다
        s = V @ np.asarray(EMB[a:a + 65536], np.float32).T
        top = np.argpartition(-s, k, axis=1)[:, :k]
        cs = np.concatenate([best_s, np.take_along_axis(s, top, 1)], 1); ci = np.concatenate([best_i, top + a], 1)
        o = np.argsort(-cs, 1)[:, :k]; best_s, best_i = np.take_along_axis(cs, o, 1), np.take_along_axis(ci, o, 1)
    return [[{"i": int(i), "title": TITLES[i], "sim": float(x)} for i, x in zip(bi, bs)] for bi, bs in zip(best_i, best_s)]


def nearest(v, k=9):
    return nearest_many(v, k)[0]


def check(token: Optional[str]):
    if token != TOKEN:
        raise HTTPException(401)


class EmbedRequest(BaseModel):
    text: str = Field(min_length=1, max_length=6000)
    title: str = Field("", max_length=300)
    kind: str = Field("passage", pattern="^(passage|query)$")


@app.post("/api/embed")
def embed(req: EmbedRequest, x_bridge_token: Optional[str] = Header(None)):
    check(x_bridge_token)
    s = f"passage: {req.title} - {req.text}" if req.kind == "passage" else f"query: {req.text}"
    v = enc([s], normalize_embeddings=True)[0].astype(np.float32)
    t0 = time.time(); nb = nearest(v)
    return {"model": "intfloat/multilingual-e5-base", "input": s[:80], "neighbors": nb, "search_ms": round((time.time() - t0) * 1000)}


class RagRequest(BaseModel):
    indices: List[int] = Field(min_length=1, max_length=400)
    question: str = Field("", max_length=2000)
    top: int = Field(0, ge=0, le=30)  # >0이면 질문과 가장 가까운 top개만
    chars: int = Field(2000, ge=200, le=4000)  # 문서당 글자 수 (채팅은 짧게: 1.5B 첫 토큰이 문맥 길이에 비례)


@app.post("/api/rag")
def rag(req: RagRequest, x_bridge_token: Optional[str] = Header(None)):
    check(x_bridge_token)
    t0 = time.time()
    ids = list(dict.fromkeys(i for i in req.indices if 0 <= i < N))
    if req.question and req.top:  # 후보 문서 중 질문과 의미가 가까운 것만 (같은 e5 공간)
        qv = enc([f"query: {req.question}"], normalize_embeddings=True)[0].astype(np.float32)
        sims = np.asarray(EMB[sorted(ids)], np.float32) @ qv
        ids = [sorted(ids)[k] for k in np.argsort(-sims)[:req.top]]
    db = sqlite3.connect(f"file:{BODIES}?mode=ro", uri=True)
    q = f"SELECT i, t, substr(body, 1, {req.chars}) FROM docs WHERE i IN ({','.join('?' * len(ids))})"
    rows = {i: (t, b) for i, t, b in db.execute(q, ids)}; db.close()
    docs = [{"i": i, "title": rows[i][0], "text": rows[i][1]} for i in ids if i in rows]
    ctx = "\n\n---\n\n".join(f"[{d['title']}]\n{d['text']}" for d in docs)
    return {"docs": docs, "context": ctx, "assemble_ms": round((time.time() - t0) * 1000, 1)}


# ── 채팅 서버 (mlx_lm.server) 관리
_chat = None


def start_chat_server(adapter: Optional[str] = None):
    global _chat
    with CHAT_LOCK:
        if _chat and _chat.poll() is None:
            return
        cmd = [sys.executable, "-m", "mlx_lm.server", "--model", BASE_MODEL, "--host", "127.0.0.1", "--port", str(CHAT_PORT)]
        if adapter:
            cmd += ["--adapter-path", adapter]
        _chat = subprocess.Popen(cmd, stdout=open(f"{ROOT}/chat.log", "a"), stderr=subprocess.STDOUT)
    for _ in range(120):  # 기동 대기 (모델 로드 수 초)
        if _chat.poll() is not None:  # 기동 실패(포트 충돌 등) 즉시 알림
            raise HTTPException(503, "채팅 서버 기동 실패 (data/lora/chat.log)")
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{CHAT_PORT}/v1/models", timeout=1); return
        except Exception:
            time.sleep(0.5)


def stop_chat_server():
    global _chat
    with CHAT_LOCK:
        if _chat and _chat.poll() is None:
            _chat.terminate(); _chat.wait(30)
        _chat = None


# 작은 모델(1.5B)은 문서 여러 개를 섞고 날짜를 지어낸다: 근거 번호 인용, 문서별 분리, 없는 숫자 금지를 명시
SYSTEM = ("너는 주어진 문서만 근거로 한국어로 답한다. 규칙:\n"
          "1. 문장마다 근거 문서 번호를 [1]처럼 붙인다.\n"
          "2. 서로 다른 문서의 사건·인물·날짜를 하나로 합치지 않는다. 사건이 여럿이면 항목을 나눠 쓴다.\n"
          "3. 날짜·숫자·이름은 문서에 적힌 것만 쓴다. 영어 문서는 뜻만 옮기고 내용을 덧붙이지 않는다.\n"
          "4. 문서에 답이 없으면 '주어진 문서에는 없다'고만 말한다.\n"
          "5. 짧게, 핵심부터.")


def numbered(ctx):
    """'---'로 나뉜 문서와 빈 줄로 나뉜 사건 묶음에 [1], [2] 번호를 붙인다."""
    parts = [p.strip() for p in re.split(r"\n\s*---\s*\n|\n\n(?=\[)", ctx) if p.strip()]
    return "\n\n".join(f"[{k}] {p}" for k, p in enumerate(parts, 1))


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    context: str = Field("", max_length=60000)
    max_tokens: int = Field(512, ge=1, le=2048)


@app.post("/api/chat")
def chat(req: ChatRequest, x_bridge_token: Optional[str] = Header(None)):
    check(x_bridge_token)
    if TRAIN_LOCK.locked():
        raise HTTPException(503, "학습 중 (8GB: 채팅 서버 정지)")
    start_chat_server(CURRENT_ADAPTER[0])
    body = json.dumps({"stream": True, "max_tokens": req.max_tokens, "messages": [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": f"[문서]\n{numbered(req.context)}\n\n[질문]\n{req.question}"}]}).encode()
    r = urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{CHAT_PORT}/v1/chat/completions", body,
                                                      {"Content-Type": "application/json"}), timeout=300)
    return StreamingResponse(iter(lambda: r.readline(), b""), media_type="text/event-stream")


# ── 3관점 증강 + LoRA
class Doc(BaseModel):
    title: str = Field(max_length=300)
    text: str = Field(max_length=6000)


class AugmentRequest(BaseModel):
    clusterId: str
    documents: List[Doc] = Field(min_length=1, max_length=30)


VIEWS = {
    "summary": "{t}의 핵심 원리와 정의를 한 문단으로 요약해 주세요.",
    "compare": "{t}이(가) 인접 개념과 구별되는 결정적 차이는 무엇입니까?",
    "apply":   "{t}을(를) 실제 시스템이나 비즈니스에 적용할 때 핵심 고려사항은?",
}
CURRENT_ADAPTER = [None]


def synthesize_3view_data(docs: List[Doc]) -> List[dict]:
    """베이스 모델이 문서를 문맥으로 3관점 답을 직접 생성 (템플릿 복붙 아님)."""
    from mlx_lm import load, generate
    model, tok = load(BASE_MODEL)  # 한 번만 로드하고 끝나면 해제 (8GB)
    rows = []
    for d in docs:
        ctx = d.text[:2000]
        for q in VIEWS.values():
            question = q.format(t=d.title)
            msgs = [{"role": "system", "content": "주어진 문서에 근거해서만 한국어로 답하라."},
                    {"role": "user", "content": f"[문서]\n{ctx}\n\n[질문]\n{question}"}]
            ans = generate(model, tok, tok.apply_chat_template(msgs, add_generation_prompt=True, tokenize=False), max_tokens=350)
            rows.append({"messages": [{"role": "user", "content": f"[문서]\n{ctx}\n\n{question}"},
                                      {"role": "assistant", "content": ans}]})
    del model, tok
    import gc, mlx.core as mx
    gc.collect(); mx.clear_cache()
    return rows


def write_split(ddir: str, rows: List[dict]):
    n_val = max(1, len(rows) // 10)  # mlx_lm.lora는 valid.jsonl 필수
    for name, part in (("valid.jsonl", rows[:n_val]), ("train.jsonl", rows[n_val:])):
        with open(os.path.join(ddir, name), "w", encoding="utf-8") as f:
            f.writelines(json.dumps(r, ensure_ascii=False) + "\n" for r in part)


def last_losses(log_path: str):
    txt = open(log_path, encoding="utf-8", errors="ignore").read()
    tr = re.findall(r"Train loss ([\d.]+)", txt); va = re.findall(r"Val loss ([\d.]+)", txt)
    return (float(tr[-1]) if tr else None), (float(va[-1]) if va else None)


def run_mlx_lora_training(cid: str, docs: List[Doc]):
    with TRAIN_LOCK:  # 학습은 한 번에 하나 (8GB 보호)
        t0 = time.time()
        try:
            STATUS[cid] = {"state": "stopping_chat"}; stop_chat_server()  # 8GB: 증강·학습 중 서빙 중지
            ddir = os.path.join(DATA, cid); os.makedirs(ddir, exist_ok=True)
            STATUS[cid] = {"state": "augmenting"}
            rows = synthesize_3view_data(docs); write_split(ddir, rows)
            STATUS[cid] = {"state": "training", "rows": len(rows)}
            adir, log_path = os.path.join(ADAPTERS, cid), os.path.join(ddir, "train.log")
            with open(log_path, "w") as log:
                subprocess.run([sys.executable, "-m", "mlx_lm.lora", "--model", BASE_MODEL, "--train",
                                "--data", ddir, "--iters", "45", "--batch-size", "2" if RAM_GB >= 16 else "1",
                                "--num-layers", "8", "--learning-rate", "1e-4", "--steps-per-eval", "15",
                                "--adapter-path", adir], check=True, stdout=log, stderr=subprocess.STDOUT)
            tr, va = last_losses(log_path)
            if tr and va and va > 2 * tr:  # 과적합 가드
                import shutil; shutil.rmtree(adir, ignore_errors=True)
                STATUS[cid] = {"state": "discarded_overfit", "train_loss": tr, "val_loss": va}
            else:
                CURRENT_ADAPTER[0] = adir
                STATUS[cid] = {"state": "done", "train_loss": tr, "val_loss": va, "adapter": adir}
        except Exception as e:
            STATUS[cid] = {"state": "failed", "error": type(e).__name__}
            print("train failed", cid, repr(e), flush=True)
        finally:
            STATUS[cid]["seconds"] = round(time.time() - t0)
            start_chat_server(CURRENT_ADAPTER[0])  # 재기동 = 핫스왑


@app.post("/api/augment")
async def augment(req: AugmentRequest, bg: BackgroundTasks, x_bridge_token: Optional[str] = Header(None)):
    check(x_bridge_token)
    if not ID_RE.match(req.clusterId):
        raise HTTPException(400, "clusterId 형식 오류")
    if TRAIN_LOCK.locked():
        raise HTTPException(409, "학습 큐가 차 있음")
    rag_ctx = "\n\n---\n\n".join(f"[{d.title}]\n{d.text}" for d in req.documents)
    STATUS[req.clusterId] = {"state": "queued"}
    bg.add_task(run_mlx_lora_training, req.clusterId, req.documents)
    return {"status": "RAG_READY_LORA_QUEUED", "clusterId": req.clusterId, "ragContext": rag_ctx,
            "sampleCount": len(req.documents) * 3, "baseModel": BASE_MODEL}


# ── 위성: API 키 없이 받을 수 있는 공개 피드만 (고정 주소, SSRF 표면 없음)
FEEDS = [
    ("news", "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko"),
    ("disclosure", "https://news.google.com/rss/search?q=%EA%B3%B5%EC%8B%9C&hl=ko&gl=KR&ceid=KR:ko"),  # '공시' 관련 뉴스 (DART는 키 필요)
    ("paper", "https://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=15"),
]
SAT_PATH = f"{ROOT}/satellites.json"
DATE_RE = re.compile(r"^(\d{1,2}월( \d{1,2}일)?|\d{3,4}년( \d{1,2}월)?|\d{3,4}년대|\d{1,2}세기)$")
SAT_TTL, SAT_MAX, PER_FEED = 48 * 3600, 300, 15
SATS = json.load(open(SAT_PATH)) if os.path.exists(SAT_PATH) else []
SAT_LOCK = threading.Lock()
INGEST = {"last": None, "added": 0, "error": None}


def fetch_feed(url):
    import xml.etree.ElementTree as ET
    req = urllib.request.Request(url, headers={"User-Agent": "WikiBrain/1.0 (local research)"})
    raw = urllib.request.urlopen(req, timeout=15).read(3_000_000)
    if b"<!DOCTYPE" in raw[:2000] or b"<!ENTITY" in raw:  # 엔티티 폭탄 차단
        raise ValueError("DOCTYPE/ENTITY 거부")
    root, out = ET.fromstring(raw), []
    import html as _html
    strip = lambda t: re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", " ", t or ""))).replace("\xa0", " ").strip()
    for it in root.iter("item"):  # RSS
        out.append({"title": strip(it.findtext("title")), "summary": strip(it.findtext("description"))[:600],
                    "link": (it.findtext("link") or "").strip(), "published": it.findtext("pubDate") or ""})
    A = "{http://www.w3.org/2005/Atom}"
    for e in root.iter(A + "entry"):  # arXiv Atom
        out.append({"title": strip(e.findtext(A + "title")), "summary": strip(e.findtext(A + "summary"))[:600],
                    "link": (e.findtext(A + "id") or "").strip().replace("http://arxiv.org/", "https://arxiv.org/"), "published": e.findtext(A + "published") or ""})
    for x in out:  # Google 뉴스 제목 끝의 ' - 언론사' 제거 (연결 잡음)
        x["title"] = re.sub(r"\s+-\s+[^-]{1,30}$", "", x["title"])
    return [x for x in out[:PER_FEED] if x["title"] and x["link"].startswith("https://")]


# 개체 사전: 들어오는 링크 10개 이상 문서 제목과 그 문서로 가는 넘겨주기 별칭 (메모리 절약용 컷)
_ENT = None
PARTICLE = re.compile(r"(으로부터|에서는|에게서|으로서|으로써|이라고|라고|에서|에게|으로|부터|까지|처럼|보다|이나|에는|과의|와의|은|는|이|가|을|를|의|에|로|와|과|도|만|발|측|株|號)$")


def entities():
    global _ENT
    if _ENT is None:
        k = np.fromfile(f"{PROJECT}/data/brain.bin", np.float32).reshape(N, 4)[:, 3]
        ent = {t.lower(): i for i, t in enumerate(TITLES) if k[i] >= 10 and len(t) >= 2 and not DATE_RE.match(t)}
        idx = {t: i for i, t in enumerate(TITLES)}
        for a, b in json.load(open(f"{PROJECT}/data/redirects.json")).items():
            i = idx.get(b)
            if i is not None and k[i] >= 10 and 3 <= len(a) <= 30:  # 2글자 별칭(동결→응고 등)은 오연결이 많아 제외
                ent.setdefault(a.lower(), i)
        # 허브 점수: 전체 평균 방향과의 유사도. 어디에나 가까운 토막 문서(사자성어·짧은 일반어)를 깎는 데 쓴다
        m = np.zeros(DIM, np.float64)
        for a in range(0, N, 65536):
            m += np.asarray(EMB[a:a + 65536], np.float32).sum(0)
        m = (m / np.linalg.norm(m)).astype(np.float32)
        hub = np.concatenate([np.asarray(EMB[a:a + 65536], np.float32) @ m for a in range(0, N, 65536)])
        _ENT = (ent, k, hub - hub.mean())
    return _ENT


def mentions(text):
    """본문에서 위키 제목과 정확히 맞는 1~3어절 구를 찾는다 (조사 떼고). 긴 구 우선."""
    ent, k, _ = entities()
    toks = [PARTICLE.sub("", t) for t in re.findall(r"[가-힣A-Za-z0-9]+", text)]
    found = {}
    for n in (3, 2, 1):
        for a in range(len(toks) - n + 1):
            for key in (" ".join(toks[a:a + n]), "".join(toks[a:a + n])):
                i = ent.get(key.lower())
                latin = not re.search(r"[가-힣]", key)  # 영어는 약어·숫자 포함 이름만 (The, Performance 같은 일반어 제외)
                if i is not None and not key.isdigit() and (n > 1 or len(key) >= 2) and (not latin or key.isupper() or re.search(r"\d", key)):
                    found.setdefault(i, n)
    return found


def link_items(items, V):
    """언급은 제목에서만 찾는다: Google 뉴스 요약에는 다른 기사 제목과 언론사 이름이 섞여 있다."""
    return link([x["title"] for x in items], V)


def link(texts, V):
    """후보 = 본문 언급 문서 ∪ e5 최근접 60, 점수 = e5 유사도 + 언급 가산점 + 링크 수 사전확률.
    짧은 헤드라인은 e5만 쓰면 토막 문서(법률명·사자성어)로 쏠려서 링크 수로 보정한다. 날짜 문서 제외, 상위 9."""
    _, k, hub = entities(); out = []
    for text, v, nb in zip(texts, V, nearest_many(V, 60)):
        cand = {n["i"]: n["sim"] for n in nb}
        men = mentions(text)
        ids = list(set(cand) | set(men))
        sims = np.asarray(EMB[sorted(ids)], np.float32) @ v
        sim = dict(zip(sorted(ids), sims.tolist()))
        adj = {i: sim[i] - hub[i] for i in ids}  # 허브 보정 유사도
        # 한 어절 언급(가족·사고·단독 같은 일반어)은 의미도 가까울 때만 가산: 언급 아닌 후보 중 최고값과 0.03 이내
        best = max([adj[i] for i in ids if i not in men] or [0.0])
        bonus = {i: 0.10 + 0.02 * n for i, n in men.items() if n > 1 or adj[i] >= best - 0.03}
        scored = [(adj[i] + bonus.get(i, 0.0) + 0.035 * np.log10(k[i] + 1), i) for i in ids if not DATE_RE.match(TITLES[i])]
        out.append([{"i": int(i), "title": TITLES[i], "sim": float(sim[i]), "mentioned": i in bonus} for sc, i in sorted(scored, reverse=True)[:9]])
    return out


def ingest_once():
    if TRAIN_LOCK.locked():  # 8GB: 학습 중엔 임베딩 모델을 올리지 않는다
        INGEST["error"] = "학습 중이라 건너뜀"; return 0
    have = {s["link"] for s in SATS}; new = []
    for kind, url in FEEDS:
        try:
            new += [dict(x, kind=kind) for x in fetch_feed(url) if x["link"] not in have]
        except Exception as e:
            INGEST["error"] = f"{kind}: {type(e).__name__}"
    if new:
        texts = [f"{x['title']} {x['summary']}" for x in new]
        V = enc([f"query: {t}" for t in texts], normalize_embeddings=True, batch_size=16)
        now = time.time()
        for x, nb in zip(new, link_items(new, V)):
            x.update(id="s" + hashlib.md5(x["link"].encode()).hexdigest()[:12], born=now, neighbors=nb, v=4)
    old = [s for s in SATS if s.get("v") != 4]  # 예전 방식으로 연결된 위성은 한 번 다시 연결
    if old:
        import html as _html
        for s in old:
            s["summary"] = re.sub(r"\s+", " ", _html.unescape(s["summary"])).replace("\xa0", " ").strip()
            s["title"] = re.sub(r"\s+-\s+[^-]{1,30}$", "", s["title"])
        texts = [f"{s['title']} {s['summary']}" for s in old]
        for s, nb in zip(old, link_items(old, enc([f"query: {t}" for t in texts], normalize_embeddings=True, batch_size=16))):
            s.update(neighbors=nb, v=4)
    with SAT_LOCK:
        cutoff = time.time() - SAT_TTL
        SATS[:] = ([s for s in SATS if s["born"] > cutoff] + new)[-SAT_MAX:]
        tmp = SAT_PATH + ".tmp"; json.dump(SATS, open(tmp, "w"), ensure_ascii=False); os.replace(tmp, SAT_PATH)
    INGEST.update(last=time.time(), added=len(new))
    return len(new)


# ── 세계 창: GDELT 주요 사건 수집(pipeline/7_live.py) + 사건마다 가까운 위키 문서 연결 (위성과 같은 link())
EVENTS_PATH = f"{PROJECT}/site/data/live/events.json"
EVLINK_PATH = f"{ROOT}/event_links.json"
EVLINKS = json.load(open(EVLINK_PATH)) if os.path.exists(EVLINK_PATH) else {}


def live_once():
    import importlib.util
    spec = importlib.util.spec_from_file_location("live", f"{PROJECT}/pipeline/7_live.py")
    live = importlib.util.module_from_spec(spec); spec.loader.exec_module(live)
    cwd = os.getcwd(); os.chdir(PROJECT)
    try:
        live.main(1)
    finally:
        os.chdir(cwd)
    if TRAIN_LOCK.locked():
        return
    ev = json.load(open(EVENTS_PATH))["events"][:400]
    new = [e for e in ev if e["id"] not in EVLINKS]
    if new:
        V = enc([f"query: {e['title']}" for e in new], normalize_embeddings=True, batch_size=16)
        res = link([e["title"] for e in new], V)
        _, k, _ = entities()
        # 영어 헤드라인은 영어 토막 문서('bye, *tělo)와 어디에나 붙는 문서(RDX)로 쏠린다: 한글 없는 저링크 문서와 15% 넘게 반복되는 문서 제외
        freq = {}
        for nb in res:
            for n in nb:
                freq[n["i"]] = freq.get(n["i"], 0) + 1
        bad = {i for i, c in freq.items() if c > max(3, 0.15 * len(res))}
        for e, nb in zip(new, res):
            ok = [n for n in nb if n["i"] not in bad and (re.search(r"[가-힣]", n["title"]) or k[n["i"]] >= 50)]
            EVLINKS[e["id"]] = [{"i": n["i"], "title": n["title"]} for n in ok[:5]]
    keep = {e["id"] for e in ev}
    for k in [k for k in EVLINKS if k not in keep]:
        del EVLINKS[k]
    tmp = EVLINK_PATH + ".tmp"; json.dump(EVLINKS, open(tmp, "w"), ensure_ascii=False); os.replace(tmp, EVLINK_PATH)


@app.get("/api/event_links")
def event_links(x_bridge_token: Optional[str] = Header(None)):
    check(x_bridge_token)
    return EVLINKS


def ingest_loop():
    while True:
        try:
            ingest_once()
        except Exception as e:
            INGEST["error"] = type(e).__name__; print("ingest failed", repr(e), flush=True)
        try:
            live_once()
        except Exception as e:
            print("live failed", repr(e), flush=True)
        time.sleep(600)  # 10분마다


if os.environ.get("WIKIBRAIN_INGEST", "1") == "1":
    threading.Thread(target=ingest_loop, daemon=True).start()


@app.get("/api/satellites")
def satellites(x_bridge_token: Optional[str] = Header(None)):
    check(x_bridge_token)
    calib = json.load(open(f"{PROJECT}/data/satellite_calib.json"))
    with SAT_LOCK:
        return {"satellites": SATS, "ingest": INGEST, "calib": calib, "now": time.time()}


@app.post("/api/ingest")
def ingest_now(bg: BackgroundTasks, x_bridge_token: Optional[str] = Header(None)):
    check(x_bridge_token)
    bg.add_task(ingest_once)
    return {"status": "queued"}


@app.get("/api/status")
def status(x_bridge_token: Optional[str] = Header(None)):
    check(x_bridge_token)
    return {"baseModel": BASE_MODEL, "ramGB": RAM_GB, "training": TRAIN_LOCK.locked(), "clusters": STATUS}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)  # 0.0.0.0 금지: 같은 와이파이에서 호출 가능해짐
