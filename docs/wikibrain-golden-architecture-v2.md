# [Master CoT] WikiBrain: Dune-Themed Neural Second Brain & News Horizon
## — The Mac-Native Golden Architecture v2 (현실 보정판) —

> v1 원본 구조(항성·위성·Adam·올가미·n8n·RAG+LoRA)는 그대로 둔다. 바꾼 것은 **실제 하드웨어(8GB Mac 포함)에서 돌아가게 하는 수치·모델 크기·버그·보안**이다. 변경점은 각 절의 `[v2 보정]`에 적었다.

---

## 0. 골든 아키텍처 7대 설계 원칙

기존 77만 건 위키 3D 은하(`brain.bin`)를 불변의 **항성(Stellar Anchor)**으로 삼고, 외부 지식을 **동적 위성**으로 붙인다. 학습·추론은 Apple Silicon GPU(Metal, MLX)로 로컬에서 한다.

```
┌──────────────────────────── Three.js Canvas (Dune) ────────────────────────────┐
│ [Stellar Anchors: 77만 위키 항성, THREE.Points 1회 드로우, 좌표 고정]           │
│        ▲ 초기 위치 = 최근접 허브 kNN 보간 (brain.bin 생성 방식과 동일)          │
│        │ Multi-Start Adam Relaxation (보정된 시그모이드 거리 + 힌지 반발)       │
│        ▼                                                                       │
│ [Dynamic Satellites: 뉴스 / ArXiv / DART / 노트]  ◄─► 24h 반감기 감쇠            │
│        ▲ Lasso (2D 올가미 → 3D 다중 선택)                                       │
└────────┼───────────────────────────────────────────────────────────────────────┘
         ▼ 선택 서브그래프
┌──────────── n8n (네이티브 npx 실행, 127.0.0.1:5678, Basic Auth) ───────────────┐
│ ├─► 트랙 1: 즉시 RAG  — 문맥 조립 0.1초 / 첫 토큰 1~3초                          │
│ └─► 트랙 2: MLX Micro-LoRA — 큐 1개, 수 분 단위 백그라운드                        │
│        └─► Mac Local Bridge (FastAPI 127.0.0.1:8001, 토큰 인증)                  │
│              ├ /api/embed   : multilingual-e5-base (은하와 동일 모델)            │
│              ├ /api/augment : 3관점 Q&A를 베이스 모델이 직접 생성 → train/valid   │
│              ├ /api/train   : mlx_lm.lora (RAM 등급별 모델)                      │
│              └ /api/chat    : mlx_lm 서버, 어댑터 교체 시 재기동(수 초)          │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 7대 핵심 특성 (v2)
1. **Zero-Waste On-Demand**: 탐색한 항성 주변으로 20~30건만 수집·임베딩. (유지)
2. **좌표계 무결성**: 은하 재계산 없음. 위성의 **초기 위치는 77만 노드를 배치한 방식과 같은 '최근접 허브 8개 가중평균'**으로 잡는다. → 위성이 은하 좌표계와 같은 규칙을 따름.
3. **Multi-Start Adam (유지)**: 단, 시그모이드 파라미터는 **실측 분포로 보정**한다 (아래 Phase 1). e5 계열 코사인은 0.1~0.4가 아니라 대체로 0.7~0.9에 몰린다.
4. **반발 + 시간 감쇠 (유지)**: 반발은 목표거리 트릭이 아니라 **힌지 페널티** `w·max(0, d_min − d)²`로, 공간상 가장 가까운 위성 대상.
5. **올가미 (유지)**: DPR(레티나) 보정, 77만 노드 투영은 Vector3 할당 없이 typed array 루프.
6. **이중 인텔리전스 (유지, 역할 분리)**:
   - RAG = **사실 공급**. 문맥 조립 0.1초, 답변 첫 토큰 1~3초(모델 크기 의존).
   - LoRA = **클러스터 말투·용어·답변 형식 적응**. 사실 암기용이 아님(5~10문서로는 사실 주입이 안 됨). 사실은 항상 RAG로 함께 넣는다.
7. **로컬 우선, 0원**: 추론·학습·임베딩·기존 위키 RAG는 **오프라인 동작**. 뉴스/ArXiv/DART 수집만 온라인(Vercel 프록시). 외부 유료 GPU 없음.

### [v2 보정] RAM 등급별 모델 표 (핵심)

| Mac 통합 메모리 | LoRA 베이스 모델 (MLX 4bit) | 45 iter 예상 | 채팅 속도(대략) |
|---|---|---|---|
| **8GB (현재 장비)** | `mlx-community/Qwen2.5-1.5B-Instruct-4bit` (~1GB) | 수 분 | 빠름 |
| 16GB | `mlx-community/Qwen2.5-3B-Instruct-4bit` | 수 분 | 보통 |
| 32GB+ | `mlx-community/Qwen2.5-7B-Instruct-4bit` (v1 원안) | 1~3분 | 보통 |

- 시간은 추정치. 첫 실행 때 실측해서 이 표를 갱신한다.
- 8GB에서는 **학습 중 채팅 서버를 내린다**(동시 상주 불가). 브리지가 락으로 직렬화.
- 7B는 32GB+에서만. v1의 "16GB 이하 OOM 없음"은 학습 기준으로 성립하지 않는다.

---

## 1. 디자인 토큰 & 그래픽 명세 (Dune Cinematic Spec)

팔레트·타이포는 v1 그대로 유지.

- Color: `COLOR_BG #18110B`, `COLOR_FOG #B88648`, `COLOR_STELLAR_WIKI #96724F`, `COLOR_SECOND_BRAIN #FFD700`, `COLOR_NEWS_ANCHOR #00F0FF`, `COLOR_PAPER_SATELLITE #64B5F6`, `COLOR_DART_SATELLITE #81C784`, Lasso stroke/fill 동일.
- Typography: Cinzel / Cormorant Garamond, Glassmorphism 동일. **단, 본문 한글은 두 폰트에 글리프가 없으므로 한글 폴백(예: Noto Serif KR)을 스택에 추가.**

