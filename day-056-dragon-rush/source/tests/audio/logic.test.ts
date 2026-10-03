// OWNER: tests
// 音の決まり（Web Audio を使わない部分）：同時に鳴る数と優先度、同じ変化を続けない散らし、BGM の段階の決め方、小節の頭の計算、空間の計算。
import { describe, expect, it } from 'vitest';
import { HEAVY_COLLAPSE_VOLUME, INTENSITY, INTENSITY_BY_MONSTER, LOW_DUCK, MONSTER_SOUNDS, MUSIC_END, RESULT_CUE, SOUNDS, SPACE, VOICES, intensityRules } from '../../src/config/audio';
import { IntensityDirector, nextBarTime } from '../../src/audio/intensity';
import { distanceDb, listenerFrom, place, reverbWeights } from '../../src/audio/spatial';
import { Variety } from '../../src/audio/variety';
import { ENVELOPE_STEP, VoiceAllocator, envelopeOf, stackGain, type Envelope } from '../../src/audio/voiceAllocator';
import { ClockRate, extensionFor, holdIndexFor, resultCue } from '../../src/audio/music';
import { lowDuckFor } from '../../src/audio/mixer';

describe('同時に鳴る数と優先度', () => {
  it('種類の上限を超えたら、一番小さい声を止めて大事な音を通す。小さい新しい音は鳴らさない', () => {
    const a = new VoiceAllocator(40, { ...VOICES.categories, collapse: { max: 2, priority: 80 } });
    const quiet = a.add('collapse', 0.1, 10);
    a.add('collapse', 0.8, 10);
    const loud = a.request('collapse', 0.9, 0);
    expect(loud.accept).toBe(true);
    expect(loud.steal).toBe(quiet);
    const tiny = a.request('collapse', 0.01, 0);
    expect(tiny.accept).toBe(false);
  });

  it('全体の上限でも、優先度の低い細かい音から譲る（咆哮は消えない）', () => {
    const a = new VoiceAllocator(3);
    a.add('glass', 1, 10);
    a.add('crack', 1, 10);
    const roarSlot = a.add('roar', 1, 10);
    const d = a.request('collapse', 1, 0);
    expect(d.accept).toBe(true);
    expect(d.steal).not.toBe(roarSlot);
  });

  it('鳴り終わった声は数えない', () => {
    const a = new VoiceAllocator(1);
    a.add('glass', 1, 0.5);
    expect(a.request('glass', 1, 1).steal).toBeNull();
  });

  // 素材の包絡：頭 dur 秒は 0dB、その後は 1 秒で 40dB 下がる（-20dB 点は dur + 0.5 秒）
  const env = (dur: number, total = 4): Envelope => {
    const db = Float32Array.from({ length: Math.ceil(total / ENVELOPE_STEP) }, (_, k) => {
      const t = k * ENVELOPE_STEP;
      return t < dur ? 0 : -40 * (t - dur);
    });
    let last = 0;
    db.forEach((v, k) => v > -20 && (last = k));
    return { db, tail20: (last + 1) * ENVELOPE_STEP };
  };

  it('r05-audio：上限では、最も古い余韻（素材の -20dB を過ぎた声）を絞って新しい頭を通す', () => {
    const a = new VoiceAllocator(40, { ...VOICES.categories, collapse: { max: 2, priority: 80 } });
    const e = env(1);
    const old = a.add('collapse', 1, 10, { start: 0, env: e });
    const newer = a.add('collapse', 1, 10, { start: 0.4, env: e });
    // 1.8 秒：古い方だけ -20dB を過ぎた（1.5 秒）。同じ大きさの新しい崩落は、古い余韻を譲ってもらって鳴る
    const d = a.request('collapse', 1, 1.8);
    expect(d.accept).toBe(true);
    expect(d.steal).toBe(old);
    expect(d.reason).toBe('tail');
    expect(a.stolenTails).toBe(1);
    // r04 までの決め方（鳴り始めの重みのまま）なら、同じ大きさの新しい音は鳴らなかった
    const r04 = new VoiceAllocator(40, { ...VOICES.categories, collapse: { max: 2, priority: 80 } });
    r04.add('collapse', 1, 10);
    r04.add('collapse', 1, 10);
    expect(r04.request('collapse', 1, 1.8).accept).toBe(false);
    expect(newer).not.toBe(old);
  });

  it('r05-audio：余韻が無ければ今の大きさで比べる。鳴り始めたばかりの大きな音は、小さい新しい音に押しのけられない', () => {
    const a = new VoiceAllocator(40, { ...VOICES.categories, step: { max: 2, priority: 62 } });
    const e = env(0.2, 2);
    a.add('step', 1, 5, { start: 0, env: e });
    a.add('step', 0.9, 5, { start: 0.1, env: e });
    expect(a.request('step', 0.5, 0.15).accept).toBe(false);
    // 0.45 秒：最初の足音は -10dB（まだ余韻ではない）。同じ大きさの新しい足音が、今の重みの小さい方を絞って鳴る
    const d = a.request('step', 1, 0.45);
    expect(d.accept).toBe(true);
    expect(d.reason).toBe('weaker');
  });

  it('r05-audio：重なりの数は「今の大きさ」の和なので、余韻ばかりのときに新しい頭を必要以上に小さくしない', () => {
    const a = new VoiceAllocator();
    const e = env(0.5, 6);
    for (let k = 0; k < 4; k++) a.add('collapse', 1, 6, { start: 0, env: e });
    expect(a.request('collapse', 1, 0.1).stack).toBeCloseTo(4, 5);
    expect(a.request('collapse', 1, 2.5).stack).toBeLessThan(0.1);
  });

  it('r05-audio：素材の包絡は、最大から -20dB を最後に下回った時刻を余韻の始まりにする', () => {
    const n = 48000;
    const x = Float32Array.from({ length: n }, (_, i) => Math.sin(i * 0.1) * (i < 12000 ? 1 : 0.01));
    const e = envelopeOf([x, x], 48000);
    expect(e.db[0]).toBeCloseTo(0, 0);
    expect(e.tail20).toBeCloseTo(0.25, 2);
  });

  it('同じ種類が重なるほど1つずつを小さくし、10棟の崩落の力の和が1棟の +6.5dB 以内に収まる', () => {
    expect(stackGain(0)).toBe(1);
    let power = 0;
    for (let k = 0; k < 10; k++) power += stackGain(k) ** 2;
    expect(10 * Math.log10(power)).toBeLessThan(6.5);
    expect(stackGain(9)).toBeLessThan(stackGain(1));
  });
});

