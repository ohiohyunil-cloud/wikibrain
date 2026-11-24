"""시그모이드 파라미터 산출: 은하 실측 분포에 맞춘다. 출력 data/satellite_calib.json
v2 원안은 무작위 쌍 코사인(중앙값 ~0.72)으로 c를 잡았지만, 위성 제약은 항상 코사인 상위 9개(~0.85+)만 쓴다.
그러면 목표거리가 전부 d_min으로 붕괴해 Stress가 수 배로 나온다(실측 3.9). 그래서 같은 조건,
즉 '문서 → 코사인 상위 9개 위키 항성'의 코사인 분포와 그 항성까지의 3D 거리 분포로 보정한다.
"""
import json, numpy as np
N = len(json.load(open("data/brain_titles.json")))
DIM = json.load(open("data/emb_meta.json"))["dim"]
E = np.memmap("data/emb.f16", np.float16, "r", shape=(N, DIM))
P = np.fromfile("data/brain.bin", np.float32).reshape(N, 4)[:, :3]
rng = np.random.default_rng(0)
K, S = 9, rng.choice(N, 300, replace=False)
Q = np.asarray(E[S], np.float32)
best_s, best_i = np.full((len(S), K + 1), -2, np.float32), np.zeros((len(S), K + 1), np.int64)
for a in range(0, N, 65536):  # 청크 내적 (8GB)
    s = Q @ np.asarray(E[a:a + 65536], np.float32).T
    cs, ci = np.concatenate([best_s, s], 1), np.concatenate([best_i, np.broadcast_to(np.arange(a, a + s.shape[1]), s.shape)], 1)
    o = np.argsort(-cs, 1)[:, :K + 1]; best_s, best_i = np.take_along_axis(cs, o, 1), np.take_along_axis(ci, o, 1)
sims, idx = best_s[:, 1:], best_i[:, 1:]  # 0번은 자기 자신
dist = np.linalg.norm(P[idx] - P[S][:, None], axis=-1)
p10, c, p90 = np.percentile(sims, [10, 50, 90])
out = {"c": float(c), "k": float(4.4 / (p90 - p10)),
       "d_min": float(np.percentile(dist, 5)), "d_max": float(np.percentile(dist, 95))}
json.dump(out, open("data/satellite_calib.json", "w")); print(out)
assert out["d_max"] > out["d_min"] > 0
