// 公開デモと同じAPI無効状態で確認するローカル配信。
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { onRequest } from '../../functions/api/day-044/trains.js';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const appPath = '/day-044-train-here/';
const port = Number(process.env.DAY044_PORT || 8444);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/api/day-044/trains') {
      const response = onRequest();
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    if (url.pathname === '/') { res.writeHead(302, { Location: appPath }); res.end(); return; }
    let path = decodeURIComponent(url.pathname);
    if (path === '/privacy.html') path = '/static/privacy.html';
    if (!path.startsWith(appPath) && path !== '/static/privacy.html') { res.writeHead(404); res.end('Not found'); return; }
    if (path.endsWith('/')) path += 'index.html';
    // 開発時もテスト・ツール・設定をHTTPで配信しない。
    if (path !== appPath + 'data/SOURCES.md' && /\/(?:tools|tests|data|node_modules)\/|\/\.|\.md$|(?:meta|package(?:-lock)?)\.json$/.test(path)) { res.writeHead(404); res.end('Not found'); return; }
    const file = resolve(root, `.${path}`);
    if (!file.startsWith(`${root}${sep}`) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
    });
    createReadStream(file).pipe(res);
  } catch { res.writeHead(400); res.end('Bad request'); }
});
server.on('error', () => { console.error('ローカルサーバーを起動できませんでした。使用中のポートを確認してください。'); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Day 044 preview: http://127.0.0.1:${port}${appPath}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
