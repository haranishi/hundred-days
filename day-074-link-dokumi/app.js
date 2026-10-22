/* リンクの毒見 — 画面の制御。
   判定はしない。判定は lib/rules.js の evaluate が持ち、ここは「状態の切り替え」と「描画」だけを受け持つ。

   守っていること（E2E とソースの走査で固定している）
   - 取得先の文字列は、必ず textContent と setAttribute で入れる。HTMLとして解釈させる書き方は使わない。
     見えない制御文字・向きを変える文字は ⟦U+202E⟧ の形にして見せる（vis）。
   - リンクの href に入れるのは http: と https: のURLだけ（safeHref）。電話は数字だけの tel: に限る（telHref）。
   - 何も保存しない。ブラウザの保存領域・Cookie・URLの書き換えを使わない。
     「戻る」で入力に戻れるよう履歴は1つ積むが、URLは変えない（画面の状態だけ。端末には何も残らない）。
   - 通信は同じサイトの /api/day-074/trace と /api/day-074/around だけ。外部のサービスは、押したときに別タブで開くリンクだけ。
   - 画面に書く数字（転送の回数・読み取る量・回数の上限・一時的に置く時間）は LIMITS から作る。 */

import { LIMITS, validateTrace, validateAround } from './lib/contract.js';
import { parseInput } from './lib/url-input.js';
import { analyzeLexical } from './lib/lexical.js';
import * as rules from './lib/rules.js';
import { LIMITS_TEXT } from './lib/messages.js';
import { buildReport, buildSummary } from './lib/report.js';
import { CONSULT_LINKS, EXTERNAL_CHECKS } from './lib/resources.js';
import { SAMPLES } from './lib/samples.js';
import { visitorLevel, gradeOf } from './lib/score.js';
import { toUnicodeHost } from './lib/punycode.js';

/* ---------------------------------------------------------------- 文言と対応表 */

const LEVEL_META = {
  ok: { word: '見当たらない', shape: 'check' },
  note: { word: '気になる', shape: 'info' },
  warn: { word: '注意', shape: 'triangle' },
  danger: { word: '近づかない', shape: 'octagon' },
  unknown: { word: '不明', shape: 'question' }
};
const SCALE = ['ok', 'note', 'warn', 'danger'];
const SEVERITY_WORD = { critical: '重大', high: '高', medium: '中', low: '低', info: '参考' };
const PRIORITY_WORD = { critical: '最優先', high: '高', medium: '中', low: '低', info: '参考' };
const STATE_WORD = { waiting: '待ち', running: '実行中', done: '完了', failed: '失敗', skipped: '省略' };
const MAX_INPUT = 20000;
const CLIENT_TRACE_TIMEOUT_MS = LIMITS.TRACE_TIMEOUT_MS + 6000;
const CLIENT_AROUND_TIMEOUT_MS = LIMITS.AROUND_TIMEOUT_MS + 6000;
const CACHE_MINUTES = Math.round(LIMITS.CACHE_TTL_S / 60);
/* 「時間がかかっています」の案内を出し始める目安。画面の工夫で、契約の数字ではないので文面には出さない */
const SLOW_HINT_AFTER_MS = 5000;
const CAVEAT_PATTERN = /見つからなかったことは、?安全の保証ではありません。?/g;

/* こちら側（このアプリ・通信）の都合で調べられなかった種類。相手のサイトのせいに見える言い方をしない。
   判定側には evaluate の failure（rate_limited・server_error・network）で渡し、行動・一文・所見をこちら側の言い方にしてもらう */
const LOCAL = new Set(['network', 'client_timeout', 'rate', 'disabled', 'forbidden', 'invalid', 'server', 'broken']);
const LIB_FAILURE = { rate: 'rate_limited', network: 'network', client_timeout: 'network', server: 'server_error', broken: 'server_error', disabled: 'server_error', forbidden: 'server_error', invalid: 'server_error' };
const LOCAL_LEAD = 'このアプリ（または通信）の問題で調べられませんでした。相手のサイトの問題とは限りません。';

/* 失敗の短い名前・最初に言うこと（lead）・何が起きたか・次の行動 */
const FAILURES = {
  rate: {
    short: '回数の上限',
    lead: 'このアプリの回数の上限に達しました。相手のサイトの問題ではありません。',
    what: `上限は1分あたり約${LIMITS.RATE_PER_MINUTE}回で、1回の診断で2回使います。相手のサイトには問い合わせていません。`,
    next: '1分ほど待ってから、もう一度試してください。'
  },
  network: { short: '通信できず', lead: LOCAL_LEAD, what: 'この画面から、診断のサーバーに届きませんでした。通信が切れているかもしれません。', next: '通信の状態を確かめてから、もう一度試してください。' },
  client_timeout: { short: '時間切れ', lead: LOCAL_LEAD, what: '診断のサーバーから、時間内に結果が返ってきませんでした。', next: '少し待ってから、もう一度試してください。' },
  disabled: { short: '一時停止中', lead: 'いまは、このアプリの調べる機能を一時的に止めています。相手のサイトの問題ではありません。', what: '', next: '時間をおいて、もう一度試してください。' },
  forbidden: { short: '受け付けられず', lead: LOCAL_LEAD, what: 'この呼び出しは、診断のサーバーに受け付けられませんでした。', next: 'このページを開き直してから、もう一度試してください。' },
  invalid: { short: '調べられない形', lead: 'このアドレスは、このアプリでは調べられない形でした。', what: '', next: 'アドレスを確かめてから、もう一度試してください。' },
  server: { short: 'サーバーの問題', lead: LOCAL_LEAD, what: '診断のサーバーで問題が起きました。', next: '少し時間をおいて、もう一度試してください。' },
  broken: { short: '読み取れず', lead: LOCAL_LEAD, what: '診断の結果を読み取れませんでした。', next: '少し時間をおいて、もう一度試してください。' },
  invalid_url: { short: '調べられない形', what: 'このアドレスは、調べられない形でした。', next: 'アドレスを確かめてから、もう一度試してください。' },
  blocked_target: { short: '公開されていない宛先', what: '公開されていない宛先（社内向けの機器や管理画面など）を指していたので、つなぎませんでした。', next: '心当たりのないリンクなら、開かないでください。' },
  blocked_redirect: { short: '転送先が公開されていない宛先', what: '転送の途中で、公開されていない宛先へ向かったので、そこで止めました。', next: 'ふつうのサイトでは起きにくい転送です。開かないでください。' },
  resolver_unavailable: { short: 'DNSに問い合わせられず', what: '名前を調べる仕組み（DNS）に、一時的に問い合わせられませんでした。', next: '少し時間をおいて、もう一度試してください。' },
  dns_failed: { short: '名前が見つからない', what: 'このアドレスの名前（ドメイン）が見つかりませんでした。打ち間違いか、もう使われていない名前かもしれません。つながらないことは、安全の印ではありません（詐欺のサイトは短い期間で消えることがあります）。', next: '届いたリンクは開かず、公式のアプリや窓口から確かめてください。' },
  connect_failed: { short: 'つながらない', what: '相手のサーバーにつながりませんでした。', next: '時間をおいて試すか、公式のアプリや窓口から確かめてください。' },
  tls_failed: { short: '暗号化の失敗', what: '暗号化した接続（HTTPS）に失敗しました。証明書に問題があるか、HTTPSに対応していないのかもしれません。', next: 'このリンクには、IDやパスワードを入れないでください。' },
  timeout: { short: '時間切れ', what: '相手のサイトが、この診断に時間内に応えませんでした。一部のサイトは、ブラウザ以外からのアクセスを遅くしたり断ったりします。', next: '時間をおいて試すか、公式のアプリや窓口から確かめてください。' },
  too_many_redirects: { short: '転送が多すぎる', what: `転送が${LIMITS.MAX_REDIRECTS}回を超えたので、たどるのをやめました。`, next: '転送を何度も重ねるリンクは、行き先を確かめにくい形です。開かないでください。' },
  blocked_by_challenge: { short: '取得を断られた', what: '相手のサイトのボット対策などで、取得を断られました。断られたこと自体は、なりすましの根拠ではありません。', next: '入力の前には、公式のアプリや窓口から開き直してください。' },
  upstream_error: { short: '読み取れる応答がない', what: '相手のサーバーから、読み取れる応答が返ってきませんでした。', next: '時間をおいて、もう一度試してください。' }
};
/* 通信しない入力（parseInput の fetch.reason） */
const NOT_FETCHED = {
  userinfo: '「@」の前に文字があるアドレスは、本当の行き先を取り違えやすい形なので、つなぎに行きません。',
  numeric_host: '数字だけのアドレス（IPアドレス）は、社内の機器などを指すことがあるので、つなぎに行きません。',
  reserved_name: '社内向けや予約済みの名前（.local・.example など）なので、つなぎに行きません。',
  port: 'ふつうと違う番号（ポート）を指定したアドレスなので、つなぎに行きません。',
  scheme: 'http:// か https:// で始まらないアドレスなので、つなぎに行きません。',
  too_long: `${LIMITS.MAX_URL_LENGTH}字を超える長いアドレスなので、つなぎに行きません。`,
  self: 'このサイト自身のアドレスなので、調べに行きません。'
};

/* ---------------------------------------------------------------- 描画の部品（文字は必ず textContent で入れる） */

const SVG_NS = 'http://www.w3.org/2000/svg';
/* 見せない文字の範囲（コードポイント）。制御文字・文字の向きを変える文字・幅のない文字・見えない字形。
   正規表現に直接書くと、編集の道具や閲覧の画面で生の制御文字に化けることがあるので、数で持つ */
const HIDDEN_RANGES = [
  [0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x61c, 0x61c], [0x115f, 0x1160],
  [0x17b4, 0x17b5], [0x180e, 0x180e], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0x2066, 0x206f],
  [0x3164, 0x3164], [0xfeff, 0xfeff], [0xffa0, 0xffa0], [0xfff9, 0xfffb]
];
const isHidden = (code) => HIDDEN_RANGES.some(([from, to]) => code >= from && code <= to);

/** 見えない文字・向きを変える文字を ⟦U+XXXX⟧ に置き換えて、取得先の細工が画面で見えるようにする */
export function vis(value) {
  let out = '';
  for (const char of String(value ?? '')) {
    const code = char.codePointAt(0);
    out += isHidden(code) ? `⟦U+${code.toString(16).toUpperCase().padStart(4, '0')}⟧` : char;
  }
  return out;
}

