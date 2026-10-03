// OWNER: audio-tools
// 編曲：譜面（score.mjs）から、層ごと・楽器ごとの「パート」を音の並びにする。1パート＝1つの楽器の音の列で、作業員が別々に作る。
// 音の並びの形：{ inst, t（秒）, d（秒）, m（MIDI）, vel（0〜1）, pan（-1〜1）, opts }。層の名前は calm（静）・rampage（暴）・peak（頂）。
import { BAR, BARS, BEAT, CHORDS, FINALE_THEME, INTRO_FLUTE, BRIDGE_FLUTE, SHORT_CALL, STEP, T, THEME_A, THEME_B, VOICING, melody, midi, sectionOf } from './score.mjs';

// 主題 A の後半（9〜16小節目）。前半の8小節は 21 個の音符
const THEME_A2 = THEME_A.slice(21);

/** 同じ和音が続く小節をまとめる（[{ chord, from, bars }]）。 */
function chordRuns(fromBar = 1, toBar = BARS) {
  const runs = [];
  for (let b = fromBar; b <= toBar; b++) {
    const c = CHORDS[b - 1];
    const last = runs[runs.length - 1];
    if (last && last.chord === c && last.from + last.bars === b) last.bars++;
    else runs.push({ chord: c, from: b, bars: 1 });
  }
  return runs;
}

const inSection = (bar, ...names) => names.includes(sectionOf(bar));

// ------------------------------------------------------------ 静（calm）

function calmPad() {
  return chordRuns().flatMap((r) => {
    const intro = inSection(r.from, 'intro');
    return VOICING[r.chord].pad.map((n, k) => ({ inst: 'strings', t: T(r.from), d: r.bars * BAR - 0.05, m: midi(n), vel: intro ? 0.42 : 0.55, pan: (k - 1.5) * 0.35, opts: { attack: intro ? 1.2 : 0.45, release: 0.9, voices: 5 } }));
  });
}

function calmBass() {
  return chordRuns().map((r) => ({ inst: 'bass', t: T(r.from), d: r.bars * BAR - 0.08, m: midi(VOICING[r.chord].bass), vel: inSection(r.from, 'intro') ? 0.7 : 0.85, pan: 0, opts: { attack: inSection(r.from, 'intro') ? 0.9 : 0.15 } }));
}

function calmKoto() {
  const ev = [];
  for (let bar = 1; bar <= BARS; bar++) {
    const v = VOICING[CHORDS[bar - 1]];
    const sec = sectionOf(bar);
    if (sec === 'intro') {
      if (bar < 3) continue;
      // 導入：1拍目と3拍目にだけ、押し手を混ぜて
      ev.push({ inst: 'koto', t: T(bar, 0), d: 2.5, m: midi(v.arp[0]), vel: 0.7, pan: -0.35, opts: { bend: bar % 2 === 0 ? 1 : 0, bendAt: 0.5 } });
      ev.push({ inst: 'koto', t: T(bar, 8), d: 2.2, m: midi(v.arp[2]), vel: 0.55, pan: -0.3, opts: {} });
    } else if (sec === 'bridge') {
      // 橋渡し：高い音の細かな刻み（トレモロ）
      if (bar > 62) continue;
      for (let s = 0; s < 16; s += 1) ev.push({ inst: 'koto', t: T(bar, s), d: 0.5, m: midi(s % 4 < 2 ? 'D5' : 'Eb5'), vel: 0.28 + 0.1 * Math.sin((s / 16) * Math.PI), pan: -0.3, opts: { bright: 0.8 } });
    } else if (bar <= 70) {
      const busy = sec === 'C' || sec === 'finale';
      for (let k = 0; k < 8; k++) {
        const accent = k === 0 ? 0.85 : k === 4 ? 0.7 : 0.5;
        ev.push({ inst: 'koto', t: T(bar, k * 2), d: 1.8, m: midi(v.arp[k]), vel: accent * (busy ? 0.95 : 0.8), pan: -0.35 + (k % 2) * 0.12, opts: { bend: k === 6 && bar % 4 === 3 ? 1 : 0, bendAt: 0.12 } });
      }
    }
  }
  return ev;
}

function flutePhrase(line, bar, vel = 0.8) {
  const notes = melody(line, bar).map((n) => ({ f: 440 * 2 ** ((n.m - 69) / 12), t: n.t - T(bar), d: n.d, v: vel }));
  return notes.length ? [{ inst: 'flute', t: T(bar), d: notes[notes.length - 1].t + notes[notes.length - 1].d + 0.5, m: 0, vel, pan: 0.2, opts: { notes } }] : [];
}

function calmFlute() {
  // r05-audio：9〜16 小節に短い呼びかけ（SHORT_CALL）を足した
  return [...flutePhrase(INTRO_FLUTE, 1, 0.75), ...flutePhrase(SHORT_CALL, 9, 0.72), ...flutePhrase(THEME_A2, 17, 0.8), ...flutePhrase(BRIDGE_FLUTE, 57, 0.85), ...flutePhrase(FINALE_THEME, 65, 0.9)];
}

function calmTaiko() {
  const ev = [];
  for (let bar = 1; bar <= BARS; bar++) {
    const sec = sectionOf(bar);
    const hit = (step, vel, kind = 'odaiko') => ev.push({ inst: 'drum', t: T(bar, step), d: 2.5, m: 0, vel, pan: 0, opts: { kind } });
    if (sec === 'intro') {
      if (bar % 2 === 1) hit(0, 0.7);
    } else if (sec === 'A') hit(0, 0.75);
    else if (sec === 'B') {
      hit(0, 0.72);
      hit(8, 0.5);
    } else if (sec === 'C') {
      hit(0, 0.85);
      hit(8, 0.65);
    } else if (sec === 'bridge') {
      if (bar === 57) hit(0, 1);
    } else if (bar <= 70) {
      hit(0, 0.85);
      hit(8, 0.65);
    } else if (bar === 71) hit(0, 1);
  }
  return ev;
}

