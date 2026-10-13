/* 書き出した動画の検査。ffmpeg / ffprobe だけで測る（追加の部品なし）。
   画：1コマ目が動いているか（0秒と0.3秒のコマの差）・画面の動きと効果音の合図の時刻が合っているか・確認用のコマの書き出し。
   音：統合ラウドネス・トゥルーピーク・クリップ・低域/高域の比・フックと本編の差・スペクトログラム。 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DURATION_SECONDS, FPS, TAKES } from './timeline.mjs';

/* ffmpeg の解析結果（ebur128・astats）は stderr に出る。書き出しは捨てる */
const runStderr = (args) => spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 }).stderr;
const raw = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 1 << 29 });
const num = (text, re) => { const m = text.match(re); return m ? Number(m[1]) : null; };
const db = (x) => 20 * Math.log10(Math.max(x, 1e-12));
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

export function probe(file) {
  const out = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const v = out.streams.find((s) => s.codec_type === 'video');
  const a = out.streams.find((s) => s.codec_type === 'audio');
  return { width: v?.width, height: v?.height, fps: v?.avg_frame_rate, videoCodec: v?.codec_name, profile: v?.profile, pixFmt: v?.pix_fmt, colorSpace: v?.color_space,
    audioCodec: a?.codec_name, sampleRate: a ? Number(a.sample_rate) : null, channels: a?.channels, duration: Number(out.format.duration), videoDuration: Number(v?.duration), bytes: Number(out.format.size), frames: Number(v?.nb_frames) };
}

/* ---------------------------------------------------------------- 画 */

/* 確認用のコマ。時刻は動画の頭からの秒 */
export function extractFrames(video, dir, times = [0, 0.3, 2, 5, 10, 15, 20, 25, 30]) {
  mkdirSync(dir, { recursive: true });
  const names = [];
  for (const t of times) {
    const name = `t${t.toFixed(2).padStart(5, '0')}s.png`;
    raw(['-y', '-i', video, '-vf', `select=eq(n\\,${Math.round(t * FPS)})`, '-vsync', '0', '-frames:v', '1', join(dir, name)]);
    names.push(name);
  }
  raw(['-y', '-sseof', '-0.2', '-i', video, '-update', '1', '-frames:v', '1', join(dir, 'last.png')]);
  names.push('last.png');
  return names;
}

const SMALL = { w: 108, h: 192 };
function grayFrames(video) {
  const buf = raw(['-i', video, '-vf', `scale=${SMALL.w}:${SMALL.h}:flags=area,format=gray`, '-f', 'rawvideo', '-']);
  const size = SMALL.w * SMALL.h;
  return { buf, size, count: Math.floor(buf.length / size) };
}
const region = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });
const BOARD = region(8, 40, 100, 128);       // 盤（面8の高い盤も含む）。1080×1920 の x 80〜1000・y 400〜1280
const FULL = region(0, 0, SMALL.w, SMALL.h);

function frameDiff(frames, i, j, r) {
  let sum = 0; let n = 0;
  for (let y = r.y0; y < r.y1; y += 1) for (let x = r.x0; x < r.x1; x += 1) {
    const o = y * SMALL.w + x; sum += Math.abs(frames.buf[i * frames.size + o] - frames.buf[j * frames.size + o]); n += 1;
  }
  return sum / n;
}

/* 1コマ目が動いているか：0秒と0.3秒のコマの差（0〜255 の平均）。0 ならまったく同じ */
export function firstFrameMotion(video) {
  const frames = grayFrames(video);
  const at = Math.round(0.3 * FPS);
  return { frame0vs0_3_board: r2(frameDiff(frames, 0, at, BOARD)), frame0vs0_3_full: r2(frameDiff(frames, 0, at, FULL)),
    frame0vs1: r2(frameDiff(frames, 0, 1, BOARD)), identical: frameDiff(frames, 0, at, FULL) === 0 };
}

/* 結果の欄（見つかった・成功）の右側。十字ボタンの輪（押した所に出る）は、ここまで届かない */
const PANEL = region(77, 96, 106, 140);
/* 検査用の領域（結果の欄そのものでなく、別の画素で同じ出来事を測る）
   ・STATUS：状態の行（手数・最少・宝）の左側。見つかった（動画の頭の手より後）で、結果の欄に替わって文字が消える
   ・BELOW_L1・BELOW_L8：十字ボタンより下。成功の欄が十字ボタンより長いので、欄が出たときだけ変わる（十字ボタンの輪は届かない） */
const STATUS = region(3, 88, 30, 134);
const BELOW_L1 = region(3, 141, 104, 149);
const BELOW_L8 = region(3, 177, 104, 183);
const THRESHOLD = { board: 0.08, full: 0.08, panel: 0.08, status: 0.08, belowL1: 0.08, belowL8: 0.08 };
const SERIES = new WeakMap();
function seriesOf(frames) {
  if (!SERIES.has(frames)) {
    const make = (r) => Array.from({ length: frames.count }, (_, f) => (f === 0 ? 0 : frameDiff(frames, f - 1, f, r)));
    SERIES.set(frames, { board: make(BOARD), full: make(FULL), panel: make(PANEL), status: make(STATUS), belowL1: make(BELOW_L1), belowL8: make(BELOW_L8) });
  }
  return SERIES.get(frames);
}

