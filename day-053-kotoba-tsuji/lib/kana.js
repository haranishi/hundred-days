// 盤に置ける字、答えの正規化、濁点の付け外し、ローマ字入力。

const SEION = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
const DAKUON = 'がぎぐげござじずぜぞだぢづでどばびぶべぼ';
const HANDAKUON = 'ぱぴぷぺぽ';

export const ALLOWED = new Set([...SEION, ...DAKUON, ...HANDAKUON]);

const SMALL_TO_LARGE = {
  ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お',
  っ: 'つ', ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', ゎ: 'わ',
};

function toLargeHiragana(ch) {
  const code = ch.codePointAt(0);
  // カタカナ（ァ〜ヶ）はひらがなと 0x60 ずれて並んでいる
  const hira = code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : ch;
  return SMALL_TO_LARGE[hira] ?? hira;
}

export function normalizeAnswer(str) {
  if (typeof str !== 'string' || str.length === 0) return null;
  // 半角カナや結合文字の濁点（NFD）で届いても同じ字になるよう NFKC にそろえる
  let out = '';
  for (const raw of str.normalize('NFKC')) {
    const ch = toLargeHiragana(raw);
    if (!ALLOWED.has(ch)) return null;
    out += ch;
  }
  return out;
}

const DAKU = new Map();
const HANDAKU = new Map();
{
  const plain = 'かきくけこさしすせそたちつてとはひふへほ';
  const voiced = 'がぎぐげござじずぜぞだぢづでどばびぶべぼ';
  for (let i = 0; i < plain.length; i++) {
    DAKU.set(plain[i], voiced[i]);
    DAKU.set(voiced[i], plain[i]);
  }
  const ha = 'はひふへほ';
  const ba = 'ばびぶべぼ';
  const pa = 'ぱぴぷぺぽ';
  for (let i = 0; i < ha.length; i++) {
    DAKU.set(pa[i], ba[i]);
    HANDAKU.set(ha[i], pa[i]);
    HANDAKU.set(pa[i], ha[i]);
    HANDAKU.set(ba[i], pa[i]);
  }
}

export function toggleDakuten(ch) {
  return DAKU.get(ch) ?? null;
}

export function toggleHandakuten(ch) {
  return HANDAKU.get(ch) ?? null;
}

// 五十音盤の列。右から あ・か・さ… の順
export const BOARD_COLUMNS = [
  ['あ', 'い', 'う', 'え', 'お'],
  ['か', 'き', 'く', 'け', 'こ'],
  ['さ', 'し', 'す', 'せ', 'そ'],
  ['た', 'ち', 'つ', 'て', 'と'],
  ['な', 'に', 'ぬ', 'ね', 'の'],
  ['は', 'ひ', 'ふ', 'へ', 'ほ'],
  ['ま', 'み', 'む', 'め', 'も'],
  ['や', null, 'ゆ', null, 'よ'],
  ['ら', 'り', 'る', 'れ', 'ろ'],
  ['わ', null, 'を', null, 'ん'],
];

const KANJI_DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export function kanjiNumeral(n) {
  if (!Number.isInteger(n) || n < 1 || n > 99) return String(n);
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const head = tens === 0 ? '' : tens === 1 ? '十' : KANJI_DIGITS[tens] + '十';
  return head + KANJI_DIGITS[ones];
}

// ---- ローマ字入力 ----

