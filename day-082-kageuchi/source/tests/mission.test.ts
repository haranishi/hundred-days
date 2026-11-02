// OWNER: core
import { describe, expect, it } from 'vitest';
import { INTERACTION } from '../src/config/rules';
import { nearbyInteraction } from '../src/sim/mission';
import { idleInput } from '../src/sim/types';
import { HONNOJI, makeSim, seconds, stepN, walkInput } from './helpers';

const quiet = () => makeSim({ oblivious: true }, { ...HONNOJI, guards: HONNOJI.guards.filter((g) => g.role === 'target') });
function use(sim: ReturnType<typeof quiet>, id: string) {
  const item = sim.stage.interactions!.find((v) => v.id === id)!;
  sim.teleport(item.pos.x, item.pos.z + 0.9);
  sim.step({ ...idleInput(), interact: true });
  stepN(sim, seconds(item.duration) + 1);
}

describe('攻略の段階と仕掛け', () => {
  it('外周→境内→奥庭→討ち取りが進み、引き返しても達成済みの段階は戻らない', () => {
    const sim = quiet();
    sim.step(idleInput());
    expect(sim.mission.phase).toBe(0);
    sim.teleport(-26, 22);
    sim.step(idleInput());
    expect(sim.mission.phase).toBe(1);
    sim.teleport(16, -17);
    sim.step(idleInput());
    expect(sim.mission.phase).toBe(2);
    sim.teleport(-14, 37.5);
    sim.step(idleInput());
    expect(sim.mission.phase).toBe(2);
  });

  it('板戸を開くと見た目の状態・当たり・視線・番兵の経路が同じ開放状態になる', () => {
    const sim = quiet();
    expect(sim.q.overlaps(-33, -12, 0.35, false)).toBe(true);
    expect(sim.nav.isFreeAt(-33, -12)).toBe(false);
    use(sim, 'bamboo-door');
    expect(sim.q.overlaps(-33, -12, 0.35, false)).toBe(false);
    expect(sim.q.blocked(-33, -10.9, -33, -13)).toBe(false);
    expect(sim.nav.isFreeAt(-33, -12)).toBe(true);
    expect(sim.snapshot().interactions!.find((v) => v.id === 'bamboo-door')!.used).toBe(true);
  });

  it('消灯で明るさと視界の場が暗くなり、写しに消した灯りのidを渡す', () => {
    const sim = quiet();
    const before = sim.q.brightnessAt(-2.8, -10.4, []);
    use(sim, 'lamp-center-w');
    expect(sim.q.brightnessAt(-2.8, -10.4, [])).toBeLessThan(before);
    expect(sim.snapshot().disabledLights).toContain('sl-c1');
    expect(sim.mission.message).toContain('消灯');
  });

  it('別のSimと再挑戦には消灯・板戸の状態が漏れない', () => {
    const a = quiet();
    use(a, 'lamp-center-w');
    use(a, 'bamboo-door');
    const b = quiet();
    expect(b.mission.disabledLights.size).toBe(0);
    expect(b.q.lights.find((l) => l.x === -2.8)!.intensity).toBeGreaterThan(0);
    expect(b.q.overlaps(-33, -12, 0.35, false)).toBe(true);
  });

  it('移動で作業は中断し、作業途中の効果は残らない', () => {
    const sim = quiet();
    sim.teleport(-33, -10.9);
    sim.step({ ...idleInput(), interact: true });
    stepN(sim, 20);
    expect(sim.mission.active!.elapsed).toBeGreaterThan(0);
    sim.step(walkInput(90));
    expect(sim.mission.active).toBeNull();
    expect(sim.mission.used.size).toBe(0);
    expect(sim.q.overlaps(-33, -12, 0.35, false)).toBe(true);
  });

  it('攻撃で作業を中断する', () => {
    const sim = quiet();
    sim.teleport(-33, -10.9);
    sim.step({ ...idleInput(), interact: true });
    sim.step({ ...idleInput(), attack: true });
    expect(sim.mission.active).toBeNull();
    expect(sim.player.action!.kind).toBe('melee');
  });

  it('補充場所は有限で、満タンでは消費せず回収後は再補充できない', () => {
    const sim = quiet();
    sim.teleport(-26, 19);
    expect(nearbyInteraction(sim)).toBeNull();
    sim.player.stones = 0;
    use(sim, 'supply-bell');
    expect(sim.player.stones).toBe(INTERACTION.supply);
    sim.player.stones = 0;
    expect(nearbyInteraction(sim)).toBeNull();
  });

  it('仕掛けを全部使わなくても、信長を討った瞬間に勝利する', () => {
    const sim = quiet();
    sim.teleport(3.1, -18.8);
    expect(sim.player.prompt!.kind).toBe('assassinate');
    sim.step({ ...idleInput(), interact: true });
    expect(sim.outcome).toBe('win');
    expect(sim.mission.used.size).toBe(0);
    expect(sim.mission.phase).toBe(3);
  });
});
