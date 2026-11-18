/**
 * 素材の大きさの表と、商品の種類（品目ごとの目標の大きさ・形・重さ）。
 * シミュレーションは GLB を読まないので、当たり判定に要る外形はここに書いておく（2026-10-06 に public/models の GLB から測った値）。
 * 描画側は GLB の外形の「底面の中心」を原点にそろえて置くので、ここの外形とずれない。
 */
import type { PropShape, Vec3 } from '../view';
import { PHYSICS, RENDER } from '../rules/tuning';

/** 元の大きさ（幅x・高さy・奥行きz）。Mini シリーズはこれを RENDER.modelScale 倍にする */
export const MODEL_SIZE: Record<string, readonly [number, number, number]> = {
  'mm/shelf-boxes': [0.8, 0.8, 0.7],
  'mm/shelf-bags': [0.8, 0.8, 0.7],
  'mm/shelf-end': [0.8, 1.05, 0.4],
  'mm/display-bread': [0.7, 0.5, 0.6],
  'mm/display-fruit': [0.6, 0.516, 0.6],
  'mm/freezer': [0.8, 0.35, 0.6],
  'mm/freezers-standing': [1.0, 0.9, 0.5],
  'mm/cash-register': [0.85, 0.595, 0.85],
  'mm/shopping-cart': [0.3, 0.391, 0.479],
  'mm/shopping-basket': [0.35, 0.25, 0.35],
  'mm/wall': [1, 1, 0.6],
  'mm/wall-window': [1, 1, 0.6],
  'mm/wall-door-rotate': [1, 1, 0.6],
  'mm/column': [0.726, 1, 0.726],
  'mm/bottle-return': [0.45, 1.093, 0.481],
  // 棚のモデルの子ノード（商品）
  'mm/shelf-boxes/carton': [0.154, 0.286, 0.154],
  'mm/shelf-boxes/box': [0.249, 0.3, 0.1],
  'mm/shelf-bags/bag': [0.249, 0.371, 0.293],
  'mm/shelf-end/bottle': [0.136, 0.272, 0.136],
  'mm/display-bread/bread': [0.22, 0.22, 0.246],
  // Food Kit
  'fk/cabbage': [0.379, 0.307, 0.404],
  'fk/onion': [0.213, 0.25, 0.246],
  'fk/corn': [0.343, 0.316, 0.3],
  'fk/eggplant': [0.204, 0.405, 0.216],
  'fk/paprika': [0.168, 0.199, 0.168],
  'fk/pumpkin': [0.419, 0.229, 0.419],
  'fk/broccoli': [0.375, 0.422, 0.375],
  'fk/bag': [0.22, 0.6, 0.412],
  'fk/candy-bar': [0.292, 0.065, 0.075],
  'fk/chocolate': [0.292, 0.034, 0.146],
  'fk/lollypop': [0.039, 0.38, 0.188],
  'fk/donut': [0.245, 0.089, 0.283],
  'fk/cookie': [0.22, 0.05, 0.19],
  'fk/soda-bottle': [0.18, 0.58, 0.156],
  'fk/carton': [0.23, 0.591, 0.23],
  'fk/carton-small': [0.23, 0.391, 0.23],
  'fk/soda-can': [0.225, 0.351, 0.225],
  'fk/can': [0.3, 0.32, 0.3],
  'fk/can-small': [0.3, 0.161, 0.3],
  'fk/honey': [0.326, 0.316, 0.326],
  'fk/peanut-butter': [0.236, 0.296, 0.236],
  'fk/bottle-ketchup': [0.144, 0.393, 0.166],
  'fk/bottle-musterd': [0.144, 0.393, 0.166],
  'fk/bottle-oil': [0.14, 0.622, 0.14],
  'fk/shaker-salt': [0.095, 0.196, 0.095],
  'fk/loaf': [0.58, 0.442, 0.366],
  'fk/croissant': [0.346, 0.194, 0.478],
  'fk/muffin': [0.305, 0.249, 0.264],
  'fk/watermelon': [0.455, 0.476, 0.455],
  'fk/banana': [0.138, 0.196, 0.63],
};

