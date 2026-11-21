// Day096 宣伝動画の撮影・書き出し。ステージ（stage.html）の中でアプリを実際に操作し、1/30秒ずつ時計を進めて1コマずつ撮る。
// 絵コンテの正本は timeline.mjs。使い方:
//   node day-096-ux-recipe/tools/promo/render-promo.mjs --out-dir <出力先> [--frames 300-420] [--no-encode] [--audio-dir <bgm_a.wav等の場所>] [--mux a,b]
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
const outDir = resolve(opt('out-dir', join(tmpdir(), 'day096-promo', 'render'))); // リポジトリの外（生成物をコミットしない）
const framesArg = opt('frames', '');
const [rangeFrom, rangeTo] = framesArg ? framesArg.split('-').map(Number) : [0, T.TOTAL_FRAMES - 1];
const partial = Boolean(framesArg);
const frameDir = partial ? join(outDir, `preview-${rangeFrom}-${rangeTo}`) : join(outDir, 'frames');
const basePort = Number(opt('port', 4296));
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
const GOAL_KEYS = T.GOALS.map((g) => g.key);
const frameNames = ['f-main', ...GOAL_KEYS.map((k) => `g-${k}`)];
function captionAt(t) {
  const c = T.CAPTIONS.find((x) => t >= x.start - 1e-9 && t < x.end - 1e-9);
  if (!c) return null;
  const local = t - c.start;
  const rise = c.start === 0 ? 1 : easeOut(clamp(local / 0.16)); // 透明にはしない（切り替わりの途中のコマを作らない）。下から14px上がるだけ
  let lines = c.lines, accentFrom = null, dots = null;
  if (c.goals) {
    const n = clamp(Math.floor((t - c.start) / T.BEAT + 1e-6), 0, T.GOALS.length - 1);
    lines = [c.lines[0], T.GOALS[n].label]; accentFrom = 1; dots = { n: T.GOALS.length, on: n };
  }
  return { lines, big: Boolean(c.big), accentFrom, dots, alpha: 1, dy: Math.round((1 - rise) * 14) };
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  if (!partial) rmSync(frameDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });
  const servers = await Promise.all(frameNames.map((_, i) => listen(basePort + i)));
  const browser = await chromium.launch();
  const report = { fps: FPS, total: T.TOTAL_FRAMES, range: [rangeFrom, rangeTo], actions: [], observations: [], warnings: [], msPerFrame: 0 };
  const cuesOut = [];
  try {
    const context = await browser.newContext({ viewport: { width: T.STAGE.width, height: T.STAGE.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    context.setDefaultTimeout(8000);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Blocked autofocusing/.test(m.text())) pageErrors.push(`console: ${m.text()}`.slice(0, 200)); });
    // 本体フレームは本番と同じ住所（共有リンクに映る）。実際の通信はせず、手元のファイルで応答する。それ以外の rairakku.com へのアクセスは404にして外へ出さない。
    const PROD_PREFIX = '/100days/day-096-ux-recipe/';
    await context.route('https://rairakku.com/**', async (r) => {
      const u = new URL(r.request().url());
      if (!u.pathname.startsWith(PROD_PREFIX)) return r.fulfill({ status: 404, body: 'not found' });
      let rel = decodeURIComponent(u.pathname.slice(PROD_PREFIX.length));
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      const hit = route(`/app/${rel}`);
      if (!hit) return r.fulfill({ status: 404, body: 'not found' });
      return r.fulfill({ status: 200, headers: { 'content-type': MIME[extname(hit.file)] || 'application/octet-stream', 'cache-control': 'no-store', ...appHeaders }, body: readFileSync(hit.file) });
    });
    await context.clock.install({ time: new Date('2026-11-21T10:00:00+09:00') });
    await page.goto(`http://127.0.0.1:${basePort}/stage/stage.html`);
    await page.evaluate((cfg) => window.stage.init(cfg), {
      stages: T.STAGES, end: T.END_CARD, app: T.STAGE.app,
      iframes: frameNames.map((name, i) => ({ name, url: name === 'f-main' ? 'https://rairakku.com/100days/day-096-ux-recipe/?fresh=1&tips=0' : `http://127.0.0.1:${basePort + i}/app/index.html?goal=${name.slice(2)}&tips=0` })),
    });
    for (let i = 0; i < 200 && frameNames.some((n) => !page.frame({ name: n })); i++) await sleep(100);
    const frames = Object.fromEntries(frameNames.map((n) => [n, page.frame({ name: n })]));
    if (Object.values(frames).some((x) => !x)) throw new Error('アプリのフレームが開きません');
    for (const n of frameNames) await frames[n].waitForSelector('#app[data-ready="true"]', { timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    for (const g of GOAL_KEYS) { // 目的ごとのページが組み上がっていること
      await frames[`g-${g}`].waitForSelector('#screen-edit:not([hidden])', { timeout: 15_000 });
    }
    await page.evaluate(() => window.stage.showIframe('f-main')); // 部分撮影（途中のコマだけ）でも、最初から本体フレームを押せるようにする
    await page.clock.pauseAt(new Date('2026-11-21T10:00:05+09:00'));
    const main = frames['f-main'];

    // ---- 状態 ----
    const S = { iframe: 'f-main', finger: { x: 0, y: 0, alpha: 0, press: false }, fingerSeg: null, fingerFade: null, tapAt: null, tapPos: null,
      badge: null, flashAt: null, scrolls: [], chips: null, rings: [], montage: null, endAt: null, labels: [], hls: [] };
    const setIframe = async (name) => { S.iframe = name; await page.evaluate((n) => window.stage.showIframe(n), name); };
    const boxOf = async (loc) => { const b = await loc.boundingBox(); if (!b) throw new Error('target has no box'); return b; };
    const resolveTarget = (frame, spec) => {
      if (spec.tab) return frame.getByRole('tab', { name: spec.tab, exact: true }).first();
      if (spec.row) return frame.locator('#panel-outline li.ed-row').filter({ hasText: spec.row }).first().getByRole('button', { name: spec.button, exact: true }).first();
      if (spec.css) return (spec.text ? frame.locator(spec.css).filter({ hasText: spec.text }) : frame.locator(spec.css)).nth(spec.nth ?? 0);
      const loc = frame.getByRole(spec.role, { name: spec.name });
      return loc.nth(spec.nth ?? 0);
    };
    const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    // 対象が入るスクロール領域を探し、見える位置までの移動量（実際に動ける分）を返す。動かすのは毎コマ（S.panelScroll）。
    const planScroll = (loc, block) => loc.evaluate((e, blk) => {
      const anchor = e.closest('.cs-field, details, li.ed-row') || e;
      let c = anchor.parentElement;
      while (c && !(c.scrollHeight > c.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(c).overflowY))) c = c.parentElement;
      if (!c) { window.__ps = null; return { delta: 0 }; }
      const cr = c.getBoundingClientRect(), er = anchor.getBoundingClientRect();
      let to;
      if (anchor.matches('li.ed-row')) { // 行が半分切れないよう、行の境目にそろえる
        const first = anchor.parentElement.firstElementChild;
        const pitch = anchor.nextElementSibling ? anchor.nextElementSibling.getBoundingClientRect().top - er.top : (anchor.previousElementSibling ? er.top - anchor.previousElementSibling.getBoundingClientRect().top : 58);
        const base = first.getBoundingClientRect().top - cr.top + c.scrollTop;
        const want = cr.top + (cr.height - er.height) / 2;
        to = base + Math.round((c.scrollTop + (er.top - want) - base) / pitch) * pitch;
      } else {
        const want = blk === 'start' ? cr.top + 6 : cr.top + (cr.height - er.height) / 2;
        to = c.scrollTop + (er.top - want);
      }
      to = Math.max(0, Math.min(c.scrollHeight - c.clientHeight, to));
      window.__ps = { c, from: c.scrollTop, to };
      return { delta: to - c.scrollTop };
    }, block);
    const observe = async (label, t) => {
      const txt = async (sel) => (await main.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      const st = await main.evaluate(() => ({ active: document.activeElement?.tagName, sel: String(getSelection()).slice(0, 20) }));
      report.observations.push({ t, label, score: await txt('[data-score]'), meter: await txt('.ed-meter'), ...st });
    };

    // ---- 操作の予定表（時刻順）。tap は「指が着く」予定と「押す」予定の2つに分ける ----
    const queue = [];
    const push = (at, order, fn, info = {}) => queue.push({ at, order, fn, ...info });
    let prevTapAt = -1;
    for (const a of T.ACTIONS) {
      if (a.type === 'tap') {
        // 指は、前のタップの直後（0.06秒後）か押す0.42秒前のどちらか遅いほうから動き出す（移動は最短0.16秒）
        const lead = a.scrollLead ?? 0.42;
        const prev = prevTapAt;
        const start = Math.min(prev < 0 ? Math.max(0, a.at - lead) : Math.max(prev + 0.06, a.at - lead), a.at - 0.16);
        prevTapAt = a.at;
        if (a.scrollInto === 'instant') { // 前のタップ（タブ）の直後に、画面の中身を一瞬で動かしておく（途中のコマを作らない）
          push(Math.max(0, prev < 0 ? a.at - 0.5 : prev + 0.034), 1, async () => {
            await planScroll(resolveTarget(main, a.target), a.scrollBlock || 'center');
            await main.evaluate(() => { const q = window.__ps; if (q) q.c.scrollTop = q.to; });
          }, { type: 'scrollInstant' });
        }
        push(start, 2, async (t) => {
          const loc = resolveTarget(main, a.target);
          const plan = a.scrollInto === true ? await planScroll(loc, a.scrollBlock || 'center') : null;
          const b = await boxOf(loc); const c = center(b);
          if (plan && Math.abs(plan.delta) > 0.5) { c.y -= plan.delta * T.APP_SCALE; S.panelScroll = { t0: t, t1: t + Math.min(0.4, a.at - 0.03 - t) }; }
          S.fingerSeg = { t0: t, t1: a.at - 0.03, from: { x: S.finger.x, y: S.finger.y }, to: c };
          if (S.finger.alpha < 0.5) { // 見えていないときは、対象の少し下から入ってくる
            S.finger.x = Math.min(510, Math.max(30, c.x + 34)); S.finger.y = Math.min(940, c.y + 90);
            S.fingerSeg.from = { x: S.finger.x, y: S.finger.y };
          }
          if (S.finger.alpha < 1) S.fingerFade = { t0: t, t1: t + 0.18, from: S.finger.alpha, to: 1 };
        }, { type: 'approach' });
        push(a.at, 3, async (t) => {
          const b = await boxOf(resolveTarget(main, a.target)); const c = center(b);
          S.finger.x = c.x; S.finger.y = c.y; S.fingerSeg = null; S.tapAt = t; S.tapPos = c;
          await page.touchscreen.tap(c.x, c.y);
          const nextTap = T.ACTIONS.find((x) => x.type === 'tap' && x.at > a.at + 1e-6);
          if (a.leave !== undefined || !nextTap || nextTap.at - a.at > 0.9) S.fingerLeave = { t0: t + (a.leave ?? 0.2), t1: t + (a.leave ?? 0.2) + 0.15 };
          if (a.wait === 'editor') { await main.waitForSelector('#screen-edit:not([hidden])', { timeout: 10_000 }); S.flashAt = t; S.punch = { t0: t, amp: 0.025 }; }
          if (a.wait === 'dialog') await main.waitForSelector('dialog[open]', { timeout: 10_000 });
          if (a.badge) {
            const sb = await boxOf(main.locator('[data-score]').first());
            await page.clock.runFor(34);
            S.badge = { t0: t, text: a.badge.text, kind: a.badge.text.startsWith('+') ? 'plus' : 'minus', x: sb.x + sb.width / 2 - 28, y: sb.y + sb.height + 10 };
          }
          await observe(`tap ${JSON.stringify(a.target)}`, t);
        }, { type: 'tap', target: a.target });
      } else if (a.type === 'finger-from') {
        push(a.at, 0, async () => { Object.assign(S.finger, { x: a.x, y: a.y, alpha: 1 }); }, { type: a.type });
      } else if (a.type === 'finger-to') {
        push(a.at, 0, async (t) => { const c = center(await boxOf(resolveTarget(main, a.target))); S.fingerSeg = { t0: t, t1: t + a.over, from: { x: S.finger.x, y: S.finger.y }, to: c }; }, { type: a.type });
      } else if (a.type === 'finger-hide') {
        push(a.at, 0, async (t) => { S.fingerFade = { t0: t, t1: t + 0.2, from: S.finger.alpha, to: 0 }; }, { type: a.type });
      } else if (a.type === 'callout') {
        push(a.at, 0, async (t) => { S.callout = { t0: t, hold: a.hold, tone: a.tone, lines: a.lines }; }, { type: a.type });
      } else if (a.type === 'zoom') {
        push(a.at, 0, async (t) => { S.zoom = { t0: t, scale: a.scale, origin: a.origin, tin: a.tin, hold: a.hold, tout: a.tout }; }, { type: a.type });
      } else if (a.type === 'panel-top') {
        push(a.at, 0, async () => { await main.evaluate((sel) => { let c = document.querySelector(sel); while (c && !(c.scrollHeight > c.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(c).overflowY))) c = c.parentElement; if (c) c.scrollTop = 0; }, a.target.css); }, { type: a.type });
      } else if (a.type === 'finger-show') {
        push(a.at, 0, async (t) => { Object.assign(S.finger, { x: 470, y: 930 }); S.fingerFade = { t0: t, t1: t + 0.2, from: 0, to: 1 }; }, { type: a.type });
      } else if (a.type === 'scroll') {
        push(a.at, 0, async (t) => {
          const info = await main.evaluate((name) => {
            let c = name === 'outline' ? document.querySelector('#panel-outline li.ed-row')?.parentElement : document.querySelector('.ed-preview-scroll');
            while (c && !(c.scrollHeight > c.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(c).overflowY))) c = c.parentElement;
            return c ? { max: c.scrollHeight - c.clientHeight, now: c.scrollTop } : { max: 0, now: 0 };
          }, a.el);
          const from = a.from === 'max' ? info.max : a.from === 'current' ? info.now : a.from;
          S.scrolls.push({ t0: t, t1: t + a.over, el: a.el, from, to: a.to === 'max' ? info.max : Math.min(a.to, info.max), ease: a.ease });
          if (a.to !== 'max' && a.to > info.max) report.warnings.push(`scroll to ${a.to} clamped to ${info.max}`);
        }, { type: a.type });
      } else if (a.type === 'chips') {
        push(a.at, 0, async (t) => {
          const boxes = [];
          for (let i = 0; i < T.STAGES.length; i++) boxes.push(await boxOf(main.locator('.ed-meter li').nth(i)));
          S.chips = { t0: t, boxes, times: a.times, end: T.bar(4) };
        }, { type: a.type });
      } else if (a.type === 'select-all') {
        push(a.at, 0, async (t) => {
          // 入力欄の中身を選ぶ。キーボードの全選択は、この撮り方（拡大したフレーム）では入力欄の外の語（言い換え候補）が選ばれた
          const sel = await main.evaluate(() => { const e = document.activeElement; if (e && typeof e.select === 'function') e.select(); return { active: e?.tagName, selected: String(getSelection()).slice(0, 30), inField: e?.tagName === 'TEXTAREA' }; });
          report.observations.push({ t, label: 'select-all', ...sel });
          if (!sel.inField) report.warnings.push(`select-all: 入力欄にフォーカスがありません (${sel.active})`);
        }, { type: a.type });
      } else if (a.type === 'type') {
        [...a.text].forEach((ch, i) => push(a.at + i * a.per, 0, async () => { await page.keyboard.insertText(ch); }, { type: 'key' }));
      } else if (a.type === 'ring') {
        push(a.at, 0, async (t) => { const b = await boxOf(resolveTarget(main, a.target)); S.rings.push({ t0: t, box: b, hold: a.hold ?? 0.5 }); }, { type: a.type });
      } else if (a.type === 'montage') {
        a.goals.forEach((g, n) => push(a.at + n * a.per, 0, async (t) => { S.montage = { t0: t, per: a.per }; S.punch = { t0: t, amp: 0.025 }; await frames[`g-${g}`].evaluate(() => { document.querySelector('.ed-preview-scroll').scrollTop = 0; }); await setIframe(`g-${g}`); }, { type: 'montage', goal: g }));
      } else if (a.type === 'end-card') {
        push(a.at, 0, async (t) => { S.endAt = t; S.fingerFade = { t0: t, t1: t + 0.1, from: S.finger.alpha, to: 0 }; }, { type: a.type });
      }
    }
    queue.sort((x, y) => x.at - y.at || x.order - y.order);
    // 共有ダイアログは本体フレームの上に出るので、montage 後は f-main に戻す
    push(T.at(11, 0) - 0.001, 0, async () => { S.montage = null; await setIframe('f-main'); }, { type: 'back-to-main' });
    queue.sort((x, y) => x.at - y.at || x.order - y.order);

    // ---- コマ送り ----
    const started = Date.now();
    for (let f = 0; f < T.TOTAL_FRAMES; f++) {
      if (partial && f > rangeTo) break;
      const t = f / FPS;
      while (queue.length && queue[0].at <= t + 1e-6) {
        const q = queue.shift();
        try { await q.fn(t); report.actions.push({ frame: f, at: Math.round(q.at * 1000) / 1000, type: q.type, ...(q.goal ? { goal: q.goal } : {}) }); }
        catch (e) { report.warnings.push(`frame ${f} ${q.type}: ${String(e.message).split('\n')[0]}`); }
      }
      // 連続する動き
      if (S.fingerFade) { const p = clamp((t - S.fingerFade.t0) / (S.fingerFade.t1 - S.fingerFade.t0)); S.finger.alpha = S.fingerFade.from + (S.fingerFade.to - S.fingerFade.from) * p; if (p >= 1) S.fingerFade = null; }
      if (S.fingerLeave && t >= S.fingerLeave.t0 && !S.fingerFade) { S.fingerFade = { t0: S.fingerLeave.t0, t1: S.fingerLeave.t1, from: S.finger.alpha, to: 0 }; S.fingerLeave = null; }
      if (S.fingerSeg) { const g = S.fingerSeg, p = easeInOut(clamp((t - g.t0) / (g.t1 - g.t0))); S.finger.x = g.from.x + (g.to.x - g.from.x) * p; S.finger.y = g.from.y + (g.to.y - g.from.y) * p - 10 * Math.sin(Math.PI * p); }
      for (const sc of S.scrolls) {
        if (t < sc.t0) continue;
        const p = clamp((t - sc.t0) / (sc.t1 - sc.t0)), y = sc.from + (sc.to - sc.from) * (sc.ease === 'inOut' ? easeInOut(p) : p);
        if (!sc.done) await main.evaluate(([name, v]) => {
          let c = name === 'outline' ? document.querySelector('#panel-outline li.ed-row')?.parentElement : document.querySelector('.ed-preview-scroll');
          while (c && !(c.scrollHeight > c.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(c).overflowY))) c = c.parentElement;
          if (c) c.scrollTop = v;
        }, [sc.el, y]);
        if (p >= 1) sc.done = true;
      }
      if (S.panelScroll) {
        const g = S.panelScroll, p = easeInOut(clamp((t - g.t0) / (g.t1 - g.t0)));
        await main.evaluate((v) => { const q = window.__ps; if (q) q.c.scrollTop = q.from + (q.to - q.from) * v; }, p);
        if (t >= g.t1) S.panelScroll = null;
      }
      if (S.montage && S.iframe.startsWith('g-')) { // 切り替えた1コマごとに、ページを少しずつ流す
        const p = clamp((t - S.montage.t0) / S.montage.per); const name = S.iframe;
        const before = Math.floor(S.montage.t0 / T.BEAT + 1e-6);
        await frames[name].evaluate((v) => { document.querySelector('.ed-preview-scroll').scrollTop = v; }, Math.round(90 * p) + (before % 2) * 0);
      }
      if (f > 0) await page.clock.runFor(Math.round((f + 1) * 1000 / FPS) - Math.round(f * 1000 / FPS));
      if (f < rangeFrom || f > rangeTo) continue;

      // 重ね物
      const caption = captionAt(t);
      const labels = [], hls = [];
      if (S.chips) {
        const c = S.chips, lit = (i) => t - (c.t0 + c.times[i]);
        c.boxes.forEach((b, i) => {
          const dt = lit(i); if (dt < 0 || t >= c.end) return;
          labels.push({ x: b.x + b.width / 2, y: b.y + b.height + 8, text: T.STAGES[i].label, alpha: easeOut(clamp(dt / 0.15)) * (t > c.end - 0.2 ? clamp((c.end - t) / 0.2) : 1) });
          hls.push({ x: b.x, y: b.y, w: b.width, h: b.height, alpha: dt < 0.3 ? 1 - 0.35 * (dt / 0.3) : 0.65 });
        });
      }
      for (const r of S.rings) { const dt = t - r.t0; if (dt >= 0 && dt < r.hold) hls.push({ x: r.box.x, y: r.box.y, w: r.box.width, h: r.box.height, alpha: dt < 0.12 ? dt / 0.12 : dt > r.hold - 0.25 ? clamp((r.hold - dt) / 0.25) : 1 }); }
      const ripple = S.tapAt != null && t - S.tapAt < 0.45 ? { x: S.tapPos.x, y: S.tapPos.y, p: clamp((t - S.tapAt) / 0.45) } : null;
      const press = S.tapAt != null && t - S.tapAt < 0.12;
      const badge = S.badge && t - S.badge.t0 < 1.0 ? { ...S.badge, p: (t - S.badge.t0) / 1.0 } : null;
      let callout = null;
      if (S.callout && t - S.callout.t0 >= 0 && t - S.callout.t0 < S.callout.hold) {
        const dt = t - S.callout.t0, pin = easeOut(clamp(dt / 0.16)), pout = clamp((S.callout.hold - dt) / 0.25);
        callout = { lines: S.callout.lines, tone: S.callout.tone, alpha: Math.min(pin, pout), scale: 0.86 + 0.14 * pin };
      }
      let zoomScale = 1, zoomOrigin = null;
      if (S.zoom) {
        const z = S.zoom, dt = t - z.t0, total = z.tin + z.hold + z.tout;
        if (dt >= 0 && dt < total) {
          const k = dt < z.tin ? easeInOut(dt / z.tin) : dt < z.tin + z.hold ? 1 : 1 - easeInOut((dt - z.tin - z.hold) / z.tout);
          zoomScale = 1 + (z.scale - 1) * k; zoomOrigin = `${z.origin[0]}px ${z.origin[1]}px`;
        }
      }
      const flash = S.flashAt != null && t - S.flashAt < 0.18 ? 0.4 * (1 - (t - S.flashAt) / 0.18) : 0;
      const endP = S.endAt != null ? easeOut(clamp((t - S.endAt) / 0.5)) : 0;
      await page.evaluate((s) => window.stage.apply(s), {
        iframe: S.iframe, caption, labels, hls, ripple,
        finger: S.finger.alpha > 0.01 ? { x: S.finger.x, y: S.finger.y, alpha: S.finger.alpha, press } : null,
        badge, flash, end: S.endAt != null ? { p: endP } : null, blur: endP,
        appScale: (S.punch && t - S.punch.t0 < 0.22 ? 1 + S.punch.amp * (1 - easeOut(clamp((t - S.punch.t0) / 0.22))) : 1) * zoomScale, appOrigin: zoomOrigin, callout,
      });
      await page.screenshot({ path: join(frameDir, `${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 95 });
      if (f % 60 === 0) console.log(`frame ${f}/${T.TOTAL_FRAMES}  t=${t.toFixed(2)}s  ${Math.round((Date.now() - started) / 1000)}s elapsed`);
    }
    report.msPerFrame = Math.round((Date.now() - started) / T.TOTAL_FRAMES);
    await observe('end', T.DURATION_SECONDS);
    if (pageErrors.length) report.warnings.push(...pageErrors.slice(0, 8));
    // 実際に操作が起きたコマの時刻を、音の合図としても残す（音楽側が --cues で読める）
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
  makeDemo(silent);
  const probe = spawnSync(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames,duration,pix_fmt', '-of', 'default=nw=1', silent], { encoding: 'utf8' });
  console.log(probe.stdout.trim().replace(/\n/g, '  '));
}
// 一覧カード用 demo.mp4（無音・540x960・16秒）。本編から、目的を選ぶ〜ページが流れる(0-6秒)・消すと診断が変わる〜理由と根拠〜戻す(12-18秒)・目的は8つの前半(18-20秒)・持ち出す(22-24秒)を抜き出してつなぐ。
export const DEMO_SEGMENTS = [[0, 6], [12, 18], [18, 20], [22, 24]];
function makeDemo(silent) {
  const parts = DEMO_SEGMENTS.map(([a, b], i) => `[0:v]trim=${a}:${b},setpts=PTS-STARTPTS[v${i}]`).join(';');
  const filter = `${parts};${DEMO_SEGMENTS.map((_, i) => `[v${i}]`).join('')}concat=n=${DEMO_SEGMENTS.length}:v=1:a=0,scale=540:960:flags=lanczos,format=yuv420p[v]`;
  run(ffmpeg, ['-y', '-i', silent, '-filter_complex', filter, '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', '-map_metadata', '-1', '-an', join(outDir, 'demo.mp4')]);
}
if (flag('encode-only')) encode(); else await main();