### [v2 보정] 조명·후처리
- 별은 조명을 받지 않는 셰이더 Points라 **Directional/Ambient Light는 효과 없음** → 위성을 Mesh(구체)로 그릴 때만 적용.
- **안개는 셰이더에서 직접**: 프래그먼트에서 `mix(color, FOG, 1.0 - exp(-density² · depth²))`. `THREE.FogExp2`는 ShaderMaterial에 자동 적용되지 않음.
- **블룸**: 77만 점이 가산 블렌딩으로 겹쳐 중심부가 하얗게 날아간다. `threshold 0.65 / strength 1.8`은 위키 항성 밝기를 0.35배 이하로 깔아야 성립 → "뉴스·골드만 발광"을 원하면 **위키 레이어 밝기를 낮추고 위성 레이어만 HDR 값(>1.0)**으로 그린다. 수치는 화면 보며 조정.
- ACES 톤매핑은 EffectComposer 사용 시 `OutputPass`를 마지막에 추가해야 적용된다.
- 공개 배포 시 "Dune / Arrakis / Eyes of Ibad" 명칭은 교체(상표·IP). 개인 사용은 무관.

---

## Phase 0: 보안 프록시 및 외부 데이터 인제스천 (Vercel Serverless)

### [v2 보정]
- ArXiv `http` → **`https`**.
- `type` 화이트리스트, `query` 길이 제한(100자)·빈값 거부.
- 에러 응답에서 `detail` 제거(내부 정보 노출). 서버 로그로만.
- 호출 측 제한: `PROXY_TOKEN` 헤더 검사(남이 내 DART 쿼터를 쓰지 못하게).
- DART는 `corp_name` 파라미터가 아니라 **`corp_code`** 기반이 정석. 회사명→코드 매핑(`corpCode.xml`)을 1회 받아 두고 변환.
- 고정 호스트만 호출하므로 SSRF 표면 없음(유지).

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { XMLParser } from 'fast-xml-parser';