describe('音の散らし', () => {
  it('同じ変化を2回続けて選ばない', () => {
    const v = new Variety();
    let prev = -1;
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const k = v.pick('building/collapseNear', 5);
      expect(k).not.toBe(prev);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(5);
      seen.add(k);
      prev = k;
    }
    expect(seen.size).toBe(5);
  });

  it('高さは ±range 半音、音量は ±range dB の中に散らす', () => {
    const v = new Variety();
    for (let i = 0; i < 500; i++) {
      expect(Math.abs(v.semis(1))).toBeLessThanOrEqual(1);
      expect(Math.abs(v.jitterDb(1.5))).toBeLessThanOrEqual(1.5);
    }
    expect(v.semis(0)).toBe(0);
  });

  it('高さの散らしは一様分布（外れの平均が幅の半分。三角分布なら3分の1）で、よく鳴る短い音は ±1.5 半音', () => {
    const v = new Variety();
    let sum = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) sum += Math.abs(v.semis(1.5));
    expect(sum / N).toBeGreaterThan(0.68);
    expect(sum / N).toBeLessThan(0.82);
    for (const id of ['stepFront', 'stepHind', 'flap', 'clawSwing', 'tailSwing', 'breathStart', 'fireIgnite'] as const) expect(SOUNDS[id].pitch, id).toBe(1.5);
  });
});

