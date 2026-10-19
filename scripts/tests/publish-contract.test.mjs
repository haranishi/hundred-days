import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as contract from '../lib/publish-contract.mjs';
import {
  CONTRACTS,
  checkDay,
  createDay,
  decodeEntities,
  fileExistsExactly,
  formatViolations,
  listAppDirs,
  loadDay,
  parseHtml,
  shareTextOf,
} from '../lib/publish-contract.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

test('このリポジトリの全Day（下書きも含む）が、公開の契約を満たす', () => {
  const dirs = listAppDirs(root);
  assert.ok(dirs.length > 0, 'index.html を持つDayが見つからない＝検査が空回りしている');
  const violations = dirs.flatMap((dir) => checkDay(loadDay(root, dir)));
  assert.equal(violations.length, 0, formatViolations(violations));
});

// ---------------------------------------------------------------- 例の組み立て

const DIR = 'day-099-neko-clock';
const URL_OF_PAGE = `https://hundred-days.pages.dev/${DIR}/`;
const FILES = new Set(['screenshot.webp', 'og.png', 'assets/og.png']);
const page = ({ title = 'ねこ時計 | 100日チャレンジ', head = '', body = '', closeHead = true } = {}) =>
  `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${title}</title>${head}${closeHead ? '</head>' : ''}<body>${body}</body></html>`;
const day = ({ meta = {}, files = FILES, dir = DIR, ...html } = {}) =>
  createDay({ dir, html: page(html), meta: { title: 'ねこ時計', screenshot: 'screenshot.webp', ...meta }, exists: (file) => files.has(file) });
const ids = (target) => checkDay(target).map((one) => one.id);
const only = (target, id) => {
  const found = checkDay(target).filter((one) => one.id === id);
  assert.equal(found.length, 1, formatViolations(checkDay(target)));
  return found[0];
};
const OGP = [
  `<link rel="canonical" href="${URL_OF_PAGE}">`,
  '<meta property="og:title" content="ねこ時計">',
  `<meta property="og:url" content="${URL_OF_PAGE}">`,
  `<meta property="og:image" content="${URL_OF_PAGE}og.png">`,
  '<meta name="twitter:card" content="summary_large_image">',
].join('');

// ---------------------------------------------------------------- 回帰

test('回帰：Day71の旧い共有文は、正式な題名を含まないので share-text-title の違反になる', () => {
  const title = '影証言 — 灯りの高さで、証言の嘘を暴く';
  const old = '影証言 — 灯りの高さで、目撃証言の嘘を暴く影絵×推理パズル。5つの夜、約10分。';
  const meta = { title, screenshot: 'og.png' };
  const before = day({ dir: 'day-071-kage-shogen', meta, title, head: `<meta name="share:text" content="${old}">` });
  const violation = only(before, 'share-text-title');
  assert.deepEqual(ids(before), ['share-text-title']);
  assert.equal(violation.dir, 'day-071-kage-shogen');
  assert.equal(violation.actual, old);
  assert.match(violation.expected, /影証言 — 灯りの高さで、証言の嘘を暴く/);
  assert.match(formatViolations([violation]), /day-071-kage-shogen.*share-text-title/);

  const fixed = '影証言 — 灯りの高さで、証言の嘘を暴く。影絵×推理の5つの夜、約10分。';
  assert.deepEqual(ids(day({ dir: 'day-071-kage-shogen', meta, title, head: `<meta name="share:text" content="${fixed}">` })), []);
});

test('回帰：Day70の旧い共有文も、題名の副題が抜けていて違反になる', () => {
  const title = 'フリップコート — 60秒の陣取りラリー';
  const old = 'フリップコート — 返す、塗る、挟んで反転。1人でCPUと60秒対戦。';
  const before = day({ dir: 'day-070-flip-court', meta: { title, screenshot: 'og.png' }, title, head: `<meta name="share:text" content="${old}">` });
  assert.deepEqual(ids(before), ['share-text-title']);
});

// ---------------------------------------------------------------- 契約ごとの例

test('ソースに無いタグは、ビルドが meta.json から足すので合格とみなす', () => {
  assert.deepEqual(ids(day()), []);
  assert.deepEqual(ids(day({ head: OGP })), []);
});

