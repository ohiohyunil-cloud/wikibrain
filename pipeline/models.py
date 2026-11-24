"""임베딩 모델 후보와 문서 텍스트 규칙. 3_embed.py, eval_models.py가 같이 쓴다."""
from sentence_transformers import SentenceTransformer

# 이름 → (Hugging Face 모델, 문서 앞에 붙일 접두어)
MODELS = {
    "minilm": ("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", ""),
    "e5-base": ("intfloat/multilingual-e5-base", "passage: "),
    "bge-m3": ("BAAI/bge-m3", ""),
}


def doc_text(title, intro, cats):
    s = f"{title}. {intro[:400]}"
    return s + (" 분류: " + ", ".join(cats[:5]) if cats else "")


def load(name, device="mps"):
    repo, prefix = MODELS[name]
    # safetensors만 허용: pickle(.bin) 가중치 로드로 인한 코드 실행 위험 차단
    m = SentenceTransformer(repo, device=device, model_kwargs={"use_safetensors": True})
    m.max_seq_length = 256
    return m, prefix
