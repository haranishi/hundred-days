import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../lib/segment.js';
import { mulberry32 } from '../lib/rng.js';
import { makeImage, fillCircle, fillRect, hex, chick } from './_img.mjs';

const families = (a) => a.layers.map((l) => l.family);

test('白い紙のひよこは、黄・黒・オレンジ・ピンクに分かれ、背景が消える', () => {
  const a = analyze(chick(), { difficulty: 'normal' });
  assert.equal(a.error, undefined);
  assert.equal(a.layers[0].family, 'yellow');
  for (const fam of ['black', 'orange', 'pink']) assert.ok(families(a).includes(fam), `${fam} がない: ${families(a)}`);
  const want = Math.PI * 50 * 50 + 18 * 12;
  assert.ok(Math.abs(a.foregroundPx - want) / want < 0.08, `前景 ${a.foregroundPx}`);
  assert.deepEqual([a.bbox.x, a.bbox.y], [50, 40]);
  assert.equal(a.labels.length, a.width * a.height);
});

test('透過PNGは、透明な所を背景にする', () => {
  const img = makeImage(100, 100, [0, 0, 0, 0]);
  fillRect(img, 30, 30, 70, 70, hex('#E53935'));
  const a = analyze(img);
  assert.deepEqual(families(a), ['red']);
  assert.equal(a.foregroundPx, 1600);
  assert.deepEqual(a.bbox, { x: 30, y: 30, w: 40, h: 40 });
});

test('灰色のむらがある紙でも、紙だけを背景にする', () => {
  const img = makeImage(160, 160);
  const rnd = mulberry32(7);
  for (let y = 0; y < 160; y++) {
    for (let x = 0; x < 160; x++) {
      const v = Math.round(185 + (x / 160) * 55 + (rnd() - 0.5) * 16);
      img.data.set([v, v, v - 4, 255], (y * 160 + x) * 4);
    }
  }
  fillCircle(img, 80, 80, 40, hex('#1E88E5'));
  const a = analyze(img);
  assert.deepEqual(families(a), ['blue']);
  const want = Math.PI * 40 * 40;
  assert.ok(Math.abs(a.foregroundPx - want) / want < 0.05, `前景 ${a.foregroundPx}`);
});

test('何も描いていない紙は no-foreground', () => {
  assert.deepEqual(analyze(makeImage(100, 100)), { error: 'no-foreground' });
  const faint = makeImage(100, 100);
  fillRect(faint, 10, 10, 13, 13, hex('#141414'));
  assert.deepEqual(analyze(faint), { error: 'no-foreground' });
});

test('bgSeeds の点から、その色を背景として消す', () => {
  const img = makeImage(120, 120);
  fillRect(img, 20, 20, 100, 100, hex('#43A047'));
  fillRect(img, 50, 50, 70, 70, hex('#E53935'));
  const before = analyze(img);
  assert.ok(families(before).includes('red'));
  const after = analyze(img, { bgSeeds: [{ x: 60, y: 60 }] });
  assert.ok(!families(after).includes('red'), `${families(after)}`);
  assert.equal(before.foregroundPx - after.foregroundPx, 400);
});

test('同じ入力には同じ出力を返す', () => {
  const img = chick();
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const a = analyze(img, { difficulty, tolerance: 20 });
    const b = analyze(chick(), { difficulty, tolerance: 20 });
    assert.deepEqual(a.layers, b.layers);
    assert.deepEqual(Array.from(a.labels), Array.from(b.labels));
  }
});
