// 葉はパッドごとの扁平な雲。殻だけに並べると中空の椀になるので、体積にも置く。
// 色は look の sRGB を線形にしてから出す。明るい灰のアトラスのまま掛けると、ACES で鮭色に抜ける。
import { createRng } from './rng.js';

export const PAD_CARDS = Object.freeze({ high: 120, low: 60, test: 6 });
export const MAX_LEAF_CARDS = 6000;
// 高さ / 幅。天面は少し丸く、下面は平ら。幅は水平方向の直径。
export const PAD_FLAT = 0.45;
const REF_RADIUS = 0.36;
// 既定カメラ（az 20・pol 72）の、木からカメラへ向かう単位ベクトル。縁の房を真正面の紙切れにしない。
const TO_CAM = [0.325, 0.309, 0.894];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clamp01 = (v) => clamp(v, 0, 1);

/** density と半径で枚数を決める。半径 0.36・density 1 のとき、画質の枚数ちょうど。 */
export function cardBudget(radius, density, gfx = 'high') {
  if (!(radius > 0) || !(density > 0)) return 0;
  const cap = PAD_CARDS[gfx] ?? PAD_CARDS.low;
  const sized = cap * clamp(density, 0, 1) * clamp(radius / REF_RADIUS, 0.72, 1.08);
  return Math.max(1, Math.round(sized));
}

/** 合計が上限を超えたら、割合を保ったまま切り捨てる。 */
export function capBudgets(budgets, max = MAX_LEAF_CARDS) {
  const total = budgets.reduce((sum, n) => sum + n, 0);
  if (total <= max) return budgets.slice();
  const out = budgets.map((n) => Math.floor((n * max) / total));
  let left = max - out.reduce((sum, n) => sum + n, 0);
  for (let i = 0; left > 0 && i < out.length; i += 1) {
    if (budgets[i] > out[i]) {
      out[i] += 1;
      left -= 1;
    }
  }
  return out;
}

/**
 * 見える割合。coverage 0 では 0、1 では 1。帯はしきい値の下側だけに取り、0 で透けない。
 * しきい値は 0.08 以上にしてある。
 */
export function cardAppear(threshold, amount) {
  const cover = clamp01(amount);
  const start = Math.max(0, threshold - 0.07);
  const end = Math.max(start + 1e-4, threshold);
  if (cover <= start) return 0;
  const t = clamp01((cover - start) / (end - start));
  return t * t * (3 - 2 * t);
}

function mix3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function norm3(x, y, z) {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

/**
 * 列ベクトル (X, Y, Z) からクォータニオン。引数は各軸の xyz。
 * three.js の setFromRotationMatrix と同じ符号（列優先）。
 */
export function quatFromBasis(xx, xy, xz, yx, yy, yz, zx, zy, zz) {
  const trace = xx + yy + zz;
  let x;
  let y;
  let z;
  let w;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = 0.25 * s;
    x = (yz - zy) / s;
    y = (zx - xz) / s;
    z = (xy - yx) / s;
  } else if (xx > yy && xx > zz) {
    const s = Math.sqrt(1 + xx - yy - zz) * 2;
    w = (yz - zy) / s;
    x = 0.25 * s;
    y = (xy + yx) / s;
    z = (xz + zx) / s;
  } else if (yy > zz) {
    const s = Math.sqrt(1 + yy - xx - zz) * 2;
    w = (zx - xz) / s;
    x = (xy + yx) / s;
    y = 0.25 * s;
    z = (yz + zy) / s;
  } else {
    const s = Math.sqrt(1 + zz - xx - yy) * 2;
    w = (xy - yx) / s;
    x = (xz + zx) / s;
    y = (yz + zy) / s;
    z = 0.25 * s;
  }
  const len = Math.hypot(x, y, z, w) || 1;
  return [x / len, y / len, z / len, w / len];
}

export function rotateQuat(q, v) {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}

