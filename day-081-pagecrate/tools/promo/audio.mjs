/* プロモの BGM。外部の音源・サンプル・AI の音は使わず、固定シードの純JSで「曲」として合成する。
   土台は Day 031 の promo-audio.mjs（パッド・FMエレピ・撥弦・ベース・キック/ハット/スネア/シェイカー・
   残響・ピンポンディレイ・キックのダッキング・高域シェルフ）。仕上げは Day 053 と同じ物差し
   （ITU-R BS.1770 の統合ラウドネス・4倍オーバーサンプリングの真のピーク・2極フィルタの帯域 RMS）。

   構成は timeline.mjs の絵コンテと output/capture-events.json の出来事に合わせる：
     フック（ドラムなし）→ 一覧でビートが入る → 選ぶで旋律を足す → ZIP の完了（done）で明るく持ち上げる
     → 安心は薄く静かに → 終止和音とフェード。タップには小さな音、ZIP の完了には小さなチャイム。
   小節の位相は done がちょうど小節の頭に来るようにずらし、ほかの場面の切れ目は最寄りの拍に丸める。

   使い方:  node audio.mjs --variant a|b   → output/score-<案>.wav・bgm-<案>.mp3・audio-report-<案>.json */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DURATION_SECONDS, SECTION } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'output');
const argv = process.argv.slice(2);
const VARIANT = (argv[argv.indexOf('--variant') + 1] ?? 'a').toLowerCase();
const VARIANTS = {
  // A：D メジャー・100 BPM。FM エレピとパッド、明るいベル。場面の切れ目がほぼ拍の上に乗る
  a: { label: 'A案（D メジャー・100 BPM・エレピとベル）', key: 62, bpm: 100, swing: 0.54, keys: 'ep', lead: 'bell', seed: 0x81a0d4, liftBar: 7, drums: 1, pad: 1, arp: 1, bass: 1, kick: 1, hook: 1, shaker: 1, shelf: 3, lowShelf: -2.5 },
  // B：B♭ メジャー・84 BPM。撥弦（ナイロン弦風）とブラシ、カリンバ風の旋律。パッドは控えめ
  b: { label: 'B案（B♭ メジャー・84 BPM・撥弦とブラシ）', key: 58, bpm: 84, swing: 0.6, keys: 'pluck', lead: 'kalimba', seed: 0x81b0b4, liftBar: 6, drums: 0.8, pad: 0.75, arp: 1.15, bass: 0.55, kick: 0.7, hook: 0.8, shaker: 0.9, shelf: -2, lowShelf: -3.5 },
};
const V = VARIANTS[VARIANT];
if (!V) { console.error('--variant は a か b です'); process.exit(1); }

const SAMPLE_RATE = 48_000;
const FRAMES = Math.round(DURATION_SECONDS * SAMPLE_RATE);
const TAU = Math.PI * 2;
const TARGET_LUFS = -17;
const PEAK_CEILING_DB = -3;   // サンプルピークの天井。AAC にした後の真のピークを -1.5 dBTP より下に保つ余白
export const LIMITS = Object.freeze({ lufs: [-18, -16], truePeak: -1.5, low: [-9, -6], high: [-43, -38], hookGap: 6, clipped: 0 });

// ── 出来事（撮影の記録）と拍 ─────────────────────────────────────────────
const capturePath = join(out, 'capture-events.json');
if (!existsSync(capturePath)) throw Error('先に npm run capture を実行してください（output/capture-events.json）');
const captured = JSON.parse(readFileSync(capturePath, 'utf8'));
const TAPS = captured.events.filter((event) => ['press-demo', 'filter-tap', 'search-tap', 'select', 'save'].includes(event.type)).map((event) => event.seconds);
const KEYS_TYPED = captured.events.filter((event) => event.type === 'type').map((event) => event.seconds);
const DONE = captured.events.find((event) => event.type === 'done')?.seconds;
if (!Number.isFinite(DONE)) throw Error('capture-events.json に done（ZIP の完了）がありません');

const BEAT = 60 / V.bpm;
const BAR = BEAT * 4;
const PHASE = DONE - V.liftBar * BAR;               // done が liftBar 小節目の頭に来るようにずらす
const barStart = (bar) => PHASE + bar * BAR;
const snap = (seconds) => PHASE + Math.round((seconds - PHASE) / BEAT) * BEAT;
const T = {
  drums: snap(SECTION.list), lead: snap(SECTION.pick), zip: snap(SECTION.zip), lift: DONE,
  trust: snap(SECTION.trust), outro: snap(SECTION.outro),
};
const FIRST_BAR = Math.floor((0 - PHASE) / BAR);
const LAST_BAR = Math.ceil((DURATION_SECONDS - PHASE) / BAR);
const FINAL_BAR = Math.floor((T.outro - PHASE) / BAR + 1e-6) + 1;   // 終わりの案内が始まる小節の、次の小節で終止和音
T.final = barStart(FINAL_BAR);