test('canonical：書かれていれば、ページのURLと一致する', () => {
  const wrong = only(day({ head: '<link rel="canonical" href="https://hundred-days.pages.dev/day-098-inu/">' }), 'canonical');
  assert.equal(wrong.expected, URL_OF_PAGE);
  assert.equal(wrong.actual, 'https://hundred-days.pages.dev/day-098-inu/');
  assert.deepEqual(ids(day({ head: `<LINK HREF='${URL_OF_PAGE}' REL='Canonical'>` })), ['canonical'], '別の書き方はビルドがもう1つ足す');
  assert.match(only(day({ head: `<link rel='canonical' href='${URL_OF_PAGE}'>` }), 'canonical').actual, /2個（ソースに1・ビルドが足す1/);
  assert.match(only(day({ head: '<link rel="canonical">' }), 'canonical').actual, /href 属性が無い/);
});

test('og:title：書かれていれば meta.json の題名と一致する（&amp; などは戻して比べる）', () => {
  const wrong = only(day({ head: '<meta property="og:title" content="ねこ時計 | 100日チャレンジ">' }), 'og-title');
  assert.equal(wrong.expected, 'ねこ時計');
  assert.equal(wrong.actual, 'ねこ時計 | 100日チャレンジ');
  const meta = { title: 'A&B "ねこ" <時計>' };
  assert.deepEqual(ids(day({ meta, title: 'A&amp;B', head: '<meta property="og:title" content="A&amp;B &quot;ねこ&quot; &lt;時計&gt;"><meta name="share:text" content="A&amp;B &quot;ねこ&quot; &lt;時計&gt;">' })), []);
  assert.deepEqual(ids(day({ meta: { title: "ねこ's時計" }, head: '<meta property="og:title" content="ねこ&#39;s時計"><meta name="share:text" content="ねこ&#39;s時計">' })), []);
  assert.deepEqual(ids(day({ meta: { title: '' } })), ['og-title', 'share-text-title'], '題名が無ければ照合できない');
});

test('og:url：書かれていれば、ページのURLと一致する', () => {
  const wrong = only(day({ head: '<meta property="og:url" content="https://hundred-days.pages.dev/">' }), 'og-url');
  assert.equal(wrong.expected, URL_OF_PAGE);
  assert.deepEqual(ids(day({ head: `<meta content="${URL_OF_PAGE}" property="og:url">` })), [], '属性の順番は問わない');
});

test('twitter:card：書かれていれば summary_large_image', () => {
  assert.equal(only(day({ head: '<meta name="twitter:card" content="summary">' }), 'twitter-card').actual, 'summary');
  assert.deepEqual(ids(day({ head: '<meta name="twitter:card" content="summary_large_image" />' })), []);
});

test('og:image：書かれていれば、そのDayのフォルダの下の実在するファイルを指す', () => {
  const image = (content) => day({ head: `<meta property="og:image" content="${content}">` });
  assert.deepEqual(ids(image(`${URL_OF_PAGE}assets/og.png`)), []);
  assert.deepEqual(ids(image(`${URL_OF_PAGE}og.png?v=2`)), [], '問い合わせ部分は配信で無視される');
  assert.match(only(image(`${URL_OF_PAGE}missing.png`), 'og-image').actual, /day-099-neko-clock\/missing\.png が見つからない/);
  assert.equal(only(image('https://hundred-days.pages.dev/day-098-inu/og.png'), 'og-image').actual, 'https://hundred-days.pages.dev/day-098-inu/og.png');
  assert.deepEqual(ids(image('./og.png')), ['og-image'], '相対URLは横断の試験が実体を取りに行けない');
  assert.deepEqual(ids(image(`https://hundred-days.pages.dev/${DIR}/../day-098-inu/og.png`)), ['og-image']);
  assert.deepEqual(ids(image('https://example.com/day-099-neko-clock/og.png')), ['og-image']);
  assert.deepEqual(ids(image(URL_OF_PAGE)), ['og-image'], 'フォルダそのものは画像ではない');
});

test('og:image：書かれていなければ、meta.json の screenshot（ファイル名だけ）が実在する', () => {
  assert.deepEqual(ids(day({ meta: { screenshot: 'shots/screenshot.webp' } })), [], 'ビルドもファイル名だけを使う');
  assert.match(only(day({ meta: { screenshot: 'nai.webp' } }), 'og-image').actual, /nai\.webp が見つからない（ビルドはサイト共通の画像を入れる）/);
  assert.match(only(day({ meta: { screenshot: '' } }), 'og-image').actual, /screenshot が無い/);
});

