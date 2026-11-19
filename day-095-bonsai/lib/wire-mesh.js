// 針金。枝の中心線に沿うらせんで、曲げた形から外れない。
import { AT_END, AT_START, chainControls, collectChains, parallelFrames, sampleControls, sidesForOrder } from './tree-curve.js';

export const WIRE_COLOR = 0xd98c4a;
export const WIRE_PITCH = 0.07;
export const WIRE_RADIUS = 0.012;
export const WIRE_CLEARANCE = WIRE_RADIUS;
export const WIRE_MAX_EXPANSION = WIRE_RADIUS * (2.2 - 1);

const TAU = Math.PI * 2;
const WIRE_SIDES = 5;

export function wireRadiusOffset(distance) {
  return Math.min(WIRE_MAX_EXPANSION, Math.max(0, WIRE_RADIUS * (distance / 8.5 - 1)));
}

export function createWireMaterial(THREE, expansion) {
  const material = new THREE.MeshStandardMaterial({
    color: WIRE_COLOR, metalness: 0.8, roughness: 0.35, emissive: 0x3a1c08, envMapIntensity: 0.85,
  });
  // 引いた視点でも読めるよう、らせんの中心を保ったまま断面だけをGPUで広げる。
  material.onBeforeCompile = (shader) => {
    shader.uniforms.wireExpansion = expansion;
    shader.vertexShader = 'uniform float wireExpansion;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * wireExpansion;',
    );
  };
  return material;
}

function emptyWire() {
  return {
    vertexCount: 0,
    triangleCount: 0,
    position: new Float32Array(0),
    normal: new Float32Array(0),
    index: new Uint32Array(0),
    helixCount: 0,
    helix: new Float32Array(0),
    clearance: new Float32Array(0),
  };
}

/**
 * wires の1本。nodes が指す節だけを通る。戻り値の helix はらせんの中心、
 * clearance は枝の中心かららせんの中心までの距離。
 */
export function buildWireBuffers(skel) {
  const list = Array.isArray(skel?.wires) ? skel.wires : [];
  if (!list.length) return [];
  const chains = new Map(collectChains(skel).map((indices) => [skel.chain[indices[0]], indices]));
  const sampled = new Map();
  return list.map((wire) => buildOne(skel, wire, chains, sampled));
}