function calmMelody() {
  const mk = (line, bar, vel) => melody(line, bar).map((n) => ({ inst: 'strings', t: n.t, d: n.d, m: n.m, vel, pan: 0.1, opts: { attack: 0.07, release: 0.35, voices: 5 } }));
  return [...mk(THEME_A, 41, 0.62), ...mk(FINALE_THEME, 65, 0.66)];
}

function calmAtmos() {
  return [
    { inst: 'atmos', t: T(1), d: 8 * BAR, m: 0, vel: 0.8, pan: 0, opts: { swell: [0.2, 0.6, 1, 0.5] } },
    { inst: 'atmos', t: T(57), d: 8 * BAR, m: 0, vel: 0.6, pan: 0, opts: { swell: [0.6, 0.9, 0.7, 0.3] } },
  ];
}

// ------------------------------------------------------------ 暴（rampage）

const GROOVE_A = { odaiko: [[0, 1], [6, 0.7], [8, 0.9], [14, 0.62]], nagado: [[4, 0.8], [11, 0.55], [12, 0.8]], ka: [[2, 0.5], [7, 0.4], [10, 0.5], [15, 0.45]] };
const GROOVE_B = { odaiko: [[0, 1], [10, 0.8]], nagado: [[8, 0.9], [14, 0.5]], ka: [[4, 0.5], [12, 0.5], [13, 0.35]] };
/**
 * r05-audio：指摘「暴に居る時間（紅竜で3分の75%）の太鼓が1小節の型のまま」 8小節ごとに型を替える。
 * A2 は3拍目の裏から押し込む、B2 は長胴の後打ち、C1 は4つ打ちで前へ運び、C2 は大太鼓の裏拍で重く揺らす。
 */
const GROOVE_A2 = { odaiko: [[0, 1], [3, 0.6], [8, 0.9], [11, 0.55], [14, 0.62]], nagado: [[4, 0.8], [6, 0.5], [12, 0.85]], ka: [[2, 0.45], [7, 0.4], [10, 0.5], [13, 0.4], [15, 0.45]] };
const GROOVE_B2 = { odaiko: [[0, 1], [6, 0.7], [10, 0.8]], nagado: [[4, 0.6], [8, 0.9], [14, 0.55], [15, 0.45]], ka: [[2, 0.4], [12, 0.5], [13, 0.35]] };
const GROOVE_C1 = { odaiko: [[0, 1], [4, 0.75], [8, 0.9], [12, 0.7]], nagado: [[2, 0.6], [6, 0.55], [10, 0.6], [14, 0.7]], ka: [[3, 0.4], [7, 0.4], [11, 0.4], [15, 0.45]] };
const GROOVE_C2 = { odaiko: [[0, 1], [3, 0.7], [6, 0.85], [10, 0.8], [13, 0.6]], nagado: [[8, 0.9], [12, 0.6], [14, 0.55]], ka: [[2, 0.5], [5, 0.4], [9, 0.45], [15, 0.5]] };

/** 小節の8小節の区切りごとの型（A1・A2・B1・B2・C1・C2・終わり）。 */
function rampageGroove(bar) {
  if (bar <= 16) return { groove: GROOVE_A, scale: 0.9 };
  if (bar <= 24) return { groove: GROOVE_A2, scale: 0.92 };
  if (bar <= 32) return { groove: GROOVE_B, scale: 1 };
  if (bar <= 40) return { groove: GROOVE_B2, scale: 1 };
  if (bar <= 48) return { groove: GROOVE_C1, scale: 1 };
  if (bar <= 56) return { groove: GROOVE_C2, scale: 1 };
  return { groove: GROOVE_C1, scale: 1 };
}

function rampageTaiko() {
  const ev = [];
  const put = (bar, groove, scale = 1) => {
    for (const [kind, hits] of Object.entries(groove)) for (const [s, v] of hits) ev.push({ inst: 'drum', t: T(bar, s), d: 2, m: 0, vel: v * scale, pan: kind === 'nagado' ? -0.2 : kind === 'ka' ? 0.15 : 0, opts: { kind } });
  };
  for (let bar = 1; bar <= BARS; bar++) {
    const sec = sectionOf(bar);
    if (sec === 'intro') {
      put(bar, { odaiko: [[0, 0.62], [3, 0.45]] });
    } else if (sec === 'bridge') {
      if (bar >= 61) {
        const k = (bar - 61) / 3;
        for (const s of [0, 4, 8, 12]) ev.push({ inst: 'drum', t: T(bar, s), d: 2, m: 0, vel: 0.45 + 0.5 * k, pan: 0, opts: { kind: 'odaiko' } });
        if (bar === 64) for (let s = 8; s < 16; s++) ev.push({ inst: 'drum', t: T(bar, s), d: 1, m: 0, vel: 0.35 + 0.08 * (s - 8), pan: -0.2, opts: { kind: 'nagado' } });
      }
    } else if (bar >= 71) {
      if (bar === 71) put(bar, { odaiko: [[0, 1]] });
    } else {
      const { groove, scale } = rampageGroove(bar);
      put(bar, groove, scale);
      // 4小節ごとの最後の拍に、長胴の刻みを入れて次の頭へ運ぶ。8小節の区切り（型が替わる前）は2拍ぶんの長い刻みにする
      if (bar % 8 === 0) for (let s = 8; s < 16; s++) ev.push({ inst: 'drum', t: T(bar, s), d: 1, m: 0, vel: 0.38 + 0.07 * (s - 8), pan: -0.2, opts: { kind: 'nagado' } });
      else if (bar % 4 === 0) for (let s = 12; s < 16; s++) ev.push({ inst: 'drum', t: T(bar, s), d: 1, m: 0, vel: 0.45 + 0.12 * (s - 12), pan: -0.2, opts: { kind: 'nagado' } });
    }
  }
  return ev;
}

