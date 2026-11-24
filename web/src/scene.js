// 3D 장면: 77만 별, 셰이더(음각·심도·안개·LOD), 분야 경계, 구 선택, 성좌선, 위성, 카메라 비행.
// UI는 React(Astryx) 쪽에 있고, 여기서는 이벤트로만 알린다.
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {SatellitePlacementEngine} from '../../src/core/physics/SatellitePlacementEngine.js';
import {getSub} from './api.js';

const FLAT = 0.35; // 원반 모양 연출용 y축 압축 (축 자체에는 의미 없음)
const STONE = new THREE.Color('#0E0F11');
export const BRASS = [0.72 * 1.5, 0.63 * 1.5, 0.48 * 1.5];
// 문서 출처별 별 색 (0 위키백과는 기존 돌색). brain_src.bin 순서
export const SRC_RGB = [null, [0.55, 0.85, 0.62], [0.78, 0.62, 0.95], [0.98, 0.66, 0.38], [0.95, 0.5, 0.72]];
export const SRC_KO = ['위키백과', '위키낱말사전', '위키문헌', '위키책', 'arXiv 논문'];
export const KIND_RGB = {news: [0, 0.94, 1], paper: [0.39, 0.71, 0.96], disclosure: [0.51, 0.78, 0.52]};

// 음각 점 + 피사계 심도 + 셰이더 안개 + LOD(링크 적은 별은 멀면 숨김)
const VS = `attribute float aSize;attribute vec3 aColor;attribute float aK;varying vec3 vC;varying float vF;varying float vCoc;
uniform float uScale,uLodK,uLodD,uFog,uFocus,uDof,uLift;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.);float z=-mv.z;float hide=aK<uLodK&&z>uLodD?0.:1.;
 vCoc=clamp(abs(z-uFocus)/max(uFocus,1.),0.,1.)*uDof;
 vF=1.-exp(-uFog*uFog*z*z);vC=aColor*hide*(1.+uLift);gl_PointSize=max(aSize*uScale/z*(1.+vCoc*.8+uLift*.5),1.6)*hide;gl_Position=projectionMatrix*mv;}`;
const FS = `varying vec3 vC;varying float vF;varying float vCoc;
void main(){float d=length(gl_PointCoord-.5);
 float core=1.-smoothstep(.16+.16*vCoc,.33+.15*vCoc,d);
 float rim=smoothstep(.37,.42,d)*(1.-smoothstep(.45,.5,d))*.45*(1.-vCoc);
 float a=max(core,rim);gl_FragColor=vec4(vC*(1.-vF)*(core+rim*.7)/(1.+vCoc*.7),a);}`;
const mat = (s, fog = 0.00042) => new THREE.ShaderMaterial({vertexShader: VS, fragmentShader: FS,
  uniforms: {uScale: {value: s}, uLodK: {value: -1}, uLodD: {value: 350}, uFog: {value: fog}, uFocus: {value: 1000}, uDof: {value: 0}, uLift: {value: 0}},
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending});
function setPoints(obj, pos, col, size) {
  const g = obj.geometry, n = pos.length / 3;
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1)); g.setAttribute('aK', new THREE.BufferAttribute(new Float32Array(n).fill(1e9), 1));
  g.computeBoundingSphere();
}
function points(pos, col, size, scale, fog) {const p = new THREE.Points(new THREE.BufferGeometry(), mat(scale, fog)); setPoints(p, pos, col, size); return p;}

