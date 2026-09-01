/* dist/ を組み立てる：apps/day-* をコピーし、各 meta.json からポートフォリオ一覧ページを生成する。
   依存パッケージなし（node:fs / node:path / node:url のみ）。CSS・JSはindex.htmlにインライン。 */
'use strict';

import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const appsDir = join(root, 'apps');
const staticDir = join(root, 'static');
const distDir = join(root, 'dist');

const SITE = {
  origin: 'https://hundred-days.pages.dev',
  title: '100 DAYS / 100 APPS',
  tagline: '1日1個、Webアプリを作って公開する実験と記録',
  description: '1日1個Webアプリを作って公開する100日チャレンジ。作ったアプリと、AIに任せたこと・自分でやったこと・失敗の記録。',
  goal: 100,
  xUrl: 'https://x.com/haranishi_ikki',
  xHandle: '@haranishi_ikki',
  repoUrl: 'https://github.com/haranishi/hundred-days',
  repoName: 'haranishi/hundred-days',

  // GA4の測定ID（G-XXXXXXXXXX）。空なら計測タグを一切出力しない。
  //
  // ⚠️ 計測タグを入れるのは、この一覧ページ（dist/index.html）だけにする。
  // 各アプリのページには入れない。アプリ側には「外部通信なし」「どこにも送信も
  // 保存もされません」と書いてあり、GA4を入れるとその記述が事実と食い違うため。
  // アプリページの検索流入は Search Console 側で見る（あちらはページに何も置かない）。
  analyticsId: 'G-DSGH6NYRM5',

  // Search Console の所有権確認用トークン（meta タグの content の値だけ）。
  // 空なら meta タグを出力しない。ファイル設置方式を使うなら static/ に置くのでこれは不要
  searchConsoleToken: ''
};

// カード内に出すタグの上限（グリッドの行高を揃えるため。フィルタは全タグを対象にする）
const CARD_TAG_LIMIT = 3;

// ---------------------------------------------------------------- データ読み込み

const dirs = readdirSync(appsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && /^day-\d{3}-/.test(e.name))
  .map((e) => e.name)
  .sort();

const toStringArray = (v) => (Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : []);
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

const allApps = dirs.map((dir) => {
  const metaPath = join(appsDir, dir, 'meta.json');
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
  const status = meta.status || 'published';
  // screenshot / demo はアプリフォルダ内の相対ファイル名だけを受け付ける（パス指定の混入を防ぐ）
  const shot = meta.screenshot ? basename(String(meta.screenshot)) : '';
  const demo = meta.demo ? basename(String(meta.demo)) : '';
  return {
    dir,
    day: Number(meta.day ?? dir.slice(4, 7)),
    title: meta.title || dir,
    description: meta.description || '',
    tags: toStringArray(meta.tags),
    minutes: Number(meta.actualMinutes) > 0 ? Number(meta.actualMinutes) : 0,
    published: status === 'published',
    // draft は「まだ作りかけ」＝一覧にも統計にも出さない（公開前のDayが漏れるのを防ぐ）。
    // アプリ本体を公開しないだけの「制作記録のみ」のDayは draft 以外の status を使う
    draft: status === 'draft',
    xPostUrl: typeof meta.xPostUrl === 'string' ? meta.xPostUrl.trim() : '',
    // Chrome拡張など、このサイトの外で公開しているDayのリンク先（紹介ページ）。
    // status を published 以外にしたうえで externalUrl を書くと、カードがここへ飛ぶ
    externalUrl:
      typeof meta.externalUrl === 'string' && meta.externalUrl.trim().startsWith('https://')
        ? meta.externalUrl.trim()
        : '',
    startedAt: isDate(meta.startedAt) ? meta.startedAt : '',
    finishedAt: isDate(meta.finishedAt) ? meta.finishedAt : '',
    aiHandled: toStringArray(meta.aiHandled),
    humanHandled: toStringArray(meta.humanHandled),
    fixes: (Array.isArray(meta.failuresAndFixes) ? meta.failuresAndFixes : [])
      .map((f) => ({ problem: String(f?.problem || '').trim(), fix: String(f?.fix || '').trim() }))
      .filter((f) => f.problem || f.fix),
    shot,
    // スクショの実体が無い場合はプレースホルダにフォールバックする
    hasShot: Boolean(shot) && existsSync(join(appsDir, dir, shot)),
    demo,
    hasDemo: Boolean(demo) && existsSync(join(appsDir, dir, demo))
  };
});

const drafts = allApps.filter((a) => a.draft);
const apps = allApps.filter((a) => !a.draft);

// ---------------------------------------------------------------- dist/ の組み立て

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

// リポジトリ直下の static/ の中身（OG画像など）を dist/ 直下へ。無くてもビルドは通す
if (existsSync(staticDir)) cpSync(staticDir, distDir, { recursive: true });

for (const app of apps) {
  if (app.published) {
    cpSync(join(appsDir, app.dir), join(distDir, app.dir), { recursive: true });
  } else if (app.hasShot || app.hasDemo) {
    // 「制作記録のみ」のDayはアプリ本体を公開しないが、一覧に出すスクショとデモ動画だけはコピーする
    mkdirSync(join(distDir, app.dir), { recursive: true });
    if (app.hasShot) copyFileSync(join(appsDir, app.dir, app.shot), join(distDir, app.dir, app.shot));
    if (app.hasDemo) copyFileSync(join(appsDir, app.dir, app.demo), join(distDir, app.dir, app.demo));
  }
}

