// OWNER: audio-tools
// 曲の仕上げ（build.mjs の側）：パートを層に足す → ホールの残響 → 終わりの尾を頭へ回し込む（輪にする）→ 段階ごとの音量を目標へ
// → 3段階すべての混ぜ方で上限を超えない共通の制限器 → 4小節（10秒）ごとに前後 0.1 秒の糊しろを付けて OGG に切る。
// 段階の音量：静＝静だけ、暴＝静＋暴、頂＝静＋暴＋頂。実行時は層の音量を 0/1 で動かすだけなので、ここで測った値がそのまま遊ぶときの値になる。
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { SR, dcBlock, filt, len, stereo } from '../lib/dsp.mjs';
import { bandShares, convolve } from '../lib/fft.mjs';
import { encodeOgg, writeWav } from '../lib/io.mjs';
import { limiterGain } from '../lib/limit.mjs';
import { integratedLufs, maxLoudness, mixLoudnessModel, truePeakDb } from '../lib/loudness.mjs';
import { masterSfx, round1 } from '../lib/master.mjs';
import { HOLD, HOLD_CHUNK, HOLD_TIMELINE, PARTS, STEMS } from './arrange.mjs';
import { BAR, BARS, BEAT, BPM, LENGTH, SECTIONS } from './score.mjs';
import { TAIL, renderFill } from './render.mjs';

/**
 * 段階の音量の目標（LUFS）。受け入れ条件は -18〜-14 の間。
 * r02-audio：指摘「段階を1つ上げても +0.1〜2.1dB しか大きくならない」 静 -17→-17.4・暴 -15.6→-15.6・頂 -14.5→-14.0（共通の制限器で約 0.3dB 下がる。
 * 仕上がりの幅 2.5→3.4LU。A〜C 区間の中の差は 4LU を超える＝bgm.json の sections）
 */
export const STAGE_TARGETS = { calm: -17.4, rampage: -15.6, peak: -14.0 };

/**
 * r05-audio：指摘「暴と頂で 50〜63Hz が 400Hz と同じ大きさで、崩落の 43% が乗る 60Hz 未満と重なる」
 * 低音は静の層（低音の楽器）が受け持ち、暴と頂の層は 60Hz 付近の山（大太鼓の基音と低い金管）を 4dB 削る。大太鼓の手応えは倍音と撥の音に残る
 */
const STEM_EQ = { rampage: [['peak', 60, 1.1, -4]], peak: [['peak', 60, 1.1, -4]] };
const CHUNK_BARS = 4;
const PAD = 0.1;

function mixOf(stems, gains) {
  const n = stems[0].l.length;
  const out = stereo(n);
  stems.forEach((s, k) => {
    const g = gains[k];
    for (let i = 0; i < n; i++) {
      out.l[i] += s.l[i] * g;
      out.r[i] += s.r[i] * g;
    }
  });
  return out;
}

/** 目標の音量になる倍率を二分探索で求める（他の層の倍率は固定）。 */
function solveGain(model, gains, idx, target) {
  let lo = -40;
  let hi = 20;
  for (let it = 0; it < 30; it++) {
    const mid = (lo + hi) / 2;
    const g = gains.slice();
    g[idx] = 10 ** (mid / 20);
    if (model(g) < target) lo = mid;
    else hi = mid;
  }
  return 10 ** ((lo + hi) / 2 / 20);
}

/** 終わりの尾（LENGTH 以降）を頭へ足して、ちょうど LENGTH 秒の輪にする。 */
function fold(s) {
  const n = len(LENGTH);
  const out = { l: s.l.slice(0, n), r: s.r.slice(0, n) };
  for (let i = n; i < s.l.length; i++) {
    out.l[i - n] += s.l[i];
    out.r[i - n] += s.r[i];
  }
  return out;
}

/** 輪の信号に、直流取りと制限器を「輪のまま」掛けるための前後の糊しろ。 */
function circularPad(s, seconds) {
  const p = len(seconds);
  const n = s.l.length;
  const out = stereo(n + 2 * p);
  for (const ch of ['l', 'r']) {
    out[ch].set(s[ch].subarray(n - p), 0);
    out[ch].set(s[ch], p);
    out[ch].set(s[ch].subarray(0, p), p + n);
  }
  return out;
}

function stats(s) {
  return {
    lufs: round1(integratedLufs([s.l, s.r])),
    truePeakDb: round1(truePeakDb([s.l, s.r])),
    shortTermMax: round1(maxLoudness([s.l, s.r]).shortTermMax),
    bands: bandShares([s.l, s.r], SR, [60, 250, 2000, 8000]).map((v) => Math.round(v * 1000) / 1000),
  };
}

