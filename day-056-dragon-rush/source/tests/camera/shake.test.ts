// OWNER: tests
// r05-camera：揺れの強さは出来事の大きさと竜からの距離で決まる（camera/shake.ts）。
// 規則（指示書）：着地と近い崩落は 0.5〜1°、足音は 0.1°前後、0.3〜0.5秒で減らす。大きな当たりの画角の跳ねは 3〜5°。
// 焔角ののしかかりと突進も同じ規則。着地はカメラが約0.3秒遅れて下がって戻る。
// r06-camera2：揺れの速さと減り方も出来事の大きさで決める（崩落・着地は1秒に4〜6回向きを変え、0.6〜1秒で減る。足音・爪は今の細かさのまま）。
// 崩れたビルの側へ少し傾く。
import { describe, expect, it } from 'vitest';
import { FovKick, LandingSink, ShakePool, collapseShakeDeg, falloff, heavyRate, hitShakeDeg, impulseFor, landingShakeDeg, leanEnvelope, shakeEnvelope, type Impulse } from '../../src/camera/shake';
import { CAMERA_KICK, CAMERA_SHAKE as S } from '../../src/config/camera';
import type { GameEvent } from '../../src/core/events';

const body = { x: 0, y: 10, z: 0 };
const ev = (e: Record<string, unknown>): GameEvent => ({ t: 1, ...e }) as unknown as GameEvent;
const building = (height: number, x: number) => ev({ type: 'building.collapse', id: 1, pos: [x, height / 2, 0], volume: 1e4, height, material: 'tile', cause: 'claw' });

