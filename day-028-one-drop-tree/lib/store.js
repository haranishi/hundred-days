import { isDateString } from './days.js';

export const STORAGE_NAME = 'day028.tree.v1';
const VERSION = 1;
const MAX_DAYS = 4000;

export function makeSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return (value[0] % 2147483647) + 1;
  }
  return Math.floor(Math.random() * 2147483647) + 1;
}

export function initialRecord(seed = makeSeed()) {
  return { seed, plantedOn: null, wateredDays: [] };
}

function validSeed(seed) {
  return Number.isInteger(seed) && seed >= 1 && seed <= 2147483647;
}

function normalize(raw) {
  const wateredDays = Array.isArray(raw.wateredDays)
    ? [...new Set(raw.wateredDays.filter(isDateString))].sort().slice(-MAX_DAYS)
    : [];
  const plantedOn = isDateString(raw.plantedOn) ? raw.plantedOn : (wateredDays[0] ?? null);
  return { seed: raw.seed, plantedOn, wateredDays };
}

export function load(storage, createSeed = makeSeed) {
  if (!storage) return { record: initialRecord(createSeed()), canSave: false, recovered: false };
  let raw;
  try { raw = storage.getItem(STORAGE_NAME); }
  catch { return { record: initialRecord(createSeed()), canSave: false, recovered: false }; }
  if (raw === null) return { record: initialRecord(createSeed()), canSave: true, recovered: false };
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.v !== VERSION || !validSeed(parsed.seed)) throw new Error('invalid');
    return { record: normalize(parsed), canSave: true, recovered: false };
  } catch {
    return { record: initialRecord(createSeed()), canSave: true, recovered: true };
  }
}

export function serialize(record, now = new Date()) {
  const clean = normalize(record);
  return JSON.stringify({ v: VERSION, seed: clean.seed, plantedOn: clean.plantedOn, wateredDays: clean.wateredDays, updatedAt: now.toISOString() });
}

export function save(storage, record, now = new Date()) {
  try {
    storage.setItem(STORAGE_NAME, serialize(record, now));
    return { saved: true };
  } catch {
    return { saved: false };
  }
}