function basisQuat(ox, oy, oz, roll, tilt) {
  const [zx, zy, zz] = norm3(ox, oy, oz);
  let hx = 0;
  let hy = 1;
  let hz = 0;
  if (Math.abs(zy) > 0.92) { hx = 1; hy = 0; hz = 0; }
  let xx = hy * zz - hz * zy;
  let xy = hz * zx - hx * zz;
  let xz = hx * zy - hy * zx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl;
  xy /= xl;
  xz /= xl;
  let yx = zy * xz - zz * xy;
  let yy = zz * xx - zx * xz;
  let yz = zx * xy - zy * xx;
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  const rx = xx * c + yx * s;
  const ry = xy * c + yy * s;
  const rz = xz * c + yz * s;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const Zx = zx * ct + rx * st;
  const Zy = zy * ct + ry * st;
  const Zz = zz * ct + rz * st;
  const Xx = rx * ct - zx * st;
  const Xy = ry * ct - zy * st;
  const Xz = rz * ct - zz * st;
  const Yx = Zy * Xz - Zz * Xy;
  const Yy = Zz * Xx - Zx * Xz;
  const Yz = Zx * Xy - Zy * Xx;
  return quatFromBasis(Xx, Xy, Xz, Yx, Yy, Yz, Zx, Zy, Zz);
}

/** 1枚の葉。中央だけ少し膨らませ、法線が面の中で変わるようにする。深い椀にはしない。 */
export function leafCardGeometry() {
  const gx = 3;
  const gy = 2;
  const positions = [];
  const uvs = [];
  const grid = [];
  for (let j = 0; j <= gy; j += 1) {
    for (let i = 0; i <= gx; i += 1) {
      const u = i / gx;
      const v = j / gy;
      const x = u - 0.5;
      const y = (v - 0.5) * 0.92;
      const z = 0.12 * Math.cos(x * Math.PI) * Math.cos(y * Math.PI);
      grid.push([x, y, z]);
      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }
  const cols = gx + 1;
  const normals = new Array(grid.length * 3).fill(0);
  const indices = [];
  const addFace = (ia, ib, ic) => {
    const ax = grid[ib][0] - grid[ia][0];
    const ay = grid[ib][1] - grid[ia][1];
    const az = grid[ib][2] - grid[ia][2];
    const bx = grid[ic][0] - grid[ia][0];
    const by = grid[ic][1] - grid[ia][1];
    const bz = grid[ic][2] - grid[ia][2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    for (const k of [ia, ib, ic]) {
      normals[k * 3] += nx;
      normals[k * 3 + 1] += ny;
      normals[k * 3 + 2] += nz;
    }
    indices.push(ia, ib, ic);
  };
  for (let j = 0; j < gy; j += 1) {
    for (let i = 0; i < gx; i += 1) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      addFace(a, c, b);
      addFace(b, c, d);
    }
  }
  for (let i = 0; i < grid.length; i += 1) {
    const len = Math.hypot(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]) || 1;
    normals[i * 3] /= len;
    normals[i * 3 + 1] /= len;
    normals[i * 3 + 2] /= len;
  }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: Float32Array.from(uvs),
    indices: Uint16Array.from(indices),
  };
}

/** パッドの芯。低ポリの球で、スケールで扁平にする。Y が短い軸。 */
export function padCoreGeometry() {
  const stacks = 4;
  const slices = 7;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let j = 0; j <= stacks; j += 1) {
    const v = j / stacks;
    const phi = v * Math.PI;
    const y = Math.cos(phi) * 0.5;
    const ring = Math.sin(phi) * 0.5;
    for (let i = 0; i <= slices; i += 1) {
      const u = i / slices;
      const theta = u * Math.PI * 2;
      const x = Math.cos(theta) * ring;
      const z = Math.sin(theta) * ring;
      positions.push(x, y, z);
      const len = Math.hypot(x, y, z) || 1;
      normals.push(x / len, y / len, z / len);
      uvs.push(u, 1 - v);
    }
  }
  const cols = slices + 1;
  for (let j = 0; j < stacks; j += 1) {
    for (let i = 0; i < slices; i += 1) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if (j !== 0) indices.push(a, c, b);
      if (j !== stacks - 1) indices.push(b, c, d);
    }
  }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: Float32Array.from(uvs),
    indices: Uint16Array.from(indices),
  };
}