// ---------------------------------------------------------------- セキュリティヘッダ（dist/_headers）

/* Cloudflare Pages は dist/_headers を読んでレスポンスヘッダを足す。既定で付くのは
   X-Content-Type-Options と Referrer-Policy だけで、CSPも枠内表示の禁止も付かない。

   静的ファイルとして static/ に置かずここで生成するのは、アプリのパスを1つずつ書き出すため。
   ワイルドカード1本で済ませると、書き方を間違えても静かに無効化されるだけで気付けない。
   Dayが増えても自動で付いてほしいので、公開するアプリの実体から組み立てる。

   HSTSは入れない。`.dev` はTLDごとHSTSプリロード済みで pages.dev は常にHTTPSになるため。
   独自ドメインを当てる日が来たら、そのときに足す。 */

/* 各値はアプリ側の使用実態を数えた結果。緩める前に本当に必要か確かめること。
     script-src  : アプリ配下にインラインscriptも外部scriptも1つも無い → 'self' だけで足りる
     style-src   : day-004 に style 属性があるので 'unsafe-inline' が要る（属性を消せば外せる）
     img-src     : canvasの書き出しとインラインSVGで data:/blob: を使う
     connect-src : day-009 は同一オリジンのAPI、day-010 はウィキメディアの各プロジェクト
                   （apps/day-010-wikipedia-live/lib/coords.js が通すホストと対応させること） */
const WIKIMEDIA_CONNECT = [
  'wikipedia', 'wikibooks', 'wikinews', 'wikiquote', 'wikisource', 'wikiversity',
  'wikivoyage', 'wiktionary', 'wikimedia', 'wikidata', 'wikifunctions', 'mediawiki'
].map((project) => `https://*.${project}.org`).join(' ');

/* 外部へ接続するのはここに挙げたDayだけ。ほかのアプリは同一オリジンに閉じている。
   ⚠️ 新しいDayで外部のAPIを叩くときは、ここに足さないとブラウザ側で接続が止まる（黙って失敗する）。 */
const CONNECT_BY_APP = {
  'day-010-wikipedia-live': WIKIMEDIA_CONNECT,
  'day-013-gov-answers': 'https://kokkai.ndl.go.jp',
  'day-014-hottest-now': 'https://www.jma.go.jp',
  // day-016 は速度測定そのものが目的なので、測定用のエンドポイントにだけ繋ぐ
  'day-016-line-suspect': 'https://speed.cloudflare.com',
  // day-021 は局データのAPI（ミラー3つ）とクリック報告に繋ぐ
  'day-021-nearby-radio':
    'https://de1.api.radio-browser.info https://nl1.api.radio-browser.info https://at1.api.radio-browser.info'
};

/* day-021 は局のストリーム（audio）とロゴ画像をAPI由来の任意のhttpsホストから読む。
   ホストを事前に列挙できないため、このDayだけ media / img に https: を足す（httpは許さない）。 */
const MEDIA_BY_APP = {
  'day-021-nearby-radio': ' https:'
};
const IMG_BY_APP = {
  'day-021-nearby-radio': ' https:'
};

