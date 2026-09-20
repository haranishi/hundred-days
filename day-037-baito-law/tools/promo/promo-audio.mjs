/* プロモ動画の BGM。外部パッケージも外部音源も使わず、固定シードの純JSで合成する。
   同じ入力なら必ず同じ WAV になる（render-promo.mjs が再生成しても画と音がずれない）。

   render-promo.mjs は wav が無ければこのスクリプトを「--variant a で」実行するので、
   既定（--variant a）は必ず同じフォルダへ promo-audio.wav を 34.000秒 / 48kHz / 16bit / stereo で書く。

   使い方:
     node promo-audio.mjs                        A案（ローファイ鍵盤）を promo-audio.wav へ
     node promo-audio.mjs --variant b            B案（アコースティック寄り）を promo-audio.wav へ
     node promo-audio.mjs --variant b --out /abs/path.wav   聴き比べ用に別名で書き出す */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DURATION_SECONDS, RESULT_START, STORYBOARD, TAPS, T_CONFIRM_TAP } from './timeline.mjs';

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const BITS_PER_SAMPLE = 16;
const FRAME_COUNT = SAMPLE_RATE * DURATION_SECONDS;
const TAU = Math.PI * 2;
const here = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const argValue = (name, fallback) => {
  const at = argv.indexOf(name);
  const next = at >= 0 ? argv[at + 1] : undefined;
  return next && !next.startsWith('--') ? next : fallback;
};
const VARIANT = argValue('--variant', 'a').toLowerCase();
if (VARIANT !== 'a' && VARIANT !== 'b') {
  console.error('--variant は a（ローファイ鍵盤）か b（アコースティック寄り）だけです。');
  process.exit(1);
}
const out = resolve(here, argValue('--out', 'promo-audio.wav'));

/* 音量はピークでなく RMS で合わせる。ピーク基準だと音を1つ足しただけで正規化の倍率が動き、
   統合ラウドネスが数dB変わる（Day 029 で -17 → -14.3 LUFS になった）。
   ここの値は ffmpeg の loudnorm を実測して案ごとに決めてある。 */
const TARGET_RMS = 10 ** ((VARIANT === 'a' ? -18.9 : -19.2) / 20);
const PEAK_CEILING = 10 ** (-1.5 / 20);   // ここを超えるならピーク基準へ切り替える

// ── 拍と場面 ──────────────────────────────────────────────────────────────
const BPM = 92;
const BEAT = 60 / BPM;              // 0.6522秒
const BAR = BEAT * 4;               // 2.6087秒（36秒 ≈ 13.8小節）
const SWING = 0.58;                 // 8分の跳ね。表拍が1拍の58%を取る

const sceneStart = (id) => STORYBOARD.find((scene) => scene.id === id)?.start ?? 0;
/* 場面の切れ目は拍に丸める。丸めのずれは最大 0.33 秒＝画とはずれて聞こえないが、
   小節の途中で編成が変わると「切り貼り」に聞こえるので、音側は必ず拍に乗せる。 */
const onBeat = (seconds) => Math.round(seconds / BEAT) * BEAT;
/* 音色・音列・合成処理は Day 033 のまま。役割名を今日の場面に合わせる。 */
const SECTION = {
  title: onBeat(sceneStart('S1')),
  ruby: onBeat(sceneStart('S2')),
  actor: onBeat(sceneStart('S3')),
  otherlaw: onBeat(sceneStart('S4')),
  confirm: onBeat(T_CONFIRM_TAP),
  source: onBeat(sceneStart('S5')),
  promise: onBeat(sceneStart('S6')),
  end: onBeat(sceneStart('S7'))
};

/* F メジャーの I–V–vi–IV を1小節ずつ。pad は中音域で濁らせないボイシング、
   arp は1オクターブ上の和音構成音、bass はルート。数値は MIDI ノート番号。 */
const PROGRESSION = [
  { name: 'Fmaj7',  pad: [53, 57, 60, 64], arp: [65, 69, 72, 76], bass: 41 },
  { name: 'C/E',    pad: [52, 55, 60, 64], arp: [64, 67, 72, 76], bass: 40 },
  { name: 'Dm7',    pad: [50, 57, 60, 65], arp: [62, 65, 69, 72], bass: 38 },
  { name: 'Bbmaj7', pad: [53, 57, 62, 65], arp: [65, 69, 74, 77], bass: 46 }
];
// 2小節でひとまとまりの主旋律。[小節頭からの拍, MIDI, 長さ(拍)]
const MOTIF_A = [[0, 69, 1.5], [1.5, 72, .5], [2, 74, 2], [4, 72, 1.5], [5.5, 67, 2.5]];
const MOTIF_B = [[0, 74, 1.5], [1.5, 72, .5], [2, 69, 2], [4, 65, 1.5], [5.5, 74, 2.5]];

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// ── 土台 ──────────────────────────────────────────────────────────────────
const makeBus = () => ({ l: new Float32Array(FRAME_COUNT), r: new Float32Array(FRAME_COUNT) });
const pad = makeBus();      // 持続音
const piano = makeBus();     // 鍵盤（アルペジオ＋主旋律）
const bass = makeBus();
const drums = makeBus();    // キック・ハット・シェイカー
const snare = makeBus();    // 残響を掛けたいので別バス
const sfx = makeBus();      // タップ・チャイム・ファンファーレ

