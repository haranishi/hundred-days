// OWNER: world
// 隣り合う建物に同じ見た目の組み合わせを置かない判定。配置の最後に通す。
// r01-city（採点 r00a の改善5位「同じ」を減らす）：判定を強めた。
// ・接して並ぶ建物：組み合わせ（種類・色見本・窓割り・屋根）が違うことに加え、同じ種類なら色見本も違える
// ・通りを挟んで向かい合う建物：組み合わせが違う（空から見て、通りの両側に同じ箱が並ばないように）
import type { CityConfig } from '../config/city';
import { stream } from '../core/rng';
import type { BuildingDraft } from './buildings';
import { variantCounts } from './buildings';
import { signatureOf, type Variant } from './buildingLook';
import { touches } from './geom';
import type { Lot } from './types';

/** 区画どうしが隣り合う組（辺が 1m 以内で向かい合い、2m 以上重なる）。 */
export function lotNeighborPairs(lots: readonly Lot[], gap = 1, minOverlap = 2): [number, number][] {
  const cell = 40;
  const grid = new Map<string, number[]>();
  const key = (i: number, j: number): string => `${i},${j}`;
  for (const lot of lots) {
    const i0 = Math.floor((lot.rect.x0 - gap) / cell);
    const i1 = Math.floor((lot.rect.x1 + gap) / cell);
    const j0 = Math.floor((lot.rect.z0 - gap) / cell);
    const j1 = Math.floor((lot.rect.z1 + gap) / cell);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = key(i, j);
        const list = grid.get(k);
        if (list) list.push(lot.id);
        else grid.set(k, [lot.id]);
      }
    }
  }
  const seen = new Set<string>();
  const pairs: [number, number][] = [];
  for (const list of grid.values()) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const lo = Math.min(list[a], list[b]);
        const hi = Math.max(list[a], list[b]);
        const k = `${lo},${hi}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (touches(lots[lo].rect, lots[hi].rect, gap, minOverlap)) pairs.push([lo, hi]);
      }
    }
  }
  pairs.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  return pairs;
}

/**
 * 通りを挟んで向かい合う区画の組（区画の正面どうしが向き合い、間が maxGap 以内で、間口が minOverlap 以上重なる）。
 */
export function facingLotPairs(lots: readonly Lot[], maxGap = 45, minOverlap = 4): [number, number][] {
  const out: [number, number][] = [];
  const byFront = { n: [] as Lot[], s: [] as Lot[], e: [] as Lot[], w: [] as Lot[] };
  for (const l of lots) if (l.buildable) byFront[l.front].push(l);
  const push = (a: number, b: number): void => {
    out.push(a < b ? [a, b] : [b, a]);
  };
  // 北を向く区画（front n）と、その北で南を向く区画（front s）
  for (const a of byFront.n) {
    for (const b of byFront.s) {
      const gap = a.rect.z0 - b.rect.z1;
      if (gap <= 0 || gap > maxGap) continue;
      if (Math.min(a.rect.x1, b.rect.x1) - Math.max(a.rect.x0, b.rect.x0) >= minOverlap) push(a.id, b.id);
    }
  }
  for (const a of byFront.w) {
    for (const b of byFront.e) {
      const gap = a.rect.x0 - b.rect.x1;
      if (gap <= 0 || gap > maxGap) continue;
      if (Math.min(a.rect.z1, b.rect.z1) - Math.max(a.rect.z0, b.rect.z0) >= minOverlap) push(a.id, b.id);
    }
  }
  out.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  return out;
}

/**
 * 建物を id 順に見て、先に決まった隣・向かいと重なる見た目なら選び直す。
 * touching（接して並ぶ組）は署名が違い、さらに同じ種類なら色見本も違う。facing（通りを挟んで向かい合う組）は署名が違う。
 * 後から見る建物が前の建物に合わせて変わるだけなので、どの組も最後には必ず条件を満たす（満たせない時は署名だけを守る）。
 */
export function enforceVariety(
  cfg: CityConfig,
  drafts: readonly BuildingDraft[],
  variants: Variant[],
  pairs: readonly [number, number][],
  facing: readonly [number, number][] = [],
): void {
  const touching: number[][] = drafts.map(() => []);
  const across: number[][] = drafts.map(() => []);
  for (const [a, b] of pairs) {
    touching[a].push(b);
    touching[b].push(a);
  }
  for (const [a, b] of facing) {
    across[a].push(b);
    across[b].push(a);
  }
  for (let i = 0; i < drafts.length; i++) {
    const kind = drafts[i].kind;
    const before = (j: number): boolean => j < i;
    const taken = new Set([...touching[i], ...across[i]].filter(before).map((j) => signatureOf(drafts[j].kind, variants[j])));
    const takenPalettes = new Set(touching[i].filter((j) => before(j) && drafts[j].kind === kind).map((j) => variants[j].palette));
    const ok = (v: Variant, strict: boolean): boolean => !taken.has(signatureOf(kind, v)) && (!strict || !takenPalettes.has(v.palette));
    if (ok(variants[i], true)) continue;
    const counts = variantCounts(cfg, kind);
    const rng = stream(cfg.seed, 'city.variety', drafts[i].lotId);
    let v = variants[i];
    for (let attempt = 0; attempt < 24 && !ok(v, true); attempt++) {
      v = {
        palette: rng.int(0, counts.palette - 1),
        facade: attempt >= 8 ? rng.int(0, counts.facade - 1) : v.facade,
        roof: attempt >= 16 ? rng.int(0, counts.roof - 1) : v.roof,
      };
    }
    // 乱数で見つからなければ、全組み合わせを順に試す（まず色見本も違える条件、だめなら署名だけの条件）
    for (const strict of [true, false]) {
      if (ok(v, true) || (!strict && ok(v, false))) break;
      search: for (let p = 0; p < counts.palette; p++) {
        for (let f = 0; f < counts.facade; f++) {
          for (let r = 0; r < counts.roof; r++) {
            const candidate = { palette: p, facade: f, roof: r };
            if (ok(candidate, strict)) {
              v = candidate;
              break search;
            }
          }
        }
      }
    }
    variants[i] = v;
  }
}