function rampageBrass() {
  const ev = [];
  const low = (line, bar, vel) => melody(line, bar, -12).forEach((n) => ev.push({ inst: 'brass', t: n.t, d: n.d, m: n.m, vel, pan: -0.15, opts: { attack: 0.07, release: 0.22, voices: 3 } }));
  // 導入：低い持続がふくらむ（E♭の緊張から D へ）
  ev.push({ inst: 'brass', t: T(5), d: 2 * BAR, m: midi('Eb2'), vel: 0.55, pan: 0, opts: { attack: 2, release: 0.6, voices: 3 } });
  ev.push({ inst: 'brass', t: T(5), d: 2 * BAR, m: midi('Bb2'), vel: 0.45, pan: 0.2, opts: { attack: 2, release: 0.6, voices: 2 } });
  ev.push({ inst: 'brass', t: T(7), d: 2 * BAR, m: midi('D2'), vel: 0.6, pan: 0, opts: { attack: 1.2, release: 0.6, voices: 3 } });
  ev.push({ inst: 'brass', t: T(7), d: 2 * BAR, m: midi('A2'), vel: 0.5, pan: 0.2, opts: { attack: 1.2, release: 0.6, voices: 2 } });
  // A の前半：和音の変わり目に短い合いの手、後半は主題を低く
  for (const r of chordRuns(9, 16)) for (const n of VOICING[r.chord].pad.slice(0, 2)) ev.push({ inst: 'brass', t: T(r.from), d: BEAT * 1.5, m: midi(n), vel: 0.7, pan: 0, opts: { attack: 0.03, release: 0.3, voices: 3 } });
  // r05-audio：13〜16 小節は、静の笛の短い呼びかけを1オクターブ下でなぞる（暴の段階で 9〜16 小節に答えが入る）
  low(SHORT_CALL.slice(13), 13, 0.66);
  low(THEME_A2, 17, 0.72);
  // B：和音ごとの短い強打（根音と5度）
  for (const r of chordRuns(25, 40)) {
    for (const n of VOICING[r.chord].pad.slice(0, 2)) {
      ev.push({ inst: 'brass', t: T(r.from), d: BEAT * 2, m: midi(n), vel: 0.78, pan: 0, opts: { attack: 0.03, release: 0.35, voices: 3 } });
      ev.push({ inst: 'brass', t: T(r.from + 1, 8), d: BEAT, m: midi(n), vel: 0.6, pan: 0, opts: { attack: 0.03, release: 0.25, voices: 3 } });
    }
  }
  low(THEME_A, 41, 0.8);
  // 橋渡し：低い持続
  ev.push({ inst: 'brass', t: T(57), d: 4 * BAR, m: midi('Eb2'), vel: 0.5, pan: 0, opts: { attack: 1.5, release: 1, voices: 3 } });
  ev.push({ inst: 'brass', t: T(61), d: 4 * BAR, m: midi('D2'), vel: 0.6, pan: 0, opts: { attack: 1, release: 0.6, voices: 3 } });
  low(FINALE_THEME, 65, 0.82);
  return ev;
}

function spiccatoPattern(bar, octave = 0) {
  const v = VOICING[CHORDS[bar - 1]];
  const root = midi(v.pad[0]) + (midi(v.pad[0]) < 48 ? 12 : 0) + octave;
  const fifth = midi(v.pad[1]) + (midi(v.pad[1]) < 50 ? 12 : 0) + octave;
  return [root, root, fifth, root, root + 12, root, fifth, root];
}

// r02-audio：指摘「暴の層は 2kHz より上が 0.7% しかなく、段階を上げるほど曲が暗くなる」 弦の刻みを A 区間から始め、1オクターブ上の刻みと締太鼓を足した
function rampageSpiccato() {
  const ev = [];
  for (let bar = 9; bar <= 70; bar++) {
    const sec = sectionOf(bar);
    if (sec === 'bridge') continue;
    const pattern = spiccatoPattern(bar);
    const soft = sec === 'A' ? 0.8 : 1;
    for (let k = 0; k < 8; k++) ev.push({ inst: 'strings', t: T(bar, k * 2), d: BEAT / 2, m: pattern[k], vel: (k % 2 === 0 ? 0.6 : 0.45) * soft, pan: 0.25, opts: { mode: 'spiccato', voices: 4 } });
  }
  return ev;
}

/** 1オクターブ上の弦の刻み（16分の裏を混ぜて、低い刻みと噛み合わせる）。 */
function rampageSpiccatoHigh() {
  const ev = [];
  for (let bar = 9; bar <= 70; bar++) {
    const sec = sectionOf(bar);
    if (sec === 'bridge') continue;
    const pattern = spiccatoPattern(bar, 12);
    const steps = sec === 'A' ? [2, 6, 10, 14] : [1, 3, 6, 9, 11, 14];
    steps.forEach((st, k) => ev.push({ inst: 'strings', t: T(bar, st), d: BEAT / 2, m: pattern[(k * 3 + 1) % 8], vel: 0.5 + 0.1 * (k % 2), pan: -0.3, opts: { mode: 'spiccato', voices: 3 } }));
  }
  return ev;
}

