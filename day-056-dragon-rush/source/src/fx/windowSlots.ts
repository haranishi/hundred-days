// OWNER: fx
// 建物の窓の位置（純データ・three を読まない）。窓の炎（windowFire.ts）が「窓の列から」炎を出すのに使う。
// 窓の割り付けは外壁の頂点（city/buildingGeometry.ts の addWalls）とシェーダー（city/facadeGlsl.ts）と同じ規則：
// 面ごとに柱間を面の幅に整数個入れ、階は groundH から floorH ごと。窓はその区画の中央（カーテンウォールは階の上寄り）。
// 炎を出す順番は、面の上のなめらかなノイズ（約 9m × 6m の塊）と窓ごとの乱数を混ぜて決め、隣り合う窓がまとまって燃える
// （r03-fx：窓ごとにばらばらの乱数では、炎が窓の格子に等間隔に並んだ「炎の絵の張り紙」に見えた）。
import { hash01 } from '../core/rng';
import type { Building, Rect } from '../world/types';

export interface WindowSlot {
  /** 窓の中心（m、ワールド）と外向きの法線（水平） */
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
  /** 窓の幅と高さ（m）と、その階の高さ（m） */
  w: number;
  h: number;
  floorH: number;
  /** 炎を出す順番（0〜1）。小さいものから、燃えの強さに応じて炎が付く */
  rank: number;
  /** 窓ごとの形の種（0〜1） */
  seed: number;
  /** 炎の根元を窓の中心から面に沿ってずらす量（m）。格子に等間隔に並べない */
  shift: number;
}

/** 格子の値ノイズ（なめらか、0〜1）。k は建物ごとの鍵。 */
function valueNoise(x: number, y: number, k: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash01(ix, iy, k, 7);
  const b = hash01(ix + 1, iy, k, 7);
  const c = hash01(ix, iy + 1, k, 7);
  const d = hash01(ix + 1, iy + 1, k, 7);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

interface Face {
  a: [number, number];
  b: [number, number];
  n: [number, number];
}

/** addWalls と同じ順（北・南・東・西）と向き。 */
function faces(r: Rect): Face[] {
  return [
    { a: [r.x1, r.z0], b: [r.x0, r.z0], n: [0, -1] },
    { a: [r.x0, r.z1], b: [r.x1, r.z1], n: [0, 1] },
    { a: [r.x1, r.z1], b: [r.x1, r.z0], n: [1, 0] },
    { a: [r.x0, r.z0], b: [r.x0, r.z1], n: [-1, 0] },
  ];
}

/**
 * 1棟の窓を、炎を出す順（rank の小さい順）に最大 max 個。baseY は窓の割り付けの基準（街の縁石の高さ）。
 * 同じ建物なら必ず同じ並びになる（撮影と自動プレイで同じ窓が燃える）。
 */
export function windowSlots(b: Building, baseY: number, max: number): WindowSlot[] {
  const f = b.facade;
  const out: WindowSlot[] = [];
  b.masses.forEach((m, mi) => {
    const isPodium = b.kind === 'glassTower' && mi === 0;
    const floorH = isPodium ? 4.6 : f.floorHeight;
    const groundH = isPodium ? f.groundFloor : b.kind === 'glassTower' ? m.y0 - baseY : f.groundFloor;
    const roofV = m.y1 - baseY;
    const style = m.facade;
    const rows: { v: number; h: number; wFrac: number }[] = [];
    if (style === 'corrugated') {
      // 倉庫：屋根の下の明かり取りの帯だけ
      rows.push({ v: roofV - 1.8, h: 1.2, wFrac: f.windowWidth });
    } else {
      const v0 = Math.max(groundH, m.y0 - baseY);
      const first = Math.max(0, Math.ceil((v0 - groundH) / floorH - 1e-6));
      const last = Math.floor((roofV - 0.5 - groundH) / floorH - 1e-6);
      for (let j = first; j < last; j++) {
        if (style === 'curtain') rows.push({ v: groundH + (j + 1 - 0.5 * f.windowHeight) * floorH, h: f.windowHeight * floorH, wFrac: 0.94 });
        else if (style === 'balcony') rows.push({ v: groundH + (j + 0.62) * floorH, h: 0.68 * floorH, wFrac: f.windowWidth });
        else rows.push({ v: groundH + (j + 0.5) * floorH, h: f.windowHeight * floorH, wFrac: f.windowWidth });
      }
      // 1階の店先（groundH が高い建物の一番下の塊だけ）
      if (mi === 0 && groundH > 2.5 && m.y0 - baseY < 1) rows.push({ v: groundH * 0.5, h: groundH * 0.62, wFrac: 0.8 });
    }
    faces(m.rect).forEach((face, fi) => {
      const len = Math.hypot(face.b[0] - face.a[0], face.b[1] - face.a[1]);
      if (len < 1) return;
      const bays = Math.max(1, Math.round(len / f.bayWidth));
      const bayW = len / bays;
      const tx = (face.b[0] - face.a[0]) / len;
      const tz = (face.b[1] - face.a[1]) / len;
      for (let i = 0; i < bays; i++) {
        const u = (i + 0.5) * bayW;
        rows.forEach((row, j) => {
          const shift = (hash01(b.id, mi, fi, i, j, 37) - 0.5) * 0.5 * bayW;
          out.push({
            x: face.a[0] + tx * (u + shift),
            y: baseY + row.v,
            z: face.a[1] + tz * (u + shift),
            nx: face.n[0],
            nz: face.n[1],
            w: row.wFrac * bayW,
            h: row.h,
            floorH,
            // いったん「まとまりの点数」を入れ、あとで並べた順番（0〜1 に一様）に置き換える
            rank: 0.62 * valueNoise(u / 9 + fi * 31.7 + mi * 7.3, row.v / 6, b.id) + 0.38 * hash01(b.id, mi, fi, i, j, 29),
            seed: hash01(b.id, mi, fi, i, j, 31),
            shift,
          });
        });
      }
    });
  });
  out.sort((p, q) => p.rank - q.rank);
  // 順番を 0〜1 に一様に並べ直す（燃えの強さで決める割合が、そのまま窓の割合になる）
  out.forEach((s, k) => (s.rank = (k + 0.5) / out.length));
  return out.length > max ? out.slice(0, max) : out;
}
