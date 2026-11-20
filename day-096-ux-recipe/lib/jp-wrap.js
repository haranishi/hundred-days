import { Parser } from '../vendor/budoux/parser.js';
import { model } from '../vendor/budoux/ja.js';

// 描画器が組み立てたHTMLを対象とする。引用符内の > や、スクリプト内のタグに似た文字も元のまま残す。
const MARKUP = /<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|title)(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?(?:<\/\1\s*>|$)|<[a-z/!?](?:[^<>"']|"[^"]*"|'[^']*')*>/gi;
const OPEN = '（(「『【〈《〔［｛';
const CLOSE = '）)」』】〉》〕］｝、。，．！？,.!?:;';
const NO_START = CLOSE + '・';
const INSIDE_KATAKANA = /(?<=[\p{sc=Katakana}ーｰﾞﾟ\u3099\u309a])(?=[\p{sc=Katakana}ーｰﾞﾟ\u3099\u309a])/uy;
// 漢字＋送りがな1字＋漢字（売り場・買い物・受け付け・申し込み・取り扱い）は1つの語。BudouX は送りがなの後ろで切る（「売り｜場から」）ので、その境目は捨てる。
// 助詞になりやすい1字（の・は・が・を・に…）は文節の境目なので残す。
const HAN = /[\p{sc=Han}々〆ヶ]/u;
const HIRAGANA = /[\u3041-\u309f]/u;
const PARTICLE = 'のはがをにでとへもやかてばねよわ';
const insideCompound = (text, pos) => HIRAGANA.test(text[pos - 1] ?? '') && !PARTICLE.includes(text[pos - 1])
  && HAN.test(text[pos - 2] ?? '') && HAN.test(text[pos] ?? '');

const DIGITS = '[0-9０-９]+';
const UNITS = [
  '年(?:' + DIGITS + '月)?(?:' + DIGITS + '日)?', '月(?:' + DIGITS + '日)?',
  '時間', '時(?:' + DIGITS + '分)?(?:' + DIGITS + '秒)?',
  '営業日', '[日週分秒]間', '[億万千]円', 'か月', 'ヶ月', 'キロ(?:グラム|メートル)?(?![\\p{sc=Katakana}ー])',
  '[円日分秒人名点件回個枚本台組枠店食袋階歳代冊杯泊席着割倍つ％%+]',
  '(?:mm|cm|km|kg|mg|ml|m|g|l)(?![a-z])',
].join('|');
const SPACE = '[\\t\\p{Zs}]*';
const VALUE = '[¥￥]?' + DIGITS + '(?:[,.，．:：/／]' + DIGITS + ')*(?:' + SPACE + '(?:' + UNITS + '))?';
const QUANTITY = new RegExp(VALUE + '(?:' + SPACE + '[×〜～-]' + SPACE + VALUE + ')*', 'giu');

const NAMED = new Map(Object.entries({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', yen: '¥', times: '×' }));
function referenceChar(ref) {
  // 描画器の使わない名前も一文字ぶんとして扱い、保存するHTMLには必ず元の綴りを使う。
  if (ref[1] !== '#') return NAMED.get(ref.slice(1, -1).toLowerCase()) ?? '\uFFFC';
  const hex = ref[2].toLowerCase() === 'x';
  const code = Number.parseInt(ref.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
  return code > 0 && code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF) ? String.fromCodePoint(code) : '\uFFFD';
}

function textForParser(source) {
  if (!source.includes('&')) return { text: source };
  const offsets = [0];
  let text = '';
  for (const token of source.matchAll(/&(?:#(?:[0-9]+|x[0-9a-f]+)|[a-z][a-z0-9]*);|[\s\S]/giu)) {
    const raw = token[0];
    text += raw.startsWith('&') && raw.length > 1 ? referenceChar(raw) : raw;
    // BudouXと同じUTF-16位置を使うと、絵文字の直後も実体参照の外側を指す。
    offsets[text.length] = token.index + raw.length;
  }
  return { text, offsets };
}

function protectedRanges(text, breaks) {
  const ranges = [];
  function protect(start, end) {
    // 塊の外側に折れ目を作っても禁則を破らないよう、隣の括弧・句読点を引き取る。
    while (start > 0 && OPEN.includes(text[start - 1])) start--;
    while (end < text.length && NO_START.includes(text[end])) end++;
    ranges.push([start, end]);
  }
  for (const match of text.matchAll(QUANTITY)) {
    // 単位も区切りもない長い番号は、欄より長ければCSSで折れるようにする。
    if (!/^[0-9０-９]+$/.test(match[0])) protect(match.index, match.index + match[0].length);
  }
  for (const dot of text.matchAll(/・+/g)) {
    let start = dot.index;
    while (start > 0 && (CLOSE.includes(text[start - 1]) || /[\t\p{Zs}]/u.test(text[start - 1]))) start--;
    const wordEnd = start;
    while (start > 0 && (start === wordEnd || !breaks.has(start)) && !/[\s\p{P}]/u.test(text[start - 1])) start--;
    if (start < wordEnd) protect(start, dot.index + dot[0].length);
  }
  // 「12人・」のような重なりは一つにし、「12人」「96点」のように接するだけなら間で折れる。
  const merged = [];
  for (const range of ranges.sort((a, b) => a[0] - b[0])) {
    const previous = merged.at(-1);
    if (previous && range[0] < previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else merged.push(range);
  }
  return new Map(merged);
}

let parser;
const cache = new Map();
function wrapText(source) {
  if (!source) return '';
  const saved = cache.get(source);
  if (saved !== undefined) return saved;

  const { text, offsets } = textForParser(source);
  parser ??= new Parser(model);
  const breaks = new Set(parser.parseBoundaries(text).filter(pos => {
    INSIDE_KATAKANA.lastIndex = pos;
    return !INSIDE_KATAKANA.test(text) && !OPEN.includes(text[pos - 1]) && !NO_START.includes(text[pos]) && !insideCompound(text, pos);
  }));
  const spans = protectedRanges(text, breaks);
  for (const [start, end] of spans) {
    breaks.add(start);
    breaks.add(end);
  }

  const slice = (start, end) => source.slice(offsets ? offsets[start] : start, offsets ? offsets[end] : end);
  let html = '';
  let cursor = 0;
  for (const pos of [...breaks].sort((a, b) => a - b)) {
    if (pos < cursor) continue;
    html += slice(cursor, pos) + '<wbr>';
    cursor = spans.get(pos) ?? pos;
    if (cursor > pos) html += '<span class="uxr-nb">' + slice(pos, cursor) + '</span>';
  }
  html += slice(cursor, text.length);
  if (cache.size === 500) cache.delete(cache.keys().next().value);
  cache.set(source, html);
  return html;
}

export function wrapPageHtml(html) {
  let result = '';
  let start = 0;
  for (const tag of html.matchAll(MARKUP)) {
    result += wrapText(html.slice(start, tag.index)) + tag[0];
    start = tag.index + tag[0].length;
  }
  return result + wrapText(html.slice(start));
}