function randomFactory(seed = 0x310907) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}
const random = randomFactory();

const panGains = (pan) => [Math.cos((pan + 1) * Math.PI / 4), Math.sin((pan + 1) * Math.PI / 4)];
const triangle = (phase) => {
  const cycle = phase / TAU;
  return 2 * Math.abs(2 * (cycle - Math.floor(cycle + .5))) - 1;
};
const sawtooth = (phase) => {
  const cycle = phase / TAU;
  return 2 * (cycle - Math.floor(cycle + .5));
};

/** 立ち上がりと終わりを sin で丸めた持続用エンベロープ */
function swellEnvelope(time, duration, attack, release) {
  if (time < 0 || time >= duration) return 0;
  const rise = Math.min(1, time / Math.max(attack, 1e-4));
  const fall = Math.min(1, (duration - time) / Math.max(release, 1e-4));
  return Math.sin(rise * Math.PI / 2) * Math.sin(fall * Math.PI / 2);
}

/** 撥弦・打鍵用。立ち上がりは指数、減衰は時定数 tau、最後の 60ms だけ滑らかに切る */
function pluckEnvelope(time, duration, attack, tau) {
  if (time < 0 || time >= duration) return 0;
  return (1 - Math.exp(-time / Math.max(attack, 1e-4)))
    * Math.exp(-time / tau)
    * Math.min(1, (duration - time) / .06);
}

/** バスへ1サンプル足す。区間の外は呼ばない前提 */
function spread(bus, index, sample, leftGain, rightGain) {
  bus.l[index] += sample * leftGain;
  bus.r[index] += sample * rightGain;
}
const firstFrame = (start) => Math.max(0, Math.floor(start * SAMPLE_RATE));
const lastFrame = (start, duration) => Math.min(FRAME_COUNT, Math.ceil((start + duration) * SAMPLE_RATE));

// ── 音色 ──────────────────────────────────────────────────────────────────

/** パッド：3声のデチューンした鋸／三角。ローパスはあとでバス全体に掛ける */
function addPad({ start, duration, midi, gain, pan, attack = .35, release = .9 }) {
  const [leftGain, rightGain] = panGains(pan);
  const base = hz(midi);
  const detunes = [-6.5, 0, 7.5];   // セント
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    let wave = 0;
    for (const [voice, cents] of detunes.entries()) {
      const phase = TAU * base * 2 ** (cents / 1200) * time + voice * 1.7;
      wave += sawtooth(phase) * .34 + triangle(phase) * .28;
    }
    const sample = wave / 3 * swellEnvelope(time, duration, attack, release) * gain;
    spread(pad, index, sample, leftGain, rightGain);
  }
}

/** A案の鍵盤：2オペレータの FM（比 1:1・インデックスが減衰）でエレピ風 */
function addElectricPiano({ start, duration, midi, gain, pan, index0 = 2.7, tauMod = .12, tauAmp = .85 }) {
  const [leftGain, rightGain] = panGains(pan);
  const frequency = hz(midi);
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    const carrier = TAU * frequency * time;
    const modulation = Math.sin(carrier) * index0 * Math.exp(-time / tauMod);
    const tine = Math.sin(carrier * 6) * .13 * Math.exp(-time / .045);  // 打鍵の芯（高域用に強く・明るく）
    const sample = (Math.sin(carrier + modulation) + tine)
      * pluckEnvelope(time, duration, .004, tauAmp) * gain;
    spread(piano, index, sample, leftGain, rightGain);
  }
}

