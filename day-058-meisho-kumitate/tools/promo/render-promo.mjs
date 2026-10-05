// 宣伝動画（縦1080×1920・約25秒）を書き出す。先に record-game.mjs で cache/ に録画と出来事の時刻を作っておく。
//   node day-058-meisho-kumitate/tools/promo/render-promo.mjs
// 出力：tools/promo/out/promo.mp4・promo-first-frame.png・promo-contact.jpg・promo-loudness.json（out/ は Git に入れない）
//
// - 字幕と締めのカードは HTML で描いて画像にし、ffmpeg で重ねる。書体は Zen Kaku Gothic New（SIL OFL 1.1）。
//   置き場所は環境変数 PROMO_FONT で変えられる（既定は ~/Library/Fonts/ZenKakuGothicNew-Black.ttf）
// - 音声は promo-audio.mjs が合成する（ゲームと同じBGM・効果音）。ffmpeg の loudnorm を2回通して -17 LUFS にそろえる
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { renderAudio } from './promo-audio.mjs';
import { buildTimeline } from './timeline.mjs';

const here = fileURLToPath(new URL('./', import.meta.url));
const cache = join(here, 'cache');
const out = join(here, 'out');
const font = process.env.PROMO_FONT || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Black.ttf');
if (!existsSync(font)) throw new Error(`字幕の書体が見つからない: ${font}`);
mkdirSync(out, { recursive: true });

const events = JSON.parse(readFileSync(join(cache, 'events.json'), 'utf8'));
const timeline = buildTimeline(events);
const W = 1080;
const H = 1920;

const ffmpeg = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();

// 締めのカードに置く模型：押す直前の金閣寺（色と景色が出たところ）
ffmpeg(['-ss', String(events.solo.buzz1 / 1000 - 0.15), '-i', join(cache, 'solo.webm'), '-frames:v', '1', '-vf', 'crop=1080:860:0:560', join(cache, 'endcard-model.png')]);

const css = `
@font-face { font-family: Caption; src: url('${pathToFileURL(font).href}'); }
* { margin: 0; box-sizing: border-box; }
html, body { width: ${W}px; height: ${H}px; background: transparent; font-family: Caption, sans-serif; color: #1f2a44; }
.cap { position: absolute; left: 50%; top: 470px; transform: translateX(-50%); white-space: nowrap;
  padding: 22px 44px 26px; border-radius: 34px; background: rgba(255, 253, 248, 0.96);
  border-bottom: 10px solid #e2483d; box-shadow: 0 14px 36px rgba(31, 42, 68, 0.28);
  font-size: 70px; line-height: 1.15; letter-spacing: 0.02em; }
.card { width: ${W}px; height: ${H}px; background: radial-gradient(130% 70% at 50% 0%, #a9cbe8 0%, #f6f1e7 62%);
  display: flex; flex-direction: column; align-items: center; padding-top: 150px; gap: 34px; text-align: center; }
.pill { font-size: 40px; letter-spacing: 0.08em; background: #fffdf8; border-radius: 999px; padding: 14px 34px; }
.small { font-size: 66px; color: #e2483d; letter-spacing: 0.3em; margin-bottom: -28px; }
.big { font-size: 132px; line-height: 1.1; text-shadow: 0 5px 0 #fff, 0 0 30px rgba(255, 253, 248, 0.9); }
.model { width: 960px; height: 764px; object-fit: cover; border-radius: 48px; box-shadow: 0 18px 46px rgba(31, 42, 68, 0.3); }
.lead { font-size: 50px; }
.free { font-size: 44px; color: #4a5268; }
.url { font-size: 48px; background: #1f2a44; color: #fffdf8; border-radius: 22px; padding: 14px 36px; letter-spacing: 0.02em; }`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
const shot = async (html, path, transparent) => {
  writeFileSync(join(cache, 'frame.html'), `<!doctype html><meta charset="utf-8"><style>${css}</style>${html}`);
  await page.goto(pathToFileURL(join(cache, 'frame.html')).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path, omitBackground: transparent });
};
const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
for (const [i, caption] of timeline.captions.entries()) {
  const style = caption.top ? ` style="top:${caption.top}px"` : '';
  await shot(`<div class="cap"${style}>${escape(caption.text)}</div>`, join(cache, `caption-${i}.png`), true);
}
await shot(`<div class="card">
  <div class="pill">Day 58 / 100</div>
  <div class="small">名所</div><div class="big">くみたて早押し</div>
  <img class="model" src="${pathToFileURL(join(cache, 'endcard-model.png')).href}" alt="">
  <div class="lead">組み上がる模型で、どこの名所か当てる</div>
  <div class="free">無料・登録なし｜ひとりでも、ふたりでも</div>
  <div class="url">hundred-days.pages.dev</div>
</div>`, join(cache, 'endcard.png'), false);
await browser.close();

