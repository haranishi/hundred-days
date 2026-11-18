/**
 * 店の作り込み（round3・round4 dress）。動かない飾りを、頂点の色の形1つと、文字の絵（アトラス）を貼った形1つにまとめて描く（描画は2回だけ）。
 * - D1 通路の色：棚の背板・上の帯・値札のレールと、端の棚の上の札を通路の色で塗る（商品の色は productLook.ts）。遠目で札なしでも通路がわかるように
 * - D2 壁ぎわのケース：立型冷凍ケースのガラス戸の中に商品と棚板、値札の帯、ガラスの照り、上に売り場の名前（ケースごとに中身を変える）
 * - D3 店の外：歩道の敷石と縁石、入口のマット、植え込み、のぼり旗（「本日特売」）
 * - H1〜H3（壁・奥の看板・レジ）は decor.ts
 * 置き場所は store.ts の置き物と壁の位置から決める（店の地図が変わっても付いてくる）。当たり判定は持たない（見た目だけ）。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHELF, type AisleId, type Fixture, type StoreLayout } from '../../shared/layout/store';
import { RENDER } from '../../shared/rules/tuning';
import { DecalAtlas, fitText, type Cell } from './atlas';
import { decorCells, decorDecals, decorSolid } from './decor';
import { box, cyl, floorQuad, glint as glintShape, hash01, paint, place, type G } from './dressGeo';
import { PALETTE } from './palette';
import { applyXray } from './xray';

const S = RENDER.modelScale;

/** 通路の色：背板（淡い色）と上の帯・端の札（濃い色）。商品の主役の色と合わせる */
const AISLE_COLORS: Record<AisleId, { panel: string; band: string }> = {
  snack: { panel: PALETTE.aisleSnackPanel, band: PALETTE.aisleSnackBand },
  drink: { panel: PALETTE.aisleDrinkPanel, band: PALETTE.blue },
  canned: { panel: PALETTE.aisleCannedPanel, band: PALETTE.red },
  daily: { panel: PALETTE.aisleDailyPanel, band: PALETTE.aisleDailyBand },
  breakfast: { panel: PALETTE.aisleBreakfastPanel, band: PALETTE.aisleBreakfastBand },
  veg: { panel: PALETTE.aisleVegPanel, band: PALETTE.green },
};

/** ガラスの照り（白） */
function glint(cx: number, y0: number, y1: number, width: number, slant: number, z: number): G {
  return glintShape(cx, y0, y1, width, slant, z, PALETTE.caseGlint);
}

// ───────── D1：棚の背板・上の帯・端の札 ─────────

function shelfParts(layout: StoreLayout): G[] {
  const out: G[] = [];
  const top = 0.75 * S; // 仕切りの面の上端（モデルの単位で 0.75）
  const off = SHELF.dividerHalf + 0.006;
  for (const f of layout.fixtures) {
    if (f.kind !== 'shelf') continue;
    for (const face of f.faces) {
      const c = AISLE_COLORS[face.aisle];
      const x = f.pos.x + face.nx * off;
      const len = SHELF.len - 0.02;
      // 背板：下の段の板から仕切りの上端まで。上の帯：背板の上の端に濃い色
      const panel = box(0.012, top - SHELF.levels[0], len, x, SHELF.levels[0], f.pos.z, c.panel);
      const band = box(0.016, 0.26, len, x + face.nx * 0.003, top - 0.26, f.pos.z, c.band);
      out.push(panel, band);
      // 棚板の手前の縁（値札のレール）も通路の色に。値札（黄）はこの前に立つ
      const ex = face.x + face.nx * 0.008;
      for (const lv of SHELF.levels) out.push(box(0.012, 0.1, len, ex, lv - 0.1, f.pos.z, c.band));
    }
  }
  // 端の棚の上の緑の札（モデルの Group）を、通路の色の板で包む（表と裏の両方。北の端の札はカメラから裏側が見える）
  for (const f of layout.fixtures) {
    if (f.kind !== 'shelf-end' || !f.aisle) continue;
    const c = AISLE_COLORS[f.aisle];
    // ローカルの -z が端の棚の正面（外側）。札はモデルの単位で z=-0.2〜-0.1（中心から）・高さ 0.8〜1.05
    const plate = box(0.325 * 2 * S - 0.06, 0.25 * S - 0.06, 0.1 * S + 0.024, 0, 0.8 * S + 0.03, -0.15 * S, c.band);
    out.push(place(plate, f));
  }
  return out;
}