/** ファイルの中身の指紋（SHA-1）。tools/audio-render.mjs が、作業場所の WAV が今の曲のものかを確かめる */
const sha1 = (file) => createHash('sha1').update(readFileSync(file)).digest('hex');

/**
 * r06-audio：溜めの帯（arrange.mjs の HOLD）を、曲の本体と同じ層の倍率・同じ上限の制限器で仕上げ、塊（溜め4小節＋つなぎ1小節、前後に糊しろ）に切る。
 * 曲の本体の倍率と上限は変えない（溜めの帯は本体の後で決まる）。返すのは目録の music.hold と、段階ごとの音量・真のピーク。
 */
export function finishHold({ dry, send, irs, gains, ceiling, work, out }) {
  const n = dry[STEMS[0]].l.length;
  const stems = STEMS.map((name) => {
    const d = { l: dry[name].l.slice(), r: dry[name].r.slice() };
    const wl = convolve(send[name].l, irs.hall.l);
    const wr = convolve(send[name].r, irs.hall.r);
    for (let i = 0; i < n; i++) {
      d.l[i] += wl[i] * 0.55;
      d.r[i] += wr[i] * 0.55;
    }
    if (STEM_EQ[name]) for (const ch of [d.l, d.r]) filt(ch, STEM_EQ[name]);
    // 直流取りは帯の頭から（前置きの 57 小節の頭は、塊の頭より 17.5 秒前なので落ち着いている）
    dcBlock(d.l);
    dcBlock(d.r);
    return d;
  });
  const scaled = stems.map((s, k) => ({ l: s.l.map((v) => v * gains[k]), r: s.r.map((v) => v * gains[k]) }));
  const m12 = mixOf(scaled.slice(0, 2), [1, 1]);
  const m123 = mixOf(scaled, [1, 1, 1]);
  const g = limiterGain([scaled[0].l, scaled[0].r, m12.l, m12.r, m123.l, m123.r], { ceilingDb: ceiling, lookaheadMs: 5, releaseMs: 220 });
  const limited = scaled.map((s) => ({ l: s.l.map((v, i) => v * g[i]), r: s.r.map((v, i) => v * g[i]) }));
  const a = len(HOLD_CHUNK.from);
  const b = len(HOLD_CHUNK.to);
  const p = len(PAD);
  const chunks = {};
  const sha = {};
  STEMS.forEach((name, k) => {
    const rel = `music/${name}_hold`;
    const wav = path.join(work, `${rel}.wav`);
    writeWav(wav, [limited[k].l.subarray(a - p, b + p), limited[k].r.subarray(a - p, b + p)], SR);
    encodeOgg(wav, path.join(out, `${rel}.ogg`), 4);
    chunks[name] = `${rel}.ogg`;
    sha[name] = sha1(wav);
  });
  // 塊の中（溜め4小節＋つなぎ）の段階ごとの音量と真のピーク、小節ごとの音量（1回ごとに盛り上がっているか）
  const mixes = { calm: limited[0], rampage: mixOf(limited.slice(0, 2), [1, 1]), peak: mixOf(limited, [1, 1, 1]) };
  let minG = 1;
  for (let i = a; i < b; i++) minG = Math.min(minG, g[i]);
  const stages = Object.fromEntries(
    Object.entries(mixes).map(([k, m]) => {
      const seg = { l: m.l.subarray(a, b), r: m.r.subarray(a, b) };
      const perBar = Array.from({ length: HOLD.bars }, (_, j) => round1(integratedLufs([seg.l.subarray(len(j * BAR), len((j + 1) * BAR)), seg.r.subarray(len(j * BAR), len((j + 1) * BAR))])));
      return [k, { lufs: round1(integratedLufs([seg.l, seg.r])), truePeakDb: round1(truePeakDb([seg.l, seg.r])), perBarLufs: perBar }];
    }),
  );
  return { hold: { bars: HOLD.bars, holds: HOLD.holds, leadIn: HOLD.leadIn, seconds: HOLD.bars * BAR, splitBar: HOLD.splitBar, chunks }, sha, report: { limiterMaxGrDb: round1(-20 * Math.log10(minG)), stages } };
}

/**
 * パートの結果（{ stem, send, l, r }）を受け取るたびに add() で足し、最後に finish() で仕上げる。
 * r06-audio：溜めの帯のパートは addHold() で足す（無ければ溜めの塊は作らない）。
 */
