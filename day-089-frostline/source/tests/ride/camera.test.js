import { describe, it, expect } from 'vitest';
import { createCameraMemory, updateCamera, CAMERA, AIR_FRAME } from '../../src/render/ride/camera-math.js';
import { riding, flat, distance, cameraOutput } from './fixtures.js';
function step(s, m, out, extra = {}) {
  return updateCamera({ state: s, events: [], dt: 1 / 60, jumped: false, look: { yaw: 0, pitch: 0, camera: 'third' },
    shake: 0, heightAt: flat, obstacles: [], time: 0, ...extra }, m, out);
}
function direction(c) { return Math.atan2(c.target.x - c.pos.x, -(c.target.z - c.pos.z)); }

describe('camera calculation', () => {
  it('interpolates distance, height, look-ahead and field of view with speed', () => {
    for (const speed of [0, 15, 30]) {
      const s = riding({ speed }), o = cameraOutput(); step(s, createCameraMemory(), o);
      // 置き方の値は、採点のたびに調整する。試験は「速さで直線に変わる」ことを、実装の値で確かめる
      const r = speed / 30;
      expect(o.pos.z).toBeCloseTo(CAMERA.back[0] + CAMERA.back[1] * r, 7);
      expect(o.pos.y).toBeCloseTo(CAMERA.height[0] + CAMERA.height[1] * r, 7);
      expect(o.target.z).toBeCloseTo(-(CAMERA.ahead[0] + CAMERA.ahead[1] * r), 7);
      expect(o.fov).toBeCloseTo(CAMERA.fov[0] + CAMERA.fov[1] * r, 7);
    }
  });
  it('aims above the supplied pelvis and estimates it from leg length without a pose', () => {
    const s = riding({ leg: 0.9 }), a = cameraOutput(), b = cameraOutput();
    step(s, createCameraMemory(), a); expect(a.target.y).toBeCloseTo(1.21, 8);
    const pose = { joints: { pelvis: { x: 0, y: 0.7, z: 0 } } };
    step(s, createCameraMemory(), b, { pose }); expect(b.target.y).toBeCloseTo(0.9, 8);
  });
  it('follows a carve-skid-air-land-recover sequence continuously above terrain', () => {
    const s = riding(), m = createCameraMemory(), o = cameraOutput(); step(s, m, o);
    for (let i = 0; i < 300; i++) {
      const prev = { ...o.pos }; s.pos.z -= s.speed / 60; s.pos.y = Math.max(0, Math.sin((i - 100) / 45) * 2);
      s.mode = i < 70 ? 'carve' : i < 100 ? 'skid' : i < 200 ? 'air' : 'carve';
      s.edge = Math.sin(i / 40) * 0.8;
      step(s, m, o, { time: i / 60, events: i === 200 ? [{ type: 'land', efh: 1 }] : i === 250 ? [{ type: 'recover' }] : [] });
      expect(distance(prev, o.pos)).toBeLessThan(0.6); expect(o.pos.y).toBeGreaterThanOrEqual(1.2);
      expect(Number.isFinite(o.fov)).toBe(true);
    }
  });
  it('ignores board yaw in a skid but uses it below one metre/second', () => {
    const s = riding(), m = createCameraMemory(), o = cameraOutput(); step(s, m, o);
    const before = direction(o); s.heading = Math.PI / 3; s.fwd.x = Math.sin(s.heading); s.fwd.z = -Math.cos(s.heading);
    for (let i = 0; i < 120; i++) step(s, m, o);
    expect(Math.abs(direction(o) - before)).toBeLessThan(10 * Math.PI / 180);
    s.speed = 0; for (let i = 0; i < 240; i++) step(s, m, o);
    expect(direction(o)).toBeCloseTo(Math.PI / 3, 4);
  });
  it('keeps the specified trailing distance and head attachment while moving at 30m/s', () => {
    const s = riding({ speed: 30 }), m = createCameraMemory(), o = cameraOutput();
    for (let i = 0; i < 240; i++) { s.pos.z -= 0.5; step(s, m, o); }
    expect(o.pos.z - s.pos.z).toBeCloseTo(CAMERA.back[0] + CAMERA.back[1], 7);
    const look = { yaw: 0, pitch: 0, camera: 'first' }, pose = { joints: { head: { x: 0, y: 1.7, z: s.pos.z } } };
    for (let i = 0; i < 240; i++) { s.pos.z -= 0.5; pose.joints.head.z = s.pos.z; step(s, m, o, { look, pose }); }
    expect(distance(o.pos, pose.joints.head)).toBeLessThan(1e-6);
    pose.joints.head.y += 0.1; step(s, m, o, { look, pose });
    expect(distance(o.pos, pose.joints.head)).toBeLessThan(1e-6);
  });
  it('is deterministic and suppresses all time-dependent noise at shake=0', () => {
    const s = riding(); s.snow.rough = 1; s.tele.skidPower = 9000;
    const a = cameraOutput(), b = cameraOutput(); step(s, createCameraMemory(), a, { time: 0 }); step(s, createCameraMemory(), b, { time: 12 });
    expect(distance(a.pos, b.pos)).toBe(0);
    step(s, createCameraMemory(), a, { time: 1, shake: 1 }); step(s, createCameraMemory(), b, { time: 2, shake: 1 });
    expect(distance(a.pos, b.pos)).toBeGreaterThan(0.001);
    const c = cameraOutput(); step(s, createCameraMemory(), c, { time: 2, shake: 1 }); expect(distance(b.pos, c.pos)).toBe(0);
  });
  it('resets every spring on jumped, including impact and obstacle avoidance', () => {
    const s = riding(), m = createCameraMemory(), o = cameraOutput(); step(s, m, o);
    for (let i = 0; i < 30; i++) step(s, m, o, { events: i === 0 ? [{ type: 'land', efh: 2 }] : [] });
    s.pos.x = 200; s.pos.y = 20; step(s, m, o, { jumped: true });
    const fresh = cameraOutput(); step(s, createCameraMemory(), fresh, { jumped: true });
    expect(distance(o.pos, fresh.pos)).toBeLessThan(1e-10); expect(distance(o.target, fresh.target)).toBeLessThan(1e-10);
    expect(o.fov).toBe(fresh.fov);
  });
  it('avoids obstacles quickly and returns slowly, also guarding terrain', () => {
    const s = riding(), m = createCameraMemory(), o = cameraOutput(); step(s, m, o);
    const obstacles = [{ x: 0, z: 3, radius: 0.4, height: 4 }];
    for (let i = 0; i < 30; i++) step(s, m, o, { obstacles });
    expect(o.pos.y).toBeGreaterThan(7); const raised = o.pos.y; step(s, m, o); expect(o.pos.y).toBeGreaterThan(raised - 0.2);
    const high = cameraOutput(); step(s, createCameraMemory(), high, { heightAt: () => 20 }); expect(high.pos.y).toBeGreaterThanOrEqual(21.2);
  });
  it('adds drag look then returns after 1.5 seconds of unchanged input', () => {
    const s = riding(), m = createCameraMemory(), o = cameraOutput(); step(s, m, o);
    const look = { yaw: 0.7, pitch: 0.1, camera: 'third' };
    for (let i = 0; i < 60; i++) step(s, m, o, { look }); expect(direction(o)).toBeGreaterThan(0.4);
    for (let i = 0; i < 240; i++) step(s, m, o, { look }); expect(Math.abs(direction(o))).toBeLessThan(0.01);
  });
  // 傾きは、採点 1 周目（地平線が 25〜30° 傾いて前が読めない）を受けて、板の角度の 3 割から 1 割へ下げた
  it('uses head position and 10% roll in first person, with a continuous switch', () => {
    const s = riding({ edge: 0.6 }), m = createCameraMemory(), o = cameraOutput();
    const pose = { joints: { head: { x: 0.1, y: 1.7, z: 0.2 } } }, look = { yaw: 0, pitch: 0, camera: 'first' };
    step(s, m, o, { pose, look }); expect(distance(o.pos, pose.joints.head)).toBeLessThan(1e-9);
    expect(o.fov).toBe(88); expect(o.near).toBeLessThan(0.1); expect(o.up.x).toBeCloseTo(Math.sin(0.06), 7);
    const prev = { ...o.pos }; step(s, m, o); expect(distance(prev, o.pos)).toBeLessThan(0.25);
  });
  it('responds to landing efh and downhill slope', () => {
    const s = riding(), m = createCameraMemory(), o = cameraOutput(); step(s, m, o); const beforeY = o.pos.y, beforeFov = o.fov;
    step(s, m, o, { events: [{ type: 'land', efh: 2 }] }); expect(o.pos.y).toBeLessThan(beforeY); expect(o.fov).toBeGreaterThan(beforeFov);
    s.vel.y = -8; for (let i = 0; i < 120; i++) step(s, m, o); expect(o.target.y).toBeLessThan(1);
  });
});