const ROMAJI = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
  sa: 'さ', si: 'し', shi: 'し', su: 'す', se: 'せ', so: 'そ',
  ta: 'た', ti: 'ち', chi: 'ち', tu: 'つ', tsu: 'つ', te: 'て', to: 'と',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
  ha: 'は', hi: 'ひ', hu: 'ふ', fu: 'ふ', he: 'へ', ho: 'ほ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  ya: 'や', yu: 'ゆ', yo: 'よ', ye: 'いぇ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
  wa: 'わ', wo: 'を', wi: 'うぃ', we: 'うぇ', wu: 'う',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
  za: 'ざ', zi: 'じ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
  ca: 'か', ci: 'し', cu: 'く', ce: 'せ', co: 'こ',
  sha: 'しゃ', shu: 'しゅ', she: 'しぇ', sho: 'しょ',
  cha: 'ちゃ', chu: 'ちゅ', che: 'ちぇ', cho: 'ちょ',
  ja: 'じゃ', ju: 'じゅ', je: 'じぇ', jo: 'じょ',
  fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ', fyu: 'ふゅ',
  thi: 'てぃ', dhi: 'でぃ',
  nn: 'ん', xn: 'ん',
  xtu: 'っ', xtsu: 'っ', ltu: 'っ', ltsu: 'っ',
  xwa: 'ゎ', lwa: 'ゎ',
};
// 拗音は「子音＋y＋母音」を表で広げる（き＋ゃ など2字になる）
{
  const heads = {
    ky: 'き', sy: 'し', ty: 'ち', cy: 'ち', ny: 'に', hy: 'ひ', my: 'み', ry: 'り',
    gy: 'ぎ', zy: 'じ', jy: 'じ', dy: 'ぢ', by: 'び', py: 'ぴ',
  };
  const tails = { a: 'ゃ', i: 'ぃ', u: 'ゅ', e: 'ぇ', o: 'ょ' };
  for (const [h, kana] of Object.entries(heads)) {
    for (const [v, small] of Object.entries(tails)) ROMAJI[h + v] = kana + small;
  }
  const smalls = { a: 'ぁ', i: 'ぃ', u: 'ぅ', e: 'ぇ', o: 'ぉ' };
  for (const [v, small] of Object.entries(smalls)) {
    ROMAJI['x' + v] = small;
    ROMAJI['l' + v] = small;
  }
  for (const v of ['a', 'u', 'o']) {
    ROMAJI['xy' + v] = tails[v];
    ROMAJI['ly' + v] = tails[v];
  }
}

// 確定した字は小さい字を大きくして返す（盤では「きゃ」が「きや」の2マスになる）
const ROMAJI_OUT = new Map(
  Object.entries(ROMAJI).map(([key, kana]) => [key, [...kana].map(toLargeHiragana)]),
);
const PREFIXES = new Set();
for (const key of ROMAJI_OUT.keys()) {
  for (let i = 1; i <= key.length; i++) PREFIXES.add(key.slice(0, i));
}
// ほかの綴りの頭にもなる綴り（あれば確定を待つ）
const HAS_LONGER = new Set(
  [...ROMAJI_OUT.keys()].filter((k) => [...ROMAJI_OUT.keys()].some((o) => o !== k && o.startsWith(k))),
);
const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);
// 同じ子音を重ねると促音。n は「ん」、x・l は小さい字の頭なので除く
const DOUBLE = new Set([...'bcdfghjkmpqrstvwyz']);

export class RomajiBuffer {
  constructor() {
    this.buf = '';
  }

  get pending() {
    return this.buf;
  }

  feed(key) {
    if (typeof key !== 'string' || key.length === 0) return [];
    if (key === '-') return [];
    if (key === "'") {
      const out = this.buf === 'n' ? ['ん'] : [];
      this.buf = '';
      return out;
    }
    const lower = key.toLowerCase();
    if (lower.length === 1 && lower >= 'a' && lower <= 'z') return this.#step(lower);
    // かなのキーが直接届いたら、保留を片づけてそのまま通す
    const kana = key.length <= 2 ? normalizeAnswer(key) : null;
    if (kana) return [...this.flush(), ...kana];
    return [];
  }

  flush() {
    const out = this.buf === 'n' ? ['ん'] : [];
    this.buf = '';
    return out;
  }

  clear() {
    this.buf = '';
  }

  #step(c) {
    const out = [];
    if (this.buf === 'n' && c !== 'n' && c !== 'y' && !VOWELS.has(c)) {
      out.push('ん');
      this.buf = '';
    } else if (this.buf.length === 1 && this.buf === c && DOUBLE.has(c)) {
      out.push('つ');
      this.buf = c;
      return out;
    } else if (this.buf === 't' && c === 'c') {
      out.push('つ');
      this.buf = 'c';
      return out;
    }
    let next = this.buf + c;
    if (!PREFIXES.has(next)) {
      // 続かない綴りは前の保留を捨て、今の字から数え直す
      next = c;
      if (!PREFIXES.has(next)) {
        this.buf = '';
        return out;
      }
    }
    const done = ROMAJI_OUT.get(next);
    if (done && !HAS_LONGER.has(next)) {
      out.push(...done);
      this.buf = '';
    } else {
      this.buf = next;
    }
    return out;
  }
}
