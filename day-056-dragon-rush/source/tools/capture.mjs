// OWNER: tools
// 固定ショットの撮影。ビルド → プレビューを子プロセスで起動 → GPU を使うブラウザ（tools/lib/browser.mjs）で6構図を
// 1600×900 で撮り、.captures/<周の名前>/ に PNG と shots.json（描画命令数・三角形数・明るさ）を書く。
//
//   npm run capture -- r00a                 6構図を撮る（周の名前は位置引数か --round）
//   npm run capture -- r00a --shots street  一部だけ
//   npm run capture -- r00a --film overview --frames 90   コマ撮り（連番 PNG）
//   --no-build でビルドを省く、--q medium で画質を変える、--port でプレビューのポートを変える（環境変数 DR_PORT も可）
//   6構図の後に、カメラが街の上を横へ流れる連番（film-pan、既定60コマ）も撮る。--pan-frames N で枚数、--no-pan で省く（r01-city）
//   r03-fx：--film はカンマ区切りで複数撮れる（例 breath,collapse,aftermath）。--stride N で1コマに 1/60 秒を N 刻み進める
//   （collapse は既定 2）。collapse は breath と同じビルが崩れる連番
//   r04-fx2：--fx-log を付けると、film-<名前>.json にコマごとの効果の記録（fxFrames）も書く
//   r06-motion：--motion turn,land --creature raiyoku で、遊ぶカメラ（自動プレイの台本、HUD なし）のまま動きをコマ送りで撮る
//   （1280×720 の JPEG を motion-<名前>-<怪獣>/ に。--frames 枚数・--every 何刻みごとに1枚）。ページの時計を止めて 1/60 秒ずつ進めるので、
//   同じ台本なら前の版でも同じゲーム内時刻の絵になる（motion-*.json の t で突き合わせる）
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, assertHardwareGpu, buildApp, launchBrowser, parseArgs, pngStats, portFrom, startPreview } from './lib/harness.mjs';

const SHOT_NAMES = ['overview', 'street', 'breath', 'landing', 'closeup', 'aftermath'];
const VIEWPORT = { width: 1600, height: 900 };

const args = parseArgs(process.argv.slice(2));
const PORT = portFrom(args, 5304);
const round = String(args.round ?? args._[0] ?? 'scratch');
const quality = String(args.q ?? 'high');
const shots = args.shots ? String(args.shots).split(',') : SHOT_NAMES;
const panFrames = args['no-pan'] || args.shots ? 0 : Number(args['pan-frames'] ?? 60);
const outDir = path.join(ROOT, '.captures', round);

function watchErrors(page) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function waitReady(page, flag, timeoutMs) {
  await page.waitForFunction((f) => window[f] === true || typeof window.__appError === 'string', flag, { timeout: timeoutMs, polling: 250 });
  const appError = await page.evaluate(() => window.__appError ?? null);
  if (appError) throw new Error(`ページの起動に失敗: ${appError}`);
}

async function captureShots(context, url) {
  const results = [];
  for (const name of shots) {
    const page = await context.newPage();
    const errors = watchErrors(page);
    const t0 = Date.now();
    await page.goto(`${url}/?shot=${name}&q=${quality}`);
    await waitReady(page, '__shotReady', 120000);
    const info = await page.evaluate(() => window.__shotInfo);
    assertHardwareGpu(info.gpu);
    const file = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: file, type: 'png' });
    const luminance = await pngStats(file);
    results.push({ name, file: path.relative(ROOT, file), calls: info.calls, triangles: info.triangles, readyMs: info.readyMs, wallMs: Date.now() - t0, gpu: info.gpu, fx: info.fx ?? null, luminance, consoleErrors: errors });
    console.log(`${name.padEnd(10)} calls=${String(info.calls).padStart(5)} tris=${String(info.triangles).padStart(8)} ready=${info.readyMs}ms p50=${luminance.p50} p99=${luminance.p99} clip=${luminance.clippedRatio} errors=${errors.length}`);
    // r01-city：シェーダーのコンパイルの失敗などを、その場で読めるように最初の1件を出す
    if (errors.length > 0) console.log(`  最初のエラー: ${errors[0].slice(0, 1500)}`);
    await page.close();
  }
  return results;
}

