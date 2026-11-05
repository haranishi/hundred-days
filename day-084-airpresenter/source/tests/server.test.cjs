'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createApp } = require('../server.js');
const { createPdf, createPptx, createPpt, samplePngPixel, recognizePng } = require('./helpers.cjs');
const execute = promisify(execFile);

async function start(options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'airpresenter-test-'));
  const app = await createApp({ ...options, localIp: '127.0.0.1', dataDir: dir });
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const session = await (await fetch(base + '/api/session', { method: 'POST', headers: { Origin: base } })).json();
  const remoteKey = new URLSearchParams(new URL(session.remoteUrl).hash.slice(1)).get('token');
  function headers(role = 'host', client = role) {
    return { Authorization: `Bearer ${role === 'host' ? session.token : remoteKey}`,
      'X-AirPresenter-Room': session.room, 'X-AirPresenter-Client': client, Origin: base };
  }
  async function request(route, { role = 'host', client = role, json, body, method, extraHeaders = {} } = {}) {
    return fetch(base + route, { method: method || (json !== undefined || body !== undefined ? 'POST' : 'GET'),
      headers: { ...headers(role, client), ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders },
      body: json !== undefined ? JSON.stringify(json) : body });
  }
  const streams = new Set();
  async function connect(role = 'host', client = role) {
    const controller = new AbortController();
    const res = await fetch(base + '/api/events', { headers: headers(role, client), signal: controller.signal });
    assert.equal(res.status, 200);
    const reader = res.body.getReader();
    let text = '';
    while (!text.includes('\n\n')) {
      const chunk = await reader.read();
      text += Buffer.from(chunk.value).toString();
    }
    const snapshots = [];
    function drain() {
      let end;
      while ((end = text.indexOf('\n\n')) !== -1) {
        const frame = text.slice(0, end); text = text.slice(end + 2);
        const data = /^data: (.+)$/m.exec(frame)?.[1];
        if (data) {
          const event = JSON.parse(data);
          assert.equal(event.type, 'SNAPSHOT');
          snapshots.push(event.state);
        }
      }
    }
    drain();
    const pump = (async () => {
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) return;
          text += Buffer.from(chunk.value).toString(); drain();
        }
      } catch (error) { if (!controller.signal.aborted) throw error; }
    })();
    const connection = { initial: snapshots[0], snapshots, close: async () => { controller.abort(); try { await reader.cancel(); } catch {} await pump; streams.delete(connection); } };
    streams.add(connection);
    return connection;
  }
  async function state() { return (await (await request('/api/info')).json()).state; }
  async function command(cmd, role = 'host', client = role) {
    const res = await request('/api/command', { json: cmd, role, client });
    assert.equal(res.status, 200);
    return (await res.json()).state;
  }
  async function close() {
    await Promise.all([...streams].map(stream => stream.close()));
    await app.close();
    assert.deepEqual(await fs.readdir(dir), []);
    await fs.rm(dir, { recursive: true, force: true });
  }
  return { app, base, session, headers, request, state, command, connect, close };
}

