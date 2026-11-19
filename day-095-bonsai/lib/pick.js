import { add, bearing, clamp, dot, scale, sub } from './tree-math.js';

const EPSILON = 1e-10;
const at = (values, index) => [values[index * 3], values[index * 3 + 1], values[index * 3 + 2]];

function closestOnRay(origin, dir, start, edge, edgeSq) {
  const delta = sub(origin, start);
  const alongRay = dot(dir, edge);
  const rayOffset = dot(dir, delta);
  const alongEdge = dot(edge, delta);
  const det = edgeSq - alongRay * alongRay;
  // 平行のときも、線分の手前側か光線の原点を最近接点にできる。
  const param = det > EPSILON * edgeSq
    ? (alongEdge - alongRay * rayOffset) / det
    : (alongRay < 0 ? 1 : 0);
  const t = Math.max(0, alongRay * clamp(param, 0, 1) - rayOffset);
  const u = t === 0 ? clamp(alongEdge / edgeSq, 0, 1) : clamp(param, 0, 1);
  const difference = sub(add(delta, scale(dir, t)), scale(edge, u));
  return { t, distanceSq: dot(difference, difference) };
}

function sphereEntry(origin, dir, center, radius) {
  const delta = sub(center, origin);
  const t = dot(delta, dir);
  const offset = sub(delta, scale(dir, t));
  const thicknessSq = radius * radius - dot(offset, offset);
  if (thicknessSq < 0) return Infinity;
  const span = Math.sqrt(thicknessSq);
  return t + span >= 0 ? Math.max(0, t - span) : Infinity;
}

function capsuleEntry(origin, dir, start, end, edge, length, radius) {
  const axis = scale(edge, 1 / length);
  const delta = sub(origin, start);
  const height = dot(axis, delta);
  const slope = dot(axis, dir);
  const offAxis = sub(delta, scale(axis, height));
  const travel = sub(dir, scale(axis, slope));
  const a = dot(travel, travel);
  const b = dot(offAxis, travel);
  const c = dot(offAxis, offAxis) - radius * radius;
  let near = 0;
  let far = Infinity;

  // 胴と両端の球を別々に調べ、指の許容幅を含む表面の前後関係で比べる。
  if (Math.abs(slope) > EPSILON) {
    const t0 = -height / slope;
    const t1 = (length - height) / slope;
    near = Math.max(near, Math.min(t0, t1));
    far = Math.min(far, Math.max(t0, t1));
  } else if (height < 0 || height > length) {
    far = -1;
  }

  if (a > EPSILON) {
    const disc = b * b - a * c;
    if (disc >= 0) {
      const span = Math.sqrt(disc);
      near = Math.max(near, (-b - span) / a);
      far = Math.min(far, (-b + span) / a);
    } else {
      far = -1;
    }
  } else if (c > 0) {
    far = -1;
  }
  return Math.min(near <= far ? near : Infinity, sphereEntry(origin, dir, start, radius), sphereEntry(origin, dir, end, radius));
}

export function pickNode(skel, ray, { pxToWorld = 0, tolerancePx = 14, padHit = true } = {}) {
  const { origin } = ray;
  const magnitude = Math.hypot(...ray.dir);
  if (!(magnitude > 0) || !Number.isFinite(magnitude)) return null;
  const dir = scale(ray.dir, 1 / magnitude);
  let best = null;
  let depth = Infinity;

  function consider(index, t, distanceSq, entry, viaPad) {
    if (!Number.isFinite(entry)) return;
    const distance = Math.sqrt(distanceSq);
    const tied = Math.abs(entry - depth) < EPSILON;
    if (tied ? (viaPad || distance >= best.distance - EPSILON) : entry > depth) return;
    depth = entry;
    best = { index, id: skel.ids[index], t, point: add(origin, scale(dir, t)), viaPad, distance };
  }

  for (let i = 0; i < skel.count; i += 1) {
    const start = at(skel.start, i);
    const end = at(skel.end, i);
    const edge = sub(end, start);
    const edgeSq = dot(edge, edge);
    const { t, distanceSq } = closestOnRay(origin, dir, start, edge, edgeSq);
    const pixel = typeof pxToWorld === 'function' ? pxToWorld(t) : pxToWorld;
    const radius = Math.max(skel.r0[i], skel.r1[i], (pixel * tolerancePx) || 0);
    if (distanceSq <= radius * radius) consider(i, t, distanceSq, capsuleEntry(origin, dir, start, end, edge, Math.sqrt(edgeSq), radius), false);
  }

  if (padHit) {
    const { pads } = skel;
    for (let i = 0; i < pads.count; i += 1) {
      const center = at(pads.center, i);
      const delta = sub(center, origin);
      const t = Math.max(0, dot(delta, dir));
      const difference = sub(delta, scale(dir, t));
      consider(pads.node[i], t, dot(difference, difference), sphereEntry(origin, dir, center, pads.radius[i] * 0.8), true);
    }
  }
  return best;
}

export function branchSegment(skel, index) {
  if (!Number.isInteger(index) || index < 0 || index >= skel.count) return new Int32Array(0);
  const chain = skel.chain[index];
  const indices = [index];
  for (let i = index + 1; i < skel.count; i += 1) {
    if (skel.chain[i] === chain && skel.parent[i] === indices[indices.length - 1]) indices.push(i);
  }
  return Int32Array.from(indices);
}

export function subtreeIndices(skel, index) {
  if (!Number.isInteger(index) || index < 0 || index >= skel.count) return new Int32Array(0);
  const included = new Uint8Array(skel.count);
  included[index] = 1;
  const indices = [index];
  for (let i = index + 1; i < skel.count; i += 1) {
    if (included[skel.parent[i]]) {
      included[i] = 1;
      indices.push(i);
    }
  }
  return Int32Array.from(indices);
}

export function indexOfId(skel, id) {
  return skel.ids.indexOf(id);
}

export function branchList(skel) {
  const chains = new Map();
  for (let i = 0; i < skel.count; i += 1) {
    const chain = skel.chain[i];
    const entry = chains.get(chain);
    if (entry) entry.tip = i;
    else chains.set(chain, { chain, first: i, tip: i, order: skel.order[i] });
  }
  const az = (i) => (bearing(sub(at(skel.end, i), at(skel.start, i))) + 2 * Math.PI) % (2 * Math.PI);
  return [...chains.values()].sort((a, b) => skel.start[a.first * 3 + 1] - skel.start[b.first * 3 + 1] || az(a.first) - az(b.first) || a.chain - b.chain);
}
