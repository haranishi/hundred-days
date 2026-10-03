import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUTS, DEMO_CUTS, DURATION_SECONDS, FPS, TITLE } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cache = join(here, 'cache');
const font = process.env.PROMO_FONT || '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc';
const audio = resolve(process.env.AUDIO_ROOT || join(here, '../../game/assets/audio'));
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'warning', ...args], { stdio: 'inherit' });
const encode = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-r', String(FPS), '-movflags', '+faststart'];
const textEscape = s => s.replaceAll('\\', '\\\\').replaceAll(':', '\\:').replaceAll("'", "\\'");
const text = (s, y, size, color = 'white') => `drawtext=fontfile='${font}':text='${textEscape(s)}':fontsize=${size}:fontcolor=${color}:x=(w-text_w)/2:y=${y}`;

await mkdir(cache, { recursive: true });
for (const creature of ['kurenai', 'raiyoku', 'homuratsuno']) {
  const raw = join(cache, `${creature}.mp4`);
  if (!existsSync(raw) || process.env.REBUILD_RAW === '1') ffmpeg('-y', '-framerate', String(FPS), '-i', join(cache, creature, '%05d.jpg'), '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-an', ...encode, raw);
}

// Edit music only: three procedurally synthesized stems from the actual game.
// This is not represented as live, synchronized gameplay audio.
const inputs = [];
const chunks = [];
let index = 0;
for (const stem of ['calm', 'rampage', 'peak']) {
  const labels = [];
  for (let k = 1; k <= 4; k++) {
    inputs.push('-i', join(audio, `music/${stem}_${String(k).padStart(2, '0')}.ogg`));
    const label = `${stem}${k}`;
    chunks.push(`[${index++}:a]atrim=start=0.1:duration=10,asetpts=PTS-STARTPTS[${label}]`);
    labels.push(`[${label}]`);
  }
  chunks.push(`${labels.join('')}concat=n=4:v=0:a=1[${stem}]`);
}
chunks.push('[calm]volume=0.75[bed]');
chunks.push("[rampage]volume='if(lt(t,8),0.35,0.72)':eval=frame[drive]");
chunks.push("[peak]volume='if(lt(t,15),0,0.55)':eval=frame[top]");
chunks.push(`[bed][drive][top]amix=inputs=3:normalize=0:duration=shortest,atrim=duration=${DURATION_SECONDS},afade=t=out:st=30.8:d=1.2,loudnorm=I=-14:TP=-1.5:LRA=11[a]`);
ffmpeg('-y', ...inputs, '-filter_complex', chunks.join(';'), '-map', '[a]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', join(here, 'promo-audio.wav'));
const measureLoudness = file => {
  const measured = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-vn', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
  if (measured.status !== 0) throw new Error(measured.stderr);
  return JSON.parse(measured.stderr.match(/\{[^{}]+\}/s)[0]);
};
const wavLoudness = measureLoudness(join(here, 'promo-audio.wav'));
const audioGainDb = (-14 - Number(wavLoudness.input_i)).toFixed(3);

for (let i = 0; i < CUTS.length; i++) {
  const cut = CUTS[i];
  const overlays = [
    'drawbox=x=0:y=0:w=1080:h=430:color=0x101724@0.94:t=fill',
    'drawbox=x=0:y=1510:w=1080:h=410:color=0x101724@0.94:t=fill',
    'drawbox=x=70:y=216:w=940:h=2:color=0xFFBD79@0.5:t=fill',
    text('DAY 56  /  100日チャレンジ', 242, 32, '0xFFCC98'),
    text(TITLE, 316, 72),
    text('実ゲーム録画・自動操作', 1460, 27, '0xF0EEEB'),
    ...cut.lines.map((line, n) => text(line, n ? 1640 : 1560, n ? 43 : 54)),
  ];
  const filter = `[0:v]split[back][front];[back]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=28:2,eq=brightness=-0.18:saturation=0.7[bg];[front]scale=1440:1080,crop=1080:1080[game];[bg][game]overlay=0:430,${overlays.join(',')},setsar=1[v]`;
  ffmpeg('-y', '-ss', String(cut.from), '-i', join(cache, `${cut.creature}.mp4`), '-t', String(cut.duration), '-filter_complex', filter, '-map', '[v]', '-an', ...encode, join(cache, `cut-${i}.mp4`));
}
await writeFile(join(cache, 'promo-cuts.txt'), CUTS.map((_, i) => `file '${join(cache, `cut-${i}.mp4`)}'`).join('\n') + '\n');
ffmpeg('-y', '-f', 'concat', '-safe', '0', '-i', join(cache, 'promo-cuts.txt'), '-i', join(here, 'promo-audio.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-af', `volume=${audioGainDb}dB`, '-t', String(DURATION_SECONDS), '-movflags', '+faststart', join(here, 'promo.mp4'));

for (let i = 0; i < DEMO_CUTS.length; i++) {
  const cut = DEMO_CUTS[i];
  ffmpeg('-y', '-ss', String(cut.from), '-i', join(cache, `${cut.creature}.mp4`), '-t', String(cut.duration), '-vf', 'crop=1280:720:0:120,setsar=1', '-an', ...encode, join(cache, `demo-${i}.mp4`));
}
await writeFile(join(cache, 'demo-cuts.txt'), DEMO_CUTS.map((_, i) => `file '${join(cache, `demo-${i}.mp4`)}'`).join('\n') + '\n');
ffmpeg('-y', '-f', 'concat', '-safe', '0', '-i', join(cache, 'demo-cuts.txt'), '-i', join(here, 'promo-audio.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', '18', '-af', `volume=${audioGainDb}dB,afade=t=out:st=17:d=1`, '-movflags', '+faststart', join(here, 'demo.mp4'));

for (const [video, still] of [['promo.mp4', 'promo-first-frame.png'], ['demo.mp4', 'demo-first-frame.png']]) {
  ffmpeg('-y', '-i', join(here, video), '-frames:v', '1', '-update', '1', join(here, still));
}
for (let i = 0; i < 16; i++) {
  ffmpeg('-y', '-ss', String(i * 2), '-i', join(here, 'promo.mp4'), '-vf', `${text(`${i * 2}s`, 14, 42)},scale=216:384`, '-frames:v', '1', '-update', '1', join(cache, `contact-${String(i).padStart(2, '0')}.jpg`));
}
ffmpeg('-y', '-framerate', '1', '-i', join(cache, 'contact-%02d.jpg'), '-vf', 'tile=4x4', '-frames:v', '1', '-update', '1', join(here, 'preview-contact.jpg'));
const probe = execFileSync('ffprobe', ['-v', 'quiet', '-show_format', '-show_streams', '-of', 'json', join(here, 'promo.mp4')], { encoding: 'utf8' });
await writeFile(join(here, 'promo-probe.json'), probe);
const loudness = measureLoudness(join(here, 'promo.mp4'));
await writeFile(join(here, 'promo-loudness.json'), JSON.stringify(loudness, null, 2));
console.log(loudness);
console.log('Rendered promo.mp4, demo.mp4, first frames and contact sheet.');