describe('BGM の段階（怒りと連鎖から）', () => {
  const base = { playing: true, rage: 0, rageFull: false, combo: 0 };

  it('連鎖が伸びると暴、怒りの満タンだけでは暴まで、連鎖が頂の数に届けば頂にすぐ上がる', () => {
    const d = new IntensityDirector(2.5);
    expect(d.update({ ...base, t: 0 })).toBe(0);
    expect(d.update({ ...base, t: 1, combo: INTENSITY.rampage.combo })).toBe(1);
    expect(d.update({ ...base, t: 2, rageFull: true })).toBe(1);
    expect(d.update({ ...base, t: 3, combo: INTENSITY.peak.combo - 1 })).toBe(1);
    expect(d.update({ ...base, t: 4, combo: INTENSITY.peak.combo })).toBe(2);
  });

  it('頂の条件は r01 より厳しい（連鎖 30・10秒に崩落 10棟）', () => {
    expect(INTENSITY.peak.combo).toBeGreaterThanOrEqual(30);
    expect(INTENSITY.peak.collapses).toBeGreaterThanOrEqual(10);
    const d = new IntensityDirector(2.5);
    for (let k = 0; k < INTENSITY.peak.collapses - 1; k++) d.onCollapse(10 + k * 0.5);
    expect(d.raw({ ...base, t: 15 })).toBe(1);
    d.onCollapse(15);
    expect(d.raw({ ...base, t: 15.1 })).toBe(2);
  });

  it('頂に maxPeakSeconds 居たら暴へ戻し、しばらくは条件だけでは戻らない。大技を出せばすぐ頂', () => {
    const d = new IntensityDirector(2.5);
    const hot = { ...base, combo: INTENSITY.peak.combo };
    expect(d.update({ ...hot, t: 0 })).toBe(2);
    expect(d.update({ ...hot, t: intensityRules('dragon').maxPeakSeconds - 0.1 })).toBe(2);
    expect(d.update({ ...hot, t: intensityRules('dragon').maxPeakSeconds + 0.1 })).toBe(1);
    expect(d.update({ ...hot, t: intensityRules('dragon').maxPeakSeconds + intensityRules('dragon').peakCooldownSeconds - 1 })).toBe(1);
    expect(d.update({ ...hot, t: intensityRules('dragon').maxPeakSeconds + intensityRules('dragon').peakCooldownSeconds + 0.5 })).toBe(2);
    // 冷ましている最中でも、大技は頂に上げる。ただし頂から下りた直後の peakLockBars 小節は待ち、ご褒美はそこから数える（r05-audio）
    const e = new IntensityDirector(2.5);
    e.update({ ...hot, t: 0 });
    e.update({ ...hot, t: intensityRules('dragon').maxPeakSeconds + 0.1 });
    e.onRelease(intensityRules('dragon').maxPeakSeconds + 1);
    const unlock = intensityRules('dragon').maxPeakSeconds + 0.1 + INTENSITY.peakLockBars * 2.5;
    expect(e.update({ ...hot, t: intensityRules('dragon').maxPeakSeconds + 1.1 })).toBe(1);
    expect(e.update({ ...hot, t: unlock + 0.1 })).toBe(2);
    expect(e.update({ ...hot, t: unlock + intensityRules('dragon').releaseHoldSeconds - 0.5 })).toBe(2);
  });

  it('r05-audio：頂から暴へ下りたら、peakLockBars 小節は大技が来ても頂へ戻さない（1小節だけ落ちて戻る揺れが起きない）', () => {
    const d = new IntensityDirector(2.5);
    d.onRelease(0);
    expect(d.update({ ...base, t: 0.1 })).toBe(2);
    // 大技の保持が切れ、暴の条件だけが残る → holdBars 小節ためらってから暴へ
    const down = intensityRules('dragon').releaseHoldSeconds + INTENSITY.holdBars * 2.5;
    d.update({ ...base, combo: INTENSITY.rampage.combo, t: intensityRules('dragon').releaseHoldSeconds + 0.1 });
    expect(d.update({ ...base, combo: INTENSITY.rampage.combo, t: down + 0.2 })).toBe(1);
    // すぐ次の大技：4小節（10秒）は暴のまま、その後に頂
    d.onRelease(down + 0.5);
    for (let t = down + 0.6; t < down + 0.2 + INTENSITY.peakLockBars * 2.5 - 0.05; t += 0.5) expect(d.update({ ...base, combo: INTENSITY.rampage.combo, t })).toBe(1);
    expect(d.update({ ...base, combo: INTENSITY.rampage.combo, t: down + 0.2 + INTENSITY.peakLockBars * 2.5 + 0.1 })).toBe(2);
  });

  it('r05-audio：頂の条件は怪獣ごと。雷翼は連鎖が伸びやすいので、紅竜の頂の連鎖では頂に上げない', () => {
    for (const m of Object.keys(MONSTER_SOUNDS)) expect(INTENSITY_BY_MONSTER[m], m).toBeDefined();
    expect(intensityRules('raiyoku').peak.combo).toBeGreaterThan(intensityRules('dragon').peak.combo);
    expect(intensityRules('知らない怪獣')).toBe(intensityRules('dragon'));
    const dragon = new IntensityDirector(2.5);
    const rai = new IntensityDirector(2.5);
    rai.setMonster('raiyoku');
    const c = intensityRules('dragon').peak.combo;
    expect(dragon.raw({ ...base, t: 1, combo: c })).toBe(2);
    expect(rai.raw({ ...base, t: 1, combo: c })).toBe(1);
    expect(rai.raw({ ...base, t: 1, combo: intensityRules('raiyoku').peak.combo })).toBe(2);
  });

  it('r06-audio：焔角の大技の後の保持は 8 秒（12→8）・頂の崩落の条件は 12 棟・連鎖は 90（3分の最大 86 より上）・続けて頂に居るのは 16 秒まで。紅竜と雷翼は前のまま', () => {
    expect(intensityRules('homuratsuno').releaseHoldSeconds).toBe(8);
    expect(intensityRules('homuratsuno').peak.collapses).toBe(12);
    expect(intensityRules('homuratsuno').peak.combo).toBeGreaterThan(86);
    expect(intensityRules('homuratsuno').maxPeakSeconds).toBe(16);
    expect(intensityRules('raiyoku').peak.collapses).toBe(20);
    expect(intensityRules('dragon').peak.collapses).toBe(INTENSITY.peak.collapses);
    expect(intensityRules('dragon').releaseHoldSeconds).toBe(15);
    expect(intensityRules('raiyoku').releaseHoldSeconds).toBe(7);
    const d = new IntensityDirector(2.5);
    d.setMonster('homuratsuno');
    const rampageish = { ...base, combo: INTENSITY.rampage.combo };
    d.onRelease(10);
    let peakFor = 0;
    for (let t = 10; t < 40; t += 0.1) if (d.update({ ...rampageish, t }) === 2) peakFor += 0.1;
    expect(peakFor).toBeGreaterThan(8 + INTENSITY.holdBars * 2.5 - 0.3);
    expect(peakFor).toBeLessThan(8 + INTENSITY.holdBars * 2.5 + 0.3);
    // 連鎖 86（自動プレイの3分の最大）では頂に上げない
    const e = new IntensityDirector(2.5);
    e.setMonster('homuratsuno');
    expect(e.raw({ ...base, t: 1, combo: 86 })).toBe(1);
  });

  it('下がるのは、下の条件が holdBars 小節続いてから1段ずつ', () => {
    const d = new IntensityDirector(2.5);
    d.update({ ...base, t: 0, combo: INTENSITY.peak.combo });
    const hold = INTENSITY.holdBars * 2.5;
    expect(d.update({ ...base, t: 1 })).toBe(2);
    expect(d.update({ ...base, t: 1 + hold - 0.1 })).toBe(2);
    expect(d.update({ ...base, t: 1 + hold })).toBe(1);
    expect(d.update({ ...base, t: 1 + hold + 0.5 })).toBe(1);
    expect(d.update({ ...base, t: 1 + 2 * hold })).toBe(0);
  });

  it('大技のあとは releaseHoldSeconds のあいだ頂を保ち、崩落が続くと盛り上がる', () => {
    const d = new IntensityDirector(2.5);
    d.onRelease(10);
    expect(d.raw({ ...base, t: 11 })).toBe(2);
    expect(d.raw({ ...base, t: 10 + intensityRules('dragon').releaseHoldSeconds + 0.1 })).toBe(0);
    for (let k = 0; k < INTENSITY.rampage.collapses; k++) d.onCollapse(30 + k);
    expect(d.raw({ ...base, t: 31.5 })).toBe(1);
    expect(d.raw({ ...base, t: 31.5, playing: false })).toBe(0);
  });

  it('切り替えは次の小節の頭（2.5 秒ごと）', () => {
    expect(nextBarTime(0, 0.1, 2.5)).toBe(2.5);
    expect(nextBarTime(10, 12.4, 2.5)).toBe(12.5);
    expect(nextBarTime(10, 12.47, 2.5, 0.05)).toBe(15);
    expect(nextBarTime(10, 9, 2.5)).toBe(10);
  });
});

