import {useEffect, useMemo, useRef, useState} from 'react';
import {Stack} from '@astryxdesign/core/Stack';
import {Card} from '@astryxdesign/core/Card';
import {Heading} from '@astryxdesign/core/Heading';
import {Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {ToggleButton} from '@astryxdesign/core/ToggleButton';
import {Slider} from '@astryxdesign/core/Slider';
import {Typeahead} from '@astryxdesign/core/Typeahead';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Spinner} from '@astryxdesign/core/Spinner';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {Search, X, Orbit, Map as MapIcon, MessageSquareText, GraduationCap, ExternalLink, Send, PlugZap, Route, Globe2, Sparkles, CircleDashed} from 'lucide-react';
import {LOCAL, loadGalaxy, getLinks, getDoc, findPath, bfetch, post, streamChat, findTitles, setToken, loadEvents} from './api.js';
import {createScene, SRC_RGB, SRC_KO} from './scene.js';
import {createGlobe, EVENT_RGB} from './globe.js';

const fmt = n => n.toLocaleString('ko-KR');
const KIND_KO = {news: '뉴스', paper: '논문', disclosure: '공시 소식'};
const EVENT_KO = {economy: '경제', politics: '정치·외교', conflict: '분쟁·사고'};
const rgb = c => `rgb(${c.map(v => Math.round(Math.min(1, v) * 255)).join(',')})`;
const ago = born => {const m = Math.round((Date.now() / 1000 - born) / 60); return m < 60 ? m + '분 전' : Math.round(m / 60) + '시간 전';};
const STATE_KO = c => ({queued: '대기', stopping_chat: '채팅 서버 내리는 중', augmenting: '3관점 데이터 생성 중', training: '학습 중',
  done: `완료 · train ${c.train_loss} / valid ${c.val_loss} · ${c.seconds}초`, discarded_overfit: `과적합으로 폐기 (train ${c.train_loss} / valid ${c.val_loss})`, failed: '실패'}[c.state] || c.state);
// 화면 가장자리에 떠 있는 영역 (3D 위 오버레이). 간격은 테마 토큰
const edge = (pos) => ({position: 'fixed', zIndex: 3, ...pos});
const S = 'var(--spacing-6)';

