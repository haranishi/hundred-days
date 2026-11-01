// OWNER: core
// 自動プレイ：道順の台本を、ページの中の自動操作（window.__autopilot。読むのは __state、書くのは __input だけ）で流し、
// 状態を .captures/<周>/play-<台本>/states.jsonl に、一定間隔（ゲーム内の秒）のスクショを同じフォルダに残す。採点役が使う。
//
//   npm run play -- r01-core --route ura          tools/routes/ura.json を流す（mizunuki もある）
//   npm run play -- r01-core --script my.json     自分で書いた台本（形は src/game/autopilot.ts の Route）
//   --speed 2（sim を 2 倍で）--interval 5（スクショの間隔・ゲーム内の秒）--seed N --max 300（打ち切り・ゲーム内の秒）
//   --no-build でビルドを省く、--port でプレビューのポートを変える（既定 5404）、--god で捕まらない（確認用。関門には使わない）
// スクショの瞬間は sim を止めて撮る（window.__game.freeze）ので、決まった時刻の絵になる。
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { assertGpu, openBrowser } from './lib/shoot.mjs';
import { ROOT, buildCore, parseArgs, startPreview } from './core/harness.mjs';

const args = parseArgs(process.argv.slice(2));
const round = String(args._[0] ?? args.round ?? 'scratch');
const port = Number(args.port ?? 5404);
const speed = Math.max(0.25, Math.min(8, Number(args.speed ?? 1)));
const interval = Math.max(0.5, Number(args.interval ?? 5));
const maxT = Number(args.max ?? 300);
const VIEWPORT = { width: 1280, height: 720 };

async function loadRoute() {
  const file = args.script ? path.resolve(String(args.script)) : path.join(ROOT, 'tools', 'routes', `${String(args.route ?? 'ura')}.json`);
  return { file, route: JSON.parse(await readFile(file, 'utf8')) };
}

async function main() {
  const { file, route } = await loadRoute();
  const seed = Number(args.seed ?? route.seed ?? 1);
  const outDir = path.join(ROOT, '.captures', round, `play-${route.name}`);
  await mkdir(outDir, { recursive: true });
  const statesFile = path.join(outDir, 'states.jsonl');
  await writeFile(statesFile, '');
  if (!args['no-build']) buildCore();
  const server = await startPreview(port);
  const { browser, name: browserName } = await openBrowser();
  const errors = [];
  const shots = [];
  let summary = null;
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    const god = args.god ? '&god=1' : '';
    await page.goto(`${server.url}/?autostart=1&seed=${seed}&speed=${speed}${god}`);
    await page.waitForFunction(() => window.__appReady === true || typeof window.__appError === 'string', null, { timeout: 60_000 });
    const appError = await page.evaluate(() => window.__appError ?? null);
    if (appError) throw new Error(`起動に失敗: ${appError}`);
    const gpu = await assertGpu(page);
    console.log(`ブラウザ: ${browserName}（${gpu}）・台本 ${path.relative(ROOT, file)}・種 ${seed}・${speed} 倍`);
    await page.evaluate((r) => window.__autopilot.start(r), route);

    const shoot = async (name) => {
      await page.evaluate(() => window.__game.freeze(true));
      // 止めたコマを描き終えてから撮る
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const f = path.join(outDir, `${name}.png`);
      await page.screenshot({ path: f });
      shots.push(path.relative(ROOT, f));
      await page.evaluate(() => window.__game.freeze(false));
    };

    let nextShot = 0;
    let nextLog = 0;
    const wall0 = Date.now();
    for (;;) {
      const st = await page.evaluate(() => window.__state);
      if (st.t >= nextLog) {
        await appendFile(statesFile, `${JSON.stringify(st)}\n`);
        nextLog = st.t + 0.25;
      }
      if (st.screen === 'play' && st.t >= nextShot) {
        await shoot(`t${String(Math.round(st.t)).padStart(4, '0')}`);
        nextShot += interval;
      }
      const pilot = await page.evaluate(() => window.__autopilot.status());
      if (st.screen === 'result' || st.screen === 'gameover' || pilot?.status === 'failed' || st.t > maxT) {
        // 演出の途中で止まらないよう、結果か討たれた画面まで待つ
        if (pilot?.status !== 'failed' && st.outcome === 'win' && st.screen !== 'result') {
          await page.waitForFunction(() => window.__state.screen === 'result', null, { timeout: 60_000 });
        }
        await page.waitForTimeout(400);
        const fin = await page.evaluate(() => window.__state);
        await appendFile(statesFile, `${JSON.stringify(fin)}\n`);
        await shoot(fin.screen === 'result' ? 'result' : fin.screen === 'gameover' ? 'gameover' : 'end');
        summary = {
          route: route.name,
          seed,
          speed,
          browser: browserName,
          gpu,
          outcome: fin.outcome,
          screen: fin.screen,
          gameTime: fin.endTime !== null ? Number(fin.endTime.toFixed(2)) : null,
          discoveries: fin.discoveries,
          takedowns: fin.takedowns,
          stonesUsed: fin.stonesUsed,
          rank: fin.rank,
          reason: fin.reason,
          firstDetect: fin.firstDetect,
          autopilot: await page.evaluate(() => window.__autopilot.status()),
          wallSeconds: Math.round((Date.now() - wall0) / 100) / 10,
          shots,
          consoleErrors: errors,
        };
        break;
      }
      if (st.screen === 'finale' && !shots.some((s) => s.endsWith('finale.png')) && (st.finale ?? 0) > 0.62) await shoot('finale');
      await page.waitForTimeout(100);
    }
  } finally {
    await browser.close();
    await server.stop();
  }
  await writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  const s = summary;
  console.log(`結末: ${s.outcome ?? 'なし'}（画面 ${s.screen}）・時間 ${s.gameTime ?? '-'} 秒・発見 ${s.discoveries}・当て身 ${s.takedowns}・小石 ${s.stonesUsed}・位 ${s.rank ?? '-'}・実時間 ${s.wallSeconds} 秒`);
  if (s.autopilot?.failReason) console.log(`自動操作の失敗: ${s.autopilot.failReason}`);
  if (errors.length) console.log(`コンソールのエラー: ${errors.length} 件（最初: ${errors[0]}）`);
  console.log(`保存先: ${path.relative(ROOT, outDir)}/（states.jsonl・summary.json・PNG）`);
  if (s.outcome !== 'win' || errors.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