/* 和音は主音からの半音で書く（ローマ数字の度数）。r は ZIP の完了の小節からの相対位置 */
const CHORD = {
  I: [0, 4, 7, 11, 14], vi: [9, 12, 16, 19], IV: [5, 9, 12, 16], iii: [4, 7, 11, 14], ii: [2, 5, 9, 12],
  V7sus: [7, 12, 14, 17], V7: [7, 11, 14, 17], 'V/IV': [5, 11, 14, 19],
};
const PLAN = { [-7]: 'I', [-6]: 'vi', [-5]: 'IV', [-4]: 'V7sus|V7', [-3]: 'I', [-2]: 'iii', [-1]: 'ii|V7sus', 0: 'I', 1: 'IV|V/IV', 2: 'vi', 3: 'IV', 4: 'ii', 5: 'IV|V7sus', 6: 'I', 7: 'I' };
if (VARIANT === 'b') Object.assign(PLAN, { [-6]: 'I', [-5]: 'vi', [-4]: 'IV', [-3]: 'V7sus|V7', [-2]: 'I', [-1]: 'ii|V7sus', 4: 'ii|V7sus', 5: 'I', 6: 'I' });
const chordsOf = (bar) => {
  const r = bar - V.liftBar;
  const names = (bar >= FINAL_BAR ? 'I' : PLAN[r] ?? 'I').split('|');
  return names.map((name, index) => ({ name, start: barStart(bar) + index * BAR / names.length, length: BAR / names.length }));
};
/** 音域 [low, high] に和音の構成音を閉じた形で並べる */
function voice(intervals, low, high) {
  const notes = intervals.map((interval) => {
    let midi = V.key + interval;
    while (midi < low) midi += 12;
    while (midi > high) midi -= 12;
    return midi;
  });
  return [...new Set(notes)].sort((a, b) => a - b);
}
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// ── 土台（Day 031 と同じ作り） ─────────────────────────────────────────
const bus = () => ({ l: new Float64Array(FRAMES), r: new Float64Array(FRAMES) });
const pad = bus(); const keys = bus(); const lead = bus(); const bass = bus(); const drums = bus(); const snare = bus(); const sfx = bus();
function randomFactory(seed) {
  let value = seed >>> 0;
  return () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 4294967296; };
}
const random = randomFactory(V.seed);
const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const panGains = (pan) => [Math.cos((clamp(pan, -1, 1) + 1) * Math.PI / 4), Math.sin((clamp(pan, -1, 1) + 1) * Math.PI / 4)];
const triangle = (phase) => { const c = phase / TAU; return 2 * Math.abs(2 * (c - Math.floor(c + 0.5))) - 1; };
const sawtooth = (phase) => { const c = phase / TAU; return 2 * (c - Math.floor(c + 0.5)); };
const firstFrame = (start) => Math.max(0, Math.floor(start * SAMPLE_RATE));
const lastFrame = (start, duration) => Math.min(FRAMES, Math.ceil((start + duration) * SAMPLE_RATE));
function swell(time, duration, attack, release) {
  if (time < 0 || time >= duration) return 0;
  return Math.sin(Math.min(1, time / Math.max(attack, 1e-4)) * Math.PI / 2) * Math.sin(Math.min(1, (duration - time) / Math.max(release, 1e-4)) * Math.PI / 2);
}
function pluckEnv(time, duration, attack, tau) {
  if (time < 0 || time >= duration) return 0;
  return (1 - Math.exp(-time / Math.max(attack, 1e-4))) * Math.exp(-time / tau) * Math.min(1, (duration - time) / 0.06);
}
function put(target, index, sample, [leftGain, rightGain]) { target.l[index] += sample * leftGain; target.r[index] += sample * rightGain; }

