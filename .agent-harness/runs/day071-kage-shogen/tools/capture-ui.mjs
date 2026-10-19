// 画面評価用の証拠を撮る。実アプリを実操作（キー・クリック）で各状態へ進め、幅ごとにスクリーンショットを保存する。
// 開発者向けの道具なので、正解の数値（lib/cases.js）を使って夜を解く。評価者に渡すのは、出力された画像だけ。
// 使い方: node capture-ui.mjs --base=<previewのURL> --out=<dir> [--widths=360,390,768,1440]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { CASES } from '../../../../day-071-kage-shogen/lib/cases.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a, true]; }));
const BASE = args.base;
const OUT = args.out;
if (!BASE || !OUT) { console.error('--base=<URL> と --out=<dir> が必要です'); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const WIDTHS = String(args.widths || '360,390,768,1440').split(',').map(Number);
const HEIGHTS = { 360: 640, 390: 844, 768: 1024, 1440: 900 };
const KEY = 'kage-shogen:v1';
const byId = Object.fromEntries(CASES.map((c) => [c.id, c]));

const progress = (upTo) => JSON.stringify({ v: 1, cleared: Object.fromEntries(CASES.slice(0, upTo).map((c, i) => [c.id, { stars: [3, 2, 3, 1, 3][i] }])), last: null });

async function open(browser, width, { upTo = 0, noCanvas = false } = {}) {
  const touch = width < 700;
  const ctx = await browser.newContext({ viewport: { width, height: HEIGHTS[width] ?? 900 }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(([key, value, blocked]) => {
    try { if (value) localStorage.setItem(key, value); } catch { /* 無視 */ }
    if (blocked) HTMLCanvasElement.prototype.getContext = () => null;
  }, [KEY, upTo > 0 ? progress(upTo) : '', noCanvas]);
  await page.goto(BASE);
  return { ctx, page, errors };
}

const shot = async (page, width, name) => {
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${OUT}/${width}-${name}.png` });
  await page.screenshot({ path: `${OUT}/${width}-${name}-full.png`, fullPage: true });
};

async function startNight(page, id) {
  await page.locator(`[data-case-id="${id}"]`).click();
  await page.locator('#start-case').click();
  await page.locator('#wall').waitFor();
}

async function nudgeTo(page, key, from, to) {
  let diff = to - from;
  const forward = diff >= 0 ? key.plus : key.minus;
  diff = Math.abs(diff);
  await page.locator('#wall').focus();
  for (let i = 0; i < Math.floor(diff / 5); i += 1) await page.keyboard.press(`Shift+${forward}`);
  for (let i = 0; i < Math.round(diff % 5); i += 1) await page.keyboard.press(forward);
}

// 夜を正解に合わせる（キーと選択チップ）。決まったら solved になる。
async function solve(page, caseDef) {
  const stage = caseDef.stage;
  const lamp = Number(await page.locator('#lamp-readout').getAttribute('data-ly'));
  await page.locator('#item-select [data-item="lamp"]').click();
  await nudgeTo(page, { plus: 'ArrowUp', minus: 'ArrowDown' }, lamp, stage.lamp.solution);
  for (const prop of stage.props) {
    if (prop.x.min === prop.x.max) continue;
    await page.locator(`#item-select [data-item="${prop.id}"]`).click();
    const text = await page.locator('#item-readout').innerText();
    const current = Number(text.match(/(-?\d+)\s*cm/)?.[1]);
    await nudgeTo(page, { plus: 'ArrowRight', minus: 'ArrowLeft' }, current, prop.x.solution);
  }
  await page.locator('#app[data-phase="solved"]').waitFor({ timeout: 5000 });
}

for (const width of WIDTHS) {
  const browser = await chromium.launch({ headless: true });
  const all = [];
  try {
    // 1) 事件簿
    let s = await open(browser, width);
    await shot(s.page, width, '01-home-fresh');
    all.push(...s.errors); await s.ctx.close();
    s = await open(browser, width, { upTo: 2 });
    await shot(s.page, width, '02-home-progress');
    await s.page.locator('[data-case-id="bag"]').click();
    await shot(s.page, width, '03-briefing-bag');
    await s.page.locator('#start-case').click();
    await shot(s.page, width, '05-stage-bag-start');
    await s.page.locator('#item-select [data-item="hat"]').click();
    await s.page.locator('#nudge-plus').click();
    await shot(s.page, width, '06-stage-bag-hat-selected');
    all.push(...s.errors); await s.ctx.close();

    // 2) 夜1：ガイド付きの開始 → 途中 → 再現
    s = await open(browser, width);
    await startNight(s.page, 'rack');
    await shot(s.page, width, '04-stage-rack-start');
    await s.page.locator('#wall').focus();
    for (let i = 0; i < 6; i += 1) await s.page.keyboard.press('Shift+ArrowDown');
    await shot(s.page, width, '04b-stage-rack-midway');
    await solve(s.page, byId.rack);
    await shot(s.page, width, '09-solved-rack');
    await s.page.locator('#to-deduction').click();
    await shot(s.page, width, '10-deduction-rack');
    all.push(...s.errors); await s.ctx.close();

    // 3) 夜2：ガイドとヒント
    s = await open(browser, width, { upTo: 1 });
    await startNight(s.page, 'hat');
    await s.page.locator('#hint').click();
    await s.page.locator('#guide-toggle').click();
    await shot(s.page, width, '08-stage-hat-hint-guide');
    all.push(...s.errors); await s.ctx.close();

    // 4) 夜4：誤答と✕と正解
    s = await open(browser, width, { upTo: 3 });
    await startNight(s.page, 'chair');
    await solve(s.page, byId.chair);
    await s.page.locator('#to-deduction').click();
    await s.page.locator('[data-suspect-id="saeki"] .exclude').click();
    await s.page.locator('[data-suspect-id="hasumi"] .accuse').click();
    await shot(s.page, width, '11-deduction-chair-wrong');
    await s.page.locator('[data-suspect-id="kiritani"] .accuse').click();
    await shot(s.page, width, '12-verdict-chair');
    all.push(...s.errors); await s.ctx.close();

    // 5) 夜5：邪魔な道具・エピローグ
    s = await open(browser, width, { upTo: 4 });
    await startNight(s.page, 'umbrella');
    await shot(s.page, width, '07-stage-umbrella-start');
    await solve(s.page, byId.umbrella);
    await s.page.locator('#to-deduction').click();
    await s.page.locator('[data-suspect-id="hiiragi"] .accuse').click();
    await s.page.locator('#next-case').click();
    await shot(s.page, width, '13-epilogue');
    all.push(...s.errors); await s.ctx.close();

    // 6) dialog と描画不可
    s = await open(browser, width);
    await s.page.locator('#help').click();
    await shot(s.page, width, '14-help-dialog');
    await s.page.keyboard.press('Escape');
    await s.page.locator('#share-open').click();
    await shot(s.page, width, '15-share-dialog');
    await s.page.keyboard.press('Escape');
    await s.page.locator('#reset-progress').click();
    await shot(s.page, width, '16-reset-dialog');
    all.push(...s.errors); await s.ctx.close();
    s = await open(browser, width, { noCanvas: true });
    await shot(s.page, width, '17-unsupported');
    await s.ctx.close();
    console.log(`${width}px done${all.length ? ` — errors: ${[...new Set(all)].join(' | ')}` : ''}`);
  } finally {
    await browser.close();
  }
}
