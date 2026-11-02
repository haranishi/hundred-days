// 描画：撮影のコマ（output/takes）を絵コンテ（edit.mjs）どおりにつなぎ、字幕（output/subs）を重ね、曲（output/bgm-*.wav）を付けて書き出す。
//   node render.mjs                    → ../../demo.mp4（本編。曲は既定で B 案。PROMO_MAIN_BGM=a で A 案）・output/promo.mp4（同じもの）・output/promo-a.mp4（A案）・output/promo-b.mp4（B案）・
//                                         output/promo-clean.mp4（字幕なし・音なし。検査が字幕の入れ替わりを測る基準）・output/first-frame.png・output/timeline.json
//   node render.mjs --break sub-shift  → output/broken-sub-shift.mp4（字幕を 1 秒遅らせる。検査が落ちることを確かめる用）
//   node render.mjs --break loud       → output/broken-loud.mp4（音を 6dB 上げる。同上）
// 色：撮影の JPEG（BT.601・フルレンジ）を RGB で重ね、最後に BT.709・リミテッドの yuv420p にする。
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CLIPS, DURATION, ENDCARD, FADE, FIRST_NO_FADE_IN, FPS, HEIGHT, SUBTITLES, WIDTH, BEAT } from './edit.mjs';
import { DAY, OUT } from './lib/harness.mjs';

/** 本編（demo.mp4）の曲。2026-11-02 に本人が B 案を選んだ。PROMO_MAIN_BGM=a で A 案にできる。 */
const MAIN_BGM = (process.env.PROMO_MAIN_BGM ?? 'b').toLowerCase();
if (!['a', 'b'].includes(MAIN_BGM)) throw new Error(`PROMO_MAIN_BGM は a か b（いま "${process.env.PROMO_MAIN_BGM}"）`);

const args = process.argv.slice(2);
const breakMode = args.includes('--break') ? args[args.indexOf('--break') + 1] : null;

/** 撮影の印から、使うコマのファイルを決める。古い撮影の残りを使わないよう、今の撮影の「録る区間」に入っているかを確かめる。 */
function resolveFrames() {
  const frames = [];
  const clips = [];
  let t = 0;
  for (const c of CLIPS) {
    const dir = path.join(OUT, 'takes', c.take);
    const take = JSON.parse(readFileSync(path.join(dir, 'take.json'), 'utf8'));
    if (take.every !== 1) throw new Error(`${c.take}: 下見（--every ${take.every}）の撮影。全部のコマで撮り直す`);
    if (take.error) throw new Error(`${c.take}: 撮影が失敗している（${take.error.split('\n')[0]}）`);
    const m = take.marks.find((x) => x.label === c.mark);
    if (!m) throw new Error(`${c.take}: 印 ${c.mark} が無い`);
    const from = m.f + c.off;
    const windows = [];
    let on = null;
    for (const x of take.marks) {
      if (x.label === 'rec-on') on = x.f + 1;
      if (x.label === 'rec-off' && on !== null) {
        windows.push([on, x.f]);
        on = null;
      }
    }
    for (let k = 0; k < c.frames; k++) {
      const f = from + k;
      if (!windows.some(([a, b]) => f >= a && f <= b)) throw new Error(`${c.take}: コマ ${f} は録った区間の外`);
      const file = path.join(dir, `f${String(f).padStart(5, '0')}.jpg`);
      if (!existsSync(file)) throw new Error(`${c.take}: ${file} が無い`);
      frames.push(file);
    }
    clips.push({ ...c, fromFrame: from, toFrame: from + c.frames - 1, start: t / FPS, end: (t + c.frames) / FPS, gpu: take.gpu, browser: take.browser });
    t += c.frames;
  }
  if (frames.length !== Math.round(DURATION * FPS)) throw new Error(`コマ数が ${frames.length}（${DURATION * FPS} のはず）`);
  return { frames, clips };
}

