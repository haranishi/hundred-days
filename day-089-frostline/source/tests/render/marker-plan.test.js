import { describe, it, expect } from 'vitest';
import { markerPlan } from '../../src/render/objects/marker-plan.js';

const flatWorld = (meta = {}, drops = []) => ({ meta, drops, sampleSurface(x, z, out) { out.h = 0; out.nx = 0; out.ny = 1; out.nz = 0; return out; } });

describe('目印の置き場所', () => {
  it('駅も仕掛けも無い古い山でも、出発地点の門だけを置く', () => {
    const plan = markerPlan(flatWorld({}, [{ id: 'a', x: 10, z: 20, heading: 0 }]));
    expect(plan.poles).toHaveLength(2); expect(plan.flags).toHaveLength(2);
    expect(plan.lines).toHaveLength(0); expect(plan.banners).toHaveLength(0);
    // 門は、進む向き（北＝−Z）の左右に開く
    expect(plan.poles[0].z).toBeCloseTo(20); expect(plan.poles[1].z).toBeCloseTo(20);
    expect(plan.poles[1].x - plan.poles[0].x).toBeCloseTo(5.6);
  });
  it('ジャンプ台には、踏み切りの帯・助走のわきの線・着地の目安と、幅の外側の旗を置く', () => {
    const plan = markerPlan(flatWorld({ features: [{ id: 'k', kind: 'kicker', x: 0, z: 0, heading: Math.PI / 2, width: 16, length: 30, speed: [10, 14], air: [0.6, 1.0] }] }));
    // 踏み切りの帯：縁のすぐ手前（東向きなので、X が少し負）に、台の幅より少し狭く
    const lip = plan.lines.filter(l => l.width > 10 && l.depth < 2);
    expect(lip).toHaveLength(1); expect(lip[0].width).toBeLessThan(16); expect(lip[0].x).toBeLessThan(0); expect(lip[0].x).toBeGreaterThan(-2);
    // 踏み切りの面：縁の手前に、奥行き 6 m ほどの薄い青の面（帯とは重ならない）
    const face = plan.lines.filter(l => l.width > 10 && l.depth > 5);
    expect(face).toHaveLength(1); expect(face[0].x + face[0].depth / 2).toBeLessThanOrEqual(lip[0].x - lip[0].depth / 2 + 1e-9); expect(face[0].color).not.toBe(lip[0].color);
    // 助走のわきの線は、台の幅の内側の両わきに、縁の手前だけ
    const side = plan.lines.filter(l => l.width < 1);
    expect(side.length).toBeGreaterThanOrEqual(4);
    for (const l of side) { expect(l.x).toBeLessThan(0); expect(Math.abs(l.z)).toBeLessThan(8); expect(Math.abs(l.z)).toBeGreaterThan(6); }
    // 着地の目安：縁の先（速さの中央 12 m/s × 滞空の中央 0.8 秒 ＝ 9.6 m）に、破線と旗
    const landing = plan.lines.filter(l => l.x > 5);
    expect(landing.length).toBeGreaterThanOrEqual(3);
    for (const l of landing) expect(l.x).toBeCloseTo(9.6, 5);
    expect(plan.poles.filter(p => Math.abs(p.x - 9.6) < 1e-6)).toHaveLength(2);
    // 旗の柱は、台の幅（±8 m）の外。向きは東なので、左右は Z の方向
    const lipPoles = plan.poles.filter(p => Math.abs(p.x) < 1e-6);
    expect(lipPoles).toHaveLength(2);
    for (const p of lipPoles) expect(Math.abs(p.z)).toBeGreaterThan(8);
  });
  it('崖の縁と駅にも目印を置き、座標が壊れた項目は飛ばす', () => {
    const plan = markerPlan(flatWorld({
      features: [{ id: 'c', kind: 'cliff', x: 5, z: 5, heading: 0, width: 20 }, { id: 'bad', kind: 'cliff', x: NaN, z: 0 }, { id: 'p', kind: 'pipe', x: 1, z: 1 }],
      stations: [{ id: 's', name: '東の駅', x: 100, z: 100, radius: 25 }, { id: 'bad', x: 0 }],
    }));
    expect(plan.banners).toHaveLength(1);
    expect(plan.poles.length).toBe(2 + 2 + 2 + 2); // 崖の縁の 2 本・崖の 10 m 手前の 2 本・駅の門の 2 本・駅の手前の 2 本
    // 崖の縁の 6 m 手前（北向きなので、Z が大きい側）に、橙の破線（幅 20 m ぶん）
    expect(plan.lines.length).toBeGreaterThanOrEqual(5);
    for (const l of plan.lines) { expect(l.z).toBeCloseTo(5 + 6, 5); expect(Math.abs(l.x - 5)).toBeLessThan(10); }
    for (const p of plan.poles) { expect(Number.isFinite(p.x)).toBe(true); expect(Number.isFinite(p.z)).toBe(true); }
  });
});
