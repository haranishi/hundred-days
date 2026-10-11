// Day63 実ブラウザ撮影スクリプト。dist/ を配信しているサーバーに繋いで安全経路を通し、各画面を撮る。
// 使い方: node capture.mjs <outDir> [port] [--motion] [--seed=N] [--widths=390,375] [--browser=webkit]
//   既定は「動きを減らす」設定で撮る（アニメの途中を撮らないため）。--motion を付けると通常の動きで撮る。
// 第1・第2現場は周ごとに文言と配置が変わるので、要素はIDで引き、折りたたみは有るときだけ開く。
import { chromium, webkit } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const port = args.find((a) => /^\d+$/.test(a)) || '4180';
const withMotion = args.includes('--motion');
// --seed=N で乱数を固定する（第1・第2現場の変種を指定して撮り分けるため）。--widths=390,375 で撮る幅を絞る
const seedArg = args.find((a) => a.startsWith('--seed='));
const seed = seedArg ? Number(seedArg.slice(7)) : null;
const browserArg = args.find((a) => a.startsWith('--browser='));
const browserName = browserArg ? browserArg.slice(10) : 'chromium'; // --browser=webkit で Safari 系のエンジンで撮る
const widthsArg = args.find((a) => a.startsWith('--widths='));
const onlyWidths = widthsArg ? widthsArg.slice(9).split(',').map(Number) : null;
if (!outDir) { console.error('usage: node capture.mjs <outDir> [port] [--motion]'); process.exit(1); }
const BASE = `http://127.0.0.1:${port}/day-063-dark-patterns/`;
mkdirSync(outDir, { recursive: true });

const SIZES = [
  { w: 390, h: 844, touch: true },
  { w: 375, h: 667, touch: true },
  { w: 768, h: 1024, touch: false },
  { w: 1440, h: 900, touch: false },
];

const launchOptions = { headless: true };
// リポジトリの Playwright が想定する WebKit の版と、キャッシュにある版が違うときは、環境変数で実行ファイルを指す
if (browserName === 'webkit' && process.env.PW_WEBKIT_EXECUTABLE) launchOptions.executablePath = process.env.PW_WEBKIT_EXECUTABLE;
const browser = await (browserName === 'webkit' ? webkit : chromium).launch(launchOptions);
const log = [];

