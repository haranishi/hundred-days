/* 音。音源ファイルは1つも持たず、その場で Web Audio API で組み立てる
   （このチャレンジは他人のアセットを持ち込めないので、鳴らすなら生成するしかない）。

   ファイルを2つに割ってある。
     ・決める部分 … 値段→音高／経過比率→BGMの段／ミス音の間引き／seed→拍ごとの音符列。
                    AudioContext に触らないので node --test でそのまま回せる。
     ・鳴らす部分 … AudioContext を1つだけ持ち、上が決めたものを予約するだけ。

   音の役目は「画面に無いものを足す」ことではなく、「画面にあるのに視線の外にあるもの」を
   耳へ運ぶこと。打つ人の目はレーンの下の打鍵行に釘付けで、金額・残り時間・逃した皿は見えていない。
   だから打鍵そのものには音を付けない（見えているものに音を重ねても情報が増えない）。 */

// ---------------------------------------------------------------- 決める部分（純関数）

export const BPM = 96;
export const BEAT_MS = 60_000 / BPM;   // 625ms

/** 値段の段。安い皿ほど低い音になる（¥100 が最も低く ¥350 が最も高い） */
export const PRICE_STEPS = [100, 150, 210, 280, 350];

/* 音階。平常は律音階、終盤だけ民謡音階へ倒す。
   都節音階（半音を含む、いかにも「和風」の並び）は使わない——既存の和風BGMに寄るため。 */
export const RITSU = [0, 2, 5, 7, 9];
export const MINYO = [0, 3, 5, 7, 10];

/** 根音。D3。低すぎるとノートPCの内蔵スピーカーで消えるので、この辺りに置く */
export const ROOT_MIDI = 50;

export function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** 値段が何段目か（0が最安）。表に無い値段は近い段に丸める */
export function priceStep(price) {
  let best = 0;
  for (let i = 0; i < PRICE_STEPS.length; i += 1) {
    if (price >= PRICE_STEPS[i]) best = i;
  }
  return best;
}

/** 食べた音の高さ。段をそのまま音階の上の段に写す */
export function pitchForPrice(price) {
  const step = priceStep(price);
  const degree = RITSU[step % RITSU.length];
  const octave = Math.floor(step / RITSU.length);
  return midiToHz(ROOT_MIDI + 12 + degree + 12 * octave);
}

/**
 * 経過比率（0〜1）→ BGMの段。
 * 最後の段の入口を 0.75 に置いてあるのは、残り時間の表示が警告に変わるのと同じ時刻だから。
 * 画面と音で別々の「終盤」を作らない。
 */
export function bgmStage(ratio) {
  if (!(ratio > 0)) return 0;
  if (ratio >= 0.75) return 2;
  if (ratio >= 0.4) return 1;
  return 0;
}

/** その段で使う音階 */
export function scaleForStage(stage) {
  return stage >= 2 ? MINYO : RITSU;
}

/**
 * ミス音を鳴らしてよいか。速い人は1秒に4回以上間違えるので、
 * そのたびに鳴らすと音が団子になって「間違えた」以外の情報を潰す。
 */
export function shouldPlayMiss(lastAt, now, gapMs = 140) {
  if (!Number.isFinite(lastAt)) return true;
  return now - lastAt >= gapMs;
}