/** B案の鍵盤：カープラス・ストロングの弦（ギター／カリンバ風） */
function addPluckedString({ start, duration, midi, gain, pan, tau = 1.3, brightness = .52 }) {
  const [leftGain, rightGain] = panGains(pan);
  const frequency = hz(midi);
  const size = Math.max(2, Math.round(SAMPLE_RATE / frequency));
  const line = new Float32Array(size);
  let smooth = 0;
  for (let i = 0; i < size; i += 1) {
    smooth += ((random() * 2 - 1) - smooth) * brightness;   // 弾いた瞬間の雑音を丸める
    line[i] = smooth;
  }
  const feedback = Math.exp(-1 / (frequency * tau));
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  let cursor = 0;
  let previous = 0;
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    const value = line[cursor];
    line[cursor] = (value + previous) * .5 * feedback;
    previous = value;
    cursor = (cursor + 1) % size;
    const sample = value * Math.min(1, time / .002) * Math.min(1, (duration - time) / .08) * gain;
    spread(piano, index, sample, leftGain, rightGain);
  }
}

const addPiano = (options) => (VARIANT === 'a' ? addElectricPiano(options) : addPluckedString(options));

/** ベース：正弦＋少しの三角。頭に短いスライドを付け、ローパスで丸める */
function addBass({ start, duration, midi, gain, slideFrom = 0 }) {
  const target = hz(midi);
  const from = slideFrom ? hz(midi + slideFrom) : target;
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  let phase = 0;
  let lowpass = 0;
  const alpha = 1 - Math.exp(-TAU * 320 / SAMPLE_RATE);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    const glide = Math.min(1, time / .07);
    const frequency = from + (target - from) * (glide * glide);
    phase += TAU * frequency / SAMPLE_RATE;
    const wave = Math.sin(phase) * .88 + triangle(phase) * .12;
    lowpass += (wave - lowpass) * alpha;
    const sample = lowpass * pluckEnvelope(time, duration, .008, .42) * gain;
    bass.l[index] += sample; bass.r[index] += sample;
  }
}

/** キック：正弦の 55→40Hz ピッチダウン＋クリック */
function addKick({ start, gain }) {
  const duration = .42;
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  let phase = 0;
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    const frequency = 40 + 15 * Math.exp(-time / .035);
    phase += TAU * frequency / SAMPLE_RATE;
    const body = Math.sin(phase) * Math.exp(-time / .105);
    const punch = Math.sin(phase * 2) * .22 * Math.exp(-time / .028);
    const click = Math.sin(TAU * 1350 * time) * .1 * Math.exp(-time / .003);
    const sample = (body + punch + click) * Math.min(1, time / .0015) * gain;
    drums.l[index] += sample; drums.r[index] += sample;
  }
}

/** ハット：ハイパスしたノイズ。open で少し伸ばす */
function addHat({ start, gain, open = false, pan = .12 }) {
  const [leftGain, rightGain] = panGains(pan);
  const duration = open ? .22 : .07;
  const tau = open ? .085 : .017;
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  let lowpass = 0;
  const alpha = 1 - Math.exp(-TAU * 7200 / SAMPLE_RATE);   // 高域が暗すぎたため 6200→7200Hz
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    const noise = random() * 2 - 1;
    lowpass += (noise - lowpass) * alpha;
    const sample = (noise - lowpass) * Math.exp(-time / tau) * gain;
    spread(drums, index, sample, leftGain, rightGain);
  }
}

/** スネア／クラップ：バンドパスのノイズ＋薄い胴鳴り。2・4拍に小さく */
function addSnare({ start, gain, brush = false }) {
  const duration = brush ? .3 : .22;
  const tau = brush ? .1 : .055;
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  let low = 0;
  let high = 0;
  const alphaLow = 1 - Math.exp(-TAU * (brush ? 5200 : 3400) / SAMPLE_RATE);
  const alphaHigh = 1 - Math.exp(-TAU * (brush ? 700 : 320) / SAMPLE_RATE);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    const noise = random() * 2 - 1;
    low += (noise - low) * alphaLow;
    high += (low - high) * alphaHigh;
    const band = low - high;
    const shell = brush ? 0 : Math.sin(TAU * 188 * time) * .3 * Math.exp(-time / .045);
    const attack = brush ? Math.min(1, time / .012) : 1;
    const sample = (band + shell) * Math.exp(-time / tau) * attack * gain;
    snare.l[index] += sample * .96; snare.r[index] += sample * 1.04;
  }
}

/** シェイカー：裏拍の短いノイズ */
function addShaker({ start, gain, pan = -.22 }) {
  const [leftGain, rightGain] = panGains(pan);
  const duration = .05;
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  let lowpass = 0;
  const alpha = 1 - Math.exp(-TAU * 5600 / SAMPLE_RATE);   // 高域が暗すぎたため 4800→5600Hz
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    const noise = random() * 2 - 1;
    lowpass += (noise - lowpass) * alpha;
    const sample = (noise - lowpass) * Math.exp(-time / .011) * Math.min(1, time / .004) * gain;
    spread(drums, index, sample, leftGain, rightGain);
  }
}

