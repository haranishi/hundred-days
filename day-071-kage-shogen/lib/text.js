// 画面の文の折り返し。数字・単位・式の記号の途中や、日本語の語と数字のあいだで行が割れないよう、
// 「折り返さない範囲」を求める。DOMに依存しない純関数。
//
// 返すのは、元の文を前から順に区切った断片の配列 { text, keep }。断片をつなぐと元の文に戻る。
// 画面では keep の断片だけを white-space: nowrap の span で包むので、textContent は変わらない。
// 決まり（行頭に数字・単位・＝・−を置かない）：
//   1. 数字の直前では折り返さない。数字の前が空白なら、その空白の前の文字ともつなぐ（「＝ 105cm」）。
//   2. 数字の前の日本語は2字までつなぐ（「身長175cm」が「身長／175cm」に割れない）。
//   3. 数字のあとの単位（cm・割・つ…）と、そのあとの助詞（「の」「ずつ」など）、閉じの句読点はつなぐ。
//   4. 式の記号（−・＝など）は前の語とつなぐ。記号のあとが数字なら、1. でうしろともつながる。
// つなぐ範囲を広げすぎると、狭い画面で1行に収まらずはみ出すので、語の前は2字まで、助詞は決まった語だけにしてある
// （ひらがなを2字まで無条件につなぐと、「102cmでそ／ろった」のように動詞の途中で切れた）。

const DIGIT = /[0-9]/u;
const LATIN = /[A-Za-z%]/u;
const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々ー・]/u;
const HIRAGANA = /\p{Script=Hiragana}/u;
const SPACE = /[ 　]/u;
const OPERATOR = /[−＝＋×÷/=+]/u;
const CLOSING = /[。、）」』】：]/u;
const PREFIX_MAX = 2;
const PARTICLES_2 = new Set(['から', 'まで', 'ずつ', 'なら', 'より', 'だけ', 'ほど']);
const PARTICLES_1 = new Set(['の', 'は', 'が', 'を', 'に', 'で', 'と', 'も', 'へ', 'や']);

export function nowrapSegments(value) {
  const chars = Array.from(String(value));
  const n = chars.length;
  // keep[i]：chars[i - 1] と chars[i] のあいだで折り返さない。
  const keep = new Array(n + 1).fill(false);
  const is = (pattern, i) => i >= 0 && i < n && pattern.test(chars[i]);

  // 式の記号を、前の語へつなぐ（記号の前の空白も含める）。
  const glueOperator = (i) => {
    keep[i] = true;
    if (is(SPACE, i - 1)) keep[i - 1] = true;
  };

  let i = 0;
  while (i < n) {
    if (!is(DIGIT, i)) { i += 1; continue; }
    // 数字の連なり（小数点・分数の斜線を含む）。
    const start = i;
    let end = i + 1;
    while (end < n && (is(DIGIT, end) || ((chars[end] === '.' || chars[end] === '/') && is(DIGIT, end + 1)))) end += 1;
    for (let k = start + 1; k < end; k += 1) keep[k] = true;

    // 前：数字の直前・空白・式の記号・日本語の語。
    if (start > 0) {
      keep[start] = true;
      let before = start - 1;
      if (is(SPACE, before)) {
        if (before > 0) keep[before] = true;
        before -= 1;
      }
      if (is(OPERATOR, before)) glueOperator(before);
      else if (is(JAPANESE, before)) {
        let count = 1;
        while (count < PREFIX_MAX && is(JAPANESE, before - 1)) {
          keep[before] = true;
          before -= 1;
          count += 1;
        }
      }
    }

    // うしろ：単位 → 助詞 → 閉じの句読点 → 式の記号。
    let tail = end;
    if (is(LATIN, tail)) {
      while (is(LATIN, tail)) { keep[tail] = true; tail += 1; }
    } else if (is(JAPANESE, tail) && (!is(HIRAGANA, tail) || chars[tail] === 'つ')) {
      keep[tail] = true; // 割・人・夜・つなどの助数詞（1字）
      tail += 1;
    }
    const pair = chars.slice(tail, tail + 2).join('');
    const particle = PARTICLES_2.has(pair) ? 2 : is(HIRAGANA, tail) && PARTICLES_1.has(chars[tail]) ? 1 : 0;
    for (let count = 0; count < particle; count += 1) { keep[tail] = true; tail += 1; }
    while (is(CLOSING, tail)) { keep[tail] = true; tail += 1; }
    if (is(SPACE, tail) && is(OPERATOR, tail + 1)) { glueOperator(tail + 1); tail += 2; }
    else if (is(OPERATOR, tail)) { glueOperator(tail); tail += 1; }
    i = Math.max(end, tail);
  }

  // つながった文字をまとめる。2字以上つながったものだけを keep にし、それ以外は普通の文にまとめる。
  const segments = [];
  let plain = '';
  for (let k = 0; k < n;) {
    let j = k + 1;
    while (j < n && keep[j]) j += 1;
    const piece = chars.slice(k, j).join('');
    if (j - k >= 2) {
      if (plain) segments.push({ text: plain, keep: false });
      plain = '';
      segments.push({ text: piece, keep: true });
    } else plain += piece;
    k = j;
  }
  if (plain) segments.push({ text: plain, keep: false });
  return segments;
}

// 断片の中で、折り返さない範囲の最大の文字数（はみ出しの確認に使う）。
export function longestKept(value) {
  return nowrapSegments(value).reduce((longest, segment) => (segment.keep ? Math.max(longest, Array.from(segment.text).length) : longest), 0);
}
