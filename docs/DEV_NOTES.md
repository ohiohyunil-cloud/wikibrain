# Second Brain - RAG Project (WikiBrain)

한국어 위키백과 77만 문서를 임베딩해 3D 은하(위키두뇌)로 보여 주고, 그 위에 RAG·위성·LoRA를 올리는 프로젝트. 설계서는 `docs/wikibrain-golden-architecture-v2.md`(현실 보정판)를 따른다. v1 원본도 `docs/`에 있다.

## 현재 상태 (2026-11-23 기준)

| 항목 | 상태 |
|---|---|
| 덤프 파싱 (제목·첫 문단 600자·분류·본문 링크·넘겨주기) | 완료 — 문서 770,097 / 넘겨주기 910,776 / 링크 12,143,422 |
| 임베딩 `multilingual-e5-base` (768d, float16) | **완료** — `data/emb.f16`, `data/emb_meta.json` |
| 3D 배치 `data/brain.bin` | e5 기준 재배치 완료 (sha256 `data/brain.bin.e5.sha256`, MiniLM 백업 `data/brain.minilm.bin`) |
| 로컬 화면(`index.html`) + `server.py` | e5 배치로 확인. 게임 탭 제거, 듄 테마 적용 (2026-11-23) |
| Vercel 정적 위키두뇌(`site/`) | 배포됨 https://site-ten-mocha-46.vercel.app (프로젝트 `hyunilchoi/site`, MiniLM 배치) |
| v2 설계서 Phase 0~6 | 코드 완료, 검증 결과는 아래 표. Vercel 재배포·프록시 배포는 안 함 |

## v2 Phase 6 검증 결과 (2026-11-23, 8GB Mac)

| # | 결과 | 실측 |
|---|---|---|
| M-1 | PASS | e5 재배치 후 brain.bin 해시 기록·불변 |
| M-2 | 합성 PASS / 실데이터 **미달** | 합성 0.0005~0.002, 실제 뉴스 위성 0.150 (기준 0.10). 보정을 상위 9 이웃 분포로 바꿔 3.89→0.15 |
| M-3 | PASS | 위성 10개 쌍 거리 ≥ d_min (후처리를 전체 위성 대상으로 수정) |
| M-4 | PASS | 24h 알파 0.5, 알파<0.05 제거 |
| M-5 | PASS | `passage:`/`query:` + multilingual-e5-base, 이웃 정확(GPT-5 뉴스 → GPT-5 계열) |
| M-6 | PASS | 문서 5개 → 15행, valid 1행, 같은 문서 3관점 답 유사도 최대 0.61 |
| M-7 | PASS | 77만 투영 64ms (첫 호출 178ms), DPR 2 |
| M-8 | 조립 PASS / 첫 토큰 **미달** | 문맥 조립 6.5ms. 첫 토큰 문맥 2,000자 5.4초, 6,000자 15초 (기준 3초, 1.5B prefill 한계) |
| M-9 | PASS | 1.5B 45 iter 완료, adapters.safetensors 생성, 다운로드·증강 포함 1,255초. train 0.33 / val 0.44 |
| M-10 | 미검증 | 와이파이 끄고 확인 필요 |
| M-11 | PASS | 브리지·n8n 127.0.0.1만 LISTEN, LAN IP 접근 불가, 토큰 없으면 401, `../x` 400 |
| M-12 | **미달** | 학습 중 스왑 5.0GB→최대 11GB (본문 추출 동시 실행 포함). 채팅 서버 정지·어댑터 재기동은 확인 |

남은 문제: 올가미 상한 300개×2,000자는 문맥이 너무 길다(질문 기준 상위 몇 개만 넣어야 함). `/api/embed` 77만 검색이 4.7초(설계 0.5~1초, float16→32 변환 비용). n8n은 브리지 오류를 빈 200으로 돌려줌.

## 폴더 구조

