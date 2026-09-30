// 問題ごとの小物の置き方。大きな家具は動かさず、小物だけを置き場所に割り当てる。
import { FURNITURE, PROPS } from './catalog.js';
import { PLACEMENT, SLOTS } from './plan.js';
import { stream, shuffled } from './rng.js';

const JITTER = { top: 25, floor: 30, bed: 30, shelf: 10, stove: 15 };

/** 素材の寸法（m）に倍率と正面の回しを当てた、置いたときの幅・高さ・奥行き */
export function modelDims(manifest, entry) {
  const m = manifest.models[entry.file];
  if (!m) throw new Error(`寸法がありません: ${entry.file}`);
  const s = entry.scale ?? 1;
  const [x, y, z] = m.size.map(v => v * s);
  const quarter = Math.round(((entry.front ?? 0) % 180 + 180) % 180) === 90;
  return quarter ? { w: z, h: y, d: x } : { w: x, h: y, d: z };
}

export function propDims(manifest, id) {
  return modelDims(manifest, PROPS[id]);
}

export function fixtureDims(manifest, model) {
  return modelDims(manifest, FURNITURE[model]);
}

/** その小物を置ける場所の一覧（部屋・種類・大きさで絞る） */
export function candidateSlots(manifest, id) {
  const rule = PLACEMENT[id];
  if (!rule) throw new Error(`置き方の決まりがありません: ${id}`);
  const dims = propDims(manifest, id);
  return SLOTS.filter(slot => {
    if (!rule.kinds.includes(slot.kind)) return false;
    if (rule.rooms && !rule.rooms.includes(slot.room)) return false;
    if (slot.maxW !== undefined && Math.max(dims.w, dims.d) > Math.max(slot.maxW, slot.maxD) + 1e-9) return false;
    if (slot.maxW !== undefined && Math.min(dims.w, dims.d) > Math.min(slot.maxW, slot.maxD) + 1e-9) return false;
    if (slot.maxH !== undefined && dims.h > slot.maxH + 1e-9) return false;
    return true;
  }).map(s => s.id);
}

/**
 * 小物を置き場所へ割り当てる。種と問題番号が同じなら必ず同じ結果になる。
 * 戻り値: { [小物id]: { slot, yaw } }（yaw は置き場所の向きに足すずれ・度）
 */
export function arrange(manifest, seed, round) {
  const rng = stream(seed, 'arrange', round);
  const ids = Object.keys(PROPS);
  const options = new Map(ids.map(id => [id, shuffled(rng, candidateSlots(manifest, id))]));
  for (const [id, list] of options) if (list.length === 0) throw new Error(`置き場所がありません: ${id}`);
  // 選べる場所が少ない物から決める。同じ数なら乱数の順
  const order = shuffled(rng, ids).sort((a, b) => options.get(a).length - options.get(b).length);
  const used = new Set();
  const chosen = new Map();
  let steps = 0;
  const solve = (i) => {
    if (i === order.length) return true;
    if (++steps > 20000) return false;
    const id = order[i];
    for (const slot of options.get(id)) {
      if (used.has(slot)) continue;
      used.add(slot);
      chosen.set(id, slot);
      if (solve(i + 1)) return true;
      used.delete(slot);
      chosen.delete(id);
    }
    return false;
  };
  if (!solve(0)) throw new Error('小物を置き切れませんでした');
  const result = {};
  for (const id of ids) {
    const slot = SLOTS.find(s => s.id === chosen.get(id));
    // 幅の広い物を大きく回すと、天板や棚板の縁からはみ出して宙に浮く
    const dims = propDims(manifest, id);
    const wide = Math.max(dims.w, dims.d) > 0.42;
    const spread = wide ? Math.min(6, JITTER[slot.kind] ?? 0) : JITTER[slot.kind] ?? 0;
    result[id] = { slot: slot.id, yaw: Math.round((rng() * 2 - 1) * spread) };
  }
  return result;
}
