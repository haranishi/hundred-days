import { flightAt } from './air.js';
import { set, copy, dot, cross, tangent, normalize, length, headingVector, headingOf, clamp, wrap } from './vec.js';
import { emit } from './state.js';

function clearance(ctx, t) {
  const s = ctx.state, f = ctx.flight;
  flightAt(ctx, t, ctx.temp);
  ctx.terrain.sampleSurface(ctx.temp.x, ctx.temp.z, ctx.surface);
  const board = ctx.temp.y - ctx.surface.h;
  // Radius is measured normal to the surface, not vertically on steep slopes.
  const x = s.com.x + s.vel.x * t + f.ax * t * t / 2;
  const y = s.com.y + s.vel.y * t + f.ay * t * t / 2;
  const z = s.com.z + s.vel.z * t + f.az * t * t / 2;
  ctx.terrain.sampleSurface(x, z, ctx.surface);
  const body = y - ctx.surface.h - ctx.p.bodyRadius / ctx.surface.ny;
  ctx.mem.bodyHit = body < board;
  return Math.min(board, body);
}
/** Search chronologically; endpoint-only tests miss a narrow ridge inside a tick. */
export function findLanding(ctx, dt) {
  const s = ctx.state, p = ctx.p;
  const segments = Math.max(1, Math.ceil((length(s.vel) * dt + p.gravity * dt * dt / 2 + Math.abs(s.leg - p.legAir)) / p.collisionInterval));
  let previous = 0;
  for (let i = 1; i <= segments; i++) {
    const t = dt * i / segments;
    if (clearance(ctx, t) <= 0) {
      let lo = previous, hi = t;
      for (let j = 0; j < p.collisionBisections; j++) {
        const mid = (lo + hi) / 2;
        if (clearance(ctx, mid) <= 0) hi = mid; else lo = mid;
      }
      const result = (lo + hi) / 2; clearance(ctx, result); return result;
    }
    previous = t;
  }
  return -1;
}
/** soft：着地点の雪のやわらかさ（0〜1。新雪の割合 × 深さ）。深い新雪は、転倒の境目を上げる */
export function landingSoftness(snow, p) {
  return clamp(snow.powder, 0, 1) * clamp(snow.depth / p.powderDepth, 0, 1);
}
export function landingReason(efh, delta, speed, crouch, p, soft = 0) {
  const limit = (crouch >= p.preparedMin && crouch <= p.preparedMax ? p.landingPrepared : p.landingHard) + p.landingPowder * soft;
  if (efh > limit) return 'landing-hard';
  if (delta > p.landingSide && speed > p.landingSideSpeed) return 'landing-sideways';
  return '';
}
export function land(ctx) {
  const s = ctx.state, m = ctx.mem, p = ctx.p;
  ctx.terrain.sampleSurface(s.pos.x, s.pos.z, ctx.surface); set(ctx.normal, ctx.surface.nx, ctx.surface.ny, ctx.surface.nz);
  const vn = Math.max(0, -dot(s.vel, ctx.normal)), efh = vn * vn / (2 * p.gravity);
  tangent(s.vel, ctx.normal, s.vel); s.speed = length(s.vel);
  tangent(s.fwd, ctx.normal, s.fwd); normalize(s.fwd, s.fwd);
  if (length(s.fwd) < p.epsilon) headingVector(s.heading, ctx.normal, s.fwd);
  const cosine = s.speed > p.epsilon ? clamp(dot(s.vel, s.fwd) / s.speed, -1, 1) : 1;
  const raw = Math.acos(cosine), delta = Math.acos(Math.abs(cosine));
  s.switch = raw > Math.PI / 2;
  copy(ctx.normal, s.up); cross(s.fwd, s.up, s.right); s.heading = headingOf(s.fwd);
  s.pos.y = ctx.surface.h;
  m.comOffsetX = s.com.x - s.pos.x - s.up.x * s.leg;
  m.comOffsetY = s.com.y - s.pos.y - s.up.y * s.leg;
  m.comOffsetZ = s.com.z - s.pos.z - s.up.z * s.leg;
  s.tele.lastImpact = efh;
  // 空中の間、雪質は踏み切った所の値のまま。着地点の雪を読み直す（新雪なら衝撃に強い）
  ctx.terrain.snowAt(s.pos.x, s.pos.z, s.snow);
  const soft = landingSoftness(s.snow, p), cushion = p.landingPowderSketch * soft;
  const residual = Math.abs(wrap(s.air.flip));
  // 横滑り（制動）の途中の小さな浮き：板が横を向いているのは、制動のため。着地の「横向き」の転倒・乱れに数えない。
  // 2026-11-11：急な斜面を制動で下ると、こぶで 0.01 秒浮いただけで「横向きに着地しました」と転んだ（体験の採点 2 周目）
  const braking = m.skidTakeoff && s.air.time < p.skidHopTime && !m.hadTrick;
  const side = braking ? 0 : delta;
  const reason = m.bodyHit || residual > p.flipCrash ? 'landing-inverted' : landingReason(efh, side, s.speed, s.crouch, p, soft);
  let quality = 'clean';
  if (residual > p.flipClean || side > p.landingSketchAngle || efh > p.landingSketch + cushion) quality = 'sketchy';
  else if (efh > p.landingHeavy + cushion) quality = 'heavy';
  if (m.takeoffSent || s.air.time + p.epsilon >= p.airEventTime) {
    const e = emit(ctx, 'land'); e.efh = efh; e.yawDeg = raw * 180 / Math.PI; e.quality = quality;
    e.spin = s.air.spin; e.flip = s.air.flip; e.grab = s.air.grab; e.grabTime = s.air.grabTime;
    e.air = s.air.time; e.drop = Math.max(0, s.air.apex - s.com.y); e.pop = m.takeoffPop; e.switchIn = m.switchIn; e.switchOut = s.switch;
  }
  m.unloadedTime = 0;
  m.legRate = -vn;
  if (m.takeoffPop) m.lateral = m.lateralRate = 0;
  m.breakTimer = m.recapture = 0;
  m.windup = 0;
  m.low = s.speed < p.lowEnter; m.popping = false;
  if (reason) { ctx.crash(reason); return; }
  s.mode = delta > p.landingSketchAngle ? 'skid' : 'carve'; // 制動の途中の浮きも、板が横なら、横滑りのまま続く
  if (quality === 'sketchy') {
    m.sketch = p.sketchTime; s.vel.x *= p.sketchSpeed; s.vel.y *= p.sketchSpeed; s.vel.z *= p.sketchSpeed; s.speed *= p.sketchSpeed;
  }
}
