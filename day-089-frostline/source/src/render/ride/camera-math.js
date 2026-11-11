import { makeSpring, springTo, springAngleTo, smoothTo, kick } from './springs.js';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/**
 * 三人称の置き方（[止まっているとき, 速さ 30 m/s で足す量]）。採点 2 周目を受けて、少し高く・後ろへ置き、先を遠くまで見るようにした：
 * 体が正面の木の根元を隠す／急斜面で画面いっぱいが雪面になり先が見えない、という指摘への対応。
 * lookSlope：視線を、斜面の角度の何割だけ傾けるか。1 にすると急斜面で雪面しか写らない。浅くすると、谷と地平線が画面に入る。
 * clearance：カメラの真下の雪面から保つ高さ（急斜面では、滑走者の後ろの雪面のほうが高い）。
 */
export const CAMERA = Object.freeze({ back: [6.0, 2.2], height: [2.6, 1.0], ahead: [4, 10], fov: [62, 20], lookSlope: 0.55, clearance: [2.2, 0.6] });
const MAX_AVOID = 4.5; // 障害物と地形を越えるために、カメラを上げる量の上限（m）
const MAX_PUSH = 3; // 枝ぶりの外へ、カメラを横へ押し出す量の上限（m）
/**
 * 空中（0.25 秒より長く浮いたとき）の置き方の足し引き。back・height・look は m、fov は度。
 * 少し寄って上げ、視野を絞る：技の姿勢が大きく見え、着地先も画面に入る。
 * 最初は 1.8 m 引いて視野を広げたが、時速 60 km の台で人物が画面の高さの 7% になり、技が見えなかった（2026-11-10 の実画面）。
 */
export const AIR_FRAME = Object.freeze({ after: 0.25, back: -1.2, height: 0.9, fov: -12, look: -1.0 });
/**
 * 空中で、着地の見込み（いまの速さのまま落ちた先）を画面に入れる。aim：視線を、見込みの場所へ寄せる割合。lift：見通すために上げる量の上限（m）。
 * 大きな段では、踏み切った直後、着地の面が縁のこぶに隠れて、降りる所が見えなかった（体験の採点 1 周目）
 */