renderAudio(timeline, join(cache, 'promo-audio.wav'));

// 映像：場面を切り出してつなぎ、締めのカードを足し、字幕を重ねる
const inputs = ['-i', join(cache, 'solo.webm'), '-i', join(cache, 'duo.webm'), '-loop', '1', '-t', String(timeline.endCard.length), '-i', join(cache, 'endcard.png')];
timeline.captions.forEach((_, i) => inputs.push('-loop', '1', '-i', join(cache, `caption-${i}.png`)));
inputs.push('-i', join(cache, 'promo-audio.wav'));
const audioIndex = 3 + timeline.captions.length;
const parts = timeline.segments.map((seg, i) =>
  `[${seg.src === 'solo' ? 0 : 1}:v]trim=start=${seg.from.toFixed(3)}:end=${seg.to.toFixed(3)},setpts=PTS-STARTPTS,fps=30,scale=${W}:${H},setsar=1[s${i}]`);
parts.push(`[2:v]fps=30,scale=${W}:${H},setsar=1,format=yuv420p,fade=t=in:st=0:d=0.25[s${timeline.segments.length}]`);
const count = timeline.segments.length + 1;
parts.push(`${Array.from({ length: count }, (_, i) => `[s${i}]`).join('')}concat=n=${count}:v=1:a=0,format=yuv420p[base]`);
let last = 'base';
timeline.captions.forEach((caption, i) => {
  const next = `c${i}`;
  parts.push(`[${last}][${3 + i}:v]overlay=0:0:enable='between(t,${caption.from.toFixed(3)},${(caption.to - 0.001).toFixed(3)})'[${next}]`);
  last = next;
});
const filter = parts.join(';');

// 音声の大きさを2回で合わせる：1回目で測り、2回目で -17 LUFS・真のピーク -1.5 dBTP にする
const measured = (() => {
  // loudnorm は結果を標準エラーに出すので、2>&1 で受け取る
  const text = execFileSync('sh', ['-c', `ffmpeg -hide_banner -i '${join(cache, 'promo-audio.wav')}' -af loudnorm=I=-17:TP=-1.5:LRA=11:print_format=json -f null - 2>&1`]).toString();
  return JSON.parse(text.slice(text.lastIndexOf('{'), text.lastIndexOf('}') + 1));
})();
const loudnorm = `loudnorm=I=-17:TP=-1.5:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=json`;

const promo = join(out, 'promo.mp4');
const log = execFileSync('sh', ['-c', [
  'ffmpeg -hide_banner -y',
  ...inputs.map((x) => `'${x}'`),
  `-filter_complex "${filter};[${audioIndex}:a]${loudnorm},aresample=48000[aout]"`,
  `-map "[${last}]" -map "[aout]" -t ${timeline.total.toFixed(3)}`,
  '-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -movflags +faststart',
  `'${promo}' 2>&1`,
].join(' ')], { maxBuffer: 64 * 1024 * 1024 }).toString();
const result = JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
writeFileSync(join(out, 'promo-loudness.json'), `${JSON.stringify({ target: -17, measuredBefore: measured, after: result }, null, 2)}\n`);

ffmpeg(['-i', promo, '-frames:v', '1', join(out, 'promo-first-frame.png')]);
ffmpeg(['-i', promo, '-vf', 'fps=1,scale=180:320,tile=7x4', '-frames:v', '1', join(out, 'promo-contact.jpg')]);
console.log(JSON.stringify({ promo, seconds: timeline.total, loudness: result.output_i, truePeak: result.output_tp }));