/** コードで組む商品の外形（メートル。倍率1で描く） */
export const CODE_PROP_SIZE: Record<string, readonly [number, number, number]> = {
  /** トイレットペーパー4ロールの束 */
  'pc/toilet-pack': [0.52, 0.5, 0.52],
  /** ボウリングのピンにするトイレットペーパー1ロール（大きめ） */
  'pc/toilet-roll': [0.36, 0.56, 0.36],
  /** 水のボトル6本パック（3本×2列。1段に3つ並ぶ幅）。round3 D1：細いボトルを1本ずつだと棚がすき間だらけに見えるため */
  'pc/water-pack': [0.48, 0.46, 0.32],
  /** 赤い缶6個の段ボールのトレー */
  'pc/can-tray': [0.48, 0.2, 0.32],
};

export interface ItemType {
  id: string;
  model: string;
  shape: PropShape;
  /** 目標の高さ（h）か、いちばん長い辺（max）か、倍率（scale）のどれかで大きさを決める */
  fit: { h: number } | { max: number } | { scale: number };
  /** 重さ（kg）。省略時は体積から決める */
  mass?: number;
  /** 棚に並べるとき90度回して、広い面を通路へ向ける（Food Kit のポテチの袋は広い面が横＝x を向いている） */
  turn?: boolean;
}

/** 売り場で使う品目。通路ごとの品ぞろえは store.ts の ASSORTMENT */
export const ITEMS: Record<string, ItemType> = {
  cabbage: { id: 'cabbage', model: 'fk/cabbage', shape: 'ball', fit: { h: 0.4 } },
  onion: { id: 'onion', model: 'fk/onion', shape: 'ball', fit: { h: 0.32 } },
  corn: { id: 'corn', model: 'fk/corn', shape: 'box', fit: { h: 0.36 } },
  eggplant: { id: 'eggplant', model: 'fk/eggplant', shape: 'box', fit: { h: 0.42 } },
  paprika: { id: 'paprika', model: 'fk/paprika', shape: 'ball', fit: { h: 0.3 } },
  pumpkin: { id: 'pumpkin', model: 'fk/pumpkin', shape: 'cylinder', fit: { h: 0.3 } },
  broccoli: { id: 'broccoli', model: 'fk/broccoli', shape: 'box', fit: { h: 0.44 } },
  // お菓子＝黄とピンクの袋（色は描画側で塗る。round3 D1）
  chips: { id: 'chips', model: 'fk/bag', shape: 'box', fit: { h: 0.55 }, turn: true },
  'chips-s': { id: 'chips-s', model: 'fk/bag', shape: 'box', fit: { h: 0.42 }, turn: true },
  'mm-bag': { id: 'mm-bag', model: 'mm/shelf-bags/bag', shape: 'box', fit: { scale: 1.75 } },
  'candy-box': { id: 'candy-box', model: 'mm/shelf-boxes/box', shape: 'box', fit: { scale: 2.0 } },
  // 飲料＝青と透明のボトル（Food Kit のコーラの瓶を水のボトルに塗り替える）・青い缶・牛乳パック
  water: { id: 'water', model: 'fk/soda-bottle', shape: 'cylinder', fit: { h: 0.55 } },
  'water-pack': { id: 'water-pack', model: 'pc/water-pack', shape: 'box', fit: { scale: 1 } },
  'water-s': { id: 'water-s', model: 'fk/soda-bottle', shape: 'cylinder', fit: { h: 0.44 } },
  'soda-can': { id: 'soda-can', model: 'fk/soda-can', shape: 'cylinder', fit: { h: 0.35 } },
  carton: { id: 'carton', model: 'fk/carton', shape: 'box', fit: { h: 0.52 } },
  'mm-carton': { id: 'mm-carton', model: 'mm/shelf-boxes/carton', shape: 'box', fit: { scale: 2.0 } },
  // 缶詰＝赤い缶の列
  can: { id: 'can', model: 'fk/can', shape: 'cylinder', fit: { h: 0.35 } },
  'can-s': { id: 'can-s', model: 'fk/can', shape: 'cylinder', fit: { h: 0.28 } },
  'can-small': { id: 'can-small', model: 'fk/can-small', shape: 'cylinder', fit: { h: 0.2 } },
  'can-tray': { id: 'can-tray', model: 'pc/can-tray', shape: 'box', fit: { scale: 1 } },
  ketchup: { id: 'ketchup', model: 'fk/bottle-ketchup', shape: 'box', fit: { h: 0.4 } },
  // 日用品＝白いロールと淡い色のボトル
  'tp-pack': { id: 'tp-pack', model: 'pc/toilet-pack', shape: 'box', fit: { scale: 1 } },
  'detergent-bottle': { id: 'detergent-bottle', model: 'mm/shelf-end/bottle', shape: 'cylinder', fit: { scale: 2.3 } },
  // 朝ごはん（パン売り場の手前）
  'carton-small': { id: 'carton-small', model: 'fk/carton-small', shape: 'box', fit: { h: 0.38 } },
  loaf: { id: 'loaf', model: 'fk/loaf', shape: 'box', fit: { max: 0.56 } },
  croissant: { id: 'croissant', model: 'fk/croissant', shape: 'box', fit: { max: 0.46 } },
  muffin: { id: 'muffin', model: 'fk/muffin', shape: 'cylinder', fit: { h: 0.3 } },
  'cereal-box': { id: 'cereal-box', model: 'mm/shelf-boxes/box', shape: 'box', fit: { scale: 2.3 } },
  bread: { id: 'bread', model: 'mm/display-bread/bread', shape: 'box', fit: { scale: RENDER.modelScale } },
  'pyramid-can': { id: 'pyramid-can', model: 'fk/can', shape: 'cylinder', fit: { h: 0.35 } },
  watermelon: { id: 'watermelon', model: 'fk/watermelon', shape: 'ball', fit: { max: 0.55 }, mass: 5 },
  banana: { id: 'banana', model: 'fk/banana', shape: 'box', fit: { max: 0.5 } },
  pin: { id: 'pin', model: 'pc/toilet-roll', shape: 'cylinder', fit: { scale: 1 }, mass: 0.9 },
  basket: { id: 'basket', model: 'mm/shopping-basket', shape: 'box', fit: { scale: RENDER.modelScale } },
};

