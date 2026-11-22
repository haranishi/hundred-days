// Day097 宣伝動画の撮影・書き出し。ステージ（stage.html）の中でアプリを実際に操作し、1/30秒ずつ時計を進めて1コマずつ撮る。
// 絵コンテの正本は timeline.mjs。使い方:
//   node day-097-sabakiba/tools/promo/render-promo.mjs --out-dir <出力先> [--frames 300-420] [--no-encode] [--audio-dir <bgm_a.wav等の場所>] [--mux a,b]
// 出力: frames/*.jpg ・ silent.mp4 ・ (mux指定時) a.mp4 b.mp4 ・ first-frame.png ・ contact-sheet.jpg ・ capture-report.json ・ cues.json
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECURITY_HEADERS } from '../serve.mjs';
import * as T from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dayRoot = resolve(here, '..', '..');
const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const flag = (name) => argv.includes(`--${name}`);
const outDir = resolve(opt('out-dir', join(tmpdir(), 'day097-promo', 'render'))); // リポジトリの外（生成物をコミットしない）
const framesArg = opt('frames', '');
const [rangeFrom, rangeTo] = framesArg ? framesArg.split('-').map(Number) : [0, T.TOTAL_FRAMES - 1];
const partial = Boolean(framesArg);
const frameDir = partial ? join(outDir, `preview-${rangeFrom}-${rangeTo}`) : join(outDir, 'frames');
const basePort = Number(opt('port', 4297));
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const ffprobe = process.env.FFPROBE || 'ffprobe';
const FPS = T.FPS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2);
const easeOut = (p) => 1 - (1 - p) ** 3;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8' };

// ---- 配信：/stage/* は撮影用ステージ、/app/* はアプリ（本番と同じCSP。ただし別ポートのステージに埋め込むので frame-ancestors は付けない）----
// フレームごとに別のポートで配信する＝保存領域（localStorage）がフレームどうしで混ざらない。
const appHeaders = { ...SECURITY_HEADERS };
delete appHeaders['x-frame-options'];
appHeaders['content-security-policy'] = appHeaders['content-security-policy'].replace(/;?\s*frame-ancestors[^;]*/, '');
function route(url) {
  const path = decodeURIComponent(url.split('?')[0]);
  const [root, rel] = path.startsWith('/stage/') ? [here, path.slice(7)] : path.startsWith('/app/') ? [dayRoot, path.slice(5)] : [null, ''];
  if (!root) return null;
  const target = resolve(root, normalize(rel === '' ? 'index.html' : rel));
  if (target !== root && !target.startsWith(root + sep)) return null;
  if (root === dayRoot && /^(tools|tests)([\\/]|$)/.test(rel)) return null;
  return existsSync(target) && statSync(target).isFile() ? { file: target, app: root === dayRoot } : null;
}
function listen(port) {
  const server = createServer((req, res) => {
    const hit = route(req.url || '/');
    if (!hit) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(hit.file)] || 'application/octet-stream', 'cache-control': 'no-store', ...(hit.app ? appHeaders : {}) });
    res.end(readFileSync(hit.file));
  });
  return new Promise((ok, ng) => { server.once('error', ng); server.listen(port, '127.0.0.1', () => ok(server)); });
}

// ---- 動画の時刻 → 重ね物の状態 ----
const FRAME_DEFS = [...T.FRAMES, ...T.FISH.map((f) => ({ name: `f-m-${f.key}`, hash: `#/fish/${f.key}/${f.goto[1] + 1}`, debug: true, freeze: true, goto: f.goto, zoom: T.MONTAGE_ZOOM }))];
function captionAt(t) {
  const c = T.CAPTIONS.find((x) => t >= x.start - 1e-9 && t < x.end - 1e-9);
  if (!c) return null;
  const rise = c.start === 0 ? 1 : easeOut(clamp((t - c.start) / 0.16)); // 透明にはしない（切り替わりの途中のコマを作らない）。下から14px上がるだけ
  let lines = c.lines, accentFrom = null, dots = null;
  if (c.montage) {
    const n = clamp(Math.floor((t - c.start) / T.MONTAGE_PER + 1e-6), 0, T.FISH.length - 1);
    lines = [c.lines[0], `${T.FISH[n].name}・${T.FISH[n].method}`]; accentFrom = 1; dots = { n: T.FISH.length, on: n };
  }
  return { lines, big: Boolean(c.big), accentFrom, dots, alpha: 1, dy: Math.round((1 - rise) * 14) };
}

