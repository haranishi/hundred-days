// OWNER: core
// 撮影：中核のページだけをビルド（dist-core）→ プレビュー（5404）→ GPU を使うブラウザ（tools/lib）で全部の構図を
// .captures/<周の名前>/ に PNG で撮り、shots.json（描画命令数・三角形数・明るさ・コンソールのエラー）を書く。
//
//   npm run capture -- r01-core              全部の構図
//   npm run capture -- r01-core --shots title,start
//   --no-build でビルドを省く、--port でプレビューのポートを変える（既定 5404）
//   --query "tex=0" で全部の撮影（構図・上から見た図・画面の確認）の URL に引数を足す（r08-world 追加：写真の質感の有無の見比べ）
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertGpu, openBrowser, shoot } from './lib/shoot.mjs';
import { ROOT, buildCore, parseArgs, pngStats, startPreview } from './core/harness.mjs';

const ALL = ['title', 'start', 'gate', 'courtyard', 'bamboo', 'garden', 'nobunaga', 'finale', 'gameover', 'result'];
/** 構図のほかに撮るもの（上から見た2Dの図つき）。 */
const EXTRA = [{ name: 'debug-courtyard', query: 'shot=courtyard&debug=1' }];

/**
 * 画面の確認（?shot= の構図に無い画面）：ページを操作して、その状態になったら撮る。実時間で動くので、毎回同じ絵にはならない。
 * UI の重なり・はみ出しを、全部の画面で目で確かめるため。
 */
const UI_JOBS = [
  {
    name: 'ui-select',
    query: '',
    run: async (page) => {
      await page.getByTestId('btn-start').click();
      await page.waitForFunction(() => window.__state?.screen === 'select');
    },
  },
  {
    name: 'ui-briefing',
    query: '',
    run: async (page) => {
      await page.getByTestId('btn-start').click();
      await page.getByTestId('stage-honnoji').click();
      await page.waitForFunction(() => window.__state?.screen === 'briefing');
    },
  },
  {
    name: 'ui-pause',
    query: 'autostart=1&seed=1',
    run: async (page) => {
      await page.evaluate(() => window.__input.tap('Escape'));
      await page.waitForFunction(() => window.__state?.screen === 'pause');
    },
  },
  {
    name: 'ui-suspicious',
    query: 'autostart=1&seed=1&god=1',
    run: async (page) => {
      // 本堂の前の暗がりで、提灯持ちの扇の端に立ち、「？」が溜まり始めたところ
      await page.evaluate(() => window.__game.teleport(-1.5, 33.6, 270));
      await page.waitForFunction(() => window.__state.guards.some((g) => g.s > 0.35 && g.s < 0.9), null, { timeout: 20_000 });
      await page.evaluate(() => window.__game.freeze(true));
    },
  },
  {
    name: 'ui-alert',
    query: 'autostart=1&seed=1&god=1',
    run: async (page) => {
      await page.evaluate(() => window.__game.teleport(0, 33.5, 270));
      await page.evaluate(() => window.__input.down('KeyW'));
      await page.waitForFunction(() => window.__state.phase === 'alert', null, { timeout: 20_000 });
      await page.evaluate(() => window.__input.up('KeyW'));
      await page.evaluate(() => window.__game.teleport(-14, 37.5, 270));
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.__game.freeze(true));
    },
  },
  {
    // r03-fix-play：発見中で、まだ見られている帯（朱）。ui-alert は見られていない帯（墨と金）
    name: 'ui-alert-seen',
    query: 'autostart=1&seed=1&god=1',
    run: async (page) => {
      await page.evaluate(() => window.__game.teleport(0, 33.5, 270));
      await page.evaluate(() => window.__input.down('KeyW'));
      await page.waitForFunction(() => window.__state.phase === 'alert', null, { timeout: 20_000 });
      await page.evaluate(() => window.__input.up('KeyW'));
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__game.freeze(true));
    },
  },
  {
    // r03-fix-play：水抜き穴の前 4m（東の小路）。レーダーに穴の印
    name: 'ui-radar-hole',
    query: 'autostart=1&seed=1&god=1',
    run: async (page) => {
      await page.evaluate(() => window.__game.teleport(40, -27.1, 180));
      await page.waitForFunction(() => document.querySelector('[data-testid="radar"]')?.getAttribute('data-marks') === 'hole', null, { timeout: 10_000 });
      await page.waitForTimeout(400);
      await page.evaluate(() => window.__game.freeze(true));
    },
  },
  {
    name: 'ui-aim',
    query: 'autostart=1&seed=1&god=1',
    run: async (page) => {
      await page.evaluate(() => window.__game.teleport(-14, 33.5, 270));
      await page.evaluate(() => window.__input.down('KeyQ'));
      await page.waitForTimeout(700);
      await page.evaluate(() => window.__game.freeze(true));
    },
  },
];
const VIEWPORT = { width: 1280, height: 720 };