export default function App() {
  const sky = useRef(null), ring = useRef(null), sceneRef = useRef(null);
  const [galaxy, setGalaxy] = useState(null);
  const [view, setView] = useState(null);
  const [hover, setHover] = useState(null);
  const [panel, setPanel] = useState(null); // {kind:'doc'|'sphere'|'sat', ...}
  const [sphere, setSphere] = useState(null);
  const [radius, setRadius] = useState(70);
  const [districts, setDistricts] = useState(true);
  const [bridge, setBridge] = useState({up: false});
  const [sats, setSats] = useState([]);
  const [chat, setChat] = useState(null); // {target, log:[]}
  const [searchVal, setSearchVal] = useState(null);
  const raceRef = useRef(null); // 위키레이스 출발 문서 (createScene 콜백이 옛 state를 잡으므로 ref)
  const [race, setRace] = useState(null);
  const [tab, setTab] = useState('stars');
  const earthEl = useRef(null), globeRef = useRef(null);
  const [events, setEvents] = useState(null);
  const [wpanel, setWpanel] = useState(null); // {kind:'event'|'region', ...}
  const [regionMode, setRegionMode] = useState(false);
  const [evlinks, setEvlinks] = useState({}); // 사건 id → 가까운 위키 문서 (내 Mac 브리지가 연결)
  useEffect(() => {
    if (tab !== 'world' || !bridge.up) return;
    const load = () => bfetch('event_links').then(r => r.ok ? r.json() : {}).then(setEvlinks).catch(() => {});
    load(); const t = setInterval(load, 60000); return () => clearInterval(t);
  }, [tab, bridge.up]);
  const gotoDoc = i => {setTab('stars'); setTimeout(() => openDoc(i), 50);};
  useEffect(() => {
    sceneRef.current?.setActive(tab === 'stars'); globeRef.current?.setActive(tab === 'world');
    if (tab !== 'world' || globeRef.current) return;
    globeRef.current = createGlobe(earthEl.current, (type, v) => {
      if (type === 'event') setWpanel({kind: 'event', e: v});
      else if (type === 'region') setWpanel({kind: 'region', ...v});
    });
    loadEvents().then(ev => {setEvents(ev); globeRef.current.setEvents(ev);}).catch(() => setEvents([]));
  }, [tab]);

  useEffect(() => {
    let alive = true;
    loadGalaxy().then(g => {
      if (!alive) return; setGalaxy(g);
      sceneRef.current = createScene(sky.current, ring.current, g.raw, (type, v) => {
        if (type === 'view') setView(v);
        else if (type === 'hover') setHover(v);
        else if (type === 'select') openDoc(v);
        else if (type === 'sphere') setSphere(v);
        else if (type === 'radius') setRadius(v);
        else if (type === 'sat') setPanel({kind: 'sat', sat: v});
        else if (type === 'pathStep') setPanel(p => p?.kind === 'path' ? {...p, step: v} : p);
      }, g.src);
    });
    return () => {alive = false;};
  }, []);

  async function openDoc(i, keep) {
    const sc = sceneRef.current, t = galaxy?.titles ?? null;
    if (raceRef.current != null && raceRef.current !== i) return runRace(raceRef.current, i);
    setPanel({kind: 'doc', i, title: (t || [])[i], loading: true});
    try {
      const [L, d] = await Promise.all([getLinks(i), getDoc(i)]);
      sc.focusStar(i, L.nb, keep);
      setPanel({kind: 'doc', i, title: d.title, intro: d.intro, indeg: d.indeg, n: L.n, shown: L.nb.length});
    } catch {
      sc.focusStar(i, null, keep);
      setPanel(p => ({...p, loading: false, error: true}));
    }
  }
  async function runRace(a, b) {
    raceRef.current = null; setRace(null);
    setPanel({kind: 'path', a, b, loading: true});
    const t0 = performance.now(), path = await findPath(a, b).catch(() => null);
    setPanel({kind: 'path', a, b, path, ms: performance.now() - t0, step: 0});
    if (path) sceneRef.current.showPath(path);
  }
  const startRace = i => {raceRef.current = i; setRace(i);};
  // createScene 콜백이 처음 렌더의 openDoc을 잡으므로 titles는 ref로
  const titlesRef = useRef(null); titlesRef.current = galaxy?.titles;
  useEffect(() => {if (sphere) setPanel({kind: 'sphere'}); else setPanel(p => p?.kind === 'sphere' ? null : p);}, [sphere]);

  // 브리지 상태 4초마다, 위성 1분마다
  useEffect(() => {
    const poll = async () => {
      try {const r = await bfetch('status'); const s = await r.json(); if (!r.ok) throw 0; setBridge({up: true, ...s});}
      catch {setBridge(b => ({up: false, asked: b.asked}));}
    };
    poll(); const t = setInterval(poll, 4000); return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!galaxy) return;
    const load = async () => {
      try {const r = await bfetch('satellites'); if (!r.ok) return; const d = await r.json(); sceneRef.current?.setSats(d.satellites, d.calib, d.now); setSats(d.satellites);}
      catch { /* 브리지 없음 */ }
    };
    load(); const t = setInterval(load, 60000); return () => clearInterval(t);
  }, [galaxy, bridge.up]);

  const searchSource = useMemo(() => ({
    search: q => galaxy ? findTitles(q, sceneRef.current.kA).map(i => ({id: String(i), label: galaxy.titles[i]})) : [],
  }), [galaxy]);

  const sc = sceneRef.current, titles = galaxy?.titles;
  const lastCluster = Object.entries(bridge.clusters || {}).pop();

  return (
    <>
      <div ref={sky} className="sky" style={{visibility: tab === 'stars' ? 'visible' : 'hidden'}} />
      <div ref={earthEl} className="sky" style={{visibility: tab === 'world' ? 'visible' : 'hidden'}} />
      <svg ref={ring} className="ring" aria-hidden="true" />
      <div className="vignette" />

      {galaxy && (
        <Card padding={1} elevation="med" style={edge({top: S, left: S})}>
          <SegmentedControl label="창" value={tab} onChange={v => {setTab(v); setRegionMode(false); globeRef.current?.setRegionMode(false);}}>
            <SegmentedControlItem value="stars" label="지식" icon={<Sparkles size={14} />} />
            <SegmentedControlItem value="world" label="세계" icon={<Globe2 size={14} />} />
          </SegmentedControl>
        </Card>
      )}

      {/* 검색 + 연결 상태 */}
      <Stack gap={2} align="end" style={edge({top: S, right: S})} width="min(360px, calc(100vw - 140px))">
        {tab === 'stars' && <Card padding={1} elevation="med" width="100%">
          <Typeahead label="문서 제목으로 찾기" isLabelHidden placeholder="문서 제목으로 찾기" startIcon={Search} width="100%"
            searchSource={searchSource} value={searchVal} debounceMs={0} emptySearchText="맞는 제목이 없어요"
            onChange={it => {setSearchVal(it); if (it) openDoc(+it.id);}} />
        </Card>}
        <BridgeStatus bridge={bridge} last={lastCluster} onToken={t => {setToken(t); setBridge(b => ({...b, asked: true}));}} />
      </Stack>

      {/* 패널 */}
      {tab === 'stars' && panel && galaxy && (
        <Card elevation="high" padding={5} width="min(420px, calc(100vw - 48px))" style={edge({left: S, bottom: S, maxHeight: '48vh', overflow: 'auto'})}>
          <Stack gap={3}>
            <Stack direction="horizontal" justify="between" align="start" gap={2}>
              <Heading level={2} textWrap="balance">{panelTitle(panel, sphere, titles)}</Heading>
              <IconButton label="닫기" variant="ghost" size="sm" icon={<X size={16} />} onClick={() => {
                if (panel.kind === 'sphere') sc.hideSphere(); else sc.clearFocus(); setPanel(null);
              }} />
            </Stack>
            {panel.kind === 'doc' && <DocBody p={panel} race={race} onRace={() => startRace(panel.i)} />}
            {panel.kind === 'path' && <PathBody p={panel} titles={titles} onPick={i => openDoc(i, true)} />}
            {panel.kind === 'sphere' && sphere && <SphereBody sphere={sphere} titles={titles} onPick={i => openDoc(i, true)}
              onAsk={() => setChat(c => ({target: {kind: 'sphere'}, log: c?.log || []}))}
              onTrain={() => train({kind: 'sphere'})} />}
            {panel.kind === 'sat' && <SatBody sat={panel.sat} onPick={i => openDoc(i, true)}
              onAsk={() => setChat(c => ({target: {kind: 'sat', sat: panel.sat}, log: c?.log || []}))}
              onTrain={() => train({kind: 'sat', sat: panel.sat})} />}
          </Stack>
        </Card>
      )}

      {tab === 'world' && <WorldUI evlinks={evlinks} bridgeUp={bridge.up} onDoc={gotoDoc} events={events} wpanel={wpanel} setWpanel={setWpanel} globe={globeRef.current} regionMode={regionMode}
        setRegionMode={on => {setRegionMode(on); globeRef.current?.setRegionMode(on);}}
        onAsk={target => setChat(c => ({target: {...target, links: evlinks}, log: c?.log || []}))} onTrain={t => train({...t, links: evlinks})} />}

      {/* 도구 막대 */}
      {tab === 'stars' && galaxy && (
        <Card elevation="med" padding={1.5} style={edge({left: '50%', bottom: S, transform: 'translateX(-50%)'})}>
          <Stack direction="horizontal" gap={2} align="center">
            <ToggleButton label="구로 고르기" icon={<Orbit size={16} />} isPressed={!!sphere}
              onPressedChange={on => on ? sc.showSphere() : sc.hideSphere()}>구로 고르기</ToggleButton>
            <ToggleButton label="분야 경계" icon={<MapIcon size={16} />} isPressed={districts}
              onPressedChange={() => setDistricts(sc.toggleDistricts())}>분야 경계</ToggleButton>
            {sphere && <Slider label="반지름" isLabelHidden width={200} value={radius} min={6} max={600} valueDisplay="text" formatValue={v => `반지름 ${v}`}
              onChange={v => {setRadius(v); sc.setR(v);}} onChangeEnd={() => sc.showSphere && sc.setR(radius)} />}
          </Stack>
        </Card>
      )}

      {/* 판독기 */}
      {tab === 'stars' && galaxy && (
        <Stack gap={0.5} align="end" style={edge({right: S, bottom: S, pointerEvents: 'none'})}>
          <Heading level={3} type="display-3">{fmt(sc?.N || 0)}</Heading>
          {galaxy.src && <SrcLegend src={galaxy.src} />}
          <Text type="supporting">문서{view ? ` · 시야 안 약 ${fmt(view)}` : ''}{sphere ? ` · 고른 별 ${fmt(sphere.ids.length)}` : ''}{sats.length ? ` · 위성 ${sats.length}` : ''}</Text>
        </Stack>
      )}

      {tab === 'stars' && hover && titles && (
        <Card padding={1} elevation="low" style={edge({left: hover.x + 14, top: hover.y + 14, zIndex: 4, pointerEvents: 'none'})}>
          <Text type="label">{titles[hover.i]}</Text>
        </Card>
      )}

      {chat && <ChatPanel chat={chat} setChat={setChat} bridge={bridge} sc={sc} />}

      {!galaxy && (
        <Stack align="center" justify="center" style={edge({inset: 0, zIndex: 5})} className="loading">
          <Spinner size="xl" label="별을 새기는 중" />
        </Stack>
      )}
    </>
  );

  async function train(target) {
    setChat(c => ({target, log: c?.log || []}));
    const say = text => setChat(c => ({...c, log: [...c.log, {who: 'sys', text}]}));
    if (!bridge.up) {say(LOCAL ? '백엔드가 꺼져 있어요. ./run_local.sh 로 켜 주세요.' : '내 Mac 브리지에 연결되지 않았어요. 오른쪽 위에서 토큰을 넣어 주세요.'); return;}
    try {
      let docs;
      if (target.kind === 'world') {
        docs = target.events.slice(0, 40).map(e => ({title: e.title.slice(0, 300), text: worldDoc(e)}));
        const idx = [...new Set(target.events.flatMap(e => (target.links[e.id] || []).slice(0, 3).map(n => n.i)))].slice(0, 8);
        if (idx.length) docs.push(...(await post('rag', {indices: idx})).docs.map(d => ({title: d.title.slice(0, 300), text: d.text.slice(0, 6000)})));
      }
      else {
        const idx = target.kind === 'sat' ? target.sat.neighbors.slice(0, 8).map(n => n.i) : sc.inSphere.slice(0, 8);
        const rag = await post('rag', {indices: idx});
        docs = rag.docs.map(d => ({title: d.title.slice(0, 300), text: d.text.slice(0, 6000)}));
      }
      if (target.kind === 'sat') docs.unshift({title: target.sat.title.slice(0, 300), text: target.sat.summary || target.sat.title});
      const cid = target.kind + '-' + Date.now().toString(36);
      const res = await post('augment', {clusterId: cid, documents: docs});
      say(`RAG 문맥은 바로 준비됐어요 (문서 ${docs.length}개). LoRA 학습은 뒤에서 돌아요: ${res.baseModel.split('/').pop()}, 샘플 ${res.sampleCount}개, 8GB에서 몇 분~20분.`);
    } catch (e) {say('학습 요청 실패: ' + e.message);}
  }
}

