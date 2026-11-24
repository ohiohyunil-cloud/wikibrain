// 위성 1개 위치 최적화: 목표거리 제약 + 힌지 반발, Multi-Start Adam (설계서 v2 Phase 1)
// 상대 경로 import: 브라우저(/vendor/...)와 node 테스트 양쪽에서 빌드 없이 동작
import { Vector3 } from '../../../vendor/three/build/three.module.js';

export class AdamSpatialOptimizer {
  constructor(lrMax, lrMin, dMin, wRep = 2.0) {
    this.lrMax = lrMax; this.lrMin = lrMin; this.dMin = dMin; this.wRep = wRep;
    this.beta1 = 0.9; this.beta2 = 0.999; this.eps = 1e-8;
    this.m = new Vector3(); this.v = new Vector3(); this.t = 0;
  }

  lr(step, total) {
    return this.lrMin + 0.5 * (this.lrMax - this.lrMin) * (1 + Math.cos((Math.PI * step) / total));
  }

  gradient(p, cs, rs) {
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

  step(p, cs, rs, i, total) {
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

  loss(p, cs, rs) {
    let L = 0;
    for (const c of cs) L += c.weight * (p.distanceTo(c.position) - c.targetDistance) ** 2;
    for (const r of rs) L += this.wRep * Math.max(0, this.dMin - p.distanceTo(r.position)) ** 2;
    return L;
  }

  // guard: 후처리 겹침 검사 대상(기본 rs). 이완 중 이동으로 rs 밖 위성과 겹칠 수 있어 호출부가 전체를 넘긴다
  relaxWithMultiStart(init, cs, rs, steps = 60, restarts = 3, jitter = 1, guard = rs) {
    let best = init.clone(), bestL = Infinity;
    for (let r = 0; r < restarts; r++) {
      let p = r === 0 ? init.clone() : init.clone().add(new Vector3(
        (Math.random() - .5) * jitter, (Math.random() - .5) * jitter * .5, (Math.random() - .5) * jitter));
      this.m.set(0, 0, 0); this.v.set(0, 0, 0); this.t = 0;
      for (let i = 0; i < steps; i++) p = this.step(p, cs, rs, i, steps);
      const L = this.loss(p, cs, rs);
      if (L < bestL) { bestL = L; best = p; }
    }
    // 후처리: 남은 겹침 밀어내기 (M-3 보장). 한 번 밀면 다른 위성과 새로 겹칠 수 있어 수렴까지 반복
    for (let pass = 0; pass < 10; pass++) {
      let moved = false;
      for (const r of guard) {
        const d = best.distanceTo(r.position);
        if (d < this.dMin) {
          const dir = d > 1e-9 ? best.clone().sub(r.position).normalize() : new Vector3(1, 0, 0);
          best.addScaledVector(dir, this.dMin - d + 1e-3); moved = true;
        }
      }
      if (!moved) break;
    }
    return { position: best, stress: this.stress(best, cs) };
  }

  stress(p, cs) { // 분모 = 목표거리
    let num = 0, den = 0;
    for (const c of cs) { num += (p.distanceTo(c.position) - c.targetDistance) ** 2; den += c.targetDistance ** 2; }
    return Math.sqrt(num / (den || 1e-8));
  }
}
