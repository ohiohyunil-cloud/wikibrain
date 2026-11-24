"""문서 확장(설계서 v3 Phase 2): 위키 자매 프로젝트 + arXiv(cs.AI, econ, q-fin)를 기존 77만 문서 뒤에 붙인다.
기존 번호(0..N-1)는 그대로라서 링크·본문 DB·위성·사이트 링크 조각이 깨지지 않는다. 새 문서는 링크 없이 추가.
단계(각각 다시 실행 가능):
  arxiv  : arXiv OAI-PMH(키 없음)로 메타데이터 수집 → data/extra_arxiv.jsonl
  parse  : 자매 프로젝트 덤프 + arXiv → data/extra.jsonl {t, intro, body, src}
  embed  : e5-base로 임베딩(이어하기) → data/emb_extra.f16
  merge  : emb.f16·titles·meta·brain.bin·bodies.db·brain_src.bin에 덧붙임(한 번만, 백업 남김)
사용: .venv/bin/python pipeline/8_extend.py arxiv|parse|embed|merge
"""
import bz2, gc, json, os, re, shutil, sqlite3, sys, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from wikitext import norm, clean_body, intro_of, localname, plain

SRC = {"wiki": 0, "wiktionary": 1, "wikisource": 2, "wikibooks": 3, "arxiv": 4}
PREFIX = {"wiktionary": "낱말: ", "wikisource": "문헌: ", "wikibooks": "책: ", "arxiv": "논문: "}
DUMPS = {"wiktionary": "dump/kowiktionary.xml.bz2", "wikisource": "dump/kowikisource.xml.bz2", "wikibooks": "dump/kowikibooks.xml.bz2"}
OAI = "https://export.arxiv.org/oai2"
ARXIV_SETS = [("cs", "2023-01-01", re.compile(r"(^| )cs\.AI( |$)")), ("econ", None, None), ("q-fin", None, None)]


def arxiv():
    out = open("data/extra_arxiv.jsonl.tmp", "w"); n = 0
    ns = {"o": "http://www.openarchives.org/OAI/2.0/", "a": "http://arxiv.org/OAI/arXiv/"}
    for st, since, keep in ARXIV_SETS:
        q = {"verb": "ListRecords", "metadataPrefix": "arXiv", "set": st}
        if since:
            q["from"] = since
        while True:
            url = OAI + "?" + urllib.parse.urlencode(q)
            for attempt in range(6):
                try:
                    body = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "wikibrain-research/0.1"}), timeout=120).read()
                    break
                except urllib.error.HTTPError as e:  # 503 = 잠시 쉬라는 뜻(Retry-After)
                    time.sleep(int(e.headers.get("Retry-After") or 20))
            else:
                raise SystemExit("arXiv 응답 없음")
            assert b"<!DOCTYPE" not in body[:2000] and b"<!ENTITY" not in body, "XML 엔티티 거부"
            root = ET.fromstring(body)
            for r in root.iter("{%s}record" % ns["o"]):
                m = r.find(".//a:arXiv", ns)
                if m is None:
                    continue
                cats = m.findtext("a:categories", "", ns)
                if keep and not keep.search(cats):
                    continue
                t = re.sub(r"\s+", " ", m.findtext("a:title", "", ns)).strip()
                ab = re.sub(r"\s+", " ", m.findtext("a:abstract", "", ns)).strip()
                out.write(json.dumps({"id": m.findtext("a:id", "", ns), "t": t, "ab": ab, "cats": cats}, ensure_ascii=False) + "\n"); n += 1
            tok = root.find(".//o:resumptionToken", ns)
            print(st, n, flush=True)
            if tok is None or not (tok.text or "").strip():
                break
            q = {"verb": "ListRecords", "resumptionToken": tok.text.strip()}
            time.sleep(3)  # arXiv 요청 간격 규칙
    out.close(); os.replace("data/extra_arxiv.jsonl.tmp", "data/extra_arxiv.jsonl")


KO_SECTION = re.compile(r"^==\s*한국어\s*==\s*$", re.M)


