import { CATS, unlockedIds } from './cats.js';

const STORE_NAME = 'patanyan.v1';
const DAILY_KEEP = 14;
export const STAMPS = Object.freeze([10, 25, 50, 100]);

export function defaults() {
  return { best: 0, daily: {}, fishTotal: 0, cat: 'chatora', muted: false, stamps: [], unlocked: ['chatora'], mode: 'daily' };
}

function sanitize(raw) {
  const d = defaults();
  if (!raw || typeof raw !== 'object') return d;
  const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const daily = {};
  if (raw.daily && typeof raw.daily === 'object') {
    for (const [k, v] of Object.entries(raw.daily)) if (/^\d{8}$/.test(k)) daily[k] = num(v);
  }
  const fishTotal = num(raw.fishTotal);
  const cat = CATS.some((c) => c.id === raw.cat) ? raw.cat : d.cat;
  return {
    best: num(raw.best),
    daily,
    fishTotal,
    cat: fishTotal >= CATS.find((c) => c.id === cat).need ? cat : d.cat,
    muted: raw.muted === true,
    stamps: Array.isArray(raw.stamps) ? STAMPS.filter((s) => raw.stamps.includes(s)) : [],
    unlocked: unlockedIds(fishTotal),
    mode: raw.mode === 'any' ? 'any' : 'daily',
  };
}

// localStorage は、無い・使うと例外・壊れた値、のどれでも起きる。どの場合も遊べることを優先して黙って既定値に戻す
export function createStore(storage) {
  return {
    load() {
      try {
        const text = storage && storage.getItem(STORE_NAME);
        return text ? sanitize(JSON.parse(text)) : defaults();
      } catch {
        return defaults();
      }
    },
    save(profile) {
      try {
        if (!storage) return false;
        storage.setItem(STORE_NAME, JSON.stringify(profile));
        return true;
      } catch {
        return false;
      }
    },
  };
}

// 1回の結果を記録に足す。記録は入力を壊さず新しい値で返す
export function recordRun(profile, { mode, dateKey, score, fish }) {
  const next = { ...profile, daily: { ...profile.daily } };
  let prev;
  if (mode === 'daily') {
    const k = String(dateKey);
    prev = next.daily[k] || 0;
    if (score > prev) next.daily[k] = score;
    const keys = Object.keys(next.daily).sort();
    while (keys.length > DAILY_KEEP) delete next.daily[keys.shift()];
  } else {
    prev = next.best;
    if (score > prev) next.best = score;
  }
  const isNewBest = score > prev && score > 0;
  const bestNow = Math.max(prev, score);
  const reached = STAMPS.filter((s) => score >= s);
  const firstStamps = reached.filter((s) => !profile.stamps.includes(s));
  next.stamps = STAMPS.filter((s) => profile.stamps.includes(s) || reached.includes(s));
  next.fishTotal = profile.fishTotal + fish;
  next.unlocked = unlockedIds(next.fishTotal);
  return { profile: next, isNewBest, best: bestNow, reached, firstStamps };
}
