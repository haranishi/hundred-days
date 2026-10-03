// OWNER: fx
// 破片の配り方（純データ・three を読まない）。r03-fx：コンクリ・外壁・ガラスの3種を大・中・小に分ける。大きいほど初速・回転・跳ね返りが小さい。
// r04-fx2：重力は大きさによらず 9.8 m/s²（大きい塊ほど重力を弱くする見せ方をやめた。漂って見えた）。小さく軽い破片ほど空気の抵抗が大きい。
// 種類の割合は建物の外壁の材質（config/gameplay.ts の BUILDING_RULES）、大きさの割合は壊れ方の段階で決める。
// 乱数は渡された系列だけを引くので、同じ系列・同じ出来事なら同じ破片が出る（撮影と自動プレイで決定的）。
import { DEBRIS } from '../config/fx';
import { BUILDING_RULES } from '../config/gameplay';
import type { Rng } from '../core/rng';
import type { Building } from '../world/types';

export type DebrisKind = 'concrete' | 'facade' | 'glass';
export type DebrisSize = 'L' | 'M' | 'S';
export const DEBRIS_KINDS: readonly DebrisKind[] = ['concrete', 'facade', 'glass'];
export const DEBRIS_SIZES: readonly DebrisSize[] = ['L', 'M', 'S'];

export interface DebrisPiece {
  kind: DebrisKind;
  size: DebrisSize;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** 3軸の大きさ（m） */
  sx: number;
  sy: number;
  sz: number;
  /** 重力の倍率・空気の抵抗（1/秒）・跳ね返り・回転の速さ（rad/s） */
  gravity: number;
  drag: number;
  bounce: number;
  spin: number;
  /** 色（線形）と表面（粗さ・金属らしさ） */
  r: number;
  g: number;
  b: number;
  rough: number;
  metal: number;
}

/** 破片の出どころ：点 (x,y,z)、外向き (nx,nz)、面に沿った散らばり spread（m）、外への速さと上への速さの範囲（m/s） */
export interface DebrisSource {
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
  spread: number;
  out: readonly [number, number];
  up: readonly [number, number];
}

const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/**
 * 建物 b の破片を count 個。sizeMix は大・中・小の割合（省くと崩落の割合）。
 * 大きさの種類ごとに、重力の倍率・空気の抵抗・初速・回転・跳ね返りを DEBRIS から取る（大きいほど初速と回転が小さく、抵抗が小さい）。
 */
export function planDebris(b: Building, src: DebrisSource, count: number, rng: Rng, sizeMix: readonly [number, number, number] = DEBRIS.sizeMix): DebrisPiece[] {
  const mix = DEBRIS.kindMix[BUILDING_RULES[b.kind].material];
  const wall = b.masses[b.masses.length - 1].wallColor;
  const glass = b.facade.glassColor;
  const out: DebrisPiece[] = [];
  const tx = -src.nz;
  const tz = src.nx;
  for (let k = 0; k < count; k++) {
    const kind = rng.weighted(DEBRIS_KINDS, mix);
    const size = rng.weighted(DEBRIS_SIZES, sizeMix);
    const [lo, hi] = DEBRIS.size[size];
    const len = rng.range(lo, hi);
    const [ax, ay, az] = DEBRIS.shape[kind];
    const j = (): number => rng.range(0.8, 1.2);
    const sp = DEBRIS.speed[size];
    const along = rng.range(-1, 1) * src.spread;
    const outV = rng.range(src.out[0], src.out[1]) * sp;
    let r: number;
    let g: number;
    let bl: number;
    if (kind === 'concrete') {
      const t = rng.range(0.8, 1.15);
      r = 0.15 * t;
      g = 0.145 * t;
      bl = 0.138 * t;
    } else if (kind === 'facade') {
      const t = rng.range(0.62, 0.9);
      r = lin(wall[0]) * t;
      g = lin(wall[1]) * t;
      bl = lin(wall[2]) * t;
    } else {
      r = lin(glass[0]) * 0.9;
      g = lin(glass[1]) * 0.9;
      bl = lin(glass[2]) * 0.9;
    }
    const [rough, metal] = DEBRIS.surf[kind];
    out.push({
      kind,
      size,
      x: src.x + tx * along + src.nx * rng.range(0.3, 1.5),
      y: src.y + rng.range(-1.2, 1.2),
      z: src.z + tz * along + src.nz * rng.range(0.3, 1.5),
      vx: src.nx * outV + tx * rng.range(-2, 2) * sp,
      vy: rng.range(src.up[0], src.up[1]) * sp,
      vz: src.nz * outV + tz * rng.range(-2, 2) * sp,
      sx: len * ax * j(),
      sy: len * ay * j(),
      sz: len * az * j(),
      gravity: DEBRIS.gravity[size],
      drag: kind === 'glass' ? DEBRIS.glassDrag : DEBRIS.drag[size],
      bounce: DEBRIS.bounce[size],
      spin: DEBRIS.spin[size] * rng.range(0.6, 1.3),
      r,
      g,
      b: bl,
      rough,
      metal,
    });
  }
  return out;
}
