/**
 * 商品の見た目（round3 D1）：遠目でも通路が見分けられるよう、通路ごとに主役の色を1つに絞って塗り替える。
 * お菓子＝黄とピンクの袋／飲料＝青と透明のボトル／缶詰＝赤い缶の列／日用品＝白いロールと淡い色のボトル。
 * - 塗り替え：Kenney の素材は色の表（colormap）1枚の升に UV を向けているので、UV を別の升へずらして色を変える。
 *   形も材質も同じなので、品目ごとの描画は1回のまま（描画の回数の予算を守る）
 * - 掛け合わせ：白く塗り替えた商品に、インスタンスの色で通路の色を掛ける。同じ棚の同じ段・同じ面は同じ色（実際の陳列の「列」）
 * シミュレーションは色を知らない（PropDef に色はない）。主と参加者は同じ番号・同じ seed から同じ色を出す。
 */
import * as THREE from 'three';
import { faceOfProp, type AisleId } from '../../shared/layout/store';
import type { PropDef } from '../../shared/view';
import { PALETTE } from './palette';

/** 色の表の升：帯（上から 0〜3。使うのは 1〜3）と色（左から2列ずつの組 0〜7。左が平ら・右が陰影つき） */
export type Cell = readonly [band: number, hue: number];
export interface CellShift {
  from: Cell;
  to: Cell;
}

type Tint = keyof typeof PALETTE;

export interface Look {
  /** 同じ形の商品をまとめる鍵（model＋この名前） */
  name: string;
  shifts: readonly CellShift[];
  /** 掛け合わせの色の候補（なければ白＝そのまま） */
  tints: readonly Tint[];
  /** 床にこぼれる飲み物の色（こぼれない物は null。'tint' は掛けた色と同じ） */
  spill: Tint | 'tint' | null;
}

// Food Kit（fk）と Mini Market（mm）は色の表の並びが違う（2026-10-07 に colormap.png を升ごとに測った）
const FK = { blue: [1, 0], lightBlue: [1, 1], purple: [1, 2], brown: [2, 1], peach: [2, 2], red: [2, 7], white: [3, 7] } as const;
const MM = { magenta: [1, 0], yellow: [2, 2], red: [2, 4], lightBlue: [2, 6], white: [3, 4], lightGrey: [3, 3], salmon: [3, 5] } as const;

const PLAIN: Look = { name: '', shifts: [], tints: [], spill: null };

/** 品目（model）と通路ごとの見た目。上から順に見て、最初に当てはまったもの */
const LOOKS: readonly { model: string; aisles?: readonly AisleId[]; look: Look }[] = [
  // お菓子：ポテチの袋（元は肌色1色）を白にして、黄とピンクを掛ける
  { model: 'fk/bag', look: { name: 'snack-bag', shifts: [{ from: FK.peach, to: FK.white }], tints: ['snackYellow', 'snackPink'], spill: null } },
  // お菓子の袋（白・黄・赤）の赤をピンクへ
  { model: 'mm/shelf-bags/bag', look: { name: 'snack-mmbag', shifts: [{ from: MM.red, to: MM.magenta }], tints: [], spill: null } },
  // お菓子の箱（白と黄）の黄をピンクへ。朝ごはんのシリアルの箱は同じ形でも元の色のまま
  { model: 'mm/shelf-boxes/box', aisles: ['snack'], look: { name: 'snack-box', shifts: [{ from: MM.yellow, to: MM.magenta }], tints: [], spill: null } },
  // 飲料：コーラの瓶（茶色の瓶に赤いラベル）→ 透明（白に薄い水色を掛ける）か青い瓶に、青いラベル
  {
    model: 'fk/soda-bottle',
    look: { name: 'water', shifts: [{ from: FK.brown, to: FK.white }, { from: FK.red, to: FK.blue }], tints: ['drinkClear', 'drinkClear', 'drinkBlue'], spill: 'spillWater' },
  },
  // 飲料：赤い缶 → 青い缶
  { model: 'fk/soda-can', look: { name: 'blue-can', shifts: [{ from: FK.red, to: FK.blue }], tints: [], spill: null } },
  // 飲料：紫と白の紙パック → 青と白の牛乳パック
  { model: 'fk/carton', look: { name: 'milk', shifts: [{ from: FK.purple, to: FK.blue }], tints: [], spill: 'spillMilk' } },
  { model: 'mm/shelf-boxes/carton', look: { name: 'milk-mm', shifts: [], tints: [], spill: 'spillMilk' } },
  { model: 'fk/carton-small', look: { name: 'pink-milk', shifts: [], tints: [], spill: 'spillPink' } },
  // 缶詰：紫の小さな缶 → 赤い缶（大きな缶は元から赤）
  { model: 'fk/can-small', look: { name: 'red-can', shifts: [{ from: FK.purple, to: FK.red }], tints: [], spill: null } },
  { model: 'fk/bottle-ketchup', look: { name: 'ketchup', shifts: [], tints: [], spill: 'spillRed' } },
  // 日用品：水色のボトル（橙のふた）→ 白にして淡い色を掛ける（ふたは薄い灰色）
  {
    model: 'mm/shelf-end/bottle',
    look: {
      name: 'pastel-bottle',
      shifts: [{ from: MM.lightBlue, to: MM.white }, { from: MM.salmon, to: MM.lightGrey }],
      tints: ['pastelMint', 'pastelLavender', 'pastelPink', 'pastelLemon', 'pastelSky'],
      spill: 'tint',
    },
  },
];

