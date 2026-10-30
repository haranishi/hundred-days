/* dist/ を組み立てる：day-* をコピーし、各 meta.json からポートフォリオ一覧ページを生成する。
   依存パッケージなし（node:fs / node:path / node:url のみ）。CSS・JSはindex.htmlにインライン。 */
'use strict';

import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLISH_CHECK_ENV, effectiveStatus, isPublishCheckOverride, unmatchedPublishCheckTargets } from './lib/day-status.mjs';
import { findRootRelativeRefs } from './check-mount-safe.mjs';
import { isServedPath } from './lib/dist-files.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const appsDir = root;
const staticDir = join(root, 'static');
const distDir = resolve(root, process.env.HUNDRED_DAYS_BUILD_DIR || 'dist');
if (distDir !== join(root, 'dist') && existsSync(distDir)) throw new Error('Custom site build directory must be new; existing files are preserved.');

const SITE = {
  origin: 'https://hundred-days.pages.dev',
  canonicalBase: (process.env.HD_CANONICAL_BASE || 'https://rairakku.com/100days').replace(/\/+$/, ''),
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
  const status = effectiveStatus(meta, dir);
  // screenshot / demo はアプリフォルダ内の相対ファイル名だけを受け付ける（パス指定の混入を防ぐ）
  const shot = meta.screenshot ? basename(String(meta.screenshot)) : '';
  const demo = meta.demo ? basename(String(meta.demo)) : '';
  return {
    dir,
    meta,
    day: Number(meta.day ?? dir.slice(4, 7)),
    title: meta.title || dir,
    description: meta.description || '',
    tags: toStringArray(meta.tags),
    minutes: Number(meta.actualMinutes) > 0 ? Number(meta.actualMinutes) : 0,
    published: status === 'published',
    // draft は「まだ作りかけ」＝一覧にも統計にも出さない（公開前のDayが漏れるのを防ぐ）。
    // アプリ本体を公開しないだけの「制作記録のみ」のDayは draft 以外の status を使う
    draft: status === 'draft',
    publishCheckOnly: isPublishCheckOverride(meta, dir),
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
const publishCheckOnly = allApps.filter((a) => a.publishCheckOnly);
const unmatchedChecks = unmatchedPublishCheckTargets(dirs);
if (unmatchedChecks.length) {
  console.warn(`⚠ ${PUBLISH_CHECK_ENV} の ${unmatchedChecks.join(', ')} は、どのDayのフォルダも指していません（番号の打ち間違い？）`);
}

// ---------------------------------------------------------------- dist/ の組み立て

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

// リポジトリ直下の static/ の中身（OG画像など）を dist/ 直下へ。無くてもビルドは通す
if (existsSync(staticDir)) cpSync(staticDir, distDir, { recursive: true });

// 配信から外すフォルダの規則は scripts/lib/dist-files.mjs にある（公開の契約も同じ規則で画像の配信を確かめる）
for (const app of apps) {
  if (app.published) {
    const from = join(appsDir, app.dir);
    const filter = (source) => isServedPath(app.dir, relative(from, source).split(sep).join('/'));
    cpSync(from, join(distDir, app.dir), { recursive: true, filter });
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
                   （day-010-wikipedia-live/lib/coords.js が通すホストと対応させること） */
const WIKIMEDIA_CONNECT = [
  'wikipedia', 'wikibooks', 'wikinews', 'wikiquote', 'wikisource', 'wikiversity',
  'wikivoyage', 'wiktionary', 'wikimedia', 'wikidata', 'wikifunctions', 'mediawiki'
].map((project) => `https://*.${project}.org`).join(' ');

/* 外部へ接続するのはここに挙げたDayだけ。ほかのアプリは同一オリジンに閉じている。
   ⚠️ 新しいDayで外部のAPIを叩くときは、ここに足さないとブラウザ側で接続が止まる（黙って失敗する）。 */
const CONNECT_BY_APP = {
  'day-060-prize-explained': 'https://api.nobelprize.org',
  /* day-042 は気象庁の台風JSON（一覧・確率・実況・予報の幾何）を直接読む。確率は全国ぶんが1本で届くので、
     現在地や選んだ市区町村は端末の外に出ない。海岸線は同梱 */
  'day-042-typhoon-coming': 'https://www.jma.go.jp',
  /* day-041 は事故データを同梱していて、外へ出るのは地図タイルと住所検索だけ（どちらも国土地理院）。
     現在地の座標は端末の中で事故データと突き合わせるので、外へは出ない */
  'day-041-who-got-hurt': 'https://cyberjapandata.gsi.go.jp https://msearch.gsi.go.jp',
  /* day-040 は避難場所タイル・地図タイル・住所検索の3つとも国土地理院。他へは出ない */
  'day-040-shelter-by-hazard': 'https://cyberjapandata.gsi.go.jp https://msearch.gsi.go.jp',
  'day-039-dig-below': 'https://paleobiodb.org https://tiles.openfreemap.org',
  'day-034-tide-now': 'https://www.data.jma.go.jp',
  'day-010-wikipedia-live': WIKIMEDIA_CONNECT,
  'day-013-gov-answers': 'https://kokkai.ndl.go.jp',
  'day-014-hottest-now': 'https://www.jma.go.jp',
  // day-016 は速度測定そのものが目的なので、測定用のエンドポイントにだけ繋ぐ
  'day-016-line-suspect': 'https://speed.cloudflare.com',
  // day-021 は局データのAPI（ミラー3つ）とクリック報告に繋ぐ
  'day-021-nearby-radio':
    'https://de1.api.radio-browser.info https://nl1.api.radio-browser.info https://at1.api.radio-browser.info',
  /* day-025 が外へ出るのは地図タイルだけ。Overpass と Nominatim は
     functions/api/day-025/ の中継を通すので 'self' で足りる（利用方針がUser-Agentと
     キャッシュを求めており、ブラウザからは満たせないため） */
  'day-025-nearby-parking': 'https://tiles.openfreemap.org',
  // day-029 はWi-Fiデータを同梱し、地名検索だけ中継する。ブラウザが外へ出るのは地図タイルだけ
  'day-029-nearby-wifi': 'https://tiles.openfreemap.org',
  /* day-052 は温泉・銭湯の統計とお風呂の位置（OSM）を同梱している。ブラウザが外へ出るのは地図タイルだけ。
     現在地は端末の中で距離を測るのに使うだけで、外へは送らない */
  'day-052-onsen-map': 'https://tiles.openfreemap.org',
  /* day-030 はカメラの位置データを同梱し、Windy だけ functions/api/day-030/ の中継を通す。
     映像・画像は提供元とブラウザの直接通信（img/media/frame 側で許す）なので connect-src はタイルだけ */
  'day-030-world-window': 'https://tiles.openfreemap.org',
  /* day-031 は形を同梱していて、正解を出したあとに Wikipedia の要約だけを取りに行く。
     ここに足さないと画面には何も出ないまま（try/catch に吸われる）本番だけが黙って止まる */
  'day-031-shape-where': 'https://ja.wikipedia.org',
  /* day-032 は市区町村の代表点を同梱していて、外へ出るのは天気1本だけ。
     地名から座標を引く外部サービスは使わない（解禁されているAPIは1個なので天気に使い切る）。
     取りに行くのは current（いまの1時点）だけ。将来の値は取らない（気象業務法17条・アプリREADME参照） */
  'day-032-laundry-dry': 'https://api.open-meteo.com',
  /* day-033 は市区町村の代表点を同梱していて、外へ出るのは気象庁の地震情報一覧1本だけ。
     現在地の座標は端末の中で照合し、場所を変えても再取得しない */
  'day-033-did-it-shake': 'https://www.jma.go.jp',
  /* day-037 は条文を同梱しない（法律は改正されるので古いものを持ち越さない）。
     選ばれた条だけを e-Gov 法令API から取りに行く */
  'day-037-baito-law': 'https://laws.e-gov.go.jp',
  /* day-038 は消費者物価指数を同梱しない（毎年あとから追加・改定されるので古い数字を焼き付けない）。
     起動のたびに日本と米国の指数を1リクエストで取りに行く */
  'day-038-yen-back-then': 'https://api.worldbank.org',
  /* day-054 は外部へは出ない。3Dモデル（.glb）に埋め込まれた質感画像を、three.js の GLTFLoader が
     blob: のURLにしてから fetch で読む（Chrome は ImageBitmapLoader を使うため）。
     'self' は blob: に合わないので、足さないと本番だけ家具が真っ白になる（2026-10-01 に本番と同じCSPで確認） */
  'day-054-what-vanished': 'blob:',
  // Day76のPDF内部フォント/画像は端末内のblobから読み込む。
  'day-076-henkan-desk': 'blob:'
};

/* day-025 の MapLibre は blob: から Web Worker を起こす。
   worker-src は child-src → script-src → default-src の順に落ちるので、
   'self' のままだと地図が黙って出ない。 */
const WORKER_BY_APP = {
  'day-076-henkan-desk': "worker-src 'self'",
  'day-041-who-got-hurt': "worker-src blob:",
  'day-040-shelter-by-hazard': "worker-src blob:",
  'day-039-dig-below': "worker-src blob:",
  'day-025-nearby-parking': "worker-src blob:",
  'day-029-nearby-wifi': "worker-src blob:",
  'day-030-world-window': "worker-src blob:",
  'day-052-onsen-map': "worker-src blob:"
};

/* day-021 は局のストリーム（audio）とロゴ画像をAPI由来の任意のhttpsホストから読む。
   ホストを事前に列挙できないため、このDayだけ media / img に https: を足す（httpは許さない）。 */
const MEDIA_BY_APP = {
  'day-021-nearby-radio': ' https:',
  // day-030 は提供元のHLS配信（.m3u8）を Safari の <video> で直接再生する。ホストは事前に列挙できない
  'day-030-world-window': ' https:',
  /* day-059 は選んだ音声ファイルを blob: のURLにして非表示の <audio> で鳴らし、録画した動画も blob: で <video> に出す。
     どちらも端末の中のデータで、外へは出ない。'self' は blob: に合わないので、足さないと再生とプレビューが黙って止まる */
  'day-059-kuchi-sanmai': ' blob:'
};
const IMG_BY_APP = {
  /* day-040 の地理院タイルは MapLibre が fetch で取るので connect-src で足りるが、
     画像として読む経路（ImageBitmap が使えない環境のフォールバック）に落ちたときに
     地図だけが黙って白くなる。同じホストなので img にも足しておく */
  'day-040-shelter-by-hazard': ' https://cyberjapandata.gsi.go.jp',
  'day-041-who-got-hurt': ' https://cyberjapandata.gsi.go.jp',
  'day-039-dig-below': ' https://tiles.openfreemap.org',
  'day-021-nearby-radio': ' https:',
  // スプライト画像をタイル配信元から読む
  'day-025-nearby-parking': ' https://tiles.openfreemap.org',
  'day-029-nearby-wifi': ' https://tiles.openfreemap.org',
  // day-052 もスプライト画像をタイル配信元から読む
  'day-052-onsen-map': ' https://tiles.openfreemap.org',
  // day-030 はカメラの静止画を提供元の任意の https ホストから読む（http は混在コンテンツになるので許さない）
  'day-030-world-window': ' https:',
  /* day-031 は Wikipedia の記事写真だけを読む。summary が返す thumbnail は
     いま thumb.wikimedia.org（元画像は upload.wikimedia.org）。
     day-031-shape-where/lib/wiki.js の THUMBNAIL_HOSTS と対応させること */
  'day-031-shape-where': ' https://thumb.wikimedia.org https://upload.wikimedia.org',
  /* day-035 は貼られた記事の og:image を提供元から直接読む（中継しない＝写真を複製も保存もしない）。
     貼られるURLは利用者が決めるのでホストを事前に列挙できない。http は混在コンテンツになるので許さない */
  'day-035-front-page': ' https:'
};

/* iframe を出すのは day-030 だけ（YouTube の埋め込みプレーヤーと Windy のタイムラプスプレーヤー）。
   frame-src は default-src に落ちるので、'self' のままだと iframe が黙って空になる。
   youtube-nocookie.com はプライバシー強化モードの埋め込み用ホスト。 */
const FRAME_BY_APP = {
  'day-030-world-window': 'frame-src https://www.youtube-nocookie.com https://webcams.windy.com https://www.windy.com'
};

const appCsp = (dir) => [
  "default-src 'self'",
  // Day64 compiles its local Rust module in a same-origin Worker.
  // Permit Wasm compilation for this app without permitting JavaScript eval.
  `script-src 'self'${['day-064-breach-atlas', 'day-076-henkan-desk'].includes(dir) ? " 'wasm-unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${IMG_BY_APP[dir] || ''}`,
  `media-src 'self'${MEDIA_BY_APP[dir] || ''}`,
  `font-src 'self'${dir === 'day-076-henkan-desk' ? ' data: blob:' : ''}`,
  `connect-src 'self'${CONNECT_BY_APP[dir] ? ` ${CONNECT_BY_APP[dir]}` : ''}`,
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
  ...(WORKER_BY_APP[dir] ? [WORKER_BY_APP[dir]] : []),
  ...(FRAME_BY_APP[dir] ? [FRAME_BY_APP[dir]] : [])
].join('; ');

/* 端末の機能（マイク・カメラなど）は全ページで閉じておき、使うDayのパスだけで開け直す。
   Cloudflare Pages は同じヘッダーが2つのルールに当たると値をカンマでつなぐので、全体（/*）の値を
   `! Permissions-Policy` で外してから、そのDayの値を書く。2026-10-06 に wrangler pages dev で実測し、そのDayのパスには
   付け直した値の1本だけが付き、ほかのパスは全体の値のままであることを確かめた。
   マイクの許可はブラウザがサイト（オリジン）単位で覚えることがあるので、ほかのDayは方針で閉じたままにする */
const GLOBAL_PERMISSIONS = 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()';
const PERMISSIONS_BY_APP = {
  // day-059 は話した声に合わせて口を動かす。「マイクを開始」を押したときだけ許可を求める。位置情報は使わないので閉じる
  'day-059-kuchi-sanmai': 'geolocation=(), camera=(), microphone=(self), payment=(), usb=()'
};

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
  `  Permissions-Policy: ${GLOBAL_PERMISSIONS}`,
  ''
];

// パス末尾のアスタリスクは空文字にも当たるので、この1本でアプリの正式なURL
// （/day-010-wikipedia-live/）と配下のファイルの両方に掛かる。
// wrangler pages dev で実測して確認済み（末尾なしのパスも併記するとCSPが二重に付く）。
for (const app of apps.filter((a) => a.published)) {
  headerLines.push(`/${app.dir}/*`, `  Content-Security-Policy: ${appCsp(app.dir)}`);
  if (PERMISSIONS_BY_APP[app.dir]) headerLines.push('  ! Permissions-Policy', `  Permissions-Policy: ${PERMISSIONS_BY_APP[app.dir]}`);
  headerLines.push('');
}
headerLines.push('/*/tools/*', '  X-Robots-Tag: noindex', '');
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
   アプリ固有の文言は保ち、URLは配信先の規則へ統一する。 */
const pageBase = (app) => app.meta.mount === false ? SITE.origin : SITE.canonicalBase;
function injectAppMeta(app) {
  const file = join(distDir, app.dir, 'index.html');
  if (!existsSync(file)) return false;
  let html = readFileSync(file, 'utf8');
  if (!html.includes('</head>')) return false;

  const pageUrl = `${pageBase(app)}/${app.dir}/`;
  const image = app.hasShot ? `${pageBase(app)}/${app.dir}/${app.shot}` : `${pageBase(app)}/assets/og.png`;
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

  // URLだけを統一する。各Day固有のタイトル・説明・画像ファイル名は保つ。
  html = html.replace(/<(?:link|meta)\b[^>]*>/gi, (tag) => {
    if (!/\b(?:rel\s*=\s*["']canonical["']|(?:property|name)\s*=\s*["'](?:og:(?:url|image)|twitter:image)["'])/i.test(tag)) return tag;
    return tag.replace(/\b(href|content)\s*=\s*(['"])(.*?)\2/gi, (attr, key, quote, value) => {
      const url = /canonical|og:url/i.test(tag) ? pageUrl : value.replace(SITE.origin, pageBase(app));
      return `${key}=${quote}${esc(url)}${quote}`;
    });
  });
  html = html.replace(/(<script\b[^>]*type=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi,
    (_, start, json, end) => start + json.replaceAll(SITE.origin, pageBase(app)) + end);
  const add = wanted.filter(([probe]) => !html.includes(probe)).map(([, tag]) => tag);

  // 置換を文字列で渡すと、題名や説明の $& や $$ が特別な意味になる（$& は </head> に化ける）。関数で渡して、そのまま入れる
  writeFileSync(file, html.replace('</head>', () => `${add.map((tag) => `  ${tag}`).join('\n')}\n</head>`));
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

const { fold, tagKey, splitTitle, TAG_ALIASES, tagCatalog, quickTags, buildMatrix, phaseOf, RULES, PHASES } = await import('./lib/home-model.mjs');
const sortedApps = [...apps].sort((a, b) => b.day - a.day);
const latest = sortedApps.find((app) => app.published || app.externalUrl);
const catalog = tagCatalog(apps);
const tagLabels = new Map(catalog.map((tag) => [tag.key, tag.label]));
const titleHtml = (title, prefix) => {
  const { main, sub } = splitTitle(title);
  return esc(main) + (title.includes(' — ') ? `${prefix === 'preview' ? '<span class="preview__separator"> — </span>' : ' — '}<span class="${prefix}__sub">${esc(sub)}</span>` : '');
};
const broadTags = new Set(catalog.filter((tag) => tag.count > apps.length * 0.4).map((tag) => tag.key));
const openUrl = (app) => app.published ? (app.meta.mount === false ? `${SITE.origin}/${app.dir}/` : `./${app.dir}/`) : app.externalUrl || '';
const shotUrl = (app) => app.hasShot ? `./${app.dir}/${app.shot}` : '';

const cardHtml = (app) => {
  const num = esc(pad3(app.day));
  // アプリ本体を持たず、外部の紹介ページで公開しているDay（Chrome拡張など）
  const external = !app.published && Boolean(app.externalUrl);
  const thumbInner =
    `<span class="thumb__label">DAY</span><span class="thumb__num">${num}</span><span class="thumb__missing">スクリーンショットなし</span>`;
  const thumb = app.hasShot
    ? `<img class="thumb__img" src="./${esc(app.dir)}/${esc(app.shot)}" alt="${esc(app.title)}の画面" loading="lazy" decoding="async" width="1200" height="750">`
    : thumbInner;
  // 再生ボタンはサムネの外に置く（サムネ自体がアプリへのリンクなので、入れ子のクリック領域を作らない）
  const playBtn = app.hasDemo
    ? `<button class="thumb__play" type="button" data-demo="./${esc(app.dir)}/${esc(app.demo)}"` +
      ` data-title="${esc(app.title)}" data-day="Day ${num}"` +
      ` data-poster="${app.hasShot ? `./${esc(app.dir)}/${esc(app.shot)}` : ''}">デモ<span class="sr-only">（Day ${num}・${esc(app.title)}）を再生</span></button>`
    : '';
  const inner = app.published
    ? `<a class="thumb__link" href="${esc(openUrl(app))}" tabindex="-1" aria-hidden="true">${thumb}</a>`
    : external
      ? `<a class="thumb__link" href="${esc(app.externalUrl)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${thumb}</a>`
      : thumb;
  const thumbBox = `<div class="thumb">${inner}${playBtn}</div>`;

  const badge = app.published
    ? ''
    : external
      ? '<span class="badge">外部で公開</span>'
      : '<span class="badge">制作記録のみ</span>';

  const tags = [...new Set(app.tags.map(tagKey))]
    .sort((a, b) => Number(broadTags.has(a)) - Number(broadTags.has(b)))
    .slice(0, CARD_TAG_LIMIT)
    .map((key) => `<li class="tag">#${esc(tagLabels.get(key))}</li>`)
    .join('');

  const durationRow = app.minutes
    ? `<p class="card__duration"><span class="card__duration-label">所要時間</span><span class="card__duration-value">${esc(duration(app.minutes))}</span></p>`
    : '';

  const primary = app.published
    ? `<a class="btn btn--primary" href="${esc(openUrl(app))}">アプリを開く</a>`
    : external
      ? `<a class="btn btn--primary" href="${esc(app.externalUrl)}" target="_blank" rel="noopener">紹介ページを開く<span class="sr-only">（Day ${num}・新しいタブで開く）</span></a>`
      : '<button class="btn btn--disabled" type="button" disabled>アプリ本体なし</button>';
  const xLink = app.xPostUrl
    ? `<a class="post-link" href="${esc(app.xPostUrl)}" target="_blank" rel="noopener">X投稿<span class="sr-only">（Day ${num}・新しいタブで開く）</span></a>`
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

  return `<article class="card" id="day-${num}" data-tags="${esc(JSON.stringify(app.tags))}" data-search="${esc(fold([app.title, app.description, ...app.tags, app.day, num, `day${app.day}`, `day${pad3(app.day)}`].join(' ')))}" data-day="${num}" data-title="${esc(app.title)}">
  <div class="card__head"><span class="card__day">DAY ${num}</span>${app === latest ? '<span class="flag">LATEST</span>' : ''}${badge}</div>
  ${thumbBox}
    <h3 class="card__title">${titleHtml(app.title, 'card')}</h3>
    ${app.description ? `<p class="card__desc">${esc(app.description)}</p>` : ''}
    ${tags ? `<ul class="card__tags">${tags}</ul>` : ''}
    ${durationRow}
    <div class="card__foot">
      <div class="card__actions">${primary}${xLink}</div>
      ${memo}
    </div>
</article>`;
};


const cards = sortedApps.map(cardHtml).join('\n');
const chipHtml = (tag) => `<button class="chip" type="button" data-tag="${esc(tag.label)}" data-key="${esc(tag.key)}" aria-pressed="false">${esc(tag.label)}</button>`;
const chips = quickTags(apps).map(chipHtml).join('');
const matrix = buildMatrix(apps).map(({ day, app, state }) => {
  const num = pad3(day);
  if (state !== 'released') return `<li class="cell-slot cell-slot--${esc(state)}" aria-hidden="true" style="--i:${esc(day - 1)}"></li>`;
  return `<li style="--i:${esc(day - 1)}"><a class="cell${app === latest ? ' cell--latest' : ''}" href="#day-${esc(num)}" data-day="${esc(num)}" data-title="${esc(app.title)}" data-shot="${esc(shotUrl(app))}" data-open="${esc(openUrl(app))}"${!app.published ? ' data-external="true"' : ''} aria-label="Day ${esc(num)}・${esc(app.title)}${app === latest ? '・最新' : ''}" tabindex="${app === latest ? '0' : '-1'}"><span>${esc(num)}</span></a></li>`;
}).join('');
const gridHeading = apps.length && apps.every((a) => a.published) ? '公開したアプリ' : '作ったアプリ';
const currentPhase = phaseOf(Math.max(0, ...apps.map((app) => app.day)));
const css = readFileSync(join(root, 'scripts/site/home.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s*\n\s*/g, ' ');
const js = readFileSync(join(root, 'scripts/site/home.js'), 'utf8')
  .replace('/* HOME_MODEL */', () => `const TAG_ALIASES = ${JSON.stringify(TAG_ALIASES)};\n${fold.toString()}\n${tagKey.toString()}\n${splitTitle.toString()}`);

// 計測タグ（この一覧ページ限定。SITE.analyticsId が空なら1行も出力しない）
// Do Not Track・Global Privacy Control のブラウザでは、計測を読み込まず、何も送らない。
// 一覧は rairakku.com/100days/ の下でも表示され、そのドメインのプライバシーポリシーが同じ約束をしているため（home.js は typeof gtag で見る）。
const analyticsTag = SITE.analyticsId
  ? `<script>
(function () {
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', '${esc(SITE.analyticsId)}');
  var tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=${esc(SITE.analyticsId)}';
  document.head.appendChild(tag);
})();
</script>`
  : '';
const searchConsoleTag = SITE.searchConsoleToken
  ? `<meta name="google-site-verification" content="${esc(SITE.searchConsoleToken)}">`
  : '';
// どちらも未設定なら head に空行すら足さない
const headExtras = [searchConsoleTag, analyticsTag].filter(Boolean).join('\n');

const favicon = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="7" fill="#0f0e0d"/>${Array.from({ length: 16 }, (_, i) => `<rect x="${5 + (i % 4) * 8}" y="${5 + Math.floor(i / 4) * 8}" width="6" height="6" rx="1" fill="${i === 15 ? '#ff5a36' : '#f3ede3'}"/>`).join('')}</svg>`);

// ---------------------------------------------------------------- ページ

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preload" href="./assets/fonts/BigShouldersDisplay-latin-wght.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="./assets/fonts/GeistMono-latin-wght.woff2" as="font" type="font/woff2" crossorigin>
<title>${esc(SITE.title)}</title>
<meta name="description" content="${esc(SITE.description)}">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0f0e0d">
<link rel="canonical" href="${esc(SITE.canonicalBase)}/">
<link rel="icon" href="${esc(favicon)}">
<meta property="og:title" content="${esc(SITE.title)}">
<meta property="og:description" content="${esc(SITE.tagline)}">
<meta property="og:image" content="${esc(SITE.canonicalBase)}/assets/og.png">
<meta property="og:url" content="${esc(SITE.canonicalBase)}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE.title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(SITE.title)}">
<meta name="twitter:description" content="${esc(SITE.tagline)}">
<meta name="twitter:image" content="${esc(SITE.canonicalBase)}/assets/og.png">${headExtras ? '\n' + headExtras : ''}
<style>@@CSS@@</style>
<noscript><style>.tools{display:none}</style></noscript>
</head>
<body>
<a class="skip" href="#main">本文へ移動</a>
<header class="topbar wrap">
  <a class="brand" href="#main">100日チャレンジ</a>
  <nav class="links" aria-label="プロフィール">
    <a class="pill" href="${esc(SITE.xUrl)}" target="_blank" rel="noopener" aria-label="Xでフォロー ${esc(SITE.xHandle)}">Xでフォロー</a>
    <a class="pill" href="${esc(SITE.repoUrl)}" target="_blank" rel="noopener">GitHub</a>
  </nav>
</header>
<main class="wrap" id="main" tabindex="-1">
  <section class="hero" aria-labelledby="hero-title">
    <div class="hero__copy">
      <h1 class="hero__title" id="hero-title"><span>100 DAYS</span> <span>/ 100 APPS</span></h1>
      <p class="hero__sub">${esc(SITE.tagline)}</p>
      <p class="hero__note">${esc(SITE.description.split('。').slice(1).join('。'))}</p>
      <div class="progress">
        <p class="progress__count"><span class="progress__now">${esc(releasedCount)}</span><span class="progress__goal"> / ${esc(SITE.goal)}</span><span class="progress__label">公開済み</span></p>
        <div class="progress__track" role="progressbar" aria-valuemin="0" aria-valuemax="${esc(SITE.goal)}" aria-valuenow="${esc(Math.min(SITE.goal, releasedCount))}" aria-label="100日チャレンジの進捗"><div class="progress__fill" style="width:${esc(progress)}%"></div></div>
      </div>
      <div class="hero__actions">
        ${latest ? `<a class="cta cta--primary" href="${esc(openUrl(latest))}" data-day="${esc(pad3(latest.day))}" data-title="${esc(latest.title)}"${!latest.published ? ' target="_blank" rel="noopener"' : ''}>最新のアプリを開く <span aria-hidden="true">→</span></a>` : ''}
        <a class="cta" href="#archive">一覧を見る <span aria-hidden="true">↓</span></a>
      </div>
      <a class="follow" href="${esc(SITE.xUrl)}" target="_blank" rel="noopener">Xでフォロー → <span>${esc(SITE.xHandle)}</span></a>
    </div>
    <aside class="console" aria-labelledby="map-title">
      <div class="console__head"><h2 id="map-title">DAY MAP</h2></div>
      <p class="console__hint" id="map-hint">明るいほど新しい日。触れると、その日のアプリが見られます</p>
      <ol class="matrix" aria-describedby="map-hint">${matrix}</ol>
      <figure class="preview">
        <div class="preview__frame">
        ${latest?.hasShot ? `<img class="preview__img" src="${esc(shotUrl(latest))}" alt="${esc(latest.title)}の画面" width="1200" height="750" loading="lazy" decoding="async">` : '<img class="preview__img" alt="" hidden width="1200" height="750">'}
        <span class="preview__num" aria-hidden="true"${latest?.hasShot ? ' hidden' : ''}>${esc(latest ? pad3(latest.day) : '')}</span>
        </div>
        <figcaption class="preview__caption"><span class="preview__label">${latest ? `LATEST · DAY ${esc(pad3(latest.day))}` : 'DAY MAP'}</span><span class="preview__title">${titleHtml(latest?.title || '', 'preview')}</span>${latest ? `<a class="go" href="${esc(openUrl(latest))}" data-day="${esc(pad3(latest.day))}" data-title="${esc(latest.title)}"${!latest.published ? ' target="_blank" rel="noopener"' : ''}><span>${latest.published ? 'アプリを開く' : '紹介ページを開く'}</span> <span aria-hidden="true">→</span></a>` : ''}</figcaption>
      </figure>
    </aside>
  </section>

  <section class="stats" aria-label="記録の集計">
    <div class="stat"><span class="stat__label">制作時間（記録分）</span><span class="stat__value">${recordedCount ? statValue(totalMinutes) : '—'}</span><span class="stat__note">制作時間を記録したDay：${esc(recordedCount)}/${esc(apps.length)}</span></div>
    <div class="stat"><span class="stat__label">制作日数</span><span class="stat__value"><span class="stat__num">${esc(workDayCount)}</span><span class="stat__unit">日</span></span><span class="stat__note">開始日・完了日の記録がある日の数</span></div>
    <div class="stat"><span class="stat__label">デモ動画</span><span class="stat__value"><span class="stat__num">${esc(apps.filter((app) => app.hasDemo).length)}</span><span class="stat__unit">本</span></span><span class="stat__note">実際に操作しているところの録画</span></div>
  </section>

  <section class="apps" id="archive" aria-labelledby="apps-title">
    <div class="apps__head"><h2 id="apps-title">${esc(gridHeading)}</h2><span class="apps__count" id="result-count">${esc(apps.length)}件</span></div>
    <div class="tools">
      <div class="tools__row">
        <label class="search" for="search"><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><span class="sr-only">アプリを探す（題名・タグ・Day番号）</span><input id="search" type="search" placeholder="アプリを探す（題名・タグ・Day番号）" autocomplete="off" aria-controls="app-grid"></label>
        <label class="sort"><span class="sr-only">並べ替え</span><select id="sort" aria-controls="app-grid"><option value="new">新しい順</option><option value="old">古い順</option></select></label>
        <button class="tags-open" type="button" id="tags-open">タグ一覧（${esc(catalog.length)}）</button>
      </div>
      <div class="chips" role="group" aria-label="よく使うタグ"><button class="chip chip--all" type="button" data-tag="*" data-key="*" aria-pressed="true">すべて</button>${chips}</div>
    </div>
    <p class="sr-only" id="filter-status" role="status" aria-live="polite"></p>
    <div class="empty" id="empty" hidden><p>条件に合うアプリがありません。</p><p id="empty-reason"></p><button class="clear" id="clear" type="button">条件をクリア</button></div>
    <div class="grid" id="app-grid">${cards}</div>
  </section>

  <section class="about" aria-labelledby="about-title">
    <div class="about__head"><h2 id="about-title">作り方のルール</h2><p>大学生。毎日1個Webアプリを作って公開しています。</p><p class="about__link"><a href="${esc(SITE.repoUrl)}#readme" target="_blank" rel="noopener">GitHub README でルールと記録を見る →</a></p><p class="about__x"><a class="follow" href="${esc(SITE.xUrl)}" target="_blank" rel="noopener">Xでフォロー → <span>${esc(SITE.xHandle)}</span></a></p></div>
    <ol class="rules">${RULES.map((rule) => `<li>${esc(rule)}</li>`).join('')}</ol>
    <p class="phases__lead">Dayが進むごとに作れるものの幅を解禁していきます。</p>
    <ol class="phases">${PHASES.map((phase, i) => `<li${i === currentPhase ? ' class="phase--current"' : ''}><span class="phase__range">Day ${esc(phase.from)}–${esc(phase.to)}</span><span class="phase__body">${esc(phase.text)}${i === currentPhase ? ' <span class="phase__now">いまここ</span>' : ''}</span></li>`).join('')}</ol>
  </section>
  <footer class="footer">
    <span class="footer__brand">100 DAYS / 100 APPS</span>
    <span class="footer__links">
      <a href="${esc(SITE.repoUrl)}" target="_blank" rel="noopener">GitHub</a>
      <a href="${esc(SITE.xUrl)}" target="_blank" rel="noopener">X ${esc(SITE.xHandle)}</a>
      <a href="./privacy">プライバシー</a>
    </span>
    ${SITE.analyticsId
      ? '<p class="footer__note">このトップページだけ、Googleアナリティクスでアクセス数を見ています（閲覧者を特定する設定は使っていません）。各アプリのページにGoogleアナリティクスは入れていないので、アプリ内での操作がこの計測に残ることはありません。ただし外部サービスと通信するアプリはあり、何をどこへ送るかは<a href="./privacy">プライバシーポリシー</a>に1件ずつ書いています。</p>'
      : ''}
  </footer>

</main>

<button class="to-tools" id="to-tools" type="button" hidden>↑ 検索・絞り込み</button>
<dialog class="tags-dialog" id="tags-dialog" aria-labelledby="tags-title">
  <div class="dialog__head"><h2 id="tags-title">タグ一覧</h2><button type="button" id="tags-close" class="dialog__close" aria-label="タグ一覧を閉じる">×</button></div>
  <div class="tags-dialog__list" id="all-tags"></div>
</dialog>
<dialog class="player" id="player" aria-labelledby="player-title">
  <div class="player__head">
    <h2 class="player__title" id="player-title"><span class="player__day" id="player-day"></span><span id="player-name"></span></h2>
    <button class="player__close" type="button" id="player-close" aria-label="閉じる">✕</button>
  </div>
  <video class="player__video" id="player-video" controls playsinline preload="none"></video>
  <p class="player__note">実際に操作しているところを録画したデモです</p>
</dialog>

<script>@@JS@@</script>
</body>
</html>
`.replace(/^[ \t]+/gm, '').replace(/>\n\s*</g, '><').replace('@@CSS@@', () => css).replace('@@JS@@', () => js);

writeFileSync(join(distDir, 'index.html'), html);
console.log(
  `build: ${apps.length} day(s) / 公開 ${releasedCount}（うち外部 ${releasedCount - publishedCount}） / スクショ ${apps.filter((a) => a.hasShot).length}` +
    ` / 動画 ${apps.filter((a) => a.hasDemo).length} / OGP付与 ${metaInjected} -> ${process.env.HUNDRED_DAYS_BUILD_DIR ? "custom output/" : "dist/"}` +
    // 除外したものは必ず名前を出す（黙って落とすと「全部載っている」と誤解する）
    (drafts.length ? `\n  draft のため一覧から除外: ${drafts.map((d) => d.dir).join(', ')}` : '') +
    (publishCheckOnly.length ? `\n  （検査用）公開済みとして扱う：${publishCheckOnly.map((d) => d.dir).join(', ')}` : '')
);

// XML escaping shares the HTML escape rules (including & and quotes).
const sitemapApps = apps.filter(app => app.published && !app.externalUrl && app.meta.mount !== false);
const entries = [`<url><loc>${esc(SITE.canonicalBase)}/</loc></url>`, ...sitemapApps.map(app => {
  const date = app.finishedAt || app.startedAt;
  return `<url><loc>${esc(SITE.canonicalBase)}/${esc(app.dir)}/</loc>${date ? `<lastmod>${date}</lastmod>` : ''}</url>`;
})];
writeFileSync(join(distDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join('\n')}</urlset>\n`);
writeFileSync(join(distDir, '404.html'), `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>ページが見つかりません</title><style>body{font-family:system-ui,sans-serif;max-width:40em;margin:15vh auto;padding:1.5em;line-height:1.8}a{color:#6440ac}</style><h1>404 — ページが見つかりません</h1><p>URLをご確認ください。</p><a href="${esc(SITE.canonicalBase)}/">100日チャレンジの一覧へ</a></html>`);
const mountViolations = findRootRelativeRefs(distDir);
if (mountViolations.length) {
  console.error(mountViolations.map(ref => `${ref.file}:${ref.line}: ${ref.value}`).join('\n'));
  process.exitCode = 1;
}
