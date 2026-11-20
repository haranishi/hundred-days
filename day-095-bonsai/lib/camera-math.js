// 視点の数値だけを扱う。three.js を知らないので、操作の範囲と光線を Node で試験できる。
// 方位は契約どおり「+Z から右へ」。controls.js のパン軸（右・上）と同じ置き方にする。
import { CAMERA_DEFAULT, CAMERA_LIMITS } from './contract.js';

const RAD = Math.PI / 180;
// 箱の8つの角で測るので、実際の樹形はもう少し小さく写る。両側の余白が約3%でも、盆栽は画面の幅の約7割に収まる
export const FRAME_FILL = 0.94;
const FRAME_MARGIN = 1 / FRAME_FILL;
const MIN_DEPTH = 0.16;
const MAX_COORD = 1e100;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const midpoint = (a, b) => a * 0.5 + b * 0.5;
const lerp = (a, b, t) => a + (b - a) * t;

/** 方位を (-180, 180] に畳む。180 と -180 は同じ向きなので -180 に揃える。 */
export function wrapAzimuth(deg) {
  const x = ((deg + 180) % 360 + 360) % 360 - 180;
  return x === 180 ? -180 : x;
}

export function distanceLimits(fitDist = CAMERA_DEFAULT.dist) {
  const { distMin, distMax } = CAMERA_LIMITS;
  return {
    distMin: Math.min(distMin, fitDist),
    distMax: fitDist > distMax ? fitDist * 1.35 : distMax,
  };
}

/** パンの中心も構図に合わせると、大きく育った木で初めて寄った際に視点が飛ばない。 */
export function clampCamera(state = {}, home = CAMERA_DEFAULT, limits = distanceLimits(home.dist)) {
  const az = wrapAzimuth(Number.isFinite(state.az) ? state.az : CAMERA_DEFAULT.az);
  const pol = clamp(Number.isFinite(state.pol) ? state.pol : CAMERA_DEFAULT.pol, CAMERA_LIMITS.polMin, CAMERA_LIMITS.polMax);
  const dist = clamp(Number.isFinite(state.dist) ? state.dist : home.dist, limits.distMin, limits.distMax);
  const src = Array.isArray(state.target) ? state.target : home.target;
  const offset = home.target.map((v, i) => Number.isFinite(src[i]) ? clamp(src[i], -MAX_COORD, MAX_COORD) - v : 0);
  const len = Math.hypot(...offset);
  const scale = len > CAMERA_LIMITS.panMax ? CAMERA_LIMITS.panMax / len : 1;
  const target = home.target.map((v, i) => v + offset[i] * scale);
  return { az, pol, dist, target };
}

/** 注視点からカメラ位置への差。pol は真上から測った角度。 */
export function cameraOffset(az, pol, dist) {
  const a = az * RAD;
  const p = pol * RAD;
  const sp = Math.sin(p);
  return [dist * sp * Math.sin(a), dist * Math.cos(p), dist * sp * Math.cos(a)];
}

/** 画面上方向（カメラの上）と右方向。パンの計算を描画と操作で共有する。 */
export function cameraAxes(az, pol) {
  const a = az * RAD;
  const p = pol * RAD;
  const right = [Math.cos(a), 0, -Math.sin(a)];
  const up = [-Math.sin(a) * Math.cos(p), Math.sin(p), -Math.cos(a) * Math.cos(p)];
  return { right, up };
}

/** 縦の視野角（度）のとき、distance 先での世界長 / CSSピクセル。 */
export function worldPerPixel(fovDeg, cssHeight, distance) {
  const h = Math.max(1, cssHeight);
  const d = Math.max(0, distance);
  return (2 * Math.tan((fovDeg * RAD) / 2) * d) / h;
}

/** 方位は短い回り道で補間する（350°→10° を一周させない）。 */
export function lerpCamera(from, to, t) {
  const span = wrapAzimuth(to.az - from.az);
  // 両端は適用前に決まっている。補間中に元の制限を掛けると広い構図への途中で跳ねる。
  return {
    az: wrapAzimuth(from.az + span * t),
    pol: lerp(from.pol, to.pol, t),
    dist: lerp(from.dist, to.dist, t),
    target: from.target.map((v, i) => lerp(v, to.target[i], t)),
  };
}