// ───────── D2：壁ぎわのケースの中身 ─────────

type CaseTheme = 'drinks' | 'frozen' | 'dairy';

type Good = { body: string; trim: string; shape: 'bottle' | 'can' | 'box' | 'cup' | 'carton' };

/**
 * 中に並べる品の色（品ごとに本体・ふたや帯の2色）。同じ壁のケースでも、1台ずつ品の組を変える
 * （round4：北の冷凍ケース4台が同じに見えた。アイス／冷凍野菜／冷凍食品／氷と魚、のように主役の色を変える）
 */
const CASE_SETS: Record<CaseTheme, Good[][]> = {
  drinks: [
    // 水・お茶
    [
      { body: PALETTE.goodsSky, trim: PALETTE.blue, shape: 'bottle' },
      { body: PALETTE.goodsMint, trim: PALETTE.green, shape: 'bottle' },
      { body: PALETTE.goodsTeal, trim: PALETTE.white, shape: 'bottle' },
    ],
    // ジュース
    [
      { body: PALETTE.goodsOrange, trim: PALETTE.white, shape: 'bottle' },
      { body: PALETTE.yellow, trim: PALETTE.metal, shape: 'can' },
      { body: PALETTE.goodsOrange, trim: PALETTE.metal, shape: 'can' },
    ],
    // 炭酸
    [
      { body: PALETTE.red, trim: PALETTE.metal, shape: 'can' },
      { body: PALETTE.blue, trim: PALETTE.metal, shape: 'can' },
      { body: PALETTE.goodsTeal, trim: PALETTE.white, shape: 'bottle' },
    ],
    // 乳飲料
    [
      { body: PALETTE.white, trim: PALETTE.blue, shape: 'carton' },
      { body: PALETTE.pastelPink, trim: PALETTE.white, shape: 'cup' },
      { body: PALETTE.goodsCream, trim: PALETTE.yellow, shape: 'carton' },
    ],
  ],
  frozen: [
    // アイス
    [
      { body: PALETTE.goodsPink, trim: PALETTE.white, shape: 'cup' },
      { body: PALETTE.pastelLemon, trim: PALETTE.woodDark, shape: 'cup' },
      { body: PALETTE.goodsChoco, trim: PALETTE.white, shape: 'cup' },
    ],
    // 冷凍野菜
    [
      { body: PALETTE.green, trim: PALETTE.white, shape: 'box' },
      { body: PALETTE.goodsMint, trim: PALETTE.green, shape: 'box' },
      { body: PALETTE.shrubDark, trim: PALETTE.yellow, shape: 'box' },
    ],
    // 冷凍食品（お弁当・ピザ）
    [
      { body: PALETTE.red, trim: PALETTE.yellow, shape: 'box' },
      { body: PALETTE.blue, trim: PALETTE.white, shape: 'box' },
      { body: PALETTE.goodsOrange, trim: PALETTE.red, shape: 'box' },
    ],
    // 氷・魚
    [
      { body: PALETTE.white, trim: PALETTE.blue, shape: 'box' },
      { body: PALETTE.goodsSky, trim: PALETTE.white, shape: 'box' },
      { body: PALETTE.pastelSky, trim: PALETTE.blue, shape: 'cup' },
    ],
  ],
  dairy: [
    // 牛乳
    [
      { body: PALETTE.white, trim: PALETTE.blue, shape: 'carton' },
      { body: PALETTE.white, trim: PALETTE.red, shape: 'carton' },
      { body: PALETTE.goodsCream, trim: PALETTE.yellow, shape: 'carton' },
    ],
    // ヨーグルト・チーズ
    [
      { body: PALETTE.pastelPink, trim: PALETTE.white, shape: 'cup' },
      { body: PALETTE.white, trim: PALETTE.green, shape: 'cup' },
      { body: PALETTE.yellow, trim: PALETTE.goodsCream, shape: 'box' },
    ],
  ],
};