def wiktionary_text(raw):
    """한국어 문단만, 뜻풀이(# 줄) 위주."""
    m = KO_SECTION.search(raw)
    if not m:
        return None
    sec = re.split(r"^==[^=].*==\s*$", raw[m.end():], 1, flags=re.M)[0]
    defs = [l.lstrip("#: ").strip() for l in sec.split("\n") if l.startswith("#") and not l.startswith(("#:", "#*"))]
    body = plain(clean_body(sec))
    intro = re.sub(r"\s+", " ", plain(clean_body("\n".join(defs))))[:600]
    return intro, body


def parse():
    out = open("data/extra.jsonl.tmp", "w"); cnt = {}
    for src, path in DUMPS.items():
        title = ns = redirect = None
        for ev, el in ET.iterparse(bz2.open(path), events=("end",)):
            name = localname(el.tag)
            if name == "title":
                title = el.text
            elif name == "ns":
                ns = el.text
            elif name == "redirect":
                redirect = el.get("title")
            elif name == "text" and ns == "0" and not redirect and title:
                raw = el.text or ""
                if src == "wiktionary":
                    r = wiktionary_text(raw)
                    if not r or len(r[0]) < 8:
                        el.clear(); continue
                    intro, body = r
                else:
                    body = plain(clean_body(raw)); intro = intro_of(clean_body(raw)) or body[:600]
                    if len(body) < 200:  # 목차·빈 문서 제외
                        el.clear(); continue
                out.write(json.dumps({"t": PREFIX[src] + norm(title), "intro": intro, "body": body, "src": src}, ensure_ascii=False) + "\n")
                cnt[src] = cnt.get(src, 0) + 1
            elif name == "page":
                title = ns = redirect = None
            if name != "page" and name not in ("title", "ns", "redirect"):
                el.clear()
        print(src, cnt.get(src, 0), flush=True)
    seen = set()
    for l in open("data/extra_arxiv.jsonl"):
        p = json.loads(l)
        if p["id"] in seen or not p["t"]:
            continue
        seen.add(p["id"])
        out.write(json.dumps({"t": PREFIX["arxiv"] + p["t"], "intro": p["ab"][:600], "body": f"{p['t']}\narXiv:{p['id']} · {p['cats']}\n{p['ab']}"[:4000],
                              "src": "arxiv", "link": f"https://arxiv.org/abs/{p['id']}"}, ensure_ascii=False) + "\n")
        cnt["arxiv"] = cnt.get("arxiv", 0) + 1
    out.close(); os.replace("data/extra.jsonl.tmp", "data/extra.jsonl")
    print(cnt)


def embed():
    import torch
    from models import load, doc_text
    model, prefix = load("e5-base")
    M = sum(1 for _ in open("data/extra.jsonl")); DIM = 768; CH = 2048
    done_p = "data/emb_extra.done"; done = int(open(done_p).read()) if os.path.exists(done_p) else 0
    out = np.memmap("data/emb_extra.f16", np.float16, "r+" if os.path.exists("data/emb_extra.f16") else "w+", shape=(M, DIM))
    buf, a = [], done
    with open("data/extra.jsonl") as f:
        for k, l in enumerate(f):
            if k < done:
                continue
            p = json.loads(l); buf.append(prefix + doc_text(p["t"], p["intro"], []))
            if len(buf) == CH or k == M - 1:
                out[a:a + len(buf)] = model.encode(buf, batch_size=64, normalize_embeddings=True).astype(np.float16)
                a += len(buf); buf = []
                torch.mps.empty_cache(); gc.collect(); out.flush(); open(done_p, "w").write(str(a))
                print(f"{a}/{M}", flush=True)
    assert a == M