const ALLOWED = new Set(['arxiv', 'dart']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers['x-proxy-token'] !== process.env.PROXY_TOKEN) return res.status(401).end();
  const type = String(req.query.type ?? '');
  const query = String(req.query.query ?? '').trim();
  if (!ALLOWED.has(type) || !query || query.length > 100) return res.status(400).json({ error: '잘못된 요청' });

  try {
    if (type === 'arxiv') {
      const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=20`;
      const xml = await fetch(url, { signal: AbortSignal.timeout(8000) }).then(r => r.text());
      const entries = new XMLParser().parse(xml).feed?.entry ?? [];
      const items = (Array.isArray(entries) ? entries : [entries]).map((e: any) => ({
        id: e.id, link: e.id, published: e.published,
        title: String(e.title ?? '').replace(/\s+/g, ' ').trim(),
        summary: String(e.summary ?? '').replace(/\s+/g, ' ').trim(),
      }));
      res.setHeader('Cache-Control', 's-maxage=3600');
      return res.status(200).json({ items });
    }
    // dart: corp_code 변환 후 list.json 호출 (키는 서버 환경변수에만)
    const key = process.env.DART_API_KEY;
    if (!key) return res.status(500).json({ error: '서버 설정 오류' });
    const corpCode = await lookupCorpCode(query); // corpCode.xml 캐시에서 조회
    if (!corpCode) return res.status(404).json({ error: '회사를 찾지 못함' });
    const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${key}&corp_code=${corpCode}&page_count=15`;
    const data = await fetch(url, { signal: AbortSignal.timeout(8000) }).then(r => r.json());
    return res.status(200).json(data);
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: '외부 데이터 프록시 실패' });
  }
}
```

---

## Phase 1: 수학·물리 엔진 (Multi-Start Adam, 보정 시그모이드, 힌지 반발)

### [Thought] (v1 유지 + 보정)
1. **비볼록성 극복**: 3회 Multi-Start, 손실 최소 해 채택. (유지)
2. **시그모이드 거리 확장 — 실측 보정**:
   `S(x) = 1 / (1 + e^{−k(x − c)})`, 거리 `= (1 − S)·(D_max − D_min) + D_min`.
   `c`, `k`, `D_min`, `D_max`는 **고정값(0.25, 12, 8, 55)이 아니라 보정 스크립트가 산출**:
   - `c` = 위키 항성 쌍 코사인 분포의 중앙값, `k` = 4.4 / (P90 − P10) (P10→0.1, P90→0.9 근처로 펼침)
   - `D_min`/`D_max` = `brain.bin`에서 최근접 이웃 3D 거리의 P5 / P95 (은하 단위계와 일치)
3. **코사인 어닐링 LR**: `η_max`, `η_min`은 `D_max`에 비례하게 스케일(단위계 독립). (유지)
4. **반발 = 힌지 페널티**: `L_rep = w_rep · Σ max(0, d_min − ‖p − s_j‖)²`, 대상은 **공간상 최근접 위성 8개**(v1의 `slice(0,8)`은 임의 8개였음). 최적화 후 `d_min` 미만이 남으면 최근접 위성 반대 방향으로 밀어내는 **후처리 1회**로 M-3을 보장.
5. **제약 대상 확장**: 중심 항성 1개 + **코사인 최근접 위키 항성 8개** + 최근접 위성 8개. 항성 1개만 쓰면 위치가 구면 위 어디든 되어 비볼록성이 오히려 커진다.
6. **Kruskal Stress-1 정정**: `Stress = sqrt( Σ(d_3D − d_target)² / Σ d_target² )` — 분모는 목표거리. 이름도 정직하게 "목표거리 대비 Stress"(768d 원거리가 아니라 보정 시그모이드 목표와 비교). 판정 기준 0.10은 유지하되 제약 수가 적으므로 보조 지표로만 사용.

### [v2] 보정 스크립트 `pipeline/calibrate_satellite.py`
```python
"""시그모이드 파라미터 산출: 은하 실측 분포에 맞춘다."""
import json, numpy as np
N = len(json.load(open("data/brain_titles.json")))
DIM = json.load(open("data/emb_meta.json"))["dim"]
E = np.memmap("data/emb.f16", np.float16, "r", shape=(N, DIM))
P = np.fromfile("data/brain.bin", np.float32).reshape(N, 4)[:, :3]
rng = np.random.default_rng(0)
a, b = rng.integers(0, N, 20000), rng.integers(0, N, 20000)
cos = (np.asarray(E[a], np.float32) * np.asarray(E[b], np.float32)).sum(1)
p10, c, p90 = np.percentile(cos, [10, 50, 90])
# 최근접 이웃 3D 거리 (샘플 2000개)
s = rng.integers(0, N, 2000)
d = np.sqrt(((P[s, None, :] - P[None, rng.integers(0, N, 50000), :]) ** 2).sum(-1))
nn = np.sort(d, 1)[:, 1:9].ravel()
out = {"c": float(c), "k": float(4.4 / (p90 - p10)),
       "d_min": float(np.percentile(nn, 5)), "d_max": float(np.percentile(nn, 95)) * 4}