/** http: と https: のURLだけを通す（javascript: などは null） */
export function safeHref(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** 電話番号を tel: にする。数字と # + だけを通し、# は %23 にする（#9110 → tel:%239110） */
export function telHref(phone) {
  const digits = String(phone ?? '').replace(/[^0-9#+]/g, '');
  if (!/^[+#]?[0-9]{3,15}$/.test(digits)) return null;
  return `tel:${digits.replace('#', '%23')}`;
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = vis(value);
    else if (key === 'dataset') for (const [name, data] of Object.entries(value)) node.dataset[name] = String(data);
    else if (key === 'href') {
      const href = safeHref(value);
      if (href) node.setAttribute('href', href);
    } else if (key.startsWith('on')) {
      // 属性としての on〜（インラインのイベント属性）は作らない。関数だけを addEventListener で付ける
      if (typeof value === 'function') node.addEventListener(key.slice(2), value);
    } else node.setAttribute(key, value === true ? '' : String(value));
  }
  append(node, children);
  return node;
}
/* ボタン・リンク・開閉の札は短い1行の名前で、横並び（flex）の部品が多い。中を分けると字の間に隙間ができるので、包まない */
const LABEL_TAGS = new Set(['BUTTON', 'A', 'SUMMARY']);
function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      const text = vis(child);
      node.append(...(LABEL_TAGS.has(node.tagName) ? [document.createTextNode(text)] : textPieces(text)));
    } else node.append(child);
  }
  return node;
}

/* 日本語の文の中の「script-src」のような英数字の語、「1分あたり約12回」「5分」のような数と単位、「もう一度」は、途中で折らない。
   文字（textContent）は変えず、短いかたまりだけを折らない札（.nb）で包む。長いものと、日本語を含まない値はそのまま */
const NO_BREAK = /[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+|(?:[0-9]+(?:分|秒|時間)あたり)?約?[0-9][0-9,.]*(?:回|秒|分|件|点|日|字|年|か所|KiB)|もう一度|見た目|たどり着く先|気になる|[一-龥ァ-ヶー]{1,3}[A-Za-z][A-Za-z0-9]+/g;
function textPieces(text) {
  if (text.length > 4000 || !hasJapanese(text)) return [document.createTextNode(text)];
  const pieces = [];
  let at = 0;
  for (const match of text.matchAll(NO_BREAK)) {
    if (match[0].length > 32) continue;
    if (match.index > at) pieces.push(document.createTextNode(text.slice(at, match.index)));
    const span = document.createElement('span');
    span.className = 'nb';
    span.textContent = match[0];
    pieces.push(span);
    at = match.index + match[0].length;
  }
  if (at < text.length) pieces.push(document.createTextNode(text.slice(at)));
  return pieces;
}
/** 中身を入れ替える。null と undefined は飛ばす（replaceChildren に渡すと文字の「null」になる） */
function fill(node, ...children) {
  node.replaceChildren();
  return append(node, children);
}
function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/* 段階の記号。形だけで区別できるように、5つとも輪郭を変えている（色・記号・言葉の3つで示す）。
   丸に i は段階「気になる」だけに使う。中立の情報（参考・途中の知らせ）は、段階と重ならない「四角にメモ線」（memo） */
const GLYPH = '#FBF8F1';
function shapeIcon(shape) {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', 'data-shape': shape });
  const fill = { fill: 'currentColor' };
  const stroke = (d, width = 2.4) => svgEl('path', { d, fill: 'none', stroke: GLYPH, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const dot = (cx, cy, r = 1.45) => svgEl('circle', { cx, cy, r, fill: GLYPH });
  switch (shape) {
    case 'check':
      svg.append(svgEl('circle', { cx: 12, cy: 12, r: 10.5, ...fill }), stroke('M7.3 12.4l3.1 3.1 6.3-6.9'));
      break;
    case 'info':
      svg.append(svgEl('circle', { cx: 12, cy: 12, r: 10.5, ...fill }), dot(12, 7.4), stroke('M12 10.9v6.2', 2.6));
      break;
    case 'triangle':
      svg.append(svgEl('path', { d: 'M12 1.8 23.2 21.6H.8Z', 'stroke-linejoin': 'round', ...fill }), stroke('M12 8.6v6.2', 2.5), dot(12, 18.1));
      break;
    case 'octagon':
      svg.append(svgEl('path', { d: 'M7.5 1.5h9l6 6v9l-6 6h-9l-6-6v-9Z', ...fill }), stroke('M8.5 8.5l7 7M15.5 8.5l-7 7', 2.5));
      break;
    case 'plus':
      svg.append(svgEl('rect', { x: 1.8, y: 1.8, width: 20.4, height: 20.4, rx: 5, ...fill }), stroke('M12 7v10M7 12h10', 2.5));
      break;
    case 'memo':
      svg.append(
        svgEl('rect', { x: 3.2, y: 3.2, width: 17.6, height: 17.6, rx: 3.2, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9 }),
        svgEl('path', { d: 'M7.5 9h9M7.5 12.5h9M7.5 16h5.5', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round' }));
      break;
    case 'send':
      svg.setAttribute('aria-hidden', 'true');
      svg.append(svgEl('path', { d: 'M4 12h12M12 6l6 6-6 6M20 4v16', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      break;
    default:
      svg.append(svgEl('circle', { cx: 12, cy: 12, r: 10.5, ...fill }), stroke('M9.3 9.4a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2 1-1.2 1.9v.5', 2.3), dot(12, 17.6));
  }
  return svg;
}
function levelIcon(level) {
  const meta = LEVEL_META[level] ?? LEVEL_META.unknown;
  return el('span', { class: `lv-icon lv-${LEVEL_META[level] ? level : 'unknown'}` }, shapeIcon(meta.shape));
}

/** 長いURLは真ん中を省く（全体は別に出す） */
function middle(value, max = 72) {
  const text = String(value ?? '');
  if (text.length <= max) return text;
  const head = Math.ceil((max - 1) * 0.62);
  return `${text.slice(0, head)}…${text.slice(text.length - (max - 1 - head))}`;
}

/** URLを「/ . ? & = #」の後ろでだけ折れるかたまりに分ける（ハイフンや語の途中では折らない） */
function urlNode(text, className = 'url mono') {
  const parts = [];
  let current = '';
  for (const char of vis(text)) {
    current += char;
    if ('/.?&=#'.includes(char)) {
      parts.push(current);
      current = '';
    }
  }
  if (current) parts.push(current);
  const node = el('span', { class: className });
  parts.forEach((part, index) => {
    if (index) node.append(document.createElement('wbr'));
    node.append(el('span', { class: 'url__part' }, part));
  });
  return node;
}

/** ホスト名を「手前の名前」と「持ち主を表す登録ドメイン」に分けて見せる。登録ドメインは1かたまり、手前は「.」の後ろでだけ折る */
function hostParts(host, registrable) {
  const shown = String(host ?? '');
  const reg = String(registrable ?? '');
  const regUnicode = toUnicodeHost(reg);
  for (const tail of [reg, regUnicode]) {
    if (tail && shown.length > tail.length && shown.endsWith(tail) && shown[shown.length - tail.length - 1] === '.') {
      const labels = shown.slice(0, shown.length - tail.length - 1).split('.');
      return el('span', { class: 'host' },
        labels.map((label) => [el('span', { class: 'host__label' }, `${label}.`), document.createElement('wbr')]),
        el('span', { class: 'host__reg' }, tail));
    }
  }
  return el('span', { class: 'host' }, el('span', { class: 'host__reg' }, shown));
}

/** URLを「scheme:// ＋ ホスト（持ち主の名前に色）＋ 残り」に分けて見せる。ホストは「.」の後ろでだけ折れ、持ち主の名前の途中では折れない。
    文字がそのまま「scheme://ホスト」で始まるときだけ分ける（@の左の文字・大文字・国際化ドメインなどは、元の文字を変えずに区切りだけ入れる） */
function urlWithHost(text, registrable, className = 'url mono') {
  const value = String(text ?? '');
  let url;
  try {
    url = new URL(value);
  } catch {
    return urlNode(value, className);
  }
  const head = `${url.protocol}//${url.hostname}`;
  const port = url.port ? `:${url.port}` : '';
  if (url.username || url.password || !value.startsWith(head + port)) return urlNode(value, className);
  const rest = value.slice(head.length + port.length);
  return el('span', { class: className }, `${url.protocol}//`, document.createElement('wbr'), hostParts(url.hostname, registrable),
    port || null, rest ? [document.createElement('wbr'), urlNode(rest, 'url')] : null);
}
/** 長いURLは真ん中を省いて区切りだけ入れ、収まるものは持ち主の名前に色を付けて見せる */
function addressNode(text, registrable, max) {
  const value = String(text ?? '');
  return value.length <= max ? urlWithHost(value, registrable) : urlNode(middle(value, max));
}

const jstParts = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
});
/** 2026年10月22日（木）19:40（日本時間）。括弧は全角にそろえる */
function formatJst(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const part = Object.fromEntries(jstParts.formatToParts(date).map((one) => [one.type, one.value]));
  return `${part.year}年${part.month}月${part.day}日（${part.weekday}）${part.hour}:${part.minute}（日本時間）`;
}

/* ---------------------------------------------------------------- 文節で折り返す（auto-phrase の代わり）
   Chromium 系は CSS の word-break: auto-phrase で文節ごとに折る。対応しないブラウザ（iPhone の Safari・Firefox）では、
   Intl.Segmenter で語に分け、平仮名だけの語と句読点を直前の語に付けて文節らしいかたまりを作り、かたまりの間に <wbr> を差す。
   文字（textContent）は変えない（<wbr> は文字を持たない）。URL・値・入力欄は対象外 */
const PHRASE_SKIP = 'textarea, input, script, style, code, pre, svg, .mono, .url, .host, .nb, [data-nowbr]';
const OPENERS = new Set(['「', '『', '（', '(', '【', '〔', '〈', '《', '［', '[', '“', '‘']);
const TRAILERS = new Set(['、', '。', '，', '．', '・', '：', '；', '！', '？', '」', '』', '）', ')', '】', '〕', '〉', '》', '］', ']', '”', '’', 'ー', '…', '‥', '〜', ',', '.', '!', '?', ':', ';', '％', '%']);
const inRange = (code, from, to) => code >= from && code <= to;
function isHiraganaWord(text) {
  if (!text) return false;
  for (const char of text) {
    const code = char.codePointAt(0);
    if (!(inRange(code, 0x3041, 0x309f) || code === 0x30fc)) return false;
  }
  return true;
}
const isTrailing = (text) => [...text].every((char) => TRAILERS.has(char));
function hasJapanese(text) {
  for (const char of text) {
    const code = char.codePointAt(0);
    if (inRange(code, 0x3040, 0x30ff) || inRange(code, 0x3400, 0x9fff) || inRange(code, 0x3000, 0x303f) || inRange(code, 0xff01, 0xff5e)) return true;
  }
  return false;
}
export function phraseChunks(text, segmenter) {
  const chunks = [];
  let opener = '';
  for (const { segment } of segmenter.segment(text)) {
    if ([...segment].every((char) => OPENERS.has(char))) {
      opener += segment;
      continue;
    }
    const attach = chunks.length > 0 && !opener && (isHiraganaWord(segment) || isTrailing(segment) || /^\s+$/.test(segment));
    if (attach) chunks[chunks.length - 1] += segment;
    else {
      chunks.push(opener + segment);
      opener = '';
    }
  }
  if (opener) {
    if (chunks.length) chunks[chunks.length - 1] += opener;
    else chunks.push(opener);
  }
  return chunks;
}
function setupPhraseFallback() {
  try {
    if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('word-break', 'auto-phrase')) return;
    if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return;
  } catch {
    return;
  }
  const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
  const done = new WeakSet();
  document.documentElement.classList.add('phrase-fallback');
  const processText = (node) => {
    if (done.has(node)) return;
    done.add(node);
    const parent = node.parentElement;
    const text = node.data;
    if (!parent || text.length < 4 || !hasJapanese(text) || parent.closest(PHRASE_SKIP)) return;
    const chunks = phraseChunks(text, segmenter);
    if (chunks.length < 2) return;
    const fragment = document.createDocumentFragment();
    chunks.forEach((chunk, index) => {
      if (index) fragment.append(document.createElement('wbr'));
      const piece = document.createTextNode(chunk);
      done.add(piece);
      fragment.append(piece);
    });
    node.replaceWith(fragment);
  };
  const walk = (root) => {
    if (root.nodeType === Node.TEXT_NODE) return processText(root);
    if (root.nodeType !== Node.ELEMENT_NODE || root.closest(PHRASE_SKIP)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(processText);
  };
  walk(document.body);
  const options = { childList: true, subtree: true, characterData: true };
  const observer = new MutationObserver((records) => {
    observer.disconnect();
    for (const record of records) {
      if (record.type === 'characterData') {
        done.delete(record.target);
        processText(record.target);
      }
      for (const added of record.addedNodes) walk(added);
    }
    observer.observe(document.body, options);
  });
  observer.observe(document.body, options);
}

/* ---------------------------------------------------------------- 要素 */

const $ = (id) => document.getElementById(id);
const app = $('app');
const form = $('check-form');
const input = $('url-input');
const includeQuery = $('include-query');
const pasteButton = $('paste-button');
const checkButton = $('check-button');
const inputError = $('input-error');
const inputPreview = $('input-preview');
const intake = $('intake');
const oneTime = $('one-time-notice');
const checking = $('checking');
const resultSection = $('result');
const live = $('live');
const progress = $('progress');
const verdict = $('verdict');
const tabs = [...document.querySelectorAll('#axis-tabs [role="tab"]')];

const state = {
  phase: 'idle', run: 0, controller: null, sampleId: null, sample: null,
  parsed: null, lexical: null, trace: null, around: null, result: null, failure: null, aroundFailure: null, notFetched: null,
  retryTimer: null, slowTold: false
};

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isLocalFailure = () => state.phase === 'failed' && LOCAL.has(state.failure?.kind);

/* ---------------------------------------------------------------- 状態の切り替え */

function setPhase(phase) {
  state.phase = phase;
  app.dataset.phase = phase;
  intake.hidden = phase === 'result' || phase === 'failed';
  checking.hidden = phase !== 'checking';
  resultSection.hidden = !(phase === 'result' || phase === 'failed');
  for (const node of document.querySelectorAll('.how-back')) node.hidden = !(phase === 'result' || phase === 'failed');
  input.readOnly = phase === 'checking';
  checkButton.disabled = phase === 'checking';
  if (phase !== 'result' && phase !== 'failed') {
    verdict.classList.remove('is-fresh');
    clearRetryTimer();
  }
}

let liveTimer = null;
function announce(text) {
  clearTimeout(liveTimer);
  live.textContent = '';
  liveTimer = setTimeout(() => { live.textContent = vis(text); }, 60);
}

function setStep(step, stepState, detail = '') {
  const item = progress.querySelector(`li[data-step="${step}"]`);
  if (!item) return;
  item.dataset.state = stepState;
  item.querySelector('.progress__state').textContent = STATE_WORD[stepState] ?? '';
  item.querySelector('.progress__detail').textContent = vis(detail);
}
function resetSteps() {
  for (const item of progress.querySelectorAll('li[data-step]')) setStep(item.dataset.step, 'waiting');
}

function showInputError(message) {
  inputError.textContent = vis(message);
  inputError.hidden = false;
  input.setAttribute('aria-invalid', 'true');
}
function clearInputError() {
  inputError.hidden = true;
  inputError.textContent = '';
  input.removeAttribute('aria-invalid');
}

/* ---------------------------------------------------------------- 「戻る」で入力に戻す（URLは変えない） */

function pushResultState() {
  try {
    if (history.state && history.state.dokumi === 'result') history.replaceState({ dokumi: 'result' }, '');
    else history.pushState({ dokumi: 'result' }, '');
  } catch {
    /* 履歴を使えない環境では、戻るボタンへの対応だけをあきらめる */
  }
}
function leaveResult(message, { clear = false } = {}) {
  if (history.state && history.state.dokumi === 'result') {
    state.pendingMessage = message;
    state.pendingClear = clear;
    history.back(); // popstate で入力に戻す（履歴を積んだぶんだけ戻す）
  } else backToInput(message, { clear });
}

/* ---------------------------------------------------------------- 入力 */

function currentSample() {
  if (!state.sampleId) return null;
  const sample = SAMPLES.find((one) => one.id === state.sampleId);
  return sample && input.value.trim() === sample.url ? sample : null;
}

let previewTimer = null;
function updatePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const raw = input.value.slice(0, MAX_INPUT);
    const parsed = raw.trim() ? parseInput(raw, { includeQuery: includeQuery.checked }) : null;
    // メッセージごと貼られたときだけ、どれを調べるかを先に見せる
    if (!parsed?.ok || (parsed.otherLinks === 0 && parsed.original === raw.trim().normalize('NFKC'))) {
      inputPreview.hidden = true;
      inputPreview.textContent = '';
      return;
    }
    fill(inputPreview,
      el('span', {}, '調べるリンク：'), urlWithHost(parsed.original, parsed.registrable),
      parsed.otherLinks > 0 ? el('span', {}, `（ほかにリンクが${parsed.otherLinks}件あります。調べるのは最初の1件です）`) : null);
    inputPreview.hidden = false;
  }, 120);
}

/** 一度きりらしい手がかりのうち、実際に送る部分にあるものだけ。「?」から後ろを送らないなら、その中の語は使い切らない */
function oneTimeHintsToSend(parsed) {
  if (includeQuery.checked) return parsed.hints?.oneTime ?? [];
  const sent = parseInput(parsed.fetch?.href ?? '');
  return sent.ok ? (sent.hints?.oneTime ?? []) : [];
}

function start({ confirmedOneTime = false } = {}) {
  if (state.phase === 'checking') return;
  clearInputError();
  hideOneTime();
  const raw = input.value.slice(0, MAX_INPUT);
  const sample = currentSample();
  const parsed = parseInput(raw, { includeQuery: includeQuery.checked });
  if (!parsed.ok) {
    const message = parsed.reason === 'too_long' ? 'このリンクは長すぎて調べられません。開かずに、公式のアプリや窓口から確かめてください。' : parsed.message;
    showInputError(message);
    announce(message);
    input.focus();
    return;
  }
  if (sample) return runSample(sample, parsed);
  if (parsed.fetch.allowed && !confirmedOneTime) {
    const hints = oneTimeHintsToSend(parsed);
    if (hints.length) return showOneTime(parsed, hints);
  }
  return runCheck(parsed);
}

function showOneTime(parsed, hints) {
  state.parsed = parsed;
  $('one-time-clues').textContent = vis(hints.join('、'));
  fill($('one-time-href'), urlWithHost(parsed.fetch.href, parsed.registrable, 'url'));
  oneTime.hidden = false;
  $('one-time-title').focus();
  announce('このリンクは、一度きりのリンクかもしれません。調べるかどうかを選んでください。');
}
function hideOneTime() {
  oneTime.hidden = true;
}

/* ---------------------------------------------------------------- 通信（同じサイトのAPIだけ） */

function parseRetryAfter(value) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return Math.min(600, Math.ceil(number));
  const date = Date.parse(value ?? '');
  return Number.isNaN(date) ? 60 : Math.max(1, Math.min(600, Math.ceil((date - Date.now()) / 1000)));
}

async function callApi(path, signal, timeoutMs) {
  const local = new AbortController();
  const timer = setTimeout(() => local.abort(), timeoutMs);
  const relay = () => local.abort();
  signal.addEventListener('abort', relay, { once: true });
  const failed = () => ({ ok: false, kind: signal.aborted ? 'aborted' : local.signal.aborted ? 'client_timeout' : 'network' });
  try {
    let response;
    try {
      response = await fetch(path, { signal: local.signal, headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    } catch {
      return failed();
    }
    if (response.status === 429) return { ok: false, kind: 'rate', retryAfter: parseRetryAfter(response.headers.get('Retry-After')) };
    if (response.status === 503) return { ok: false, kind: 'disabled' };
    if (response.status === 403) return { ok: false, kind: 'forbidden' };
    if (response.status === 400) return { ok: false, kind: 'invalid' };
    if (!response.ok) return { ok: false, kind: 'server', status: response.status };
    let text;
    try {
      text = await response.text();
    } catch {
      return failed();
    }
    if (text.length > LIMITS.MAX_RESPONSE_BYTES * 2) return { ok: false, kind: 'broken' };
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch {
      return { ok: false, kind: 'broken' };
    }
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', relay);
  }
}

/** どこかの段で例外が出ても、残りの材料で判定を出す */
function safeEvaluate(input) {
  const now = Date.now();
  const attempts = [input, { ...input, around: null }, { ...input, trace: null, around: null }];
  for (const attempt of attempts) {
    try {
      return rules.evaluate({ trace: null, around: null, ...attempt, now });
    } catch {
      /* 次の組み合わせで試す */
    }
  }
  return null;
}

/** 診断先に取得を断られたか（403・429・ボット対策）。断られたあとは、相手のサイトへの追加のアクセスを省く（around の site=0） */
function refusedBySite(trace) {
  if (!trace) return false;
  if (!trace.ok) return trace.error?.code === 'blocked_by_challenge';
  const final = trace.final;
  return [403, 429].includes(final?.status) || Boolean(final?.headers?.['cf-mitigated']);
}

/* ---------------------------------------------------------------- 流れ */

function beginRun(parsed, sample = null) {
  state.run += 1;
  state.controller?.abort();
  state.controller = new AbortController();
  stopSlow();
  $('slow-note').hidden = true;
  Object.assign(state, { parsed, sample, lexical: null, trace: null, around: null, result: null, failure: null, aroundFailure: null, notFetched: null, slowTold: false });
  return { run: state.run, signal: state.controller.signal };
}

function runSample(sample, parsed) {
  beginRun(parsed, sample);
  // 見本は通信しない。観測データ（samples.js）をそのまま判定に渡す
  state.lexical = analyzeLexical(parsed);
  state.trace = sample.trace;
  state.around = sample.around;
  const result = safeEvaluate({ parsed, lexical: state.lexical, trace: sample.trace, around: sample.around });
  finish(result, 'result');
}

/* 待ちが長いとき：画面が止まっていないこと、見た目の結果は先に出ていること、結果は最後に出ることを知らせる */
let slowTimer = null;
function watchSlow(step, run) {
  stopSlow();
  const startedAt = performance.now();
  slowTimer = setInterval(() => {
    if (run !== state.run || state.phase !== 'checking') return stopSlow();
    const elapsed = performance.now() - startedAt;
    if (elapsed < SLOW_HINT_AFTER_MS) return;
    const passed = `（${Math.floor(elapsed / 1000)}秒経過）`;
    setStep(step, 'running', step === 'connect'
      ? `もう少しかかっています。相手のサイトの応答が遅いようです${passed}`
      : `もう少しかかっています。周りの情報の問い合わせを待っています${passed}`);
    if (!state.slowTold) {
      state.slowTold = true;
      $('slow-note').hidden = false;
      announce(step === 'connect' ? 'もう少しかかっています。相手のサイトの応答が遅いようです。' : 'もう少しかかっています。');
    }
  }, 500);
}
function stopSlow() {
  clearInterval(slowTimer);
  slowTimer = null;
}

async function runCheck(parsed) {
  const { run, signal } = beginRun(parsed);
  const lexical = analyzeLexical(parsed);
  state.lexical = lexical;

  if (!parsed.fetch.allowed) {
    // 通信しない形（@・数字のアドレス・予約名など）。見た目の結果だけを出し、理由を書く
    state.notFetched = parsed.fetch.reason ?? 'reserved_name';
    finish(safeEvaluate({ parsed, lexical }), 'result');
    return;
  }

  setPhase('checking');
  resetSteps();
  renderCheckingHead(parsed);
  $('early-path').hidden = true;
  // 読み込み中は、焦点を「調べています」の見出しへ移す（ボタンで押したとき、焦点が行き場を失わないように）
  const title = $('checking-title');
  title.focus({ preventScroll: true });
  title.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
  const early = safeEvaluate({ parsed, lexical });
  renderEarly(early);
  const earlyBad = early ? early.findings.filter((f) => f.axis === 'visitor' && f.status === 'bad').length : 0;
  setStep('read', 'done', earlyBad ? `見た目で気になる点：${earlyBad}件` : '見た目で目立つ点はありません');
  announce(`調べています。${earlyBad ? `アドレスの見た目で、気になる点が${earlyBad}件見つかりました。` : 'アドレスの見た目では、目立つ点は見つかりませんでした。'}`);

  setStep('connect', 'running', `${parsed.hostname} へ`);
  watchSlow('connect', run);
  const traceReply = await callApi(`/api/day-074/trace?url=${encodeURIComponent(parsed.fetch.href)}`, signal, CLIENT_TRACE_TIMEOUT_MS);
  stopSlow();
  if (run !== state.run || traceReply.kind === 'aborted') return;

  let trace = null;
  let failure = null;
  if (traceReply.ok) {
    if (!validateTrace(traceReply.data, { strict: false }).ok) failure = { kind: 'broken' };
    else {
      trace = traceReply.data;
      if (!trace.ok) failure = { kind: FAILURES[trace.error?.code] ? trace.error.code : 'upstream_error' };
    }
  } else failure = traceReply;
  state.trace = trace;

  if (trace?.ok && trace.final) {
    const hops = trace.hops.length;
    setStep('connect', 'done', hops ? `転送${hops}回 → ${trace.final.host}` : `転送なし（${trace.final.host}）`);
    setStep('page', 'done', trace.final.kind === 'html'
      ? (trace.html ? 'ページ（HTML）を読みました' : 'ページ（HTML）でしたが、中身を読み取れませんでした')
      : trace.final.kind === 'download' ? 'ファイルの配布でした（中身は開いていません）' : 'ページではない応答でした');
    renderEarlyPath(trace);
  } else {
    setStep('connect', 'failed', FAILURES[failure?.kind]?.short ?? 'つながらず');
    setStep('page', 'skipped', 'つながらなかったため');
    if (trace?.hops?.length) renderEarlyPath(trace);
  }

  // 周りの情報：つながったときは行き先のホストで。断られたときは、相手のサイトへの追加のアクセスを省く（site=0）
  const refused = refusedBySite(trace);
  const aroundHost = trace?.ok && trace.final ? trace.final.host : refused ? (trace?.error?.host || parsed.hostname) : null;
  const aroundScheme = trace?.ok && trace.final ? trace.final.scheme : parsed.scheme;
  let around = null;
  if (aroundHost) {
    setStep('around', 'running', refused ? `${aroundHost}（名前と登録日だけ）` : aroundHost);
    watchSlow('around', run);
    const aroundReply = await callApi(`/api/day-074/around?host=${encodeURIComponent(aroundHost)}&scheme=${encodeURIComponent(aroundScheme)}${refused ? '&site=0' : ''}`, signal, CLIENT_AROUND_TIMEOUT_MS);
    stopSlow();
    if (run !== state.run || aroundReply.kind === 'aborted') return;
    if (aroundReply.ok && validateAround(aroundReply.data, { strict: false }).ok) {
      around = aroundReply.data;
      const missing = ['dns', 'rdap', 'securityTxt'].filter((key) => around[key] && 'unavailable' in around[key]).length + (around.httpProbe?.tested ? 0 : 1);
      setStep('around', 'done', refused ? '断られたので、名前と登録日だけを確かめました' : missing ? `一部は取れませんでした（${missing}項目）` : 'DNS・登録日・HTTPからの転送・連絡先を確かめました');
    } else {
      state.aroundFailure = aroundReply.ok ? { kind: 'broken' } : aroundReply;
      setStep('around', 'failed', aroundReply.ok ? '結果を読み取れませんでした' : (FAILURES[aroundReply.kind]?.short ?? '取れませんでした'));
    }
  } else setStep('around', 'skipped', 'つながらなかったため');
  state.around = around;

  setStep('summary', 'running');
  const result = safeEvaluate({ parsed, lexical, trace, around, failure: failure && LOCAL.has(failure.kind) ? LIB_FAILURE[failure.kind] : null });
  setStep('summary', 'done', '結果をまとめました');
  state.failure = failure;
  finish(result, failure ? 'failed' : 'result');
}

function finish(result, phase) {
  state.result = result;
  if (!result) {
    // 判定そのものが出せない（判定の部品が壊れている）。入力に戻して知らせる
    setPhase('idle');
    showInputError('結果をまとめられませんでした。ページを読み込み直してから、もう一度試してください。');
    announce('結果をまとめられませんでした。');
    return;
  }
  setPhase(phase);
  renderResult(result);
  pushResultState();
  const headline = $('verdict-headline');
  headline.focus({ preventScroll: true });
  resultSection.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
  let lead = '結果が出ました。';
  if (phase === 'failed') {
    const failure = FAILURES[state.failure?.kind];
    lead = LOCAL.has(state.failure?.kind) ? (failure?.lead ?? LOCAL_LEAD) : `つながりませんでした（${failure?.short ?? '理由不明'}）。`;
  } else if (state.sample) lead = '見本の結果です。';
  const partial = phase === 'result' && state.aroundFailure ? '守りの点数は暫定です。' : '';
  announce(`${lead}${result.visitor.headline}。${partial}`);
}

/* ---------------------------------------------------------------- 調べている途中の描画 */

function renderCheckingHead(parsed) {
  fill($('checking-href'), urlWithHost(parsed.fetch.href, parsed.registrable, 'url'));
  const notes = [];
  if (parsed.hasQuery && !includeQuery.checked) notes.push('「?」から後ろは送っていません');
  if (parsed.hasHash) notes.push('「#」から後ろは送っていません');
  if (parsed.otherLinks > 0) notes.push(`ほかにリンクが${parsed.otherLinks}件ありました。調べているのは最初の1件です`);
  if (parsed.assumedScheme) notes.push('https:// を補いました');
  fill($('checking-notes'), ...notes.map((note) => el('li', {}, el('span', { class: 'icon' }, shapeIcon('send')), el('span', {}, note))));
}

function findingIcon(finding) {
  if (finding.status === 'good') return levelIcon('ok');
  if (finding.status === 'unknown') return levelIcon('unknown');
  if (finding.status === 'info') return el('span', { class: 'lv-icon lv-neutral' }, shapeIcon('memo'));
  if (finding.axis === 'owner') {
    const rank = toneOf(finding);
    return el('span', { class: `lv-icon ${rank === 'rank-1' || rank === 'rank-2' ? 'lv-ink' : 'lv-ink2'}` }, shapeIcon('plus'));
  }
  const tone = toneOf(finding);
  return el('span', { class: `lv-icon lv-${tone}` }, shapeIcon(LEVEL_META[tone]?.shape ?? 'info'));
}

function renderEarly(result) {
  const list = $('early-list');
  const items = result ? result.findings.filter((f) => f.axis === 'visitor' && f.status !== 'unknown') : [];
  if (!items.length) {
    fill(list, el('li', {}, el('span', { class: 'lv-icon lv-neutral' }, shapeIcon('memo')), el('span', {}, 'アドレスの見た目では、目立つ点は見つかりませんでした。続けて、たどり着く先を調べています。')));
    return;
  }
  fill(list, ...items.map((f) => el('li', { dataset: { id: f.id, status: f.status } }, findingIcon(f), el('span', {}, f.title))));
}

function renderEarlyPath(trace) {
  const rows = [...trace.hops.map((hop) => `${hop.host}（${hop.status} 転送）`)];
  if (trace.final) rows.push(`${trace.final.host}（${trace.final.status}）`);
  fill($('early-path-list'), ...rows.map((row) => el('li', { class: 'mono' }, row)));
  $('early-path').hidden = rows.length === 0;
}

/* ---------------------------------------------------------------- 結果の描画 */

/** 所見の線と記号の色。訪問者向けは段階の色、運営者向けは段階の色を使わず墨と銀の濃淡（rank-1〜4） */
function toneOf(finding) {
  if (finding.status === 'good') return 'ok';
  if (finding.status !== 'bad') return 'unknown';
  if (finding.axis === 'owner') return { critical: 'rank-1', high: 'rank-2', medium: 'rank-3', low: 'rank-4', info: 'rank-4' }[finding.severity] ?? 'rank-4';
  return { critical: 'danger', high: 'danger', medium: 'warn', low: 'note', info: 'unknown' }[finding.severity] ?? 'unknown';
}

function renderResult(result) {
  renderVerdict(result);
  renderQuickActions(result);
  renderActions(result);
  renderConsult(result);
  renderTarget(result);
  renderPath(result);
  renderTabs(result);
  renderFindings($('visitor-findings'), result.findings.filter((f) => f.axis === 'visitor'), 'visitor');
  renderOwner(result);
  renderObserved();
  renderLimits(result);
  $('sample-banner').hidden = !state.sample;
  renderExternal(result);
  selectTab('visitor', false);
  requestAnimationFrame(updateSticky);
}

/** 広い画面で、右列（タブと一覧）が画面に収まるときだけ固定する。長くなったら（一覧を開いたら）固定をやめる */
const resultMain = document.querySelector('.result__main');
function updateSticky() {
  const fits = window.innerWidth >= 1040 && resultMain.offsetHeight + 32 < window.innerHeight;
  resultMain.classList.toggle('is-sticky', fits);
}

function sentHref() {
  if (state.sample) return state.sample.url;
  const parsed = state.parsed;
  return parsed?.fetch?.href ?? parsed?.href ?? '';
}

/** 帯の中の「調べた相手」：ホスト名（持ち主の名前に色）と、その色の意味を、すぐ下に書く */
function renderHost(result) {
  const target = result.target;
  const host = target.hostUnicode || target.host;
  const differs = target.registrable && target.registrable !== target.host;
  fill($('verdict-host'),
    el('p', { class: 'verdict__host-label' }, '調べた相手'),
    el('p', { class: 'verdict__host-name' }, hostParts(host, target.registrable)),
    differs ? el('p', { class: 'verdict__host-hint' }, '色を付けた太字の部分が、このアドレスの持ち主の名前です。手前の部分は、持ち主が自由に付けられます。') : null);
}

function renderTarget(result) {
  const target = result.target;
  const parsed = state.parsed;
  const notes = [];
  if (state.sample) notes.push('見本');
  if (state.notFetched) notes.push('つなぎに行っていません');
  else if (!state.sample) {
    if (parsed?.hasQuery && !includeQuery.checked) notes.push('「?」から後ろは送っていません');
    if (parsed?.hasHash) notes.push('「#」から後ろは送っていません');
  }
  if (parsed?.otherLinks > 0) notes.push(`ほかにリンクが${parsed.otherLinks}件（調べたのは最初の1件）`);
  if (parsed?.assumedScheme) notes.push('https:// を補いました');
  // 送ったアドレスが経路の最初の行と同じなら、二度は書かない
  const sent = sentHref();
  const sameAsFirstHop = target.chain?.[0]?.url === sent;
  fill($('target-chip'),
    notes.length ? el('ul', { class: 'target__notes', 'aria-label': '調べ方のメモ' }, notes.map((note) => el('li', { class: note === '見本' ? 'note--sample' : null }, note))) : null,
    sameAsFirstHop ? null : el('p', { class: 'target__url' }, el('span', { class: 'target__label' }, state.notFetched ? '入力したアドレス' : state.sample ? '見本のアドレス' : '送ったアドレス'), addressNode(sent, state.parsed?.registrable ?? target.registrable, 96)),
    target.hostUnicode && target.hostUnicode !== target.host
      ? el('p', { class: 'target__idn' }, '読める形：', el('span', { class: 'mono' }, target.hostUnicode), '／実際の表記：', el('span', { class: 'mono' }, target.host))
      : null);
}

function renderVerdict(result) {
  const v = result.visitor;
  const level = LEVEL_META[v.level] ? v.level : 'unknown';
  verdict.dataset.level = level;
  $('verdict-detail').dataset.level = level;
  fill($('verdict-icon'), shapeIcon(LEVEL_META[level].shape));
  $('verdict-word').textContent = `段階：${LEVEL_META[level].word}`;
  // 見本の結果は、帯の中にも小さな「見本」の札（どのタブを開いていても、見本だと分かるように）
  $('verdict-sample').hidden = !state.sample;
  fill($('verdict-headline'), v.headline);
  // 見出しのすぐ下に1回だけ：兆候が見当たらないときは「見つからなかったことは…」、調べきれなかったときは「安全かどうかは分かりません」。
  // 兆候が見つかっている段階（気になる・注意・近づかない）には出さない
  const caveat = $('verdict-caveat');
  caveat.textContent = level === 'unknown' ? '調べきれていないので、安全かどうかは分かりません。' : '見つからなかったことは、安全の保証ではありません。';
  caveat.hidden = !['ok', 'unknown'].includes(level);
  const summary = String(v.summary ?? '').replace(CAVEAT_PATTERN, '').trim();
  fill($('verdict-summary'), summary);
  $('verdict-summary').hidden = summary === '';

  /* つながらなかった・つなぎに行かなかった・一部だけ取れなかったときの説明は、この箱にまとめて書く */
  const box = $('verdict-fetch');
  const title = $('verdict-fetch-title');
  const body = $('verdict-fetch-body');
  const next = $('verdict-fetch-next');
  const unreached = (state.phase === 'failed' && Boolean(state.failure)) || Boolean(state.notFetched);
  box.dataset.kind = '';
  let texts = { title: '', body: '', next: '' };
  let retry = { show: false, wait: 0 };
  if (state.phase === 'failed' && state.failure) {
    const kind = FAILURES[state.failure.kind] ? state.failure.kind : 'server';
    const failure = FAILURES[kind];
    box.dataset.kind = kind;
    // こちら側の都合なら、原因がこのアプリ（または通信）にあることを先に書く。次の行動は「いま取る行動」に1件だけ出すので、ここでは繰り返さない
    texts = LOCAL.has(kind)
      ? { title: failure.lead, body: failure.what, next: '' }
      : { title: `つながりませんでした（${failure.short}）：${failure.what}`, body: '', next: `${failure.next}アドレスの見た目から分かったことは、このまま下に残しています。` };
    retry = { show: true, wait: kind === 'rate' ? (state.failure.retryAfter ?? 60) : 0 };
  } else if (state.notFetched) {
    box.dataset.kind = `not-fetched-${state.notFetched}`;
    texts = {
      title: NOT_FETCHED[state.notFetched] ?? NOT_FETCHED.reserved_name,
      body: '',
      next: '入力の前には、公式のアプリや窓口から開き直してください。'
    };
  } else if (state.aroundFailure) {
    // 一部だけ取れなかった：守りの点数は暫定。もう一度試せるようにする
    const kind = state.aroundFailure.kind;
    box.dataset.kind = 'partial';
    texts = {
      title: '周辺の情報を取得できなかったので、守りの点数は暫定です。',
      body: kind === 'rate'
        ? `このアプリの回数の上限（1分あたり約${LIMITS.RATE_PER_MINUTE}回）に達したため、名前の記録・登録日・http:// 側の転送・連絡先の公開を確かめられませんでした。`
        : '名前の記録・登録日・http:// 側の転送・連絡先の公開を確かめられませんでした。',
      next: 'もう一度調べると、守りの点数が変わることがあります。訪問者向けの判定は、取れた情報から出しています。'
    };
    retry = { show: true, wait: kind === 'rate' ? (state.aroundFailure.retryAfter ?? 60) : 0 };
  }
  for (const [node, text] of [[title, texts.title], [body, texts.body], [next, texts.next]]) {
    fill(node, text || null);
    node.hidden = !text;
  }
  box.hidden = !texts.title;
  setupRetry(retry);

  // 段階が「不明」でつながらなかったときの「主な理由」は、つながらなかったことの言い換えになるので出さない
  const reasons = level === 'unknown' && unreached ? [] : (v.reasons ?? []);
  fill($('verdict-reasons'), ...reasons.map((reason) => el('li', {}, reason)));
  $('verdict-reasons-wrap').hidden = reasons.length === 0;

  // 段階の物差し：4つとも記号と言葉を出す（「不明」は4つのどこにも置けないので出さない）
  const meter = $('verdict-meter');
  meter.hidden = level === 'unknown';
  fill(meter, ...SCALE.map((step, index) => el('li', {
    class: 'meter__step', dataset: { level: step }, 'aria-current': step === level ? 'true' : null
  }, levelIcon(step), el('span', { class: 'meter__word' }, LEVEL_META[step].word),
  el('span', { class: 'visually-hidden' }, `（4段階の${index + 1}番目${step === level ? '・今回の段階' : ''}）`))));

  renderHost(result);

  const time = formatJst(result.evaluatedAt);
  const cached = state.trace?.cached === true ? `（同じリンクの${CACHE_MINUTES}分以内の結果を使っています）` : '';
  // 「（日本時間）の時点で」は1かたまり（「の時点で…」が行頭に来ないように）
  const day = time.replace(/（日本時間）$/, '');
  fill($('verdict-time'), time ? [day, el('span', { class: 'nb' }, '（日本時間）の時点で'), '見えたことです。'] : null,
    cached ? el('span', { class: 'verdict__cached' }, cached) : null);

  verdict.classList.remove('is-fresh');
  void verdict.offsetWidth; // 一度だけの「針が入って黒ずむ」動きを、結果ごとに最初から再生する
  verdict.classList.add('is-fresh');
}

/** 帯の下の操作。こちら側の都合で調べられなかったときは、事実と違う理由が入るのでコピーを出さない */
function renderQuickActions(result) {
  const hideCopies = isLocalFailure();
  for (const button of document.querySelectorAll('[data-action="copy-report"], [data-action="copy-summary"]')) button.hidden = hideCopies;
  const risky = ['warn', 'danger'].includes(result.visitor.level);
  $('copy-summary').classList.toggle('btn--primary', risky && !hideCopies);
}

function renderActions(result) {
  // こちら側の都合で調べられなかったときは、リンクを疑う行動ではなく「待ってから、もう一度試す」の1件だけ
  const actions = (result.visitor.actions ?? []).slice(0, 3);
  const consultShown = showsConsult(result);
  let linked = false;
  const list = $('verdict-actions');
  list.classList.toggle('actions__list--single', actions.length === 1);
  fill(list, ...actions.map((action) => {
    const toConsult = consultShown && /相談/.test(action);
    if (toConsult) linked = true;
    return el('li', {}, el('span', {}, action,
      toConsult ? el('a', { class: 'jump-link', dataset: { jump: 'consult-title' } }, '相談先を見る ', el('span', { 'aria-hidden': 'true' }, '↓')) : null));
  }));
  for (const link of list.querySelectorAll('a.jump-link')) link.setAttribute('href', '#consult-title');
  $('actions-consult').hidden = !consultShown || linked;
}

function statusWord(status) {
  if (status === null || status === undefined) {
    // 応答が無い理由を、起きたことのとおりに書く（こちら側の都合なら、相手のサイトが落ちているように読ませない）
    if (state.notFetched) return 'つなぎに行っていません';
    if (isLocalFailure()) return `調べていません（${FAILURES[state.failure.kind]?.short ?? 'このアプリの都合'}）`;
    return 'つながりませんでした';
  }
  if (status >= 300 && status < 400) return `転送されました（応答${status}）`;
  if (status >= 200 && status < 300) return `ページが表示されました（応答${status}）`;
  return `相手側のエラーでした（応答${status}）`;
}
function roleWord(hop, index, total) {
  if (hop.role === 'final') return total === 1 ? '最後のページ（転送なし）' : '最後のページ';
  if (hop.role === 'redirect') return `転送 ${index}`;
  return '入力したアドレス';
}

function renderPath(result) {
  const chain = result.target.chain ?? [];
  const path = $('path');
  fill(path, ...chain.map((hop, index) => {
    const changed = index > 0 && chain[index - 1].registrable !== hop.registrable;
    const badges = [];
    if (changed) badges.push(el('span', { class: 'badge badge--change' }, 'ここでドメインが変わります'));
    if (hop.scheme === 'http') badges.push(el('span', { class: 'badge badge--plain' }, '暗号化なし（http）'));
    const url = String(hop.url ?? '');
    return el('li', { class: 'hop', dataset: { hop: index, role: hop.role, scheme: hop.scheme } },
      el('div', { class: 'hop__head' }, el('span', { class: 'hop__role' }, roleWord(hop, index, chain.length)), el('span', { class: 'hop__status' }, statusWord(hop.status))),
      el('p', { class: 'hop__host' }, hostParts(toUnicodeHost(hop.host), hop.registrable)),
      badges.length ? el('div', { class: 'hop__badges' }, badges) : null,
      el('p', { class: 'hop__url' }, addressNode(url, hop.registrable, 64)),
      url.length > 64 ? el('details', { class: 'hop__more' }, el('summary', {}, 'アドレス全体を見る'), el('p', {}, urlWithHost(url, hop.registrable))) : null);
  }));
  path.classList.toggle('path--row', chain.length > 1 && chain.length <= 3);

  const note = $('path-note');
  const trace = state.trace;
  const lastHop = trace?.hops?.at?.(-1);
  if (trace && !trace.ok && lastHop?.location && ['blocked_redirect', 'too_many_redirects'].includes(trace.error?.code)) {
    fill(note,
      el('span', {}, trace.error.code === 'blocked_redirect' ? 'この先の転送先は、公開されていない宛先なので、たどりませんでした：' : 'この先も転送が続いていたので、たどるのをやめました：'),
      urlNode(lastHop.location));
    note.hidden = false;
  } else if (state.notFetched) {
    fill(note, 'つなぎに行っていないので、入力したアドレスだけを示しています。');
    note.hidden = false;
  } else if (state.phase === 'failed') {
    fill(note, isLocalFailure() ? 'このアプリ（または通信）の都合で調べられなかったので、入力したアドレスだけを示しています。' : 'つながらなかったので、たどれたところまでを示しています。');
    note.hidden = false;
  } else note.hidden = true;
}

function unreachedResult() {
  return (state.phase === 'failed' && Boolean(state.failure)) || Boolean(state.notFetched);
}

function renderTabs(result) {
  const bad = result.findings.filter((f) => f.axis === 'visitor' && f.status === 'bad').length;
  $('tab-visitor-badge').textContent = unreachedResult() ? (bad ? `見た目だけ確認・兆候 ${bad}件` : '見た目だけ確認') : bad ? `兆候 ${bad}件` : LEVEL_META.ok.word;
  $('tab-owner-badge').textContent = result.owner.grade ? `守りの評価 ${result.owner.grade}（${result.owner.score}点${result.owner.provisional ? '・暫定' : ''}）` : '採点なし';
}

function selectTab(axis, moveFocus) {
  for (const tab of tabs) {
    const selected = tab.dataset.axis === axis;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute('aria-controls')).hidden = !selected;
    if (selected && moveFocus) tab.focus();
  }
}

const GROUPS = {
  visitor: [['bad', '見つかった兆候'], ['good', '良かった点'], ['info', '参考'], ['unknown', '確かめられなかった点']],
  owner: [['bad', '付けると良いもの'], ['good', 'できている点'], ['info', '参考'], ['unknown', '確かめられなかった点']]
};
const SHOW_FIRST = 4;

function renderFindings(container, findings, axis) {
  const groups = GROUPS[axis].map(([status, title]) => {
    const items = findings.filter((f) => f.status === status);
    if (!items.length) return null;
    const list = el('div', { class: 'group__list' }, items.slice(0, items.length > SHOW_FIRST + 1 ? SHOW_FIRST : items.length).map(findingCard));
    let more = null;
    if (items.length > SHOW_FIRST + 1) {
      // 多いときは上位だけを見せ、残りは押して開く（下の欄が遠くならないように）
      const rest = el('div', { class: 'group__list group__rest', id: `rest-${axis}-${status}`, hidden: true }, items.slice(SHOW_FIRST).map(findingCard));
      const button = el('button', { type: 'button', class: 'btn group__more', 'aria-expanded': 'false', 'aria-controls': rest.id }, `残り${items.length - SHOW_FIRST}件を表示`);
      button.addEventListener('click', () => {
        const open = rest.hidden;
        rest.hidden = !open;
        button.setAttribute('aria-expanded', String(open));
        button.textContent = open ? '少なく表示する' : `残り${items.length - SHOW_FIRST}件を表示`;
      });
      more = [rest, button];
    }
    // 訪問者向けの「兆候 +9」の数字の意味を、一覧の頭で1行だけ言う（件数の「9件」と読み違えないように）
    const note = axis === 'visitor' && status === 'bad' ? el('p', { class: 'group__note' }, '数字は兆候の強さです。合計で段階を決めます。') : null;
    return el('section', { class: 'group', dataset: { status } },
      el('h3', { class: 'group__title' }, title, el('span', { class: 'group__count' }, `${items.length}件`)),
      note, list, more);
  }).filter(Boolean);
  if (!findings.some((f) => f.status === 'bad')) {
    const empty = axis === 'visitor'
      ? (unreachedResult() ? 'アドレスの見た目では、気になる点は見つかりませんでした。' : '訪問者向けの項目では、気になる点は見つかりませんでした。')
      : '運営者向けの項目では、付けると良いものは見つかりませんでした。';
    groups.unshift(el('p', { class: 'group__empty' }, empty));
  }
  fill(container, ...groups);
}

function anchorId(id) {
  return `finding-${String(id).replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

function findingCard(finding) {
  const meta = finding.status === 'good' ? ''
    : finding.status === 'unknown' ? '確かめられず'
      : finding.status === 'info' ? '参考'
        : finding.axis === 'owner' ? `優先度 ${PRIORITY_WORD[finding.severity] ?? finding.severity}`
          : `重大度 ${SEVERITY_WORD[finding.severity] ?? finding.severity}`;
  // 点の向き：訪問者向けは兆候の重み（足す）、運営者向けは減点（引く）。同じ項目を「+」と「−」の両方で書かない
  const points = finding.status === 'bad' && finding.points > 0
    ? (finding.axis === 'owner' ? `減点 ${finding.points}` : `兆候 +${finding.points}`) : null;
  const whyLabel = finding.status === 'bad' ? 'なぜ問題か' : finding.status === 'good' ? 'この結果の意味' : '読み方';
  const evidence = (finding.evidence ?? []).filter((one) => one !== null && one !== undefined && one !== '');

  const body = el('dl', { class: 'finding__body' },
    el('dt', {}, '見えたこと'),
    el('dd', {}, el('span', {}, finding.what),
      evidence.length ? [
        el('span', { class: 'evidence__caption' }, '実際に見えた値'),
        el('ul', { class: 'evidence', 'aria-label': '実際に見えた値' }, evidence.map(evidenceItem))
      ] : null),
    finding.why ? [el('dt', {}, whyLabel), el('dd', {}, finding.why)] : null,
    finding.fix ? [el('dt', {}, '直し方'), el('dd', {}, finding.fix)] : null,
    finding.snippet ? [el('dt', {}, '設定例'), el('dd', {}, snippetBlock(finding.snippet))] : null);

  return el('details', {
    class: 'finding', id: anchorId(finding.id),
    dataset: { id: finding.id, status: finding.status, severity: finding.severity, axis: finding.axis, tone: toneOf(finding) }
  },
  el('summary', { class: 'finding__summary' },
    findingIcon(finding),
    el('span', {},
      el('span', { class: 'finding__title' }, finding.title),
      el('span', { class: 'finding__meta' }, meta ? el('span', {}, meta) : null, points ? el('span', { class: 'finding__points' }, points) : null)),
    el('span', { class: 'finding__chevron', 'aria-hidden': 'true' })),
  body);
}

/** 見えた値に、何の値かの小見出しを付ける。判定側が {label, value} で渡せばそれを使う。
    文字だけのときは、形から確かに言えるもの（失敗の種類・応答の番号・アドレス・「名前：値」）だけに言葉を添え、元の値も残す */
function evidenceItem(value) {
  const item = (label, ...shown) => el('li', {}, label ? el('span', { class: 'evidence__label' }, label) : null, el('span', { class: 'evidence__value' }, shown));
  if (value && typeof value === 'object') return item(value.label ? String(value.label) : null, el('span', { class: 'mono' }, String(value.value ?? '')));
  const text = String(value);
  if (/^[a-z][a-z_]*$/.test(text) && Object.hasOwn(FAILURES, text)) return item('結果', `${FAILURES[text].short}（`, el('span', { class: 'mono' }, text), '）');
  if (/^[1-5][0-9]{2}$/.test(text)) return item('応答', statusWord(Number(text)));
  if (safeHref(text)) return item('アドレス', el('span', { class: 'mono' }, text));
  const cut = text.indexOf('：');
  if (cut > 0 && cut <= 12) return item(text.slice(0, cut), el('span', { class: 'mono' }, text.slice(cut + 1)));
  return item(null, el('span', { class: 'mono' }, text));
}

function snippetBlock(snippet) {
  const variants = [['headers', 'ヘッダー'], ['nginx', 'nginx'], ['apache', 'Apache']]
    .filter(([key]) => typeof snippet[key] === 'string' && snippet[key]);
  if (!variants.length) return null;
  let current = variants[0][0];
  const code = el('code', {}, snippet[current]);
  const buttons = variants.map(([key, label]) => el('button', {
    type: 'button', class: 'seg__btn', 'aria-pressed': key === current ? 'true' : 'false', dataset: { variant: key },
    onclick: () => {
      current = key;
      code.textContent = vis(snippet[key]);
      for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.variant === key));
    }
  }, label));
  const copy = el('button', { type: 'button', class: 'btn snippet__copy' }, '設定例をコピー');
  copy.addEventListener('click', () => copyWithFeedback(snippet[current], copy, '設定例をコピーしました'));
  return el('div', { class: 'snippet' },
    snippet.label ? el('p', { class: 'snippet__label' }, snippet.label) : null,
    el('div', { class: 'seg', role: 'group', 'aria-label': '設定の書き方を選ぶ' }, buttons),
    el('pre', {}, code),
    copy);
}

function bands(probe, from, to) {
  const list = [];
  for (let value = from; value <= to; value += 1) {
    const key = probe(value);
    const last = list.at(-1);
    if (last && last.key === key) last.to = value;
    else list.push({ key, from: value, to: value });
  }
  return list;
}

function renderOwner(result) {
  const owner = result.owner;
  // 先頭の1文（「点数が低くても、危険なサイトという意味ではありません。」）だけを太字にする
  const note = vis(owner.note ?? '');
  const cut = note.indexOf('。');
  fill($('owner-note'), el('strong', {}, cut > 0 ? note.slice(0, cut + 1) : note), cut > 0 && cut + 1 < note.length ? note.slice(cut + 1) : null);
  const block = $('owner-score-block');
  const unscored = owner.score === null || owner.score === undefined;
  block.classList.toggle('is-unscored', unscored);
  $('owner-score').textContent = unscored ? '—' : String(owner.score);
  // 周辺の情報が欠けて暫定の点数なら、大きな数字の横にも「暫定」（実際はこれより低いことがある）
  $('owner-provisional').hidden = unscored || !owner.provisional;
  $('owner-grade').textContent = owner.grade ?? '—';
  $('owner-bar').style.setProperty('--score', unscored ? 0 : Math.max(0, Math.min(100, owner.score)));
  // 評価の目安：A〜F を同じ幅のマスに並べ、区分の途中では折らない
  fill($('owner-scale'), el('span', { class: 'score__scale-label' }, '評価の目安'),
    ...bands((score) => gradeOf(score), 0, 100).reverse().map((band) => el('span', { class: 'score__band', dataset: { grade: band.key } },
      el('strong', {}, band.key), ` ${band.from}〜${band.to}点`)));
  const reason = $('owner-unscored');
  if (unscored) {
    const final = state.trace?.ok ? state.trace.final : null;
    fill(reason, state.notFetched ? 'つなぎに行っていないので、守りの点数は出していません。'
      : final && final.kind !== 'html' ? '採点の対象外です：最後の応答がページ（HTML）ではなかったためです（ファイルの配布など）。'
        : isLocalFailure() ? 'このアプリ（または通信）の都合で調べられなかったので、守りの点数は出していません。'
          : 'つながらなかったので、守りの点数は出していません。');
    reason.hidden = false;
  } else reason.hidden = true;

  const fixes = owner.topFixes ?? [];
  fill($('owner-fixes'), ...fixes.map((fix) => {
    const finding = result.findings.find((f) => f.id === fix.id);
    const link = el('a', {},
      el('span', { class: 'fixes__title' }, finding?.title ?? fix.id),
      el('span', { class: 'fixes__gain' }, `直すと +${fix.gain}点`),
      el('span', { class: 'fixes__arrow', 'aria-hidden': 'true' }, '↓'));
    link.setAttribute('href', `#${anchorId(fix.id)}`);
    link.addEventListener('click', (event) => {
      event.preventDefault();
      openFinding(fix.id);
    });
    return el('li', {}, link);
  }));
  $('owner-fixes-wrap').hidden = fixes.length === 0;
  renderFindings($('owner-findings'), result.findings.filter((f) => f.axis === 'owner'), 'owner');

  const ref = CONSULT_LINKS.find((link) => link.id === 'ipa-owner');
  const refHref = ref ? safeHref(ref.url) : null;
  fill($('owner-ref'), ...(refHref ? [
    '直し方の考え方は、',
    el('a', { href: refHref, target: '_blank', rel: 'noopener noreferrer' }, `${ref.name}（外部サイト）`),
    'が参考になります。'
  ] : []));
}

function openFinding(id) {
  selectTab('owner', false);
  const target = document.getElementById(anchorId(id));
  if (!target) return;
  const rest = target.closest('.group__rest');
  if (rest?.hidden) document.querySelector(`[aria-controls="${rest.id}"]`)?.click();
  target.open = true;
  const summary = target.querySelector('summary');
  target.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
  summary?.focus({ preventScroll: true });
}

function factsList(rows) {
  return el('dl', { class: 'facts' }, rows.map(([label, value]) => [
    el('dt', {}, label),
    el('dd', {}, Array.isArray(value) ? el('ul', {}, value.map((one) => el('li', {}, one))) : value)
  ]));
}

function renderObserved() {
  const trace = state.trace;
  const around = state.around;
  const parts = [el('p', { class: 'observed__lead' }, '相手のサーバーから返ってきた値を、手を加えずに文字として並べています。見えない制御文字や、文字の向きを変える文字は ⟦U+…⟧ の形で示します。')];
  const final = trace?.ok ? trace.final : null;
  if (!final) {
    parts.push(el('p', {}, state.notFetched ? 'つなぎに行っていないので、取得した値はありません。'
      : isLocalFailure() ? 'このアプリ（または通信）の都合で調べられなかったので、取得した値はありません。' : 'つながらなかったので、取得した値はありません。'));
  } else {
    const html = trace.html;
    const rows = [['最後のアドレス', final.url], ['応答', `${final.status}${final.contentType ? ` ／ ${final.contentType}` : ''}`]];
    if (final.download) rows.push(['配布されたファイル', [final.download.filename, final.download.ext, final.download.reason].filter(Boolean).join(' ／ ')]);
    if (html) {
      rows.push(['ページの題名', html.title ?? '（なし）'], ['大見出し', html.h1 ?? '（なし）']);
      if (html.siteName) rows.push(['サイト名', html.siteName]);
      if (html.textSample) rows.push(['本文の書き出し', html.textSample]);
      if (html.forms.length) {
        rows.push(['入力欄の送り先', html.forms.map((one) => `${String(one.method).toUpperCase()} ${one.action}${one.hasPassword ? '（パスワード欄あり）' : ''}${one.hasCardLike ? '（カード番号らしい欄あり）' : ''}`)]);
      }
      if (html.scripts.external.length) rows.push(['読み込むスクリプト', html.scripts.external.map((one) => one.src)]);
      if (html.iframes.length) rows.push(['埋め込み（iframe）', html.iframes.map((one) => `${one.src}${one.hidden ? '（見えない）' : ''}`)]);
      if (html.links.externalHosts.length) rows.push(['外へのリンク先', html.links.externalHosts]);
    }
    const headers = Object.entries(final.headers ?? {}).map(([name, value]) => `${name}: ${value}`);
    rows.push(['応答ヘッダー（守りに関わるものだけ）', headers.length ? headers : ['（なし）']]);
    if (final.cookies?.length) {
      rows.push(['Cookie（名前と属性だけ。値は読み捨てています）', final.cookies.map((c) => `${c.name} ／ Secure ${c.secure ? 'あり' : 'なし'} ／ HttpOnly ${c.httpOnly ? 'あり' : 'なし'} ／ SameSite ${c.sameSite ?? '指定なし'}`)]);
    }
    parts.push(el('h3', { class: 'observed__title' }, '最後のページ'), factsList(rows));
  }
  if (around) {
    const rows = [];
    if (around.dns && !('unavailable' in around.dns)) {
      rows.push(['名前の向き先（A・AAAA）', [...around.dns.a, ...around.dns.aaaa].length ? [...around.dns.a, ...around.dns.aaaa] : ['（なし）']]);
      rows.push(['SPF（メール送信元の指定）', around.dns.spf.present ? (around.dns.spf.value ?? 'あり') : '見つからず']);
      rows.push(['DMARC（メールのなりすまし対策）', around.dns.dmarc.present ? (around.dns.dmarc.value ?? 'あり') : '見つからず']);
    } else rows.push(['DNS', '取れませんでした']);
    rows.push(['登録日', around.rdap && !('unavailable' in around.rdap) ? `${around.rdap.registeredAt}（${around.rdap.ageDays}日前）${around.rdap.registrar ? ` ／ ${around.rdap.registrar}` : ''}` : '取れませんでした']);
    rows.push(['http:// で開いたとき', around.httpProbe?.tested ? `${around.httpProbe.status ?? '応答なし'}${around.httpProbe.location ? ` → ${around.httpProbe.location}` : ''}` : '確かめていません']);
    rows.push(['security.txt（連絡先の公開）', around.securityTxt && !('unavailable' in around.securityTxt) ? (around.securityTxt.found ? 'あり' : '見つからず') : '確かめていません']);
    parts.push(el('h3', { class: 'observed__title' }, '周りの情報'), factsList(rows));
  }
  fill($('observed-body'), ...parts);
  $('observed').open = false;
}

/* 判定側の「取得処理の一部に制限がありました」は、何の上限かが分からない。観測側の印（trace.notes）から、どの上限かを1文で言う */
const TRACE_NOTE_TEXT = {
  body_truncated: `読み込む量の上限（${LIMITS.BODY_CAP_BYTES / 1024}KiB）で、ページの後半を読めませんでした。`,
  trimmed: '結果の大きさの上限で、一覧の一部（読み込むファイル・Cookieなど）を省きました。'
};
function limitLine(line) {
  if (!String(line).startsWith('取得処理の一部に制限がありました')) return line;
  const notes = (state.trace?.notes ?? []).map((note) => TRACE_NOTE_TEXT[note]).filter(Boolean);
  return notes.length ? `${notes.join('')}今回見えた範囲だけを示しています。` : line;
}
function renderLimits(result) {
  fill($('limits'), ...(result.limits ?? []).map((line) => el('li', {}, limitLine(line))));
}

/** 相談先は、兆候が見つかった段階（気になる・注意・近づかない）で出す */
function showsConsult(result) {
  return ['note', 'warn', 'danger'].includes(result.visitor.level) && !isLocalFailure();
}

function renderConsult(result) {
  const show = showsConsult(result);
  $('consult').hidden = !show;
  if (!show) return;
  const brand = state.lexical?.brand ?? {};
  const brandIds = new Set([...(brand.subdomain ?? []), ...(brand.typo ?? []), ...(brand.keyword ?? [])].map((one) => one.id));
  const ids = ['antiphishing', ...['japanpost', 'yamato', 'sagawa', 'smbc'].filter((id) => brandIds.has(id)), 'police-cyber', 'police-phone', 'consumer', 'ipa'];
  const links = ids.map((id) => CONSULT_LINKS.find((link) => link.id === id)).filter(Boolean);
  fill($('consult-list'), ...links.map((link) => {
    const href = safeHref(link.url);
    const tel = link.phone ? telHref(link.phone) : null;
    const call = tel ? el('a', { class: 'link-card__link link-card__link--tel' }, el('span', { class: 'visually-hidden' }, `${link.name}に`), `電話する（${link.phone}）`) : null;
    if (call) call.setAttribute('href', tel);
    // どのカードも「公式ページ」→「電話」の順。広いカードでは同じ幅の2列、狭いカードでは縦に積む
    return el('li', { class: 'link-card' },
      el('p', { class: 'link-card__name' }, link.name),
      el('p', { class: 'link-card__text' }, link.purpose),
      link.note ? el('p', { class: 'link-card__sends' }, link.note) : null,
      el('div', { class: 'link-card__links' },
        href ? el('a', { class: 'link-card__link', href, target: '_blank', rel: 'noopener noreferrer' }, el('span', { class: 'visually-hidden' }, `${link.name}の`), '公式ページを開く（外部サイト）') : null,
        call));
  }));
}

function renderExternal(result) {
  const list = $('external-list');
  const lead = document.querySelector('.external__lead');
  if (state.sample || state.notFetched) {
    lead.textContent = state.sample
      ? '見本は実在しないサイトなので、外部のサービスは出していません。'
      : 'このリンクは、社内向けの名前や数字のアドレスなどのため、外部のサービスにも渡さないようにしています。';
    fill(list);
    return;
  }
  lead.textContent = '押したときだけ、外部のサイトが別のタブで開きます。何が相手に渡るかを、押す前に確かめてください。';
  let base;
  try {
    base = new URL(result.target.finalUrl ?? state.parsed?.fetch?.href ?? result.target.href);
    base.search = '';
    base.hash = '';
  } catch {
    fill(list);
    return;
  }
  const checks = EXTERNAL_CHECKS.filter((check) => check.verified === true);
  fill(list, ...checks.map((check) => {
    let href = null;
    try {
      href = safeHref(check.build(base.href));
    } catch {
      href = null;
    }
    if (!href || !href.startsWith('https:')) return null;
    const who = [check.forVisitor ? '訪問者向け' : null, check.forOwner ? '運営者向け' : null].filter(Boolean).join('・');
    const owner = parseInput(base.href);
    const registrable = owner.ok ? owner.registrable : '';
    const value = check.sends === 'ホスト名' ? el('span', { class: 'url mono' }, hostParts(base.hostname, registrable)) : urlWithHost(base.href, registrable);
    return el('li', { class: 'link-card', dataset: { check: check.id } },
      el('p', { class: 'link-card__name' }, check.name, who ? el('span', { class: 'link-card__sends' }, `（${who}）`) : null),
      el('p', { class: 'link-card__sends' }, `相手に渡るもの：${check.sends}「`, value, '」。「?」から後ろは渡しません。'),
      check.note ? el('p', { class: 'link-card__text' }, check.note) : null,
      el('a', { class: 'link-card__link', href, target: '_blank', rel: 'noopener noreferrer' }, `${check.name}で開く（外部サイト）`));
  }).filter(Boolean));
}

/* ---------------------------------------------------------------- コピー */

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 下の逃げ道へ */
  }
  const before = document.activeElement;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  if (before instanceof HTMLElement) before.focus({ preventScroll: true });
  return ok;
}

