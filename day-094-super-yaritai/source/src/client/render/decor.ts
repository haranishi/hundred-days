/**
 * 壁・奥・レジの作り込み（round4 dress。見た目 round3 の TOP5 の2〜4：壁は無地の灰色・奥の壁の上は空白・レジ3台が同じ）。
 * - H1 壁の内側：腰板、ポスター（本日特売・ポイント5倍デー・本日のおすすめ・秋の味覚フェアなど）、秋のガーランド。
 *   壁の上面は日よけの縞（正面の南の低い壁は UI と同じ赤白で、外側に半円のふちを垂らす。横と奥は薄い赤）
 * - H2 奥の壁の上：店名の看板の帯・時計・売り出しのバッジを立てる。クリームの空は塗らず、輪郭をにぎやかにする
 * - H3 レジ3台：番号札（1・2・3。3番は休止中）、ベルトの上の品、台の上のレジ袋・かご・休止中の札で見分ける。
 *   店員の人形は置かない（追いかけてくる店員と見分けがつかなくなる）
 * 頂点の色の形（decorSolid）と文字の絵の形（decorDecals）を返す。dressing.ts が今ある2つの形にまとめる（描画の回数は増えない）。
 * 置き場所は store.ts の置き物から決める（壁の窓・扉、壁ぎわの置き物を避ける）。当たり判定は持たない。
 */
import type { Fixture, StoreLayout } from '../../shared/layout/store';
import { fitText, roundRect, type Cell, type DecalAtlas } from './atlas';
import { box, cyl, flatPoly, floorQuad, place, type G } from './dressGeo';
import { PALETTE } from './palette';

// ───────── 壁の面 ─────────

/** 壁の内側の面。ローカルの x が面に沿う向き、+z が店の内側（yaw で回して中心へ置く） */
interface Face {
  name: 'west' | 'east' | 'north';
  yaw: number;
  center: { x: number; z: number };
  len: number;
}

function wallFaces(layout: StoreLayout): Face[] {
  const b = layout.bounds;
  return [
    { name: 'west', yaw: Math.PI / 2, center: { x: b.x0, z: (b.z0 + b.z1) / 2 }, len: b.z1 - b.z0 },
    { name: 'east', yaw: -Math.PI / 2, center: { x: b.x1, z: (b.z0 + b.z1) / 2 }, len: b.z1 - b.z0 },
    { name: 'north', yaw: 0, center: { x: (b.x0 + b.x1) / 2, z: b.z0 }, len: b.x1 - b.x0 },
  ];
}

/** 面に沿う位置 u（面の中心から）へ、ワールドの位置を写す */
function toU(face: Face, x: number, z: number): number {
  if (face.name === 'west') return face.center.z - z;
  if (face.name === 'east') return z - face.center.z;
  return x - face.center.x;
}

function onFace(g: G, face: Face): G {
  return place(g, { pos: { x: face.center.x, y: 0, z: face.center.z }, yaw: face.yaw });
}

/** 壁の高さと厚み（Kenney の壁を伸ばした大きさ。store.ts の壁の置き物から） */
function wallSize(layout: StoreLayout): { h: number; t: number; southH: number } {
  const walls = layout.fixtures.filter((f) => f.kind === 'wall');
  const south = walls.filter((f) => f.pos.z > layout.bounds.z1);
  return { h: Math.max(...walls.map((f) => f.size.y)), t: walls[0]!.size.z, southH: Math.max(...south.map((f) => f.size.y)) };
}

type Span = [number, number];

