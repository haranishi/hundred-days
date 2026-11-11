/** Small allocation-free vector helpers. Arguments may alias the destination. */
export function set(out, x, y, z) { out.x = x; out.y = y; out.z = z; return out; }
export function copy(src, out) { return set(out, src.x, src.y, src.z); }
export function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
export function length(v) { return Math.hypot(v.x, v.y, v.z); }
export function scale(v, k, out) { return set(out, v.x * k, v.y * k, v.z * k); }
export function cross(a, b, out) { return set(out, a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
export function normalize(v, out) {
  const s = length(v);
  return s > 1e-15 ? scale(v, 1 / s, out) : set(out, 0, 0, 0);
}
export function tangent(v, n, out) {
  const k = dot(v, n); return set(out, v.x - k * n.x, v.y - k * n.y, v.z - k * n.z);
}
export function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
export function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
export function finite(v) { return Number.isFinite(v) ? v : 0; }
export function headingVector(heading, n, out) {
  set(out, Math.sin(heading), 0, -Math.cos(heading)); tangent(out, n, out); return normalize(out, out);
}
export function headingOf(v) { return Math.atan2(v.x, -v.z); }
/** Rodrigues minimal rotation between normals preserves speed without projection loss. */
export function transport(v, from, to, out) {
  const x = from.y * to.z - from.z * to.y;
  const y = from.z * to.x - from.x * to.z;
  const z = from.x * to.y - from.y * to.x;
  const d = clamp(dot(from, to), -1, 1);
  if (d < -0.999999) return scale(v, -1, out);
  const k = (x * v.x + y * v.y + z * v.z) / (1 + d);
  return set(out, v.x * d + y * v.z - z * v.y + x * k,
    v.y * d + z * v.x - x * v.z + y * k, v.z * d + x * v.y - y * v.x + z * k);
}
/** Rotate within a tangent plane, positive towards t × n (screen right). */
export function turn(v, n, angle, out) {
  const c = Math.cos(angle), s = Math.sin(angle), d = dot(v, n) * (1 - c);
  return set(out, v.x * c + (v.y * n.z - v.z * n.y) * s + n.x * d,
    v.y * c + (v.z * n.x - v.x * n.z) * s + n.y * d,
    v.z * c + (v.x * n.y - v.y * n.x) * s + n.z * d);
}
