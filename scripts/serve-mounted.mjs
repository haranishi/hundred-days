import { createServer } from 'node:http';
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function optionsFromArgs(args = process.argv.slice(2)) {
  const value = (key, fallback) => {
    const index = args.indexOf(key);
    if (index < 0) return fallback;
    if (args[index + 1] === undefined) throw new Error(`${key} needs a value`);
    return args[index + 1];
  };
  const prefix = value('--prefix', '/100days').replace(/\/+$/, '');
  const port = Number(value('--port', '4890'));
  if (prefix && !/^\/[\w/-]+$/.test(prefix)) throw new Error('Invalid prefix');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  return { prefix, port };
}
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.wasm': 'application/wasm', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.glb': 'model/gltf-binary'
};
export function createMountedServer({ distDir = fileURLToPath(new URL('../dist', import.meta.url)), prefix = '/100days' } = {}) {
  const root = realpathSync(distDir);
  function safeFile(path) {
    if (!existsSync(path)) return false;
    const real = realpathSync(path);
    return (real === root || real.startsWith(root + sep)) && statSync(real).isFile();
  }
  return createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      if (/^\/api\/day-\d{3}\//.test(pathname)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(req.method === 'HEAD' ? undefined : '{"stub":true}');
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      const redirect = path => { res.writeHead(308, { Location: path + url.search }); res.end(); };
      if (prefix && pathname === prefix) { redirect(prefix + '/'); return; }
      let file;
      let status = 200;
      if (!prefix || pathname.startsWith(prefix + '/')) {
        const local = pathname.slice(prefix.length);
        const candidate = resolve(root, '.' + local);
        if ((candidate === root || candidate.startsWith(root + sep)) && !local.includes('\\')) {
          if (existsSync(candidate) && statSync(candidate).isDirectory()) {
            if (!pathname.endsWith('/')) { redirect(url.pathname + '/'); return; }
            if (safeFile(join(candidate, 'index.html'))) file = join(candidate, 'index.html');
          } else if (safeFile(candidate)) {
            if (local.endsWith('.html')) {
              redirect(url.pathname.endsWith('/index.html') ? url.pathname.slice(0, -10) : url.pathname.slice(0, -5));
              return;
            }
            file = candidate;
          } else if (safeFile(candidate + '.html')) file = candidate + '.html';
        }
      }
      if (!file) { file = join(root, '404.html'); status = 404; }
      if (!safeFile(file)) { res.writeHead(404); res.end('Not found'); return; }
      const size = statSync(file).size;
      const headers = { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
      let start = 0;
      let end = size - 1;
      if (req.headers.range && status === 200) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (range && (range[1] || range[2])) {
          start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
          end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
        }
        if (!range || (!range[1] && !range[2]) || start > end || start >= size || end < 0) {
          res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return;
        }
        status = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      }
      headers['Content-Length'] = size ? end - start + 1 : 0;
      res.writeHead(status, headers);
      if (req.method === 'HEAD' || size === 0) res.end();
      else createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
    } catch {
      if (!res.headersSent) res.writeHead(400);
      res.end();
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { prefix, port } = optionsFromArgs();
  const server = createMountedServer({ prefix });
  server.listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${server.address().port}${prefix}/`));
}