function frameBoxes(bounds) {
  const boxes = (Array.isArray(bounds) ? bounds : [bounds]).filter((box) => (
    box?.min?.length === 3 && box?.max?.length === 3 && [0, 1, 2].every((axis) => (
      Number.isFinite(box.min[axis]) && Number.isFinite(box.max[axis]) && box.min[axis] <= box.max[axis]
    ))
  ));
  return boxes.length ? boxes : [{ min: [0, 0, 0], max: [0, 0, 0] }];
}

export function skeletonBounds(skel) {
  const [box] = frameBoxes(skel?.bounds);
  const min = box.min.slice();
  const max = box.max.slice();
  const pads = skel?.pads;
  // 骨格の境界は葉の中心で止まることがあるので、パッドの外周まで含める。
  for (let i = 0; i < (pads?.count ?? 0); i += 1) {
    const radius = pads.radius[i];
    for (let axis = 0; axis < 3; axis += 1) {
      const center = pads.center[i * 3 + axis];
      min[axis] = Math.min(min[axis], center - radius);
      max[axis] = Math.max(max[axis], center + radius);
    }
  }
  return { min, max };
}

function frameWindow(fovDeg, aspect, margin, usable) {
  const tanY = Math.tan(clamp(Number.isFinite(fovDeg) ? fovDeg : 30, 1, 179) * RAD / 2);
  const ratio = clamp(Number.isFinite(aspect) && aspect > 0 ? aspect : 1, 1e-6, 1e6);
  return { x: tanY * ratio / margin, y: tanY * usable / margin, shift: tanY * (1 - usable) };
}

function frustumExtents(boxes, pose, origin, window) {
  const { right, up } = cameraAxes(pose.az, pose.pol);
  const back = cameraOffset(pose.az, pose.pol, 1);
  const ext = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity, near: -Infinity };
  for (const { min, max } of boxes) {
    for (const x of [min[0], max[0]]) {
      for (const y of [min[1], max[1]]) {
        for (const z of [min[2], max[2]]) {
          const p = [x, y, z].map((v, i) => clamp(v, -MAX_COORD, MAX_COORD) - origin[i]);
          const px = dot(p, right);
          const py = dot(p, up);
          const depth = dot(p, back);
          // 手前の点ほど同じ幅でも大きく写るため、辺までの距離に奥行きを足す。
          ext.left = Math.min(ext.left, px - window.x * depth);
          ext.right = Math.max(ext.right, px + window.x * depth);
          ext.bottom = Math.min(ext.bottom, py + (window.shift - window.y) * depth);
          ext.top = Math.max(ext.top, py + (window.shift + window.y) * depth);
          ext.near = Math.max(ext.near, depth);
        }
      }
    }
  }
  return ext;
}

/** 透視投影で四辺を満たす最短距離。複数の箱は別々に投影し、卓の幅が樹冠にまで広がらないようにする。 */
export function fitCamera(bounds, pose, fovDeg, aspect, { margin = FRAME_MARGIN, usable = 1 } = {}) {
  const boxes = frameBoxes(bounds);
  const { az, pol } = clampCamera(pose);
  const origin = [0, 1, 2].map((axis) => midpoint(
    clamp(Math.min(...boxes.map((box) => box.min[axis])), -MAX_COORD, MAX_COORD),
    clamp(Math.max(...boxes.map((box) => box.max[axis])), -MAX_COORD, MAX_COORD),
  ));
  const window = frameWindow(fovDeg, aspect, Math.max(1, margin), clamp(usable, 0.05, 1));
  const ext = frustumExtents(boxes, { az, pol }, origin, window);
  const dist = Math.max(MIN_DEPTH, ext.near + MIN_DEPTH,
    (ext.right - ext.left) / (2 * window.x), (ext.top - ext.bottom) / (2 * window.y));
  const { right, up } = cameraAxes(az, pol);
  const x = midpoint(ext.left, ext.right);
  // 写真では帯の上に残る範囲の中央が、画面の中央より上になる。
  const y = midpoint(ext.bottom, ext.top) - window.shift * dist;
  const target = origin.map((v, i) => v + right[i] * x + up[i] * y);
  return { az, pol, dist, target };
}

