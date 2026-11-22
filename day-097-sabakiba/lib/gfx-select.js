import { AUTO_TIERS, measuredTier } from './gfx.js';

export const STORAGE_NAME = 'sabakiba.v1.gfx.learned';
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export function deviceInfo(host = globalThis) {
  const nav = host.navigator ?? {};
  const screen = host.screen ?? {};
  return {
    hardwareConcurrency: nav.hardwareConcurrency, deviceMemory: nav.deviceMemory,
    minSide: Math.min(screen.width ?? Infinity, screen.height ?? Infinity),
    userAgent: nav.userAgent || '', touchPoints: nav.maxTouchPoints || 0,
    coarse: host.matchMedia?.('(pointer: coarse)').matches ?? false, saveData: nav.connection?.saveData === true,
  };
}

export function resolveGfx({ setting = 'auto', env = {}, learned, startupFps } = {}) {
  if (AUTO_TIERS.includes(setting)) return setting;
  const { deviceMemory: memory, hardwareConcurrency: cores, minSide } = env;
  const ua = env.userAgent || '';
  const mobile = env.coarse || /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    || (/Macintosh/i.test(ua) && env.touchPoints > 1);
  let tier = 'high';
  if (env.saveData || (memory > 0 && memory <= 3) || (cores > 0 && cores <= (mobile ? 4 : 2))) tier = 'light';
  else if ((mobile && (minSide < 700 || !(cores >= 8))) || (memory > 0 && memory <= 4)
    || !(cores >= 6)) tier = 'standard';
  if (AUTO_TIERS.indexOf(learned) > AUTO_TIERS.indexOf(tier)) tier = learned;
  return measuredTier(tier, startupFps);
}

export function readLearnedGfx({ storage = () => globalThis.localStorage, now = Date.now() } = {}) {
  try {
    const raw = storage().getItem(STORAGE_NAME);
    if (!raw || raw.length > 256) return null;
    const data = JSON.parse(raw);
    if (AUTO_TIERS.includes(data?.tier) && Number.isSafeInteger(data.at) && data.at >= 0
      && data.at <= now && now - data.at < MAX_AGE) return data.tier;
  } catch {
    // 保存を拒否した端末は、起動時の計測で選ぶ。
  }
  return null;
}

export function writeLearnedGfx(tier, { storage = () => globalThis.localStorage, now = Date.now() } = {}) {
  if (!AUTO_TIERS.includes(tier)) return false;
  try {
    // 別のタブがすでに軽い設定を記録していれば、その記録を優先する。
    if (AUTO_TIERS.indexOf(readLearnedGfx({ storage, now })) > AUTO_TIERS.indexOf(tier)) return true;
    storage().setItem(STORAGE_NAME, JSON.stringify({ tier, at: now }));
    return true;
  } catch {
    return false;
  }
}
