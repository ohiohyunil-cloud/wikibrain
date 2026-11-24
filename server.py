"""게임 서버. 사용: .venv/bin/python server.py  → http://localhost:8000
제시 문서 = 들어오는 링크 상위 허브. 답 = 직접 입력한 문서 제목(넘겨주기·띄어쓰기 차이 허용).
"""
import bisect, html, json, os, random, re, urllib.error, urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
import numpy as np

try:
    DIM = json.load(open("data/emb_meta.json"))["dim"]
except FileNotFoundError:
    DIM = 384  # 첫 버전(MiniLM)

D = json.load(open("data/titles.json"))
TITLES, INTROS = D["titles"], [html.unescape(x) for x in D["intros"]]
N = len(TITLES)
meta = np.load("data/meta.npz")
INDEG, GAME = meta["indeg"], meta["game"]
EMB = np.memmap("data/emb.f16", np.float16, "r", shape=(N, DIM))  # float16 그대로: 768차원이면 float32 변환 시 2.4GB
_E = np.load("data/edges.npy")
_E = np.concatenate([_E, _E[:, ::-1]])  # 나가는 링크 + 들어오는 링크
_E = _E[np.argsort(_E[:, 0], kind="stable")]
NB_PTR = np.searchsorted(_E[:, 0], np.arange(N + 1)).astype(np.int64)
NB = _E[:, 1].copy(); del _E
R = json.load(open("data/redirects.json"))
T = {t: i for i, t in enumerate(TITLES)}
COMPACT = {}
for i, t in enumerate(TITLES):
    COMPACT.setdefault(re.sub(r"\s+", "", t).lower(), i)
SORTED = sorted((t, i) for i, t in enumerate(TITLES) if GAME[i])
TARGETS = [int(i) for i in np.argsort(-INDEG) if GAME[i]][:2000]
GAME_IDX = np.flatnonzero(GAME)
# 날짜·연도 문서는 거의 모든 문서와 이어져서 위키레이스 경유지로는 빼 둔다
DATE = np.array([bool(re.fullmatch(r"(기원전 )?\d+(년( \d+월)?|년대|세기|월( \d+일)?)", t)) for t in TITLES])


def norm(t):
    t = re.sub(r"[\s_]+", " ", t).strip()
    return t[:1].upper() + t[1:]


def resolve(text):
    t = norm(text)
    for _ in range(3):
        if t in T:
            return T[t]
        if t not in R:
            break
        t = R[t]
    return COMPACT.get(re.sub(r"\s+", "", text).lower())


def suggest(text, k=5):
    # shortcut: 접두어 일치만 제안함. 오타 교정이 필요하면 n-gram 색인으로 교체
    t = norm(text)
    j = bisect.bisect_left(SORTED, (t, -1))
    return [s for s, _ in SORTED[j:j + k] if s.startswith(t[:2])]


def link_path(a, b, cap=200000):
    """양방향 BFS. 한쪽 방문이 cap을 넘으면 포기(None)."""
    if a == b:
        return [a]
    par = [{a: -1}, {b: -1}]
    front = [[a], [b]]
    while front[0] and front[1]:
        s = 0 if len(front[0]) <= len(front[1]) else 1
        nxt = []
        for u in front[s]:
            for v in np.unique(NB[NB_PTR[u]:NB_PTR[u + 1]]).tolist():
                if v in par[s] or (DATE[v] and v not in par[1 - s]):
                    continue
                par[s][v] = u
                if v in par[1 - s]:
                    left, right = [], []
                    x = v
                    while x != -1:
                        left.append(x); x = par[0][x]
                    x = par[1][v]
                    while x != -1:
                        right.append(x); x = par[1][x]
                    return left[::-1] + right
                nxt.append(v)
            if len(par[s]) > cap:
                return None
        front[s] = nxt
    return None


def idx_param(q):
    v = q.get("i", "")
    return int(v) if v.isdigit() and int(v) < N else None


def tier(pct):
    for cut, name in ((0.1, "LEGENDARY"), (1, "EPIC"), (10, "RARE")):
        if pct <= cut:
            return name
    return "COMMON"


_cache = {}


def dists(target):
    if target not in _cache:
        if len(_cache) > 64:
            _cache.clear()
        v = np.asarray(EMB[target], np.float32)
        d = np.empty(len(GAME_IDX), np.float32)
        for a in range(0, len(GAME_IDX), 65536):  # 청크 단위로 float32 변환해 메모리 절약
            d[a:a + 65536] = 1 - np.asarray(EMB[GAME_IDX[a:a + 65536]], np.float32) @ v
        _cache[target] = (d, GAME_IDX[np.argsort(-d)[:5]])
    return _cache[target]


def score(target, guess):
    d, far = dists(target)
    dg = float(1 - np.asarray(EMB[guess], np.float32) @ np.asarray(EMB[target], np.float32))
    rank = int(np.count_nonzero(d > dg)) + 1
    total = len(GAME_IDX) - 1
    pct = rank / total * 100
    return {"guess": TITLES[guess], "distance": round(dg, 4), "rank": rank, "total": total,
            "top_pct": round(pct, 3), "tier": tier(pct), "farthest": [TITLES[i] for i in far]}


ALLOWED_HOSTS = {"localhost:8000", "127.0.0.1:8000"}
# 브리지 프록시: 토큰은 서버에만 두고 브라우저에는 넘기지 않는다
BRIDGE = "http://127.0.0.1:8001"
BRIDGE_TOKEN = os.environ.get("BRIDGE_TOKEN", "")
BRIDGE_POST = {"rag", "chat", "augment", "ingest"}
CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")