const args = parseArgs(process.argv.slice(2));
const round = String(args._[0] ?? args.round ?? 'scratch');
const port = Number(args.port ?? 5404);
const names = args.shots ? String(args.shots).split(',') : ALL;
/** r08-world 追加：全部の URL に足す引数（例 tex=0） */
const extraQuery = args.query ? String(args.query) : '';
const withQuery = (q) => [q, extraQuery].filter(Boolean).join('&');
const outDir = path.join(ROOT, '.captures', round);

async function main() {
  await mkdir(outDir, { recursive: true });
  const buildMs = args['no-build'] ? 0 : buildCore();
  const server = await startPreview(port);
  const { browser, name: browserName, reason } = await openBrowser();
  console.log(`ブラウザ: ${browserName}（${reason}）`);
  const results = [];
  let failed = false;
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const jobs = [...names.map((n) => ({ name: n, query: `shot=${n}` })), ...(args.shots ? [] : EXTRA)];
    let gpu = null;
    for (const job of jobs) {
      const page = await context.newPage();
      if (!gpu) {
        await page.goto(`${server.url}/?${withQuery('shot=title')}`);
        gpu = await assertGpu(page);
      }
      const file = path.join(outDir, `${job.name}.png`);
      const t0 = Date.now();
      let errors = [];
      try {
        ({ errors } = await shoot(page, `${server.url}/?${withQuery(job.query)}`, file, { timeout: 90_000 }));
      } catch (e) {
        const appError = await page.evaluate(() => window.__appError ?? null).catch(() => null);
        errors = [String(e), ...(appError ? [appError] : [])];
        failed = true;
        console.error(`${job.name}: 撮れなかった ${errors.join(' / ')}`);
        await page.close();
        results.push({ name: job.name, errors });
        continue;
      }
      const info = await page.evaluate(() => window.__shotInfo ?? null);
      const lum = await pngStats(file);
      const r = { name: job.name, file: path.relative(ROOT, file), ms: Date.now() - t0, calls: info?.calls, triangles: info?.triangles, t: info?.t, luminance: lum, errors };
      results.push(r);
      const dark = lum.meanLum < 0.004 ? '  ⚠真っ黒に近い' : '';
      console.log(`${job.name.padEnd(16)} calls=${String(r.calls).padStart(4)} tris=${String(r.triangles).padStart(7)} 平均輝度=${lum.meanLum} 黒=${lum.crushedRatio} 白=${lum.clippedRatio} errors=${errors.length}${dark}`);
      if (errors.length) {
        failed = true;
        console.log(`  最初のエラー: ${errors[0].slice(0, 800)}`);
      }
      await page.close();
    }
    if (!args.shots) {
      for (const job of UI_JOBS) {
        const page = await context.newPage();
        const errors = [];
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(m.text());
        });
        page.on('pageerror', (e) => errors.push(String(e)));
        const file = path.join(outDir, `${job.name}.png`);
        try {
          await page.goto(`${server.url}/${withQuery(job.query) ? `?${withQuery(job.query)}` : ''}`);
          await page.waitForFunction(() => window.__appReady === true || typeof window.__appError === 'string', null, { timeout: 60_000 });
          await job.run(page);
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          await page.screenshot({ path: file });
        } catch (e) {
          errors.push(String(e));
        }
        const lum = errors.length ? null : await pngStats(file);
        results.push({ name: job.name, file: path.relative(ROOT, file), luminance: lum, errors });
        console.log(`${job.name.padEnd(16)} 平均輝度=${lum?.meanLum} errors=${errors.length}`);
        if (errors.length) {
          failed = true;
          console.log(`  最初のエラー: ${errors[0].slice(0, 800)}`);
        }
        await page.close();
      }
    }
    await writeFile(path.join(outDir, 'shots.json'), JSON.stringify({ round, date: new Date().toISOString(), viewport: VIEWPORT, browser: browserName, gpu, buildMs, query: extraQuery || undefined, shots: results }, null, 2));
    console.log(`保存先: ${path.relative(ROOT, outDir)}/`);
  } finally {
    await browser.close();
    await server.stop();
  }
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