function panelTitle(p, sphere, titles) {
  if (p.kind === 'doc') return p.title || titles?.[p.i];
  if (p.kind === 'sat') return p.sat.title;
  if (p.kind === 'path') return `${titles[p.a]} → ${titles[p.b]}`;
  return sphere ? (sphere.ids.length ? `구 안 문서 ${fmt(sphere.ids.length)}개` : '구 안에 문서가 없어요') : '';
}

function PathBody({p, titles, onPick}) {
  if (p.loading) return <Spinner size="sm" label="링크를 따라 길을 찾는 중" />;
  if (!p.path) return <Text type="supporting">링크로 이어진 길을 찾지 못했어요{LOCAL ? '' : ' (공개 사이트는 문서마다 큰 이웃 24개만 써요)'}.</Text>;
  return (
    <Stack gap={2}>
      <Text type="supporting">링크 {p.path.length - 1}번 · {Math.round(p.ms)}ms{LOCAL ? '' : ' · 공개 사이트는 큰 이웃만 써서 실제보다 길 수 있어요'}</Text>
      <Stack direction="horizontal" gap={1} wrap="wrap" align="center">
        {p.path.map((i, k) => <Button key={i} label={titles[i]} size="sm" variant={k === p.step ? 'primary' : 'ghost'} onClick={() => onPick(i)} />)}
      </Stack>
    </Stack>
  );
}