async function eventually(check, label) {
  for (let i = 0; i < 50; i++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(label);
}

test('authentication, host-only control, session isolation and static allowlist', async () => {
  const a = await start();
  const b = await start();
  try {
    assert.equal((await fetch(a.base + '/api/info')).status, 401);
    for (const resource of ['/.git/HEAD', '/server.js', '/slides/slide-01.png', '/patch_pptx.py', '/README.md', '/.kiro/specs/airpresenter/spec.json']) {
      assert.equal((await fetch(a.base + resource)).status, 404);
    }
    assert.equal((await fetch(a.base + '/api/session', { method: 'POST', headers: { Origin: 'https://example.invalid' } })).status, 403);
    const invalidHost = await new Promise((resolve, reject) => {
      const req = require('node:http').request(a.base + '/api/session', { method: 'POST', headers: { Host: 'evil.invalid' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject); req.end();
    });
    assert.equal(invalidHost, 403);
    assert.equal((await fetch(b.base + '/api/info', { headers: { ...a.headers(), Origin: b.base } })).status, 401);
    assert.equal((await a.request('/api/upload?filename=test.pdf', { role: 'remote', body: createPdf() })).status, 403);
    assert.equal((await a.request('/api/command', { role: 'remote', json: { type: 'NEXT' } })).status, 409);
    const info = await a.request('/api/info');
    assert.equal(info.headers.get('access-control-allow-origin'), null);
    assert.equal(info.headers.get('cache-control'), 'no-store');
    assert.equal(info.headers.get('referrer-policy'), 'no-referrer');
    const state = (await info.json()).state;
    assert.equal(state.total, 5);
    assert.deepEqual(state.slides, []);
    assert.equal(new URL(a.session.remoteUrl).searchParams.has('token'), false);
    assert.notEqual(a.session.token, new URLSearchParams(new URL(a.session.remoteUrl).hash.slice(1)).get('token'));
    const qr = await a.request('/api/qrcode');
    assert.equal(qr.status, 200);
    assert.equal(Buffer.from(await qr.arrayBuffer()).subarray(1, 4).toString(), 'PNG');
    assert.equal((await a.request('/api/qrcode?url=bad')).status, 400);
  } finally { await a.close(); await b.close(); }
});

test('one authoritative state: boundaries, notes, shared timer and late join', async () => {
  const a = await start();
  try {
    await a.connect();
    await a.connect('remote');
    assert.equal((await a.command({ type: 'NEXT' }, 'remote')).current, 1);
    for (let i = 0; i < 8; i++) await a.command({ type: 'NEXT' }, 'remote');
    assert.equal((await a.state()).current, 4);
    for (let i = 0; i < 8; i++) await a.command({ type: 'PREV' }, 'remote');
    assert.equal((await a.state()).current, 0);
    assert.equal((await a.command({ type: 'BLACKOUT', active: true }, 'remote')).isBlackout, true);
    assert.equal((await a.command({ type: 'PRESENTATION', active: true }, 'remote')).presentation, true);
    await a.command({ type: 'NOTE', page: 0, text: '<b>literal speaker note</b>' });
    assert.equal((await a.request('/api/command', { role: 'remote', json: { type: 'NOTE', page: 0, text: 'no' } })).status, 403);
    await a.command({ type: 'TIMER', action: 'start' });
    const started = (await a.state()).timer.startedAt;
    await a.command({ type: 'TIMER', action: 'start' });
    assert.equal((await a.state()).timer.startedAt, started);
    await new Promise(resolve => setTimeout(resolve, 80));
    const paused = await a.command({ type: 'TIMER', action: 'pause' });
    assert.ok(paused.timer.elapsedMs >= 70);
    assert.equal(paused.timer.startedAt, null);
    const late = await a.connect('remote', 'late');
    assert.equal(late.initial.notes[0], '<b>literal speaker note</b>');
    assert.equal(late.initial.isBlackout, true);
    assert.equal(late.initial.timer.elapsedMs, paused.timer.elapsedMs);
    assert.ok(late.initial.revision > paused.revision);
    assert.equal(late.initial.peers.host, 1);
    assert.equal(late.initial.peers.remote, 2);
    assert.deepEqual((await a.command({ type: 'TIMER', action: 'reset' })).timer, { elapsedMs: 0, startedAt: null });
    for (const cmd of [{ type: '???' }, { type: 'NOTE', page: 999, text: '' }, { type: 'NOTE', page: 0, text: 'x'.repeat(4001) }, { type: 'BLACKOUT', active: 'true' }, { type: 'LASER', active: true, x: null, y: 50 }, { type: 'TIMER', action: 'bad' }]) {
      assert.equal((await a.request('/api/command', { json: cmd })).status, 400);
    }
    assert.equal((await a.request('/api/command', { body: 'x'.repeat(17000) })).status, 400);
  } finally { await a.close(); }
});

test('pointer preserves zero coordinates and expires on disconnect or inactivity', async () => {
  const a = await start();
  try {
    await a.connect();
    const phone = await a.connect('remote');
    let state = await a.command({ type: 'LASER', active: true, x: 0, y: 100 }, 'remote');
    assert.deepEqual(state.laser, { active: true, x: 0, y: 100 });
    await phone.close();
    await eventually(async () => !(await a.state()).laser.active, 'disconnect must stop the pointer');
    await a.connect('remote');
    await a.command({ type: 'LASER', active: true, x: 100, y: 0 }, 'remote');
    await new Promise(resolve => setTimeout(resolve, 1600));
    assert.equal((await a.state()).laser.active, false);
  } finally { await a.close(); }
});

test('PDF conversion is private and atomic; malformed, oversized and excessive-page files preserve the deck', async () => {
  const a = await start({ maxPages: 2, maxUploadBytes: 2048 });
  try {
    const source = createPdf();
    const res = await a.request('/api/upload?filename=synthetic.pdf', { body: source });
    assert.equal(res.status, 200);
    const state = (await res.json()).state;
    assert.equal(state.total, 2);
    assert.equal(state.current, 0);
    const png = await a.request(state.slides[0]);
    assert.equal(png.status, 200);
    assert.equal(Buffer.from(await png.arrayBuffer()).subarray(1, 4).toString(), 'PNG');
    assert.equal((await fetch(a.base + state.slides[0])).status, 401);
    const remote = await a.request(state.slides[0], { role: 'remote' });
    assert.equal(remote.status, 200);
    for (const [filename, body, status] of [
      ['bad.pdf', Buffer.from('%PDF-invalid'), 422],
      ['wrong.pdf', Buffer.from('not a pdf'), 400],
      ['large.pdf', Buffer.alloc(2049), 413],
      ['pages.pdf', createPdf(3), 422],
      ['wrong.txt', Buffer.from('text'), 400]
    ]) {
      assert.equal((await a.request('/api/upload?filename=' + filename, { body })).status, status);
      assert.deepEqual((await a.state()).slides, state.slides);
    }
    assert.equal((await a.request('/api/slide/aaaaaaaaaaaaaaaaaaaaaaaa/0')).status, 404);
  } finally { await a.close(); }
});

test('PowerPoint uses untouched original bytes; preview is host-only and adopts or discards atomically', async () => {
  const source = await createPptx();
  let observedSource = null;
  const programs = [];
  const a = await start({
    runFile: async (program, args, options) => {
      programs.push(program);
      if (program === 'soffice') {
        assert.ok(args.includes('svg:impress_svg_Export'), 'PowerPoint must use SVG export rather than the broken PDF glyph path');
        observedSource = await fs.readFile(args.at(-1));
      }
      return execute(program, args, options);
    }
  });
  try {
    const stream = await a.connect();
    const old = await a.command({ type: 'NEXT' });
    let res = await a.request('/api/upload?filename=synthetic.pptx', { body: source });
    assert.equal(res.status, 200);
    const preview = (await res.json()).preview;
    assert.equal(preview.total, 2);
    await eventually(async () => stream.snapshots.some(s => s.import?.status === 'awaiting_confirmation'), 'PPTX must publish confirmation-ready progress');
    const progress = stream.snapshots.map(s => s.import).filter(Boolean);
    assert.deepEqual([...new Set(progress.filter(p => p.stage === 'rendering' && p.total === 2).map(p => p.completed))], [0, 1, 2]);
    const hostInfo = await (await a.request('/api/info')).json();
    const reloaded = await (await fetch(a.base + '/api/session', { method: 'POST', headers: { Origin: a.base } })).json();
    assert.deepEqual(hostInfo.preview, preview);
    assert.equal((await a.request('/api/upload?filename=rejected.pdf', { body: createPdf(), extraHeaders: { 'X-AirPresenter-Import': 'invalid' } })).status, 400);
    assert.deepEqual((await (await a.request('/api/info')).json()).preview, preview);
    assert.equal((await a.state()).import.id, reloaded.state.import.id);
    assert.deepEqual(reloaded.preview, preview);
    assert.equal(reloaded.state.import.status, 'awaiting_confirmation');
    assert.equal(Object.hasOwn(await (await a.request('/api/info', { role: 'remote' })).json(), 'preview'), false);
    assert.deepEqual(observedSource, source);
    assert.equal(programs.includes('pdftoppm'), false);
    assert.equal(programs.includes('pdfinfo'), false);
    assert.deepEqual((await a.state()).slides, []);
    assert.equal((await a.state()).current, old.current);
    assert.equal((await a.request(preview.slides[0], { role: 'remote' })).status, 403);
    assert.equal((await a.request('/api/accept', { role: 'remote', json: { id: preview.id } })).status, 403);
    const image = await a.request(preview.slides[0]);
    assert.equal(image.status, 200);
    const cover = Buffer.from(await image.arrayBuffer());
    assert.deepEqual(samplePngPixel(cover), [255, 255, 255]);
    const second = await a.request(preview.slides[1]);
    const green = samplePngPixel(Buffer.from(await second.arrayBuffer()));
    assert.ok(green.every((n, i) => Math.abs(n - [35, 122, 87][i]) <= 1), 'green background must remain green');
    const discarded = await a.request('/api/discard', { json: { id: preview.id } });
    assert.equal(discarded.status, 200);
    assert.equal((await discarded.json()).state.import.status, 'discarded');
    assert.equal((await (await a.request('/api/info')).json()).preview, null);
    assert.equal((await a.request(preview.slides[0])).status, 404);
    assert.equal((await a.state()).current, old.current);
    res = await a.request('/api/upload?filename=synthetic.pptx', { body: source });
    const again = (await res.json()).preview;
    const accepted = await a.request('/api/accept', { json: { id: again.id } });
    const state = (await accepted.json()).state;
    assert.equal(state.import.status, 'completed');
    assert.equal(state.import.stage, 'ready');
    assert.equal(state.total, 2);
    assert.equal(state.current, 0);
    assert.equal(state.slides.length, 2);
    assert.equal((await a.request(state.slides[1], { role: 'remote' })).status, 200);
    assert.equal((await a.request(again.slides[0])).status, 404);
    const next = await a.request('/api/upload?filename=next.pptx', { body: source });
    const pending = (await next.json()).preview;
    assert.ok(pending);
    assert.equal((await a.request('/api/upload?filename=broken.pdf', { body: Buffer.from('not a pdf') })).status, 400);
    assert.equal((await (await a.request('/api/info')).json()).preview, null);
    assert.equal((await a.request('/api/accept', { json: { id: pending.id } })).status, 404);
    assert.equal((await a.state()).import.status, 'failed');
    assert.deepEqual((await a.state()).slides, state.slides);
  } finally { await a.close(); }
});

test('legacy PPT also requires a preview', async () => {
  const source = await createPpt();
  const a = await start();
  try {
    const result = await a.request('/api/upload?filename=synthetic.ppt', { body: source });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).preview.total, 2);
    assert.equal((await a.state()).total, 5);
  } finally { await a.close(); }
});

test('conversion failure and timeout release the lock without replacing the old deck', async () => {
  let fail = true;
  const a = await start({ runFile: async (program, args, options) => {
    if (fail && program === 'pdfinfo') throw Object.assign(new Error('timeout'), { killed: true });
    return execute(program, args, options);
  }});
  try {
    assert.equal((await a.request('/api/upload?filename=one.pdf', { body: createPdf() })).status, 422);
    assert.equal((await a.state()).total, 5);
    assert.equal((await a.state()).import.status, 'failed');
    assert.equal((await a.state()).import.stage, 'converting');
    assert.doesNotMatch((await a.state()).import.error, /timeout|source|\/private\//);
    fail = false;
    assert.equal((await a.request('/api/upload?filename=two.pdf', { body: createPdf() })).status, 200);
    assert.equal((await a.state()).total, 2);
  } finally { await a.close(); }
});

test('only one conversion runs at a time and SSE is available while converting', async () => {
  let release;
  let started;
  const conversionStarted = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const a = await start({ runFile: async (program, args, options) => {
    if (program === 'pdfinfo') { started(); await gate; }
    return execute(program, args, options);
  }});
  try {
    const upload = a.request('/api/upload?filename=one.pdf', { body: createPdf() });
    await conversionStarted;
    assert.equal((await a.request('/api/upload?filename=two.pdf', { body: createPdf() })).status, 409);
    const stream = await a.connect();
    assert.equal(stream.initial.total, 5);
    assert.equal((await a.command({ type: 'NEXT' })).current, 1);
    release();
    assert.equal((await upload).status, 200);
    assert.equal((await a.state()).total, 2);
  } finally { release(); await a.close(); }
});

test('PowerPoint SVG enforces the page limit before replacing the current deck', async () => {
  const a = await start({ maxPages: 1 });
  try {
    await a.command({ type: 'NEXT' });
    const res = await a.request('/api/upload?filename=too-many.pptx', { body: await createPptx() });
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /1ページ/);
    const preserved = await a.state();
    assert.equal(preserved.current, 1);
    assert.equal(preserved.total, 5);
    assert.deepEqual(preserved.slides, []);
  } finally { await a.close(); }
});

test('Mac Japanese PowerPoint keeps Japanese and Latin glyphs visible, both regular and bold', { skip: process.platform !== 'darwin' }, async () => {
  const source = await createPptx(true);
  const a = await start();
  try {
    const res = await a.request('/api/upload?filename=synthetic-ja.pptx', { body: source });
    assert.equal(res.status, 200);
    const preview = (await res.json()).preview;
    assert.equal(preview.total, 2);
    for (const slide of preview.slides) {
      const image = await a.request(slide);
      assert.equal(image.status, 200);
      const recognized = (await recognizePng(Buffer.from(await image.arrayBuffer())))
        .normalize('NFKC').replace(/\s+/g, '');
      assert.match(recognized, /日本語の発表資料/, 'actual PNG must display Japanese glyphs in both weights');
      for (const word of ['ABC', 'DNA', '2026']) assert.ok(recognized.includes(word), `actual PNG must display ${word}`);
    }
  } finally { await a.close(); }
});


test('import progress is recoverable over SSE and rejects invalid or concurrent requests without replacing it', async () => {
  let release;
  let started;
  const gate = new Promise(resolve => { release = resolve; });
  const conversionStarted = new Promise(resolve => { started = resolve; });
  const a = await start({ maxUploadBytes: 2048, runFile: async (program, args, options) => {
    if (program === 'pdfinfo') { started(); await gate; }
    return execute(program, args, options);
  }});
  try {
    assert.equal((await a.state()).import, null);
    assert.equal(a.session.preview, null);
    for (const id of ['short', 'A'.repeat(65), 'unsafe/import/header']) {
      assert.equal((await a.request('/api/upload?filename=bad.pdf', { body: createPdf(), extraHeaders: { 'X-AirPresenter-Import': id } })).status, 400);
    }
    assert.equal((await a.request('/api/upload?filename=large.pdf', { body: Buffer.alloc(2049) })).status, 413);
    assert.equal((await a.request('/api/upload?filename=wrong.txt', { body: Buffer.from('text') })).status, 400);
    assert.equal((await a.state()).import, null);
    const stream = await a.connect();
    await a.command({ type: 'NEXT' });
    const id = 'A'.repeat(32);
    const upload = a.request('/api/upload?filename=untrusted-secret-name.pdf', { body: createPdf(), extraHeaders: { 'X-AirPresenter-Import': id } });
    await conversionStarted;
    const before = await a.state();
    assert.equal(before.current, 1);
    assert.deepEqual(before.slides, []);
    assert.equal(before.import.id, id);
    assert.equal(before.import.status, 'processing');
    assert.ok(before.import.startedAt > 0 && before.import.updatedAt >= before.import.startedAt);
    assert.deepEqual(Object.keys(before.import).sort(), ['completed', 'error', 'id', 'stage', 'startedAt', 'status', 'total', 'updatedAt']);
    assert.equal(JSON.stringify(before.import).includes('untrusted-secret-name'), false);
    assert.equal((await a.request('/api/upload?filename=second.pdf', { body: createPdf(), extraHeaders: { 'X-AirPresenter-Import': 'B'.repeat(32) } })).status, 409);
    assert.equal((await a.request('/api/upload?filename=second.pdf', { role: 'remote', body: createPdf() })).status, 403);
    assert.equal((await a.state()).import.id, id);
    const reloaded = await (await fetch(a.base + '/api/session', { method: 'POST', headers: { Origin: a.base } })).json();
    assert.equal(reloaded.state.import.id, id);
    assert.equal(reloaded.state.import.status, 'processing');
    assert.equal(reloaded.preview, null);
    release();
    const res = await upload;
    assert.equal(res.status, 200);
    const state = (await res.json()).state;
    assert.equal(state.import.id, id);
    assert.equal(state.import.status, 'completed');
    assert.equal(state.import.stage, 'ready');
    assert.equal(state.import.completed, 2);
    assert.equal(state.import.total, 2);
    assert.equal(state.total, 2);
    assert.equal(state.current, 0);
    await eventually(async () => stream.snapshots.some(s => s.import?.status === 'completed'), 'completion must arrive over SSE');
    const progress = stream.snapshots.map(s => s.import).filter(Boolean);
    assert.deepEqual([...new Set(progress.map(p => p.stage))], ['receiving', 'preparing', 'converting', 'rendering', 'finalizing', 'ready']);
    assert.equal(progress.find(p => p.stage === 'receiving').total, null);
    assert.equal(progress.find(p => p.stage === 'rendering').total, null, 'PDF must not invent partial-page counts');
    const failed = await a.request('/api/upload?filename=bad.pdf', { body: Buffer.from('bad content') });
    assert.equal(failed.status, 400);
    const failure = (await a.state()).import;
    assert.match(failure.id, /^[A-Za-z0-9]{16,64}$/);
    assert.notEqual(failure.id, id);
    assert.equal(failure.status, 'failed');
    assert.match(failure.error, /資料/);
    assert.equal((await a.state()).total, 2);
    const retry = await a.request('/api/upload?filename=retry.pdf', { body: createPdf() });
    assert.equal(retry.status, 200);
    assert.equal((await a.state()).import.status, 'completed');
    const abortId = 'C'.repeat(32);
    const interrupted = require('node:http').request(a.base + '/api/upload?filename=partial.pdf', {
      method: 'POST', headers: { ...a.headers(), 'X-AirPresenter-Import': abortId, 'Transfer-Encoding': 'chunked' }
    });
    interrupted.on('error', () => {});
    interrupted.write('%PDF-1.4');
    await eventually(async () => (await a.state()).import?.id === abortId, 'partial upload must enter receiving');
    interrupted.destroy();
    await eventually(async () => (await a.state()).import?.status === 'failed', 'aborted transfer must leave processing');
    assert.equal((await a.state()).total, 2);
  } finally { release(); await a.close(); }
});
