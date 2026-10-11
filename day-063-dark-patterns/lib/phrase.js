/* 日本語の文を文節（内容語＋付属語）に区切り、文節の切れ目でだけ改行させる。
   word-break: auto-phrase は Chrome 系だけで、iPhone の Safari では1文字単位で折れる。そこで
   Intl.Segmenter('ja') の「語」を下の規則で文節にまとめ、切れ目に <wbr> を差し込む（CSS は keep-all）。

   keep-all にしても、ブラウザは句読点・括弧・記号の前後では自分で改行する（Chrome で実測。
   「罠UI」｜を、（欺瞞的UI）｜を、月額｜¥1,280 など）。文節の内側にあるその場所は、
   white-space: nowrap の短い span（data-ph 属性）で糊付けする。糊付けするのは記号のまわりの
   2〜3文字だけなので、文節が1行より長いときは overflow-wrap: anywhere で非常用に折れる。

   Intl.Segmenter が無い環境では何もしない（ブラウザ標準の折り返しのまま）。 */

const segmenter = typeof Intl === "object" && typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("ja", { granularity: "word" })
  : null;

export const GLUE_ATTR = "data-ph";
/* phrasifyNode が入れた <wbr> の印。後片付けで、書き手が飛ばす要素や nowrap の中に置いた <wbr> と見分けて、
   印のあるものだけを外す（印がないと、呼ぶたびに書き手の <wbr> を消すか、自分の <wbr> が増えていく） */
export const BREAK_ATTR = "data-phrase-break";
export const PHRASED_ATTR = "data-phrased";
const SKIP_SELECTOR = "script, style, textarea, [data-no-phrase]";

// white-space: nowrap（と pre）の要素か。この中は1行に守る約束なので、切れ目も糊付けも入れない
const keepsWhole = (el, view) => Boolean(view && el) && /^(nowrap|pre)$/.test(view.getComputedStyle(el).whiteSpace);

const isHira = (c) => /^[ぁ-ゟ]/.test(c);
// 内容語の文字（漢字・カタカナ・英数字・通貨記号・%）。中黒「・」は区切りなので含めない
const isContent = (c) => c !== "・" && /^[一-鿿㐀-䶿々〆゠-ヿA-Za-z0-9０-９Ａ-Ｚａ-ｚ¥￥$＄%％]/.test(c);
// 文字（かな・漢字・英数字・長音）。これどうしの間は keep-all でブラウザが折らない
const LETTER = /[\p{L}\p{N}]/u;
const SPACE = /\s/;