describe('揺れの強さ＝大きさ × 距離の減り', () => {
  it('距離の減りは 0m で 1、falloffDistance で半分、遠いほど小さい', () => {
    expect(falloff(0)).toBe(1);
    expect(falloff(S.falloffDistance)).toBeCloseTo(0.5, 12);
    for (let d = 0; d < 400; d += 10) expect(falloff(d + 10)).toBeLessThan(falloff(d));
  });

  it('着地は衝撃で 0.5〜1°、近い高層の崩落は 0.5〜1°、遠い崩落は小さい', () => {
    expect(landingShakeDeg(0)).toBeCloseTo(0.5, 9);
    expect(landingShakeDeg(1)).toBeCloseTo(1.0, 9);
    expect(landingShakeDeg(2)).toBeCloseTo(1.0, 9);
    const near = collapseShakeDeg(80, 25);
    expect(near).toBeGreaterThanOrEqual(0.5);
    expect(near).toBeLessThanOrEqual(1.0);
    const far = collapseShakeDeg(80, 200);
    expect(far).toBeLessThan(0.15);
    // 大きい建物ほど、近いほど強い
    expect(collapseShakeDeg(80, 40)).toBeGreaterThan(collapseShakeDeg(20, 40));
    expect(collapseShakeDeg(40, 30)).toBeGreaterThan(collapseShakeDeg(40, 90));
    // 小さな家でも、上限の sizeMin 倍は揺れる
    expect(collapseShakeDeg(5, 0)).toBeCloseTo(S.collapse.maxDeg * S.collapse.sizeMin, 9);
  });

  it('出来事から手応えへ：足音は0.1°前後、爪と尾は当たったときだけ、技の着弾は距離で弱める', () => {
    const walk = impulseFor(ev({ type: 'dragon.step', foot: 'FL', pos: [0, 0, 0], speed: 8 }), body, false)!;
    const run = impulseFor(ev({ type: 'dragon.step', foot: 'FL', pos: [0, 0, 0], speed: 20 }), body, true)!;
    expect(walk.deg).toBeGreaterThanOrEqual(0.05);
    expect(run.deg).toBeLessThanOrEqual(0.15);
    expect(walk.seconds).toBeGreaterThanOrEqual(0.3);
    expect(walk.vertical).toBe(true);
    expect(impulseFor(ev({ type: 'dragon.claw', pos: [0, 0, 0], hit: false, count: 0 }), body, false)).toBeNull();
    const claw = impulseFor(ev({ type: 'dragon.claw', pos: [0, 0, 0], hit: true, count: 1 }), body, false)!;
    expect(claw.deg).toBeCloseTo(S.claw.deg, 9);
    expect(hitShakeDeg(S.claw, 9)).toBeCloseTo(S.claw.maxDeg, 9);
    const lavaNear = impulseFor(ev({ type: 'lava.impact', creature: 'homuratsuno', id: 1, pos: [10, 0, 0], hits: 1 }), body, false)!;
    const lavaFar = impulseFor(ev({ type: 'lava.impact', creature: 'homuratsuno', id: 1, pos: [150, 0, 0], hits: 1 }), body, false)!;
    expect(lavaFar.deg).toBeLessThan(lavaNear.deg);
    expect(impulseFor(building(80, 20), body, false)!.deg).toBeGreaterThan(impulseFor(building(80, 160), body, false)!.deg);
    // 小さな出来事（足音・爪・技の着弾）は r05-camera のまま 0.3〜0.5秒。r06-camera2：重い出来事（崩落）は大きさで 0.85〜1.35秒
    for (const k of [walk, claw, lavaNear]) {
      expect(k.seconds).toBeGreaterThanOrEqual(0.3);
      expect(k.seconds).toBeLessThanOrEqual(0.5);
    }
    const near = impulseFor(building(80, 20), body, false)!;
    expect(near.seconds).toBeGreaterThanOrEqual(S.heavy.secondsMin);
    expect(near.seconds).toBeLessThanOrEqual(S.heavy.secondsMax);
  });

  it('大きな当たり（急降下の着地・のしかかり・突進で押し倒す・怒りの大技）の画角の跳ねは 3〜5°。焔角も同じ規則', () => {
    const dive = impulseFor(ev({ type: 'dragon.land', pos: [0, 0, 0], impact: 1, speed: 60, dive: true }), body, false)!;
    const slam = impulseFor(ev({ type: 'dragon.land', pos: [0, 0, 0], impact: 0.76, speed: 34, dive: false, slam: true }), body, false)!;
    const charge = impulseFor(ev({ type: 'charge.shove', creature: 'homuratsuno', id: 3, pos: [5, 10, 0] }), body, false)!;
    const rage = impulseFor(ev({ type: 'rage.release', kind: 'fissure', value: 100 }), body, false)!;
    for (const k of [dive, slam, charge, rage]) {
      expect(k.kickDeg).toBeGreaterThanOrEqual(3);
      expect(k.kickDeg).toBeLessThanOrEqual(5);
    }
    expect(dive.deg).toBeGreaterThanOrEqual(0.5);
    expect(dive.deg).toBeLessThanOrEqual(1);
    expect(slam.deg).toBeGreaterThanOrEqual(0.5);
    expect(slam.deg).toBeLessThanOrEqual(1);
    expect(charge.deg).toBeGreaterThanOrEqual(0.5);
    expect(charge.deg).toBeLessThanOrEqual(1);
    // 着地は沈む（のしかかりも）。ふわっと降りた着地は跳ねも沈みも無い
    expect(dive.sinkM).toBeGreaterThan(1.5);
    expect(slam.sinkM).toBeGreaterThan(1.5);
    const soft = impulseFor(ev({ type: 'dragon.land', pos: [0, 0, 0], impact: 0.05, speed: 4, dive: false }), body, false)!;
    expect(soft.kickDeg).toBe(0);
    expect(soft.sinkM).toBe(0);
  });
});