/** 暴の締太鼓：8分の刻み（頭と裏に強弱）。頂の締太鼓（16分）より粗く、段階の差が残るようにする。 */
function rampageShime() {
  const ev = [];
  for (let bar = 9; bar <= 70; bar++) {
    const sec = sectionOf(bar);
    if (sec === 'bridge') continue;
    for (let s = 0; s < 16; s += 2) {
      const vel = s % 8 === 0 ? 0.7 : s % 4 === 0 ? 0.5 : 0.36;
      ev.push({ inst: 'drum', t: T(bar, s), d: 0.5, m: 0, vel, pan: 0.35, opts: { kind: 'shime' } });
    }
  }
  return ev;
}

// ------------------------------------------------------------ 頂（peak）

function peakShime() {
  const ev = [];
  const s16 = (bar, from, to, velFn) => {
    for (let s = from; s < to; s++) ev.push({ inst: 'drum', t: T(bar, s), d: 0.5, m: 0, vel: velFn(s), pan: 0.3, opts: { kind: 'shime' } });
  };
  for (let bar = 1; bar <= BARS; bar++) {
    const sec = sectionOf(bar);
    if (sec === 'intro') {
      if (bar >= 7) s16(bar, 0, 16, (s) => 0.2 + 0.5 * ((bar - 7) * 16 + s) / 32);
    } else if (sec === 'B') {
      s16(bar, 0, 16, (s) => (s % 2 === 0 ? (s % 4 === 0 ? 0.8 : 0.5) : 0));
    } else if (sec === 'bridge') {
      if (bar >= 63) s16(bar, 0, 16, (s) => 0.25 + 0.6 * ((bar - 63) * 16 + s) / 32);
    } else if (bar <= 70) {
      s16(bar, 0, 16, (s) => (s % 4 === 0 ? 0.9 : s % 2 === 0 ? 0.55 : 0.4));
    }
  }
  return ev.filter((e) => e.vel > 0);
}

function peakOdaiko() {
  const ev = [];
  for (let bar = 9; bar <= 71; bar++) {
    const sec = sectionOf(bar);
    if (sec === 'bridge') continue;
    if (bar === 71) {
      ev.push({ inst: 'drum', t: T(bar), d: 2.5, m: 0, vel: 1, pan: 0, opts: { kind: 'odaiko', pitch: 0.9 } });
      continue;
    }
    const hits = sec === 'B' ? [[6, 0.7]] : [[3, 0.75], [11, 0.7]];
    for (const [s, v] of hits) ev.push({ inst: 'drum', t: T(bar, s), d: 2.5, m: 0, vel: v, pan: 0.05, opts: { kind: 'odaiko', pitch: 1.06 } });
  }
  return ev;
}

function peakChappa() {
  const ev = [];
  for (let bar = 9; bar <= 70; bar++) {
    const sec = sectionOf(bar);
    if (sec === 'bridge') continue;
    // r02-audio：頂を明るくするため、8分の裏を打つ（旧：2拍目と4拍目だけ）
    const steps = sec === 'B' ? [4, 8, 12] : [2, 6, 10, 14];
    for (const s of steps) ev.push({ inst: 'chappa', t: T(bar, s), d: 1, m: 0, vel: s % 8 === 6 || s === 8 ? 0.75 : 0.6, pan: 0.4, opts: { set: (bar + s) % 3 } });
  }
  return ev;
}

/**
 * 頂の明るい旋律：篠笛に似た高い笛で、主題を1オクターブ上に吹く（A 区間の頭から。どの段階にも旋律が無かった 9〜16 小節にも入る）。
 * r02-audio：指摘「頂を上げても曲が暗くなる・9〜16小節に旋律が無い」 頂に上がったご褒美として、高く明るい旋律を足した。
 */
function peakShinobue() {
  const phrase = (line, bar, vel) => {
    const notes = melody(line, bar, 12).map((n) => ({ f: 440 * 2 ** ((n.m - 69) / 12), t: n.t - T(bar), d: n.d, v: vel }));
    return notes.length ? [{ inst: 'flute', t: T(bar), d: notes[notes.length - 1].t + notes[notes.length - 1].d + 0.5, m: 0, vel, pan: -0.25, opts: { notes, bright: 1 } }] : [];
  };
  return [...phrase(THEME_A, 9, 0.75), ...phrase(THEME_A, 41, 0.85), ...phrase(FINALE_THEME, 65, 0.9)];
}

function peakHorns() {
  const ev = [];
  const line = (l, bar, vel, tr = 0) => melody(l, bar, tr).forEach((n) => ev.push({ inst: 'brass', t: n.t, d: n.d, m: n.m, vel, pan: 0.3, opts: { attack: 0.06, release: 0.25, voices: 3, bright: true } }));
  line(THEME_B, 25, 0.7);
  line(THEME_A, 41, 0.78);
  line(FINALE_THEME, 65, 0.82);
  return ev;
}

function peakChoir() {
  const ev = [];
  for (const r of chordRuns(41, 72)) {
    const sec = sectionOf(r.from);
    if (sec === 'finale' && r.from >= 71) {
      for (const n of ['D3', 'A3', 'D4']) ev.push({ inst: 'choir', t: T(r.from), d: 2 * BAR, m: midi(n), vel: 0.6, pan: 0, opts: { vowel: 'o', attack: 0.3, release: 2 } });
      continue;
    }
    for (const n of VOICING[r.chord].pad.slice(1)) ev.push({ inst: 'choir', t: T(r.from), d: r.bars * BAR - 0.1, m: midi(n), vel: sec === 'bridge' ? 0.45 : 0.55, pan: 0, opts: { vowel: sec === 'bridge' ? 'o' : 'a' } });
  }
  return ev;
}