export interface ResolvedItem {
  model: string;
  shape: PropShape;
  scale: number;
  /** 当たり判定の大きさ（box＝幅・高さ・奥行き、cylinder＝直径・高さ・直径、ball＝直径を3つ） */
  size: Vec3;
  mass: number;
}

export function originalSize(model: string): readonly [number, number, number] {
  const s = MODEL_SIZE[model] ?? CODE_PROP_SIZE[model];
  if (!s) throw new Error(`size unknown: ${model}`);
  return s;
}

/** 品目の倍率・当たり判定・重さを決める */
export function resolveItem(item: ItemType): ResolvedItem {
  const [w, h, d] = originalSize(item.model);
  let scale: number;
  if ('h' in item.fit) scale = item.fit.h / h;
  else if ('max' in item.fit) scale = item.fit.max / Math.max(w, h, d);
  else scale = item.fit.scale;
  const sw = w * scale;
  const sh = h * scale;
  const sd = d * scale;
  let size: Vec3;
  let volume: number;
  if (item.shape === 'ball') {
    // 球は外形の平均を直径にする（転がりやすさを優先）
    const dia = (sw + sh + sd) / 3;
    size = { x: dia, y: dia, z: dia };
    volume = (Math.PI / 6) * dia ** 3;
  } else if (item.shape === 'cylinder') {
    const dia = Math.max(sw, sd);
    size = { x: dia, y: sh, z: dia };
    volume = Math.PI * (dia / 2) ** 2 * sh;
  } else {
    size = { x: sw, y: sh, z: sd };
    volume = sw * sh * sd;
  }
  const mass = item.mass ?? Math.min(PHYSICS.propMaxMass, Math.max(PHYSICS.propMinMass, volume * PHYSICS.propDensity));
  return { model: item.model, shape: item.shape, scale, size, mass: Math.round(mass * 100) / 100 };
}
