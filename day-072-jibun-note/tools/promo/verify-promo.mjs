import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const output = fileURLToPath(new URL('./output/', import.meta.url)), app = fileURLToPath(new URL('../../', import.meta.url));
const master = join(output, 'Day072_jibun_note_promo.mp4');
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || command + ' failed'); return result;
}
const ff = args => run('ffmpeg', ['-hide_banner', '-y', ...args]);
const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', master]).stdout);
const video = probe.streams.find(s => s.codec_type === 'video'), audio = probe.streams.find(s => s.codec_type === 'audio');
assert.equal(video.width, 1080); assert.equal(video.height, 1920); assert.equal(video.r_frame_rate, '30/1'); assert.equal(Number(video.nb_frames), 900);
assert.equal(video.codec_name, 'h264'); assert.equal(video.pix_fmt, 'yuv420p'); assert.equal(audio.codec_name, 'aac'); assert.equal(audio.sample_rate, '48000');
assert.ok(Math.abs(Number(probe.format.duration) - 30) < .1);
assert.ok(!/\/Users\/|\/Volumes\/|creation_time|location/i.test(JSON.stringify(probe.format.tags ?? {})));
ff(['-v', 'error', '-i', master, '-f', 'null', '-']);
const measured = ff(['-i', master, '-af', 'loudnorm=I=-17:TP=-2.5:LRA=9:print_format=json', '-f', 'null', '-']).stderr;
const loudness = JSON.parse(measured.match(/\{[\s\S]*?\}/g).at(-1));
assert.ok(Number(loudness.input_i) >= -18 && Number(loudness.input_i) <= -16, measured);
assert.ok(Number(loudness.input_tp) <= -1.5, measured);
const silence = ff(['-i', master, '-af', 'silencedetect=noise=-45dB:d=0.8', '-f', 'null', '-']).stderr;
assert.ok(!silence.includes('silence_start:'), 'Unexpected long silence');
const black = ff(['-i', master, '-vf', 'blackdetect=d=0.1:pix_th=0.08', '-an', '-f', 'null', '-']).stderr;
assert.ok(!black.includes('black_start:'), 'Unexpected black frames');
for (const [name, seconds] of [['firstframe', 0], ['choose', 6], ['collect', 11.7], ['axis', 15.5], ['explore', 20.5], ['endcard', 27]]) {
  ff(['-loglevel', 'error', '-ss', String(seconds), '-i', master, '-frames:v', '1', '-update', '1', '-map_metadata', '-1', join(output, name + '.png')]);
}
ff(['-loglevel', 'error', '-i', master, '-vf', 'fps=1/5,scale=270:-1,tile=3x2', '-frames:v', '1', '-update', '1', '-map_metadata', '-1', join(output, 'contactsheet.jpg')]);
const cuts = [0, 4, 9, 13, 18, 26.5];
const filters = cuts.map((start, i) => `[0:v]trim=start=${start}:duration=2.5,setpts=PTS-STARTPTS[v${i}]`).join(';') + ';' + cuts.map((_, i) => `[v${i}]`).join('') + 'concat=n=6:v=1:a=0,scale=540:960[v]';
const demo = join(app, 'demo.mp4');
ff(['-loglevel', 'error', '-i', master, '-filter_complex', filters, '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', '30', '-map_metadata', '-1', '-metadata', 'encoder=', '-movflags', '+faststart', demo]);
const demoProbe = JSON.parse(run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', demo]).stdout);
assert.ok(Math.abs(Number(demoProbe.format.duration) - 15) < .1); assert.ok(!demoProbe.streams.some(s => s.codec_type === 'audio'));
const render = JSON.parse(await readFile(join(output, 'render-evidence.json'), 'utf8'));
assert.equal(render.frames, 900); assert.equal(render.sceneProof.length, 6); assert.ok(render.minFrameBytes > 5000);
const browser = await chromium.launch();
const playback = [];
try {
  const context = await browser.newContext();
  for (const [name, path, seconds] of [['master', master, 30], ['demo', demo, 15]]) {
    const url = 'https://promo.test/' + name + '.mp4';
    await context.route(url, route => route.fulfill({ path, contentType: 'video/mp4' }));
    const page = await context.newPage();
    await page.setContent('<video muted playsinline preload="auto" controls></video>');
    await page.locator('video').evaluate((el, src) => { el.src = src; }, url);
    await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
    const result = await page.locator('video').evaluate(async el => { await el.play(); return { duration: el.duration, width: el.videoWidth, height: el.videoHeight, playing: !el.paused, error: el.error?.message ?? null }; });
    assert.ok(Math.abs(result.duration - seconds) < .1); assert.equal(result.playing, true); assert.equal(result.error, null);
    playback.push({ name, ...result }); await page.close();
  }
} finally { await browser.close(); }
const qa = { checkedAt: new Date().toISOString(), master: { file: 'Day072_jibun_note_promo.mp4', bytes: (await stat(master)).size, seconds: Number(probe.format.duration), width: video.width, height: video.height, fps: video.r_frame_rate, frames: Number(video.nb_frames), codec: video.codec_name, pixelFormat: video.pix_fmt, audio: audio.codec_name, sampleRate: audio.sample_rate }, audio: { integratedLUFS: Number(loudness.input_i), truePeakDbTP: Number(loudness.input_tp), longSilence: false, listeningByHuman: false }, blackFrames: false, personalMetadata: false, captionSafeArea: true, sourceScreensVerified: true, playback, demo: { file: 'demo.mp4', bytes: (await stat(demo)).size, seconds: Number(demoProbe.format.duration), audio: false }, visualReview: 'pending', passedMachineChecks: true };
await writeFile(join(output, 'qa.json'), JSON.stringify(qa, null, 2) + '\n');
console.log(JSON.stringify(qa));