describe('r05-audio：曲の終わりを時間切れに合わせる', () => {
  it('足す長さ：時間切れの見込みと最後の大太鼓の差を拍に丸め、小節と端数の拍に分ける', () => {
    const at = (untilEnd: number, untilFinal: number) => extensionFor({ untilEnd, untilFinal, barSeconds: 2.5, beatSeconds: 0.625 });
    // 遊びの時計が 3分で約 5秒遅れ、71 小節の頭（175秒）は時間切れより約 10.2 秒早い → 4小節と0拍（10秒、残りのずれ 0.2 秒）
    expect(at(30.2, 20)).toEqual({ bars: 4, beats: 0 });
    // 8.1 秒の差 → 13 拍＝3小節と1拍（8.125 秒。大太鼓は見込みから 0.025 秒）
    expect(at(28.1, 20)).toEqual({ bars: 3, beats: 1 });
    // 半拍（0.31 秒）より小さい差は足さない
    expect(at(20.3, 20)).toEqual({ bars: 0, beats: 0 });
    // 曲のほうが遅れている（時間切れが先）ときは足さない（時間切れで最後の小節へ跳ぶ）・上限で止める
    expect(at(10, 20)).toEqual({ bars: 0, beats: 0 });
    expect(at(200, 20)).toEqual({ bars: MUSIC_END.maxExtraBars, beats: 0 });
    // どの差でも、足した後の大太鼓は見込みから半拍以内
    for (let d = 0; d < 19.5; d += 0.13) {
      const e = at(20 + d, 20);
      expect(Math.abs(d - (e.bars * 2.5 + e.beats * 0.625))).toBeLessThanOrEqual(0.3125 + 1e-9);
    }
  });

  it('遊びの時計の速さを最近の窓で測る（ヒットストップで 1 より小さい・一時停止で測り直す）', () => {
    const r = new ClockRate(40);
    expect(r.rate).toBe(1);
    for (let t = 0; t <= 60; t += 0.5) r.add(t, t * 0.97, true);
    expect(r.rate).toBeCloseTo(0.97, 3);
    r.add(61, 59, false);
    expect(r.rate).toBe(1);
  });
});

