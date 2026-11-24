---
name: WikiBrain
description: 한국어 위키백과 77만 문서를 검은 돌판 위에 새긴 별의 지도, 위키천문도
colors:
  stone: "#0E0F11"
  incise: "#E9E4D8"
  incise-dim: "rgba(233,228,216,.55)"
  brass: "#B8A27A"
  slate: "#7E8B95"
  paper: "#E6E0D2"
  paper-2: "#D9D2C1"
  ink: "#1A1C1F"
  ink-2: "#4A4F55"
typography:
  display:
    fontFamily: "'Song Myung', 'Gowun Batang', serif"
    fontSize: "44px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.18em"
  readout-figure:
    fontFamily: "'Song Myung', 'Gowun Batang', serif"
    fontSize: "30px"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0.02em"
  headline:
    fontFamily: "'Song Myung', 'Gowun Batang', serif"
    fontSize: "26px"
    fontWeight: 400
    lineHeight: 1.25
  body:
    fontFamily: "'Gowun Batang', 'Apple SD Gothic Neo', serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.7
  body-base:
    fontFamily: "'Gowun Batang', 'Apple SD Gothic Neo', serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Gowun Batang', 'Apple SD Gothic Neo', serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "0.04em"
    fontFeature: "tnum"
rounded:
  none: "0"
spacing:
  edge: "28px"
  title-gap: "12px"
  slip-inset: "4px"
  slip-pad: "22px 24px 20px"
  row: "7px 14px"
components:
  slip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  info-slip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "{spacing.slip-pad}"
    width: "min(420px, calc(100vw - 56px))"
  search-slip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "{spacing.slip-inset}"
    width: "min(340px, calc(100vw - 140px))"
  search-button:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "0 14px"
  suggestion-item:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "{spacing.row}"
  suggestion-item-hover:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
  tooltip-slip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "4px 10px"
  readout:
    textColor: "{colors.incise-dim}"
    typography: "{typography.label}"
---

# Design System: WikiBrain

## Overview

**Creative North Star: "새긴 하늘 (The Incised Sky)"**

화면 전체가 한 장의 검은 오석이다. 1395년 천상열차분야지도처럼 별은 빛나는 것이 아니라 돌에 새겨진 것이고, 사람이 보는 것은 그 돌을 종이로 떠낸 탁본이다. 77만 개 점이 화면 가운데를 차지하고, 둘레에는 360 눈금을 새긴 동심원 링이 카메라 방위에 맞춰 돈다. 인터페이스는 돌판 위에 얹은 종이 쪽지(슬립)로만 나타나고, 쪽지가 없는 곳에서는 돌과 새김만 남는다.

밀도는 낮고 조용하다. 색은 돌의 검정, 탁본 종이의 미색, 바랜 황동, 청회색 네 가지로 끝난다. 깊이는 빛 번짐이 아니라 가라앉음으로 표현한다. 먼 점은 돌빛으로 꺼지고, 가까운 점은 또렷한 가장자리를 가진 작은 원으로 남는다. 우주 배경 위 네온 점과 유리 패널이라는 이 분야의 기본 배치는 쓰지 않기로 확정했다.

움직임은 느리다. 하늘은 아주 천천히 저절로 돌고(autoRotate 0.12), 사용자가 손대는 순간 멈춘다. 감속은 길고 부드럽다(damping 0.06). 동작 줄이기 설정이면 자동 회전과 전환이 꺼진다.

**Key Characteristics:**
- 돌판 하나, 그 위의 종이 쪽지. 모서리는 모두 직각
- 점은 음각처럼 또렷한 원, 빛 번짐 없음, 가산 혼합은 낮은 밝기로만
- 황동은 눈금, 선택, 초점에만 쓰는 귀한 색
- 표제는 세로쓰기, 숫자는 고정폭 숫자(tabular-nums)
- 화면 가장자리 여백 28px로 네 귀퉁이를 고정

## Colors

돌의 거의 검은 무채색 위에 따뜻한 미색과 바랜 황동이 새겨지는, 채도가 극히 낮은 팔레트다.

