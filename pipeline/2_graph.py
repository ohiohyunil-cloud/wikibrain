"""링크 제목을 문서 번호로 풀어 간선 배열을 만든다(넘겨주기 해소, 자기 링크·없는 문서 제외).
출력: data/edges.npy (int32, shape [E,2]), data/titles.json, data/meta.npz (indeg, game)
"""
import json
import numpy as np

titles, game, intros, cats = [], [], [], []
for line in open("data/pages.jsonl"):
    p = json.loads(line)
    titles.append(p["t"]); game.append(p["game"]); intros.append(p["intro"]); cats.append(p.get("cats", []))
T = {t: i for i, t in enumerate(titles)}
R = json.load(open("data/redirects.json"))


def resolve(t):
    for _ in range(3):  # 넘겨주기 연쇄
        if t in T:
            return T[t]
        t = R.get(t)
        if t is None:
            return None
    return None


src, dst = [], []
for line in open("data/links.tsv"):
    s, d = line.rstrip("\n").split("\t", 1)
    j = resolve(d)
    s = int(s)
    if j is not None and j != s:
        src.append(s); dst.append(j)
E = np.stack([np.array(src, np.int32), np.array(dst, np.int32)], 1)
E = np.unique(E, axis=0)
indeg = np.bincount(E[:, 1], minlength=len(titles)).astype(np.int32)
np.save("data/edges.npy", E)
np.savez("data/meta.npz", indeg=indeg, game=np.array(game))
json.dump({"titles": titles, "intros": intros, "cats": cats}, open("data/titles.json", "w"), ensure_ascii=False)
print("nodes", len(titles), "edges", len(E))
assert E[:, 0].max() < len(titles) and (E[:, 0] != E[:, 1]).all()
