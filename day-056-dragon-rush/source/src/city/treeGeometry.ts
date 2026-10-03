// OWNER: city
// 街路樹の形（r01-city。採点 r00a の改善3位「並木を木にする」）。型（config/trees.ts）ごとに、幹から枝を分けて育て、
// 枝先に葉の塊を置く。塊は葉のカード（葉を描いた板）を重ねたもので、塊と塊の間やカードのすき間から光が抜ける。
// 距離の帯ごとに3つの形を作る：近景＝枝と葉のカード、中景＝太い枝と葉の塊（多面体）、遠景＝幹と1つの塊。
// 乱数は型ごとの系列（trees.shape）なので、何度作っても同じ形になる。葉の模様（葉のカードの画像）も手続きで描く。
import {
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  IcosahedronGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
} from 'three';
import { TREE_LOOK, type TreeArchetype } from '../config/trees';
import { stream, type Rng } from '../core/rng';

interface Branch {
  a: Vector3;
  b: Vector3;
  r0: number;
  r1: number;
  level: number;
}

interface Clump {
  c: Vector3;
  r: number;
  /** 中景で1つの塊にまとめる組（主枝・横枝ごと） */
  group: number;
}

export interface TreeGrowth {
  branches: Branch[];
  clumps: Clump[];
  center: Vector3;
  radius: number;
  bottom: number;
  top: number;
  stakes: [Vector3, Vector3][];
}

const UP = new Vector3(0, 1, 0);

/** 方位角（ラジアン、+z を 0）と、水平からの立ち上がり（度）の向き。 */
function dirFrom(azimuth: number, elevationDeg: number): Vector3 {
  const el = (elevationDeg * Math.PI) / 180;
  return new Vector3(Math.cos(el) * Math.sin(azimuth), Math.sin(el), Math.cos(el) * Math.cos(azimuth));
}

/** d のまわりに、角度 tilt だけ傾け、方位 around に回した向き。 */
function spread(d: Vector3, tilt: number, around: number): Vector3 {
  const ref = Math.abs(d.y) < 0.9 ? UP : new Vector3(1, 0, 0);
  const u = new Vector3().crossVectors(d, ref).normalize();
  const v = new Vector3().crossVectors(d, u).normalize();
  const side = u.multiplyScalar(Math.cos(around)).addScaledVector(v, Math.sin(around));
  return d.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(side, Math.sin(tilt)).normalize();
}

function randomUnit(rng: Rng): Vector3 {
  const z = rng.range(-1, 1);
  const a = rng.range(0, Math.PI * 2);
  const r = Math.sqrt(1 - z * z);
  return new Vector3(r * Math.cos(a), z, r * Math.sin(a));
}

