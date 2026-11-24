"""위키두뇌: 들어오는 링크 상위 허브 H개를 UMAP으로 3D 배치하고 허브 사이 링크를 붙인다.
출력: data/brain.json  {nodes:[[title,x,y,z,indeg],...], links:[a,b,a,b,...]}
"""
import json, sys
import numpy as np

try:
    DIM = json.load(open("data/emb_meta.json"))["dim"]
except FileNotFoundError:
    DIM = 384  # 첫 버전(MiniLM)
import umap

H = int(sys.argv[1]) if len(sys.argv) > 1 else 30000
MAX_LINKS = 4  # 노드당 그릴 링크 수 상한 (화면 과부하 방지)

D = json.load(open("data/titles.json"))
meta = np.load("data/meta.npz")
indeg = meta["indeg"]
N = len(D["titles"])
emb = np.memmap("data/emb.f16", np.float16, "r", shape=(N, DIM))

hubs = np.argsort(-indeg)[:H]
X = np.asarray(emb[hubs], np.float32)
# pynndescent가 이 환경(numba)에서 크래시 → 정확한 kNN을 직접 계산해 넘김
K = 30
knn_i = np.empty((H, K), np.int64); knn_d = np.empty((H, K), np.float32)
for a in range(0, H, 2048):
    d = 1 - X[a:a + 2048] @ X.T
    i = np.argpartition(d, K, axis=1)[:, :K]
    dd = np.take_along_axis(d, i, 1); o = np.argsort(dd, 1)
    knn_i[a:a + 2048] = np.take_along_axis(i, o, 1); knn_d[a:a + 2048] = np.maximum(np.take_along_axis(dd, o, 1), 0)
pos = umap.UMAP(n_components=3, metric="cosine", n_neighbors=K, min_dist=0.3, random_state=0,
                precomputed_knn=(knn_i, knn_d, None)).fit_transform(X)
pos = (pos - pos.mean(0)) / pos.std(0) * 300

local = -np.ones(N, np.int64); local[hubs] = np.arange(H)
E = np.load("data/edges.npy")
E = E[(local[E[:, 0]] >= 0) & (local[E[:, 1]] >= 0)]
E = E[np.argsort(-indeg[E[:, 1]], kind="stable")]  # 큰 허브로 가는 링크 우선
E = E[np.argsort(E[:, 0], kind="stable")]
keep, cnt = [], {}
for s, d in E:
    if cnt.get(s, 0) < MAX_LINKS:
        cnt[s] = cnt.get(s, 0) + 1; keep += [int(local[s]), int(local[d])]

nodes = [[D["titles"][g], *map(lambda v: round(float(v), 1), pos[k]), int(indeg[g])] for k, g in enumerate(hubs)]
json.dump({"nodes": nodes, "links": keep}, open("data/brain.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("hubs", H, "links", len(keep) // 2)

# ── 전체 문서 배치: 허브가 아닌 문서는 의미가 가장 가까운 허브 8개 위치의 가중 평균에 놓는다.
# shortcut: UMAP을 77만 개 전체에 돌리지 않고 허브 기준 보간. 덩어리 내부 미세 구조는 근사치.
KH = 8
Xh = X  # 허브 임베딩 (H, DIM)
out = np.empty((N, 4), np.float32)
rng = np.random.default_rng(0)
for a in range(0, N, 2048):
    b = min(a + 2048, N)
    C = np.asarray(emb[a:b], np.float32)
    S = C @ Xh.T
    top = np.argpartition(-S, KH, axis=1)[:, :KH]
    s = np.take_along_axis(S, top, 1)
    w = np.exp((s - s.max(1, keepdims=True)) * 20); w /= w.sum(1, keepdims=True)
    p = np.einsum("nk,nkd->nd", w, pos[top])
    spread = (1 - s.max(1, keepdims=True)) * 60  # 허브와 덜 닮을수록 더 흩뿌림
    out[a:b, :3] = p + rng.normal(size=p.shape) * spread
out[hubs, :3] = pos  # 허브는 UMAP 좌표 그대로
out[:, 3] = indeg
assert np.isfinite(out).all()
out.tofile("data/brain.bin")
json.dump(D["titles"], open("data/brain_titles.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("full brain", N)
