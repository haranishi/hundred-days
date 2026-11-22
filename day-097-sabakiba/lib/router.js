// ハッシュ経路（#/…）と撮影・試験用クエリを読みます。魚が分かる場合は手順番号を補正します。
import { SPECIES_IDS } from './contract.js';
import { VALID_QUALITIES } from './app-state.js';

/** URL の search と hash 末尾の ?… を合わせて解析する。 */
export function parseQueryParams(search = '', hash = '') {
  const merged = new URLSearchParams();
  const readInto = (qs) => {
    if (!qs) return;
    const clean = qs.startsWith('?') ? qs.slice(1) : qs;
    if (!clean) return;
    const params = new URLSearchParams(clean);
    for (const [k, v] of params.entries()) merged.set(k, v);
  };
  readInto(typeof search === 'string' ? search : '');
  if (typeof hash === 'string') {
    const qIdx = hash.indexOf('?');
    if (qIdx >= 0) readInto(hash.slice(qIdx + 1));
  }

  const rawSp = merged.get('sp');
  const sp = rawSp && SPECIES_IDS.includes(rawSp) ? rawSp : null;

  const rawStep = merged.get('step');
  let step = null;
  if (rawStep !== null && /^\d+$/.test(rawStep)) {
    step = Math.min(Number(rawStep), Number.MAX_SAFE_INTEGER);
  }

  const rawHand = merged.get('hand');
  const hand = rawHand === 'L' || rawHand === 'R' ? rawHand : null;

  const rawGfx = merged.get('gfx');
  const gfx = rawGfx && VALID_QUALITIES.includes(rawGfx) ? rawGfx : null;

  const rawSeed = merged.get('seed');
  const seed = rawSeed !== null && rawSeed.trim() !== '' ? rawSeed.trim() : null;

  const rawT = merged.get('t');
  let t = null;
  if (rawT !== null && rawT !== '') {
    const n = Number(rawT);
    if (Number.isFinite(n)) t = Math.min(1, Math.max(0, n));
  }

  const rawDebug = merged.get('debug');
  const debug = rawDebug === '1' || rawDebug === 'true';

  const rawGl = merged.get('gl');
  const gl = rawGl === 'off' ? 'off' : null;

  return { sp, step, hand, gfx, seed, t, debug, gl };
}

/** ハッシュ文字列を経路オブジェクトに解析する。手順番号 <n> は 1 始まり（1手順目 → step: 0）。 */
export function parseRoute(hash = '', validSpecies = SPECIES_IDS) {
  if (typeof hash !== 'string') return { name: 'home', valid: false };
  const noHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const qIdx = noHash.indexOf('?');
  const rawPath = qIdx >= 0 ? noHash.slice(0, qIdx) : noHash;
  const trimmed = rawPath.trim();

  if (trimmed === '' || trimmed === '/') {
    return { name: 'home', valid: true };
  }

  // 先頭の / を必須にし、末尾の余分な / は許容する
  if (!trimmed.startsWith('/')) {
    return { name: 'home', valid: false };
  }
  const parts = trimmed.replace(/\/+$/, '').split('/').slice(1);
  if (parts.length === 0 || (parts.length === 1 && parts[0] === '')) {
    return { name: 'home', valid: true };
  }

  if (parts[0] === 'safety' && parts.length === 1) {
    return { name: 'safety', valid: true };
  }

  if (parts[0] === 'fish' && parts.length === 2) {
    if (validSpecies.includes(parts[1])) {
      return { name: 'intro', species: parts[1], valid: true };
    }
    return { name: 'home', valid: false };
  }

  if (parts[0] === 'fish' && parts.length === 3) {
    const [, species, numStr] = parts;
    if (!validSpecies.includes(species)) return { name: 'home', valid: false };
    const number = /^\d+$/.test(numStr) ? Math.min(Number(numStr), Number.MAX_SAFE_INTEGER) : 0;
    return { name: 'guide', species, step: Math.max(0, number - 1), valid: number > 0 && String(number) === numStr };
  }

  if (parts[0] === 'done' && parts.length === 2) {
    if (validSpecies.includes(parts[1])) {
      return { name: 'done', species: parts[1], valid: true };
    }
    return { name: 'home', valid: false };
  }

  if (parts[0] === 'parts' && parts.length === 2) {
    if (validSpecies.includes(parts[1])) {
      return { name: 'parts', species: parts[1], valid: true };
    }
    return { name: 'home', valid: false };
  }

  return { name: 'home', valid: false };
}

/** 表示できる手順にそろえます。同じオブジェクトなら、履歴の書き換えは不要です。 */
export function normalizeRoute(route, totalSteps) {
  if (!route || (['guide', 'intro', 'parts', 'done'].includes(route.name) && !SPECIES_IDS.includes(route.species))) {
    return { name: 'home', valid: true };
  }
  if (route.name === 'guide') {
    const last = Number.isInteger(totalSteps) ? Math.max(0, totalSteps - 1) : 0;
    const step = Number.isInteger(route.step) ? Math.min(last, Math.max(0, route.step)) : 0;
    return route.valid !== false && step === route.step ? route : { ...route, step, valid: true };
  }
  return route.valid === false ? { name: 'home', valid: true } : route;
}

/** 経路オブジェクトから正規のハッシュ文字列を生成する。 */
export function formatRoute(route) {
  if (!route || typeof route !== 'object') return '#/';
  switch (route.name) {
    case 'home':
      return '#/';
    case 'safety':
      return '#/safety';
    case 'intro':
      return SPECIES_IDS.includes(route.species) ? `#/fish/${route.species}` : '#/';
    case 'guide': {
      if (!SPECIES_IDS.includes(route.species)) return '#/';
      const idx = Number.isInteger(route.step) && route.step >= 0 ? route.step : 0;
      return `#/fish/${route.species}/${idx + 1}`;
    }
    case 'done':
      return SPECIES_IDS.includes(route.species) ? `#/done/${route.species}` : '#/';
    case 'parts':
      return SPECIES_IDS.includes(route.species) ? `#/parts/${route.species}` : '#/';
    default:
      return '#/';
  }
}

/** 初期表示時の経路とパラメータを統合して解決する。 */
export function resolveInitialLocation(search = '', hash = '', validSpecies = SPECIES_IDS) {
  const params = parseQueryParams(search, hash);
  let route = parseRoute(hash, validSpecies);
  // ハッシュが空または入口で、撮影・試験用 ?sp= が指定されている場合はガイドを直接開く
  const hashHasExplicitPath = typeof hash === 'string' && hash.replace(/^#/, '').split('?')[0].replace(/\//g, '').length > 0;
  if (!hashHasExplicitPath && params.sp) {
    route = {
      name: 'guide',
      species: params.sp,
      step: params.step !== null ? params.step : 0,
      valid: true,
    };
  }
  return { route, params };
}