function peakTremolo() {
  const ev = [];
  for (const r of [...chordRuns(41, 56), ...chordRuns(65, 70)]) {
    for (const n of VOICING[r.chord].pad.slice(1)) ev.push({ inst: 'strings', t: T(r.from), d: r.bars * BAR - 0.05, m: midi(n) + 12, vel: 0.4, pan: -0.3, opts: { mode: 'tremolo', attack: 0.2, voices: 4 } });
  }
  return ev;
}

// ------------------------------------------------------------ r06-audio：63 小節目の後に足す「溜め」の小節と、長胴のつなぎの小節
//
// 指摘「時間切れに合わせるため、遊びでは同じ波形の 63 小節目を3〜4回足すので、8〜12秒同じ小節が回る」
// 63 小節目の後に挟むための小節を、曲とは別の帯（溜めの帯）に作る。帯の並び：元の曲の 57〜63 小節（前置き：残響と続く音をつなぐため）
// → 溜めの小節4つ（1回ごとに少しずつ盛り上がる）→ 長胴のつなぎの小節1つ → 元の曲の 64〜65 小節（後置き：64 小節目へ重ねて戻るため）。
// 塊に入れるのは溜めの小節とつなぎの小節（5小節）だけ。和音は A の sus4（64 小節目の A へ解ける前の溜め）のまま、太鼓が細かく、金管と合唱がふくらむ。
// つなぎの小節は、小節の終わりへ向けて長胴の16分が強くなる。端数の拍（1〜3拍）はこの小節の終わりの拍を鳴らすので、どの長さでも 64 小節目の頭へ運ぶ。

/** 溜めの帯の作り：前置きの始まりの小節・溜めの小節の数・つなぎの小節の番号（溜めの小節の後）・塊の小節の数・挟む所（64 小節の頭） */
export const HOLD = { contextFrom: 57, holds: 4, leadIn: 4, bars: 5, splitBar: 64, afterBars: 2 };

const CTX0 = T(HOLD.contextFrom);
const SPLIT = T(HOLD.splitBar);
const HOLD_LEN = HOLD.bars * BAR;
/** 溜めの帯の長さ（前置き＋溜め＋つなぎ＋後置き、秒） */
export const HOLD_TIMELINE = SPLIT - CTX0 + HOLD_LEN + HOLD.afterBars * BAR;
/** 溜めの帯の中で、k 番目（0 から。HOLD.leadIn はつなぎの小節）の小節の step の時刻（秒） */
export const holdT = (k, step = 0) => SPLIT - CTX0 + k * BAR + step * STEP;
/** 塊（溜めの小節の頭から、つなぎの小節の終わりまで）の帯の中の時刻 */
export const HOLD_CHUNK = { from: holdT(0), to: holdT(HOLD.bars) };

/** 元の曲の時刻 → 溜めの帯の時刻（64 小節の頭より後は、挟んだ長さだけ後ろへ） */
const vt = (t) => (t < SPLIT - 1e-9 ? t - CTX0 : t - CTX0 + HOLD_LEN);
const SUSTAINED = new Set(['strings', 'brass', 'choir', 'bass']);

/**
 * 元の曲の音の並びから、溜めの帯の前置き（57〜63 小節）と後置き（64〜65 小節）を作り、溜めの小節の音を足す。
 * 64 小節の頭をまたいで続く音（低い金管の持続など）は、挟んだ長さだけ伸ばして続ける（64 小節目へ戻ったとき、続く音が途中から現れない）。
 * 笛は旋律の句を 64 小節の頭で2つに分け、霧（atmos）は帯の長さに合わせて膨らみを作り直す。
 */
function withHold(events, hold) {
  const out = [];
  const until = T(HOLD.splitBar + HOLD.afterBars);
  for (const e of events) {
    if (e.t < CTX0 - 1e-9 || e.t >= until) continue;
    const crosses = e.t < SPLIT - 1e-9 && e.t + e.d > SPLIT + 1e-9;
    if (!crosses) {
      out.push({ ...e, t: vt(e.t) });
      continue;
    }
    if (e.inst === 'flute') {
      const rel = SPLIT - e.t;
      const before = e.opts.notes.filter((n) => n.t < rel - 1e-9);
      const after = e.opts.notes.filter((n) => n.t >= rel - 1e-9).map((n) => ({ ...n, t: n.t - rel }));
      if (before.length) out.push({ ...e, t: vt(e.t), d: before[before.length - 1].t + before[before.length - 1].d + 0.5, opts: { ...e.opts, notes: before } });
      if (after.length) out.push({ ...e, t: vt(SPLIT), d: after[after.length - 1].t + after[after.length - 1].d + 0.5, opts: { ...e.opts, notes: after } });
    } else if (e.inst === 'atmos') {
      // 元の膨らみ（小節ごとの値）を前置きと後置きに残し、溜めの間は少しずつ下げながら保つ
      const sw = e.opts.swell;
      const orig = (u) => {
        const x = Math.max(0, Math.min(1, u)) * (sw.length - 1);
        const k = Math.min(sw.length - 2, Math.floor(x));
        return sw[k] + (sw[k + 1] - sw[k]) * (x - k);
      };
      const bars = Math.round(e.d / BAR);
      const before = Math.round((SPLIT - e.t) / BAR);
      const pts = [];
      for (let b = 0; b <= before; b++) pts.push(orig(b / bars));
      const v0 = orig(before / bars);
      for (let k = 1; k < HOLD.bars; k++) pts.push(v0 * (1 - 0.04 * k));
      for (let b = before; b <= bars; b++) pts.push(orig(b / bars));
      out.push({ ...e, t: vt(e.t), d: e.d + HOLD_LEN, opts: { ...e.opts, swell: pts } });
    } else if (SUSTAINED.has(e.inst)) out.push({ ...e, t: vt(e.t), d: e.d + HOLD_LEN });
    else out.push({ ...e, t: vt(e.t) });
  }
  return [...out, ...hold];
}