/** 型から枝と葉の塊を育てる。 */
export function growTree(arch: TreeArchetype): TreeGrowth {
  const rng = stream(0x7ee5, 'trees.shape', arch.seed);
  const branches: Branch[] = [];
  const clumps: Clump[] = [];
  const stakes: [Vector3, Vector3][] = [];
  const clumpR = (): number => rng.range(arch.clumpRadius[0], arch.clumpRadius[1]);

  // 枝を1本育てる（途中で少し曲げ、先で子の枝に分かれるか、葉の塊を付ける）
  const grow = (p: Vector3, dir: Vector3, len: number, r: number, level: number, group: number): void => {
    const mid = p.clone().addScaledVector(dir, len * 0.5);
    const bend = spread(dir, rng.range(0.05, 0.22), rng.range(0, Math.PI * 2));
    bend.y += level === 1 ? 0.12 : 0.05;
    bend.normalize();
    const end = mid.clone().addScaledVector(bend, len * 0.5);
    branches.push({ a: p, b: mid, r0: r, r1: r * 0.82, level }, { a: mid, b: end, r0: r * 0.82, r1: r * 0.62, level });
    if (level < arch.depth) {
      const n = level === 1 ? arch.children + (rng.chance(0.35) ? 1 : 0) : 2;
      const offset = rng.range(0, Math.PI * 2);
      for (let c = 0; c < n; c++) {
        const cdir = spread(bend, rng.range(0.4, 0.75), offset + (c * Math.PI * 2) / n + rng.range(-0.4, 0.4));
        cdir.y += 0.12;
        cdir.normalize();
        grow(end, cdir, len * arch.childScale * rng.range(0.8, 1.15), r * 0.58, level + 1, group);
      }
      // 内側を埋める塊（葉が枝先だけにあると、冠の中が抜けすぎる）
      if (level === arch.depth - 1) clumps.push({ c: mid.clone().addScaledVector(UP, 0.35), r: clumpR() * 0.85, group });
    } else {
      clumps.push({ c: end.clone().addScaledVector(bend, 0.3), r: clumpR(), group });
    }
  };

  const R0 = arch.trunkRadius[0];
  const R1 = arch.trunkRadius[1];
  if (arch.leader) {
    // イチョウ：主幹をまっすぐ伸ばし、段ごとに横枝を付ける（円錐形の冠）
    const H = arch.leader.height * rng.range(0.93, 1.06);
    const pts = [new Vector3(0, -0.25, 0)];
    for (let k = 1; k <= 3; k++) pts.push(new Vector3(rng.range(-0.1, 0.1) * k * 0.4, (H * k) / 3, rng.range(-0.1, 0.1) * k * 0.4));
    const radiusAt = (y: number): number => R0 + (R1 - R0) * Math.min(1, Math.max(0, y / H));
    for (let k = 0; k < 3; k++) branches.push({ a: pts[k], b: pts[k + 1], r0: radiusAt(pts[k].y) * (k === 0 ? 1.12 : 1), r1: radiusAt(pts[k + 1].y), level: 0 });
    const trunkAt = (y: number): Vector3 => {
      const t = Math.min(0.999, Math.max(0, y / H)) * 3;
      const k = Math.floor(t);
      return pts[k].clone().lerp(pts[k + 1], t - k);
    };
    const tiers = arch.leader.tiers;
    let az = rng.range(0, Math.PI * 2);
    for (let t = 0; t < tiers; t++) {
      const frac = t / Math.max(1, tiers - 1);
      const y = arch.trunkHeight + (H - 0.9 - arch.trunkHeight) * frac;
      const count = 2 + (rng.chance(0.5) ? 1 : 0);
      for (let i = 0; i < count; i++) {
        az += 2.39996 + rng.range(-0.3, 0.3);
        const len = (arch.limbLength[1] + (arch.limbLength[0] * 0.55 - arch.limbLength[1]) * frac) * rng.range(0.85, 1.1);
        grow(trunkAt(y), dirFrom(az, rng.range(arch.limbElevation[0], arch.limbElevation[1])), len, radiusAt(y) * 0.45, 1, t * 3 + i);
      }
    }
    const top = trunkAt(H);
    clumps.push({ c: top.clone().add(new Vector3(0, 0.35, 0)), r: clumpR() * 1.05, group: tiers * 3 });
    clumps.push({ c: trunkAt(H * 0.8).add(new Vector3(0.2, 0, -0.2)), r: clumpR(), group: tiers * 3 });
  } else {
    // ケヤキ：低い所で幹が分かれ、主枝が壺形に斜め上へ広がる
    const H0 = arch.trunkHeight * rng.range(0.92, 1.08);
    const top = new Vector3(rng.range(-0.12, 0.12), H0, rng.range(-0.12, 0.12));
    const mid = new Vector3(top.x * 0.4 + rng.range(-0.05, 0.05), H0 * 0.5, top.z * 0.4 + rng.range(-0.05, 0.05));
    branches.push({ a: new Vector3(0, -0.25, 0), b: mid, r0: R0 * 1.12, r1: (R0 + R1) / 2, level: 0 });
    branches.push({ a: mid, b: top, r0: (R0 + R1) / 2, r1: R1, level: 0 });
    const offset = rng.range(0, Math.PI * 2);
    for (let k = 0; k < arch.limbs; k++) {
      const az = offset + (k * Math.PI * 2) / arch.limbs + rng.range(-0.35, 0.35);
      const start = top.clone().add(new Vector3(0, -rng.range(0, 0.45), 0));
      const dir = dirFrom(az, rng.range(arch.limbElevation[0], arch.limbElevation[1]));
      if (arch.prunedLimbs && k < arch.prunedLimbs) {
        // 切られた枝の跡（短い切り株）
        branches.push({ a: start, b: start.clone().addScaledVector(dir, 0.45), r0: R1 * 0.55, r1: R1 * 0.5, level: 1 });
        continue;
      }
      grow(start, dir, rng.range(arch.limbLength[0], arch.limbLength[1]), R1 * 0.62, 1, k);
    }
  }
  if (arch.stakes) {
    // 若木の支柱：幹を3方から支える丸太
    const a0 = rng.range(0, Math.PI * 2);
    for (let k = 0; k < 3; k++) {
      const a = a0 + (k * Math.PI * 2) / 3;
      stakes.push([new Vector3(Math.sin(a) * 0.75, -0.1, Math.cos(a) * 0.75), new Vector3(Math.sin(a) * 0.1, 1.55, Math.cos(a) * 0.1)]);
    }
  }
  const center = new Vector3();
  for (const c of clumps) center.add(c.c);
  center.multiplyScalar(1 / Math.max(1, clumps.length));
  let radius = 0;
  let bottom = Infinity;
  let top = -Infinity;
  for (const c of clumps) {
    radius = Math.max(radius, c.c.distanceTo(center) + c.r);
    bottom = Math.min(bottom, c.c.y - c.r);
    top = Math.max(top, c.c.y + c.r);
  }
  return { branches, clumps, center, radius, bottom, top, stakes };
}