function DocBody({p, race, onRace}) {
  if (p.loading) return <Spinner size="sm" label="불러오는 중" />;
  if (p.error) return <Text type="supporting">문서 정보를 불러오지 못했어요.</Text>;
  return (
    <Stack gap={2}>
      <Text type="supporting">들어오는 링크 {fmt(p.indeg)} · 이어진 문서 {fmt(p.n)}{p.n > p.shown ? ` (큰 문서 ${p.shown}개만 선으로)` : ''}</Text>
      <Text as="p" display="block">{p.intro || '첫 문단이 없는 문서'}</Text>
      <Stack direction="horizontal" gap={2} align="center" wrap="wrap">
        <Button label={race === p.i ? '도착 문서를 고르세요' : '여기서 위키레이스'} size="sm" icon={<Route size={14} />} isDisabled={race === p.i} onClick={onRace} />
        <Text type="supporting" size="xsm">곡선이 밝을수록 뜻은 먼데 링크로 이어진 문서</Text>
      </Stack>
    </Stack>
  );
}

function TitleChips({ids, titles, onPick}) {
  return (
    <Stack direction="horizontal" gap={1} wrap="wrap">
      {ids.map(i => <Button key={i} label={titles[i]} size="sm" variant="ghost" onClick={() => onPick(i)} />)}
    </Stack>
  );
}

