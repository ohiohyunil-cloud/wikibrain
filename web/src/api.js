// 데이터 계층: 로컬(server.py)과 공개 사이트(정적 파일 + 위키백과 요약 + 방문자 자신의 Mac 브리지)를 같은 화면으로
export const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

let titles = null, raw = null;
export async function loadGalaxy() {
  const [buf, t] = await Promise.all([
    fetch(LOCAL ? '/data/brain.bin' : 'data/brain.bin').then(r => r.arrayBuffer()),
    fetch(LOCAL ? '/data/brain_titles.json' : 'data/titles.json').then(r => r.json()),
  ]);
  raw = new Float32Array(buf); titles = t;
  // 출처(Phase 2 확장 이후에만 있음). 없으면 전부 위키백과
  const src = await fetch(LOCAL ? '/data/brain_src.bin' : 'data/src.bin').then(r => r.ok ? r.arrayBuffer() : null).then(b => b && b.byteLength === raw.length / 4 ? new Uint8Array(b) : null).catch(() => null);
  return {raw, titles, src};
}

let lmeta = null; const shards = new Map();
async function nbOf(i) {
  lmeta ??= await fetch('data/meta.json').then(r => r.json());
  const s = Math.floor(i / lmeta.shard);
  if (!shards.has(s)) shards.set(s, fetch(`data/links/${s}.bin`).then(r => r.arrayBuffer()).then(b => new Int32Array(b)));
  const a = await shards.get(s), row = (i - s * lmeta.shard) * (lmeta.k + 1), nb = [];
  for (let k = 1; k <= lmeta.k; k++) {const v = a[row + k]; if (v >= 0) nb.push(v);}
  return {n: a[row], nb};
}
export const getLinks = i => LOCAL ? fetch('/api/links?i=' + i).then(r => r.json()) : nbOf(i);
export async function getDoc(i) {
  if (LOCAL) return fetch('/api/doc?i=' + i).then(r => r.json());
  let intro = '';
  try {const r = await fetch('https://ko.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(titles[i].replace(/ /g, '_'))); if (r.ok) intro = (await r.json()).extract || '';} catch { /* 요약 없음 */ }
  return {title: titles[i], intro, indeg: Math.round(raw[i * 4 + 3])};
}
export async function getSub(ids) {
  if (LOCAL) return fetch('/api/sub?ids=' + ids.join(',')).then(r => r.json());
  const S = new Set(ids), pairs = [];
  for (const i of ids) {const {nb} = await nbOf(i); for (const j of nb) if (S.has(j) && i < j) pairs.push([i, j]);}
  return {pairs};
}

// 위키레이스 경로. 사이트는 링크 조각(문서당 큰 이웃 24개)으로 양방향 BFS: 전체 그래프가 아니라서 더 길게 나올 수 있다
const DATE = /^(기원전 )?\d+(년( \d+월)?|년대|세기|월( \d+일)?)$/; // 날짜 문서는 경유지에서 뺀다
export async function findPath(a, b, cap = 6000) {
  if (LOCAL) return (await fetch(`/api/path?a=${a}&b=${b}`).then(r => r.json())).path;
  if (a === b) return [a];
  const par = [new Map([[a, -1]]), new Map([[b, -1]])], front = [[a], [b]];
  const walk = (m, x) => {const o = []; for (; x !== -1; x = m.get(x)) o.push(x); return o;};
  while (front[0].length && front[1].length) {
    const s = front[0].length <= front[1].length ? 0 : 1, nxt = [];
    const rows = await Promise.all(front[s].map(nbOf));
    for (let k = 0; k < rows.length; k++) for (const v of rows[k].nb) {
      if (par[s].has(v) || (DATE.test(titles[v]) && !par[1 - s].has(v))) continue; par[s].set(v, front[s][k]);
      if (par[1 - s].has(v)) {const L = walk(par[0], v).reverse(), R = walk(par[1], v).slice(1); return [...L, ...R];}
      nxt.push(v);
    }
    if (par[s].size > cap) return null;
    front[s] = nxt.slice(0, 3000); // shortcut: 프런티어를 잘라 조각 다운로드를 제한, 경로가 최단이 아닐 수 있음
  }
  return null;
}

// 브리지: 로컬은 server.py 프록시(토큰은 서버에만), 공개 사이트는 127.0.0.1:8001에 토큰을 붙여 직접
let token = ''; try {token = localStorage.getItem('wb-token') || '';} catch { /* 저장소 막힘 */ }
export const setToken = t => {token = t; try {localStorage.setItem('wb-token', t);} catch { /* 저장소 막힘 */ }};
export const bfetch = (name, opt = {}) => LOCAL ? fetch('/api/b/' + name, opt)
  : fetch('http://127.0.0.1:8001/api/' + name, {...opt, headers: {...(opt.headers || {}), 'X-Bridge-Token': token}});
export async function post(name, body) {
  const r = await bfetch(name, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const j = await r.json().catch(() => ({error: '응답을 읽지 못함'}));
  if (!r.ok) throw new Error(j.error || j.detail || ('HTTP ' + r.status));
  return j;
}
// 채팅 스트림: OpenAI 호환 SSE 줄을 읽어 조각마다 onText
export async function streamChat(body, onText) {
  const r = await bfetch('chat', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  if (!r.ok) {const j = await r.json().catch(() => ({})); throw new Error(j.error || j.detail || ('HTTP ' + r.status));}
  const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) {
    const {done, value} = await rd.read(); if (done) break; buf += dec.decode(value, {stream: true}); let k;
    while ((k = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, k).trim(); buf = buf.slice(k + 1);
      if (!line.startsWith('data:') || line.includes('[DONE]')) continue;
      try {const c = JSON.parse(line.slice(5)).choices[0].delta?.content || ''; if (c) onText(c);} catch { /* 깨진 줄 무시 */ }
    }
  }
}

// 검색: 정확히 같은 제목 → 앞부분 일치 → 포함, 링크 많은 순
const tnorm = s => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
let lowered = null;
export function findTitles(q, kA, limit = 8) {
  q = tnorm(q); if (!q) return [];
  lowered ??= titles.map(tnorm);
  const ex = [], pre = [], inc = [];
  for (let i = 0; i < lowered.length && inc.length < 40; i++) {const t = lowered[i]; if (t === q) ex.push(i); else if (t.startsWith(q)) pre.push(i); else if (t.includes(q)) inc.push(i);}
  const byK = (a, b) => kA[b] - kA[a];
  return [...ex, ...pre.sort(byK), ...inc.sort(byK)].slice(0, limit);
}

// 세계 창 사건: pipeline/7_live.py 결과. 점수 = log(기사 수) × 영향도 × 24시간 반감기
export async function loadEvents() {
  const d = await fetch(LOCAL ? '/live/events.json' : 'data/live/events.json', {cache: 'no-store'}).then(r => r.json());
  const now = Date.now() / 1000;
  return d.events.map(e => ({...e, score: Math.log1p(e.articles) * (1 + Math.abs(e.goldstein) / 10) * 0.5 ** ((now - e.born) / 86400)}))
    .sort((a, b) => b.score - a.score).slice(0, d.show || 200);
}
