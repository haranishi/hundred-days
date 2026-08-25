/* かな → ローマ字入力の判定。
   IMEと同じ寛容さで受けるのがこのファイルの仕事で、「1つの正解と文字列比較」はしない。
   `し` は shi でも si でも通るし、`ん` は n でも nn でも通る。

   要になる考え方はチャンク。かなを1〜2文字の塊に切り、塊ごとに「通る書き方の集合」を持つ。
   打鍵のたびに、いま溜めているバッファ＋そのキーが候補のどれかの前方一致なら受理する。 */

const SINGLE = {
  'あ': ['a'], 'い': ['i'], 'う': ['u'], 'え': ['e'], 'お': ['o'],
  'か': ['ka', 'ca'], 'き': ['ki'], 'く': ['ku', 'cu', 'qu'], 'け': ['ke'], 'こ': ['ko', 'co'],
  'さ': ['sa'], 'し': ['shi', 'si', 'ci'], 'す': ['su'], 'せ': ['se'], 'そ': ['so'],
  'た': ['ta'], 'ち': ['chi', 'ti'], 'つ': ['tsu', 'tu'], 'て': ['te'], 'と': ['to'],
  'な': ['na'], 'に': ['ni'], 'ぬ': ['nu'], 'ね': ['ne'], 'の': ['no'],
  'は': ['ha'], 'ひ': ['hi'], 'ふ': ['fu', 'hu'], 'へ': ['he'], 'ほ': ['ho'],
  'ま': ['ma'], 'み': ['mi'], 'む': ['mu'], 'め': ['me'], 'も': ['mo'],
  'や': ['ya'], 'ゆ': ['yu'], 'よ': ['yo'],
  'ら': ['ra'], 'り': ['ri'], 'る': ['ru'], 'れ': ['re'], 'ろ': ['ro'],
  'わ': ['wa'], 'を': ['wo'],
  'が': ['ga'], 'ぎ': ['gi'], 'ぐ': ['gu'], 'げ': ['ge'], 'ご': ['go'],
  'ざ': ['za'], 'じ': ['ji', 'zi'], 'ず': ['zu'], 'ぜ': ['ze'], 'ぞ': ['zo'],
  'だ': ['da'], 'ぢ': ['di'], 'づ': ['du', 'dzu'], 'で': ['de'], 'ど': ['do'],
  'ば': ['ba'], 'び': ['bi'], 'ぶ': ['bu'], 'べ': ['be'], 'ぼ': ['bo'],
  'ぱ': ['pa'], 'ぴ': ['pi'], 'ぷ': ['pu'], 'ぺ': ['pe'], 'ぽ': ['po'],
  'ぁ': ['la', 'xa'], 'ぃ': ['li', 'xi'], 'ぅ': ['lu', 'xu'], 'ぇ': ['le', 'xe'], 'ぉ': ['lo', 'xo'],
  'ゃ': ['lya', 'xya'], 'ゅ': ['lyu', 'xyu'], 'ょ': ['lyo', 'xyo'],
  'ー': ['-']
};

/* 2かなで1チャンクになるもの。単独かなより先に並べるので、
   `じゅ` は ji+lyu ではなく ju が既定の書き方になる（表示にもこの順が効く）。 */
const DIGRAPH = {
  'きゃ': ['kya'], 'きゅ': ['kyu'], 'きょ': ['kyo'],
  'しゃ': ['sha', 'sya'], 'しゅ': ['shu', 'syu'], 'しょ': ['sho', 'syo'],
  'ちゃ': ['cha', 'tya', 'cya'], 'ちゅ': ['chu', 'tyu', 'cyu'], 'ちょ': ['cho', 'tyo', 'cyo'],
  'にゃ': ['nya'], 'にゅ': ['nyu'], 'にょ': ['nyo'],
  'ひゃ': ['hya'], 'ひゅ': ['hyu'], 'ひょ': ['hyo'],
  'みゃ': ['mya'], 'みゅ': ['myu'], 'みょ': ['myo'],
  'りゃ': ['rya'], 'りゅ': ['ryu'], 'りょ': ['ryo'],
  'ぎゃ': ['gya'], 'ぎゅ': ['gyu'], 'ぎょ': ['gyo'],
  'じゃ': ['ja', 'jya', 'zya'], 'じゅ': ['ju', 'jyu', 'zyu'], 'じょ': ['jo', 'jyo', 'zyo'],
  'びゃ': ['bya'], 'びゅ': ['byu'], 'びょ': ['byo'],
  'ぴゃ': ['pya'], 'ぴゅ': ['pyu'], 'ぴょ': ['pyo'],
  'ふぁ': ['fa'], 'ふぃ': ['fi'], 'ふぇ': ['fe'], 'ふぉ': ['fo'],
  'てぃ': ['thi'], 'でぃ': ['dhi']
};

/* `ん` の直後がこれらで始まるときは n 単独では確定できない。
   母音は次のかなと合体して読めてしまい（んあ→な）、n と y は nn/nya と紛れるため。 */
const NEEDS_DOUBLE_N = 'aiueony';

/** そのかなが1文字も表に無い＝この判定器が扱えない文字 */
export function isSupported(kana) {
  for (let i = 0; i < kana.length; i += 1) {
    const ch = kana[i];
    if (ch === 'ん' || ch === 'っ') continue;
    if (DIGRAPH[kana.slice(i, i + 2)]) continue;
    if (!SINGLE[ch]) return false;
  }
  return true;
}