```
pipeline/
  1_parse.py        덤프 → data/pages.jsonl, links.tsv, redirects.json
  2_graph.py        링크 해소 → data/edges.npy, meta.npz(indeg, game), titles.json
  3_embed.py        임베딩 (청크 저장·이어하기, MPS 캐시 비움). 인자: minilm | e5-base
  4_brain.py        허브 3만 UMAP + 나머지 74만 kNN 보간 → brain.json(허브), brain.bin(전체), brain_titles.json
  5_site.py         Vercel용 site/data 생성 (좌표·제목·링크 샤드 95개)
  6_bodies.py       덤프 본문 → data/bodies.db (SQLite FTS5, 문서당 앞 4000자)
  calibrate_satellite.py  위성 시그모이드 보정 → data/satellite_calib.json
  dart_corp_codes.py  DART 상장사 이름→corp_code → site/api/_corp_codes.json
  wikitext.py       위키텍스트 정리 규칙 (1_parse·6_bodies 공용)
  models.py         모델 목록·문서 텍스트 규칙 (safetensors만 허용)
  eval_models.py    모델 비교 (eval_triplets.json 33쌍)
backend/mlx_bridge.py  MLX 브리지 127.0.0.1:8001 (embed·rag·chat·augment·status, BRIDGE_TOKEN)
backend/run_n8n.sh     n8n 네이티브 실행 + 워크플로 가져오기
src/core/physics/      위성 Adam 배치 엔진 (JS, 빌드 없음) + satellite.test.mjs
site/api/proxy.ts      ArXiv·DART 프록시 (PROXY_TOKEN, DART_API_KEY 환경변수)
server.py           로컬 게임/두뇌 서버 (127.0.0.1:8000, 허용 목록 정적 파일, Host 검사, CSP)
index.html          게임 탭 + 위키두뇌 탭 (three.js 로컬 vendor)
vendor/three/       three@0.160.0 — npm tarball sha512 무결성 검증 후 추출
site/               Vercel 배포본 (index.html, vercel.json 보안 헤더, data/, vendor/, .vercel 링크)
share/              claude.ai 아티팩트용 3만 허브 버전
data/               파이프라인 산출물 (git 제외)
dump/               kowiki-latest-pages-articles.xml.bz2 (2026-11-01, 1.4GB)
docs/               설계서 v1, v2
```

`links.tsv`, 로그, 진행 파일은 재생성 가능해서 옮기지 않았다.

## 환경 준비

```bash
cd "$HOME/Second Brain - RAG Project"
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

- Python 3.9.6에서 검증. `numba==0.59.1`/`llvmlite==0.42.0` 고정 필요(0.60은 UMAP에서 크래시).
- UMAP 내부 pynndescent가 이 환경에서 크래시해서 `4_brain.py`는 kNN을 numpy로 직접 계산해 넘긴다.

## 바로 다음 할 일 (e5 반영)

```bash
.venv/bin/python pipeline/4_brain.py 30000   # e5 기준 재배치 (UMAP 수 분 + 전체 보간)
.venv/bin/python pipeline/5_site.py          # site/data 재생성
cd site && npx --yes vercel@latest deploy --prod --yes   # 같은 Vercel 프로젝트로 재배포
```

로컬 확인: `.venv/bin/python server.py` → http://localhost:8000 (첫 기동 1분 내외, 링크 색인 생성).

## 주의 (8GB Mac)

- e5-base 임베딩 중 프로세스가 8.5GB까지 커져 스왑이 찼다. 원인: 텍스트 전체를 메모리에 들고 있던 것 + MPS 캐시 누적. `3_embed.py`는 둘 다 고친 버전.
- 긴 작업은 `nohup ... & disown` + `caffeinate -i -w <pid>`로 앱과 분리해서 돌렸다.
- `server.py`는 e5(768d) 임베딩을 float16 memmap으로 읽고 청크로 계산한다(float32 전체 변환 시 2.4GB).

## 보안 메모

- 로컬 서버는 127.0.0.1 바인딩, 허용 목록 밖 경로 404, Host 헤더 불일치 403, CSP·nosniff. 프로브 결과 통과.
- 임베딩 모델은 safetensors만 로드(`bge-m3`는 pickle 가중치뿐이라 제외).
- three.js는 CDN 대신 검증한 로컬 사본.
- Vercel 배포본에는 소스·덤프·임베딩 없음(좌표·제목·링크만). 위키백과 출처(CC BY-SA 4.0) 표기 포함.

## 알려진 한계

- 74만 비허브 문서 좌표는 허브 8개 가중평균 근사(덩어리 내부 미세 구조 부정확).
- 게임 "가장 먼 문서"가 짧은 토막 문서로 몰리는 경향 — 필터 추가 필요.
- 모델 평가 세트(33쌍)는 변별력이 약함(MiniLM·e5 모두 정답률 100%).
