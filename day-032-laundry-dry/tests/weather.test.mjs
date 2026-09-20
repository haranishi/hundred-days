import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENDPOINT, buildUrl, parseCurrent, perHour, round3,
  fetchCurrent, clearCache, readCache, cacheId, DEFAULT_INTERVAL_SEC
} from '../lib/weather.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(resolve(HERE, 'fixtures/akita-current-day.json'), 'utf8'));
const rainy = JSON.parse(readFileSync(resolve(HERE, 'fixtures/akita-current-night-rain.json'), 'utf8'));

test('weather: 叩き先は Open-Meteo の1本だけ', () => {
  assert.equal(ENDPOINT, 'https://api.open-meteo.com/v1/forecast');
  const url = new URL(buildUrl({ lat: 39.7186, lon: 140.1024 }));
  assert.equal(url.origin, 'https://api.open-meteo.com');
  assert.equal(url.pathname, '/v1/forecast');
  assert.equal(url.searchParams.get('timezone'), 'Asia/Tokyo');
  assert.ok(url.searchParams.get('current').includes('et0_fao_evapotranspiration'));
});

/* この1本がこの改修の肝。将来の時刻の気象を取りに行かなければ、うっかり画面に出すこともできない。
   気象業務法17条の予報業務にしないための線なので、パラメータが増えたら必ず落とす */
test('weather: 将来の時刻の気象を取りに行かない', () => {
  const url = new URL(buildUrl({ lat: 39.7186, lon: 140.1024 }));
  for (const key of [
    'hourly', 'daily', 'minutely_15',
    'forecast_days', 'forecast_hours', 'forecast_minutely_15',
    'past_days', 'past_hours', 'past_minutes',
    'start_date', 'end_date', 'start_hour', 'end_hour'
  ]) {
    assert.equal(url.searchParams.has(key), false, `${key} を送っている＝将来の値が返ってくる`);
  }
  assert.deepEqual([...url.searchParams.keys()], ['latitude', 'longitude', 'current', 'timezone']);
});

test('weather: 座標は小数3桁に丸めて送る（現在地の精度をそのまま出さない）', () => {
  assert.equal(round3(39.71862345), 39.719);
  const url = new URL(buildUrl({ lat: 39.71862345, lon: 140.10239876 }));
  assert.equal(url.searchParams.get('latitude'), '39.719');
  assert.equal(url.searchParams.get('longitude'), '140.102');
});

/* 実測（2026-09-13・6地点）で current の interval は常に 900 秒＝直前15分ぶんの積算だった。
   同じ時刻の minutely_15 と一致し hourly とは一致しない。mm/h と取り違えると4分の1に見積もる */
test('weather: current の積算値を1時間あたりに直す', () => {
  assert.equal(perHour(0.12, 900), 0.48, '15分ぶん0.12mm は 0.48mm/h');
  assert.equal(perHour(0.9, 900), 3.6);
  assert.equal(perHour(0.5, 3600), 0.5, '1時間ぶんならそのまま');
  assert.equal(perHour(0.12), 0.48, `既定は ${DEFAULT_INTERVAL_SEC} 秒`);
  assert.equal(perHour(0.12, 0), 0.48, 'interval が壊れていたら既定に落とす');
  assert.equal(perHour(null, 900), 0);
});

test('weather: 応答から「いまの1時点」だけを取り出す', () => {
  const current = parseCurrent(fixture);
  assert.equal(current.time, '2026-09-13T12:00');
  assert.equal(current.intervalSec, 900);
  assert.equal(current.temp, 27.6);
  assert.equal(current.humidity, 51);
  assert.equal(current.et0PerHour, 0.48);
  assert.equal(current.precipPerHour, 0);
  assert.equal(current.isDay, true);
  // 取り出す項目を固定する。配列（＝時系列）が生えたらここで落ちる
  assert.deepEqual(Object.keys(current).sort(), [
    'cloud', 'et0PerHour', 'humidity', 'intervalSec', 'isDay',
    'precipPerHour', 'radiation', 'temp', 'time', 'wind'
  ]);
  assert.equal(Object.values(current).some(Array.isArray), false, '時系列が混ざっている');
});

test('weather: 雨と夜もそのまま読める', () => {
  const current = parseCurrent(rainy);
  assert.equal(current.precipPerHour, 3.6);
  assert.equal(current.et0PerHour, 0);
  assert.equal(current.isDay, false);
});

test('weather: 欠測は null、降水と ET0 は 0 として扱う', () => {
  const broken = {
    current: {
      time: '2026-09-13T12:00',
      interval: 900,
      temperature_2m: null,
      et0_fao_evapotranspiration: null,
      precipitation: null
    }
  };
  const current = parseCurrent(broken);
  assert.equal(current.temp, null);
  assert.equal(current.et0PerHour, 0, 'ET0 の欠測は0で計算を止めない');
  assert.equal(current.precipPerHour, 0);
});

test('weather: 中身が空なら例外にする（黙って空画面にしない）', () => {
  assert.throws(() => parseCurrent({}), /空/);
  assert.throws(() => parseCurrent({ current: {} }), /空/);
  assert.throws(() => parseCurrent({ hourly: { time: ['2026-09-13T12:00'] } }), /空/);
});

test('weather: 同じ座標は10分だけ持ち回して再通信しない', async () => {
  clearCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, status: 200, json: async () => fixture };
  };
  const args = { lat: 39.7186, lon: 140.1024, fetchImpl };
  await fetchCurrent(args);
  await fetchCurrent(args);
  assert.equal(calls, 1, '2回目も通信している');
  assert.ok(readCache(cacheId({ lat: 39.7186, lon: 140.1024 })), 'キャッシュに入っていない');
  clearCache();
});

test('weather: HTTPエラーは例外にする', async () => {
  clearCache();
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(
    () => fetchCurrent({ lat: 35, lon: 135, fetchImpl }),
    /503/
  );
});
