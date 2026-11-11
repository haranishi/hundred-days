/** Scalar critical damping. omega is angular frequency (s⁻¹), dt is seconds. */
export function makeSpring(x = 0) { return { x, v: 0 }; }
export function springTo(s, target, omega, dt) {
  if (!(dt > 0)) return s.x;
  omega = Math.max(0, omega);
  const t = omega * dt;
  // Avoid Infinity * 0 in the tail, including an arbitrarily large dt.
  if (t > 700) { s.x = target; s.v = 0; return s.x; }
  const y = s.x - target, c = s.v + omega * y, e = Math.exp(-t);
  s.x = target + (y + c * dt) * e;
  s.v = (s.v - omega * c * dt) * e;
  return s.x;
}
export function springAngleTo(s, target, omega, dt) {
  springTo(s, s.x + wrapAngle(target - s.x), omega, dt);
  s.x = wrapAngle(s.x); return s.x;
}
export function kick(s, velocity) { s.v += velocity; }
export function smoothTo(current, target, tau, dt) {
  if (!(dt > 0)) return current;
  if (!(tau > 0)) return target;
  return current + (target - current) * -Math.expm1(-dt / tau);
}
export function wrapAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
