/* 折り返しの決まり（純粋な関数。DOM を持たない）。
   本文は word-break: keep-all で、折れてよい所は <wbr> だけ。折れてよい所は、読点・句点の後ろと、助詞（は・が・を・に・で…）で終わるひらがなの並びの後ろ（文節の切れ目）。
   送りがなのひらがなの後ろでは折らない。以前は「ひらがなの並びが終わって別の字種に変わる所」を全部候補にしたので、
   「引き｜返す」「通り｜道」「行き｜来する」「取り｜消せる」「お｜手本」「ひとつ｜戻す」と、語が割れていた（体験評価）。
   助詞で終わっていても割ってはいけない語（保護語）は、中に折り返し候補を入れず、<span class="nb">（折り返さない）で包む。
   包むのは、ブラウザが自分で割る場合（「・」の後ろ）にも効かせるため。
   tests/wrap.test.mjs が、全部の画面の文について「保護語の中に折り返し候補が入らない」ことを確かめる。 */

// 割ってはいけない語。ここに足したら、tests/wrap.test.mjs の例にも足す
export const PROTECTED_WORDS = Object.freeze([
  '引き返', // 引き返す・引き返して・引き返し
  '行き来',
  '取り消',
  '通り道',
  'ひとつ戻', // ひとつ戻す（ボタンの名前）
  'お手本',
  '文字のキー', // 設定の名前
  '見つか', // 見つかる・見つかった・見つからない
  '見つけ',
  '次の1手',
  '光っている',
  '警備員',
  '見張り',
  '直接投稿', // 共通の部品（shared/share.js）の説明文に出る語。「直／接」「リ／ンク」と割れていた
  'リンク',
  'コピー',
  'Instagram',
  'YouTube',
  'Web',
  '共有…',
  'レーザー',
]);

// 割ってはいけない並び（座標・数と単位・記録）
export const PROTECTED_PATTERNS = Object.freeze([
  /左から\d+・上から\d+/gu, // 盤を文で読む の座標。「左から4・／上から2」と割れていた
  /あと\d+手/gu,
  /星 \d+\/\d+/gu, // 全面クリアの星の合計
  /記録 \d+手/gu,
  /面\d+ [^\s]+/gu, // 面の一覧の「面6 通り道をふさがない」。番号と名前を別の行に分けない（320で「面6／通り道をふさがない」と割れていた）
  /（WASD・Z・R）を使う/gu, // あそびかたのスイッチ。「文字のキー」と「（WASD・Z・R）を使う」の間でだけ折る（「を使う」だけが2行目に落ちていた）
]);

// この語の直後では折らない（名詞とのまとまりを割らない：「その｜手前」「この｜箱」）
const NO_BREAK_AFTER = Object.freeze(['その', 'この', 'あの', 'どの']);

// 文節の終わりになる助詞。ひらがなの並びがこれで終わるとき、その後ろで折ってよい
export const PARTICLES = Object.freeze(['から', 'まで', 'より', 'ので', 'のに', 'けど', 'は', 'が', 'を', 'に', 'で', 'と', 'の', 'も', 'へ', 'や', 'か', 'て', 'ば']);

const HIRAGANA = /[ぁ-ゟ]/u;
const CLOSING = /[、。，．」』）！？\s]/u;

// i の手前で折ってよいか（i は 1 から length-1。文字の境目の番号）
export function canBreak(text, i) {
  const prev = text[i - 1];
  const next = text[i];
  if (CLOSING.test(next)) return false; // 行頭に閉じ括弧・句読点・空白が来ない
  if (next === '（' && prev !== '（') return true; // 開き括弧の手前は折ってよい
  if (prev === '、' || prev === '。') return true;
  if (!HIRAGANA.test(prev) || HIRAGANA.test(next)) return false;
  let start = i - 1;
  while (start > 0 && HIRAGANA.test(text[start - 1])) start -= 1;
  const run = text.slice(start, i); // 直前のひらがなの並び
  return PARTICLES.some((p) => run.endsWith(p));
}

// 保護語・保護する並びの範囲 [開始, 終了)。重なったら1つにまとめる（隣り合うだけならそのまま）
export function protectedRanges(text) {
  const found = [];
  for (const w of PROTECTED_WORDS) {
    for (let at = text.indexOf(w); at >= 0; at = text.indexOf(w, at + 1)) found.push([at, at + w.length]);
  }
  for (const re of PROTECTED_PATTERNS) {
    for (const m of text.matchAll(re)) found.push([m.index, m.index + m[0].length]);
  }
  found.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  for (const r of found) {
    const last = merged[merged.length - 1];
    if (last && r[0] < last[1]) last[1] = Math.max(last[1], r[1]); // 重なったものだけ。隣り合うだけなら別々（間で折れる）
    else merged.push([...r]);
  }
  return merged;
}

// 折り返し候補を入れる位置（その手前に <wbr>）
export function breakPositions(text) {
  const ranges = protectedRanges(text);
  const out = [];
  for (let i = 1; i < text.length; i++) {
    if (!canBreak(text, i)) continue;
    if (ranges.some(([a, b]) => i > a && i < b)) continue; // 保護語の中
    if (NO_BREAK_AFTER.some((w) => text.slice(0, i).endsWith(w))) continue; // 「どこの」のような語の末尾も止まるが、折り返し候補が1つ減るだけで害はない
    out.push(i);
  }
  return out;
}

/* 文を、文字・保護語・折り返し候補の並びにする。
   [{ type: 'text', s }, { type: 'nb', s }, { type: 'wbr' }]。s を全部つなぐと元の文になる（textContent は変わらない） */
export function wrapTokens(text) {
  const str = String(text);
  const ranges = protectedRanges(str);
  const cuts = new Set(breakPositions(str));
  const tokens = [];
  let buf = '';
  const flush = () => {
    if (buf) tokens.push({ type: 'text', s: buf });
    buf = '';
  };
  for (let i = 0; i < str.length;) {
    const range = ranges.find(([a]) => a === i);
    if (cuts.has(i)) {
      flush();
      tokens.push({ type: 'wbr' });
    }
    if (range) {
      flush();
      tokens.push({ type: 'nb', s: str.slice(range[0], range[1]) });
      i = range[1];
    } else {
      buf += str[i];
      i += 1;
    }
  }
  flush();
  return tokens;
}

// index.html に手で書く文（JS が動く前の表示）を作る。画面の文と同じ決まりで折る（tests/wrap.test.mjs が、index.html の文がこの出力と同じかを見る）
export function wrapHtml(text) {
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return wrapTokens(text).map((tok) => (tok.type === 'wbr' ? '<wbr>' : tok.type === 'nb' ? `<span class="nb">${esc(tok.s)}</span>` : esc(tok.s))).join('');
}
