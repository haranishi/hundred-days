/* 共有・OGPの横断のブラウザ試験（shared-share）が静的に確かめている項目を、ブラウザなしで確かめる登録簿。
   その試験は published のDayにしか掛からないので、下書きのDayは公開した瞬間に初めて落ちていた（Day70・Day71）。
   単体テストが全Day（下書きも含む）に当て、publish:check も最初にこれを使う。
   計算済みのスタイルが要る項目（44pxの大きさ・枠のコントラスト・共有欄が1つだけ据わること）は写さない。
   別の実装で写すと食い違うので、publish:check のブラウザ段が受け持つ。 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { isServedPath } from './dist-files.mjs';

export const SITE_ORIGIN = 'https://hundred-days.pages.dev';
export const pageUrlOf = (dir) => `${SITE_ORIGIN}/${dir}/`;

const SHARE_SPEC = 'tests/e2e/shared-share.spec.mjs';
const OGP_TEST = `${SHARE_SPEC}「リンクを貼ったときに中身が出る（OGPとcanonical）」`;
const SHARE_TEST = `${SHARE_SPEC}「シェア欄が据え付けられている」のXの投稿画面の本文`;

// ---------------------------------------------------------------- HTMLの読み取り（DOMライブラリは足さない）

// 名前付きの参照は大文字・小文字を区別する（&Amp; は参照ではない）。セミコロンの無い古い形は戻さない
const NAMED = { amp: '&', AMP: '&', lt: '<', LT: '<', gt: '>', GT: '>', quot: '"', QUOT: '"', apos: "'", nbsp: ' ' };
// HTMLは 0x80〜0x9F の数値参照を Windows-1252 の文字として読む（表に無い 0x81・0x8D・0x8F・0x90・0x9D は、そのまま）
const WINDOWS_1252 = new Map([
  [0x80, 0x20ac], [0x82, 0x201a], [0x83, 0x0192], [0x84, 0x201e], [0x85, 0x2026], [0x86, 0x2020], [0x87, 0x2021],
  [0x88, 0x02c6], [0x89, 0x2030], [0x8a, 0x0160], [0x8b, 0x2039], [0x8c, 0x0152], [0x8e, 0x017d], [0x91, 0x2018],
  [0x92, 0x2019], [0x93, 0x201c], [0x94, 0x201d], [0x95, 0x2022], [0x96, 0x2013], [0x97, 0x2014], [0x98, 0x02dc],
  [0x99, 0x2122], [0x9a, 0x0161], [0x9b, 0x203a], [0x9c, 0x0153], [0x9e, 0x017e], [0x9f, 0x0178],
]);
const REFERENCE = /&(?:(amp|AMP|lt|LT|gt|GT|quot|QUOT|apos|nbsp);|#(\d+);?|#[xX]([\da-fA-F]+);?)/g;

export function decodeEntities(text) {
  return String(text).replace(REFERENCE, (whole, name, decimal, hex) => {
    if (name) return NAMED[name];
    const code = decimal !== undefined ? Number.parseInt(decimal, 10) : Number.parseInt(hex, 16);
    // 0・サロゲート・範囲外は、HTMLでは置換文字になる
    if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '�';
    return String.fromCodePoint(WINDOWS_1252.get(code) ?? code);
  });
}

const ATTRS = `(?:[^>"']|"[^"]*"|'[^']*')*`;
const END = '(?=[\\s/>])';
/* 中身が要素にならないもの（コメント・script など）、SVG・MathML（中の title は文書の題名にならない）、
   ほかの開始タグ（属性値の中に書かれた <meta> は、ただの文字）を、出てきた順に読み飛ばす */
