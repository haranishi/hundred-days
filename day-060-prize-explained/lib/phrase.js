// Safariでも同じ位置で折れるよう、単語境界と割ってはいけない表記を使う。
const HIRAGANA = /[ぁ-ゟ]/;
const STARTS = /[㐀-䶿一-鿿豈-﫿ァ-ヺーｦ-ﾟA-Za-z0-9０-９]/;
const KATAKANA = /[ァ-ヶー]/;
const modifier = /^(?:この|その|あの|どの|ある|ほかの|別の|同じ|[0-9０-９]+(?:つ|個|本|人|種|枚|回)の|狙った)$/;
const segmenter = (() => { try { return globalThis.Intl?.Segmenter ? new Intl.Segmenter('ja', { granularity: 'word' }) : null; } catch { return null; } })();
// 途中で折りたくない表記。<wbr> を置かないだけでは足りない（keep-all でも、数字と漢字のあいだや「・」のあとで、ブラウザ自身が折る）。
// 塊のわけ方（ここ）と、描画で nowrap の span に包む所（lib/render.js の phrase）が、同じ表記を見るようにここに一つだけ置く。
export const tokenPatterns = [
  /確認日：[0-9]+年[0-9]+月[0-9]+日/, /[0-9]+年[0-9]+月(?:[0-9]+日)?/, /[0-9]+月[0-9]+日/,
  /約?[0-9０-９][0-9０-９,.]*(?:か[㐀-鿿]+|人|倍|年|件|回|%|機関)/,
  /[A-Za-z]+ [0-9][0-9+\-]*/, /[A-Za-z]+(?: [A-Za-z]+)+/,
  /[ァ-ヶー]+(?:・[ァ-ヶー]+)+/,
  /第[IVXⅠⅡⅢⅣ]+・[IVXⅠⅡⅢⅣ]+相/, // 臨床試験の段階（第I・II相）
  // 閉じ括弧と、そのすぐあとの助詞（「）と、」「）が」「）では、」）。助詞が行頭に来ない。keep-all でも、括弧のあとはブラウザが折れる
  /[）」』】〕〉》](?:では|には|とは|へは|との|への|での|から|まで|より|[はがをにへでとものや])、?/,
];
export const tokenRegex = () => new RegExp(tokenPatterns.map((pattern) => pattern.source).join('|'), 'g');
export function phraseChunks(text) {
  const source = String(text ?? '');
  const bounds = segmenter ? new Set([...segmenter.segment(source)].map(p => p.index)) : null;
  const protectedOffsets = new Set();
  // 日付、数と単位、欧文識別子、カタカナの名前は途中に区切りを置かない。
  for (const m of source.matchAll(tokenRegex())) for (let i = m.index + 1; i < m.index + m[0].length; i++) protectedOffsets.add(i);
  const allowed = i => !protectedOffsets.has(i) && (!bounds || bounds.has(i));
  const chunks = [];
  let start = 0;
  const push = end => { if (end > start) chunks.push(source.slice(start, end)); start = end; };
  for (let i = 0; i < source.length; i++) {
    const chunk = source.slice(start, i), previous = source[i - 1], ch = source[i];
    const wordStart = chunk.length >= 2 && HIRAGANA.test(previous || '') && STARTS.test(ch) && !modifier.test(chunk);
    const bracket = chunk.length >= 4 && /[（「]/.test(ch);
    if ((wordStart || bracket) && allowed(i)) push(i);
    const dot = ch === '・' && !(KATAKANA.test(previous || '') && KATAKANA.test(source[i + 1] || ''));
    if ((ch === '、' || ch === '。' || dot) && allowed(i + 1)) push(i + 1);
  }
  push(source.length);
  const limited = [];
  let offset = 0;
  for (let chunk of chunks) {
    while ([...chunk].length > 14) {
      // 上限内の最後の助詞を選ぶ。語の中の「の」等はSegmenterで除外する。
      let split = 0;
      for (let i = 1; i <= 14 && i < chunk.length; i++) {
        if (/[はがをにへでとものや]/.test(chunk[i - 1]) && allowed(offset + i) && !modifier.test(chunk.slice(0, i)) && !/[、。，．）」』】〕〉》・ー！？ぁぃぅぇぉゃゅょっ]/.test(chunk[i])) split = i;
      }
      if (!split) for (let i = 1; i <= 14 && i < chunk.length; i++) {
        if (chunk[i - 1] === '・' && allowed(offset + i) && !(KATAKANA.test(chunk[i - 2] || '') && KATAKANA.test(chunk[i] || ''))) split = i;
      }
      // 長い塊の括弧は本文から分離し、長い固有名詞の後ろの助詞も別塊にする。
      if (!split) for (let i = 1; i < chunk.length; i++) {
        if ((/[（「]/.test(chunk[i]) || /[）」]/.test(chunk[i - 1])) && allowed(offset + i)) { split = i; break; }
      }
      // それでも無ければ、単語の境目（Segmenter）の中で上限内のいちばん後ろで割る（長い固有名詞の複合語：ゲッティンゲン大学医療｜センター）。
      if (!split && bounds) for (let i = 1; i <= 14 && i < chunk.length; i++) {
        if (allowed(offset + i) && !/[、。，．）」』】〕〉》・ー！？ぁぃぅぇぉゃゅょっ]/.test(chunk[i]) && !/[（「]/.test(chunk[i - 1])) split = i;
      }
      if (!split) break; // 固有名詞や識別子はoverflow-wrapによる最終救済へ。
      limited.push(chunk.slice(0, split)); chunk = chunk.slice(split); offset += split;
    }
    limited.push(chunk); offset += chunk.length;
  }
  return limited;
}