json.dump(out, open("data/satellite_calib.json", "w")); print(out)
assert out["d_max"] > out["d_min"] > 0
```

### [Code: `src/core/physics/AdamSpatialOptimizer.ts`] (v1 구조 유지, 손실·스트레스 정정)
```typescript
import { Vector3 } from 'three';

export interface NeighborConstraint { position: Vector3; targetDistance: number; weight: number; }
export interface RepulsionTarget { position: Vector3; }

export class AdamSpatialOptimizer {
  private beta1 = 0.9; private beta2 = 0.999; private eps = 1e-8;
  private m = new Vector3(); private v = new Vector3(); private t = 0;
  constructor(private lrMax: number, private lrMin: number,
              private dMin: number, private wRep = 2.0) {}

  private lr(step: number, total: number) {
    return this.lrMin + 0.5 * (this.lrMax - this.lrMin) * (1 + Math.cos((Math.PI * step) / total));
  }

  private gradient(p: Vector3, cs: NeighborConstraint[], rs: RepulsionTarget[]): Vector3 {
    const g = new Vector3(), diff = new Vector3();
    for (const c of cs) {
      diff.subVectors(p, c.position); const d = diff.length() || 1e-6;
      g.addScaledVector(diff, (2 * c.weight * (d - c.targetDistance)) / d);
    }
    for (const r of rs) { // 힌지 반발: d < dMin 일 때만
      diff.subVectors(p, r.position); const d = diff.length() || 1e-6;
      if (d < this.dMin) g.addScaledVector(diff, (-2 * this.wRep * (this.dMin - d)) / d);
    }
    return g;
  }

  public step(p: Vector3, cs: NeighborConstraint[], rs: RepulsionTarget[], i: number, total: number): Vector3 {
    this.t++;
    const g = this.gradient(p, cs, rs);
    this.m.multiplyScalar(this.beta1).addScaledVector(g, 1 - this.beta1);
    this.v.multiplyScalar(this.beta2).add(new Vector3(g.x * g.x, g.y * g.y, g.z * g.z).multiplyScalar(1 - this.beta2));
    const mh = this.m.clone().divideScalar(1 - this.beta1 ** this.t);
    const vh = this.v.clone().divideScalar(1 - this.beta2 ** this.t);
    const lr = this.lr(i, total);
    return p.clone().sub(new Vector3(
      (lr * mh.x) / (Math.sqrt(vh.x) + this.eps),
      (lr * mh.y) / (Math.sqrt(vh.y) + this.eps),
      (lr * mh.z) / (Math.sqrt(vh.z) + this.eps)));
  }

  public loss(p: Vector3, cs: NeighborConstraint[], rs: RepulsionTarget[]): number {
    let L = 0;
    for (const c of cs) L += c.weight * (p.distanceTo(c.position) - c.targetDistance) ** 2;
    for (const r of rs) L += this.wRep * Math.max(0, this.dMin - p.distanceTo(r.position)) ** 2;
    return L;
  }

  public relaxWithMultiStart(init: Vector3, cs: NeighborConstraint[], rs: RepulsionTarget[],
                             steps = 60, restarts = 3, jitter = 1): { position: Vector3; stress: number } {
    let best = init.clone(), bestL = Infinity;
    for (let r = 0; r < restarts; r++) {
      let p = r === 0 ? init.clone() : init.clone().add(new Vector3(
        (Math.random() - .5) * jitter, (Math.random() - .5) * jitter * .5, (Math.random() - .5) * jitter));
      this.m.set(0, 0, 0); this.v.set(0, 0, 0); this.t = 0;
      for (let i = 0; i < steps; i++) p = this.step(p, cs, rs, i, steps);
      const L = this.loss(p, cs, rs);
      if (L < bestL) { bestL = L; best = p; }
    }
    // 후처리: 남은 겹침 1회 밀어내기 (M-3 보장)
    for (const r of rs) {
      const d = best.distanceTo(r.position);
      if (d < this.dMin) best.add(best.clone().sub(r.position).normalize().multiplyScalar(this.dMin - d + 1e-3));
    }
    return { position: best, stress: this.stress(best, cs) };
  }