/** 効果音の単音（正解チャイム・ファンファーレ）。曲と同じ調・同じ手触りにする */
function addChime({ start, duration, midi, gain, pan = 0 }) {
  const [leftGain, rightGain] = panGains(pan);
  const frequency = hz(midi);
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    const carrier = TAU * frequency * time;
    const modulation = Math.sin(carrier * 2) * 1.5 * Math.exp(-time / .09);
    const wave = Math.sin(carrier + modulation) * .8 + triangle(carrier) * .2;
    // アタックだけ高い倍音を足す「きらめき」。正解チャイムの存在感と高域（8kHz付近）を同時に持ち上げる
    const sparkle = Math.sin(carrier * 10) * .2 * Math.exp(-time / .025);
    const sample = (wave + sparkle) * pluckEnvelope(time, duration, .005, .5) * gain;
    spread(sfx, index, sample, leftGain, rightGain);
  }
}

/** タップの下降スイープ（既存の音を曲に馴染ませて残す） */
function addSweep({ start, duration, from, to, gain, pan }) {
  const [leftGain, rightGain] = panGains(pan);
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  let phase = 0;
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    phase += TAU * (from + (to - from) * (time / duration)) / SAMPLE_RATE;
    const sample = Math.sin(phase) * pluckEnvelope(time, duration, .003, .05) * gain;
    spread(sfx, index, sample, leftGain, rightGain);
  }
}

/** タップの直前に置く小さなライザー（帯域を上げていくノイズ） */
function addRiser({ start, duration, gain }) {
  const first = firstFrame(start);
  const last = lastFrame(start, duration);
  let lowpass = 0;
  for (let index = first; index < last; index += 1) {
    const time = index / SAMPLE_RATE - start;
    const ratio = time / duration;
    const cutoff = 500 + 4200 * ratio * ratio;
    const alpha = 1 - Math.exp(-TAU * cutoff / SAMPLE_RATE);
    const noise = random() * 2 - 1;
    lowpass += (noise - lowpass) * alpha;
    const sample = (noise - lowpass) * ratio * ratio * gain;
    spread(sfx, index, sample, .72, .72);
  }
}

// ── 編曲 ──────────────────────────────────────────────────────────────────
const kickTimes = [];
const BAR_COUNT = Math.ceil(DURATION_SECONDS / BAR);
const BRUSH = VARIANT === 'b';       // B案はドラムをブラシ風に・キックを小さく
const DRUM_LEVEL = BRUSH ? .62 : 1;

