import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULT_FPS, DURATION_SECONDS, ORIGIN, previewTimes } from './timeline.mjs';

const promoDir = dirname(fileURLToPath(import.meta.url));
const appDir = dirname(dirname(promoDir));
const audioPath = join(promoDir, 'promo-audio.wav');
const audioScript = join(promoDir, 'promo-audio.mjs');
const firstFramePath = join(promoDir, 'promo-first-frame.png');
const contactPath = join(promoDir, 'preview-contact.jpg');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wav': 'audio/wav'
};

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const valueOf = (name) => {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  if (!args[index + 1] || args[index + 1].startsWith('--')) fail(`${name} に値が必要です`);
  return args[index + 1];
};

const preview = args.includes('--preview');
const fps = Number(valueOf('--fps') ?? DEFAULT_FPS);
const from = Number(valueOf('--from') ?? 0);
const to = Number(valueOf('--to') ?? DURATION_SECONDS);
const requestedOut = valueOf('--out');
const out = requestedOut ?? join(promoDir, 'promo.mp4');

if (!Number.isFinite(fps) || fps <= 0 || fps > 60) fail('--fps は 0 より大きく 60 以下にしてください');
if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to > DURATION_SECONDS || from >= to) {
  fail(`--from/--to は 0 <= from < to <= ${DURATION_SECONDS} にしてください`);
}
if (requestedOut && !isAbsolute(requestedOut)) fail('--out は絶対パスで指定してください');
if (!preview) mkdirSync(dirname(out), { recursive: true });

for (const command of ['ffmpeg', 'ffprobe']) {
  try { execFileSync('which', [command], { stdio: 'ignore' }); }
  catch { fail(`${command} が見つかりません`); }
}

if (!preview && !existsSync(audioPath)) {
  console.log('音声が無いため先に合成します。');
  execFileSync(process.execPath, [audioScript], { stdio: 'inherit' });
}

const spec = process.env.PLAYWRIGHT;
if (!spec) fail('PLAYWRIGHT に Playwright の index.js の絶対パスを指定してください');
if (!isAbsolute(spec)) fail('PLAYWRIGHT は絶対パスで指定してください');
const target = pathToFileURL(resolve(spec)).href;

let chromium;
try {
  const mod = await import(target);
  chromium = mod.chromium ?? mod.default?.chromium;
  if (!chromium) throw new Error('chromium が見つかりません');
} catch (error) {
  fail(`Playwright を読み込めませんでした: ${error.message}`);
}

/* アプリと合成ページを同じオリジンで配る。地名検索の中継（/api/day-029/）は使わない
   ——プロモは現在地から探すところだけを見せるので、静的サーバーで足りる。 */
function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://local');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = resolve(appDir, `.${pathname}`);
      if (file !== appDir && !file.startsWith(`${appDir}${sep}`)) {
        response.writeHead(403).end('forbidden');
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, {
        'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'no-store'
      }).end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolveServer(server);
    });
  });
}

const work = mkdtempSync(join(tmpdir(), 'day029-promo-'));
let server;
let browser;
try {
  server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
    locale: 'ja-JP'
  });
  // 「現在地から探す」を押せるようにする。秋田駅の座標で撮ると件数も並び順も決まる。
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: ORIGIN.latitude, longitude: ORIGIN.longitude });
  const page = await context.newPage();
  // iframe 側にも入る。promo.js はこれで生えた __wifiMap でタイルの完了を待つ。
  await page.addInitScript(() => { window.__E2E__ = true; });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${baseUrl}/tools/promo/promo.html`, { waitUntil: 'load' });
  await page.evaluate(() => window.__promoReady);

  const times = preview
    ? previewTimes().filter((time) => time >= from && time < to)
    : Array.from({ length: Math.ceil((to - from) * fps) }, (_, index) => from + index / fps);
  if (times.length === 0) fail('描画対象のフレームがありません');

  console.log(`${preview ? 'プレビュー' : '動画'}: ${times.length}コマを描画します`);
  for (let index = 0; index < times.length; index += 1) {
    const time = times[index];
    await page.evaluate((t) => window.__seek(t), time);
    if (!preview && from === 0 && index === 0) {
      await page.screenshot({ path: firstFramePath, type: 'png' });
    }
    await page.screenshot({
      path: join(work, `frame_${String(index).padStart(5, '0')}.jpg`),
      type: 'jpeg',
      quality: 92
    });
    if (!preview && (index + 1) % Math.max(1, Math.round(fps * 3)) === 0) {
      console.log(`  ${index + 1}/${times.length}`);
    }
  }

  const warnings = await page.evaluate(() => window.__promoWarnings);
  await context.close();
  await browser.close();
  browser = null;

  if (preview) {
    const rows = Math.ceil(times.length / 4);
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-framerate', '1', '-i', join(work, 'frame_%05d.jpg'),
      '-vf', `scale=360:640:flags=lanczos,tile=4x${rows}:padding=8:margin=8:color=0b1026`,
      '-frames:v', '1', '-q:v', '2', contactPath
    ], { stdio: ['ignore', 'ignore', 'inherit'] });
    console.log(`プレビューを書き出しました: ${contactPath}`);
  } else {
    const ffmpegArgs = [
      '-y', '-loglevel', 'error', '-framerate', String(fps),
      '-i', join(work, 'frame_%05d.jpg')
    ];
    if (from > 0) ffmpegArgs.push('-ss', String(from));
    ffmpegArgs.push(
      '-i', audioPath,
      '-t', String(times.length / fps),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out
    );
    execFileSync('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'ignore', 'inherit'] });

    const probe = JSON.parse(execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration,size',
      '-show_entries', 'stream=codec_type,width,height', '-of', 'json', out
    ]).toString());
    const video = probe.streams.find(({ codec_type: type }) => type === 'video');
    const sizeMiB = Number(probe.format.size) / (1024 * 1024);
    console.log(`MP4を書き出しました: ${out}`);
    console.log(`  ${Number(probe.format.duration).toFixed(3)}秒 / ${video.width}x${video.height} / ${sizeMiB.toFixed(2)} MiB`);
    console.log(`  1コマ目: ${firstFramePath}`);
  }

  if (warnings.length) {
    console.log('気になった点:');
    for (const message of warnings) console.log(`  ⚠ ${message}`);
  }
} catch (error) {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  rmSync(work, { recursive: true, force: true });
}