  private stress(p: Vector3, cs: NeighborConstraint[]): number { // 분모 = 목표거리
    let num = 0, den = 0;
    for (const c of cs) { num += (p.distanceTo(c.position) - c.targetDistance) ** 2; den += c.targetDistance ** 2; }
    return Math.sqrt(num / (den || 1e-8));
  }
}
```
- 스텝 25 → **60**: Adam 첫 스텝 이동량은 대략 `lr`이라 25스텝으로는 거리 수십 단위를 다 못 움직인다. 점 하나라 60스텝 × 3회도 1ms 미만.
- `jitter`는 `D_min` 정도로(호출부에서 보정값 전달).

### [Code: `SatellitePlacementEngine.ts`] 변경 요점
```typescript
// 1) 초기 위치: brain.bin과 같은 규칙 — 코사인 최근접 허브 8개, softmax(20·sim) 가중평균
// 2) 제약: 중심 항성(w 1.8) + 최근접 위키 항성 8개(w 1.0) — 목표거리 = calibratedDistance(sim)
// 3) 반발: 공간 최근접 위성 8개 (kd-tree 또는 그리드 해시로 탐색)
// 4) optimizer = new AdamSpatialOptimizer(lrMax = 0.05·D_max, lrMin = 0.0025·D_max, dMin = D_min)

