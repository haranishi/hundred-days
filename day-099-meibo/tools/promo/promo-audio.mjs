// Day099 "meibo" BGM（A案・B案）と効果音の合成器。
// すべての発振器・ノイズ・エンベロープ・ミキシング・マスタリングを Node の計算だけで行う。
// サンプル素材・既存曲の旋律・外部 API は一切使わない。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { BAR, BARS, BEAT, BPM, CUES, DURATION_SECONDS, FADE_OUT_SECONDS, FPS, STORYBOARD, at, bar } from './timeline.mjs';

export const RATE = 48_000;
export const FRAMES = Math.round(DURATION_SECONDS * RATE);
export const FADE = FADE_OUT_SECONDS;
export const TARGET_LUFS = -16;
const TAU = 2 * Math.PI;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const stereo = (seconds) => new Float32Array(Math.ceil(seconds * RATE) * 2);

// 主要な合図（直前に伴奏が軽く息継ぎして音を抜かせる）
export const MAJOR_GESTURES = new Set(['pop', 'won', 'tally', 'end']);
const dropAt = STORYBOARD.find((s) => s.music === 'drop').start;

// A案：ト長調（G major）・明るい粒立ったマリンバ系の分散和音とクラップ
// B案：ヘ長調（F major）・温かいエレピとブラシ・丸いベース
export const SCORES = {
  a: {
    title: '朝のリスト',
    key: 'G major',
    voicings: {
      Gmaj7: [43, [62, 66, 67, 71]],
      'D/F#': [42, [62, 66, 69, 74]],
      Em7: [40, [62, 64, 67, 71]],
      Cmaj9: [36, [60, 62, 64, 67]],
      Am9: [45, [60, 64, 67, 71]],
      D13: [38, [60, 66, 69, 71]],
      Gmaj9: [43, [62, 66, 69, 71]],
      Bm7: [47, [62, 66, 69, 71]],
      Am7: [45, [60, 64, 67, 72]],
      D9sus4: [38, [60, 64, 67, 69]],
      'G6/9': [43, [62, 64, 67, 71]],
    },
    // bar 0–1 は呼出音のみ（BGMなし）。bar 2（4.0秒）から BGM 開始。
    changes: [
      null, null,
      'Gmaj7', 'D/F#',
      'Em7', 'Cmaj9',
      'Am9', 'D13',
      'Gmaj9', 'Bm7', 'Cmaj9',
      'Am7', 'D9sus4',
      'G6/9', 'G6/9',
    ],
    scale: [67, 69, 71, 74, 76, 79, 81, 83],
    wonChord: [71, 74, 78, 83],
    tallyNotes: [74, 76, 79, 83],
    // 小節番号 -> [拍, MIDI, 拍長]（完全オリジナルの旋律）
    melody: {
      2: [[.5, 74, .45], [1.5, 71, .55], [2.5, 74, .45], [3.25, 76, .6]],
      3: [[.5, 78, .65], [1.75, 74, .5], [2.75, 71, .8]],
      4: [[.5, 71, .5], [1.5, 74, .45], [2.25, 76, .7], [3.25, 74, .55]],
      5: [[0, 72, .75], [1.25, 71, .45], [2, 67, .85]],
      6: [[.5, 72, .5], [1.5, 76, .55], [2.5, 74, .5], [3.25, 72, .55]],
      7: [[0, 74, .7], [1.5, 78, .55], [2.5, 81, .75]],
      8: [[0, 79, .85], [1.25, 78, .45], [2, 74, .65], [3, 76, .75]],
      9: [[0, 78, .75], [1.5, 74, .55], [2.5, 71, .8]],
      10: [[0, 76, .8], [1.25, 74, .45], [2, 79, .9], [3.25, 76, .55]],
      11: [[.5, 76, .65], [2, 74, .65], [3, 72, .7]],
      12: [[.5, 74, .8], [2, 71, .9]],
    },
  },
  b: {
    title: '机の灯り',
    key: 'F major',
    voicings: {
      Fmaj9: [41, [57, 60, 64, 67]],
      Dm9: [38, [57, 60, 64, 65]],
      Gm9: [43, [58, 62, 65, 69]],
      C13: [36, [58, 62, 64, 69]],
      'B♭maj9': [46, [57, 60, 62, 65]],
      Am7: [45, [57, 60, 64, 67]],
      C9sus4: [36, [58, 60, 62, 65]],
      'B♭maj7': [46, [57, 62, 65, 69]],
      'F6/9': [41, [57, 60, 62, 67]],
    },
    changes: [
      null, null,
      'Fmaj9', 'Dm9',
      'Gm9', 'C13',
      'B♭maj9', 'Am7',
      'Gm9', 'C9sus4', 'Fmaj9',
      'B♭maj7', 'C13',
      'F6/9', 'F6/9',
    ],
    scale: [65, 67, 69, 72, 74, 77, 79, 81],
    wonChord: [69, 72, 76, 81],
    tallyNotes: [72, 74, 77, 81],
    melody: {
      2: [[.667, 69, 1.0], [2.333, 72, .85]],
      3: [[.333, 74, 1.1], [2.0, 72, .65], [3.0, 69, .75]],
      4: [[.667, 70, 1.15], [2.333, 69, .6], [3.333, 67, .55]],
      5: [[.333, 69, 1.2], [2.333, 72, 1.0]],
      6: [[.667, 74, 1.1], [2.333, 72, .65], [3.333, 69, .55]],
      7: [[.333, 72, 1.05], [2.0, 76, 1.1]],
      8: [[.333, 74, 1.15], [2.0, 77, .85], [3.333, 74, .55]],
      9: [[.333, 72, 1.2], [2.333, 74, .8]],
      10: [[0, 77, 1.3], [2.0, 74, .75], [3.0, 72, .8]],
      11: [[.667, 74, 1.1], [2.333, 72, .9]],
      12: [[.667, 70, .95], [2.333, 69, 1.0]],
    },
  },
};

