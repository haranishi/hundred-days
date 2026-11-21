// 距離は cm、方位と仰角はラジアン。方位 0 は盤の手前（+z）、視野角だけは three に合わせて度。
import { CAMERA_PRESETS } from './contract.js';

export const RAD = Math.PI / 180;
export const DEFAULT_FOV = 35;
export const MIN_PITCH = 4 * RAD;
export const MAX_PITCH = 88 * RAD;
const CLOSE_SCALE = 0.45;
const pitches = { cook: 42, side: 10, top: 88, front: 10, closeup: 42 };

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const validAspect = (n) => Number.isFinite(n) && n > 0 ? n : 1;
export const validFov = (n) => Number.isFinite(n) ? clamp(n, 1, 175) : DEFAULT_FOV;

export function wrapAngle(angle) {
  if (!Number.isFinite(angle)) return 0;
  const turn = 2 * Math.PI;
  return ((angle + Math.PI) % turn + turn) % turn - Math.PI;
}

export function shortestAngle(from, to) {
  return wrapAngle(to - from);
}

/** 臨界減衰の解析解。刻みを分割しても同じ位置と速度に着く。 */
export function springStep(value, velocity, target, dt, omega = 16) {
  if (!(dt > 0) || !(omega > 0)) return { value, velocity };
  const decay = Math.exp(-omega * dt);
  if (decay === 0) return { value: target, velocity: 0 };
  const offset = value - target;
  const drift = (velocity + omega * offset) * dt;
  return { value: target + (offset + drift) * decay, velocity: (velocity - omega * drift) * decay };
}

function triple(p) {
  const a = p?.isVector3 ? [p.x, p.y, p.z] : p;
  return a?.length === 3 && Array.from(a).every(Number.isFinite) ? Array.from(a) : null;
}

/** 解剖の min/max、three の Box3、または既知の外接球を受け取る。 */
export function boundingSphere(bounds) {
  const center = triple(bounds?.center);
  if (center && Number.isFinite(bounds.radius) && bounds.radius > 0) return { center, radius: bounds.radius };
  const lo = triple(bounds?.min), hi = triple(bounds?.max);
  if (lo && hi && hi.every((n, i) => n >= lo[i])) {
    const half = hi.map((n, i) => (n - lo[i]) / 2);
    return { center: lo.map((n, i) => n + half[i]), radius: Math.max(0.1, Math.hypot(...half)) };
  }
  return { center: [0, 2, 0], radius: 14 };
}

export function focusPoint(bounds, focus) {
  return triple(focus) ?? boundingSphere(bounds).center;
}

export function orbitToPosition({ yaw, pitch, distance, target }) {
  const horizontal = distance * Math.cos(pitch);
  return [target[0] + horizontal * Math.sin(yaw), target[1] + distance * Math.sin(pitch),
    target[2] + horizontal * Math.cos(yaw)];
}

export function positionToOrbit(position, target = [0, 0, 0]) {
  const [x, y, z] = position.map((n, i) => n - target[i]);
  return { yaw: Math.atan2(x, z), pitch: Math.atan2(y, Math.hypot(x, z)),
    distance: Math.hypot(x, y, z), target: [...target] };
}

export function cameraAxes(yaw, pitch) {
  const s = Math.sin(yaw), c = Math.cos(yaw), h = Math.sin(pitch);
  return { right: [c, 0, -s], up: [-s * h, Math.cos(pitch), -c * h] };
}

/** 投影面と球の接線を使う。縦長の画面では水平の視野が先に上限に達する。 */
export function distanceForSphere(radius, fov = DEFAULT_FOV, aspect = 1) {
  const tangent = Math.tan(validFov(fov) * RAD / 2) * Math.min(1, validAspect(aspect));
  return Math.max(0.1, radius) / Math.sin(Math.atan(tangent));
}

export function limitPan(point, origin, radius) {
  const offset = point.map((n, i) => n - origin[i]);
  const length = Math.hypot(...offset);
  return length > radius ? origin.map((n, i) => n + offset[i] / length * radius) : point.slice();
}

/** focus は反転前の盤座標。部位を指定した接写では、その部位を中心に画面を切り取る。 */
export function presetOrbit(name, bounds, options = {}) {
  const preset = CAMERA_PRESETS.includes(name) ? name : 'cook';
  const { center, radius } = boundingSphere(bounds);
  const focus = triple(options.focus);
  const target = focusPoint({ center, radius }, focus);
  const aspect = validAspect(options.aspect);
  let fov = validFov(options.fov);
  const zoom = Number.isFinite(options.zoom) && options.zoom > 0 ? clamp(options.zoom, 0.25, 8) : 1;
  const offset = Math.hypot(...target.map((n, i) => n - center[i]));
  const frameRadius = radius + (preset === 'closeup' ? 0 : offset);
  let distance = Math.max(1.10 * distanceForSphere(frameRadius, fov, aspect), frameRadius * 1.08 / CLOSE_SCALE);
  if (preset === 'closeup') {
    distance *= CLOSE_SCALE;
    if (!focus) {
      // 部位の指定がない接写はカメラを寄せ、球の端が切れないところまで画角を開く。
      const half = Math.asin(radius * 1.025 / distance);
      fov = Math.max(fov, 2 * Math.atan(Math.tan(half) / Math.min(1, aspect)) / RAD);
    }
  }
  // 頭は休めの姿勢で -x。置き方が変わる手順では盤上の頭の向きを渡せる。
  const head = triple(options.headDirection) ?? [-1, 0, 0];
  const heading = preset === 'front' ? Math.atan2(head[0], head[2]) : 0;
  return {
    yaw: Number.isFinite(options.yaw) ? wrapAngle(options.yaw) : heading,
    pitch: clamp(Number.isFinite(options.pitch) ? options.pitch : pitches[preset] * RAD, MIN_PITCH, MAX_PITCH),
    distance: distance / zoom, target, fov,
  };
}