// ── 音色 ──────────────────────────────────────────────────────────────
function addPad({ start, duration, midi, gain, pan = 0, attack = 0.4, release = 1.1 }) {
  const gains = panGains(pan); const base = hz(midi);
  for (let i = firstFrame(start); i < lastFrame(start, duration); i += 1) {
    const t = i / SAMPLE_RATE - start;
    let wave = 0;
    for (const [n, cents] of [-7, 0, 6.5].entries()) { const ph = TAU * base * 2 ** (cents / 1200) * t + n * 1.7; wave += sawtooth(ph) * 0.3 + triangle(ph) * 0.32; }
    put(pad, i, wave / 3 * swell(t, duration, attack, release) * gain, gains);
  }
}
/** FM エレピ（比 1:1・指数で減る変調）。打鍵の芯に6倍の倍音を短く足す */
function addEp(target, { start, duration, midi, gain, pan = 0, index0 = 2.4, tauAmp = 0.9 }) {
  const gains = panGains(pan); const f = hz(midi);
  for (let i = firstFrame(start); i < lastFrame(start, duration); i += 1) {
    const t = i / SAMPLE_RATE - start; const carrier = TAU * f * t;
    const mod = Math.sin(carrier) * index0 * Math.exp(-t / 0.12);
    const tine = Math.sin(carrier * 6) * 0.12 * Math.exp(-t / 0.04);
    put(target, i, (Math.sin(carrier + mod) + tine) * pluckEnv(t, duration, 0.004, tauAmp) * gain, gains);
  }
}
/** カープラス・ストロングの弦。brightness が高いほど硬い（カリンバ寄り） */
function addPluck(target, { start, duration, midi, gain, pan = 0, tau = 1.2, brightness = 0.5 }) {
  const gains = panGains(pan); const f = hz(midi);
  const size = Math.max(2, Math.round(SAMPLE_RATE / f)); const line = new Float64Array(size);
  let smooth = 0;
  for (let i = 0; i < size; i += 1) { smooth += ((random() * 2 - 1) - smooth) * brightness; line[i] = smooth; }
  const feedback = Math.exp(-1 / (f * tau));
  let cursor = 0; let previous = 0;
  for (let i = firstFrame(start); i < lastFrame(start, duration); i += 1) {
    const t = i / SAMPLE_RATE - start; const value = line[cursor];
    line[cursor] = (value + previous) * 0.5 * feedback; previous = value; cursor = (cursor + 1) % size;
    put(target, i, value * Math.min(1, t / 0.002) * Math.min(1, (duration - t) / 0.08) * gain, gains);
  }
}
/** ベル（FM・比 3.5）。A案の副旋律と、ZIP 完了のチャイム */
function addBell(target, { start, duration, midi, gain, pan = 0, ratio = 3.5, depth = 1.6, tau = 0.7 }) {
  const gains = panGains(pan); const f = hz(midi);
  for (let i = firstFrame(start); i < lastFrame(start, duration); i += 1) {
    const t = i / SAMPLE_RATE - start; const carrier = TAU * f * t;
    const mod = Math.sin(carrier * ratio) * depth * Math.exp(-t / 0.18);
    const sparkle = Math.sin(carrier * 8) * 0.16 * Math.exp(-t / 0.02);
    put(target, i, (Math.sin(carrier + mod) * 0.85 + triangle(carrier) * 0.15 + sparkle) * pluckEnv(t, duration, 0.003, tau) * gain, gains);
  }
}
const addKeys = (target, options) => (V.keys === 'ep' ? addEp(target, options) : addPluck(target, { brightness: 0.46, tau: 1.25, ...options }));
const addLead = (target, options) => (V.lead === 'bell' ? addEp(target, { index0: 1.9, tauAmp: 1.1, ...options }) : addPluck(target, { brightness: 0.72, tau: 0.9, ...options }));
const addDouble = (target, options) => (V.lead === 'bell' ? addBell(target, options) : addPluck(target, { brightness: 0.86, tau: 0.55, ...options }));
function addBass({ start, duration, midi, gain, slideFrom = 0 }) {
  const target = hz(midi); const from = slideFrom ? hz(midi + slideFrom) : target;
  let phase = 0; let low = 0; const alpha = 1 - Math.exp(-TAU * 300 / SAMPLE_RATE);
  for (let i = firstFrame(start); i < lastFrame(start, duration); i += 1) {
    const t = i / SAMPLE_RATE - start; const glide = Math.min(1, t / 0.06);
    phase += TAU * (from + (target - from) * glide * glide) / SAMPLE_RATE;
    low += (Math.sin(phase) * 0.82 + triangle(phase) * 0.18 - low) * alpha;
    const sample = low * pluckEnv(t, duration, 0.01, VARIANT === 'b' ? 0.55 : 0.45) * gain * V.bass;
    bass.l[i] += sample; bass.r[i] += sample;
  }
}
function addKick({ start, gain }) {
  let phase = 0;
  for (let i = firstFrame(start); i < lastFrame(start, 0.4); i += 1) {
    const t = i / SAMPLE_RATE - start; phase += TAU * (44 + 16 * Math.exp(-t / 0.032)) / SAMPLE_RATE;
    const sample = (Math.sin(phase) * Math.exp(-t / 0.1) + Math.sin(phase * 2) * 0.2 * Math.exp(-t / 0.025) + Math.sin(TAU * 1500 * t) * 0.12 * Math.exp(-t / 0.003)) * Math.min(1, t / 0.0015) * gain;
    drums.l[i] += sample; drums.r[i] += sample;
  }
}
function addHat({ start, gain, open = false, pan = 0.14 }) {
  const gains = panGains(pan); let low = 0; const alpha = 1 - Math.exp(-TAU * 7600 / SAMPLE_RATE);
  for (let i = firstFrame(start); i < lastFrame(start, open ? 0.24 : 0.07); i += 1) {
    const t = i / SAMPLE_RATE - start; const noise = random() * 2 - 1; low += (noise - low) * alpha;
    put(drums, i, (noise - low) * Math.exp(-t / (open ? 0.09 : 0.016)) * gain, gains);
  }
}
function addSnare({ start, gain, brush = false }) {
  let low = 0; let high = 0;
  const aLow = 1 - Math.exp(-TAU * (brush ? 5600 : 3600) / SAMPLE_RATE); const aHigh = 1 - Math.exp(-TAU * (brush ? 700 : 340) / SAMPLE_RATE);
  for (let i = firstFrame(start); i < lastFrame(start, brush ? 0.32 : 0.22); i += 1) {
    const t = i / SAMPLE_RATE - start; const noise = random() * 2 - 1;
    low += (noise - low) * aLow; high += (low - high) * aHigh;
    const shell = brush ? 0 : Math.sin(TAU * 190 * t) * 0.28 * Math.exp(-t / 0.04);
    const sample = (low - high + shell) * Math.exp(-t / (brush ? 0.11 : 0.05)) * (brush ? Math.min(1, t / 0.014) : 1) * gain;
    snare.l[i] += sample * 0.96; snare.r[i] += sample * 1.04;
  }
}
function addShaker({ start, gain, pan = -0.24 }) {
  const gains = panGains(pan); let low = 0; const alpha = 1 - Math.exp(-TAU * 6000 / SAMPLE_RATE);
  for (let i = firstFrame(start); i < lastFrame(start, 0.05); i += 1) {
    const t = i / SAMPLE_RATE - start; const noise = random() * 2 - 1; low += (noise - low) * alpha;
    put(drums, i, (noise - low) * Math.exp(-t / 0.011) * Math.min(1, t / 0.004) * gain, gains);
  }
}
/** 帯域を上げていくノイズ（場面の手前）。swell は ZIP の完了の瞬間に開く明るいシンバル風 */
function addRiser({ start, duration, gain, target = sfx }) {
  let low = 0;
  for (let i = firstFrame(start); i < lastFrame(start, duration); i += 1) {
    const ratio = (i / SAMPLE_RATE - start) / duration; const alpha = 1 - Math.exp(-TAU * (600 + 5200 * ratio * ratio) / SAMPLE_RATE);
    const noise = random() * 2 - 1; low += (noise - low) * alpha;
    put(target, i, (noise - low) * ratio * ratio * gain, [0.72, 0.72]);
  }
}
function addSwell({ start, duration, gain }) {
  let low = 0; const alpha = 1 - Math.exp(-TAU * 4200 / SAMPLE_RATE);
  for (let i = firstFrame(start); i < lastFrame(start, duration); i += 1) {
    const t = i / SAMPLE_RATE - start; const noise = random() * 2 - 1; low += (noise - low) * alpha;
    put(sfx, i, (noise - low) * Math.min(1, t / 0.006) * Math.exp(-t / 0.55) * gain, [0.7, 0.74]);
  }
}
/** タップの小さな音：柔らかいクリックと、調に合わせた短い「トッ」 */
function addTick({ start, gain, midi, pan = 0 }) {
  const gains = panGains(pan); const f = hz(midi); let low = 0; const alpha = 1 - Math.exp(-TAU * 3000 / SAMPLE_RATE);
  for (let i = firstFrame(start); i < lastFrame(start, 0.09); i += 1) {
    const t = i / SAMPLE_RATE - start; const noise = random() * 2 - 1; low += (noise - low) * alpha;
    const click = (noise - low) * Math.exp(-t / 0.0025) * 0.5;
    const tok = Math.sin(TAU * f * t) * Math.exp(-t / 0.022) * Math.min(1, t / 0.001);
    put(sfx, i, (click + tok) * gain, gains);
  }
}