for (let bar = 0; bar < BAR_COUNT; bar += 1) {
  const barStart = bar * BAR;
  // S7 に入る手前からは Fmaj7 に落として、終止和音まで一続きにする
  const chord = PROGRESSION[barStart >= SECTION.end - BAR ? 0 : bar % 4];
  const beat = (n) => barStart + n * BEAT;

  // パッド：小節をまたいで重ねる（release が次の和音と交差して継ぎ目が消える）
  if (barStart < SECTION.end) {
    // S0（ドラム前）のパッドは元の編曲の音量を継承
    const hookLift = barStart < SECTION.title ? 1.05 : 1;
    for (const [voice, midi] of chord.pad.entries()) {
      addPad({
        start: barStart, duration: BAR + .8, midi,
        // voice 0（最低声部）は 120Hz 付近まで届き低域を濁らせるので、そこだけ少し絞る
        gain: (bar === 0 ? .26 : .22) * (barStart < SECTION.ruby ? .96 : 1) * hookLift * (voice === 0 ? .40 : 1),
        pan: (voice - 1.5) * .3, attack: bar === 0 ? .5 : .3
      });
    }
  }

  // ベース：1拍目と3拍目にルート
  if (barStart >= SECTION.title && barStart < SECTION.promise) {
    // 低域（<120Hz）が全体と1.6dBしか差が無かったため、ベースとキックをまとめて -10dB強 絞った
    const level = barStart < SECTION.ruby ? .135 : .23;
    addBass({ start: beat(0), duration: BEAT * 1.35, midi: chord.bass, gain: level, slideFrom: -5 });
    addBass({ start: beat(2), duration: BEAT * .95, midi: chord.bass, gain: level * .8 });
    if (bar % 4 === 3) addBass({ start: beat(3.5), duration: BEAT * .5, midi: chord.bass + 7, gain: level * .55 });
  }

  // ドラム
  if (barStart >= SECTION.title && barStart < SECTION.promise) {
    const intro = barStart < SECTION.ruby;                 // S1 はキックとハットだけ静かに
    const kickGain = (intro ? .118 : .25) * DRUM_LEVEL;     // 低域を絞るため -10dB強
    const kicks = intro ? [0, 2.5] : (bar % 4 === 3 ? [0, 1.5, 2.5, 3.75] : [0, 2.5]);
    for (const at of kicks) {
      const time = beat(at);
      if (time >= SECTION.promise) continue;
      kickTimes.push(time);
      addKick({ start: time, gain: kickGain * (at === 0 ? 1 : .82) });
    }
    for (let step = 0; step < 8; step += 1) {
      const at = Math.floor(step / 2) + (step % 2 ? SWING : 0);
      const time = beat(at);
      if (time >= SECTION.promise) continue;
      const accent = step % 4 === 0 ? 1 : (step % 2 ? .62 : .8);
      const open = !intro && bar % 4 === 3 && step === 7;
      // 高域（8kHz以上）が暗すぎたため、ハットとシェイカーを大きく持ち上げた。
      // intro（S1）はキック・ベースを絞ったぶん、ハットを別枠でさらに持ち上げて S0 より前に出す
      addHat({
        start: time, gain: (intro ? .2 : .23) * accent * (BRUSH ? .8 : 1), open,
        pan: step % 2 ? .18 : .08
      });
      if (!intro && step % 2 === 1) addShaker({ start: time, gain: .078 * (BRUSH ? 1.15 : 1) });
    }
    if (!intro) {
      for (const at of [1, 3]) {
        const time = beat(at);
        if (time >= SECTION.promise) continue;
        addSnare({ start: time, gain: (BRUSH ? .085 : .1) * (at === 1 ? 1 : .92), brush: BRUSH });
      }
    }
  }

  // 鍵盤のアルペジオ：8分＋スイング、ベロシティのばらつきと ±8ms のヒューマナイズ
  const arpDensity = barStart < SECTION.title ? .62
    : barStart < SECTION.ruby ? .7
      : barStart < SECTION.promise ? .8
        : barStart < SECTION.end ? .35 : 0;
  for (let step = 0; step < 8 && arpDensity > 0; step += 1) {
    if (random() > arpDensity) continue;
    const at = Math.floor(step / 2) + (step % 2 ? SWING : 0);
    const time = beat(at) + (random() * 2 - 1) * .008;
    if (time < 0 || time >= SECTION.end) continue;
    const midi = chord.arp[(step + bar) % chord.arp.length] + (random() < .16 ? 12 : 0);
    const velocity = .62 + random() * .38;
    addPiano({
      start: time, duration: BEAT * (1.4 + random() * .9), midi,
      // S0 は元の編曲のわずかな底上げを継承
      gain: (VARIANT === 'a' ? .085 : .1) * velocity
        * (barStart < SECTION.title ? 1.2 : barStart >= SECTION.promise ? .75 : 1),
      pan: (random() * 2 - 1) * .42
    });
  }

  // 主旋律：2小節ごと。S3〜S4 ではオクターブ上の副旋律を足して持ち上げる
  const leadOn = bar % 2 === 0 && barStart >= SECTION.ruby && barStart < SECTION.promise;
  if (leadOn) {
    const motif = bar % 4 === 0 ? MOTIF_A : MOTIF_B;
    const doubled = barStart >= SECTION.actor && barStart < SECTION.source;
    for (const [offset, midi, length] of motif) {
      const time = beat(offset);
      if (time >= SECTION.promise) continue;
      addPiano({
        start: time, duration: BEAT * length + .35, midi,
        gain: (VARIANT === 'a' ? .13 : .15) * (barStart >= SECTION.source ? .8 : 1), pan: -.1
      });
      if (doubled) {
        addPiano({
          start: time + .012, duration: BEAT * length * .7 + .2, midi: midi + 12,
          gain: (VARIANT === 'a' ? .052 : .058), pan: .3
        });
      }
    }
  }
}

// 終止和音：S7 から Fmaj7 を伸ばし、36秒でフェードに委ねる
for (const [voice, midi] of [...PROGRESSION[0].pad, 72].entries()) {
  addPad({
    start: SECTION.end, duration: DURATION_SECONDS - SECTION.end, midi,
    gain: .195 * (voice === 0 ? .40 : 1), pan: (voice - 2) * .26, attack: .55, release: 2.8
  });
}
if (VARIANT === 'a') addElectricPiano({ start: SECTION.end + .05, duration: 2.6, midi: 65, gain: .1, pan: -.12 });
else addPluckedString({ start: SECTION.end + .05, duration: 2.6, midi: 65, gain: .12, pan: -.12, tau: 1.8 });

// 場面の変わり目に置く、ごく薄い持ち上げ
for (const at of [SECTION.ruby, SECTION.actor, SECTION.source]) {
  addRiser({ start: at - .55, duration: .55, gain: .035 });
}

