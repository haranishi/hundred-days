// Remotion で映像を1回だけ描き（無音）、A案・B案の BGM をそれぞれ重ねて2本にする。--stills で確認用の静止画だけ描く。
// 描画は手元の Google Chrome（CHROME_PATH）だけを使う。外部のレンダリングは使わない。
import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CAPTURE_FRAMES, DURATION_SECONDS} from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'output');
const stills = process.argv.includes('--stills');
const silent = join(out, '_silent.mp4');
/** 同じ映像に A案・B案の音を重ねる。付帯情報（題名・作者など）は書かない */
function mux() {
  for (const [variant, name] of [['a', 'Day081_pagecrate_promo.mp4'], ['b', 'Day081_pagecrate_promo_b.mp4']]) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', silent, '-i', join(out, `score-${variant}.wav`), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-t', String(DURATION_SECONDS), '-map_metadata', '-1', '-map_chapters', '-1', '-movflags', '+faststart', join(out, name)]);
    console.log(`書き出し: output/${name}`);
  }
}
// --mux：描いた映像（_silent.mp4）はそのままに、音だけを重ね直す（BGM を作り直したとき）
if (process.argv.includes('--mux')) {
  if (!existsSync(silent)) throw Error('先に npm run render で映像を描いてください');
  mux();
  process.exit(0);
}
const chrome = process.env.CHROME_PATH || join('/', 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome');
if (!existsSync(chrome)) throw Error('CHROME_PATH にインストール済みの Google Chrome を指定してください');
const last = String(CAPTURE_FRAMES - 1).padStart(4, '0');
const needs = ['public/footage/0000.jpg', `public/footage/${last}.jpg`, 'capture-events.json', ...(stills ? [] : ['score-a.wav', 'score-b.wav'])];
for (const file of needs) if (!existsSync(join(out, file))) throw Error(`先に npm run capture と npm run audio を実行してください: ${file}`);

// 書体（Zen Kaku Gothic New・SIL OFL 1.1）。リポジトリには入れず、手元の書体を描画用のフォルダへ写す
const fontBold = process.env.PROMO_FONT || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
copyFileSync(fontBold, join(out, 'public', 'zen-bold.ttf'));
copyFileSync(join(dirname(fontBold), 'ZenKakuGothicNew-Medium.ttf'), join(out, 'public', 'zen-medium.ttf'));

const captured = JSON.parse(readFileSync(join(out, 'capture-events.json'), 'utf8'));
const inputProps = {taps: captured.events.filter((event) => Number.isFinite(event.x)).map(({frame, type, x, y, track}) => ({frame, type, x, y, track}))};
const serveUrl = await bundle({entryPoint: join(here, 'index.jsx'), outDir: join(out, 'bundle'), publicDir: join(out, 'public'), enableCaching: true});
const browser = await openBrowser('chrome', {browserExecutable: chrome, logLevel: 'error'});
try {
  const options = {serveUrl, id: 'Day81-Promo', inputProps, browserExecutable: chrome, puppeteerInstance: browser, logLevel: 'error'};
  const composition = await selectComposition(options);
  if (stills) {
    mkdirSync(join(out, 'stills'), {recursive: true});
    const frames = [0, 8, 60, 107, 125, 215, 330, 440, 503, 600, 760, 863, 880, 940, 1079];
    for (const frame of frames) {
      await renderStill({...options, composition, frame, imageFormat: 'png', output: join(out, 'stills', `${String(frame).padStart(4, '0')}.png`)});
      console.log('静止画', frame);
    }
    writeFileSync(join(out, 'stills', 'frames.json'), `${JSON.stringify(frames)}\n`);
  } else {
    let step = -1;
    await renderMedia({...options, composition, codec: 'h264', outputLocation: silent, crf: 18, pixelFormat: 'yuv420p', colorSpace: 'bt709', x264Preset: 'medium', concurrency: 4, muted: true,
      onProgress: ({progress}) => { const n = Math.floor(progress * 10); if (n !== step) { step = n; console.log(`描画 ${n * 10}%`); } }});
    mux();
  }
} finally {
  await browser.close({silent: true});
}