/* 手を押した時刻（items[].from）以後で、画面が最初に変わったコマの時刻（秒）を返す。変わらなければ null。
   音の合図を、押した時刻でなく「画に出た時刻」に置くための測定（アプリが重い手では、押してから動き出すまで約90ms遅れる） */
export function measureOnsets(video, items, { within = 0.3 } = {}) {
  const frames = grayFrames(video);
  const series = seriesOf(frames);
  const out = {};
  for (const item of items) {
    const from = Math.max(1, Math.ceil(item.from * FPS - 0.5));
    const to = Math.min(frames.count - 1, Math.ceil((item.from + within) * FPS));
    let found = null;
    for (let f = from; f <= to; f += 1) if (series[item.region ?? 'board'][f] > THRESHOLD[item.region ?? 'board']) { found = f / FPS; break; }
    out[item.key] = found;
  }
  return out;
}

/* 音の合図が、画に出た変化と合っているか。
   ・見つかった・成功の合図は、結果の欄が出た時刻（欄の右側の画素）から取ってある。ここでは別の画素（STATUS・BELOW）で測り直して照らす
   ・手（step・push）は、押した時刻から画が動くまでの遅れの分布を出す */
export function syncReport(video, cues, keyTimes = []) {
  const frames = grayFrames(video);
  const series = seriesOf(frames);
  const panels = cues.filter((c) => (c.kind === 'caught' || c.kind === 'clear') && !c.soft);
  const rows = panels.map((cue) => {
    const from = Math.max(1, Math.floor((cue.at - 0.2) * FPS));
    const to = Math.min(frames.count - 1, Math.ceil((cue.at + 0.3) * FPS));
    const name = cue.kind === 'caught' ? 'status' : cue.at < 16 ? 'belowL1' : 'belowL8';
    let found = null;
    for (let f = from; f <= to; f += 1) if (series[name][f] > THRESHOLD[name]) { found = f; break; }
    return { kind: cue.kind, cue: cue.at, onset: found == null ? null : r2(found / FPS), deltaMs: found == null ? null : Math.round((found / FPS - cue.at) * 1000) };
  });
  const lags = keyTimes.filter((k) => k.onset != null).map((k) => Math.round((k.onset - k.actual) * 1000)).sort((a, b) => a - b);
  const pick = (q) => lags[Math.min(lags.length - 1, Math.floor(lags.length * q))] ?? null;
  return { panelCues: rows, keyToPictureMs: { n: lags.length, min: lags[0] ?? null, median: pick(0.5), p90: pick(0.9), max: lags[lags.length - 1] ?? null,
    over50ms: lags.filter((x) => x > 50).length } };
}

/* 字幕の入れ替わり：字幕の行（盤の上）の明るさが最も下がる所＝文字がいったん消えた時刻を、予定と比べる。
   予定は、入れ替えを始める時刻（字幕の開始 − 先出し）に、消えるまでの 0.11 秒を足したもの */
export function captionSwitches(video, captions, { lead = 0.2, fade = 0.11 } = {}) {
  const frames = grayFrames(video);
  const luma = (f) => { let sum = 0; let n = 0; for (let y = 33; y < 42; y += 1) for (let x = 12; x < 96; x += 1) { sum += frames.buf[f * frames.size + y * SMALL.w + x]; n += 1; } return sum / n; };
  const rows = [];
  for (const cap of captions) {
    if (TAKES.some((t) => t.start === cap.start) || cap.pos === 'bottom') continue;     // 場面の頭の字幕はページごと切り替わる。一覧の字幕は別の位置
    const planned = cap.start - (cap.lead ?? lead) + fade;
    if (planned < 0.5) continue;
    let best = null;
    for (let f = Math.max(1, Math.floor((planned - 0.3) * FPS)); f <= Math.min(frames.count - 1, Math.ceil((planned + 0.3) * FPS)); f += 1) {
      const v = luma(f); if (!best || v < best.v) best = { f, v };
    }
    const dips = best && best.v < luma(Math.max(0, best.f - 5)) - 3;
    rows.push({ planned: r2(planned), measured: best && dips ? r2(best.f / FPS) : null, deltaMs: best && dips ? Math.round((best.f / FPS - planned) * 1000) : null });
  }
  return rows;
}

/* ---------------------------------------------------------------- 音 */