function paleFor(species) {
  if (species === 'pine') return [0.72, 0.84, 0.46];
  if (species === 'plum') return [0.98, 0.9, 0.9];
  return [0.84, 0.9, 0.58];
}

// 黒松の先端。look の color2 が深緑の季節でも、房の先に少しだけ黄緑を残す。
const PINE_TIP = [0x9c / 255, 0xc6 / 255, 0x6a / 255];

function layerCuts(species) {
  // 紅葉のほつれは最後の1.5%だけ。6%だと塊の下縁に暗い小片が垂れる。
  if (species === 'maple') return [0.4, 0.74, 0.985];
  if (species === 'pine') return [0.28, 0.72, 0.96];
  return [0.4, 0.74, 0.94];
}

function sampleCloud(rng, layer, species) {
  if (layer === 0) {
    return { radial: Math.sqrt(rng.range(0.02, 0.58)), vert: rng.range(-0.28, 0.72) };
  }
  if (layer === 1) {
    const radial = Math.sqrt(rng.range(0, species === 'pine' ? 0.72 : 0.9));
    const dome = Math.sqrt(Math.max(0, 1 - radial * radial));
    const base = species === 'pine' ? 0.42 : 0.28;
    const rise = species === 'pine' ? 0.85 : 0.7;
    return { radial, vert: base + rise * dome * rng.range(0.75, 1) };
  }
  if (layer === 2) {
    const radial = rng.range(0.76, 1.02);
    const droop = species === 'pine' ? 0.42 : 0.28;
    return { radial, vert: rng.range(-0.05, 0.48) - (radial - 0.76) * droop };
  }
  // 紅葉の下縁は少しだけ外へ出す。深く垂らすと暗い葉が縁に房になって残る。
  if (species === 'maple') return { radial: rng.range(0.9, 1.04), vert: rng.range(-0.06, 0.16) };
  return { radial: rng.range(0.98, 1.12), vert: rng.range(-0.28, 0.08) };
}

function cardSize(species, radius, kind, layer) {
  const fray = layer === 3 ? (species === 'maple' ? 0.72 : 0.88) : 1;
  if (kind === 1) return clamp(radius * 0.36 * fray, 0.09, 0.15);
  // 黒松の房は針の束が見える大きさ。小さすぎると点描の広葉に戻る。
  if (species === 'pine') return clamp(radius * 0.62 * fray, 0.22, 0.32);
  if (species === 'plum') return clamp(radius * 0.42 * fray, 0.1, 0.18);
  return clamp(radius * 0.46 * fray, 0.1, 0.2);
}

/** 針の束の「上」。天面は立ち上がり、縁は外へ倒す。法線ではなくカードの縦軸。 */
function pineUp(ox, oy, oz, layer) {
  const len = Math.hypot(ox, oy, oz) || 1;
  const x = ox / len;
  const z = oz / len;
  if (layer === 1) return norm3(x * 0.28, 1, z * 0.28);
  if (layer === 0) return norm3(x * 0.4, 0.85, z * 0.4);
  if (layer === 2) return norm3(x, 0.1, z);
  return norm3(x, -0.22, z);
}

/**
 * ローカル +Y を up に合わせ、法線は up に垂直。spin で法線を回すと、2枚が十字になる。
 * ロールで絵を寝かすと、どの角度からも平たい葉に見える。
 */