describe('r06-audio：時間切れの結果の音と、足す小節の選び方', () => {
  const end = (finalAt: number | null, drum = true) => ({ sessionEndAt: 100, finalAt, extensionBars: 3.25, cut: false, skippedSeconds: 0, drum });

  it('曲が最後の大太鼓の時刻を持っていれば、銅鑼だけをその時刻に鳴らす（先なら待ち、少し過ぎていればすぐ）', () => {
    expect(resultCue(100, end(100.3))).toEqual({ kind: 'gong', at: 100.3 });
    expect(resultCue(100, end(100.06))).toEqual({ kind: 'gong', at: 100.06 });
    expect(resultCue(100, end(99.8))).toEqual({ kind: 'gong', at: 100 });
    // 跳んだとき（最後の大太鼓を時間切れの 0.06 秒後に鳴らす）も、大太鼓を鳴らせたなら銅鑼だけ
    expect(resultCue(100, { ...end(100.06), cut: true })).toEqual({ kind: 'gong', at: 100.06 });
  });

  it('曲が合わせられないとき（止まっている・一時停止中・大太鼓を並べられなかった・大太鼓が遠い）だけ、銅鑼と大太鼓2打をすぐ鳴らす', () => {
    expect(resultCue(100, null)).toEqual({ kind: 'full', at: 100 });
    expect(resultCue(100, end(null))).toEqual({ kind: 'full', at: 100 });
    expect(resultCue(100, end(100.1, false))).toEqual({ kind: 'full', at: 100 });
    expect(resultCue(100, end(100 + RESULT_CUE.maxWaitSeconds + 0.01))).toEqual({ kind: 'full', at: 100 });
    expect(resultCue(100, end(100 - RESULT_CUE.maxLateSeconds - 0.01))).toEqual({ kind: 'full', at: 100 });
    // 曲は大太鼓が cutThreshold より先なら跳ぶので、待つのは最大でもその長さ（待ちの上限より短い）
    expect(MUSIC_END.cutThresholdSeconds).toBeLessThanOrEqual(RESULT_CUE.maxWaitSeconds);
  });

  it('足す小節は溜めの小節を頭から順に使い、足りなければ最後の2つを交互に（同じ小節を続けない）', () => {
    expect(Array.from({ length: 8 }, (_, k) => holdIndexFor(k, 4))).toEqual([0, 1, 2, 3, 2, 3, 2, 3]);
    for (let k = 1; k < 8; k++) expect(holdIndexFor(k, 4)).not.toBe(holdIndexFor(k - 1, 4));
    expect(holdIndexFor(5, 1)).toBe(0);
  });
});

