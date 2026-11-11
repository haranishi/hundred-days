// 木・樹氷・岩の形を、起動時に手続きで作る（素材ファイルを使わない）。
// どの形も高さ 1 を基準に作り、置くときに障害物の高さで拡大する。色は頂点に持たせ、雪の白と地の色を分ける。
import * as THREE from 'three/webgpu';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { float, length, positionView, uniform } from 'three/tsl';

/**
 * 切り欠きの奥行き（m）。後ろからの視点のとき、カメラから滑走者までの距離を入れる（0 なら、すぐそばだけ切る）。
 * 木のわきを抜けるとき、カメラが枝ぶりの中に入って、画面が枝で埋まった（体験の採点 1 周目。カメラを横へ押し出す処理だけでは、大きな木で足りなかった）。
 * 画面の中央の、滑走者より手前にある枝と岩は、描かない。影には効かない（影を作るときのカメラは、太陽の側の遠くにある）
 */
export const viewCut = uniform(0);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 位置から決まる、なめらかな雑音（塊の表面を崩すため）
function lump(x, y, z, k) {
  return Math.sin(x * 2.1 * k + 1.3) * Math.cos(z * 1.7 * k + 0.4) * 0.5 + Math.sin(y * 2.9 * k + x * 1.1 * k) * 0.3 + Math.cos(z * 3.3 * k - y * 1.9 * k) * 0.2;
}

// 雪面の色（terrain.js）より明るくしない：木や樹氷だけが光って見える
const SNOW = new THREE.Color(0.85, 0.88, 0.93);
const SNOW_SHADE = new THREE.Color(0.58, 0.68, 0.83);
const NEEDLE = new THREE.Color(0.055, 0.105, 0.075);
const BARK = new THREE.Color(0.13, 0.095, 0.07);
const ROCK = new THREE.Color(0.20, 0.19, 0.18);

