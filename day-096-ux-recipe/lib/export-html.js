import { esc, renderPage } from './render.js';
import { PAGE_CSS } from './page-css.js';

export function buildStandaloneHtml(state) {
  // 説明は固定文にして、サイト名に含まれる記号でコメントが途切れるのを防ぐ。
  return `<!doctype html>
<!-- ボタンの飛び先とフォームは見本です。 -->
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="UXレシピ（100日チャレンジ Day96）">
<title>${esc(state.site.name)}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
${renderPage(state, { mode: 'export' })}
</body>
</html>
`;
}
