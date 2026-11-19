export const UP = Object.freeze([0, 1, 0]);
export const ORIGIN = Object.freeze([0, 0, 0]);
export const IDENTITY = Object.freeze([0, 0, 0, 1]);
export const RAD = Math.PI / 180;

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (v, factor) => [v[0] * factor, v[1] * factor, v[2] * factor];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = (v) => scale(v, 1 / Math.hypot(v[0], v[1], v[2]));
export const bearing = (v) => Math.atan2(v[0], v[2]);
export const direction = (az, rise) => [Math.sin(az) * Math.cos(rise), Math.sin(rise), Math.cos(az) * Math.cos(rise)];

export const conjugate = (q) => [-q[0], -q[1], -q[2], q[3]];
export const normalizeQuat = (q) => {
  const norm = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / norm, q[1] / norm, q[2] / norm, q[3] / norm];
};

export function multiplyQuat(a, b) {
  const [x, y, z, w] = a;
  const [u, v, s, t] = b;
  return [
    w * u + x * t + y * s - z * v,
    w * v - x * s + y * t + z * u,
    w * s + x * v - y * u + z * t,
    w * t - x * u - y * v - z * s,
  ];
}

export function rotate(q, v) {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx];
}

export function rotationArc(from, to) {
  const axis = cross(from, to);
  const sine = Math.hypot(...axis);
  const cosine = dot(from, to);
  if (sine > 1e-12) return { axis: scale(axis, 1 / sine), angle: Math.atan2(sine, cosine) };
  // 真反対では最短弧が複数あるため、つかんだ向きと直交する決まった軸を選ぶ。
  const basis = Math.abs(from[1]) > 0.9 ? [1, 0, 0] : UP;
  return { axis: unit(cross(from, basis)), angle: cosine < 0 ? Math.PI : 0 };
}

export function axisAngle(axis, angle) {
  const half = angle / 2;
  const s = Math.sin(half);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}
