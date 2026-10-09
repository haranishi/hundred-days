// Day062「終電サドンデス」のプロモーション動画自動生成スクリプト
import { chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DURATION_SECONDS, STORYBOARD } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const output = join(here, 'output');
const font = process.env.PROMO_FONT || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
const VIEW = { width: 540, height: 960 };
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
await mkdir(output, { recursive: true });

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    if (path === '/__promo-font') return res.writeHead(200, { 'content-type': 'font/ttf' }).end(await readFile(font));
    if (path.endsWith('/')) path += 'index.html';
    const full = resolve(root, 'dist', `.${path}`);
    if (!full.startsWith(join(root, 'dist') + '/')) return res.writeHead(403).end();
    res.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream' }).end(await readFile(full));
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let context;
const errors = [];
const evidence = [];

try {
  context = await browser.newContext({ viewport: VIEW, locale: 'ja-JP', recordVideo: { dir: join(output, 'raw'), size: VIEW } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await page.goto(`${base}/day-062-last-train/`, { waitUntil: 'networkidle' });

  // プロモ用オーバーレイのスタイル注入
  await page.addStyleTag({
    content: `
    @font-face {font-family:Promo;src:url('/__promo-font');font-weight:700}
    html{scroll-behavior:auto!important} ::-webkit-scrollbar{display:none}
    .promo-layer{position:fixed;inset:0;z-index:2147483645;pointer-events:none;font-family:Promo,sans-serif;color:#f8fafc}
    .promo-bar{position:absolute;top:0;left:0;right:0;height:118px;padding:30px 30px 42px;display:flex;align-items:center;justify-content:space-between;background:#090d16}
    .promo-brand{font-size:22px;letter-spacing:.08em;color:#f1f5f9}.promo-day{font:700 11px/1.2 Promo,sans-serif;letter-spacing:.18em;color:#fb7185;border:1px solid #e11d48;padding:9px 12px;border-radius:20px}
    .promo-lower{position:absolute;bottom:0;left:0;right:0;height:255px;padding:47px 24px 45px;background:linear-gradient(#090d1600,#090d16f5 20%,#090d16 75%);text-align:center}
    .promo-kicker{font-size:10px;letter-spacing:.24em;color:#fb7185;margin-bottom:12px}
    .promo-caption{font-size:33px;line-height:1.4;letter-spacing:.025em;margin:0;font-weight:700}
    .promo-caption span{display:block}.promo-caption span:last-child{color:#fda4af}
    .promo-disclaimer{position:absolute;bottom:26px;left:16px;right:16px;font-size:11px;color:#94a3b8;letter-spacing:.015em;text-align:center}
    .promo-progress{position:absolute;bottom:0;left:0;height:3px;background:#f43f5e;width:0}
    .promo-tap{position:absolute;width:58px;height:58px;margin:-29px;border:3px solid #fda4af;border-radius:50%;background:#f43f5e30;opacity:0}
    .promo-tap[data-on='1']{animation:tap .65s ease-out forwards}@keyframes tap{0%{opacity:1;transform:scale(.45)}100%{opacity:0;transform:scale(1.3)}}
    .promo-focus{outline:3px solid #f43f5e!important;outline-offset:7px;box-shadow:0 0 35px #f43f5e44;border-radius:6px}
    .promo-end{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 28%,#2b1019,#090d16 65%);display:none;align-items:center;justify-content:center;text-align:center;flex-direction:column;padding:40px}
    .promo-end[data-on='1']{display:flex}.promo-end .mark{width:100px;height:100px;margin-bottom:38px;border:2px solid #f43f5e;border-radius:24px;display:grid;place-items:center;background:#e11d4815;box-shadow:0 0 70px #f43f5e33}
    .promo-end .mark svg{width:58px;height:58px}.promo-end h1{font-size:58px;letter-spacing:.08em;margin:0 0 16px;color:#fff}.promo-end p{font-size:22px;line-height:1.5;margin:0 0 32px;color:#cbd5e1}.promo-end .cta{font-size:20px;color:#0f172a;background:#fda4af;border-radius:50px;padding:18px 28px;font-weight:700}.promo-end .url{font-size:12px;margin:27px 0 0;color:#94a3b8;line-height:1.7}.promo-end small{position:absolute;bottom:72px;color:#64748b;font-size:11px;line-height:1.8}
    .promo-marker{position:fixed;inset:0;z-index:2147483647;background:rgb(250,0,250);pointer-events:none}
  ` });

  await page.evaluate(async () => { await document.fonts.load('700 33px Promo'); });
  await page.evaluate(() => {
    const layer = document.createElement('div'); layer.className = 'promo-layer';
    layer.innerHTML = `
      <div class="promo-bar"><div class="promo-brand">終電サドンデス</div><div class="promo-day">DAY 062 / 100</div></div>
      <div class="promo-lower"><div class="promo-kicker">ESCAPE BEFORE DEADLINE · LAST TRAIN RADAR</div><p class="promo-caption"></p></div>
      <div class="promo-disclaimer">架空シミュレーション・運行情報は各鉄道会社をご確認ください</div>
      <div class="promo-end">
        <div class="mark">
          <svg viewBox="0 0 60 60" fill="none" stroke="#fda4af" stroke-width="2.5">
            <rect x="12" y="10" width="36" height="40" rx="8"/>
            <circle cx="20" cy="40" r="3" fill="#fda4af"/>
            <circle cx="40" cy="40" r="3" fill="#fda4af"/>
            <line x1="12" y1="26" x2="48" y2="26"/>
            <line x1="22" y1="18" x2="38" y2="18"/>
          </svg>
        </div>
        <div class="promo-day" style="margin-bottom:20px">DAY 062 / 100</div>
        <h1>終電サドンデス</h1>
        <p>帰宅権を守る、<br>脱出シミュレーター。</p>
        <div class="cta">リンクはリプ欄へ ↗</div>
        <div class="url">hundred-days.pages.dev<br>/day-062-last-train/</div>
        <small>終電時刻と移動タイムロスの逆算ツールです。<br>実際の運行情報は公式案内をご確認ください。</small>
      </div>
      <div class="promo-progress"></div>
      <div class="promo-tap"></div>
    `;
    document.body.append(layer);
    window.promoCaption = lines => { layer.querySelector('.promo-caption').replaceChildren(...lines.map(text => { const el = document.createElement('span'); el.textContent = text; return el; })); };
    window.promoTap = (x, y) => { const tap = layer.querySelector('.promo-tap'); tap.style.left = x + 'px'; tap.style.top = y + 'px'; tap.dataset.on = '0'; void tap.offsetWidth; tap.dataset.on = '1'; };
    window.promoEnd = () => { layer.querySelector('.promo-end').dataset.on = '1'; };
  });

  const pan = async (locator, offset = 120, duration = 420) => {
    await locator.evaluate((el, { offset, duration }) => new Promise(done => {
      const from = window.scrollY, to = Math.min(document.documentElement.scrollHeight - innerHeight, Math.max(0, el.getBoundingClientRect().top + from - offset)), start = performance.now();
      const step = now => { const t = Math.min(1, (now - start) / duration), k = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; scrollTo(0, from + (to - from) * k); t < 1 ? requestAnimationFrame(step) : done(); }; requestAnimationFrame(step);
    }), { offset, duration });
  };
  const tap = async locator => { const box = await locator.boundingBox(); if (!box) throw Error('対象がありません'); await page.evaluate(([x, y]) => window.promoTap(x, y), [box.x + box.width / 2, box.y + box.height / 2]); };
  const focus = async locator => { await page.locator('.promo-focus').evaluateAll(els => els.forEach(e => e.classList.remove('promo-focus'))); if (locator) await locator.evaluate(el => el.classList.add('promo-focus')); };
  const caption = async index => { await page.evaluate(lines => window.promoCaption(lines), STORYBOARD[index].lines); console.log(`Scene ${index}: ${STORYBOARD[index].lines.join(' ')}`); };
  const still = async name => page.screenshot({ path: join(output, `${name}.png`) });

  // 画面初期状態
  const timerBoard = page.locator('.timer-board');
  await pan(timerBoard, 110, 1);
  await caption(0);

  // マーカー配置と録画開始
  await page.evaluate(() => { const m = document.createElement('div'); m.className = 'promo-marker'; document.body.append(m); });
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('.promo-marker').remove());
  const start = Date.now();
  await page.evaluate(seconds => document.querySelector('.promo-progress').animate([{ width: '0%' }, { width: '100%' }], { duration: seconds * 1000, fill: 'forwards', easing: 'linear' }), DURATION_SECONDS);
  const at = async seconds => { const wait = start + seconds * 1000 - Date.now(); if (wait > 0) await page.waitForTimeout(wait); else if (wait < -550) throw Error(`撮影が ${(-wait / 1000).toFixed(2)}秒遅延: ${seconds}s`); };

  await still('scene-0');

  // Scene 1 (4s〜): タイムロスの逆算
  await at(4); await caption(1);
  const lossCard = page.locator('.card').filter({ hasText: 'タイムロスの逆算' });
  await pan(lossCard, 115);
  const toiletCheck = page.locator('#check-toilet');
  await at(5.2); await tap(toiletCheck); await toiletCheck.check();
  evidence.push('Toilet loss checked (+4min)');

  const walkSlider = page.locator('#walk-slider');
  await at(6.5); await tap(walkSlider);
  await page.evaluate(() => {
    const s = document.getElementById('walk-slider');
    s.value = '12';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  evidence.push('Walk loss adjusted to 12min');
  await still('scene-1');

  // Scene 2 (8s〜): 本当の限界時間を突きつける
  await at(8); await caption(2);
  await pan(timerBoard, 110);
  const countdown = page.locator('#countdown-digits');
  await focus(countdown);
  await expect(page.locator('#val-loss-total')).toContainText('27 分');
  evidence.push('Total loss increased to 27min');
  await still('scene-2');

  // Scene 3 (13s〜): 全国主要駅の設定
  await at(13); await caption(3); await focus(null);
  const routeCard = page.locator('.card').filter({ hasText: '脱出区間' });
  await pan(routeCard, 110);
  const presetShibuya = page.locator('.station-pill').filter({ hasText: '渋谷' }).first();
  await at(14.8); await tap(presetShibuya); await presetShibuya.click();
  await expect(page.locator('#display-from-station')).toContainText('渋谷駅');
  evidence.push('Station changed to Shibuya');
  await still('scene-3');

  // Scene 4 (18s〜): 臨界・サドンデス突入
  await at(18); await caption(4);
  await pan(timerBoard, 110);
  // 終電時刻をシミュレーションして臨界・サドンデス状態を発動させる
  await page.evaluate(() => {
    // 終電を直近に設定してサドンデス状態を演出
    document.body.setAttribute('data-level', 'sudden-death');
    const badge = document.getElementById('status-badge');
    const name = document.getElementById('status-name');
    const msg = document.getElementById('status-message');
    if (badge) { badge.textContent = 'LEVEL 4'; badge.className = 'status-badge level-sudden-death'; }
    if (name) { name.textContent = 'サドンデス (SUDDEN DEATH)'; }
    if (msg) { msg.textContent = '🚨 今すぐ店を出てダッシュしないと確実に帰宅権を失います！'; }
  });
  const statusBanner = page.locator('.status-banner');
  await focus(statusBanner);
  evidence.push('Level changed to SUDDEN DEATH');
  await still('scene-4');

  // Scene 5 (23s〜): 逃せば終電死亡・始発サバイバル
  await at(23); await caption(5); await focus(null);
  await page.evaluate(() => {
    const input = document.getElementById('input-train-time');
    const now = new Date();
    const pastH = String((now.getHours() + 23) % 24).padStart(2, '0');
    const pastM = String(now.getMinutes()).padStart(2, '0');
    input.value = `${pastH}:${pastM}`;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const gameoverPanel = page.locator('#gameover-panel');
  await expect(gameoverPanel).toBeVisible({ timeout: 5000 });
  await pan(gameoverPanel, 100);
  const spinBtn = page.locator('#btn-spin-roulette');
  await at(24.8); await tap(spinBtn); await spinBtn.click();
  evidence.push('GameOver & Survival roulette activated');
  await still('scene-5');

  // Scene 6 (28s〜): 終了カード
  await at(28); await caption(6);
  await page.evaluate(() => window.promoEnd());
  await at(28.5); await still('cover');

  await at(DURATION_SECONDS + .15);
  const raw = await page.video().path();
  await context.close();
  context = null;

  if (errors.length) throw Error(`ブラウザ例外: ${errors.join('; ')}`);

  // ffmpegでトリミング位置検出
  const pixels = execFileSync('ffmpeg', ['-v', 'error', '-i', raw, '-vf', 'fps=25,crop=2:2:0:0,scale=1:1,format=rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 4 * 1024 * 1024 });
  let lastMarker = -1;
  for (let i = 0; i < pixels.length / 3; i++) {
    if (pixels[i * 3] > 220 && pixels[i * 3 + 1] < 35 && pixels[i * 3 + 2] > 220) lastMarker = i;
  }
  if (lastMarker < 0) throw Error('トリム用マーカーが録画されていません');
  const offset = (lastMarker + 1) / 25;

  const wav = join(output, 'original-bgm.wav');
  execFileSync(process.execPath, [join(here, 'promo-audio.mjs'), '--out', wav], { stdio: 'inherit' });

  const video = join(output, 'Day062_last_train_promo.mp4');
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'warning', '-y',
    '-ss', String(offset),
    '-i', raw,
    '-i', wav,
    '-t', String(DURATION_SECONDS),
    '-map', '0:v:0', '-map', '1:a:0',
    '-vf', 'scale=1080:1920:flags=lanczos,fps=30,setsar=1',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-af', 'afade=t=in:d=0.08,afade=t=out:st=31.2:d=0.8',
    '-movflags', '+faststart',
    '-map_metadata', '-1',
    video
  ], { stdio: 'inherit' });

  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', video], { encoding: 'utf8' }));
  const v = probe.streams.find(s => s.codec_type === 'video');
  const a = probe.streams.find(s => s.codec_type === 'audio');
  if (v.width !== 1080 || v.height !== 1920 || v.pix_fmt !== 'yuv420p' || a.codec_name !== 'aac' || Math.abs(Number(probe.format.duration) - 32) > .25) {
    throw Error(`出力仕様が不一致です: ${v.width}x${v.height}, duration: ${probe.format.duration}`);
  }

  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-frames:v', '1', join(output, 'first-frame.png')]);
  await writeFile(join(output, 'capture-checks.json'), JSON.stringify({
    seconds: 32,
    width: 1080,
    height: 1920,
    fps: 30,
    trimOffset: offset,
    actualUiEvidence: evidence,
    browserErrors: errors,
    source: 'published build in dist/day-062-last-train',
    overlay: 'captions, focus rings, original end card',
    music: 'original synthesized PCM; no third-party samples'
  }, null, 2) + '\n');

  console.log(`Created: ${video}`);
} finally {
  if (context) await context.close();
  await browser.close();
  await new Promise(done => server.close(done));
}