class H(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        if self.headers.get("Host", "") not in ALLOWED_HOSTS:  # DNS 리바인딩 차단
            return self.send_error(403)
        u = urlparse(self.path); q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if u.path in ("/api/b/status", "/api/b/satellites", "/api/b/event_links"):
            return self.bridge("GET", u.path.rsplit("/", 1)[1])
        if u.path == "/api/new":
            t = random.choice(TARGETS)
            return self.json({"target": TITLES[t], "intro": INTROS[t], "indeg": int(INDEG[t])})
        if u.path == "/api/score":
            t, g = resolve(q.get("target", "")[:200]), resolve(q.get("guess", "")[:200])
            if t is None:
                return self.json({"error": "제시 문서 오류"}, 400)
            if g is None or not GAME[g]:
                return self.json({"error": "그런 문서가 없음 (동음이의·목록 문서는 제외)", "suggest": suggest(q.get("guess", ""))}, 404)
            if g == t:
                return self.json({"error": "제시 문서와 같음"}, 400)
            return self.json(score(t, g))
        if u.path == "/api/links":
            i = idx_param(q)
            if i is None:
                return self.json({"error": "없음"}, 404)
            nb = np.unique(NB[NB_PTR[i]:NB_PTR[i + 1]])  # 서로 링크한 쌍은 한 번만
            n = len(nb)
            nb = nb[np.argsort(-INDEG[nb])][:400]  # 큰 문서 위주 400개만 (그리기 부담)
            return self.json({"n": n, "nb": nb.tolist()})
        if u.path == "/api/sub":  # 주어진 문서들 사이의 링크 쌍 (성좌선)
            ids = [int(x) for x in q.get("ids", "").split(",")[:80] if x.isdigit() and int(x) < N]
            S = set(ids); pairs = []
            for i in ids:
                for j in NB[NB_PTR[i]:NB_PTR[i + 1]]:
                    if j in S and i < j:
                        pairs.append([i, int(j)])
            return self.json({"pairs": [list(p) for p in {tuple(p) for p in pairs}]})
        if u.path == "/api/path":  # 위키레이스: 링크(양방향)만 타는 최단 경로
            a, b = idx_param({"i": q.get("a", "")}), idx_param({"i": q.get("b", "")})
            if a is None or b is None:
                return self.json({"error": "문서 번호 오류"}, 400)
            return self.json({"path": link_path(a, b)})
        if u.path == "/api/doc":
            i = idx_param(q) if "i" in q else resolve(q.get("t", "")[:200])
            return self.json({"title": TITLES[i], "intro": INTROS[i], "indeg": int(INDEG[i])} if i is not None else {"error": "없음"})
        if u.path in ("/", "/index.html"):  # 화면 = web/ 빌드 결과 (Astryx UI + 3D 장면)
            self.path = "/web/dist/index.html"; return super().do_GET()
        if u.path.startswith("/assets/") and ".." not in u.path and "\\" not in u.path:
            self.path = "/web/dist" + u.path; return super().do_GET()
        if u.path == "/live/events.json":  # 세계 창 사건 (pipeline/7_live.py 결과)
            self.path = "/site/data/live/events.json"; return super().do_GET()
        if u.path in ("/data/brain.json", "/data/brain.bin", "/data/brain_titles.json", "/data/brain_src.bin") or \
                (u.path.startswith("/vendor/three/") and u.path.endswith(".js") and ".." not in u.path) or \
                u.path in ("/src/core/physics/AdamSpatialOptimizer.js", "/src/core/physics/SatellitePlacementEngine.js"):
            return super().do_GET()
        return self.send_error(404)  # 허용 목록 밖(소스·덤프·.venv 등)은 전부 차단

    def do_POST(self):
        if self.headers.get("Host", "") not in ALLOWED_HOSTS:
            return self.send_error(403)
        origin = self.headers.get("Origin", "")
        if origin and origin.split("//", 1)[-1] not in ALLOWED_HOSTS:  # 다른 사이트에서 보낸 요청 차단
            return self.send_error(403)
        name = urlparse(self.path).path.removeprefix("/api/b/")
        if name not in BRIDGE_POST:
            return self.send_error(404)
        n = int(self.headers.get("Content-Length") or 0)
        if n > 400_000:
            return self.send_error(413)
        return self.bridge("POST", name, self.rfile.read(n))

    def bridge(self, method, name, body=None):
        if not BRIDGE_TOKEN:
            return self.json({"error": "브리지 토큰이 없어요. run_local.sh로 켜 주세요."}, 503)
        req = urllib.request.Request(f"{BRIDGE}/api/{name}", body, method=method,
                                     headers={"X-Bridge-Token": BRIDGE_TOKEN, "Content-Type": "application/json"})
        try:
            r = urllib.request.urlopen(req, timeout=600)
        except urllib.error.HTTPError as e:
            detail = e.read()[:300].decode("utf-8", "ignore")
            return self.json({"error": f"브리지 {e.code}", "detail": detail}, e.code)
        except Exception:
            return self.json({"error": "브리지가 꺼져 있어요. run_local.sh로 켜 주세요."}, 503)
        self.send_response(200)
        self.send_header("Content-Type", r.headers.get("Content-Type", "application/json"))
        self.end_headers()
        for line in iter(r.readline, b""):  # 채팅 스트리밍을 줄 단위로 그대로 전달
            self.wfile.write(line); self.wfile.flush()

    def json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    assert resolve(TITLES[0]) == 0
    print("ready", N, "docs  http://localhost:8000", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8000), H).serve_forever()
