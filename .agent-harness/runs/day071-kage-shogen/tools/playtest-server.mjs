// 影証言のプレイテスト操作サーバー。評価者(LLM)が、人間のように画面を見て、座標でつかんで動かして実プレイするための道具。
// Day63の playtest-server.mjs を元に、時計の制御を外し、ドラッグと進行の解放を足した。
// ポインターは本物のヒットテストを通る（重なり・つかみにくさ・誤タップがそのまま再現される）。
// 使い方: node playtest-server.mjs --out=<dir> --base=<previewのURL> [--port=4281] [--width=390] [--height=844]
//   previewのURLは `node day-071-kage-shogen/tools/serve.mjs` が標準出力に出す（例 http://127.0.0.1:<port>/day-071-kage-shogen/）。
import { chromium } from '@playwright/test';
import http from 'node:http';
import { mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));
const PORT = Number(args.port || 4281);
const BASE = args.base;
const OUT = args.out;
if (!OUT || !BASE) { console.error('--out=<dir> と --base=<URL> が必要です'); process.exit(1); }
mkdirSync(OUT, { recursive: true });
let W = Number(args.width || 390);
let H = Number(args.height || 844);

const STORAGE_KEY = 'kage-shogen:v1';
const NIGHTS = ['rack', 'hat', 'bag', 'chair', 'umbrella'];

let browser; let ctx; let page; let seq = 0;
let events = [];

async function newSession({ upTo = 0 } = {}) {
  if (ctx) await ctx.close();
  const touch = W < 700;
  ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  page = await ctx.newPage();
  events = [];
  page.on('pageerror', (e) => events.push({ type: 'pageerror', message: e.message }));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') events.push({ type: `console.${m.type()}`, message: m.text() }); });
  page.on('dialog', async (d) => { events.push({ type: 'DIALOG', kind: d.type(), message: d.message() }); await d.dismiss(); });
  if (upTo > 0) {
    const cleared = Object.fromEntries(NIGHTS.slice(0, upTo).map((id) => [id, { stars: 3 }]));
    await page.addInitScript(([key, value]) => { try { localStorage.setItem(key, value); } catch { /* 保存不可は無視 */ } }, [STORAGE_KEY, JSON.stringify({ v: 1, cleared, last: null })]);
  }
  await page.goto(BASE);
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
    const targets = [...document.querySelectorAll('button, a[href], summary, input, [role=button], [role=radio], canvas[tabindex]')]
      .filter(visible)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { kind: el.tagName.toLowerCase(), text: label(el), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) };
      });
    const text = (id) => (document.getElementById(id)?.innerText || '').replace(/\s+/g, ' ').trim();
    const wall = document.getElementById('wall');
    const wallBox = wall && visible(wall) ? (() => { const r = wall.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })() : null;
    return {
      viewport: { w: innerWidth, h: innerHeight },
      scroll: { x: Math.round(scrollX), y: Math.round(scrollY), docH: document.documentElement.scrollHeight },
      overflowX: document.documentElement.scrollWidth > innerWidth,
      game: {
        phase: document.getElementById('app')?.dataset.phase,
        night: document.getElementById('app')?.dataset.case,
        lamp: text('lamp-readout'),
        item: text('item-readout'),
        meter: document.getElementById('meter')?.dataset.band,
        band: text('band-text'),
        hint: text('hint-text'),
        message: text('deduction-message'),
        wallOnScreen: wallBox,
      },
      visibleText: document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1800),
      targets,
    };
  });
}

async function resolvePoint(body) {
  if (typeof body.x === 'number' && typeof body.y === 'number') return { x: body.x, y: body.y };
  if (body.text) {
    const loc = page.getByText(body.text, { exact: false });
    const n = await loc.count();
    if (n === 0) throw new Error(`text not found: ${body.text}`);
    const el = loc.nth(Math.min(body.nth ?? 0, n - 1));
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
await newSession({ upTo: Number(args.unlock || 0) });

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname === '/state') return json(res, 200, await perception());
    if (url.pathname === '/shot') {
      const name = (url.searchParams.get('name') || 'shot').replace(/[^\w-]/g, '_');
      await page.waitForTimeout(500); // 印の出現などCSSの動きを落ち着かせてから撮る
      const path = `${OUT}/${String(++seq).padStart(3, '0')}-${name}.png`;
      await page.screenshot({ path, fullPage: url.searchParams.get('full') === '1' });
      return json(res, 200, { path });
    }
    if (url.pathname === '/events') { const e = events; events = []; return json(res, 200, { events: e }); }
    const body = req.method === 'POST' ? await readBody(req) : {};
    if (url.pathname === '/click') {
      const p = await resolvePoint(body);
      const hit = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? { tag: el.tagName.toLowerCase(), id: el.id, text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50) } : null; }, [p.x, p.y]);
      if (W < 700) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(120);
      return json(res, 200, { clickedAt: p, hitElement: hit });
    }
    if (url.pathname === '/drag') {
      // { from:{x,y}, to:{x,y}, steps? } 押す→少しずつ動かす→離す。人の指の動きに近づけるため、既定は20分割。
      const { from, to } = body;
      if (!from || !to) throw new Error('from と to が必要');
      const steps = Math.max(2, Math.min(Number(body.steps) || 20, 80));
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      for (let i = 1; i <= steps; i += 1) {
        await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
        await page.waitForTimeout(14);
      }
      await page.mouse.up();
      await page.waitForTimeout(450); // 合格の保持と、そろえる動きの時間
      return json(res, 200, { dragged: { from, to, steps } });
    }
    if (url.pathname === '/press') {
      const times = Math.max(1, Math.min(Number(body.times) || 1, 200));
      for (let i = 0; i < times; i += 1) await page.keyboard.press(String(body.key || 'Tab'));
      await page.waitForTimeout(100);
      return json(res, 200, { pressed: body.key || 'Tab', times });
    }
    if (url.pathname === '/scroll') { await page.mouse.wheel(0, Number(body.dy) || 300); await page.waitForTimeout(150); return json(res, 200, { scrollY: await page.evaluate(() => Math.round(scrollY)) }); }
    if (url.pathname === '/wait') { const ms = Math.max(0, Math.min(Number(body.ms) || 500, 5000)); await page.waitForTimeout(ms); return json(res, 200, { waited: ms }); }
    if (url.pathname === '/restart') {
      // 新しいセッション（保存は空）。unlock に N を渡すと、最初のN夜を解決済みにして始める。
      if (body.width) W = Number(body.width);
      if (body.height) H = Number(body.height);
      await newSession({ upTo: Number(body.unlock || 0) });
      return json(res, 200, { restarted: true, viewport: { W, H }, unlocked: Number(body.unlock || 0) });
    }
    if (url.pathname === '/reload') { await page.reload(); return json(res, 200, { reloaded: true }); }
    return json(res, 404, { error: 'endpoints: GET /state /shot?name=&full=0|1 /events  POST /click /drag /press /scroll /wait /restart /reload' });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`playtest server on :${PORT} (viewport ${W}x${H}) out=${OUT}`));
