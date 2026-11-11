export function advance(r, seconds, controls = {}, hz = 120) {
  for (let i = 0; i < Math.round(seconds * hz); i++) r.step(controls, 1 / hz);
}
export function airborne(r, { height = 5, vx = 0, vy = 0, vz = 0, spin = 0, crouch = 0, heading = 0 } = {}) {
  const snap = r.snapshot(), s = snap.state; s.mode = 'air'; s.air.time = s.air.spin = 0; s.air.apex = height + 0.8; s.pos.y = height; s.com.y = height + 0.8; s.leg = 0.8;
  s.vel.x = vx; s.vel.y = vy; s.vel.z = vz; s.crouch = crouch; s.heading = heading;
  s.fwd.x = Math.sin(heading); s.fwd.y = 0; s.fwd.z = -Math.cos(heading);
  snap.memory.spin = snap.memory.initialSpin = spin; snap.memory.takeoffPop = spin !== 0; snap.memory.takeoffSent = false; r.restore(snap);
}
export function seeded(seed) {
  let state = seed >>> 0;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}
/** FNV-1a over a serializable state, never deep-compare a host/cyclic object. */
export function hash(value) {
  const serialized = JSON.stringify(value); let h = 2166136261;
  for (let i = 0; i < serialized.length; i++) { h ^= serialized.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
