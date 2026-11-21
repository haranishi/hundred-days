// 端末内への保存と読み戻し。名前は STORAGE_NAME='sabakiba.v1'。壊れた保存は捨てて既定に戻す。
import { SPECIES_IDS } from './contract.js';
import { VALID_QUALITIES, VALID_SPEEDS, VALID_VIEWS } from './app-state.js';

export const STORAGE_NAME = 'sabakiba.v1';
export const STORAGE_VERSION = 1;

const isPlainObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** 保存対象の既定値を返す。 */
export function defaultPersisted() {
  return {
    v: STORAGE_VERSION,
    species: SPECIES_IDS[0],
    leftHanded: false,
    quality: 'auto',
    speed: 1,
    loop: true,
    view: 'cook',
    labels: false,
    speech: false,
    wake: true,
    progress: {},
    best: {},
  };
}

/** 状態から保存対象だけを抜き出して JSON 文字列にする。 */
export function serializePersisted(state) {
  const src = isPlainObj(state) ? state : {};
  const defaults = defaultPersisted();
  const payload = {
    v: STORAGE_VERSION,
    species: SPECIES_IDS.includes(src.species) ? src.species : defaults.species,
    leftHanded: typeof src.leftHanded === 'boolean' ? src.leftHanded : defaults.leftHanded,
    quality: VALID_QUALITIES.includes(src.quality) ? src.quality : defaults.quality,
    speed: VALID_SPEEDS.includes(src.speed) ? src.speed : defaults.speed,
    loop: typeof src.loop === 'boolean' ? src.loop : defaults.loop,
    view: VALID_VIEWS.includes(src.view) ? src.view : defaults.view,
    labels: typeof src.labels === 'boolean' ? src.labels : defaults.labels,
    speech: typeof src.speech === 'boolean' ? src.speech : defaults.speech,
    wake: typeof src.wake === 'boolean' ? src.wake : defaults.wake,
    progress: cleanProgress(src.progress),
    best: cleanBest(src.best),
  };
  return JSON.stringify(payload);
}

function cleanProgress(raw) {
  const out = {};
  if (!isPlainObj(raw)) return out;
  for (const [sp, step] of Object.entries(raw)) {
    if (SPECIES_IDS.includes(sp) && Number.isInteger(step) && step >= 0 && step < 100) {
      out[sp] = step;
    }
  }
  return out;
}

function cleanBest(raw) {
  const out = {};
  if (!isPlainObj(raw)) return out;
  for (const [sp, table] of Object.entries(raw)) {
    if (!SPECIES_IDS.includes(sp) || !isPlainObj(table)) continue;
    const clean = {};
    for (const [stepId, score] of Object.entries(table)) {
      if (/^[a-z0-9-]+$/.test(stepId) && Number.isFinite(score) && score >= 0 && score <= 100) {
        clean[stepId] = Math.round(score);
      }
    }
    if (Object.keys(clean).length > 0) out[sp] = clean;
  }
  return out;
}

/** 保存文字列を解析する。壊れた値・旧版は例外を出さず既定値と reset: true を返す。 */
export function parsePersisted(rawString) {
  const defaults = defaultPersisted();
  if (rawString === null || rawString === undefined || rawString === '') {
    return { ok: true, data: defaults, reset: false };
  }
  if (typeof rawString !== 'string') {
    return { ok: false, data: defaults, reset: true };
  }
  let parsed;
  try {
    parsed = JSON.parse(rawString);
  } catch {
    return { ok: false, data: defaults, reset: true };
  }
  if (!isPlainObj(parsed) || parsed.v !== STORAGE_VERSION) {
    return { ok: false, data: defaults, reset: true };
  }
  const data = {
    v: STORAGE_VERSION,
    species: SPECIES_IDS.includes(parsed.species) ? parsed.species : defaults.species,
    leftHanded: typeof parsed.leftHanded === 'boolean' ? parsed.leftHanded : defaults.leftHanded,
    quality: VALID_QUALITIES.includes(parsed.quality) ? parsed.quality : defaults.quality,
    speed: VALID_SPEEDS.includes(parsed.speed) ? parsed.speed : defaults.speed,
    loop: typeof parsed.loop === 'boolean' ? parsed.loop : defaults.loop,
    view: VALID_VIEWS.includes(parsed.view) ? parsed.view : defaults.view,
    labels: typeof parsed.labels === 'boolean' ? parsed.labels : defaults.labels,
    speech: typeof parsed.speech === 'boolean' ? parsed.speech : defaults.speech,
    wake: typeof parsed.wake === 'boolean' ? parsed.wake : defaults.wake,
    progress: cleanProgress(parsed.progress),
    best: cleanBest(parsed.best),
  };
  return { ok: true, data, reset: false };
}

function defaultStorage() {
  try {
    return typeof globalThis !== 'undefined' && globalThis.localStorage ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

/** ストレージから安全に読み込む。壊れていれば削除して既定値を返す。 */
export function loadPersisted(storage = defaultStorage()) {
  if (!storage || typeof storage.getItem !== 'function') {
    return defaultPersisted();
  }
  let raw = null;
  try {
    raw = storage.getItem(STORAGE_NAME);
  } catch {
    return defaultPersisted();
  }
  const result = parsePersisted(raw);
  if (result.reset && typeof storage.removeItem === 'function') {
    try {
      storage.removeItem(STORAGE_NAME);
    } catch {
      // 削除できない環境でも落とさない
    }
  }
  return result.data;
}

/** ストレージへ安全に保存する。失敗しても例外を出さない。 */
export function savePersisted(state, storage = defaultStorage()) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(STORAGE_NAME, serializePersisted(state));
    return true;
  } catch {
    return false;
  }
}
