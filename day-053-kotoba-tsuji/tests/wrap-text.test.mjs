// 語の途中で折り返さない（v2-r3）：切れ目は句読点・かっこの前後と「助詞のあと」だけ。
// ブラウザを使わないテスト（code.test.mjs と同じく test:e2e で流す。tests/unit は今回エンジン側の持ち場のため、ここに置いた）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phraseSegments, PARTICLES } from '../lib/ui/wrap.js';
import { TEXT } from '../lib/ui/copy.js';
import { WORDS } from '../lib/words-source.js';

const HIRA = /[ぁ-ゟ]/;
const KANJI_KATA = /[㐀-䶿一-鿿々〆ァ-ヺーㇰ-ㇿ]/;

// 切れ目のうち「助詞でないひらがな｜漢字・カタカナ」になっているもの
function badCuts(text) {
  const segs = phraseSegments(text);
  assert.equal(segs.join(''), text, '切っても元の文に戻る');
  const bad = [];
  for (let i = 0; i < segs.length - 1; i++) {
    const a = [...segs[i]];
    const last = a[a.length - 1];
    const next = [...segs[i + 1]][0];
    if (HIRA.test(last) && KANJI_KATA.test(next) && !PARTICLES.has(last)) bad.push(`${segs[i]}｜${segs[i + 1]}`);
  }
  return bad;
}

function keepsWhole(text, word) {
  const segs = phraseSegments(text);
  let pos = 0;
  const cuts = new Set(segs.slice(0, -1).map((s) => (pos += [...s].length)));
  const start = [...text.slice(0, text.indexOf(word))].length;
  for (let k = start + 1; k < start + [...word].length; k++) assert.ok(!cuts.has(k), `「${word}」の途中で切れている: ${segs.join('|')}`);
}

test('見た目評価で割れていた語（言い伝え・たたき上げ・書き入れる・マスの数）を割らない', () => {
  keepsWhole('赤ちゃんを運んでくるという言い伝えの、白く大きな鳥なり', '言い伝え');
  keepsWhole('腕一本で物をこしらえる、たたき上げの技の持ち主じゃ', 'たたき上げ');
  keepsWhole('両方の言葉に合う一字を、下の五十音盤で書き入れるべし。', '書き入れる');
  const note = TEXT.select.about;
  assert.ok(!phraseSegments(note).some((s) => s === '数。'), `「数。」だけを行に残さない: ${phraseSegments(note).join('|')}`);
  assert.ok(!phraseSegments('「吟味」で確かめるがよい。').some((s) => s.startsWith('で')), '閉じかっこの後の助詞を行頭に送らない');
});

test('単語帳の全問と画面の長い文で、「助詞でないひらがな｜漢字」の切れ目が0件', () => {
  const texts = WORDS.map((w) => w.c);
  const walk = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(walk) : v && typeof v === 'object' ? Object.values(v).flatMap(walk) : []);
  texts.push(...walk(TEXT).filter((t) => [...t].length >= 12));
  assert.ok(texts.length > 600);
  const bad = texts.flatMap((t) => badCuts(t).map((b) => `${b}（${t}）`));
  assert.deepEqual(bad, []);
});
