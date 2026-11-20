// 舞台（3種の鉢・土・苔・石・卓・和紙の壁）の 3D ジオメトリを手続き生成する。
// DOM や Canvas に一切依存せず、Node 単体でもすべての頂点・法線・UV・頂点色・境界箱を検証できる。
// 同じ種（seed）からは常に同一の頂点列が生成され、異なる種からは異なる頂点列が生成される。

import { GFX_TIERS } from './gfx.js';
import { createRng } from './rng.js';
import { fbm2, fbm3 } from './noise.js';

export const WALL_Z = -3.2;
export const WALL_WIDTH = 96.0;
export const WALL_HEIGHT = 56.0;
export const TABLE_WIDTH = 15.0;
export const TABLE_DEPTH = 4.42;
export const TABLE_BRACKET_XS = Object.freeze([-3.2, 0.0, 3.2]);
export const TREE_OFFSET = Object.freeze([-0.18, 0, -0.06]);

export const POT_SPECS = Object.freeze({
  'oval-brown': Object.freeze({
    id: 'oval-brown', shape: 'oval', width: 2.9, depth: 2.1, height: 0.55,
    potTopY: 0.03, tableY: -0.52, bodyBottomY: -0.45, soilRadius: 0.94, innerScale: 0.865,
    color: '#8a5d3f', rimColor: '#ad7a56', roughness: 0.76, metalness: 0.03, clearcoat: 0.0, clearcoatRoughness: 0.5,
  }),
  'round-blue': Object.freeze({
    id: 'round-blue', shape: 'round', width: 2.3, depth: 2.3, height: 0.80,
    potTopY: 0.03, tableY: -0.77, bodyBottomY: -0.70, soilRadius: 0.96, innerScale: 0.845,
    color: '#2c5f8a', rimColor: '#dfe8ee', roughness: 0.22, metalness: 0.04, clearcoat: 0.42, clearcoatRoughness: 0.14,
  }),
  'rect-grey': Object.freeze({
    id: 'rect-grey', shape: 'rect', width: 2.8, depth: 1.9, height: 0.45,
    potTopY: 0.03, tableY: -0.42, bodyBottomY: -0.35, soilRadius: 0.86, innerScale: 0.865,
    color: '#8d9291', rimColor: '#aeb3b2', roughness: 0.38, metalness: 0.04, clearcoat: 0.28, clearcoatRoughness: 0.26,
  }),
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const hexToRgb01 = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function finishGeometry(THREE, positions, uvs, colors, indices) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions instanceof Float32Array ? positions : new Float32Array(positions), 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs instanceof Float32Array ? uvs : new Float32Array(uvs), 2));
  geom.setAttribute('color', new THREE.BufferAttribute(colors instanceof Float32Array ? colors : new Float32Array(colors), 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  return geom;
}

/** 角度 theta と鉢の断面形状（oval / round / rect）から、正規化半径 [-1, 1] の平面座標 (nx, nz) を返す。 */
export function shapeUnitPoint(shape, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  if (shape === 'rect') {
    const p = 2 / 6.5;
    return [(c >= 0 ? 1 : -1) * Math.pow(Math.abs(c), p), (s >= 0 ? 1 : -1) * Math.pow(Math.abs(s), p)];
  }
  return [c, s];
}

function shapeNormRadius(shape, lx, lz, halfW, halfD) {
  const nx = Math.abs(lx) / Math.max(1e-4, halfW);
  const nz = Math.abs(lz) / Math.max(1e-4, halfD);
  return shape === 'rect' ? Math.pow(Math.pow(nx, 6.5) + Math.pow(nz, 6.5), 1 / 6.5) : Math.hypot(nx, nz);
}

function footProfile(theta) {
  const wave = -Math.cos(4 * theta);
  if (wave <= 0.22) return 0;
  const t = Math.min(1, (wave - 0.22) / 0.74);
  return t * t * (3 - 2 * t);
}

function getPotRings(spec) {
  const top = spec.potTopY;
  const bot = spec.bodyBottomY;
  if (spec.id === 'oval-brown') {
    return [
      { s: 0.00, y: -0.14, foot: 0, rim: 0.0, form: 0.68, lock: true },
      { s: 0.84, y: -0.14, foot: 0, rim: 0.0, form: 0.72, lock: false },
      { s: 0.865, y: 0.012, foot: 0, rim: 0.18, form: 0.88, lock: false },
      { s: 0.89, y: top, foot: 0, rim: 0.75, form: 1.02, lock: true },
      { s: 0.975, y: top, foot: 0, rim: 1.00, form: 1.06, lock: true },
      { s: 1.00, y: 0.004, foot: 0, rim: 0.82, form: 1.04, lock: true },
      { s: 0.946, y: -0.036, foot: 0, rim: 0.0, form: 0.76, lock: false },
      { s: 0.942, y: -0.17, foot: 0, rim: 0.0, form: 0.98, lock: false },
      { s: 0.89, y: -0.33, foot: 0, rim: 0.0, form: 0.86, lock: false },
      { s: 0.78, y: -0.43, foot: 0, rim: 0.0, form: 0.74, lock: false },
      { s: 0.74, y: bot, foot: 1.0, rim: 0.0, form: 0.82, lock: true },
      { s: 0.62, y: bot, foot: 1.0, rim: 0.0, form: 0.76, lock: true },
      { s: 0.58, y: bot, foot: 0, rim: 0.0, form: 0.58, lock: false },
      { s: 0.00, y: bot, foot: 0, rim: 0.0, form: 0.54, lock: true },
    ];
  }
  if (spec.id === 'round-blue') {
    return [
      { s: 0.00, y: -0.16, foot: 0, rim: 0.0, form: 0.62, lock: true },
      { s: 0.81, y: -0.16, foot: 0, rim: 0.0, form: 0.68, lock: false },
      { s: 0.845, y: 0.005, foot: 0, rim: 0.22, form: 0.84, lock: false },
      { s: 0.91, y: top, foot: 0, rim: 0.86, form: 0.98, lock: true },
      { s: 0.985, y: top, foot: 0, rim: 0.94, form: 1.02, lock: true },
      { s: 1.00, y: 0.012, foot: 0, rim: 0.65, form: 0.98, lock: true },
      { s: 0.902, y: -0.068, foot: 0, rim: 0.0, form: 0.68, lock: false },
      { s: 0.938, y: -0.24, foot: 0, rim: 0.0, form: 0.88, lock: false },
      { s: 0.90, y: -0.46, foot: 0, rim: 0.0, form: 0.78, lock: false },
      { s: 0.77, y: -0.63, foot: 0, rim: 0.0, form: 0.68, lock: false },
      { s: 0.68, y: -0.69, foot: 0, rim: 0.0, form: 0.62, lock: false },
      { s: 0.65, y: bot, foot: 1.0, rim: 0.0, form: 0.76, lock: true },
      { s: 0.54, y: bot, foot: 1.0, rim: 0.0, form: 0.70, lock: true },
      { s: 0.50, y: bot, foot: 0, rim: 0.0, form: 0.52, lock: false },
      { s: 0.00, y: bot, foot: 0, rim: 0.0, form: 0.48, lock: true },
    ];
  }
  return [
    { s: 0.00, y: -0.12, foot: 0, rim: 0.0, form: 0.70, lock: true },
    { s: 0.84, y: -0.12, foot: 0, rim: 0.0, form: 0.74, lock: false },
    { s: 0.865, y: 0.012, foot: 0, rim: 0.20, form: 0.90, lock: false },
    { s: 0.88, y: top, foot: 0, rim: 0.75, form: 1.02, lock: true },
    { s: 0.99, y: top, foot: 0, rim: 0.94, form: 1.05, lock: true },
    { s: 1.00, y: 0.018, foot: 0, rim: 0.78, form: 1.03, lock: true },
    { s: 1.00, y: -0.024, foot: 0, rim: 0.35, form: 0.96, lock: true },
    { s: 0.922, y: -0.038, foot: 0, rim: 0.0, form: 0.78, lock: false },
    { s: 0.888, y: -0.18, foot: 0, rim: 0.0, form: 0.96, lock: false },
    { s: 0.835, y: -0.33, foot: 0, rim: 0.0, form: 0.86, lock: false },
    { s: 0.79, y: bot, foot: 0, rim: 0.0, form: 0.76, lock: false },
    { s: 0.77, y: bot, foot: 1.0, rim: 0.0, form: 0.82, lock: true },
    { s: 0.64, y: bot, foot: 1.0, rim: 0.0, form: 0.76, lock: true },
    { s: 0.60, y: bot, foot: 0, rim: 0.0, form: 0.58, lock: false },
    { s: 0.00, y: bot, foot: 0, rim: 0.0, form: 0.54, lock: true },
  ];
}

/** 鉢の BufferGeometry を構築する。口縁の光・首の締まり・胴の丸み・雲足と足間の影で暗い面でも形を読ませる。 */
export function buildPotGeometry(THREE, potId, { gfx = 'high', seed = 1 } = {}) {
  const spec = POT_SPECS[potId] || POT_SPECS['oval-brown'];
  const rings = getPotRings(spec);
  const radialSegs = GFX_TIERS[gfx].potSegments;
  const ringCount = rings.length;
  const cols = radialSegs + 1;
  const vertCount = ringCount * cols;

  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const colors = new Float32Array(vertCount * 3);

  const halfW = spec.width * 0.5;
  const halfD = spec.depth * 0.5;
  const rng = createRng(seed).fork(`pot-geom-${spec.id}`);
  const noiseSeed = rng.int(1, 100000);
  const phase = rng.range(0, Math.PI * 2);
  const baseSrgb = hexToRgb01(spec.color);
  const rimSrgb = hexToRgb01(spec.rimColor);
  const baseLin = baseSrgb.map(srgbToLinear);

  for (let r = 0; r < ringCount; r += 1) {
    const ring = rings[r];
    const vCoord = 1 - r / (ringCount - 1);
    const isUnderbelly = r >= ringCount - 5;
    for (let c = 0; c <= radialSegs; c += 1) {
      const colIdx = c === radialSegs ? 0 : c;
      const theta = (colIdx / radialSegs) * Math.PI * 2;
      const [nx, nz] = shapeUnitPoint(spec.shape, theta);
      const f = footProfile(theta);

      let scale = ring.s;
      let y = ring.y;
      if (!ring.lock && ring.s > 0) {
        const wobble = (fbm2(Math.cos(theta) + 1.5, Math.sin(theta) + 1.5 + r * 0.3, noiseSeed, 2) - 0.5) * 0.008;
        scale = Math.min(0.992, Math.max(0.01, scale + wobble));
        y += Math.sin(theta * 3 + phase + r) * 0.0015;
      }
      if (ring.foot > 0) {
        y = ring.y + (spec.tableY - ring.y) * ring.foot * f;
        if (f > 0 && scale > 0.6) scale = Math.min(0.992, scale + 0.020 * f);
      }

      const idx = r * cols + c;
      positions[idx * 3] = nx * halfW * scale;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = nz * halfD * scale;
      uvs[idx * 2] = (c / radialSegs) * 2;
      uvs[idx * 2 + 1] = vCoord;

      let footFactor = 1.0;
      if (ring.foot > 0) {
        footFactor = f > 0.45 ? 1.05 : f > 0.08 ? 0.66 : 0.58;
      } else if (isUnderbelly && ring.s > 0) {
        footFactor = f > 0.5 ? 0.90 : 0.60;
      }

      const mottleVal = fbm2(nx * 2.2 + 3.1, nz * 2.2 + 3.1 + r * 0.28, noiseSeed, 3);
      const shade = (ring.form || 1.0) * footFactor * (0.88 + 0.18 * mottleVal);
      const rb = clamp01(ring.rim * (0.82 + 0.24 * fbm2(nx * 3.5 + 1, nz * 3.5 + 1, noiseSeed + 17, 2)));
      const warmShift = spec.id === 'oval-brown' ? (mottleVal - 0.5) * 0.08 : 0;
      for (let ch = 0; ch < 3; ch += 1) {
        const srgb = baseSrgb[ch] + (rimSrgb[ch] - baseSrgb[ch]) * rb;
        const chBias = ch === 0 ? 1 + warmShift : ch === 2 ? 1 - warmShift : 1;
        colors[idx * 3 + ch] = (srgbToLinear(srgb) / Math.max(0.01, baseLin[ch])) * shade * chBias;
      }
    }
  }

  const indices = [];
  for (let r = 0; r < ringCount - 1; r += 1) {
    for (let c = 0; c < radialSegs; c += 1) {
      const a = r * cols + c;
      const d = (r + 1) * cols + c;
      indices.push(a, a + 1, d, a + 1, d + 1, d);
    }
  }
  return finishGeometry(THREE, positions, uvs, colors, indices);
}

/** 鉢ローカル座標 (lx, lz) における土の表面の Y 座標を返す。 */
export function evaluateSoilHeight(spec, lx, lz, noiseSeed) {
  const halfW = spec.width * 0.5 * spec.innerScale;
  const halfD = spec.depth * 0.5 * spec.innerScale;
  const rNorm = Math.min(1, Math.hypot(lx / Math.max(1e-4, halfW), lz / Math.max(1e-4, halfD)));
  const dome = 1 - rNorm * rNorm;
  const grain = (fbm2(lx * 5.0 + 5, lz * 5.0 + 5, noiseSeed, 3) - 0.5) * 0.014;
  return -0.024 + 0.025 * dome + grain * dome;
}

function getStoneLayouts(spec, seed) {
  const halfW = spec.width * 0.5 * spec.innerScale;
  const halfD = spec.depth * 0.5 * spec.innerScale;
  const rng = createRng(seed).fork(`stones-geom-${spec.id}`);
  const soilNoiseSeed = createRng(seed).fork(`soil-geom-${spec.id}`).int(1, 100000);
  const stoneNoiseSeed = rng.int(1, 100000);
  const baseAngles = [0.36, 0.74, 2.34];
  const stones = [];

  for (let s = 0; s < 3; s += 1) {
    const angle = baseAngles[s] + rng.range(-0.10, 0.10);
    const dist = s === 1 ? rng.range(0.42, 0.54) : rng.range(0.48, 0.64);
    const [ux, uz] = shapeUnitPoint(spec.shape, angle);
    const cx = ux * halfW * dist;
    const cz = uz * halfD * dist;
    const soilY = evaluateSoilHeight(spec, cx, cz, soilNoiseSeed);
    const scale = s === 0 ? 1.12 : s === 1 ? 0.74 : 0.94;
    stones.push({
      cx, cy: soilY + 0.002, cz, soilY,
      rx: rng.range(0.086, 0.132) * scale,
      ry: rng.range(0.062, 0.094) * scale,
      rz: rng.range(0.076, 0.118) * scale,
      yaw: rng.range(0, Math.PI * 2),
      warmth: rng.range(0, 1),
    });
  }
  return { stones, soilNoiseSeed, stoneNoiseSeed };
}

/** 土の BufferGeometry を構築する。 */
export function buildSoilGeometry(THREE, potId, { gfx = 'high', seed = 1 } = {}) {
  const spec = POT_SPECS[potId] || POT_SPECS['oval-brown'];
  const radialSegs = GFX_TIERS[gfx].soilRadial;
  const ringSegs = GFX_TIERS[gfx].soilRings;
  const halfW = spec.width * 0.5 * spec.innerScale;
  const halfD = spec.depth * 0.5 * spec.innerScale;
  const noiseSeed = createRng(seed).fork(`soil-geom-${spec.id}`).int(1, 100000);

  const positions = [];
  const uvs = [];
  const colors = [];
  const cols = radialSegs + 1;

  for (let r = 0; r <= ringSegs; r += 1) {
    const frac = r / ringSegs;
    for (let c = 0; c <= radialSegs; c += 1) {
      const theta = ((c === radialSegs ? 0 : c) / radialSegs) * Math.PI * 2;
      const [ux, uz] = shapeUnitPoint(spec.shape, theta);
      const lx = ux * halfW * frac;
      const lz = uz * halfD * frac;
      positions.push(lx, evaluateSoilHeight(spec, lx, lz, noiseSeed), lz);
      uvs.push(lx * 0.9 + 0.5, lz * 0.9 + 0.5);
      const shade = 0.80 + 0.18 * (1 - frac * 0.75) + (fbm2(lx * 6.5 + 2, lz * 6.5 + 2, noiseSeed + 7, 2) - 0.5) * 0.16;
      colors.push(shade, shade * 0.98, shade * 0.95);
    }
  }
  for (let c = 0; c <= radialSegs; c += 1) {
    const theta = ((c === radialSegs ? 0 : c) / radialSegs) * Math.PI * 2;
    const [ux, uz] = shapeUnitPoint(spec.shape, theta);
    positions.push(ux * halfW, -0.06, uz * halfD);
    uvs.push(c / radialSegs, 0);
    colors.push(0.68, 0.66, 0.64);
  }
  const indices = [];
  for (let r = 0; r <= ringSegs; r += 1) {
    for (let c = 0; c < radialSegs; c += 1) {
      const a = r * cols + c;
      const d = (r + 1) * cols + c;
      indices.push(a, a + 1, d, a + 1, d + 1, d);
    }
  }
  return finishGeometry(THREE, positions, uvs, colors, indices);
}

/** 苔の BufferGeometry（くすんだ深緑 #3f5a2e〜#6b8a4c・被覆約6割・不規則な縁と細かな塊・根元盛り上がり）を構築する。 */
export function buildMossGeometry(THREE, potId, { gfx = 'high', seed = 1 } = {}) {
  const spec = POT_SPECS[potId] || POT_SPECS['oval-brown'];
  const halfW = spec.width * 0.5 * spec.innerScale;
  const halfD = spec.depth * 0.5 * spec.innerScale;
  const rng = createRng(seed).fork(`moss-geom-${spec.id}`);
  const mossSeed = rng.int(1, 100000);
  const { stones, soilNoiseSeed } = getStoneLayouts(spec, seed);
  const [treeX, , treeZ] = TREE_OFFSET;

  const baseLin = hexToRgb01('#486035').map(srgbToLinear);
  const edgeLin = hexToRgb01('#323e23').map(srgbToLinear);
  const darkLin = hexToRgb01('#3b542b').map(srgbToLinear);
  const midLin = hexToRgb01('#4b6538').map(srgbToLinear);
  const lightLin = hexToRgb01('#5c7943').map(srgbToLinear);
  const granuleLin = hexToRgb01('#6b8a4c').map(srgbToLinear);

  const evalCover = (lx, lz) => {
    const rPot = shapeNormRadius(spec.shape, lx, lz, halfW, halfD);
    if (rPot > 0.96) return -1;
    const dTree = Math.hypot(lx - treeX, lz - treeZ);
    const n1 = fbm2(lx * 2.35 + 2.3, lz * 2.35 + 4.1, mossSeed, 3);
    const n2 = fbm2(lx * 5.4 + 6.7, lz * 5.4 + 1.3, mossSeed + 37, 3);
    const n3 = fbm2(lx * 12.5 + 3.9, lz * 12.5 + 8.5, mossSeed + 73, 2);
    const n4 = (fbm2(lx * 24.0 + 1.1, lz * 24.0 + 5.7, mossSeed + 113, 2) - 0.5) * 0.14;
    const treeBoost = 0.66 * Math.exp(-(dTree * dTree) / (2 * 0.27 * 0.27));
    let stoneBoost = 0;
    for (let s = 0; s < stones.length; s += 1) {
      const st = stones[s];
      const ds = Math.hypot((lx - st.cx) / (st.rx * 1.15), (lz - st.cz) / (st.rz * 1.15));
      stoneBoost = Math.max(stoneBoost, 0.44 * Math.exp(-(ds * ds) / (2 * 1.15 * 1.15)));
    }
    const rimPenalty = rPot > 0.74 ? Math.pow((rPot - 0.74) / 0.20, 1.75) * 0.58 : 0;
    const hardRim = rPot > 0.92 ? (rPot - 0.92) * 8.0 : 0;
    return 0.42 * n1 + 0.34 * n2 + 0.24 * n3 + n4 + treeBoost + stoneBoost - rimPenalty - hardRim;
  };

  const gridX = GFX_TIERS[gfx].mossX;
  const gridZ = GFX_TIERS[gfx].mossZ;
  const cols = gridX + 1;
  const rows = gridZ + 1;
  const stepX = (halfW * 1.92) / gridX;
  const stepZ = (halfD * 1.92) / gridZ;
  const gx = new Float32Array(cols * rows);
  const gz = new Float32Array(cols * rows);
  const gc = new Float32Array(cols * rows);
  const validSamples = [];

  for (let iz = 0; iz < rows; iz += 1) {
    const z0 = (iz / gridZ - 0.5) * halfD * 1.92;
    for (let ix = 0; ix < cols; ix += 1) {
      const x0 = (ix / gridX - 0.5) * halfW * 1.92;
      const k = iz * cols + ix;
      let lx = x0 + (fbm2(x0 * 6.5 + 1.2, z0 * 6.5 + 3.4, mossSeed + 11, 2) - 0.5) * stepX * 0.52;
      let lz = z0 + (fbm2(x0 * 6.5 + 5.6, z0 * 6.5 + 7.8, mossSeed + 23, 2) - 0.5) * stepZ * 0.52;
      const rPot = shapeNormRadius(spec.shape, lx, lz, halfW, halfD);
      if (rPot > 0.93 && rPot < 1.18) {
        lx *= 0.925 / rPot;
        lz *= 0.925 / rPot;
      }
      gx[k] = lx;
      gz[k] = lz;
      gc[k] = evalCover(lx, lz);
      if (rPot <= 0.93) validSamples.push(gc[k]);
    }
  }

  validSamples.sort((a, b) => a - b);
  const tau = validSamples.length > 0 ? validSamples[Math.floor(validSamples.length * 0.40)] : 0.45;
  const eps = 0.013;
  const maxSnap = Math.min(stepX, stepZ) * 0.58;
  for (let k = 0; k < gx.length; k += 1) {
    const diff = gc[k] - tau;
    if (Math.abs(diff) < 0.095) {
      const lx = gx[k];
      const lz = gz[k];
      const dcx = (evalCover(lx + eps, lz) - evalCover(lx - eps, lz)) / (2 * eps);
      const dcz = (evalCover(lx, lz + eps) - evalCover(lx, lz - eps)) / (2 * eps);
      const gradSq = dcx * dcx + dcz * dcz + 1e-4;
      const nx = lx + Math.max(-maxSnap, Math.min(maxSnap, (-diff * dcx / gradSq) * 0.68));
      const nz = lz + Math.max(-maxSnap, Math.min(maxSnap, (-diff * dcz / gradSq) * 0.68));
      if (shapeNormRadius(spec.shape, nx, nz, halfW, halfD) <= 0.935) {
        gx[k] = nx;
        gz[k] = nz;
        gc[k] = evalCover(nx, nz);
      }
    }
  }

  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  const vertMap = new Int32Array(cols * rows).fill(-1);

  const pushMossVertex = (lx, lz, edgeT, microBoost = 0) => {
    const soilY = evaluateSoilHeight(spec, lx, lz, soilNoiseSeed);
    const dTree = Math.hypot(lx - treeX, lz - treeZ);
    const b1 = fbm2(lx * 7.2 + 1.4, lz * 7.2 + 5.2, mossSeed + 41, 3);
    const b2 = fbm2(lx * 16.5 + 7.3, lz * 16.5 + 2.9, mossSeed + 83, 3);
    const b3 = fbm2(lx * 33.0 + 3.1, lz * 33.0 + 6.4, mossSeed + 127, 2);
    // 幹の根張り（地表 y=0.03〜0.07 に出る根）を埋めないよう、盛り上がり高さを 0.02〜0.036 以内に抑える
    const mound1 = Math.pow(Math.max(0, b1 - 0.18) / 0.82, 1.25) * 0.011;
    const mound2 = Math.pow(Math.max(0, b2 - 0.20) / 0.80, 1.20) * 0.008;
    const mound3 = (b3 - 0.42) * 0.004;
    const rootLift = Math.exp(-(dTree * dTree) / (2 * 0.20 * 0.20)) * (0.013 + 0.005 * b2);

    let stoneLift = 0;
    let stoneAo = 1.0;
    for (let s = 0; s < stones.length; s += 1) {
      const st = stones[s];
      const ds = Math.hypot((lx - st.cx) / st.rx, (lz - st.cz) / st.rz);
      if (ds < 1.65) {
        stoneLift = Math.max(stoneLift, Math.exp(-Math.pow((ds - 0.95) / 0.42, 2)) * 0.009);
        if (ds < 1.22) stoneAo = Math.min(stoneAo, 0.78 + 0.22 * Math.max(0, (ds - 0.75) / 0.47));
      }
    }

    const edgeCurve = Math.pow(clamp01(edgeT), 0.54);
    const rawLift = (0.004 + mound1 + mound2 + mound3 + rootLift + stoneLift + microBoost) * edgeCurve - (1 - edgeCurve) * 0.002;
    const lift = Math.min(0.036, rawLift);
    const yMoss = Math.min(0.036, soilY + lift);
    positions.push(lx, yMoss, lz);
    uvs.push(lx * 1.85 + 0.5, lz * 1.85 + 0.5);

    const patchN = fbm2(lx * 5.8 + 9.1, lz * 5.8 + 4.7, mossSeed + 157, 3);
    const fineN = fbm2(lx * 19.5 + 2.5, lz * 19.5 + 7.8, mossSeed + 193, 2);
    const granuleN = fbm2(lx * 35.0 + 6.1, lz * 35.0 + 1.9, mossSeed + 229, 2);
    const hNorm = clamp01((mound1 + mound2 + microBoost) / 0.018);
    const tCol = clamp01(0.38 * patchN + 0.34 * hNorm + 0.28 * fineN);
    const granW = (granuleN > 0.64 && edgeT > 0.28) ? clamp01((granuleN - 0.64) / 0.22) * 0.85 : 0;
    const edgeW = clamp01(1 - edgeT * 1.5) * 0.68;
    const valleyAo = (0.74 + 0.22 * Math.pow(edgeCurve, 0.5) * (0.62 + 0.38 * hNorm)) * stoneAo;

    for (let ch = 0; ch < 3; ch += 1) {
      let cLin = tCol < 0.5
        ? darkLin[ch] + (midLin[ch] - darkLin[ch]) * (tCol * 2)
        : midLin[ch] + (lightLin[ch] - midLin[ch]) * ((tCol - 0.5) * 2);
      cLin += (granuleLin[ch] - cLin) * granW;
      cLin += (edgeLin[ch] - cLin) * edgeW;
      colors.push((cLin * valleyAo) / baseLin[ch]);
    }
  };

  const getVertIdx = (k) => {
    if (vertMap[k] >= 0) return vertMap[k];
    const idx = positions.length / 3;
    vertMap[k] = idx;
    pushMossVertex(gx[k], gz[k], clamp01((gc[k] - (tau - 0.010)) / 0.095), 0);
    return idx;
  };

  for (let iz = 0; iz < gridZ; iz += 1) {
    for (let ix = 0; ix < gridX; ix += 1) {
      const k00 = iz * cols + ix;
      const k10 = k00 + 1;
      const k01 = (iz + 1) * cols + ix;
      const k11 = k01 + 1;
      const tris = ((ix + iz) & 1) === 0 ? [[k00, k10, k11], [k00, k11, k01]] : [[k00, k10, k01], [k10, k11, k01]];
      for (let t = 0; t < 2; t += 1) {
        const [a, b, c] = tris[t];
        if (gc[a] < -0.5 || gc[b] < -0.5 || gc[c] < -0.5) continue;
        const above = (gc[a] >= tau ? 1 : 0) + (gc[b] >= tau ? 1 : 0) + (gc[c] >= tau ? 1 : 0);
        if (above >= 2 || (gc[a] + gc[b] + gc[c]) / 3 >= tau - 0.003) {
          indices.push(getVertIdx(a), getVertIdx(c), getVertIdx(b));
        }
      }
    }
  }

  const microCount = GFX_TIERS[gfx].mossClumps;
  const microRadSegs = GFX_TIERS[gfx].mossRadial;
  for (let m = 0; m < microCount; m += 1) {
    const angle = (m / microCount) * Math.PI * 2 + rng.range(-0.25, 0.25);
    const dist = m < 6 ? rng.range(0.14, 0.28) : rng.range(0.26, 0.78);
    const [ux, uz] = shapeUnitPoint(spec.shape, angle);
    const cx = (m < 6 ? treeX : treeX * 0.45) + ux * halfW * dist;
    const cz = (m < 6 ? treeZ : treeZ * 0.45) + uz * halfD * dist;
    if (shapeNormRadius(spec.shape, cx, cz, halfW, halfD) > 0.87) continue;

    const rad = rng.range(0.022, 0.050);
    const centerIdx = positions.length / 3;
    pushMossVertex(cx, cz, 0.85, rng.range(0.003, 0.007));
    for (let c = 0; c <= microRadSegs; c += 1) {
      const th = ((c === microRadSegs ? 0 : c) / microRadSegs) * Math.PI * 2;
      const warp = 0.68 + 0.58 * fbm2(Math.cos(th) * 1.8 + m * 3.1, Math.sin(th) * 1.8 + m * 1.7, mossSeed + 271, 2);
      pushMossVertex(cx + Math.cos(th) * rad * warp, cz + Math.sin(th) * rad * warp, 0.05, 0);
    }
    for (let c = 0; c < microRadSegs; c += 1) {
      indices.push(centerIdx, centerIdx + 1 + c + 1, centerIdx + 1 + c);
    }
  }
  return finishGeometry(THREE, positions, uvs, colors, indices);
}

/** 苔に半分埋まる小さな景石（3個の不規則な多面体）の BufferGeometry を構築する。 */
export function buildStonesGeometry(THREE, potId, { gfx = 'high', seed = 1 } = {}) {
  const spec = POT_SPECS[potId] || POT_SPECS['oval-brown'];
  const { stones, stoneNoiseSeed } = getStoneLayouts(spec, seed);
  const latBands = GFX_TIERS[gfx].stoneLat;
  const lonBands = GFX_TIERS[gfx].stoneLon;
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  for (let s = 0; s < stones.length; s += 1) {
    const { cx, cy, cz, rx, ry, rz, yaw, warmth } = stones[s];
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const baseVertex = positions.length / 3;
    const cols = lonBands + 1;

    for (let lat = 0; lat <= latBands; lat += 1) {
      const v = lat / latBands;
      const phi = v * Math.PI;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      const skirtR = cosP >= 0.1 ? sinP : Math.max(sinP, 0.94 - 0.18 * (-cosP));
      for (let lon = 0; lon <= lonBands; lon += 1) {
        const theta = ((lon === lonBands ? 0 : lon) / lonBands) * Math.PI * 2;
        const nx = skirtR * Math.cos(theta);
        const ny = cosP;
        const nz = skirtR * Math.sin(theta);
        const nVal = fbm3(nx * 2.2 + s * 3.1, ny * 2.2 + 1.7, nz * 2.2 + s * 1.9, stoneNoiseSeed, 3);
        const facet = 0.78 + 0.36 * Math.round(nVal * 4) / 4;
        const ox = nx * rx * facet;
        const oy = (ny >= 0 ? ny * 0.88 : ny * 0.72) * ry * facet;
        const oz = nz * rz * facet;

        positions.push(cx + ox * cosY - oz * sinY, cy + oy, cz + ox * sinY + oz * cosY);
        uvs.push(lon / lonBands, v);
        const mossContact = clamp01((ny + 0.15) / 0.55);
        const shade = (0.76 + 0.26 * Math.max(0, ny)) * (0.86 + 0.24 * nVal) * (0.54 + 0.46 * mossContact);
        colors.push(
          shade * (0.95 + 0.10 * warmth),
          shade * (0.95 + 0.04 * warmth) * (1.0 + (1 - mossContact) * 0.05),
          shade * (0.92 - 0.08 * warmth),
        );
      }
    }
    for (let lat = 0; lat < latBands; lat += 1) {
      for (let lon = 0; lon < lonBands; lon += 1) {
        const a = baseVertex + lat * cols + lon;
        const d = baseVertex + (lat + 1) * cols + lon;
        indices.push(a, a + 1, d, a + 1, d + 1, d);
      }
    }
  }
  return finishGeometry(THREE, positions, uvs, colors, indices);
}

/** 壁付けの飾り棚（幅15.0×奥行4.55・板厚0.24、後ろ端は z=WALL_Z で壁に密着＋下部に3個の三角形の持ち送り）を構築する。 */
export function buildTableGeometry(THREE, { seed = 1 } = {}) {
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  const bracketJitter = createRng(seed).fork('table-geom').range(-0.004, 0.004);
  const halfW = TABLE_WIDTH * 0.5;
  const z0 = WALL_Z;
  const z1 = z0 + TABLE_DEPTH;
  const boardBotY = -0.24;

  const addQuad = (p0, p1, p2, p3, shade0, shade1 = shade0) => {
    const base = positions.length / 3;
    const pts = [p0, p1, p2, p3];
    const shades = [shade0, shade0, shade1, shade1];
    for (let i = 0; i < 4; i += 1) {
      const [x, y, z] = pts[i];
      const sh = shades[i];
      positions.push(x, y, z);
      uvs.push((z - z0) / TABLE_DEPTH + y * 0.22, (x + halfW) / (TABLE_WIDTH * 0.5));
      colors.push(sh, sh * 0.99, sh * 0.97);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  // 1) 棚板本体（後ろ端 z0=WALL_Z は壁に隙間なく密着させ、手前と左右の3辺に面取りのハイライトを入れる）
  const bevel = 0.052;
  const topShade = 1.0;
  const sideShade = 0.88;
  const bevShade = (topShade + sideShade) * 0.56;
  const bx0 = -halfW + bevel;
  const bx1 = halfW - bevel;
  const bz0 = z0;
  const bz1 = z1 - bevel;
  const by = -bevel * 0.72;

  addQuad([bx0, 0, bz1], [bx1, 0, bz1], [bx1, 0, bz0], [bx0, 0, bz0], topShade);
  addQuad([bx0, 0, bz1], [-halfW, by, z1], [halfW, by, z1], [bx1, 0, bz1], topShade * 1.12, bevShade * 1.08);
  addQuad([bx1, 0, bz1], [halfW, by, z1], [halfW, by, z0], [bx1, 0, bz0], topShade * 1.04, bevShade);
  addQuad([bx0, 0, bz0], [-halfW, by, z0], [-halfW, by, z1], [bx0, 0, bz1], topShade * 1.00, bevShade);

  addQuad([-halfW, by, z1], [-halfW, boardBotY, z1], [halfW, boardBotY, z1], [halfW, by, z1], sideShade, sideShade * 0.90);
  addQuad([halfW, by, z1], [halfW, boardBotY, z1], [halfW, boardBotY, z0], [halfW, by, z0], sideShade * 0.94, sideShade * 0.85);
  addQuad([halfW, 0, z0], [halfW, boardBotY, z0], [-halfW, boardBotY, z0], [-halfW, 0, z0], sideShade * 0.84, sideShade * 0.76);
  addQuad([-halfW, by, z0], [-halfW, boardBotY, z0], [-halfW, boardBotY, z1], [-halfW, by, z1], sideShade * 0.92, sideShade * 0.84);
  addQuad([-halfW, boardBotY, z0], [halfW, boardBotY, z0], [halfW, boardBotY, z1], [-halfW, boardBotY, z1], sideShade * 0.70);

  // 2) 持ち送り（三角形の木の支え：左右と中央の3個で壁 z0=WALL_Z と棚板下面 y=boardBotY をつなぐ）
  // 奥（壁側）から手前（木鼻）へわずかに先細りさせ、斜め正面からの光を側面にも受けさせて木の質感を見せる
  const halfBWBack = 0.21 + bracketJitter * 0.25;
  const halfBWFront = 0.14 + bracketJitter * 0.25;
  const zBack = z0;
  const zHeel = -0.18;
  const zFront = z1 - 0.12 + bracketJitter;
  const yTop = boardBotY;
  const yToe = -0.34;
  const yWallBot = -0.92;
  const yApex = -1.46;

  for (const xc of TABLE_BRACKET_XS) {
    const xb0 = xc - halfBWBack;
    const xb1 = xc + halfBWBack;
    const xh0 = xc - (halfBWBack * 0.65 + halfBWFront * 0.35);
    const xh1 = xc + (halfBWBack * 0.65 + halfBWFront * 0.35);
    const xf0 = xc - halfBWFront;
    const xf1 = xc + halfBWFront;

    // 外周面（壁側・下側・斜辺・木鼻・上面）
    addQuad([xb0, yWallBot, zBack], [xb0, yTop, zBack], [xb1, yTop, zBack], [xb1, yWallBot, zBack], 0.72, 0.68);
    addQuad([xh0, yWallBot, zHeel], [xb0, yWallBot, zBack], [xb1, yWallBot, zBack], [xh1, yWallBot, zHeel], 0.70, 0.74);
    addQuad([xh0, yApex, zHeel], [xh0, yWallBot, zHeel], [xh1, yWallBot, zHeel], [xh1, yApex, zHeel], 0.72, 0.66);
    addQuad([xf0, yToe, zFront], [xh0, yApex, zHeel], [xh1, yApex, zHeel], [xf1, yToe, zFront], 1.04, 0.88);
    addQuad([xf0, yTop, zFront], [xf0, yToe, zFront], [xf1, yToe, zFront], [xf1, yTop, zFront], 1.08, 0.98);
    addQuad([xb0, yTop, zBack], [xf0, yTop, zFront], [xf1, yTop, zFront], [xb1, yTop, zBack], 0.80, 0.80);

    // 左側面（-X＋わずかに+Z法線）: 奥の壁受け部＋手前の三角形支え部
    addQuad([xb0, yTop, zBack], [xb0, yWallBot, zBack], [xh0, yWallBot, zHeel], [xh0, yTop, zHeel], 0.84, 0.94);
    addQuad([xh0, yTop, zHeel], [xh0, yApex, zHeel], [xf0, yToe, zFront], [xf0, yTop, zFront], 0.86, 1.00);
    // 右側面（+X＋わずかに+Z法線）: カメラから見える主たる三角形の側面（棚板直下の陰から斜辺へ木肌を見せる）
    addQuad([xb1, yTop, zBack], [xh1, yTop, zHeel], [xh1, yWallBot, zHeel], [xb1, yWallBot, zBack], 0.82, 0.94);
    addQuad([xh1, yTop, zHeel], [xf1, yTop, zFront], [xf1, yToe, zFront], [xh1, yApex, zHeel], 0.84, 1.02);
  }

  return finishGeometry(THREE, positions, uvs, colors, indices);
}

/** 和紙の壁（幅96×高さ56、z=info.wallZ、単一平面）の BufferGeometry を構築する。 */
export function buildWallGeometry(THREE, { gfx = 'high' } = {}) {
  const width = WALL_WIDTH;
  const height = WALL_HEIGHT;
  const centerY = 2.0;
  const segX = GFX_TIERS[gfx].wallX;
  const segY = GFX_TIERS[gfx].wallY;
  // 旧寸法（44×28 で 4.0×2.5 周期）と同じ実寸模様サイズ（約11単位/周期）を維持する
  const repeatX = (width / 44.0) * 4.0;
  const repeatY = (height / 28.0) * 2.5;
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  const fullMinY = centerY - height * 0.5;
  const fullMaxY = centerY + height * 0.5;
  const cols = segX + 1;
  for (let iy = 0; iy <= segY; iy += 1) {
    const vGlobal = iy / segY;
    const y = fullMinY + vGlobal * (fullMaxY - fullMinY);
    for (let ix = 0; ix <= segX; ix += 1) {
      const u = ix / segX;
      const x = (u - 0.5) * width;
      positions.push(x, y, 0);
      uvs.push(u * repeatX, vGlobal * repeatY);
      const dx = x / 18.0;
      const dy = (y - 1.5) / 13.0;
      const nonPeriodic = (fbm2(x * 0.18 + 3.7, y * 0.18 + 1.9, 91, 2) - 0.5) * 0.025;
      const vignette = Math.max(0.93, 1.015 - 0.035 * (dx * dx + dy * dy)) + nonPeriodic;
      colors.push(vignette, vignette, vignette * 0.99);
    }
  }
  for (let iy = 0; iy < segY; iy += 1) {
    for (let ix = 0; ix < segX; ix += 1) {
      const a = iy * cols + ix;
      const d = (iy + 1) * cols + ix;
      indices.push(a, a + 1, d, a + 1, d + 1, d);
    }
  }
  return finishGeometry(THREE, positions, uvs, colors, indices);
}