// ── 編曲 ──────────────────────────────────────────────────────────────
const kickTimes = [];
const inRange = (time, from, to) => time >= from && time < to;
// 主旋律は度数（主音からの半音）と拍で書く。[小節内の拍, 半音, 長さ(拍)]。B案はスイングで少し跳ねる
const MELODY = {
  [-3]: [[0, 4, 1], [1, 7, 0.5], [1.5, 9, 1], [2.5, 7, 0.5], [3, 4, 1]],
  [-2]: [[0, 2, 1], [1, 4, 0.5], [1.5, 7, 1.5], [3, 11, 1]],
  [-1]: [[0, 9, 1], [1, 7, 0.5], [1.5, 5, 0.5], [2, 2, 1], [3, 5, 1]],
  0: [[0, 7, 1.5], [1.5, 12, 0.5], [2, 11, 1], [3, 7, 1]],
  1: [[0, 9, 1], [1, 7, 0.5], [1.5, 5, 0.5], [2, 4, 1], [3, 2, 1]],
  5: [[0, 9, 2], [2, 7, 2]],
};
// B案は小節の並びが1つ短く、選ぶの始まりが属和音（V7sus｜V7）の3拍目に来る。そこを主音への助走にする
if (VARIANT === 'b') {
  Object.assign(MELODY, { [-3]: [[2, 7, 0.5], [2.5, 9, 0.5], [3, 11, 1]], [-2]: [[0, 9, 1], [1, 7, 0.5], [1.5, 4, 1.5], [3, 2, 1]], 4: [[1, 9, 1], [2, 7, 2]] });
  delete MELODY[5];
}
const swingAt = (beat) => (beat % 1 === 0.5 ? Math.floor(beat) + V.swing : beat);