/** seed と拍から決まる 0〜1 の値。同じ組み合わせなら必ず同じ音符列になる */
export function beatNoise(seed, beat, salt = 0) {
  let h = (seed | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (beat + 0x85ebca6b), 0xc2b2ae35);
  h = Math.imul(h ^ (salt + 0x27d4eb2f), 0x165667b1);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * 1拍ぶんの音符列。ループ素材を持たず、seed と拍番号から毎回組み立てる。
 * voice は鳴らす側の音色の選び分けにだけ使う：
 *   drone … 根音の持続／pluck … 箏を思わせる撥弦／pulse … 鼓ふうの低い拍
 * delay は拍の頭からのずれ（ミリ秒）。
 */
export function notesForBeat(seed, beat, stage) {
  const scale = scaleForStage(stage);
  const notes = [];

  // 根音は8拍に1度だけ置き直す。ずっと鳴っているので、間隔を詰めると濁る
  if (beat % 8 === 0) {
    notes.push({ voice: 'drone', freq: midiToHz(ROOT_MIDI), dur: BEAT_MS * 8, gain: 0.05, delay: 0 });
  }

  // 鼓ふうの拍。段が上がるほど打点が増える
  const pulseOn = stage === 0 ? [0] : stage === 1 ? [0, 2] : [0, 2, 3];
  if (pulseOn.includes(beat % 4)) {
    notes.push({ voice: 'pulse', freq: midiToHz(ROOT_MIDI - 12), dur: 140, gain: 0.16, delay: 0 });
  }

  // 撥弦。段が上がるほど鳴る確率が上がる
  const density = stage === 0 ? 0.35 : stage === 1 ? 0.6 : 0.85;
  if (beatNoise(seed, beat, 1) < density) {
    const degree = scale[Math.floor(beatNoise(seed, beat, 2) * scale.length)];
    const up = beatNoise(seed, beat, 3) < 0.35 ? 12 : 0;
    notes.push({
      voice: 'pluck',
      freq: midiToHz(ROOT_MIDI + 12 + degree + up),
      dur: 420,
      gain: 0.1,
      delay: beatNoise(seed, beat, 4) < 0.25 ? BEAT_MS / 2 : 0
    });
  }
  return notes;
}

// ---------------------------------------------------------------- 鳴らす部分（AudioContext）

/* AudioContext はこのモジュールに1つだけ。作るのは「はじめる」を押した瞬間で、
   それまでは1つも作らない（開いただけの人のタブに音の権利を握らせない）。 */
let ctx = null;
let master = null;      // 全体の音量。ミュートはここを0にするのではなく、そもそも作らない
let bgmBus = null;      // BGMだけを通す。元が取れた瞬間に1秒だけ下げる（ダッキング）
let enabled = true;
let seed = 1;
let stage = 0;
let beatIndex = 0;
let nextBeatAt = 0;
let playing = false;
let lastMissAt = -Infinity;

const LOOKAHEAD_S = 0.2;   // 音の時計で今から先、これだけを予約する

function hasAudio() {
  return typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
}

/** 鳴らす準備。ユーザーの操作の中からだけ呼ぶ（ブラウザは操作の外で作った音を止める） */
function ensure() {
  if (!enabled || ctx || !hasAudio()) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  ctx = new Ctor();

  master = ctx.createGain();
  master.gain.value = 0.22;

  /* 山（食べた音とBGMが重なる瞬間）だけを抑える。全体を潰すためではないので、
     効きは浅め・戻りは速めにしておく */
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -6;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;

  master.connect(comp);
  comp.connect(ctx.destination);

  bgmBus = ctx.createGain();
  bgmBus.gain.value = 1;
  bgmBus.connect(master);
  return ctx;
}

/** 短い音を1つ鳴らす。すべてここを通す（音色の違いは波形と減衰だけ） */
function tone(at, { freq, dur, gain, type = 'triangle', bus = master, pan = 0, glideTo = 0, cutoff = 0 }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + dur / 1000);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur / 1000);

  let tail = amp;
  if (cutoff) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    amp.connect(filter);
    tail = filter;
  }
  if (pan && ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    tail.connect(panner);
    tail = panner;
  }
  osc.connect(amp);
  tail.connect(bus);
  osc.start(at);
  osc.stop(at + dur / 1000 + 0.05);
}

function playNote(note, at) {
  if (note.voice === 'drone') {
    tone(at, { freq: note.freq, dur: note.dur, gain: note.gain, type: 'sine', bus: bgmBus, cutoff: 700 });
    return;
  }
  if (note.voice === 'pulse') {
    tone(at, { freq: note.freq, dur: note.dur, gain: note.gain, type: 'sine', bus: bgmBus, glideTo: note.freq * 0.6, cutoff: 300 });
    return;
  }
  tone(at, { freq: note.freq, dur: note.dur, gain: note.gain, type: 'triangle', bus: bgmBus, cutoff: 2600 });
}