### Primary
- **바랜 황동 (Faded Brass)** (`brass`): 링의 30도 주눈금, 표제의 영문 'WIKIBRAIN', 로딩 문구, 올가미 선, 선택된 별, 텍스트 선택 배경, 모든 키보드 초점 테두리. 넓은 면적에는 쓰지 않는다.

### Secondary
- **청회색 (Slate)** (`slate`): 하단 조작 안내와 표제의 한자 부제. 돌 위의 보조 문구 전용.

### Neutral
- **오석 (Stone)** (`stone`): 페이지와 WebGL 장면 배경, 로딩 막. 점 안개가 가라앉는 목표색이기도 하다.
- **음각 미색 (Incise)** (`incise`): 돌 위의 주 문자(표제, 판독 숫자)와 별·연결선의 기준색.
- **흐린 음각 (Incise Dim)** (`incise-dim`): 링의 원과 부눈금, 판독기 설명 문구.
- **탁본 종이 (Rubbing Paper)** (`paper`): 모든 슬립의 바탕.
- **종이 안쪽 테 (Paper Fold)** (`paper-2`): 슬립의 안쪽 이중 테, 제안 목록 호버, 스크롤 막대.
- **먹 (Ink)** (`ink`): 슬립 위 본문, 슬립 바깥 테, 검색 버튼 바탕.
- **옅은 먹 (Ink Wash)** (`ink-2`): 슬립 위 보조 정보(메타, 자리표시 글, 닫기 버튼).

### Named Rules
**The Brass Is Earned Rule.** 황동은 새김(눈금)과 상호작용의 흔적(선택, 올가미, 초점)에만 쓴다. 면을 채우는 황동은 올가미 안쪽의 7% 투명 채움이 유일하다.

**The Two Grounds Rule.** 문자는 돌 위에서는 incise 계열, 종이 위에서는 ink 계열이다. 돌 위에 먹색을, 종이 위에 미색을 쓰지 않는다.

## Typography

**Display Font:** Song Myung (with Gowun Batang, serif)
**Body Font:** Gowun Batang (with Apple SD Gothic Neo, serif)

**Character:** 송명의 붓끝 같은 획은 돌에 새긴 글자처럼 쓰이고, 고운바탕은 탁본 위의 해설문처럼 차분하게 읽힌다. 두 서체 모두 굵기 400만 쓴다.

### Hierarchy
- **Display** (400, 44px, 1): 세로쓰기 표제 '위키천문도'. 720px 이하에서 32px.
- **Readout Figure** (400, 30px, 1.1): 판독기의 큰 숫자(전체 문서 수). 720px 이하에서 22px.
- **Headline** (400, 26px, 1.25): 정보 슬립의 문서 제목. text-wrap balance.
- **Body** (400, 15.5px, 1.7, 최대 62ch): 정보 슬립의 첫 문단. 기본 문서 글자는 16px/1.6, 제안 목록과 툴팁은 15px.
- **Label** (400, 13px, 0.04em, tabular-nums): 메타 정보와 판독기 설명. 하단 안내는 13px에 0.06em.

### Named Rules
**The Vertical Masthead Rule.** 표제는 writing-mode vertical-rl로 세워 쓰고 오른쪽에서 왼쪽으로 줄을 놓는다(row-reverse, 간격 12px). 가로 표제는 쓰지 않는다.

**The Measured Numbers Rule.** 실측 숫자는 모두 tabular-nums와 ko-KR 천 단위 구분으로 표기한다.

## Layout

전체 화면 고정 캔버스다. 스크롤은 없고(overflow hidden), 모든 UI는 화면 가장자리에서 28px 떨어진 네 귀퉁이와 하단 중앙에 고정된다. 왼쪽 위 세로 표제, 오른쪽 위 검색 슬립(최대 340px), 왼쪽 아래 정보 슬립(최대 420px, 높이 46vh에서 스크롤), 오른쪽 아래 판독기(오른쪽 정렬), 하단 중앙 조작 안내. 링은 화면 중앙에 반지름 min(가로, 세로)×0.44로 그려지고 창 크기가 바뀌면 다시 그린다. 층위는 돌 질감(1), 링·올가미(2), UI(3), 툴팁(4), 로딩(5) 순서다.

