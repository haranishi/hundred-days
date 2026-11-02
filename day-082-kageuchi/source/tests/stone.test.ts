// OWNER: core
// 小石：Q を押している間は狙い（3〜14m に切り詰め）、離すと投げる。着地点で半径 9m の音。番兵は着地点を調べに行く。
import { describe, expect, it } from 'vitest';
import { STONE } from '../src/config/rules';
import { idleInput } from '../src/sim/types';
import { makeSim, postGuard, seconds, stageWithGuards, stepN } from './helpers';

describe('小石', () => {
  it('投げた小石の着地点へ番兵が歩いて行き、プレイヤーへの不審は溜めない', () => {
    const sim = makeSim({}, stageWithGuards([postGuard('g', -20, 8, 0)]));
    sim.teleport(-30, 4);
    const target = { x: -20, z: 4 };
    stepN(sim, 5, { ...idleInput(0), aim: true, aimPoint: target });
    expect(sim.player.aim).toMatchObject({ x: -20, z: 4, valid: true });
    const ev = stepN(sim, 1, idleInput(0));
    expect(ev.some((e) => e.type === 'stoneThrown')).toBe(true);
    expect(sim.player.stones).toBe(STONE.count - 1);
    expect(sim.stats.stonesUsed).toBe(1);
    const ev2 = stepN(sim, seconds(0.7));
    const land = ev2.find((e) => e.type === 'stoneLanded');
    expect(land).toBeDefined();
    expect(land!.t - ev.find((e) => e.type === 'stoneThrown')!.t).toBeCloseTo(STONE.flightTime, 1);
    const g = sim.byId.get('g')!;
    expect(g.mode).toBe('investigate');
    expect(g.s).toBe(0);
    stepN(sim, seconds(3.5));
    expect(Math.hypot(g.x - target.x, g.z - target.z)).toBeLessThan(0.4);
  });

  it('狙いは 3〜14m に切り詰める', () => {
    const sim = makeSim({}, stageWithGuards([]));
    sim.teleport(-20, 8);
    stepN(sim, 1, { ...idleInput(0), aim: true, aimPoint: { x: -19, z: 8 } });
    expect(sim.player.aim!.x).toBeCloseTo(-17, 6);
    stepN(sim, 1, { ...idleInput(0), aim: true, aimPoint: { x: 10, z: 8 } });
    expect(sim.player.aim!.x).toBeCloseTo(-6, 6);
  });

  it('本堂（高い屋根）越しには投げられない。塀越しには投げられる', () => {
    const sim = makeSim({}, stageWithGuards([]));
    sim.teleport(-14, 0);
    stepN(sim, 1, { ...idleInput(0), aim: true, aimPoint: { x: -2, z: 0 } });
    expect(sim.player.aim!.valid).toBe(false);
    sim.teleport(-14, 33);
    stepN(sim, 1, { ...idleInput(0), aim: true, aimPoint: { x: -14, z: 26 } });
    expect(sim.player.aim!.valid).toBe(true);
  });

  it('狙いの最中に取り消す（右クリックか Esc）と、Q を離しても投げない。離すまで狙い直さず、押し直せばまた狙える', () => {
    // r03-fix-play：体験の採点「Q を離すと必ず投げ、構え直すための取り消しがない（1 個失った）」
    const sim = makeSim({}, stageWithGuards([]));
    sim.teleport(-30, 4);
    const aimAt = { ...idleInput(0), aim: true, aimPoint: { x: -20, z: 4 } };
    stepN(sim, 5, aimAt);
    expect(sim.player.aiming).toBe(true);
    // Q を押したまま取り消す
    stepN(sim, 1, { ...aimAt, cancelAim: true });
    expect(sim.player.aiming).toBe(false);
    expect(sim.player.aim).toBeNull();
    // まだ Q を押している間は狙わない
    stepN(sim, 10, aimAt);
    expect(sim.player.aiming).toBe(false);
    expect(sim.snapshot().aim).toBeNull();
    // 離しても投げない
    const ev = stepN(sim, seconds(1), idleInput(0));
    expect(ev.some((e) => e.type === 'stoneThrown')).toBe(false);
    expect(sim.player.stones).toBe(STONE.count);
    expect(sim.stats.stonesUsed).toBe(0);
    // 押し直すとまた狙え、離せば投げる
    stepN(sim, 3, aimAt);
    expect(sim.player.aiming).toBe(true);
    expect(stepN(sim, 1, idleInput(0)).some((e) => e.type === 'stoneThrown')).toBe(true);
    expect(sim.player.stones).toBe(STONE.count - 1);
  });

  it('Q を離すのと同じ刻みで取り消しても、投げない', () => {
    const sim = makeSim({}, stageWithGuards([]));
    sim.teleport(-30, 4);
    stepN(sim, 5, { ...idleInput(0), aim: true, aimPoint: { x: -20, z: 4 } });
    const ev = stepN(sim, 1, { ...idleInput(0), cancelAim: true });
    expect(ev.some((e) => e.type === 'stoneThrown')).toBe(false);
    expect(sim.player.stones).toBe(STONE.count);
  });

  it('狙いが届かない位置で離しても投げない', () => {
    const sim = makeSim({}, stageWithGuards([]));
    sim.teleport(-14, 0);
    stepN(sim, 3, { ...idleInput(0), aim: true, aimPoint: { x: -2, z: 0 } });
    const ev = stepN(sim, 1, idleInput(0));
    expect(ev.some((e) => e.type === 'stoneThrown')).toBe(false);
    expect(sim.player.stones).toBe(STONE.count);
  });
});