def merge():
    meta = json.load(open("data/emb_meta.json")); N0, DIM = meta["n"], meta["dim"]
    assert not os.path.exists("data/brain_src.bin"), "이미 merge됨 (data/backup_v2에서 되돌린 뒤 다시)"
    X = [json.loads(l) for l in open("data/extra.jsonl")]; M = len(X)
    E2 = np.memmap("data/emb_extra.f16", np.float16, "r", shape=(M, DIM))
    os.makedirs("data/backup_v2", exist_ok=True)
    for f in ["emb_meta.json", "titles.json", "meta.npz", "brain.bin", "brain_titles.json"]:
        shutil.copy(f"data/{f}", f"data/backup_v2/{f}")
    # 1) 좌표: 기존 허브(링크 상위 3만)의 화면 좌표에서 가장 닮은 8개 가중 평균 (4_brain.py와 같은 규칙)
    raw = np.fromfile("data/brain.bin", np.float32).reshape(N0, 4)
    indeg = np.load("data/meta.npz")["indeg"]; hubs = np.argsort(-indeg)[:30000]
    E0 = np.memmap("data/emb.f16", np.float16, "r", shape=(N0, DIM)); Xh = np.asarray(E0[hubs], np.float32); pos = raw[hubs, :3]
    new = np.zeros((M, 4), np.float32); rng = np.random.default_rng(1)
    for a in range(0, M, 2048):
        C = np.asarray(E2[a:a + 2048], np.float32); S = C @ Xh.T
        top = np.argpartition(-S, 8, axis=1)[:, :8]; s = np.take_along_axis(S, top, 1)
        w = np.exp((s - s.max(1, keepdims=True)) * 20); w /= w.sum(1, keepdims=True)
        p = np.einsum("nk,nkd->nd", w, pos[top]); new[a:a + 2048, :3] = p + rng.normal(size=p.shape) * (1 - s.max(1, keepdims=True)) * 60
    assert np.isfinite(new).all()
    np.concatenate([raw, new]).tofile("data/brain.bin.tmp")
    # 2) 임베딩 이어 붙이기(새 파일에 쓰고 교체)
    with open("data/emb.f16.tmp", "wb") as o:
        shutil.copyfileobj(open("data/emb.f16", "rb"), o, 64 << 20); o.write(np.asarray(E2).tobytes())
    # 3) 제목·첫 문단·메타
    D = json.load(open("data/titles.json"))
    D["titles"] += [x["t"] for x in X]; D["intros"] += [x["intro"] for x in X]; D["cats"] += [[] for _ in X]
    m = np.load("data/meta.npz")
    np.savez("data/meta.npz.tmp.npz", indeg=np.concatenate([m["indeg"], np.zeros(M, np.int32)]), game=np.concatenate([m["game"], np.zeros(M, bool)]))
    src = np.zeros(N0 + M, np.uint8); src[N0:] = [SRC[x["src"]] for x in X]
    # 4) 본문 DB (RAG). 기존 행은 그대로
    db = sqlite3.connect("data/bodies.db")
    db.executemany("INSERT OR REPLACE INTO docs(i, t, body) VALUES (?,?,?)", [(N0 + k, x["t"], x["body"]) for k, x in enumerate(X)])
    db.commit()
    if db.execute("SELECT name FROM sqlite_master WHERE name='docs_fts'").fetchone():
        db.execute("INSERT INTO docs_fts(rowid, t, body) SELECT i, t, body FROM docs WHERE i >= ?", (N0,)); db.commit()
    db.close()
    # 교체(마지막에 한꺼번에)
    os.replace("data/brain.bin.tmp", "data/brain.bin"); os.replace("data/emb.f16.tmp", "data/emb.f16")
    os.replace("data/meta.npz.tmp.npz", "data/meta.npz")
    json.dump(D, open("data/titles.json", "w"), ensure_ascii=False)
    json.dump(D["titles"], open("data/brain_titles.json", "w"), ensure_ascii=False, separators=(",", ":"))
    json.dump({**meta, "n": N0 + M}, open("data/emb_meta.json", "w"))
    src.tofile("data/brain_src.bin")
    print("merged", N0, "+", M, "=", N0 + M)


if __name__ == "__main__":
    r = wiktionary_text("== 한국어 ==\n=== 명사 ===\n# 둥근 [[열매]].\n#: 예문\n== 영어 ==\n# apple")
    assert r and r[0] == "둥근 열매.", r
    {"arxiv": arxiv, "parse": parse, "embed": embed, "merge": merge}[sys.argv[1]]()
