// OWNER: core
// 長い移動・角・接線・押し合い・しゃがみの衝突。移動先が障害物の外でも途中を越えないことを検証する。
import { describe, expect, it } from 'vitest';
import { MOVE } from '../src/config/rules';
import { StageQuery } from '../src/sim/query';
import { updatePlayer } from '../src/sim/player';
import { Rng } from '../src/sim/rng';
import type { StageDef, WallDef } from '../src/stage/types';
import { idleInput } from '../src/sim/types';
import { HONNOJI, TICK, makeSim, postGuard, walkInput } from './helpers';

const radius = MOVE.radius;
const wall: WallDef = { id: 'thin', kind: 'itabei', a: { x: 0, z: -10 }, b: { x: 0, z: 10 }, thickness: 0.06, height: 2 };

function world(patch: Partial<StageDef> = {}): StageDef {
  return { ...HONNOJI, bounds: { x0: -20, z0: -20, x1: 20, z1: 20 }, walls: [], gates: [], buildings: [], props: [], ponds: [], guards: [], ...patch };
}

describe('移動途中の衝突', () => {
  it('1回で8m移動しようとしても6cmの壁を越えない', () => {
    const q = new StageQuery(world({ walls: [wall] }));
    const p = { x: -4, z: 0 };
    q.move(p, 8, 0, radius, false);
    expect(p.x).toBeCloseTo(-radius - wall.thickness / 2, 3);
    expect(q.overlaps(p.x, p.z, radius, false)).toBe(false);
  });

  it('壁に斜めに押しても接線方向へ進み、繰り返しても振動しない', () => {
    const q = new StageQuery(world({ walls: [wall] }));
    const p = { x: -1, z: -3 };
    q.move(p, 2, 3, radius, false);
    expect(p.x).toBeLessThan(-radius - wall.thickness / 2);
    expect(p.z).toBeCloseTo(0, 3);
    const x = p.x;
    for (let i = 0; i < 60; i++) q.move(p, 0.1, 0.01, radius, false);
    expect(Math.abs(p.x - x)).toBeLessThan(0.001);
    expect(p.z).toBeCloseTo(0.6, 2);
  });

  it('回転した壁の正面と角も通り抜けない', () => {
    const rotated = { ...wall, a: { x: -6, z: -6 }, b: { x: 6, z: 6 } };
    const q = new StageQuery(world({ walls: [rotated] }));
    const p = { x: -4, z: 0 };
    q.move(p, 8, 0, radius, false);
    expect((p.z - p.x) / Math.SQRT2).toBeGreaterThanOrEqual(radius + wall.thickness / 2);
    expect(q.overlaps(p.x, p.z, radius, false)).toBe(false);
  });

  it('柱の手前で止まり、柱に接する線はそのまま通れる', () => {
    const q = new StageQuery(world({ props: [{ id: 'post', kind: 'pine', pos: { x: 0, z: 0 }, radius: 0.25 }] }));
    const p = { x: -4, z: 0 };
    q.move(p, 8, 0, radius, false);
    expect(p.x).toBeCloseTo(-0.25 - radius, 3);
    const tangent = { x: -4, z: radius + 0.25 };
    q.move(tangent, 8, 0, radius, false);
    expect(tangent.x).toBeCloseTo(4, 3);
  });

  it('建物の角を四角く広げず、円の半径ぶん離れて通れる', () => {
    const q = new StageQuery(world({ buildings: [{ id: 'box', name: '蔵', kind: 'kura', footprint: { x0: 0, z0: 0, x1: 2, z1: 2 }, eaveHeight: 3, ridgeHeight: 4, ridgeAxis: 'x', facing: 's' }] }));
    const p = { x: -2, z: -0.3 };
    q.move(p, 1.75, 0, radius, false);
    // (-0.25, -0.3) は半径0.35の丸い角の外だが、角を四角く膨らませると塞がる。
    expect(p.x).toBeCloseTo(-0.25, 5);
    expect(q.overlaps(p.x, p.z, radius, false)).toBe(false);
  });

  it('池の岸を横切らず、岸に沿う動きは残る', () => {
    const q = new StageQuery(world({ ponds: [{ id: 'pond', center: { x: 0, z: 0 }, rx: 3, rz: 2 }] }));
    const p = { x: -8, z: 0 };
    q.move(p, 16, 0, radius, false);
    expect(p.x).toBeCloseTo(-3 - radius, 3);
    expect(q.overlaps(p.x, p.z, radius, false)).toBe(false);
    q.move(p, 0, 1, radius, false);
    expect(p.z).toBeCloseTo(1, 3);
  });

  it('外周で止まり、外周へ押しながらも沿って進める', () => {
    const q = new StageQuery(world());
    const p = { x: 19, z: 0 };
    q.move(p, 10, 4, radius, false);
    expect(p.x).toBeCloseTo(20 - radius, 3);
    expect(p.z).toBeCloseTo(4, 3);
    expect(q.overlaps(p.x, p.z, radius, false)).toBe(false);
  });

  it('水抜き穴は立つと止まり、しゃがんだときだけ通れる', () => {
    const q = new StageQuery(world({ walls: [{ ...wall, crawl: true }] }));
    const standing = { x: -4, z: 0 };
    const crouching = { ...standing };
    q.move(standing, 8, 0, radius, false);
    q.move(crouching, 8, 0, radius, true);
    expect(standing.x).toBeLessThan(0);
    expect(crouching.x).toBe(4);
  });

  it('生きている人物も高速な移動で通り抜けない', () => {
    const q = new StageQuery(world());
    const p = { x: -4, z: 0 };
    q.move(p, 8, 0, radius, false, [{ id: 'guard', x: 0, z: 0, r: radius }]);
    expect(p.x).toBeCloseTo(-2 * radius, 3);
  });

  it('既に壁にめり込んでいた位置からでも有限の位置へ復帰する', () => {
    const q = new StageQuery(world({ walls: [wall] }));
    const p = { x: 0, z: 0 };
    q.move(p, 0, 1, radius, false);
    expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    expect(q.overlaps(p.x, p.z, radius, false)).toBe(false);
  });

  it('番兵に押されても薄い塀の反対側へ抜けない', () => {
    const guard = postGuard('push', -0.55, 0, 180);
    const sim = makeSim({ oblivious: true }, world({ walls: [wall], guards: [guard] }));
    sim.teleport(-0.39, 0);
    for (let i = 0; i < 60; i++) sim.step(walkInput(0));
    expect(sim.player.x).toBeLessThan(-radius - wall.thickness / 2);
    expect(sim.q.overlaps(sim.player.x, sim.player.z, radius, false)).toBe(false);
  });

  it('人物の押し戻しは操作速度に残らず、押された後はその場で止まる', () => {
    const sim = makeSim({ oblivious: true }, world({ guards: [postGuard('push', 0, 0, 180)] }));
    sim.teleport(0.65, 0);
    updatePlayer(sim, idleInput(), TICK);
    expect(sim.player.x).toBeCloseTo(radius * 2, 5);
    expect(sim.player.speed).toBeGreaterThan(0);
    expect(sim.player.vx).toBe(0);
    expect(sim.player.vz).toBe(0);
    const x = sim.player.x;
    for (let i = 0; i < 90; i++) updatePlayer(sim, idleInput(), TICK);
    expect(sim.player.x).toBeCloseTo(x, 5);
    expect(sim.player.speed).toBe(0);
  });

  it('書院南側で番兵に押されても逆向きの速度が蓄積せず、入力を離すと操作速度が止まる', () => {
    const sim = makeSim();
    for (let i = 0; i < 3944; i++) sim.step(idleInput());
    sim.teleport(-0.8, -22.1499);
    sim.setCrouch(true);
    for (let i = 0; i < 22; i++) sim.step(idleInput());
    for (let i = 0; i < 21; i++) {
      sim.step(walkInput(0));
      expect(Math.hypot(sim.player.vx, sim.player.vz)).toBeLessThanOrEqual(MOVE.crouch + 1e-6);
    }
    for (let i = 0; i < 90; i++) {
      sim.step(idleInput());
      // 番兵から再度押される位置補正は許すが、操作速度は通常の減速後にゼロになる。
      if (i >= Math.ceil(MOVE.crouch / MOVE.decel / TICK)) {
        expect(Math.hypot(sim.player.vx, sim.player.vz)).toBeLessThan(1e-6);
      }
    }
  }, 20_000); // 4000刻み以上を通常設定で再現するため、ブラウザ検証併走時の余裕を持つ。

  it('番兵2人が完全に同じ位置にいても、決定的に分離できる', () => {
    const sim = makeSim({ oblivious: true }, world({ guards: [postGuard('a', -4, 0, 0), postGuard('b', -4, 0, 0)], player: { start: { x: -14, z: 14 }, facingDeg: 0, stones: 5 } }));
    sim.step(idleInput());
    const [a, b] = sim.guards;
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(radius * 2 - 1e-6);
    expect(a.x).toBeLessThan(b.x);
  });

  it('本能寺で2000回方向と移動量を変えても、壁・柱・池の中へ入らない', () => {
    const q = new StageQuery(HONNOJI);
    const rng = new Rng(76);
    const p = { ...HONNOJI.player.start };
    for (let i = 0; i < 2000; i++) {
      const a = rng.range(0, Math.PI * 2);
      const length = rng.range(0, 8);
      q.move(p, Math.cos(a) * length, Math.sin(a) * length, radius, false);
      expect(q.overlaps(p.x, p.z, radius, false), `移動${i}: (${p.x}, ${p.z})`).toBe(false);
    }
  });
});
