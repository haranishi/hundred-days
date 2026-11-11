import { clamp, set, turn, transport, cross, tangent, normalize, dot, wrap } from './vec.js';

/** Flat numeric memory makes snapshots and rollback independent of scratch vectors. */
export function initAirBasis(ctx) {
  const s = ctx.state, m = ctx.mem, a = s.air.flip, c = Math.cos(a), q = Math.sin(a);
  m.baseUX = c * s.up.x - q * s.fwd.x; m.baseUY = c * s.up.y - q * s.fwd.y; m.baseUZ = c * s.up.z - q * s.fwd.z;
  m.baseFX = q * s.up.x + c * s.fwd.x; m.baseFY = q * s.up.y + c * s.fwd.y; m.baseFZ = q * s.up.z + c * s.fwd.z;
  m.airBasis = true;
}
function assist(error, time, p) {
  return Math.abs(error) <= p.trickAssistAngle ? clamp(error, -p.trickAssistSpeed * time, p.trickAssistSpeed * time) : 0;
}
/** Pure prediction: collision bisection must never advance angular memory. */
export function predictTricks(ctx, t) {
  const s = ctx.state, m = ctx.mem, p = ctx.p, c = ctx.controls, f = ctx.flight;
  const elapsed = Math.max(0, s.air.time + t - Math.max(s.air.time, p.trickDelay));
  const active = elapsed < p.epsilon ? 0 : elapsed;
  const spinAllowed = c.jump || (m.seeded && c.steer * m.seedSide > 0);
  const spinTarget = spinAllowed ? c.steer * (c.jump ? p.spinGrab : p.spinCruise) : 0;
  const spinTau = spinAllowed ? p.trickResponse : p.trickDecay;
  // Build control response during the gate, but integrate no visible rotation there.
  const spinStart = spinTarget + (m.spin - spinTarget) * Math.exp(-(t - active) / spinTau);
  const spinStep = -Math.expm1(-active / spinTau);
  f.spinRate = spinTarget + (m.spin - spinTarget) * Math.exp(-t / spinTau);
  let yaw = spinTarget * active + (spinStart - spinTarget) * spinTau * spinStep;
  const flipInput = c.jump ? c.tuck - c.brake : 0;
  const flipTarget = flipInput * p.flipSpeed, flipTau = flipInput ? p.trickResponse : p.trickDecay;
  const flipStep = -Math.expm1(-active / flipTau);
  const flipStart = flipTarget + (m.flipRate - flipTarget) * Math.exp(-(t - active) / flipTau);
  f.flipRate = flipTarget + (m.flipRate - flipTarget) * Math.exp(-t / flipTau);
  const flipAngle = flipTarget * active + (flipStart - flipTarget) * flipTau * flipStep;
  // Work on the unflipped basis; the actual up vector may point into the snow.
  set(ctx.normal, m.baseUX, m.baseUY, m.baseUZ);
  set(ctx.direction, m.baseFX, m.baseFY, m.baseFZ);
  const angle = Math.acos(clamp(m.baseUX * f.nx + m.baseUY * f.ny + m.baseUZ * f.nz, -1, 1));
  const blend = angle > p.epsilon ? Math.min(1, p.airAlign * t / angle) : 1;
  set(ctx.temp2, m.baseUX + (f.nx - m.baseUX) * blend, m.baseUY + (f.ny - m.baseUY) * blend, m.baseUZ + (f.nz - m.baseUZ) * blend);
  normalize(ctx.temp2, ctx.temp2); transport(ctx.direction, ctx.normal, ctx.temp2, ctx.direction); set(ctx.normal, ctx.temp2.x, ctx.temp2.y, ctx.temp2.z);
  if (!spinAllowed) {
    cross(ctx.direction, ctx.normal, ctx.lateralDirection);
    tangent(s.vel, ctx.normal, ctx.temp2); normalize(ctx.temp2, ctx.temp2);
    let error = Math.atan2(dot(ctx.temp2, ctx.lateralDirection), dot(ctx.temp2, ctx.direction));
    if (Math.abs(error) > Math.PI / 2) error -= Math.sign(error) * Math.PI;
    if (!m.hadTrick && s.air.flip === 0) yaw = clamp(error, -p.airAlign * t, p.airAlign * t);
    else yaw += assist(wrap(error - yaw), active, p);
  }
  turn(ctx.direction, ctx.normal, yaw, ctx.direction);
  f.bux = ctx.normal.x; f.buy = ctx.normal.y; f.buz = ctx.normal.z;
  f.bfx = ctx.direction.x; f.bfy = ctx.direction.y; f.bfz = ctx.direction.z;
  f.yaw = yaw;
  f.flip = s.air.flip + flipAngle;
  if (!flipInput) f.flip += assist(-wrap(f.flip), active, p);
  const co = Math.cos(f.flip), si = Math.sin(f.flip);
  f.ux = co * f.bux + si * f.bfx; f.uy = co * f.buy + si * f.bfy; f.uz = co * f.buz + si * f.bfz;
  f.fx = co * f.bfx - si * f.bux; f.fy = co * f.bfy - si * f.buy; f.fz = co * f.bfz - si * f.buz;
}
export function updateGrab(ctx, t) {
  const s = ctx.state, m = ctx.mem, c = ctx.controls, p = ctx.p;
  if (c.jump) {
    if (!m.grabbing) { m.grabHeld = 0; m.grabKind = c.steer < 0 ? 2 : c.steer > 0 ? 3 : 1; }
    m.grabHeld += t;
    // The hand starts reaching as soon as the stance is held; scoring still needs the confirmed grab below.
    s.air.reach = m.grabKind; s.air.reachTime = m.grabHeld;
    if (m.grabHeld >= s.air.grabTime) {
      s.air.grabTime = m.grabHeld;
      if (m.grabHeld + p.epsilon >= p.grabConfirm) s.air.grab = m.grabKind;
    }
  } else { s.air.reach = 0; s.air.reachTime = 0; }
  m.grabbing = c.jump;
}