export const sound = {
  isEnabled() { return enabled; },
  /** 音を出す設定になっているか（実際に鳴らせるかは ensure() のあと） */
  isLive() { return Boolean(enabled && ctx); },

  /* 設定を切り替えるだけ。ここでは AudioContext を作らない——このモジュールを読み込んだ時点で
     既定値を入れに来るので、作ってしまうと「開いただけで音の権利を握る」ことになる。
     実際に作るのは arm()（＝ユーザーの操作の中）だけ。 */
  setEnabled(next) {
    enabled = Boolean(next);
    if (master) master.gain.value = enabled ? 0.22 : 0;
  },

  /** 「はじめる」を押した瞬間に呼ぶ。ここで初めて AudioContext が生まれる */
  arm() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  },

  /** 1回の勝負のはじめ。BGMの拍時計をここで合わせ直す */
  beginRound(roundSeed) {
    seed = Number.isFinite(roundSeed) ? roundSeed | 0 : 1;
    stage = 0;
    beatIndex = 0;
    lastMissAt = -Infinity;
    playing = true;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (bgmBus) bgmBus.gain.cancelScheduledValues(ctx.currentTime);
    if (bgmBus) bgmBus.gain.setValueAtTime(1, ctx.currentTime);
    nextBeatAt = ctx.currentTime + 0.05;
  },

  stopBgm() {
    playing = false;
  },

  /**
   * 画面の毎フレームから呼ばれる。新しいタイマーは増やさない。
   * 予約するのは「音の時計で今から200ms先までに来る拍」だけ。
   * タブを隠して戻したときは過去ぶんをまとめて鳴らさず、今から数え直す。
   */
  tick(ratio) {
    if (!playing || !ctx || !enabled) return;
    stage = bgmStage(ratio);
    if (nextBeatAt < ctx.currentTime) nextBeatAt = ctx.currentTime;
    while (nextBeatAt < ctx.currentTime + LOOKAHEAD_S) {
      for (const note of notesForBeat(seed, beatIndex, stage)) {
        playNote(note, nextBeatAt + note.delay / 1000);
      }
      beatIndex += 1;
      nextBeatAt += BEAT_MS / 1000;
    }
  },

  /** 食べた。値段が高い皿ほど高い音になる＝耳だけで「いま高いのを取った」が分かる */
  eat(price) {
    if (!this.isLive()) return;
    const at = ctx.currentTime;
    const freq = pitchForPrice(price);
    tone(at, { freq, dur: 320, gain: 0.2, type: 'triangle', cutoff: 3200 });
    tone(at + 0.012, { freq: freq * 2, dur: 200, gain: 0.06, type: 'sine' });
  },

  /** 打ち間違い。控えめに、そして続けざまには鳴らさない */
  missKey(now) {
    if (!this.isLive()) return;
    if (!shouldPlayMiss(lastMissAt, now)) return;
    lastMissAt = now;
    tone(ctx.currentTime, { freq: 174, dur: 70, gain: 0.05, type: 'sine' });
  },

  /** もうすぐ流れる皿。高く短い音。動きを止めている人にも届く必要があるので切らない */
  soon() {
    if (!this.isLive()) return;
    tone(ctx.currentTime, { freq: midiToHz(ROOT_MIDI + 36), dur: 110, gain: 0.07, type: 'sine' });
  },

  /** 逃した。左端で起きることなので音も左へ振る */
  lost() {
    if (!this.isLive()) return;
    tone(ctx.currentTime, { freq: 300, dur: 260, gain: 0.09, type: 'sine', pan: -0.8, glideTo: 170 });
  },

  /** 元が取れた瞬間。1回の勝負で最大1度だけ。他のどの音とも似せない */
  payoff() {
    if (!this.isLive()) return;
    const at = ctx.currentTime;
    const scale = RITSU;
    [0, 2, 4].forEach((i, n) => {
      tone(at + n * 0.13, {
        freq: midiToHz(ROOT_MIDI + 12 + scale[i]),
        dur: 300, gain: 0.16, type: 'triangle', cutoff: 3000
      });
    });
    tone(at + 0.26, { freq: midiToHz(ROOT_MIDI), dur: 1600, gain: 0.1, type: 'sine', cutoff: 800 });
    // BGMを1秒だけ下げる。重ねたままだと、いちばん大事な音が埋もれる
    if (bgmBus) {
      bgmBus.gain.cancelScheduledValues(at);
      bgmBus.gain.setValueAtTime(bgmBus.gain.value, at);
      bgmBus.gain.linearRampToValueAtTime(0.25, at + 0.06);
      bgmBus.gain.linearRampToValueAtTime(1, at + 1.0);
    }
  }
};