const TOKEN = new RegExp(
  '<!--[\\s\\S]*?(?:-->|$)' +
    `|<(?<raw>script|style|textarea|title|template|noscript|iframe|xmp|noembed|noframes)${END}${ATTRS}>(?<text>[\\s\\S]*?)(?:<\\/\\k<raw>\\s*>|$)` +
    `|<(?<foreign>svg|math)${END}${ATTRS}>[\\s\\S]*?(?:<\\/\\k<foreign>\\s*>|$)` +
    `|<(?<tag>meta|link)${END}(?<attrs>${ATTRS})>` +
    `|<(?<other>[a-z][^\\s/>]*)${ATTRS}>`,
  'gi'
);

// 読み飛ばした範囲の種類（ビルドが足す位置がそこに入ったときの説明に使う）
const placeOf = (groups) => {
  if (groups.raw) return `<${asciiLower(groups.raw)}> の中身`;
  if (groups.foreign) return `<${asciiLower(groups.foreign)}> の中`;
  if (groups.tag || groups.other) return `<${asciiLower(groups.tag || groups.other)}> タグの属性値`;
  return 'コメント';
};
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
const asciiLower = (value) => String(value ?? '').replace(/[A-Z]/g, (c) => c.toLowerCase());

function parseAttributes(source) {
  const attrs = new Map();
  for (const [, name, double, single, bare] of source.matchAll(ATTRIBUTE)) {
    const key = asciiLower(name);
    // 同じ属性が2つあると、ブラウザは最初の1つを使う
    if (!attrs.has(key)) attrs.set(key, decodeEntities(double ?? single ?? bare ?? ''));
  }
  return attrs;
}

// ブラウザは字句に分ける前に、改行を LF にそろえる
export const normalizeNewlines = (html) => String(html).replace(/\r\n?/g, '\n');

/** <meta>・<link> の属性、document.title と同じ題名（最初の <title>、空白を詰めたもの）、
    ビルドが足す位置の最初の </head> が読み飛ばした範囲（タグ・コメント・script など）に入っていないか（headInside はその場所） */
export function parseHtml(html) {
  const source = normalizeNewlines(html);
  const tags = [];
  const skipped = [];
  let title = null;
  for (const match of source.matchAll(TOKEN)) {
    const { groups } = match;
    skipped.push({ start: match.index, end: match.index + match[0].length, place: placeOf(groups) });
    if (groups.tag) tags.push({ name: asciiLower(groups.tag), attrs: parseAttributes(groups.attrs) });
    else if (asciiLower(groups.raw) === 'title' && title === null) title = decodeEntities(groups.text);
  }
  const documentTitle = (title ?? '').replace(/[\t\n\f\r ]+/g, ' ').replace(/^ | $/g, '');
  // build.mjs の injectAppMeta は、文字列として最初の </head> の前に足す。そこがコメントの中なら足したタグは文字のまま、
  // 属性値の中なら足したタグの引用符で属性が途中で切れる
  const headAt = source.indexOf('</head>');
  const headInside = headAt === -1 ? '' : (skipped.find(({ start, end }) => headAt >= start && headAt < end)?.place ?? '');
  return { tags, documentTitle, headAt, headVisible: headAt !== -1 && !headInside, headInside };
}

// ---------------------------------------------------------------- Dayの読み込み

/** macOS の既定のディスクは大文字・小文字を区別しないが、CI（Linux）は区別する。手元だけ通るのを防ぐため、名前を1段ずつ照合する */
export function fileExistsExactly(base, relative) {
  let place = base;
  for (const part of String(relative).split('/')) {
    if (!part || part === '.' || part === '..') return false;
    let names;
    try {
      names = readdirSync(place);
    } catch {
      return false;
    }
    if (!names.includes(part)) return false;
    place = join(place, part);
  }
  try {
    return statSync(place).isFile();
  } catch {
    return false;
  }
}

/** 検査の対象：index.html を持つ day-NNN-*（status は問わない。下書きも対象） */
export function listAppDirs(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^day-\d{3}-/.test(entry.name) && existsSync(join(root, entry.name, 'index.html')))
    .map((entry) => entry.name)
    .sort();
}

