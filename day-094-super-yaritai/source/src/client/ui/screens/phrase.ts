// 日本語の文を文節（読みのまとまり）に分ける（純粋な関数。単体試験で確かめる）。
// 画面の文は CSS の word-break: keep-all で「語の途中では折らない」ようにし、ここで分けた切れ目にだけ <wbr> を置く。
// こうすると「ダッ／シュしない」「逆／をやると」のような折れ方がなくなる（round3 の見た目の指摘）。
// 辞書（Intl.Segmenter）は使わない：端末ごとに結果が変わり、試験で確かめられないため。字の種類の並びで決める。
//
// 切ってよい所（それ以外は切らない）
//  A. 句読点（、。！？・：など）と空白の後ろ。ただし数字の「1,480」の「,」では切らない
//  B. 閉じかっこ（」）』など）の後ろ。ただし次がひらがな（「」の」の「の」など）なら切らない
//  C. ひらがなの後ろで、次が漢字・カタカナ・英数字・開きかっこのとき（「悪事を｜回る」）。ただし次は切らない
//     - 接頭の「お」「ご」の後ろ（「お｜菓子」「一度お｜試し」）
//     - 送りがなでつながる複合語：漢字か助詞か文の頭の後ろの1〜2字のひらがなが、い段・え段・「っ」で終わる
//       （「呼び｜出し｜ベル」「食べ｜尽くす」「突っ｜込む」「荒らし｜度」「残り｜10秒」「なぎ｜払う」）。
//       助詞の「に」「て」「で」「へ」で終わるもの、「だけ」「より」は除く（「手前に｜スイカ」は切る）
//  D. かぎかっこ「」『』の中が10字までなら、中では切らない（ボタンの名前「リンクをコピー」など）
//  E. ひとまとまりの語（KEEP_WORDS）の中では切らない。その語の頭は、前がひらがななら切ってよい

const HIRA = /[ぁ-ゟ]/;
const KATA = /[ァ-ヺヽ-ヿｦ-ﾝ]/; // カタカナ（・とーは除く）
const KANJI = /[㐀-䶿一-鿿豈-﫿々-〇ヶ]/; // 漢字と々〆〇ヶ
const ALNUM = /[0-9A-Za-z０-９Ａ-Ｚａ-ｚ×%％＋+−\-.．]/;
const OPEN = /[「『（(【〔［\[〈《“‘]/;
const CLOSE = /[」』）)】〕］\]〉》”’]/;
const PUNCT = /[、。，,．！？!?・：:；;…‥]/;
const SPACE = /\s/;
/** 長音とつなぎの記号は、前の字と同じ種類として扱う */
const CONT = /[ー々]/;
const DIGIT = /[0-9０-９]/;

/** 送りがなの終わりになる字（い段・え段・っ）。助詞の に・て・で・へ は入れない */
const RENYO_END = new Set([...'いきしちひみりぎじぢびぴゐえけせねめれげぜべぺゑっ']);
/** 送りがなと形が同じでも、助詞なので切ってよいもの */
const PARTICLE_RUNS = new Set(['だけ', 'より']);
/** ひらがなの並びの中で、語の区切りになる助詞（この後ろからを送りがなとして見る） */
const PARTICLES = new Set([...'をがはにでとのへもや']);
/** 接頭の語（後ろの語と離さない） */
const PREFIXES = new Set(['お', 'ご']);
/** 中で切らない語（字の種類の並びでは見分けられないもの） */
const KEEP_WORDS = ['やっちゃダメ', 'もう一度'];
/** かぎかっこの中をひとかたまりにする長さの上限 */
const QUOTE_KEEP = 10;

type Kind = 'hira' | 'kata' | 'kanji' | 'alnum' | 'open' | 'close' | 'punct' | 'space' | 'other';

function kindOf(ch: string): Kind {
  if (SPACE.test(ch)) return 'space';
  if (HIRA.test(ch)) return 'hira';
  if (KANJI.test(ch)) return 'kanji';
  if (KATA.test(ch)) return 'kata';
  if (OPEN.test(ch)) return 'open';
  if (CLOSE.test(ch)) return 'close';
  if (PUNCT.test(ch)) return 'punct';
  if (ALNUM.test(ch)) return 'alnum';
  // 〜 など：前後どちらとも離さない
  return 'other';
}