function frameFromUp(ux, uy, uz, spin) {
  const [yx, yy, yz] = norm3(ux, uy, uz);
  let sx = 0;
  let sy = 1;
  let sz = 0;
  if (Math.abs(yy) > 0.9) { sx = 1; sy = 0; sz = 0; }
  let nx = yy * sz - yz * sy;
  let ny = yz * sx - yx * sz;
  let nz = yx * sy - yy * sx;
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl;
  ny /= nl;
  nz /= nl;
  const c = Math.cos(spin);
  const s = Math.sin(spin);
  const cx = yy * nz - yz * ny;
  const cy = yz * nx - yx * nz;
  const cz = yx * ny - yy * nx;
  const [zx, zy, zz] = norm3(nx * c + cx * s, ny * c + cy * s, nz * c + cz * s);
  let xx = yy * zz - yz * zy;
  let xy = yz * zx - yx * zz;
  let xz = yx * zy - yy * zx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl;
  xy /= xl;
  xz /= xl;
  return quatFromBasis(xx, xy, xz, yx, yy, yz, zx, zy, zz);
}

/**
 * frameFromUp の spin=0 の法線から、カメラを up に垂直な面へ落とした方向までの角。
 * 房の2枚はここから 0° と 90°。乱数で一周させると、半分が真横を向いて点になる。
 */
function spinTowardCamera(ux, uy, uz, jitter) {
  const [yx, yy, yz] = norm3(ux, uy, uz);
  const along = TO_CAM[0] * yx + TO_CAM[1] * yy + TO_CAM[2] * yz;
  let zx = TO_CAM[0] - along * yx;
  let zy = TO_CAM[1] - along * yy;
  let zz = TO_CAM[2] - along * yz;
  const zl = Math.hypot(zx, zy, zz);
  if (zl < 1e-4) return jitter;
  zx /= zl;
  zy /= zl;
  zz /= zl;
  let sx = 0;
  let sy = 1;
  let sz = 0;
  if (Math.abs(yy) > 0.9) { sx = 1; sy = 0; sz = 0; }
  let nx = yy * sz - yz * sy;
  let ny = yz * sx - yx * sz;
  let nz = yx * sy - yy * sx;
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl;
  ny /= nl;
  nz /= nl;
  const cx = yy * nz - yz * ny;
  const cy = yz * nx - yx * nz;
  const cz = yx * ny - yy * nx;
  const c = nx * zx + ny * zy + nz * zz;
  const s = cx * zx + cy * zy + cz * zz;
  return Math.atan2(s, c) + jitter;
}

function facingOf(ox, oy, oz, layer, vert) {
  const [x, y, z] = norm3(ox, oy, oz);
  // 真下を向けると、低い既定カメラからカードが線になり、暗い切れ端に見える。
  // 垂れは位置側で付け、面はカメラへ残す。黒松は frameFromUp 側で立てる。
  if (layer === 3) {
    return norm3(x + TO_CAM[0] * 0.5, y + 0.1 + TO_CAM[1] * 0.5, z + TO_CAM[2] * 0.5);
  }
  const cam = layer === 1 ? 0.62 : 0.38;
  const upW = layer === 1 ? 0.55 : vert < -0.05 ? 0.04 : 0.18;
  return norm3(x + TO_CAM[0] * cam, y + upW + TO_CAM[1] * cam, z + TO_CAM[2] * cam);
}

function mixAmount(rng, species, layer) {
  const roll = rng.next();
  // 黒松の胴は深緑、天面だけ color2（新芽の黄緑）へ寄せる。
  if (species === 'pine' && layer === 1) return 0.62 + roll * 0.38;
  if (species === 'pine') return roll * 0.22;
  if (roll < 0.64) return (roll / 0.64) * 0.12;
  if (roll < 0.88) return 0.32 + ((roll - 0.64) / 0.24) * 0.2;
  return 0.8 + ((roll - 0.88) / 0.12) * 0.2;
}

function tangentFrame(nx, ny, nz) {
  let tx = Math.abs(ny) < 0.9 ? nz : 1;
  let ty = 0;
  let tz = Math.abs(ny) < 0.9 ? -nx : 0;
  const alongN = tx * nx + ty * ny + tz * nz;
  tx -= alongN * nx;
  ty -= alongN * ny;
  tz -= alongN * nz;
  const tl = Math.hypot(tx, ty, tz) || 1;
  tx /= tl;
  ty /= tl;
  tz /= tl;
  return {
    tx, ty, tz,
    bx: ny * tz - nz * ty,
    by: nz * tx - nx * tz,
    bz: nx * ty - ny * tx,
  };
}