export function cliOptions(defaultVariant) {
  const { values } = parseArgs({
    options: {
      variant: { type: 'string', default: defaultVariant },
      'out-dir': { type: 'string' },
      cues: { type: 'string' },
    },
  });
  if (values.variant !== undefined && !Object.hasOwn(SCORES, values.variant)) {
    throw new Error('--variant は a または b');
  }
  const defaultDir = join(tmpdir(), 'day099-promo', 'audio');
  return { variant: values.variant, dir: resolve(values['out-dir'] ?? defaultDir), cueFile: values.cues };
}

export function normalizeCues(input) {
  if (!Array.isArray(input)) throw new Error('JSON に cues 配列が必要です');
  const count = new Map();
  return [...input].sort((a, b) => a?.at - b?.at).map((cue) => {
    const templates = CUES.filter((c) => c.kind === cue?.kind);
    if (!templates.length || !Number.isFinite(cue.at) || cue.at < 0 || cue.at >= DURATION_SECONDS) {
      throw new Error('合図の kind または at が無効です: ' + JSON.stringify(cue));
    }
    const index = count.get(cue.kind) ?? 0;
    count.set(cue.kind, index + 1);
    const template = templates[index];
    const indexed = templates[0].n !== undefined;
    const n = cue.n === undefined ? (indexed ? template?.n : 0) : cue.n;
    if (!Number.isSafeInteger(n) || (indexed ? !templates.some((c) => c.n === n) : n !== 0)) {
      throw new Error(`${cue.kind} の n が範囲外です`);
    }
    return { at: cue.at, kind: cue.kind, n };
  });
}

export function loadCues(arg) {
  if (arg === undefined) return normalizeCues(CUES);
  const inline = arg.trimStart();
  const json = inline.startsWith('{') || inline.startsWith('[') ? inline : readFileSync(arg, 'utf8');
  const data = JSON.parse(json);
  return normalizeCues(Array.isArray(data) ? data : data?.cues);
}

// 共通のステレオ描画器。すべての音は滑らかに立ち上がり、滑らかに閉じる。
function paint(bus, start, length, gain, pan, attack, release, oscillator) {
  const first = Math.round(start * RATE);
  const count = Math.min(Math.round(length * RATE), bus.length / 2 - first);
  if (count <= 0 || first < 0) return;
  const angle = (pan + 1) * Math.PI / 4;
  const left = gain * Math.cos(angle);
  const right = gain * Math.sin(angle);
  const atk = Math.max(1 / RATE, attack);
  const rel = Math.max(1 / RATE, release);
  for (let i = 0; i < count; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / atk) * Math.min(1, (count - 1 - i) / (rel * RATE));
    const value = oscillator(t) * env;
    const pos = (first + i) * 2;
    bus[pos] += value * left;
    bus[pos + 1] += value * right;
  }
}