describe('camera keeps out of tree crowns', () => {
  // 採点 1 周目：木のそばを通るとき、カメラが枝の中に入る絵があった
  const flat = () => 0;
  const run = (obstacles) => {
    const s = riding({ speed: 15 }), m = createCameraMemory(), o = cameraOutput();
    const input = { state: s, events: [], dt: 1 / 60, jumped: false, look: { yaw: 0, pitch: 0, camera: 'third' }, shake: 0, heightAt: flat, obstacles, time: 0 };
    for (let i = 0; i < 90; i++) updateCamera(input, m, o);
    return { o, s };
  };
  it('pushes sideways out of the crown of a tree standing where the camera would sit, and leaves distant trees alone', () => {
    const free = run([]).o;
    // カメラの置き場所の、ほぼ真上に立つ高さ 8 m の木（枝ぶりの半径 ≈ 1.9 m ＋ 余裕 0.5 m）
    const tree = { type: 'tree', x: free.pos.x + 0.4, z: free.pos.z, radius: 0.3, height: 8 };
    const near = run([tree]).o;
    expect(Math.hypot(near.pos.x - tree.x, near.pos.z - tree.z)).toBeGreaterThan(8 * 0.24 + 0.3);
    expect(Math.hypot(near.pos.x - free.pos.x, near.pos.z - free.pos.z)).toBeLessThanOrEqual(3 + 1e-6);
    const far = run([{ type: 'tree', x: free.pos.x + 9, z: free.pos.z, radius: 0.3, height: 8 }]).o;
    expect(Math.hypot(far.pos.x - free.pos.x, far.pos.z - free.pos.z)).toBeLessThan(1e-6);
  });
  it('ignores rocks and trees shorter than the camera height', () => {
    const free = run([]).o;
    const rock = run([{ type: 'rock', x: free.pos.x + 0.4, z: free.pos.z, radius: 1.5, height: 1 }]).o;
    expect(Math.hypot(rock.pos.x - free.pos.x, rock.pos.z - free.pos.z)).toBeLessThan(1e-6);
    const low = run([{ type: 'tree', x: free.pos.x + 0.2, z: free.pos.z, radius: 0.3, height: 1 }]).o;
    expect(Math.hypot(low.pos.x - free.pos.x, low.pos.z - free.pos.z)).toBeLessThan(1e-6);
  });
});