const appCsp = (dir) => [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${IMG_BY_APP[dir] || ''}`,
  `media-src 'self'${MEDIA_BY_APP[dir] || ''}`,
  "font-src 'self'",
  `connect-src 'self'${CONNECT_BY_APP[dir] ? ` ${CONNECT_BY_APP[dir]}` : ''}`,
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'"
].join('; ');

/* 一覧ページ（/）にCSPを入れていないのは、インラインscriptが2本とGA4があり、
   ハッシュを付けないと動かなくなるため。枠内表示の禁止は X-Frame-Options が全ページに掛かる。
   一覧ページのCSPは別途対応する。 */
const headerLines = [
  '# scripts/build.mjs が生成する。直接編集しても次のビルドで消える',
  '',
  '/*',
  '  X-Frame-Options: DENY',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Cross-Origin-Opener-Policy: same-origin',
  '  Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=(), usb=()',
  ''
];

// パス末尾のアスタリスクは空文字にも当たるので、この1本でアプリの正式なURL
// （/day-010-wikipedia-live/）と配下のファイルの両方に掛かる。
// wrangler pages dev で実測して確認済み（末尾なしのパスも併記するとCSPが二重に付く）。
for (const app of apps.filter((a) => a.published)) {
  headerLines.push(`/${app.dir}/*`, `  Content-Security-Policy: ${appCsp(app.dir)}`, '');
}
writeFileSync(join(distDir, '_headers'), headerLines.join('\n'));

// ---------------------------------------------------------------- 集計（すべて meta.json の実値から）

const publishedCount = apps.filter((a) => a.published).length;
// 進捗は「公開まで至ったDay」で数える。このサイトで配信するもの（published）に加えて、
// Chrome拡張のように外部で公開したDay（externalUrlあり）も含める
const releasedCount = apps.filter((a) => a.published || a.externalUrl).length;
const totalMinutes = apps.reduce((sum, a) => sum + a.minutes, 0);
const progress = Math.min(100, Math.round((releasedCount / SITE.goal) * 100));

// 制作時間：actualMinutes が未記入(0)のDayがあるうちは「記録できている分だけの合計」であることを明示する。
// 全Day記入済みになったら普通の「総制作時間」に戻す
const recordedCount = apps.filter((a) => a.minutes > 0).length;
const allMinutesRecorded = apps.length > 0 && recordedCount === apps.length;

// 制作日数：startedAt / finishedAt に現れた日付の重複を除いた総数。
// 「連続日数」は最新の作業日を起点に数える性質上、何日空けても同じ値を表示し続けてしまう。
// 100日企画では中断が必ず起きるので、時間が経っても嘘にならないこの指標を使う
const workDayCount = new Set(apps.flatMap((a) => [a.startedAt, a.finishedAt]).filter(Boolean)).size;

// タグ：出現回数の多い順 → 先に出てきた順
const tagCount = new Map();
for (const app of apps) for (const tag of app.tags) tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
const allTags = [...tagCount.keys()].sort((a, b) => tagCount.get(b) - tagCount.get(a));

// ---------------------------------------------------------------- HTML生成ヘルパ

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad3 = (n) => String(n).padStart(3, '0');
const duration = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}時間${m}分`;
  if (h) return `${h}時間`;
  return `${m}分`;
};
// ---------------------------------------------------------------- 各アプリのOGP・canonical
/* SNSでリンクを貼ったときに、タイトル・説明・スクリーンショットが出るようにする。
   共有機能（shared/share.js）が公開URLを知るための <link rel="canonical"> もここで入れる。
   10個のHTMLへ手で書くと必ずどれかが古くなるので、meta.json を出どころにして dist へ差し込む。
   アプリ側が自分でog:タグを書いている場合は、そちらを優先して上書きしない。 */
function injectAppMeta(app) {
  const file = join(distDir, app.dir, 'index.html');
  if (!existsSync(file)) return false;
  const html = readFileSync(file, 'utf8');
  if (!html.includes('</head>')) return false;

  const pageUrl = `${SITE.origin}/${app.dir}/`;
  const image = app.hasShot ? `${SITE.origin}/${app.dir}/${app.shot}` : `${SITE.origin}/assets/og.png`;
  const description = app.description || SITE.description;

  const wanted = [
    ['rel="canonical"', `<link rel="canonical" href="${pageUrl}">`],
    ['property="og:title"', `<meta property="og:title" content="${esc(app.title)}">`],
    ['property="og:description"', `<meta property="og:description" content="${esc(description)}">`],
    ['property="og:image"', `<meta property="og:image" content="${image}">`],
    ['property="og:url"', `<meta property="og:url" content="${pageUrl}">`],
    ['property="og:type"', '<meta property="og:type" content="website">'],
    ['property="og:site_name"', `<meta property="og:site_name" content="${esc(SITE.title)}">`],
    ['name="twitter:card"', '<meta name="twitter:card" content="summary_large_image">'],
    ['name="twitter:title"', `<meta name="twitter:title" content="${esc(app.title)}">`],
    ['name="twitter:description"', `<meta name="twitter:description" content="${esc(description)}">`],
    ['name="twitter:image"', `<meta name="twitter:image" content="${image}">`]
  ];

  const add = wanted.filter(([probe]) => !html.includes(probe)).map(([, tag]) => tag);
  if (!add.length) return false;
  writeFileSync(file, html.replace('</head>', `${add.map((tag) => `  ${tag}`).join('\n')}\n</head>`));
  return true;
}

const metaInjected = apps.filter((app) => app.published).filter(injectAppMeta).length;

// 統計ストリップ用：数値は大きく、単位は小さく
const statValue = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const pair = (n, unit) => `<span class="stat__num">${n}</span><span class="stat__unit">${unit}</span>`;
  if (h && m) return pair(h, '時間') + pair(m, '分');
  if (h) return pair(h, '時間');
  return pair(m, '分');
};

const memoBlock = (label, body) => `<div class="memo__row"><dt class="memo__label">${label}</dt><dd class="memo__text">${body}</dd></div>`;

