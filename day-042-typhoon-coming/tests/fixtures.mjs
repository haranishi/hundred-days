/* 実応答の固定資料を読み込むだけの共通部分。値はすべて 2026-09-18 15時／18時45分の発表そのまま。 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`fixtures/${name}`, import.meta.url)), 'utf8'));

export const rawTargetTc = read('bosai-typhoon-targetTc-20260918.json');
export const rawTimeseries = read('bosai-TC2630-probabilityTimeseries-20260918.json');
export const rawThrough = read('bosai-TC2630-probabilityThrough-20260918.json');
export const rawSpecifications = read('bosai-TC2630-specifications-20260918.json');
export const rawForecast = read('bosai-TC2630-forecast-20260918.json');
/* 並び順はキー順から取れないので、文字列のままも渡せるようにしておく */
export const rawAreaText = readFileSync(fileURLToPath(new URL('fixtures/area.json', import.meta.url)), 'utf8');
export const area = read('area.json');
export const class20relm = read('class20relm.json');
export const townsJson = JSON.parse(readFileSync(fileURLToPath(new URL('../data/towns.json', import.meta.url)), 'utf8'));
export const landText = readFileSync(fileURLToPath(new URL('../data/land.json', import.meta.url)), 'utf8');
export const landJson = JSON.parse(landText);

/** 気象庁のURLごとに固定資料を返す fetch の代わり */
export function stubFetch(overrides = {}) {
  const bodies = {
    'https://www.jma.go.jp/bosai/typhoon/data/targetTc.json': rawTargetTc,
    'https://www.jma.go.jp/bosai/typhoon/data/TC2630/probabilityTimeseries.json': rawTimeseries,
    'https://www.jma.go.jp/bosai/typhoon/data/TC2630/probabilityThrough.json': rawThrough,
    'https://www.jma.go.jp/bosai/typhoon/data/TC2630/specifications.json': rawSpecifications,
    'https://www.jma.go.jp/bosai/typhoon/data/TC2630/forecast.json': rawForecast,
    ...overrides,
  };
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    const body = bodies[url];
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
    if (body instanceof Error) throw body;
    if (typeof body === 'number') return { ok: false, status: body, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => body };
  };
  return { fetchImpl, seen };
}
