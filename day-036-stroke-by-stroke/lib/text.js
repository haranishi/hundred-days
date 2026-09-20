/* 入力を「マスに置ける文字の列」へ整える。 */

export const MAX_CHARS = 8;

/* 落とすもの：空白・制御文字・異体字選択符号・結合用の記号。結合用の濁点は
   NFC でくっつけてから落とすので、「か」＋濁点は「が」になる。 */
const DROP = new RegExp(
  '[\\s\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u206f\\ufeff' +
    '\\ufe00-\\ufe0f\\u{e0100}-\\u{e01ef}\\u0300-\\u036f\\u3099\\u309a]',
  'u'
);

export function normalizeInput(raw) {
  const chars = [];
  let dropped = false;
  for (const ch of String(raw == null ? '' : raw).normalize('NFC')) {
    if (DROP.test(ch)) {
      dropped = true;
      continue;
    }
    chars.push(ch);
  }
  const trimmed = chars.length > MAX_CHARS;
  return { chars: chars.slice(0, MAX_CHARS), trimmed, dropped };
}

/* 同じ字が続いても別のマスとして扱うので、符号位置の重複は残したまま返す。 */
export function codePointsOf(chars) {
  return chars.map((c) => c.codePointAt(0));
}
