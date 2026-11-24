// 세계 창: three.js 지구본(국경선 + 경위선) 위에 GDELT 주요 사건 점. 별지도와 같은 돌·놋쇠 톤.
// 지역 고르기: 지구본 위를 드래그하면 대권 거리 원으로 사건을 고른다(별지도의 구 선택과 같은 역할).
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {feature, mesh} from 'topojson-client';
import world from 'world-atlas/countries-110m.json';

const R = 200;
export const EVENT_RGB = {economy: [0.85, 0.72, 0.42], politics: [0.62, 0.78, 0.95], conflict: [0.95, 0.42, 0.36]};
const v3 = (lat, lon, r = R) => {const a = lat * Math.PI / 180, b = -lon * Math.PI / 180; return new THREE.Vector3(r * Math.cos(a) * Math.cos(b), r * Math.sin(a), r * Math.cos(a) * Math.sin(b));};
const toLatLon = p => {const n = p.clone().normalize(); return [Math.asin(n.y) * 180 / Math.PI, -Math.atan2(n.z, n.x) * 180 / Math.PI];};
export const gcDeg = (a, b) => {const r = Math.PI / 180, s = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2; return 2 * Math.asin(Math.min(1, Math.sqrt(s))) / r;};

export function createGlobe(el, emit) {
  const PR = Math.min(devicePixelRatio, 2), still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({antialias: true}); renderer.setPixelRatio(PR); renderer.setSize(el.clientWidth, el.clientHeight); el.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#0E0F11');
  const cam = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 1, 5000); cam.position.copy(v3(30, 127, 640)); // 처음엔 동아시아
  const ctl = new OrbitControls(cam, renderer.domElement); ctl.enableDamping = true; ctl.enablePan = false; ctl.minDistance = 260; ctl.maxDistance = 1400;
  ctl.autoRotate = !still; ctl.autoRotateSpeed = 0.25; ctl.addEventListener('start', () => {ctl.autoRotate = false;});

  // 바다: 가장자리가 밝은 돌 구
  const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vN;varying vec3 vV;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vN;varying vec3 vV;void main(){float r=1.-max(dot(vN,vV),0.);gl_FragColor=vec4(vec3(.055,.06,.068)+vec3(.72,.63,.48)*pow(r,4.)*.35,1.);}`}));
  scene.add(earth);
  const lines = (segs, color, opacity) => {const g = new THREE.BufferGeometry().setFromPoints(segs); const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({color, transparent: true, opacity})); scene.add(l); return l;};
  const ring = (pts, out) => {for (let k = 1; k < pts.length; k++) out.push(v3(pts[k - 1][1], pts[k - 1][0], R + 0.3), v3(pts[k][1], pts[k][0], R + 0.3));};
  const border = [], coast = [];
  for (const line of mesh(world, world.objects.countries, (a, b) => a !== b).coordinates) ring(line, border);
  for (const line of mesh(world, world.objects.countries, (a, b) => a === b).coordinates) ring(line, coast);
  lines(coast, '#E9E4D8', 0.55); lines(border, '#A7B1B8', 0.28);
  const grat = [];
  for (let lat = -60; lat <= 60; lat += 30) for (let lon = -180; lon < 180; lon += 4) grat.push(v3(lat, lon, R + 0.1), v3(lat, lon + 4, R + 0.1));
  for (let lon = -180; lon < 180; lon += 30) for (let lat = -84; lat < 84; lat += 4) grat.push(v3(lat, lon, R + 0.1), v3(lat + 4, lon, R + 0.1));
  lines(grat, '#B8A27A', 0.08);
  const countries = feature(world, world.objects.countries).features.map(f => f.properties.name);

  // 사건 점: 크기=점수, 색=분류, 뒷면은 지구가 가린다(depthTest)
  const dots = new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {uScale: {value: 230 * PR}, uTime: {value: 0}},
    vertexShader: `attribute vec3 aColor;attribute float aSize;attribute float aSel;varying vec3 vC;varying float vSel;uniform float uScale;uniform float uTime;
      void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vC=aColor;vSel=aSel;gl_PointSize=aSize*uScale/-mv.z*(1.+.25*aSel*sin(uTime*3.));gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vC;varying float vSel;void main(){float d=length(gl_PointCoord-.5);float c=1.-smoothstep(.12,.3,d);float h=(1.-smoothstep(.3,.5,d))*.35;gl_FragColor=vec4(vC*(c+h)*(1.+vSel),c+h);}`}));
  scene.add(dots);
  let events = [], sel = new Set();
  function setEvents(list) {
    events = list; const n = list.length, P = new Float32Array(n * 3), C = new Float32Array(n * 3), S = new Float32Array(n), A = new Float32Array(n);
    const top = Math.max(1, ...list.map(e => e.score));
    list.forEach((e, k) => {const p = v3(e.lat, e.lon, R + 1); P.set([p.x, p.y, p.z], k * 3); C.set(EVENT_RGB[e.kind] || EVENT_RGB.politics, k * 3); S[k] = 7 + 16 * Math.sqrt(e.score / top);});
    const g = dots.geometry; g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(C, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(S, 1)); g.setAttribute('aSel', new THREE.BufferAttribute(A, 1)); g.computeBoundingSphere(); markSel();
  }
  function markSel() {const a = dots.geometry.attributes.aSel; if (!a) return; for (let k = 0; k < events.length; k++) a.array[k] = sel.has(k) ? 1 : 0; a.needsUpdate = true;}

  // 지역 원: 지표면에 붙은 원 테두리
  const regionMat = new THREE.LineBasicMaterial({color: '#B8A27A', transparent: true, opacity: 0.9});
  const region = new THREE.LineLoop(new THREE.BufferGeometry(), regionMat); region.visible = false; scene.add(region);
  function drawRegion(c, deg) {
    const n = v3(c[0], c[1]).normalize(), u = new THREE.Vector3(0, 1, 0).cross(n).normalize(), w = n.clone().cross(u), a = deg * Math.PI / 180, pts = [];
    for (let k = 0; k <= 96; k++) {const t = k / 96 * Math.PI * 2; pts.push(n.clone().multiplyScalar(Math.cos(a)).addScaledVector(u.clone().multiplyScalar(Math.cos(t)).addScaledVector(w, Math.sin(t)), Math.sin(a)).multiplyScalar(R + 1.5));}
    region.geometry.setFromPoints(pts); region.visible = true;
  }

  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  const setMouse = e => {const b = el.getBoundingClientRect(); mouse.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1);};
  const surface = () => {ray.setFromCamera(mouse, cam); const h = ray.intersectObject(earth)[0]; return h ? toLatLon(h.point) : null;};
  const pickDot = () => {
    ray.params.Points.threshold = cam.position.length() / 160; ray.setFromCamera(mouse, cam);
    const front = ray.intersectObject(earth)[0]?.distance ?? Infinity;
    const h = ray.intersectObject(dots).filter(h => h.distance < front + 2)[0]; return h ? h.index : -1;
  };
  let drag = null, down = null;
  el.addEventListener('pointerdown', e => {
    setMouse(e); down = [e.clientX, e.clientY];
    if (!e.shiftKey && !regionMode) return; const c = surface(); if (!c) return;
    e.stopPropagation(); ctl.enabled = false; drag = {c}; el.setPointerCapture(e.pointerId);
  }, true);
  el.addEventListener('pointermove', e => {
    setMouse(e); if (!drag) return; const p = surface(); if (!p) return;
    drag.deg = Math.max(1, gcDeg(drag.c, p)); drawRegion(drag.c, drag.deg);
  });
  el.addEventListener('pointerup', e => {
    if (drag) {const d = drag; drag = null; ctl.enabled = true; if (d.deg) selectRegion(d.c, d.deg); return;}
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; setMouse(e);
    const k = pickDot(); if (k >= 0) {sel = new Set([k]); markSel(); emit('event', events[k]);}
  });
  let regionMode = false;
  function selectRegion(c, deg) {
    const ids = []; events.forEach((e, k) => {if (gcDeg(c, [e.lat, e.lon]) <= deg) ids.push(k);});
    sel = new Set(ids); markSel(); emit('region', {center: c, deg: Math.round(deg), events: ids.map(k => events[k])});
  }
  function clearRegion() {region.visible = false; sel = new Set(); markSel();}

  let active = true, raf = 0;
  const onResize = () => {renderer.setSize(el.clientWidth, el.clientHeight); cam.aspect = el.clientWidth / el.clientHeight; cam.updateProjectionMatrix();};
  addEventListener('resize', onResize);
  (function loop(now) {
    raf = requestAnimationFrame(loop); if (!active) return;
    dots.material.uniforms.uTime.value = still ? 0 : now / 1000; ctl.update(); renderer.render(scene, cam);
  })(0);
  return {
    setEvents, clearRegion, countries,
    setActive: on => {active = on; if (on) onResize();},
    setRegionMode: on => {regionMode = on; ctl.enableRotate = !on;},
    flyTo: (lat, lon) => {ctl.autoRotate = false; const d = cam.position.length(), c0 = cam.position.clone(), c1 = v3(lat, lon, d), t0 = performance.now();
      const step = () => {const t = Math.min(1, (performance.now() - t0) / 1200), e = 1 - Math.pow(2, -10 * t); cam.position.copy(c0.clone().lerp(c1, e).setLength(d)); if (t < 1) requestAnimationFrame(step);}; still ? cam.position.copy(c1) : step();},
    dispose: () => {cancelAnimationFrame(raf); removeEventListener('resize', onResize); renderer.dispose(); el.removeChild(renderer.domElement);},
  };
}

// 자기 점검: 서울-도쿄 대권 거리 약 10.4도(1150km)
console.assert(Math.abs(gcDeg([37.57, 126.98], [35.68, 139.69]) - 10.4) < 0.3, 'gcDeg');
