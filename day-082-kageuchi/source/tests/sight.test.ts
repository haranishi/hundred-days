// OWNER: core
// 視界：角度・距離（明るさで伸び縮みする D）・壁越しは見えない・しゃがむと縮む・植え込み。扇の形。
import { describe, expect, it } from 'vitest';
import { SIGHT } from '../src/config/rules';
import { canSee } from '../src/sim/guards';
import { SightField, buildCone, coneContains, sightDistance } from '../src/sim/perception';
import { StageQuery } from '../src/sim/query';
import { HONNOJI, makeSim, postGuard, stageWithGuards, stepN } from './helpers';

/** 西の暗い境内（空 0.12・近くに灯り無し）に、東を向いた立ち番を一人。 */
function oneGuard(x = -25, z = 8, facingDeg = 0) {
  const sim = makeSim({}, stageWithGuards([postGuard('g', x, z, facingDeg)]));
  return { sim, g: sim.byId.get('g')! };
}

describe('視界', () => {
  it('見える距離 D ＝ (4.5 + 12.5×L) × 構え × sightMul × 寺の構え', () => {
    expect(sightDistance(0.12, 1, 1, 1, 1)).toBeCloseTo(6.0, 10);
    expect(sightDistance(0.12, SIGHT.stanceCrouch, 1, 1, 1)).toBeCloseTo(4.5, 10);
    expect(sightDistance(0.12, SIGHT.stanceRun, 1, 1, 1)).toBeCloseTo(7.2, 10);
    expect(sightDistance(1, 1, 1.15, SIGHT.phaseAlert, 1)).toBeCloseTo(17 * 1.15 * 1.3, 10);
  });

  it('暗がりで 5m 先：立てば見え、しゃがめば見えない', () => {
    const { sim, g } = oneGuard();
    sim.teleport(-20, 8);
    expect(sim.player.light).toBeCloseTo(0.12, 6);
    expect(canSee(sim, g).sees).toBe(true);
    sim.setCrouch(true);
    expect(canSee(sim, g).sees).toBe(false);
  });

  it('左右 55° の内だけ見える（発見中は 70°）', () => {
    const { sim, g } = oneGuard();
    sim.teleport(-21, 12); // 45°・5.66m
    expect(canSee(sim, g).sees).toBe(true);
    sim.teleport(-23, 11); // 56.3°・3.6m
    expect(canSee(sim, g).sees).toBe(false);
    sim.phase = 'alert';
    expect(canSee(sim, g).sees).toBe(true);
  });

  it('壁（板塀）の向こうは、近くても見えない', () => {
    const { sim, g } = oneGuard(-20, -8, 270);
    sim.teleport(-20, -10.5);
    expect(canSee(sim, g).sees).toBe(true);
    sim.teleport(-20, -13.5);
    expect(canSee(sim, g).d).toBeLessThan(6);
    expect(canSee(sim, g).sees).toBe(false);
  });

  it('植え込みの中でしゃがむと、見える距離に 0.35 を掛ける（立っていると効かない）', () => {
    const { sim, g } = oneGuard(-28, 0, 270);
    sim.teleport(-28, -3.5); // 茂み b5 の中・3.5m
    expect(sim.player.inBush).toBe(true);
    expect(canSee(sim, g).sees).toBe(true);
    sim.setCrouch(true);
    const look = canSee(sim, g);
    expect(look.sightD).toBeCloseTo((4.5 + 12.5 * sim.player.light) * 0.75 * 0.35, 6);
    expect(look.sees).toBe(false);
  });

  it('灯りの中では遠くから見える（石灯籠のそば 7.6m。暗ければ立っても 6m まで）', () => {
    const { sim, g } = oneGuard(-30.6, 4.4, 90);
    sim.teleport(-30.6, 12.0);
    expect(sim.player.tier).toBe('lit');
    expect(canSee(sim, g).sees).toBe(true);
    sim.setCrouch(true);
    expect(canSee(sim, g).sees).toBe(true);
  });

  it('扇：しゃがむと全部の線が縮み、壁で止まる', () => {
    const { sim, g } = oneGuard();
    sim.teleport(-40, 37);
    stepN(sim, 4);
    const len = (poly: Float32Array) => {
      let m = 0;
      for (let i = 1; i < poly.length / 2; i++) m = Math.max(m, Math.hypot(poly[i * 2] - poly[0], poly[i * 2 + 1] - poly[1]));
      return m;
    };
    const stand = len(sim.snapshot().cones.find((c) => c.id === 'g')!.poly.slice());
    sim.setCrouch(true);
    const crouch = len(sim.snapshot().cones.find((c) => c.id === 'g')!.poly.slice());
    expect(stand).toBeCloseTo(6.0, 1);
    expect(crouch).toBeLessThan(stand);
    expect(crouch).toBeCloseTo(4.5, 1);
    // 板塀の手前で北を向いた番兵：扇は塀を越えない
    const w = oneGuard(-20, -10, 270);
    stepN(w.sim, 4);
    const poly = w.sim.snapshot().cones.find((c) => c.id === 'g')!.poly;
    for (let i = 1; i < poly.length / 2; i++) expect(poly[i * 2 + 1]).toBeGreaterThan(-12);
    void g;
  });

  it('扇：暗い隙間の向こうの灯りの島も扇に出て、そこに立てば見つかる（扇と判定が同じ関数）', () => {
    // r01-integrate: 本堂の前の西の暗がり (-20, 11.2) から東を向いた番兵。正面の 6m 先からは暗い隙間、
    // その先の篝火 br-h1 (-5.5, 11.2) のまわりが灯りの島になる。前の扇は最初の暗がりで止まり、島が出なかった
    const { sim, g } = oneGuard(-20, 11.2, 0);
    stepN(sim, 4);
    const cone = () => sim.snapshot().cones.find((c) => c.id === 'g')!;
    // 灯りの島の中の点（篝火の 3.5m 手前・線の中ほど）
    const island = { x: -9.0, z: 11.45 };
    // 暗い隙間の中の点（目から 8m）
    const gap = { x: -12.0, z: 11.4 };
    sim.teleport(island.x, island.z);
    stepN(sim, 1);
    const c1 = cone();
    expect(c1.bands.length).toBeGreaterThan(0);
    expect(coneContains(c1.poly, c1.bands, c1.bands.length / 8, island.x, island.z)).toBe(true);
    const seen = canSee(sim, g);
    expect(seen.d).toBeGreaterThan(10);
    expect(seen.sees).toBe(true);
    // 暗い隙間：扇にも出ず、立っても見えない
    sim.teleport(gap.x, gap.z);
    stepN(sim, 1);
    const c2 = cone();
    expect(coneContains(c2.poly, c2.bands, c2.bands.length / 8, gap.x, gap.z)).toBe(false);
    expect(canSee(sim, g).sees).toBe(false);
  });

  it('扇の軽量化（線に掛かる灯りだけを拾う・見えない先で打ち切る）は、扇の形を1点も変えない', () => {
    // r01-integrate: 灯りの島まで線を伸ばすと sim が重くなったので軽くした。打ち切りも拾い分けもしない作り方と比べる
    const q = new StageQuery(HONNOJI);
    const moving = [
      { id: 'm1', x: -10, z: 5, y: 0.9, radius: 5, intensity: 0.75 },
      { id: 'm2', x: 3, z: -16, y: 0.9, radius: 5, intensity: 0.75 },
    ];
    const field = new SightField();
    const mk = () => ({ poly: new Float32Array(2 * (SIGHT.coneRays + 1)), bands: new Float32Array(8 * SIGHT.coneBands) });
    const fast = mk();
    const slow = mk();
    let islands = 0;
    for (let i = 0; i < 240; i++) {
      const ex = -34 + ((i * 37) % 68) + 0.37;
      const ez = -30 + ((i * 53) % 58) + 0.21;
      const yaw = (i * 0.83) % (Math.PI * 2);
      const half = (i % 4 === 0 ? SIGHT.halfAngleAlert : SIGHT.halfAngle) * (Math.PI / 180);
      const stance = [SIGHT.stanceCrouch, SIGHT.stanceWalk, SIGHT.stanceRun][i % 3];
      const phase = i % 4 === 0 ? SIGHT.phaseAlert : SIGHT.phaseNormal;
      field.prepare(q, ex, ez, stance, 1, phase, i % 3 === 0, moving, true);
      const nf = buildCone(fast, field, yaw, half, false);
      const ns = buildCone(slow, field, yaw, half, true);
      expect(nf).toBe(ns);
      expect(Array.from(fast.poly)).toEqual(Array.from(slow.poly));
      expect(Array.from(fast.bands.subarray(0, nf * 8))).toEqual(Array.from(slow.bands.subarray(0, ns * 8)));
      islands += nf;
    }
    // 灯りの島が出る場面も含んでいること
    expect(islands).toBeGreaterThan(50);
  });
});