// ---- 頂点の書き溜め ----
class TreeSoup {
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly col: number[] = [];
  private readonly leaf: number[] = [];
  private readonly luv: number[] = [];

  push(p: Vector3, n: Vector3, c: Color, leaf: number, u: number, v: number): void {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.col.push(c.r, c.g, c.b);
    this.leaf.push(leaf);
    this.luv.push(u, v);
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('aLeaf', new BufferAttribute(new Float32Array(this.leaf), 1));
    g.setAttribute('aLeafUv', new BufferAttribute(new Float32Array(this.luv), 2));
    g.computeBoundingSphere();
    return g;
  }
}

/** 先細りの円柱（端は閉じない）。 */
function tube(s: TreeSoup, a: Vector3, b: Vector3, r0: number, r1: number, sides: number, color: Color): void {
  const d = b.clone().sub(a);
  const len = d.length();
  if (len < 1e-4) return;
  d.divideScalar(len);
  const ref = Math.abs(d.y) < 0.95 ? UP : new Vector3(1, 0, 0);
  const u = new Vector3().crossVectors(d, ref).normalize();
  const v = new Vector3().crossVectors(d, u).normalize();
  const ring = (k: number): Vector3 => {
    const t = (k / sides) * Math.PI * 2;
    return u.clone().multiplyScalar(Math.cos(t)).addScaledVector(v, Math.sin(t));
  };
  for (let k = 0; k < sides; k++) {
    const n0 = ring(k);
    const n1 = ring(k + 1);
    const p00 = a.clone().addScaledVector(n0, r0);
    const p01 = a.clone().addScaledVector(n1, r0);
    const p10 = b.clone().addScaledVector(n0, r1);
    const p11 = b.clone().addScaledVector(n1, r1);
    s.push(p00, n0, color, 0, 0, 0);
    s.push(p01, n1, color, 0, 0, 0);
    s.push(p11, n1, color, 0, 0, 0);
    s.push(p00, n0, color, 0, 0, 0);
    s.push(p11, n1, color, 0, 0, 0);
    s.push(p10, n0, color, 0, 0, 0);
  }
}

