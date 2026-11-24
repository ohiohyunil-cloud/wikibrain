// node src/core/physics/satellite.test.mjs [data/satellite_calib.json]  — M-2, M-3, M-4 자체 검사
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { Vector3 } from '../../../vendor/three/build/three.module.js';
import { SatellitePlacementEngine as E } from './SatellitePlacementEngine.js';

const calib = process.argv[2] ? JSON.parse(readFileSync(process.argv[2])) : { c: 0.8, k: 40, d_min: 2, d_max: 60 };
const rnd = () => new Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).multiplyScalar(2 * calib.d_max);
const sims = () => Array.from({ length: 9 }, () => calib.c + (Math.random() - .5) * 0.2);

// 일관된 장면: 목표거리를 만족하는 위치가 존재하도록 항성을 정답 주변에 배치
const truth = new Vector3(10, 0, 0);
const stars = sims().map(sim => {
  const d = E.calibratedDistance(sim, calib);
  return { sim, position: truth.clone().add(rnd().normalize().multiplyScalar(d)) };
});
const hubs = stars.map(s => ({ position: s.position, sim: s.sim }));

const eng = new E(calib);
const t0 = performance.now();
let worst = 0;
for (let i = 0; i < 10; i++) worst = Math.max(worst, eng.place(`s${i}`, hubs, stars[0], stars.slice(1)).stress);
console.log('per-place ms', ((performance.now() - t0) / 10).toFixed(2), 'first stress', eng.satellites.length && worst.toFixed(3));

// M-2: 첫 위성(반발 없음) Stress < 0.10
const solo = new E(calib).place('x', hubs, stars[0], stars.slice(1));
assert(solo.stress < 0.10, `M-2 stress ${solo.stress}`);
// M-3: 같은 항성 위성 10개, 쌍 거리 ≥ d_min
const P = eng.satellites.map(s => s.position);
for (let i = 0; i < P.length; i++) for (let j = 0; j < i; j++)
  assert(P[i].distanceTo(P[j]) >= calib.d_min - 1e-6, `M-3 ${i},${j} ${P[i].distanceTo(P[j])}`);
// M-4: 24h 알파 0.5±0.01, 알파<0.05 제거
assert(Math.abs(E.alpha(0, 24 * 3.6e6) - 0.5) < 0.01);
assert.strictEqual(eng.decay(Date.now() + 24 * 3.6e6 * 5).length, 0);
console.log('M-2 stress', solo.stress.toFixed(4), 'M-3 OK, M-4 OK');