/** exists はDayのフォルダからの相対パス（例 og.png・assets/og.png）を受け取る。配信されるかは、契約の側で dist-files の規則で見る */
export function createDay({ dir, html, meta = {}, exists = () => false }) {
  const { tags, documentTitle, headAt, headVisible, headInside } = parseHtml(html);
  return { dir, html: normalizeNewlines(html), meta: meta ?? {}, pageUrl: pageUrlOf(dir), tags, documentTitle, headAt, headVisible, headInside, exists };
}

export function loadDay(root, dir, { exists = (file) => fileExistsExactly(join(root, dir), file) } = {}) {
  const metaPath = join(root, dir, 'meta.json');
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
  return createDay({ dir, html: readFileSync(join(root, dir, 'index.html'), 'utf8'), meta, exists });
}

// ---------------------------------------------------------------- ビルドを通したあとのタグ

const screenshotOf = (day) => (day.meta.screenshot ? basename(String(day.meta.screenshot)) : '');
const titleOf = (day) => (typeof day.meta.title === 'string' && day.meta.title.trim() ? day.meta.title : '');

/* build.mjs の injectAppMeta が、タグを足すかどうかを決める文字列（wanted の probe）。
   ずれると、足すかどうかの見立てが外れる。単体テストが build.mjs のソースと照合する */
export const BUILD_PROBES = [
  'rel="canonical"',
  'property="og:title"',
  'property="og:description"',
  'property="og:image"',
  'property="og:url"',
  'property="og:type"',
  'property="og:site_name"',
  'name="twitter:card"',
  'name="twitter:title"',
  'name="twitter:description"',
  'name="twitter:image"',
];

/* probe と built は build.mjs の injectAppMeta と同じ。ビルドは、ファイルに probe の文字列が無いときだけ、
   meta.json から作った built の値でタグを足す（</head> が無ければ何も足さない）。
   だから、ソースに別の書き方（単引用符など）で書いたタグは二重になり、コメントに probe があるだけでもタグは足されない。
   足す位置の最初の </head> がコメントや属性値の中だと、足したタグは正しく入らない（build-injection の契約が見る） */
const TAG_KINDS = {
  canonical: {
    probe: 'rel="canonical"',
    value: 'href',
    is: (tag) => tag.name === 'link' && asciiLower(tag.attrs.get('rel')) === 'canonical',
    built: (day) => day.pageUrl,
  },
  'og:title': {
    probe: 'property="og:title"',
    value: 'content',
    is: (tag) => tag.name === 'meta' && tag.attrs.get('property') === 'og:title',
    built: (day) => day.meta.title || day.dir,
  },
  'og:url': {
    probe: 'property="og:url"',
    value: 'content',
    is: (tag) => tag.name === 'meta' && tag.attrs.get('property') === 'og:url',
    built: (day) => day.pageUrl,
  },
  'og:image': {
    probe: 'property="og:image"',
    value: 'content',
    is: (tag) => tag.name === 'meta' && tag.attrs.get('property') === 'og:image',
    built: (day) => {
      const shot = screenshotOf(day);
      return shot && day.exists(shot) ? `${day.pageUrl}${shot}` : `${SITE_ORIGIN}/assets/og.png`;
    },
  },
  'twitter:card': {
    probe: 'name="twitter:card"',
    value: 'content',
    is: (tag) => tag.name === 'meta' && tag.attrs.get('name') === 'twitter:card',
    built: () => 'summary_large_image',
  },
};

/** 5つのタグの契約が頼る probe（どれも BUILD_PROBES にあることを、単体テストが確かめる） */
export const TAG_PROBES = Object.values(TAG_KINDS).map(({ probe }) => probe);

