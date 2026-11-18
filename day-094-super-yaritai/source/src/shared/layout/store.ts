/**
 * 店「スーパーきちんと堂」の純データ（正本。docs/04 の地図をコードにしたもの）。
 * 描画・当たり判定・経路・配置はすべてここから作る。座標はメートル、x＝東、z＝手前（南）、床が y=0。
 * 置き物の向き（yaw）は90度の倍数だけにして、当たり判定をワールドの軸に沿った箱で表せるようにしている。
 */
import { MISDEEDS, type MisdeedId } from '../rules/misdeeds';
import { BELL, CART, PYRAMID, RENDER } from '../rules/tuning';
import { streamRng } from '../rng';
import type { CartDef, PropDef, PropKind, Vec3, WorldStatic } from '../view';
import { ITEMS, originalSize, resolveItem } from './catalog';

const S = RENDER.modelScale;
const HALF_PI = Math.PI / 2;

/** ワールドの軸に沿った箱 */
export interface Box3 {
  min: Vec3;
  max: Vec3;
}

export type FixtureKind =
  | 'shelf'
  | 'shelf-end'
  | 'freezer'
  | 'freezer-standing'
  | 'register'
  | 'conveyor'
  | 'counter'
  | 'bell'
  | 'sale-table'
  | 'wagon'
  | 'sample-table'
  | 'banana-table'
  | 'fruit-display'
  | 'bread-display'
  | 'booth-wall'
  | 'booth-desk'
  | 'mic'
  | 'wall'
  | 'door-post'
  | 'lintel'
  | 'bottle-return'
  | 'light';

export type AisleId = 'veg' | 'snack' | 'drink' | 'canned' | 'daily' | 'breakfast';

/** 商品を並べる面（なぎ払いの対象）。外向きの法線 n と、面に沿う向き t */
export interface ShelfFace {
  /** 面の通し番号 */
  id: number;
  fixtureId: number;
  /** 面の中心（床の高さ） */
  x: number;
  z: number;
  nx: number;
  nz: number;
  /** 面に沿った半分の長さ */
  halfLen: number;
  aisle: AisleId;
}

export interface Fixture {
  id: number;
  kind: FixtureKind;
  /** 描画するモデル。'pc/〜' はコードで組む部品 */
  model: string;
  /** 外形の底面の中心 */
  pos: Vec3;
  yaw: number;
  /** 描画の倍率 */
  scale: Vec3;
  /** 外形（回転前：幅x・高さy・奥行きz。倍率をかけた後のメートル） */
  size: Vec3;
  /** 動かない当たり判定。空なら当たらない */
  colliders: Box3[];
  faces: ShelfFace[];
  aisle?: AisleId;
  /** キャラとカメラの間に来たら透かす */
  occluder: boolean;
  /** 色の手がかり（コードで組む部品が palette のどの色を使うか） */
  tint?: string;
}

export type SignStyle = 'notice' | 'aisle' | 'pop' | 'store' | 'price';

export interface SignDef {
  text: string;
  sub?: string;
  /** 札の中心 */
  pos: Vec3;
  /** 札の幅と高さ（m） */
  w: number;
  h: number;
  style: SignStyle;
  /** 悪事の注意書きなら、その悪事 */
  misdeed?: MisdeedId;
  /** 支柱を立てる（床置きの札） */
  pole?: boolean;
  /** 札の表の向き。省略時は 0＝南（カメラ側）を向く */
  yaw?: number;
}

export interface Place {
  x: number;
  z: number;
  /** この距離以内なら「その場所にいる」 */
  r: number;
  /** その場所で向く向き */
  yaw: number;
}

export type PlaceId =
  | 'bell'
  | 'carts'
  | 'pyramid'
  | 'wagon'
  | 'lane'
  | 'pins'
  | 'samples'
  | 'pa'
  | 'freezer'
  | 'banana'
  | 'tantrum'
  | 'service'
  | 'staffDoor'
  | 'entrance';

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface StoreLayout {
  /** 店の内側 */
  bounds: Rect;
  fixtures: Fixture[];
  faces: ShelfFace[];
  signs: SignDef[];
  places: Record<PlaceId, Place>;
  /** 場所の範囲（駄々はお菓子の通路の中ならどこでも） */
  zones: { snackAisle: Rect; frontPlaza: Rect };
  spawns: { x: number; z: number; yaw: number }[];
  /** 店員の巡回点（第2波）。輪になっていて、最後の次は最初へ戻る */
  patrols: { x: number; z: number }[][];
  /** 客がうろつく点（第2波） */
  wanderPoints: { x: number; z: number }[];
  /** 棚の列の中心 x（棚の列の向きは南北） */
  rowXs: readonly number[];
  /** 特売台の上の缶の置き場の中心と台の高さ */
  pyramidBase: { x: number; z: number; y: number };
}

// ───────── 地図の寸法 ─────────

