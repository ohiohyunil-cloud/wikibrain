"""전체 문서 임베딩. 청크마다 저장하므로 중단 후 다시 실행하면 이어서 한다.
사용: .venv/bin/python pipeline/3_embed.py e5-base
출력: data/emb.f16 (float16 [N,dim]) + data/emb_meta.json. 끝날 때까지 기존 파일은 그대로 둔다.
"""
import gc, json, os, sys
import torch
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from models import MODELS, doc_text, load

name = sys.argv[1] if len(sys.argv) > 1 else "e5-base"
model, prefix = load(name)
# 8GB 램: 77만 개 텍스트를 한꺼번에 들지 않고 pages.jsonl에서 청크씩 읽는다
N = sum(1 for _ in open("data/pages.jsonl"))
DIM, CHUNK = model.get_sentence_embedding_dimension(), 4096


def chunks(start):
    buf = []
    with open("data/pages.jsonl") as f:
        for k, line in enumerate(f):
            if k < start:
                continue
            p = json.loads(line)
            buf.append(prefix + doc_text(p["t"], p["intro"], p.get("cats", [])))
            if len(buf) == CHUNK:
                yield buf; buf = []
    if buf:
        yield buf
tmp, done_path = f"data/emb_{name}.f16", f"data/emb_{name}.done"
done = int(open(done_path).read()) if os.path.exists(done_path) else 0
out = np.memmap(tmp, np.float16, "r+" if os.path.exists(tmp) else "w+", shape=(N, DIM))
a = done
for texts in chunks(done):
    b = a + len(texts)
    out[a:b] = model.encode(texts, batch_size=64, normalize_embeddings=True).astype(np.float16)
    a = b
    torch.mps.empty_cache()  # MPS 캐시가 청크마다 쌓여 8GB+까지 커지는 것 방지
    gc.collect()
    out.flush(); open(done_path, "w").write(str(b))
    print(f"{b}/{N}", flush=True)
del out
os.replace(tmp, "data/emb.f16")
json.dump({"model": name, "dim": DIM, "n": N}, open("data/emb_meta.json", "w"))
os.remove(done_path)
print("done", name, DIM)
