// OWNER: core
// 討ち取りの瞬間（r02-fix-play 追加。体験の採点 5 位「引きの画のままで人物が小さく、討った後も蘭丸が立ったまま」）：
// 蘭丸が振り向いて信長へ駆け寄るが間に合わない・カメラが二人に寄る構図・一閃の間だけ時間が遅くなる。
import { describe, expect, it } from 'vitest';
import { FINALE } from '../src/config/rules';
import { VIEW } from '../src/config/view';
import { assassinateSlow, cameraSpotClear, closeUpShot } from '../src/camera/closeup';
import { CameraRig } from '../src/camera/rig';
import { getShot, shotCameraPosition } from '../src/contract/shots';
import { wrapAngle } from '../src/sim/math';
import { idleInput } from '../src/sim/types';
import { DEG, HONNOJI, makeSim, seconds, stepN } from './helpers';

/** 信長の背後（東）。撮影の構図 nobunaga と同じ立ち位置で、討ち取りの案内が出る */
const BEHIND = { x: 3.0, z: -18.9 };

function setup() {
  const sim = makeSim({ god: true });
  sim.teleport(BEHIND.x, BEHIND.z, 180);
  const nb = sim.nobunaga!;
  const rm = sim.guards.find((g) => g.def.kind === 'ranmaru')!;
  return { sim, nb, rm, d: () => Math.hypot(rm.x - nb.x, rm.z - nb.z) };
}

