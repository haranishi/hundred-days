import { createRng, hashString, mulberry32 } from './rng.js';
import {
  IDENTITY, ORIGIN, UP, add, axisAngle, conjugate, cross, multiplyQuat, normalizeQuat, rotate, rotationArc, scale, unit,
} from './tree-math.js';

// スナップショットでFloat32にしても、先端の半径を0.018以上に保つ。
export const MIN_RADIUS = 0.01800001;
export const MAX_AGE = 65535;
export const MAX_DAY = Number.MAX_SAFE_INTEGER - 365;
export const MODEL_SCALE = 1e8;
export const GROWTH_WEEKS = 52;
export const GROWTH_HEIGHT_FACTOR = 1.25;
export const GROWTH_NODE_FACTOR = 1.9;

const WOOD = {
  maple: { tips: [0.029, 0.024, 0.020, MIN_RADIUS], taper: [0.022, 0.012, 0.007, 0.004] },
  pine: { tips: [0.030, 0.034, 0.027, 0.022], taper: [0.020, 0.017, 0.008, 0.005] },
  plum: { tips: [0.028, 0.028, 0.023, MIN_RADIUS], taper: [0.024, 0.016, 0.009, 0.005] },
};

const CROWNS = {
  maple: [[0.40, 0.45], [0.34, 0.39], [0.30, 0.35]],
  pine: [[0.62, 0.75], [0.55, 0.64], [0.50, 0.56]],
  plum: [[0.35, 0.40], [0.31, 0.35], [0.28, 0.33]],
};

// 更新した時点で固定精度にそろえると、保存を挟んでも次の成長が同じ計算になる。
export const modelNumber = (value) => Math.round(value * MODEL_SCALE) / MODEL_SCALE || 0;

export function newState(species, style, seed, day) {
  return { species, style, seed, day, moisture: 0.6, rng: createRng(seed), nextId: 1, nextChain: 0, nodes: [], growth: [] };
}

export function copyState(state) {
  const rng = createRng(state.seed);
  rng.setState(state.rng.state());
  // local と up は要素を書き換えず、必要なときに配列ごと交換する。
  return { ...state, rng, nodes: state.nodes.map((node) => ({ ...node })), growth: state.growth.slice() };
}

export function poseNodes(nodes, preview = null) {
  const pose = new Array(nodes.length);
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const local = i === preview?.index ? preview.local : node.local;
    const parent = pose[node.parent];
    const q = normalizeQuat(parent ? multiplyQuat(parent.q, local) : local);
    const forward = rotate(q, UP);
    pose[i] = { q, forward, end: add(parent?.end ?? ORIGIN, scale(forward, node.length)) };
  }
  return pose;
}

export function topology(nodes) {
  const children = new Uint16Array(nodes.length);
  const continuation = new Int32Array(nodes.length).fill(-1);
  for (let i = 1; i < nodes.length; i += 1) {
    const { parent, chain } = nodes[i];
    children[parent] += 1;
    if (nodes[parent].chain === chain) continuation[parent] = i;
  }
  return { children, continuation };
}

export function isTip(nodes, { children, continuation }, index) {
  // 頂きを切った位置に横枝が残っても、幹の続きがなければ新しい頂きになる。
  return nodes[index].order === 0 ? continuation[index] < 0 : children[index] === 0;
}

export function previousWire(nodes, wireAt, index) {
  const { parent, chain } = nodes[index];
  return chain === nodes[parent]?.chain ? wireAt[parent] : 0;
}

export function lateralHeading(forward, angle, roll) {
  // 親枝が傾いても分岐の開きが変わらないよう、親枝を軸にして向きを決める。
  const across = unit(cross(Math.abs(forward[1]) > 0.9999 ? [0, 0, -1] : UP, forward));
  const above = cross(forward, across);
  const offset = add(scale(across, Math.cos(roll)), scale(above, Math.sin(roll)));
  return add(scale(forward, Math.cos(angle)), scale(offset, Math.sin(angle)));
}

export function appendNode(state, pose, parent, order, chain, step) {
  const previous = pose[parent];
  const baseQ = previous?.q ?? IDENTITY;
  const { axis, angle } = rotationArc(previous?.forward ?? UP, unit(step));
  const world = multiplyQuat(axisAngle(axis, angle), baseQ);
  const local = normalizeQuat(multiplyQuat(conjugate(baseQ), world)).map(modelNumber);
  const q = normalizeQuat(multiplyQuat(baseQ, local));
  const forward = rotate(q, UP);
  const length = modelNumber(Math.hypot(...step));
  const up = rotate(conjugate(q), UP).map(modelNumber);
  const radius = WOOD[state.species].tips[Math.min(order, 3)];
  const index = state.nodes.length;

  state.nodes.push({
    id: state.nextId++, parent, order, chain, length, local, up, r0: radius, r1: radius, flags: 0, scarAge: 0, wireAge: 0,
  });
  pose.push({ q, forward, end: add(previous?.end ?? ORIGIN, scale(forward, length)) });
  return index;
}

export function padAppearance(species, treeSeed, chain, order) {
  // 伸びても同じ枝の葉並びを使い、新しい枝だけに新しい種を割り当てる。
  const seed = (treeSeed ^ hashString(`pad:${chain}`)) >>> 0;
  const next = mulberry32(seed);
  const [min, max] = CROWNS[species][Math.max(1, Math.min(order, 3)) - 1];
  const radius = (min + (max - min) * next()) * (order === 0 ? 0.85 : 1);
  return { seed, radius, density: 0.6 + next() * 0.4 };
}

function thicken(radius, coefficient) {
  return radius + Math.min(Math.max(0, 0.42 - radius), 0.00016 * coefficient);
}

export function refreshRadii(state, coefficient, rootFloor = null) {
  const { nodes } = state;
  const { taper } = WOOD[state.species];
  const pipeArea = new Float64Array(nodes.length);
  const remembered = rootFloor === null;
  let changed = false;
  let visible = false;
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    const end = pipeArea[i] ? Math.max(remembered ? node.r1 : 0, Math.sqrt(pipeArea[i])) : thicken(node.r1, coefficient);
    const start = Math.max(remembered ? thicken(node.r0, coefficient) : 0, end + taper[Math.min(node.order, 3)] * node.length, i === 0 ? rootFloor ?? 0 : 0);
    const r0 = modelNumber(start);
    const r1 = modelNumber(end);
    if (node.r0 !== r0 || node.r1 !== r1) {
      changed = true;
      visible ||= Math.fround(node.r0) !== Math.fround(r0) || Math.fround(node.r1) !== Math.fround(r1);
    }
    node.r0 = r0;
    node.r1 = r1;
    if (node.parent >= 0) pipeArea[node.parent] += r0 * r0;
  }
  return { changed, visible };
}