describe('camera on steep slopes', () => {
  // 採点 2 周目：急斜面でカメラが雪面を向き、先が見えなかった／岩壁の前でカメラが壁にめり込んだ
  const slope = (deg) => { const t = Math.tan(deg * Math.PI / 180); return (x, z) => t * z; }; // −Z（北）へ下る斜面
  const run = (deg, speed = 20) => {
    const h = slope(deg), a = deg * Math.PI / 180;
    const s = riding({ speed }); s.pos.y = h(s.pos.x, s.pos.z); s.vel = { x: 0, y: -speed * Math.sin(a), z: -speed * Math.cos(a) };
    const m = createCameraMemory(), o = cameraOutput();
    const input = { state: s, events: [], dt: 1 / 60, jumped: false, look: { yaw: 0, pitch: 0, camera: 'third' }, shake: 0, heightAt: h, obstacles: [], time: 0 };
    for (let i = 0; i < 240; i++) updateCamera(input, m, o);
    return { o, s, h, a };
  };
  it('keeps the set clearance above the snow under the camera, measured from the surface on steep faces', () => {
    for (const deg of [0, 20, 35, 45]) {
      const { o, h, a } = run(deg);
      const above = o.pos.y - h(o.pos.x, o.pos.z);
      expect(above).toBeGreaterThanOrEqual(CAMERA.clearance[0] - 1e-6);
      expect(above * Math.cos(a)).toBeGreaterThanOrEqual(1.2 - 1e-6); // 面からの距離
    }
  });
  it('looks down the fall line at a shallower angle than the slope, so the valley stays in the frame', () => {
    const { o, a } = run(35);
    const pitch = Math.atan2(o.target.y - o.pos.y, Math.hypot(o.target.x - o.pos.x, o.target.z - o.pos.z)); // 下向きが負
    expect(pitch).toBeLessThan(0); // 谷のほうを見ている
    expect(-pitch).toBeLessThan(a); // 斜面の角度より浅い
    // 画面の上半分（視野の半分だけ上）が、斜面の先の空中を向く＝雪面だけで埋まらない
    expect(-pitch - (o.fov * Math.PI / 180) / 2).toBeLessThan(a - 0.15);
  });
});

