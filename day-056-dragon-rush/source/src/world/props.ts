// OWNER: world
// 道の小物の配置（純データ）：街路樹・街灯・信号。使われ方の順に置く：
// 歩道の縁石寄りに一定の間隔で木、その間に街灯、交差点の角に信号。交差点の近くは見通しのため空ける。
// 乱数は小物ごとの系列（city.props.*）なので、小物を増やしても建物の並びは変わらない。
// r01-city：街路樹は通りごとに樹種をそろえ（日本の街路樹の植え方）、1本ずつ形・傾き・葉の色を変え、若木と欠けた木を混ぜる。
// 木の見た目の選択は別の系列（city.props.treeLook）で引くので、街灯の並びは r00b から変わらない。
import { PROPS_CONFIG as P } from '../config/city';
import { TREE_PLACEMENT as TP } from '../config/trees';
import { hashString, stream } from '../core/rng';
import type { Block, CityData, RoadClass, Side } from './types';

export interface PropPlacement {
  x: number;
  z: number;
  /** 向き（+z を 0、上から見て反時計回り、ラジアン） */
  yaw: number;
  scale: number;
  /** 種類の中の変種（木なら樹種・色） */
  variant: number;
}

export type TreeSpecies = 'zelkova' | 'ginkgo';
export type TreeForm = 'full' | 'young' | 'sparse';

/** 街路樹1本。variant は描く形の番号（config/trees.ts の TREE_ARCHETYPES の添字）。 */
export interface TreePlacement extends PropPlacement {
  species: TreeSpecies;
  form: TreeForm;
  /** 植え枡を付けるか（歩道の木は付け、公園の芝の木は付けない） */
  pit: boolean;
  /** 傾き（ラジアン）と、傾く向き（上から見た角度、ラジアン） */
  lean: number;
  leanYaw: number;
  /** 葉の色の個体差 0..1 */
  tint: number;
}

export interface CityProps {
  trees: TreePlacement[];
  lamps: PropPlacement[];
  signals: PropPlacement[];
}

const TREE_CLASSES: ReadonlySet<RoadClass> = new Set(['avenue', 'street']);

interface EdgeLine {
  /** 縁石の線の始点と終点（歩道の外側の縁） */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** 歩道の内側（建物の側）へ向かう単位ベクトル */
  nx: number;
  nz: number;
  width: number;
  cls: RoadClass;
  /** 面する道の名前（同じ通りの両側で同じ値。樹種をそろえるのに使う） */
  road: string;
}

/** 街区のその辺が面する道の名前。格子の番号から作る（埠頭は無し）。 */
function roadKey(block: Block, side: Side): string {
  if (!block.grid) return `pier:${block.id}`;
  const { i, j } = block.grid;
  return side === 'n' ? `ew:${j}` : side === 's' ? `ew:${j + 1}` : side === 'w' ? `ns:${i}` : `ns:${i + 1}`;
}

function sidewalkEdges(block: Block): EdgeLine[] {
  const c = block.curb;
  const out: EdgeLine[] = [];
  const add = (side: Side, x0: number, z0: number, x1: number, z1: number, nx: number, nz: number): void => {
    const cls = block.faces[side];
    const width = block.sidewalk[side];
    if (cls && width > 0) out.push({ x0, z0, x1, z1, nx, nz, width, cls, road: roadKey(block, side) });
  };
  add('n', c.x0, c.z0, c.x1, c.z0, 0, 1);
  add('s', c.x0, c.z1, c.x1, c.z1, 0, -1);
  add('w', c.x0, c.z0, c.x0, c.z1, 1, 0);
  add('e', c.x1, c.z0, c.x1, c.z1, -1, 0);
  return out;
}

/** 通りの樹種：大通りはケヤキが多く、ふつうの通りはイチョウが多い（同じ通りの両側で同じ）。 */
function speciesFor(city: CityData, road: string, cls: RoadClass): TreeSpecies {
  const r = stream(city.seed, 'city.props.species', hashString(road)).next();
  return r < (cls === 'avenue' ? TP.zelkovaOnAvenue : TP.zelkovaOnStreet) ? 'zelkova' : 'ginkgo';
}

/** 木1本の見た目の選択（形・傾き・葉の色）。系列は city.props.treeLook（木の通し番号ごと）。 */
function treeLook(city: CityData, index: number, species: TreeSpecies): Omit<TreePlacement, keyof PropPlacement | 'pit'> & { variant: number } {
  const rng = stream(city.seed, 'city.props.treeLook', index);
  const f = rng.next();
  const form: TreeForm = f < TP.youngChance ? 'young' : f < TP.youngChance + TP.sparseChance ? 'sparse' : 'full';
  const ab = rng.int(0, 1);
  const variant = form === 'young' ? 4 : form === 'sparse' ? 5 : (species === 'zelkova' ? 0 : 2) + ab;
  // 傾きは小さいものが多い（二乗で寄せる）
  const lean = TP.maxLeanRad * rng.next() ** 2;
  return { species, form, lean, leanYaw: rng.range(0, Math.PI * 2), tint: rng.next(), variant };
}