function note(bus, voice, start, length, midi, gain, pan = 0) {
  const w = TAU * hz(midi);
  if (voice === 'pad') {
    paint(bus, start, length, gain, pan, .09, .18, (t) =>
      (.76 * Math.sin(w * t) + .17 * Math.sin(w * 1.0018 * t) + .07 * Math.sin(2 * w * t)) * Math.exp(-.11 * t));
  } else if (voice === 'marimba') {
    paint(bus, start, length, gain, pan, .0024, .042, (t) =>
      Math.sin(w * t) * Math.exp(-5.4 * t)
      + .25 * Math.sin(w * 3.98 * t) * Math.exp(-21 * t)
      + .09 * Math.sin(w * 2.0 * t) * Math.exp(-10 * t));
  } else if (voice === 'epiano') {
    paint(bus, start, length, gain, pan, .007, .10, (t) => {
      const p = w * t;
      const tine = .64 * Math.exp(-6.2 * t) * Math.sin(2.001 * p);
      return (.84 * Math.sin(p + tine) + .16 * Math.sin(2 * p) * Math.exp(-4.5 * t))
        * Math.exp(-1.75 * t) * (.95 + .05 * Math.cos(TAU * 3.8 * t + pan));
    });
  } else if (voice === 'bell') {
    paint(bus, start, length, gain, pan, .003, .10, (t) =>
      Math.sin(w * t) * Math.exp(-4.6 * t)
      + .20 * Math.sin(w * 2.01 * t) * Math.exp(-9.5 * t)
      + .10 * Math.sin(w * 4.12 * t) * Math.exp(-18 * t));
  } else if (voice === 'bass' || voice === 'roundBass') {
    const round = voice === 'roundBass';
    paint(bus, start, length, gain, pan, round ? .011 : .006, .06, (t) =>
      Math.exp(-(round ? 1.15 : 1.75) * t)
      * (.84 * Math.sin(w * t) + (round ? .15 : .28) * Math.sin(2 * w * t) * Math.exp(-2.3 * t)
        + (round ? .05 : .12) * Math.sin(3 * w * t) * Math.exp(-5.2 * t)));
  } else {
    throw new Error('未知の楽器: ' + voice);
  }
}

function chord(bus, voice, start, length, tones, gain, sweep = 0) {
  tones.forEach((midi, v) => {
    const delay = sweep >= 0 ? sweep * v : -sweep * (tones.length - 1 - v);
    note(bus, voice, start + delay, length - delay, midi, gain, (v - (tones.length - 1) / 2) * .21);
  });
}

function glide(bus, start, length, from, to, slide, decay, gain, pan = 0) {
  paint(bus, start, length, gain, pan, .0016, .014, (t) => {
    const cycles = to * t + (from - to) * slide * (1 - Math.exp(-t / slide));
    return Math.sin(TAU * cycles) * Math.exp(-t / decay);
  });
}

function noise(bus, start, length, from, to, shape, gain, pan, seed) {
  let state = (seed | 0) || 1;
  let fast = 0;
  let slow = 0;
  const first = 1 - Math.exp(-TAU * from / RATE);
  const last = 1 - Math.exp(-TAU * to / RATE);
  paint(bus, start, length, gain, pan, .0025, Math.min(length / 4, .08), (t) => {
    state = (Math.imul(1664525, state) + 1013904223) | 0;
    const u = t / length;
    const cutoff = first + (last - first) * u;
    fast += cutoff * (state / 2147483648 - fast);
    slow += .27 * cutoff * (fast - slow);
    const env = shape === 'wind'
      ? .18 + .82 * Math.sin(Math.PI * u) ** 2
      : shape === 'rise'
        ? .22 + .78 * u
        : shape === 'flat'
          ? 1
          : Math.exp(-3.8 * u);
    return (fast - slow) * env;
  });
}