public static calibratedDistance(sim: number, k: Calib): number {
  const s = 1 / (1 + Math.exp(-k.k * (sim - k.c)));
  return (1 - s) * (k.d_max - k.d_min) + k.d_min;
}
public static formatE5Passage(title: string, content: string) { return `passage: ${title} - ${content}`; }
public static formatE5Query(q: string) { return `query: ${q}`; }
// 시간 감쇠: v1 그대로 alpha = exp(-0.693·h/24). 알파 0.05 미만이면 씬에서 제거(메모리 회수).
```
- 위성 임베딩은 브라우저가 아니라 **브리지 `/api/embed`(multilingual-e5-base)**에서 만든다. 은하와 같은 모델이어야 코사인이 비교 가능. (v1의 "e5-base-v2"는 영어 전용 모델이라 한국어 은하와 불일치 → 정정)
- 최근접 위키 항성 탐색: 77만×768 내적은 브리지(numpy, float16 memmap)에서 약 0.5~1초. 결과만 프론트로.

---

## Phase 2: 77만 노드 렌더링 (계층적 LOD)

### [v2 보정]
- `InstancedMesh`로 바꾸지 않는다. **77만 개를 `THREE.Points` 1회 드로우**로 그리는 현재 방식이 이미 실측 약 32fps(미리보기 창 기준). InstancedMesh는 인스턴스당 정점이 많아 더 무겁다.
- LOD는 **셰이더에서**: 링크 수(`indeg`)가 작은 노드는 카메라 거리 > 350에서 크기·밝기를 0으로 → GPU가 사실상 건너뜀. 섹터 진입 시 자동으로 드러남(v1 의도 그대로, 버퍼 재업로드 없음).
- 위성은 별도 Points/Mesh 레이어(수백 개 이하)로 분리해 매 프레임 갱신해도 부담 없음.
- 60FPS 목표는 전체화면·고해상도에서 블룸 해상도를 절반으로 낮춰 달성(블룸이 가장 무거움).

---

## Phase 3: 2D 올가미 다중 선택 (v1 유지 + 버그 수정)

### [v2 보정]
- 오버레이 캔버스는 **CSS 픽셀 기준**으로 판정: `canvas.width`(기기 픽셀) 대신 `clientWidth/clientHeight` 사용. 오버레이 캔버스 자체도 `width = clientWidth·DPR`로 만들고 `ctx.scale(DPR, DPR)`.
- 77만 노드 투영: `node.position.clone().project()`는 77만 번 객체 할당 → 수백 ms 정지. **`viewProjection` 행렬 16개 값을 꺼내 typed array 루프**로 계산하면 약 20~50ms.
- 먼저 올가미의 **바운딩 박스로 1차 필터** 후 Point-in-Polygon.
- 선택 결과 상한(예: 300개) — RAG 문맥 길이 제한과 맞춤. 초과 시 `indeg` 큰 순으로 자름.
- 카메라 뒤 판정은 `z > 1` 대신 **클립 w ≤ 0**으로.

```typescript
const m = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
for (let i = 0; i < N; i++) {
  const x = pos[i*3], y = pos[i*3+1], z = pos[i*3+2];
  const w = m[3]*x + m[7]*y + m[11]*z + m[15]; if (w <= 0) continue;
  const sx = ((m[0]*x + m[4]*y + m[8]*z + m[12]) / w * .5 + .5) * cssW;
  const sy = (1 - ((m[1]*x + m[5]*y + m[9]*z + m[13]) / w * .5 + .5)) * cssH;
  if (sx < minX || sx > maxX || sy < minY || sy > maxY) continue;
  if (isPointInPolygon(sx, sy, poly)) picked.push(i);
}
```

---

## Phase 4: Mac 로컬 MLX 브리지 (`backend/mlx_bridge.py`)

### [v2 보정]
1. **바인딩 `127.0.0.1`** (v1 `0.0.0.0`은 같은 와이파이 누구나 학습·채팅 호출 가능). 요청마다 `X-Bridge-Token` 검사.
2. **`clusterId` 검증**: `^[A-Za-z0-9_-]{1,40}$`만 허용. v1은 `../../`로 임의 경로 쓰기가 가능했음.
3. **3관점 증강 = 베이스 모델이 직접 생성**: v1은 템플릿 질문 + 원문 복붙이라 "같은 답 3번" → 암기만 유도. v2는 문서를 문맥으로 주고 베이스 모델이 요약·비교·적용 답을 각각 생성 → 실제로 다른 3개 샘플. (1.5B 기준 문서당 수십 초)
4. **`valid.jsonl` 필수**: `mlx_lm.lora`는 `--data` 폴더에 `train.jsonl`과 `valid.jsonl`이 모두 있어야 동작. 샘플 10%를 valid로 분리(최소 1개).
5. **포맷**: 채팅 템플릿을 손으로 `<|im_start|>` 문자열로 만들지 않고 `{"messages":[...]}` 형식 사용 → mlx_lm이 모델 템플릿을 적용.
6. **학습 큐 1개 + 메모리 락**: 8GB에서는 학습 중 채팅 서버 정지 → 학습 후 `--adapter-path`로 재기동(수 초). 이게 v1의 "핫스왑"의 현실적 구현.
7. **과적합 가드**: `--iters 45` 유지하되 `--num-layers 8`(LoRA 적용 층 제한), valid loss가 train loss의 2배를 넘으면 해당 어댑터 폐기.
8. `python` 대신 **`sys.executable`**(가상환경 일치), 학습 로그는 파일로.

```python
import json, os, re, subprocess, sys, threading
from fastapi import FastAPI, BackgroundTasks, Header, HTTPException
from pydantic import BaseModel, Field

RAM_GB = int(os.popen("sysctl -n hw.memsize").read()) // 2**30
BASE_MODEL = ("mlx-community/Qwen2.5-7B-Instruct-4bit" if RAM_GB >= 32 else
              "mlx-community/Qwen2.5-3B-Instruct-4bit" if RAM_GB >= 16 else
              "mlx-community/Qwen2.5-1.5B-Instruct-4bit")
ROOT = os.path.expanduser("~/second-brain")
ADAPTERS, DATA = f"{ROOT}/adapters", f"{ROOT}/data"
TOKEN = os.environ["BRIDGE_TOKEN"]
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
TRAIN_LOCK = threading.Lock()
os.makedirs(ADAPTERS, exist_ok=True); os.makedirs(DATA, exist_ok=True)
app = FastAPI(title="Mac Native MLX Knowledge Engine v2")

class Doc(BaseModel):
    title: str = Field(max_length=300)
    text: str = Field(max_length=6000)

class AugmentRequest(BaseModel):
    clusterId: str
    documents: list[Doc] = Field(min_length=1, max_length=30)