const copyTimers = new WeakMap();
async function copyWithFeedback(text, button, done) {
  const ok = await copyText(text);
  const label = button.dataset.label ?? button.textContent;
  button.dataset.label = label;
  button.textContent = ok ? 'コピーしました' : 'コピーできませんでした';
  button.dataset.done = String(ok);
  announce(ok ? done : 'コピーできませんでした。お使いのブラウザでは、文字を選んでコピーしてください。');
  clearTimeout(copyTimers.get(button));
  copyTimers.set(button, setTimeout(() => {
    button.textContent = label;
    delete button.dataset.done;
  }, 2600));
}

/* ---------------------------------------------------------------- もう一度・やめる */

function clearRetryTimer() {
  if (state.retryTimer) clearInterval(state.retryTimer);
  state.retryTimer = null;
}
/** 帯の中の「もう一度調べる」。回数の上限のときは、残り秒数を数えて0になるまで押せない */
function setupRetry({ show, wait }) {
  clearRetryTimer();
  const row = $('retry-row');
  const button = $('retry');
  row.hidden = !show;
  if (!show) return;
  let left = Math.max(0, Math.round(wait || 0));
  const paint = () => {
    button.disabled = left > 0;
    button.textContent = left > 0 ? `もう一度調べる（あと${left}秒）` : 'もう一度調べる';
    $('retry-wait').textContent = left > 0 ? '時間になると押せます。' : '';
  };
  paint();
  if (left <= 0) return;
  state.retryTimer = setInterval(() => {
    left -= 1;
    paint();
    if (left <= 0) {
      clearRetryTimer();
      announce('もう一度調べられます。');
    }
  }, 1000);
}

