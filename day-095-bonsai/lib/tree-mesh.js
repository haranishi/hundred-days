// 骨格から幹・枝・根張り・切り口のジオメトリを作る。DOM も three.js も使わない。
// 頂点色は擬似の陰（下・付け根・根元を暗く、上と先を明るく）。樹皮の色そのものはテクスチャが持つ。
import { createRng } from './rng.js';
import { NODE_FLAG } from './contract.js';
import {
  AT_EMBED,
  AT_END,
  AT_START,
  chainControls,
  collectChains,
  parallelFrames,
  sampleControls,
  sidesForOrder,
} from './tree-curve.js';

export { sidesForOrder };

export const GROW_SECONDS = 0.9;
export const WOOD_CUT = Object.freeze([0.86, 0.74, 0.55]);

const BARK = {
  maple: [0x6b / 255, 0x5a / 255, 0x4d / 255],
  pine: [0x3a / 255, 0x32 / 255, 0x2c / 255],
  plum: [0x6e / 255, 0x63 / 255, 0x58 / 255],
};

// 半球を2段の輪と頂点で閉じる。細い枝でも平らな断面が見えず、頂点を増やしすぎない。
const TIP_LATITUDES = [[Math.sqrt(3) / 2, 0.5], [0.5, Math.sqrt(3) / 2]];
const RING_ANGLES = [5, 6, 8].map((sides) => Array.from({ length: sides }, (_, k) => {
  const angle = k / sides * Math.PI * 2;
  return [Math.cos(angle), Math.sin(angle)];
}));

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => {
  if (x <= a) return 0;
  if (x >= b) return 1;
  const t = (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/** 生える動き。動きの軽減と animate=false は、fresh でも完成した長さをすぐ使う。 */
export function easeOutCubic(t) {
  const x = clamp01(t);
  return 1 - (1 - x) ** 3;
}

export function growthArray(skel, { animate = false, reducedMotion = false, elapsed = 0 } = {}) {
  const out = new Float32Array(skel.count);
  const done = !animate || reducedMotion || elapsed >= GROW_SECONDS;
  const scale = done ? 1 : easeOutCubic(elapsed / GROW_SECONDS);
  for (let i = 0; i < skel.count; i += 1) out[i] = skel.fresh[i] > 0 ? scale : 1;
  return out;
}

/** 切り口は初め淡い木色、scarAge が進むと樹皮へ溶ける。8 でほぼ樹皮。 */
export function scarColor(scarAge, species = 'maple') {
  const bark = BARK[species] || BARK.maple;
  const t = smooth(0, 8, Number(scarAge) || 0);
  return WOOD_CUT.map((v, i) => v + (bark[i] - v) * t);
}

function emptyBuffers() {
  return {
    vertexCount: 0,
    triangleCount: 0,
    position: new Float32Array(0),
    normal: new Float32Array(0),
    uv: new Float32Array(0),
    color: new Float32Array(0),
    index: new Uint32Array(0),
    ringCount: 0,
    ringCenter: new Float32Array(0),
    ringRadius: new Float32Array(0),
    ringNode: new Int32Array(0),
    ringAt: new Uint8Array(0),
    ringSides: new Uint8Array(0),
    cutCount: 0,
    cutPosition: new Float32Array(0),
    cutNormal: new Float32Array(0),
    cutColor: new Float32Array(0),
    cutIndex: new Uint32Array(0),
    cuts: [],
    nebariCount: 0,
    nodeShift: new Float32Array(0),
  };
}

function ensureCache(cache, built) {
  if (!cache) return built;
  cache.built = built;
  return built;
}

/**
 * @param {object} skel validateSkeleton を通る骨格
 * @param {object} [opts]
 * @param {Float32Array} [opts.growth] 節ごとの長さ係数 0〜1
 * @param {Uint8Array} [opts.only] 1 の節だけ作る
 * @param {number} [opts.radiusMul]
 * @param {string} [opts.species]
 * @param {boolean} [opts.nebari]
 * @param {boolean} [opts.selection] 候補表示が同じ管を使うための半径と節ごとの添字範囲
 * @param {object} [opts.cache] 同じキャッシュなら配列を使い回す（戻り値は次の呼び出しで無効）
 */
export function buildTreeBuffers(skel, opts = {}) {
  if (!skel || !skel.count) return emptyBuffers();
  const species = opts.species || 'maple';
  const radiusMul = Number.isFinite(opts.radiusMul) ? opts.radiusMul : 1;
  const wantNebari = opts.nebari !== false && !opts.only;
  const chains = collectChains(skel, opts.only || null);
  const tubes = [];
  const nodeShift = new Float32Array(skel.count * 3);
  let verts = 0;
  let tris = 0;
  let rings = 0;
  const cutNodes = [];

  for (const indices of chains) {
    if (!indices.length) continue;
    const first = indices[0];
    const order = skel.order[first];
    const ctrl = chainControls(skel, indices, opts.growth || null, true, nodeShift);
    const sampled = sampleControls(ctrl, order, skel.chain[first] === skel.chain[0]);
    if (sampled.count < 2) continue;
    const sides = sidesForOrder(order);
    sampled.sides = sides;
    sampled.junction = skel.parent[first] >= 0 && skel.chain[skel.parent[first]] !== skel.chain[first];
    sampled.roundTip = !(skel.flags[sampled.node[sampled.count - 1]] & NODE_FLAG.CUT);
    tubes.push(sampled);
    verts += sampled.count * sides;
    tris += (sampled.count - 1) * sides * 2;
    if (sampled.roundTip) {
      verts += TIP_LATITUDES.length * sides + 1;
      tris += (TIP_LATITUDES.length * 2 + 1) * sides;
    }
    rings += sampled.count;
    for (const index of indices) {
      if (skel.flags[index] & NODE_FLAG.CUT) cutNodes.push(index);
    }
  }

  let nebari = [];
  if (wantNebari) {
    nebari = buildNebari(skel, opts.seed);
    for (const root of nebari) {
      verts += root.count * root.sides;
      tris += (root.count - 1) * root.sides * 2;
      rings += root.count;
    }
  }

  const position = new Float32Array(verts * 3);
  const normal = new Float32Array(verts * 3);
  const uv = new Float32Array(verts * 2);
  const color = new Float32Array(verts * 3);
  const index = new Uint32Array(tris * 3);
  const selection = opts.selection ? {
    radius: new Float32Array(verts),
    sides: new Uint32Array(skel.count * 2),
    tips: new Uint32Array(skel.count * 2),
  } : null;
  const ringCenter = new Float32Array(rings * 3);
  const ringRadius = new Float32Array(rings);
  const ringNode = new Int32Array(rings);
  const ringAt = new Uint8Array(rings);
  const ringSides = new Uint8Array(rings);
  let vCount = 0;
  let iCount = 0;
  let rCount = 0;
  const tips = [];

  function writeVertex(x, y, z, nx, ny, nz, u, v, tint, radius) {
    const o = vCount * 3;
    position[o] = x;
    position[o + 1] = y;
    position[o + 2] = z;
    normal[o] = nx;
    normal[o + 1] = ny;
    normal[o + 2] = nz;
    uv[vCount * 2] = u;
    uv[vCount * 2 + 1] = v;
    color[o] = color[o + 1] = color[o + 2] = tint;
    if (selection) selection.radius[vCount] = radius;
    vCount += 1;
  }

  function joinRings(from, to, sides) {
    for (let k = 0; k < sides; k += 1) {
      const next = (k + 1) % sides;
      index[iCount++] = from + k;
      index[iCount++] = from + next;
      index[iCount++] = to + k;
      index[iCount++] = from + next;
      index[iCount++] = to + next;
      index[iCount++] = to + k;
    }
  }

  const writeTube = (sampled, { junction = false, nebariTube = false } = {}) => {
    const { count, pos, rad, node, at, sides } = sampled;
    const frames = parallelFrames(pos, count);
    const angles = RING_ANGLES[sides === 5 ? 0 : sides === 6 ? 1 : 2];
    const vCoord = new Float32Array(count);
    for (let i = 1; i < count; i += 1) {
      const ds = Math.hypot(pos[i * 3] - pos[(i - 1) * 3], pos[i * 3 + 1] - pos[(i - 1) * 3 + 1], pos[i * 3 + 2] - pos[(i - 1) * 3 + 2]);
      const radius = Math.max(0.008, (rad[i] + rad[i - 1]) * 0.5);
      vCoord[i] = vCoord[i - 1] + ds / (Math.PI * 2 * radius);
    }
    const base = vCount;
    for (let i = 0; i < count; i += 1) {
      const cx = pos[i * 3];
      const cy = pos[i * 3 + 1];
      const cz = pos[i * 3 + 2];
      const radius = Math.max(0.004, rad[i] * radiusMul);
      ringCenter[rCount * 3] = cx;
      ringCenter[rCount * 3 + 1] = cy;
      ringCenter[rCount * 3 + 2] = cz;
      ringRadius[rCount] = radius;
      ringNode[rCount] = nebariTube ? -1 : node[i];
      ringAt[rCount] = at[i];
      ringSides[rCount] = sides;
      rCount += 1;
      const along = count <= 1 ? 1 : i / (count - 1);
      const height = clamp01(cy / 2.4);
      const joint = junction && along < 0.18 ? 0.78 : 1;
      const soil = cy < 0.06 ? 0.72 + cy * 2 : 1;
      for (let k = 0; k < sides; k += 1) {
        const [c, s] = angles[k];
        const nx = c * frames.nx[i] + s * frames.bx[i];
        const ny = c * frames.ny[i] + s * frames.by[i];
        const nz = c * frames.nz[i] + s * frames.bz[i];
        const up = ny * 0.5 + 0.5;
        let tint = (0.58 + 0.42 * up) * (0.74 + 0.26 * height) * (0.84 + 0.16 * along) * joint * soil;
        if (nebariTube) tint *= 0.9;
        writeVertex(cx + nx * radius, cy + ny * radius, cz + nz * radius, nx, ny, nz, k / sides, vCoord[i], tint, radius);
      }
    }
    // 親に埋めた継ぎ目は、枝を選んだだけで親の外まで色づかないよう範囲から外す。
    const start = selection && !nebariTube ? at.indexOf(AT_START) : -1;
    for (let i = 0; i < count - 1; i += 1) {
      const from = iCount;
      joinRings(base + i * sides, base + (i + 1) * sides, sides);
      if (start >= 0 && i >= start) {
        const slot = node[i + 1] * 2;
        if (selection.sides[slot + 1] === 0) selection.sides[slot] = from;
        selection.sides[slot + 1] = iCount;
      }
    }
    if (sampled.roundTip) {
      const i = count - 1;
      tips.push({
        rim: vCount - sides, sides, ring: rCount - 1, v: vCoord[i],
        tx: frames.tx[i], ty: frames.ty[i], tz: frames.tz[i],
      });
    }
  };

  for (const tube of tubes) writeTube(tube, { junction: tube.junction });
  for (const root of nebari) writeTube(root, { nebariTube: true });

  // 輪の並びを保つため、丸い先端は幹と根の輪をすべて書いた後に足す。
  for (const { rim, sides, ring, v, tx, ty, tz } of tips) {
    const from = iCount;
    const cx = ringCenter[ring * 3];
    const cy = ringCenter[ring * 3 + 1];
    const cz = ringCenter[ring * 3 + 2];
    const radius = ringRadius[ring];
    const stretch = 1 + 0.3 * (1 - smooth(0.018, 0.05, radius));
    const length = radius * stretch;
    let previous = rim;
    for (const [cos, sin] of TIP_LATITUDES) {
      const base = vCount;
      const distance = length * sin;
      const slope = sin / stretch;
      const inv = 1 / Math.hypot(cos, slope);
      for (let k = 0; k < sides; k += 1) {
        const offset = (rim + k) * 3;
        const x = normal[offset] * cos;
        const y = normal[offset + 1] * cos;
        const z = normal[offset + 2] * cos;
        writeVertex(
          cx + tx * distance + x * radius, cy + ty * distance + y * radius, cz + tz * distance + z * radius,
          (x + tx * slope) * inv, (y + ty * slope) * inv, (z + tz * slope) * inv,
          k / sides, v + sin * 0.25, color[offset], radius,
        );
      }
      joinRings(previous, base, sides);
      previous = base;
    }
    const pole = vCount;
    let tint = 0;
    for (let k = 0; k < sides; k += 1) tint += color[(rim + k) * 3];
    writeVertex(cx + tx * length, cy + ty * length, cz + tz * length, tx, ty, tz, 0.5, v + 0.25, tint / sides, radius);
    for (let k = 0; k < sides; k += 1) {
      index[iCount++] = previous + k;
      index[iCount++] = previous + (k + 1) % sides;
      index[iCount++] = pole;
    }
    if (selection) {
      const slot = ringNode[ring] * 2;
      selection.tips[slot] = from;
      selection.tips[slot + 1] = iCount;
    }
  }

  const cuts = [];
  let cutVerts = 0;
  let cutTris = 0;
  for (const nodeId of cutNodes) {
    const sides = sidesForOrder(skel.order[nodeId]);
    cutVerts += sides + 1;
    cutTris += sides;
  }
  const cutPosition = new Float32Array(cutVerts * 3);
  const cutNormal = new Float32Array(cutVerts * 3);
  const cutColor = new Float32Array(cutVerts * 3);
  const cutIndex = new Uint32Array(cutTris * 3);
  let cv = 0;
  let ci = 0;
  for (const nodeId of cutNodes) {
    const sides = sidesForOrder(skel.order[nodeId]);
    const ex = skel.end[nodeId * 3] + nodeShift[nodeId * 3];
    const ey = skel.end[nodeId * 3 + 1] + nodeShift[nodeId * 3 + 1];
    const ez = skel.end[nodeId * 3 + 2] + nodeShift[nodeId * 3 + 2];
    const sx = skel.start[nodeId * 3];
    const sy = skel.start[nodeId * 3 + 1];
    const sz = skel.start[nodeId * 3 + 2];
    let dx = ex - sx;
    let dy = ey - sy;
    let dz = ez - sz;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    let hx = 0;
    let hy = 1;
    let hz = 0;
    if (Math.abs(dy) > 0.92) { hx = 1; hy = 0; hz = 0; }
    let nx = hy * dz - hz * dy;
    let ny = hz * dx - hx * dz;
    let nz = hx * dy - hy * dx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const bx = dy * nz - dz * ny;
    const by = dz * nx - dx * nz;
    const bz = dx * ny - dy * nx;
    const radius = Math.max(0.006, skel.r1[nodeId] * radiusMul * 1.04);
    const col = scarColor(skel.scarAge[nodeId], species);
    const center = cv;
    const o = cv * 3;
    cutPosition[o] = ex + dx * 0.004;
    cutPosition[o + 1] = ey + dy * 0.004;
    cutPosition[o + 2] = ez + dz * 0.004;
    cutNormal[o] = dx;
    cutNormal[o + 1] = dy;
    cutNormal[o + 2] = dz;
    cutColor[o] = col[0];
    cutColor[o + 1] = col[1];
    cutColor[o + 2] = col[2];
    cv += 1;
    const ringStart = cv;
    for (let k = 0; k < sides; k += 1) {
      const ang = (k / sides) * Math.PI * 2;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const px = nx * c + bx * s;
      const py = ny * c + by * s;
      const pz = nz * c + bz * s;
      const q = cv * 3;
      cutPosition[q] = cutPosition[o] + px * radius;
      cutPosition[q + 1] = cutPosition[o + 1] + py * radius;
      cutPosition[q + 2] = cutPosition[o + 2] + pz * radius;
      cutNormal[q] = dx;
      cutNormal[q + 1] = dy;
      cutNormal[q + 2] = dz;
      const edge = 0.86;
      cutColor[q] = col[0] * edge;
      cutColor[q + 1] = col[1] * edge;
      cutColor[q + 2] = col[2] * edge;
      cv += 1;
    }
    for (let k = 0; k < sides; k += 1) {
      cutIndex[ci] = center;
      cutIndex[ci + 1] = ringStart + k;
      cutIndex[ci + 2] = ringStart + ((k + 1) % sides);
      ci += 3;
    }
    cuts.push({ node: nodeId, color: col, radius });
  }

  const built = {
    vertexCount: vCount,
    triangleCount: iCount / 3,
    position: position.subarray(0, vCount * 3),
    normal: normal.subarray(0, vCount * 3),
    uv: uv.subarray(0, vCount * 2),
    color: color.subarray(0, vCount * 3),
    index: index.subarray(0, iCount),
    ringCount: rCount,
    ringCenter,
    ringRadius,
    ringNode,
    ringAt,
    ringSides,
    cutCount: cuts.length,
    cutPosition: cutPosition.subarray(0, cv * 3),
    cutNormal: cutNormal.subarray(0, cv * 3),
    cutColor: cutColor.subarray(0, cv * 3),
    cutIndex: cutIndex.subarray(0, ci),
    cuts,
    nebariCount: nebari.length,
    nodeShift,
  };
  if (selection) built.selection = selection;
  return ensureCache(opts.cache, built);
}

/** 木の種を優先し、剪定で最初のパッドが変わっても根の形を保つ。 */
function buildNebari(skel, seedOpt) {
  const seed = seedOpt ?? skel.pads?.seed?.[0] ?? 1;
  const rng = createRng(seed).fork('nebari');
  const count = rng.int(5, 7);
  const start = Math.min(0.07, skel.r0[0] * 0.25);
  const phase = rng.range(0, Math.PI * 2);
  const steps = 10;
  const roots = [];
  for (let i = 0; i < count; i += 1) {
    const angle = phase + (i / count) * Math.PI * 2 + rng.range(-0.18, 0.18);
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    const reach = rng.range(0.45, 0.84);
    const swing = reach * rng.range(0.04, 0.075) * (rng.chance(0.5) ? -1 : 1);
    const r0 = rng.range(0.07, 0.10);
    const depth = rng.range(0.01, 0.016);
    const pos = new Float32Array((steps + 1) * 3);
    const rad = new Float32Array(steps + 1);
    const at = new Uint8Array(steps + 1);
    at[0] = AT_START;
    at[steps] = AT_END;
    for (let k = 0; k <= steps; k += 1) {
      const t = k / steps;
      const along = start + reach * t;
      const side = swing * Math.sin(t * Math.PI * 2);
      pos[k * 3] = x * along - z * side;
      // 地表に沿って伸ばし、半径が細る終盤で土へ潜らせる。
      pos[k * 3 + 1] = -depth - (0.03 - depth) * smooth(0.42, 1, t);
      pos[k * 3 + 2] = z * along + x * side;
      rad[k] = 0.012 + (r0 - 0.012) * (1 - t ** 1.35);
    }
    roots.push({ pos, rad, at, count: steps + 1, sides: 8 });
  }
  return roots;
}

/** 試験用。点が乗っている輪の中心との距離。 */
export function nearestRing(built, x, y, z) {
  let best = Infinity;
  let index = -1;
  for (let i = 0; i < built.ringCount; i += 1) {
    const dx = built.ringCenter[i * 3] - x;
    const dy = built.ringCenter[i * 3 + 1] - y;
    const dz = built.ringCenter[i * 3 + 2] - z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) {
      best = d;
      index = i;
    }
  }
  if (index < 0) return { index: -1, dist: Infinity, radius: 0, node: -1, at: 0, sides: 0 };
  return {
    index,
    dist: Math.sqrt(best),
    radius: built.ringRadius[index],
    node: built.ringNode[index],
    at: built.ringAt[index],
    sides: built.ringSides[index],
  };
}