async function captureFilm(context, url, name, frames) {
  const dir = path.join(outDir, `film-${name}`);
  await mkdir(dir, { recursive: true });
  const page = await context.newPage();
  const errors = watchErrors(page);
  const stride = args.stride ? `&stride=${Number(args.stride)}` : '';
  await page.goto(`${url}/?film=${name}&frames=${frames}&drive=ext&q=${quality}${stride}`);
  await waitReady(page, '__filmReady', 120000);
  // r04-fx2：--fx-log で、コマごとの効果の記録（崩れの段・瓦礫の山の盛り上がり・破片の加速など）も残す
  const fxFrames = args['fx-log'] ? [] : null;
  for (let k = 0; k < frames; k++) {
    const frame = await page.evaluate(() => window.__filmStep());
    if (frame !== k) throw new Error(`コマ番号がずれた: 期待 ${k}、実際 ${frame}`);
    await page.screenshot({ path: path.join(dir, `${String(k).padStart(4, '0')}.png`), type: 'png' });
    if (fxFrames) fxFrames.push(await page.evaluate(() => window.__filmFx ?? null));
  }
  // r03-fx：最後のコマの効果の数（破片の種類と大きさなど。破壊の場面の連番だけ）
  const fx = await page.evaluate(() => window.__filmFx ?? null);
  await page.close();
  console.log(`film ${name}: ${frames} コマを ${path.relative(ROOT, dir)} に保存 errors=${errors.length}`);
  return { name, frames, dir: path.relative(ROOT, dir), fx, ...(fxFrames ? { fxFrames } : {}), consoleErrors: errors };
}

/**
 * r06-motion：動きのコマ送りの台本（キーは src/harness/keys.ts の名前、時刻はゲーム内の秒）。fly は空から始まる怪獣、ground は焔角。
 * turn：降りて歩き、視点を0.4秒で180度回す（マウスを右へ1428画素）。怪獣は前へ歩きながら旋回の速さで振り向き、カメラは背の後ろへ回り込む
 * land：急降下で着地する（焔角は歩きながら跳んでのしかかる）。tail：尾の技。fly：羽ばたいて飛ぶ（焔角には無い）。from から撮り始める
 */
const lookTurn = (at) => Array.from({ length: 20 }, (_, i) => ({ at: at + i * 0.02, do: 'look', dx: Math.PI / 0.0022 / 20, dy: 0 }));
const MOTION_SCRIPTS = {
  turn: {
    fly: {
      from: 4.2,
      steps: [{ at: 0.1, do: 'press', key: 'shift' }, { at: 2.6, do: 'release', key: 'shift' }, { at: 2.8, do: 'press', key: 'w' }, ...lookTurn(4.6), { at: 7.2, do: 'release', key: 'w' }],
    },
    ground: { from: 1.8, steps: [{ at: 0.2, do: 'press', key: 'w' }, ...lookTurn(2.2), { at: 4.8, do: 'release', key: 'w' }] },
  },
  // 尾の技（Q）：降りて歩き、止まって尾を振る。技の最中は二次運動を絞る（当たりの見え方を崩さない）ことを見る
  tail: {
    fly: { from: 4.0, steps: [{ at: 0.1, do: 'press', key: 'shift' }, { at: 2.6, do: 'release', key: 'shift' }, { at: 2.8, do: 'press', key: 'w' }, { at: 4.0, do: 'release', key: 'w' }, { at: 4.2, do: 'tap', key: 'q' }] },
    ground: { from: 1.6, steps: [{ at: 0.2, do: 'press', key: 'w' }, { at: 1.6, do: 'release', key: 'w' }, { at: 1.8, do: 'tap', key: 'q' }] },
  },
  // 飛ぶ（空から始まる怪獣だけ）：前へ飛びながら上昇の羽ばたきを続け、途中で視点を右へ90度振る。翼の先の遅れが羽ばたきを壊さないことを見る
  fly: {
    fly: { from: 1.0, steps: [{ at: 0.1, do: 'press', key: 'w' }, { at: 0.1, do: 'press', key: 'space' }, ...lookTurn(1.6).slice(0, 10), { at: 4.0, do: 'release', key: 'space' }] },
  },
  land: {
    fly: { from: 1.0, steps: [{ at: 0.1, do: 'press', key: 'shift' }, { at: 3.5, do: 'release', key: 'shift' }] },
    ground: {
      from: 1.9,
      steps: [
        { at: 0.2, do: 'press', key: 'w' },
        { at: 1.0, do: 'tap', key: 'space' },
        { at: 2.8, do: 'release', key: 'w' },
      ],
    },
  },
};
const GROUND_ONLY = new Set(['homuratsuno']);