function SphereBody({sphere, titles, onPick, onAsk, onTrain}) {
  if (!sphere.ids.length) return <Text type="supporting">구를 별이 많은 곳으로 끌거나 반지름을 키워 보세요.</Text>;
  return (
    <Stack gap={3}>
      <Text type="supporting">반지름 {sphere.R} · 계산 {Math.round(sphere.ms)}ms · 링크 많은 순</Text>
      <TitleChips ids={sphere.ids.slice(0, 30)} titles={titles} onPick={onPick} />
      <Stack direction="horizontal" gap={2} wrap="wrap">
        <Button label="이 구역에 질문하기" variant="primary" icon={<MessageSquareText size={16} />} onClick={onAsk} />
        <Button label="이 구역으로 LoRA 학습" icon={<GraduationCap size={16} />} onClick={onTrain} />
      </Stack>
    </Stack>
  );
}

function SatBody({sat, onPick, onAsk, onTrain}) {
  const ago = Math.round((Date.now() / 1000 - sat.born) / 60);
  return (
    <Stack gap={3}>
      <Stack direction="horizontal" gap={2} align="center" wrap="wrap">
        <Text type="supporting">{KIND_KO[sat.kind]} · {ago < 60 ? ago + '분' : Math.round(ago / 60) + '시간'} 전 수집</Text>
        <Button label="원문" size="sm" variant="ghost" icon={<ExternalLink size={14} />} onClick={() => window.open(sat.link, '_blank', 'noopener,noreferrer')} />
      </Stack>
      {sat.summary && <Text as="p" display="block">{sat.summary}</Text>}
      <Text type="label" color="secondary">가장 가까운 위키 문서</Text>
      <Stack direction="horizontal" gap={1} wrap="wrap">
        {sat.neighbors.map(n => <Button key={n.i} label={n.title} size="sm" variant="ghost" onClick={() => onPick(n.i)} />)}
      </Stack>
      <Stack direction="horizontal" gap={2} wrap="wrap">
        <Button label="이 소식 주변에 질문하기" variant="primary" icon={<MessageSquareText size={16} />} onClick={onAsk} />
        <Button label="주변으로 LoRA 학습" icon={<GraduationCap size={16} />} onClick={onTrain} />
      </Stack>
    </Stack>
  );
}

function BridgeStatus({bridge, last, onToken}) {
  const [tok, setTok] = useState('');
  if (bridge.up) return (
    <Text type="supporting" color="accent">{LOCAL ? '백엔드' : '내 Mac'} 연결됨 · {bridge.baseModel?.split('/').pop()}{last ? ` · 학습 ${last[0]}: ${STATE_KO(last[1])}` : ''}</Text>
  );
  if (LOCAL) return <Text type="supporting">백엔드 꺼짐 · 질문과 학습은 ./run_local.sh 실행 후</Text>;
  return (
    <Stack gap={1} align="end">
      <Text type="supporting">내 Mac에 연결하면 질문·학습·위성을 쓸 수 있어요 (토큰: data/lora/token)</Text>
      <Stack direction="horizontal" gap={1} as="form" onSubmit={e => {e.preventDefault(); onToken(tok.trim());}}>
        <TextInput label="브리지 토큰" isLabelHidden type="password" placeholder="토큰" size="sm" value={tok} onChange={setTok} />
        <Button label="연결" size="sm" type="submit" icon={<PlugZap size={14} />} />
      </Stack>
    </Stack>
  );
}

