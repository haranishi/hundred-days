/* dist/ を組み立てる：apps/day-* を丸ごとコピーし、各 meta.json から一覧ページを生成する。
   依存パッケージなし（node:fs / node:path / node:url のみ）。 */
'use strict';

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const appsDir = join(root, 'apps');
const distDir = join(root, 'dist');

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

const dirs = readdirSync(appsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && /^day-\d{3}-/.test(e.name))
  .map((e) => e.name)
  .sort();

const apps = dirs.map((dir) => {
  const metaPath = join(appsDir, dir, 'meta.json');
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
  return {
    dir,
    day: meta.day ?? Number(dir.slice(4, 7)),
    title: meta.title || dir,
    description: meta.description || '',
    published: (meta.status || 'published') === 'published'
  };
});

// 「制作記録のみ」のDayは本体をデプロイしない（meta.jsonの status を published 以外にする）
for (const app of apps) {
  if (app.published) cpSync(join(appsDir, app.dir), join(distDir, app.dir), { recursive: true });
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad3 = (n) => String(n).padStart(3, '0');

const items = apps
  .map((app) => {
    const body =
      `<span class="item__day">Day ${pad3(app.day)}</span>` +
      `<span class="item__title">${esc(app.title)}</span>` +
      (app.description ? `<span class="item__desc">${esc(app.description)}</span>` : '');
    return app.published
      ? `<a class="item" href="./${app.dir}/">${body}<span class="item__badge item__badge--live">公開中</span></a>`
      : `<div class="item">${body}<span class="item__badge">制作記録のみ</span></div>`;
  })
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>100 DAYS / 100 APPS</title>
<meta name="description" content="1日1個Webアプリを作って公開する100日チャレンジ">
<style>
  :root { --bg:#14161c; --panel:#1d212b; --text:#eef1f6; --muted:#9aa3b2; --accent:#4f9cff; --live:#4ade80; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); line-height:1.6;
         font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic","Noto Sans JP","Segoe UI",sans-serif;
         display:flex; justify-content:center; padding:48px 16px; }
  .page { width:100%; max-width:560px; }
  h1 { margin:0; font-size:1.6rem; letter-spacing:.12em; }
  .sub { margin:8px 0 0; color:var(--muted); font-size:.9rem; }
  .count { margin:24px 0 12px; color:var(--muted); font-size:.8rem; letter-spacing:.08em; }
  .list { display:flex; flex-direction:column; gap:10px; }
  .item { display:grid; grid-template-columns:auto 1fr auto; grid-template-areas:"day title badge" "day desc badge";
          gap:2px 14px; align-items:center; background:var(--panel); border-radius:12px; padding:14px 16px;
          color:inherit; text-decoration:none; }
  a.item:hover { outline:2px solid var(--accent); outline-offset:-2px; }
  .item__day { grid-area:day; font-family:ui-monospace,"SF Mono",Menlo,monospace; color:var(--muted); font-size:.85rem; }
  .item__title { grid-area:title; font-weight:600; }
  .item__desc { grid-area:desc; color:var(--muted); font-size:.8rem; }
  .item__badge { grid-area:badge; font-size:.7rem; color:var(--muted); border:1px solid #39404f; border-radius:99px; padding:3px 10px; white-space:nowrap; }
  .item__badge--live { color:var(--live); border-color:var(--live); }
  footer { margin-top:32px; font-size:.8rem; color:var(--muted); }
  footer a { color:var(--accent); }
</style>
</head>
<body>
<main class="page">
  <h1>100 DAYS / 100 APPS</h1>
  <p class="sub">1日1個Webアプリを作って公開する100日チャレンジ</p>
  <p class="count">${apps.length} / 100</p>
  <div class="list">
${items}
  </div>
  <footer><a href="https://github.com/haranishi/hundred-days">GitHub</a></footer>
</main>
</body>
</html>
`;

writeFileSync(join(distDir, 'index.html'), html);
console.log(`build: ${apps.length} app(s) -> dist/`);
