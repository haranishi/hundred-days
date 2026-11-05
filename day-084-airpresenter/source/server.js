'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const runFile = promisify(execFile);
const { prepareFontProfile } = require('./font-profile.js');
const { renderSvg } = require('./svg-renderer.js');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function localAddress() {
  const all = os.networkInterfaces();
  for (const name of ['en0', ...Object.keys(all)]) {
    for (const iface of all[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.')) return iface.address;
    }
  }
  return '127.0.0.1';
}

function isLoopback(ip = '') {
  return ip === '::1' || /^127\./.test(ip) || /^::ffff:127\./.test(ip);
}

function sameSecret(actual, expected) {
  const a = Buffer.from(actual || '');
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readBody(req, limit, tooLargeStatus = 400) {
  return new Promise((resolve, reject) => {
    if (req.aborted || req.destroyed) { reject(new HttpError(400, '送信が中断されました。')); return; }
    let size = 0;
    const chunks = [];
    let failed = false;
    req.on('data', chunk => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) {
        failed = true;
        reject(new HttpError(tooLargeStatus, 'ファイルまたは入力のサイズ上限を超えています。'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks)); });
    req.on('aborted', () => reject(new HttpError(400, '送信が中断されました。')));
    req.on('error', reject);
  });
}

async function jsonBody(req) {
  try {
    const value = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, '入力はJSONオブジェクトで送信してください。');
  }
}

