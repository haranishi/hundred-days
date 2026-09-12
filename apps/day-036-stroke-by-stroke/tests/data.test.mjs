import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shardName, shardsFor, createLoader } from '../lib/data.js';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readShard = (name) =>
  JSON.parse(fs.readFileSync(path.join(APP, 'data', 'kvg', `${name}.json`), 'utf8'));
/* 画面と同じで、まず索引を読んでから中身を取りに行く */
const serve = (url) => Promise.resolve(readShard(url.split('/').pop().replace('.json', '')));

test('shardName: 符号位置の上位バイトが16進2桁になる', () => {
  assert.equal(shardName(0x4e00), '4e');
  assert.equal(shardName(0x897f), '89');
  assert.equal(shardName(0x3042), '30');
  assert.equal(shardName(0x0021), '00');
});

test('shardsFor: 同じファイルはまとめて1回だけ', () => {
  assert.deepEqual(shardsFor([0x4e00, 0x4e8c, 0x897f]), ['4e', '89']);
});

test('strokesFor: 同じファイルの字はまとめて1回しか取りに行かない', async () => {
  const calls = [];
  const loader = createLoader({
    fetchJson: async (url) => {
      calls.push(url);
      return serve(url);
    },
  });
  const result = await loader.strokesFor(['西', '要']);
  assert.deepEqual(calls, ['data/kvg/index.json', 'data/kvg/89.json']);
  assert.equal(result.length, 2);
  assert.ok(result[0].strokes.length > 0);
});

test('strokesFor: 一度読んだファイルは覚えている', async () => {
  let count = 0;
  const loader = createLoader({
    fetchJson: async (url) => {
      if (!url.endsWith('index.json')) count += 1;
      return serve(url);
    },
  });
  await loader.strokesFor(['一']);
  await loader.strokesFor(['一', '万']);
  assert.equal(count, 1);
});

test('strokesFor: データが無い字は strokes が null', async () => {
  const loader = createLoader({ fetchJson: async (url) => (url.endsWith('index.json') ? { shards: ['85'] } : {}) });
  const [item] = await loader.strokesFor(['蘰']);
  assert.equal(item.char, '蘰');
  assert.equal(item.strokes, null);
});

/* 索引に無いファイルは取りに行かない。ここを取りに行くと、絵文字や異体字を
   1つ混ぜただけで404がコンソールに並ぶ。 */
test('strokesFor: 索引に無いファイルは要求しない', async () => {
  const asked = [];
  const loader = createLoader({
    fetchJson: async (url) => {
      asked.push(url);
      return serve(url);
    },
  });
  const [item] = await loader.strokesFor(['﨑']);
  assert.deepEqual(asked, ['data/kvg/index.json']);
  assert.equal(item.strokes, null);
});

test('strokesFor: 取得に失敗したら覚え込まず、次で取り直す', async () => {
  let attempts = 0;
  const loader = createLoader({
    fetchJson: async (url) => {
      if (url.endsWith('index.json')) return { shards: ['4e'] };
      attempts += 1;
      if (attempts === 1) throw new Error('500');
      return readShard('4e');
    },
  });
  await assert.rejects(() => loader.strokesFor(['一']));
  const [item] = await loader.strokesFor(['一']);
  assert.equal(attempts, 2);
  assert.ok(item.strokes.length > 0);
});

test('同梱データ: 画は「種別・パス」の組で、順番がそのまま筆順', () => {
  const shard = readShard('4e');
  const strokes = shard[(0x4e00).toString(16)];
  assert.equal(strokes.length, 1);
  assert.equal(strokes[0].length, 2);
  assert.match(strokes[0][1], /^M/);
  /* 三は3画で、KanjiVGの並び順が上から下 */
  const three = shard[(0x4e09).toString(16)];
  assert.equal(three.length, 3);
});

test('同梱データ: 索引は実際に置いてあるファイルと一致する', () => {
  const dir = path.join(APP, 'data', 'kvg');
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const onDisk = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .map((f) => f.replace('.json', ''))
    .sort();
  assert.deepEqual(index.shards, onDisk);
});

test('同梱データ: ひらがな・カタカナ・人名用漢字も入っている', () => {
  const kana = readShard('30');
  assert.ok(kana[(0x3042).toString(16)], 'あ');
  assert.ok(kana[(0x30a2).toString(16)], 'ア');
  assert.ok(readShard('90')[(0x908a).toString(16)], '邊');
});