const CASE_TITLES: Record<CaseTheme, string> = { drinks: 'つめたい飲み物', frozen: 'アイス・冷凍食品', dairy: '牛乳・乳製品' };

/** どの壁のケースか（東＝飲み物の冷蔵、北＝冷凍、西＝乳製品） */
function caseTheme(f: Fixture, layout: StoreLayout): CaseTheme {
  const b = layout.bounds;
  if (Math.abs(f.pos.x - b.x1) < 2) return 'drinks';
  if (Math.abs(f.pos.x - b.x0) < 2) return 'dairy';
  return 'frozen';
}

/** ケースの扉の中（ローカル：幅 x、正面 +z）。GLB を測った値：扉のガラスは x ±0.40・y 0.20〜0.80・奥の板 z=+0.20（モデルの単位） */
const DOOR = { half: 0.4 * S, mid: 0.035 * S, y0: 0.22 * S, y1: 0.79 * S, back: 0.2 * S, front: 0.25 * S };

function goodGeometry(kind: Good, x: number, y: number, z: number): G[] {
  switch (kind.shape) {
    case 'bottle':
      return [cyl(0.055, 0.2, x, y, z, kind.body, 7), cyl(0.058, 0.07, x, y + 0.07, z, kind.trim, 7), cyl(0.028, 0.06, x, y + 0.2, z, kind.trim, 6)];
    case 'can':
      return [cyl(0.05, 0.14, x, y, z, kind.body, 7), cyl(0.046, 0.015, x, y + 0.14, z, kind.trim, 7)];
    case 'cup':
      return [cyl(0.07, 0.1, x, y, z, kind.body, 8), cyl(0.074, 0.02, x, y + 0.1, z, kind.trim, 8)];
    case 'carton':
      return [box(0.11, 0.2, 0.09, x, y, z, kind.body), box(0.112, 0.05, 0.092, x, y + 0.09, z, kind.trim), box(0.08, 0.03, 0.05, x, y + 0.2, z, kind.body)];
    default:
      return [box(0.15, 0.2, 0.06, x, y, z, kind.body), box(0.152, 0.06, 0.062, x, y + 0.12, z, kind.trim)];
  }
}

function caseParts(layout: StoreLayout): G[] {
  const out: G[] = [];
  const seen: Record<CaseTheme, number> = { drinks: 0, frozen: 0, dairy: 0 };
  layout.fixtures
    .filter((f) => f.kind === 'freezer-standing')
    .forEach((f, ci) => {
      const theme = caseTheme(f, layout);
      const sets = CASE_SETS[theme];
      const goods = sets[seen[theme]++ % sets.length]!;
      const local: G[] = [];
      const shelvesY = [DOOR.y0 + 0.04, DOOR.y0 + 0.46, DOOR.y0 + 0.88];
      const zMid = DOOR.back + 0.045;
      for (const side of [-1, 1] as const) {
        const x0 = side < 0 ? -DOOR.half + 0.05 : DOOR.mid + 0.03;
        const x1 = side < 0 ? -DOOR.mid - 0.03 : DOOR.half - 0.05;
        const w = x1 - x0;
        shelvesY.forEach((sy, si) => {
          // 棚板と、その手前の値札の帯（黄色に赤い札）
          local.push(box(w, 0.025, 0.1, (x0 + x1) / 2, sy - 0.025, zMid, PALETTE.caseShelf));
          local.push(box(w, 0.035, 0.012, (x0 + x1) / 2, sy - 0.04, DOOR.front - 0.02, PALETTE.yellow));
          const n = 5;
          const step = w / n;
          for (let i = 0; i < n; i++) {
            const g = goods[Math.floor(hash01(ci * 31 + si, i + (side + 1) * 7) * goods.length)]!;
            const gx = x0 + step * (i + 0.5);
            local.push(...goodGeometry(g, gx, sy, zMid));
            if (i % 2 === 0) local.push(box(0.05, 0.022, 0.014, gx, sy - 0.034, DOOR.front - 0.018, PALETTE.red));
          }
        });
        // ガラスの照り（扉ごとに太い線と細い線を1本ずつ）
        const cx = (x0 + x1) / 2;
        local.push(glint(cx - w * 0.22, DOOR.y0 + 0.1, DOOR.y1 - 0.25, 0.07, 0.35, DOOR.front - 0.008));
        local.push(glint(cx + w * 0.05, DOOR.y0 + 0.25, DOOR.y1 - 0.12, 0.03, 0.35, DOOR.front - 0.008));
      }
      for (const g of local) out.push(place(g, f));
    });
  return out;
}