export function frameDistance(bounds, fovDeg, aspect, opts) {
  return fitCamera(bounds, CAMERA_DEFAULT, fovDeg, aspect, opts).dist;
}

function frameContains(bounds, pose, fovDeg, aspect) {
  const window = frameWindow(fovDeg, aspect, 1, 1);
  const ext = frustumExtents(frameBoxes(bounds), pose, pose.target, window);
  return ext.near + MIN_DEPTH <= pose.dist
    && Math.max(-ext.left, ext.right) <= pose.dist * window.x
    && Math.max(-ext.bottom, ext.top) <= pose.dist * window.y;
}

export function createCameraRig(fov, applyPose, motion) {
  let pose = clampCamera();
  let home = pose;
  let lastFit = pose;
  let bounds = null;
  let aspect = 1;
  let manual = false;
  let started = false;
  let tween = null;

  function show(next) {
    pose = next;
    applyPose(pose);
  }
  show(pose);

  function move(next, { animate = false, ms = 480 } = {}) {
    if (animate && motion) {
      tween = { from: pose, to: next, t: 0, ms: ms > 0 ? ms : 480 };
    } else {
      tween = null;
      show(next);
    }
  }

  function updateBounds(next, force = false) {
    const first = bounds === null;
    bounds = next;
    home = fitCamera(bounds, home, fov, aspect);
    if (!started || manual) return;
    if (first) {
      lastFit = home;
      move(home);
      return;
    }
    const current = tween?.to ?? pose;
    if (!force && frameContains(bounds, current, fov, aspect)) return;
    lastFit = fitCamera(bounds, current, fov, aspect);
    move(lastFit, { animate: !force, ms: 900 });
  }

  return {
    get: () => ({ ...pose, target: pose.target.slice() }),
    distanceLimits: () => distanceLimits(lastFit.dist),
    set(partial = {}, opts = {}) {
      const { az, pol, dist, target } = partial;
      // app.js の自動回転は方位だけを送る。手動の回転は仰角も送る。
      const idle = Number.isFinite(az) && pol == null && dist == null && target == null && opts.animate === false;
      // 自動回転は、補間の最中だけ見送る。一度手で回したあと（manual）も、操作が止まれば再開する
      // （manual は「成長で勝手に引かない」ための印で、無操作の回転まで止めるものではない）
      if (idle && tween) return false;
      const next = clampCamera({ az: az ?? pose.az, pol: pol ?? pose.pol, dist, target }, lastFit);
      const sameTarget = target?.length === 3 && pose.target.every((v, i) => target[i] === v);
      if (dist == null || dist === pose.dist) next.dist = pose.dist;
      if (target == null || sameTarget) next.target = pose.target;
      if (idle && !manual && bounds && !frameContains(bounds, next, fov, aspect)) {
        lastFit = fitCamera(bounds, next, fov, aspect);
        move(lastFit);
        return true;
      }
      // 枝を選ぶ押下でも同じ姿勢が送られる。補間を止めても次の成長で収まりを確認する。
      const hold = az === pose.az && pol === pose.pol && dist === pose.dist && sameTarget;
      if (!idle && !hold && (az != null || pol != null || dist != null || target != null)) manual = true;
      move(next, opts);
      return true;
    },
    reset(opts) {
      manual = false;
      lastFit = home;
      move(home, opts);
    },
    fit(next, opts) {
      if (!next?.min || !next?.max) return;
      bounds = next;
      home = fitCamera(bounds, pose, fov, aspect);
      lastFit = home;
      move(home, opts);
    },
    updateBounds,
    resize(ratio) {
      if (aspect === ratio) return;
      aspect = ratio;
      if (bounds) updateBounds(bounds, true);
    },
    step(dt) {
      if (!started) {
        started = true;
        // 初回描画まで待てば、直前に指定された URL の姿勢が従来の注視点で開ける。
        if (bounds && !manual && !tween) {
          lastFit = home;
          show(home);
        }
      }
      if (!tween) return false;
      const t = Math.min(1, tween.t + dt * 1000 / tween.ms);
      tween.t = t;
      show(t === 1 ? tween.to : lerpCamera(tween.from, tween.to, t * t * (3 - 2 * t)));
      if (t === 1) tween = null;
      return true;
    },
  };
}
