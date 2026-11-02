// OWNER: core
// 物音：足音の半径は地面の係数で変わる。壁の向こうの音は半径に 0.6 を掛ける。聞こえた番兵は調べに行き s を 0.4 まで上げる。
import { describe, expect, it } from 'vitest';
import { NOISE } from '../src/config/rules';
import { makeSim, postGuard, seconds, stageWithGuards, stepN, walkInput } from './helpers';

function footRadius(x: number, z: number, yawDeg: number, extra = {}): number {
  const sim = makeSim({}, stageWithGuards([]));
  sim.teleport(x, z);
  const ev = stepN(sim, seconds(1.5), walkInput(yawDeg, extra));
  const f = ev.find((e) => e.type === 'footstep');
  if (!f || f.type !== 'footstep') throw new Error('足音が出ない');
  return f.radius;
}

describe('物音', () => {
  it('足音の半径：歩き 2.5m × 地面の係数（白砂 1.5・石畳 0.9・苔 0.6・土 1.0）', () => {
    expect(footRadius(-20, 8, 0)).toBeCloseTo(2.5 * 1.5, 6); // 外の境内の白砂
    expect(footRadius(0, 22, 270)).toBeCloseTo(2.5 * 0.9, 6); // 表門→本堂の石畳
    expect(footRadius(-20, -22, 0)).toBeCloseTo(2.5 * 0.6, 6); // 奥の庭の苔
    expect(footRadius(-14, 37.5, 180)).toBeCloseTo(2.5 * 1.0, 6); // 南の通り（土）
  });

  it('走ると 7m、しゃがむと 0.6m（白砂の上）', () => {
    expect(footRadius(-20, 8, 0, { run: true })).toBeCloseTo(7 * 1.5, 6);
    const sim = makeSim({}, stageWithGuards([]));
    sim.teleport(-20, 8);
    sim.setCrouch(true);
    const ev = stepN(sim, seconds(1.5), walkInput(0));
    const f = ev.find((e) => e.type === 'footstep');
    expect(f && f.type === 'footstep' ? f.radius : 0).toBeCloseTo(0.6 * 1.5, 6);
  });

  it('壁の向こうの音は半径に 0.6 を掛ける（板塀を挟んで 4m・半径 5m は届かない）', () => {
    const sim = makeSim({}, stageWithGuards([postGuard('g', -20, -10, 90)]));
    sim.teleport(-40, 37);
    sim.emitNoise(-20, -14, 5, 'footstep');
    expect(sim.byId.get('g')!.mode).toBe('base');
    // 同じ距離で壁が無ければ聞こえる
    sim.emitNoise(-20, -6, 5, 'footstep');
    expect(sim.byId.get('g')!.mode).toBe('investigate');
    // 壁越しでも、半径×0.6 の内なら聞こえる
    const sim2 = makeSim({}, stageWithGuards([postGuard('g', -20, -10, 90)]));
    sim2.emitNoise(-20, -12.8, 5, 'footstep');
    expect(sim2.byId.get('g')!.mode).toBe('investigate');
  });

  it('聞こえた番兵は s を 0.4 まで上げて、音の位置を調べに行く', () => {
    const sim = makeSim({}, stageWithGuards([postGuard('g', -25, 8, 0)]));
    sim.teleport(-40, 37);
    sim.emitNoise(-25, 5, NOISE.radiusWalk * NOISE.surfaceGravel, 'footstep');
    const g = sim.byId.get('g')!;
    expect(g.s).toBeCloseTo(0.4, 10);
    expect(g.mode).toBe('investigate');
    expect(g.goal).toEqual({ x: -25, z: 5 });
    stepN(sim, seconds(3));
    expect(Math.hypot(g.x + 25, g.z - 5)).toBeLessThan(0.3);
  });

  it('小石の音は s を上げない（調べに行くだけ）', () => {
    const sim = makeSim({}, stageWithGuards([postGuard('g', -25, 8, 0)]));
    sim.teleport(-40, 37);
    sim.emitNoise(-25, 2, NOISE.stone, 'stone');
    const g = sim.byId.get('g')!;
    expect(g.s).toBe(0);
    expect(g.mode).toBe('investigate');
  });

  it('発見中は物音を無視する', () => {
    const sim = makeSim({ god: true }, stageWithGuards([postGuard('g', -25, 8, 0)]));
    sim.teleport(-40, 37);
    sim.setPhase('alert', 10);
    sim.emitNoise(-25, 4, 5, 'footstep');
    expect(sim.byId.get('g')!.mode).toBe('base');
  });
});
