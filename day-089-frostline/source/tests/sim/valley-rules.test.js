import { it, expect, describe } from 'vitest';
import { createRide } from '../../src/sim/index.js';
import { createParams } from '../../src/sim/params.js';
import { landingReason, landingSoftness } from '../../src/sim/landing.js';
import { plane } from './terrains.js';

const STILL = { steer: 0, tuck: 0, brake: 0, jump: false };
/** 高さ efh ぶんの落下の速さで、雪面へまっすぐ着地させる */
function fall(terrain, efh, speed = 10) {
  const r = createRide(terrain, { params: { cdA: 0, cdATuck: 0 } });
  const snap = r.snapshot(), s = snap.state;
  s.mode = 'air'; s.pos.y = 0.001; s.leg = 0.8; s.com.y = s.pos.y + s.leg; s.vel.y = -Math.sqrt(2 * 9.81 * efh); s.vel.z = -speed; s.air.time = 0.4;
  snap.memory.takeoffSent = true; r.restore(snap); r.step(STILL, 1 / 120); return r;
}

describe('新雪の着地は、衝撃に強い', () => {
  const packed = () => plane(0, 0, { snow: { depth: 1, packed: 1, powder: 0 } });
  const powder = () => plane(0, 0, { snow: { depth: 2, packed: 0, powder: 1 } });
  it('やわらかさは、新雪の割合 × 深さ（powderDepth で頭打ち）', () => {
    const p = createParams();
    expect(landingSoftness({ powder: 0, depth: 3 }, p)).toBe(0);
    expect(landingSoftness({ powder: 1, depth: 0.3 }, p)).toBeCloseTo(0.5, 6);
    expect(landingSoftness({ powder: 0.5, depth: 5 }, p)).toBeCloseTo(0.5, 6);
    expect(landingReason(p.landingHard + 1, 0, 10, 0, p, 0)).toBe('landing-hard');
    expect(landingReason(p.landingHard + 1, 0, 10, 0, p, 1)).toBe('');
  });
  it('圧雪では転ぶ高さ（2.5 m）でも、深い新雪なら、きれいに立てる。3.3 m は、立てるが乱れる', () => {
    expect(fall(packed(), 2.5).events.find(e => e.type === 'crash')?.reason).toBe('landing-hard');
    const soft = fall(powder(), 2.5);
    expect(soft.events.find(e => e.type === 'crash')).toBeUndefined();
    expect(soft.events.find(e => e.type === 'land').quality).toBe('clean');
    const high = fall(powder(), 3.3);
    expect(high.events.find(e => e.type === 'crash')).toBeUndefined();
    expect(high.events.find(e => e.type === 'land').quality).not.toBe('clean');
  });
  it('新雪でも、高すぎれば転ぶ（5 m）。浅い新雪は助けが小さい', () => {
    expect(fall(powder(), 5).events.find(e => e.type === 'crash')?.reason).toBe('landing-hard');
    const thin = plane(0, 0, { snow: { depth: 0.1, packed: 0, powder: 1 } });
    expect(fall(thin, 2.5).events.find(e => e.type === 'crash')?.reason).toBe('landing-hard');
  });
  it('圧雪の決まりは変わらない', () => {
    expect(fall(packed(), 0.3).events.find(e => e.type === 'land').quality).toBe('clean');
    expect(fall(packed(), 1.6).events.find(e => e.type === 'crash')?.reason).toBe('landing-hard');
  });
});

describe('湖の水', () => {
  // 南（+Z）へゆるく下る氷の面。Z が 60 m を超えると水
  function lake() {
    const t = plane(4 * Math.PI / 180, Math.PI, { snow: { depth: 0.3, packed: 0, powder: 0, ice: 1 } });
    t.waterAt = (x, z) => z > 60;
    return t;
  }
  it('接地したまま水へ入ると落ち、止まったら水の外の安全な地点へ戻る', () => {
    const r = createRide(lake());
    r.reset({ x: 0, z: 0, heading: Math.PI, speed: 8 });
    let crashed = null, recovered = false;
    for (let i = 0; i < 120 * 30 && !recovered; i++) {
      r.step(STILL, 1 / 120);
      for (const e of r.events) { if (e.type === 'crash') crashed = e.reason; if (e.type === 'recover') recovered = true; }
    }
    expect(crashed).toBe('water'); expect(recovered).toBe(true);
    expect(r.state.pos.z).toBeLessThan(60 - 17); // 水から waterClear（18 m）近く離れた所
    expect(r.state.mode).not.toBe('crash'); expect(r.state.speed).toBe(0);
  });
  it('水の上を飛び越えている間は、落ちない', () => {
    const t = lake(), r = createRide(t);
    const snap = r.snapshot(), s = snap.state;
    s.mode = 'air'; s.pos.z = 70; s.pos.y = t.heightAt(0, 70) + 5; s.com.y = s.pos.y + 0.8; s.leg = 0.8; s.vel.z = 10; s.air.time = 0.3;
    r.restore(snap); r.step(STILL, 1 / 120);
    expect(r.events.find(e => e.type === 'crash')).toBeUndefined();
  });
  it('水の問い合わせが無い山（古いデータ）でも動く', () => {
    const r = createRide(plane(10 * Math.PI / 180, Math.PI));
    r.reset({ x: 0, z: 0, heading: Math.PI, speed: 5 });
    for (let i = 0; i < 240; i++) r.step(STILL, 1 / 120);
    expect(r.state.mode).toBe('carve');
  });
});

describe('建物とリフトの柱', () => {
  it.each(['building', 'tower'])('%s に速くぶつかると、その種類を理由に転ぶ', (type) => {
    const t = plane(8 * Math.PI / 180, Math.PI, { obstacles: [{ id: 'o', type, x: 0, y: -2.8, z: 20, radius: 3, height: 8 }] });
    const r = createRide(t); r.reset({ x: 0, z: 0, heading: Math.PI, speed: 10 });
    let reason = null;
    for (let i = 0; i < 600 && !reason; i++) { r.step(STILL, 1 / 120); for (const e of r.events) if (e.type === 'crash') reason = e.reason; }
    expect(reason).toBe(type);
  });
});