test('共有文：share:text があればそれ、無ければ <title> の | より前に、題名がそのまま入る', () => {
  assert.deepEqual(ids(day()), []);
  assert.equal(shareTextOf(day()), 'ねこ時計');
  assert.equal(shareTextOf(day({ title: '\n  ねこ時計\n  | 100日チャレンジ ' })), 'ねこ時計');
  assert.equal(shareTextOf(day({ head: '<meta name="share:text" content="  ">' })), 'ねこ時計', '空の share:text は使わない');
  assert.equal(shareTextOf(day({ title: '| 100日チャレンジ' })), '| 100日チャレンジ', '前が空なら題名全体');
  assert.equal(only(day({ title: 'ねこ | 時計' }), 'share-text-title').actual, 'ねこ');
  assert.equal(only(day({ head: '<meta name="share:text" content="時計のねこ">' }), 'share-text-title').actual, '時計のねこ');
  // 最初の share:text だけが使われる（2つ目は読まれない）
  assert.equal(shareTextOf(day({ head: '<meta name="share:text" content="ねこ"><meta name="share:text" content="ねこ時計">' })), 'ねこ');
});

test('タグに見えても要素にならない場所は読まない（コメント・script・SVGの title）', () => {
  const commented = day({ head: '<!-- <meta name="share:text" content="時計のねこ"> -->' });
  assert.equal(shareTextOf(commented), 'ねこ時計');
  const scripted = day({ head: `<script type="application/json">{"tag":"<meta name='share:text' content='時計のねこ'>"}</script>` });
  assert.equal(shareTextOf(scripted), 'ねこ時計');
  const { documentTitle } = parseHtml('<html><body><svg><title>図</title></svg><title>ねこ時計</title></body></html>');
  assert.equal(documentTitle, 'ねこ時計');
});

test('ビルドが足さない形：</head> が無い・属性の文字列がコメントにだけある', () => {
  assert.deepEqual(ids(day({ closeHead: false })), ['canonical', 'og-title', 'og-url', 'twitter-card', 'og-image']);
  const ghost = only(day({ head: '<!-- property="og:title" -->' }), 'og-title');
  assert.match(ghost.actual, /無い（property="og:title" の文字列がタグ以外の場所にある/);
});

// ---------------------------------------------------------------- 独立レビューの指摘（再現の入力をそのまま使う）

const raw = (html, meta = {}, dir = DIR, exists = (file) => FILES.has(file)) =>
  createDay({ dir, html, meta: { title: 'ねこ時計', screenshot: 'screenshot.webp', ...meta }, exists });
const TAG_IDS = ['canonical', 'og-title', 'og-url', 'twitter-card', 'og-image'];

test('レビュー2：ビルドが足す位置（最初の </head>）がコメントや属性値の中なら、足したタグは見えないので違反', () => {
  // 足すタグの有無に依存する5つの契約に加え、build-injection も違反になる（二重に報告してよい）
  assert.deepEqual(ids(raw('<head><title>ねこ時計</title><!-- </head> --></head>')), [...TAG_IDS, 'build-injection']);
  assert.deepEqual(ids(raw('<head><title>ねこ時計</title><meta name="description" content="</head>"></head>')), [...TAG_IDS, 'build-injection']);
  assert.deepEqual(ids(raw('<head><title>ねこ時計</title></head><!-- </head> -->')), [], '最初の </head> が本物なら足される');
});

// build.mjs の injectAppMeta が probe にしている11個のタグを、すべて正しい値で書いたもの
const ALL_TAGS = [
  `<link rel="canonical" href="${URL_OF_PAGE}">`,
  '<meta property="og:title" content="ねこ時計">',
  '<meta property="og:description" content="説明">',
  `<meta property="og:image" content="${URL_OF_PAGE}og.png">`,
  `<meta property="og:url" content="${URL_OF_PAGE}">`,
  '<meta property="og:type" content="website">',
  '<meta property="og:site_name" content="100 DAYS / 100 APPS">',
  '<meta name="twitter:card" content="summary_large_image">',
  '<meta name="twitter:title" content="ねこ時計">',
  '<meta name="twitter:description" content="説明">',
  `<meta name="twitter:image" content="${URL_OF_PAGE}og.png">`,
].join('');