function backToInput(message, { clear = false, select = false } = {}) {
  state.run += 1;
  state.controller?.abort();
  setPhase('idle');
  if (clear) {
    input.value = '';
    state.sampleId = null;
    clearInputError();
    hideOneTime();
    updatePreview();
  }
  input.focus();
  if (select && !clear) input.select();
  if (message) announce(message);
}

function jumpTo(id) {
  const target = $(id);
  if (!target) return;
  target.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
  target.focus({ preventScroll: true });
}

/* ---------------------------------------------------------------- はじめに一度だけ */

function fillLimits() {
  for (const node of document.querySelectorAll('[data-limit]')) {
    const value = LIMITS[node.dataset.limit];
    if (typeof value !== 'number') continue;
    const unit = node.dataset.unit;
    const shown = unit === 'kib' ? value / 1024 : unit === 'min' ? value / 60 : unit === 's' ? value / 1000 : value;
    node.textContent = String(Math.round(shown * 10) / 10);
  }
}

function renderSamples() {
  fill($('sample-list'), ...SAMPLES.map((sample) => {
    const label = String(sample.label ?? sample.id);
    const cut = label.indexOf('（');
    const title = cut > 0 ? label.slice(0, cut) : label;
    const note = cut > 0 ? label.slice(cut) : '';
    const parsed = parseInput(sample.url);
    const button = el('button', { type: 'button', class: 'sample-chip', dataset: { sample: sample.id } },
      el('span', { class: 'sample-chip__text' },
        el('span', { class: 'sample-chip__title' }, title),
        note ? el('span', { class: 'sample-chip__note' }, note) : null),
      el('span', { class: 'sample-chip__go' }, 'この見本で試す', el('span', { 'aria-hidden': 'true' }, ' ›')),
      el('span', { class: 'sample-chip__url' }, urlWithHost(sample.url, parsed.ok ? parsed.registrable : '')));
    button.addEventListener('click', () => {
      input.value = sample.url;
      state.sampleId = sample.id;
      inputPreview.hidden = true;
      start();
    });
    return button;
  }));
}

