// OWNER: audio-tools
// 検証の測り方（tools/audio-render.mjs が使う）：ffmpeg の ebur128 で統合の音量・音量の幅・真のピーク、
// 復号した標本からクリップ・直流・立ち上がり・余韻・帯域の比率、ffmpeg でスペクトログラムの画像、塊の継ぎ目の段差。
import { spawn } from 'node:child_process';
import { SR } from './dsp.mjs';
import { bandShares } from './fft.mjs';
import { FFMPEG } from './io.mjs';
import { maxLoudness, onsetSeconds, tailSeconds } from './loudness.mjs';

const round = (x, k = 10) => (Number.isFinite(x) ? Math.round(x * k) / k : x);

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args);
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve(err) : reject(new Error(`ffmpeg ${args.join(' ')}\n${err.slice(-2000)}`))));
  });
}

/** ffmpeg の ebur128（BS.1770・真のピーク）で測る。 */
export async function ebur(file) {
  const err = await ffmpeg(['-hide_banner', '-nostats', '-i', file, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-']);
  const tail = err.slice(err.lastIndexOf('Summary:'));
  const num = (re) => {
    const m = re.exec(tail);
    return m ? Number(m[1]) : null;
  };
  return { integratedLufs: num(/I:\s+(-?[\d.]+) LUFS/), lraLu: num(/LRA:\s+(-?[\d.]+) LU/), truePeakDbtp: num(/Peak:\s+(-?[\d.inf]+) dBFS/) };
}

/** 復号した標本（{ l, r }）の数値。 */
export function sampleStats(s) {
  let peak = 0;
  let clipped = 0;
  let sumL = 0;
  let sumR = 0;
  let e = 0;
  for (let i = 0; i < s.l.length; i++) {
    const a = Math.abs(s.l[i]);
    const b = Math.abs(s.r[i]);
    peak = Math.max(peak, a, b);
    if (a >= 0.999) clipped++;
    if (b >= 0.999) clipped++;
    sumL += s.l[i];
    sumR += s.r[i];
    e += s.l[i] * s.l[i] + s.r[i] * s.r[i];
  }
  const n = s.l.length || 1;
  const m = maxLoudness([s.l, s.r]);
  return {
    seconds: round(s.l.length / SR, 1000),
    samplePeakDb: round(20 * Math.log10(peak || 1e-12)),
    clippedSamples: clipped,
    dcOffset: Math.max(Math.abs(sumL / n), Math.abs(sumR / n)).toExponential(2),
    rmsDb: round(10 * Math.log10(e / (2 * n) + 1e-20)),
    momentaryMaxLufs: round(m.momentaryMax),
    shortTermMaxLufs: round(m.shortTermMax),
    onsetMs: round(onsetSeconds([s.l, s.r]) * 1000),
    tailSeconds: round(tailSeconds([s.l, s.r]), 100),
    /** 帯域の比率：<60Hz・60〜250・250〜2k・2k〜8k・8k< */
    bands: bandShares([s.l, s.r], SR, [60, 250, 2000, 8000], 4096).map((v) => round(v, 1000)),
  };
}

/** スペクトログラムの画像（対数の周波数軸）。 */
export function spectrogram(file, png, { width = 1200, height = 420, start = 20, stop = 16000 } = {}) {
  return ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-lavfi', `showspectrumpic=s=${width}x${height}:legend=1:scale=log:fscale=log:start=${start}:stop=${stop}`, '-frames:v', '1', png]);
}

/** 波形の画像（場面の書き出しで、引きや段階の変化を目で追うため）。 */
export function waveform(file, png, { width = 1800, height = 300 } = {}) {
  return ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-lavfi', `showwavespic=s=${width}x${height}:split_channels=1:scale=log`, '-frames:v', '1', png]);
}

/**
 * 継ぎ目の段差：境目の前後の差分の大きさを、まわり（±200 標本）の差分の中央値と比べる（dB）。
 * 0 前後なら段差なし、+12dB を超えるとプチ音として聞こえうる。
 */
export function seamStepDb(s, at) {
  const n = s.l.length;
  const idx = (i) => (i + n) % n;
  let worst = -Infinity;
  for (const ch of [s.l, s.r]) {
    const around = [];
    for (let k = -200; k <= 200; k++) if (Math.abs(k) > 2) around.push(Math.abs(ch[idx(at + k)] - ch[idx(at + k - 1)]));
    around.sort((a, b) => a - b);
    const med = around[Math.floor(around.length / 2)] || 1e-9;
    const step = Math.max(Math.abs(ch[idx(at)] - ch[idx(at - 1)]), Math.abs(ch[idx(at + 1)] - ch[idx(at)]));
    worst = Math.max(worst, 20 * Math.log10(step / med + 1e-12));
  }
  return round(worst);
}

/** 並べて走らせる（同時に limit 個）。 */
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/** 区間ごとの音量の推移（短時間 3 秒の窓を 1 秒ずつ、LUFS）。段階やダッキングの形を数で見る。 */
export function loudnessTimeline(s, hop = 1) {
  const out = [];
  const w = 3 * SR;
  for (let a = 0; a + w <= s.l.length; a += hop * SR) {
    const seg = { l: s.l.subarray(a, a + w), r: s.r.subarray(a, a + w) };
    out.push(round(maxLoudness([seg.l, seg.r]).shortTermMax));
  }
  return out;
}

/**
 * 塊の継ぎ目の検査：復号してつないだ信号と、エンコード前の続いた信号の差を、継ぎ目の前後 ±1ms と、
 * 継ぎ目でない小節の頭（同じように太鼓の頭がある所）の前後 ±1ms とで比べる（dB）。0 前後なら継ぎ目に余計な乱れは無い。
 */
export function seamExcessDb(dec, orig, boundaries, controls, half = 48) {
  const n = dec.length;
  const rmsAt = (at) => {
    let e = 0;
    for (let k = -half; k < half; k++) {
      const i = (at + k + n) % n;
      const d = dec[i] - orig[i];
      e += d * d;
    }
    return Math.sqrt(e / (2 * half)) + 1e-9;
  };
  const ctl = controls.map(rmsAt).sort((a, b) => a - b);
  const ref = ctl[Math.floor(ctl.length * 0.5)];
  const per = boundaries.map((b) => round(20 * Math.log10(rmsAt(b) / ref)));
  const med = [...per].sort((a, b) => a - b)[Math.floor(per.length / 2)];
  return { maxDb: Math.max(...per), medianDb: med, perBoundaryDb: per, controlP90Db: round(20 * Math.log10(ctl[Math.floor(ctl.length * 0.9)] / ref)), controlMaxDb: round(20 * Math.log10(ctl[ctl.length - 1] / ref)) };
}