async function createApp(options = {}) {
  const dataBase = options.dataDir || process.env.AIRPRESENTER_DATA_DIR ||
    (existsSync(path.join(__dirname, '.runtime')) ? path.join(__dirname, '.runtime') : os.tmpdir());
  await fs.mkdir(dataBase, { recursive: true });
  const dataRoot = await fs.mkdtemp(path.join(dataBase, 'airpresenter-'));
  const room = crypto.randomBytes(5).toString('hex').toUpperCase();
  const hostToken = crypto.randomBytes(32).toString('base64url');
  const remoteToken = crypto.randomBytes(32).toString('base64url');
  const lanIp = options.localIp || localAddress();
  const maxUpload = options.maxUploadBytes || 25 * 1024 * 1024;
  const maxPages = options.maxPages || 100;
  const conversionTimeout = options.conversionTimeoutMs || 90_000;
  const execute = options.runFile || runFile;
  const clients = new Map();
  const jobs = new Set();
  let activeDeck = null;
  let candidate = null;
  let uploading = false;
  let closed = false;
  let laserOwner = null;
  let laserTimer = null;
  let state = {
    revision: 0, current: 0, total: 5, slides: [], notes: Array(5).fill(''),
    isBlackout: false, presentation: false,
    laser: { active: false, x: 50, y: 50 },
    timer: { elapsedMs: 0, startedAt: null }, import: null
  };

  function snapshot() {
    const peers = { host: 0, remote: 0 };
    for (const client of clients.values()) peers[client.role]++;
    return { ...state, serverNow: Date.now(), peers };
  }

  function publish() {
    if (closed) return;
    state.revision++;
    const msg = `data: ${JSON.stringify({ type: 'SNAPSHOT', state: snapshot() })}\n\n`;
    for (const client of clients.values()) {
      if (client.res.writableLength > 512 * 1024) client.res.destroy();
      else client.res.write(msg);
    }
  }

  function updateImport(id, patch) {
    if (closed || state.import?.id !== id) return;
    state.import = { ...state.import, ...patch, updatedAt: Date.now() };
    publish();
  }

  function previewDescriptor() {
    return candidate ? { id: candidate.id, total: candidate.files.length,
      slides: candidate.files.map((_, page) => `/api/preview/${candidate.id}/${page}`) } : null;
  }

  function importFailure(id, error) {
    updateImport(id, { status: 'failed', error: error instanceof HttpError ? error.message :
      '処理に失敗しました。PCの接続と変換ツールを確認してください。' });
  }

  function stopLaser() {
    clearTimeout(laserTimer);
    laserTimer = null;
    laserOwner = null;
    if (!state.laser.active) return false;
    state.laser = { ...state.laser, active: false };
    return true;
  }

  function remoteUrl() {
    const port = server.address()?.port || options.port || 3084;
    const url = new URL(`http://${lanIp}:${port}/?mode=remote`);
    url.hash = new URLSearchParams({ room, token: remoteToken }).toString();
    return url.href;
  }

  async function removeDeck(deck) {
    if (deck) await fs.rm(deck.dir, { recursive: true, force: true });
  }

  async function acceptDeck(deck) {
    const previous = activeDeck;
    activeDeck = deck;
    stopLaser();
    state = { ...state, current: 0, total: deck.files.length,
      slides: deck.files.map((_, page) => `/api/slide/${deck.id}/${page}`),
      notes: Array(deck.files.length).fill(''), isBlackout: false };
    publish();
    await removeDeck(previous);
  }

  function validateRequest(req) {
    let url;
    try { url = new URL(req.url, `http://${req.headers.host}`); }
    catch { throw new HttpError(400, 'URLが不正です。'); }
    const allowed = new Set(['localhost', '127.0.0.1', '[::1]', lanIp]);
    if (!allowed.has(url.hostname) || Number(url.port || 80) !== server.address()?.port) {
      throw new HttpError(403, 'このホスト名では接続できません。');
    }
    const expectedOrigin = `http://${req.headers.host}`;
    if (req.headers.origin && req.headers.origin !== expectedOrigin) {
      throw new HttpError(403, '別サイトからの操作は許可されていません。');
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, '別サイトからの操作は許可されていません。');
    return url;
  }

  function authenticate(req, hostOnly = false) {
    if (!sameSecret(req.headers['x-airpresenter-room'], room)) throw new HttpError(401, 'QRコードを読み直して接続してください。');
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
    let role;
    if (sameSecret(bearer, hostToken)) role = 'host';
    else if (sameSecret(bearer, remoteToken)) role = 'remote';
    else throw new HttpError(401, '接続情報が無効です。PCのQRコードを読み直してください。');
    if (role === 'host' && !isLoopback(req.socket.remoteAddress)) throw new HttpError(403, 'PC専用の操作です。');
    if (hostOnly && role !== 'host') throw new HttpError(403, 'PC専用の操作です。');
    return role;
  }

  function clientIdentity(req, role) {
    const id = req.headers['x-airpresenter-client'];
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new HttpError(400, '接続IDが不正です。');
    return `${role}:${id}`;
  }

  function sendJson(res, status, value) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(value));
  }

  async function convert(buffer, ext, importId) {
    let dir;
    const sourceHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const abort = new AbortController();
    const finished = Promise.withResolvers();
    const job = { abort, done: finished.promise };
    jobs.add(job);
    const deadline = Date.now() + conversionTimeout;
    async function run(program, args, extra = {}) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new HttpError(422, '変換に時間がかかりすぎました。PDFに書き出して再度お試しください。');
      try {
        return await execute(program, args, { timeout: remaining, maxBuffer: 4 * 1024 * 1024,
          signal: abort.signal, cwd: dir, ...extra });
      } catch (error) {
        if (error.code === 'ENOENT') throw new HttpError(503, '変換ツールが見つかりません。PCにPoppler・LibreOfficeを用意してください。');
        throw new HttpError(422, '資料を変換できませんでした。元のPowerPointでPDFに書き出してお試しください。');
      }
    }
    try {
      updateImport(importId, { stage: 'preparing', completed: 0, total: null });
      dir = await fs.mkdtemp(path.join(dataRoot, 'deck-'));
      if (closed) throw new HttpError(503, 'サーバーを終了しています。');
      const source = path.join(dir, `source${ext}`);
      await fs.writeFile(source, buffer, { mode: 0o600 });
      let svg = null;
      if (ext !== '.pdf') {
        const profile = path.join(dir, 'profile');
        await fs.mkdir(path.join(profile, 'user'), { recursive: true });
        try { await prepareFontProfile(profile, run); }
        catch (error) {
          if (error instanceof HttpError) throw error;
          throw new HttpError(503, 'Macのフォントを準備できませんでした。Fontconfig（fc-list）とインストール済みフォントを確認してください。');
        }
        // Keep the presentation untouched; disable document macros in the isolated converter profile.
        await fs.writeFile(path.join(profile, 'user', 'registrymodifications.xcu'),
          '<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item></oor:items>');
        updateImport(importId, { stage: 'converting', completed: 0, total: null });
        await run('soffice', [`-env:UserInstallation=${pathToFileURL(profile).href}`, '--headless', '--norestore', '--nodefault', '--nofirststartwizard',
          '--convert-to', 'svg:impress_svg_Export', '--outdir', dir, source]);
        svg = path.join(dir, 'source.svg');
        if (!existsSync(svg)) throw new HttpError(422, 'PowerPointを変換できませんでした。PDF形式で再度お試しください。');
      }
      const actualHash = crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex');
      if (actualHash !== sourceHash) throw new HttpError(422, '元ファイルの変更を検出したため変換を中止しました。');
      let files;
      if (svg) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new HttpError(422, '変換に時間がかかりすぎました。PDFに書き出して再度お試しください。');
        updateImport(importId, { stage: 'rendering', completed: 0, total: null });
        try {
          files = await renderSvg(svg, dir, { maxPages, timeout: remaining, signal: abort.signal,
            onProgress: ({ completed, total }) => {
              if (Number.isInteger(completed) && Number.isInteger(total) && total >= 1 && total <= maxPages && completed >= 0 && completed <= total) {
                updateImport(importId, { stage: 'rendering', completed, total });
              }
            } });
        } catch (error) {
          if (error.code === 'BROWSER_UNAVAILABLE') {
            throw new HttpError(503, '描画用ブラウザが見つかりません。PCで npm install と npx playwright install chromium を実行してください。');
          }
          if (error.code === 'PAGE_LIMIT') throw new HttpError(422, `資料は${maxPages}ページ以内にしてください。`);
          throw new HttpError(422, 'PowerPointの描画に失敗しました。元のPowerPointでPDFに書き出してお試しください。');
        }
        if (!Array.isArray(files) || files.length < 1 || files.length > maxPages ||
          files.some((name, i) => name !== `slide-${i + 1}.png`)) {
          throw new HttpError(422, '全ページを描画できませんでした。PDF形式で再度お試しください。');
        }
      } else {
        updateImport(importId, { stage: 'converting', completed: 0, total: null });
        const info = await run('pdfinfo', [source]);
        const count = Number(/^Pages:\s+(\d+)/m.exec(info.stdout)?.[1]);
        if (!Number.isInteger(count) || count < 1 || count > maxPages) throw new HttpError(422, `資料は${maxPages}ページ以内にしてください。`);
        updateImport(importId, { stage: 'rendering', completed: 0, total: null });
        await run('pdftoppm', ['-png', '-r', '150', '-scale-to', '2000', source, path.join(dir, 'slide')]);
        files = (await fs.readdir(dir)).filter(name => /^slide-\d+\.png$/.test(name))
          .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
        if (files.length !== count) throw new HttpError(422, '全ページを変換できませんでした。PDF形式で再度お試しください。');
      }
      updateImport(importId, { stage: 'finalizing', completed: files.length, total: files.length });
      // Only rendered images survive for the current session.
      for (const entry of await fs.readdir(dir)) {
        if (!files.includes(entry)) await fs.rm(path.join(dir, entry), { recursive: true, force: true });
      }
      return { id: crypto.randomBytes(12).toString('hex'), dir, files };
    } catch (error) {
      if (dir) await fs.rm(dir, { recursive: true, force: true });
      throw error;
    } finally { jobs.delete(job); finished.resolve(); }
  }

  async function handle(req, res) {
    if (closed) throw new HttpError(503, 'サーバーを終了しています。');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");
    const url = validateRequest(req);
    const pathname = url.pathname;
    const method = req.method;

    if (pathname === '/api/session' && method === 'POST') {
      if (!isLoopback(req.socket.remoteAddress)) throw new HttpError(403, '発表PCでlocalhostを開いてください。');
      return sendJson(res, 200, { room, token: hostToken, remoteUrl: remoteUrl(), state: snapshot(), preview: previewDescriptor() });
    }

    if (!pathname.startsWith('/api/')) {
      const file = new Map([['/', 'index.html'], ['/index.html', 'index.html'], ['/app.js', 'app.js']]).get(pathname);
      if (!file || method !== 'GET') throw new HttpError(404, 'Not Found');
      const buffer = await fs.readFile(path.join(__dirname, file));
      res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8' });
      return res.end(buffer);
    }

    const hostOnly = ['/api/qrcode', '/api/upload', '/api/accept', '/api/discard'].includes(pathname) || pathname.startsWith('/api/preview/');
    const role = authenticate(req, hostOnly);
    if (pathname === '/api/info' && method === 'GET') return sendJson(res, 200, { state: snapshot(), ...(role === 'host' ? { preview: previewDescriptor() } : {}) });

    if (pathname === '/api/qrcode' && method === 'GET') {
      if (url.search) throw new HttpError(400, 'QRの接続先は変更できません。');
      const { stdout } = await execute('qrencode', ['-o', '-', '-s', '6', '-m', '4', '-t', 'PNG', remoteUrl()],
        { encoding: 'buffer', timeout: 5000, maxBuffer: 1024 * 1024 });
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return res.end(stdout);
    }

    if (pathname === '/api/events' && method === 'GET') {
      const identity = clientIdentity(req, role);
      clients.get(identity)?.res.destroy();
      res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      const client = { role, res };
      clients.set(identity, client);
      res.on('close', () => {
        if (clients.get(identity) !== client) return;
        clients.delete(identity);
        if (laserOwner === identity || !snapshot().peers.host) stopLaser();
        publish();
      });
      publish();
      return;
    }

    if (pathname === '/api/command' && method === 'POST') {
      const identity = clientIdentity(req, role);
      if (role === 'remote' && !snapshot().peers.host) throw new HttpError(409, 'PCとの接続を確認してください。');
      const cmd = await jsonBody(req);
      switch (cmd.type) {
        case 'NEXT': state.current = Math.min(state.total - 1, state.current + 1); break;
        case 'PREV': state.current = Math.max(0, state.current - 1); break;
        case 'BLACKOUT':
        case 'PRESENTATION': {
          if (typeof cmd.active !== 'boolean') throw new HttpError(400, '切替状態が不正です。');
          state[cmd.type === 'BLACKOUT' ? 'isBlackout' : 'presentation'] = cmd.active;
          break;
        }
        case 'LASER': {
          if (typeof cmd.active !== 'boolean') throw new HttpError(400, 'ポインター状態が不正です。');
          if (cmd.active) {
            if (![cmd.x, cmd.y].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100)) throw new HttpError(400, 'ポインター位置が不正です。');
            state.laser = { active: true, x: cmd.x, y: cmd.y };
            laserOwner = identity;
            clearTimeout(laserTimer);
            laserTimer = setTimeout(() => { if (stopLaser()) publish(); }, 1500);
            laserTimer.unref();
          } else if (role === 'host' || laserOwner === identity) stopLaser();
          break;
        }
        case 'TIMER': {
          const now = Date.now();
          if (cmd.action === 'start') { if (state.timer.startedAt === null) state.timer.startedAt = now; }
          else if (cmd.action === 'pause') {
            if (state.timer.startedAt !== null) state.timer.elapsedMs += now - state.timer.startedAt;
            state.timer.startedAt = null;
          } else if (cmd.action === 'reset') state.timer = { elapsedMs: 0, startedAt: null };
          else throw new HttpError(400, 'タイマー操作が不正です。');
          break;
        }
        case 'NOTE': {
          if (role !== 'host') throw new HttpError(403, 'ノートはPCで編集してください。');
          if (!Number.isInteger(cmd.page) || cmd.page < 0 || cmd.page >= state.total || typeof cmd.text !== 'string' || cmd.text.length > 4000) throw new HttpError(400, 'ノートは4000文字以内で指定してください。');
          state.notes[cmd.page] = cmd.text;
          break;
        }
        default: throw new HttpError(400, '対応していない操作です。');
      }
      publish();
      return sendJson(res, 200, { state: snapshot() });
    }

    if (pathname === '/api/upload' && method === 'POST') {
      if (uploading) throw new HttpError(409, '別の資料を読み込み中です。完了までお待ちください。');
      const filename = url.searchParams.get('filename') || '';
      const ext = path.extname(filename).toLowerCase();
      if (!['.pdf', '.pptx', '.ppt'].includes(ext)) throw new HttpError(400, 'PDF・PPTX・PPTのいずれかを選択してください。');
      if (Number(req.headers['content-length']) > maxUpload) throw new HttpError(413, '資料は25 MiB以内にしてください。');
      const requestedId = req.headers['x-airpresenter-import'];
      if (requestedId !== undefined && (typeof requestedId !== 'string' || !/^[a-zA-Z0-9]{16,64}$/.test(requestedId))) {
        throw new HttpError(400, '資料の処理IDが不正です。資料を選択し直してください。');
      }
      const importId = requestedId || crypto.randomBytes(16).toString('hex');
      uploading = true;
      const startedAt = Date.now();
      state.import = { id: importId, status: 'processing', stage: 'receiving', completed: 0,
        total: null, startedAt, updatedAt: startedAt, error: null };
      publish();
      try {
        const previousCandidate = candidate;
        candidate = null;
        const [buffer] = await Promise.all([readBody(req, maxUpload, 413), removeDeck(previousCandidate)]);
        if (closed) throw new HttpError(503, 'サーバーを終了しています。');
        const valid = ext === '.pdf' ? buffer.subarray(0, 5).equals(Buffer.from('%PDF-')) :
          ext === '.pptx' ? buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4])) :
            buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
        if (!valid) throw new HttpError(400, '資料の内容と形式が一致しません。元のアプリで保存し直してください。');
        const deck = await convert(buffer, ext, importId);
        if (closed) { await removeDeck(deck); throw new HttpError(503, 'サーバーを終了しています。'); }
        if (ext === '.pdf') {
          await acceptDeck(deck);
          updateImport(importId, { status: 'completed', stage: 'ready', completed: deck.files.length, total: deck.files.length });
          return sendJson(res, 200, { state: snapshot() });
        }
        candidate = deck;
        updateImport(importId, { status: 'awaiting_confirmation', stage: 'ready', completed: deck.files.length, total: deck.files.length });
        return sendJson(res, 200, { preview: previewDescriptor(), state: snapshot() });
      } catch (error) {
        importFailure(importId, error);
        throw error;
      } finally { uploading = false; }
    }

    if ((pathname === '/api/accept' || pathname === '/api/discard') && method === 'POST') {
      if (uploading) throw new HttpError(409, '変換中です。完了までお待ちください。');
      const body = await jsonBody(req);
      if (!candidate || body.id !== candidate.id) throw new HttpError(404, 'プレビューがありません。資料を選択し直してください。');
      const deck = candidate;
      const importId = state.import?.id;
      candidate = null;
      try {
        if (pathname === '/api/accept') {
          updateImport(importId, { status: 'processing', stage: 'finalizing' });
          await acceptDeck(deck);
          updateImport(importId, { status: 'completed', stage: 'ready' });
        } else {
          await removeDeck(deck);
          updateImport(importId, { status: 'discarded', stage: 'ready' });
        }
      } catch (error) { importFailure(importId, error); throw error; }
      return sendJson(res, 200, { state: snapshot() });
    }

    const image = /^\/api\/(slide|preview)\/([a-f0-9]{24})\/(\d+)$/.exec(pathname);
    if (image && method === 'GET') {
      const deck = image[1] === 'preview' ? candidate : activeDeck;
      const page = Number(image[3]);
      if (!deck || deck.id !== image[2] || !Number.isInteger(page) || !deck.files[page]) throw new HttpError(404, 'このページはありません。');
      const buffer = await fs.readFile(path.join(deck.dir, deck.files[page]));
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return res.end(buffer);
    }
    throw new HttpError(404, 'Not Found');
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch(error => {
      if (res.headersSent || res.destroyed) { res.destroy(); return; }
      const status = error instanceof HttpError ? error.status : 500;
      sendJson(res, status, { error: status === 500 ? '処理に失敗しました。PCの接続と変換ツールを確認してください。' : error.message });
      req.resume();
    });
  });
  server.requestTimeout = 120_000;
  server.headersTimeout = 15_000;
  const heartbeat = setInterval(() => {
    for (const client of clients.values()) client.res.write(': heartbeat\n\n');
  }, 10_000);
  heartbeat.unref();

  async function close() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(laserTimer);
    for (const job of jobs) job.abort.abort();
    await Promise.all([...jobs].map(job => job.done));
    for (const client of clients.values()) client.res.end();
    clients.clear();
    if (server.listening) {
      const stopped = new Promise(resolve => server.close(resolve));
      server.closeAllConnections();
      await stopped;
    }
    await fs.rm(dataRoot, { recursive: true, force: true });
  }
  return { server, close };
}

module.exports = { createApp };

if (require.main === module) {
  createApp().then(app => {
    const port = Number(process.env.PORT || 3084);
    const host = process.env.HOST || '0.0.0.0';
    app.server.on('error', async () => { console.error('起動できませんでした。ポートと保存先を確認してください。'); await app.close(); process.exitCode = 1; });
    app.server.listen(port, host, () => console.log(`AirPresenter: http://localhost:${app.server.address().port}/?mode=dual`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
  }).catch(() => { console.error('一時保存先を準備できませんでした。'); process.exitCode = 1; });
}
