// 端末に残す設定・記録・途中の対局。読み書きはすべて try/catch で包み、読めなければ既定値で遊べるようにする。
// v2：盤の形（埋める字）が変わったので、記録と途中の一局は .v2 の鍵で数え直す。settings は v1 のまま引き継ぐ。
import { LEVELS } from './levels.js';
import { rankOrder } from './rank.js';

export const KEYS = Object.freeze({
  settings: 'kotoba-tsuji.settings.v1',
  records: 'kotoba-tsuji.records.v2',
  current: 'kotoba-tsuji.current.v2',
  recent: 'kotoba-tsuji.recent.v1', // v2-r3：最近出た答え（新しい順・最大 RECENT_MAX 件）
});

export const RECENT_MAX = 60;

// v1 の記録と途中の一局。v2 とは比べられないので、createStore のときに消す
export const LEGACY_KEYS = Object.freeze({
  records: 'kotoba-tsuji.records.v1',
  current: 'kotoba-tsuji.current.v1',
});

export const DEFAULT_SETTINGS = Object.freeze({ sound: true, autoCheck: true, motion: 'auto', seenCoach: false });

// localStorage は触っただけで例外を投げる環境がある（サンドボックスの iframe など）
function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function emptyRecords() {
  const levels = {};
  for (const lv of LEVELS) levels[lv.id] = { solved: 0, bestSec: null, bestRank: null };
  return { levels, total: 0 };
}

const isCount = (v) => Number.isInteger(v) && v >= 0;

const validDuel = (d) => Boolean(d) && Number.isInteger(d.theirs) && d.theirs >= 1 && d.theirs <= 86399;

export function createStore(storage = defaultStorage()) {
  // 書けたかどうかを返す。容量切れや拒否でも遊びは止めない
  const read = (key) => {
    try {
      const raw = storage?.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      if (!storage) return false;
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };
  const remove = (key) => {
    try {
      storage?.removeItem(key);
      return true;
    } catch {
      return false;
    }
  };
  for (const key of Object.values(LEGACY_KEYS)) remove(key);

  function getSettings() {
    const saved = read(KEYS.settings);
    const s = { ...DEFAULT_SETTINGS };
    if (saved && typeof saved === 'object') {
      for (const k of ['sound', 'autoCheck', 'seenCoach']) if (typeof saved[k] === 'boolean') s[k] = saved[k];
      if (saved.motion === 'auto' || saved.motion === 'reduce') s.motion = saved.motion;
    }
    return s;
  }

  function saveSettings(patch = {}) {
    const next = { ...getSettings() };
    for (const k of ['sound', 'autoCheck', 'seenCoach']) if (typeof patch[k] === 'boolean') next[k] = patch[k];
    if (patch.motion === 'auto' || patch.motion === 'reduce') next.motion = patch.motion;
    write(KEYS.settings, next);
    return next;
  }

  // total は終えた対局の数（降参も含む）。solved は腕前ごとに解き切った数（降参は数えない）
  function getRecords() {
    const saved = read(KEYS.records);
    const rec = emptyRecords();
    if (saved && typeof saved === 'object') {
      if (isCount(saved.total)) rec.total = saved.total;
      for (const lv of LEVELS) {
        const s = saved.levels?.[lv.id];
        if (!s || typeof s !== 'object') continue;
        if (isCount(s.solved)) rec.levels[lv.id].solved = s.solved;
        if (Number.isFinite(s.bestSec) && s.bestSec >= 0) rec.levels[lv.id].bestSec = s.bestSec;
        if (rankOrder(s.bestRank) !== Infinity) rec.levels[lv.id].bestRank = s.bestRank;
      }
    }
    return rec;
  }

  function recordResult({ levelId, seconds, rankKey, gaveUp = false }) {
    const records = getRecords();
    const slot = records.levels[levelId];
    records.total += 1;
    let newBestSec = false;
    let newBestRank = false;
    if (slot && !gaveUp) {
      slot.solved += 1;
      const sec = Math.max(0, Math.round(Number(seconds) || 0));
      if (slot.bestSec === null || sec < slot.bestSec) {
        slot.bestSec = sec;
        newBestSec = true;
      }
      if (rankOrder(rankKey) < rankOrder(slot.bestRank)) {
        slot.bestRank = rankKey;
        newBestRank = true;
      }
    }
    write(KEYS.records, records);
    return { newBest: newBestSec || newBestRank, newBestSec, newBestRank, records };
  }

  function resetRecords() {
    remove(KEYS.records);
    return getRecords();
  }

  function getCurrent() {
    const saved = read(KEYS.current);
    if (!saved || typeof saved !== 'object') return null;
    if (!LEVELS.some((lv) => lv.id === saved.level) || typeof saved.seed !== 'string') return null;
    if (!saved.game || typeof saved.game !== 'object') return null;
    const out = { level: saved.level, seed: saved.seed, game: saved.game };
    if (validDuel(saved.duel)) out.duel = { theirs: saved.duel.theirs };
    return out;
  }

  // duel：果たし状から受けて立った局の、差出人の秒（{ theirs }）。無いか不正なら持たない
  function saveCurrent({ level, seed, game, duel }) {
    const data = { level, seed, game };
    if (validDuel(duel)) data.duel = { theirs: duel.theirs };
    return write(KEYS.current, data);
  }

  function clearCurrent() {
    return remove(KEYS.current);
  }

  // 最近出た答え（新しい順）。形の崩れた保存は読める所だけ使う
  function getRecent() {
    const saved = read(KEYS.recent);
    if (!Array.isArray(saved)) return [];
    const out = [];
    for (const a of saved) if (typeof a === 'string' && a && !out.includes(a)) out.push(a);
    return out.slice(0, RECENT_MAX);
  }

  // 局を始めた盤の答えを前に積む。すでにある答えは前へ詰め直し、RECENT_MAX 件を超えた古いものは捨てる。新しい一覧を返す
  function pushRecent(answers) {
    const fresh = [];
    for (const a of Array.isArray(answers) ? answers : []) if (typeof a === 'string' && a && !fresh.includes(a)) fresh.push(a);
    const next = [...fresh, ...getRecent().filter((a) => !fresh.includes(a))].slice(0, RECENT_MAX);
    write(KEYS.recent, next);
    return next;
  }

  // 書けるかどうか（「この端末では記録を残せぬ」の案内に使う）
  function canPersist() {
    const probe = 'kotoba-tsuji.probe';
    try {
      if (!storage) return false;
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  }

  return {
    getSettings, saveSettings, getRecords, recordResult, resetRecords, getCurrent, saveCurrent, clearCurrent, getRecent, pushRecent, canPersist,
  };
}