function renderHow() {
  fill($('how-limits'), ...LIMITS_TEXT.map((line) => el('li', {}, line)));
  fill($('level-legend'), ...[...SCALE, 'unknown'].map((level) => el('li', { class: level === 'unknown' ? 'legend__wide' : null },
    levelIcon(level), el('span', {}, LEVEL_META[level].word, level === 'unknown' ? '（調べきれなかったとき）' : null))));
  fill($('how-visitor-bands'), ...bands((points) => visitorLevel(points, []), 0, 60).map((band, index, all) => el('li', {},
    levelIcon(band.key),
    el('strong', {}, LEVEL_META[band.key]?.word ?? band.key),
    el('span', {}, index === all.length - 1 ? `兆候の重みの合計が${band.from}以上` : `兆候の重みの合計が${band.from}〜${band.to}`))));
  fill($('how-owner-bands'), ...bands((score) => gradeOf(score), 0, 100).reverse().map((band) => el('li', {},
    el('strong', {}, `評価 ${band.key}`), ' ', el('span', {}, `${band.from}〜${band.to}点`))));

  // 判定側が RULE_CATALOG を出しているときだけ、所見ごとの点の一覧を描く（無ければ空のまま隠す）
  const catalog = Array.isArray(rules.RULE_CATALOG) ? rules.RULE_CATALOG : [];
  const ruleItem = (rule) => el('li', { class: 'rule', dataset: { rule: rule.id } },
    el('p', { class: 'rule__title' }, rule.title ?? rule.id),
    el('p', { class: 'rule__chips' },
      el('span', { class: 'chip chip--strong' }, catalogPoints(rule)),
      rule.severity ? el('span', { class: 'chip' }, `${rule.axis === 'owner' ? '優先度' : '重大度'} ${(rule.axis === 'owner' ? PRIORITY_WORD : SEVERITY_WORD)[rule.severity] ?? rule.severity}`) : null,
      rule.floor === 'danger' ? el('span', { class: 'chip' }, '「近づかない」より下げない') : rule.floor === 'warn' ? el('span', { class: 'chip' }, '「注意」より下げない') : null),
    rule.note ? el('p', { class: 'rule__note' }, rule.note) : null);
  fill($('how-catalog-visitor'), ...catalog.filter((rule) => rule.axis !== 'owner').map(ruleItem));
  fill($('how-catalog-owner'), ...catalog.filter((rule) => rule.axis === 'owner').map(ruleItem));
  $('how-catalog').hidden = catalog.length === 0;
  $('how-catalog-count').textContent = catalog.length ? `（${catalog.length}件）` : '';
}

