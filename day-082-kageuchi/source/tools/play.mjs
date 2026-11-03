// OWNER: core
// 自動プレイ：道順の台本を、ページの中の自動操作（window.__autopilot。読むのは __state、書くのは __input だけ）で流し、
// 状態を .captures/<周>/play-<台本>/states.jsonl に、一定間隔（ゲーム内の秒）のスクショを同じフォルダに残す。採点役が使う。
//
//   npm run play -- r01-core --route ura          tools/routes/ura.json を流す（mizunuki もある）
//   npm run play -- r01-core --script my.json     自分で書いた台本（形は src/game/autopilot.ts の Route）
//   --speed 2（sim を 2 倍で）--interval 5（スクショの間隔・ゲーム内の秒）--seed N --max 300（打ち切り・ゲーム内の秒）
//   --no-build でビルドを省く、--port でプレビューのポートを変える（既定 5404）、--god で捕まらない（確認用。関門には使わない）
// スクショの瞬間は sim を止めて撮る（window.__game.freeze）ので、決まった時刻の絵になる。
//
// --touch（tasks 4.3。2026-11-03 スマホ対応）：同じ台本を、本物のタッチイベントだけで流す（tools/lib/touchBot.mjs。CDP なので Chromium だけ）。
//   端末は 844×390・hasTouch・isMobile・画素比2、URL は ?touch=1&autostart=1&seed=N&speed=…（speed は 1 か 2）。出力は play-touch-<台本>/。
//   最後に result へ着いたか・位・タッチ層が受けた pointer イベントの回数（touch>0・mouse=0）・コンソールのエラー・外部通信を確かめ、終了コードで返す。
//   --repeat N で同じ種を N 回続けて流す（全部通れば合格）。--view で ?view= を変える（既定 art）。
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { assertGpu, openBrowser } from './lib/shoot.mjs';
import { createTouchBot } from './lib/touchBot.mjs';
import { ROOT, buildCore, parseArgs, startPreview } from './core/harness.mjs';

const args = parseArgs(process.argv.slice(2));
const round = String(args._[0] ?? args.round ?? 'scratch');
const port = Number(args.port ?? 5404);
const speed = Math.max(0.25, Math.min(8, Number(args.speed ?? 1)));
const interval = Math.max(0.5, Number(args.interval ?? 5));
const maxT = Number(args.max ?? 300);
const touchMode = !!args.touch;
const repeat = touchMode ? Math.max(1, Number(args.repeat ?? 1)) : 1;
const viewKind = String(args.view ?? 'art');
const VIEWPORT = touchMode ? { width: 844, height: 390 } : { width: 1280, height: 720 };
if (touchMode && speed !== 1 && speed !== 2) throw new Error('--touch の --speed は 1 か 2（台本の時機は sim の時刻で決まるが、指の遅れは実時間なので）');

async function loadRoute() {
  const file = args.script ? path.resolve(String(args.script)) : path.join(ROOT, 'tools', 'routes', `${String(args.route ?? 'ura')}.json`);
  return { file, route: JSON.parse(await readFile(file, 'utf8')) };
}

async function main() {
  const { file, route } = await loadRoute();
  const seed = Number(args.seed ?? route.seed ?? 1);
  if (!args['no-build']) buildCore();
  const server = await startPreview(port);
  const { browser, name: browserName } = await openBrowser();
  const runs = [];
  try {
    if (touchMode && browserName !== 'chromium') throw new Error(`--touch は Chromium（CDP）が要る（いま ${browserName}。画面のロックを外すか KAGE_BROWSER=chromium）`);
    for (let k = 0; k < repeat; k++) {
      const sub = repeat > 1 ? `run${k + 1}` : '';
      const outDir = path.join(ROOT, '.captures', round, `play-${touchMode ? 'touch-' : ''}${route.name}`, sub);
      if (repeat > 1) console.log(`--- ${k + 1}/${repeat} 回目`);
      runs.push(await runOnce({ file, route, seed, server, browser, browserName, outDir }));
    }
  } finally {
    await browser.close();
    await server.stop();
  }
  const ok = runs.every((r) => r.pass);
  if (repeat > 1) {
    console.log(`=== ${runs.filter((r) => r.pass).length}/${repeat} 回通った（実時間 ${runs.map((r) => r.summary.wallSeconds).join('・')} 秒）`);
    await writeFile(path.join(ROOT, '.captures', round, `play-touch-${route.name}`, 'runs.json'), JSON.stringify(runs.map((r) => r.summary), null, 2));
  }
  if (!ok) process.exitCode = 1;
}