describe('r06-audio：曲の低い帯を引くのは本当に重い瞬間だけ', () => {
  it('とても大きな近い崩落だけ（全帯域の引きの大きさより厳しい）。それより小さい崩落・遠い崩落では引かない', () => {
    expect(LOW_DUCK.collapseMinVolume).toBeGreaterThan(HEAVY_COLLAPSE_VOLUME);
    expect(lowDuckFor({ kind: 'collapse', near: true, volume: LOW_DUCK.collapseMinVolume + 1 })).toBe('collapse');
    expect(lowDuckFor({ kind: 'collapse', near: true, volume: LOW_DUCK.collapseMinVolume })).toBeNull();
    // 全帯域の引きは掛かる大きさ（20000m³ を越える）でも、低い帯は引かない
    expect(lowDuckFor({ kind: 'collapse', near: true, volume: HEAVY_COLLAPSE_VOLUME + 1 })).toBeNull();
    expect(lowDuckFor({ kind: 'collapse', near: false, volume: 200000 })).toBeNull();
  });

  it('着地は怒りの急降下だけ。ふつうの重い着地（急降下・のしかかり）では引かない。咆哮と地割れは引く', () => {
    expect(lowDuckFor({ kind: 'land', heavy: true, rageDive: true })).toBe('rageDive');
    expect(lowDuckFor({ kind: 'land', heavy: true, rageDive: false })).toBeNull();
    expect(lowDuckFor({ kind: 'land', heavy: false, rageDive: false })).toBeNull();
    expect(lowDuckFor({ kind: 'roar' })).toBe('roar');
    expect(lowDuckFor({ kind: 'fissure' })).toBe('fissure');
  });

  it('崩落の引きは保持を短く（2.6→1.2 秒以下）、戻りを長く（1.5→3 秒以上）', () => {
    expect(LOW_DUCK.kinds.collapse.hold).toBeLessThanOrEqual(1.2);
    for (const k of Object.values(LOW_DUCK.kinds)) expect(k.release).toBeGreaterThanOrEqual(3);
  });
});

describe('空間', () => {
  // カメラは原点から (0, 20, 60) に、右向き +x
  const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 20, 60, 1];
  const L = listenerFrom(matrix, [0, 10, 0]);

  it('遠いほど小さく、高域が落ち、遠い街の音だけ距離÷音速だけ遅れる', () => {
    const near = place([0, 10, -30], L, 'world');
    const far = place([0, 10, -700], L, 'world');
    expect(near.gain).toBeGreaterThan(far.gain);
    expect(far.lowpassHz).toBeLessThan(near.lowpassHz);
    expect(near.delay).toBe(0);
    expect(far.delay).toBeCloseTo(far.distance / SPACE.speedOfSound, 5);
    expect(place([0, 10, -700], L, 'self').delay).toBe(0);
  });

  it('遠くなるほど、残響を含めた大きさも下がり続ける（遠い残響が直接音の減りを打ち消さない）', () => {
    const total = (d: number): number => {
      const p = place([0, 10, -d], L, 'world', 2.2);
      return p.gain * (1 + p.sends[0] + p.sends[1] + p.sends[2]);
    };
    expect(total(900)).toBeLessThan(total(400) * 0.7);
    expect(total(400)).toBeLessThan(total(150));
  });

  it('右にある音は右へ、左は左へ定位し、近い大きな音ほど中央へ寄る', () => {
    expect(place([300, 10, 0], L, 'world').pan).toBeGreaterThan(0.5);
    expect(place([-300, 10, 0], L, 'world').pan).toBeLessThan(-0.5);
    expect(Math.abs(place([20, 10, 0], L, 'world', 2).pan)).toBeLessThan(Math.abs(place([300, 10, 0], L, 'world', 2).pan));
  });

  it('距離の減衰は基準距離まで 0dB、その先は倍ごとに -6dB、下限で止まる', () => {
    expect(distanceDb(10, 45)).toBe(0);
    expect(distanceDb(90, 45)).toBeCloseTo(-6.02, 1);
    expect(distanceDb(1e7, 45)).toBe(SPACE.minDb);
  });

  it('残響は近い音ほど「近」、遠い音ほど「遠」の響きへ送る（割合の和は 1）', () => {
    for (const d of [10, 150, 300, 600, 2000]) {
      const w = reverbWeights(d);
      expect(w[0] + w[1] + w[2]).toBeCloseTo(1, 6);
    }
    expect(reverbWeights(20)[0]).toBe(1);
    expect(reverbWeights(1500)[2]).toBe(1);
  });

  it('UI の音は空間を通さない', () => {
    const p = place([100, 0, 100], L, 'ui');
    expect(p.gain).toBe(1);
    expect(p.pan).toBe(0);
    expect(p.sends).toEqual([0, 0, 0]);
  });
});
