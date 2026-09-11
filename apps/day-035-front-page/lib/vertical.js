/* 縦書きの行組み。CanvasにもDOMにも触らない純関数。
   返すのは1文字ずつの位置と回転で、描くのは lib/paper.js。

   縦書きで面倒なのは「文字を縦に並べる」ことではなく、
   ①横倒しになる文字 ②マスの右上に寄る文字 ③数字を1マスに収める縦中横
   ④行頭に句読点を置かない禁則 の4つ。ここで全部処理して、描く側を単純にする。

   マスの送り（advance）は文字ごとに変える。全角は1マス、横倒しのラテン文字は
   0.55マス。ここを1マス固定にすると「100 DAYS」が間延びして読めなくなる。 */

// 縦組みでは倒して描く文字。長音・波・各種の括弧・二重の約物
const ROTATE = new Set([...'ー―‐−〜～（）()「」『』【】〔〕［］｛｝＜＞〈〉《》：；…‥＝']);
// マスの右上に寄る文字
const PUNCT = new Set([...'、。，．']);
// 小書き文字。右上に少しだけ寄る
const SMALL = new Set([...'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ']);
// 行頭に来てはいけない文字（来たら前の行から追い出す）
const NO_LINE_START = new Set([...'、。，．」』】〕］｝）)・ー？！?!ぁぃぅぇぉっゃゅょァィゥェォッャュョ…‥']);
// 行末に来てはいけない文字
const NO_LINE_END = new Set([...'「『【〔［｛（(']);

const LATIN = /[A-Za-z]/;
// 半角の約物（: / - など）も倒す。全角の括弧と違って1マスは要らない
const ASCII_PUNCT = /[!-\/:-@\[-`{-~]/;
const DIGIT = /[0-9]/;

/* 倒したラテン文字は全角より狭い。送りだけ詰めると明朝の m が隣と重なるので、
   字の大きさも少し落とす（実測でcとmが重なった） */
const LATIN_ADVANCE = 0.72;
const LATIN_SCALE = 0.8;

/* 数字は桁数で見せ方を変える。2桁までは半分の大きさで1マスに、
   3〜4桁は小さくして1マスに押し込む。1桁ずつ縦に積むと電話番号のように読めてしまう。
   1桁はそのまま正立させる（半分の大きさにすると本文の中で沈む） */
function digitCell(run) {
  if (run.length === 1) return { text: run, kind: 'normal', advance: 1, sizeScale: 0.92 };
  if (run.length === 2) return { text: run, kind: 'tatechuyoko', advance: 1, sizeScale: 0.56 };
  if (run.length <= 4) return { text: run, kind: 'tatechuyoko', advance: 1, sizeScale: 0.34 };
  return null;
}

/* 文字列を「1マスぶん」の並びにする */
export function toCells(text) {
  const chars = [...String(text ?? '').replace(/\s+/g, ' ')];
  const cells = [];
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (DIGIT.test(ch)) {
      let end = i;
      while (end < chars.length && DIGIT.test(chars[end])) end += 1;
      const run = chars.slice(i, end).join('');
      const cell = digitCell(run);
      if (cell) cells.push(cell);
      else for (const digit of run) cells.push({ text: digit, kind: 'rotate', advance: LATIN_ADVANCE, sizeScale: LATIN_SCALE });
      i = end - 1;
      continue;
    }
    if (ch === ' ') cells.push({ text: ' ', kind: 'space', advance: 0.4 });
    else if (LATIN.test(ch) || ASCII_PUNCT.test(ch)) cells.push({ text: ch, kind: 'rotate', advance: LATIN_ADVANCE, sizeScale: LATIN_SCALE });
    else if (ROTATE.has(ch)) cells.push({ text: ch, kind: 'rotate', advance: 1 });
    else if (PUNCT.has(ch)) cells.push({ text: ch, kind: 'punct', advance: 1 });
    else if (SMALL.has(ch)) cells.push({ text: ch, kind: 'small', advance: 1 });
    else cells.push({ text: ch, kind: 'normal', advance: 1 });
  }
  return cells;
}

/* 流し込みに必要なマスの総量。大きさを決めるときに使う */
export function totalAdvance(cells) {
  return cells.reduce((sum, cell) => sum + (cell.advance ?? 1), 0);
}

/* マスの中心から、その文字を実際に置く座標へずらす */
export function placeCell(cell, centerX, centerY, size) {
  const glyph = {
    text: cell.text,
    kind: cell.kind,
    x: centerX,
    y: centerY,
    size: size * (cell.sizeScale ?? 1),
    rotate: cell.kind === 'rotate' ? 90 : 0
  };
  if (cell.kind === 'punct') {
    glyph.x += size * 0.28;
    glyph.y -= size * 0.3;
  }
  if (cell.kind === 'small') {
    glyph.x += size * 0.06;
    glyph.y -= size * 0.08;
  }
  return glyph;
}

/* 列（右から左へ並べた縦の帯）に文字を流し込む。
   columns は [{ x, top, height }]。列ごとに高さが違ってよい（写真を避けるため）。
   入り切らなかったぶんは rest で返す。 */
export function flowColumns(cells, columns, { size, charGap = size, ellipsis = false } = {}) {
  const glyphs = [];
  let index = 0;
  for (const column of columns) {
    if (index >= cells.length) break;
    while (cells[index]?.kind === 'space') index += 1; // 列の頭の空白は詰める
    let used = 0;
    let end = index;
    while (end < cells.length) {
      const step = (cells[end].advance ?? 1) * charGap;
      if (used + step > column.height) break;
      used += step;
      end += 1;
    }
    let guard = 0;
    while (end > index + 1 && end < cells.length && guard < 4
      && (NO_LINE_START.has(cells[end].text) || NO_LINE_END.has(cells[end - 1].text))) {
      end -= 1;
      guard += 1;
    }
    if (end === index) continue;
    let offset = 0;
    for (let i = index; i < end; i += 1) {
      const step = (cells[i].advance ?? 1) * charGap;
      glyphs.push(placeCell(cells[i], column.x, column.top + offset + step / 2, size));
      offset += step;
    }
    index = end;
  }
  const rest = cells.slice(index);
  if (ellipsis && rest.length && glyphs.length) {
    // 「や（で終わったところに…を足すと括弧が閉じないまま残る。先に落とす
    while (glyphs.length > 1 && (NO_LINE_END.has(glyphs.at(-1).text) || glyphs.at(-1).kind === 'space')) glyphs.pop();
    const last = glyphs[glyphs.length - 1];
    glyphs[glyphs.length - 1] = { ...last, text: '…', kind: 'rotate', rotate: 90, size };
  }
  return { glyphs, rest, filled: index };
}

/* 列の高さが揃っている帯へ流すだけの近道。見出しに使う */
export function layoutVertical(text, { right, top, height, size, charGap = size, lineGap = size * 1.35, maxLines = 2, ellipsis = true }) {
  const columns = [];
  for (let i = 0; i < maxLines; i += 1) columns.push({ x: right - i * lineGap - size / 2, top, height });
  const cells = toCells(text);
  const result = flowColumns(cells, columns, { size, charGap, ellipsis });
  const perColumn = Math.max(1, Math.floor(height / charGap));
  const usedLines = Math.min(maxLines, Math.max(1, Math.ceil(result.filled / perColumn)));
  return { ...result, width: usedLines * lineGap };
}