const OPEN_END = /[「『（(［[【〈《〔“‘]$/;
const ATTACH_TO_PREV = /^[、。，．,.！？!?）)」』］\]】〉》〕”’・：:；;…‥ー〜~／/＝=％%]/;
const JOIN_NEXT_END = /[＝=＋+→➔−－¥￥$＄※#＃-]$/;
const SENTENCE_END = /[。．！？!?]$/;
const DIGIT = /^[0-9０-９]/;
// 「11:00〜14:00」「¥12,800/年」のように、数字と区切り記号のあとは前に付ける
const AFTER_NUMBER_SEP = /[0-9０-９][:：.,，〜~／/-]$/;
const AFTER_NUMBER_SLASH = /[0-9０-９][／/]$/;

// 短い括弧書き（中身8文字まで）は途中で折らない：「（契約を維持）」「（タップで展開）」
const BRACKETS = { "（": "）", "(": ")", "「": "」", "『": "』", "【": "】" };
const SHORT_BRACKET_INNER = 8;

const letterCount = (s) => Array.from(s).filter((c) => LETTER.test(c)).length;

// 文字の種類。漢字・カタカナ・英字の切り替わりは、長い複合語を分けてよい場所
const scriptOf = (c) => {
  if (/[一-鿿㐀-䶿々〆]/.test(c)) return "kanji";
  if (/[゠-ヿ]/.test(c)) return "katakana";
  if (/[A-Za-zＡ-Ｚａ-ｚ]/.test(c)) return "latin";
  return "other"; // 数字・¥・% など（単位や金額は前後と離さない）
};
// 複合語がこの文字数を超えたら、文字の種類が変わるところで分ける（1行に入らない長さにしない）
const LONG_COMPOUND = 10;
// 「払い｜続けます」「受け｜取って」のような複合動詞（漢字＋連用形の送りがな、のあとに漢字が続く）。
// Intl.Segmenter は「払い／続／け／ます」と分けるので、送りがなで終わる語の直後の漢字を前に付ける
const VERB_STEM = /[一-鿿々][いきしちにひみりぎじびぴえけげせぜてでねへべぺめれ]$/;
const VERB_NEXT = /^[一-鿿々]/;

function attaches(prev, segment, lastSegment) {
  const first = segment[0];
  const tail = prev[prev.length - 1];
  if (SPACE.test(first) && segment.trim() === "") return true; // 空白は直前に付ける（空白の後ろで折れる）
  if (SPACE.test(tail)) return isHira(first) && !SENTENCE_END.test(prev.trimEnd()); // 空白の後ろは新しい文節（英単語の間）
  if (ATTACH_TO_PREV.test(first)) return true; // 句読点・閉じ括弧・区切り記号
  if (OPEN_END.test(prev) || JOIN_NEXT_END.test(prev)) return true; // 開き括弧・符号・通貨記号・※のあと
  if (DIGIT.test(first) && AFTER_NUMBER_SEP.test(prev)) return true;
  if (AFTER_NUMBER_SLASH.test(prev)) return true;
  // ひらがなで始まる語（助詞・活用語尾・ひらがなの語）は、文の頭でなければ前に付ける。
  // 行頭に助詞やひらがなが来ないようにするため、読点のあとでも付ける
  if (isHira(first)) return !SENTENCE_END.test(prev);
  if (/^[おご]$/.test(lastSegment) && isContent(first)) return true; // 「お金」「ご利用」の接頭辞と次の語を離さない
  if (VERB_STEM.test(lastSegment) && VERB_NEXT.test(segment)) return true; // 複合動詞
  if (first === tail && !LETTER.test(first)) return true; // ★★★★★ のような同じ記号の連続
  if (!isContent(tail) || !isContent(first)) return false;
  // 複合語・単位・英数字の続き。ただし長い複合語は、漢字・カタカナ・英字の切り替わりで分ける
  const [a, b] = [scriptOf(tail), scriptOf(first)];
  const switches = a !== b && a !== "other" && b !== "other";
  return !(switches && letterCount(prev) >= LONG_COMPOUND);
}

// 短い括弧書きの内側にある切れ目を取り除く
function dropShortBracketBreaks(text, boundaries) {
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (BRACKETS[c]) {
      stack.push({ open: c, at: i });
    } else if (stack.length && BRACKETS[stack[stack.length - 1].open] === c) {
      const { at } = stack.pop();
      if (i - at - 1 <= SHORT_BRACKET_INNER) {
        for (const b of [...boundaries]) if (b > at && b <= i) boundaries.delete(b);
      }
    }
  }
}

/* 文を文節の配列に分ける。連結すると元の文に戻る。
   例: phrases("ネットに潜む「罠UI」を看破せよ") → ["ネットに", "潜む", "「罠UI」を", "看破せよ"] */
