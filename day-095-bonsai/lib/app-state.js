import { dateOf, nextSeasonDay } from './calendar.js';
import { CAMERA_LIMITS, DEFAULTS, GFX_IDS, LIGHT_IDS, POT_IDS, SPECIES_IDS, STYLE_IDS, TOOL_IDS } from './contract.js';

export const DEFAULT_SEED = 11;
export const SPECIES_NAMES = Object.freeze({ maple: '紅葉', pine: '黒松', plum: '梅' });

export function calendarState(day) {
  return dateOf(day);
}

export function daysToAdvance(step, day) {
  if (step === 'week') return 7;
  if (step === 'month') return 30;
  if (step === 'season') return nextSeasonDay(day) - day;
  return 0;
}

function unsigned(value, max) {
  if (!/^\d+$/.test(value ?? '')) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) && number <= max ? number : undefined;
}

function cameraFrom(value) {
  if (!value) return null;
  const parts = value.split(',');
  if (parts.length !== 3 || parts.some((part) => !part.trim())) return null;
  const [az, pol, dist] = parts.map(Number);
  if (![az, pol, dist].every(Number.isFinite)) return null;
  return {
    az: ((az + 180) % 360 + 360) % 360 - 180,
    pol: Math.max(CAMERA_LIMITS.polMin, Math.min(CAMERA_LIMITS.polMax, pol)),
    dist: Math.max(CAMERA_LIMITS.distMin, Math.min(CAMERA_LIMITS.distMax, dist)),
  };
}

export function launchOptions(search) {
  const params = new URLSearchParams(search);
  const option = (key, ids) => ids.find((id) => id === params.get(key));
  const species = option('species', SPECIES_IDS);
  const style = option('style', STYLE_IDS);
  const seed = unsigned(params.get('seed'), 0xffffffff);
  const day = unsigned(params.get('day'), Number.MAX_SAFE_INTEGER - 365);
  return {
    debug: params.get('debug') === '1',
    fresh: params.get('fresh') === '1',
    tips: params.get('tips') !== '0',
    gfx: option('gfx', GFX_IDS) ?? 'high',
    tool: option('tool', TOOL_IDS) ?? 'look',
    camera: cameraFrom(params.get('cam')),
    pot: option('pot', POT_IDS),
    light: option('light', LIGHT_IDS),
    day: day ?? 0,
    directsTree: [species, style, seed, day].some((value) => value !== undefined),
    seedling: { species: species ?? DEFAULTS.species, style: style ?? DEFAULTS.style, seed: seed ?? DEFAULT_SEED },
  };
}