function renderRhythm(music, variant, barIdx, section, root) {
  const bright = variant === 'a';
  const chorus = section === 'chorus';
  const breeze = section === 'breeze';
  const beatAt = (b) => at(barIdx, b);
  const seed = 9901 + 73 * barIdx;

  // キック
  const kicks = bright
    ? (chorus ? [0, 1.5, 2, 3.5] : breeze ? [0, 2] : [0, 1.75, 2.5])
    : (chorus ? [0, 1.667, 2.667] : breeze ? [0, 2.667] : [0, 2.667]);
  for (const b of kicks) {
    const level = section === 'drop' && b === 0 ? .56 : b === 0 ? .37 : .28;
    glide(music, beatAt(b), bright ? .22 : .26, bright ? 148 : 112, bright ? 55 : 52, .024, .084, level);
  }

  // ベース
  const bassLine = bright
    ? [[0, 0, 1.1], [1.5, 7, .42], [2, 0, .85], [3.25, 12, .52]]
    : [[0, 0, 1.7], [2, 7, .55], [2.667, 0, .9], [3.667, 7, .3]];
  for (const [b, interval, beats] of bassLine) {
    note(music, bright ? 'bass' : 'roundBass', beatAt(b), beats * BEAT, root + interval, interval ? .19 : .27);
  }

  if (bright) {
    // 明るいクラップ（2・4拍）＋細かいシェイカー
    for (const b of [1, 3]) {
      const w = beatAt(b);
      noise(music, w, .10, 3400, 1450, 'brush', breeze ? .18 : .25, -.14, seed + b * 11);
      noise(music, w + .011, .072, 2600, 1300, 'brush', breeze ? .13 : .18, .16, seed + b * 17);
      glide(music, w, .052, 510, 280, .01, .018, .055, -.05);
    }
    const hats = chorus ? [.5, 1.5, 2.25, 2.5, 3.5] : [.5, 1.5, 2.5, 3.5];
    for (const b of hats) {
      noise(music, beatAt(b), .058, 5600, 2400, 'brush', .125, .28, seed + Math.round(b * 31));
    }
  } else {
    // 温かいブラシスネア＋スウィングするライドブラシ
    for (const b of [1.03, 3.03]) {
      const w = beatAt(b);
      noise(music, w, .185, 3100, 1300, 'brush', breeze ? .16 : .21, -.16, seed + Math.round(b * 97));
      glide(music, w, .072, 290, 165, .021, .026, .048, -.08);
    }
    for (const b of chorus ? [.667, 1.667, 2.667, 3.667] : [.667, 2.667]) {
      noise(music, beatAt(b), .21, 1650, 4900, 'wind', .135, .26, seed + Math.round(b * 131));
    }
  }
}

function accompaniment(variant) {
  const score = SCORES[variant];
  const bright = variant === 'a';
  const music = stereo(DURATION_SECONDS);
  const chords = [];

  // 0–4秒：BGMは入れず、夜の静かな電話回線・室内アンビエンスのみを薄く敷く（無音の穴を防ぐ）。
  noise(music, 0, dropAt, 260, 560, 'flat', .125, -.12, 99001);
  noise(music, 0, dropAt, 380, 720, 'flat', .105, .14, 99002);

  for (let i = 0; i < BARS; i++) {
    const start = bar(i);
    const scene = STORYBOARD.find((s) => start >= s.start && start < s.end);
    const section = scene.music;
    const name = score.changes[i];
    if (!name || section === 'ring') {
      chords.push({ at: start, scene: section, name: null, bassMidi: null, upperMidi: [] });
      continue;
    }
    const [root, tones] = score.voicings[name];
    chords.push({ at: start, scene: section, name, bassMidi: root, upperMidi: tones });

    if (section === 'resolve') {
      if (start === scene.start) {
        const hold = scene.end - start;
        chord(music, 'pad', start, hold, tones, bright ? .062 : .068);
        note(music, bright ? 'bass' : 'roundBass', start, hold, root, .24);
      }
      continue;
    }

    renderRhythm(music, variant, i, section, root);
    const chorus = section === 'chorus';
    const breeze = section === 'breeze';

    if (bright) {
      // マリンバ系の分散和音（アルペジオ）
      const arpBeats = chorus ? [0, .5, 1.25, 2, 2.5, 3.25] : breeze ? [0, 1.5, 2.5] : [0, .75, 1.5, 2.25, 3];
      arpBeats.forEach((b, k) => {
        const midi = tones[(k + i) % tones.length];
        note(music, 'marimba', at(i, b), .31, midi, k === 0 ? .135 : .108, ((k % 3) - 1) * .26);
      });
    } else {
      // 温かいエレピの和音バッキング
      const comps = breeze ? [[0, .95], [2.333, .75]] : [[0, .82], [1.667, .48], [3.0, chorus ? .52 : .38]];
      for (const [b, len] of comps) {
        chord(music, 'epiano', at(i, b), len, tones, breeze ? .068 : .084, .006);
      }
    }

    const padLevel = chorus ? .042 : breeze ? .034 : .024;
    chord(music, 'pad', start, BAR + .04, tones, padLevel);

    for (const [b, midi, beats] of score.melody[i] ?? []) {
      const voice = bright ? 'marimba' : 'epiano';
      note(music, voice, at(i, b), BEAT * beats + .06, midi, chorus ? .215 : .178, -.14);
      if (chorus) note(music, voice, at(i, b) + .012, BEAT * beats, midi - 12, .055, .28);
    }
  }
  return { music, chords };
}

