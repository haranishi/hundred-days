// 開発・撮影用の静的サーバー。このフォルダの根を `/` に配信する（tools/ と tests/ は本番に配信されない）。
// 本番と同じ Content-Security-Policy を付ける＝インラインのスクリプトや eval が書かれていたら、ここで落ちる。
// 使い方: node day-096-ux-recipe/tools/serve.mjs [--port 5196]   終了は Ctrl-C
// shared/ がまだ複製されていないときだけ、リポジトリ直下の shared/ を代わりに返す。
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const dayRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoShared = resolve(dayRoot, '..', 'shared');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
};
// 公開中の https://rairakku.com/100days/ のヘッダー（2026-11-20に実測）と同じ
export const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^([/\\])+/, '');
  const target = resolve(dayRoot, clean === '' ? 'index.html' : clean);
  if (target !== dayRoot && !target.startsWith(dayRoot + sep)) return null;
  if (existsSync(target) && statSync(target).isFile()) return target;
  if (clean.startsWith('shared/') || clean.startsWith(`shared${sep}`)) {
    const alt = resolve(repoShared, clean.replace(/^shared[/\\]/, ''));
    if (alt.startsWith(repoShared + sep) && existsSync(alt) && statSync(alt).isFile()) return alt;
  }
  return null;
}

export function startServer({ port = 0 } = {}) {
  const server = createServer((req, res) => {
    const file = resolveFile(req.url || '/');
    if (!file) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store', ...SECURITY_HEADERS });
    res.end(readFileSync(file));
  });
  return new Promise((resolveStart) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: actual } = server.address();
      resolveStart({ url: `http://127.0.0.1:${actual}`, port: actual, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--port');
  const { url } = await startServer({ port: i >= 0 ? Number(process.argv[i + 1]) : 5196 });
  console.log(`UXレシピ 開発サーバー: ${url}/  （部品ギャラリー: ${url}/tools/gallery.html）`);
}