const cardHtml = (app) => {
  const num = pad3(app.day);
  // アプリ本体を持たず、外部の紹介ページで公開しているDay（Chrome拡張など）
  const external = !app.published && Boolean(app.externalUrl);
  const thumbInner =
    `<span class="thumb__label">DAY</span><span class="thumb__num">${num}</span>`;
  const thumb = app.hasShot
    ? `<img class="thumb__img" src="./${esc(app.dir)}/${esc(app.shot)}" alt="${esc(app.title)}の画面" loading="lazy" decoding="async" width="1200" height="750">`
    : thumbInner;
  const thumbClass = `thumb${app.hasShot ? '' : ' thumb--placeholder'}${app.published || external ? '' : ' thumb--muted'}`;
  // 再生ボタンはサムネの外に置く（サムネ自体がアプリへのリンクなので、入れ子のクリック領域を作らない）
  const playBtn = app.hasDemo
    ? `<button class="thumb__play" type="button" data-demo="./${esc(app.dir)}/${esc(app.demo)}"` +
      ` data-title="${esc(app.title)}" data-day="Day ${num}"` +
      ` data-poster="${app.hasShot ? `./${esc(app.dir)}/${esc(app.shot)}` : ''}">デモ<span class="sr-only">（Day ${num}・${esc(app.title)}）を再生</span></button>`
    : '';
  const inner = app.published
    ? `<a class="thumb__link" href="./${esc(app.dir)}/" tabindex="-1" aria-hidden="true">${thumb}</a>`
    : external
      ? `<a class="thumb__link" href="${esc(app.externalUrl)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${thumb}</a>`
      : thumb;
  const thumbBox = `<div class="${thumbClass}">${inner}${playBtn}</div>`;

  const badge = app.published
    ? '<span class="badge badge--live"><span class="badge__dot"></span>公開中</span>'
    : external
      ? '<span class="badge badge--live"><span class="badge__dot"></span>外部で公開</span>'
      : '<span class="badge">制作記録のみ</span>';

  const tags = app.tags
    .slice(0, CARD_TAG_LIMIT)
    .map((t) => `<li class="tag">${esc(t)}</li>`)
    .join('');

  const durationRow = app.minutes
    ? `<p class="card__duration"><span class="card__duration-label">所要時間</span><span class="card__duration-value">${duration(app.minutes)}</span></p>`
    : '';

  const primary = app.published
    ? `<a class="btn btn--primary" href="./${esc(app.dir)}/">アプリを開く</a>`
    : external
      ? `<a class="btn btn--primary" href="${esc(app.externalUrl)}" target="_blank" rel="noopener">紹介ページを開く<span class="sr-only">（Day ${num}・新しいタブで開く）</span></a>`
      : '<button class="btn btn--disabled" type="button" disabled>アプリ本体なし</button>';
  const xLink = app.xPostUrl
    ? `<a class="btn btn--ghost" href="${esc(app.xPostUrl)}" target="_blank" rel="noopener">X投稿<span class="sr-only">（Day ${num}・新しいタブで開く）</span></a>`
    : '';

  const memoRows = [
    app.aiHandled.length ? memoBlock('AIに任せた', esc(app.aiHandled.join('／'))) : '',
    app.humanHandled.length ? memoBlock('自分でやった', esc(app.humanHandled.join('／'))) : '',
    app.fixes.length
      ? memoBlock(
          '失敗と修正',
          app.fixes
            .map((f) => (f.fix ? `${esc(f.problem)} <span class="memo__arrow">→</span> ${esc(f.fix)}` : esc(f.problem)))
            .join('<br>')
        )
      : ''
  ].join('');
  const memo = memoRows
    ? `<details class="memo"><summary class="memo__summary">制作メモ</summary><dl class="memo__body">${memoRows}</dl></details>`
    : '';

  return `<article class="card" data-tags="${esc(app.tags.join(' '))}" data-day="${num}" data-title="${esc(app.title)}">
  ${thumbBox}
  <div class="card__body">
    <div class="card__meta"><span class="card__day">Day ${num}</span>${badge}</div>
    <h3 class="card__title">${esc(app.title)}</h3>
    ${app.description ? `<p class="card__desc">${esc(app.description)}</p>` : ''}
    ${tags ? `<ul class="card__tags">${tags}</ul>` : ''}
    ${durationRow}
    <div class="card__foot">
      <div class="card__actions">${primary}${xLink}</div>
      ${memo}
    </div>
  </div>
</article>`;
};

const cards = [...apps].sort((a, b) => b.day - a.day).map(cardHtml).join('\n');

const chips = [
  '<button class="chip chip--all" type="button" data-tag="*" aria-pressed="true">すべて</button>',
  ...allTags.map((t) => `<button class="chip" type="button" data-tag="${esc(t)}" aria-pressed="false">${esc(t)}</button>`)
].join('');

const gridHeading = apps.length && apps.every((a) => a.published) ? '公開したアプリ' : 'つくったアプリ';

// 計測タグ（この一覧ページ限定。SITE.analyticsId が空なら1行も出力しない）
const analyticsTag = SITE.analyticsId
  ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(SITE.analyticsId)}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${esc(SITE.analyticsId)}');
