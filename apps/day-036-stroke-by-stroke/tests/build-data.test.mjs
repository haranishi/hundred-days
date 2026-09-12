import test from 'node:test';
import assert from 'node:assert/strict';
import { minifyPath, maxDrift, shardName, parseKanjiVG } from '../tools/build-data.mjs';

test('minifyPath: 小数1桁に丸めて余分な区切りを落とす', () => {
  assert.equal(minifyPath('M20.63,24.22c2.31,0.34,6.05,0.30,8.35,0.09'), 'M20.6,24.2c2.3.3,6,.3,8.3.1');
});

/* 置換だけで丸めると、-0.02 が 0 になったときに区切りの負号ごと消えて、
   3.6 と 0 が 3.60 という別の数になる。実際にこれで一度パスが壊れた。 */
test('minifyPath: 0に丸まる負の数でも区切りが残る', () => {
  const small = minifyPath('M0,0c3.6-0.02,5.77,0.24,7.57,0.49');
  assert.ok(!/3\.60/.test(small), small);
  assert.equal(maxDrift('M0,0c3.6-0.02,5.77,0.24,7.57,0.49', small) < 0.25, true);
});

test('minifyPath: 丸めの端数を次へ繰り越して終点をずらさない', () => {
  const d = 'M10,10c0.04,0.04,0.04,0.04,0.04,0.04c0.04,0.04,0.04,0.04,0.04,0.04';
  /* 繰り越しが無いと 0.04 が毎回 0 になり、画がまったく進まなくなる */
  assert.ok(maxDrift(d, minifyPath(d)) < 0.25);
});

test('maxDrift: 別のパスなら大きなずれとして出る', () => {
  const a = 'M0,0c10,0,20,0,30,0';
  const b = 'M0,0c10,0,20,0,30,5';
  assert.ok(maxDrift(a, b) > 1);
});

test('shardName: 画面側と同じ式でファイル名が決まる', () => {
  assert.equal(shardName(0x4e00), '4e');
  assert.equal(shardName(0x0021), '00');
});

test('parseKanjiVG: 異体字を取らず、画の種別とパスだけを拾う', () => {
  const xml = `
<kanjivg>
<kanji id="kvg:kanji_04e00">
<g id="kvg:04e00" kvg:element="一" kvg:radical="general">
	<path id="kvg:04e00-s1" kvg:type="㇐" d="M11,54c3,1,6,1,9,0"/>
</g>
</kanji>
<kanji id="kvg:kanji_04e00-Kaisho">
<g id="kvg:04e00-Kaisho">
	<path id="kvg:04e00-Kaisho-s1" d="M0,0c1,1,2,2,3,3"/>
</g>
</kanji>
</kanjivg>`;
  const parsed = parseKanjiVG(xml);
  assert.equal(parsed.size, 1);
  assert.deepEqual(parsed.get(0x4e00), [['㇐', 'M11,54c3,1,6,1,9,0']]);
});
