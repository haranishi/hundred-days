import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENDPOINT, buildUrl, parseForecast, round3, fetchForecast, clearCache, readCache, cacheId
} from '../lib/weather.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(resolve(HERE, 'fixtures/akita-2026-09-08.json'), 'utf8'));

test('weather: 叩き先は Open-Meteo の1本だけ', () => {
  assert.equal(ENDPOINT, 'https://api.open-meteo.com/v1/forecast');
  const url = new URL(buildUrl({ lat: 39.7186, lon: 140.1024 }));
  assert.equal(url.origin, 'https://api.open-meteo.com');
  assert.equal(url.searchParams.get('timezone'), 'Asia/Tokyo');
  assert.equal(url.searchParams.get('forecast_days'), '3');
  assert.ok(url.searchParams.get('hourly').includes('et0_fao_evapotranspiration'));
  assert.ok(url.searchParams.get('daily').includes('sunset'));
});

test('weather: 座標は小数3桁に丸めて送る（現在地の精度をそのまま出さない）', () => {
  assert.equal(round3(39.71862345), 39.719);
  const url = new URL(buildUrl({ lat: 39.71862345, lon: 140.10239876 }));
  assert.equal(url.searchParams.get('latitude'), '39.719');
  assert.equal(url.searchParams.get('longitude'), '140.102');
});

test('weather: 応答を1時間1件の行に組み替える', () => {
  const { hours, sunsets } = parseForecast(fixture);
  assert.equal(hours.length, 72);
  assert.equal(sunsets[0], '2026-09-08T18:00');
  const noon = hours.find((hour) => hour.time === '2026-09-08T11:00');
  assert.equal(noon.temp, 27.3);
  assert.equal(noon.humidity, 70);
  assert.equal(noon.et0, 0.48);
  assert.equal(noon.precip, 0);
  assert.equal(noon.isDay, 1);
});

test('weather: 欠測は null、降水と ET0 は 0 として扱う', () => {
  const broken = {
    hourly: {
      time: ['2026-09-08T09:00'],
      temperature_2m: [null],
      et0_fao_evapotranspiration: [null],
      precipitation: [null]
    },
    daily: { sunset: [] }
  };
  const { hours } = parseForecast(broken);
  assert.equal(hours[0].temp, null);
  assert.equal(hours[0].et0, 0, 'ET0 の欠測は0で計算を止めない');
  assert.equal(hours[0].precip, 0);
});

test('weather: 中身が空なら例外にする（黙って空画面にしない）', () => {
  assert.throws(() => parseForecast({}), /空/);
  assert.throws(() => parseForecast({ hourly: { time: [] } }), /空/);
});

test('weather: 同じ座標は10分だけ持ち回して再通信しない', async () => {
  clearCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, status: 200, json: async () => fixture };
  };
  const args = { lat: 39.7186, lon: 140.1024, fetchImpl };
  await fetchForecast(args);
  await fetchForecast(args);
  assert.equal(calls, 1, '2回目も通信している');
  assert.ok(readCache(cacheId({ lat: 39.7186, lon: 140.1024 })), 'キャッシュに入っていない');
  clearCache();
});

test('weather: HTTPエラーは例外にする', async () => {
  clearCache();
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(
    () => fetchForecast({ lat: 35, lon: 135, fetchImpl }),
    /503/
  );
});