function ChatPanel({chat, setChat, bridge, sc}) {
  const [q, setQ] = useState(''), [busy, setBusy] = useState(false), logEnd = useRef(null);
  const t = chat.target;
  useEffect(() => {logEnd.current?.scrollIntoView({block: 'end'});}, [chat.log]);
  const push = m => setChat(c => ({...c, log: [...c.log, m]}));
  const patchLast = f => setChat(c => ({...c, log: c.log.map((m, k) => k === c.log.length - 1 ? f(m) : m)}));
  async function ask(e) {
    e.preventDefault(); const question = q.trim(); if (!question || busy) return;
    if (t.kind === 'world' && !t.events.length) {push({who: 'sys', text: '고른 지역에 사건이 없어요.'}); return;}
    if (t.kind === 'sphere' && !sc.inSphere.length) {push({who: 'sys', text: '먼저 구를 띄워 구역을 골라 주세요.'}); return;}
    if (!bridge.up) {push({who: 'sys', text: LOCAL ? '백엔드가 꺼져 있어요. ./run_local.sh 로 켜 주세요.' : '내 Mac 브리지에 연결되지 않았어요.'}); return;}
    if (bridge.training) {push({who: 'sys', text: 'LoRA 학습 중이라 채팅 서버가 내려가 있어요. 학습이 끝나면 다시 질문해 주세요.'}); return;}
    setQ(''); setBusy(true); push({who: 'user', text: question}); push({who: 'bot', text: '', status: '가까운 위키 문서를 모으는 중'});
    const t0 = performance.now(); let first = 0, out = '';
    try {
      // 후보: 위성이면 최근접 9개, 구면 링크 많은 300개 + 중심 근처 100개. 브리지가 질문과 가까운 3개를 고른다
      if (t.kind === 'world') {
        let ctx = t.events.slice(0, 30).map(e => `[${EVENT_KO[e.kind]}] ${e.title}\n${worldDoc(e)}`).join('\n\n');
        const idx = [...new Set(t.events.flatMap(e => (t.links?.[e.id] || []).map(n => n.i)))];
        let wiki = [];
        if (idx.length) {const rag = await post('rag', {indices: idx.slice(0, 200), question, top: 3, chars: 1200}); wiki = rag.docs.map(d => d.title); ctx += '\n\n---\n\n' + rag.context;}
        patchLast(m => ({...m, sources: t.events.slice(0, 3).map(e => e.title).concat(wiki), status: '모델이 사건과 위키 문서를 읽는 중 · 보통 5~20초'}));
        await streamChat({question, context: ctx.slice(0, 60000), max_tokens: 400}, c => {
          if (!first) first = performance.now() - t0; out += c; patchLast(m => ({...m, text: out, status: null}));
        });
        patchLast(m => ({...m, text: out || '(빈 답변)', status: null, meta: `첫 글자 ${(first / 1000).toFixed(1)}초 · 전체 ${((performance.now() - t0) / 1000).toFixed(1)}초`}));
        setBusy(false); return;
      }
      const cand = t.kind === 'sat' ? t.sat.neighbors.map(n => n.i) : [...sc.inSphere.slice(0, 300), ...sc.nearest(100)];
      const rag = await post('rag', {indices: cand.slice(0, 400), question, top: 3, chars: 1200});
      const prefix = t.kind === 'sat' ? `[${KIND_KO[t.sat.kind]}] ${t.sat.title}\n${t.sat.summary}\n\n---\n\n` : '';
      patchLast(m => ({...m, sources: (t.kind === 'sat' ? [t.sat.title] : []).concat(rag.docs.map(d => d.title)), status: '모델이 문서를 읽는 중 · 보통 5~20초'}));
      await streamChat({question, context: (prefix + rag.context).slice(0, 60000), max_tokens: 400}, c => {
        if (!first) first = performance.now() - t0; out += c; patchLast(m => ({...m, text: out, status: null}));
      });
      patchLast(m => ({...m, text: out || '(빈 답변)', status: null, meta: `첫 글자 ${(first / 1000).toFixed(1)}초 · 전체 ${((performance.now() - t0) / 1000).toFixed(1)}초`}));
    } catch (err) {patchLast(m => ({...m, text: '실패: ' + err.message, status: null}));}
    setBusy(false);
  }
  return (
    <Card elevation="high" padding={4} width="min(420px, calc(100vw - 48px))" style={edge({right: S, top: 'calc(var(--spacing-12) * 2)', bottom: 'calc(var(--spacing-12) + var(--spacing-6))', zIndex: 4, display: 'flex'})}>
      <Stack gap={3} height="100%" width="100%">
        <Stack direction="horizontal" justify="between" align="center">
          <Heading level={3}>{t.kind === 'sat' ? '이 소식 주변에 묻기' : t.kind === 'world' ? '이 사건들에 묻기' : '이 구역에 묻기'}</Heading>
          <IconButton label="닫기" variant="ghost" size="sm" icon={<X size={16} />} onClick={() => setChat(null)} />
        </Stack>
        <Stack gap={3} isScrollable style={{flex: 1}}>
          {chat.log.map((m, k) => (
            <Stack key={k} gap={1} align={m.who === 'user' ? 'end' : 'start'}>
              {m.sources && <Text type="supporting" size="xsm">근거: {m.sources.join(' · ')}</Text>}
              {m.who === 'user'
                ? <Card variant="muted" padding={2}><Text>{m.text}</Text></Card>
                : <Text as="p" display="block" color={m.who === 'sys' ? 'secondary' : 'primary'} textWrap="pretty">{m.text}</Text>}
              {m.status && <Spinner size="sm" label={m.status} />}
              {m.meta && <Text type="supporting" size="xsm">{m.meta}</Text>}
            </Stack>
          ))}
          <span ref={logEnd} />
        </Stack>
        <Stack direction="horizontal" gap={1} as="form" onSubmit={ask} align="center" width="100%">
          <TextInput label="질문" isLabelHidden placeholder={t.kind === 'sat' ? '이 소식과 주변 문서에 대해 묻기' : t.kind === 'world' ? '고른 사건에 대해 묻기' : '구 안 문서에 대해 묻기'} value={q} onChange={setQ} size="md" width="100%" />
          <IconButton label="묻기" type="submit" variant="primary" icon={<Send size={16} />} isLoading={busy} />
        </Stack>
      </Stack>
    </Card>
  );
}