/** 面の上でふさがっている区間：窓と扉（openings）と、壁ぎわに置いた物（fixtures） */
function blocked(layout: StoreLayout, face: Face): { openings: Span[]; fixtures: Span[] } {
  const b = layout.bounds;
  const openings: Span[] = [];
  const fixtures: Span[] = [];
  for (const f of layout.fixtures) {
    if (f.kind === 'wall') {
      if (face.name === 'north' && f.pos.z < b.z0 && f.model !== 'mm/wall') {
        const u = toU(face, f.pos.x, f.pos.z);
        openings.push([u - f.size.x / 2, u + f.size.x / 2]);
      }
      continue;
    }
    if (f.kind === 'light') continue;
    for (const c of f.colliders) {
      const near = face.name === 'west' ? c.min.x <= b.x0 + 0.35 : face.name === 'east' ? c.max.x >= b.x1 - 0.35 : c.min.z <= b.z0 + 0.35;
      if (!near || c.max.y < 0.5) continue;
      const a = face.name === 'north' ? toU(face, c.min.x, 0) : toU(face, 0, c.min.z);
      const z = face.name === 'north' ? toU(face, c.max.x, 0) : toU(face, 0, c.max.z);
      fixtures.push([Math.min(a, z), Math.max(a, z)]);
    }
  }
  return { openings, fixtures };
}

/** [-len/2, len/2] から、ふさがった区間（余白つき）を除いた区間 */
function freeSpans(len: number, taken: Span[], margin: number): Span[] {
  const sorted = taken.map(([a, b]) => [a - margin, b + margin] as Span).sort((p, q) => p[0] - q[0]);
  const out: Span[] = [];
  let at = -len / 2 + margin;
  for (const [a, b] of sorted) {
    if (a > at) out.push([at, Math.min(a, len / 2 - margin)]);
    at = Math.max(at, b);
  }
  if (at < len / 2 - margin) out.push([at, len / 2 - margin]);
  return out.filter(([a, b]) => b - a > 0.05);
}

// ───────── H1：ポスターの絵 ─────────

const POSTER = { w: 0.86, h: 1.2, y: 1.2, pitch: 3.6 };
const POSTER_PX = { w: 240, h: 336 };

type PosterDraw = (g: CanvasRenderingContext2D, c: Cell) => void;

const lines = (g: CanvasRenderingContext2D, c: Cell, rows: [string, number, string][]): void => {
  for (const [s, y, color] of rows) fitText(g, s, c.w - 36, 64, c.x + c.w / 2, c.y + y, color);
};

