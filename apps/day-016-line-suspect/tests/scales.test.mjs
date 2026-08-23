import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCALES, SOURCES, rate, scaleRows } from '../lib/scales.js';

/* 目安は画面にも文書にも同じものを出すので、境目がずれると両方まとめて間違う。
   各指標の境目をちょうどの値と、そのすぐ外側で押さえる。 */

const g = (key, value) => rate(key, value).grade;

test('下りは用途が要求する量で切ってある', () => {
  assert.equal(g('dl', 300), 'A+');
  assert.equal(g('dl', 299.9), 'A');
  assert.equal(g('dl', 100), 'A');
  assert.equal(g('dl', 99.9), 'B');
  assert.equal(g('dl', 50), 'B');
  assert.equal(g('dl', 49.9), 'C');
  assert.equal(g('dl', 25), 'C');   // Netflixの4K推奨＝25Mbps
  assert.equal(g('dl', 24.9), 'D');
  assert.equal(g('dl', 5), 'D');    // NetflixのフルHD＝5Mbps
  assert.equal(g('dl', 4.9), 'F');
  assert.equal(g('dl', 0), 'F');
});

test('上りはビデオ会議の送信量で切ってある', () => {
  assert.equal(g('ul', 100), 'A+');
  assert.equal(g('ul', 30), 'A');
  assert.equal(g('ul', 10), 'B');
  assert.equal(g('ul', 5), 'C');    // Zoomの1080p送信=3.0Mbpsに余裕を持たせた位置
  assert.equal(g('ul', 4.9), 'D');
  assert.equal(g('ul', 2), 'D');
  assert.equal(g('ul', 1.9), 'F');
});

test('遅延は小さいほど良い向きで切ってある', () => {
  assert.equal(g('li', 20), 'A+');
  assert.equal(g('li', 20.1), 'A');
  assert.equal(g('li', 50), 'A');
  assert.equal(g('li', 50.1), 'B');
  assert.equal(g('li', 100), 'B');
  assert.equal(g('li', 150), 'C');
  assert.equal(g('li', 300), 'D');  // ITU-T G.114の片道150ms＝往復300ms
  assert.equal(g('li', 300.1), 'F');
  assert.equal(g('li', 5000), 'F');
});

test('ゆらぎは通話が崩れ始める30msをCの端に置く', () => {
  assert.equal(g('jit', 5), 'A+');
  assert.equal(g('jit', 10), 'A');
  assert.equal(g('jit', 20), 'B');
  assert.equal(g('jit', 30), 'C');
  assert.equal(g('jit', 30.1), 'D');
  assert.equal(g('jit', 51), 'F');
});

test('通信中の反応は増加量で切ってある（もとの採点と同じ）', () => {
  assert.equal(g('bloat', 5), 'A+');
  assert.equal(g('bloat', 30), 'A');
  assert.equal(g('bloat', 60), 'B');
  assert.equal(g('bloat', 200), 'C');
  assert.equal(g('bloat', 400), 'D');
  assert.equal(g('bloat', 401), 'F');
});

test('測れていない値に点は付けない', () => {
  for (const key of Object.keys(SCALES)) {
    assert.equal(rate(key, null).grade, '—', key);
    assert.equal(rate(key, undefined).grade, '—', key);
    assert.equal(rate(key, NaN).means, null, key);
  }
});

test('どの帯にも「できること」が書いてある（記号だけにしない）', () => {
  for (const key of Object.keys(SCALES)) {
    for (const [grade, , means] of SCALES[key].bands) {
      assert.ok(means && means.length > 5, `${key} の ${grade} に説明がない`);
    }
  }
});

test('知らない指標を渡したら黙って通さない', () => {
  assert.throws(() => rate('nope', 1), /知らない指標/);
});

test('目安表の範囲が上から下までつながっている', () => {
  const up = scaleRows('dl');
  assert.equal(up[0].range, '300 以上');
  assert.equal(up[1].range, '100 〜 300');
  assert.equal(up.at(-1).range, '5 未満');

  const down = scaleRows('li');
  assert.equal(down[0].range, '20 以下');
  assert.equal(down[1].range, '20 〜 50');
  assert.equal(down.at(-1).range, '300 超');
});

test('目安表の行数は帯の数と一致する', () => {
  for (const key of Object.keys(SCALES)) {
    assert.equal(scaleRows(key).length, SCALES[key].bands.length, key);
  }
});

test('しきい値の出典が付いている', () => {
  assert.ok(SOURCES.length >= 3);
  for (const s of SOURCES) {
    assert.match(s.url, /^https:\/\//);
    assert.ok(s.note.length > 5, s.name);
  }
});
