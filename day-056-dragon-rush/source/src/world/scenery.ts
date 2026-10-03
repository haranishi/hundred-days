// OWNER: world
// 遠景の純データ：湾の対岸の丘、背後の山並み、街の外の安い代役（箱の建物）。
// 遠景は霧の中の輪郭として読まれるので、塊の形と色が合えば中身は要らない。
import type { CityConfig } from '../config/city';
import { SCENERY_CONFIG } from '../config/city';
import { hashString, stream } from '../core/rng';
import { jitterColor, type RGB } from './color';
import { clamp, lerp } from './geom';
import { fbm1 } from './noise';

export interface Ridge {
  /** 稜線の標本。along は稜線に沿った位置、height は高さ */
  samples: { along: number; height: number }[];
}

export interface FillerBox {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** 街の中心からの距離（画質で間引くのに使う） */
  dist: number;
  color: RGB;
  roofColor: RGB;
  floorHeight: number;
  seed: number;
}

export interface SceneryData {
  farShore: Ridge & { x: number; depth: number };
  /** 方位角（北=0、東=90、度）ごとの山の高さ。半径 radius の円周上 */
  mountains: Ridge & { radius: number };
  filler: FillerBox[];
}

export function generateScenery(cfg: CityConfig): SceneryData {
  const S = SCENERY_CONFIG;
  const seed = cfg.seed;
  const shoreSeed = seed ^ hashString('scenery.shore');
  const mountainSeed = seed ^ hashString('scenery.mountains');

  const shoreSamples: Ridge['samples'] = [];
  // r01-city：採点「山が直線の折れ線」。細かい起伏（高さの数%）を重ね、標本を細かくした（140m→50m、2.5°→0.8°）。
  // 大きな形は元の fbm のまま（遠景の構図を変えない）
  for (let z = -S.farShore.zExtent; z <= S.farShore.zExtent; z += S.farShore.step) {
    const n = fbm1(z / 2600, shoreSeed, 5);
    const h = lerp(S.farShore.heights[0], S.farShore.heights[1], clamp((n - 0.28) / 0.5, 0, 1) ** 1.4);
    const rough = (fbm1(z / 180, shoreSeed + 77, 4) - 0.5) * 2 * S.farShore.roughness;
    shoreSamples.push({ along: z, height: h * (1 + rough) + rough * 25 });
  }

  const mountainSamples: Ridge['samples'] = [];
  const arc = S.mountains.arcToDeg - S.mountains.arcFromDeg;
  for (let a = S.mountains.arcFromDeg; a <= S.mountains.arcToDeg; a += S.mountains.step) {
    const n = fbm1(a / 22, mountainSeed, 5);
    const base = lerp(S.mountains.heights[0], S.mountains.heights[1], clamp((n - 0.25) / 0.55, 0, 1) ** 1.2);
    const h = base * (1 + (fbm1(a / 1.6, mountainSeed + 91, 4) - 0.5) * 2 * S.mountains.roughness);
    // 弧の両端は低くして、切り口の壁が見えないようにする
    const k = (a - S.mountains.arcFromDeg) / arc;
    const taper = Math.min(1, Math.min(k, 1 - k) / 0.12);
    mountainSamples.push({ along: a, height: h * taper * taper });
  }

  // 街の外の代役：格子の升目ごとに1棟。升目の間の隙間が道に見える
  // r01-city：採点「空から見ると舗装だけの区画が市松に並ぶ」。空き升目を減らし（26%→10%）、升目を大きく埋め、
  // 升目の半分近くは2〜4棟の低い建物に割る（系列 scenery.filler.split、升目ごと）。街の縁の1周も、街に重ならなければ建てる
  const rng = stream(seed, 'scenery.filler');
  const half = cfg.size / 2;
  const cell = S.filler.cell;
  const maxR = 3400;
  const palette = [...cfg.palettes.tileWall, ...cfg.palettes.zakkyoWall, ...cfg.palettes.apartmentWall];
  const filler: FillerBox[] = [];
  for (let gx = Math.floor(cfg.coast.x / cell); gx * cell < maxR; gx++) {
    for (let gz = Math.floor(-maxR / cell); gz * cell < maxR; gz++) {
      const cx = (gx + 0.5) * cell;
      const cz = (gz + 0.5) * cell;
      const dist = Math.hypot(cx, cz);
      const roll = rng.next();
      const w = rng.range(S.filler.footprint[0], S.filler.footprint[1]);
      const d = rng.range(S.filler.footprint[0], S.filler.footprint[1]);
      const hRoll = rng.next();
      const colorRoll = rng.int(0, palette.length - 1);
      const jitterSeed = rng.nextUint();
      const jx = rng.range(-1, 1);
      const jz = rng.range(-1, 1);
      if (dist > maxR || roll < S.filler.emptyChance) continue;
      const falloff = lerp(1, 0.4, clamp((dist - half) / (maxR - half), 0, 1));
      const h = lerp(S.filler.heights[0], S.filler.heights[1], hRoll * hRoll) * falloff;
      const colorRng = stream(jitterSeed, 'scenery.filler.color');
      // 街と湾に重なる箱は置かない
      const fits = (x: number, z: number, bw: number, bd: number): boolean =>
        x - bw / 2 >= cfg.coast.x + 20 && !(x + bw / 2 > -half - 12 && x - bw / 2 < half + 12 && z + bd / 2 > -half - 12 && z - bd / 2 < half + 12);
      const push = (x: number, z: number, bw: number, bd: number, bh: number, rng2: typeof colorRng): void => {
        if (!fits(x, z, bw, bd)) return;
        filler.push({
          x,
          z,
          w: bw,
          d: bd,
          h: Math.max(6, bh),
          dist,
          color: jitterColor(palette[rng2.int(0, palette.length - 1)], rng2),
          roofColor: jitterColor(rng2.pick(cfg.palettes.flatRoof), rng2, 0.5),
          floorHeight: 3.3,
          seed: rng2.next(),
        });
      };
      const split = stream(seed, 'scenery.filler.split', gx, gz);
      if (split.chance(S.filler.splitChance)) {
        // 2〜4棟の低い建物（升目を田の字に割り、いくつかを空ける）
        const q = (cell - 10) / 2;
        for (const [sx, sz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ]) {
          if (split.chance(0.2)) continue;
          const bw = split.range(q * 0.55, q - 2);
          const bd = split.range(q * 0.55, q - 2);
          push(cx + (sx * q) / 2, cz + (sz * q) / 2, bw, bd, lerp(6, 22, split.next()) * falloff, colorRng);
        }
        continue;
      }
      // 升目の中で位置をずらし、格子がそろって見えないようにする
      const bw = Math.min(w, cell - 10);
      const bd = Math.min(d, cell - 10);
      push(cx + jx * Math.max(0, (cell - 10 - bw) / 2), cz + jz * Math.max(0, (cell - 10 - bd) / 2), bw, bd, h, colorRng);
      void colorRoll;
    }
  }

  return {
    farShore: { x: S.farShore.x, depth: S.farShore.depth, samples: shoreSamples },
    mountains: { radius: S.mountains.radius, samples: mountainSamples },
    filler,
  };
}