/**
 * 切ってはいけない位置（i の前で切れない）と、切ってよい位置に印を付ける。
 * locked：KEEP_WORDS の中と、短いかぎかっこの中。starts：KEEP_WORDS の頭（前がひらがななら、その前で切ってよい）
 */
function marks(text: string, chars: string[]): { locked: boolean[]; starts: boolean[] } {
  const locked = new Array<boolean>(chars.length + 1).fill(false);
  const starts = new Array<boolean>(chars.length + 1).fill(false);
  // 文字の位置（サロゲートを1字と数える）と文字列の位置を対応させる
  const offsets: number[] = [];
  let off = 0;
  for (const ch of chars) {
    offsets.push(off);
    off += ch.length;
  }
  const indexOfOffset = (o: number): number => offsets.indexOf(o);
  for (const word of KEEP_WORDS) {
    for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1)) {
      const s = indexOfOffset(at);
      const len = Array.from(word).length;
      starts[s] = true;
      for (let k = s + 1; k < s + len; k++) locked[k] = true;
    }
  }
  const pairs: Record<string, string> = { '「': '」', '『': '』' };
  for (let i = 0; i < chars.length; i++) {
    const close = pairs[chars[i] as string];
    if (!close) continue;
    const j = chars.indexOf(close, i + 1);
    if (j < 0 || j - i - 1 > QUOTE_KEEP) continue;
    for (let k = i + 1; k <= j; k++) locked[k] = true;
  }
  return { locked, starts };
}

/** 文節に分ける。つなげると元の文に戻る */
export function splitPhrases(text: string): string[] {
  const chars = Array.from(text);
  if (chars.length === 0) return [];
  // 長音などは前の字の種類を引き継ぐ
  const kinds: Kind[] = [];
  for (const [i, ch] of chars.entries()) kinds.push(CONT.test(ch) && i > 0 ? (kinds[i - 1] as Kind) : kindOf(ch));
  const { locked, starts } = marks(text, chars);

  const out: string[] = [];
  let start = 0;
  for (let i = 1; i < chars.length; i++) {
    // ひとまとまりの語の頭は、前がひらがな（助詞など）なら切ってよい（「あとで｜もう一度」「達成した｜やっちゃダメ」）
    const keepStart = starts[i] && kinds[i - 1] === 'hira';
    if (!locked[i] && (keepStart || canBreak(chars, kinds, i))) {
      out.push(chars.slice(start, i).join(''));
      start = i;
    }
  }
  out.push(chars.slice(start).join(''));
  return out;
}

/** i の前（i−1 と i の間）で折ってよいか */
function canBreak(chars: string[], kinds: Kind[], i: number): boolean {
  const p = kinds[i - 1] as Kind;
  const n = kinds[i] as Kind;
  // 行の頭に来てはいけない字の前では折らない
  if (n === 'punct' || n === 'close' || n === 'space') return false;
  // 数字の区切り（1,480・1.5）では折らない
  if (p === 'punct' && i >= 2 && DIGIT.test(chars[i - 2] as string) && DIGIT.test(chars[i] as string)) return false;
  if (p === 'space' || p === 'punct') return true;
  if (p === 'close') return n !== 'hira';
  if (p !== 'hira') return false;
  if (n !== 'kanji' && n !== 'kata' && n !== 'alnum' && n !== 'open') return false;
  // ひらがなの並び（i の直前まで）を取り出す
  let s = i - 1;
  while (s > 0 && kinds[s - 1] === 'hira') s--;
  const run = chars.slice(s, i);
  const last = run[run.length - 1] as string;
  if (PREFIXES.has(last)) return false;
  // 送りがなの部分：並び全体か、並びの中の最後の助詞より後ろ
  const before = s > 0 ? (kinds[s - 1] as Kind) : null;
  const atHead = before === null || before === 'space' || before === 'punct' || before === 'open' || before === 'close';
  let stem: string[] | null = null;
  if ((before === 'kanji' || atHead) && run.length <= 2) stem = run;
  else if (run.length >= 3 && PARTICLES.has(run[run.length - 3] as string)) stem = run.slice(-2);
  else if (run.length >= 2 && PARTICLES.has(run[run.length - 2] as string)) stem = run.slice(-1);
  if (stem && RENYO_END.has(last) && !PARTICLE_RUNS.has(stem.join(''))) return false;
  return true;
}