export const AIR_LANDING = Object.freeze({ aim: 0.5, lift: 5, horizon: 3.2 });
const KEYS = ['headingTarget', 'turn', 'yaw', 'slope', 'lookYaw', 'lookPitch', 'dip', 'impactFov', 'x', 'y', 'z', 'tx', 'ty', 'tz', 'fov', 'roll', 'first', 'air'];
export function createCameraMemory() {
  const springs = {}; for (const key of KEYS) springs[key] = makeSpring();
  return { springs, initialized: false, lookIdle: 0, lastYaw: 0, lastPitch: 0, avoidance: 0, pushX: 0, pushZ: 0, land: 0, landX: 0, landY: 0, landZ: 0, landLift: 0 };
}
function drive(m, key, target, omega, dt, reset, angle = false) {
  const s = m.springs[key];
  if (reset) { s.x = target; s.v = 0; return target; }
  return angle ? springAngleTo(s, target, omega, dt) : springTo(s, target, omega, dt);
}
/** Pure camera values, metres / radians / seconds; fov is degrees. No renderer objects. */
export function updateCamera(input, memory, out) {
  const m = memory, s = input.state, dt = Math.max(0, input.dt), reset = input.jumped || !m.initialized;
  const look = input.look, speed = clamp(s.speed, 0, 30), ratio = speed / 30;
  // 追う点。宙返りの間、板は重心のまわりを回る（半径は脚の長さ）。板を追うと、カメラが 1 回転ごとに上下へ振れる。
  // 物理の決まり（ride-tricks の設計）：実際の上向き ＝ cos(flip)·基準の上 ＋ sin(flip)·基準の前。逆に解いて、宙返りを除いた足もとを追う
  const flip = s.mode === 'air' ? (s.air?.flip || 0) : 0;
  let ax = s.pos.x, ay = s.pos.y, az = s.pos.z;
  if (flip !== 0 && s.com) {
    const c = Math.cos(flip), q = Math.sin(flip), leg = s.leg || 0;
    ax = s.com.x - (c * s.up.x - q * s.fwd.x) * leg; ay = s.com.y - (c * s.up.y - q * s.fwd.y) * leg; az = s.com.z - (c * s.up.z - q * s.fwd.z) * leg;
  }
  const horizontal = Math.hypot(s.vel.x, s.vel.z);
  const heading = s.speed < 1 || horizontal < 1e-9 ? Math.atan2(s.fwd.x, -s.fwd.z) : Math.atan2(s.vel.x, -s.vel.z);
  // Cascaded target / turning response / actual heading filters avoid skid-induced yaw.
  const desired = drive(m, 'headingTarget', heading, 14, dt, reset, true);
  const turn = drive(m, 'turn', desired, 12, dt, reset, true);
  const yaw = drive(m, 'yaw', turn, 10, dt, reset, true);
  const slope = drive(m, 'slope', Math.atan2(s.vel.y, Math.max(1, horizontal)), 8, dt, reset);
  if (reset || look.yaw !== m.lastYaw || look.pitch !== m.lastPitch) m.lookIdle = 0;
  else m.lookIdle += dt;
  m.lastYaw = look.yaw; m.lastPitch = look.pitch;
  const ly = drive(m, 'lookYaw', m.lookIdle < 1.5 ? look.yaw : 0, 10, dt, reset, true);
  const lp = drive(m, 'lookPitch', m.lookIdle < 1.5 ? clamp(look.pitch, -1.2, 1.2) : 0, 10, dt, reset);
  if (reset) { m.avoidance = 0; m.pushX = 0; m.pushZ = 0; }
  for (let i = 0; i < input.events.length; i++) {
    if (input.events[i].type === 'land' && !reset) {
      const efh = clamp(input.events[i].efh, 0, 5);
      kick(m.springs.dip, -efh * 1.8); kick(m.springs.impactFov, efh * 8);
    }
  }
  const dip = drive(m, 'dip', 0, 16, dt, reset), impactFov = drive(m, 'impactFov', 0, 12, dt, reset);
  const first = clamp(drive(m, 'first', look.camera === 'first' ? 1 : 0, 14, dt, reset), 0, 1);
  const angle = yaw + ly, fx = Math.sin(angle), fz = -Math.cos(angle);
  // 空中では少し引いて上げ、視線を下げる：全身（技）と着地先が画面に入る。短い浮きでは動かさない
  const air = clamp(drive(m, 'air', s.mode === 'air' && (s.air?.time || 0) > AIR_FRAME.after ? 1 : 0, 5, dt, reset), 0, 1) * (1 - first);
  const back = CAMERA.back[0] + CAMERA.back[1] * ratio + AIR_FRAME.back * air, ahead = CAMERA.ahead[0] + CAMERA.ahead[1] * ratio;
  let x = ax - fx * back, y = ay + CAMERA.height[0] + CAMERA.height[1] * ratio + AIR_FRAME.height * air - Math.sin(slope) * back * 0.35 + dip, z = az - fz * back;
  // 腰の高さ：宙返りの間は、姿勢の腰（板と一緒に回る）でなく、追う点からの決まった高さを使う
  const waistY = flip !== 0 ? ay + 0.75 : input.pose?.joints.pelvis?.y ?? s.pos.y + Math.max(0.3, s.leg) * (1 - 0.3 * clamp(s.crouch, 0, 1)) + 0.11;
  let tx = ax + fx * ahead, ty = waistY + 0.2 + AIR_FRAME.look * air + Math.sin(slope * CAMERA.lookSlope + lp) * ahead, tz = az + fz * ahead;
  // 空中：このまま落ちた先を探す（0.2 秒きざみ・3.2 秒先まで）。見つかったら、視線をそこへ寄せる
  let found = 0, landDX = 0, landDY = 0, landDZ = 0;
  if (air > 0.02) for (let t = 0.2; t <= AIR_LANDING.horizon + 1e-9; t += 0.2) {
    const px = ax + s.vel.x * t, pz = az + s.vel.z * t, ground = input.heightAt(px, pz);
    if (ay + s.vel.y * t - 4.905 * t * t <= ground) { landDX = px - ax; landDY = ground - ay; landDZ = pz - az; found = 1; break; }
  }
  // 見込みの場所は、ゆっくり動かす（地形の段で、見込みが飛ぶことがある）。地面に戻ったら、ゆっくり外す
  if (reset) { m.land = 0; m.landLift = 0; }
  if (found) {
    const fresh = reset || m.land < 0.02;
    m.landX = fresh ? landDX : smoothTo(m.landX, landDX, 0.18, dt); m.landY = fresh ? landDY : smoothTo(m.landY, landDY, 0.18, dt); m.landZ = fresh ? landDZ : smoothTo(m.landZ, landDZ, 0.18, dt);
  }
  m.land = reset ? 0 : smoothTo(m.land, found * air, found ? 0.2 : 0.35, dt);
  const aim = m.land * AIR_LANDING.aim;
  tx += (ax + m.landX - tx) * aim; ty += (ay + m.landY + 0.6 - ty) * aim; tz += (az + m.landZ - tz) * aim;
  // 木や樹氷の枝ぶりの内側にカメラが入ったら、横へ押し出す（木のそばで、カメラが枝の中に入る絵があった：採点 1 周目）。
  // 当たりの半径は幹だけなので、見た目の枝ぶり（木は高さの約 4 分の 1、樹氷は当たりの半径の少し外）で判定する
  let pushX = 0, pushZ = 0;
  if (first < 0.99 && input.obstacles) for (let i = 0; i < input.obstacles.length; i++) {
    const o = input.obstacles[i];
    if (o.type === 'rock') continue;
    const crown = (o.type === 'monster' ? o.radius * 1.25 : o.height * 0.24) + 0.5;
    const ox = x - o.x, oz = z - o.z, d = Math.hypot(ox, oz);
    if (d >= crown || y > input.heightAt(o.x, o.z) + o.height + 0.5) continue;
    if (d > 1e-3) { pushX += ox * (crown - d) / d; pushZ += oz * (crown - d) / d; }
    else { pushX += fz * crown; pushZ -= fx * crown; } // ちょうど軸の上なら、進む向きの横へ
  }
  const pushed = Math.hypot(pushX, pushZ);
  if (pushed > MAX_PUSH) { pushX *= MAX_PUSH / pushed; pushZ *= MAX_PUSH / pushed; }
  // すばやく出て、ゆっくり戻る（木立の中で、カメラが左右に振れ続けないように）
  m.pushX = reset ? pushX : smoothTo(m.pushX, pushX, Math.abs(pushX) > Math.abs(m.pushX) ? 0.06 : 0.6, dt);
  m.pushZ = reset ? pushZ : smoothTo(m.pushZ, pushZ, Math.abs(pushZ) > Math.abs(m.pushZ) ? 0.06 : 0.6, dt);
  x += m.pushX; z += m.pushZ;
  // カメラの真下の雪面から、決まった高さを保つ（一人称へ切り替える途中は、その割合だけ弱める）
  if (first < 0.99) {
    const need = input.heightAt(x, z) + CAMERA.clearance[0] + CAMERA.clearance[1] * ratio;
    if (y < need) y += (need - y) * (1 - first);
  }
  let avoid = 0;
  const startY = ay + 1, dx = x - ax, dz = z - az, len2 = dx * dx + dz * dz;
  const obstacles = input.obstacles;
  if (first < 0.99 && len2 > 1e-9) {
    if (obstacles) for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i], t = clamp(((o.x - ax) * dx + (o.z - az) * dz) / len2, 0, 1);
      const ox = ax + dx * t - o.x, oz = az + dz * t - o.z;
      // 滑走者のすぐそば（線の 3 割より手前）の障害物は、越えられない。無理に越えようとすると、割り算で高さが跳ね上がる
      // （樹氷に当たった直後、カメラがはるか上空へ飛んだ：採点 1 周目）
      if (t > 0.3 && ox * ox + oz * oz <= (o.radius + 0.6) ** 2) {
        const top = input.heightAt(o.x, o.z) + o.height + 0.6;
        avoid = Math.max(avoid, startY + (top - startY) / t - y);
      }
    }
    // Also lift over intervening terrain, using bounded work instead of a raycaster.
    for (let i = 3; i <= 8; i++) {
      const t = i / 9, ground = input.heightAt(ax + dx * t, az + dz * t) + 0.4;
      avoid = Math.max(avoid, startY + (ground - startY) / t - y);
    }
  }
  // 上げる量には上限を置く（越えきれない物は、越えない）
  avoid = clamp(avoid, 0, MAX_AVOID);
  m.avoidance = reset ? avoid : smoothTo(m.avoidance, avoid, avoid > m.avoidance ? 0.04 : 0.8, dt);
  y += m.avoidance;
  // 空中：カメラから着地の見込みの場所までの線が、雪面（縁のこぶ）に隠れるなら、カメラを上げる。
  // カメラを L 上げると、線の途中（割合 t）は L×(1−t) 上がる。すばやく上げて、ゆっくり戻す
  let lift = 0;
  if (m.land > 0.02 && first < 0.99) {
    const ex = ax + m.landX, ey = ay + m.landY + 0.6, ez = az + m.landZ;
    for (let i = 1; i <= 7; i++) {
      const t = i / 8, ground = input.heightAt(x + (ex - x) * t, z + (ez - z) * t) + 0.5, line = y + (ey - y) * t;
      if (ground > line) lift = Math.max(lift, (ground - line) / (1 - t));
    }
    lift = clamp(lift, 0, AIR_LANDING.lift) * clamp(m.land * 2, 0, 1);
  }
  m.landLift = reset ? 0 : smoothTo(m.landLift, lift, lift > m.landLift ? 0.08 : 0.6, dt);
  y += m.landLift;
  // R1: spring offsets so constant riding speed cannot add metres of follow lag,
  // particularly in first person where the camera must stay attached to the head.
  out.pos.x = ax + drive(m, 'x', x - ax, 16, dt, reset);
  out.pos.y = ay + drive(m, 'y', y - ay, 16, dt, reset);
  out.pos.z = az + drive(m, 'z', z - az, 16, dt, reset);
  out.target.x = ax + drive(m, 'tx', tx - ax, 16, dt, reset);
  out.target.y = ay + drive(m, 'ty', ty - ay, 16, dt, reset);
  out.target.z = az + drive(m, 'tz', tz - az, 16, dt, reset);
  if (first > 0) {
    // 一人称：宙返りの間は、頭（体と一緒に回る）でなく、追う点の上の決まった高さに目を置く（視界ごと回さない）
    const head = flip !== 0 ? null : input.pose?.joints.head;
    const hx = head ? head.x : ax, hy = head ? head.y : ay + 1.65, hz = head ? head.z : az;
    // The pose already filters the head: filtering it again would detach the view.
    out.pos.x += (hx - out.pos.x) * first; out.pos.y += (hy + dip * 0.3 - out.pos.y) * first; out.pos.z += (hz - out.pos.z) * first;
    out.target.x += (hx + fx * 8 - out.target.x) * first;
    out.target.y += (hy + Math.sin(slope + lp) * 8 - out.target.y) * first;
    out.target.z += (hz + fz * 8 - out.target.z) * first;
  }
  const rough = clamp(s.snow.rough, 0, 1), skid = clamp(s.tele.skidPower / 12000, 0, 1);
  // 速さの寄与を 0.2 → 0.55 に上げた：時速 109 km でも画面が落ち着いて見え、速さが伝わらなかった（採点 1 周目）
  const strength = clamp(ratio * 0.55 + rough * 0.5 + skid * 0.35, 0, 1);
  const amplitude = strength * strength * clamp(input.shake, 0, 1) * 0.06, time = input.time;
  out.pos.x += amplitude * (Math.sin(time * 31.7) + 0.4 * Math.sin(time * 59.3));
  out.pos.y += amplitude * (Math.sin(time * 37.1 + 0.6) + 0.3 * Math.sin(time * 67.7));
  // 最後の守り：雪面から 1.2 m。急な面では、垂直の高さではなく面からの距離で測る（岩壁の前で、カメラが壁にめり込んだ：採点 2 周目）
  const gx = (input.heightAt(out.pos.x + 1, out.pos.z) - input.heightAt(out.pos.x - 1, out.pos.z)) / 2;
  const gz = (input.heightAt(out.pos.x, out.pos.z + 1) - input.heightAt(out.pos.x, out.pos.z - 1)) / 2;
  const floor = input.heightAt(out.pos.x, out.pos.z) + 1.2 * Math.min(2.5, Math.sqrt(1 + gx * gx + gz * gz));
  if (out.pos.y < floor) {
    out.pos.y = floor; m.springs.y.x = Math.max(m.springs.y.x, floor - ay); m.springs.y.v = Math.max(0, m.springs.y.v);
  }
  // 一人称の傾き：板の角度の 1 割だけ。3 割では、地平線が 25〜30° 傾いて前が読めなかった（採点 1 周目）
  const roll = drive(m, 'roll', s.edge * 0.1 * first, 12, dt, reset);
  out.up.x = Math.cos(angle) * Math.sin(roll); out.up.y = Math.cos(roll); out.up.z = Math.sin(angle) * Math.sin(roll);
  const wide = CAMERA.fov[0] + CAMERA.fov[1] * ratio;
  out.fov = drive(m, 'fov', wide + AIR_FRAME.fov * air + (88 - wide) * first, 10, dt, reset) + impactFov;
  out.near = 0.1 - first * 0.05; m.initialized = true;
  return out;
}