for (let bar = FIRST_BAR; bar <= LAST_BAR; bar += 1) {
  const start = barStart(bar);
  const at = (beat) => start + swingAt(beat) * BEAT;
  for (const chord of chordsOf(bar)) {
    const intervals = CHORD[chord.name];
    // パッド：和音を少し長めに鳴らして次の和音と重ね、継ぎ目を消す。安心の場面は薄く、終止和音は別に置く
    if (chord.start < T.final - 0.01) {
      const level = (chord.start < T.drums ? 0.27 * V.hook : chord.start >= T.trust ? 0.18 : chord.start >= T.lift ? 0.24 : 0.21) * V.pad;
      for (const [n, midi] of voice(intervals, 53, 67).entries()) {
        addPad({ start: Math.max(0, chord.start), duration: chord.length + 0.7, midi, gain: level * (n === 0 ? 0.5 : 1), pan: (n - 1.5) * 0.28, attack: chord.start <= 0.05 ? 0.06 : 0.35 });
      }
    }
    // ベース：ビートが入ってから。1拍目と3拍目にルート、4拍目の裏で次へ寄る。安心の場面は全音符だけ
    const root = voice([intervals[0]], 38, 49)[0];
    if (chord.start >= T.drums - 0.01 && chord.start < T.final - 0.01) {
      if (chord.start >= T.trust) addBass({ start: chord.start, duration: chord.length * 0.95, midi: root, gain: 0.16 });
      else {
        const level = chord.start >= T.lift ? 0.24 : 0.21;
        addBass({ start: chord.start, duration: Math.min(chord.length, BEAT * 1.4), midi: root, gain: level, slideFrom: -5 });
        if (chord.length > BEAT * 2.5) addBass({ start: chord.start + BEAT * 2, duration: BEAT * 0.95, midi: root, gain: level * 0.8 });
        if (chord.length > BEAT * 3.5) addBass({ start: chord.start + swingAt(3.5) * BEAT, duration: BEAT * 0.45, midi: root + 7, gain: level * 0.5 });
      }
    }
  }
  const chords = chordsOf(bar);
  // ドラム：一覧から ZIP の完了の後まで。安心の場面で抜く
  for (let beat = 0; beat < 4; beat += 1) {
    const time = at(beat);
    if (!inRange(time, T.drums - 0.01, T.trust - 0.01)) continue;
    const lifted = time >= T.lift;
    const fill = time >= T.lift - BAR / 2 && time < T.lift;   // 完了の直前の半小節はスネアを刻む
    if (beat === 0 || beat === 2 || (fill && beat === 3)) { kickTimes.push(time); addKick({ start: time, gain: (lifted ? 0.27 : 0.24) * V.drums * V.kick * (beat === 0 ? 1 : 0.85) }); }
    if (beat === 1 || beat === 3) addSnare({ start: time, gain: (VARIANT === 'b' ? 0.1 : 0.11) * V.drums, brush: VARIANT === 'b' });
    if (fill) for (const sub of [0.5, 0.75]) addSnare({ start: time + sub * BEAT, gain: 0.05 * V.drums, brush: VARIANT === 'b' });
  }
  for (let step = 0; step < 8; step += 1) {
    const time = at(step / 2);
    if (!inRange(time, T.drums - 0.01, T.trust - 0.01)) continue;
    const accent = step % 4 === 0 ? 1 : step % 2 ? 0.6 : 0.8;
    addHat({ start: time, gain: (time >= T.lift ? 0.25 : 0.22) * accent * V.drums, open: time >= T.lift && step === 7, pan: step % 2 ? 0.2 : 0.08 });
    if (step % 2 === 1) addShaker({ start: time + 0.004, gain: 0.08 * V.shaker });
  }
  // 安心の場面：ドラムは抜き、シェイカーだけごく小さく残して呼吸を止めない
  for (let step = 1; step < 8; step += 2) {
    const time = at(step / 2);
    if (inRange(time, T.trust, T.outro)) addShaker({ start: time, gain: 0.045 });
  }
  // 分散和音：フックから安心まで。完了の後は1オクターブ上へ（明るく持ち上げる）。安心は密度を落とす
  for (const chord of chords) {
    if (chord.start >= T.final - 0.01) continue;
    const arpNotes = voice(CHORD[chord.name], 64, 79);
    for (let step = 0; step < 8; step += 1) {
      const beat = step / 2;
      const time = at(beat) + (random() * 2 - 1) * 0.007;
      if (time < chord.start - 0.001 || time >= chord.start + chord.length - 0.001 || time >= T.final || time < 0) continue;
      const density = time < T.drums ? 0.78 : time >= T.trust ? 0.42 : 0.84;
      if (random() > density) continue;
      const lifted = time >= T.lift && time < T.trust;
      const midi = arpNotes[(step + bar) % arpNotes.length] + (lifted && step % 2 === 0 ? 12 : 0);
      addKeys(keys, { start: time, duration: BEAT * (1.3 + random() * 0.9), midi, gain: (VARIANT === 'a' ? 0.088 : 0.1) * V.arp * (0.65 + random() * 0.35) * (time < T.drums ? 1.25 * V.hook : time >= T.trust ? 0.8 : 1), pan: (random() * 2 - 1) * 0.45 });
    }
  }
  // 主旋律：選ぶから（安心の場面は休む）。完了の小節は高い音域で書いてある。完了の後までは副旋律（A＝ベル、B＝硬い撥弦）を1オクターブ上に重ねる
  const melody = MELODY[bar - V.liftBar];
  if (melody) {
    for (const [beat, degree, length] of melody) {
      const time = at(beat);
      if (time < T.lead - 0.01 || time >= T.final - 0.01) continue;
      if (time >= T.trust && time < T.outro) continue;
      const midi = V.key + 12 + degree;
      addLead(lead, { start: time, duration: BEAT * length + 0.3, midi, gain: (time >= T.outro ? 0.1 : 0.14) * (VARIANT === 'b' ? 1.25 : 1), pan: -0.08 });
      if (time < T.trust && time >= T.lead) addDouble(lead, { start: time + 0.012, duration: BEAT * length * 0.8 + 0.2, midi: midi + 12, gain: (time >= T.lift ? 0.07 : 0.05) * (VARIANT === 'b' ? 1.3 : 1), pan: 0.32 });
    }
  }
}

// 終止和音：最後の小節から鳴らし、36秒のフェードに委ねる
for (const [n, midi] of voice(CHORD.I, 50, 69).entries()) addPad({ start: T.final, duration: DURATION_SECONDS - T.final, midi, gain: 0.23 * V.pad * (n === 0 ? 0.5 : 1), pan: (n - 2) * 0.25, attack: 0.25, release: 2.6 });
for (const [n, midi] of voice(CHORD.I, 62, 76).entries()) addKeys(keys, { start: T.final + n * 0.035, duration: 4.2, midi, gain: 0.09 * V.arp, pan: (n - 2) * 0.22, ...(V.keys === 'ep' ? { tauAmp: 1.8 } : { tau: 2.4 }) });
addBass({ start: T.final, duration: 3.6, midi: voice([0], 38, 49)[0], gain: 0.15 });
addDouble(lead, { start: T.final + 0.02, duration: 3.5, midi: V.key + 24 + 7, gain: 0.06, pan: 0.2 });