</script>`
  : '';
const searchConsoleTag = SITE.searchConsoleToken
  ? `<meta name="google-site-verification" content="${esc(SITE.searchConsoleToken)}">`
  : '';
// どちらも未設定なら head に空行すら足さない
const headExtras = [searchConsoleTag, analyticsTag].filter(Boolean).join('\n');
const favicon =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%92%AF%3C/text%3E%3C/svg%3E";

// ---------------------------------------------------------------- ページ

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(SITE.title)}</title>
<meta name="description" content="${esc(SITE.description)}">
<link rel="canonical" href="${SITE.origin}/">
<link rel="icon" href="${favicon}">
<meta property="og:title" content="${esc(SITE.title)}">
<meta property="og:description" content="${esc(SITE.tagline)}">
<meta property="og:image" content="${SITE.origin}/assets/og.png">
<meta property="og:url" content="${SITE.origin}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE.title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(SITE.title)}">
<meta name="twitter:description" content="${esc(SITE.tagline)}">
<meta name="twitter:image" content="${SITE.origin}/assets/og.png">${headExtras ? '\n' + headExtras : ''}
<style>
:root{
  --bg:#14161c; --panel:#1d212b; --panel-2:#242a36; --line:#2c3342;
  --text:#eef1f6; --muted:#9aa3b2; --accent:#4f9cff; --accent-ink:#08121f; --live:#4ade80;
  --mono:ui-monospace,"SF Mono",Menlo,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic","Noto Sans JP","Segoe UI",sans-serif;
}
*{box-sizing:border-box;}
html{-webkit-text-size-adjust:100%;}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--sans);line-height:1.6;
     font-size:16px;-webkit-font-smoothing:antialiased;}
a{color:var(--accent);}
img{max-width:100%;}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px;}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}
.wrap{width:100%;max-width:1240px;margin:0 auto;padding:0 20px;}

/* ヒーロー */
.hero{padding-top:clamp(56px,7vw,104px);}
/* タイトルは2語を折り返し単位にする（狭い画面では「100 DAYS」「/ 100 APPS」の2行になる） */
.hero__title{margin:0;font-family:var(--mono);font-weight:700;font-size:clamp(1.9rem,11.5vw,2.9rem);
  line-height:1.24;letter-spacing:.14em;display:flex;flex-wrap:wrap;gap:0 .45em;}
.hero__title span{white-space:nowrap;}
@media(min-width:768px){.hero__title{font-size:min(6.4vw,4rem);}}
.hero__sub{margin:20px 0 0;color:var(--muted);font-size:clamp(.95rem,1.4vw,1.15rem);}
.progress{margin-top:clamp(30px,3.2vw,40px);}
.progress__row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;}
.progress__count{font-family:var(--mono);font-weight:700;font-size:clamp(1.375rem,2.2vw,1.75rem);letter-spacing:.02em;}
.progress__now{color:var(--accent);}
.progress__label{margin-left:10px;font-family:var(--sans);font-size:.8rem;font-weight:400;color:var(--muted);}
.progress__pct{font-family:var(--mono);font-size:.75rem;color:var(--muted);}
.progress__track{margin-top:14px;height:8px;border-radius:999px;background:var(--panel-2);overflow:hidden;}
.progress__fill{height:100%;min-width:6px;border-radius:999px;background:var(--accent);}
.links{margin-top:clamp(28px,3.2vw,40px);display:flex;flex-wrap:wrap;gap:12px;}
.pill{display:inline-flex;align-items:center;gap:10px;min-height:40px;padding:6px 18px;border:1px solid var(--line);
  border-radius:999px;color:var(--text);text-decoration:none;font-size:.95rem;}
.pill__key{font-family:var(--mono);font-size:.75rem;letter-spacing:.12em;color:var(--muted);}
.pill:hover{border-color:var(--accent);color:var(--accent);}
.pill:hover .pill__key{color:var(--accent);}

/* 統計ストリップ */
.stats{margin-top:clamp(44px,5vw,72px);display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(8px,1.4vw,20px);}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 12px;}
.stat__label{display:block;color:var(--muted);font-size:.75rem;letter-spacing:.04em;}
.stat__value{display:block;margin-top:6px;font-family:var(--mono);font-weight:700;line-height:1.3;}
.stat__num{font-size:clamp(1.375rem,2.2vw,1.75rem);}
.stat__unit{margin-left:3px;font-size:.8rem;color:var(--muted);}
.stat__note{display:block;margin-top:5px;font-size:.6875rem;line-height:1.4;color:var(--muted);}
/* 狭い幅で「制作時間（記／録分）」のようにカッコの途中で折れるのを防ぐ */
.stat__nb{white-space:nowrap;}

/* タグフィルタ */
.filter{margin-top:clamp(28px,3vw,40px);}
.filter__label{margin:0;font-family:var(--mono);font-size:.75rem;letter-spacing:.16em;color:var(--muted);}
.chips{margin-top:14px;display:flex;flex-wrap:wrap;gap:8px;}
.chip{font-family:var(--mono);font-size:.8125rem;color:var(--muted);background:transparent;border:1px solid var(--line);
  border-radius:999px;padding:6px 13px;cursor:pointer;line-height:1.3;}
.chip--all{font-family:var(--sans);}
.chip:hover{color:var(--text);border-color:#3c4557;}
.chip[aria-pressed="true"]{color:var(--accent);border-color:var(--accent);background:rgba(79,156,255,.12);}

/* Day一覧 */
.apps{margin-top:clamp(32px,3.4vw,40px);}
.apps__head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;}
.apps__title{margin:0;font-size:1rem;}
.apps__order{color:var(--muted);font-size:.8rem;}
.grid{margin-top:20px;display:grid;gap:24px;grid-template-columns:1fr;}
@media(min-width:768px){.grid{grid-template-columns:repeat(2,1fr);}}
@media(min-width:1200px){.grid{grid-template-columns:repeat(3,1fr);}}
.card{display:flex;flex-direction:column;background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;}
.card[hidden]{display:none;}
.thumb{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;
  aspect-ratio:16/10;container-type:inline-size;text-decoration:none;
  background:radial-gradient(90% 70% at 50% 30%,rgba(79,156,255,.20),transparent 70%),
             linear-gradient(180deg,#1d2a4d 0%,#16203c 45%,#0d1322 100%);}
.thumb--muted{background:linear-gradient(180deg,#262a33 0%,#1b1e26 55%,#14171d 100%);}
.thumb__link{position:absolute;inset:0;display:block;}
.thumb__img{display:block;width:100%;height:100%;object-fit:cover;}
.thumb__label{font-family:var(--mono);font-size:.75rem;letter-spacing:.3em;color:rgba(238,241,246,.45);}
.thumb__num{font-family:var(--mono);font-weight:700;line-height:1.15;color:rgba(238,241,246,.62);
  font-size:3.75rem;font-size:17cqw;letter-spacing:.02em;}
.thumb--muted .thumb__num{color:rgba(238,241,246,.38);}

/* サムネ上のデモ再生ボタン */
.thumb__play{position:absolute;right:12px;bottom:12px;display:inline-flex;align-items:center;gap:8px;
  min-height:40px;padding:8px 16px 8px 13px;border:1px solid rgba(238,241,246,.35);border-radius:999px;
  background:rgba(11,14,20,.72);color:var(--text);font-family:var(--sans);font-size:.8125rem;
  cursor:pointer;line-height:1;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);}
.thumb__play::before{content:"";width:0;height:0;border-style:solid;border-width:6px 0 6px 10px;
  border-color:transparent transparent transparent currentColor;}
.thumb__play:hover{border-color:var(--accent);color:var(--accent);}
.thumb__play:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}

/* デモ再生ダイアログ */
.player{width:min(92vw,420px);max-height:92vh;padding:0;border:1px solid var(--line);border-radius:16px;
  background:var(--panel);color:var(--text);overflow:hidden;}
.player::backdrop{background:rgba(6,8,12,.82);}
.player__head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 12px 12px 18px;
  border-bottom:1px solid var(--line);}
.player__title{margin:0;font-size:.9375rem;font-weight:700;}
.player__day{display:block;font-family:var(--mono);font-size:.75rem;font-weight:400;color:var(--muted);}
.player__close{min-width:40px;min-height:40px;border:1px solid var(--line);border-radius:10px;background:transparent;
  color:var(--muted);font-size:1.125rem;line-height:1;cursor:pointer;}
.player__close:hover{color:var(--text);border-color:#3c4557;}
.player__close:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
.player__video{display:block;width:100%;max-height:72vh;background:#000;aspect-ratio:9/16;object-fit:contain;}
.player__note{margin:0;padding:10px 18px 14px;font-size:.75rem;color:var(--muted);}
.card__body{flex:1;display:flex;flex-direction:column;padding:20px;}
.card__meta{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.card__day{font-family:var(--mono);font-size:.8125rem;color:var(--muted);}
.badge{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border:1px solid var(--line);border-radius:999px;
  font-size:.75rem;color:var(--muted);white-space:nowrap;}
.badge--live{color:var(--live);border-color:rgba(74,222,128,.45);background:rgba(74,222,128,.08);}
.badge__dot{width:6px;height:6px;border-radius:50%;background:var(--live);}
.card__title{margin:13px 0 0;font-size:1.25rem;line-height:1.45;}
.card__desc{margin:13px 0 0;color:var(--muted);font-size:.875rem;line-height:1.65;}
.card__tags{margin:13px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px;}
.tag{font-family:var(--mono);font-size:.75rem;color:var(--muted);background:var(--panel-2);border-radius:6px;padding:3px 9px;}
.card__duration{margin:13px 0 0;display:flex;align-items:baseline;gap:8px;}
.card__duration-label{color:var(--muted);font-size:.8125rem;}
.card__duration-value{font-weight:700;font-size:.9375rem;}
.card__foot{margin-top:auto;}
.card__foot::before{content:"";display:block;margin-top:28px;border-top:1px solid var(--line);}
.card__actions{margin-top:14px;display:flex;gap:10px;}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:8px 16px;border-radius:10px;
  font-size:.9375rem;font-weight:700;font-family:inherit;text-decoration:none;border:1px solid transparent;cursor:pointer;}
.btn--primary{flex:1;background:var(--accent);color:var(--accent-ink);}
.btn--primary:hover{background:#6cabff;}
.btn--ghost{background:transparent;color:var(--text);border-color:var(--line);}
.btn--ghost:hover{border-color:var(--accent);color:var(--accent);}
.btn--disabled{flex:1;background:transparent;color:var(--muted);border-color:var(--line);cursor:not-allowed;}
.memo{margin-top:13px;border:1px solid var(--line);border-radius:10px;}
.memo__summary{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:40px;padding:8px 14px;
  font-size:.875rem;cursor:pointer;list-style:none;}
.memo__summary::-webkit-details-marker{display:none;}
.memo__summary::after{content:"+";font-family:var(--mono);font-size:1rem;color:var(--muted);line-height:1;}
.memo[open] .memo__summary{border-bottom:1px solid var(--line);}
.memo[open] .memo__summary::after{content:"–";}
.memo__body{margin:0;padding:14px;}
.memo__row + .memo__row{margin-top:12px;}
.memo__label{font-size:.75rem;font-weight:700;color:var(--accent);}
.memo__text{margin:4px 0 0;font-size:.8125rem;line-height:1.7;color:var(--text);}
.memo__arrow{color:var(--muted);}

/* About・フッター */
.about{margin-top:clamp(56px,6vw,88px);padding-top:34px;border-top:1px solid var(--line);}
.about__label{margin:0;font-family:var(--mono);font-size:.75rem;letter-spacing:.16em;color:var(--muted);}
.about__text{margin:14px 0 0;max-width:52em;}
.about__link{margin:20px 0 0;}
.about__link a{font-weight:700;text-decoration:none;}
.about__link a:hover{text-decoration:underline;}
.footer{margin-top:48px;padding:22px 0 40px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;
  align-items:center;justify-content:space-between;gap:12px;}
.footer__brand{font-family:var(--mono);font-size:.75rem;letter-spacing:.1em;color:var(--muted);}
.footer__links{display:flex;gap:20px;font-size:.8125rem;}
.footer__links a{color:var(--muted);text-decoration:none;}
.footer__links a:hover{color:var(--accent);}
.footer__note{flex-basis:100%;margin:0;font-size:.75rem;line-height:1.7;color:var(--muted);}

@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;
    transition-duration:.001ms!important;scroll-behavior:auto!important;}
}
</style>
</head>
<body>
<main class="wrap">
  <header class="hero">
    <h1 class="hero__title"><span>100 DAYS</span> <span>/ 100 APPS</span></h1>
    <p class="hero__sub">${esc(SITE.tagline)}</p>
    <div class="progress">
      <div class="progress__row">
        <p class="progress__count"><span class="progress__now">${releasedCount}</span> / ${SITE.goal}<span class="progress__label">公開済み</span></p>
        <span class="progress__pct" aria-hidden="true">${progress}%</span>
      </div>
      <div class="progress__track" role="progressbar" aria-valuemin="0" aria-valuemax="${SITE.goal}" aria-valuenow="${releasedCount}" aria-label="100日チャレンジの進捗">
        <div class="progress__fill" style="width:${progress}%"></div>
      </div>
    </div>
    <div class="links">
      <a class="pill" href="${SITE.xUrl}" target="_blank" rel="noopener"><span class="pill__key">X</span>${esc(SITE.xHandle)}</a>
      <a class="pill" href="${SITE.repoUrl}" target="_blank" rel="noopener"><span class="pill__key">GITHUB</span>${esc(SITE.repoName)}</a>
    </div>
  </header>

  <section class="stats" aria-label="記録の集計">
    <div class="stat"><span class="stat__label">公開アプリ</span><span class="stat__value"><span class="stat__num">${releasedCount}</span><span class="stat__unit">本</span></span></div>
    <div class="stat"><span class="stat__label">${allMinutesRecorded ? '総制作時間' : '制作時間<span class="stat__nb">（記録分）</span>'}</span><span class="stat__value">${recordedCount ? statValue(totalMinutes) : '<span class="stat__num">—</span>'}</span>${allMinutesRecorded ? '' : `<span class="stat__note">記録済み ${recordedCount}/${apps.length} 日</span>`}</div>
    <div class="stat"><span class="stat__label">制作日数</span><span class="stat__value"><span class="stat__num">${workDayCount}</span><span class="stat__unit">日</span></span></div>
  </section>

  <section class="filter" aria-label="タグで絞り込む">
    <p class="filter__label" id="filter-label">TAGS</p>
    <div class="chips" role="group" aria-labelledby="filter-label">${chips}</div>
  </section>

  <section class="apps" aria-labelledby="apps-title">
    <div class="apps__head">
      <h2 class="apps__title" id="apps-title">${gridHeading}</h2>
      <span class="apps__order">新しい順</span>
    </div>
    <p class="sr-only" id="filter-status" role="status" aria-live="polite"></p>
    <div class="grid">
${cards}
    </div>
  </section>

  <section class="about" aria-labelledby="about-title">
    <p class="about__label" id="about-title">ABOUT</p>
    <p class="about__text">大学生。毎日1個Webアプリを作って公開しています。<br>アカウント登録なし・課金なし・個人を特定できるデータは扱わない。作れるものの幅はDayが進むほど解禁していきます。</p>
    <p class="about__link"><a href="${SITE.repoUrl}#readme" target="_blank" rel="noopener">GitHub README でルールと記録を見る →</a></p>
  </section>

  <footer class="footer">
    <span class="footer__brand">100 DAYS / 100 APPS</span>
    <span class="footer__links">
      <a href="${SITE.repoUrl}" target="_blank" rel="noopener">GitHub</a>
      <a href="${SITE.xUrl}" target="_blank" rel="noopener">X ${esc(SITE.xHandle)}</a>
      <a href="/privacy.html">プライバシー</a>
    </span>
    ${SITE.analyticsId
      ? '<p class="footer__note">このトップページだけ、Googleアナリティクスでアクセス数を見ています（閲覧者を特定する設定は使っていません）。各アプリのページにGoogleアナリティクスは入れていないので、アプリ内での操作がこの計測に残ることはありません。ただし外部サービスと通信するアプリはあり、何をどこへ送るかは<a href="/privacy.html">プライバシーポリシー</a>に1件ずつ書いています。</p>'
      : ''}
  </footer>
</main>

<dialog class="player" id="player" aria-labelledby="player-title">
  <div class="player__head">
    <h2 class="player__title" id="player-title"><span class="player__day" id="player-day"></span><span id="player-name"></span></h2>
    <button class="player__close" type="button" id="player-close" aria-label="閉じる">✕</button>
  </div>
  <video class="player__video" id="player-video" controls playsinline preload="none"></video>
  <p class="player__note">実際に操作しているところを録画したデモです</p>
</dialog>

<script>
(function () {
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
  var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));
  var status = document.getElementById('filter-status');
  if (!chips.length || !cards.length) return;

  function apply(tag) {
    var shown = 0;
    cards.forEach(function (card) {
      var tags = ' ' + (card.getAttribute('data-tags') || '') + ' ';
      var match = tag === '*' || tags.indexOf(' ' + tag + ' ') !== -1;
      card.hidden = !match;
      if (match) shown++;
    });
    chips.forEach(function (chip) {
      chip.setAttribute('aria-pressed', String(chip.getAttribute('data-tag') === tag));
    });
    if (status) status.textContent = (tag === '*' ? 'すべて' : tag) + ' ' + shown + '件を表示中';
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      apply(chip.getAttribute('data-tag'));
    });
  });
})();

// デモ動画：押されるまで src を入れないので、再生するまで1バイトも取りに行かない
(function () {
  var dialog = document.getElementById('player');
  var video = document.getElementById('player-video');
  var buttons = Array.prototype.slice.call(document.querySelectorAll('.thumb__play'));
  if (!dialog || !video || !buttons.length) return;

  // <dialog> 非対応のブラウザでは、押したら動画を直接開くだけにする
  var canModal = typeof dialog.showModal === 'function';
  var opener = null;

  function close() {
    video.pause();
    video.removeAttribute('src');
    video.removeAttribute('poster');
    video.load();
    if (dialog.open) dialog.close();
  }

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var src = btn.getAttribute('data-demo');
      if (!canModal) { window.open(src, '_blank', 'noopener'); return; }
      opener = btn;
      document.getElementById('player-day').textContent = btn.getAttribute('data-day') || '';
      document.getElementById('player-name').textContent = btn.getAttribute('data-title') || '';
      var poster = btn.getAttribute('data-poster');
      if (poster) video.setAttribute('poster', poster);
      video.setAttribute('src', src);
      dialog.showModal();
      var p = video.play();
      // 自動再生が拒否されても controls があるので、そのまま出しておく
      if (p && typeof p.catch === 'function') p.catch(function () {});
    });
  });

  document.getElementById('player-close').addEventListener('click', close);
  // ESCで閉じたときも動画を止めてメモリを解放する
  dialog.addEventListener('close', function () {
    close();
    if (opener) { opener.focus(); opener = null; }
  });
  // 背景（バックドロップ）のクリックで閉じる
  dialog.addEventListener('click', function (e) {
    if (e.target === dialog) close();
  });
})();

// 計測イベント。GA4を入れていないときは何もしない。
//
// なぜ必要か：各アプリのページには計測タグを入れない方針なので、アプリを開かれても
// 遷移先では何も記録されない。GA4の「離脱クリック」は別ドメイン宛のリンクだけが対象で、
// 同一ドメインのアプリページへのリンクは拾わない。つまりここで拾わないと
// 「どのアプリが実際に触られたか」が永久に分からない。
//
// 送るのは匿名の操作内容だけ（Day番号・アプリ名・タグ名）。個人を特定する値は送らない。
(function () {
  if (typeof gtag !== 'function') return;

  function send(name, params) {
    gtag('event', name, params || {});
  }
  function cardOf(el) {
    var card = el.closest ? el.closest('.card') : null;
    return card ? { day: card.getAttribute('data-day') || '', app_title: card.getAttribute('data-title') || '' } : {};
  }

  // アプリを開いた（サムネのリンクと「アプリを開く」ボタンの両方）
  document.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('.thumb__link, .btn--primary') : null;
    if (link) { send('app_open', cardOf(link)); return; }

    // デモ動画の再生
    var play = e.target.closest ? e.target.closest('.thumb__play') : null;
    if (play) { send('demo_play', cardOf(play)); return; }

    // タグで絞り込んだ
    var chip = e.target.closest ? e.target.closest('.chip') : null;
    if (chip) { send('tag_filter', { tag_name: chip.getAttribute('data-tag') || '' }); return; }

    // XやGitHubへ回遊した
    var out = e.target.closest ? e.target.closest('.pill, .footer__links a, .about__link a') : null;
    if (out) {
      var href = out.getAttribute('href') || '';
      send('profile_click', { link_name: href.indexOf('x.com') !== -1 ? 'x' : href.indexOf('github') !== -1 ? 'github' : 'other' });
    }
  });

  // 制作メモを開いた（AIに任せた／自分でやった、が読まれているか）
  document.querySelectorAll('.memo').forEach(function (memo) {
    memo.addEventListener('toggle', function () {
      if (memo.open) send('memo_open', cardOf(memo));
    });
  });
})();
</script>
</body>
</html>
`;

writeFileSync(join(distDir, 'index.html'), html);
console.log(
  `build: ${apps.length} day(s) / 公開 ${releasedCount}（うち外部 ${releasedCount - publishedCount}） / スクショ ${apps.filter((a) => a.hasShot).length}` +
    ` / 動画 ${apps.filter((a) => a.hasDemo).length} / OGP付与 ${metaInjected} -> dist/` +
    // 除外したものは必ず名前を出す（黙って落とすと「全部載っている」と誤解する）
    (drafts.length ? `\n  draft のため一覧から除外: ${drafts.map((d) => d.dir).join(', ')}` : '')
);