export function phrases(text) {
  const source = text == null ? "" : String(text);
  if (source === "") return [];
  if (!segmenter) return [source];

  const pieces = [];
  let lastSegment = "";
  for (const { segment } of segmenter.segment(source)) {
    if (pieces.length && attaches(pieces[pieces.length - 1], segment, lastSegment)) {
      pieces[pieces.length - 1] += segment;
    } else {
      pieces.push(segment);
    }
    lastSegment = segment;
  }

  // 切れ目の位置（文字列の先頭からの位置）にして、例外の規則を当てる
  const boundaries = new Set();
  let offset = 0;
  for (const piece of pieces.slice(0, -1)) {
    offset += piece.length;
    boundaries.add(offset);
  }
  dropShortBracketBreaks(source, boundaries);

  let list = [];
  let start = 0;
  for (const b of [...boundaries].sort((x, y) => x - y)) {
    list.push(source.slice(start, b));
    start = b;
  }
  list.push(source.slice(start));

  /* 文字が1つ以下の文節（「B」「★★★★★」など）は、1文字だけの行にならないよう隣にくっつける。
     前が空白で終わるとき（空白のあとはブラウザが必ず折れる）と先頭は後ろへ、それ以外は前へ */
  const merged = [];
  let carry = "";
  for (const piece of list) {
    const current = carry + piece;
    carry = "";
    if (letterCount(current) <= 1) {
      const last = merged[merged.length - 1];
      if (last !== undefined && !SPACE.test(last[last.length - 1])) merged[merged.length - 1] += current;
      else carry = current;
      continue;
    }
    merged.push(current);
  }
  if (carry) {
    if (merged.length) merged[merged.length - 1] += carry;
    else merged.push(carry);
  }
  return merged;
}

// 文節の切れ目の位置（先頭は含めない）。レイアウト検査が「行頭が文節の境目か」を確かめるのに使う
export function phraseBoundaries(text) {
  const list = phrases(text);
  const result = [];
  let offset = 0;
  for (const piece of list.slice(0, -1)) {
    offset += piece.length;
    result.push(offset);
  }
  return result;
}

// a と b の間で、keep-all の下でもブラウザ自身が改行しうるか（文字どうしの間は折れない。記号・括弧・空白の前後は折れうる）
const mayBreakInside = (a, b) => !(LETTER.test(a) && LETTER.test(b));

// 文節の内側で糊付けする「文字の間」の位置（文節の頭からの位置）。文節の前後の空白は対象にしない
function gluePositions(phrase) {
  const chars = Array.from(phrase);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi && SPACE.test(chars[lo])) lo += 1;
  while (hi > lo && SPACE.test(chars[hi - 1])) hi -= 1;
  const positions = [];
  let at = 0;
  chars.forEach((c, i) => {
    if (i > lo && i < hi && mayBreakInside(chars[i - 1], c)) positions.push(at);
    at += c.length;
  });
  return positions;
}

// 文字ノードが属する「行の入れ物」（インラインでない、いちばん近い祖先）。<strong> などをまたいで1つの文として区切るため
function blockOf(element, view) {
  for (let cur = element; cur; cur = cur.parentElement) {
    const display = view ? view.getComputedStyle(cur).display : "block";
    if (display !== "inline" && display !== "contents") return cur;
  }
  return null;
}

/* 同じ行の入れ物に並ぶ文字ノード（<strong> などをまたぐ）をつなげて文節に分け、切れ目に <wbr>、
   文節の内側でブラウザが折れうる場所に糊付けの span を入れる。糊付けは1つの文字ノードの中だけ。
   white-space: nowrap（と pre）の中には何も入れない。Chrome は nowrap の中の <wbr> でも折り返すため、
   「30% OFF！」のように意図して1行に守った文言が割れてしまう（ノードの先頭の切れ目だけは入れる） */
function applyGroup(doc, nodes, view) {
  const full = nodes.map((node) => node.data).join("");
  const list = phrases(full);
  const cuts = new Set(); // <wbr> を入れる位置（つなげた文字列の上の位置）
  const glued = new Set(); // 糊付けする「文字の間」の位置（その位置の文字と、1つ前の文字の間）
  let offset = 0;
  list.forEach((phrase, index) => {
    if (index > 0) cuts.add(offset);
    for (const at of gluePositions(phrase)) glued.add(offset + at);
    offset += phrase.length;
  });

  let start = 0;
  for (const node of nodes) {
    const text = node.data;
    const keepWhole = keepsWhole(node.parentElement, view);
    const fragment = buildFragment(doc, text, start, cuts, glued, keepWhole);
    if (fragment) node.replaceWith(fragment);
    start += text.length;
  }
}

// 文節の切れ目の <wbr>。後片付けで書き手の <wbr> と見分けるため、印（BREAK_ATTR）を付ける
function makeBreak(doc) {
  const wbr = doc.createElement("wbr");
  wbr.setAttribute(BREAK_ATTR, "");
  return wbr;
}