export const GESTURE_LENGTHS = {
  ring: 1.0,
  riser: .34,
  check: .21,
  next: .26,
  nav: .18,
  pop: .34,
  pan: 1.35,
  click: .12,
  won: .62,
  tally: .56,
  end: 1.15,
};

function gesture(variant, cue, length) {
  const sound = stereo(length);
  const score = SCORES[variant];
  const bright = variant === 'a';
  const { kind, n = 0 } = cue;
  const seed = 9941 + 61 * n;
  const tap = () => {
    glide(sound, 0, .048, 920, 520, .007, .012, .085, -.05);
    noise(sound, 0, .022, 2600, 1000, 'brush', .07, .06, seed);
  };

  switch (kind) {
    case 'ring': {
      // 日本の呼出音（約400Hzを15Hzで揺らした「プルルル」、1秒鳴って休む・柔らかく）
      paint(sound, 0, length, .165, 0, .012, .045, (t) => {
        const mod = .56 + .44 * Math.cos(TAU * 15 * t);
        const tone = .90 * Math.sin(TAU * 400 * t) + .07 * Math.sin(TAU * 800 * t) + .03 * Math.sin(TAU * 1200 * t);
        return tone * mod;
      });
      break;
    }
    case 'riser': {
      // 4.0秒のBGM開始直前の短いライザー（終端に60msの余白を置いてdropを際立たせる）
      const low = hz(bright ? 62 : 60);
      const high = low * 1.5;
      paint(sound, 0, length, .095, -.08, .006, .035, (t) => {
        const u = t / length;
        const phase = TAU * (low * t + (high - low) * t * u / 2);
        return (.25 + .75 * u * u) * Math.sin(phase);
      });
      noise(sound, 0, length, 580, 3600, 'rise', .145, .18, seed);
      break;
    }
    case 'check':
      tap();
      note(sound, bright ? 'marimba' : 'epiano', .018, .18, score.scale[2], .145, .10);
      note(sound, 'bell', .062, .14, score.scale[4], .11, -.10);
      break;
    case 'next':
      tap();
      glide(sound, .015, .14, hz(score.scale[1]), hz(score.scale[3]), .04, .055, .11, .08);
      note(sound, bright ? 'marimba' : 'epiano', .04, .21, score.scale[3], .155, -.08);
      break;
    case 'nav':
      tap();
      noise(sound, .01, .14, 900 + n * 180, 2400 + n * 200, 'wind', .12, n % 2 ? .24 : -.24, seed);
      note(sound, bright ? 'marimba' : 'epiano', .02, .15, score.scale[1 + (n % 3)], .115, .08);
      break;
    case 'pop':
      // 次回対応が入った丸く明るい「ポン」
      glide(sound, 0, .09, 320, 660, .018, .035, .18, -.06);
      note(sound, 'bell', 0, .30, score.scale[4] + 12, .26, .08);
      note(sound, bright ? 'marimba' : 'epiano', .035, .28, score.scale[5], .22, -.12);
      break;
    case 'pan':
      // 商談ボードの横送り（左から右へ抜ける穏やかな風）
      noise(sound, 0, length, 560, 2100, 'wind', .105, -.35, seed);
      noise(sound, length * .25, length * .75, 700, 2400, 'wind', .095, .35, seed + 5);
      break;
    case 'click':
      // 段階選択欄の表示値が切り替わる短いクリック音
      tap();
      note(sound, bright ? 'marimba' : 'epiano', .006, .10, score.scale[3], .135, .06);
      break;
    case 'won':
      // 受注への移動（タップ＋短い明るい和音）
      tap();
      score.wonChord.forEach((midi, idx) => {
        const offset = idx * .038;
        note(sound, 'bell', offset, length - offset, midi, .22 - idx * .015, -.24 + idx * .16);
        note(sound, bright ? 'marimba' : 'epiano', offset, .32, midi - 12, .14, .18 - idx * .12);
      });
      break;
    case 'tally':
      // 着地予測の金額の札が出る（数字が刻む音×3＋澄んだ確定ベル）
      [0, .055, .11].forEach((offset, idx) => {
        glide(sound, offset, .042, 760 + idx * 160, 1180 + idx * 190, .012, .016, .165, -.18 + idx * .18);
        note(sound, 'marimba', offset, .13, score.tallyNotes[idx], .19, -.15 + idx * .15);
      });
      note(sound, 'bell', .17, length - .17, score.tallyNotes[3], .27, .06);
      note(sound, 'bell', .185, length - .185, score.tallyNotes[3] + 12, .12, -.12);
      break;
    case 'end': {
      const [root, tones] = score.voicings[score.changes.at(-1)];
      chord(sound, bright ? 'marimba' : 'epiano', 0, length, tones, bright ? .19 : .175, bright ? .011 : .006);
      note(sound, 'bell', 0, .92, root + 24, .24, -.08);
      note(sound, 'bell', .022, .95, tones.at(-1) + 12, .14, .14);
      break;
    }
    default:
      throw new Error('未知の効果音: ' + kind);
  }
  return sound;
}

