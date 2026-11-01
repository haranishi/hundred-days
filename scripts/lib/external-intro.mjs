/* 外部Day（status: external）が、このサイトの中に持つ紹介ページ。仕様は .kiro/specs/external-intro-pages/。
   build.mjs から分けてあるのは、ページのHTMLを単体で試すため。依存パッケージなし。 */

const INTRO_KEYS = ['codeUrl', 'highlights', 'notice', 'poster'];
// ポスターは、そのDayのフォルダの中の画像ファイル名だけ（パスや外部のURLは受け付けない）
const POSTER_FILE = /^[\w-]+(?:\.[\w-]+)*\.(?:webp|png|jpe?g)$/i;
// 共有の文に入れる説明の長さ（Xの投稿画面に渡す文なので、長くしすぎない）
const SHARE_SENTENCE_LIMIT = 70;
const HASHTAG = '#100日チャレンジ';

const isHttps = (value) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** meta.json の intro を検証して返す。intro が無ければ null。書いたのにページが出ない、という静かな失敗を避けるため、足りなければ止める */
export function readIntro(meta, { dir, status, externalUrl }) {
  if (!meta || meta.intro === undefined) return null;
  const where = `${dir}/meta.json の intro`;
  const raw = meta.intro;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${where} はオブジェクトで書く`);
  if (status !== 'external') throw new Error(`${where}：紹介ページは status: external のDayだけが持てる（いまは ${status}）`);
  if (!externalUrl) throw new Error(`${where}：externalUrl（https）が要る。「アプリを開く」の行き先になる`);
  const unknown = Object.keys(raw).filter((key) => !INTRO_KEYS.includes(key));
  if (unknown.length) throw new Error(`${where}：知らない項目 ${unknown.join('・')}（使えるのは ${INTRO_KEYS.join('・')}）`);
  const codeUrl = raw.codeUrl ?? '';
  if (typeof codeUrl !== 'string' || (codeUrl.trim() !== '' && !isHttps(codeUrl.trim()))) throw new Error(`${where}：codeUrl は https のURLだけ`);
  if (raw.highlights !== undefined && !Array.isArray(raw.highlights)) throw new Error(`${where}：highlights は文字の配列`);
  if (raw.notice !== undefined && typeof raw.notice !== 'string') throw new Error(`${where}：notice は文字`);
  const poster = raw.poster ?? '';
  if (typeof poster !== 'string' || (poster.trim() !== '' && !POSTER_FILE.test(poster.trim()))) {
    throw new Error(`${where}：poster は、このDayのフォルダの中の画像ファイル名（webp・png・jpg）だけ`);
  }
  return {
    codeUrl: codeUrl.trim(),
    highlights: (raw.highlights ?? []).map((item) => String(item).trim()).filter(Boolean),
    notice: (raw.notice ?? '').trim(),
    poster: poster.trim(),
  };
}

const list = (items, className) => `<ul class="${className}">${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;

/** 紹介ページのHTML全体。app はビルドが読んだDayの情報、site はサイト共通の設定 */
export function renderIntroPage({ app, site }) {
  const { intro } = app;
  const num = String(app.day).padStart(3, '0');
  const pageUrl = `${site.canonicalBase}/${app.dir}/`;
  const image = app.hasShot ? `${pageUrl}${app.shot}` : `${site.canonicalBase}/assets/og.png`;
  const description = app.description || site.tagline || `${site.title} の Day ${num}`;
  const documentTitle = `${app.title}｜Day ${num} — ${site.title}`;

  const sentence = description.split('。')[0].slice(0, SHARE_SENTENCE_LIMIT);
  const shareText = `${app.title}${sentence ? `｜${sentence}` : ''} ${HASHTAG}`;
  const xHref = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(pageUrl)}`;
  const lineHref = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(pageUrl)}`;

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${pageUrl}#page`,
        url: pageUrl,
        name: `${app.title}｜Day ${num}`,
        description,
        inLanguage: 'ja',
        isPartOf: { '@type': 'WebSite', name: site.title, url: `${site.canonicalBase}/` },
        primaryImageOfPage: image,
        ...(app.finishedAt ? { datePublished: app.finishedAt } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: site.title, item: `${site.canonicalBase}/` },
          { '@type': 'ListItem', position: 2, name: `Day ${num} ${app.title}`, item: pageUrl },
        ],
      },
    ],
  };
  // 閉じタグの文字（<）を残さない。< は JSON として読むと < に戻る
  const structuredData = JSON.stringify(graph).replaceAll('<', '\\u003c');

  // 紹介文は、文ごとに行を分ける。長い一つの塊より、スマホで一息に読める
  const leadLines = description
    .split(/(?<=。)/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<span class="lead__line">${esc(line)}</span>`)
    .join('');
  // 画面に出す日付は日本語の書き方にする。機械が読む値（datetime）は、そのまま年-月-日
  const jaDate = (date) => {
    const [, y, m, d] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) ?? [];
    return y ? `${Number(y)}年${Number(m)}月${Number(d)}日` : date;
  };
  const sr = (text) => `<span class="sr-only">${text}</span>`;
  const external = (href, label, className) =>
    `<a class="${className}" href="${esc(href)}" target="_blank" rel="noopener">${label}${sr('（新しいタブで開く）')}</a>`;

  const openApp = external(app.externalUrl, 'アプリを開く<span class="btn__out" aria-hidden="true">↗</span>', 'btn btn--primary');
  const again = `<div class="actions actions--again">${openApp}</div>`;
  const shot = app.hasShot
    ? `<figure class="shot"><img src="./${esc(app.shot)}" alt="${esc(app.title)}の画面" width="1200" height="750" decoding="async"></figure>`
    : '';
  // 動画のポスターは、指定があればそれ。無ければ画面写真
  const posterFile = intro?.poster || (app.hasShot ? app.shot : '');
  const demo = app.hasDemo
    ? `<section class="block demo" aria-labelledby="h-demo"><h2 id="h-demo">デモ動画</h2>` +
      `<video controls preload="none" playsinline${posterFile ? ` poster="./${esc(posterFile)}"` : ''} width="1080" height="1080" aria-describedby="demo-note">` +
      `<source src="./${esc(app.demo)}" type="video/mp4"></video>` +
      `<p class="note" id="demo-note">アプリの画面を録画した動画です。再生するまで読み込みません。</p></section>`
    : '';
  const highlights = intro?.highlights?.length
    ? `<section class="block" aria-labelledby="h-features"><h2 id="h-features">できること</h2>${list(intro.highlights, 'features')}</section>`
    : '';
  const notice = intro?.notice
    ? `<section class="block notice" aria-labelledby="h-notice"><h2 id="h-notice">使う前に</h2><p>${esc(intro.notice)}</p></section>`
    : '';

  const memoRows = [
    app.aiHandled?.length ? `<div class="memo__row"><dt>AIに任せた</dt><dd>${list(app.aiHandled, 'memo__list')}</dd></div>` : '',
    app.humanHandled?.length ? `<div class="memo__row"><dt>自分でやった</dt><dd>${list(app.humanHandled, 'memo__list')}</dd></div>` : '',
    app.fixes?.length
      ? `<div class="memo__row"><dt>失敗と修正</dt><dd><ul class="memo__list">${app.fixes
          .map(
            (f) =>
              `<li><span class="memo__problem">${esc(f.problem)}</span>${
                f.fix ? `<span class="memo__fix"><span class="memo__arrow" aria-hidden="true">→</span><span class="memo__fix-text">${sr('修正：')}${esc(f.fix)}</span></span>` : ''
              }</li>`,
          )
          .join('')}</ul></dd></div>`
      : '',
    app.startedAt || app.finishedAt
      ? `<div class="memo__row"><dt>期間</dt><dd>${[app.startedAt, app.finishedAt]
          .filter(Boolean)
          .map((date) => `<time datetime="${esc(date)}">${esc(jaDate(date))}</time>`)
          .join(' 〜 ')}</dd></div>`
      : '',
    app.tags?.length ? `<div class="memo__row"><dt>タグ</dt><dd><ul class="tags">${app.tags.map((tag) => `<li>#${esc(tag)}</li>`).join('')}</ul></dd></div>` : '',
  ].join('');
  const memo = memoRows ? `<section class="block" aria-labelledby="h-memo"><h2 id="h-memo">制作メモ</h2><dl class="memo">${memoRows}</dl></section>` : '';

  const share =
    `<section class="block share" aria-labelledby="h-share"><h2 id="h-share">このページを共有</h2>` +
    `<ul class="share__list">` +
    `<li>${external(xHref, 'Xで投稿', 'btn btn--small')}</li>` +
    `<li>${external(lineHref, 'LINEで送る', 'btn btn--small')}</li>` +
    `<li><button class="btn btn--small" type="button" data-share="copy" hidden>リンクをコピー</button></li>` +
    `<li><button class="btn btn--small" type="button" data-share="native" hidden>ほかのアプリで共有</button></li>` +
    `</ul>` +
    `<p class="note">Instagramなどへは、コピーしたリンクを貼って渡してください。</p>` +
    `<p class="share__url"><span class="share__label">このページのURL</span><code id="share-url">${esc(pageUrl)}</code></p>` +
    `<p class="sr-only" role="status" aria-live="polite" id="share-status"></p></section>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(documentTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index,follow">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0f0e0d">
<link rel="canonical" href="${esc(pageUrl)}">${site.favicon ? `\n<link rel="icon" href="${esc(site.favicon)}">` : ''}
<meta property="og:title" content="${esc(app.title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(app.title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="preload" href="../assets/fonts/BigShouldersDisplay-latin-wght.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="./intro.css">
<script type="application/ld+json">${structuredData}</script>
</head>
<body>
<a class="skip" href="#main">本文へ移動</a>
<header class="bar wrap">
  <a class="brand" href="../">100日チャレンジ</a>
  <nav aria-label="サイト内の移動"><a class="pill" href="../#day-${esc(num)}">一覧を見る</a></nav>
</header>
<main class="wrap" id="main" tabindex="-1">
<article class="intro">
  <p class="eyebrow"><span class="eyebrow__day">DAY ${esc(num)}</span><span class="eyebrow__tag">外部サイトで公開</span></p>
  <h1 class="title">${esc(app.title)}</h1>
  <p class="lead">${leadLines}</p>
  <div class="actions">
    ${openApp}${intro?.codeUrl ? `\n    ${external(intro.codeUrl, 'コードを見る', 'btn')}` : ''}
  </div>
  ${shot}
  ${demo}
  ${highlights}
  ${notice}
  ${again}
  ${memo}
  ${share}
</article>
</main>
<footer class="foot wrap">
  <p><a href="../">100日チャレンジの一覧を見る</a></p>
  <p class="foot__links"><a href="${esc(site.xUrl)}" target="_blank" rel="noopener">Xでフォロー ${esc(site.xHandle)}</a><a href="${esc(site.repoUrl)}" target="_blank" rel="noopener">GitHub</a></p>
</footer>
<script src="./intro.js" defer></script>
</body>
</html>
`;
}
