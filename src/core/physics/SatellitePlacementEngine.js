// 위성 배치: brain.bin과 같은 규칙의 초기 위치 → Adam 이완 → 24h 반감기 감쇠 (설계서 v2 Phase 1)
import { Vector3 } from '../../../vendor/three/build/three.module.js';
import { AdamSpatialOptimizer } from './AdamSpatialOptimizer.js';

export class SatellitePlacementEngine {
  // calib: data/satellite_calib.json {c,k,d_min,d_max}
  constructor(calib) {
    this.calib = calib;
    this.satellites = []; // {id, position, bornAt}
    this.opt = new AdamSpatialOptimizer(0.05 * calib.d_max, 0.0025 * calib.d_max, calib.d_min);
  }

  static calibratedDistance(sim, k) {
    const s = 1 / (1 + Math.exp(-k.k * (sim - k.c)));
    return (1 - s) * (k.d_max - k.d_min) + k.d_min;
  }
  static formatE5Passage(title, content) { return `passage: ${title} - ${content}`; }
  static formatE5Query(q) { return `query: ${q}`; }

  // hubs: 코사인 최근접 허브 [{position: Vector3, sim}] (브리지가 계산), center/stars: 중심 항성 1 + 최근접 위키 항성 8
  place(id, hubs, center, stars, now = Date.now()) {
    // 1) 초기 위치: softmax(20·sim) 가중평균 (4_brain.py 보간과 동일)
    const mx = Math.max(...hubs.map(h => h.sim));
    const w = hubs.map(h => Math.exp((h.sim - mx) * 20)), ws = w.reduce((a, b) => a + b, 0);
    const init = new Vector3();
    hubs.forEach((h, i) => init.addScaledVector(h.position, w[i] / ws));
    // 2) 제약: 중심 1.8 + 위키 항성 1.0
    const cs = [center, ...stars].map((s, i) => ({
      position: s.position, weight: i === 0 ? 1.8 : 1.0,
      targetDistance: SatellitePlacementEngine.calibratedDistance(s.sim, this.calib)
    }));
    // 3) 반발: 공간 최근접 위성 8개. shortcut: 위성 수백 개라 전수 정렬, 수천 넘으면 그리드 해시
    const rs = this.satellites.map(s => ({ position: s.position, d: s.position.distanceTo(init) }))
      .sort((a, b) => a.d - b.d).slice(0, 8);
    const r = this.opt.relaxWithMultiStart(init, cs, rs, 60, 3, this.calib.d_min, this.satellites);
    this.satellites.push({ id, position: r.position, bornAt: now });
    return r;
  }

  static alpha(bornAt, now) { return Math.exp(-0.693 * ((now - bornAt) / 3.6e6) / 24); }

  // 알파 0.05 미만 제거, 남은 위성 알파 반환
  decay(now = Date.now()) {
    this.satellites = this.satellites.filter(s => SatellitePlacementEngine.alpha(s.bornAt, now) >= 0.05);
    return this.satellites.map(s => ({ id: s.id, alpha: SatellitePlacementEngine.alpha(s.bornAt, now) }));
  }
}
