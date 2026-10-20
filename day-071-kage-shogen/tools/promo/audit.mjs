/* 書き出した動画の検査と測定。ffmpeg / ffprobe だけで測る（追加の部品なし）。
   測定：画面の出来事（判子が押されたコマ・近さの言葉が替わったコマ・画面が切り替わったコマ）を、書き出した動画のコマから測る。
     効果音は、操作した時刻でなく、ここで測ったコマに置く。
   検査（qa.json）：寸法・fps・尺・codec・pix_fmt・faststart・メタデータなし／止まった区間（同じ絵が続く長さ）／黒画面／長い無音／
     ラウドネスと真のピーク／頭0.5秒の音量／1コマ目と0.3秒後のコマの差／1コマ目の字幕の字数／字幕と終了カードの文字の安全余白／判子の音と画のずれ。 */
import { execFileSync, spawnSync } from 'node:child_process';
import { openSync, readSync, closeSync, statSync } from 'node:fs';
import { DURATION_SECONDS, FPS, VIEW } from './timeline.mjs';

const runStderr = (args) => spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 }).stderr;
const raw = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 1 << 30 });
const num = (text, re) => { const m = text.match(re); return m ? Number(m[1]) : null; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

export function probe(file) {
  const out = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const v = out.streams.find((s) => s.codec_type === 'video');
  const a = out.streams.find((s) => s.codec_type === 'audio');
  return {
    width: v?.width, height: v?.height, fps: v?.r_frame_rate, avgFps: v?.avg_frame_rate, videoCodec: v?.codec_name, profile: v?.profile, pixFmt: v?.pix_fmt,
    colorSpace: v?.color_space, colorRange: v?.color_range, frames: Number(v?.nb_frames), videoDuration: Number(v?.duration),
    audioCodec: a?.codec_name ?? null, sampleRate: a ? Number(a.sample_rate) : null, channels: a?.channels ?? null,
    duration: Number(out.format.duration), bytes: Number(out.format.size),
    tags: { format: out.format.tags ?? {}, streams: out.streams.map((s) => s.tags ?? {}) },
  };
}

/* faststart：moov が mdat より前にあるか（先頭の箱を順に読む） */
export function moovFirst(file) {
  const fd = openSync(file, 'r');
  try {
    const size = statSync(file).size; let pos = 0; const order = [];
    while (pos < size && order.length < 12) {
      const head = Buffer.alloc(16); readSync(fd, head, 0, 16, pos);
      let box = head.readUInt32BE(0); const type = head.toString('latin1', 4, 8);
      if (box === 1) box = Number(head.readBigUInt64BE(8));
      order.push(type);
      if (box < 8) break;
      pos += box;
    }
    return { order, moovBeforeMdat: order.indexOf('moov') >= 0 && order.indexOf('moov') < order.indexOf('mdat') };
  } finally { closeSync(fd); }
}

/* ---------------------------------------------------------------- 画（小さい灰色のコマで測る。CSS px の矩形を、そのまま渡せる） */

export const SMALL = { w: 270, h: 480 };              // 1080×1920 の 1/4。CSS px（540×960）の 1/2
const K = SMALL.w / VIEW.width;
const cache = new Map();
export function grayFrames(video) {
  if (cache.has(video)) return cache.get(video);
  const buf = raw(['-i', video, '-vf', `scale=${SMALL.w}:${SMALL.h}:flags=area,format=gray`, '-f', 'rawvideo', '-']);
  const size = SMALL.w * SMALL.h;
  const frames = { buf, size, count: Math.floor(buf.length / size) };
  cache.set(video, frames);
  return frames;
}
const toSmall = (rect) => ({
  x0: Math.max(0, Math.floor(rect.left * K)), y0: Math.max(0, Math.floor(rect.top * K)),
  x1: Math.min(SMALL.w, Math.ceil(rect.right * K)), y1: Math.min(SMALL.h, Math.ceil(rect.bottom * K)),
});
export const FULL = Object.freeze({ left: 0, top: 0, right: VIEW.width, bottom: VIEW.height });

/* 2つのコマの差（0〜255 の平均）。rect は CSS px */
export function frameDiff(frames, i, j, rect = FULL) {
  const r = toSmall(rect); let sum = 0; let n = 0;
  for (let y = r.y0; y < r.y1; y += 1) for (let x = r.x0; x < r.x1; x += 1) {
    const o = y * SMALL.w + x; sum += Math.abs(frames.buf[i * frames.size + o] - frames.buf[j * frames.size + o]); n += 1;
  }
  return n ? sum / n : 0;
}
/* 2つのコマで、はっきり変わった画素の数（差が 12 以上）。符号化のゆらぎ（数階調）は数えない */
export function changedPixels(frames, i, j, rect = FULL) {
  const r = toSmall(rect); let n = 0;
  for (let y = r.y0; y < r.y1; y += 1) for (let x = r.x0; x < r.x1; x += 1) {
    const o = y * SMALL.w + x; if (Math.abs(frames.buf[i * frames.size + o] - frames.buf[j * frames.size + o]) >= 12) n += 1;
  }
  return n;
}

/* from（秒）以後で、rect の中が最初にはっきり変わったコマの時刻（秒）。変わらなければ null */
export function firstChange(video, rect, from, { within = 0.4, minPixels = 6 } = {}) {
  const frames = grayFrames(video);
  const start = Math.max(1, Math.ceil(from * FPS - 0.5));
  const stop = Math.min(frames.count - 1, Math.ceil((from + within) * FPS));
  for (let f = start; f <= stop; f += 1) if (changedPixels(frames, f - 1, f, rect) >= minPixels) return f / FPS;
  return null;
}

/* 判子が押されたコマ（紙に着いたコマ）：画面が切り替わったコマ（onset）から、最終の形（0.7秒後）との差を1コマずつ見る。
   判子の CSS（大きく薄い所から 0.38 秒で縮む。行き過ぎて少し小さくなり、戻る）では、差は着いた所で一度谷になり、行き過ぎで少し増えて、0 へ落ちる。
   最初の3コマの最大の6割より小さく、かつ「谷」か「最大の12%以下」になった最初のコマを、着いたコマとする。
   「解決」の判子は 1.35 倍から縮むので行き過ぎが小さく、谷がはっきりしない（谷だけで探すと1コマ遅れた）。現れてから約 0.1 秒 */
export function stampLanding(video, rect, onset) {
  const frames = grayFrames(video);
  const f0 = Math.round(onset * FPS);
  const settled = Math.min(frames.count - 1, f0 + Math.round(0.7 * FPS));
  const d = (f) => frameDiff(frames, f, settled, rect);
  const peak = Math.max(d(f0), d(f0 + 1), d(f0 + 2), d(f0 + 3));
  for (let f = f0 + 1; f <= f0 + Math.round(0.4 * FPS); f += 1) {
    const here = d(f);
    if (here < peak * 0.6 && (here <= d(f + 1) || here <= peak * 0.12)) return { at: f / FPS, frame: f, framesAfterOnset: f - f0, diffPeak: r2(peak), diffAtLanding: r2(here) };
  }
  return { at: null, frame: null, diffPeak: r2(peak) };
}

/* 判子の CSS（0.38秒・cubic-bezier(0.2, 1.4, 0.4, 1)）で、縮む判子が初めて最終の大きさになるまでの秒（画面が切り替わってから）。
   画から測ったコマの照合に使う（1コマより大きくずれたら、測り方か CSS が変わった） */
export function stampLandingDelay({ duration = 0.38, x1 = 0.2, y1 = 1.4, x2 = 0.4, y2 = 1 } = {}) {
  const bez = (s, a, b) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s * s * b + s ** 3;
  let lo = 0; let hi = 0.8;            // y(s) = 1 になる最初の s（行き過ぎより前）
  for (let i = 0; i < 40; i += 1) { const mid = (lo + hi) / 2; if (bez(mid, y1, y2) < 1) lo = mid; else hi = mid; }
  return duration * bez(lo, x1, x2);
}

/* 止まった区間：前のコマから、はっきり変わった画素が無いコマが続く長さ。最長と、1.2秒を超えた区間 */
export function holdReport(video, { limit = 1.2 } = {}) {
  const frames = grayFrames(video);
  const runs = []; let start = null;
  for (let f = 1; f < frames.count; f += 1) {
    const same = changedPixels(frames, f - 1, f) < 2;
    if (same && start === null) start = f - 1;
    if ((!same || f === frames.count - 1) && start !== null) { const end = same ? f : f - 1; runs.push({ from: r2(start / FPS), frames: end - start + 1, seconds: r2((end - start + 1) / FPS) }); start = null; }
  }
  const longest = runs.reduce((a, b) => (b.frames > (a?.frames ?? 0) ? b : a), null);
  const changed = frames.count - 1 - runs.reduce((s, r) => s + r.frames - 1, 0);
  return { frames: frames.count, changedFrames: changed, longestHold: longest, over: runs.filter((r) => r.seconds > limit), limitSeconds: limit };
}

/* 1コマ目が動いているか：0秒と0.3秒のコマの差（全体の平均と、はっきり変わった画素の数） */
export function firstFrameMotion(video) {
  const frames = grayFrames(video);
  const at = Math.round(0.3 * FPS);
  return { meanDiff0vs0_3: r2(frameDiff(frames, 0, at)), changedPixels0vs0_3: changedPixels(frames, 0, at), changedPixels0vs1: changedPixels(frames, 0, 1), identical: frameDiff(frames, 0, at) === 0 };
}

export function blackReport(file) {
  const text = runStderr(['-i', file, '-vf', 'blackdetect=d=0.05:pix_th=0.10:pic_th=0.98', '-an', '-f', 'null', '-']);
  return { events: text.split('\n').filter((l) => l.includes('black_start:')).map((l) => l.trim()) };
}

/* ---------------------------------------------------------------- 音 */

export function loudness(file, { ss = 0, t = DURATION_SECONDS } = {}) {
  const text = runStderr(['-ss', String(ss), '-t', String(t), '-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const tail = text.slice(text.lastIndexOf('Summary:'));
  return { lufs: num(tail, /I:\s+(-?[\d.]+) LUFS/), lra: num(tail, /LRA:\s+(-?[\d.]+) LU/), truePeak: num(tail, /True peak:\s+Peak:\s+(-?[\d.]+) dBFS/) };
}
export function silenceReport(file) {
  const text = runStderr(['-i', file, '-vn', '-af', 'silencedetect=n=-50dB:d=0.5', '-f', 'null', '-']);
  return { events: text.split('\n').filter((l) => /silence_(start|end)/.test(l)).map((l) => l.trim()) };
}
function rmsDb(file, filter, { ss = 0, t } = {}) {
  const text = runStderr(['-ss', String(ss), ...(t ? ['-t', String(t)] : []), '-i', file, '-vn', '-af', `${filter ? `${filter},` : ''}astats=metadata=0:reset=0`, '-f', 'null', '-']);
  const overall = text.slice(text.lastIndexOf('Overall'));
  return { rms: num(overall, /RMS level dB:\s+(-?[\d.]+|-inf)/), peak: num(overall, /Peak level dB:\s+(-?[\d.]+)/) };
}
export function decodePcm(file) {
  const pcm = raw(['-i', file, '-vn', '-f', 's16le', '-ac', '2', '-ar', '48000', '-']);
  const n = pcm.length / 4; const l = new Float32Array(n); const r = new Float32Array(n);
  for (let i = 0; i < n; i += 1) { l[i] = pcm.readInt16LE(i * 4) / 32768; r[i] = pcm.readInt16LE(i * 4 + 2) / 32768; }
  return { l, r, sr: 48000 };
}

/* 2次の帯域通過（ピーク 0dB） */
function bandpass(x, sr, fc, q) {
  const w = 2 * Math.PI * fc / sr; const c = Math.cos(w); const alpha = Math.sin(w) / (2 * q); const a0 = 1 + alpha;
  const b0 = alpha / a0; const b2 = -alpha / a0; const a1 = -2 * c / a0; const a2 = (1 - alpha) / a0;
  const y = new Float32Array(x.length); let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  for (let i = 0; i < x.length; i += 1) { const v = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}

/* 判子の音の鳴り始め：判子の音は、紙を打つ高い成分が急に立ち上がる。予定の時刻の前後 80ms で、7kHz 付近の
   2ms ごとの強さが、直前 150ms の中央値より 14dB 以上大きくなった最初の所を返す。
   3kHz 付近で測ると、判子の 0.6 秒前に鳴る成功のチャイム（ベルの倍音）が残っていて、立ち上がりが埋もれる（2つ取りこぼした） */
export function audioOnsets(file, times, { band = [7000, 0.8], window = 0.08 } = {}) {
  const { l, r, sr } = decodePcm(file);
  const mono = new Float32Array(l.length); for (let i = 0; i < l.length; i += 1) mono[i] = (l[i] + r[i]) / 2;
  const hi = bandpass(mono, sr, band[0], band[1]);
  const step = Math.round(0.002 * sr);
  const energy = (i) => { let s = 0; for (let k = i; k < i + step && k < hi.length; k += 1) s += hi[k] * hi[k]; return 10 * Math.log10(s / step + 1e-12); };
  return times.map((t) => {
    const from = Math.max(0, Math.round((t - window) * sr)); const to = Math.min(hi.length - step, Math.round((t + window) * sr));
    for (let i = from; i < to; i += step) {
      const pre = []; for (let k = Math.max(0, i - Math.round(0.15 * sr)); k < i - step; k += step) pre.push(energy(k));
      pre.sort((a, b) => a - b);
      const base = pre.length ? pre[pre.length >> 1] : -120;
      if (energy(i) - base >= 14) {
        // 2ms の窓の中で、最初に大きく振れたサンプルまで詰める
        let j = i; const peak = Math.max(...Array.from(hi.subarray(i, i + step), Math.abs));
        while (j < i + step && Math.abs(hi[j]) < peak * 0.3) j += 1;
        return r3(j / sr);
      }
    }
    return null;
  });
}

const BANDS = [['below120Hz', 'lowpass=f=120,lowpass=f=120'], ['120to500Hz', 'highpass=f=120,highpass=f=120,lowpass=f=500,lowpass=f=500'],
  ['500to2000Hz', 'highpass=f=500,highpass=f=500,lowpass=f=2000,lowpass=f=2000'], ['2000to8000Hz', 'highpass=f=2000,highpass=f=2000,lowpass=f=8000,lowpass=f=8000'],
  ['above8kHz', 'highpass=f=8000,highpass=f=8000']];

export function audioReport(file) {
  const all = loudness(file);
  const full = rmsDb(file, '');
  const head = rmsDb(file, '', { ss: 0, t: 0.5 });
  const bands = Object.fromEntries(BANDS.map(([name, filter]) => [name, r1(rmsDb(file, filter).rms - full.rms)]));
  let peak = 0; let clipped = 0;
  const { l, r } = decodePcm(file);
  for (const ch of [l, r]) for (let i = 0; i < ch.length; i += 1) { const v = Math.abs(ch[i]); if (v > peak) peak = v; if (v >= 32767 / 32768) clipped += 1; }
  return {
    integratedLufs: r1(all.lufs), loudnessRangeLu: r1(all.lra), truePeakDbtp: r1(all.truePeak),
    samplePeakDbfs: r2(20 * Math.log10(Math.max(peak, 1e-9))), clippedSamples: clipped,
    rmsDb: r1(full.rms), first0_5sRmsDbfs: r1(head.rms), bandsDbVsFull: bands,
  };
}

export function spectrogram(file, png) {
  raw(['-y', '-i', file, '-vn', '-lavfi', 'showspectrumpic=s=1600x800:legend=1:scale=log:fscale=log', '-frames:v', '1', png]);
}

/* ---------------------------------------------------------------- 静止画 */

export function extractFrame(video, seconds, png) {
  raw(['-y', '-i', video, '-vf', `select=eq(n\\,${Math.round(seconds * FPS)})`, '-vsync', '0', '-frames:v', '1', '-map_metadata', '-1', png]);
}
/* 場面一覧：1秒ごとのコマを、時刻つきで 6列に並べた1枚 */
export function contactSheet(video, jpg, font) {
  const label = `drawtext=fontfile='${font.replace(/'/g, "\\'")}':text='%{eif\\:t\\:d}s':x=10:y=10:fontsize=34:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8`;   // t は元の時刻（select の後の n は数え直しになる）
  raw(['-y', '-i', video, '-vf', `select='not(mod(n\\,${FPS}))',${label},scale=216:384,tile=6x6:padding=6:margin=6:color=0x222222`, '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', jpg]);
}

/* ---------------------------------------------------------------- まとめ（qa.json） */

const inside = (rect, safe) => rect.left >= safe.left - 0.5 && rect.right <= safe.right + 0.5 && rect.top >= safe.top - 0.5 && rect.bottom <= safe.bottom + 0.5;

export function auditMaster({ file, captionLog, endRects, safe, plateBound, stamps, firstCaption, expectedSeconds }) {
  const spec = probe(file);
  const box = moovFirst(file);
  const forbidden = /^(artist|author|comment|copyright|description|location|make|model|title|creation_time|encoder|date|album|genre)$/i;
  const tagKeys = [...Object.keys(spec.tags.format), ...spec.tags.streams.flatMap((t) => Object.keys(t))];
  const badTags = tagKeys.filter((k) => forbidden.test(k));
  const holds = holdReport(file);
  const black = blackReport(file);
  const silence = silenceReport(file);
  const audio = audioReport(file);
  const motion = firstFrameMotion(file);
  // 判子：最終の mp4 で画（判子が紙に着いたコマ）と音（鳴り始め）を測り直して、ずれを出す
  const stampRows = stamps.map((s) => {
    const landed = stampLanding(file, s.rect, s.onset);
    return { key: s.key, word: s.word, videoAt: landed.at, cueAt: s.cueAt };
  });
  const heard = audioOnsets(file, stampRows.map((s) => s.videoAt ?? s.cueAt));
  stampRows.forEach((s, i) => { s.audioAt = heard[i]; s.deltaSeconds = s.audioAt == null || s.videoAt == null ? null : r3(s.audioAt - s.videoAt); });
  // 字：どの字幕も SAFE の内側。札（背景）：内容の列（plateBound）の内側。札は、下のアプリの文字を隠しきるために SAFE の外へ少し広げてある
  const capChecks = captionLog.map((c) => {
    const text = c.textRect ?? c.box;
    return { text: c.text, pos: c.pos, fontPx: c.fontPx ?? c.size, textRect: text, plate: c.box, textInsideSafe: inside(text, safe), plateInside: inside(c.box, plateBound), fitsOneLine: c.fits };
  });
  const endChecks = endRects.map((e) => ({ cls: e.cls, text: e.text, insideSafe: inside(e, safe) }));
  const checks = {
    size1080x1920: spec.width === 1080 && spec.height === 1920,
    fps30: spec.fps === '30/1',
    durationInRange: spec.duration >= 32 && spec.duration <= 36 && Math.abs(spec.duration - expectedSeconds) < 0.05,
    h264High: spec.videoCodec === 'h264' && spec.profile === 'High',
    yuv420p: spec.pixFmt === 'yuv420p',
    aac48kStereo: spec.audioCodec === 'aac' && spec.sampleRate === 48000 && spec.channels === 2,
    faststart: box.moovBeforeMdat,
    noMetadata: badTags.length === 0,
    holdsWithin1_2s: holds.over.length === 0,
    noBlack: black.events.length === 0,
    noSilence: silence.events.length === 0,
    loudness: audio.integratedLufs >= -18 && audio.integratedLufs <= -16,
    truePeak: audio.truePeakDbtp <= -2.0,
    soundFromFirstFrame: audio.first0_5sRmsDbfs > -50,
    firstFrameMoves: !motion.identical && motion.changedPixels0vs0_3 >= 20,
    firstCaptionWithin12: firstCaption && Array.from(firstCaption).length <= 12,
    captionsInsideSafe: capChecks.length > 0 && capChecks.every((c) => c.textInsideSafe && c.plateInside && c.fitsOneLine),
    endCardInsideSafe: endChecks.length > 0 && endChecks.every((c) => c.insideSafe),
    stampSyncWithin0_03s: stampRows.length > 0 && stampRows.every((s) => s.deltaSeconds != null && Math.abs(s.deltaSeconds) <= 0.03),
  };
  return {
    result: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
    checks,
    spec: { ...spec, tags: undefined, tagKeys, boxOrder: box.order },
    holds, black, silence, audio, firstFrame: { ...motion, caption: firstCaption, captionChars: firstCaption ? Array.from(firstCaption).length : null },
    captions: capChecks, endCard: endChecks, safeArea: safe, stamps: stampRows,
    notes: ['音は機械で測った値だけ。人の耳による確認はしていない。', '画の確認は、書き出した静止画を別に見る（この表は見た目の合否を言わない）。'],
  };
}