// 1つの文字ノードの中身を、<wbr> と糊付けの span を入れた断片にする。何も入れない場合は null。
// keepWhole（nowrap の中）のときは、先頭の切れ目の <wbr> だけを入れ、中には何も入れない
function buildFragment(doc, text, start, cuts, glued, keepWhole = false) {
  if (keepWhole) {
    if (!(cuts.has(start) && start > 0)) return null;
    const fragment = doc.createDocumentFragment();
    fragment.append(makeBreak(doc), text);
    return fragment;
  }
  const runs = []; // { text, length, wbrBefore }
  let changed = false;
  let local = 0;
  for (const c of Array.from(text)) {
    const at = start + local;
    const cut = cuts.has(at) && at > 0;
    const join = local > 0 && glued.has(at) && !cut;
    if (join) {
      runs[runs.length - 1].text += c;
      runs[runs.length - 1].length += 1;
    } else {
      runs.push({ text: c, length: 1, wbrBefore: cut });
    }
    if (cut) changed = true;
    local += c.length;
  }
  if (!changed && !runs.some((run) => run.length >= 2)) return null;

  const fragment = doc.createDocumentFragment();
  let plain = "";
  for (const run of runs) {
    if (run.wbrBefore) {
      if (plain) fragment.append(plain);
      plain = "";
      fragment.append(makeBreak(doc));
    }
    if (run.length >= 2) {
      if (plain) fragment.append(plain);
      plain = "";
      const span = doc.createElement("span");
      span.setAttribute(GLUE_ATTR, "");
      span.textContent = run.text;
      fragment.append(span);
    } else {
      plain += run.text;
    }
  }
  if (plain) fragment.append(plain);
  return fragment;
}

/* root の中の文字に、文節の切れ目の <wbr> と糊付けの span を入れる。
   - 何度呼んでも同じ結果（前回の <wbr> と糊付けを外してから入れ直す）
   - 文字の内容（textContent）は変えない
   - script・style・textarea・[data-no-phrase] の中は触らない（書き手が置いた <wbr> も残す）
   - white-space: nowrap の中に書き手が置いた <wbr> と糊付けも残す
   - <strong> などのインライン要素をまたいで、同じ行の入れ物の文字を1つの文として区切る
   文字を入れ替えたら、その要素に対して呼び直す。 */
export function phrasifyNode(root) {
  if (!segmenter || !root || typeof root.querySelectorAll !== "function") return root;
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  /* 前回の後片付け。飛ばす要素の中と nowrap の中には、印のない <wbr> も糊付けも入れていない
     （nowrap の中に入れるのは、印つきの先頭の <wbr> だけ）。そこにある印のないものは書き手が置いたものなので残す。
     それ以外の場所の <wbr> は、印がなくても外して文節の切れ目に置き直す */
  const byAuthor = (el) => Boolean(el.closest(SKIP_SELECTOR)) || keepsWhole(el.parentElement, view);
  for (const wbr of root.querySelectorAll("wbr")) {
    if (wbr.hasAttribute(BREAK_ATTR) || !byAuthor(wbr)) wbr.remove();
  }
  for (const glue of root.querySelectorAll(`span[${GLUE_ATTR}]`)) {
    if (!byAuthor(glue)) glue.replaceWith(...glue.childNodes);
  }
  root.normalize();

  const groups = new Map();
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIP_SELECTOR)) continue;
    /* flex・grid の入れ物の直下にある文字は飛ばす。<wbr> や span を入れると、そこで別々の項目に分かれてしまい、
       読み上げ名が「Xで 投稿」のように空白入りになったり、項目の間の gap が増えたりする（ボタンや札の短い文言） */
    if (view && /flex|grid/.test(view.getComputedStyle(parent).display)) continue;
    const block = blockOf(parent, view);
    if (!groups.has(block)) groups.set(block, []);
    groups.get(block).push(node);
  }
  for (const nodes of groups.values()) applyGroup(doc, nodes, view);
  root.setAttribute(PHRASED_ATTR, "");
  return root;
}