test('レビューB：ビルドが何かを足すのに、足す位置（最初の </head>）が属性値・コメントの中なら build-injection の違反', () => {
  // 属性値の中へ足すと、足したタグの引用符で属性が途中で切れ、共有文が変わる
  const inAttribute = raw('<head><title>T</title><meta name="share:text" content="x </head> y"></head>', { title: 'T' });
  assert.ok(ids(inAttribute).includes('build-injection'), formatViolations(checkDay(inAttribute)));
  assert.ok(ids(raw('<head><title>ねこ時計</title><!-- </head> --></head>')).includes('build-injection'));
  assert.deepEqual(ids(day()), [], '通常のHTMLは違反なし');
  // 11個とも書いてあればビルドは何も足さないので、</head> が属性値の中にあっても壊れない
  assert.deepEqual(ids(raw(`<head><title>ねこ時計</title>${ALL_TAGS}<meta name="description" content="</head>"></head>`)), []);
  // 1個でも欠けていればビルドは足す
  const one = ALL_TAGS.replace('<meta property="og:type" content="website">', '');
  assert.deepEqual(ids(raw(`<head><title>ねこ時計</title>${one}<meta name="description" content="</head>"></head>`)), ['build-injection']);
});

test('レビューB：契約が持つ probe の一覧は、build.mjs の injectAppMeta の wanted と一致する（食い違いの防止）', () => {
  const source = readFileSync(fileURLToPath(new URL('../build.mjs', import.meta.url)), 'utf8');
  const start = source.indexOf('const wanted = [');
  const block = source.slice(start, source.indexOf('];', start));
  const fromBuild = [...block.matchAll(/^\s*\['([^']+)'/gm)].map((match) => match[1]);
  assert.ok(start !== -1 && fromBuild.length > 0, 'build.mjs から wanted を取り出せること（取り出しが空回りしていない）');
  assert.deepEqual(new Set(contract.BUILD_PROBES), new Set(fromBuild));
  for (const probe of contract.TAG_PROBES) assert.ok(fromBuild.includes(probe), `${probe} が build.mjs の wanted にある`);
});

test('レビュー3：ビルドが配信しない場所の画像は、実在しても違反', () => {
  // Day35 の実物の HTML と、実在する tests/fixtures/photo.png
  const dir = 'day-035-front-page';
  const image = `https://hundred-days.pages.dev/${dir}/tests/fixtures/photo.png`;
  const html = readFileSync(join(root, dir, 'index.html'), 'utf8').replace('</head>', `<meta property="og:image" content="${image}">\n</head>`);
  const meta = JSON.parse(readFileSync(join(root, dir, 'meta.json'), 'utf8'));
  const day35 = createDay({ dir, html, meta, exists: (file) => fileExistsExactly(join(root, dir), file) });
  assert.match(only(day35, 'og-image').actual, /配信しない/);
  // Day別に外すフォルダ（Day70 の tools/）と、Day44 の tools の特例。screenshot も同じ規則で見る
  const all = () => true;
  const day70 = raw(page({ head: '<meta property="og:image" content="https://hundred-days.pages.dev/day-070-flip-court/tools/promo/og.png">' }), {}, 'day-070-flip-court', all);
  assert.deepEqual(ids(day70), ['og-image']);
  assert.deepEqual(ids(raw(page(), { screenshot: 'tools-shot.png' }, 'day-044-train-here', all)), ['og-image']);
  assert.deepEqual(ids(raw(page(), { screenshot: 'tools-shot.png' }, 'day-045-read-your-shots', all)), [], 'tools の特例は Day44 だけ');
});

test('レビュー4：ほかのタグの属性値の中に書かれた <meta> は、本物のタグとして読まない', () => {
  const html = `<html data-example='<meta name="share:text" content="ねこ時計">'>
<head><title>ねこ時計</title>
<meta name="share:text" content="別の文"></head></html>`;
  assert.equal(shareTextOf(raw(html)), '別の文');
  assert.deepEqual(ids(raw(html)), ['share-text-title']);
});

test('レビュー5：文字参照は HTML と同じ規則で戻す', () => {
  // 名前付きの参照は大文字・小文字を区別する。&Amp; は参照ではない
  assert.deepEqual(ids(raw(page({ title: 'A&Amp;B', head: '<meta property="og:title" content="A&Amp;B">' }), { title: 'A&B' })), ['og-title', 'share-text-title']);
  // &apos; は戻す（正しいページを落とさない）
  assert.deepEqual(ids(raw(page({ title: 'Tom&apos;s clock', head: '<meta property="og:title" content="Tom&apos;s clock">' }), { title: "Tom's clock" })), []);
  assert.equal(decodeEntities('&AMP;&LT;&GT;&QUOT;&apos;&nbsp;'), '&<>"\' ');
  // 0x80〜0x9F の数値参照は Windows-1252 の文字。0・サロゲート・0x10FFFF超は U+FFFD
  assert.equal(decodeEntities('&#128;'), '€');
  assert.equal(decodeEntities('&#x80;'), '€');
  assert.equal(decodeEntities('&#0;&#xD800;&#x110000;'), '���');
});

test('レビュー6：CRLF と単独の CR は LF にそろえてから読む', () => {
  const crlf = '<meta property="og:title" content="ねこ\r\n時計"><meta name="share:text" content="ねこ\r\n時計">';
  assert.deepEqual(ids(raw(page({ head: crlf }), { title: 'ねこ\n時計' })), []);
  const cr = '<meta property="og:title" content="ねこ\r時計"><meta name="share:text" content="ねこ\r時計">';
  assert.deepEqual(ids(raw(page({ head: cr }), { title: 'ねこ\n時計' })), []);
});

// ---------------------------------------------------------------- 登録簿と読み込み

test('登録簿：契約は id・題名・根拠・検査関数の組で、足した契約も同じ形で報告される', () => {
  assert.equal(new Set(CONTRACTS.map((one) => one.id)).size, CONTRACTS.length);
  for (const contract of CONTRACTS) {
    assert.ok(contract.id && contract.title && contract.source && typeof contract.check === 'function', contract.id);
  }
  const extra = { id: 'extra', title: '足した契約', source: 'この試験', check: () => ({ expected: '1', actual: '2' }) };
  const broken = { id: 'broken', title: '壊れた契約', source: 'この試験', check: () => { throw new Error('読めない'); } };
  const [added, thrown] = checkDay(day(), [...CONTRACTS, extra, broken]);
  assert.deepEqual(added, { dir: DIR, id: 'extra', title: '足した契約', source: 'この試験', expected: '1', actual: '2' });
  assert.match(thrown.actual, /例外：読めない/);
  assert.equal(formatViolations([]), '契約違反なし');
  assert.match(formatViolations([added]), /契約違反 1件\n✖ day-099-neko-clock：足した契約（extra）\n {4}期待：1\n {4}実際：2\n {4}根拠：この試験/);
});

function workspace(t) {
  const place = mkdtempSync(join(tmpdir(), 'hundred-days-contract-'));
  t.after(() => rmSync(place, { recursive: true, force: true }));
  const write = (file, content) => {
    mkdirSync(dirname(join(place, file)), { recursive: true });
    writeFileSync(join(place, file), content);
  };
  return { place, write };
}

test('対象のDay：day-NNN-* で index.html を持つもの（status は問わない）', (t) => {
  const { place, write } = workspace(t);
  write('day-001-alpha/index.html', page());
  write('day-001-alpha/meta.json', JSON.stringify({ status: 'draft' }));
  write('day-002-beta/README.md', '制作記録のみ');
  write('day-3-gamma/index.html', page());
  write('notes/index.html', page());
  assert.deepEqual(listAppDirs(place), ['day-001-alpha']);
});

test('実在の確認は、大文字・小文字まで一致させる（CIのLinuxは区別する）', (t) => {
  const { place, write } = workspace(t);
  const dir = 'day-001-alpha';
  write(`${dir}/meta.json`, JSON.stringify({ title: 'ねこ時計', screenshot: 'screenshot.webp' }));
  write(`${dir}/og.png`, 'png');
  write(`${dir}/screenshot.webp`, 'webp');
  const image = (file) => `<meta property="og:image" content="https://hundred-days.pages.dev/${dir}/${file}">`;
  write(`${dir}/index.html`, page({ head: image('og.png') }));
  assert.deepEqual(ids(loadDay(place, dir)), []);
  write(`${dir}/index.html`, page({ head: image('OG.png') }));
  assert.deepEqual(ids(loadDay(place, dir)), ['og-image']);
  write(`${dir}/index.html`, page({ head: image('og.png') }));
  assert.deepEqual(ids(loadDay(place, dir, { exists: () => false })), ['og-image'], '実在の確認は差し替えられる');
});