// ───────── D3：店の外 ─────────

/** 歩道の範囲（南の壁の外側から） */
function sidewalk(layout: StoreLayout): { x0: number; x1: number; z0: number; z1: number } {
  const b = layout.bounds;
  return { x0: b.x0 - 3, x1: b.x1 + 3, z0: b.z1 + 0.3 * 2 * S, z1: b.z1 + 0.3 * 2 * S + 4.2 };
}

/** 出入口（両側の柱の間） */
function doorway(layout: StoreLayout): { x0: number; x1: number } {
  const posts = layout.fixtures.filter((f) => f.kind === 'door-post').map((f) => f.pos.x);
  return { x0: Math.min(...posts) + 0.2, x1: Math.max(...posts) - 0.2 };
}

function outsideParts(layout: StoreLayout): G[] {
  const out: G[] = [];
  const sw = sidewalk(layout);
  const door = doorway(layout);
  // 目地の色の下地と、ずらして並べた敷石（半枚ずつずらす）
  out.push(floorQuad(sw.x0, sw.z0, sw.x1, sw.z1, 0.003, PALETTE.sidewalkGrout));
  const tile = 0.5;
  const gap = 0.04;
  const rows = Math.floor((sw.z1 - sw.z0) / tile);
  const colA = new THREE.Color(PALETTE.sidewalkA);
  const colB = new THREE.Color(PALETTE.sidewalkB);
  for (let r = 0; r < rows; r++) {
    const shift = r % 2 === 0 ? 0 : tile / 2;
    for (let x = sw.x0 - shift; x < sw.x1; x += tile) {
      const a = Math.max(sw.x0, x + gap / 2);
      const b2 = Math.min(sw.x1, x + tile - gap / 2);
      if (b2 - a < 0.05) continue;
      const z = sw.z0 + r * tile;
      const c = hash01(Math.round(x * 10), r) < 0.3 ? colB : colA;
      out.push(floorQuad(a, z + gap / 2, b2, z + tile - gap / 2, 0.006, c));
    }
  }
  // 縁石（歩道の外側）
  out.push(box(sw.x1 - sw.x0, 0.12, 0.3, (sw.x0 + sw.x1) / 2, 0, sw.z1 + 0.15, PALETTE.curb));
  // 出入口の床（自動ドアの敷居）と、外の灰色のマット
  out.push(floorQuad(door.x0, layout.bounds.z1 - 0.02, door.x1, sw.z0, 0.009, PALETTE.metal));
  out.push(floorQuad(door.x0 + 0.3, sw.z0 + 0.15, door.x1 - 0.3, sw.z0 + 1.15, 0.009, PALETTE.metalDark));
  // 自動ドア（閉まっている。枠と取っ手とガラスの照りだけで、中が見えるようにする）
  const dz = layout.bounds.z1 + 0.12;
  const dw = (door.x1 - door.x0) / 2;
  for (const side of [0, 1]) {
    const x0 = door.x0 + side * dw;
    const cx = x0 + dw / 2;
    out.push(box(0.07, 2.35, 0.06, x0 + 0.035, 0, dz, PALETTE.metal), box(0.07, 2.35, 0.06, x0 + dw - 0.035, 0, dz, PALETTE.metal));
    out.push(box(dw, 0.08, 0.06, cx, 0, dz, PALETTE.metal), box(dw, 0.08, 0.06, cx, 2.27, dz, PALETTE.metal));
    out.push(box(0.05, 0.5, 0.05, side === 0 ? x0 + dw - 0.16 : x0 + 0.16, 0.85, dz + 0.05, PALETTE.metalDark));
    out.push(glint(cx - dw * 0.2, 1.45, 2.1, 0.08, 0.3, dz + 0.035), glint(cx + dw * 0.05, 1.65, 2.15, 0.035, 0.3, dz + 0.035));
  }
  // 植え込み：南の壁の外に、木の箱と丸い緑
  const planters: number[] = [];
  for (let x = layout.bounds.x0 + 2; x < door.x0 - 2.5; x += 3.4) planters.push(x);
  for (let x = door.x1 + 3.2; x < layout.bounds.x1 - 1.5; x += 3.4) planters.push(x);
  const pz = sw.z0 + 0.45;
  planters.forEach((x, i) => {
    out.push(box(1.8, 0.42, 0.6, x, 0, pz, PALETTE.planter));
    out.push(box(1.84, 0.06, 0.64, x, 0.42, pz, PALETTE.woodDark));
    for (let k = 0; k < 3; k++) {
      const s = new THREE.SphereGeometry(0.34 + hash01(i, k) * 0.08, 8, 6);
      s.scale(1, 0.8, 1);
      s.translate(x - 0.55 + k * 0.55, 0.62, pz);
      out.push(paint(s, k % 2 === 0 ? PALETTE.shrub : PALETTE.shrubDark));
    }
  });
  // のぼり旗の支柱と台（布は文字の絵の形の方）
  for (const fl of flags(layout)) {
    out.push(cyl(0.035, FLAG.poleH, fl.x, 0, fl.z, PALETTE.white, 8));
    out.push(cyl(0.2, 0.16, fl.x, 0, fl.z, PALETTE.metalDark, 10));
    out.push(box(FLAG.w + 0.06, 0.03, 0.03, fl.x + FLAG.w / 2, FLAG.top, fl.z, PALETTE.white));
  }
  return out;
}