// 場面の手前のごく薄い持ち上げ
for (const time of [T.drums, T.lead]) addRiser({ start: time - 0.5, duration: 0.5, gain: 0.03 });
addRiser({ start: T.lift - BAR / 2, duration: BAR / 2, gain: 0.06 });
addSwell({ start: T.lift, duration: 2.4, gain: 0.07 });

// UI の音：タップは柔らかいクリック、文字入力はさらに小さく、ZIP の完了は調に合わせた3音のチャイム
const tickNote = V.key + 24 + 7;
for (const [n, time] of TAPS.entries()) addTick({ start: time, gain: 0.11, midi: tickNote + (n % 2 ? 5 : 0), pan: n % 2 ? 0.12 : -0.12 });
for (const time of KEYS_TYPED) addTick({ start: time, gain: 0.05, midi: tickNote + 5, pan: 0.18 });
for (const [n, [offset, degree]] of [[0, 7], [0.09, 12], [0.18, 16]].entries()) addBell(sfx, { start: DONE + offset, duration: 1.4, midi: V.key + 12 + degree, gain: 0.2 - n * 0.02, pan: (n - 1) * 0.3, tau: 0.6 });

// ── 効果 ──────────────────────────────────────────────────────────────
{ // パッドのローパス：完了の瞬間に開き、安心で閉じる
  let left = 0; let right = 0;
  for (let i = 0; i < FRAMES; i += 1) {
    const t = i / SAMPLE_RATE;
    const open = t >= T.lift && t < T.trust ? 1.6 - 0.4 * clamp((t - T.lift) / 3) : t >= T.trust ? 0.85 : 1;
    const cutoff = 1300 * (1 + 0.22 * Math.sin(TAU * 0.06 * t + 0.8)) * open;
    const alpha = 1 - Math.exp(-TAU * cutoff / SAMPLE_RATE);
    left += (pad.l[i] - left) * alpha; right += (pad.r[i] - right) * alpha; pad.l[i] = left; pad.r[i] = right;
  }
}
{ // 鍵盤と旋律に付点8分のピンポンディレイ
  const delay = Math.round(BEAT * 0.75 * SAMPLE_RATE); const lineL = new Float64Array(FRAMES + delay + 1); const lineR = new Float64Array(FRAMES + delay + 1);
  const alpha = 1 - Math.exp(-TAU * 3400 / SAMPLE_RATE); let dampL = 0; let dampR = 0;
  for (let i = 0; i < FRAMES; i += 1) {
    dampL += (lineL[i] - dampL) * alpha; dampR += (lineR[i] - dampR) * alpha;
    const mono = (keys.l[i] + keys.r[i] + lead.l[i] + lead.r[i]) * 0.5;
    lineR[i + delay] += mono * 0.55 + dampL * 0.32; lineL[i + delay] += dampR * 0.32;
    keys.l[i] += lineL[i] * 0.15; keys.r[i] += lineR[i] * 0.15;
  }
}
const reverb = (() => { // シュレーダーの残響（コム4＋オールパス2）
  const send = { l: new Float64Array(FRAMES), r: new Float64Array(FRAMES) };
  for (let i = 0; i < FRAMES; i += 1) {
    send.l[i] = pad.l[i] * 0.2 + keys.l[i] * 0.26 + lead.l[i] * 0.3 + snare.l[i] * 0.3 + sfx.l[i] * 0.24;
    send.r[i] = pad.r[i] * 0.2 + keys.r[i] * 0.26 + lead.r[i] * 0.3 + snare.r[i] * 0.3 + sfx.r[i] * 0.24;
  }
  const output = {};
  for (const channel of ['l', 'r']) {
    const offset = channel === 'r' ? 23 : 0; const combed = new Float64Array(FRAMES);
    for (const size of [1215, 1390, 1548, 1760]) {
      const length = size + offset; const line = new Float64Array(length); const gain = 10 ** (-3 * (length / SAMPLE_RATE) / 1.9);
      const alpha = 1 - Math.exp(-TAU * 3800 / SAMPLE_RATE); let cursor = 0; let damp = 0;
      for (let i = 0; i < FRAMES; i += 1) { const value = line[cursor]; combed[i] += value * 0.25; damp += (value - damp) * alpha; line[cursor] = send[channel][i] + damp * gain; cursor = (cursor + 1) % length; }
    }
    let stage = combed;
    for (const size of [245, 605]) {
      const length = size + offset; const line = new Float64Array(length); const next = new Float64Array(FRAMES); let cursor = 0;
      for (let i = 0; i < FRAMES; i += 1) { const delayed = line[cursor]; const value = stage[i]; next[i] = delayed - value; line[cursor] = value + delayed * 0.5; cursor = (cursor + 1) % length; }
      stage = next;
    }
    output[channel] = stage;
  }
  return output;
})();
const duck = new Float64Array(FRAMES); // キックでパッドと鍵盤を軽く下げる
for (const time of kickTimes) {
  const first = firstFrame(time);
  for (let step = 0; step < Math.floor(0.32 * SAMPLE_RATE) && first + step < FRAMES; step += 1) {
    const t = step / SAMPLE_RATE; const value = t < 0.008 ? t / 0.008 : Math.exp(-(t - 0.008) / 0.1);
    if (value > duck[first + step]) duck[first + step] = value;
  }
}