export function createMixdown({ seed, work, out, irs }) {
  const n = len(LENGTH + TAIL);
  const dry = Object.fromEntries(STEMS.map((s) => [s, stereo(n)]));
  const send = Object.fromEntries(STEMS.map((s) => [s, stereo(n)]));
  const hn = len(HOLD_TIMELINE + 1);
  const holdDry = Object.fromEntries(STEMS.map((s) => [s, stereo(hn)]));
  const holdSend = Object.fromEntries(STEMS.map((s) => [s, stereo(hn)]));
  let holdParts = 0;
  const partNotes = {};
  return {
    addHold(r) {
      const d = holdDry[r.stem];
      const w = holdSend[r.stem];
      for (let i = 0; i < hn; i++) {
        d.l[i] += r.l[i];
        d.r[i] += r.r[i];
        w.l[i] += r.l[i] * r.send;
        w.r[i] += r.r[i] * r.send;
      }
      holdParts++;
    },
    add(r) {
      const d = dry[r.stem];
      const w = send[r.stem];
      for (let i = 0; i < n; i++) {
        d.l[i] += r.l[i];
        d.r[i] += r.r[i];
        w.l[i] += r.l[i] * r.send;
        w.r[i] += r.r[i] * r.send;
      }
      let e = 0;
      for (let i = 0; i < n; i += 4) e += r.l[i] * r.l[i] + r.r[i] * r.r[i];
      partNotes[r.part] = { stem: r.stem, notes: r.notes, rmsDb: round1(10 * Math.log10(e / (n / 2) + 1e-20)) };
    },
    finish() {
      // 残響（ホール）：送った分を畳み込んで足す
      const stems = STEMS.map((name) => {
        const d = dry[name];
        const wl = convolve(send[name].l, irs.hall.l);
        const wr = convolve(send[name].r, irs.hall.r);
        for (let i = 0; i < n; i++) {
          d.l[i] += wl[i] * 0.55;
          d.r[i] += wr[i] * 0.55;
        }
        if (STEM_EQ[name]) for (const ch of [d.l, d.r]) filt(ch, STEM_EQ[name]);
        return fold(d);
      });
      // 直流取り（輪の前後に糊しろを付けて、頭の立ち上がりを捨てる）
      const cleaned = stems.map((s) => {
        const p = circularPad(s, 2);
        dcBlock(p.l);
        dcBlock(p.r);
        const m = len(2);
        return { l: p.l.slice(m, m + s.l.length), r: p.r.slice(m, m + s.l.length) };
      });
      // 段階の音量を目標へ：静 → 静＋暴 → 静＋暴＋頂 の順に決める
      const model = mixLoudnessModel(cleaned);
      const gains = [1, 0, 0];
      gains[0] = solveGain(model, [1, 0, 0], 0, STAGE_TARGETS.calm);
      gains[1] = solveGain(model, [gains[0], 1, 0], 1, STAGE_TARGETS.rampage);
      gains[2] = solveGain(model, [gains[0], gains[1], 1], 2, STAGE_TARGETS.peak);
      const scaled = cleaned.map((s, k) => ({ l: s.l.map((v) => v * gains[k]), r: s.r.map((v) => v * gains[k]) }));
      // 共通の制限器：3つの混ぜ方のどれでも上限を超えないよう、一番厳しい倍率を全部の層に掛ける
      let ceiling = -1.9;
      let limited = scaled;
      let grDb = 0;
      let grStats = null;
      let mixes;
      for (let pass = 0; pass < 4; pass++) {
        const m1 = scaled[0];
        const m12 = mixOf(scaled.slice(0, 2), [1, 1]);
        const m123 = mixOf(scaled, [1, 1, 1]);
        const pads = [m1, m12, m123].map((m) => circularPad(m, 1));
        const g = limiterGain(pads.flatMap((p) => [p.l, p.r]), { ceilingDb: ceiling, lookaheadMs: 5, releaseMs: 220 });
        const off = len(1);
        let minG = 1;
        limited = scaled.map((s) => {
          const o = { l: new Float32Array(s.l.length), r: new Float32Array(s.l.length) };
          for (let i = 0; i < s.l.length; i++) {
            const gi = g[off + i];
            minG = Math.min(minG, gi);
            o.l[i] = s.l[i] * gi;
            o.r[i] = s.r[i] * gi;
          }
          return o;
        });
        grDb = -20 * Math.log10(minG);
        // 下げ幅の分布（大太鼓の頭だけで効いているのか、ずっと押さえているのか）
        const grs = [];
        for (let i = off; i < off + scaled[0].l.length; i += 480) grs.push(-20 * Math.log10(g[i]));
        grs.sort((a, b) => a - b);
        grStats = { p50: round1(grs[Math.floor(grs.length * 0.5)]), p99: round1(grs[Math.floor(grs.length * 0.99)]), overOneDbShare: Math.round((grs.filter((v) => v > 1).length / grs.length) * 1000) / 1000 };
        mixes = { calm: limited[0], rampage: mixOf(limited.slice(0, 2), [1, 1]), peak: mixOf(limited, [1, 1, 1]) };
        const worst = Math.max(...Object.values(mixes).map((m) => truePeakDb([m.l, m.r])));
        if (worst <= -1.5) break;
        ceiling -= worst + 1.5 + 0.1;
      }
      const stageStats = Object.fromEntries(Object.entries(mixes).map(([k, m]) => [k, stats(m)]));
      // 確かめ用に、段階ごとの混ぜ方（エンコード前）を作業場所へ書く
      mkdirSync(path.join(work, 'music'), { recursive: true });
      for (const [k, m] of Object.entries(mixes)) writeWav(path.join(work, 'music', `stage_${k}.wav`), [m.l, m.r], SR);
      // 4小節ごとに切る（前後に 0.1 秒の糊しろ。頭の塊の前の糊しろは曲の終わりから取る）
      mkdirSync(path.join(out, 'music'), { recursive: true });
      const chunkSec = CHUNK_BARS * BAR;
      const chunks = {};
      // r06-audio：塊の WAV（エンコード前）の指紋。tools/audio-render.mjs の継ぎ目の検査が、作業場所の WAV が今の曲のものかをこれで確かめる
      const sourceSha1 = {};
      STEMS.forEach((name, k) => {
        const padded = circularPad(limited[k], PAD);
        const p = len(PAD);
        chunks[name] = [];
        sourceSha1[name] = [];
        for (let c = 0; c < BARS / CHUNK_BARS; c++) {
          const a = len(c * chunkSec);
          const b = len((c + 1) * chunkSec) + 2 * p;
          const rel = `music/${name}_${String(c + 1).padStart(2, '0')}`;
          const wav = path.join(work, `${rel}.wav`);
          writeWav(wav, [padded.l.subarray(a, b), padded.r.subarray(a, b)], SR);
          // r02-audio：暴と頂に高い刻みを足したら、q3 では塊の継ぎ目の符号化の乱れがふつうの小節の頭より 1.9dB 大きくなった。3層とも q4
          encodeOgg(wav, path.join(out, `${rel}.ogg`), 4);
          chunks[name].push(`${rel}.ogg`);
          sourceSha1[name].push(sha1(wav));
        }
      });
      const held = holdParts > 0 ? finishHold({ dry: holdDry, send: holdSend, irs, gains, ceiling, work, out }) : null;
      // 段階が上がるときのつなぎ（1拍前から鳴らす）
      const fills = [];
      for (let v = 0; v < 3; v++) {
        const raw = renderFill(seed, v);
        const { audio, stats: st } = masterSfx(raw, { target: -13 });
        const rel = `music/fill_${v + 1}`;
        const wav = path.join(work, `${rel}.wav`);
        writeWav(wav, [audio.l, audio.r], SR);
        encodeOgg(wav, path.join(out, `${rel}.ogg`), 4);
        fills.push({ file: `${rel}.ogg`, ...st });
      }
      return {
        bpm: BPM,
        beatsPerBar: 4,
        bars: BARS,
        barSeconds: BAR,
        beatSeconds: BEAT,
        length: LENGTH,
        chunkBars: CHUNK_BARS,
        chunkSeconds: chunkSec,
        pad: PAD,
        stems: STEMS,
        chunks,
        fills: fills.map((f) => f.file),
        fillLead: BEAT,
        sections: SECTIONS.map((s) => ({ name: s.name, bar: s.from })),
        ...(held ? { hold: held.hold } : {}),
        sourceSha1: held ? { ...sourceSha1, hold: held.sha } : sourceSha1,
        report: {
          stemGainsDb: gains.map((g) => round1(20 * Math.log10(g))),
          limiterMaxGrDb: round1(grDb),
          limiterGr: grStats,
          limiterCeilingDb: round1(ceiling),
          stages: stageStats,
          parts: Object.fromEntries(Object.keys(PARTS).map((p) => [p, partNotes[p]])),
          fills,
          ...(held ? { hold: held.report } : {}),
        },
      };
    },
  };
}