async function runOnce({ file, route, seed, server, browser, browserName, outDir }) {
  await mkdir(outDir, { recursive: true });
  const statesFile = path.join(outDir, 'states.jsonl');
  await writeFile(statesFile, '');
  const errors = [];
  const external = [];
  const shots = [];
  let summary = null;
  let bot = null;
  let context = null;
  try {
    context = touchMode
      ? await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
      : await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    if (touchMode) {
      // 外部通信（プレビューの外への要求）を数える
      page.on('request', (r) => {
        const u = r.url();
        if (!u.startsWith(server.url) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
      });
      // 共有欄（配信先の hundred-days が足す部品）は、隣の day-082-kageuchi/shared/ の実物を返す（e2e/fixtures.ts・touch-shots.mjs と同じ）
      await page.route('**/shared/share.*', async (r) => {
        const name = new URL(r.request().url()).pathname.split('/').pop() ?? '';
        const f = path.join(ROOT, '..', 'shared', name);
        if (!/^share\.(css|js)$/.test(name) || !existsSync(f)) return r.fulfill({ status: 404, body: '' });
        return r.fulfill({ body: readFileSync(f), contentType: name.endsWith('.css') ? 'text/css' : 'text/javascript' });
      });
      bot = await createTouchBot(page, { viewport: VIEWPORT });
    }
    const god = args.god ? '&god=1' : '';
    const touchQ = touchMode ? `&touch=1&view=${viewKind}` : '';
    await page.goto(`${server.url}/?autostart=1&seed=${seed}&speed=${speed}${god}${touchQ}`);
    await page.waitForFunction(() => window.__appReady === true || typeof window.__appError === 'string', null, { timeout: 60_000 });
    const appError = await page.evaluate(() => window.__appError ?? null);
    if (appError) throw new Error(`起動に失敗: ${appError}`);
    const gpu = await assertGpu(page);
    console.log(`ブラウザ: ${browserName}（${gpu}）・台本 ${path.relative(ROOT, file)}・種 ${seed}・${speed} 倍${touchMode ? `・タッチだけ（${VIEWPORT.width}×${VIEWPORT.height}・画素比2）` : ''}`);
    if (bot) {
      // キーボードの経路と同じく、起動したらすぐ流す（sim は autostart で動いているので、待つと番兵の時機がずれる）
      await page.waitForFunction(() => window.__touch?.active() === true, null, { timeout: 30_000 });
      await bot.install();
      await bot.start(route);
    } else await page.evaluate((r) => window.__autopilot.start(r), route);

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
        if (bot) {
          await bot.releaseAll();
          const info = await page.evaluate(() => window.__touch?.info() ?? null);
          summary.touch = {
            events: info?.events ?? null,
            bot: bot.stats,
            lookSwipesFromPage: await page.evaluate(() => window.__touchBotLook?.sent ?? null),
            externalRequests: external,
            viewport: VIEWPORT,
            deviceScaleFactor: 2,
            view: viewKind,
          };
        }
        break;
      }
      if (st.screen === 'finale' && !shots.some((s) => s.endsWith('finale.png')) && (st.finale ?? 0) > 0.62) await shoot('finale');
      await page.waitForTimeout(100);
    }
  } finally {
    await context?.close();
  }
  await writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  const s = summary;
  console.log(`結末: ${s.outcome ?? 'なし'}（画面 ${s.screen}）・時間 ${s.gameTime ?? '-'} 秒・発見 ${s.discoveries}・当て身 ${s.takedowns}・小石 ${s.stonesUsed}・位 ${s.rank ?? '-'}・実時間 ${s.wallSeconds} 秒`);
  if (s.autopilot?.failReason) console.log(`自動操作の失敗: ${s.autopilot.failReason}`);
  if (errors.length) console.log(`コンソールのエラー: ${errors.length} 件（最初: ${errors[0]}）`);
  console.log(`保存先: ${path.relative(ROOT, outDir)}/（states.jsonl・summary.json・PNG）`);
  let pass = s.outcome === 'win' && errors.length === 0;
  if (touchMode) {
    const ev = s.touch.events;
    const checks = [
      ['result に着いた', s.screen === 'result'],
      ['位が出た', !!s.rank],
      ['touch の pointer イベント > 0', !!ev && ev.touch > 0],
      ['mouse の pointer イベント = 0', !!ev && ev.mouse === 0],
      ['コンソールのエラー 0', errors.length === 0],
      ['外部通信 0', external.length === 0],
      ['指の命令の失敗 0', s.touch.bot.errors.length === 0 && s.touch.bot.unsupported.length === 0],
    ];
    for (const [name, ok] of checks) console.log(`  ${ok ? 'OK ' : 'NG '} ${name}`);
    console.log(`  pointer イベント: touch ${ev?.touch} ・mouse ${ev?.mouse} ・pen ${ev?.pen}（CDP のタッチ ${s.touch.bot.touchEvents} 回・なぞり ${s.touch.bot.swipes}・タップ ${s.touch.bot.taps}・スティック ${s.touch.bot.stickDowns}・命令の最長 ${s.touch.bot.maxMs}ms）`);
    if (s.touch.bot.errors.length) console.log(`  指の命令の失敗: ${s.touch.bot.errors.slice(0, 3).join(' / ')}`);
    if (external.length) console.log(`  外部通信: ${external.slice(0, 3).join(' / ')}`);
    pass = checks.every(([, ok]) => ok);
    console.log(`  合否: ${pass ? '合格' : '不合格'}`);
  }
  if (!touchMode && !pass) process.exitCode = 1;
  return { pass, summary };
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