async function captureMotion(context, url, name, creature, frames, every) {
  if (!MOTION_SCRIPTS[name]) throw new Error(`知らない動きの台本: ${name}（${Object.keys(MOTION_SCRIPTS).join('・')}）`);
  const spec = MOTION_SCRIPTS[name][GROUND_ONLY.has(creature) ? 'ground' : 'fly'];
  if (!spec) throw new Error(`動きの台本 ${name} は ${creature} には無い（飛べない怪獣は fly を撮れない）`);
  const dir = path.join(outDir, `motion-${name}-${creature}`);
  await mkdir(dir, { recursive: true });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.addInitScript((steps) => (window.__playtestScript = steps), spec.steps);
  // 読み込みの間は時計を流し、遊びが始まったら止めて、1/60 秒ずつ進める
  await page.clock.install();
  await page.goto(`${url}/?playtest=script&speed=1&hud=0&q=${quality}&creature=${creature}`);
  await page.waitForFunction(() => (window.__appReady === true && window.__state?.phase === 'playing') || typeof window.__appError === 'string', null, { timeout: 180000 });
  const appError = await page.evaluate(() => window.__appError ?? null);
  if (appError) throw new Error(`ページの起動に失敗: ${appError}`);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
  const now = () => page.evaluate(() => window.__state.t);
  let t = await now();
  // 撮り始めの 1.5 秒前までは大きく進め、その後は1コマずつ（カメラと二次運動のばねが同じ刻みの履歴になるように）
  while (t < spec.from - 1.5) {
    await page.clock.runFor(100);
    t = await now();
  }
  while (t < spec.from) {
    await page.clock.runFor(1000 / 60);
    t = await now();
  }
  const log = [];
  for (let k = 0; k < frames; k++) {
    for (let j = 0; j < every; j++) await page.clock.runFor(1000 / 60);
    const s = await page.evaluate(() => {
      // 竜の胴の中心が画面のどこに映るか（画素）と、35m が何画素か（並べる絵で竜のまわりを切り出すため）
      const app = window.__app;
      const c = app.dragon.root.position.clone().project(app.camera);
      const side = app.dragon.root.position.clone().addScaledVector(app.camera.up.clone().cross(app.camera.getWorldDirection(c.clone())).normalize(), 35).project(app.camera);
      const w = innerWidth;
      const h = innerHeight;
      const px = { x: ((c.x + 1) / 2) * w, y: ((1 - c.y) / 2) * h };
      const r = Math.hypot(((side.x + 1) / 2) * w - px.x, ((1 - side.y) / 2) * h - px.y);
      return { t: window.__state.t, mode: window.__state.dragon.mode, yawDeg: window.__state.dragon.yawDeg, speed: window.__state.dragon.speed, screen: { x: Math.round(px.x), y: Math.round(px.y), r: Math.round(r) } };
    });
    const file = path.join(dir, `${String(k).padStart(4, '0')}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 85 });
    log.push({ frame: k, ...s });
  }
  await page.close();
  console.log(`motion ${name} ${creature}: ${frames} コマ（t=${log[0]?.t}〜${log[log.length - 1]?.t}）を ${path.relative(ROOT, dir)} に保存 errors=${errors.length}`);
  return { name, creature, frames, every, dir: path.relative(ROOT, dir), log, consoleErrors: errors };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const buildMs = args['no-build'] ? 0 : buildApp();
  const server = await startPreview(PORT);
  const browser = await launchBrowser();
  try {
    if (args.motion) {
      const creature = String(args.creature ?? 'kurenai');
      for (const name of String(args.motion).split(',')) {
        // 時計は文脈（context）ごとに1つなので、台本ごとに文脈を作り直す（止めた時計を次の読み込みに持ち越さない）
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
        const m = await captureMotion(context, server.url, name, creature, Number(args.frames ?? 60), Number(args.every ?? 2));
        await context.close();
        await writeFile(path.join(outDir, `motion-${name}-${creature}.json`), JSON.stringify({ round, quality, date: new Date().toISOString(), ...m }, null, 2));
        if (m.consoleErrors.length) process.exitCode = 1;
      }
      return;
    }
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    if (args.film) {
      for (const name of String(args.film).split(',')) {
        const film = await captureFilm(context, server.url, name, Number(args.frames ?? 60));
        await writeFile(path.join(outDir, `film-${film.name}.json`), JSON.stringify({ round, quality, date: new Date().toISOString(), stride: Number(args.stride ?? 0) || null, ...film }, null, 2));
        if (film.consoleErrors.length) process.exitCode = 1;
      }
      return;
    }
    const results = await captureShots(context, server.url);
    const summary = {
      round,
      quality,
      date: new Date().toISOString(),
      viewport: VIEWPORT,
      buildMs,
      browser: browser.browserType().name(),
      gpu: results[0]?.gpu,
      shots: results,
    };
    await writeFile(path.join(outDir, 'shots.json'), JSON.stringify(summary, null, 2));
    console.log(`保存先: ${path.relative(ROOT, outDir)}/（shots.json と PNG）`);
    let panErrors = 0;
    if (panFrames > 0) {
      const pan = await captureFilm(context, server.url, 'pan', panFrames);
      await writeFile(path.join(outDir, 'film-pan.json'), JSON.stringify({ round, quality, date: new Date().toISOString(), ...pan }, null, 2));
      panErrors = pan.consoleErrors.length;
    }
    if (panErrors > 0 || results.some((r) => r.consoleErrors.length > 0)) {
      console.error('コンソールにエラーがありました');
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
