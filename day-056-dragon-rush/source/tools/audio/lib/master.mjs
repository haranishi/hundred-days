// OWNER: audio-tools
// 効果音の仕上げ：直流を取る → 瞬時の音量（400ms の最大）を種類ごとの目標に合わせる → 先読みの制限器で上限を守る
// → 後ろの無音を切り、端を丸める。仕上げの数値（音量・ピーク・余韻の長さ）を目録に書くために返す。
import { SR, dcBlock, filt } from './dsp.mjs';
import { bandShares } from './fft.mjs';
import { limitInPlace } from './limit.mjs';
import { maxLoudness, onsetSeconds, samplePeakDb, tailSeconds, truePeakDb } from './loudness.mjs';

/**
 * s は { l, r }。target は瞬時の最大の音量（LUFS）、ceilingDb は標本の上限。
 * 立ち上がりの鋭い音（衝撃）は、目標どおりに上げると制限器で潰れて手応えが消えるので、下げ幅を maxGrDb までに抑え、足りない分は音量の方を下げる。
 * 真のピークが tpMax を超えたら上限を下げてやり直す。長い余韻は -66dB まで残して切る。
 */
export function masterSfx(s, { target, ceilingDb = -2.2, maxGrDb = 2.5, tpMax = -1.6, releaseMs = 90, keepTail = true, loop = false }) {
  // 繰り返しの音は、フィルターの立ち上がりで頭が変わると継ぎ目がずれるので、直流取りは作る側で済ませておく
  if (!loop) {
    dcBlock(s.l);
    dcBlock(s.r);
    // 聞こえない 28Hz 未満（余裕を食うだけ）と、標本の間の山を作る 17kHz より上を落としてから大きさを決める
    for (const ch of [s.l, s.r]) filt(ch, [['hp', 28, 0.7], ['lp', 17000, 0.7]]);
  }
  const before = maxLoudness([s.l, s.r]).momentaryMax;
  const peak = samplePeakDb([s.l, s.r]);
  let gDb = target - before;
  const over = peak + gDb - ceilingDb;
  if (over > maxGrDb) gDb -= over - maxGrDb;
  let ceil = ceilingDb;
  let work;
  let grDb = 0;
  // r02-audio：制限器で山を下げると音量も少し下がり、目標に 1〜2dB 届かなかった（ひび・剥がれ・崩落）。
  // 下げ幅の予算（maxGrDb）が残っている間は、足りない分だけ上げて掛け直す（最大3回）
  for (let round = 0; round < 3; round++) {
    ceil = ceilingDb;
    for (let pass = 0; pass < 4; pass++) {
      const g = 10 ** (gDb / 20);
      work = { l: s.l.map((v) => v * g), r: s.r.map((v) => v * g) };
      grDb = limitInPlace([work.l, work.r], { ceilingDb: ceil, lookaheadMs: 2.5, releaseMs, truePeak: true });
      const tp = truePeakDb([work.l, work.r]);
      if (tp <= tpMax) break;
      ceil -= tp - tpMax + 0.05;
    }
    const short = target - maxLoudness([work.l, work.r]).momentaryMax;
    const room = maxGrDb - (peak + gDb - ceilingDb);
    if (short < 0.25 || room <= 0.1) break;
    gDb += Math.min(short, room);
  }
  let out = work;
  if (!loop && keepTail) {
    const end = Math.min(work.l.length, Math.ceil((tailSeconds([work.l, work.r], -66) + 0.05) * SR));
    out = { l: work.l.slice(0, end), r: work.r.slice(0, end) };
    const fade = Math.min(end, Math.round(0.04 * SR));
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      out.l[end - 1 - i] *= k;
      out.r[end - 1 - i] *= k;
    }
  }
  const m = maxLoudness([out.l, out.r]);
  return {
    audio: out,
    stats: {
      seconds: Math.round((out.l.length / SR) * 1000) / 1000,
      momentaryMax: round1(m.momentaryMax),
      shortTermMax: round1(m.shortTermMax),
      samplePeakDb: round1(samplePeakDb([out.l, out.r])),
      truePeakDb: round1(truePeakDb([out.l, out.r])),
      limiterGrDb: round1(grDb),
      onsetMs: Math.round(onsetSeconds([out.l, out.r]) * 10000) / 10,
      tailSeconds: Math.round(tailSeconds([out.l, out.r]) * 100) / 100,
      /** 帯域の比率：<60Hz・60〜250・250〜2k・2k〜8k・8k< */
      bands: bandShares([out.l, out.r], SR, [60, 250, 2000, 8000], 4096).map((v) => Math.round(v * 1000) / 1000),
    },
  };
}

export const round1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : x);

/**
 * 繰り返し用の継ぎ目：長めに作った音の終わり fade 秒を頭へ等パワーで重ね、ちょうど seconds 秒の輪にする。
 * 終わりと頭の標本が同じ流れの続きになるので、段差もプチ音も出ない。
 */
export function makeLoop(s, seconds, fade) {
  const n = Math.round(seconds * SR);
  const f = Math.round(fade * SR);
  const out = { l: s.l.slice(0, n), r: s.r.slice(0, n) };
  for (const ch of ['l', 'r']) {
    for (let i = 0; i < f; i++) {
      const u = i / f;
      const a = Math.sin((u * Math.PI) / 2);
      const b = Math.cos((u * Math.PI) / 2);
      out[ch][i] = s[ch][i] * a + s[ch][n + i] * b;
    }
  }
  return out;
}