async function main() {
  const t0 = Date.now(); const lap = (msg) => console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${msg}`);
  mkdirSync(outDir, { recursive: true });
  if (!partial) rmSync(frameDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });
  const servers = await Promise.all(FRAME_DEFS.map((_, i) => listen(basePort + i)));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const report = { fps: FPS, total: T.TOTAL_FRAMES, range: [rangeFrom, rangeTo], actions: [], observations: [], warnings: [], msPerFrame: 0, practice: null };
  const cuesOut = [];
  try {
    const context = await browser.newContext({ viewport: { width: T.STAGE.width, height: T.STAGE.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    context.setDefaultTimeout(60_000);
    // 指のイベントの時刻を、止めた時計（performance.now）に合わせる。時計を止めて撮るので、実時間の揺れが採点（なめらかさ）に入らない。
    await context.addInitScript(() => { Object.defineProperty(Event.prototype, 'timeStamp', { configurable: true, get() { return performance.now(); } }); });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Blocked autofocusing|screen-wake-lock/.test(m.text())) pageErrors.push(`console: ${m.text()}`.slice(0, 200)); });
    await context.clock.install({ time: new Date('2026-11-22T10:00:00+09:00') });
    // requestAnimationFrame を、撮影の1コマごとに1回だけ流す仕組みに差し替える（時計のあとに入れる）。
    //   live   : 読み込み中。時計の刻みでふつうに動く
    //   manual : 撮影中。window.__flush() を呼んだときだけ、登録済みの描画を1回流す（時刻は止めた時計の performance.now()）
    //   __hold : 描画しない（1画面の描画が重い。読み込み中も、撮影中の見えていない画面も止める）
    await context.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      const caf = window.cancelAnimationFrame.bind(window);
      window.__mode = 'live'; window.__hold = true; // 既定は描かない。読み込みは1画面ずつ、順に描画を許す
      let seq = 0; const waiting = new Map();
      const arm = (id) => {
        const w = waiting.get(id);
        w.handle = raf(() => {
          const cur = waiting.get(id); if (!cur) return;
          if (window.__mode !== 'live') return;                 // manual: __flush() が呼ぶまで待つ
          if (window.__hold) { arm(id); return; }               // live で止めている間は、次の刻みへ持ち越す
          waiting.delete(id); cur.cb(performance.now());
        });
      };
      window.requestAnimationFrame = (cb) => { const id = ++seq; waiting.set(id, { cb }); arm(id); return id; };
      window.cancelAnimationFrame = (id) => { const w = waiting.get(id); if (w) { caf(w.handle); waiting.delete(id); } };
      window.__flush = () => {
        if (window.__hold) return 0;
        const now = performance.now(); const batch = [...waiting.entries()];
        for (const [id] of batch) waiting.delete(id);
        for (const [, w] of batch) { caf(w.handle); try { w.cb(now); } catch (e) { setTimeout(() => { throw e; }, 0); } }
        return batch.length;
      };
    });
    await page.goto(`http://127.0.0.1:${basePort}/stage/stage.html`);
    await page.evaluate((cfg) => window.stage.init(cfg), {
      stages: T.STAGES, end: T.END_CARD, app: T.STAGE.app,
      iframes: FRAME_DEFS.map((f, i) => ({ name: f.name, url: `http://127.0.0.1:${basePort + i}/app/index.html?seed=1&gfx=high${f.debug ? '&debug=1' : ''}${f.freeze ? '&freeze=1' : ''}${f.hash}` })),
    });
    for (let i = 0; i < 300 && FRAME_DEFS.some((d) => !page.frame({ name: d.name })); i++) await sleep(100);
    const frames = Object.fromEntries(FRAME_DEFS.map((d) => [d.name, page.frame({ name: d.name })]));
    // 押す操作：見えていない画面は DOM の click（クリックの経路は同じ）。描画を待たない
    const press = async (fr, testid) => { await frames[fr].evaluate((id) => document.querySelector(`[data-testid="${id}"]`).click(), testid); };
    if (Object.values(frames).some((x) => !x)) throw new Error('アプリのフレームが開きません');
    for (const d of FRAME_DEFS) { // 1画面ずつ描画を許して、最初の描画・静止画の位置合わせ・視点・ズームを済ませ、また止める
      const fr = frames[d.name];
      await fr.evaluate(() => { window.__hold = false; });
      await fr.waitForSelector('body[data-ready="true"]', { timeout: 120_000 });
      // 画面の切り替えの途中のコマを作らない（CSSの遷移・動きは時計に従わない）。タップの強調（水色の四角）も出さない。
      // 説明欄の下端は、文が途中で切れて見えないよう、手順の画面（ガイド）のときだけ少しぼかす（練習の結果カードは切らない）。
      await fr.addStyleTag({ content: `*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; -webkit-tap-highlight-color: transparent !important; }
        .guide-layout[data-mode="guide"] .card-scroll { -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 54px), transparent 100%); mask-image: linear-gradient(to bottom, #000 calc(100% - 54px), transparent 100%); }` });
      if (d.goto) await fr.evaluate(([sp, step, u]) => window.__sabaki.goto(sp, step, u), d.goto);
      if (d.view === 'top') for (let i = 0; i < 3 && !/真上/.test((await fr.getByTestId('toggle-view').textContent()) || ''); i++) await press(d.name, 'toggle-view');
      if (d.zoom) { // 3Dの表示にマウスホイールを回す（ユーザーと同じ入力）。魚が画面の幅いっぱいまで大きくなる
        await page.evaluate((n) => window.stage.showIframe(n), d.name);
        const ib = await page.locator(`iframe[name="${d.name}"]`).boundingBox();
        await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height * 0.34);
        await page.mouse.wheel(0, d.zoom);
      }
      if (d.zoom || d.view) await sleep(1700); // カメラが動き終わるのを待つ（実時間）
      await fr.evaluate(() => { window.__hold = true; });
    }
    await page.evaluate(() => document.fonts.ready);
    lap('全フレームの読み込み完了');
    await page.evaluate(() => window.stage.showIframe('f-main')); // 部分撮影（途中のコマだけ）でも、最初から本体フレームを押せるようにする
    const main = frames['f-main'];
    // ---- 状態 ----
    const S = { iframe: 'f-main', alsoLive: new Set(), finger: { x: 0, y: 0, alpha: 0, press: false }, fingerSeg: null, fingerFade: null, tapAt: null, tapPos: null,
      flashAt: null, punch: null, rings: [], montage: null, endAt: null, callout: null, stroke: null, result: null };
    const isLive = (name) => name === S.iframe || S.alsoLive.has(name);
    const syncHold = async () => { for (const d of FRAME_DEFS) await frames[d.name].evaluate((hold) => { window.__hold = hold; }, !isLive(d.name)); };
    const setIframe = async (name) => { S.iframe = name; S.alsoLive.clear(); await page.evaluate((n) => window.stage.showIframe(n), name); await syncHold(); };
    // 時計を ms 進め、見えている画面の描画を1回流す（1コマ＝描画1回。時刻は 1/30 秒刻みで一定）
    const step = async (ms) => {
      if (ms > 0) await context.clock.runFor(ms);
      for (const d of FRAME_DEFS) if (isLive(d.name)) await frames[d.name].evaluate(() => window.__flush());
    };
    // 自動再生する画面（freeze でないもの）は、進み具合を先頭に戻して、再生中にしてから時計を止める
    for (const d of FRAME_DEFS.filter((x) => !x.freeze)) {
      const fr = frames[d.name];
      await fr.evaluate(() => { const s = document.querySelector('[data-testid="slider-u"]'); s.value = '0'; s.dispatchEvent(new Event('input', { bubbles: true })); });
      if ((await fr.getByTestId('btn-play').getAttribute('aria-pressed')) !== 'true') await press(d.name, 'btn-play');
    }
    await context.clock.pauseAt(new Date('2026-11-22T10:20:00+09:00'));
    for (const d of FRAME_DEFS) await frames[d.name].evaluate(() => { window.__mode = 'manual'; });
    await syncHold();
    // 1コマ目は動いているところ：先頭から runMs だけ進めておく（1/30秒ずつ）
    for (let i = 0; i < Math.round(T.PRE_ROLL.runMs / (1000 / FPS)); i++) await step(Math.round((i + 1) * 1000 / FPS) - Math.round(i * 1000 / FPS));

    lap('時計を止めて、先送り完了');
    const boxOf = async (loc) => { const b = await loc.boundingBox(); if (!b) throw new Error('target has no box'); return b; };
    const resolveTarget = (spec, fr) => {
      const frame = frames[fr];
      if (spec.testid) return frame.getByTestId(spec.testid).first();
      if (spec.css) return frame.locator(spec.css).nth(spec.nth ?? 0);
      return frame.getByRole(spec.role, { name: spec.name }).nth(spec.nth ?? 0);
    };
    const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    // ---- 操作の予定表（時刻順）。tap は「指が着く」予定と「押す」予定の2つに分ける ----
    const queue = [];
    const push = (at, order, fn, info = {}) => queue.push({ at, order, fn, ...info });
    let prevTapAt = -1;
    for (const a of T.ACTIONS) {
      if (a.type === 'tap') {
        const lead = 0.42, prev = prevTapAt;
        const start = Math.min(prev < 0 ? Math.max(0, a.at - lead) : Math.max(prev + 0.06, a.at - lead), a.at - 0.16);
        prevTapAt = a.at;
        push(start, 2, async (t) => {
          const c0 = center(await boxOf(resolveTarget(a.target, a.frame))), c = { x: c0.x + (a.target.dx ?? 0), y: c0.y + (a.target.dy ?? 0) };
          S.fingerSeg = { t0: t, t1: a.at - 0.03, from: { x: S.finger.x, y: S.finger.y }, to: { x: c.x + 15, y: c.y + 17 } };
          if (S.finger.alpha < 0.5) { // 見えていないときは、対象の少し下から入ってくる
            S.finger.x = Math.min(510, Math.max(30, c.x + 40)); S.finger.y = Math.min(940, c.y + 110);
            S.fingerSeg.from = { x: S.finger.x, y: S.finger.y };
          }
          if (S.finger.alpha < 1) S.fingerFade = { t0: t, t1: t + 0.18, from: S.finger.alpha, to: 1 };
        }, { type: 'approach' });
        push(a.at, 3, async (t) => {
          const c0 = center(await boxOf(resolveTarget(a.target, a.frame))), c = { x: c0.x + (a.target.dx ?? 0), y: c0.y + (a.target.dy ?? 0) };
          S.finger.x = c.x + 15; S.finger.y = c.y + 17; S.fingerSeg = null; S.tapAt = t; S.tapPos = c;
          await page.touchscreen.tap(c.x, c.y);
          if (a.flash) S.flashAt = t;
          const nextTap = T.ACTIONS.find((x) => x.type === 'tap' && x.at > a.at + 1e-6);
          if (!nextTap || nextTap.at - a.at > 0.9) S.fingerLeave = { t0: t + 0.2, t1: t + 0.35 };
        }, { type: 'tap', target: a.target });
      } else if (a.type === 'show') {
        push(a.at, 0, async (t) => {
          await setIframe(a.frame);
          if (a.flash) S.flashAt = t;
          const followTap = T.ACTIONS.find((x) => x.type === 'tap' && x.at > a.at && x.at - a.at < 0.9);
          if (!followTap) S.fingerFade = { t0: t, t1: t + 0.05, from: S.finger.alpha, to: 0 };
          if (a.play) { if ((await frames[a.frame].getByTestId('btn-play').getAttribute('aria-pressed')) !== 'true') await press(a.frame, 'btn-play'); }
        }, { type: 'show', frame: a.frame });
      } else if (a.type === 'restore') {
        // 見えていない間に、押してあるトグルを元へ戻す（描画を流しながら、ふつうの click を送る）
        push(a.at, 0, async () => {
          S.alsoLive.add(a.frame); await syncHold();
          const fr = frames[a.frame];
          for (const id of a.untoggle || []) if ((await fr.getByTestId(id).getAttribute('aria-pressed')) === 'true') await press(a.frame, id);
        }, { type: 'restore' });
      } else if (a.type === 'ring') {
        push(a.at, 0, async (t) => { const loc = resolveTarget(a.target, a.frame); const b = await boxOf(loc); S.rings.push({ t0: t, loc, box: b, hold: a.hold ?? 0.5 }); }, { type: a.type });
      } else if (a.type === 'montage') {
        T.FISH.forEach((f, n) => push(a.at + n * a.per, 0, async (t) => { S.montage = { t0: t, per: a.per }; S.punch = null; await setIframe(`f-m-${f.key}`); }, { type: 'montage', fish: f.key }));
      } else if (a.type === 'stroke') {
        push(a.at, 0, async (t) => {
          const fr = frames[a.frame];
          const guide = await fr.evaluate(() => window.__sabaki.practiceGuide());
          if (!guide) throw new Error('practiceGuide が null（練習になっていません）');
          // 画面の座標へ：iframe の箱（拡大後）から、フレーム内の CSS px を写す
          const ib = await boxOf(page.locator(`iframe[name="${a.frame}"]`));
          const kx = ib.width / T.STAGE.app.viewport.width, ky = ib.height / T.STAGE.app.viewport.height;
          const pts = guide.points.map((p) => ({ x: ib.x + p.x * kx, y: ib.y + p.y * ky }));
          const start = { x: ib.x + guide.start.x * kx, y: ib.y + guide.start.y * ky };
          const d = [0]; for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
          S.stroke = { t0: t, t1: t + a.over, pts, d, total: d.at(-1), start, wobble: a.wobble ?? 0, down: false, last: null, frame: a.frame };
          S.finger.x = start.x; S.finger.y = start.y; S.fingerFade = { t0: t - 0.2, t1: t, from: S.finger.alpha, to: 1 };
        }, { type: 'stroke-start' });
      } else if (a.type === 'callout') {
        push(a.at, 0, async (t) => {
          let lines = a.lines;
          if (a.result) {
            const fr = frames['f-practice'];
            const read = await fr.evaluate(() => {
              const root = document.querySelector('[data-testid="practice-result"]');
              const t = (sel) => root?.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim();
              return { score: t('.result-score strong'), grade: t('.result-grade span:last-child'), label: t('.result-metric-label'),
                metrics: [...(root?.querySelectorAll('.result-metrics > div') || [])].map((d) => d.textContent.replace(/\s+/g, ' ').trim()).join(' / ') };
            });
            report.practice = read;
            if (!read.score) throw new Error('練習の結果カードが出ていません');
            const rank = (read.grade || '').match(/ランク\s*([A-Z])/)?.[1] ?? '';
            lines = [read.label || 'ガイドとの一致度', `${read.score}点${rank ? `　ランク${rank}` : ''}`];
          }
          S.callout = { t0: t, hold: a.hold, tone: a.tone, lines };
        }, { type: a.type });
      } else if (a.type === 'end-card') {
        push(a.at, 0, async (t) => { S.endAt = t; S.fingerFade = { t0: t, t1: t + 0.1, from: S.finger.alpha, to: 0 }; }, { type: a.type });
      }
    }
    queue.sort((x, y) => x.at - y.at || x.order - y.order);

    // ---- コマ送り ----
    const started = Date.now();
    for (let f = 0; f < T.TOTAL_FRAMES; f++) {
      if (partial && f > rangeTo) break;
      const t = f / FPS;
      while (queue.length && queue[0].at <= t + 1e-6) {
        const q = queue.shift();
        try { await q.fn(t); report.actions.push({ frame: f, at: Math.round(q.at * 1000) / 1000, type: q.type, ...(q.fish ? { fish: q.fish } : {}) }); }
        catch (e) { report.warnings.push(`frame ${f} ${q.type}: ${String(e.message).split('\n')[0]}`); }
      }
      // 連続する動き
      if (S.fingerFade) { const p = clamp((t - S.fingerFade.t0) / (S.fingerFade.t1 - S.fingerFade.t0)); S.finger.alpha = S.fingerFade.from + (S.fingerFade.to - S.fingerFade.from) * p; if (p >= 1) S.fingerFade = null; }
      if (S.fingerLeave && t >= S.fingerLeave.t0 && !S.fingerFade) { S.fingerFade = { t0: S.fingerLeave.t0, t1: S.fingerLeave.t1, from: S.finger.alpha, to: 0 }; S.fingerLeave = null; }
      if (S.fingerSeg) { const g = S.fingerSeg, p = easeInOut(clamp((t - g.t0) / (g.t1 - g.t0))); S.finger.x = g.from.x + (g.to.x - g.from.x) * p; S.finger.y = g.from.y + (g.to.y - g.from.y) * p - 10 * Math.sin(Math.PI * p); }
      if (S.stroke) { // 練習の一筆：線の上を等速でなぞる（わずかにゆれる）。実際の指の入力として送る
        const g = S.stroke, p = clamp((t - g.t0) / (g.t1 - g.t0));
        const s = g.total * p;
        let i = 1; while (i < g.pts.length - 1 && g.d[i] < s) i++;
        const a0 = g.pts[i - 1], b0 = g.pts[i], len = g.d[i] - g.d[i - 1] || 1, u = clamp((s - g.d[i - 1]) / len);
        const dx = b0.x - a0.x, dy = b0.y - a0.y, norm = Math.hypot(dx, dy) || 1;
        const wob = g.wobble * Math.sin(p * Math.PI * 7) * Math.sin(p * Math.PI);
        const x = a0.x + dx * u + (-dy / norm) * wob, y = a0.y + dy * u + (dx / norm) * wob;
        const pos = p <= 0 ? g.start : p >= 1 ? g.pts.at(-1) : { x, y };
        S.finger.x = pos.x; S.finger.y = pos.y; S.finger.alpha = 1; S.finger.press = true;
        if (!g.down) { await page.mouse.move(g.start.x, g.start.y); await page.mouse.down(); g.down = true; }
        await page.mouse.move(pos.x, pos.y);
        if (p >= 1) { await page.mouse.up(); S.stroke = null; S.finger.press = false; S.fingerFade = { t0: t + 0.5, t1: t + 0.7, from: 1, to: 0 }; }
      }
      if (f > 0) await step(Math.round(f * 1000 / FPS) - Math.round((f - 1) * 1000 / FPS));
      if (f < rangeFrom || f > rangeTo) continue;

      // 重ね物
      const caption = captionAt(t);
      const hls = [];
      for (const r of S.rings) { // 枠は、印や札の動きについていく（毎コマ測り直す）。要素が消えたら、直前の位置のまま
        const dt = t - r.t0; if (!(dt >= 0 && dt < r.hold)) continue;
        try { r.box = (await r.loc.boundingBox()) ?? r.box; } catch { /* keep */ }
        const pad = 5; hls.push({ x: r.box.x - pad, y: r.box.y - pad, w: r.box.width + pad * 2, h: r.box.height + pad * 2, alpha: dt < 0.12 ? dt / 0.12 : dt > r.hold - 0.25 ? clamp((r.hold - dt) / 0.25) : 1 });
      }
      const ripple = S.tapAt != null && t - S.tapAt < 0.45 ? { x: S.tapPos.x, y: S.tapPos.y, p: clamp((t - S.tapAt) / 0.45) } : null;
      const press = S.stroke != null || (S.tapAt != null && t - S.tapAt < 0.12);
      let callout = null;
      if (S.callout && t - S.callout.t0 >= 0 && t - S.callout.t0 < S.callout.hold) {
        const dt = t - S.callout.t0, pin = easeOut(clamp(dt / 0.16)), pout = clamp((S.callout.hold - dt) / 0.25);
        callout = { lines: S.callout.lines, tone: S.callout.tone, alpha: Math.min(pin, pout), scale: 0.86 + 0.14 * pin };
      }
      const flash = S.flashAt != null && t - S.flashAt < 0.18 ? 0.28 * (1 - (t - S.flashAt) / 0.18) : 0;
      const endP = S.endAt != null ? easeOut(clamp((t - S.endAt) / 0.5)) : 0;
      await page.evaluate((s) => window.stage.apply(s), {
        iframe: S.iframe, caption, labels: [], hls, ripple,
        finger: S.finger.alpha > 0.01 ? { x: S.finger.x, y: S.finger.y, alpha: S.finger.alpha, press } : null,
        badge: null, flash, end: S.endAt != null ? { p: endP } : null, blur: endP,
        appScale: S.punch && t - S.punch.t0 < 0.22 ? 1 + S.punch.amp * (1 - easeOut(clamp((t - S.punch.t0) / 0.22))) : 1, appOrigin: null, callout,
      });
      await page.screenshot({ path: join(frameDir, `${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 95, timeout: 180_000 });
      if (f % 60 === 0) console.log(`frame ${f}/${T.TOTAL_FRAMES}  t=${t.toFixed(2)}s  ${Math.round((Date.now() - started) / 1000)}s elapsed`);
    }
    report.msPerFrame = Math.round((Date.now() - started) / Math.max(1, Math.min(T.TOTAL_FRAMES, (partial ? rangeTo : T.TOTAL_FRAMES))));
    if (pageErrors.length) report.warnings.push(...pageErrors.slice(0, 8));
    // 音の合図（絵コンテの時刻をコマに合わせる）。音楽側が --cues で読める
    const frameOf = (at) => Math.ceil(at * FPS - 1e-6) / FPS;
    for (const c of T.CUES) cuesOut.push({ ...c, at: Math.round(frameOf(c.at) * 1000) / 1000 });
    writeFileSync(join(outDir, 'cues.json'), JSON.stringify({ cues: cuesOut }, null, 1));
  } finally {
    await browser.close();
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  }
  writeFileSync(join(outDir, partial ? `capture-report-${rangeFrom}-${rangeTo}.json` : 'capture-report.json'), JSON.stringify(report, null, 1));
  console.log(`撮影おわり: ${report.msPerFrame} ms/コマ・警告 ${report.warnings.length}件`);
  for (const w of report.warnings.slice(0, 12)) console.log('  警告:', w);
  if (partial || flag('no-encode')) return;
  encode();
}

function run(cmd, args) { const r = spawnSync(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' }); if (r.status !== 0) throw new Error(`${cmd} failed: ${(r.stderr || '').slice(-400)}`); return r; }
function encode() {
  const silent = join(outDir, 'silent.mp4');
  run(ffmpeg, ['-y', '-framerate', String(FPS), '-i', join(frameDir, '%04d.jpg'), '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-color_range', 'tv', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-map_metadata', '-1', '-an', silent]);
  run(ffmpeg, ['-y', '-i', join(frameDir, '0000.jpg'), '-frames:v', '1', join(outDir, 'first-frame.png')]);
  run(ffmpeg, ['-y', '-i', silent, '-vf', 'fps=1,scale=216:-1,tile=10x3', '-frames:v', '1', '-q:v', '3', join(outDir, 'contact-sheet.jpg')]);
  const mux = (opt('mux', '') || '').split(',').filter(Boolean), audioDir = opt('audio-dir', '');
  for (const v of mux) {
    const wav = join(resolve(audioDir), `bgm_${v}.wav`);
    if (!existsSync(wav)) { console.log(`音が見つかりません: ${wav}`); continue; }
    run(ffmpeg, ['-y', '-i', silent, '-i', wav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-af', `apad=whole_dur=${T.DURATION_SECONDS}`, '-t', String(T.DURATION_SECONDS), '-movflags', '+faststart', '-map_metadata', '-1', join(outDir, `${v}.mp4`)]);
  }
  const probe = spawnSync(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames,duration,pix_fmt', '-of', 'default=nw=1', silent], { encoding: 'utf8' });
  console.log(probe.stdout.trim().replace(/\n/g, '  '));
}
if (flag('encode-only')) encode(); else await main();
