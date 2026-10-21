import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { captureApp } from './capture-app.mjs';
import { FPS, DURATION, SCENES, installStage } from './stage.mjs';
import { writeAudio } from './promo-audio.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url)), output = fileURLToPath(new URL('./output/', import.meta.url));
await mkdir(output, { recursive: true });
const work = await mkdtemp(join(output, '.render-'));
function run(args) {
  const result = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || 'ffmpeg failed');
  return result.stderr;
}
let server, browser, encoder;
try {
  let base = process.env.PROMO_BASE;
  if (!base) {
    server = spawn(process.execPath, ['scripts/serve-dist.mjs'], { cwd: root, env: { ...process.env, PLAYWRIGHT_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    base = await new Promise((resolve, reject) => {
      let out = '', err = '';
      const timer = setTimeout(() => reject(new Error('Preview failed to start: ' + err)), 10000);
      server.stdout.on('data', chunk => { out += chunk; const match = out.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0] + '/day-072-jibun-note/'); } });
      server.stderr.on('data', chunk => { err += chunk; });
      server.once('exit', code => { clearTimeout(timer); reject(new Error('Preview stopped: ' + code)); });
    });
  }
  browser = await chromium.launch({ headless: true });
  const { assets, proof } = await captureApp(browser, base, output);
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, locale: 'ja-JP' });
  await installStage(page, assets);
  const silent = join(work, 'picture.mp4');
  encoder = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-vcodec', 'mjpeg', '-i', 'pipe:0', '-an', '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-r', String(FPS), '-fps_mode', 'cfr', '-map_metadata', '-1', silent], { stdio: ['pipe', 'ignore', 'pipe'] });
  let error = '';
  encoder.stderr.on('data', data => { error += data; });
  const done = new Promise((resolve, reject) => { encoder.once('error', reject); encoder.once('exit', code => code === 0 ? resolve() : reject(new Error('Encoding failed: ' + error))); });
  done.catch(() => {});
  const frames = [], sceneProof = [];
  for (let frame = 0; frame < FPS * DURATION; frame++) {
    const result = await page.evaluate(t => window.drawPromo(t), frame / FPS);
    const jpeg = Buffer.from(result.jpeg, 'base64');
    if (frame === 0 || result.scene !== frames.at(-1)?.scene) sceneProof.push({ frame, time: frame / FPS, scene: result.scene, textBounds: result.textBounds, picture: result.picture });
    frames.push({ scene: result.scene, bytes: jpeg.length });
    if (!encoder.stdin.write(jpeg)) await once(encoder.stdin, 'drain');
    if (frame % 150 === 0) console.log(JSON.stringify({ frame, total: FPS * DURATION, scene: result.scene }));
  }
  encoder.stdin.end(); await done;
  const wav = join(work, 'original-score.wav'), audio = await writeAudio(wav);
  const first = run(['-hide_banner', '-i', wav, '-af', 'loudnorm=I=-17:TP=-2.5:LRA=9:print_format=json', '-f', 'null', '-']);
  const measured = JSON.parse(first.match(/\{[\s\S]*?\}/g).at(-1));
  const filter = `loudnorm=I=-17:TP=-2.5:LRA=9:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
  const master = join(output, 'Day072_jibun_note_promo.mp4');
  run(['-hide_banner', '-loglevel', 'error', '-y', '-i', silent, '-i', wav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-af', filter, '-t', String(DURATION), '-map_metadata', '-1', '-metadata', 'encoder=', '-movflags', '+faststart', master]);
  const stamp = seconds => String(Math.floor(seconds / 3600)).padStart(2, '0') + ':' + String(Math.floor(seconds / 60) % 60).padStart(2, '0') + ':' + String(Math.floor(seconds) % 60).padStart(2, '0') + ',000';
  const captions = SCENES.map((scene, i) => `${i + 1}\n${stamp(scene.start)} --> ${stamp(scene.end)}\n${scene.title.join('')}\n${scene.detail}\n`).join('\n');
  await writeFile(join(output, 'captions.srt'), captions);
  await writeFile(join(output, 'render-evidence.json'), JSON.stringify({ format: { width: 1080, height: 1920, fps: FPS, seconds: DURATION }, frames: frames.length, minFrameBytes: Math.min(...frames.map(f => f.bytes)), sceneProof, audio, sourceHashes: proof.sourceHashes, fictionalExample: true, editedScreenshots: true }, null, 2) + '\n');
  console.log('Rendered Day072_jibun_note_promo.mp4');
} finally {
  encoder?.stdin?.destroy(); if (encoder?.exitCode === null) encoder.kill('SIGTERM');
  await browser?.close();
  if (server?.exitCode === null) { const stopped = once(server, 'exit'); server.kill('SIGTERM'); await stopped; }
  await rm(work, { recursive: true, force: true });
}