/**
 * 溜めの小節の層ごとの大きさの調整（dB、溜めの小節1〜4とつなぎの小節）。元の曲では橋渡しの間は静の層が主で、暴と頂の層は小さい
 * （63 小節目の層だけの大きさ：静 -18.1・暴 -28.6・頂 -26.6 LUFS、64 小節目：-20.4・-24.3・-25.7）。溜めの小節はその間で少しずつ上げ、
 * 段階の混ぜ方の大きさが 63 小節目から 1.5dB ほどしか上がらないようにした（盛り上がりは刻みの細かさで出す）。64 小節目へ解ける所で萎まないように
 */
const HOLD_STEM_DB = { calm: [0, 0, 0, -0.6, -1.2], rampage: [-2.4, -2.3, -4.2, -6.3, -6.3], peak: [-0.2, -1.8, -2.9, -3.7, -4.7] };

/** 溜めの帯の中の時刻 t が、何番目の溜めの小節か（溜めの外は -1） */
const holdBarOf = (t) => {
  const k = Math.floor((t - holdT(0) + 1e-6) / BAR);
  return k >= 0 && k < HOLD.bars ? k : -1;
};

/** 溜めの小節 k（0〜3）とつなぎの小節（HOLD.leadIn）に、16分の位置 steps で打つ。vel は 16分の位置から決める関数か数 */
function holdHits(k, steps, vel, extra) {
  return steps.map((s) => ({ t: holdT(k, s), vel: typeof vel === 'function' ? vel(s) : vel, ...extra }));
}

const ASUS = VOICING.Asus;
const L = HOLD.leadIn;
const HOLD_KS = [0, 1, 2, 3];
const ramp = (from, to) => (s) => from + ((to - from) * s) / 15;

// 溜めの小節の大きさは、元の 63 小節目（静 -18・暴 -17.6・頂 -17.1 LUFS）から始め、4つ目で約 +1.5dB まで少しずつ上げる。
// 盛り上がりは大きさより、刻みの細かさ（4分→8分→16分）と積む音の数で出す。つなぎの小節は 64 小節目の大きさを大きく超えない（解ける所で萎まないように）。

function holdCalmPad() {
  return [...HOLD_KS, L].flatMap((k) => ASUS.pad.map((n, i) => ({ inst: 'strings', t: holdT(k), d: BAR - 0.05, m: midi(n), vel: 0.55 + 0.02 * k, pan: (i - 1.5) * 0.35, opts: { attack: 0.35, release: 0.9, voices: 5 } })));
}

function holdCalmBass() {
  const ev = [];
  const sustain = (k, vel) => ev.push({ inst: 'bass', t: holdT(k), d: BAR - 0.08, m: midi(ASUS.bass), vel, pan: 0, opts: { attack: 0.15 } });
  sustain(0, 0.82);
  sustain(1, 0.83);
  // 3つ目と4つ目は低音が8分で刻む（前へ押し出す）
  for (const k of [2, 3]) for (let s = 0; s < 16; s += 2) ev.push({ inst: 'bass', t: holdT(k, s), d: BEAT * 0.45, m: midi(ASUS.bass), vel: (s % 4 === 0 ? 0.76 : 0.6) + 0.02 * (k - 2), pan: 0, opts: { attack: 0.02, release: 0.12 } });
  sustain(L, 0.84);
  return ev;
}

/**
 * 笛：63 小節目の A を引き継いで、溜めの間に短い問いを吹く（A → B♭ の溜息 → D・B♭ → E♭ の張り → A へ戻る）。
 * 1つの句なので、溜めの小節は途中で切っても息が続く。つなぎの小節の A は、64 小節目の A へそのまま入る。
 */
function holdCalmFlute() {
  const line = [['A4', 4], ['Bb4', 1], ['A4', 3], ['D5', 2], ['Bb4', 1], ['A4', 1], ['Eb5', 2], ['D5', 1], ['Bb4', 1], ['A4', 4]];
  // 句の後ろほど少し弱く吹く（溜めの終わりは太鼓の刻みが細かくなるので、笛は引いて 64 小節目の大きさへ寄せる）
  const vOf = [0.78, 0.78, 0.76, 0.68, 0.62];
  const notes = melody(line, 1).map((n) => ({ f: 440 * 2 ** ((n.m - 69) / 12), t: n.t, d: n.d, v: vOf[Math.min(4, Math.floor(n.t / BAR + 1e-6))] }));
  return [{ inst: 'flute', t: holdT(0), d: notes[notes.length - 1].t + notes[notes.length - 1].d + 0.5, m: 0, vel: 0.8, pan: 0.2, opts: { notes } }];
}

function holdCalmKoto() {
  // 琴の細かな刻み（sus4 の D と E）：1つ目は8分、2つ目から16分。少しずつ強く
  const ev = [];
  for (const k of [...HOLD_KS, L]) {
    const step = k === 0 ? 2 : 1;
    for (let s = 0; s < 16; s += step) {
      const base = 0.3 + 0.03 * k;
      ev.push({ inst: 'koto', t: holdT(k, s), d: 0.5, m: midi(s % 4 < 2 ? 'D5' : 'E5'), vel: base + 0.05 * (s / 16), pan: -0.3, opts: { bright: 0.8 } });
    }
  }
  return ev;
}