/** 商品の通路（棚・端の棚の商品だけ。床置きや台の物は null） */
function aisleOf(prop: PropDef): AisleId | null {
  return faceOfProp(prop)?.aisle ?? null;
}

export function lookOf(prop: PropDef): Look {
  const aisle = aisleOf(prop);
  for (const l of LOOKS) {
    if (l.model !== prop.model) continue;
    if (l.aisles && (!aisle || !l.aisles.includes(aisle))) continue;
    return l.look;
  }
  return PLAIN;
}

/** 小さな整数の混ぜ合わせ（同じ入力なら必ず同じ値） */
function mix(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

/**
 * 掛ける色。同じ棚・同じ段・同じ面の商品は同じ色にする（置いた位置の家から決めるので、動いても色は変わらない）。
 * 試合ごと（seed）に色の並びが変わる
 */
export function tintOf(prop: PropDef, seed: number): string {
  const look = lookOf(prop);
  if (look.tints.length === 0) return PALETTE.white;
  const level = Math.round(prop.home.pos.y * 4);
  const face = faceOfProp(prop);
  const group = (prop.fixtureId ?? 999) * 64 + level * 4 + (face ? face.id % 4 : 0);
  return PALETTE[look.tints[mix(seed, group) % look.tints.length]!] as string;
}

/** こぼれた飲み物の色（こぼれない物は null） */
export function spillColorOf(prop: PropDef, seed: number): string | null {
  const look = lookOf(prop);
  if (!look.spill) return null;
  return look.spill === 'tint' ? tintOf(prop, seed) : (PALETTE[look.spill] as string);
}

/**
 * 色の表の升をずらした形を作る（元の形は変えない）。三角形の重心で升を決め、3つの頂点を同じだけずらす
 * （Kenney の素材は1つの三角形が2つの升にまたがらない。2026-10-07 に全品目で確認）
 */
export function recolorGeometry(src: THREE.BufferGeometry, shifts: readonly CellShift[]): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src.clone();
  if (shifts.length === 0) return g;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // 元の形と UV の配列を共有しないよう、写してから書き換える
  const out = new THREE.BufferAttribute(new Float32Array(uv.array as ArrayLike<number>), 2);
  for (let t = 0; t + 2 < out.count; t += 3) {
    const u = (out.getX(t) + out.getX(t + 1) + out.getX(t + 2)) / 3;
    const v = (out.getY(t) + out.getY(t + 1) + out.getY(t + 2)) / 3;
    const band = Math.floor(v * 4);
    const hue = Math.floor(u * 8);
    const s = shifts.find((x) => x.from[0] === band && x.from[1] === hue);
    if (!s) continue;
    const du = (s.to[1] - hue) / 8;
    const dv = (s.to[0] - band) / 4;
    for (let k = 0; k < 3; k++) out.setXY(t + k, out.getX(t + k) + du, out.getY(t + k) + dv);
  }
  g.setAttribute('uv', out);
  return g;
}