/** のぼり旗（布の大きさと置き場所）。出入口の両わきの歩道に2本ずつ */
const FLAG = { w: 0.62, h: 1.9, top: 2.85, poleH: 2.95 };
function flags(layout: StoreLayout): { x: number; z: number; design: number }[] {
  const door = doorway(layout);
  const z = sidewalk(layout).z0 + 1.25;
  return [
    { x: door.x0 - 2.3, z, design: 0 },
    { x: door.x0 - 1.2, z, design: 1 },
    { x: door.x1 + 0.5, z, design: 0 },
    { x: door.x1 + 1.6, z, design: 1 },
  ];
}

// ───────── 文字の絵（のぼり旗・ケースの名前・入口のマット。壁・奥・レジの絵は decor.ts） ─────────

/** 2048 角に、背の高い絵から順に詰める（atlas.ts）。足りなければ組み立てで止まる */
const ATLAS = 2048;

function drawFlag(g: CanvasRenderingContext2D, c: Cell, d: { bg: string; fg: string; edge: string }): void {
  g.fillStyle = d.bg;
  g.fillRect(c.x, c.y, c.w, c.h);
  g.fillStyle = PALETTE.white;
  g.fillRect(c.x, c.y, c.w, 22);
  g.fillRect(c.x, c.y, 14, c.h);
  g.fillStyle = d.edge;
  g.fillRect(c.x + c.w - 12, c.y + 22, 12, c.h - 22);
  ['本', '日', '特', '売'].forEach((ch, k) => fitText(g, ch, c.w, 96, c.x + c.w / 2 + 2, c.y + 84 + k * 104, d.fg));
}