// ── まとめと仕上げ（Day 053 と同じ物差し） ─────────────────────────────
const left = new Float64Array(FRAMES); const right = new Float64Array(FRAMES);
const wet = VARIANT === 'a' ? 0.17 : 0.21;
for (let i = 0; i < FRAMES; i += 1) {
  const ducked = 1 - 0.27 * duck[i];
  left[i] = (pad.l[i] + keys.l[i] + reverb.l[i] * wet) * ducked + lead.l[i] + bass.l[i] + drums.l[i] + snare.l[i] + sfx.l[i];
  right[i] = (pad.r[i] + keys.r[i] + reverb.r[i] * wet) * ducked + lead.r[i] + bass.r[i] + drums.r[i] + snare.r[i] + sfx.r[i];
}
function rbj(type, frequency, q = Math.SQRT1_2, gainDb = 0) {
  const w0 = TAU * frequency / SAMPLE_RATE; const cos = Math.cos(w0); const alpha = Math.sin(w0) / (2 * q); const amp = 10 ** (gainDb / 40); const root = 2 * Math.sqrt(amp) * alpha;
  let c;
  if (type === 'lowpass') c = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
  else if (type === 'highpass') c = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
  else if (type === 'lowshelf') c = [amp * ((amp + 1) - (amp - 1) * cos + root), 2 * amp * ((amp - 1) - (amp + 1) * cos), amp * ((amp + 1) - (amp - 1) * cos - root), (amp + 1) + (amp - 1) * cos + root, -2 * ((amp - 1) + (amp + 1) * cos), (amp + 1) + (amp - 1) * cos - root];
  else c = [amp * ((amp + 1) + (amp - 1) * cos + root), -2 * amp * ((amp - 1) + (amp + 1) * cos), amp * ((amp + 1) + (amp - 1) * cos - root), (amp + 1) - (amp - 1) * cos + root, 2 * ((amp - 1) - (amp + 1) * cos), (amp + 1) - (amp - 1) * cos - root];
  const [b0, b1, b2, a0, a1, a2] = c; return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function biquad([b0, b1, b2, a1, a2]) {
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  return (x) => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}
/** ITU-R BS.1770 の統合ラウドネス（K特性・400ms・絶対/相対ゲート）。48kHz 用の係数 */
function integratedLoudness(l, r) {
  const weight = (channel) => { const shelf = biquad([1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585]); const hp = biquad([1, -2, 1, -1.99004745483398, 0.99007225036621]); return Float64Array.from(channel, (x) => { const y = hp(shelf(x)); return y * y; }); };
  const sl = weight(l); const sr = weight(r); const block = Math.round(0.4 * SAMPLE_RATE); const hop = Math.round(0.1 * SAMPLE_RATE);
  const prefix = new Float64Array(sl.length + 1); for (let i = 0; i < sl.length; i += 1) prefix[i + 1] = prefix[i] + sl[i] + sr[i];
  const powers = []; for (let s = 0; s + block <= sl.length; s += hop) powers.push((prefix[s + block] - prefix[s]) / block);
  const loud = (p) => -0.691 + 10 * Math.log10(Math.max(p, 1e-20)); const mean = (list) => list.reduce((a, b) => a + b, 0) / Math.max(1, list.length);
  const absolute = powers.filter((p) => loud(p) > -70); const threshold = loud(mean(absolute)) - 10;
  return loud(mean(absolute.filter((p) => loud(p) > threshold)));
}
function truePeak(channel) {
  const taps = 12;
  const kernels = [0.25, 0.5, 0.75].map((mu) => { const k = []; for (let j = -taps + 1; j <= taps; j += 1) { const x = mu - j; k.push(Math.sin(Math.PI * x) / (Math.PI * x) * 0.5 * (1 + Math.cos(Math.PI * x / taps))); } return k; });
  let peak = 0;
  for (let n = 0; n < channel.length; n += 1) {
    peak = Math.max(peak, Math.abs(channel[n]));
    if (n < taps || n + taps >= channel.length) continue;
    for (const kernel of kernels) { let value = 0; for (let j = 0; j < kernel.length; j += 1) value += channel[n - taps + 1 + j] * kernel[j]; peak = Math.max(peak, Math.abs(value)); }
  }
  return peak;
}
const db = (value) => 20 * Math.log10(Math.max(value, 1e-12));
for (const channel of [left, right]) {
  const hp = biquad(rbj('highpass', 30)); const lowShelf = biquad(rbj('lowshelf', 110, Math.SQRT1_2, V.lowShelf)); const shelf = biquad(rbj('highshelf', 6500, Math.SQRT1_2, V.shelf));
  for (let i = 0; i < FRAMES; i += 1) {
    const t = i / SAMPLE_RATE;
    const fadeIn = Math.min(1, t / 0.004);                   // 1コマ目から鳴らすので頭は 4ms だけ
    const fadeOut = clamp((DURATION_SECONDS - t) / 2.6);     // 最後の 2.6 秒で消す
    channel[i] = shelf(lowShelf(hp(channel[i]))) * fadeIn * (0.5 - 0.5 * Math.cos(Math.PI * fadeOut));
  }
}
const ceiling = 10 ** (PEAK_CEILING_DB / 20); const knee = ceiling * 10 ** (-5 / 20);
const soft = (x) => { const a = Math.abs(x); return a <= knee ? x : Math.sign(x) * (knee + (ceiling - knee) * Math.tanh((a - knee) / (ceiling - knee))); };
let gain = 10 ** ((TARGET_LUFS - integratedLoudness(left, right)) / 20);
let outL; let outR; let lufs = 0;
for (let pass = 0; pass < 8; pass += 1) {
  outL = Float64Array.from(left, (x) => soft(x * gain)); outR = Float64Array.from(right, (x) => soft(x * gain));
  lufs = integratedLoudness(outL, outR);
  if (Math.abs(lufs - TARGET_LUFS) < 0.03) break;
  gain *= 10 ** ((TARGET_LUFS - lufs) / 20);
}
let kneeHits = 0; for (let i = 0; i < FRAMES; i += 1) if (Math.abs(left[i] * gain) > knee || Math.abs(right[i] * gain) > knee) kneeHits += 1;
const pcm = Buffer.alloc(FRAMES * 4); let clipped = 0;
for (let i = 0; i < FRAMES; i += 1) {
  for (const [c, channel] of [outL, outR].entries()) {
    const value = Math.round((channel[i] + (random() - random()) / 32768) * 32767);   // TPDF ディザ
    if (value >= 32767 || value <= -32768) clipped += 1;
    pcm.writeInt16LE(clamp(value, -32768, 32767), (i * 2 + c) * 2);
  }
}

// ── 数値の検査（2極フィルタ＋RMS。audit.mjs は ffmpeg で同じものを測り直す） ──
function rmsDb(l, r, from = 0, to = DURATION_SECONDS) {
  const a = firstFrame(from); const b = Math.min(FRAMES, Math.ceil(to * SAMPLE_RATE)); let sum = 0;
  for (let i = a; i < b; i += 1) sum += (l[i] * l[i] + r[i] * r[i]) / 2;
  return 10 * Math.log10(Math.max(sum / Math.max(1, b - a), 1e-20));
}
const band = (channel, type, frequency) => { const filter = biquad(rbj(type, frequency)); return Float64Array.from(channel, (x) => filter(x)); };
const total = rmsDb(outL, outR);
const info = {
  variant: VARIANT, label: V.label, bpm: V.bpm, key: V.key, phaseSeconds: Number(PHASE.toFixed(3)),
  sections: Object.fromEntries(Object.entries(T).map(([name, time]) => [name, Number(time.toFixed(3))])),
  lufs: Number(lufs.toFixed(2)), truePeakDb: Number(db(Math.max(truePeak(outL), truePeak(outR))).toFixed(2)),
  low: Number((rmsDb(band(outL, 'lowpass', 120), band(outR, 'lowpass', 120)) - total).toFixed(2)),
  high: Number(rmsDb(band(outL, 'highpass', 8000), band(outR, 'highpass', 8000)).toFixed(2)),
  hook: Number(rmsDb(outL, outR, 0, SECTION.list).toFixed(2)), main: Number(rmsDb(outL, outR, SECTION.list, SECTION.outro).toFixed(2)),
  scenes: Object.fromEntries(['hook', 'list', 'pick', 'zip', 'trust', 'outro'].map((name, i, list) => [name, Number(rmsDb(outL, outR, SECTION[name], i + 1 < list.length ? SECTION[list[i + 1]] : DURATION_SECONDS).toFixed(2))])),
  chime: { at: DONE, marginDb: Number((rmsDb(outL, outR, DONE, DONE + 0.35) - rmsDb(outL, outR, DONE - 0.7, DONE - 0.25)).toFixed(2)) },
  headRmsDb: Number(rmsDb(outL, outR, 0, 0.1).toFixed(2)), kneePercent: Number((100 * kneeHits / FRAMES).toFixed(3)), clipped,
};
info.hookGap = Number((info.main - info.hook).toFixed(2));
const problems = [];
if (!(info.lufs >= LIMITS.lufs[0] && info.lufs <= LIMITS.lufs[1])) problems.push(`統合 ${info.lufs} LUFS`);
if (!(info.truePeakDb <= LIMITS.truePeak)) problems.push(`真のピーク ${info.truePeakDb} dBTP`);
if (!(info.low >= LIMITS.low[0] && info.low <= LIMITS.low[1])) problems.push(`低域 ${info.low} dB`);
if (!(info.high >= LIMITS.high[0] && info.high <= LIMITS.high[1])) problems.push(`高域 ${info.high} dBFS`);
if (!(Math.abs(info.hookGap) <= LIMITS.hookGap)) problems.push(`フックと本編の差 ${info.hookGap} dB`);
if (info.clipped > LIMITS.clipped) problems.push(`クリップ ${info.clipped}`);
info.problems = problems;

mkdirSync(out, { recursive: true });
const wav = join(out, `score-${VARIANT}.wav`);
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8); header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
header.writeUInt32LE(SAMPLE_RATE, 24); header.writeUInt32LE(SAMPLE_RATE * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
writeFileSync(wav, Buffer.concat([header, pcm]));
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', '192k', join(out, `bgm-${VARIANT}.mp3`)]);
writeFileSync(join(out, `audio-report-${VARIANT}.json`), `${JSON.stringify(info, null, 2)}\n`);
console.log(`${V.label}: 統合 ${info.lufs} LUFS / 真のピーク ${info.truePeakDb} dBTP / 低域 ${info.low} dB / 高域 ${info.high} dBFS / フック差 ${info.hookGap} dB / チャイム +${info.chime.marginDb} dB / クリップ ${info.clipped}`);
console.log(`  場面ごとの RMS: ${JSON.stringify(info.scenes)}  区切り: ${JSON.stringify(info.sections)}`);
if (problems.length) { console.error(`  ⚠ 目標から外れた値: ${problems.join('、')}`); process.exitCode = 1; }