export const BOUNDS: Rect = { x0: -18, z0: -14, x1: 18, z1: 14 };
export const ROW_XS = [-9, -4, 1, 6, 11] as const;
/** 棚1台の長さ（列の向き）と奥行き、棚板の高さ */
export const SHELF = {
  len: 0.8 * S,
  depth: 0.7 * S,
  height: 0.8 * S,
  units: 5,
  z0: -8.0,
  /** 下の段・上の段の板の上面 */
  levels: [0.175 * S, 0.55 * S] as const,
  boardThick: 0.05 * S,
  /** 板の端（中心からの距離） */
  boardHalf: 0.321 * S,
  dividerHalf: 0.05 * S,
  endDepth: 0.4 * S,
};
const ROW_Z1 = SHELF.z0 + SHELF.len * SHELF.units;
/** 北の壁ぞいの立型冷凍ケースの中心 x。西の端（7.2−1.15）と平台の冷凍ケースの東の端（4.68）の間に、人が通れる1.3mのすき間を残す */
const STANDING_NORTH_XS = [7.2, 9.5, 11.8, 14.1] as const;
/**
 * 出発点の z。入口（z=14）から約4m奥。入口のアーチがキャラにかぶらず、店の外が映る量を減らす（round3 D3）。
 * CPU は缶ピラミッドが5mより遠いと最初の行き先に選びにくい（tuning の CPU_PLAN.pyramidNear）ので、ピラミッドの前から5mより離す
 */
const SPAWN_Z = 9.8;
/** 通路ごとの品ぞろえ。列の西の面・東の面がどの通路に向くか */
const ROW_AISLES: readonly [AisleId, AisleId][] = [
  ['veg', 'snack'],
  ['snack', 'drink'],
  ['drink', 'canned'],
  ['canned', 'daily'],
  ['daily', 'breakfast'],
];

export const AISLE_NAMES: Record<AisleId, string> = {
  veg: '青果',
  snack: 'お菓子',
  drink: '飲料',
  canned: '缶詰・調味料',
  daily: '日用品',
  breakfast: '朝ごはん',
};

/**
 * 下の段・上の段に並べる品目の候補（1台・1段ごとに1品目を選び、同じ物を並べる。同じ名前を2回書くとその品目が出やすい）。
 * 通路ごとに主役の色と形を1つに絞る（round3 D1：遠目で札なしでも通路がわかるように）。色は描画側（render/productLook.ts）で塗り替える。
 * お菓子＝黄とピンクの袋／飲料＝青と透明のボトル／缶詰＝赤い缶の列／日用品＝白いロールと淡い色のボトル
 */
const ASSORTMENT: Record<AisleId, { lower: string[]; upper: string[] }> = {
  veg: { lower: ['cabbage', 'pumpkin', 'corn'], upper: ['onion', 'paprika', 'eggplant', 'broccoli'] },
  snack: { lower: ['chips', 'chips', 'mm-bag'], upper: ['chips-s', 'chips-s', 'candy-box'] },
  drink: { lower: ['water-pack', 'water-pack', 'carton'], upper: ['water-s', 'soda-can', 'mm-carton'] },
  canned: { lower: ['can-tray', 'can-tray', 'can'], upper: ['can-small', 'can-s', 'ketchup'] },
  daily: { lower: ['tp-pack'], upper: ['detergent-bottle'] },
  breakfast: { lower: ['loaf', 'cereal-box'], upper: ['croissant', 'muffin', 'carton-small'] },
};
/** 端の棚に並べる品目（その通路の目玉） */
const END_ITEMS: Record<AisleId, [string, string]> = {
  veg: ['pumpkin', 'onion'],
  snack: ['chips', 'candy-box'],
  drink: ['water', 'soda-can'],
  canned: ['can', 'can-small'],
  daily: ['tp-pack', 'detergent-bottle'],
  breakfast: ['cereal-box', 'muffin'],
};

/** 1段に並べる数の上限（動く商品を約350個に収めるため） */
const MAX_PER_LEVEL = 3;

// ───────── 組み立ての道具 ─────────

function rotateXZ(lx: number, lz: number, yaw: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [lx * c + lz * s, -lx * s + lz * c];
}

/** ローカルの箱（底面中心が原点）を、置き場所と向き（90度の倍数）でワールドの箱にする */
function worldBox(pos: Vec3, yaw: number, min: Vec3, max: Vec3): Box3 {
  const [ax, az] = rotateXZ(min.x, min.z, yaw);
  const [bx, bz] = rotateXZ(max.x, max.z, yaw);
  return {
    min: { x: pos.x + Math.min(ax, bx), y: pos.y + min.y, z: pos.z + Math.min(az, bz) },
    max: { x: pos.x + Math.max(ax, bx), y: pos.y + max.y, z: pos.z + Math.max(az, bz) },
  };
}