function barkColor(arch: TreeArchetype): Color {
  return new Color().setHex(TREE_LOOK.bark[arch.species]);
}

/** 葉の頂点の法線：塊の中心と冠の中心から外向きの向きを混ぜる（丸く柔らかく光を受ける）。 */
function leafNormal(p: Vector3, clump: Vector3, crown: Vector3): Vector3 {
  const a = p.clone().sub(clump).normalize();
  const b = p.clone().sub(crown).normalize();
  return a.multiplyScalar(0.55).addScaledVector(b, 0.45).addScaledVector(UP, 0.12).normalize();
}

/** 冠の奥ほど暗く（葉が重なって光が届かない）、下ほど少し暗くする。 */
function leafShade(p: Vector3, g: TreeGrowth): number {
  const r = p.distanceTo(g.center) / Math.max(g.radius, 1e-3);
  const inner = 0.55 + 0.45 * Math.min(1, Math.max(0, (r - 0.2) / 0.8));
  const h = (p.y - g.bottom) / Math.max(g.top - g.bottom, 1e-3);
  return inner * (0.8 + 0.2 * Math.min(1, Math.max(0, h)));
}

const STAKE = new Color().setHex(0x9a8466);

function addStakes(s: TreeSoup, g: TreeGrowth): void {
  for (const [a, b] of g.stakes) tube(s, a, b, 0.035, 0.03, 4, STAKE);
}

/** 近景：枝（段ごとに面の数を減らす）と葉のカード。 */
export function buildTreeNear(arch: TreeArchetype, g: TreeGrowth): BufferGeometry {
  const s = new TreeSoup();
  const bark = barkColor(arch);
  const sides = [6, 5, 4, 3];
  for (const br of g.branches) tube(s, br.a, br.b, br.r0, br.r1, sides[Math.min(br.level, 3)], bark);
  addStakes(s, g);
  const rng = stream(0x7ee5, 'trees.cards', arch.seed);
  const cell = arch.species === 'ginkgo' ? 0.5 : 0;
  const c = new Color();
  for (const cl of g.clumps) {
    const count = Math.max(4, Math.round(arch.cardsPerClump * Math.min(1.4, cl.r / 1.0)));
    for (let k = 0; k < count; k++) {
      const center = cl.c.clone().addScaledVector(randomUnit(rng), cl.r * 0.5 * Math.cbrt(rng.next()));
      const out = center.clone().sub(g.center).normalize();
      const n = randomUnit(rng).addScaledVector(out, 0.8).addScaledVector(UP, 0.3).normalize();
      const size = cl.r * rng.range(1.0, 1.45);
      const t1 = new Vector3().crossVectors(n, randomUnit(rng)).normalize();
      const t2 = new Vector3().crossVectors(n, t1).normalize();
      const flip = rng.chance(0.5);
      const bright = rng.range(0.88, 1.08);
      const corners: [number, number][] = [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ];
      const verts = corners.map(([a, b]) => center.clone().addScaledVector(t1, a * size).addScaledVector(t2, b * size));
      const uv = corners.map(([a, b]) => [cell + ((flip ? -a : a) + 0.5) * 0.5, b + 0.5] as [number, number]);
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const p = verts[i];
        c.setScalar(bright * leafShade(p, g));
        s.push(p, leafNormal(p, cl.c, g.center), c, 1, uv[i][0], uv[i][1]);
      }
    }
  }
  return s.geometry();
}