/* 指がボタンに触れる4回。既存のタップ音（下降スイープ）と正解のチャイムは残し、
   調（F メジャー）と鍵盤の手触りに合わせ直した。
   正解（correct）は、直前で伴奏を短くダッキングしつつチャイムを強く・早めに重ね、
   忙しい場面（S2/S3）でも「当たった」がはっきり聞き取れるようにしてある。 */
const tapDuckTimes = [];
for (const [index, tap] of TAPS.entries()) {
  const pan = index % 2 === 0 ? -.16 : .16;
  const correct = tap.kind === 'correct';
  /* 地点の確定では伴奏に埋もれない強さにする。 */
  const chimeBoost = tap.target === 'confirm' ? 1.3 : 1;
  addRiser({ start: tap.at - .3, duration: .3, gain: correct ? .05 : .03 });
  addSweep({ start: tap.at, duration: .11, from: 1180, to: 720, gain: .105, pan });
  addChime({ start: tap.at + .01, duration: .32, midi: 62, gain: correct ? .22 * chimeBoost : .062, pan: -pan });
  if (!correct) continue;
  tapDuckTimes.push(tap.at);
  // 「当たった」の2音（C5 → F5＝5度から主音へ）。前後0.2秒の判定窓に収まるよう早めに重ねる
  addChime({ start: tap.at + .06, duration: .9, midi: 72, gain: .43 * chimeBoost, pan: pan * .5 });
  addChime({ start: tap.at + .16, duration: 1.1, midi: 77, gain: .39 * chimeBoost, pan: -pan * .5 });
}

// 表に入る瞬間の控えめな3音チャイム（F メジャーの分散和音）
for (const [offset, midi] of [[0, 72], [.16, 77], [.32, 81]]) {
  addChime({ start: RESULT_START + offset, duration: 1.6, midi, gain: .105, pan: (offset - .16) * 2.4 });
}

// ── 効果 ──────────────────────────────────────────────────────────────────

/* パッドのローパス（1次・遅いLFO）。ヒントの瞬間だけカットオフをわずかに開く。 */
{
  const boostAt = (time) => {
    if (time < SECTION.confirm - .4 || time > SECTION.confirm + 2.2) return 1;
    return time < SECTION.confirm
      ? 1 + .55 * (time - (SECTION.confirm - .4)) / .4
      : 1 + .55 * Math.max(0, 1 - (time - SECTION.confirm) / 2.2);
  };
  let left = 0;
  let right = 0;
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    const time = index / SAMPLE_RATE;
    const cutoff = 1200 * (1 + .26 * Math.sin(TAU * .062 * time + .8)) * boostAt(time);
    const alpha = 1 - Math.exp(-TAU * cutoff / SAMPLE_RATE);
    left += (pad.l[index] - left) * alpha;
    right += (pad.r[index] - right) * alpha;
    pad.l[index] = left; pad.r[index] = right;
  }
}

/* 鍵盤に付点8分のピンポンディレイを薄く。入力は右へ、以後 L↔R で受け渡す。 */
{
  const delay = Math.round(BEAT * .75 * SAMPLE_RATE);
  const tail = FRAME_COUNT + delay + 1;
  const lineL = new Float32Array(tail);
  const lineR = new Float32Array(tail);
  const feedback = .34;
  const wet = .16;
  const alpha = 1 - Math.exp(-TAU * 3200 / SAMPLE_RATE);   // 返りは高域を落とす
  let dampL = 0;
  let dampR = 0;
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    const tapL = lineL[index];
    const tapR = lineR[index];
    dampL += (tapL - dampL) * alpha;
    dampR += (tapR - dampR) * alpha;
    const mono = (piano.l[index] + piano.r[index]) * .5;
    lineR[index + delay] += mono * .6 + dampL * feedback;
    lineL[index + delay] += dampR * feedback;
    piano.l[index] += tapL * wet;
    piano.r[index] += tapR * wet;
  }
}

/* ステレオのシュレーダー・リバーブ（コム4＋オールパス2・減衰1.8秒前後）。
   鍵盤・パッド・スネアと効果音に送る。 */