export function renderMix(variant, cues) {
  const { music: mix, chords } = accompaniment(variant);
  // 主要な合図の直前で伴奏が軽く息継ぎする（3dB以上の立ち上がりと聴きやすさの両立）
  for (const cue of cues.filter((c) => MAJOR_GESTURES.has(c.kind))) {
    const frame = Math.round(cue.at * RATE);
    for (let i = Math.max(0, Math.round(frame - .135 * RATE)); i < Math.min(FRAMES, Math.round(frame + .01 * RATE)); i++) {
      const dt = (i - frame) / RATE;
      const depth = Math.max(0, Math.min(1, (dt + .135) / .05, (.01 - dt) / .022));
      mix[i * 2] *= 1 - .42 * depth;
      mix[i * 2 + 1] *= 1 - .42 * depth;
    }
  }
  const stems = cues.map((cue) => {
    const length = GESTURE_LENGTHS[cue.kind];
    const samples = gesture(variant, cue, length);
    const first = Math.round(cue.at * RATE);
    const count = Math.min(samples.length, mix.length - 2 * first);
    for (let i = 0; i < count; i++) mix[first * 2 + i] += samples[i];
    return { cue, first, samples };
  });
  return {
    variant,
    title: SCORES[variant].title,
    key: SCORES[variant].key,
    bpm: BPM,
    bars: BARS,
    fps: FPS,
    chords,
    mix,
    stems,
  };
}

export function edgeGain(frame) {
  if (frame < .008 * RATE) return Math.sin(Math.PI / 2 * frame / (.008 * RATE)) ** 2;
  const left = FRAMES - 1 - frame;
  return left < FADE * RATE ? Math.sin(Math.PI / 2 * left / (FADE * RATE)) ** 2 : 1;
}

// ニー以下はリニア、以上は滑らかなピーク保護（ゼロ遅延）。
export function pcm16(value, gain) {
  const x = value * gain;
  const magnitude = Math.abs(x);
  const limited = magnitude <= .58 ? x : Math.sign(x) * (.58 + .175 * Math.tanh((magnitude - .58) / .175));
  return Math.round(limited * 32767);
}

