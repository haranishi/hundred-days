// Day66 評価用の静的サーバー。draft の間は dist に入らないので、リポジトリの根をそのまま配信する。
// 本番と同じ CSP（scripts/build.mjs の appCsp と同じ中身）を付けるので、CSP 違反はここでも出る。
// 使い方: node static-server.mjs --root=<リポジトリの根> --port=<番号>   （止めるときは Ctrl-C かプロセスの終了）
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));
if (!args.root || !args.port) { console.error('--root=<根> --port=<番号> が必要です'); process.exit(1); }
const root = resolve(String(args.root));
const port = Number(args.port);
const APP = '/day-066-hakokage-kaito/';
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "media-src 'self'", "font-src 'self'", "connect-src 'self'", "frame-ancestors 'none'", "base-uri 'none'",
  "form-action 'self'", "object-src 'none'",
].join('; ');
const types = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.png': 'image/png', '.mp4': 'video/mp4',
};

createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const file = resolve(root, `.${relative}`);
    if (!(file === root || file.startsWith(`${root}${sep}`)) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    const headers = { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' };
    if (pathname.startsWith(APP)) headers['Content-Security-Policy'] = CSP;
    response.writeHead(200, headers);
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad request');
  }
}).listen(port, '127.0.0.1', () => console.log(`static server on http://127.0.0.1:${port}${APP} (root=${root})`));