/** 多面体の塊（中景・遠景の葉）。aLeaf = 0.5 は「葉だが画像を使わない」印。 */
function blob(s: TreeSoup, center: Vector3, radius: Vector3, g: TreeGrowth, seed: number, detail: number): void {
  const ico = new IcosahedronGeometry(1, detail);
  const pos = ico.getAttribute('position') as BufferAttribute;
  const v = new Vector3();
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const wobble = 1 + 0.18 * Math.sin(v.x * 5.1 + seed) * Math.cos(v.z * 4.3 + seed * 2.1) + 0.1 * Math.sin(v.y * 7.7 + seed);
    const p = new Vector3(v.x * radius.x * wobble, v.y * radius.y * wobble, v.z * radius.z * wobble).add(center);
    c.setScalar(leafShade(p, g) * 0.95);
    s.push(p, leafNormal(p, center, g.center), c, 0.5, 0, 0);
  }
  ico.dispose();
}

/**
 * 葉の塊を k 個の組にまとめる。最初の組の中心は冠の中心から最も遠い塊、次からは既存の中心から最も遠い塊（決定的）。
 * 横枝ごとにまとめると、段の多いイチョウで塊が多くなりすぎるため（r01-city の三角形の予算）。
 */
function clusterClumps(clumps: readonly Clump[], k: number, center: Vector3): Clump[][] {
  const seeds: Vector3[] = [];
  let first = clumps[0];
  for (const c of clumps) if (c.c.distanceTo(center) > first.c.distanceTo(center)) first = c;
  seeds.push(first.c);
  while (seeds.length < Math.min(k, clumps.length)) {
    let best = clumps[0];
    let bestD = -1;
    for (const c of clumps) {
      const d = Math.min(...seeds.map((s) => s.distanceTo(c.c)));
      if (d > bestD) {
        bestD = d;
        best = c;
      }
    }
    seeds.push(best.c);
  }
  const groups: Clump[][] = seeds.map(() => []);
  for (const c of clumps) {
    let bi = 0;
    for (let i = 1; i < seeds.length; i++) if (seeds[i].distanceTo(c.c) < seeds[bi].distanceTo(c.c)) bi = i;
    groups[bi].push(c);
  }
  return groups.filter((g) => g.length > 0);
}

/** 中景：幹と主枝、4〜5個にまとめた葉の塊（塊の間のすき間は残る）。 */
export function buildTreeMid(arch: TreeArchetype, g: TreeGrowth): BufferGeometry {
  const s = new TreeSoup();
  const bark = barkColor(arch);
  // イチョウの横枝は塊に隠れるので、中景では幹だけにする
  const maxLevel = arch.leader ? 0 : 1;
  for (const br of g.branches) if (br.level <= maxLevel) tube(s, br.a, br.b, br.r0, br.r1, br.level === 0 ? 5 : 3, bark);
  addStakes(s, g);
  const groups = clusterClumps(g.clumps, Math.min(arch.leader ? 5 : 4, Math.ceil(g.clumps.length / 4)), g.center);
  let k = 0;
  for (const list of groups) {
    const center = new Vector3();
    for (const cl of list) center.add(cl.c);
    center.multiplyScalar(1 / list.length);
    let r = 0;
    for (const cl of list) r = Math.max(r, cl.c.distanceTo(center) + cl.r * 0.8);
    r = Math.min(r, g.radius * 0.7);
    blob(s, center, new Vector3(r, r * 0.8, r), g, arch.seed + k * 1.7, 1);
    k++;
  }
  return s.geometry();
}

/** 遠景：幹と、冠を包む1つの塊。 */
export function buildTreeFar(arch: TreeArchetype, g: TreeGrowth): BufferGeometry {
  const s = new TreeSoup();
  tube(s, new Vector3(0, -0.25, 0), new Vector3(0, g.bottom + 0.5, 0), arch.trunkRadius[0], arch.trunkRadius[1], 4, barkColor(arch));
  const h = (g.top - g.bottom) / 2;
  blob(s, new Vector3(g.center.x, g.bottom + h, g.center.z), new Vector3(g.radius * 0.85, h, g.radius * 0.85), g, arch.seed, 0);
  return s.geometry();
}