const reverb = (() => {
  const decay = 1.8;
  const combs = [1215, 1390, 1548, 1760];   // 48kHz 換算
  const allpass = [245, 605];
  const send = { l: new Float32Array(FRAME_COUNT), r: new Float32Array(FRAME_COUNT) };
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    send.l[index] = pad.l[index] * .22 + piano.l[index] * .26 + snare.l[index] * .3 + sfx.l[index] * .22;
    send.r[index] = pad.r[index] * .22 + piano.r[index] * .26 + snare.r[index] * .3 + sfx.r[index] * .22;
  }
  const output = { l: new Float32Array(FRAME_COUNT), r: new Float32Array(FRAME_COUNT) };
  for (const channel of ['l', 'r']) {
    const offset = channel === 'r' ? 23 : 0;       // 左右で少しずらしてステレオにする
    const input = send[channel];
    const combed = new Float32Array(FRAME_COUNT);
    for (const size of combs) {
      const length = size + offset;
      const line = new Float32Array(length);
      const gain = 10 ** (-3 * (length / SAMPLE_RATE) / decay);
      const alpha = 1 - Math.exp(-TAU * 3800 / SAMPLE_RATE);
      let cursor = 0;
      let damp = 0;
      for (let index = 0; index < FRAME_COUNT; index += 1) {
        const value = line[cursor];
        combed[index] += value * .25;
        damp += (value - damp) * alpha;
        line[cursor] = input[index] + damp * gain;
        cursor = (cursor + 1) % length;
      }
    }
    let stage = combed;
    for (const size of allpass) {
      const length = size + offset;
      const line = new Float32Array(length);
      const next = new Float32Array(FRAME_COUNT);
      let cursor = 0;
      for (let index = 0; index < FRAME_COUNT; index += 1) {
        const delayed = line[cursor];
        const value = stage[index];
        next[index] = delayed - value;
        line[cursor] = value + delayed * .5;
        cursor = (cursor + 1) % length;
      }
      stage = next;
    }
    output[channel] = stage;
  }
  return output;
})();

/* キックでパッドと鍵盤を -3dB 程度ダッキングして、グルーヴを出す。 */
const duck = new Float32Array(FRAME_COUNT);
for (const at of kickTimes) {
  const first = firstFrame(at);
  const span = Math.floor(.34 * SAMPLE_RATE);
  for (let step = 0; step < span; step += 1) {
    const index = first + step;
    if (index >= FRAME_COUNT) break;
    const time = step / SAMPLE_RATE;
    const value = time < .008 ? time / .008 : Math.exp(-(time - .008) / .105);
    if (value > duck[index]) duck[index] = value;
  }
}

/* 正解タップの直前だけ、伴奏（パッド・鍵盤・ベース・ドラム・スネア）を強くダッキングして
   チャイムの立ち上がりをはっきりさせる。sfx（チャイム自体）はダッキングしない。
   tap.at-.4 からランプアップし、判定窓の前縁（tap.at-.2）より前に最大へ達して
   tap.at+.22 まで保持、その後 0.28秒で戻る（判定窓 tap.at±.2 の全域を確実にダッキングする）。 */
const tapDuck = new Float32Array(FRAME_COUNT);
for (const at of tapDuckTimes) {
  const first = firstFrame(at - .4);
  const span = Math.floor(.95 * SAMPLE_RATE);
  for (let step = 0; step < span; step += 1) {
    const index = first + step;
    if (index < 0 || index >= FRAME_COUNT) continue;
    const time = step / SAMPLE_RATE - .4;   // tap.at を 0 とした相対時刻
    const value = time <= -.22 ? Math.max(0, (time + .4) / .18)
      : time < .22 ? 1
        : Math.exp(-(time - .22) / .28);
    if (value > tapDuck[index]) tapDuck[index] = value;
  }
}

// ── まとめ ────────────────────────────────────────────────────────────────
const left = new Float32Array(FRAME_COUNT);
const right = new Float32Array(FRAME_COUNT);
let mixPeak = 0;
const TAP_DUCK_DEPTH = .92;
for (let index = 0; index < FRAME_COUNT; index += 1) {
  const ducked = 1 - .29 * duck[index];
  const tapDucked = 1 - TAP_DUCK_DEPTH * tapDuck[index];
  const wet = VARIANT === 'a' ? .17 : .2;
  left[index] = (pad.l[index] + piano.l[index] + reverb.l[index] * wet) * ducked * tapDucked
    + (bass.l[index] + drums.l[index] + snare.l[index]) * tapDucked + sfx.l[index];
  right[index] = (pad.r[index] + piano.r[index] + reverb.r[index] * wet) * ducked * tapDucked
    + (bass.r[index] + drums.r[index] + snare.r[index]) * tapDucked + sfx.r[index];
}

