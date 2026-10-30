// 存在しないURLの案内ページ（dist/404.html）。Cloudflare Pages は 404.html があると、存在しないURLに本物の404を返す。
// 以前は、存在しないURLにも一覧ページを200で返していた（疑似404）。Xなどに貼られた古いリンクが、今も一覧に着いているため、
// 行き止まりにせず、案内のあと一覧（か、リンクの先頭が実在するDay）へ自動で移動する。検索エンジンには404のまま。
// 一覧の場所は、見えているURLで決める: /100days/ の下なら /100days/、そうでなければ /（どこでも同じ1枚で足りる）。
const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function notFoundHtml({ listUrl, days }) {
  const script = `(function () {
  var days = ${JSON.stringify([...days].sort())};
  var path = location.pathname;
  var base = path.indexOf('/100days/') === 0 ? '/100days/' : '/';
  var head = path.slice(base.length).match(/^(day-\\d{3}-[a-z0-9-]+)/);
  var to = base + (head && days.indexOf(head[1]) >= 0 ? head[1] + '/' : '');
  document.getElementById('go').href = to;
  setTimeout(function () { location.replace(to); }, 2500);
})();`;
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>ページが見つかりません</title><style>body{font-family:system-ui,sans-serif;max-width:40em;margin:15vh auto;padding:1.5em;line-height:1.8}a{color:#6440ac}</style><h1>404 — ページが見つかりません</h1><p>URLが古いか、途中で切れているようです。まもなく、100日チャレンジの一覧へ移動します。</p><p><a id="go" href="${esc(listUrl)}">100日チャレンジの一覧へ</a></p><script>${script}</script></html>`;
}
