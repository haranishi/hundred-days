import { GFX_IDS } from './contract.js';
import { AUTO_TIERS } from './gfx.js';

export const LEARNED_GFX_KEY = 'day095.gfx.learned';
const LEARNED_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export function resolveGfx({ param, setting, learned, env = {} } = {}) {
  if (GFX_IDS.includes(param)) return param;
  if (AUTO_TIERS.includes(setting)) return setting;
  const { coarse, minSide, memory, cores, saveData } = env;
  let tier = 'high';
  const lowMemory = Number.isFinite(memory) && memory <= 3;
  const fewTouchCores = coarse && Number.isFinite(cores) && cores <= 4;
  if (saveData || lowMemory || fewTouchCores) tier = 'low';
  else if (coarse && Number.isFinite(minSide) && minSide < 700) tier = 'mid';
  return AUTO_TIERS.indexOf(learned) > AUTO_TIERS.indexOf(tier) ? learned : tier;
}

export function readLearnedGfx({ storage = () => globalThis.localStorage, now = Date.now() } = {}) {
  try {
    const record = JSON.parse(storage().getItem(LEARNED_GFX_KEY));
    if (AUTO_TIERS.includes(record?.tier) && Number.isFinite(record.at) && record.at >= 0
      && record.at <= now && now - record.at < LEARNED_MAX_AGE) return record.tier;
  } catch {
    // 保存を拒む端末でも、端末情報だけで画質を選べるようにする。
  }
  return null;
}

export function writeLearnedGfx(tier, { storage = () => globalThis.localStorage, now = Date.now() } = {}) {
  if (!AUTO_TIERS.includes(tier)) return false;
  try {
    storage().setItem(LEARNED_GFX_KEY, JSON.stringify({ tier, at: now }));
    return true;
  } catch {
    return false;
  }
}

export function clearLearnedGfx({ storage = () => globalThis.localStorage } = {}) {
  try {
    storage().removeItem(LEARNED_GFX_KEY);
    return true;
  } catch {
    return false;
  }
}
