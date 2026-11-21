// 距離は cm、方位と仰角はラジアン。方位 0 は盤の手前（+z）、視野角だけは three に合わせて度。
import { CAMERA_PRESETS } from './contract.js';

export const RAD = Math.PI / 180;
export const DEFAULT_FOV = 35;
export const MIN_PITCH = 4 * RAD;
export const MAX_PITCH = 88 * RAD;
// 外接球だけが分かるとき（箱が無いとき）の接写は、球が画面から切れない近さまでにする。箱が分かるときは distanceForBox で決める。
const CLOSE_SCALE = 0.92;
// 箱で決める接写は、収まる距離より少し引く（実寸の包丁が近づいて画面をふさがないように。寄る代わりに注視点を注目点へ寄せる）。
const CLOSE_BOX_SCALE = 1.18;
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

/** Box3 または {min, max} から箱を取り出す。外接球だけのときは null。 */
export function boxOf(bounds) {
  const lo = triple(bounds?.min), hi = triple(bounds?.max);
  return lo && hi && hi.every((n, i) => n >= lo[i]) ? { min: lo, max: hi } : null;
}

/**
 * 箱の8つの角がすべて画面に収まる最小の距離（視線の向き・画角・縦横比から）。
 * 外接球で決めると、横に長い内容を横長の画面に映すとき、縦の幅に合わせて小さく写ってしまう。
 */
export function distanceForBox(box, { yaw, pitch, target, fov = DEFAULT_FOV, aspect = 1, pad = 1.06 }) {
  const { right, up } = cameraAxes(yaw, pitch);
  // 目標からカメラへ向かう単位ベクトル。奥行き＝距離 − (相対位置・dir)。
  const dir = orbitToPosition({ yaw, pitch, distance: 1, target: [0, 0, 0] });
  const tanV = Math.tan(validFov(fov) * RAD / 2), tanH = tanV * validAspect(aspect);
  let need = 0;
  for (const x of [box.min[0], box.max[0]]) for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]]) {
    const rel = [x - target[0], y - target[1], z - target[2]];
    const dot = (a) => a[0] * rel[0] + a[1] * rel[1] + a[2] * rel[2];
    const toward = dot(dir);
    need = Math.max(need, Math.abs(dot(right)) * pad / tanH + toward, Math.abs(dot(up)) * pad / tanV + toward);
  }
  return Math.max(0.1, need);
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
  const focused = focusPoint({ center, radius }, focus);
  // 魚の中心を主にして、注目点へ寄せる（頭や尾が画面から切れない）。接写は寄せ方をやや強くする。
  const bias = preset === 'closeup' ? 0.4 : 0.3;
  const target = focused.map((n, i) => center[i] + bias * (n - center[i]));
  const aspect = validAspect(options.aspect);
  let fov = validFov(options.fov);
  // 手順が指定する寄りは控えめに効かせる（実寸の包丁が画面を覆わないように）。寄りは平方根・上限1.05、引きはそのまま。
  const rawZoom = Number.isFinite(options.zoom) && options.zoom > 0 ? clamp(options.zoom, 0.25, 8) : 1;
  // 全体を見せる視点（台所・真横・真上・正面）は寄らない（魚が画面から切れない）。寄りが効くのは接写だけ。
  const zoom = rawZoom <= 1 ? rawZoom : preset === 'closeup' ? Math.min(1.05, Math.sqrt(rawZoom)) : 1;
  // 箱が分かるときは、箱の角が画面に収まる距離で決める（球より、横長の画面で魚が大きく写る）。
  const box = options.box ? boxOf(options.box) : null;
  let distance;
  if (!box) {
    // 外接球だけが分かるとき（試験や箱を持たない呼び出し）：球を包む距離で決める。
    const offset = Math.hypot(...target.map((n, i) => n - center[i]));
    const frameRadius = radius + offset;
    distance = Math.max(1.10 * distanceForSphere(frameRadius, fov, aspect), frameRadius * 1.08 / CLOSE_SCALE);
    if (preset === 'closeup') {
      distance *= CLOSE_SCALE;
      if (!focus) {
        // 部位の指定がない接写はカメラを寄せ、球の端が切れないところまで画角を開く。
        const half = Math.asin(radius * 1.025 / distance);
        fov = Math.max(fov, 2 * Math.atan(Math.tan(half) / Math.min(1, aspect)) / RAD);
      }
    }
  }
  // 頭は休めの姿勢で -x。置き方が変わる手順では盤上の頭の向きを渡せる。
  const head = triple(options.headDirection) ?? [-1, 0, 0];
  const heading = preset === 'front' ? Math.atan2(head[0], head[2]) : 0;
  const yaw = Number.isFinite(options.yaw) ? wrapAngle(options.yaw) : heading;
  const pitch = clamp(Number.isFinite(options.pitch) ? options.pitch : pitches[preset] * RAD, MIN_PITCH, MAX_PITCH);
  if (box) {
    // 台所・真横・真上・正面は、箱の角がちょうど収まる距離。接写は注視点を注目点へ寄せたうえで、少しだけ引く。
    distance = distanceForBox(box, { yaw, pitch, target, fov, aspect }) * (preset === 'closeup' ? CLOSE_BOX_SCALE : 1);
  }
  return { yaw, pitch, distance: distance / zoom, target, fov };
}