function holdCalmTaiko() {
  const ev = [];
  const hit = (k, s, vel, kind = 'odaiko') => ev.push({ inst: 'drum', t: holdT(k, s), d: 2.5, m: 0, vel, pan: kind === 'nagado' ? -0.2 : 0, opts: { kind } });
  hit(0, 0, 0.5);
  hit(1, 0, 0.55);
  hit(2, 0, 0.58);
  hit(2, 8, 0.48);
  for (const s of [0, 4, 8, 12]) hit(3, s, 0.56 + 0.025 * (s / 4));
  // つなぎ：静の層でも、端数の拍が拍の頭へ運ぶつなぎに聞こえるよう、長胴を16分で弱く打ち込む
  hit(L, 0, 0.6);
  for (let s = 0; s < 16; s++) hit(L, s, 0.2 + 0.32 * (s / 15), 'nagado');
  return ev;
}

function holdRampageTaiko() {
  const ev = [];
  const put = (k, kind, steps, vel) => holdHits(k, steps, vel, { inst: 'drum', d: 2, m: 0, pan: kind === 'nagado' ? -0.2 : kind === 'ka' ? 0.15 : 0, opts: { kind } }).forEach((e) => ev.push(e));
  const all16 = Array.from({ length: 16 }, (_, s) => s);
  const eighths = [0, 2, 4, 6, 8, 10, 12, 14];
  // 1つ目：4つ打ちに長胴の裏
  put(0, 'odaiko', [0, 4, 8, 12], (s) => [0.8, 0.7, 0.75, 0.7][s / 4]);
  put(0, 'nagado', [2, 6, 10, 14], 0.36);
  // 2つ目：裏の長胴を強く、縁を2つ
  put(1, 'odaiko', [0, 4, 8, 12], (s) => [0.8, 0.7, 0.76, 0.72][s / 4]);
  put(1, 'nagado', [2, 6, 10, 14, 15], (s) => (s === 15 ? 0.46 : 0.42));
  put(1, 'ka', [3, 11], 0.3);
  // 3つ目：大太鼓が8分、後半に長胴の16分
  put(2, 'odaiko', eighths, (s) => (s % 4 === 0 ? 0.8 : 0.45));
  put(2, 'nagado', all16.slice(8), (s) => 0.3 + 0.2 * ((s - 8) / 7));
  // 4つ目：大太鼓の8分に、長胴の16分が小節を通して強くなる
  put(3, 'odaiko', eighths, (s) => (s % 4 === 0 ? 0.82 : 0.48));
  put(3, 'nagado', all16, ramp(0.3, 0.58));
  put(3, 'ka', [4, 12], 0.4);
  // つなぎ：大太鼓の4つ打ちと、長胴の16分の連打が小節の終わりへ向けて強くなる（どの拍から鳴らしても、最後の拍が一番強い）
  put(L, 'odaiko', [0, 4, 8, 12], 0.82);
  put(L, 'nagado', all16, ramp(0.25, 0.8));
  put(L, 'ka', [15], 0.5);
  return ev;
}

function holdRampageBrass() {
  // 金管のふくらみ：小節ごとに音を1つずつ積む（低い D の持続は前置きから伸ばして続ける）
  const stacks = [['A2'], ['A2', 'E3'], ['A2', 'E3', 'A3'], ['A2', 'E3', 'A3', 'D4'], ['A2', 'E3', 'A3', 'D4']];
  return [...HOLD_KS, L].flatMap((k) => stacks[k].map((n, i) => ({ inst: 'brass', t: holdT(k), d: BAR, m: midi(n), vel: 0.42 + 0.035 * k, pan: (i - 1.5) * 0.12, opts: { attack: k === L ? 0.6 : 1.6, release: 0.5, voices: 3 } })));
}

function holdRampageSpiccato() {
  const pattern = spiccatoPattern(63);
  return [2, 3, L].flatMap((k, j) => pattern.map((m, i) => ({ inst: 'strings', t: holdT(k, i * 2), d: BEAT / 2, m, vel: (i % 2 === 0 ? 0.44 : 0.33) + 0.03 * j, pan: 0.25, opts: { mode: 'spiccato', voices: 4 } })));
}

function holdRampageSpiccatoHigh() {
  const pattern = spiccatoPattern(63, 12);
  return [3, L].flatMap((k) => [1, 3, 6, 9, 11, 14].map((st, i) => ({ inst: 'strings', t: holdT(k, st), d: BEAT / 2, m: pattern[(i * 3 + 1) % 8], vel: 0.4 + 0.06 * (i % 2), pan: -0.3, opts: { mode: 'spiccato', voices: 3 } })));
}

function holdRampageShime() {
  const ev = [];
  const put = (k, steps, vel) => holdHits(k, steps, vel, { inst: 'drum', d: 0.5, m: 0, pan: 0.35, opts: { kind: 'shime' } }).forEach((e) => ev.push(e));
  const all16 = Array.from({ length: 16 }, (_, s) => s);
  put(1, [0, 2, 4, 6, 8, 10, 12, 14], (s) => (s % 8 === 0 ? 0.3 : 0.24));
  put(2, [0, 2, 4, 6, 8, 10, 12, 14], (s) => (s % 8 === 0 ? 0.38 : s % 4 === 0 ? 0.32 : 0.26));
  put(3, all16, (s) => (s % 4 === 0 ? 0.4 : 0.28));
  put(L, all16, ramp(0.28, 0.6));
  return ev;
}

function holdPeakShime() {
  const ev = [];
  const all16 = Array.from({ length: 16 }, (_, s) => s);
  for (const k of [...HOLD_KS, L]) {
    const lo = 0.42 + 0.03 * k;
    const hi = 0.5 + 0.05 * k;
    holdHits(k, all16, k === L ? ramp(0.5, 0.8) : (s) => (s % 4 === 0 ? hi : lo), { inst: 'drum', d: 0.5, m: 0, pan: 0.3, opts: { kind: 'shime' } }).forEach((e) => ev.push(e));
  }
  return ev;
}