VIEWS = {
    "summary": "{t}의 핵심 원리와 정의를 한 문단으로 요약해 주세요.",
    "compare": "{t}이(가) 인접 개념과 구별되는 결정적 차이는 무엇입니까?",
    "apply":   "{t}을(를) 실제 시스템이나 비즈니스에 적용할 때 핵심 고려사항은?",
}

def generate(prompt: str, context: str) -> str:
    """베이스 모델로 답 생성 (mlx_lm.generate). 문맥 밖 내용은 쓰지 않게 지시."""
    from mlx_lm import load, generate as gen
    model, tok = load(BASE_MODEL)
    msgs = [{"role": "system", "content": "주어진 문서에 근거해서만 한국어로 답하라."},
            {"role": "user", "content": f"[문서]\n{context}\n\n[질문]\n{prompt}"}]
    return gen(model, tok, tok.apply_chat_template(msgs, add_generation_prompt=True, tokenize=False), max_tokens=350)

def synthesize_3view_data(docs: list[Doc]) -> list[dict]:
    rows = []
    for d in docs:
        for q in VIEWS.values():
            question = q.format(t=d.title)
            rows.append({"messages": [
                {"role": "user", "content": f"[문서]\n{d.text[:2000]}\n\n{question}"},
                {"role": "assistant", "content": generate(question, d.text[:2000])}]})
    return rows