describe('討ち取りの瞬間', () => {
  it('蘭丸が振り向いて信長へ駆け寄る。一閃（討って 0.6 秒）には間に合わず、信長の手前 1.5m で止まって信長を向く', () => {
    const { sim, nb, rm, d } = setup();
    expect(sim.player.prompt?.kind).toBe('assassinate');
    const d0 = d();
    stepN(sim, 1, { ...idleInput(), interact: true });
    expect(sim.outcome).toBe('win');
    expect(rm.mode).toBe('rush');
    // 振り向く間は動かない
    stepN(sim, seconds(FINALE.rushDelay) - 2);
    expect(d()).toBeCloseTo(d0, 3);
    // 一閃の時点ではまだ届いていない（走っている）
    stepN(sim, seconds(0.6) - seconds(FINALE.rushDelay) + 1);
    expect(d()).toBeGreaterThan(FINALE.rushStop + 0.3);
    expect(rm.speed).toBeGreaterThan(3);
    // その後、手前で止まり信長を向く
    stepN(sim, seconds(3));
    expect(d()).toBeCloseTo(FINALE.rushStop, 1);
    expect(rm.speed).toBe(0);
    expect(Math.abs(wrapAngle(rm.yaw - Math.atan2(nb.z - rm.z, nb.x - rm.x)))).toBeLessThan(3 * DEG);
    expect(Math.hypot(rm.x - sim.player.x, rm.z - sim.player.z)).toBeGreaterThanOrEqual(FINALE.rushPlayerGap - 1e-6);
    // 写しでは発見の構え（人物は刀を構えて走る）
    expect(sim.snapshot().characters.find((c) => c.kind === 'ranmaru')!.pose.awareness).toBe('alert');
  });

  it('倒れている蘭丸は動かない', () => {
    const { sim, rm } = setup();
    rm.down = true;
    rm.mode = 'down';
    const x = rm.x;
    const z = rm.z;
    stepN(sim, 1, { ...idleInput(), interact: true });
    stepN(sim, seconds(3));
    expect(rm.mode).toBe('down');
    expect([rm.x, rm.z]).toEqual([x, z]);
  });

  it('寄りの構図：カメラは建物・塀・木の中に入らず、二人との間を遮る物が無く、駆け寄る蘭丸が画の中に入る', () => {
    const { sim, nb, rm } = setup();
    const shot = closeUpShot(HONNOJI, sim.q, { player: BEHIND, target: { x: nb.x, z: nb.z }, watcher: { x: rm.x, z: rm.z } });
    const [cx, cy, cz] = shotCameraPosition(shot);
    expect(cameraSpotClear(HONNOJI, sim.q, cx, cz)).toBe(true);
    expect(sim.q.blocked(cx, cz, shot.target[0], shot.target[2])).toBe(false);
    expect(Math.hypot(cx - shot.target[0], cz - shot.target[2])).toBeLessThan(4.5);
    expect(cy).toBeLessThan(3.5);
    // 切り替えた瞬間の、少し引いた位置も同じく置ける所
    const [kx, , kz] = shotCameraPosition({ ...shot, distance: VIEW.assassinate.cam.cutDistance });
    expect(cameraSpotClear(HONNOJI, sim.q, kx, kz)).toBe(true);
    expect(sim.q.blocked(kx, kz, shot.target[0], shot.target[2])).toBe(false);
    // 蘭丸の向き：画面の横の半画角（16:9）の内側
    const half = Math.atan(Math.tan((shot.fov * DEG) / 2) * (16 / 9));
    const toRm = Math.atan2(rm.z - cz, rm.x - cx);
    expect(Math.abs(wrapAngle(toRm - shot.yawDeg * DEG))).toBeLessThan(half * 0.85);
  });

  it('信長のまわりのどの向きから討っても、寄りのカメラは置ける所に置かれる', () => {
    const { sim, nb, rm } = setup();
    for (let a = 0; a < 360; a += 30) {
      const p = { x: nb.x + Math.cos(a * DEG) * 1.2, z: nb.z + Math.sin(a * DEG) * 1.2 };
      const shot = closeUpShot(HONNOJI, sim.q, { player: p, target: { x: nb.x, z: nb.z }, watcher: { x: rm.x, z: rm.z } });
      for (const distance of [shot.distance, VIEW.assassinate.cam.cutDistance]) {
        const [cx, , cz] = shotCameraPosition({ ...shot, distance });
        expect(cameraSpotClear(HONNOJI, sim.q, cx, cz), `角 ${a}°・${distance}m`).toBe(true);
        expect(sim.q.blocked(cx, cz, shot.target[0], shot.target[2]), `角 ${a}°・${distance}m`).toBe(false);
      }
    }
  });

  it('時間が遅くなるのは一閃の間だけで、実時間で 0.3〜0.5 秒。弧が一番明るい所（討って 0.48〜0.58 秒）は 0.3 倍', () => {
    const h = 1 / 2000;
    let slowReal = 0;
    for (let te = 0; te < 2; te += h) {
      const r = assassinateSlow(te);
      if (r < 0.9) slowReal += h / r;
    }
    expect(slowReal).toBeGreaterThanOrEqual(0.3);
    expect(slowReal).toBeLessThanOrEqual(0.5);
    expect(assassinateSlow(0.2)).toBe(1);
    expect(assassinateSlow(0.5)).toBeCloseTo(VIEW.assassinate.slow, 6);
    expect(assassinateSlow(0.56)).toBeCloseTo(VIEW.assassinate.slow, 6);
    expect(assassinateSlow(1.0)).toBe(1);
  });

  it('全景へ引くカメラは、先に真上へ上がり、どの建物の棟より高くなってから横へ動く（庭の低い所・屋根の中を通らない）', { timeout: 60_000 }, () => {
    // r03-fix-play：見た目の採点「全景へ引く最初の約 0.3 秒、カメラが庭の低い所を通る」。旧は寄りの位置から全景の位置への直線で、本堂の屋根の高さも横切った
    const { sim, nb, rm } = setup();
    const ridge = Math.max(...HONNOJI.buildings.map((b) => b.ridgeHeight));
    const fire = getShot('fire')!;
    const end = shotCameraPosition(fire);
    const dt = 1 / 60;
    for (let a = 0; a < 360; a += 30) {
      const p = { x: nb.x + Math.cos(a * DEG) * 1.2, z: nb.z + Math.sin(a * DEG) * 1.2 };
      const close = closeUpShot(HONNOJI, sim.q, { player: p, target: { x: nb.x, z: nb.z }, watcher: { x: rm.x, z: rm.z } });
      // main.ts と同じ流れ：少し引いた位置へ切り替え → 寄る → 炎上の始まり（演出の 0.22）で全景へ引く
      const rig = new CameraRig(16 / 9);
      rig.setFixed({ ...close, distance: VIEW.assassinate.cam.cutDistance });
      rig.setCinematic(close, VIEW.assassinate.cam.smooth);
      for (let t = 0; t < FINALE.cameraFrom * FINALE.duration; t += dt) rig.update(dt, null, false);
      const x0 = rig.camera.position.x;
      const y0 = rig.camera.position.y;
      const z0 = rig.camera.position.z;
      rig.pullBack(fire);
      let prevY = y0;
      for (let k = 1; k <= 6 / dt; k++) {
        rig.update(dt, null, false);
        const { x, y, z } = rig.camera.position;
        const label = `角 ${a}°・${(k * dt).toFixed(2)} 秒 (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`;
        expect(y, `${label}：高さが下がらない`).toBeGreaterThanOrEqual(prevY - 1e-6);
        prevY = y;
        // 横へ動き出すのは、いちばん高い棟（本堂 12.5m）より上に出てから
        if (Math.hypot(x - x0, z - z0) > 0.05) expect(y, `${label}：横へ動くときは棟より上`).toBeGreaterThan(ridge + 0.5);
        // 初めの 0.3 秒は真上へ上がるだけ
        if (k * dt <= 0.3) expect(Math.hypot(x - x0, z - z0), label).toBeLessThan(0.05);
        // 建物（軒の張り出しぶん広げた箱）の上では、棟より高い
        for (const b of HONNOJI.buildings) {
          const f = b.footprint;
          const m = VIEW.assassinate.cam.eaveMargin;
          if (x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m) expect(y, `${label}：${b.name}の上`).toBeGreaterThan(b.ridgeHeight + 0.3);
        }
      }
      // 6 秒で全景の位置に着く
      expect(Math.hypot(rig.camera.position.x - end[0], rig.camera.position.y - end[1], rig.camera.position.z - end[2]), `角 ${a}°`).toBeLessThan(1);
      expect(y0).toBeLessThan(3.5);
    }
  });
});