function buildOne(skel, wire, chains, sampled) {
  const nodes = wire?.nodes;
  if (!nodes || nodes.length < 1) return emptyWire();
  const only = new Uint8Array(skel.count);
  for (let i = 0; i < nodes.length; i += 1) {
    const index = nodes[i];
    if (index >= 0 && index < skel.count) only[index] = 1;
  }
  let helixCount = 0;
  const helices = [];
  for (const indices of collectChains(skel, only)) {
    const first = indices[0];
    const last = indices.at(-1);
    const chain = skel.chain[first];
    if (!sampled.has(chain)) {
      // 途中から巻く場合も、枝全体と同じ曲線・断面の向きを使って浮きを防ぐ。
      const full = chains.get(chain);
      const order = skel.order[full[0]];
      const controls = chainControls(skel, full, null, true, null);
      const curve = sampleControls(controls, order, chain === skel.chain[0]);
      sampled.set(chain, { curve, frames: parallelFrames(curve.pos, curve.count), sides: sidesForOrder(order) });
    }
    const { curve, frames, sides } = sampled.get(chain);
    const parent = skel.parent[first];
    const continues = parent >= 0 && skel.chain[parent] === chain;
    const start = curve.at.findIndex((at, i) => continues
      ? at === AT_END && curve.node[i] === parent
      : at === AT_START && curve.node[i] === first);
    const end = curve.at.findIndex((at, i) => at === AT_END && curve.node[i] === last);
    if (start < 0 || end <= start) continue;
    const arc = new Float32Array(end + 1);
    for (let i = start + 1; i <= end; i += 1) {
      arc[i] = arc[i - 1] + Math.hypot(
        curve.pos[i * 3] - curve.pos[(i - 1) * 3],
        curve.pos[i * 3 + 1] - curve.pos[(i - 1) * 3 + 1],
        curve.pos[i * 3 + 2] - curve.pos[(i - 1) * 3 + 2],
      );
    }
    const length = arc[end];
    const steps = Math.max(8, Math.ceil(length / (WIRE_PITCH / 8)));
    const pos = [];
    const outward = [];
    const clearance = [];
    const junction = parent >= 0 && !continues;
    const limit = junction ? Math.max(skel.r0[parent], skel.r1[parent]) * 0.98 : 0;
    const stepLength = length / steps;
    const halfFace = Math.PI / sides;
    const section = Math.cos(halfFace);
    let i = start + 1;
    let angle = 0;
    let previousRadius = curve.rad[start];
    for (let s = 0; s <= steps; s += 1) {
      const dist = stepLength * s;
      while (i < end && arc[i] < dist) i += 1;
      const t = (dist - arc[i - 1]) / Math.max(1e-6, arc[i] - arc[i - 1]);
      const lerp = (a, b) => a + (b - a) * t;
      const cx = lerp(curve.pos[(i - 1) * 3], curve.pos[i * 3]);
      const cy = lerp(curve.pos[(i - 1) * 3 + 1], curve.pos[i * 3 + 1]);
      const cz = lerp(curve.pos[(i - 1) * 3 + 2], curve.pos[i * 3 + 2]);
      const radius = Math.max(0.004, lerp(curve.rad[i - 1], curve.rad[i]));
      // 区間ごとの半径で回転量を積み上げ、先細りしても巻きの位相をつなぐ。
      if (s) angle += TAU * stepLength / Math.max(WIRE_PITCH, 3.2 * (previousRadius + radius) / 2);
      previousRadius = radius;
      // 付け根は親の幹の内部にある。そこから巻くと針金が樹皮に埋まるので、外へ出たところから始める。
      if (junction && !pos.length && Math.hypot(cx - skel.end[parent * 3], cy - skel.end[parent * 3 + 1], cz - skel.end[parent * 3 + 2]) < limit) continue;
      const c = Math.cos(angle);
      const sn = Math.sin(angle);
      const nx = c * lerp(frames.nx[i - 1], frames.nx[i]) + sn * lerp(frames.bx[i - 1], frames.bx[i]);
      const ny = c * lerp(frames.ny[i - 1], frames.ny[i]) + sn * lerp(frames.by[i - 1], frames.by[i]);
      const nz = c * lerp(frames.nz[i - 1], frames.nz[i]) + sn * lerp(frames.bz[i - 1], frames.bz[i]);
      const len = Math.hypot(nx, ny, nz) || 1;
      // 枝の多角形の面に沿わせる。両端はわずかに内側へ納め、曲線の途中でも浮かせない。
      const faceRadius = radius * section / Math.cos(angle % (2 * halfFace) - halfFace);
      const tuck = s === steps || (!pos.length && parent >= 0) ? 0.002 : 0;
      const lift = faceRadius + WIRE_CLEARANCE - tuck;
      pos.push(cx + nx / len * lift, cy + ny / len * lift, cz + nz / len * lift);
      outward.push(nx / len, ny / len, nz / len);
      clearance.push(lift);
    }
    const count = clearance.length;
    if (count < 2) continue;
    helices.push({ pos, outward, clearance, count });
    helixCount += count;
  }

  const sides = WIRE_SIDES;
  let vert = 0;
  let tri = 0;
  for (const helix of helices) {
    vert += helix.count * sides;
    tri += (helix.count - 1) * sides * 2 + (sides - 2) * 2;
  }
  const position = new Float32Array(vert * 3);
  const normal = new Float32Array(vert * 3);
  const index = new Uint32Array(tri * 3);
  const helixPos = new Float32Array(helixCount * 3);
  const clearance = new Float32Array(helixCount);
  let v = 0;
  let ic = 0;
  let h = 0;
  for (const helix of helices) {
    const frames = parallelFrames(helix.pos, helix.count);
    const base = v;
    for (let i = 0; i < helix.count; i += 1) {
      helixPos[h * 3] = helix.pos[i * 3];
      helixPos[h * 3 + 1] = helix.pos[i * 3 + 1];
      helixPos[h * 3 + 2] = helix.pos[i * 3 + 2];
      clearance[h] = helix.clearance[i];
      h += 1;
      const ox = helix.outward[i * 3];
      const oy = helix.outward[i * 3 + 1];
      const oz = helix.outward[i * 3 + 2];
      // 断面の頂点を1つ内側に向け、少ない角数でも端で樹皮に接するようにする。
      const inward = Math.atan2(
        -(ox * frames.bx[i] + oy * frames.by[i] + oz * frames.bz[i]),
        -(ox * frames.nx[i] + oy * frames.ny[i] + oz * frames.nz[i]),
      );
      for (let k = 0; k < sides; k += 1) {
        const ang = inward + k / sides * TAU;
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const nx = c * frames.nx[i] + s * frames.bx[i];
        const ny = c * frames.ny[i] + s * frames.by[i];
        const nz = c * frames.nz[i] + s * frames.bz[i];
        const o = v * 3;
        position[o] = helix.pos[i * 3] + nx * WIRE_RADIUS;
        position[o + 1] = helix.pos[i * 3 + 1] + ny * WIRE_RADIUS;
        position[o + 2] = helix.pos[i * 3 + 2] + nz * WIRE_RADIUS;
        normal[o] = nx;
        normal[o + 1] = ny;
        normal[o + 2] = nz;
        v += 1;
      }
    }
    for (let i = 0; i < helix.count - 1; i += 1) {
      for (let k = 0; k < sides; k += 1) {
        const k1 = (k + 1) % sides;
        const a = base + i * sides + k;
        const b = base + i * sides + k1;
        const c = base + (i + 1) * sides + k;
        const d = base + (i + 1) * sides + k1;
        index[ic] = a;
        index[ic + 1] = b;
        index[ic + 2] = c;
        index[ic + 3] = b;
        index[ic + 4] = d;
        index[ic + 5] = c;
        ic += 6;
      }
    }
    // 端の断面が正面を向いても管の穴を見せない。
    const tip = v - sides;
    for (let k = 1; k < sides - 1; k += 1) {
      index[ic++] = base;
      index[ic++] = base + k + 1;
      index[ic++] = base + k;
      index[ic++] = tip;
      index[ic++] = tip + k;
      index[ic++] = tip + k + 1;
    }
  }
  return {
    vertexCount: v,
    triangleCount: ic / 3,
    position,
    normal,
    index,
    helixCount: h,
    helix: helixPos,
    clearance,
  };
}