720px 이하에서는 하단 안내를 숨기고, 정보 슬립을 바닥에서 96px로 올려 판독기와 겹치지 않게 하며, 표제와 판독 숫자를 줄인다.

## Elevation & Depth

두 가지 깊이가 있다. 돌 위의 3D 하늘은 빛이 아니라 안개로 깊이를 만든다. 종이 슬립만 돌 위에 놓인 물체로서 그림자를 가진다. 돌 자체에는 프랙탈 노이즈 입자를 overlay 혼합, 불투명도 0.22로 얹어 오석의 결을 만든다.

### Shadow Vocabulary
- **Slip Rest** (`box-shadow: 0 18px 40px -12px rgba(0,0,0,.7), 0 2px 6px rgba(0,0,0,.35)`): 모든 슬립. 넓고 부드러운 아래쪽 그림자와 바짝 붙은 접지 그림자의 두 겹. 상태에 따라 변하지 않는다.

### Point Rendering
- **음각 원판:** 점은 원 가장자리 smoothstep(0.32, 0.5)로 잘라 내는 또렷한 원이다. 후광, 블룸, 후처리는 없다.
- **가산 혼합, 낮은 밝기:** 점은 AdditiveBlending, depthWrite 끔. 밝기는 0.035 + 0.2·h³ + 0.03·난수(h = log2(링크+1)/11, 최대 1)로 최대 약 0.27에 머물러 밀집 구역에서도 흰 덩어리가 되지 않는다. 색은 미색 비율(0.91, 0.89, 0.85)에 밝기를 곱한다.
- **크기:** 1.1 + 6.5·h, 거리로 나누되 최소 1px.
- **돌로 가라앉는 안개:** 지수제곱 안개(uFog 0.0009)로 색에 (1 − 안개)를 곱한다. 검은색 가산이므로 먼 점은 돌 바탕으로 사라진다.
- **LOD:** 링크 5개 미만인 점은 카메라 거리 350 밖에서 숨긴다.
- **연결선:** 선택한 별의 이웃은 incise 색 선, 불투명도 0.22.
- **선택 표지:** 클릭한 별은 크기 34, 올가미로 고른 별은 크기 14의 황동 점이며 안개를 받지 않는다. 황동 점은 밝기를 1.5배로 올린 유일한 예외다.

### Named Rules
**The No Bloom Rule.** 점, 선, 글자 어디에도 빛 번짐, 글로우, 블룸 후처리를 쓰지 않는다. 밝기 위계는 크기와 낮은 밝기 차이로만 만든다.

**The Sink, Don't Fade Rule.** 멀어지는 것은 투명해지지 않고 돌빛으로 가라앉는다.

## Shapes

모든 모서리는 직각(0)이다. 형태 언어는 원과 직선 두 가지뿐이다. 하늘과 링은 동심원(반지름 R, R−14, R−44)과 방사형 눈금이고, UI는 직사각형 종이 쪽지다. 슬립의 테두리는 바깥 1px 먹색 선과, 5px 안쪽으로 들인 1px paper-2 선의 이중 테다.

## Components

### Paper Slip (signature)
돌 위에 얹은 탁본 쪽지. 검색, 제안 목록, 정보, 툴팁이 모두 이 하나의 재료를 쓴다.
- **Corner Style:** 직각 (0)
- **Background:** paper, 문자 ink
- **Border:** 1px ink 바깥 선 + outline 1px paper-2, offset −5px
- **Shadow Strategy:** Slip Rest (Elevation 참조)
- **Internal Padding:** 정보 슬립 22px 24px 20px, 검색 슬립 4px, 툴팁 4px 10px