const POSTERS: PosterDraw[] = [
  // 本日特売：赤地に黄
  (g, c) => {
    g.fillStyle = PALETTE.red;
    g.fillRect(c.x, c.y, c.w, c.h);
    g.strokeStyle = PALETTE.white;
    g.lineWidth = 10;
    g.strokeRect(c.x + 12, c.y + 12, c.w - 24, c.h - 24);
    fitText(g, '本日', c.w - 60, 92, c.x + c.w / 2, c.y + 100, PALETTE.yellow);
    fitText(g, '特売', c.w - 60, 92, c.x + c.w / 2, c.y + 200, PALETTE.yellow);
    fitText(g, 'お買い得品いっぱい', c.w - 50, 26, c.x + c.w / 2, c.y + 282, PALETTE.white, 800);
  },
  // ポイント5倍デー：黄地に赤
  (g, c) => {
    g.fillStyle = PALETTE.yellow;
    g.fillRect(c.x, c.y, c.w, c.h);
    lines(g, c, [['ポイント', 64, PALETTE.red]]);
    fitText(g, '5倍', c.w - 40, 120, c.x + c.w / 2, c.y + 160, PALETTE.red);
    lines(g, c, [['デー', 246, PALETTE.red]]);
    fitText(g, '毎週水曜', c.w - 60, 30, c.x + c.w / 2, c.y + 302, PALETTE.ink, 800);
  },
  // 本日のおすすめ：白地に赤い帯とトマト
  (g, c) => {
    g.fillStyle = PALETTE.white;
    g.fillRect(c.x, c.y, c.w, c.h);
    g.fillStyle = PALETTE.red;
    g.fillRect(c.x, c.y, c.w, 70);
    fitText(g, '本日のおすすめ', c.w - 30, 40, c.x + c.w / 2, c.y + 36, PALETTE.white);
    g.fillStyle = PALETTE.red;
    g.beginPath();
    g.arc(c.x + c.w / 2, c.y + 160, 58, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = PALETTE.green;
    g.fillRect(c.x + c.w / 2 - 22, c.y + 98, 44, 14);
    fitText(g, 'トマト 98円', c.w - 30, 40, c.x + c.w / 2, c.y + 272, PALETTE.ink);
    g.strokeStyle = PALETTE.red;
    g.lineWidth = 8;
    g.strokeRect(c.x + 4, c.y + 4, c.w - 8, c.h - 8);
  },
  // 秋の味覚フェア：橙の地に紅葉（秋の飾り）
  (g, c) => {
    g.fillStyle = PALETTE.autumnOrange;
    g.fillRect(c.x, c.y, c.w, c.h);
    drawLeaf(g, c.x + c.w / 2, c.y + 128, 82, PALETTE.autumnLeaf);
    lines(g, c, [
      ['秋の味覚', 248, PALETTE.white],
      ['フェア', 304, PALETTE.yellow],
    ]);
  },
  // タイムセール：青地に白
  (g, c) => {
    g.fillStyle = PALETTE.blue;
    g.fillRect(c.x, c.y, c.w, c.h);
    lines(g, c, [
      ['タイム', 90, PALETTE.white],
      ['セール', 180, PALETTE.white],
    ]);
    fitText(g, '17時から', c.w - 50, 44, c.x + c.w / 2, c.y + 276, PALETTE.yellow);
  },
  // 新商品：緑の地に白
  (g, c) => {
    g.fillStyle = PALETTE.green;
    g.fillRect(c.x, c.y, c.w, c.h);
    roundRect(g, c.x + 24, c.y + 70, c.w - 48, 120, 18);
    g.fillStyle = PALETTE.white;
    g.fill();
    fitText(g, '新商品', c.w - 70, 80, c.x + c.w / 2, c.y + 130, PALETTE.green);
    fitText(g, '入荷しました', c.w - 40, 36, c.x + c.w / 2, c.y + 262, PALETTE.white);
  },
];

/** 紅葉（5つのとがりの葉）。秋の飾り */
function drawLeaf(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.42;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  g.fillRect(x - 4, y + r * 0.3, 8, r * 0.75);
}

// ───────── H2：奥の看板の帯・時計・バッジの絵 ─────────

/** 看板の帯の区切り（x の範囲と中身）。真ん中の店名は、手前に吊った「冷凍食品」の札（x≈1）と重ならないよう西へ寄せる */
const BAND_SEGMENTS: { x0: number; x1: number; main: string; sub?: string; color: string }[] = [
  { x0: -18, x1: -10.5, main: 'ポイント5倍デー', sub: '毎週水曜', color: PALETTE.red },
  { x0: -10.5, x1: 1.5, main: 'スーパーきちんと堂', sub: 'いつもきちんと営業中', color: PALETTE.red },
  { x0: 1.5, x1: 9.5, main: '新鮮・安心・きちんと', color: PALETTE.green },
  { x0: 9.5, x1: 18, main: '毎日がお買い得！', color: PALETTE.blue },
];
const BAND = { h: 1.05, pxPerM: 150 };

function drawBand(g: CanvasRenderingContext2D, c: Cell, seg: (typeof BAND_SEGMENTS)[number]): void {
  g.fillStyle = PALETTE.bandCream;
  g.fillRect(c.x, c.y, c.w, c.h);
  g.fillStyle = PALETTE.red;
  g.fillRect(c.x, c.y, c.w, 10);
  g.fillStyle = PALETTE.green;
  g.fillRect(c.x, c.y + c.h - 14, c.w, 14);
  if (seg.sub) {
    fitText(g, seg.main, c.w * 0.62, 104, c.x + c.w * 0.36, c.y + c.h / 2, seg.color);
    fitText(g, seg.sub, c.w * 0.3, 44, c.x + c.w * 0.82, c.y + c.h / 2, PALETTE.ink, 800);
  } else fitText(g, seg.main, c.w * 0.8, 96, c.x + c.w / 2, c.y + c.h / 2, seg.color);
}

function drawClock(g: CanvasRenderingContext2D, c: Cell): void {
  const x = c.x + c.w / 2;
  const y = c.y + c.h / 2;
  const r = c.w / 2 - 6;
  g.fillStyle = PALETTE.red;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = PALETTE.clockFace;
  g.beginPath();
  g.arc(x, y, r - 16, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = PALETTE.ink;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const len = i % 3 === 0 ? 22 : 12;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillRect(-3, -(r - 22), 6, len);
    g.restore();
  }
  // 10時10分（時計の見本の形）
  const hand = (a: number, len: number, w: number): void => {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillRect(-w / 2, -len, w, len + 8);
    g.restore();
  };
  hand(((10 + 10 / 60) / 12) * Math.PI * 2, r * 0.48, 12);
  hand((10 / 60) * Math.PI * 2, r * 0.7, 8);
  g.beginPath();
  g.arc(x, y, 10, 0, Math.PI * 2);
  g.fill();
}

/** 売り出しのバッジ（切り抜き）：ぎざぎざの星・丸 */
function drawBadge(g: CanvasRenderingContext2D, c: Cell, shape: 'star' | 'round', fill: string, edge: string, text: string[], textColor: string): void {
  const x = c.x + c.w / 2;
  const y = c.y + c.h / 2;
  const r = c.w / 2 - 6;
  g.beginPath();
  if (shape === 'star') {
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const rr = i % 2 === 0 ? r : r * 0.82;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
  } else g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = edge;
  g.fill();
  g.beginPath();
  g.arc(x, y, r * 0.74, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  text.forEach((s, i) => fitText(g, s, r * 1.25, 74, x, y + (i - (text.length - 1) / 2) * 70, textColor));
}

const BADGES: { x: number; size: number; shape: 'star' | 'round'; fill: string; edge: string; text: string[]; textColor: string }[] = [
  { x: -15.5, size: 1.35, shape: 'round', fill: PALETTE.white, edge: PALETTE.green, text: ['新鮮！'], textColor: PALETTE.green },
  { x: 9.5, size: 1.55, shape: 'star', fill: PALETTE.yellow, edge: PALETTE.red, text: ['本日', '特売'], textColor: PALETTE.red },
  { x: 15.6, size: 1.3, shape: 'round', fill: PALETTE.red, edge: PALETTE.yellow, text: ['安い！'], textColor: PALETTE.white },
];
const CLOCK = { x: -10.5, size: 1.3 };

// ───────── H3：レジ ─────────

interface Lane {
  reg: Fixture;
  conv: Fixture;
  /** 1始まりの番号。3番は休止中 */
  no: number;
  closed: boolean;
}

function lanes(layout: StoreLayout): Lane[] {
  const regs = layout.fixtures.filter((f) => f.kind === 'register').sort((a, b) => a.pos.x - b.pos.x);
  const convs = layout.fixtures.filter((f) => f.kind === 'conveyor');
  return regs.map((reg, i) => {
    const conv = convs.reduce((a, f) => (Math.abs(f.pos.x - reg.pos.x) < Math.abs(a.pos.x - reg.pos.x) ? f : a), convs[0]!);
    return { reg, conv, no: i + 1, closed: i === regs.length - 1 };
  });
}

/** レジの台の手前の棚（GLB の橙の札がある所。モデルの単位 x 0.01〜0.18・y 0.30・z 0.31〜0.43 を倍率と中心で直した位置） */
const FRONT_SHELF = { x: 0.16, y: 0.69, z: 0.79 };
/** 番号札の柱（レジの台の奥の東の角） */
const LANE_POLE = { x: 0.72, z: -0.6, top: 2.45, sign: { w: 0.46, h: 0.4, y: 2.0 } };

function laneSolid(l: Lane): G[] {
  const out: G[] = [];
  const r = l.reg.pos;
  const at = (g: G): G => place(g, { pos: { x: r.x, y: 0, z: r.z }, yaw: 0 });
  // 番号札：柱と箱（休止中は灯りの消えた灰色）
  out.push(at(cyl(0.035, LANE_POLE.top - 1.2, LANE_POLE.x, 1.2, LANE_POLE.z, PALETTE.metal)));
  out.push(at(box(LANE_POLE.sign.w, LANE_POLE.sign.h, 0.1, LANE_POLE.x, LANE_POLE.sign.y, LANE_POLE.z, l.closed ? PALETTE.laneOff : PALETTE.blue)));
  const s = FRONT_SHELF;
  if (l.no === 1) {
    // レジ袋の台：白い袋の束と青い帯
    out.push(at(box(0.44, 0.2, 0.3, s.x, s.y, s.z, PALETTE.bagWhite)), at(box(0.45, 0.05, 0.31, s.x, s.y + 0.1, s.z, PALETTE.toiletBand)));
  } else if (l.closed) {
    // 休止中の札の台（札は文字の絵の形）
    out.push(at(box(0.46, 0.04, 0.16, s.x, s.y, s.z, PALETTE.metalDark)), at(box(0.46, 0.3, 0.02, s.x, s.y + 0.04, s.z - 0.02, PALETTE.laneOff)));
  } else {
    // 緑のかごに品物（赤い缶・黄の袋・白い牛乳）
    const bx = s.x;
    const bz = s.z;
    const k = PALETTE.green;
    out.push(at(box(0.46, 0.03, 0.34, bx, s.y, bz, k)), at(box(0.46, 0.2, 0.03, bx, s.y, bz - 0.155, k)), at(box(0.46, 0.2, 0.03, bx, s.y, bz + 0.155, k)));
    out.push(at(box(0.03, 0.2, 0.34, bx - 0.215, s.y, bz, k)), at(box(0.03, 0.2, 0.34, bx + 0.215, s.y, bz, k)));
    out.push(at(cyl(0.05, 0.16, bx - 0.12, s.y + 0.03, bz, PALETTE.red)), at(box(0.12, 0.24, 0.08, bx, s.y + 0.03, bz, PALETTE.snackYellow)), at(box(0.09, 0.2, 0.09, bx + 0.12, s.y + 0.03, bz + 0.03, PALETTE.white)));
  }
  // ベルトの上の品（1番は品が多く、2番は仕切りの棒と少し、3番は休止中で空）
  const c = l.conv.pos;
  const belt = l.conv.size.y;
  const onBelt = (g: G): G => place(g, { pos: { x: c.x, y: belt, z: c.z }, yaw: 0 });
  if (l.no === 1) {
    out.push(onBelt(box(0.14, 0.26, 0.14, 0, 0, -0.62, PALETTE.white)), onBelt(box(0.145, 0.07, 0.145, 0, 0.12, -0.62, PALETTE.blue)));
    out.push(onBelt(cyl(0.07, 0.18, 0, 0, -0.3, PALETTE.red)), onBelt(cyl(0.062, 0.02, 0, 0.18, -0.3, PALETTE.metal)));
    out.push(onBelt(box(0.22, 0.3, 0.08, 0, 0, 0.02, PALETTE.snackPink)));
    out.push(onBelt(cyl(0.065, 0.32, 0, 0, 0.34, PALETTE.drinkClear)), onBelt(cyl(0.068, 0.08, 0, 0.12, 0.34, PALETTE.blue)), onBelt(cyl(0.03, 0.06, 0, 0.32, 0.34, PALETTE.blue)));
    out.push(onBelt(box(0.26, 0.08, 0.16, 0, 0, 0.66, PALETTE.goodsCream)));
  } else if (!l.closed) {
    out.push(onBelt(box(0.4, 0.05, 0.05, 0, 0, -0.45, PALETTE.metalDark)));
    out.push(onBelt(box(0.3, 0.16, 0.18, 0, 0, -0.1, PALETTE.wood)), onBelt(box(0.12, 0.24, 0.12, 0, 0, 0.28, PALETTE.white)), onBelt(box(0.125, 0.06, 0.125, 0, 0.11, 0.28, PALETTE.red)));
    for (let i = 0; i < 3; i++) out.push(onBelt(cyl(0.06, 0.11, (i - 1) * 0.12, 0, 0.62, PALETTE.red, 7)));
  }
  return out;
}

// ───────── 組み立て ─────────

/** 頂点の色で塗る形（壁の腰板・ポスターの枠・ガーランド・壁の上の縞と日よけのふち・奥の看板の板・レジの品） */
export function decorSolid(layout: StoreLayout): G[] {
  const out: G[] = [];
  const b = layout.bounds;
  const wall = wallSize(layout);
  for (const face of wallFaces(layout)) {
    const { openings, fixtures } = blocked(layout, face);
    // 腰板（窓と扉の下は避ける）と、その上の細い木の縁
    for (const [a, z] of freeSpans(face.len, openings, 0)) {
      out.push(onFace(box(z - a, 0.5, 0.03, (a + z) / 2, 0, 0.015, PALETTE.wallWainscot), face));
      out.push(onFace(box(z - a, 0.06, 0.05, (a + z) / 2, 0.5, 0.025, PALETTE.woodDark), face));
    }
    // ポスターの白い縁（絵は decorDecals）
    for (const u of posterSpots(face, [...openings, ...fixtures])) out.push(onFace(box(POSTER.w + 0.06, POSTER.h + 0.06, 0.016, u, POSTER.y - POSTER.h / 2 - 0.03, 0.008, PALETTE.white), face));
    // 秋のガーランド（光る帯の上。紐と三角の旗を並べる）
    const top = wall.h - 0.02;
    out.push(onFace(box(face.len, 0.02, 0.02, 0, top, 0.03, PALETTE.white), face));
    const colors = [PALETTE.red, PALETTE.yellow, PALETTE.autumnOrange, PALETTE.green, PALETTE.blue];
    let k = 0;
    for (let u = -face.len / 2 + 0.3; u < face.len / 2 - 0.2; u += 0.38) {
      out.push(
        onFace(
          flatPoly(
            [
              [u, top - 0.2],
              [u + 0.14, top],
              [u - 0.14, top],
            ],
            0.03,
            colors[k++ % colors.length]!,
          ),
          face,
        ),
      );
    }
  }
  out.push(...wallTops(layout, wall));
  // 奥の看板の帯の板（文字は decorDecals）と、上の縁
  const bx0 = b.x0 - wall.t;
  const bx1 = b.x1 + wall.t;
  out.push(box(bx1 - bx0, BAND.h, 0.12, (bx0 + bx1) / 2, wall.h, b.z0 - 0.06, PALETTE.bandCream));
  out.push(box(bx1 - bx0, 0.06, 0.14, (bx0 + bx1) / 2, wall.h + BAND.h, b.z0 - 0.06, PALETTE.red));
  for (const l of lanes(layout)) out.push(...laneSolid(l));
  return out;
}

/** 壁の上面の赤白の縞（UI の日よけと同じ）と、南の低い壁の外側に垂らす日よけのふち */
function wallTops(layout: StoreLayout, wall: { h: number; t: number; southH: number }): G[] {
  const out: G[] = [];
  const b = layout.bounds;
  const stripe = 0.5;
  // 縞はどの壁も薄い赤と白。濃い赤だと、開始時に画面の下いっぱいに太く出て、HUD の赤い「蹴る」や入口の赤とぶつかる（round4 で正面も薄い赤にそろえた）
  const soft = (i: number): string => (i % 2 === 0 ? PALETTE.awningSoft : PALETTE.white);
  // 西・東の壁の上（z に沿って縞）
  for (const [x0, x1] of [
    [b.x0 - wall.t, b.x0],
    [b.x1, b.x1 + wall.t],
  ] as const) {
    let i = 0;
    for (let z = b.z0; z < b.z1 - 1e-6; z += stripe) out.push(floorQuad(x0, z, x1, Math.min(b.z1, z + stripe), wall.h + 0.004, soft(i++)));
  }
  // 北の壁の上（看板の板の後ろ）
  let i = 0;
  for (let x = b.x0; x < b.x1 - 1e-6; x += stripe) out.push(floorQuad(x, b.z0 - wall.t, Math.min(b.x1, x + stripe), b.z0 - 0.12, wall.h + 0.004, soft(i++)));
  // 南の低い壁（出入口の両側）の上と、外側の面の半円のふち
  const south = layout.fixtures.filter((f) => f.kind === 'wall' && f.pos.z > b.z1);
  const spans: Span[] = [];
  for (const f of south) {
    const a = f.pos.x - f.size.x / 2;
    const z = f.pos.x + f.size.x / 2;
    const last = spans[spans.length - 1];
    if (last && Math.abs(last[1] - a) < 0.01) last[1] = z;
    else spans.push([a, z]);
  }
  for (const [a, z] of spans) {
    let k = 0;
    for (let x = a; x < z - 1e-6; x += stripe) {
      const x1 = Math.min(z, x + stripe);
      out.push(floorQuad(x, b.z1, x1, b.z1 + wall.t, wall.southH + 0.004, soft(k)));
      const r = (x1 - x) / 2;
      const pts: [number, number][] = [];
      for (let s = 0; s <= 8; s++) {
        const th = Math.PI + (s / 8) * Math.PI;
        pts.push([x + r + Math.cos(th) * r, wall.southH + Math.sin(th) * r * 0.8]);
      }
      out.push(flatPoly(pts, b.z1 + wall.t + 0.006, soft(k)));
      k++;
    }
  }
  return out;
}

/** ポスターを貼る位置（面に沿う u）。窓・扉・壁ぎわの置き物を避けて、およそ一定の間隔で */
function posterSpots(face: Face, taken: Span[]): number[] {
  const out: number[] = [];
  for (const [a, b] of freeSpans(face.len, taken, 0.2)) {
    const len = b - a;
    if (len < POSTER.w + 0.2) continue;
    const n = Math.max(1, Math.floor((len + 0.4) / POSTER.pitch));
    for (let i = 0; i < n; i++) out.push(a + (len * (i + 0.5)) / n);
  }
  return out;
}

export interface DecorCells {
  posters: Cell[];
  band: Cell[];
  clock: Cell;
  badges: Cell[];
  digits: Cell[];
  laneClosed: Cell;
  closedPlate: Cell;
  bagPlate: Cell;
  staff: Cell;
}

/** 文字の絵を描く（背の高い順に頼む） */
export function decorCells(atlas: DecalAtlas): DecorCells {
  const posters = POSTERS.map((draw) => atlas.cell(POSTER_PX.w, POSTER_PX.h, draw));
  const badges = BADGES.map((bd) => atlas.cell(300, 300, (g, c) => drawBadge(g, c, bd.shape, bd.fill, bd.edge, bd.text, bd.textColor), true));
  const clock = atlas.cell(256, 256, drawClock, true);
  const bandPx = Math.round(BAND.h * BAND.pxPerM);
  const band = BAND_SEGMENTS.map((seg) => atlas.cell(Math.round((seg.x1 - seg.x0) * BAND.pxPerM), bandPx, (g, c) => drawBand(g, c, seg)));
  const digits = [1, 2, 3].map((n) =>
    atlas.cell(130, 112, (g, c) => {
      g.fillStyle = PALETTE.blue;
      g.fillRect(c.x, c.y, c.w, c.h);
      fitText(g, String(n), c.w, 96, c.x + c.w / 2, c.y + c.h / 2 + 4, PALETTE.white);
    }),
  );
  const laneClosed = atlas.cell(130, 112, (g, c) => {
    g.fillStyle = PALETTE.laneOff;
    g.fillRect(c.x, c.y, c.w, c.h);
    fitText(g, '休止中', c.w - 14, 40, c.x + c.w / 2, c.y + c.h / 2, PALETTE.white);
  });
  const closedPlate = atlas.cell(220, 140, (g, c) => {
    g.fillStyle = PALETTE.white;
    g.fillRect(c.x, c.y, c.w, c.h);
    g.strokeStyle = PALETTE.red;
    g.lineWidth = 10;
    g.strokeRect(c.x + 5, c.y + 5, c.w - 10, c.h - 10);
    fitText(g, '休止中', c.w - 40, 56, c.x + c.w / 2, c.y + 58, PALETTE.red);
    fitText(g, 'となりのレジへ', c.w - 40, 22, c.x + c.w / 2, c.y + 108, PALETTE.ink, 800);
  });
  const staff = atlas.cell(380, 110, (g, c) => {
    g.fillStyle = PALETTE.white;
    g.fillRect(c.x, c.y, c.w, c.h);
    g.fillStyle = PALETTE.red;
    g.fillRect(c.x, c.y, c.w, 34);
    fitText(g, 'STAFF ONLY', c.w - 40, 24, c.x + c.w / 2, c.y + 18, PALETTE.white);
    fitText(g, '関係者以外立入禁止', c.w - 30, 40, c.x + c.w / 2, c.y + 72, PALETTE.ink);
  });
  const bagPlate = atlas.cell(220, 70, (g, c) => {
    g.fillStyle = PALETTE.white;
    g.fillRect(c.x, c.y, c.w, c.h);
    fitText(g, 'レジ袋 3円', c.w - 20, 44, c.x + c.w / 2, c.y + c.h / 2, PALETTE.blue);
  });
  return { posters, band, clock, badges, digits, laneClosed, closedPlate, bagPlate, staff };
}

/** 文字の絵を貼る形（ポスター・奥の看板の帯・時計・バッジ・扉の札・レジの番号札と札） */
export function decorDecals(layout: StoreLayout, atlas: DecalAtlas, cells: DecorCells): G[] {
  const out: G[] = [];
  const b = layout.bounds;
  const wall = wallSize(layout);
  let design = 0;
  for (const face of wallFaces(layout)) {
    const { openings, fixtures } = blocked(layout, face);
    for (const u of posterSpots(face, [...openings, ...fixtures])) {
      const g = atlas.decal(POSTER.w, POSTER.h, cells.posters[design++ % cells.posters.length]!);
      g.translate(u, POSTER.y, 0.018);
      out.push(onFace(g, face));
    }
  }
  // 奥の看板の帯
  BAND_SEGMENTS.forEach((seg, i) => {
    const g = atlas.decal(seg.x1 - seg.x0, BAND.h - 0.04, cells.band[i]!);
    g.translate((seg.x0 + seg.x1) / 2, wall.h + BAND.h / 2, b.z0 + 0.004);
    out.push(g);
  });
  // 時計（帯の継ぎ目の上に、上半分が空へはみ出すように）とバッジ（帯の上に立てる）
  const clock = atlas.decal(CLOCK.size, CLOCK.size, cells.clock);
  clock.translate(CLOCK.x, wall.h + BAND.h - 0.1, b.z0 + 0.012);
  out.push(clock);
  BADGES.forEach((bd, i) => {
    const g = atlas.decal(bd.size, bd.size, cells.badges[i]!);
    g.translate(bd.x, wall.h + BAND.h + bd.size / 2 - 0.25, b.z0 + 0.016);
    out.push(g);
  });
  // スタッフ扉の札（扉の板の面。扉は壁の中ほどに0.23m引っ込んでいる）
  const door = layout.fixtures.find((f) => f.model === 'mm/wall-door-rotate');
  if (door) {
    const g = atlas.decal(0.95, 0.28, cells.staff);
    g.translate(door.pos.x, 1.62, door.pos.z + 0.2 * door.scale.z + 0.012);
    out.push(g);
  }
  // レジの番号札・休止中の札・レジ袋の札
  for (const l of lanes(layout)) {
    const r = l.reg.pos;
    const sign = atlas.decal(LANE_POLE.sign.w - 0.06, LANE_POLE.sign.h - 0.06, l.closed ? cells.laneClosed : cells.digits[l.no - 1]!);
    sign.translate(r.x + LANE_POLE.x, LANE_POLE.sign.y + LANE_POLE.sign.h / 2, r.z + LANE_POLE.z + 0.052);
    out.push(sign);
    const s = FRONT_SHELF;
    if (l.closed) {
      const g = atlas.decal(0.44, 0.28, cells.closedPlate);
      g.translate(r.x + s.x, s.y + 0.04 + 0.15, r.z + s.z - 0.008);
      out.push(g);
    } else if (l.no === 1) {
      // 青い帯（高さ 0.1〜0.15）の下に貼る
      const g = atlas.decal(0.38, 0.085, cells.bagPlate);
      g.translate(r.x + s.x, s.y + 0.05, r.z + s.z + 0.152);
      out.push(g);
    }
  }
  return out;
}

/** 試験用：飾りの置き場所を決める関数（DOM を使わない部分） */
export const decorLayoutForTest = { wallFaces, blocked, freeSpans, posterSpots, lanes, BAND_SEGMENTS, BADGES, CLOCK };
