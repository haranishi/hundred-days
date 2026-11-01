// OWNER: integrate
// 遊ぶ画面の性能：中核のページ（dist-core）を 1280×720 で開き、?autostart=1&god=1&perf=<構図> で、その構図のプレイヤーの位置に立って
// 360 コマのコマの間隔（p50・p95・p99）と1コマの CPU 時間を測る（番兵9人・信長・プレイヤー・扇つき。垂直同期は外す）。
// 機械が混んでいると数字が何倍にも伸びるので、測る前後の負荷平均（uptime）を必ず一緒に残す。
//
//   npm run perf -- r01-int                       courtyard と garden を測る
//   npm run perf -- r01-int --spots courtyard,nobunaga,start --repeat 2
//   --no-build でビルドを省く、--port でプレビューのポートを変える（既定 5409）、--view greybox で仮の表示を測る
//   --query "tex=0" で URL に引数を足す（r08-world 追加：写真の質感の有無の見比べ）
import { execSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, buildCore, parseArgs, startPreview } from './core/harness.mjs';
import { assertGpu } from './lib/shoot.mjs';
import { chromium, webkit } from '@playwright/test';
import { launchArgs, resolveBrowser } from './lib/browser.mjs';

const args = parseArgs(process.argv.slice(2));
const round = String(args._[0] ?? 'scratch');
const port = Number(args.port ?? 5409);
const spots = String(args.spots ?? 'courtyard,garden').split(',');
const repeat = Math.max(1, Number(args.repeat ?? 1));
const view = args.view ? `&view=${args.view}` : '';
const extraQuery = args.query ? `&${args.query}` : '';
const VIEWPORT = { width: 1280, height: 720 };

/** uptime の負荷平均（1・5・15 分）。 */
function loadAvg() {
  const out = execSync('uptime').toString();
  const m = out.match(/load averages?:\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

async function main() {
  const outDir = path.join(ROOT, '.captures', round);
  await mkdir(outDir, { recursive: true });
  if (!args['no-build']) buildCore();
  const server = await startPreview(port);
  const pick = resolveBrowser();
  const type = pick.name === 'webkit' ? webkit : chromium;
  const browser = await type.launch({ args: launchArgs(pick.name, { uncapped: true }) });
  const results = [];
  try {
    for (let k = 0; k < repeat; k++) {
      for (const spot of spots) {
        const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
        const page = await context.newPage();
        const errors = [];
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        page.on('pageerror', (e) => errors.push(String(e)));
        const loadBefore = loadAvg();
        await page.goto(`${server.url}/?autostart=1&god=1&seed=1&perf=${spot}${view}${extraQuery}`);
        const gpu = await assertGpu(page);
        await page.waitForFunction(() => window.__perfResult !== undefined || typeof window.__appError === 'string', null, { timeout: 240_000, polling: 250 });
        const res = await page.evaluate(() => window.__perfResult ?? { error: window.__appError });
        const loadAfter = loadAvg();
        const r = { ...res, run: k, browser: pick.name, gpuCheck: gpu, loadBefore, loadAfter, errors };
        results.push(r);
        console.log(
          `${spot.padEnd(10)} p50=${res.p50}ms p95=${res.p95}ms p99=${res.p99}ms cpuP50=${res.cpuP50} cpuP95=${res.cpuP95} calls=${res.calls} tris=${res.triangles} 負荷 ${loadBefore?.[0]}→${loadAfter?.[0]} errors=${errors.length}`,
        );
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await server.stop();
  }
  const file = path.join(outDir, `perf-play${args.view ? `-${args.view}` : ''}.json`);
  await writeFile(file, JSON.stringify({ round, date: new Date().toISOString(), viewport: VIEWPORT, query: args.query || undefined, results }, null, 2));
  console.log(`保存先: ${path.relative(ROOT, file)}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
