import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveView, wrapSegments, NOWRAP_WORDS } from '../lib/views.js';
import { MODELS } from '../lib/models/index.js';

const crane = MODELS.find((m) => m.id === 'crane');
const swan = MODELS.find((m) => m.id === 'swan');

test('effectiveView: the last view declared at or before the step, iso when none', () => {
  assert.deepEqual(crane.steps.map((_, i) => effectiveView(crane.steps, i)),
    ['flat', 'flat', 'iso', 'iso', 'flat', 'flat', 'flat', 'flat', 'flat', 'side']);
  assert.equal(effectiveView(swan.steps, 0), 'flat');
  assert.equal(effectiveView(swan.steps, 5), 'side');
  assert.equal(effectiveView([{}, {}], 1), 'iso');
  assert.equal(effectiveView([{ view: 'bogus' }], 0), 'iso');
  assert.equal(effectiveView([], 3), 'iso');
  assert.equal(effectiveView(crane.steps, 99), 'side', 'past the end uses the last step');
  assert.equal(effectiveView(crane.steps, -1), 'iso');
});

test('wrapSegments keeps the text unchanged when joined', () => {
  for (const m of MODELS) for (const s of m.steps) {
    for (const text of [s.title, s.text, s.tip].filter(Boolean)) {
      assert.equal(wrapSegments(text).map((p) => p.text).join(''), text);
    }
  }
});

// Every listed word in every step text must stay inside one piece, so the browser cannot break inside it.
test('wrapSegments never splits a listed word across pieces, in any model text', () => {
  const words = [...NOWRAP_WORDS].sort((a, b) => b.length - a.length);
  for (const m of MODELS) for (const s of m.steps) {
    for (const [text, tail] of [[s.title, 4], [s.text, 6], [s.tip ? `つまずきやすい点：${s.tip}` : '', 6]]) {
      if (!text) continue;
      const pieces = wrapSegments(text, tail);
      const bounds = new Set();
      let at = 0;
      for (const p of pieces) { at += p.text.length; bounds.add(at); }
      const hits = [];
      for (const w of words) for (let k = text.indexOf(w); k >= 0; k = text.indexOf(w, k + 1)) hits.push([k, k + w.length, w]);
      // Two listed words can overlap (胴の紙 / 紙の間): only one of them can be kept whole, so skip those.
      const alone = hits.filter(([a, b]) => !hits.some(([c, d]) => (c !== a || d !== b) && c < b && a < d && !(c <= a && b <= d) && !(a <= c && d <= b)));
      for (const [k, , w] of alone) {
        for (let b = k + 1; b < k + w.length; b++) {
          assert.ok(!bounds.has(b), `${m.id}:${s.id} splits「${w}」in「${text}」`);
        }
      }
    }
  }
});

test('wrapSegments marks the words and the sentence tails as nowrap', () => {
  const pieces = wrapSegments('ネクタイの結び目を折り上げます。');
  assert.ok(pieces.some((p) => p.nowrap && p.text === 'ネクタイ'));
  assert.ok(pieces.some((p) => p.nowrap && p.text === '結び目'));
  // The tail would start inside 折り上げます; it moves back to the start of the word
  assert.equal(pieces.at(-1).text, '折り上げます。');
  assert.equal(pieces.at(-1).nowrap, true);
  assert.deepEqual(wrapSegments(''), []);
});

test('the words reported as broken mid-word are listed', () => {
  for (const w of ['ネクタイ', '結び目', '折り上げ', '折り上げます', '右前', '仕組み', '花弁折り', '鳥の基本形', '青磁色', 'ポチ袋', '鶴']) {
    assert.ok(NOWRAP_WORDS.includes(w), w);
  }
});