### Search Field
- **Style:** 검색 슬립 안의 테두리 없는 투명 입력칸, 16px 고운바탕, 9px 10px. 자리표시 글은 ink-2.
- **Focus:** 입력칸 자체 outline은 없애고, 슬립 전체에 2px 황동 outline(offset 2px)을 건다(focus-within).
- **Button:** 먹 바탕에 종이색 '찾기', 15px 송명, 좌우 14px. 호버 시 바탕이 약간 밝은 먹(#2B2E33)으로. focus-visible은 2px 황동 outline.

### Suggestion List
- **Style:** 검색 슬립 바로 아래(top 78px) 같은 폭의 슬립, 위아래 6px, 최대 46vh 스크롤. 항목은 15px 고운바탕, 7px 14px, 왼쪽 정렬.
- **State:** 호버와 키보드 초점 모두 paper-2 바탕. 결과가 없으면 ink-2 14px 문구.

### Info Slip
- 문서 제목(Headline), 메타(Label, ink-2), 첫 문단(Body). 올가미 결과일 때는 고른 제목을 ' · '로 이은 15px/1.75 목록.
- 닫기는 오른쪽 위 14px 인라인 SVG 엑스(선 1.4), ink-2에서 호버 시 ink, 초점 시 2px 황동 outline. aria-live polite.

### Ring (signature)
- 동심원 세 개(incise-dim, 0.7px)와 360개 눈금. 1도 5px, 5도 9px, 30도 14px. 30도 주눈금만 황동 1px, 나머지 incise-dim 0.6px.
- 링에는 이름을 새기지 않는다. 문서 이름은 링 위가 아니라 호버 쪽지와 정보 슬립에만 나온다.
- 카메라 방위각의 반대로 회전해 하늘과 함께 돈다. 포인터 이벤트 없음, aria-hidden.

### Readout (signature)
- 오른쪽 아래, 오른쪽 정렬. 큰 숫자(Readout Figure, incise) 아래에 설명(Label, incise-dim): '문서 · 시야 안 약 N · 고른 별 N'. 1초마다 6만 개 표본으로 시야 안 문서 수를 추정해 갱신.

### Lasso
- Shift+드래그. 황동 1.2px 파선(5, 4), 안쪽은 황동 7% 채움(rgba(184,162,122,.07)). 끝나면 지우고, 고른 별을 황동 점으로 표시한다.

### Tooltip
- 마우스가 90ms 멈췄을 때만 커서 오른쪽 아래 14px에 제목을 띄우는 작은 슬립, 15px 고운바탕, 줄바꿈 없음.

### Loading
- 돌 바탕 전체 막에 황동 18px 송명, 자간 0.4em '별을 새기는 중'. 0.9s cubic-bezier(.16,1,.3,1)로 사라진다.

## Do's and Don'ts

### Do:
- **Do** 새 UI는 Paper Slip 재료(paper 바탕, ink 문자, 이중 테, Slip Rest 그림자, 직각)로 만든다.
- **Do** 점 셰이더의 밝기 상한(약 0.27)과 원판 smoothstep(0.32, 0.5)을 유지하고, 새 점 층도 같은 셰이더를 쓴다.
- **Do** 모든 초점 표시는 2px 황동 outline, offset 2px로 통일한다.
- **Do** 고정 UI는 화면 가장자리 28px 선에 맞춘다.
- **Do** 실측 숫자는 tabular-nums와 천 단위 구분으로 쓴다.
- **Do** 동작 줄이기 설정에서 자동 회전과 전환을 끈다.

### Don't:
- **Don't** 점과 선에 블룸, 글로우, 후광을 넣지 않는다.
- **Don't** 우주 배경 위 네온 점과 유리(반투명 블러) 패널을 쓰지 않는다.
- **Don't** 슬립과 버튼 같은 UI 모서리를 둥글리지 않는다. 원은 하늘과 링, 점의 형태로만 쓴다.
- **Don't** 황동으로 넓은 면을 칠하지 않는다.
- **Don't** 점 밝기를 올려 밀집 구역을 흰 덩어리로 만들지 않는다.
