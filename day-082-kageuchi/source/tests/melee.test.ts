// OWNER: core
import { describe, expect, it } from 'vitest';
import { MELEE, NOISE } from '../src/config/rules';
import { idleInput } from '../src/sim/types';
import { HONNOJI, makeSim, postGuard, seconds, stepN } from './helpers';

function arena(wall = false, distance = 1.2) {
  return makeSim({ oblivious: true }, {
    ...HONNOJI, interactions: [], buildings: [], props: [], ponds: [],
    walls: wall ? [{ id: 'wall', kind: 'itabei', a: { x: 0.6, z: -5 }, b: { x: 0.6, z: 5 }, thickness: 0.1, height: 2 }] : [],
    guards: [postGuard('front', distance, 0, 180)],
    player: { start: { x: 0, z: 0 }, facingDeg: 0, stones: 5 },
  });
}
const attack = { ...idleInput(), attack: true };

describe('非致死の正面近接攻撃', () => {
  it('遠い間合いから打点までに詰めるが、近い相手から後退しない', () => {
    const sim = arena(false, 1.6);
    sim.step(attack);
    stepN(sim, seconds(MELEE.hitAt) + 1);
    expect(sim.guards[0].meleeHits).toBe(1);
    expect(Math.hypot(sim.player.x - sim.guards[0].x, sim.player.z - sim.guards[0].z)).toBeCloseTo(MELEE.reach, 2);
    expect(sim.q.overlaps(sim.player.x, sim.player.z, 0.35, false)).toBe(false);
    const close = arena(false, 0.73);
    close.step(attack);
    stepN(close, seconds(MELEE.hitAt) + 1);
    expect(close.player.x).toBeGreaterThanOrEqual(0);
    expect(close.guards[0].meleeHits).toBe(1);
  });

  it('番兵は背後でなくても攻撃でき、2撃で制圧。1動作には1回だけ命中する', () => {
    const sim = arena();
    sim.step(attack);
    stepN(sim, seconds(MELEE.duration) + 1);
    expect(sim.guards[0].meleeHits).toBe(1);
    expect(sim.guards[0].down).toBe(false);
    expect(sim.guards[0].mode).toBe('stagger');
    expect(sim.snapshot().cones.some((c) => c.id === 'front')).toBe(false);
    sim.step(attack);
    stepN(sim, seconds(MELEE.duration) + 1);
    expect(sim.guards[0].meleeHits).toBe(2);
    expect(sim.guards[0].down).toBe(true);
    expect(sim.stats.takedowns).toBe(1);
    expect(sim.outcome).toBeNull();
  });

  it('連打しても動作中に次の攻撃を重ねない', () => {
    const sim = arena();
    const events = stepN(sim, 25, attack);
    expect(sim.guards[0].meleeHits).toBe(1);
    expect(events.filter((v) => v.type === 'melee' && v.stage === 'hit')).toHaveLength(1);
  });

  it('壁越しには当たらない', () => {
    const sim = arena(true);
    sim.step(attack);
    const events = stepN(sim, 35);
    expect(sim.guards[0].meleeHits).toBe(0);
    expect(events.some((v) => v.type === 'melee' && v.stage === 'miss')).toBe(true);
  });

  it('振りかぶり中に相手が間合いを離れたら空振り', () => {
    const sim = arena();
    sim.step(attack);
    sim.guards[0].x = 5;
    stepN(sim, seconds(MELEE.hitAt) + 1);
    expect(sim.guards[0].meleeHits).toBe(0);
  });

  it('攻撃音は背後の当て身より遠くへ届く', () => {
    const sim = arena();
    sim.step(attack);
    expect(sim.noises[0].radius).toBe(MELEE.noise);
    expect(MELEE.noise).toBeGreaterThan(NOISE.takedown);
  });

  it('信長は通常攻撃の対象にせず、討ち取りの勝利条件を保つ', () => {
    const sim = makeSim({ oblivious: true }, { ...HONNOJI, guards: HONNOJI.guards.filter((g) => g.role === 'target') });
    sim.teleport(3.1, -18.8);
    sim.step({ ...attack, camYaw: Math.PI });
    stepN(sim, 35);
    expect(sim.nobunaga!.meleeHits).toBe(0);
    expect(sim.outcome).toBeNull();
  });

  it('追われても槍の予告中に攻撃すれば捕まる前によろめかせられる', () => {
    const sim = arena();
    sim.opts.oblivious = false;
    sim.phase = 'alert';
    sim.guards[0].mode = 'chase';
    sim.guards[0].s = 1;
    stepN(sim, 5);
    expect(sim.outcome).toBeNull();
    expect(sim.snapshot().characters.find((c) => c.id === 'front')!.pose.action!.kind).toBe('strike');
    sim.step(attack);
    stepN(sim, seconds(MELEE.hitAt) + 1);
    expect(sim.guards[0].mode).toBe('stagger');
    expect(sim.outcome).toBeNull();
  });

  it('発見中も1撃目のよろめきが終われば追跡へ戻り、永久停止しない', () => {
    const sim = arena();
    sim.opts.god = true;
    sim.phase = 'alert';
    sim.lastSeen = { x: 0, z: 0 };
    const g = sim.guards[0];
    g.mode = 'chase';
    g.s = 1;
    sim.step(attack);
    stepN(sim, seconds(MELEE.hitAt) + 1);
    expect(g.mode).toBe('stagger');
    stepN(sim, seconds(MELEE.stagger) + 1);
    expect(g.mode).toBe('chase');
    expect(g.action).toBeNull();
    expect(g.down).toBe(false);
  });
});