function tagsAfterBuild(day, kind) {
  const spec = TAG_KINDS[kind];
  const written = day.tags.filter(spec.is).map((tag) => ({ value: tag.attrs.get(spec.value) ?? null, from: 'source' }));
  const added = day.headVisible && !day.html.includes(spec.probe);
  return added ? [...written, { value: spec.built(day), from: 'build' }] : written;
}

// 横断の試験は locator を1つに絞れないと落ちる（strict mode）。0個も2個以上も違反にする
function countViolation(day, kind, found) {
  const { probe } = TAG_KINDS[kind];
  if (!found.length) {
    let why = `ビルドが足す位置の最初の </head> が「${day.headInside}」の中にあり、足したタグが正しく入らない。build-injection を参照`;
    if (day.headAt === -1) why = '</head> が無いので、ビルドも足さない';
    else if (day.html.includes(probe)) why = `${probe} の文字列がタグ以外の場所にあるので、ビルドも足さない`;
    return { expected: `${kind} が1つ`, actual: `無い（${why}）` };
  }
  const built = found.filter((one) => one.from === 'build').length;
  const reason = built ? `。ビルドは ${probe} という書き方でしか見つけないので、もう1つ足す` : '';
  return { expected: `${kind} が1つ`, actual: `${found.length}個（ソースに${found.length - built}・ビルドが足す${built}${reason}）` };
}

function expectOne(day, kind, expected) {
  const found = tagsAfterBuild(day, kind);
  if (found.length !== 1) return countViolation(day, kind, found);
  const [{ value, from }] = found;
  if (value === expected) return null;
  return { expected, actual: value === null ? `${TAG_KINDS[kind].value} 属性が無い` : `${value}${from === 'build' ? '（ビルドが足す値）' : ''}` };
}

function checkImage(day) {
  const found = tagsAfterBuild(day, 'og:image');
  if (found.length !== 1) return countViolation(day, 'og:image', found);
  const [{ value, from }] = found;
  if (from === 'build') {
    // 足す画像は meta.json の screenshot。無いとサイト共通の画像になり、そのDayのリンクに見えない
    const shot = screenshotOf(day);
    const expected = `meta.json の screenshot（ファイル名だけ）が ${day.dir}/ に実在し、ビルドが配信する`;
    if (!shot || !day.exists(shot)) {
      return { expected, actual: `${shot ? `${day.dir}/${shot} が見つからない` : 'screenshot が無い'}（ビルドはサイト共通の画像を入れる）` };
    }
    // ビルドは実在だけを見て og:image に使うが、配信しない場所なら本番で404になる
    return isServedPath(day.dir, shot) ? null : { expected, actual: `${day.dir}/${shot} はビルドが配信しない場所にある` };
  }
  if (value === null) return { expected: `${day.pageUrl} の下の画像のURL`, actual: 'content 属性が無い' };
  let url = null;
  try {
    url = new URL(value);
  } catch {
    // 相対URLは、横断の試験が実体を取りに行けない
  }
  const folder = `/${day.dir}/`;
  if (!url || url.origin !== SITE_ORIGIN || !url.pathname.startsWith(folder)) {
    return { expected: `${day.pageUrl} の下の画像のURL`, actual: value };
  }
  let file = '';
  try {
    file = decodeURIComponent(url.pathname.slice(folder.length));
  } catch {
    file = '';
  }
  const expected = `指す先のファイルが ${day.dir}/ に実在し、ビルドが配信する`;
  if (!file || !day.exists(file)) return { expected, actual: `${value}（${day.dir}/${file} が見つからない）` };
  // tests/・tools/cache/ や、Dayごとに外す tools/・source/ は、実在しても dist/ に入らない
  return isServedPath(day.dir, file) ? null : { expected, actual: `${value}（${day.dir}/${file} はビルドが配信しない場所にある）` };
}