describe('揺れ・画角の跳ね・沈み込みの動き', () => {
  it('揺れの振れの最大は、出来事の角度（重なっても一番大きいものを超えない）。seconds で 0 に戻る', () => {
    for (const deg of [0.1, 0.5, 0.8, 1.0]) {
      const pool = new ShakePool();
      pool.add(deg, 0.45, 0.25, 1);
      let peak = 0;
      let t = 0;
      for (; t < 0.45; t += 1 / 240) peak = Math.max(peak, Math.hypot(pool.update(1 / 240).pitch, pool.out.yaw));
      expect(peak).toBeGreaterThan(deg * 0.9);
      expect(peak).toBeLessThanOrEqual(deg + 1e-9);
      expect(pool.update(1 / 240).deg).toBe(0);
    }
    const pool = new ShakePool();
    pool.add(0.8, 0.5, 1, 0.5);
    pool.add(0.6, 0.5, -1, 0.5);
    let peak = 0;
    for (let t = 0; t < 0.5; t += 1 / 240) peak = Math.max(peak, pool.update(1 / 240).deg);
    expect(peak).toBeLessThanOrEqual(0.8 + 1e-9);
    expect(shakeEnvelope(0, 0.4)).toBe(1);
    expect(shakeEnvelope(0.4, 0.4)).toBe(0);
  });

  it('画角の跳ねの山は指定の度数（重なっても maxDeg まで）', () => {
    const k = new FovKick();
    k.kick(4);
    let peak = 0;
    for (let t = 0; t < 2; t += 1 / 240) peak = Math.max(peak, k.update(1 / 240));
    expect(peak).toBeCloseTo(4, 1);
    const k2 = new FovKick();
    k2.kick(5);
    k2.kick(5);
    let p2 = 0;
    for (let t = 0; t < 2; t += 1 / 240) p2 = Math.max(p2, k2.update(1 / 240));
    expect(p2).toBeLessThanOrEqual(CAMERA_KICK.maxDeg + 1e-9);
  });

  it('着地の沈み込みは約0.3秒遅れて一番下がり、戻る', () => {
    const s = new LandingSink();
    s.sink(2.6);
    let low = 0;
    let at = 0;
    let t = 0;
    for (; t < 3; t += 1 / 240) {
      const v = s.update(1 / 240);
      if (v < low) {
        low = v;
        at = t;
      }
    }
    expect(low).toBeCloseTo(-2.6, 1);
    expect(at).toBeGreaterThan(0.25);
    expect(at).toBeLessThan(0.36);
    expect(Math.abs(s.update(1 / 240))).toBeLessThan(0.15);
  });
});

/** 揺れを1つだけ鳴らして 60コマ/秒で回し、向きの変わる点（振れの山と谷）の数と、山の1割を最後に超えた時刻（秒）を数える。 */
function runShake(k: Impulse, dx = 0.25, dy = 1): { turns: number; perSecond: number; decay: number; peak: number } {
  const pool = new ShakePool();
  pool.add(k.deg, k.seconds, dx, dy, k.hz, 0);
  const sig: number[] = [];
  for (let i = 0; i < 180; i++) {
    const o = pool.update(1 / 60);
    sig.push(o.pitch * dy + o.yaw * dx);
  }
  const peak = Math.max(...sig.map(Math.abs));
  let last = 0;
  sig.forEach((v, i) => {
    if (Math.abs(v) >= peak * 0.1) last = i;
  });
  let turns = 0;
  let prev = -1;
  for (let i = 1; i < sig.length - 1; i++) {
    const ext = (sig[i] > sig[i - 1] && sig[i] >= sig[i + 1]) || (sig[i] < sig[i - 1] && sig[i] <= sig[i + 1]);
    if (ext && i <= last && (prev < 0 || Math.abs(sig[i] - sig[prev]) >= peak * 0.05)) {
      turns++;
      prev = i;
    }
  }
  const decay = (last + 1) / 60;
  return { turns, perSecond: turns / decay, decay, peak };
}

