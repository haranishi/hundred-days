import { dragForce } from './aero.js';
export { dragForce } from './aero.js';
import { skidForces } from './skid.js';
import { carveForces } from './carve.js';
import { edgeGrip } from './params.js';
import { set, dot, cross, scale, length, normalize, clamp, headingOf, turn } from './vec.js';

function shrink(value, amount) { return Math.sign(value) * Math.max(0, Math.abs(value) - amount); }

export function accelerateGround(ctx, force, plow, dt) {
  const s = ctx.state, p = ctx.p, m = ctx.mem, c = ctx.controls, mat = ctx.material;
  if (c.steer !== 0) m.side = Math.sign(c.steer);
  const g = ctx.gravity;
  set(g, p.gravity * s.up.y * s.up.x, -p.gravity + p.gravity * s.up.y ** 2, p.gravity * s.up.y * s.up.z);
  // 板の先を谷へ向け直している間（noseDown）は、遅いときの計算を続ける（秒速 8 m まで）。向け直しが終わる前に速さが乗ると、
  // 後ろ向きのまま滑り出してしまう
  if (m.low ? s.speed > p.lowExit && !(m.noseDown && s.speed < p.noseDownMaxSpeed) : s.speed < p.lowEnter) {
    m.low = !m.low; m.lateral = m.lateralRate = 0;
    if (!m.low) m.noseDown = false;
  }
  if (c.brake > p.brakeThreshold && s.mode === 'carve') { s.mode = 'skid'; m.recapture = 0; }
  // At a steered stop, release into the low-speed axis solver instead of spinning a skid PD toward an undefined velocity.
  if (s.mode === 'skid' && c.brake <= p.brakeThreshold && m.low) {
    s.mode = 'carve'; m.lateral = m.lateralRate = m.recapture = 0; s.yawRate = 0; m.turningDownhill = true;
    // 2026-11-11：制動で止まってから離したときは、板の「先」を谷へ向け直す。横滑りの間、板は進む向きに対して回り続けるので、
    // 止まったときには谷の向きから 110〜240° を向いている。近いほうの端を谷へ向ける決まりのままだと、36 通り試して 36 通りとも、
    // 後ろ向き（スイッチ）で滑り出した（体験の採点 1 周目「止まってから離すと、板が逆向きになって滑り出した」）。
    // 別の直し方（止まる寸前に板を回す力を弱める＋境目を 125° にする）は、5 通りで後ろ向きが残り、向き直しの速さの試験も崩した
    m.noseDown = true;
  }
  if (s.mode === 'skid') { skidForces(ctx, force, plow, dt); return; }
  if (m.low && c.brake <= p.brakeThreshold) {
    cross(s.fwd, s.up, s.right);
    const canHold = Math.abs(p.mass * dot(g, s.fwd)) < p.holdFriction * force + p.epsilon &&
      Math.abs(p.mass * dot(g, s.right)) < mat.lambda * force * edgeGrip(p.holdEdge, p) + p.epsilon;
    if (s.speed < p.holdSpeed && canHold && !m.turningDownhill && c.steer === 0 && c.tuck === 0) {
      // 2026-11-11：斜面の上で、制動をかけずに止まったら（山側へ曲がりすぎた、など）、少し待って、板の先を谷へ向け直す。
      // 板が横を向いて止まると、エッジが効いて、そのまま動かない。ゆるい森の道で、いっぱいに曲げた人が 15 秒立ち往生した
      // （体験の採点 3 周目。設計役の通しの確認でも、40 秒止まったままだった）。止まっていたいときは、制動を押し続ける
      const across = Math.atan2(dot(g, s.right), dot(g, s.fwd));
      m.idle = (m.idle ?? 0) + dt;
      if (m.idle >= p.restartDelay && length(g) >= p.gravity * Math.sin(p.restartSlope) && Math.abs(across) > p.restartAngle) {
        m.turningDownhill = true; m.noseDown = true; m.idle = 0;
      } else { set(s.vel, 0, 0, 0); s.speed = s.yawRate = s.edge = 0; s.mode = 'carve'; return; }
    } else m.idle = 0;
    // 2026-11-11：遅いときの舵の効きの下限（lowYawFloor）を足した。効きを「1 − 速さ ÷ 3 m/s」で弱めるだけだと、秒速 2〜2.5 m（時速 7〜9 km）で
    // ほぼ 0 になり、舵を入れても向きが変わらなかった（体験の採点 1 周目。舵 0.5 を 1 秒で、秒速 1 m は 36°・2.5 m は 5°・3 m は 30°）。
    // 滑り出しの数秒が、いちばん舵の効かない速さに当たる
    let yaw = clamp(c.steer * p.lowYaw * Math.max(p.lowYawFloor, 1 - s.speed / p.lowExit), -p.turnYawMax, p.turnYawMax);
    if (c.steer === 0 && ((!canHold && (s.speed < p.holdSpeed || dot(s.vel, s.fwd) < 0)) || m.turningDownhill) && length(g) > p.epsilon) {
      // 止まりかけ（山側へ曲がりすぎて失速した、など）から滑り出すときも、板の先を谷へ向ける。近いほうの端を谷へ向ける決まりのままだと、
      // 森の道でいっぱいに曲げた人が、土手で失速して、後ろ向きのまま道を下った（2026-11-11 の通しの確認）。
      // 後ろ向きで、はっきり進んでいるとき（スイッチで滑っている）は、これまでどおり
      if (s.speed < p.holdSpeed) m.noseDown = true;
      let angle = Math.atan2(dot(g, s.right), dot(g, s.fwd));
      // A board has two usable ends: keep the nearer one downhill, including switch riding (except right after a braked stop: nose first).
      if (!m.noseDown && Math.abs(angle) > Math.PI / 2) angle -= Math.sign(angle) * Math.PI;
      m.turningDownhill = Math.abs(angle) > p.downhillAligned;
      if (!m.turningDownhill) m.noseDown = false;
      yaw = clamp(angle * p.downhillResponse, -p.downhillYaw, p.downhillYaw);
    }
    turn(s.fwd, s.up, yaw * dt, s.fwd); cross(s.fwd, s.up, s.right);
    let u = dot(s.vel, s.fwd) + dot(g, s.fwd) * dt;
    let w = dot(s.vel, s.right) + dot(g, s.right) * dt;
    u = shrink(u, mat.mu * force / p.mass * dt);
    w = shrink(w, mat.lambda * force * edgeGrip(p.holdEdge, p) / p.mass * dt);
    set(s.vel, s.fwd.x * u + s.right.x * w, s.fwd.y * u + s.right.y * w, s.fwd.z * u + s.right.z * w);
    const speed = length(s.vel), end = Math.max(0, speed - (dragForce(speed, s.crouch, p) + plow) / p.mass * dt);
    if (speed > p.epsilon) scale(s.vel, end / speed, s.vel);
    s.yawRate = yaw; s.switch = u < 0; s.slip = Math.atan2(w, Math.max(Math.abs(u), p.skidRegularSpeed));
    s.tele.edgeForce = 0; s.tele.carveDrag = 0;
    return;
  }
  carveForces(ctx, force, plow, dt);
}