export function pcmBuffer(mix, gain) {
  const pcm = Buffer.allocUnsafe(FRAMES * 4);
  for (let i = 0; i < FRAMES; i++) {
    const level = gain * edgeGain(i);
    pcm.writeInt16LE(pcm16(mix[i * 2], level), i * 4);
    pcm.writeInt16LE(pcm16(mix[i * 2 + 1], level), i * 4 + 2);
  }
  return pcm;
}

function chunk(tag, data) {
  const block = Buffer.alloc(8 + data.length + (data.length % 2));
  block.write(tag);
  block.writeUInt32LE(data.length, 4);
  data.copy(block, 8);
  return block;
}

export function buildWav(pcm, recipe) {
  const format = Buffer.alloc(16);
  format.writeUInt16LE(1, 0);
  format.writeUInt16LE(2, 2);
  format.writeUInt32LE(RATE, 4);
  format.writeUInt32LE(RATE * 4, 8);
  format.writeUInt16LE(4, 12);
  format.writeUInt16LE(16, 14);
  const chunks = [chunk('fmt ', format), chunk('data', pcm)];
  if (recipe) {
    const comment = chunk('ICMT', Buffer.from(JSON.stringify(recipe) + '\0'));
    chunks.push(chunk('LIST', Buffer.concat([Buffer.from('INFO'), comment])));
  }
  return chunk('RIFF', Buffer.concat([Buffer.from('WAVE'), ...chunks]));
}

export function media(tool, args, input) {
  const homebrew = '/opt/homebrew/bin/' + tool;
  const binary = process.env[tool.toUpperCase()] || (existsSync(homebrew) ? homebrew : tool);
  const r = spawnSync(binary, args, { input, maxBuffer: 32 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(tool + ': ' + r.stderr.toString().trim());
  return r;
}

export function loudness(source) {
  const input = Buffer.isBuffer(source) ? source : undefined;
  const { stderr } = media('ffmpeg', [
    '-hide_banner', '-nostdin', '-nostats', '-i', input ? 'pipe:0' : source,
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-',
  ], input);
  const data = JSON.parse(stderr.toString().match(/\{\s*"input_i"[\s\S]*?\}/)?.[0] ?? 'null');
  if (!data || !Number.isFinite(Number(data.input_i))) throw new Error('ラウドネスを測定できません');
  return {
    integratedLufs: Number(data.input_i),
    truePeakDbtp: Number(data.input_tp),
    loudnessRangeLu: Number(data.input_lra),
  };
}

function encode(dir, arrangement, externalCues) {
  const { variant, mix, stems } = arrangement;
  let gain = 1;
  for (let pass = 0; pass < 6; pass++) {
    const pcm = pcmBuffer(mix, gain);
    const m = loudness(buildWav(pcm));
    if (Math.abs(m.integratedLufs - TARGET_LUFS) <= .18 && m.truePeakDbtp <= -1.6) {
      const recipe = { variant, gain, cueSource: externalCues ? 'override' : 'timeline' };
      if (externalCues) recipe.cues = stems.map((s) => s.cue);
      const file = join(dir, 'bgm_' + variant + '.wav');
      writeFileSync(file, buildWav(pcm, recipe));
      media('ffmpeg', [
        '-v', 'error', '-nostdin', '-y', '-i', file, '-map_metadata', '-1',
        '-c:a', 'libmp3lame', '-b:a', '320k', '-write_xing', '1', join(dir, 'bgm_' + variant + '.mp3'),
      ]);
      return;
    }
    gain *= 10 ** ((TARGET_LUFS - m.integratedLufs) / 20);
  }
  throw new Error('マスタリングが目標値に収まりません');
}

async function main() {
  const { dir, variant, cueFile } = cliOptions('a');
  const arrangement = renderMix(variant, loadCues(cueFile));
  const { analyze, withStaging } = await import('./verify-audio.mjs');
  const [result] = await withStaging(dir, (stage) => {
    encode(stage, arrangement, cueFile !== undefined);
    const report = analyze(stage, variant, { arrangement });
    return { variants: [report], files: ['bgm_' + variant + '.wav', 'bgm_' + variant + '.mp3'] };
  });
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