function holdPeakOdaiko() {
  const ev = [];
  const put = (k, steps, vel) => holdHits(k, steps, vel, { inst: 'drum', d: 2.5, m: 0, pan: 0.05, opts: { kind: 'odaiko', pitch: 1.06 } }).forEach((e) => ev.push(e));
  put(2, [6, 14], 0.55);
  put(3, [3, 6, 11, 14], 0.58);
  put(L, [3, 7, 11, 15], 0.62);
  return ev;
}

function holdPeakChappa() {
  const ev = [];
  const put = (k, steps, vel) => holdHits(k, steps, vel, { inst: 'chappa', d: 1, m: 0, pan: 0.4 }).forEach((e) => ev.push({ ...e, opts: { set: (k + Math.round(e.t * 4)) % 3 } }));
  put(1, [8], 0.45);
  put(2, [4, 12], 0.5);
  put(3, [2, 6, 10, 14], 0.52);
  put(L, [2, 6, 10, 12, 13, 14, 15], (s) => 0.5 + 0.12 * (s / 15));
  return ev;
}

function holdPeakChoir() {
  return [...HOLD_KS, L].flatMap((k) => ASUS.pad.slice(1).map((n) => ({ inst: 'choir', t: holdT(k), d: BAR - 0.1, m: midi(n), vel: k === L ? 0.52 : 0.45 + 0.02 * k, pan: 0, opts: { vowel: k >= 3 ? 'a' : 'o' } })));
}

function holdPeakHorns() {
  const ev = [];
  const blow = (k, step, beats, notes, vel) => notes.forEach((n) => ev.push({ inst: 'brass', t: holdT(k, step), d: BEAT * beats, m: midi(n), vel, pan: 0.3, opts: { attack: 0.06, release: 0.25, voices: 3, bright: true } }));
  blow(2, 0, 1.5, ['A3'], 0.48);
  blow(2, 10, 1.5, ['A3'], 0.44);
  blow(3, 0, 1.5, ['A3', 'E4'], 0.52);
  blow(3, 8, 1, ['A3', 'E4'], 0.5);
  blow(3, 12, 1, ['A3', 'E4'], 0.52);
  blow(L, 0, 2, ['A3', 'E4', 'A4'], 0.56);
  blow(L, 8, 2, ['A3', 'E4', 'A4'], 0.58);
  return ev;
}

function holdPeakTremolo() {
  return [1, 2, 3, L].flatMap((k, j) => ASUS.pad.slice(1).map((n) => ({ inst: 'strings', t: holdT(k), d: BAR - 0.05, m: midi(n) + 12, vel: 0.28 + 0.03 * j, pan: -0.3, opts: { mode: 'tremolo', attack: 0.2, voices: 4 } })));
}

/**
 * パートの一覧：名前 → { stem, send（ホールの残響へ送る量）, gain（層の中の音量、dB）, events(), hold() }。
 * gain は楽器ごとの出力の大きさの違い（琴は弦の輪なので小さい、弦は5本重ねなので大きい）をならした値。
 * r00d：最初の版は弦の和音が琴より 23dB 大きく、2kHz より上が 1% しかなかったので、各パートの実効値を見て合わせ直した。
 * hold() は溜めの帯の音の並び（r06-audio）。
 */
const part = (stem, send, gain, events, hold = () => []) => ({
  stem,
  send,
  gain,
  events,
  hold: () =>
    withHold(
      events(),
      hold().map((e) => {
        const k = holdBarOf(e.t);
        return k < 0 ? e : { ...e, gain: 10 ** ((HOLD_STEM_DB[stem]?.[k] ?? 0) / 20) };
      }),
    ),
});

export const PARTS = {
  'calm.pad': part('calm', 0.35, -18, calmPad, holdCalmPad),
  'calm.bass': part('calm', 0.05, -9, calmBass, holdCalmBass),
  'calm.koto': part('calm', 0.3, 5, calmKoto, holdCalmKoto),
  'calm.flute': part('calm', 0.45, -5.5, calmFlute, holdCalmFlute),
  'calm.taiko': part('calm', 0.25, -2, calmTaiko, holdCalmTaiko),
  'calm.melody': part('calm', 0.35, -6.5, calmMelody),
  'calm.atmos': part('calm', 0.4, -13, calmAtmos),
  // r02-audio：暴の層は 72% が 250Hz 未満だった。太鼓と低い金管を少し下げ、高い刻みを上げて、層ごとの音量合わせ（mixdown）に任せる
  'rampage.taiko': part('rampage', 0.2, -4.5, rampageTaiko, holdRampageTaiko),
  'rampage.brass': part('rampage', 0.25, -10, rampageBrass, holdRampageBrass),
  'rampage.spiccato': part('rampage', 0.25, -1, rampageSpiccato, holdRampageSpiccato),
  'rampage.spiccatoHigh': part('rampage', 0.25, 0, rampageSpiccatoHigh, holdRampageSpiccatoHigh),
  'rampage.shime': part('rampage', 0.12, -4, rampageShime, holdRampageShime),
  'peak.shime': part('peak', 0.12, -5, peakShime, holdPeakShime),
  'peak.odaiko': part('peak', 0.22, -4, peakOdaiko, holdPeakOdaiko),
  'peak.chappa': part('peak', 0.25, -3, peakChappa, holdPeakChappa),
  'peak.horns': part('peak', 0.25, -10, peakHorns, holdPeakHorns),
  'peak.choir': part('peak', 0.5, -7, peakChoir, holdPeakChoir),
  'peak.tremolo': part('peak', 0.3, -10.5, peakTremolo, holdPeakTremolo),
  'peak.shinobue': part('peak', 0.4, -9, peakShinobue),
};

export const STEMS = ['calm', 'rampage', 'peak'];
export { STEP };
