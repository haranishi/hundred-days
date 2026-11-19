import { MAX_PADS, NODE_FLAG } from './contract.js';
import { ORIGIN, rotate, unit } from './tree-math.js';
import { isTip, padAppearance, poseNodes, previousWire, topology } from './tree-state.js';

const woodProjection = (forward) => Math.sqrt(Math.max(0, 1 - forward ** 2));
// 葉のかたまりを、法線方向の厚みが0.55倍の楕円体として扱う。
export const padExtent = (radius, normal) => radius * Math.sqrt(1 - (1 - 0.55 ** 2) * normal ** 2);

function padNormal(node, q) {
  const [ux, uy, uz] = node.up;
  // 節が生まれた時の上を使い、曲げた先ではパッドも枝と一緒に回す。
  return unit(rotate(q, [0.7 * ux, 0.7 * uy + 0.3, 0.7 * uz]));
}

export function verticalRange({ nodes, species, seed }, pose) {
  const links = topology(nodes);
  let min = 0;
  let max = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const { q, end, forward } = pose[i];
    const startY = pose[node.parent]?.end[1] ?? 0;
    const projection = woodProjection(forward[1]);
    min = Math.min(min, startY - Math.fround(node.r0) * projection, end[1] - Math.fround(node.r1) * projection);
    max = Math.max(max, startY + Math.fround(node.r0) * projection, end[1] + Math.fround(node.r1) * projection);
    if (isTip(nodes, links, i)) {
      const { radius } = padAppearance(species, seed, node.chain, node.order);
      const extent = padExtent(radius, padNormal(node, q)[1]);
      min = Math.min(min, end[1] - extent);
      max = Math.max(max, end[1] + extent);
    }
  }
  return { min, max };
}

function skeletonArrays(count) {
  return {
    count,
    ids: new Int32Array(count), parent: new Int32Array(count), order: new Uint8Array(count), chain: new Int32Array(count),
    start: new Float32Array(3 * count), end: new Float32Array(3 * count), quat: new Float32Array(4 * count),
    r0: new Float32Array(count), r1: new Float32Array(count), flags: new Uint8Array(count),
    fresh: new Float32Array(count), scarAge: new Float32Array(count),
  };
}

function padArrays(count) {
  return {
    count,
    node: new Int32Array(count), center: new Float32Array(3 * count), normal: new Float32Array(3 * count),
    radius: new Float32Array(count), density: new Float32Array(count), seed: new Uint32Array(count),
  };
}

export function makeSnapshot(state, preview) {
  const { nodes, species, seed } = state;
  const pose = poseNodes(nodes, preview);
  const links = topology(nodes);
  const result = skeletonArrays(nodes.length);
  const min = [0, 0, 0];
  const max = [0, 0, 0];
  const tips = [];
  const wirePaths = [];
  const wireAt = new Uint16Array(nodes.length);

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const { q, end, forward } = pose[i];
    const start = pose[node.parent]?.end ?? ORIGIN;
    result.ids[i] = node.id;
    result.parent[i] = node.parent;
    result.order[i] = node.order;
    result.chain[i] = node.chain;
    result.start.set(start, 3 * i);
    result.end.set(end, 3 * i);
    result.quat.set(q, 4 * i);
    result.r0[i] = node.r0;
    result.r1[i] = node.r1;
    result.flags[i] = node.flags;
    result.fresh[i] = node.flags & NODE_FLAG.FRESH ? 1 : 0;
    result.scarAge[i] = node.scarAge;

    // 木の断面は進行方向に直角。直立した根元の下に架空の高さを足さない。
    for (let axis = 0; axis < 3; axis += 1) {
      const projection = woodProjection(forward[axis]);
      min[axis] = Math.min(min[axis], start[axis] - result.r0[i] * projection, end[axis] - result.r1[i] * projection);
      max[axis] = Math.max(max[axis], start[axis] + result.r0[i] * projection, end[axis] + result.r1[i] * projection);
    }

    if (isTip(nodes, links, i)) {
      const appearance = padAppearance(species, seed, node.chain, node.order);
      const normal = padNormal(node, q);
      // 芽摘みの印や切り口の回復で、木の高さとカメラの収まりが揺れないようにする。
      for (let axis = 0; axis < 3; axis += 1) {
        const extent = padExtent(appearance.radius, normal[axis]);
        min[axis] = Math.min(min[axis], end[axis] - extent);
        max[axis] = Math.max(max[axis], end[axis] + extent);
      }
      const recovery = node.flags & NODE_FLAG.CUT ? Math.min(1, node.scarAge / 8) : 1;
      const scale = node.flags & NODE_FLAG.PINCHED ? 0.74 : 1;
      tips.push({
        index: i, normal, seed: appearance.seed,
        radius: appearance.radius * (0.68 + 0.32 * recovery) * scale,
        density: appearance.density * (0.54 + 0.46 * recovery) * (node.flags & NODE_FLAG.PINCHED ? 0.53 : 1),
      });
    }

    if (node.flags & NODE_FLAG.WIRED) {
      const existing = previousWire(nodes, wireAt, i);
      if (existing) {
        const wire = wirePaths[existing - 1];
        wire.indices.push(i);
        wire.age = Math.max(wire.age, node.wireAge);
        wireAt[i] = existing;
      } else {
        wireAt[i] = wirePaths.push({ indices: [i], age: node.wireAge });
      }
    }
  }

  if (tips.length > MAX_PADS) {
    // 頂きの葉は木の輪郭を作るので、密な木でも先に1枠を確保する。
    tips.sort((a, b) => (nodes[b.index].order === 0) - (nodes[a.index].order === 0) || b.radius - a.radius || a.index - b.index);
    tips.length = MAX_PADS;
  }

  const pads = padArrays(tips.length);
  for (let i = 0; i < tips.length; i += 1) {
    const { index, normal, radius, density, seed: padSeed } = tips[i];
    pads.node[i] = index;
    pads.center.set(pose[index].end, 3 * i);
    pads.normal.set(normal, 3 * i);
    pads.radius[i] = radius;
    pads.density[i] = density;
    pads.seed[i] = padSeed;
  }

  result.bounds = { min, max, center: min.map((value, axis) => (value + max[axis]) / 2) };
  result.pads = pads;
  result.wires = wirePaths.map(({ indices, age }) => ({ nodes: Int32Array.from(indices), age }));
  return result;
}

const NODE_ARRAYS = ['ids', 'parent', 'order', 'chain', 'start', 'end', 'quat', 'r0', 'r1', 'flags', 'fresh', 'scarAge'];
const PAD_ARRAYS = ['node', 'center', 'normal', 'radius', 'density', 'seed'];
const sameValues = (a, b) => a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

export function sameSkeleton(a, b) {
  // 内部の値が動いても、描画用の精度や針金の経路全体の週数が同じことがある。
  return a.count === b.count && a.pads.count === b.pads.count && a.wires.length === b.wires.length
    && NODE_ARRAYS.every((name) => sameValues(a[name], b[name]))
    && PAD_ARRAYS.every((name) => sameValues(a.pads[name], b.pads[name]))
    && a.wires.every((wire, i) => wire.age === b.wires[i].age && sameValues(wire.nodes, b.wires[i].nodes));
}
