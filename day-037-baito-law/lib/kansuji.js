/* 条文の漢数字に、算用数字のルビを振るための道具。

   本文は1字も変えない。ここが返すのは「この範囲に、この読みを重ねる」という指示だけで、
   置き換えは行わない（PDL1.0 の「加工」を最小限にするため）。

   単位が続くときだけ振る。「一般」「一部」の般や部は単位ではないので素通りし、
   唯一ぶつかる「十分」は、あとに続く字で数かどうかを見分ける。 */

const DIGITS = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const SMALL_UNITS = { 十: 10, 百: 100, 千: 1000 };
const BIG_UNITS = { 万: 10000, 億: 100000000 };
const KANSUJI = '〇零一二三四五六七八九十百千万億';

/* 「四十五」→45、「二十二」→22、「百三」→103。万・億をまたぐ桁も数える。 */
export function parseKansuji(text) {
  if (typeof text !== 'string' || !text.length) return null;
  let total = 0; // 万・億で確定した分
  let section = 0; // いま組み立てている4桁ぶん
  let digit = 0; // 直前の一桁
  let sawAny = false;
  for (const ch of text) {
    if (ch in DIGITS) {
      digit = DIGITS[ch];
      sawAny = true;
    } else if (ch in SMALL_UNITS) {
      /* 「十」は単独で10。「二十」は2×10 */
      section += (digit || 1) * SMALL_UNITS[ch];
      digit = 0;
      sawAny = true;
    } else if (ch in BIG_UNITS) {
      total += (section + digit || 1) * BIG_UNITS[ch];
      section = 0;
      digit = 0;
      sawAny = true;
    } else {
      return null;
    }
  }
  return sawAny ? total + section + digit : null;
}

/* ルビを振る単位。左の綴りを見つけたら、右の綴りで読みを作る。
   「箇月」は読みにくいので、ルビ側だけ「か月」にする（本文は「箇月」のまま）。 */
const UNITS = [
  ['労働日', '労働日'],
  ['週間', '週間'],
  ['箇月', 'か月'],
  ['ヶ月', 'か月'],
  ['か月', 'か月'],
  ['時間', '時間'],
  ['時', '時'],
  ['年', '年'],
  ['月', 'か月'],
  ['日', '日'],
  ['週', '週'],
  ['分', '分'],
  ['秒', '秒'],
  ['割', '割'],
  ['円', '円'],
  ['人', '人'],
  ['回', '回'],
  ['歳', '歳'],
  ['才', '才'],
  ['倍', '倍'],
];

/* 「十分」が数でないときの見分け。あとに「な・に・だ・で」が続いたら「じゅうぶん」。 */
const JUBUN_NOT_NUMBER = /^[なにだでの]/;

const SECTION_UNITS = ['条', '項', '号', '章', '節', '款', '編'];

function isKansuji(ch) {
  return KANSUJI.includes(ch);
}

/* 位置 i から続く漢数字の並びを返す（無ければ空文字）。 */
function runAt(text, i) {
  let j = i;
  while (j < text.length && isKansuji(text[j])) j += 1;
  return text.slice(i, j);
}

/* 本文を、素の文字列とルビ付きの範囲に切り分ける。置き換えはしない。 */
export function annotate(text) {
  if (typeof text !== 'string' || !text.length) return [];
  const out = [];
  let plain = '';
  const pushPlain = () => {
    if (plain) out.push({ type: 'text', value: plain });
    plain = '';
  };
  let i = 0;
  while (i < text.length) {
    const hit = matchAt(text, i);
    if (!hit) {
      plain += text[i];
      i += 1;
      continue;
    }
    pushPlain();
    out.push({ type: 'ruby', value: hit.value, reading: hit.reading });
    i += hit.value.length;
  }
  pushPlain();
  return out;
}

/* 位置 i から始まるルビの対象を1つ探す。順番に意味がある：
   分数を先に見ないと「十分の一」の「十分」を時間と取り違える。 */
function matchAt(text, i) {
  return matchFraction(text, i) || matchSection(text, i) || matchUnit(text, i);
}

/* 「五分の一」→ 5分の1、「百分の二十五」→ 100分の25 */
function matchFraction(text, i) {
  const left = runAt(text, i);
  if (!left) return null;
  const rest = text.slice(i + left.length);
  if (!rest.startsWith('分の')) return null;
  const right = runAt(text, i + left.length + 2);
  if (!right) return null;
  const a = parseKansuji(left);
  const b = parseKansuji(right);
  if (a === null || b === null) return null;
  return { value: left + '分の' + right, reading: `${a}分の${b}` };
}

/* 「第三十九条」→ 第39条。「第」から始まるときだけ拾う */
function matchSection(text, i) {
  if (text[i] !== '第') return null;
  const run = runAt(text, i + 1);
  if (!run) return null;
  const unit = SECTION_UNITS.find((u) => text.startsWith(u, i + 1 + run.length));
  if (!unit) return null;
  const n = parseKansuji(run);
  if (n === null) return null;
  return { value: '第' + run + unit, reading: `第${n}${unit}` };
}

/* 「六箇月」→ 6か月。単位が続くときだけ */
function matchUnit(text, i) {
  const run = runAt(text, i);
  if (!run) return null;
  const after = i + run.length;
  const unit = UNITS.find(([spelling]) => text.startsWith(spelling, after));
  if (!unit) return null;
  const [spelling, reading] = unit;
  /* 「十分な」「十分に」は数ではない */
  if (run === '十' && spelling === '分' && JUBUN_NOT_NUMBER.test(text.slice(after + 1))) return null;
  const n = parseKansuji(run);
  if (n === null) return null;
  return { value: run + spelling, reading: `${n}${reading}` };
}

/* 検算用。ルビを外したら元の文字列に戻ることを確かめる。 */
export function flatten(parts) {
  return parts.map((p) => p.value).join('');
}