/**
 * 葉の計画。look は色としきい値の比較に使い、位置は骨格と seed だけで決まる。
 * kind 0 = 葉、1 = 花（梅だけ）。layer 0 内・1 天面・2 縁・3 枝先のほつれ。
 * core はパッド数ぶんの芯。gfx が test のときは置かない。
 */
export function planFoliage(skel, look, { gfx = 'high', species = 'maple', nodeShift = null } = {}) {
  const pads = skel.pads;
  const countPads = pads ? pads.count : 0;
  const budgets = [];
  for (let p = 0; p < countPads; p += 1) {
    let n = cardBudget(pads.radius[p], pads.density[p], gfx);
    // 小さいパッドだけを底上げする。大きいパッドを 130 より増やすと雲が均一な玉になる。
    if (species === 'pine' && gfx === 'high' && n > 0) n = clamp(n, 80, 130);
    budgets.push(n);
  }
  // 黒松は1房を十字の2枚にする。枚数の上限は束の数で割ってから掛ける。
  const copies = species === 'pine' ? 2 : 1;
  const capped = capBudgets(budgets, Math.floor(MAX_LEAF_CARDS / copies));
  const total = capped.reduce((sum, n) => sum + n, 0) * copies;
  const position = new Float32Array(total * 3);
  const quat = new Float32Array(total * 4);
  const scale = new Float32Array(total * 3);
  const threshold = new Float32Array(total);
  const mixT = new Float32Array(total);
  const shade = new Float32Array(total);
  const bright = new Float32Array(total);
  const kind = new Uint8Array(total);
  const padIndex = new Int32Array(total);
  const layer = new Uint8Array(total);
  const color = look && look.color ? look.color : [0.3, 0.5, 0.2];
  const color2 = look && look.color2 ? look.color2 : color;
  const withCore = gfx !== 'test' && countPads > 0;
  const core = {
    count: withCore ? countPads : 0,
    position: new Float32Array((withCore ? countPads : 0) * 3),
    quat: new Float32Array((withCore ? countPads : 0) * 4),
    scale: new Float32Array((withCore ? countPads : 0) * 3),
    color: new Float32Array((withCore ? countPads : 0) * 3),
    mix: new Float32Array(withCore ? countPads : 0),
  };
  const cuts = layerCuts(species);
  let w = 0;
  for (let p = 0; p < countPads; p += 1) {
    const n = capped[p];
    const rng = createRng((pads.seed[p] || 1) >>> 0).fork(`leaf-${species}`);
    const radius = pads.radius[p];
    const nx = pads.normal[p * 3];
    const ny = pads.normal[p * 3 + 1];
    const nz = pads.normal[p * 3 + 2];
    const { tx, ty, tz, bx, by, bz } = tangentFrame(nx, ny, nz);
    const node = pads.node[p];
    const shiftX = nodeShift && node >= 0 ? nodeShift[node * 3] : 0;
    const shiftY = nodeShift && node >= 0 ? nodeShift[node * 3 + 1] : 0;
    const shiftZ = nodeShift && node >= 0 ? nodeShift[node * 3 + 2] : 0;
    const cx = pads.center[p * 3] + shiftX;
    const cy = pads.center[p * 3 + 1] + shiftY;
    const cz = pads.center[p * 3 + 2] + shiftZ;
    // 半高は、vert がおおよそ -0.6〜1 のときに全体の高さが幅の 0.45 になる値。
    // vert の幅が約 1.5 のとき、全体の高さが幅の 0.45 になる。
    const halfH = radius * 0.64;
    let tipx = nx;
    let tipy = 0;
    let tipz = nz;
    const tipAlong = tipx * nx + tipy * ny + tipz * nz;
    tipx -= tipAlong * nx;
    tipy -= tipAlong * ny;
    tipz -= tipAlong * nz;
    const tipLen = Math.hypot(tipx, tipy, tipz);
    if (withCore) {
      const lift = radius * 0.05;
      core.position[p * 3] = cx + nx * lift;
      core.position[p * 3 + 1] = cy + ny * lift;
      core.position[p * 3 + 2] = cz + nz * lift;
      // t × n を Z にする。n × t のまま渡すと左手系になり、短い軸が法線から外れる。
      const q = quatFromBasis(tx, ty, tz, nx, ny, nz, -bx, -by, -bz);
      core.quat.set(q, p * 4);
      // 葉の輪郭の内側まで覆い、壁が透ける穴を芯の色で塞ぐ。表面よりは小さい。
      // 黒松の芯を葉の雲いっぱいにすると、針の隙間から滑らかな球が見える。
      const width = radius * (species === 'pine' ? 1.15 : 1.48);
      core.scale[p * 3] = width;
      core.scale[p * 3 + 1] = radius * (species === 'pine' ? 0.36 : 0.44);
      core.scale[p * 3 + 2] = width;
      core.mix[p] = 0.9 + createRng((pads.seed[p] || 1) >>> 0).fork(`core-${species}`).range(0, 0.16);
    }
    for (let i = 0; i < n; i += 1) {
      const slot = (i + 0.5) / n;
      const band = slot < cuts[0] ? 0 : slot < cuts[1] ? 1 : slot < cuts[2] ? 2 : 3;
      const { radial, vert } = sampleCloud(rng, band, species);
      let theta = rng.next() * Math.PI * 2;
      if (band === 3 && tipLen > 0.2) {
        const tipAngle = Math.atan2(tipx * bx + tipy * by + tipz * bz, tipx * tx + tipy * ty + tipz * tz);
        theta = tipAngle + rng.range(-0.65, 0.65);
      }
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const horiz = radial * radius;
      const ox = tx * cos * horiz + bx * sin * horiz + nx * vert * halfH;
      const oy = ty * cos * horiz + by * sin * horiz + ny * vert * halfH;
      const oz = tz * cos * horiz + bz * sin * horiz + nz * vert * halfH;
      const flowerP = species === 'plum' ? (band === 0 ? 0.2 : 0.58) : 0;
      const cardKind = rng.next() < flowerP ? 1 : 0;
      let size = cardSize(species, radius, cardKind, band) * rng.range(0.94, 1.06);
      if (cardKind === 0 && species === 'pine') size = clamp(size, 0.22, 0.32);
      else if (cardKind === 0 && species === 'maple') size = clamp(size, 0.1, 0.2);
      const face = species === 'pine' ? null : facingOf(ox, oy, oz, band, vert);
      // 消費順は変えない。黒松はこの値を小さな揺れにだけ使い、正面はカメラへ固定する。
      const spinRoll = species === 'pine' ? rng.next() : 0;
      const mapleQ = species === 'pine'
        ? null
        : basisQuat(face[0], face[1], face[2], rng.next() * Math.PI * 2, rng.range(-0.18, 0.18));
      const up = species === 'pine' ? pineUp(ox, oy, oz, band) : null;
      const spin = species === 'pine'
        ? spinTowardCamera(up[0], up[1], up[2], (spinRoll - 0.5) * 0.4)
        : 0;
      const topT = clamp01((vert + 0.35) / 1.15);
      // 下縁を墨色にしない。中心より一段暗いところで止め、ほつれはさらに上げる。
      let lit = 0.7 + 0.3 * topT;
      if (band === 0 && radial < 0.42) lit *= 0.94;
      if (species === 'maple' && band >= 2) lit = Math.max(lit, 0.76);
      if (species === 'pine') lit = Math.max(lit, 0.8);
      else lit = Math.max(lit, 0.68);
      const thresholdV = Math.min(0.98, 0.08 + 0.9 * ((i + rng.next() * 0.85) / n));
      const mixV = mixAmount(rng, species, band);
      const brightV = rng.range(0.94, 1.06);
      const thick = cardKind === 1 ? 0.2 : species === 'pine' ? 0.055 : 0.14;
      const tall = species === 'pine' ? 1 : species === 'plum' && cardKind === 0 ? 1.12 : 0.9;
      for (let copy = 0; copy < copies; copy += 1) {
        const q = species === 'pine'
          ? frameFromUp(up[0], up[1], up[2], spin + copy * (Math.PI / 2))
          : mapleQ;
        const nudge = species === 'pine' ? (copy === 0 ? -1 : 1) * size * 0.02 : 0;
        const nzx = species === 'pine' ? rotateQuat(q, [0, 0, 1]) : [0, 0, 0];
        position[w * 3] = cx + ox + nzx[0] * nudge;
        position[w * 3 + 1] = cy + oy + nzx[1] * nudge;
        position[w * 3 + 2] = cz + oz + nzx[2] * nudge;
        quat.set(q, w * 4);
        scale[w * 3] = size;
        scale[w * 3 + 1] = size * tall;
        scale[w * 3 + 2] = size * thick;
        threshold[w] = thresholdV;
        mixT[w] = mixV;
        shade[w] = lit;
        bright[w] = brightV;
        kind[w] = cardKind;
        padIndex[w] = p;
        layer[w] = band;
        w += 1;
      }
    }
  }
  const plan = {
    count: w,
    position,
    quat,
    scale,
    threshold,
    mixT,
    shade,
    bright,
    kind,
    padIndex,
    layer,
    species,
    core,
  };
  plan.color = new Float32Array(w * 3);
  applyLookColors(plan, {
    color,
    color2,
    bud: look ? look.bud : 0,
    coverage: look ? look.coverage : 1,
    flower: look ? look.flower : 0,
    leafAge: look ? look.leafAge : 0.5,
  });
  return plan;
}

