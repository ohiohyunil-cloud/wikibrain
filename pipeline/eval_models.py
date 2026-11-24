"""모델 비교: (기준, 가까워야 할 문서, 멀어야 할 문서) 33쌍 + 무작위 문서 5000개.
지표
- 정답률: sim(기준,가까움) > sim(기준,멂) 비율
- 가까움 순위: 무작위 5000개 중 '가까움'보다 더 가까운 문서 수 (낮을수록 좋음, 중앙값)
- 멂 백분위: '멂'보다 더 먼 무작위 문서 비율 (낮을수록 좋음 = 정말 먼 쪽)
사용: .venv/bin/python pipeline/eval_models.py minilm e5-base bge-m3
"""
import json, os, sys, time
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from models import doc_text, load

D = json.load(open("data/titles.json"))
idx = {t: i for i, t in enumerate(D["titles"])}
cats = D.get("cats") or [[]] * len(D["titles"])
game = np.load("data/meta.npz")["game"]
trip = json.load(open(os.path.join(os.path.dirname(__file__), "eval_triplets.json")))
rng = np.random.default_rng(0)
rand = rng.choice(np.flatnonzero(game), 5000, replace=False)
ids = sorted({idx[t] for tr in trip for t in tr} | set(rand.tolist()))
pos = {g: k for k, g in enumerate(ids)}

for name in sys.argv[1:]:
    model, prefix = load(name)
    t0 = time.time()
    E = model.encode([prefix + doc_text(D["titles"][g], D["intros"][g], cats[g]) for g in ids],
                     batch_size=64, normalize_embeddings=True)
    rate = len(ids) / (time.time() - t0)
    R = E[[pos[g] for g in rand]]
    acc, near_rank, far_pct = [], [], []
    for a, n, f in trip:
        va, vn, vf = (E[pos[idx[x]]] for x in (a, n, f))
        sa = R @ va
        acc.append(va @ vn > va @ vf)
        near_rank.append(int((sa > va @ vn).sum()))
        far_pct.append(float((sa < va @ vf).mean() * 100))
    print(f"{name:8s} 정답률 {np.mean(acc)*100:5.1f}%  가까움 순위 중앙값 {int(np.median(near_rank)):5d}/5000  "
          f"멂 백분위 중앙값 {np.median(far_pct):5.1f}%  속도 {rate:.0f}문서/초", flush=True)
