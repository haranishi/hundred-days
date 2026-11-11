import { edgeGrip } from './params.js';
import { dot, cross, scale, set, length, clamp, turn, wrap } from './vec.js';
import { dragForce } from './aero.js';
import { carveForces } from './carve.js';

function shrink(value, amount) { return Math.sign(value) * Math.max(0, Math.abs(value) - amount); }
export function skidForces(ctx, force, plow, dt) {
  const s = ctx.state, m = ctx.mem, p = ctx.p, c = ctx.controls, mat = ctx.material;
  if (c.brake <= p.brakeThreshold && c.steer !== 0) { carveForces(ctx, force, plow, dt); return; }
  if (c.steer !== 0) m.side = Math.sign(c.steer);
  const speed = length(s.vel);
  if (speed > p.epsilon) scale(s.vel, 1 / speed, ctx.direction);
  else scale(s.fwd, s.switch ? -1 : 1, ctx.direction);
  cross(ctx.direction, s.up, ctx.lateralDirection);
  const sign = s.switch ? -1 : 1;
  const beta = Math.atan2(dot(s.fwd, ctx.lateralDirection) * sign, dot(s.fwd, ctx.direction) * sign);
  const target = c.brake ** p.brakeExponent * p.skidAngle * m.side;
  const omega = p.skidOmega * (s.load < p.lightLoad ? p.lightResponse : 1);
  if (speed <= p.holdSpeed && c.brake > p.brakeThreshold) s.yawRate = 0;
  else s.yawRate += (omega * omega * wrap(target - beta) - 2 * p.skidDamping * omega * s.yawRate) * dt;
  turn(s.fwd, s.up, s.yawRate * dt, s.fwd); cross(s.fwd, s.up, s.right);
  // Apply gravity before resistance, then cap both axis impulses at zero speed.
  s.vel.x += ctx.gravity.x * dt; s.vel.y += ctx.gravity.y * dt; s.vel.z += ctx.gravity.z * dt;
  let u = dot(s.vel, s.fwd), w = dot(s.vel, s.right);
  const phi = p.skidEdgeBase + p.skidEdgeBrake * c.brake;
  const grip = mat.lambda * edgeGrip(phi, p);
  const dynamic = p.skidDynamic + (p.skidIceDynamic - p.skidDynamic) * s.snow.ice;
  const dyn = dynamic * grip * force;
  // Static snow support holds a braked stop without chasing a noisy velocity heading.
  if (c.brake > p.brakeThreshold && speed <= p.holdSpeed && speed < p.skidLowSpeed && p.mass * length(ctx.gravity) <= dyn) {
    set(s.vel, 0, 0, 0); s.speed = s.yawRate = 0;
    s.tele.edgeForce = s.tele.skidPower = s.tele.carveDrag = s.tele.spray = 0; return;
  }
  const betaE = Math.atan2(Math.abs(w), Math.max(Math.abs(u), p.skidRegularSpeed));
  let sideForce = -Math.sign(w) * dyn * Math.tanh(p.skidSlope * betaE / Math.max(grip, p.epsilon));
  if (speed < p.skidLowSpeed) sideForce = -dyn * Math.tanh(w / p.skidRegularSpeed);
  sideForce = clamp(sideForce, -Math.abs(w) * p.mass / dt, Math.abs(w) * p.mass / dt);
  s.tele.skidPower = Math.max(0, -sideForce * w);
  const impulse = sideForce / p.mass * dt;
  u = shrink(u, mat.mu * force / p.mass * dt); w += impulse;
  set(s.vel, s.fwd.x * u + s.right.x * w, s.fwd.y * u + s.right.y * w, s.fwd.z * u + s.right.z * w);
  // 2026-11-11：舵を入れずに制動している間は、進む線を保つ。エッジの力のうち、進む向きに直角な成分を、ほとんど打ち消す
  // （減速する成分は、そのまま）。打ち消さないと、制動のたびに進む向きが 60〜90° 変わり、離しても戻らず、
  // 速さを調整して台や段へ入る遊びが成り立たなかった（体験の採点 1・2 周目）。舵を入れた制動（曲がりながら削る）は、これまでどおり
  const hold = c.steer === 0 ? p.skidLineHold * clamp(c.brake / p.skidLineBrake, 0, 1) : 0;
  if (hold > 0 && speed > p.skidLowSpeed) {
    const across = impulse * dot(s.right, ctx.lateralDirection) * hold;
    s.vel.x -= ctx.lateralDirection.x * across; s.vel.y -= ctx.lateralDirection.y * across; s.vel.z -= ctx.lateralDirection.z * across;
  }
  const before = length(s.vel), end = Math.max(0, before - (dragForce(before, s.crouch, p) + plow * (1 + p.skidPlow * Math.abs(Math.sin(beta)))) / p.mass * dt);
  if (before > p.epsilon) scale(s.vel, end / before, s.vel);
  // 止まりかけでは、傾きを浅くする（時速 1 km でも 45° 傾いたままで、転びかけに見えた：体験の採点 2 周目）
  s.edge = -Math.sign(w) * phi * clamp(speed / p.skidEdgeFullSpeed, 0.2, 1); s.slip = beta;
  s.tele.edgeForce = sideForce; s.tele.carveDrag = 0; s.tele.spray = clamp(s.tele.skidPower / p.sprayPower, 0, 1);
  m.recapture = c.brake <= p.brakeThreshold && Math.abs(beta) < p.recaptureAngle ? m.recapture + dt : 0;
  if (m.recapture >= p.recaptureTime) {
    s.mode = 'carve'; m.lateral = m.lateralRate = m.recapture = 0;
    m.low = length(s.vel) < p.lowEnter;
  }
}