const worldDoc = e => `${e.place} · ${EVENT_KO[e.kind]} · 기사 ${e.articles}건 · 영향도 ${e.goldstein} · 어조 ${e.tone} · ${new Date(e.born * 1000).toISOString().slice(0, 16)} UTC · ${e.link}`;

function EventRow({e, onPick, active}) {
  return (
    <Stack direction="horizontal" gap={2} align="start">
      <span aria-hidden="true" style={{flex: 'none', width: 8, height: 8, marginTop: 6, borderRadius: 99, background: rgb(EVENT_RGB[e.kind])}} />
      <Stack gap={0.5}>
        <Button label={e.title} size="sm" variant={active ? 'primary' : 'ghost'} onClick={onPick} style={{textAlign: 'start', height: 'auto', whiteSpace: 'normal'}} />
        <Text type="supporting" size="xsm">{e.place} · {ago(e.born)} · 기사 {e.articles}건</Text>
      </Stack>
    </Stack>
  );
}

function WorldUI({evlinks, bridgeUp, onDoc, events, wpanel, setWpanel, globe, regionMode, setRegionMode, onAsk, onTrain}) {
  const counts = useMemo(() => (events || []).reduce((a, e) => ({...a, [e.kind]: (a[e.kind] || 0) + 1}), {}), [events]);
  const list = wpanel?.kind === 'region' ? wpanel.events : null;
  return (
    <>
      {wpanel && (
        <Card elevation="high" padding={5} width="min(440px, calc(100vw - 48px))" style={edge({left: S, bottom: S, maxHeight: '52vh', overflow: 'auto'})}>
          <Stack gap={3}>
            <Stack direction="horizontal" justify="between" align="start" gap={2}>
              <Heading level={2} textWrap="balance">{wpanel.kind === 'event' ? wpanel.e.title : `반경 ${Math.round(wpanel.deg * 111)}km 안 사건 ${list.length}개`}</Heading>
              <IconButton label="닫기" variant="ghost" size="sm" icon={<X size={16} />} onClick={() => {globe?.clearRegion(); setWpanel(null);}} />
            </Stack>
            {wpanel.kind === 'event' && (
              <Stack gap={2}>
                <Stack direction="horizontal" gap={2} align="center" wrap="wrap">
                  <Text type="supporting">{EVENT_KO[wpanel.e.kind]} · {wpanel.e.place} · {ago(wpanel.e.born)} · 기사 {wpanel.e.articles}건 · 어조 {wpanel.e.tone}</Text>
                  <Button label="원문" size="sm" variant="ghost" icon={<ExternalLink size={14} />} onClick={() => window.open(wpanel.e.link, '_blank', 'noopener,noreferrer')} />
                </Stack>
                <Text type="label" color="secondary">가까운 위키 문서</Text>
                {evlinks[wpanel.e.id]
                  ? <Stack direction="horizontal" gap={1} wrap="wrap">{evlinks[wpanel.e.id].map(n => <Button key={n.i} label={n.title} size="sm" variant="ghost" onClick={() => onDoc(n.i)} />)}</Stack>
                  : <Text type="supporting" size="xsm">{bridgeUp ? '연결 중 (몇 분 안에 채워져요)' : '내 Mac 브리지를 켜면 위키 문서와 이어져요'}</Text>}
                <Text type="supporting" size="xsm">출처: GDELT 2.0 공개 파일 · 원문 제목 그대로</Text>
              </Stack>
            )}
            {list && <Stack gap={2}>{list.slice(0, 30).map(e => <EventRow key={e.id} e={e} onPick={() => {globe?.flyTo(e.lat, e.lon); window.open(e.link, '_blank', 'noopener,noreferrer');}} />)}</Stack>}
            <Stack direction="horizontal" gap={2} wrap="wrap">
              <Button label={list ? '이 지역에 질문하기' : '이 사건에 질문하기'} variant="primary" icon={<MessageSquareText size={16} />}
                onClick={() => onAsk({kind: 'world', events: list || [wpanel.e]})} />
              <Button label="이 사건들로 LoRA 학습" icon={<GraduationCap size={16} />} onClick={() => onTrain({kind: 'world', events: list || [wpanel.e]})} />
            </Stack>
          </Stack>
        </Card>
      )}

      <Card elevation="med" padding={1.5} style={edge({left: '50%', bottom: S, transform: 'translateX(-50%)'})}>
        <Stack direction="horizontal" gap={3} align="center" wrap="wrap">
          <ToggleButton label="지역 고르기" icon={<CircleDashed size={16} />} isPressed={regionMode} onPressedChange={setRegionMode}>지역 고르기</ToggleButton>
          {Object.entries(EVENT_KO).map(([k, v]) => (
            <Stack key={k} direction="horizontal" gap={1} align="center">
              <span aria-hidden="true" style={{width: 8, height: 8, borderRadius: 99, background: rgb(EVENT_RGB[k])}} />
              <Text type="supporting">{v} {counts[k] || 0}</Text>
            </Stack>
          ))}
        </Stack>
      </Card>

      <Stack gap={0.5} align="end" style={edge({right: S, bottom: S, pointerEvents: 'none'})}>
        <Heading level={3} type="display-3">{events ? fmt(events.length) : '…'}</Heading>
        <Text type="supporting">{events ? (events.length ? `주요 사건 · 최근 48시간 · GDELT${regionMode ? ' · 지구본을 끌어 원을 그리세요' : ''}` : '사건 데이터 없음 · pipeline/7_live.py 실행') : '사건 불러오는 중'}</Text>
      </Stack>
    </>
  );
}

function SrcLegend({src}) {
  const n = useMemo(() => {const c = new Array(SRC_KO.length).fill(0); for (const v of src) c[v]++; return c;}, [src]);
  return (
    <Stack direction="horizontal" gap={2} wrap="wrap" justify="end">
      {SRC_KO.map((k, i) => n[i] > 0 && (
        <Stack key={k} direction="horizontal" gap={1} align="center">
          <span aria-hidden="true" style={{width: 8, height: 8, borderRadius: 99, background: SRC_RGB[i] ? rgb(SRC_RGB[i]) : 'var(--color-text-secondary)'}} />
          <Text type="supporting" size="xsm">{k} {fmt(n[i])}</Text>
        </Stack>
      ))}
    </Stack>
  );
}