/** look が変わったとき、位置は動かさず色を更新する。入力の色は sRGB。 */
export function applyLookColors(plan, look) {
  const color = look.color || [0.3, 0.5, 0.2];
  const color2 = look.color2 || color;
  const bud = clamp01(look.bud || 0);
  const pale = paleFor(plan.species);
  const age = 1 - clamp01(look.leafAge || 0) * 0.04;
  const budMix = plan.species === 'pine' ? 0.28 : 0.72;
  for (let i = 0; i < plan.count; i += 1) {
    let rgb = mix3(color, color2, plan.mixT[i]);
    if (plan.kind[i] === 1) rgb = mix3([0.965, 0.843, 0.871], [1, 1, 1], plan.mixT[i] * 0.4);
    if (plan.species === 'pine' && plan.kind[i] === 0) {
      const crown = plan.layer[i] === 1 ? 1 : plan.layer[i] === 0 ? 0.35 : 0.12;
      const tip = (0.12 + bud * 0.5) * crown * (0.4 + plan.mixT[i] * 0.6);
      rgb = mix3(rgb, PINE_TIP, tip);
    }
    rgb = mix3(rgb, pale, plan.kind[i] === 1 ? bud * 0.12 : bud * budMix);
    const gain = plan.shade[i] * plan.bright[i] * age;
    plan.color[i * 3] = srgbToLinear(clamp(rgb[0] * gain, 0, 1));
    plan.color[i * 3 + 1] = srgbToLinear(clamp(rgb[1] * gain, 0, 1));
    plan.color[i * 3 + 2] = srgbToLinear(clamp(rgb[2] * gain, 0, 1));
  }
  const core = plan.core;
  if (!core || !core.count) return;
  const k = plan.species === 'pine' ? 0.7 : plan.species === 'plum' ? 0.58 : 0.58;
  for (let i = 0; i < core.count; i += 1) {
    const mix = core.mix[i] || 1;
    core.color[i * 3] = srgbToLinear(clamp(color[0] * k * mix, 0, 1));
    core.color[i * 3 + 1] = srgbToLinear(clamp(color[1] * k * mix, 0, 1));
    core.color[i * 3 + 2] = srgbToLinear(clamp(color[2] * k * mix, 0, 1));
  }
}