/** shared/share.js の shareText() と同じ規則で、共有文を求める */
export function shareTextOf(day) {
  const declared = day.tags.find((tag) => tag.name === 'meta' && tag.attrs.get('name') === 'share:text');
  const text = (declared?.attrs.get('content') ?? '').trim();
  if (text) return text;
  return day.documentTitle.split('|')[0].trim() || day.documentTitle;
}

const missingTitle = { expected: 'meta.json に題名（title）がある', actual: '題名が無い' };

// ---------------------------------------------------------------- 契約

export const CONTRACTS = [
  {
    id: 'canonical',
    title: 'canonical がページのURLと一致する',
    source: OGP_TEST,
    check: (day) => expectOne(day, 'canonical', day.pageUrl),
  },
  {
    id: 'og-title',
    title: 'og:title が meta.json の題名と一致する',
    source: OGP_TEST,
    check: (day) => (titleOf(day) ? expectOne(day, 'og:title', titleOf(day)) : missingTitle),
  },
  {
    id: 'og-url',
    title: 'og:url がページのURLと一致する',
    source: OGP_TEST,
    check: (day) => expectOne(day, 'og:url', day.pageUrl),
  },
  {
    id: 'twitter-card',
    title: 'twitter:card が summary_large_image',
    source: OGP_TEST,
    check: (day) => expectOne(day, 'twitter:card', 'summary_large_image'),
  },
  {
    id: 'og-image',
    title: 'og:image がそのDayのフォルダにある画像を指す',
    source: OGP_TEST,
    check: checkImage,
  },
  {
    id: 'share-text-title',
    title: '共有文に meta.json の題名がそのまま入る',
    source: SHARE_TEST,
    check: (day) => {
      const title = titleOf(day);
      if (!title) return missingTitle;
      const text = shareTextOf(day);
      return text.includes(title) ? null : { expected: `「${title}」をそのまま含む`, actual: text || '（空）' };
    },
  },
  {
    // 横断の試験の写しではなく、ビルドの差し込み方から来る契約。属性値の中へ足すと、足したタグの引用符で属性が切れ、
    // すでに書いてある share:text などの値まで変わる。5つのタグの契約は、検査する5種類しか見ないので、これを見逃す
    id: 'build-injection',
    title: 'ビルドがタグを足す位置が、タグ・コメント・script などの中に入らない',
    source: 'scripts/build.mjs の injectAppMeta（文字列として最初の </head> の前に、足りないタグを差し込む）',
    check: (day) => {
      if (!day.headInside) return null;
      const missing = BUILD_PROBES.filter((probe) => !day.html.includes(probe));
      if (!missing.length) return null; // 11個とも書いてあれば、ビルドは何も足さない
      const broken = day.headInside.includes('属性値') ? '足したタグの引用符で属性が途中で切れ、その値が変わる' : '足したタグは要素にならない';
      return {
        expected: '最初の </head> が、タグ・コメント・script などの外にある（ビルドが何かを足すとき）',
        actual: `最初の </head> が「${day.headInside}」の中にあり、ビルドはそこへ ${missing.length}個のタグ（${missing.join('・')}）を差し込む。${broken}`,
      };
    },
  },
];

/** 違反の配列（Day名・契約の id・title・期待・実際・根拠） */
export function checkDay(day, contracts = CONTRACTS) {
  return contracts.flatMap(({ id, title, source, check }) => {
    let result;
    try {
      result = check(day);
    } catch (error) {
      result = { expected: '検査が最後まで走る', actual: `例外：${error.message}` };
    }
    return result ? [{ dir: day.dir, id, title, source, expected: result.expected, actual: result.actual }] : [];
  });
}

export function formatViolations(violations) {
  if (!violations.length) return '契約違反なし';
  return [
    `契約違反 ${violations.length}件`,
    ...violations.map((one) =>
      [`✖ ${one.dir}：${one.title}（${one.id}）`, `    期待：${one.expected}`, `    実際：${one.actual}`, `    根拠：${one.source}`].join('\n')
    ),
  ].join('\n');
}