/**
 * 葉のカードの画像（256×128、左がケヤキの小枝、右がイチョウの小枝）。α が葉の形、RGB は葉ごとの明るさ。
 * 中ほどに葉を密に、縁ほどまばらに置き、カードのすき間から光が抜けるようにする。
 */
export function createLeafTexture(): DataTexture {
  const W = 256;
  const H = 128;
  const data = new Uint8Array(W * H * 4);
  const rng = stream(0x7ee5, 'trees.leafTexture');
  const put = (x: number, y: number, a: number, b: number): void => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    if (a <= data[i + 3] / 255) return;
    const v = Math.round(Math.min(1, b) * 255);
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = Math.round(a * 255);
  };
  const cells: { x0: number; kind: 'zelkova' | 'ginkgo' }[] = [
    { x0: 0, kind: 'zelkova' },
    { x0: 128, kind: 'ginkgo' },
  ];
  for (const cell of cells) {
    const cx = cell.x0 + 64;
    const cy = 64;
    // 小枝（葉の間に見える細い線）
    for (let t = 0; t < 7; t++) {
      const a = rng.range(0, Math.PI * 2);
      const len = rng.range(30, 56);
      for (let k = 0; k < len; k++) {
        const x = Math.round(cx + Math.cos(a) * k);
        const y = Math.round(cy + Math.sin(a) * k);
        put(x, y, 1, 0.35);
      }
    }
    const count = cell.kind === 'zelkova' ? 78 : 56;
    for (let n = 0; n < count; n++) {
      const r = 58 * Math.pow(rng.next(), 0.7);
      const a = rng.range(0, Math.PI * 2);
      const lx = cx + Math.cos(a) * r;
      const ly = cy + Math.sin(a) * r;
      const ang = a + rng.range(-0.7, 0.7);
      const bright = rng.range(0.72, 1.0);
      const len = cell.kind === 'zelkova' ? rng.range(14, 21) : rng.range(11, 16);
      const wid = rng.range(5.5, 8.5);
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const ext = Math.ceil(len) + 2;
      for (let y = Math.floor(ly - ext); y <= ly + ext; y++) {
        for (let x = Math.floor(lx - ext); x <= lx + ext; x++) {
          if (x < cell.x0 || x >= cell.x0 + 128) continue;
          const dx = x + 0.5 - lx;
          const dy = y + 0.5 - ly;
          const u = dx * ca + dy * sa;
          const v = -dx * sa + dy * ca;
          let edge: number;
          if (cell.kind === 'zelkova') {
            // 先のとがった楕円の葉（葉柄の側が太い）
            const t = u / (len / 2);
            if (Math.abs(t) > 1.05) continue;
            const halfW = (wid / 2) * Math.sqrt(Math.max(0, 1 - t * t)) * (t > 0 ? 1 - 0.35 * t : 1);
            edge = halfW - Math.abs(v);
          } else {
            // 扇形の葉：付け根から ±55° に開き、先の中央に浅い切れ込み
            const rr = Math.hypot(u, v);
            const th = Math.atan2(v, u);
            if (Math.abs(th) > 1.0) continue;
            const R = len * (1 - 0.18 * Math.exp(-((th / 0.12) ** 2)));
            edge = Math.min(R - rr, (1.0 - Math.abs(th)) * rr);
          }
          const alpha = Math.min(1, Math.max(0, edge + 0.5));
          if (alpha <= 0) continue;
          // 主脈を少し暗く、先を少し明るく
          const vein = Math.abs(v) < 0.6 ? 0.88 : 1;
          put(x, y, alpha, bright * vein * (0.92 + 0.08 * Math.max(0, u / len)));
        }
      }
    }
  }
  const tex = new DataTexture(data, W, H, RGBAFormat, UnsignedByteType);
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  tex.name = 'leaves';
  return tex;
}