function colorize(geo, fn) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    fn(c, pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function blob(radius, detail, sx, sy, sz, ox, oy, oz, rough, seedK) {
  // 多面体は面ごとに頂点が分かれている。まとめてから法線を作り、角ばらないなめらかな塊にする
  const raw = new THREE.IcosahedronGeometry(radius, detail);
  raw.deleteAttribute('uv');
  raw.deleteAttribute('normal');
  const g = mergeVertices(raw, 1e-4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = 1 + lump(x + seedK, y, z - seedK, 2.2 / radius) * rough;
    p.setXYZ(i, x * d * sx + ox, y * d * sy + oy, z * d * sz + oz);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * 樹氷：雪と氷に厚く覆われた木。枝の段ごとに雪の塊がふくらみ、風上へ伸びる。
 * 球を積むと雪だるまに見えるので、1つの面を高さと方位でふくらませて作る（塊どうしの境目が溝になり、全体は1つの山に見える）。
 * 幅は半径 0.3（高さ 1 に対して）を基準に作り、置くときに当たりの大きさへ合わせて伸ばす。lod 0=近く, 1=中, 2=遠く
 */
function snowMonster(seed, lod) {
  const r = rng(seed);
  const seg = lod === 0 ? 16 : lod === 1 ? 8 : 5;
  const rings = lod === 0 ? 12 : lod === 1 ? 6 : 3;
  const tiers = 3 + Math.floor(r() * 2); // 枝の段の数
  const phase = r() * Math.PI * 2;
  const wind = Math.PI * 1.25 + (r() - 0.5) * 0.5; // 風上（北西）の方位。雪と氷は風上へ育つ
  const lean = 0.07 + r() * 0.1;
  const squash = 0.9 + r() * 0.2;
  const pos = [];
  const cav = []; // くぼみの度合い（色を暗くする）
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    // 鐘の形：中ほどまで太く、頭は丸い
    const base = 0.3 * Math.pow(1 - Math.pow(t, 2.2), 0.75) * (0.82 + 0.18 * (1 - t));
    const wave = Math.sin(t * tiers * Math.PI * 2 - 1.2);
    const bulge = 1 + 0.24 * Math.pow(Math.max(0, wave), 1.4) * (1 - t * 0.45) - 0.08 * Math.max(0, -wave);
    // 段の下の縁は、雪の重みで少し垂れる
    const droop = lod === 2 ? 0 : 0.022 * Math.max(0, wave) * (1 - t);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const lobes = lod === 2 ? 1 : 1 + 0.15 * Math.sin(a * 3 + phase + t * 5) * (1 - t * 0.6) + (lod === 0 ? 0.08 * Math.sin(a * 5 - phase * 1.7 + t * 9) : 0);
      const toWind = 1 + 0.26 * Math.cos(a - wind) * (0.4 + t * 0.6);
      const rad = j === rings ? 0 : base * bulge * lobes * toWind * squash;
      pos.push(Math.cos(a) * rad + Math.cos(wind) * lean * Math.pow(t, 1.3), t - droop, Math.sin(a) * rad + Math.sin(wind) * lean * Math.pow(t, 1.3));
      cav.push(Math.min(1, Math.max(0, (bulge * lobes - 0.86) / 0.4)));
    }
  }
  const idx = [];
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * seg + i, b = j * seg + ((i + 1) % seg), c = (j + 1) * seg + i, d = (j + 1) * seg + ((i + 1) % seg);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  let k = 0;
  return colorize(g, (c, x, y, z, nx, ny) => {
    // 上を向いた面は白く、下を向いた面とくぼみは青い陰（葉の暗い色は入れない：くぼみが顔の口のように見えた）
    const hollow = cav[k++];
    const shade = Math.min(1, Math.max(0, 0.5 + ny * 0.55)) * (0.72 + 0.28 * hollow);
    c.copy(SNOW_SHADE).lerp(SNOW, shade);
    c.multiplyScalar(0.8 + 0.2 * Math.min(1, y / 0.22)); // 根元は周りの雪に囲まれて暗い
  });
}

/** 雪をのせた針葉樹。段になった枝の上面が白い */
function snowyFir(seed, lod) {
  const r = rng(seed);
  const parts = [];
  const seg = lod === 0 ? 9 : lod === 1 ? 6 : 4;
  const tiers = lod === 0 ? 6 : lod === 1 ? 4 : 1;
  if (lod < 2) {
    const trunk = new THREE.CylinderGeometry(0.018, 0.03, 0.3, lod === 0 ? 6 : 4);
    trunk.translate(0, 0.15, 0);
    trunk.deleteAttribute('uv');
    parts.push(colorize(trunk.toNonIndexed(), (c) => c.copy(BARK)));
  }
  for (let t = 0; t < tiers; t++) {
    const f = tiers === 1 ? 0 : t / (tiers - 1);
    const rad = tiers === 1 ? 0.2 : 0.235 - f * 0.185 + r() * 0.015;
    const h = tiers === 1 ? 0.9 : 0.27 - f * 0.07;
    const y = tiers === 1 ? 0.5 : 0.16 + f * 0.66;
    const cone = new THREE.ConeGeometry(rad, h, seg, 1, false, r() * 6.28);
    cone.translate((r() - 0.5) * 0.02, y + h * 0.5 - 0.06, (r() - 0.5) * 0.02);
    cone.deleteAttribute('uv');
    const ng = cone.toNonIndexed();
    parts.push(colorize(ng, (c, x, yy, z, nx, ny) => {
      // 上を向いた面ほど雪。縁（半径の外側）は葉がのぞく
      const edge = Math.hypot(x, z) / Math.max(0.001, rad);
      const snow = Math.min(1, Math.max(0, ny * 2.2 + 0.25 - Math.max(0, edge - 0.82) * 2.5));
      c.copy(NEEDLE).lerp(SNOW, snow);
      if (ny < 0) c.copy(NEEDLE).multiplyScalar(0.7);
    }));
  }
  const g = mergeGeometries(parts, false);
  return g;
}

/** 雪をかぶった岩 */
function snowyRock(seed, lod) {
  const g = blob(0.5, lod === 0 ? 2 : lod === 1 ? 1 : 0, 1.25, 0.75, 1.0, 0, 0.22, 0, lod === 2 ? 0.1 : 0.32, seed * 1.9);
  return colorize(g, (c, x, y, z, nx, ny) => {
    const snow = Math.min(1, Math.max(0, (ny - 0.45) * 3.5));
    c.copy(ROCK).multiplyScalar(0.8 + lump(x, y, z, 6) * 0.25).lerp(SNOW, snow);
  });
}

export const SHAPE_VARIANTS = 3;
export const SHAPE_LODS = 3;

/**
 * @returns {{monster:THREE.BufferGeometry[][], tree:THREE.BufferGeometry[][], rock:THREE.BufferGeometry[][]}} [変種][段]
 */
export function buildShapes() {
  const make = (fn, base) => Array.from({ length: SHAPE_VARIANTS }, (_, v) => Array.from({ length: SHAPE_LODS }, (_, lod) => fn(base + v * 17, lod)));
  return { monster: make(snowMonster, 11), tree: make(snowyFir, 101), rock: make(snowyRock, 1001) };
}

export function createObjectMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  const depth = positionView.z.negate(), radial = length(positionView.xy);
  const between = depth.lessThan(viewCut).and(radial.lessThan(depth.mul(0.3).add(0.5)));
  const touching = length(positionView).lessThan(1.8);
  m.opacityNode = between.or(touching).select(float(0), float(1));
  m.alphaTest = 0.5;
  return m;
}