describe('r06-camera2：揺れの速さも出来事の大きさで決める', () => {
  it('重い出来事は大きいほど遅く長く（周波数 hzMax→hzMin、減る秒数 secondsMin→secondsMax）', () => {
    const small = heavyRate(0);
    const big = heavyRate(1);
    expect(small.hz).toBeCloseTo(S.heavy.hzMax, 9);
    expect(big.hz).toBeCloseTo(S.heavy.hzMin, 9);
    expect(big.seconds).toBeGreaterThan(small.seconds);
    for (let i = 0; i < 10; i++) {
      expect(heavyRate((i + 1) / 10).hz).toBeLessThan(heavyRate(i / 10).hz);
      expect(heavyRate((i + 1) / 10).seconds).toBeGreaterThan(heavyRate(i / 10).seconds);
    }
    // 1往復で2回向きを変えるので、1秒に4〜6回
    expect(2 * S.heavy.hzMin).toBeGreaterThanOrEqual(4);
    expect(2 * S.heavy.hzMax).toBeLessThanOrEqual(6);
  });

  it('近い崩落と急降下の着地は、1秒に4〜6回向きを変え、0.6〜1秒で山の1割を切る。振れ幅は r05-camera のまま', () => {
    const cases: [string, Impulse][] = [
      ['近い高層の崩落', impulseFor(building(80, 20), body, false)!],
      ['近い中層の崩落', impulseFor(building(35, 25), body, false)!],
      ['急降下の着地', impulseFor(ev({ type: 'dragon.land', pos: [0, 0, 0], impact: 1, speed: 60, dive: true }), body, false)!],
      ['のしかかり', impulseFor(ev({ type: 'dragon.land', pos: [0, 0, 0], impact: 0.76, speed: 34, dive: false, slam: true }), body, false)!],
    ];
    for (const [name, k] of cases) {
      const r = runShake(k, k.vertical ? 0.25 : 0.85, k.vertical ? 1 : 0.55);
      expect(r.perSecond, name).toBeGreaterThanOrEqual(3.5);
      expect(r.perSecond, name).toBeLessThanOrEqual(6.5);
      expect(r.decay, name).toBeGreaterThanOrEqual(0.6);
      expect(r.decay, name).toBeLessThanOrEqual(1.0);
      // 振れ幅は出来事の角度のまま（最初の山まで減らさない）
      expect(r.peak, name).toBeGreaterThanOrEqual(0.95 * k.deg);
    }
    // 振れ幅：近い高層の崩落は 0.5〜1°（r05-camera のまま）
    expect(impulseFor(building(80, 20), body, false)!.deg).toBeCloseTo(collapseShakeDeg(80, 20), 9);
  });

  it('足音と爪は今の細かさのまま（8Hz か 13Hz、0.3〜0.5秒）。向きの変わる回数は崩落の3倍以上', () => {
    const walk = impulseFor(ev({ type: 'dragon.step', foot: 'FL', pos: [0, 0, 0], speed: 8 }), body, false)!;
    const claw = impulseFor(ev({ type: 'dragon.claw', pos: [10, 5, 0], hit: true, count: 1 }), body, false)!;
    expect(walk.hz).toBe(S.hzSmall);
    expect(claw.hz).toBe(S.hzSmall);
    const fast = runShake(claw, 0.85, 0.55);
    const slow = runShake(impulseFor(building(80, 20), body, false)!, 0.85, 0.55);
    expect(fast.perSecond).toBeGreaterThan(3 * slow.perSecond);
  });

  it('崩落と傾きは、崩れたビルの見える側へ少し傾く（立ち上がってから戻る。上限 lean.deg）', () => {
    const k = impulseFor(building(80, 20), body, false)!;
    expect(k.leanDeg).toBeGreaterThan(0);
    expect(k.leanDeg).toBeLessThanOrEqual(S.lean.deg + 1e-9);
    const tilt = impulseFor(ev({ type: 'building.tilt', id: 1, pos: [20, 40, 0], volume: 1e4, height: 80, material: 'tile', cause: 'claw' }), body, false)!;
    expect(tilt.leanDeg).toBeCloseTo(k.leanDeg * S.collapse.tiltShare, 9);
    // 足音・爪・着地は傾かない
    expect(impulseFor(ev({ type: 'dragon.step', foot: 'FL', pos: [0, 0, 0], speed: 8 }), body, false)!.leanDeg).toBe(0);
    expect(impulseFor(ev({ type: 'dragon.land', pos: [0, 0, 0], impact: 1, speed: 60, dive: true }), body, false)!.leanDeg).toBe(0);
    // 右（正）の傾き：揺れの左右から差し引く（rotateY は正で左へ回るので、右を向くには負）。立ち上がって、秒数のうちに 0 へ
    const pool = new ShakePool();
    pool.add(0, k.seconds, 1, 0, k.hz, 0.5);
    let maxLean = 0;
    let at = 0;
    for (let i = 0; i < 120; i++) {
      const o = pool.update(1 / 60);
      if (o.lean > maxLean) {
        maxLean = o.lean;
        at = (i + 1) / 60;
      }
      expect(o.yaw).toBeCloseTo(-o.lean, 9);
    }
    expect(maxLean).toBeCloseTo(0.5, 2);
    expect(at).toBeGreaterThan(0.1);
    expect(at).toBeLessThan(0.25);
    expect(leanEnvelope(k.seconds, k.seconds)).toBe(0);
    expect(pool.update(1 / 60).lean).toBe(0);
  });
});