/* 20Hz の1次ハイパスで DC と超低域のうねりを落とす（合成音は波形が非対称になりやすい）。
   同じパスで 6kHz の緩いハイシェルフ（+2.5dB）も掛け、高域（8kHz以上）の暗さを補う。 */
{
  const pole = 1 - TAU * 20 / SAMPLE_RATE;
  const shelfAlpha = 1 - Math.exp(-TAU * 5500 / SAMPLE_RATE);
  const shelfBoost = 10 ** (4.5 / 20) - 1;
  let inL = 0; let hpL = 0; let inR = 0; let hpR = 0;
  let shelfLpL = 0; let shelfLpR = 0;
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    const rawL = left[index]; const rawR = right[index];
    // ハイパスの再帰状態（hpL/hpR）はここだけで完結させる。シェルフ後の値を巻き戻すと
    // フィードバックが発散して NaN になる（実際に起きた）ので、出力用の outL/outR は別変数にする。
    hpL = rawL - inL + pole * hpL; inL = rawL;
    hpR = rawR - inR + pole * hpR; inR = rawR;
    shelfLpL += (hpL - shelfLpL) * shelfAlpha;
    shelfLpR += (hpR - shelfLpR) * shelfAlpha;
    const outL = hpL + (hpL - shelfLpL) * shelfBoost;
    const outR = hpR + (hpR - shelfLpR) * shelfBoost;
    left[index] = outL; right[index] = outR;
    mixPeak = Math.max(mixPeak, Math.abs(outL), Math.abs(outR));
  }
}

/* 飽和の掛かり具合を編曲のゲインに左右されないよう、先にピークを揃えてから tanh に通す。 */
const preGain = mixPeak > 0 ? .9 / mixPeak : 1;
let rawPeak = 0;
let sumSquares = 0;
for (let index = 0; index < FRAME_COUNT; index += 1) {
  const time = index / SAMPLE_RATE;
  const fadeIn = Math.min(1, time / .25);
  const fadeOut = Math.min(1, (DURATION_SECONDS - time) / 2.5);
  // S5は読み取りに集中する区間。境界0.3秒で伴奏・効果音ともに約-8dBへ。
  const settle = Math.max(0, Math.min(1, (time - RESULT_START) / .3,
    (sceneStart('S6') - time) / .3));
  const sectionGain = 1 - .6 * settle;
  const master = sectionGain * Math.sin(Math.PI * .5 * fadeIn) * Math.sin(Math.PI * .5 * Math.max(0, fadeOut));
  left[index] = Math.tanh(left[index] * preGain * 1.3) / 1.3 * master;
  right[index] = Math.tanh(right[index] * preGain * 1.3) / 1.3 * master;
  rawPeak = Math.max(rawPeak, Math.abs(left[index]), Math.abs(right[index]));
  sumSquares += (left[index] ** 2 + right[index] ** 2) / 2;
}

const rawRms = Math.sqrt(sumSquares / FRAME_COUNT);
let scale = rawRms > 0 ? TARGET_RMS / rawRms : 1;
let peakLimited = false;
if (rawPeak * scale > PEAK_CEILING) { scale = PEAK_CEILING / rawPeak; peakLimited = true; }

const pcm = Buffer.alloc(FRAME_COUNT * CHANNELS * (BITS_PER_SAMPLE / 8));
let finalPeak = 0;
for (let index = 0; index < FRAME_COUNT; index += 1) {
  for (const [channel, sample] of [left[index] * scale, right[index] * scale].entries()) {
    const value = Math.max(-1, Math.min(1, sample));
    finalPeak = Math.max(finalPeak, Math.abs(value));
    pcm.writeInt16LE(Math.round(value * 32767), (index * CHANNELS + channel) * 2);
  }
}

const header = Buffer.alloc(44);
const byteRate = SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8);
const blockAlign = CHANNELS * (BITS_PER_SAMPLE / 8);
header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
header.writeUInt16LE(CHANNELS, 22); header.writeUInt32LE(SAMPLE_RATE, 24); header.writeUInt32LE(byteRate, 28);
header.writeUInt16LE(blockAlign, 32); header.writeUInt16LE(BITS_PER_SAMPLE, 34);
header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
writeFileSync(out, Buffer.concat([header, pcm]));

const rms = rawRms * scale;
const db = (value) => 20 * Math.log10(Math.max(value, Number.EPSILON));
const label = VARIANT === 'a' ? 'A案（ローファイ鍵盤）' : 'B案（アコースティック寄り）';
console.log(`WAVを書き出しました: ${out}`);
console.log(`  ${label} / F メジャー / ${BPM} BPM / ${(DURATION_SECONDS / BAR).toFixed(1)}小節`);
console.log(`  ${DURATION_SECONDS.toFixed(3)}秒 / ${SAMPLE_RATE}Hz / 16bit / stereo`);
console.log(`  peak ${db(finalPeak).toFixed(2)} dBFS / RMS ${db(rms).toFixed(2)} dBFS`);
if (peakLimited) console.log('  ⚠️ RMS基準ではピーク上限を超えたので、ピーク基準(-1.5 dBTP)へ切り替えました。');