function v(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function aabb(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box3 {
  return { min: v(x0, y0, z0), max: v(x1, y1, z1) };
}

/** 外形どおりの箱1つを当たり判定にする */
function solidBox(pos: Vec3, yaw: number, size: Vec3): Box3 {
  return worldBox(pos, yaw, v(-size.x / 2, 0, -size.z / 2), v(size.x / 2, size.y, size.z / 2));
}

function modelSize(model: string, scale: Vec3): Vec3 {
  const [w, h, d] = originalSize(model);
  return v(w * scale.x, h * scale.y, d * scale.z);
}

// ───────── 店を組み立てる ─────────

let cached: StoreLayout | null = null;

/** 店のデータ（seed によらず同じ）。何度呼んでも同じものを返す */
export function storeLayout(): StoreLayout {
  if (!cached) cached = buildStore();
  return cached;
}

function buildStore(): StoreLayout {
  const fixtures: Fixture[] = [];
  const faces: ShelfFace[] = [];
  const signs: SignDef[] = [];
  const uni = v(S, S, S);

  const add = (f: Omit<Fixture, 'id' | 'faces' | 'occluder' | 'colliders'> & Partial<Pick<Fixture, 'occluder' | 'colliders'>>): Fixture => {
    const fixture: Fixture = {
      id: fixtures.length,
      faces: [],
      occluder: f.occluder ?? false,
      colliders: f.colliders ?? [],
      ...f,
    } as Fixture;
    fixtures.push(fixture);
    return fixture;
  };
  const addModel = (kind: FixtureKind, model: string, x: number, z: number, yaw: number, opts: { solid?: boolean; occluder?: boolean; scale?: Vec3; y?: number } = {}): Fixture => {
    const scale = opts.scale ?? uni;
    const size = modelSize(model, scale);
    const pos = v(x, opts.y ?? 0, z);
    return add({ kind, model, pos, yaw, scale, size, colliders: opts.solid === false ? [] : [solidBox(pos, yaw, size)], occluder: opts.occluder ?? false });
  };
  /** コードで組む部品（倍率1・外形の箱が当たり判定） */
  const addCode = (kind: FixtureKind, model: string, x: number, z: number, size: Vec3, opts: { solid?: boolean; occluder?: boolean; y?: number; yaw?: number; tint?: string } = {}): Fixture => {
    const pos = v(x, opts.y ?? 0, z);
    const yaw = opts.yaw ?? 0;
    return add({ kind, model, pos, yaw, scale: v(1, 1, 1), size, colliders: opts.solid === false ? [] : [solidBox(pos, yaw, size)], occluder: opts.occluder ?? false, tint: opts.tint });
  };

  // 棚の列：5列×5台。棚のモデルの幅（ローカルx）を南北に向けるため yaw=−90度
  ROW_XS.forEach((rx, row) => {
    const [westAisle, eastAisle] = ROW_AISLES[row]!;
    for (let u = 0; u < SHELF.units; u++) {
      const zc = SHELF.z0 + SHELF.len * (u + 0.5);
      // お菓子の通路は袋の棚、それ以外は箱の棚（見た目に変化をつける）
      const model = westAisle === 'snack' || eastAisle === 'snack' ? (u % 2 === 0 ? 'mm/shelf-bags' : 'mm/shelf-boxes') : 'mm/shelf-boxes';
      const f = add({ kind: 'shelf', model, pos: v(rx, 0, zc), yaw: -HALF_PI, scale: uni, size: modelSize(model, uni), occluder: true });
      for (const side of [-1, 1] as const) {
        const face: ShelfFace = { id: faces.length, fixtureId: f.id, x: rx + side * SHELF.boardHalf, z: zc, nx: side, nz: 0, halfLen: SHELF.len / 2, aisle: side < 0 ? westAisle : eastAisle };
        f.faces.push(face);
        faces.push(face);
      }
    }
    // 列ぜんたいの当たり判定（棚板の下の台・上の板・真ん中の仕切り）。継ぎ目のすき間に物が挟まらないよう列で1つにする
    const bh = SHELF.boardHalf;
    const [l0, l1] = SHELF.levels;
    const rowFixture = fixtures[fixtures.length - 1]!;
    rowFixture.colliders.push(
      aabb(rx - bh, 0, SHELF.z0, rx + bh, l0, ROW_Z1),
      aabb(rx - bh, l1 - SHELF.boardThick, SHELF.z0, rx + bh, l1, ROW_Z1),
      aabb(rx - SHELF.dividerHalf, 0, SHELF.z0, rx + SHELF.dividerHalf, SHELF.height, ROW_Z1),
    );
    // 列の両端の棚（片面）。北の端は北を、南の端は南を向く
    for (const end of ['north', 'south'] as const) {
      const zc = end === 'north' ? SHELF.z0 - SHELF.endDepth / 2 : ROW_Z1 + SHELF.endDepth / 2;
      const yaw = end === 'north' ? 0 : Math.PI;
      const nz = end === 'north' ? -1 : 1;
      const aisle = row < 2 ? (row === 0 ? 'snack' : 'drink') : row === 2 ? 'canned' : row === 3 ? 'daily' : 'breakfast';
      const size = modelSize('mm/shelf-end', uni);
      const endHalf = 0.35 * S;
      const pos = v(rx, 0, zc);
      const backZ = zc - nz * SHELF.endDepth / 2;
      const front = zc + nz * SHELF.endDepth / 2;
      const zA = Math.min(backZ, front);
      const zB = Math.max(backZ, front);
      const backPanel = end === 'north' ? aabb(rx - size.x / 2, 0, backZ - 0.16, rx + size.x / 2, SHELF.height, backZ) : aabb(rx - size.x / 2, 0, backZ, rx + size.x / 2, SHELF.height, backZ + 0.16);
      const f = add({
        kind: 'shelf-end',
        model: 'mm/shelf-end',
        pos,
        yaw,
        scale: uni,
        size,
        aisle,
        occluder: true,
        colliders: [aabb(rx - endHalf, 0, zA, rx + endHalf, SHELF.levels[0], zB), aabb(rx - endHalf, SHELF.levels[1] - SHELF.boardThick, zA, rx + endHalf, SHELF.levels[1], zB), backPanel],
      });
      const face: ShelfFace = { id: faces.length, fixtureId: f.id, x: rx, z: front, nx: 0, nz, halfLen: SHELF.len / 2, aisle };
      f.faces.push(face);
      faces.push(face);
    }
  });

  // 奥：平台の冷凍ケース4台（中に入れるよう、底と4つの壁で囲む）
  const fz = -11.6;
  [-1.76, 0.08, 1.92, 3.76].forEach((x) => {
    const size = modelSize('mm/freezer', uni);
    const t = 0.1 * S;
    const hx = size.x / 2;
    const hz = size.z / 2;
    add({
      kind: 'freezer',
      model: 'mm/freezer',
      pos: v(x, 0, fz),
      yaw: 0,
      scale: uni,
      size,
      occluder: true,
      colliders: [
        aabb(x - hx, 0, fz - hz, x + hx, t, fz + hz),
        aabb(x - hx, 0, fz - hz, x - hx + t, size.y, fz + hz),
        aabb(x + hx - t, 0, fz - hz, x + hx, size.y, fz + hz),
        aabb(x - hx, 0, fz - hz, x + hx, size.y, fz - hz + t),
        aabb(x - hx, 0, fz + hz - t, x + hx, size.y, fz + hz),
      ],
    });
  });
  // 立型の冷凍ケース：北の壁ぞい（南向き）・東の壁ぞい（西向き＝飲料の冷蔵）・西の壁ぞい（東向き）。
  // このモデルはガラス戸がローカルの +z 側にある（向きを yaw で店の内側へ向ける。round2 までは壁を向いていて、灰色の箱に見えた）。
  // 北の列は平台の冷凍ケースの裏の通路の東の口をふさがないよう、東へ寄せる（round3 D5：追われて逃げ込むと行き止まりだった）
  const standing = modelSize('mm/freezers-standing', uni);
  STANDING_NORTH_XS.forEach((x) => addModel('freezer-standing', 'mm/freezers-standing', x, BOUNDS.z0 + standing.z / 2, 0, { occluder: true }));
  [-6.6, -4.3, -2.0, 0.3].forEach((z) => addModel('freezer-standing', 'mm/freezers-standing', BOUNDS.x1 - standing.z / 2, z, -HALF_PI, { occluder: true }));
  [-5.0, -2.7].forEach((z) => addModel('freezer-standing', 'mm/freezers-standing', BOUNDS.x0 + standing.z / 2, z, HALF_PI, { occluder: true }));

  // パン売り場と試食台（北東の角）
  for (const z of [-12.9, -11.2]) {
    // パンの台の当たり判定は、パンが載る面（モデルの高さ0.227）までの台だけ
    const f = addModel('bread-display', 'mm/display-bread', 17.3, z, HALF_PI, { occluder: true, solid: false });
    f.colliders.push(worldBox(f.pos, f.yaw, v(-f.size.x / 2, 0, -f.size.z / 2), v(f.size.x / 2, 0.227 * S, f.size.z / 2)));
  }
  const sampleTable = addCode('sample-table', 'pc/sample-table', 15.0, -9.7, v(1.2, 0.9, 0.7), { tint: 'wood' });

  // 青果（西）：果物の台4つとバナナの台
  for (const [x, z] of [[-15.6, -2.8], [-13.0, -2.8], [-15.6, 0.2], [-13.0, 0.2]] as const) addModel('fruit-display', 'mm/display-fruit', x, z, 0);
  const bananaTable = addCode('banana-table', 'pc/banana-table', -14.3, -6.3, v(1.6, 0.8, 1.0), { tint: 'green' });

  // 放送ブース（北西の角）：南と東に間仕切り、机とマイク
  addCode('booth-wall', 'pc/booth-wall', -16.8, -10.65, v(2.4, 2.0, 0.2), { occluder: true, tint: 'booth' });
  addCode('booth-wall', 'pc/booth-wall', -14.2, -12.95, v(0.2, 2.0, 2.1), { occluder: true, tint: 'booth' });
  addCode('booth-desk', 'pc/booth-desk', -16.4, -13.4, v(1.5, 0.75, 0.7), { tint: 'wood' });
  addCode('mic', 'pc/mic', -16.4, -13.15, v(0.2, 0.45, 0.2), { solid: false, y: 0.75 });

  // 手前：缶ピラミッドの特売台・スイカのワゴン・レジ・サービスカウンター
  const saleTable = addCode('sale-table', 'pc/sale-table', 3.5, 3.6, v(2.9, 0.45, 1.0), { tint: 'red' });
  const wagonPos = v(8.5, 0, 3.7);
  const wagonSize = v(1.9, 0.7, 1.32);
  const rim = (x0: number, z0: number, x1: number, z1: number): Box3 => aabb(wagonPos.x + x0, wagonSize.y, wagonPos.z + z0, wagonPos.x + x1, wagonSize.y + 0.16, wagonPos.z + z1);
  const hx = wagonSize.x / 2;
  const hz = wagonSize.z / 2;
  const wagon = add({
    kind: 'wagon',
    model: 'pc/wagon',
    pos: wagonPos,
    yaw: 0,
    scale: v(1, 1, 1),
    size: wagonSize,
    tint: 'green',
    colliders: [
      solidBox(wagonPos, 0, wagonSize),
      // スイカが転げ落ちないよう低い縁
      rim(-hx, -hz, hx, -hz + 0.06),
      rim(-hx, hz - 0.06, hx, hz),
      rim(-hx, -hz, -hx + 0.06, hz),
      rim(hx - 0.06, -hz, hx, hz),
    ],
  });
  for (const x of [7.5, 11.0, 14.5]) {
    addModel('register', 'mm/cash-register', x, 8.4, 0, { occluder: true });
    addCode('conveyor', 'pc/conveyor', x - 1.3, 8.4, v(0.55, 0.85, 1.9), { occluder: true, tint: 'conveyor' });
  }
  const counter = addCode('counter', 'pc/counter', -0.6, 10.9, v(3.6, 1.0, 1.0), { occluder: true, tint: 'blue' });
  addCode('bell', 'pc/bell', -0.6, 10.62, v(0.3, 0.22, 0.3), { solid: false, y: 1.0 });
  addModel('bottle-return', 'mm/bottle-return', -6.5, BOUNDS.z1 - 0.7, Math.PI);
  addModel('bottle-return', 'mm/bottle-return', -7.7, BOUNDS.z1 - 0.7, Math.PI);

  // 壁：北・東・西は背の高さ、南（カメラ側）は腰の高さまで下げる。出入口（x 2〜6）は枠だけ残す
  const wallT = 0.3 * S;
  /** 辺の長さにぴったり収まるよう、壁の1枚の幅を少し伸び縮みさせる */
  const span = (from: number, to: number): { c: number; w: number }[] => {
    const n = Math.max(1, Math.round((to - from) / S));
    const w = (to - from) / n;
    return Array.from({ length: n }, (_, i) => ({ c: from + w * (i + 0.5), w }));
  };
  span(BOUNDS.x0, BOUNDS.x1).forEach(({ c, w }, i) => {
    const model = Math.abs(c - -12.0) < 1.2 ? 'mm/wall-door-rotate' : i % 3 === 1 ? 'mm/wall-window' : 'mm/wall';
    addModel('wall', model, c, BOUNDS.z0 - wallT, 0, { solid: false, occluder: true, scale: v(w, S, S) });
  });
  for (const side of [-1, 1] as const) {
    span(BOUNDS.z0, BOUNDS.z1).forEach(({ c, w }) => addModel('wall', 'mm/wall', side < 0 ? BOUNDS.x0 - wallT : BOUNDS.x1 + wallT, c, HALF_PI, { solid: false, occluder: true, scale: v(w, S, S) }));
  }
  for (const { c, w } of [...span(BOUNDS.x0, 2), ...span(6, BOUNDS.x1)]) {
    addModel('wall', 'mm/wall', c, BOUNDS.z1 + wallT, Math.PI, { solid: false, scale: v(w, 1.0, S) });
  }
  addCode('door-post', 'pc/door-post', 2 - 0.2, BOUNDS.z1 + 0.25, v(0.4, 2.6, 0.5), { tint: 'white' });
  addCode('door-post', 'pc/door-post', 6 + 0.2, BOUNDS.z1 + 0.25, v(0.4, 2.6, 0.5), { tint: 'white' });
  addCode('lintel', 'pc/lintel', 4, BOUNDS.z1 + 0.25, v(4.8, 0.5, 0.5), { solid: false, y: 2.6, tint: 'red' });
  // 壁の当たり判定は辺ごとに1つの厚い箱（出入口は自動ドアが閉まっている扱いで通さない）
  const wallFixture = fixtures.find((f) => f.kind === 'wall')!;
  wallFixture.colliders.push(
    aabb(BOUNDS.x0 - 2, 0, BOUNDS.z0 - 2, BOUNDS.x1 + 2, 3, BOUNDS.z0),
    aabb(BOUNDS.x0 - 2, 0, BOUNDS.z1, BOUNDS.x1 + 2, 3, BOUNDS.z1 + 2),
    aabb(BOUNDS.x0 - 2, 0, BOUNDS.z0, BOUNDS.x0, 3, BOUNDS.z1),
    aabb(BOUNDS.x1, 0, BOUNDS.z0, BOUNDS.x1 + 2, 3, BOUNDS.z1),
  );

  // 照明（光らせるだけ。光源にはしない）。天井は描かないので、宙に浮く灯具は置かず、北・東・西の壁の上端に光る帯を回す
  // （第1波の吊り下げ灯具は、上から見ると浮いた白い板に見え、通路の視界をさえぎった）
  const bandY = 1.86;
  addCode('light', 'pc/light-band', 0, BOUNDS.z0 + 0.06, v(BOUNDS.x1 - BOUNDS.x0, 0.16, 0.12), { solid: false, y: bandY });
  for (const side of [-1, 1] as const) {
    addCode('light', 'pc/light-band', side < 0 ? BOUNDS.x0 + 0.06 : BOUNDS.x1 - 0.06, 0, v(BOUNDS.z1 - BOUNDS.z0 - 1, 0.16, 0.12), { solid: false, y: bandY, yaw: HALF_PI });
  }

  // ───────── 札 ─────────
  const sign = (misdeed: MisdeedId, pos: Vec3, w: number, h: number, pole = false): void => {
    signs.push({ text: MISDEEDS.find((m) => m.id === misdeed)!.sign, pos, w, h, style: 'notice', misdeed, pole });
  };
  sign('bell', v(-1.85, 1.38, 11.1), 1.3, 0.62);
  sign('cart', v(8.75, 1.75, 13.35), 1.9, 0.62, true);
  sign('pyramid', v(saleTable.pos.x, 0.25, saleTable.pos.z + 0.52), 2.2, 0.36);
  sign('bowling', v(wagon.pos.x, 0.38, wagon.pos.z + 0.57), 1.4, 0.4);
  sign('samples', v(sampleTable.pos.x, 0.5, sampleTable.pos.z + 0.37), 1.1, 0.42);
  sign('freezer', v(1.0, 1.35, fz + 0.9), 2.0, 0.55, true);
  sign('tantrum', v(-6.5, 2.55, -3.5), 2.3, 0.6);
  sign('banana', v(bananaTable.pos.x, 0.45, bananaTable.pos.z + 0.52), 1.5, 0.42);
  sign('pa', v(-16.8, 1.45, -10.53), 2.0, 0.6);
  sign('sweep', v(-4, 2.12, ROW_Z1 + SHELF.endDepth + 0.02), 1.7, 0.5);
  sign('sweep', v(6, 2.12, ROW_Z1 + SHELF.endDepth + 0.02), 1.7, 0.5);
  // 通路の名前（南の口と北の口の上に吊る。カメラは北を向くので、札はすべて南に向ける）
  ROW_XS.slice(0, 4).forEach((rx, i) => {
    const aisle = ROW_AISLES[i]![1];
    const ax = rx + 2.5;
    signs.push({ text: AISLE_NAMES[aisle], sub: `${'ABCD'[i]}通路`, pos: v(ax, 2.9, ROW_Z1 + 0.6), w: 2.0, h: 0.62, style: 'aisle' });
    signs.push({ text: AISLE_NAMES[aisle], pos: v(ax, 2.9, SHELF.z0 - 1.5), w: 1.8, h: 0.55, style: 'aisle' });
  });
  signs.push({ text: '青果', pos: v(-14.3, 2.9, -8.4), w: 1.6, h: 0.6, style: 'aisle' });
  signs.push({ text: 'パン', pos: v(16.2, 2.9, -9.0), w: 1.4, h: 0.6, style: 'aisle' });
  signs.push({ text: '冷凍食品', pos: v(1.0, 2.9, fz - 1.0), w: 2.2, h: 0.6, style: 'aisle' });
  signs.push({ text: 'レジ', pos: v(11.0, 2.9, 7.0), w: 1.5, h: 0.6, style: 'aisle' });
  signs.push({ text: 'サービスカウンター', pos: v(counter.pos.x, 2.5, counter.pos.z + 0.4), w: 2.8, h: 0.5, style: 'aisle' });
  signs.push({ text: 'スーパーきちんと堂', sub: 'いつもきちんと営業中', pos: v(4, 2.85, BOUNDS.z1 + 0.52), w: 4.4, h: 0.5, style: 'store' });
  signs.push({ text: '特売', sub: '缶詰よりどり', pos: v(saleTable.pos.x + 1.9, 1.1, saleTable.pos.z + 0.2), w: 0.9, h: 0.7, style: 'pop', pole: true });
  signs.push({ text: '本日のおすすめ', sub: 'スイカ 1玉 980円', pos: v(wagon.pos.x - 1.3, 1.15, wagon.pos.z + 0.2), w: 1.1, h: 0.7, style: 'pop', pole: true });
  // 値札（棚板の手前。通路側を向く）
  for (const f of fixtures) {
    if (f.kind !== 'shelf') continue;
    for (const face of f.faces) {
      for (const lv of SHELF.levels) {
        signs.push({ text: PRICES[(f.id * 7 + Math.round(lv * 10) + face.id) % PRICES.length]!, pos: v(face.x + face.nx * 0.02, lv - 0.06, face.z + 0.45), w: 0.34, h: 0.12, style: 'price', yaw: face.nx > 0 ? HALF_PI : -HALF_PI });
      }
    }
  }

  const places: Record<PlaceId, Place> = {
    bell: { x: counter.pos.x, z: counter.pos.z - counter.size.z / 2 - 0.62, r: BELL.range, yaw: 0 },
    carts: { x: 8.75, z: 11.6, r: 2.6, yaw: Math.PI },
    pyramid: { x: saleTable.pos.x, z: saleTable.pos.z + 1.35, r: PYRAMID.promptRange, yaw: Math.PI },
    wagon: { x: wagon.pos.x, z: wagon.pos.z + 1.2, r: 1.5, yaw: Math.PI },
    lane: { x: 8.5, z: 0.5, r: 1.6, yaw: Math.PI },
    pins: { x: 8.5, z: -7.0, r: 1.5, yaw: Math.PI },
    samples: { x: sampleTable.pos.x, z: sampleTable.pos.z + 1.0, r: 1.4, yaw: Math.PI },
    pa: { x: -16.4, z: -12.5, r: 1.2, yaw: Math.PI },
    freezer: { x: 1.0, z: fz, r: 3.8, yaw: Math.PI },
    banana: { x: bananaTable.pos.x, z: bananaTable.pos.z + 1.1, r: 1.4, yaw: Math.PI },
    tantrum: { x: -6.5, z: -3.4, r: 4.6, yaw: Math.PI },
    service: { x: counter.pos.x - 2.6, z: counter.pos.z - 1.3, r: 1.2, yaw: Math.PI },
    staffDoor: { x: -12.0, z: BOUNDS.z0 + 0.9, r: 1.0, yaw: 0 },
    entrance: { x: 4, z: 12.9, r: 1.5, yaw: Math.PI },
  };

  return {
    bounds: BOUNDS,
    fixtures,
    faces,
    signs,
    places,
    zones: {
      snackAisle: { x0: -9 + SHELF.boardHalf, z0: SHELF.z0, x1: -4 - SHELF.boardHalf, z1: ROW_Z1 },
      frontPlaza: { x0: BOUNDS.x0 + 1, z0: 3, x1: BOUNDS.x1 - 1, z1: 7 },
    },
    spawns: [2.7, 5.3, 3.6, 4.4].map((x) => ({ x, z: SPAWN_Z, yaw: Math.PI })),
    patrols: [
      [
        { x: -12.0, z: -9.6 },
        { x: -12.0, z: 2.6 },
        { x: -2.5, z: 2.6 },
        { x: -1.5, z: -9.6 },
      ],
      [
        { x: 3.5, z: -9.6 },
        { x: 13.8, z: -9.6 },
        { x: 13.8, z: 2.6 },
        { x: 8.5, z: 1.9 },
      ],
      [
        { x: -10.0, z: 5.5 },
        { x: 14.0, z: 5.5 },
        { x: 16.0, z: -8.5 },
        { x: -16.0, z: -8.5 },
      ],
    ],
    wanderPoints: [
      { x: -14.3, z: -4.5 },
      { x: -6.5, z: -6.0 },
      { x: -1.5, z: -2.0 },
      { x: 3.5, z: -5.0 },
      { x: 13.8, z: -3.0 },
      { x: 15.0, z: -8.6 },
      { x: 1.0, z: -9.9 },
      { x: -10.0, z: 5.0 },
      { x: 12.0, z: 5.5 },
    ],
    rowXs: ROW_XS,
    pyramidBase: { x: saleTable.pos.x, z: saleTable.pos.z, y: saleTable.size.y },
  };
}

const PRICES = ['98円', '128円', '158円', '198円', '238円', '298円', '特価88円', '本日限り', '2つで300円'];

// ───────── 商品とカート（seed から決まる） ─────────

/**
 * 置く物と、その下の面とのすき間。物は眠らせたまま置き（Simulation が最初の1刻みを重力なしで回してから眠らせる）、
 * 起きたときに落ちる高さを小さくしておく（崩れる前に揺れたり沈んだりしないように）
 */
const GAP = 0.001;

/** 動く商品の数の目安（docs/04「重さの予算」） */
export const PROP_BUDGET = 360;

function pushProp(props: PropDef[], itemId: string, kind: PropKind, pos: Vec3, yaw: number, fixtureId: number | null): void {
  const item = ITEMS[itemId];
  if (!item) throw new Error(`unknown item ${itemId}`);
  const r = resolveItem(item);
  props.push({ id: props.length, kind, model: r.model, scale: r.scale, shape: r.shape, size: r.size, mass: r.mass, home: { pos, yaw }, fixtureId });
}

/**
 * 試合の商品とカートを決める。同じ seed なら必ず同じものになる（部屋の主と参加者が別々に作っても一致する）。
 * 並びの順：棚の商品 → 端の棚 → パン → 缶ピラミッド → スイカ → ピン → バナナ → カゴ。あとから足す物は末尾へ（既存の番号を変えない）。
 */
export function buildWorldStatic(seed: number): WorldStatic {
  const layout = storeLayout();
  const rng = streamRng(seed, 'props');
  const props: PropDef[] = [];
  const [l0, l1] = SHELF.levels;

  for (const f of layout.fixtures) {
    if (f.kind !== 'shelf') continue;
    for (const face of f.faces) {
      const set = ASSORTMENT[face.aisle];
      [l0, l1].forEach((levelY, li) => {
        const itemId = rng.pick(li === 0 ? set.lower : set.upper);
        const item = ITEMS[itemId]!;
        const r = resolveItem(item);
        // 面に沿う向き＝ワールドの z。品物は通路（法線の向き）に正面を向ける（turn の品は90度回して広い面を向ける）
        const along = item.turn ? r.size.z : r.size.x;
        const depth = item.turn ? r.size.x : r.size.z;
        const usable = SHELF.len - 0.24;
        const outer = (face.nx < 0 && f.pos.x === ROW_XS[0]) || (face.nx > 0 && f.pos.x === ROW_XS[ROW_XS.length - 1]);
        const n = Math.max(1, Math.min(outer ? 2 : MAX_PER_LEVEL, Math.floor((usable + 0.06) / (along + 0.06))));
        const step = usable / n;
        // 仕切りと板の端の間の真ん中に置く。奥行きの大きい物は仕切りに寄せる
        const off = Math.max(SHELF.dividerHalf + 0.03 + depth / 2, Math.min((SHELF.dividerHalf + SHELF.boardHalf) / 2, SHELF.boardHalf + 0.04 - depth / 2));
        for (let i = 0; i < n; i++) {
          const jitter = Math.min(0.05, Math.max(0, (step - along) / 2 - 0.01));
          const z = face.z - usable / 2 + step * (i + 0.5) + rng.range(-jitter, jitter);
          const x = f.pos.x + face.nx * off;
          const yaw = (face.nx > 0 ? HALF_PI : -HALF_PI) + (item.turn ? HALF_PI : 0) + rng.range(-0.12, 0.12);
          pushProp(props, itemId, 'product', v(x, levelY + GAP, z), yaw, f.id);
        }
      });
    }
  }

  // 端の棚：その通路の目玉を2個ずつ2段。北の端（北を向く）は下の段を空ける：カメラはいつも南から北を向くので
  // 北の端の下の段は見えず、動く商品の予算（約350個）を見える棚に回すため（round3 D1 で通路の商品を細身にして数が増えた）
  for (const f of layout.fixtures) {
    if (f.kind !== 'shelf-end' || !f.aisle) continue;
    const face = f.faces[0]!;
    END_ITEMS[f.aisle].forEach((itemId, li) => {
      if (li === 0 && face.nz < 0) return;
      const levelY = li === 0 ? l0 : l1;
      const item = ITEMS[itemId]!;
      const r = resolveItem(item);
      const backZ = f.pos.z - face.nz * (SHELF.endDepth / 2);
      const z = backZ + face.nz * (0.18 + (item.turn ? r.size.x : r.size.z) / 2);
      for (const dx of [-0.42, 0.42]) {
        pushProp(props, itemId, 'product', v(f.pos.x + dx + rng.range(-0.04, 0.04), levelY + GAP, z), (face.nz > 0 ? 0 : Math.PI) + (item.turn ? HALF_PI : 0) + rng.range(-0.15, 0.15), f.id);
      }
    });
  }

  // パンの台：モデルの子ノード（bread）の位置に置く
  for (const f of layout.fixtures) {
    if (f.kind !== 'bread-display') continue;
    for (const lx of [-0.144 * S, 0.144 * S]) {
      const [dx, dz] = rotateXZ(lx, 0.027 * S, f.yaw);
      pushProp(props, 'bread', 'product', v(f.pos.x + dx, 0.227 * S + GAP, f.pos.z + dz), f.yaw, f.id);
    }
  }

  // 缶ピラミッド：下から8・7・6・5・4の30個を、1列の壁のように積む
  const sale = layout.fixtures.find((f) => f.kind === 'sale-table')!;
  const can = resolveItem(ITEMS['pyramid-can']!);
  const spacing = can.size.x + 0.006;
  PYRAMID.rows.forEach((n, layer) => {
    for (let i = 0; i < n; i++) {
      const x = sale.pos.x + (i - (n - 1) / 2) * spacing;
      pushProp(props, 'pyramid-can', 'can', v(x, sale.size.y + layer * (can.size.y + GAP) + GAP, sale.pos.z), 0, sale.id);
    }
  });

  // スイカのワゴン（6玉）
  const wagon = layout.fixtures.find((f) => f.kind === 'wagon')!;
  const melon = resolveItem(ITEMS.watermelon!);
  for (let i = 0; i < 6; i++) {
    const x = wagon.pos.x + ((i % 3) - 1) * (melon.size.x + 0.02);
    const z = wagon.pos.z + (i < 3 ? -1 : 1) * (melon.size.z / 2 + 0.01);
    pushProp(props, 'watermelon', 'watermelon', v(x, wagon.size.y + GAP, z), rng.range(0, Math.PI * 2), wagon.id);
  }

  // ボウリングのピン（トイレットペーパー10個。日用品の通路の奥に三角）
  const pins = layout.places.pins;
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i <= row; i++) {
      pushProp(props, 'pin', 'pin', v(pins.x + (i - row / 2) * 0.43, GAP, pins.z + 0.6 - row * 0.4), 0, null);
    }
  }

  // バナナ（台の上に6房）
  const bananaTable = layout.fixtures.find((f) => f.kind === 'banana-table')!;
  for (let i = 0; i < 6; i++) {
    const x = bananaTable.pos.x + ((i % 3) - 1) * 0.34;
    const z = bananaTable.pos.z + (i < 3 ? -0.27 : 0.27);
    pushProp(props, 'banana', 'banana', v(x, bananaTable.size.y + GAP, z), rng.range(-0.15, 0.15), bananaTable.id);
  }

  // 入口のカゴ（3つ積む。当たり判定は箱なので入れ子にはせず、上に重ねる）
  const basket = resolveItem(ITEMS.basket!);
  for (let i = 0; i < 3; i++) pushProp(props, 'basket', 'basket', v(6.9, i * (basket.size.y + GAP) + GAP, 13.2), 0, null);

  // カート置き場：西（店の入口の広場）を向けて2列×3段。北はレジの列なので、北向きに置くと乗ってすぐレジに当たる（round3 の C2）
  const carts: CartDef[] = [];
  for (let i = 0; i < CART.count; i++) {
    const x = 8.0 + (i % 2) * 1.5;
    const z = 10.6 + Math.floor(i / 2) * 0.9;
    carts.push({ id: i, home: { pos: v(x, 0, z), yaw: -Math.PI / 2 } });
  }
  return { seed, props, carts };
}

/** 商品が置かれていた面（なぎ払いの対象を探すのに使う）。床置きなどは null */
export function faceOfProp(prop: PropDef): ShelfFace | null {
  if (prop.fixtureId === null) return null;
  const f = storeLayout().fixtures[prop.fixtureId];
  if (!f || f.faces.length === 0) return null;
  if (f.faces.length === 1) return f.faces[0]!;
  let best: ShelfFace | null = null;
  let bestD = Infinity;
  for (const face of f.faces) {
    const d = (prop.home.pos.x - face.x) * face.nx + (prop.home.pos.z - face.z) * face.nz;
    // 面の内側（法線と逆向き）にある物ほど近い
    const score = Math.abs(d);
    if ((prop.home.pos.x - f.pos.x) * face.nx + (prop.home.pos.z - f.pos.z) * face.nz > 0 && score < bestD) {
      best = face;
      bestD = score;
    }
  }
  return best;
}
