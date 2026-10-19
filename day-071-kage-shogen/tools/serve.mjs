import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(new URL('../', import.meta.url));
const prefix = '/day-071-kage-shogen/';
const publicFiles = new Map([
  ['index.html', 'text/html; charset=utf-8'],
  ['app.css', 'text/css; charset=utf-8'],
  ['app.js', 'text/javascript; charset=utf-8'],
  ['lib/config.js', 'text/javascript; charset=utf-8'],
  ['lib/geometry.js', 'text/javascript; charset=utf-8'],
  ['lib/shapes.js', 'text/javascript; charset=utf-8'],
  ['lib/score.js', 'text/javascript; charset=utf-8'],
  ['lib/cases.js', 'text/javascript; charset=utf-8'],
  ['lib/deduction.js', 'text/javascript; charset=utf-8'],
  ['lib/diagnose.js', 'text/javascript; charset=utf-8'],
  ['lib/stage.js', 'text/javascript; charset=utf-8'],
  ['lib/game.js', 'text/javascript; charset=utf-8'],
  ['lib/transform.js', 'text/javascript; charset=utf-8'],
  ['lib/hit.js', 'text/javascript; charset=utf-8'],
  ['lib/view.js', 'text/javascript; charset=utf-8'],
  ['lib/text.js', 'text/javascript; charset=utf-8'],
  ['shared/share.js', 'text/javascript; charset=utf-8'],
  ['shared/share.css', 'text/css; charset=utf-8'],
  ['og.png', 'image/png'],
  ['favicon.svg', 'image/svg+xml'],
]);
const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};

export async function handleRequest(request, response) {
  const send = (status, body = '', headers = {}) => {
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
    response.writeHead(status, {
      ...securityHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': bytes.length,
      ...headers,
    });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  };
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      send(405, 'Method not allowed', { Allow: 'GET, HEAD' });
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent((request.url ?? '').split('?')[0]);
      if (pathname.includes('\0')) throw new URIError('Null path');
    } catch {
      send(400, 'Bad request');
      return;
    }
    if (pathname.includes('\\') || pathname.split('/').some((part) => part === '.' || part === '..')) {
      send(404, 'Not found');
      return;
    }
    if (pathname === '/' || pathname === prefix.slice(0, -1)) {
      send(302, '', { Location: prefix });
      return;
    }
    const relative = pathname === prefix ? 'index.html'
      : pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
    if (!publicFiles.has(relative)) {
      send(404, 'Not found');
      return;
    }
    const file = resolve(root, relative);
    if (await realpath(file) !== file || !(await stat(file)).isFile()) {
      send(404, 'Not found');
      return;
    }
    send(200, await readFile(file), { 'Content-Type': publicFiles.get(relative) });
  } catch (error) {
    const missing = ['ENOENT', 'ENOTDIR', 'EISDIR', 'ELOOP'].includes(error.code);
    send(missing ? 404 : 500, missing ? 'Not found' : 'Preview unavailable');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = '127.0.0.1';
  const portText = process.env.PORT ?? '4171';
  if (!/^\d+$/.test(portText) || Number(portText) > 65535) {
    throw new RangeError('PORT must be an integer between 0 and 65535');
  }
  const server = createServer(handleRequest);
  server.on('error', (error) => {
    console.error(`Preview failed: ${error.code ?? 'UNKNOWN'}`);
    process.exitCode = 1;
  });
  server.listen(Number(portText), host, () => {
    console.log(`Kage Shogen preview at http://${host}:${server.address().port}${prefix}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(() => process.exit(0)));
  }
}