/** インスタンスの拡大率。葉は coverage、花は flower。芽は少し小さくする。 */
export function cardScale(plan, index, look) {
  const amount = plan.kind[index] === 1 ? (look.flower || 0) : (look.coverage || 0);
  const appear = cardAppear(plan.threshold[index], amount);
  const shrink = plan.kind[index] === 1 ? 1 : 1 - 0.38 * clamp01(look.bud || 0);
  return [
    plan.scale[index * 3] * appear * shrink,
    plan.scale[index * 3 + 1] * appear * shrink,
    plan.scale[index * 3 + 2] * appear * shrink,
  ];
}

/** appear が 0 より大きいカードの数。coverage を上げると減らない。 */
export function visibleCardCount(plan, coverage, { flower = 1, kind = 0 } = {}) {
  let n = 0;
  for (let i = 0; i < plan.count; i += 1) {
    if (plan.kind[i] !== kind) continue;
    const amount = kind === 1 ? flower : coverage;
    if (cardAppear(plan.threshold[i], amount) > 0.02) n += 1;
  }
  return n;
}

export function composeInstanceMatrix(q, p, s, out, offset) {
  const x = q[0];
  const y = q[1];
  const z = q[2];
  const w = q[3];
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  out[offset] = (1 - (yy + zz)) * s[0];
  out[offset + 1] = (xy + wz) * s[0];
  out[offset + 2] = (xz - wy) * s[0];
  out[offset + 3] = 0;
  out[offset + 4] = (xy - wz) * s[1];
  out[offset + 5] = (1 - (xx + zz)) * s[1];
  out[offset + 6] = (yz + wx) * s[1];
  out[offset + 7] = 0;
  out[offset + 8] = (xz + wy) * s[2];
  out[offset + 9] = (yz - wx) * s[2];
  out[offset + 10] = (1 - (xx + yy)) * s[2];
  out[offset + 11] = 0;
  out[offset + 12] = p[0];
  out[offset + 13] = p[1];
  out[offset + 14] = p[2];
  out[offset + 15] = 1;
}

