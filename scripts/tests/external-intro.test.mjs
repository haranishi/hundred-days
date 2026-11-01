// 外部Dayの紹介ページ（.kiro/specs/external-intro-pages/）。meta.json の intro の検証と、ページのHTML、ビルドへの組み込みを見る。
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { readIntro, renderIntroPage } from '../lib/external-intro.mjs';
import { parseHtml } from '../lib/publish-contract.mjs';
import { miniSite } from './helpers.mjs';

const DIR = 'day-081-pagecrate';
const APP_URL = 'https://day81.rairakku.com/';
const PAGE_URL = `https://rairakku.com/100days/${DIR}/`;
const SITE = {
  canonicalBase: 'https://rairakku.com/100days',
  title: '100 DAYS / 100 APPS',
  xUrl: 'https://x.com/haranishi_ikki',
  xHandle: '@haranishi_ikki',
  repoUrl: 'https://github.com/haranishi/hundred-days',
};
const INTRO = {
  codeUrl: 'https://github.com/haranishi/pagecrate',
  highlights: ['ページの素材を一覧にする', '選んだものをZIPで保存する'],
  notice: 'いまは、自作素材のデモだけが動きます。',
  poster: 'demo-poster.webp',
};
const APP = {
  dir: DIR,
  day: 81,
  title: 'PageCrate',
  description: 'ページの画像と動画を一覧にし、選んだものを出典の記録つきZIPで保存するWebアプリ。ログイン不要で、運営者は素材を保存しない。',
  tags: ['Webアプリ', 'ZIP'],
  startedAt: '2026-10-31',
  finishedAt: '2026-11-01',
  aiHandled: ['画面と中継を実装した'],
  humanHandled: ['ログインを外すと決めた'],
  fixes: [{ problem: '番号が2行に割れた', fix: '枠の幅を直した' }],
  hasShot: true,
  shot: 'screenshot.webp',
  hasDemo: true,
  demo: 'demo.mp4',
  externalUrl: APP_URL,
  intro: INTRO,
};
const render = (patch = {}) => renderIntroPage({ app: { ...APP, ...patch }, site: SITE });
const attr = (tags, name, key, value) => tags.find((tag) => tag.name === name && tag.attrs.get(key) === value)?.attrs;
// parseHtml（公開の契約の道具）は <meta> と <link> しか返さない。ここでは、ボタン・動画・script も見たいので、要素を全部読む。
// 紹介ページは本文を無害化して出す（< は &lt; になる）ので、タグらしい並びは本物のタグだけ
const ATTRIBUTE = /([^\s=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
const tagsOf = (html) =>
  [...html.matchAll(/<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g)].map((match) => ({
    name: match[1].toLowerCase(),
    attrs: new Map([...match[2].matchAll(ATTRIBUTE)].map((a) => [a[1].toLowerCase(), a[2] ?? a[3] ?? a[4] ?? ''])),
  }));

// ---------------------------------------------------------------- readIntro

const OK = { dir: DIR, status: 'external', externalUrl: APP_URL };

test('intro が無ければ null、あれば検証した値を返す', () => {
  assert.equal(readIntro({}, OK), null);
  assert.deepEqual(readIntro({ intro: INTRO }, OK), INTRO);
  assert.deepEqual(readIntro({ intro: {} }, OK), { codeUrl: '', highlights: [], notice: '', poster: '' });
  assert.deepEqual(readIntro({ intro: { highlights: [' 一つ ', '', 3] } }, OK).highlights, ['一つ', '3']);
});

test('intro があるのに前提が足りないときは、理由つきで止める（書いたのにページが出ない、を防ぐ）', () => {
  assert.throws(() => readIntro({ intro: {} }, { ...OK, status: 'published' }), new RegExp(`${DIR}.*external`));
  assert.throws(() => readIntro({ intro: {} }, { ...OK, status: 'draft' }), /external/);
  assert.throws(() => readIntro({ intro: {} }, { ...OK, externalUrl: '' }), /externalUrl/);
  assert.throws(() => readIntro({ intro: 'はい' }, OK), /intro/);
  assert.throws(() => readIntro({ intro: [] }, OK), /intro/);
  assert.throws(() => readIntro({ intro: { codeUrl: 'http://example.com/' } }, OK), /codeUrl.*https/);
  assert.throws(() => readIntro({ intro: { codeUrl: 'javascript:alert(1)' } }, OK), /codeUrl/);
  assert.throws(() => readIntro({ intro: { highlights: 'x' } }, OK), /highlights/);
  assert.throws(() => readIntro({ intro: { notice: 1 } }, OK), /notice/);
  // ポスターは、そのDayのフォルダの中の画像ファイル名だけ（パス・外部のURL・画像でない拡張子は受け付けない）
  for (const poster of ['../x.webp', 'a/b.webp', 'https://example.com/x.webp', 'x.gif', 'x', 3]) {
    assert.throws(() => readIntro({ intro: { poster } }, OK), /poster/, String(poster));
  }
  // 打ち間違いのキーを黙って捨てると、書いた項目が出ないまま気づけない
  assert.throws(() => readIntro({ intro: { hilights: [] } }, OK), /hilights/);
});

// ---------------------------------------------------------------- ページのHTML

test('canonical・OGP・Twitterカードは公開先の住所で、画像は絶対URL', () => {
  const html = render();
  const { tags, documentTitle } = parseHtml(html);
  assert.equal(documentTitle, 'PageCrate｜Day 081 — 100 DAYS / 100 APPS');
  assert.equal(attr(tags, 'link', 'rel', 'canonical').get('href'), PAGE_URL);
  assert.equal(attr(tags, 'meta', 'property', 'og:url').get('content'), PAGE_URL);
  assert.equal(attr(tags, 'meta', 'property', 'og:title').get('content'), 'PageCrate');
  assert.equal(attr(tags, 'meta', 'property', 'og:type').get('content'), 'website');
  assert.equal(attr(tags, 'meta', 'property', 'og:image').get('content'), `${PAGE_URL}screenshot.webp`);
  assert.equal(attr(tags, 'meta', 'name', 'twitter:card').get('content'), 'summary_large_image');
  assert.equal(attr(tags, 'meta', 'name', 'twitter:image').get('content'), `${PAGE_URL}screenshot.webp`);
  assert.equal(attr(tags, 'meta', 'name', 'description').get('content'), APP.description);
  assert.equal(attr(tags, 'meta', 'name', 'robots').get('content'), 'index,follow');
});

test('画像が無いDayは、共通のOGP画像を使う', () => {
  const { tags } = parseHtml(render({ hasShot: false, shot: '' }));
  assert.equal(attr(tags, 'meta', 'property', 'og:image').get('content'), 'https://rairakku.com/100days/assets/og.png');
});

test('構造化データは WebPage と BreadcrumbList で、住所は絶対URL', () => {
  const html = render();
  const body = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(body, '構造化データがある');
  const data = JSON.parse(body);
  const graph = Object.fromEntries(data['@graph'].map((node) => [node['@type'], node]));
  assert.equal(graph.WebPage.url, PAGE_URL);
  assert.equal(graph.WebPage.inLanguage, 'ja');
  assert.equal(graph.WebPage.isPartOf.url, 'https://rairakku.com/100days/');
  assert.deepEqual(graph.BreadcrumbList.itemListElement.map((item) => item.item), ['https://rairakku.com/100days/', PAGE_URL]);
  assert.ok(!('SoftwareApplication' in graph), '外部Dayの本体が何者かは決めつけない');
});

test('「アプリを開く」は外部の公開先へ、新しいタブで、noopener つき', () => {
  const html = render();
  const open = html.match(/<a class="btn btn--primary"([^>]*)>/)?.[1] ?? '';
  assert.match(open, new RegExp(`href="${APP_URL.replaceAll('.', '\\.')}"`));
  assert.match(open, /target="_blank"/);
  assert.match(open, /rel="noopener"/);
  const code = html.match(/<a class="btn"([^>]*)>コードを見る/)?.[1] ?? '';
  assert.match(code, /href="https:\/\/github\.com\/haranishi\/pagecrate"/);
  assert.match(code, /rel="noopener"/);
});

test('題名・説明・注意・制作メモは、HTMLとして無害化する', () => {
  const evil = '<script>alert(1)</script> "quote" \' & <img src=x onerror=alert(1)>';
  const html = render({
    title: evil,
    description: evil,
    aiHandled: [evil],
    humanHandled: [evil],
    fixes: [{ problem: evil, fix: evil }],
    tags: [evil],
    intro: { codeUrl: '', highlights: [evil], notice: evil },
  });
  const tags = tagsOf(html);
  assert.ok(!tags.some((tag) => tag.name === 'img' && tag.attrs.has('onerror')), '属性に化けない');
  const scripts = tags.filter((tag) => tag.name === 'script');
  assert.ok(scripts.every((tag) => tag.attrs.get('type') === 'application/ld+json' || tag.attrs.has('src')), '本文由来のscriptが無い');
  assert.ok(!html.includes('<script>alert(1)</script>'));
  // 構造化データの中では、閉じタグの文字（<）を残さない
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  assert.ok(!ld.includes('<'), '構造化データに < を残さない');
  assert.doesNotThrow(() => JSON.parse(ld));
});

test('スクリプトとスタイルはインラインにしない（公開済みのDayと同じCSPで動く）', () => {
  const html = render();
  const tags = tagsOf(html);
  for (const tag of tags) {
    assert.ok(!tag.attrs.has('style'), `style属性が無い: <${tag.name}>`);
    for (const key of tag.attrs.keys()) assert.ok(!/^on/i.test(key), `イベント属性が無い: ${key}`);
  }
  assert.ok(!tags.some((tag) => tag.name === 'style'), '<style> が無い');
  const scripts = tags.filter((tag) => tag.name === 'script');
  assert.ok(scripts.length >= 2);
  for (const tag of scripts) assert.ok(tag.attrs.get('type') === 'application/ld+json' || tag.attrs.get('src') === './intro.js', 'srcが自前のintro.js');
  assert.equal(attr(tags, 'link', 'rel', 'stylesheet').get('href'), './intro.css');
});

test('共有は4手段。XとLINEは住所と #100日チャレンジ を含み、コピーと端末の共有はJSが出すまで隠れている', () => {
  const html = render();
  const x = html.match(/href="(https:\/\/x\.com\/intent\/post\?[^"]+)"/)?.[1];
  assert.ok(x, 'Xの投稿画面へのリンク');
  const xUrl = new URL(x.replaceAll('&amp;', '&'));
  assert.equal(xUrl.searchParams.get('url'), PAGE_URL);
  assert.match(xUrl.searchParams.get('text'), /PageCrate/);
  assert.match(xUrl.searchParams.get('text'), /#100日チャレンジ/);
  const line = html.match(/href="(https:\/\/social-plugins\.line\.me\/lineit\/share\?[^"]+)"/)?.[1];
  assert.ok(line, 'LINEへのリンク');
  assert.equal(new URL(line.replaceAll('&amp;', '&')).searchParams.get('url'), PAGE_URL);
  const tags = tagsOf(html);
  const copy = tags.find((tag) => tag.name === 'button' && tag.attrs.get('data-share') === 'copy');
  const native = tags.find((tag) => tag.name === 'button' && tag.attrs.get('data-share') === 'native');
  assert.ok(copy?.attrs.has('hidden'), 'コピーはJSが出す');
  assert.ok(native?.attrs.has('hidden'), '端末の共有は使えるときだけJSが出す');
  assert.match(html, /Instagramなどへは、コピーしたリンクを貼って渡してください/);
  // 折り返しの印（<wbr>・span）は文字を持たないので、コピーする住所（textContent）は変わらない。JSなしでも写せる
  const urlCode = html.match(/<code id="share-url">([\s\S]*?)<\/code>/)[1];
  assert.equal(urlCode.replace(/<[^>]+>/g, ''), PAGE_URL, '住所を本文にも書く');
  // 折り返しはスラッシュの位置で。名前の途中（day-081- と pagecrate の間など）では折れない
  assert.ok(urlCode.includes('/<wbr><span class="nobr">day-081-pagecrate</span>'));
});

test('項目が無ければ、その節ごと出さない（空の見出しを残さない）', () => {
  const html = render({ intro: { codeUrl: '', highlights: [], notice: '' }, aiHandled: [], humanHandled: [], fixes: [], tags: [], hasDemo: false, demo: '', startedAt: '', finishedAt: '' });
  for (const heading of ['できること', '使う前に', '制作メモ', 'デモ動画', 'コードを見る']) assert.ok(!html.includes(heading), `${heading} を出さない`);
  assert.ok(html.includes('このページを共有'), '共有は常に出す');
  assert.ok(!/<h2[^>]*>\s*<\/h2>/.test(html), '空のh2が無い');
  assert.ok(!html.includes('href="#h-memo"'), '制作メモが無ければ、そこへのジャンプも出さない');
  const bare = render({ hasShot: false, shot: '' });
  assert.ok(!bare.includes('<figure'), 'スクリーンショットが無ければ figure も無い');
});

test('参照は文書相対だけで、ルート直下の絶対パスを書かない（/100days/ の下でも元のホストでも動く）', () => {
  const html = render();
  const tags = tagsOf(html);
  for (const tag of tags) {
    for (const key of ['href', 'src', 'poster']) {
      const value = tag.attrs.get(key);
      if (value === undefined) continue;
      assert.ok(!/^\/(?!\/)/.test(value), `${tag.name} ${key}="${value}" はルート直下の絶対パス`);
    }
  }
  assert.ok(tags.some((tag) => tag.attrs.get('src') === './screenshot.webp'));
  assert.ok(tags.some((tag) => tag.attrs.get('src') === './demo.mp4'));
  assert.ok(tags.some((tag) => tag.attrs.get('href') === '../'), '一覧へ戻るは文書相対');
  assert.ok(tags.some((tag) => /^\.\.\/assets\/fonts\//.test(tag.attrs.get('href') ?? '')), '書体の先読みは文書相対');
});

test('動画は、開いただけでは読み込まない。計測タグも入れない', () => {
  const html = render();
  const tags = tagsOf(html);
  const video = tags.find((tag) => tag.name === 'video');
  assert.equal(video.attrs.get('preload'), 'none');
  assert.ok(video.attrs.has('controls'));
  // ポスターは、指定があればそれ（画面写真と同じ絵を2回並べない）。無ければ画面写真。画面写真も無ければ付けない
  assert.equal(video.attrs.get('poster'), './demo-poster.webp');
  const posterOf = (patch) => tagsOf(render(patch)).find((tag) => tag.name === 'video').attrs.get('poster');
  assert.equal(posterOf({ intro: { ...INTRO, poster: '' } }), './screenshot.webp');
  assert.equal(posterOf({ intro: { ...INTRO, poster: '' }, hasShot: false, shot: '' }), undefined);
  assert.ok(!/googletagmanager|gtag\(|google-analytics/i.test(html), '計測タグが無い');
});

test('制作メモは一覧のカードと同じ内容で、期間とタグも出す', () => {
  const html = render();
  for (const text of ['画面と中継を実装した', 'ログインを外すと決めた', '番号が2行に割れた', '枠の幅を直した', '2026年10月31日', '2026年11月1日', 'Webアプリ', 'ZIP']) {
    assert.ok(html.includes(text), `${text} がある`);
  }
  // 画面は日本語の書き方、機械が読む値は年-月-日のまま
  assert.ok(html.includes('<time datetime="2026-10-31">2026年10月31日</time>'));
  for (const heading of ['できること', '使う前に', '制作メモ', 'このページを共有']) assert.ok(html.includes(heading), `${heading} の節がある`);
});

test('「アプリを開く」は、最初と、注意のあとの2か所にある。どちらも同じ行き先で、2つ目は制作メモより前', () => {
  const html = render();
  const links = [...html.matchAll(/<a class="btn btn--primary" href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(links, [APP_URL, APP_URL]);
  const at = (text) => html.indexOf(text);
  assert.ok(at('id="h-notice"') < at('actions--again') && at('actions--again') < at('id="h-memo"'), '注意 → 2つ目のボタン → 制作メモ の順');
});

test('矢印は線の太い図（SVG）で、読み上げない。文字の ↗ は使わない', () => {
  const html = render();
  assert.ok(!html.includes('↗'));
  const icons = tagsOf(html).filter((tag) => tag.name === 'svg');
  const kinds = (name) => icons.filter((icon) => icon.attrs.get('class') === `icon icon--${name}`).length;
  assert.equal(kinds('out'), 6, '外部へ移るリンク：アプリ（最初・注意のあと・フッター）・コード・Xのフォロー・GitHub');
  assert.equal(kinds('down'), 1, '制作メモへのジャンプ');
  assert.equal(icons.length, 7, '矢印はこの2種類だけ（同じ線の太さ）');
  for (const icon of icons) {
    assert.equal(icon.attrs.get('aria-hidden'), 'true');
    assert.ok(!icon.attrs.has('style'));
  }
});

test('制作メモがあるときだけ、そこへのジャンプを出す。フッターから、一覧・アプリ・X・GitHubへ行ける', () => {
  const html = render();
  assert.match(html, /<a href="#h-memo">制作メモを読む/);
  const footer = html.match(/<footer[\s\S]*?<\/footer>/)[0];
  const hrefs = [...footer.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, ['../', APP_URL, SITE.xUrl, SITE.repoUrl]);
  assert.match(footer, /<a class="foot__open"[^>]*rel="noopener"/);
});

test('期間とタグは、制作メモの項目（AI・自分・失敗）とは別のまとまりで、区切りがある', () => {
  const html = render();
  const memo = html.match(/<dl class="memo">([\s\S]*?)<\/dl>/)[1];
  const facts = html.match(/<dl class="memo memo--facts">([\s\S]*?)<\/dl>/)[1];
  for (const label of ['AIに任せた', '自分でやった', '失敗と修正']) assert.ok(memo.includes(label) && !facts.includes(label), label);
  for (const label of ['期間', 'タグ']) assert.ok(facts.includes(label) && !memo.includes(label), label);
  // 期間とタグだけがあるDayでも、制作メモの節は出る（メモの項目は出さない）
  const onlyFacts = render({ aiHandled: [], humanHandled: [], fixes: [] });
  assert.ok(onlyFacts.includes('id="h-memo"') && onlyFacts.includes('memo memo--facts') && !onlyFacts.includes('<dl class="memo">'));
  // 何も無ければ、節ごと出さない
  assert.ok(!render({ aiHandled: [], humanHandled: [], fixes: [], tags: [], startedAt: '', finishedAt: '' }).includes('h-memo'));
});

test('紹介文は文ごとに行を分け、失敗と修正は「修正」を別の行にする', () => {
  const lines = (description) => [...render({ description }).matchAll(/<span class="lead__line">([^<]*)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(lines('一つ目です。二つ目です。三つ目です。'), ['一つ目です。', '二つ目です。', '三つ目です。']);
  assert.deepEqual(lines('句点が無い説明'), ['句点が無い説明']);
  assert.match(render(), /<span class="memo__problem">番号が2行に割れた<\/span><span class="memo__fix">[\s\S]*?枠の幅を直した<\/span>/);
  // 修正が無い失敗は、問題だけを出す
  assert.ok(!render({ fixes: [{ problem: '直せなかった', fix: '' }] }).includes('memo__fix'));
});

// ---------------------------------------------------------------- ビルドへの組み込み

const EXTERNAL = (extra = {}) => JSON.stringify({ day: 4, title: '外部のアプリ', status: 'external', externalUrl: 'https://ext.example/app', description: '外部で公開', finishedAt: '2026-10-30', ...extra });

test('ビルド：intro のある外部Dayだけ、紹介ページ・CSP・sitemap・カードの副リンクが揃う', (t) => {
  const { site, write, build, read } = miniSite(t);
  write('day-004-ext/meta.json', EXTERNAL({ screenshot: 'screenshot.webp', demo: 'demo.mp4', intro: INTRO }));
  write('day-004-ext/screenshot.webp', 'x');
  write('day-004-ext/demo.mp4', 'x');
  write('day-004-ext/demo-poster.webp', 'x');
  write('day-005-plain/meta.json', EXTERNAL({ day: 5, title: '紹介なしの外部' }));
  const run = build();
  assert.equal(run.status, 0, run.output);

  const page = read('day-004-ext/index.html');
  assert.ok(page.includes('<link rel="canonical" href="https://rairakku.com/100days/day-004-ext/">'));
  assert.ok(page.includes('href="https://ext.example/app"'));
  assert.ok(existsSync(join(site, 'dist', 'day-004-ext', 'intro.css')));
  assert.ok(existsSync(join(site, 'dist', 'day-004-ext', 'intro.js')));
  assert.ok(existsSync(join(site, 'dist', 'day-004-ext', 'demo-poster.webp')), 'ポスターも dist/ に入る');
  assert.ok(!existsSync(join(site, 'dist', 'day-005-plain', 'index.html')), 'introの無い外部Dayには作らない');

  const headers = read('_headers');
  assert.match(headers, /\/day-004-ext\/\*\n {2}Content-Security-Policy: default-src 'self'; script-src 'self';/);
  assert.ok(!headers.includes('/day-005-plain/*'));

  const sitemap = read('sitemap.xml');
  assert.ok(sitemap.includes('<loc>https://rairakku.com/100days/day-004-ext/</loc>'));
  assert.ok(sitemap.includes('<lastmod>2026-10-30</lastmod>'));
  assert.ok(!sitemap.includes('day-005-plain'));

  // 一覧のカード：主ボタンは今までどおり外部へ。副リンクだけが紹介ページへ入る
  const card = (day) => read('index.html').match(new RegExp(`<article class="card" id="day-${day}"[\\s\\S]*?</article>`))[0];
  const withIntro = card('004');
  assert.match(withIntro, /<a class="btn btn--primary" href="https:\/\/ext\.example\/app" target="_blank" rel="noopener">紹介ページを開く/);
  assert.match(withIntro, /<a class="post-link" href="\.\/day-004-ext\/">制作の記録/);
  assert.ok(!card('005').includes('制作の記録'));
});

test('ビルド：intro.poster のファイルが無いと、理由を出して止まる', (t) => {
  const { write, build } = miniSite(t);
  write('day-004-ext/meta.json', EXTERNAL({ intro: { poster: 'missing.webp' } }));
  const run = build();
  assert.notEqual(run.status, 0);
  assert.match(run.output, /day-004-ext.*poster.*missing\.webp/);
});

test('ビルド：intro があるのに前提が足りないと、理由を出して止まる', (t) => {
  const { write, build } = miniSite(t);
  write('day-004-ext/meta.json', EXTERNAL({ externalUrl: '', intro: INTRO }));
  const run = build();
  assert.notEqual(run.status, 0);
  assert.match(run.output, /day-004-ext/);
  assert.match(run.output, /externalUrl/);
});