def run_mlx_lora_training(cid: str, docs: list[Doc]):
    with TRAIN_LOCK:  # 학습은 한 번에 하나 (8GB 보호)
        ddir = os.path.join(DATA, cid); os.makedirs(ddir, exist_ok=True)
        rows = synthesize_3view_data(docs)
        n_val = max(1, len(rows) // 10)
        for name, part in (("valid.jsonl", rows[:n_val]), ("train.jsonl", rows[n_val:])):
            with open(os.path.join(ddir, name), "w", encoding="utf-8") as f:
                f.writelines(json.dumps(r, ensure_ascii=False) + "\n" for r in part)
        stop_chat_server()  # 8GB: 학습 중 서빙 중지
        with open(os.path.join(ddir, "train.log"), "w") as log:
            subprocess.run([sys.executable, "-m", "mlx_lm.lora", "--model", BASE_MODEL, "--train",
                            "--data", ddir, "--iters", "45", "--batch-size", "2" if RAM_GB >= 16 else "1",
                            "--num-layers", "8", "--learning-rate", "1e-4",
                            "--adapter-path", os.path.join(ADAPTERS, cid)],
                           check=True, stdout=log, stderr=subprocess.STDOUT)
        start_chat_server(adapter=os.path.join(ADAPTERS, cid))  # 재기동 = 핫스왑

def check(token: str | None):
    if token != TOKEN: raise HTTPException(401)

@app.post("/api/augment")
async def augment(req: AugmentRequest, bg: BackgroundTasks, x_bridge_token: str | None = Header(None)):
    check(x_bridge_token)
    if not ID_RE.match(req.clusterId): raise HTTPException(400, "clusterId 형식 오류")
    rag = "\n\n---\n\n".join(f"[{d.title}]\n{d.text}" for d in req.documents)
    bg.add_task(run_mlx_lora_training, req.clusterId, req.documents)
    return {"status": "RAG_READY_LORA_QUEUED", "clusterId": req.clusterId, "ragContext": rag,
            "sampleCount": len(req.documents) * 3, "baseModel": BASE_MODEL}

# /api/embed  : multilingual-e5-base, 'passage: '/'query: ' 접두어, safetensors만 허용
# /api/chat   : mlx_lm.server 프록시 (127.0.0.1 내부 포트)
# stop_chat_server / start_chat_server : mlx_lm.server 프로세스 관리

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
```

### [v2] RAG 원문 확보
- 현재 은하 데이터에는 위키 **첫 문단(최대 600자)**만 있다. RAG 품질을 위해 덤프에서 **본문 전체를 SQLite(FTS5)**로 1회 추출(약 1~2GB, 오프라인 유지). 선택 노드의 본문 앞 2,000자를 청크로 사용.
- 온라인일 때는 위키백과 REST 요약으로 보강 가능(선택 사항).

---

## Phase 5: n8n 오케스트레이션 (유지, 실행 방식 보정)

### [v2 보정]
- **8GB Mac에서는 Docker 대신 네이티브 실행**: Docker Desktop VM이 상시 1~2GB를 점유해 MLX 학습과 충돌. Node가 이미 설치돼 있으므로:
  ```bash
  N8N_HOST=127.0.0.1 N8N_BASIC_AUTH_ACTIVE=true npx n8n@1 start
  ```
  (16GB 이상이면 v1의 Docker 방식 그대로 가능. 이때도 `-p 127.0.0.1:5678:5678`로 로컬 바인딩.)
- 노드 구성은 v1 그대로: `Webhook` → `HTTP Request (POST http://127.0.0.1:8001/api/augment, 헤더 X-Bridge-Token)` → `Respond to Webhook`.
- Docker 사용 시에만 주소가 `host.docker.internal:8001`. 브리지가 127.0.0.1에만 바인딩돼 있으면 컨테이너에서 접근 불가 → Docker 쓸 때는 브리지를 `0.0.0.0`이 아니라 **Docker 브리지 IP + 토큰**으로 제한.
- n8n 워크플로 이미지 버전은 `latest` 대신 고정 버전.

---

## Phase 6: 엔드투엔드 검증 체크리스트 (v2)

| # | 검증 | 내용 | PASS 기준 |
|---|---|---|---|
| M-1 | 항성 뼈대 | 77만 좌표 보존 | `brain.bin` 해시 불변 |
| M-2 | 보정 Stress | 신규 위성 스폰 | 목표거리 대비 Stress < 0.10 (제약 17개 기준) |
| M-3 | 반발 | 동일 항성에 위성 10개 | 위성 간 거리 ≥ `D_min` (후처리로 보장) |
| M-4 | 시간 감쇠 | 24h 경과 | 알파 0.5±0.01, 알파<0.05 제거 |
| M-5 | e5 접두어·모델 | 임베딩 입력 | `passage:`/`query:` + `multilingual-e5-base` (은하와 동일) |
| M-6 | 3관점 증강 | 문서 5개 | 15행, 3관점 답변이 서로 다름(유사도 < 0.95), valid.jsonl ≥ 1행 |
| M-7 | 올가미 | 원형 드래그 | 77만 투영 ≤ 100ms, 레티나에서 선택 위치 일치 |
| M-8 | RAG | 올가미 후 질의 | 문맥 조립 ≤ 0.1초, 첫 토큰 ≤ 3초 |
| M-9 | LoRA | 45 iter | 8GB: 1.5B로 완료 + `adapters.safetensors` 생성, 소요 시간 실측 기록 |
| M-10 | 오프라인 | 와이파이 끔 | 위키 RAG·채팅·LoRA 정상, 뉴스/ArXiv/DART 수집만 비활성 안내 |
| M-11 | 보안 | 외부·악성 요청 | 브리지·n8n 외부 IP 접근 불가, 토큰 없으면 401, `clusterId="../x"` 400 |
| M-12 | 메모리 | 학습 중 | 스왑 증가 < 1GB, 채팅 서버 정지·재기동 확인 |

---

## 부록: v1 → v2 변경 요약
| 항목 | v1 | v2 |
|---|---|---|
| LoRA 모델 | 7B 고정 | RAM 등급별(8GB=1.5B) |
| LoRA 역할 | 지식 주입 | 말투·형식 적응, 사실은 RAG |
| 증강 | 템플릿 + 원문 복붙 | 베이스 모델이 3관점 답 생성, valid 분리 |
| 핫스왑 | 표현만 | 서버 재기동(수 초) |
| n8n | Docker | 8GB는 네이티브 npx, 127.0.0.1 + 인증 |
| Adam | 고정 시그모이드, 항성 1개 | 실측 보정, 항성 9개 + 힌지 반발 + 후처리 |
| Stress | 분모 d_3D | 분모 목표거리 |
| 렌더 | InstancedMesh | Points 유지 + 셰이더 LOD |
| 올가미 | 기기 픽셀, 객체 할당 | CSS 픽셀, typed array |
| 임베딩 | e5-base-v2(영어) | multilingual-e5-base(은하와 동일) |
| 보안 | 0.0.0.0, 경로 미검증, http | 127.0.0.1+토큰, ID 정규식, https |
| 오프라인 | 100% | 수집 제외 전부 |