export function loudness(file, { ss = 0, t = DURATION_SECONDS } = {}) {
  const text = runStderr(['-ss', String(ss), '-t', String(t), '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const tail = text.slice(text.lastIndexOf('Summary:'));
  return { lufs: num(tail, /I:\s+(-?[\d.]+) LUFS/), lra: num(tail, /LRA:\s+(-?[\d.]+) LU/), truePeak: num(tail, /True peak:\s+Peak:\s+(-?[\d.]+) dBFS/) };
}

function rmsDb(file, filter) {
  const text = runStderr(['-i', file, '-vn', '-af', `${filter ? `${filter},` : ''}astats=metadata=0:reset=0`, '-f', 'null', '-']);
  const overall = text.slice(text.lastIndexOf('Overall'));
  return { rms: num(overall, /RMS level dB:\s+(-?[\d.]+)/), peak: num(overall, /Peak level dB:\s+(-?[\d.]+)/) };
}

/* 動画の音をそのまま復号して、サンプルの最大値とクリップ（±満杯）の数を数える */
function decodedPeak(file) {
  const pcm = raw(['-i', file, '-vn', '-f', 's16le', '-ac', '2', '-ar', '48000', '-']);
  let peak = 0; let clipped = 0;
  for (let i = 0; i + 1 < pcm.length; i += 2) { const v = Math.abs(pcm.readInt16LE(i)); if (v > peak) peak = v; if (v >= 32767) clipped += 1; }
  return { peakDbfs: r2(db(peak / 32768)), clipped, samples: pcm.length / 4 };
}

/* 帯域ごとの強さ（全体の RMS との差・dB）。各帯は2次フィルタ2段（カットオフで -6dB） */
const BANDS = [['below120Hz', 'lowpass=f=120,lowpass=f=120'], ['120to500Hz', 'highpass=f=120,highpass=f=120,lowpass=f=500,lowpass=f=500'],
  ['500to2000Hz', 'highpass=f=500,highpass=f=500,lowpass=f=2000,lowpass=f=2000'], ['2000to8000Hz', 'highpass=f=2000,highpass=f=2000,lowpass=f=8000,lowpass=f=8000'],
  ['above8kHz', 'highpass=f=8000,highpass=f=8000']];

export function audioReport(file) {
  const all = loudness(file);
  const full = rmsDb(file, '');
  const bands = Object.fromEntries(BANDS.map(([name, filter]) => [name, r1(rmsDb(file, filter).rms - full.rms)]));
  const low = rmsDb(file, 'lowpass=f=120,lowpass=f=120');
  const high = rmsDb(file, 'highpass=f=8000,highpass=f=8000');
  const hook = loudness(file, { ss: 0, t: 4 });
  const body = loudness(file, { ss: 4, t: DURATION_SECONDS - 4 });
  const clip = decodedPeak(file);
  return {
    integratedLufs: r1(all.lufs), loudnessRangeLu: r1(all.lra), truePeakDbtp: r1(all.truePeak),
    samplePeakDbfs: clip.peakDbfs, clippedSamples: clip.clipped,
    rmsDb: r1(full.rms), lowBandBelow120Hz_dbVsFull: r1(low.rms - full.rms), highBandAbove8kHz_dbVsFull: r1(high.rms - full.rms), bandsDbVsFull: bands,
    hookLufs_0to4s: r1(hook.lufs), bodyLufs_4to32s: r1(body.lufs), hookMinusBodyDb: r1(hook.lufs - body.lufs),
  };
}

export function spectrogram(file, png) {
  raw(['-y', '-i', file, '-vn', '-lavfi', 'showspectrumpic=s=1600x800:legend=1:scale=log:fscale=log', '-frames:v', '1', png]);
}

/* ---------------------------------------------------------------- まとめ */

export async function auditAll({ output, silent, files, cues, recs, picked, keyTimes, captions = [] }) {
  const frames = extractFrames(files[0].file, join(output, 'frames'));
  const report = {
    spec: probe(files[0].file),
    firstFrame: firstFrameMotion(silent),
    frames,
    sync: syncReport(silent, cues, keyTimes),
    captionSwitches: captionSwitches(silent, captions),
    takes: recs ? Object.fromEntries(Object.entries(recs).map(([id, r]) => [id, {
      level: r.take.level, attempt: r.attempt, frames: r.frames.length, medianGapMs: Math.round(r.medianGap), maxGapMs: Math.round(r.maxGap), stalls: r.stalls,
      captionFontPx: r.captionSizes, blockedHosts: r.blocked, screenChecks: r.checks.map((c) => ({ at: c.at, label: c.label, ok: c.ok, status: c.got.status, steps: c.got.steps, ...(c.got.caught ? { caughtPanel: c.got.caught } : {}), ...(c.got.clear ? { clearPanel: c.got.clear } : {}) })),
      keyJitterMs: r.actual.map((a) => Math.round(a.actualMs - (r.origin + a.at * 1000))),
    }])) : null,
    resampleLateMs: picked?.length ? { max: Math.round(Math.max(...picked.map((p) => p.lateMs))), mean: Math.round(picked.reduce((s, p) => s + p.lateMs, 0) / picked.length) } : null,
    audio: {},
  };
  for (const f of files) {
    report.audio[f.variant] = { file: f.file.split('/').pop(), spec: probe(f.file), ...audioReport(f.file) };
    spectrogram(f.wav, join(output, `spectrogram_${f.variant}.png`));
  }
  return report;
}
