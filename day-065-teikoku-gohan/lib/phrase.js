/* 日本語の文を折り返すとき、語の途中で切らないためのかたまり分け。
   料理名・駅や場所の名前・数と単位・『』「」で囲んだ名前・工程アイコンの並びを1つのかたまりにし、
   画面ではそれを white-space:nowrap の span で包む（それ以外の所は、ふつうどおりどこでも折れる）。
   word-break:auto-phrase は語の途中で割ることがあり、iPhone の Safari が対応していないので使わない。 */
import { DISHES, MYSTERY_DISH } from './recipes.js';

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DISH_NAMES = [...new Set([...Object.values(DISHES), MYSTERY_DISH])].sort((a, b) => b.length - a.length);

const PATTERNS = [
  '『[^』]+』[）)]?',
  '「[^」]+」',
  '(?:[🔪🔥🍲])?(?:切る|焼く|煮る)駅(?:（[^）]+）)?(?:の手前)?',
  '配膳駅(?:の手前)?',
  '配膳の手前(?:（[^）]+）)?',
  '(?:分岐|合流)の手前',
  '出庫線',
  '[🔪🔥🍲](?:→[🔪🔥🍲])*(?: だけ)?',
  '(?:合計|締切|ほかでも|あと|自己ベスト )?\\d+(?:分遅れ|分以内|分|つ|番目|か所)',
  '工程違い\\d*',
  '道のり\\d+分',
  '(?:焦げ|遅れ)\\d+',
  '★+\\d?',
  ...DISH_NAMES.map(escape),
];
const RE = new RegExp(PATTERNS.join('|'), 'gu');

// [{ text, keep }] の並び。つなげると元の文に戻る
export function phraseSegments(text) {
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(RE)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), keep: false });
    out.push({ text: m[0], keep: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), keep: false });
  return out;
}

/* 文節の切れ目だけで折り返すためのかたまり分け（phraseSegments の上に重ねる）。
   名前・数と単位などは phraseSegments が1つのかたまりにする。ほかの文字は、次の所だけ折り返してよい所にする。
   ・句読点・閉じ括弧のあと、開き括弧の前、空白のまわり
   ・ひらがな → カタカナ・英数字・絵文字（別の語に変わる所）
   ・助詞で終わるひらがな → 漢字（「どちらを｜先に」「列車は｜待たされる」）。
     送りがなの所（「焼き｜場」「区間にいた｜時間」）では切らない。語の途中で割ると、「ど／ちら」のように読みにくい。
   かたまりの直後に続くひらがな（「ステーキが」「5つの」の「が」「の」）は、そのかたまりに付ける（助詞だけが行頭に来ない）。
   word-break:auto-phrase は語の途中で割ることがあり、iPhone の Safari が対応していないので使わない。 */
const CLASS_RULES = [
  ['S', /\s/u],
  ['H', /[ぁ-ゖゝゞ]/u],
  ['K', /[㐀-䶿一-鿿々〆]/u],
  ['T', /[ァ-ヺー-ヾ]/u],
  ['A', /[0-9A-Za-z０-９Ａ-Ｚａ-ｚ]/u],
  ['O', /[「『（(【〈《［]/u],
  ['P', /[、。，．！？!?]/u],
  ['C', /[」』）)】〉》］]/u],
  ['X', /[️‍]/u],
  ['N', /[・･]/u],
];
const classOf = (ch) => (CLASS_RULES.find(([, re]) => re.test(ch)) ?? ['Y'])[0];
const PARTICLES = new Set([...'がをにはでとへもやのかねよ']);
const MAX_CHUNK = 18; // これより長いかたまりは折れない span にしない（狭い幅ではみ出すため）

function canCut(chars, i) {
  const p = chars[i - 1].cls;
  const c = chars[i].cls;
  if (p === 'S' || c === 'S') return true;
  if (c === 'P' || c === 'C' || c === 'X' || c === 'N' || p === 'N') return false;
  if (p === 'P' || p === 'C') return true;
  if (c === 'O') return p !== 'O';
  if (p === 'O') return false;
  if (p === 'H' && c !== 'H') return c === 'K' ? PARTICLES.has(chars[i - 1].ch) : true;
  return false;
}

// [{ text, keep }] の並び。つなげると元の文に戻る。keep のかたまりは折れない span で包む
export function chunkSegments(text) {
  const chars = [];
  phraseSegments(text).forEach((seg, k) => {
    for (const ch of seg.text) chars.push({ ch, cls: classOf(ch), ent: seg.keep ? k : -1 });
  });
  const out = [];
  let cur = '';
  const flush = () => {
    if (!cur) return;
    const space = /^\s+$/u.test(cur);
    out.push({ text: cur, keep: !space && [...cur].length <= MAX_CHUNK });
    cur = '';
  };
  chars.forEach((c, i) => {
    if (i > 0) {
      const a = chars[i - 1];
      const inside = a.ent !== -1 && a.ent === c.ent;
      const attach = a.ent !== -1 && a.ent !== c.ent && c.cls === 'H';
      if (!inside && !attach && canCut(chars, i)) flush();
    }
    cur += c.ch;
  });
  flush();
  return out;
}
