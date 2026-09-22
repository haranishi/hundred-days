// 連番PNG → ffmpeg。時計は advance だけで進める。import しただけでは何も書き出さない。
//   PLAYWRIGHT=<playwright index.js> node tools/promo/render-promo.mjs [--preview] [--out <mp4>]
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CAPTIONS, DEFAULT_FPS, DURATION_SECONDS, END_START, sceneAt } from './timeline.mjs';
import { writeMusic } from './promo-audio.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '../..');
const VIEW = { width: 540, height: 960 };
// iframe の中は実物のCanvasだけを 480×288 で出す。1画素が3×3の正方形になる寸法。
const GAME_CSS = `html,body{margin:0!important;width:480px!important;height:288px!important;overflow:hidden!important;background:#0d1322!important}
body>header,body>footer,#app>:not(#play),#play>:not(.stage),.hud,.toolbar,#touch{display:none!important}
#app{width:480px!important;margin:0!important;padding:0!important}
.stage{width:480px!important;height:288px!important;border:0!important;margin:0!important}
canvas{width:480px!important;height:288px!important;image-rendering:pixelated!important;border:0!important}
*{animation:none!important;transition:none!important}`;
/* 素の合成は -25 LUFS 前後で、他のDayの -16.6〜-17.1 LUFS より明らかに小さい。
   書き出し時に測り直して -17 LUFS・真のピーク -1.5 dBFS に揃える。 */
export const LOUDNESS_FILTER = 'loudnorm=I=-17:TP=-1.5:LRA=7';

export function parseArgs(args) {
  let preview = false;
  let out = join(here, 'promo.mp4');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--preview') preview = true;
    else if (args[i] === '--out' && args[i + 1] && !args[i + 1].startsWith('--')) out = resolve(args[++i]);
    else throw new Error('使い方: node tools/promo/render-promo.mjs [--preview] [--out <mp4>]');
  }
  if (extname(out) !== '.mp4') throw new Error('--out は .mp4 を指定してください');
  return { preview, out };
}

export function detectSwitches(raw, size, fps, threshold = 6) {
  const found = [];
  for (let i = 1; i < Math.floor(raw.length / size); i++) {
    let diff = 0;
    for (let j = 0; j < size; j++) diff += Math.abs(raw[i * size + j] - raw[(i - 1) * size + j]);
    if (diff / size > threshold && (!found.length || i / fps - found.at(-1) > 0.3)) found.push(i / fps);
  }
  return found;
}

export function verifySwitches(switches, tolerance = 0.4) {
  const expected = [...CAPTIONS.slice(1).map(c => c.start), END_START];
  if (switches.length !== expected.length || expected.some((t, i) => Math.abs(t - switches[i]) > tolerance)) {
    throw new Error(`字幕検査不合格: 予定 ${expected.join(', ')} / 検出 ${switches.join(', ')}（秒）`);
  }
}

