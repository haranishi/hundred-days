// OWNER: tools
// 性能計測。ビルド → プレビューを子プロセスで起動 → GPU を使うブラウザ（tools/lib/browser.mjs）で ?perf を開き、
// 固定の飛行経路を20秒飛んで、フレーム時間の p50・p95、描画命令数、三角形数、JS ヒープ、読み込み時間を JSON に出す。
//   npm run perf                  → .captures/perf/perf.json
//   npm run perf -- --round r00a  → .captures/r00a/perf.json
//   --secs 20 / --q medium / --no-build
//   既定は垂直同期を外して測る（60fps に張り付かず、1コマの実コストが見える）。--vsync で画面と同じ条件にする
//   WebKit は垂直同期を外せず、JS ヒープも測れない（CDP が無い）。Chromium の数字とは比べられない
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, assertHardwareGpu, buildApp, launchBrowser, parseArgs, portFrom, startPreview } from './lib/harness.mjs';

const VIEWPORT = { width: 1600, height: 900 };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const round = String(args.round ?? args._[0] ?? 'perf');
  const secs = Number(args.secs ?? 20);
  const quality = String(args.q ?? 'high');
  const outDir = path.join(ROOT, '.captures', round);
  await mkdir(outDir, { recursive: true });
  if (!args['no-build']) buildApp();
  const server = await startPreview(portFrom(args, 5305));
  const browser = await launchBrowser({ uncapped: !args.vsync });
  const browserName = browser.browserType().name();
  // WebKit は垂直同期を外せないので、いつも画面と同じ条件になる
  const vsync = Boolean(args.vsync) || browserName !== 'chromium';
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    // JS ヒープは Chromium の CDP で読む。WebKit には CDP が無いので、ページ側の値（performance.memory、WebKit には無い）を使う
    const cdp = browserName === 'chromium' ? await context.newCDPSession(page) : null;
    await cdp?.send('Performance.enable');
    await page.goto(`${server.url}/?perf=1&secs=${secs}&q=${quality}`);
    await page.waitForFunction(() => window.__perfResult !== undefined || typeof window.__appError === 'string', null, {
      timeout: (secs + 90) * 1000,
      polling: 500,
    });
    const appError = await page.evaluate(() => window.__appError ?? null);
    if (appError) throw new Error(`ページの起動に失敗: ${appError}`);
    const result = await page.evaluate(() => window.__perfResult);
    assertHardwareGpu(result.gpu);
    const nav = await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0];
      return n ? { domContentLoadedMs: Math.round(n.domContentLoadedEventEnd), loadEventMs: Math.round(n.loadEventEnd) } : null;
    });
    const metrics = cdp ? await cdp.send('Performance.getMetrics') : { metrics: [] };
    const heapUsed = metrics.metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? null;
    const report = {
      round,
      date: new Date().toISOString(),
      quality,
      viewport: VIEWPORT,
      seconds: secs,
      browser: browserName,
      vsync,
      gpu: result.gpu,
      frameMs: { p50: result.frameMsP50, p95: result.frameMsP95, max: result.frameMsMax },
      fpsMean: result.fpsMean,
      frames: result.frames,
      drawCalls: result.calls,
      triangles: result.triangles,
      jsHeapMB: heapUsed !== null ? Math.round((heapUsed / (1024 * 1024)) * 10) / 10 : result.jsHeapMB,
      load: { firstFrameMs: result.firstFrameMs, ...nav },
      consoleErrors: errors,
    };
    const outFile = path.join(outDir, 'perf.json');
    await writeFile(outFile, JSON.stringify(report, null, 2));
    console.log(
      `p50 ${report.frameMs.p50}ms / p95 ${report.frameMs.p95}ms / 平均 ${report.fpsMean}fps / 描画命令 ${report.drawCalls} / 三角形 ${report.triangles} / ヒープ ${report.jsHeapMB === null ? '（測れない）' : `${report.jsHeapMB}MB`} / 最初のコマ ${report.load.firstFrameMs}ms`,
    );
    console.log(`書き出し: ${path.relative(ROOT, outFile)}`);
    if (errors.length > 0) {
      console.error(`コンソールのエラー ${errors.length} 件`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    await server.stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