export function createScene(el, ringSvg, raw, emit, src) {
  const N = raw.length / 4, PR = Math.min(devicePixelRatio, 2);
  const renderer = new THREE.WebGLRenderer({powerPreference: 'high-performance', antialias: false});
  renderer.setPixelRatio(PR); renderer.setSize(el.clientWidth, el.clientHeight); el.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = STONE;
  const cam = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 1, 30000); cam.position.set(0, 520, 1150);
  const ctl = new OrbitControls(cam, renderer.domElement); ctl.enableDamping = true; ctl.dampingFactor = 0.06;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  ctl.autoRotate = !still; ctl.autoRotateSpeed = 0.12;
  ctl.addEventListener('start', () => {ctl.autoRotate = false; fly = null; pathRun = null; emit('interact');});

  // 트윈: 지수 감속. 동작 줄이기 설정이면 바로 끝 상태로
  const tweens = new Set(), expo = t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  function tween(ms, fn, done) {
    if (still) {fn(1); done && done(); return;}
    const t0 = performance.now();
    tweens.add(now => {const t = Math.min(1, (now - t0) / ms); fn(expo(t)); if (t >= 1) {done && done(); return true;}});
  }
  let fly = null;
  function flyCam(p) {
    const d = Math.min(Math.max(cam.position.distanceTo(ctl.target) * 0.55, 160), 420), dir = cam.position.clone().sub(ctl.target).normalize();
    const t0 = ctl.target.clone(), c0 = cam.position.clone(), c1 = p.clone().addScaledVector(dir, d), me = {}; fly = me; ctl.autoRotate = false;
    tween(1400, e => {if (fly !== me) return; ctl.target.lerpVectors(t0, p, e); cam.position.lerpVectors(c0, c1, e);});
  }

  // 별
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), kA = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const k = raw[i * 4 + 3]; kA[i] = k; pos[i * 3] = raw[i * 4]; pos[i * 3 + 1] = raw[i * 4 + 1] * FLAT; pos[i * 3 + 2] = raw[i * 4 + 2];
    const h = Math.min(1, Math.log2(k + 1) / 11), l = 0.09 + 0.42 * h * h + 0.04 * Math.random();
    const c = src && SRC_RGB[src[i]];
    if (c) {col[i * 3] = c[0] * 0.5; col[i * 3 + 1] = c[1] * 0.5; col[i * 3 + 2] = c[2] * 0.5; size[i] = 2.6; kA[i] = 6;} // 링크 없는 새 문서도 LOD로 숨지 않게
    else {col[i * 3] = 0.91 * l; col[i * 3 + 1] = 0.89 * l; col[i * 3 + 2] = 0.85 * l; size[i] = 1.4 + h * 7;}
  }
  const stars = points(pos, col, size, 230 * PR); scene.add(stars);
  stars.geometry.setAttribute('aK', new THREE.BufferAttribute(kA, 1)); stars.material.uniforms.uLodK.value = 5; stars.material.uniforms.uDof.value = 0.6;
  const P = i => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);

  // 분야 경계: 위에서 본 밀도를 격자로 세고 마칭 스퀘어 등고선 3단
  const districts = (() => {
    const G = 180; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < N; i += 7) {const x = pos[i * 3], z = pos[i * 3 + 2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);}
    const sx = (G - 1) / (x1 - x0), sz = (G - 1) / (z1 - z0), D = new Float32Array(G * G), Y = new Float32Array(G * G);
    for (let i = 0; i < N; i++) {const c = Math.round((pos[i * 3 + 2] - z0) * sz) * G + Math.round((pos[i * 3] - x0) * sx); D[c]++; Y[c] += pos[i * 3 + 1];}
    for (let c = 0; c < G * G; c++) if (D[c]) Y[c] /= D[c];
    for (let pass = 0; pass < 2; pass++) {const B = D.slice(); for (let z = 1; z < G - 1; z++) for (let x = 1; x < G - 1; x++) {let a = 0; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) a += B[(z + dz) * G + x + dx]; D[z * G + x] = a / 9;}}
    const nz = Array.from(D).filter(v => v > 0.5).sort((a, b) => a - b), lv = [0.6, 0.85, 0.96].map(q => nz[Math.floor(nz.length * q)]);
    const out = [], X = g => x0 + g / sx, Z = g => z0 + g / sz;
    const SEG = {1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[0, 3]]};
    for (const L of lv) for (let z = 0; z < G - 1; z++) for (let x = 0; x < G - 1; x++) {
      const a = D[z * G + x], b = D[z * G + x + 1], c = D[(z + 1) * G + x + 1], d = D[(z + 1) * G + x];
      const k = (a > L) | (b > L) << 1 | (c > L) << 2 | (d > L) << 3; if (!k || k === 15) continue;
      const y = (Y[z * G + x] + Y[(z + 1) * G + x + 1]) / 2, e = [[x + (L - a) / (b - a), z], [x + 1, z + (L - b) / (c - b)], [x + (L - d) / (c - d), z + 1], [x, z + (L - a) / (d - a)]];
      for (const [p, q] of SEG[k]) out.push(X(e[p][0]), y, Z(e[p][1]), X(e[q][0]), y, Z(e[q][1]));
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3));
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({color: '#A7B1B8', transparent: true, opacity: 0.5, depthWrite: false})); scene.add(m); return m;
  })();

  // 링크 곡선: 2차 베지어(멀수록 높이 솟음) + 흐르는 빛. aFar=의미 거리 순위(멀수록 1)라서 "뜻은 먼데 이어진" 링크가 밝다
  const arcMat = new THREE.ShaderMaterial({transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {uTime: {value: 0}, uC: {value: new THREE.Color('#E9E4D8')}, uH: {value: new THREE.Color(...BRASS)}},
    vertexShader: `attribute float aT;attribute float aFar;varying float vT;varying float vFar;void main(){vT=aT;vFar=aFar;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying float vT;varying float vFar;uniform float uTime;uniform vec3 uC;uniform vec3 uH;
      void main(){float flow=pow(fract(vT-uTime*.35),6.);vec3 c=mix(uC,uH,vFar);gl_FragColor=vec4(c,(.10+.25*vFar)+flow*(.5+.4*vFar));}`});
  const lineGeo = new THREE.BufferGeometry(); scene.add(new THREE.LineSegments(lineGeo, arcMat));
  const ARC = 16;
  function arcs(pairs, far) { // pairs: [[a,b],...] 문서 번호, far: 0..1
    const n = pairs.length, P3 = new Float32Array(n * ARC * 6), T = new Float32Array(n * ARC * 2), F = new Float32Array(n * ARC * 2);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), m = new THREE.Vector3(), q = new THREE.Vector3(), r = new THREE.Vector3();
    pairs.forEach(([i, j], k) => {
      a.copy(P(i)); b.copy(P(j)); const d = a.distanceTo(b); m.addVectors(a, b).multiplyScalar(0.5); m.y += d * 0.35;
      const at = t => q.set(0, 0, 0).addScaledVector(a, (1 - t) ** 2).addScaledVector(m, 2 * t * (1 - t)).addScaledVector(b, t * t);
      for (let s = 0; s < ARC; s++) {
        const o = (k * ARC + s);
        r.copy(at(s / ARC)); P3.set([r.x, r.y, r.z], o * 6); at((s + 1) / ARC); P3.set([q.x, q.y, q.z], o * 6 + 3);
        T[o * 2] = s / ARC; T[o * 2 + 1] = (s + 1) / ARC; F[o * 2] = F[o * 2 + 1] = far[k];
      }
    });
    lineGeo.setAttribute('position', new THREE.BufferAttribute(P3, 3)); lineGeo.setAttribute('aT', new THREE.BufferAttribute(T, 1));
    lineGeo.setAttribute('aFar', new THREE.BufferAttribute(F, 1)); lineGeo.computeBoundingSphere();
  }
  const mark = points(new Float32Array(3), new Float32Array(BRASS), new Float32Array([34]), 230 * PR, 0); mark.visible = false; scene.add(mark);
  const picks = points(new Float32Array(3), new Float32Array(3), new Float32Array(1), 230 * PR, 0); picks.visible = false; scene.add(picks);

  // 둘레 눈금 링 (카메라 방위각에 맞춰 돈다)
  const SVGNS = 'http://www.w3.org/2000/svg'; let rot = null;
  function buildRing() {
    ringSvg.innerHTML = ''; const w = innerWidth, h = innerHeight, R = Math.min(w, h) * 0.44; if (R < 60) return;
    const g = document.createElementNS(SVGNS, 'g'); g.setAttribute('transform', `translate(${w / 2} ${h / 2})`); ringSvg.appendChild(g);
    for (const r of [R, R - 14, R - 44]) {const c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('r', r); c.setAttribute('class', 'ringline'); g.appendChild(c);}
    rot = document.createElementNS(SVGNS, 'g'); g.appendChild(rot);
    for (let d = 0; d < 360; d++) {
      const a = d * Math.PI / 180, m = d % 30 === 0, l = m ? 14 : d % 5 === 0 ? 9 : 5, t = document.createElementNS(SVGNS, 'line');
      t.setAttribute('x1', Math.sin(a) * R); t.setAttribute('y1', -Math.cos(a) * R); t.setAttribute('x2', Math.sin(a) * (R - l)); t.setAttribute('y2', -Math.cos(a) * (R - l));
      t.setAttribute('class', 'tick' + (m ? ' major' : '')); rot.appendChild(t);
    }
  }
  buildRing();

  // 시야 안 문서 수 (6만 표본 추정)
  const SAMPLE = Math.min(N, 60000), sidx = new Uint32Array(SAMPLE); for (let k = 0; k < SAMPLE; k++) sidx[k] = Math.floor(Math.random() * N);
  function countInView() {
    cam.updateMatrixWorld(); const m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements; let c = 0;
    for (let k = 0; k < SAMPLE; k++) {
      const i = sidx[k], x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], w = m[3] * x + m[7] * y + m[11] * z + m[15]; if (w <= 0) continue;
      const sx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w, sy = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w; if (sx > -1 && sx < 1 && sy > -1 && sy < 1) c++;
    }
    return Math.round(c / SAMPLE * N);
  }
  setInterval(() => emit('view', countInView()), 1000);

  // 호버·클릭
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); let mx = 0, my = 0, movedAt = 0, pending = false;
  const pick = () => {ray.params.Points.threshold = Math.max(1, cam.position.distanceTo(ctl.target) / 450); ray.setFromCamera(mouse, cam); const h = ray.intersectObject(stars)[0]; return h ? h.index : -1;};
  const setMouse = e => {mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); mx = e.clientX; my = e.clientY;};
  el.addEventListener('pointermove', e => {if (e.pointerType !== 'mouse') return; setMouse(e); movedAt = performance.now(); pending = true; emit('hover', null);});
  el.addEventListener('pointerleave', () => {pending = false; emit('hover', null);});
  let down; el.addEventListener('pointerdown', e => {down = [e.clientX, e.clientY];});
  el.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; setMouse(e);
    const si = pickSat(); if (si >= 0) {focusSat(sats[si]); emit('sat', sats[si]); return;}
    const i = pick(); if (i >= 0) emit('select', i);
  });

  function focusStar(i, links, keep) {
    const p = P(i); pathRun = null; if (!keep) {picks.visible = false; if (sphere.visible) hideSphere();}
    mark.geometry.attributes.position.array.set([p.x, p.y, p.z]); mark.geometry.attributes.position.needsUpdate = true; mark.visible = true; flyCam(p);
    if (links) {
      const d = links.map(j => p.distanceTo(P(j))), rank = d.map((_, k) => k).sort((x, y) => d[x] - d[y]), far = new Array(links.length);
      rank.forEach((k, r) => {far[k] = links.length > 1 ? (r / (links.length - 1)) ** 3 : 0;});
      arcs(links.map(j => [i, j]), far);
    }
  }
  function clearFocus() {mark.visible = false; for (const k of ['position', 'aT', 'aFar']) lineGeo.deleteAttribute(k);}
  // 위키레이스 경로: 곡선을 잇고 카메라가 한 칸씩 날아간다
  function showPath(path) {
    if (sphere.visible) hideSphere(); picks.visible = false;
    arcs(path.slice(1).map((j, k) => [path[k], j]), path.slice(1).map(() => 1));
    const pp = new Float32Array(path.length * 3), pc = new Float32Array(path.length * 3), ps = new Float32Array(path.length).fill(20);
    path.forEach((j, k) => {pp.set([pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]], k * 3); pc.set(BRASS, k * 3);});
    setPoints(picks, pp, pc, ps); picks.visible = true; mark.visible = false;
    let k = 0; const me = {}; pathRun = me;
    const step = () => {if (pathRun !== me || k >= path.length) return; flyCam(P(path[k])); emit('pathStep', k); k++; setTimeout(step, still ? 0 : 1700);};
    step();
  }
  let pathRun = null;

  // ── 3D 구 선택
  const sphere = new THREE.Group(); sphere.visible = false; scene.add(sphere);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.ShaderMaterial({transparent: true, depthWrite: false,
    uniforms: {uC: {value: new THREE.Color('#E9E4D8')}, uHot: {value: 0}},
    vertexShader: `varying vec3 vN;varying vec3 vV;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vN;varying vec3 vV;uniform vec3 uC;uniform float uHot;void main(){float r=1.-abs(dot(vN,vV));gl_FragColor=vec4(uC,pow(r,3.)*(.45+.25*uHot)+.025);}`}));
  sphere.add(shell);
  const ringMat = new THREE.LineBasicMaterial({color: '#B8A27A', transparent: true, opacity: 0.85, depthWrite: false});
  const circle = () => {const p = []; for (let a = 0; a <= 96; a++) {const t = a / 96 * Math.PI * 2; p.push(new THREE.Vector3(Math.cos(t), 0, Math.sin(t)));} return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(p), ringMat);};
  sphere.add(circle()); const mer = circle(); mer.rotation.x = Math.PI / 2; sphere.add(mer);
  let R = 70, inSphere = [], selMs = 0;
  const setR = r => {R = Math.max(6, Math.min(600, r)); sphere.scale.setScalar(R); emit('radius', Math.round(R));};
  setR(R);
  function sphereSelect() {
    const c = sphere.position, r2 = R * R, t0 = performance.now(), out = [];
    for (let i = 0; i < N; i++) {const dx = pos[i * 3] - c.x, dy = pos[i * 3 + 1] - c.y, dz = pos[i * 3 + 2] - c.z; if (dx * dx + dy * dy + dz * dz <= r2) out.push(i);}
    out.sort((a, b) => kA[b] - kA[a]); inSphere = out; selMs = performance.now() - t0;
    const n = Math.min(out.length, 3000), pp = new Float32Array(n * 3), pc = new Float32Array(n * 3), ps = new Float32Array(n);
    for (let k = 0; k < n; k++) {const j = out[k]; pp.set([pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]], k * 3); pc.set(BRASS, k * 3); ps[k] = k < 40 ? 16 : 7;}
    setPoints(picks, pp, pc, ps); picks.visible = n > 0;
    emit('sphere', {ids: out, ms: selMs, R: Math.round(R)});
  }
  let selTimer = 0, setTimer = 0;
  const selSoon = () => {clearTimeout(selTimer); selTimer = setTimeout(sphereSelect, 90); clearTimeout(setTimer); setTimer = setTimeout(() => {if (!drag) settle();}, 450);};
  // 구 중심에 가까운 순 k개
  const nearest = k => {const c = sphere.position; return inSphere.slice(0, 20000).map(i => [i, (pos[i * 3] - c.x) ** 2 + (pos[i * 3 + 1] - c.y) ** 2 + (pos[i * 3 + 2] - c.z) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, k).map(a => a[0]);};
  function showSphere() {sphere.position.copy(ctl.target); sphere.visible = true; clearFocus(); sphereSelect(); settle();}
  function hideSphere() {sphere.visible = false; con.visible = false; picks.visible = false; inSphere = []; emit('sphere', null);}
  const hitSphere = () => {ray.setFromCamera(mouse, cam); return sphere.visible ? ray.intersectObject(shell)[0] : null;};
  let drag = null; const plane = new THREE.Plane(), tmp = new THREE.Vector3();
  el.addEventListener('pointerdown', e => {
    setMouse(e); if (!hitSphere()) return; e.stopPropagation(); ctl.enabled = false;
    plane.setFromNormalAndCoplanarPoint(cam.getWorldDirection(tmp).clone(), sphere.position); ray.ray.intersectPlane(plane, tmp);
    drag = {off: sphere.position.clone().sub(tmp)}; down = null; el.setPointerCapture(e.pointerId);
  }, true);
  el.addEventListener('pointermove', e => {
    setMouse(e);
    if (!drag) {if (sphere.visible) {const h = !!hitSphere(); shell.material.uniforms.uHot.value = h ? 1 : 0; el.style.cursor = h ? 'move' : '';} return;}
    ray.setFromCamera(mouse, cam); if (ray.ray.intersectPlane(plane, tmp)) {sphere.position.copy(tmp.add(drag.off)); selSoon();}
  });
  el.addEventListener('pointerup', () => {if (!drag) return; drag = null; ctl.enabled = true; sphereSelect(); settle();});
  el.addEventListener('wheel', e => {if (!sphere.visible) return; setMouse(e); if (!hitSphere()) return; e.preventDefault(); e.stopPropagation(); setR(R * Math.exp(e.deltaY * 0.0015)); selSoon();}, {capture: true, passive: false});

  // 파문 + 별 떠오름 + 성좌선
  const ripple = circle(); ripple.material = ringMat.clone(); ripple.visible = false; scene.add(ripple);
  const conMat = new THREE.ShaderMaterial({transparent: true, depthWrite: false, uniforms: {uP: {value: 0}, uC: {value: new THREE.Color('#E9E4D8')}},
    vertexShader: `attribute float aT;varying float vT;void main(){vT=aT;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying float vT;uniform float uP;uniform vec3 uC;void main(){if(vT>uP)discard;gl_FragColor=vec4(uC,.5);}`});
  const con = new THREE.LineSegments(new THREE.BufferGeometry(), conMat); scene.add(con); let conReq = 0;
  async function settle() {
    if (!sphere.visible) return;
    ripple.position.copy(sphere.position); ripple.quaternion.copy(cam.quaternion); ripple.rotateX(Math.PI / 2); ripple.visible = true;
    tween(900, e => {ripple.scale.setScalar(R * (1 + 0.7 * e)); ripple.material.opacity = 0.85 * (1 - e);}, () => {ripple.visible = false;});
    tween(800, e => {picks.material.uniforms.uLift.value = 0.9 * (1 - e);});
    const ids = inSphere.slice(0, 40), me = ++conReq; con.visible = false; if (ids.length < 2) return;
    try {
      const {pairs} = await getSub(ids); if (me !== conReq || !sphere.visible) return;
      const Pp = new Float32Array(pairs.length * 6), T = new Float32Array(pairs.length * 2);
      pairs.forEach(([a, b], k) => {Pp.set([pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2], pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]], k * 6); T[k * 2 + 1] = 1;});
      con.geometry.setAttribute('position', new THREE.BufferAttribute(Pp, 3)); con.geometry.setAttribute('aT', new THREE.BufferAttribute(T, 1));
      con.geometry.computeBoundingSphere(); con.visible = true; tween(1100, e => {conMat.uniforms.uP.value = e;});
    } catch { /* 성좌선은 장식: 실패해도 선택은 그대로 */ }
  }

  // ── 위성: 같은 e5 공간의 최근접 위키 문서 근처에 Adam으로 배치, 24시간 반감기
  const satLayer = points(new Float32Array(3), new Float32Array(3), new Float32Array(1), 230 * PR, 0); satLayer.visible = false; scene.add(satLayer);
  let engine = null, sats = []; const satPos = new Map();
  function setSats(list, calib, serverNow) {
    engine ??= new SatellitePlacementEngine(calib);
    const skew = Date.now() / 1000 - serverNow;
    for (const s of list) {
      const key = s.id + ':' + s.neighbors[0]?.i; // 다시 연결되면 위치도 다시 계산
      if (satPos.has(key)) continue;
      const nb = s.neighbors.map(n => ({sim: n.sim, position: P(n.i)}));
      satPos.set(key, engine.place(s.id, nb, nb[0], nb.slice(1), (s.born + skew) * 1000).position);
    }
    sats = list; drawSats();
  }
  function drawSats() {
    const now = Date.now(), n = sats.length; if (!n) {satLayer.visible = false; return;}
    const pp = new Float32Array(n * 3), pc = new Float32Array(n * 3), ps = new Float32Array(n).fill(22);
    sats.forEach((s, k) => {
      const p = satPos.get(s.id + ':' + s.neighbors[0]?.i), a = Math.max(0.05, Math.exp(-0.693 * ((now - s.born * 1000) / 3.6e6) / 24)) * 1.6, c = KIND_RGB[s.kind] || KIND_RGB.news;
      pp.set([p.x, p.y, p.z], k * 3); pc.set([c[0] * a, c[1] * a, c[2] * a], k * 3);
    });
    setPoints(satLayer, pp, pc, ps); satLayer.visible = true;
  }
  setInterval(drawSats, 30000);
  const pickSat = () => {if (!satLayer.visible) return -1; ray.params.Points.threshold = Math.max(2, cam.position.distanceTo(ctl.target) / 220); ray.setFromCamera(mouse, cam); const h = ray.intersectObject(satLayer)[0]; return h ? h.index : -1;};
  const focusSat = s => {const p = satPos.get(s.id + ':' + s.neighbors[0]?.i); if (p) flyCam(p); clearFocus();};

  addEventListener('resize', () => {renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); buildRing();});
  let lastAz = null, active = true;
  (function loop() {
    requestAnimationFrame(loop); if (!active) return; // 세계 창일 때는 그리지 않는다(8GB 메모리·GPU)
    const now = performance.now(); for (const f of tweens) if (f(now)) tweens.delete(f);
    stars.material.uniforms.uFocus.value = cam.position.distanceTo(ctl.target); arcMat.uniforms.uTime.value = still ? 0 : now / 1000;
    if (pending && now - movedAt > 90) {pending = false; if (!drag) {const i = pick(); emit('hover', i >= 0 ? {i, x: mx, y: my} : null);}} // 마우스가 멈췄을 때만 77만 개 판정
    ctl.update(); const az = ctl.getAzimuthalAngle(); if (az !== lastAz && rot) {lastAz = az; rot.setAttribute('transform', `rotate(${-az * 180 / Math.PI})`);}
    renderer.render(scene, cam);
  })();

  return {
    N, kA, focusStar, clearFocus, showPath, showSphere, hideSphere, setR, nearest, setSats, focusSat,
    get inSphere() {return inSphere;},
    get sphereOn() {return sphere.visible;},
    toggleDistricts: () => {districts.visible = !districts.visible; return districts.visible;},
    flyTo: i => flyCam(P(i)),
    setActive: on => {active = on; ringSvg.style.display = on ? '' : 'none'; if (on) {renderer.setSize(innerWidth, innerHeight); buildRing();}},
  };
}