export function generateProps(city: CityData): CityProps {
  const trees: TreePlacement[] = [];
  const lamps: PropPlacement[] = [];
  const signals: PropPlacement[] = [];

  for (const block of city.blocks) {
    if (block.isPier) continue;
    const rng = stream(city.seed, 'city.props.street', block.id);
    for (const e of sidewalkEdges(block)) {
      const len = Math.hypot(e.x1 - e.x0, e.z1 - e.z0);
      const ux = (e.x1 - e.x0) / len;
      const uz = (e.z1 - e.z0) / len;
      // 道の側を向く角度（木の個体差と街灯の腕の向き）
      const toRoad = Math.atan2(-e.nx, -e.nz);
      const corner = P.cornerClear;
      if (TREE_CLASSES.has(e.cls) && e.width >= P.trees.minSidewalk) {
        const spacing = e.cls === 'avenue' ? P.trees.avenueSpacing : P.trees.streetSpacing;
        const inset = Math.min(P.trees.maxInset, e.width * 0.3);
        for (let s = corner + rng.range(0, spacing * 0.5); s < len - corner; s += spacing * rng.range(0.9, 1.1)) {
          const base = {
            x: e.x0 + ux * s + e.nx * inset,
            z: e.z0 + uz * s + e.nz * inset,
            yaw: rng.range(0, Math.PI * 2),
            scale: rng.range(0.82, 1.18) * (e.cls === 'avenue' ? 1.1 : 0.95),
          };
          rng.int(0, 3); // r00b の変種の引き（街灯の並びを変えないため、引く回数を保つ）
          trees.push({ ...base, ...treeLook(city, trees.length, speciesFor(city, e.road, e.cls)), pit: true });
        }
      }
      if (e.cls === 'avenue') {
        for (let s = corner + 4 + rng.range(0, 6); s < len - corner; s += P.lamps.spacing) {
          lamps.push({ x: e.x0 + ux * s + e.nx * P.lamps.inset, z: e.z0 + uz * s + e.nz * P.lamps.inset, yaw: toRoad, scale: 1, variant: 0 });
        }
      }
    }
  }

  // 信号：路地でない道どうしの交差点の四隅。腕は交差点の中心へ向ける
  for (const ix of city.intersections) {
    const ns = city.roadLines[ix.nsLineId];
    const ew = city.roadLines[ix.ewLineId];
    if (ns.cls === 'lane' || ew.cls === 'lane') continue;
    const r = ix.rect;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const corners: [number, number, number, number][] = [
      [r.x0, r.z0, -1, -1],
      [r.x1, r.z0, 1, -1],
      [r.x0, r.z1, -1, 1],
      [r.x1, r.z1, 1, 1],
    ];
    corners.forEach(([x, z, sx, sz], k) => {
      const px = x + sx * P.signalOffset;
      const pz = z + sz * P.signalOffset;
      // 端の交差点では、道の外（街区が無い側）には立てない
      if (px < city.coast.promenade.x1 || Math.abs(pz) > city.bounds.z1 || px > city.bounds.x1) return;
      signals.push({ x: px, z: pz, yaw: Math.atan2(cx - px, cz - pz), scale: 1, variant: k % 2 });
    });
  }
  // 岸壁の遊歩道の並木（r01-city）：柵と車道の間に一列。植え枡を付ける
  {
    const rng = stream(city.seed, 'city.props.promenade');
    const p = city.coast.promenade;
    const species = speciesFor(city, 'promenade', 'avenue');
    for (let z = p.z0 + rng.range(4, 10); z < p.z1 - 4; z += TP.promenadeSpacing * rng.range(0.9, 1.1)) {
      const look = treeLook(city, trees.length, species);
      trees.push({ x: p.x0 + TP.promenadeInset, z, yaw: rng.range(0, Math.PI * 2), scale: rng.range(0.9, 1.15), ...look, pit: true });
    }
  }

  // 中庭の公園の木（r01-city）：縁の園路の内側に一定の間隔で植え、十字の園路は空ける。系列は city.props.park（区画ごと）
  for (const lot of city.lots) {
    if (lot.courtyard !== 'park') continue;
    const rng = stream(city.seed, 'city.props.park', lot.id);
    const r = lot.rect;
    const mx = (r.x0 + r.x1) / 2;
    const mz = (r.z0 + r.z1) / 2;
    const species: TreeSpecies = rng.chance(0.5) ? 'zelkova' : 'ginkgo';
    const inset = TP.parkInset;
    // 細長い中庭には木を植えない（縁の園路の内側に木の場所が無い）
    if (Math.min(r.x1 - r.x0, r.z1 - r.z0) < 2 * inset + 3) continue;
    const place = (x: number, z: number): void => {
      if (Math.abs(x - mx) < 3 || Math.abs(z - mz) < 3) return;
      const look = treeLook(city, trees.length, species);
      trees.push({ x, z, yaw: rng.range(0, Math.PI * 2), scale: rng.range(0.85, 1.2), ...look, pit: false });
    };
    for (let x = r.x0 + inset; x <= r.x1 - inset + 1e-6; x += TP.parkSpacing * rng.range(0.85, 1.15)) {
      place(x, r.z0 + inset);
      place(x, r.z1 - inset);
    }
    for (let z = r.z0 + inset + TP.parkSpacing; z < r.z1 - inset - 2; z += TP.parkSpacing * rng.range(0.85, 1.15)) {
      place(r.x0 + inset, z);
      place(r.x1 - inset, z);
    }
  }
  return { trees, lamps, signals };
}