describe('camera in the air (tricks)', () => {
  // 空中の状態を作る：重心は高さ 6 m をまっすぐ進み、板は宙返りの角度 flip だけ回っている（物理と同じ決まり）
  function airborne(i, flip) {
    const s = riding({ mode: 'air' }); s.leg = 0.8; s.air.time = 0.4 + i / 60; s.air.flip = flip;
    s.com.x = 0; s.com.y = 6; s.com.z = -i * 0.25;
    const c = Math.cos(flip), q = Math.sin(flip); // 基準の上＝(0,1,0)、基準の前＝(0,0,−1)
    s.up.x = 0; s.up.y = c; s.up.z = -q; s.fwd.x = 0; s.fwd.y = -q; s.fwd.z = -c;
    s.pos.x = s.com.x - s.up.x * s.leg; s.pos.y = s.com.y - s.up.y * s.leg; s.pos.z = s.com.z - s.up.z * s.leg;
    return s;
  }
  const high = () => -100; // 雪面はずっと下（床の守りを働かせない）
  it('does not bob with the board while the rider flips', () => {
    const ma = createCameraMemory(), mb = createCameraMemory(), a = cameraOutput(), b = cameraOutput();
    let worst = 0;
    for (let i = 0; i < 90; i++) {
      // a は宙返りなし、b は 1.5 秒で 1 回転
      step(airborne(i, 0), ma, a, { heightAt: high }); step(airborne(i, i / 90 * Math.PI * 2 + 1e-6), mb, b, { heightAt: high });
      worst = Math.max(worst, distance(a.pos, b.pos));
    }
    expect(worst).toBeLessThan(0.05);
  });
  it('rises and narrows the view after 0.25s in the air, and returns on the ground', () => {
    const m = createCameraMemory(), o = cameraOutput();
    const ground = riding(); step(ground, m, o);
    const groundBack = o.pos.z - ground.pos.z, groundHeight = o.pos.y - ground.pos.y, groundFov = o.fov;
    let s;
    for (let i = 0; i < 120; i++) { s = airborne(i, 0); step(s, m, o, { heightAt: high }); }
    // 置き方の値は実画面で調整する。試験は「上がる・視野を絞る・離れすぎない」を、実装の値で確かめる
    expect(o.pos.z - s.pos.z).toBeCloseTo(groundBack + AIR_FRAME.back, 1);
    expect(o.pos.y - s.pos.y).toBeGreaterThan(groundHeight + 0.6);
    expect(o.fov).toBeCloseTo(groundFov + AIR_FRAME.fov, 1);
    // 短い浮き（0.25 秒未満）では動かさない
    const m2 = createCameraMemory(), o2 = cameraOutput(), hop = riding({ mode: 'air' }); hop.air.time = 0.1;
    for (let i = 0; i < 30; i++) step(hop, m2, o2);
    expect(o2.pos.z - hop.pos.z).toBeCloseTo(groundBack, 5);
    // 着地すれば元へ戻る
    for (let i = 0; i < 240; i++) step(ground, m, o);
    expect(o.pos.z - ground.pos.z).toBeCloseTo(groundBack, 2);
  });
  it('looks toward the predicted landing, and rises when a crest hides it', () => {
    // 高さ 6 m を北へ進む。雪面が 100 m 下なら着地の見込みは無く、雪面が 0 m なら、およそ 1.2 秒先・18 m 先に落ちる
    const settle = (heightAt) => {
      const m = createCameraMemory(), o = cameraOutput(); let s;
      for (let i = 0; i < 90; i++) { s = airborne(i, 0); step(s, m, o, { heightAt }); }
      return { o, s };
    };
    const none = settle(high), near = settle(() => 0);
    // 視線の先が、着地の見込みの場所（足もとより 5 m 下）へ下がる
    expect(near.o.target.y).toBeLessThan(none.o.target.y - 1.5);
    // カメラと着地の見込みの場所のあいだに、こぶ（滑走者の 6〜10 m 先・高さ 4.6 m）があると、カメラが上がる
    const crest = settle((x, z) => { const s = -(90 - 1) * 0.25, d = s - z; return d > 6 && d < 10 ? 4.6 : 0; });
    expect(crest.o.pos.y).toBeGreaterThan(near.o.pos.y + 0.5);
    expect(crest.o.pos.y).toBeLessThan(near.o.pos.y + 5.5);
  });
  it('keeps the first-person eye level during a flip', () => {
    const m = createCameraMemory(), o = cameraOutput(), look = { yaw: 0, pitch: 0, camera: 'first' };
    for (let i = 0; i < 120; i++) {
      const s = airborne(i, i / 60 * Math.PI * 2 + 1e-6);
      // 頭は体と一緒に回っている（姿勢の出力）。カメラはそれを追わない
      const pose = { joints: { head: { x: 0, y: s.com.y + Math.cos(s.air.flip) * 0.8, z: s.com.z - Math.sin(s.air.flip) * 0.8 }, pelvis: { x: 0, y: s.com.y, z: s.com.z } } };
      step(s, m, o, { heightAt: high, look, pose });
      if (i > 40) { expect(Math.abs(o.pos.y - (s.com.y - 0.8 + 1.65))).toBeLessThan(0.02); expect(o.up.y).toBeGreaterThan(0.99); }
    }
  });
});