function decalParts(layout: StoreLayout): { geometry: G; texture: THREE.CanvasTexture } {
  const atlas = new DecalAtlas(ATLAS);
  // のぼり旗（2種類）：縦書きの「本日特売」。赤地に白、黄地に赤。上と横に白い袖
  const flagCells = [
    { bg: PALETTE.red, fg: PALETTE.white, edge: PALETTE.yellow },
    { bg: PALETTE.yellow, fg: PALETTE.red, edge: PALETTE.red },
  ].map((d) => atlas.cell(160, 500, (g, c) => drawFlag(g, c, d)));
  const decor = decorCells(atlas);
  // 入口のマット：青地に白い文字
  const matCell = atlas.cell(640, 200, (g, c) => {
    g.fillStyle = PALETTE.matEdge;
    g.fillRect(c.x, c.y, c.w, c.h);
    g.fillStyle = PALETTE.mat;
    g.fillRect(c.x + 14, c.y + 14, c.w - 28, c.h - 28);
    fitText(g, 'いらっしゃいませ', c.w - 80, 96, c.x + c.w / 2, c.y + c.h / 2 + 4, PALETTE.white);
  });
  // ケースの上の売り場の名前
  const themes: CaseTheme[] = ['drinks', 'frozen', 'dairy'];
  const header = {} as Record<CaseTheme, Cell>;
  for (const t of themes) {
    header[t] = atlas.cell(800, 80, (g, c) => {
      g.fillStyle = t === 'frozen' ? PALETTE.blue : t === 'drinks' ? PALETTE.caseHeaderDrinks : PALETTE.green;
      g.fillRect(c.x, c.y, c.w, c.h);
      g.fillStyle = PALETTE.white;
      g.fillRect(c.x, c.y + c.h - 8, c.w, 8);
      fitText(g, CASE_TITLES[t], c.w - 60, 56, c.x + c.w / 2, c.y + c.h / 2 - 2, PALETTE.white);
    });
  }
  const out: G[] = [];
  // のぼり旗の布（両面に見えるよう、表と裏を貼る）
  for (const fl of flags(layout)) {
    for (const back of [false, true]) {
      const g = atlas.decal(FLAG.w, FLAG.h, flagCells[fl.design]!);
      if (back) g.rotateY(Math.PI);
      g.translate(fl.x + FLAG.w / 2 + 0.04, FLAG.top - FLAG.h / 2 - 0.02, fl.z + (back ? -0.004 : 0.004));
      out.push(g);
    }
  }
  // 入口のマット（店の中、出入口の手前の床）
  const door = doorway(layout);
  const mw = Math.min(3.4, door.x1 - door.x0);
  const mat = atlas.decal(mw, mw * (matCell.h / matCell.w), matCell);
  mat.rotateX(-Math.PI / 2);
  mat.translate((door.x0 + door.x1) / 2, 0.01, layout.bounds.z1 - 0.75);
  out.push(mat);
  // ケースの上の売り場の名前（扉の上の縁の正面）
  for (const f of layout.fixtures) {
    if (f.kind !== 'freezer-standing') continue;
    const g = atlas.decal(1.9, 0.19, header[caseTheme(f, layout)]);
    g.translate(0, 0.855 * S, DOOR.front + 0.006);
    out.push(place(g, f));
  }
  out.push(...decorDecals(layout, atlas, decor));
  return { geometry: mergeGeometries(out, false)!, texture: atlas.texture() };
}

// ───────── まとめ ─────────

export interface Dressing {
  group: THREE.Group;
  materials: THREE.Material[];
  dispose(): void;
}

/** 頂点の色で塗る飾りを1つの形にまとめる（文字の絵を使わない部分。試験からも呼ぶ） */
export function dressingSolid(layout: StoreLayout): G {
  return mergeGeometries([...shelfParts(layout), ...caseParts(layout), ...outsideParts(layout), ...decorSolid(layout)], false)!;
}

/** 飾りを組み立てる。partMat は店のコードの部品と同じ材質（頂点の色・透かしつき） */
export function buildDressing(layout: StoreLayout, partMat: THREE.Material): Dressing {
  const group = new THREE.Group();
  group.name = 'dressing';
  const solid = dressingSolid(layout);
  const mesh = new THREE.Mesh(solid, partMat);
  // 影は受けるだけ（影を落とすと、影の描画の回数が1回増える）
  mesh.receiveShadow = true;
  mesh.name = 'dressing';
  group.add(mesh);
  const decals = decalParts(layout);
  // 時計とバッジは切り抜きの絵（透明な所を捨てる）
  const decalMat = new THREE.MeshLambertMaterial({ map: decals.texture, side: THREE.FrontSide, alphaTest: 0.5 });
  applyXray(decalMat);
  const decalMesh = new THREE.Mesh(decals.geometry, decalMat);
  decalMesh.receiveShadow = true;
  decalMesh.name = 'dressing-decals';
  group.add(decalMesh);
  return {
    group,
    materials: [decalMat],
    dispose() {
      solid.dispose();
      decals.geometry.dispose();
      decals.texture.dispose();
      decalMat.dispose();
    },
  };
}