/** 撮影の状態の記録から、映像の何秒に何が起きたかを測る（拍と合っているかを README・報告に書くため）。 */
function measureEvents(clips) {
  const ev = {};
  const states = (take) =>
    readFileSync(path.join(OUT, 'takes', take, 'states.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
  const at = (clip, f) => clip.start + (f - clip.fromFrame) / FPS;
  const inClip = (take, pred) => {
    const clip = clips.find((c) => c.take === take && states(take).some((s) => s.f >= c.fromFrame && s.f <= c.toFrame && pred(s)));
    if (!clip) return null;
    const s = states(take).find((x) => x.f >= clip.fromFrame && x.f <= clip.toFrame && pred(x));
    return Number(at(clip, s.f).toFixed(3));
  };
  ev.suspiciousMax = inClip('gate', (s) => Math.max(...s.g.filter((g) => g.id.startsWith('omote')).map((g) => g.s)) >= 0.3);
  ev.stoneThrown = inClip('gate', (s) => s.stonesUsed >= 1);
  ev.guardLured = inClip('gate', (s) => s.g.find((g) => g.id === 'omote-l')?.st === 'investigate');
  ev.takedownPress = inClip('atemi', (s) => s.p.act === 'takedown');
  ev.guardDown = inClip('atemi', (s) => s.g.find((g) => g.id === 'ura-patrol')?.down === true);
  ev.killPress = inClip('ura', (s) => s.screen === 'finale');
  ev.fireWide = inClip('ura', (s) => (s.finale ?? 0) >= 0.22);
  for (const k of Object.keys(ev)) if (ev[k] !== null) ev[`${k}Beat`] = Number((ev[k] / BEAT).toFixed(2));
  return ev;
}

function ff(argv, stdinFeeder) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: [stdinFeeder ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg が ${code} で終わった`))));
    if (stdinFeeder) stdinFeeder(p.stdin).catch(reject);
  });
}

/** コマの JPEG を順に ffmpeg の標準入力へ流す。 */
const feed = (frames) => async (stdin) => {
  for (const f of frames) {
    const buf = readFileSync(f);
    if (!stdin.write(buf)) await new Promise((r) => stdin.once('drain', r));
  }
  stdin.end();
};

const X264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-maxrate', '3800k', '-bufsize', '7600k', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-r', String(FPS), '-g', '60', '-movflags', '+faststart'];
/**
 * 色の調整（全編同じ値）：ゲームの夜はとても暗く、スマホの画面では人物と扇が沈むので、暗部だけを持ち上げる曲線をかける。
 * 黒（0）と白（1）は動かさない。字幕と終わりの画面は調整の後に重ねる。字幕なしの基準（promo-clean）にも同じ調整をかける。
 */
export const GRADE = "curves=all='0/0 0.04/0.075 0.12/0.19 0.3/0.38 0.6/0.66 1/1'";
const TO709 =`scale=${WIDTH}:${HEIGHT}:in_range=pc:out_range=tv:out_color_matrix=bt709:flags=bicubic+accurate_rnd+full_chroma_int,format=yuv420p`;

/** 字幕を重ねるフィルタ（shift 秒ずらせる）。 */
function subtitleFilter(shift = 0) {
  const inputs = [];
  const chain = [];
  let last = '[base]';
  const items = [...SUBTITLES.map((s, k) => ({ ...s, file: `${s.id}.png`, k })), { ...ENDCARD, file: `${ENDCARD.id}.png`, k: SUBTITLES.length, end: true }];
  items.forEach((s, k) => {
    inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(DURATION), '-i', path.join(OUT, 'subs', s.file));
    const inT = s.in + shift;
    const outT = s.out + shift;
    const fades = [];
    if (!(k === 0 && FIRST_NO_FADE_IN && shift === 0)) fades.push(`fade=t=in:st=${inT.toFixed(3)}:d=${FADE}:alpha=1`);
    if (!s.end) fades.push(`fade=t=out:st=${(outT - FADE).toFixed(3)}:d=${FADE}:alpha=1`);
    chain.push(`[${k + 1}:v]format=rgba,${fades.join(',')}[s${k}]`);
    const next = k === items.length - 1 ? '[comp]' : `[o${k}]`;
    chain.push(`${last}[s${k}]overlay=0:0:format=rgb:shortest=1${next}`);
    last = next;
  });
  return { inputs, graph: [`[0:v]format=gbrp,${GRADE}[base]`, ...chain, `[comp]${TO709}[v]`].join(';') };
}

async function main() {
  const { frames, clips } = resolveFrames();
  const events = measureEvents(clips);
  for (const s of [...SUBTITLES.map((x) => `${x.id}.png`), `${ENDCARD.id}.png`]) if (!existsSync(path.join(OUT, 'subs', s))) throw new Error(`字幕の画像 ${s} が無い（node subtitles.mjs）`);
  const imgIn = ['-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', 'pipe:0'];
  const bgmA = path.join(OUT, 'bgm-a.wav');
  const bgmB = path.join(OUT, 'bgm-b.wav');
  if (!existsSync(bgmA) || !existsSync(bgmB)) throw new Error('曲が無い（node audio.mjs）');

  if (breakMode) {
    // わざと壊した版：字幕を 1 秒遅らせる／音を 6dB 上げる
    const shift = breakMode === 'sub-shift' ? 1 : 0;
    const gain = breakMode === 'loud' ? 6 : 0;
    const { inputs, graph } = subtitleFilter(shift);
    const out = path.join(OUT, `broken-${breakMode}.mp4`);
    await ff([...imgIn, ...inputs, '-i', bgmA, '-filter_complex', graph, '-map', '[v]', '-map', `${SUBTITLES.length + 2}:a`, '-af', `volume=${gain}dB`, ...X264, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', String(DURATION), out], feed(frames));
    console.log(`壊した版: ${path.relative(DAY, out)}`);
    return;
  }

  // 1) 字幕なし（検査の基準）
  const clean = path.join(OUT, 'promo-clean.mp4');
  await ff([...imgIn, '-vf', `format=gbrp,${GRADE},${TO709}`, ...X264, '-an', '-t', String(DURATION), clean], feed(frames));
  // 2) 字幕つきの映像（音なし）
  const { inputs, graph } = subtitleFilter(0);
  const silentVideo = path.join(OUT, 'promo-video.mp4');
  await ff([...imgIn, ...inputs, '-filter_complex', graph, '-map', '[v]', ...X264, '-an', '-t', String(DURATION), silentVideo], feed(frames));
  const demo = path.join(DAY, 'demo.mp4');
  const AAC = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'];
  const mux = (bgm, out) => ff(['-i', silentVideo, '-i', bgm, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', ...AAC, '-t', String(DURATION), '-movflags', '+faststart', out]);
  // 3) 曲違いの2本（映像は同じ。音だけ替える）。本編（demo.mp4・promo.mp4）は MAIN_BGM の曲
  await mux(bgmA, path.join(OUT, 'promo-a.mp4'));
  await mux(bgmB, path.join(OUT, 'promo-b.mp4'));
  copyFileSync(path.join(OUT, `promo-${MAIN_BGM}.mp4`), demo);
  copyFileSync(demo, path.join(OUT, 'promo.mp4'));
  // 4) 1コマ目
  await ff(['-i', demo, '-frames:v', '1', path.join(OUT, 'first-frame.png')]);
  writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ clips, events }, null, 2));
  console.log('区間:');
  for (const c of clips) console.log(`  ${c.start.toFixed(2)}–${c.end.toFixed(2)} 秒  ${c.take} コマ ${c.fromFrame}–${c.toFrame}  ${c.note}`);
  console.log(`出来事（秒・拍）: ${JSON.stringify(events)}`);
  const sz = spawnSync('du', ['-h', demo], { encoding: 'utf8' }).stdout.trim();
  console.log(`書き出し: ${sz}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
