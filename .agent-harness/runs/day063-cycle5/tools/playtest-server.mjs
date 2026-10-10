// Day63 プレイテスト操作サーバー。評価者(LLM)がツール往復の遅さに邪魔されず、人間のペースで実プレイするための道具。
// 仕組み: Playwright の page.clock でゲーム内の時計を止めておき、/advance で「人間が考えて動くのに要した秒数」だけ進める。
//   クリックは座標で本物のヒットテストを通す（重なり・押しにくさ・誤タップがそのまま再現される）。
// 使い方: node playtest-server.mjs --out=<dir> [--port=4181] [--base=http://127.0.0.1:4180/day-063-dark-patterns/] [--width=390] [--height=844]
import { chromium } from '@playwright/test';
import http from 'node:http';
import { mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));
const PORT = Number(args.port || 4181);
const BASE = args.base || 'http://127.0.0.1:4180/day-063-dark-patterns/';
const OUT = args.out;
if (!OUT) { console.error('--out=<dir> が必要です'); process.exit(1); }
mkdirSync(OUT, { recursive: true });
let W = Number(args.width || 390);
let H = Number(args.height || 844);

let browser; let ctx; let page; let seq = 0; let elapsedMs = 0;
let events = [];

const START = new Date('2026-10-10T00:00:00Z');

async function newSession(seed) {
  if (ctx) await ctx.close();
  const touch = W < 700;
  ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  page = await ctx.newPage();
  events = []; elapsedMs = 0;
  page.on('pageerror', (e) => events.push({ type: 'pageerror', message: e.message }));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') events.push({ type: `console.${m.type()}`, message: m.text() }); });
  page.on('dialog', async (d) => { events.push({ type: 'DIALOG', kind: d.type(), message: d.message(), note: '本物のブラウザではここで操作がブロックされる' }); await d.dismiss(); });
  if (seed !== undefined) {
    await page.addInitScript((s) => {
      let a = s >>> 0;
      Math.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }, seed);
  }
  await page.clock.install({ time: START });
  await page.goto(BASE);
  await page.clock.pauseAt(new Date(START.getTime() + 500));
}

async function perception() {
  return page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
      if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
      const cx = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1); const cy = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
      const top = document.elementFromPoint(cx, cy);
      return !!top && (el === top || el.contains(top) || top.contains(el));
    };
    const label = (el) => (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const targets = [...document.querySelectorAll('button, a[href], summary, input, label, [role=button]')]
      .filter(visible)
      .map((el) => {
        const r = el.getBoundingClientRect();
        let text = label(el);
        if (el.tagName === 'INPUT') { const l = el.closest('label'); text = `${el.type}${el.checked ? '(ON)' : '(OFF)'} ${l ? label(l) : ''}`.trim(); }
        return { kind: el.tagName.toLowerCase() + (el.type ? `:${el.type}` : ''), text, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) };
      })
      .filter((t) => t.text || t.w > 0);
    return {
      viewport: { w: innerWidth, h: innerHeight },
      scroll: { x: Math.round(scrollX), y: Math.round(scrollY), docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight },
      overflowX: document.documentElement.scrollWidth > innerWidth,
      visibleText: document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1800),
      targets,
    };
  });
}

async function hitInfo(x, y) {
  return page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { tag: el.tagName.toLowerCase(), text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60), size: `${Math.round(r.width)}x${Math.round(r.height)}`, inert: !!el.closest('[inert]') };
  }, [x, y]);
}

async function resolvePoint(body) {
  if (typeof body.x === 'number' && typeof body.y === 'number') return { x: body.x, y: body.y };
  if (body.text) {
    const loc = page.getByText(body.text, { exact: false });
    const n = await loc.count();
    if (n === 0) throw new Error(`text not found: ${body.text}`);
    const nth = Math.min(body.nth ?? 0, n - 1);
    const el = loc.nth(nth);
    await el.scrollIntoViewIfNeeded();
    const b = await el.boundingBox();
    if (!b) throw new Error('no bounding box');
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  }
  throw new Error('x,y か text が必要');
}

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj, null, 1)); };
const readBody = (req) => new Promise((resolve) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); } }); });

browser = await chromium.launch({ headless: true });
await newSession(args.seed !== undefined ? Number(args.seed) : undefined);

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname === '/state') return json(res, 200, { elapsedSimulatedSec: +(elapsedMs / 1000).toFixed(1), ...(await perception()) });
    if (url.pathname === '/shot') {
      const name = (url.searchParams.get('name') || 'shot').replace(/[^\w-]/g, '_');
      await new Promise((r) => setTimeout(r, 700)); // CSSアニメーションは実時間で進むので、撮影前に落ち着かせる
      const path = `${OUT}/${String(++seq).padStart(3, '0')}-${name}.png`;
      await page.screenshot({ path, fullPage: url.searchParams.get('full') === '1' });
      return json(res, 200, { path, elapsedSimulatedSec: +(elapsedMs / 1000).toFixed(1) });
    }
    if (url.pathname === '/events') { const e = events; events = []; return json(res, 200, { events: e }); }
    const body = req.method === 'POST' ? await readBody(req) : {};
    if (url.pathname === '/advance') {
      const ms = Math.max(0, Math.min(Number(body.ms) || 0, 120000));
      await page.clock.runFor(ms); elapsedMs += ms;
      return json(res, 200, { advancedMs: ms, elapsedSimulatedSec: +(elapsedMs / 1000).toFixed(1) });
    }
    if (url.pathname === '/click') {
      const p = await resolvePoint(body);
      const hit = await hitInfo(p.x, p.y);
      if (W < 700) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
      return json(res, 200, { clickedAt: p, hitElement: hit });
    }
    if (url.pathname === '/hover') { const p = await resolvePoint(body); await page.mouse.move(p.x, p.y); return json(res, 200, { hoveredAt: p, hitElement: await hitInfo(p.x, p.y) }); }
    if (url.pathname === '/press') { await page.keyboard.press(String(body.key || 'Tab')); return json(res, 200, { pressed: body.key || 'Tab', focused: await page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}: ${(a.innerText || a.value || '').replace(/\s+/g, ' ').trim().slice(0, 50)}` : null; }) }); }
    if (url.pathname === '/scroll') { await page.mouse.wheel(0, Number(body.dy) || 300); await page.waitForTimeout(150); return json(res, 200, { scrollY: await page.evaluate(() => Math.round(scrollY)) }); }
    if (url.pathname === '/restart') {
      if (body.width) W = Number(body.width); if (body.height) H = Number(body.height);
      await newSession(body.seed !== undefined ? Number(body.seed) : undefined);
      return json(res, 200, { restarted: true, viewport: { W, H } });
    }
    return json(res, 404, { error: 'endpoints: GET /state /shot?name=&full=0|1 /events  POST /click /hover /press /scroll /advance /restart' });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`playtest server on :${PORT} (viewport ${W}x${H}) out=${OUT}`));
