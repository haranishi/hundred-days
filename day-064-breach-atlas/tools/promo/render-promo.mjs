import { chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DURATION, STORYBOARD, DISCLOSURE } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url)), app = resolve(here, '../..');
const args = process.argv.slice(2);
const arg = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const work = arg('--work') || process.env.DAY064_PROMO_WORK;
if (!work) throw new Error('Specify --work on an available external development drive.');
const output = resolve(work), font = process.env.PROMO_FONT || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
await mkdir(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.gz': 'application/gzip', '.txt': 'text/plain' };
const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    if (path === '/__promo-font') { res.writeHead(200, { 'content-type': 'font/ttf' }).end(await readFile(font)); return; }
    if (!path.startsWith('/day-064-breach-atlas/')) { res.writeHead(404).end(); return; }
    path = path.slice('/day-064-breach-atlas/'.length);
    const full = resolve(app, path || 'index.html');
    if (!full.startsWith(app + '/')) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'content-type': mime[extname(full)] || 'application/octet-stream' }).end(await readFile(full));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
let context;
const evidence = [], errors = [];
try {
  const view = { width: 540, height: 960 };
  context = await browser.newContext({ viewport: view, locale: 'ja-JP', recordVideo: { dir: join(output, 'raw'), size: view } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await page.goto(`${base}/day-064-breach-atlas/`, { waitUntil: 'networkidle' });
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#total-incidents')).toHaveText('18,001');
  await expect(page.locator('#globe-stage')).toHaveAttribute('data-rendered', 'true');
  await page.addStyleTag({ content: `
    @font-face{font-family:Promo;src:url('/__promo-font');font-weight:700}
    html{scroll-behavior:auto!important}::-webkit-scrollbar{display:none}
    .promo{position:fixed;inset:0;z-index:2147483645;pointer-events:none;color:#f4fbfa;font-family:Promo,sans-serif}
    .promo-top{position:absolute;inset:0 0 auto;height:114px;padding:29px 30px;background:#081c26;display:flex;align-items:center;justify-content:space-between}
    .promo-logo{font-size:27px;letter-spacing:.08em}.promo-number{font-size:12px;letter-spacing:.18em;border:1px solid #466069;border-radius:30px;padding:10px 15px;color:#c5e8e4}
    .promo-bottom{position:absolute;inset:auto 0 0;padding:47px 24px 39px;height:240px;text-align:center;background:linear-gradient(#081c2600,#081c26 24%)}
    .promo-kicker{margin:14px 0 12px;color:#83dcd0;font-size:11px;letter-spacing:.13em}
    .promo-caption{font-size:32px;line-height:1.45;font-weight:700;margin:0;letter-spacing:.025em}.promo-caption span{display:block}.promo-caption span:last-child{color:#93e5d8}
    .promo-definition{position:absolute;bottom:18px;left:14px;right:14px;font-size:10px;color:#bdcfD5;text-align:center}
    .promo-progress{position:absolute;bottom:0;left:0;height:3px;background:#5cd1bd;width:0}
    .promo-tap{position:absolute;width:48px;height:48px;border:3px solid #22baaa;border-radius:50%;margin:-24px;box-shadow:0 0 0 10px #22baaa33;display:none}
    .promo-end{position:absolute;inset:0;background:radial-gradient(ellipse at 70% 25%,#1b555d,#081c26 65%);display:none;align-items:center;justify-content:center;text-align:left;padding:48px}
    .promo-end-content{width:100%}.promo-end small{color:#93e5d8;letter-spacing:.17em;font-size:13px}.promo-end h2{font-size:50px;line-height:1.4;margin:25px 0 29px;letter-spacing:.025em}
    .promo-end p{font-size:18px;line-height:1.9;color:#d9e8eb}.promo-end .promo-cta{font-size:18px;padding:18px 22px;background:#80dac9;color:#0a2931;border-radius:12px;display:inline-block;margin:15px 0 23px}
    .promo-end .promo-url{font-size:14px;font-family:Promo,sans-serif;overflow-wrap:anywhere;color:#b7d7d7}
    .promo-marker{position:absolute;top:0;left:0;width:8px;height:8px;background:#ff00ff}
  ` });
  await page.evaluate(({ disclosure }) => {
    const layer = document.createElement('div'); layer.className = 'promo';
    layer.innerHTML = `<div class="promo-top"><b class="promo-logo">漏洩の地図</b><span class="promo-number">DAY 064</span></div><div class="promo-bottom"><p class="promo-kicker"></p><p class="promo-caption"></p></div><div class="promo-definition"></div><div class="promo-progress"></div><div class="promo-tap"></div><div class="promo-end"><div class="promo-end-content"><small>PUBLIC RECORDS → LEARNING</small><h2>知ることから、<br>備えることへ。</h2><p>公表記録を地図で探す。<br>原資料を確かめ、備えを見直す。</p><span class="promo-cta">漏洩の地図を開く →</span><p class="promo-url">hundred-days.pages.dev/<br>day-064-breach-atlas/</p></div></div><div class="promo-marker"></div>`;
    document.body.append(layer); layer.querySelector('.promo-definition').textContent = disclosure;
  }, { disclosure: DISCLOSURE });
  await page.evaluate(() => document.fonts.ready);
  async function pan(selector, top = 142) {
    await page.locator(selector).evaluate((element, position) => window.scrollTo(0, element.getBoundingClientRect().top + scrollY - position), top);
  }
  async function tap(selector) {
    const target = page.locator(selector).first();
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    await page.evaluate(({ x, y }) => { const dot = document.querySelector('.promo-tap'); dot.style.cssText += `;display:block;left:${x}px;top:${y}px`; }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await page.waitForTimeout(250); await target.click();
    await page.waitForTimeout(450); await page.evaluate(() => document.querySelector('.promo-tap').style.display = 'none');
  }
  async function caption(index) {
    await page.evaluate(scene => {
      document.querySelector('.promo-kicker').textContent = scene.kicker;
      document.querySelector('.promo-caption').replaceChildren(...scene.lines.map(text => { const span = document.createElement('span'); span.textContent = text; return span; }));
    }, STORYBOARD[index]);
  }
  async function still(name) {
    const snapshot = await page.evaluate(() => ({ view: document.documentElement.dataset.view, engine: document.documentElement.dataset.engine, query: document.querySelector('#quick-search').value, count: document.querySelector('#visible-count').textContent, company: document.querySelector('.note-company')?.textContent || null, source: document.querySelector('.source-shortcut')?.getAttribute('href') || null, horizontalOverflow: document.documentElement.scrollWidth > innerWidth }));
    if (snapshot.horizontalOverflow) throw new Error('Horizontal overflow in recorded product UI.');
    evidence.push({ scene: name, ...snapshot });
    await page.screenshot({ path: join(output, `${name}.png`) });
  }
  await pan('#globe-stage', 188); await caption(0); await page.waitForTimeout(700);
  await page.evaluate(() => {
    document.querySelector('.promo-marker').remove();
    const started = performance.now();
    function progress() { document.querySelector('.promo-progress').style.width = `${Math.min(100, (performance.now() - started) / 320)}%`; requestAnimationFrame(progress); } progress();
  });
  const start = Date.now();
  const at = async seconds => { const wait = seconds * 1000 - (Date.now() - start); if (wait > 0) await page.waitForTimeout(wait); };
  await still('scene-0');
  const stage = page.locator('#globe-mount canvas');
  if (await stage.count()) { await stage.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); }
  await at(4); await caption(1); await pan('#region-tabs', 149);
  await tap('[data-region="japan"]'); await expect(page.locator('#visible-count')).toContainText('4,652記録');
  await pan('#globe-stage', 188); await still('scene-1');
  await at(9); await caption(2); await pan('#search-entry-title', 146);
  await page.locator('#quick-search').pressSequentially('横浜市（神奈川県）', { delay: 110 });
  await expect(page.locator('#visible-count')).toContainText('2,039記録');
  await tap('#view-timeline'); await pan('#map-title', 140); await still('scene-2');
  await at(15); await caption(3);
  await tap('.incident-card[data-incident-id]');
  await expect(page.locator('.note-company')).toContainText('横浜市');
  await expect(page.locator('.source-shortcut')).toHaveAttribute('href', /city\.yokohama\.lg\.jp/);
  await pan('.note-company', 159); await still('scene-3');
  await at(21); await caption(4); await tap('#view-learn');
  await pan('#lesson-intrusion', 149);
  await expect(page.locator('#lesson-intrusion')).toContainText('多要素認証');
  await expect(page.locator('#lesson-intrusion a')).toHaveAttribute('href', /www\.ipa\.go\.jp/);
  await still('scene-4');
  await at(27); await page.evaluate(() => document.querySelector('.promo-end').style.display = 'flex');
  await at(27.2); await still('scene-5'); await at(DURATION + .25);
  const raw = await page.video().path();
  await context.close(); context = null;
  if (errors.length) throw new Error(`Product browser errors: ${errors.join('; ')}`);
  const pixels = execFileSync('ffmpeg', ['-v', 'error', '-i', raw, '-vf', 'fps=25,crop=2:2:0:0,scale=1:1,format=rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 4 * 1024 * 1024 });
  let marker = -1;
  for (let i = 0; i < pixels.length / 3; i++) if (pixels[i * 3] > 220 && pixels[i * 3 + 1] < 35 && pixels[i * 3 + 2] > 220) marker = i;
  if (marker < 0) throw new Error('Recording trim marker was not captured.');
  const trim = (marker + 1) / 25;
  const audio = join(output, 'original-bgm.wav');
  execFileSync(process.execPath, [join(here, 'promo-audio.mjs'), audio], { stdio: 'inherit' });
  const video = join(output, 'Day064_breach_atlas_promo.mp4');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-y', '-ss', String(trim), '-i', raw, '-i', audio, '-t', String(DURATION), '-map', '0:v:0', '-map', '1:a:0', '-vf', 'scale=1080:1920:flags=lanczos,fps=30,setsar=1', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-map_metadata', '-1', video], { stdio: 'inherit' });
  const demo = arg('--demo');
  if (demo) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-an', '-vf', 'scale=720:1280:flags=lanczos,fps=25', '-c:v', 'libx264', '-preset', 'medium', '-crf', '25', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-map_metadata', '-1', resolve(demo)], { stdio: 'inherit' });
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', video], { encoding: 'utf8' }));
  const v = probe.streams.find(stream => stream.codec_type === 'video'), a = probe.streams.find(stream => stream.codec_type === 'audio');
  if (v.width !== 1080 || v.height !== 1920 || v.pix_fmt !== 'yuv420p' || a?.codec_name !== 'aac' || Math.abs(Number(probe.format.duration) - DURATION) > .1) throw new Error('Output video specification mismatch.');
  const report = { asOf: '2026-10-12', seconds: DURATION, width: v.width, height: v.height, fps: v.avg_frame_rate, codec: v.codec_name, audioCodec: a.codec_name, fileBytes: Number(probe.format.size), trimOffset: trim, scenes: evidence, browserErrors: errors, video: 'Actual local release application; product values were not changed for filming.', overlays: 'Original captions, tap highlights, progress bar and end card.', music: 'Original synthesized oscillators; no third-party recordings or samples.', font: 'Zen Kaku Gothic New Bold (SIL OFL 1.1), rendered into the video; font file is not distributed.' };
  await writeFile(join(output, 'capture-checks.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Created ${DURATION}s vertical promo and verified H.264/AAC output.`);
} finally {
  if (context) await context.close();
  await browser.close(); await new Promise(done => server.close(done));
}
