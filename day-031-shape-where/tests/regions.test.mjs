import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGIONS, regionById, regionHint, regionOfPref } from '../lib/regions.js';

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ALL_CODES = Array.from({ length: 47 }, (_, index) => String(index + 1).padStart(2, '0'));

test('regions: 47県がちょうど1つの地方に入る', () => {
  const seen = REGIONS.flatMap((region) => region.prefs);
  assert.equal(seen.length, 47, `県コードの数が47でない: ${seen.length}`);
  assert.equal(new Set(seen).size, 47, '同じ県が2つの地方に入っている');
  assert.deepEqual([...seen].sort(), ALL_CODES, '01〜47がそろっていない');
});

test('regions: 地方のidとlabelが重複しない', () => {
  assert.equal(new Set(REGIONS.map((region) => region.id)).size, REGIONS.length);
  assert.equal(new Set(REGIONS.map((region) => region.label)).size, REGIONS.length);
  for (const region of REGIONS) assert.ok(region.prefs.length >= 1, `${region.id} に県がない`);
});

test('regions: regionOfPref は県コードから地方を引き、範囲外は null', () => {
  assert.equal(regionOfPref('05').id, 'tohoku');
  assert.equal(regionOfPref('13').id, 'kanto');
  assert.equal(regionOfPref('24').id, 'kinki', '三重県は近畿に入れる');
  assert.equal(regionOfPref('47').id, 'kyushu');
  assert.equal(regionOfPref('48'), null);
  assert.equal(regionOfPref(''), null);
  // 県コードは必ず2桁の文字列で渡す。数値の 5 は '05' に整えられないので引けない
  assert.equal(regionOfPref(5), null);
  assert.equal(regionOfPref('5'), null);
});

test('regions: regionById と regionHint', () => {
  assert.equal(regionById('shikoku').label, '四国');
  assert.equal(regionById('nowhere'), null);
  assert.equal(regionHint('05'), '東北地方');
  assert.equal(regionHint('01'), '北海道', '北海道に「地方」は付けない');
  assert.equal(regionHint('40'), '九州・沖縄地方');
  assert.equal(regionHint('99'), '');
});

/* 同梱データがあるときだけ。tools/build-data.mjs を走らせる前でもテストは通る */
const prefecturesPath = resolve(APP_DIR, 'data/prefectures.json');
test('regions: 同梱データの region が地方区分と一致する', { skip: !existsSync(prefecturesPath) && '同梱データ未生成' }, () => {
  const prefectures = JSON.parse(readFileSync(prefecturesPath, 'utf8'));
  assert.deepEqual(prefectures.items.map((item) => item.code), ALL_CODES, 'コード順に47件並んでいない');
  for (const item of prefectures.items) {
    assert.equal(item.region, regionOfPref(item.code).id, `${item.name} の region がずれている`);
    assert.ok(item.name.endsWith('都') || item.name.endsWith('道') || item.name.endsWith('府') || item.name.endsWith('県'));
  }
  const counts = new Map();
  for (const item of prefectures.items) counts.set(item.region, (counts.get(item.region) ?? 0) + 1);
  for (const region of REGIONS) assert.equal(counts.get(region.id), region.prefs.length, `${region.id} の県数が合わない`);
});