/** 芯のメッシュ。葉のカードとは別に、透けと影を塊で受ける。test や枚数 0 では null。 */
export function createCoreMesh(THREE, plan, { castShadow = false } = {}) {
  const n = plan.core?.count || 0;
  if (!n) return null;
  const src = padCoreGeometry();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(src.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(src.normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(src.uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(src.indices, 1));
  geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.94, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  // 黒松の芯を塗ると平たい皿になる。影の塊だけ残し、針の奥を隠さないよう深度も書かない。
  if (plan.species === 'pine') {
    mat.colorWrite = false;
    mat.depthWrite = false;
  }
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.name = 'foliage-core';
  mesh.frustumCulled = false;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = false;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  return mesh;
}

/** 葉が無い季節は芯も畳む。coverage に合わせて一様に縮む。 */
export function writeCoreInstances(mesh, plan, look) {
  if (!mesh || !plan.core?.count) return;
  const cover = clamp01(look?.coverage || 0);
  const show = cover <= 0.12 ? 0 : Math.min(1, (cover - 0.12) / 0.45);
  const array = mesh.instanceMatrix.array;
  const core = plan.core;
  for (let i = 0; i < core.count; i += 1) {
    composeInstanceMatrix(
      core.quat.subarray(i * 4, i * 4 + 4),
      core.position.subarray(i * 3, i * 3 + 3),
      [core.scale[i * 3] * show, core.scale[i * 3 + 1] * show, core.scale[i * 3 + 2] * show],
      array,
      i * 16,
    );
    mesh.instanceColor.setXYZ(i, core.color[i * 3], core.color[i * 3 + 1], core.color[i * 3 + 2]);
  }
  mesh.count = show > 0 ? core.count : 0;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
}