/** 所見の点。訪問者向けは「兆候 +9」、運営者向けは「減点 15」。条件で変わるものは「8/6/3/1」のように並べる */
function catalogPoints(rule) {
  const word = rule.axis === 'owner' ? '減点 ' : '兆候 +';
  if (typeof rule.points === 'string') return `${rule.axis === 'owner' ? '減点 ' : '兆候 '}${rule.points}`;
  const list = (Array.isArray(rule.points) ? rule.points : [rule.points]).map(Number).filter(Number.isFinite);
  if (!list.length || list.every((points) => points === 0)) return '点なし';
  return `${word}${list.join('/')}`;
}

function bind() {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    start();
  });
  input.addEventListener('keydown', (event) => {
    // 日本語の変換を確定するEnterでは調べない
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    start();
  });
  input.addEventListener('input', () => {
    if (state.sampleId && input.value.trim() !== SAMPLES.find((s) => s.id === state.sampleId)?.url) state.sampleId = null;
    if (!inputError.hidden) clearInputError();
    hideOneTime();
    updatePreview();
  });
  includeQuery.addEventListener('change', updatePreview);

  if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
    pasteButton.hidden = false;
    pasteButton.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          input.value = text.slice(0, MAX_INPUT);
          state.sampleId = null;
          clearInputError();
          updatePreview();
          announce('貼り付けました。');
        }
        input.focus();
      } catch {
        showInputError('貼り付けできませんでした。入力欄を長押しするか、Ctrl＋V（MacはCommand＋V）で貼り付けてください。');
        input.focus();
      }
    });
  }

  $('one-time-continue').addEventListener('click', () => start({ confirmedOneTime: true }));
  $('one-time-cancel').addEventListener('click', () => {
    hideOneTime();
    input.focus();
    announce('調べるのをやめました。');
  });
  $('cancel-button').addEventListener('click', () => backToInput('調べるのをやめました。'));
  $('retry').addEventListener('click', () => {
    if (state.parsed && !$('retry').disabled) runCheck(state.parsed);
  });
  for (const button of document.querySelectorAll('[data-action]')) {
    button.addEventListener('click', (event) => {
      const action = event.currentTarget.dataset.action;
      if (action === 'again') return leaveResult('入力欄を空にしました。調べたいリンクを貼ってください。', { clear: true });
      if (!state.result) return;
      const options = { sample: Boolean(state.sample) };
      if (action === 'copy-report') copyWithFeedback(buildReport(state.result, options), event.currentTarget, '結果をコピーしました');
      if (action === 'copy-summary') copyWithFeedback(buildSummary(state.result, options), event.currentTarget, '家族に送る要約をコピーしました');
    });
  }
  // ページ内の移動（相談先を見る・結果に戻る・点数の付け方）。URLの「#」は書き換えず、焦点も移す
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a.jump-link[data-jump], #owner-how') : null;
    if (!link) return;
    event.preventDefault();
    jumpTo(link.id === 'owner-how' ? 'how-scoring' : link.dataset.jump);
  });

  for (const tab of tabs) {
    tab.addEventListener('click', () => selectTab(tab.dataset.axis, true));
    tab.addEventListener('keydown', (event) => {
      const index = tabs.indexOf(tab);
      const next = { ArrowRight: tabs[(index + 1) % tabs.length], ArrowLeft: tabs[(index - 1 + tabs.length) % tabs.length], Home: tabs[0], End: tabs.at(-1) }[event.key];
      if (!next) return;
      event.preventDefault();
      selectTab(next.dataset.axis, true);
    });
  }

  window.addEventListener('resize', () => requestAnimationFrame(updateSticky));
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => updateSticky()).observe(resultMain);

  // ブラウザの「戻る」：結果（または失敗）の画面から、入力の画面（前のURL入り）へ戻す
  window.addEventListener('popstate', () => {
    if (state.phase === 'idle') return;
    if (history.state && history.state.dokumi === 'result') return;
    const message = state.pendingMessage;
    const clear = Boolean(state.pendingClear);
    state.pendingMessage = null;
    state.pendingClear = false;
    backToInput(message, { clear, select: !clear });
  });
}

fillLimits();
renderSamples();
renderHow();
bind();
setPhase('idle');
setupPhraseFallback();
app.dataset.ready = 'true'; // 試験と撮影が「初期化が終わった」ことを待つための印