function checkVideo(out, rect) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', out, '-vf',
    `crop=iw*${rect.w}:ih*${rect.h}:iw*${rect.x}:ih*${rect.y},scale=96:12,format=gray`,
    '-r', '20', '-f', 'rawvideo', '-'], { maxBuffer: 16 * 1024 * 1024 });
  verifySwitches(detectSwitches(raw, 96 * 12, 20));
  const info = JSON.parse(execFileSync('ffprobe',
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', out], { encoding: 'utf8' }));
  const video = info.streams.find(s => s.codec_type === 'video');
  if (video?.width !== 1080 || video?.height !== 1920
    || !info.streams.some(s => s.codec_type === 'audio')
    || Math.abs(Number(info.format.duration) - DURATION_SECONDS) > 0.15) {
    throw new Error('動画の寸法・音声・尺を確認してください');
  }
  console.log('字幕検査: 合格');
}

async function serve() {
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp' };
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = resolve(appDir, `.${path}`);
      if (!file.startsWith(appDir + sep)) { res.writeHead(403).end(); return; }
      res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' });
      res.end(await readFile(file));
    } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  return { server, base: `http://127.0.0.1:${server.address().port}/` };
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) { console.log('PLAYWRIGHT=<playwright index.js> node tools/promo/render-promo.mjs [--preview] [--out <mp4>]'); return; }
  const { preview, out } = parseArgs(args);
  for (const c of CAPTIONS) {
    if (c.lines.length > 2 || c.lines.some(line => [...line].length > 16)) throw new Error('字幕は1行16字・2行まで');
  }
  for (const command of ['ffmpeg', 'ffprobe']) execFileSync(command, ['-version'], { stdio: 'ignore' });
  const spec = process.env.PLAYWRIGHT || 'playwright';
  const mod = await import(spec.startsWith('.') || spec.startsWith('/') ? pathToFileURL(resolve(spec)).href : spec);
  const chromium = mod.chromium ?? mod.default?.chromium;
  if (!chromium) throw new Error('Playwright chromium がありません');

  const work = mkdtempSync(join(tmpdir(), 'day046-promo-'));
  let browser, server;
  try {
    const served = await serve(); server = served.server;
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: preview ? 1 : 2, locale: 'ja-JP', reducedMotion: 'no-preference' });
    const errors = [], blocked = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(served.base).origin) return route.continue();
      blocked.push(url.host); return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('tools/promo/promo.html', served.base).href);
    await page.waitForFunction(() => Boolean(window.__promo));
    const gameURL = new URL('../../index.html', new URL('tools/promo/promo.html', served.base)).href;
    await page.evaluate(url => window.__promo.load(url), gameURL);
    await page.waitForFunction(() => document.querySelector('iframe').contentWindow?.__day046);
    const game = page.frames().find(frame => frame.url() === gameURL);
    if (!game) throw new Error('ゲームiframeがありません');
    await game.addStyleTag({ content: GAME_CSS });
    await game.evaluate(() => { window.__day046.unlockAll(); window.__day046.setManual(true); });
    await game.evaluate(() => document.fonts.ready);
    await page.evaluate(() => document.fonts.ready);

    let lastScene, rect;
    for (let frame = 0; frame < DURATION_SECONDS * DEFAULT_FPS; frame++) {
      const t = frame / DEFAULT_FPS;
      const scene = sceneAt(t);
      if (scene.id !== lastScene) {
        lastScene = scene.id;
        if (scene.level) {
          await game.evaluate(({ level, from }) => {
            const api = window.__day046;
            api.setManual(true);
            api.begin(level);
            api.autopilot(true);
            api.advance(from * 1000);
          }, { level: scene.level, from: scene.gameFrom });
        }
      }
      await game.evaluate(ms => window.__day046.advance(ms), 1000 / DEFAULT_FPS);
      await page.evaluate(seconds => window.__promo.render(seconds), t);
      if (frame === 0) {
        const first = await game.evaluate(() => window.__day046.snapshot());
        if (first.status !== 'playing') throw new Error('1コマ目が遊んでいる画面ではありません');
        rect = await page.locator('#caption-lines').evaluate(el => {
          const r = el.getBoundingClientRect();
          if (r.left < innerWidth * 0.1 || r.right > innerWidth * 0.9 || r.top < innerHeight * 0.1
            || r.bottom > innerHeight * 0.9 || el.scrollWidth > r.width) {
            throw new Error('字幕がセーフエリアを超えています');
          }
          return { x: r.x / innerWidth, y: r.y / innerHeight, w: r.width / innerWidth, h: r.height / innerHeight };
        });
      }
      await page.screenshot({ path: join(work, `${String(frame).padStart(5, '0')}.png`), type: 'png' });
      if (frame % 150 === 0) console.log(`撮影 ${t}/${DURATION_SECONDS}秒`);
    }
    if (errors.length || blocked.length) throw new Error(`描画エラー ${errors.join('; ')} / 外部通信 ${blocked.length}件`);
    await browser.close(); browser = null;

    const wav = join(work, 'promo-audio.wav');
    writeMusic(wav);
    mkdirSync(dirname(out), { recursive: true });
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(DEFAULT_FPS), '-i', join(work, '%05d.png'), '-i', wav,
      '-vf', 'scale=1080:1920:flags=lanczos,format=yuv420p', '-af', LOUDNESS_FILTER, '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'libx264', '-preset', preview ? 'fast' : 'slow', '-crf', preview ? '26' : '22', '-c:a', 'aac', '-b:a', '160k',
      '-t', String(DURATION_SECONDS), '-map_metadata', '-1', '-movflags', '+faststart', out], { stdio: 'inherit' });
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', out, '-frames:v', '1', join(here, 'promo-first-frame.png')]);
    checkVideo(out, rect);
    console.log('作成完了: 30秒・1080×1920・30fps。1コマ目・字幕・音を目視と聴取で確かめること。');
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
