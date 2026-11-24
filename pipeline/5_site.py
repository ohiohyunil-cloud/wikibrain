"""정적 배포용 위키두뇌 데이터: site/data/ 에 좌표·제목·링크 샤드를 쓴다.
링크: 문서마다 들어오는 링크가 많은 이웃 K개만, 문서 번호 순으로 SHARD개씩 나눈 Int32 파일(빈 칸 -1).
"""
import json, os, shutil
import numpy as np

K, SHARD = 24, 8192
os.makedirs("site/data/links", exist_ok=True)
shutil.copy("data/brain.bin", "site/data/brain.bin")
shutil.copy("data/brain_titles.json", "site/data/titles.json")
if os.path.exists("data/brain_src.bin"):  # Phase 2 확장 후 출처별 별 색
    shutil.copy("data/brain_src.bin", "site/data/src.bin")

indeg = np.load("data/meta.npz")["indeg"]
N = len(indeg)
E = np.load("data/edges.npy")
E = np.unique(np.concatenate([E, E[:, ::-1]]), axis=0)  # 양방향, 중복 제거
E = E[np.lexsort((-indeg[E[:, 1]], E[:, 0]))]           # 문서별로, 큰 이웃 먼저
ptr = np.searchsorted(E[:, 0], np.arange(N + 1))
deg = np.diff(ptr).astype(np.int32)
for s in range(0, N, SHARD):
    e = min(s + SHARD, N)
    out = -np.ones((e - s, K + 1), np.int32)
    out[:, 0] = deg[s:e]  # 첫 칸: 전체 연결 수
    for i in range(s, e):
        nb = E[ptr[i]:min(ptr[i + 1], ptr[i] + K), 1]
        out[i - s, 1:1 + len(nb)] = nb
    out.tofile(f"site/data/links/{s // SHARD}.bin")
json.dump({"n": N, "k": K, "shard": SHARD}, open("site/data/meta.json", "w"))
assert os.path.getsize("site/data/links/0.bin") == SHARD * (K + 1) * 4
print("site data ok", N)