for (const s of SIZES.filter((size) => !onlyWidths || onlyWidths.includes(size.w))) {
  const ctx = await browser.newContext({
    viewport: { width: s.w, height: s.h }, hasTouch: s.touch, isMobile: s.touch, deviceScaleFactor: 1,
    reducedMotion: withMotion ? 'no-preference' : 'reduce',
  });
  if (seed !== null) {
    await ctx.addInitScript((seedValue) => {
      let a = seedValue >>> 0;
      Math.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }, seed);
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console:' + m.text()); });
  page.on('dialog', async (d) => { log.push(`${s.w}: DIALOG(${d.type()}): ${d.message()}`); await d.dismiss(); });

  const shot = async (name, full = false) => {
    await page.screenshot({ path: `${outDir}/${s.w}x${s.h}-${name}.png`, fullPage: full });
  };
  const metrics = async (name) => {
    const m = await page.evaluate(() => {
      const vp = document.getElementById('stage-viewport');
      const vals = ['hud-stage-text', 'hud-damage-text', 'hud-timer-text'].map((id) => Math.round(document.getElementById(id).getBoundingClientRect().top));
      return {
        docW: document.documentElement.scrollWidth, winW: window.innerWidth,
        docH: document.documentElement.scrollHeight, winH: window.innerHeight,
        scrollY: Math.round(window.scrollY),
        stageTop: vp && vp.offsetParent ? Math.round(vp.getBoundingClientRect().top + window.scrollY) : null,
        hudTops: vals.join('/'),
      };
    });
    log.push(`${s.w}x${s.h}: ${name} scrollW=${m.docW}/${m.winW} scrollH=${m.docH}/${m.winH} scrollY=${m.scrollY} stageTop=${m.stageTop} hudTops=${m.hudTops}`);
  };
  const settle = (ms = 350) => page.waitForTimeout(ms);

  await page.goto(BASE);
  await settle(600);
  await shot('00-start'); await shot('00-start-full', true); await metrics('start');

  await page.getByRole('button', { name: 'このアプリを共有する', exact: true }).click();
  await settle();
  await shot('00b-share-dialog'); await metrics('share-dialog');
  await page.keyboard.press('Escape');
  await settle(200);

  await page.locator('#btn-start-game').click();
  await page.waitForTimeout(300);
  await shot('01-s1-cutin');
  await page.waitForTimeout(1100);
  await shot('02-s1'); await shot('02-s1-full', true); await metrics('stage1');
  // ×を押す（警告ダイアログではなく、偽ポップアップ内の確保した場所に一言が出る）。揺れが収まった1秒後に撮る
  await page.locator('#btn-modal-fake-close').click({ force: true });
  await settle(1000);
  await shot('02b-s1-close-nag');
  await page.locator('#btn-reject-confirmshame').click();
  await settle(450);
  await shot('03-s1-modal'); await shot('03-s1-modal-full', true); await metrics('s1-modal');
  await page.locator('#btn-next-stage').click();
  await page.waitForTimeout(1300);

  await shot('04-s2'); await shot('04-s2-full', true); await metrics('stage2');
  const summary = page.locator('.accordion-summary');
  if (await summary.count()) {
    await summary.click();
    await settle(250);
    await shot('05-s2-open');
  }
  await page.locator('#chk-safe-plan').check();
  await settle(150);
  await shot('05b-s2-toast');
  await page.locator('#btn-sub-start').click();
  await settle(450);
  await shot('06-s2-modal');
  await page.locator('#btn-next-stage').click();
  await page.waitForTimeout(1300);

  // 最上段のお知らせ帯は、現場の表示から1.5秒後に偽の仮予約通知へ入れ替わる
  await shot('07-s3'); await shot('07-s3-full', true); await metrics('stage3');
  await page.waitForTimeout(800);
  await shot('07b-s3-notice');
  await page.locator('input[value="freecancel"]').check();
  await settle(200);
  await shot('08-s3-toast');
  await page.locator('#btn-hotel-submit').click();
  await settle(450);
  await shot('09-s3-modal');
  await page.locator('#btn-next-stage').click();
  await page.waitForTimeout(1300);

  await shot('10-s4'); await shot('10-s4-full', true); await metrics('stage4');
  await page.locator('#chk-opt-sub').click();
  await settle(300);
  await shot('11-s4-dialog');
  await page.locator('#btn-remove-sub').click();
  await page.locator('#chk-opt-warranty').uncheck();
  await settle(250);
  await shot('12-s4-ready');
  await page.locator('#btn-stage1-subtle').click();
  await settle(450);
  await shot('13-s4-modal');
  await page.locator('#btn-next-stage').click();
  await page.waitForTimeout(1300);

  await shot('14-s5'); await shot('14-s5-full', true); await metrics('stage5');
  // 回答せずに進もうとすると、質問の下に警告が出る
  await page.locator('#btn-real-cancel').click();
  await settle(400);
  await shot('14b-s5-unanswered');
  // 正しい選択肢を選んだ瞬間に罠解除の合図が出る
  await page.locator('input[value="leave"]').check();
  await settle(250);
  await shot('14c-s5-answered');
  await page.locator('#btn-real-cancel').click();
  await settle(900); // 最終確認までの自動スクロールを待つ
  await shot('15-s5-final'); await shot('15-s5-final-full', true); await metrics('s5-final');
  await page.locator('#btn-final-leave').click();
  await settle(450);
  await shot('16-s5-modal');
  await page.locator('#btn-next-stage').click();
  await settle(700);
  await shot('17-result'); await shot('17-result-full', true); await metrics('result');

  log.push(`${s.w}x${s.h}: errors=${JSON.stringify(errors)}`);
  await ctx.close();
}
await browser.close();
console.log(log.join('\n'));