/** 位置 i から始まるチャンクの候補。先頭が既定の書き方 */
export function chunksAt(kana, i) {
  const ch = kana[i];
  if (ch === 'ん') return nasalChunks(kana, i);
  if (ch === 'っ') return sokuonChunks(kana, i);

  const out = [];
  const two = kana.slice(i, i + 2);
  if (DIGRAPH[two]) for (const romaji of DIGRAPH[two]) out.push({ romaji, len: 2 });
  if (SINGLE[ch]) for (const romaji of SINGLE[ch]) out.push({ romaji, len: 1 });
  return out;
}

function nasalChunks(kana, i) {
  const out = [];
  if (allowsSingleN(kana, i + 1)) out.push({ romaji: 'n', len: 1 });
  out.push({ romaji: 'nn', len: 1 }, { romaji: 'xn', len: 1 });
  return out;
}

/* 語尾の `ん` も n 単独では確定させない。IMEでも語尾の n は確定せず残るため */
function allowsSingleN(kana, next) {
  if (next >= kana.length) return false;
  if (kana[next] === 'ん') return false;
  const cands = chunksAt(kana, next);
  if (!cands.length) return false;
  return cands.every((c) => !NEEDS_DOUBLE_N.includes(c.romaji[0]));
}

/* `っ` は単独の chunk ではなく、次のチャンクの子音を重ねた合体チャンクとして持つ。
   `がっこ` の `っこ` は kko で1チャンク（かな2文字ぶん）。 */
function sokuonChunks(kana, i) {
  const out = [];
  for (const c of chunksAt(kana, i + 1)) {
    const head = c.romaji[0];
    if (!'aiueon'.includes(head)) out.push({ romaji: head + c.romaji, len: 1 + c.len });
  }
  out.push(
    { romaji: 'ltu', len: 1 }, { romaji: 'xtu', len: 1 },
    { romaji: 'ltsu', len: 1 }, { romaji: 'xtsu', len: 1 }
  );
  return out;
}

/** その語を既定の書き方で打ったときのローマ字（表示と値段の計算に使う） */
export function primaryRomaji(kana) {
  let out = '';
  let i = 0;
  while (i < kana.length) {
    const c = chunksAt(kana, i)[0];
    if (!c) return out;
    out += c.romaji;
    i += c.len;
  }
  return out;
}

/**
 * 1語ぶんの入力判定器。
 * input() は受理したかどうかを返し、受理できなかったときは「押してほしかったキー」を添える。
 */
export function createMatcher(kana) {
  let index = 0;
  let buffer = '';
  let typed = '';

  /* 画面に出す綴りは「いま決めたもの」を持ち回る。毎回その場で組み直すと、
     `ん` を n で打った瞬間に案内が nn へ書き換わり、押す必要のないキーを指してしまう
     （2周目の体験評価で kiritanpo → kiritannpo と変わることが指摘された）。 */
  let plan = [];

  function rebuildPlan() {
    plan = [];
    let i = index;
    while (i < kana.length) {
      const c = chunksAt(kana, i)[0];
      if (!c) break;
      plan.push(c.romaji);
      i += c.len;
    }
  }
  rebuildPlan();

  /** まだ打っていないローマ字。案内は語の途中で書き換わらない */
  function remaining() {
    if (index >= kana.length) return '';
    const rest = plan.slice(1).join('');
    const head = plan[0] || '';
    if (head.startsWith(buffer)) return head.slice(buffer.length) + rest;

    // 案内と違う書き方（si / jyu など）に分岐した。ここでだけ組み直す
    const cands = chunksAt(kana, index);
    const c = cands.find((x) => x.romaji.length > buffer.length && x.romaji.startsWith(buffer));
    return (c ? c.romaji.slice(buffer.length) : '') + rest;
  }

  /** 次に押してほしいキー1文字。案内の先頭と必ず一致する */
  function expected() {
    return remaining()[0] || null;
  }

  function input(key) {
    if (index >= kana.length) return { ok: false, done: true, expected: null };

    const cands = chunksAt(kana, index);
    const next = buffer + key;
    const hits = cands.filter((c) => c.romaji.startsWith(next));

    if (hits.length) {
      const exact = hits.find((c) => c.romaji === next);
      // 完全一致でも、もっと長い候補が生きているうちは確定を保留する。
      // これが無いと `n` を打った瞬間に ん が確定し、nn と打つ癖の人が弾かれる。
      if (exact && !hits.some((c) => c.romaji.length > next.length)) {
        index += exact.len;
        buffer = '';
        rebuildPlan();
      } else {
        buffer = next;
      }
      typed += key;
      return { ok: true, done: index >= kana.length, expected: expected() };
    }

    // どの候補にも当たらない。保留していた完全一致があるなら、それで確定してから打ち直す
    const pending = cands.find((c) => c.romaji === buffer);
    if (pending) {
      index += pending.len;
      buffer = '';
      rebuildPlan();
      return input(key);
    }

    return { ok: false, done: false, expected: expected() };
  }

  return {
    input,
    expected,
    remaining,
    get typed() { return typed; },
    get done() { return index >= kana.length; }
  };
}
