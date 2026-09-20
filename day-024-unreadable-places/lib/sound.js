/* 音。音源ファイルは1つも持たず、その場で Web Audio API で組み立てる
   （このチャレンジは他人のアセットを持ち込めないので、鳴らすなら生成するしかない）。

   ファイルを2つに割ってある。
     ・決める部分 … 開示量→音高／得点の残り→弾ける和音／接近→心拍の間隔／ミス音の間引き。
                    AudioContext に触らないので node --test でそのまま回せる。
     ・鳴らす部分 … AudioContext を1つだけ持ち、上が決めたものを予約するだけ。

   音の役目は「画面に無いものを足す」ことではなく、「画面にあるのに視線の外にあるもの」を
   耳へ運ぶこと（Day018と同じ考え）。このゲームで打つ人の目は漢字と伏せ字に釘付けで、
   ①読みがいま1文字開いたこと＝持ち点が減ったこと ②着弾がどれだけ近いか は視線の外にある。
   だから鳴らすのはその2つと、結果（弾けた・外した・失った）だけ。
   打鍵そのものには音を付けない——見えているものに音を重ねても情報は増えない。 */

// ---------------------------------------------------------------- 決める部分（純関数）

/** 根音。D3。低すぎるとノートPCの内蔵スピーカーで消えるので、この辺りに置く */
export const ROOT_MIDI = 50;

/* 律音階。都節音階（半音を含む、いかにも「和風」の並び）は使わない——既存の和風BGMに寄るため。
   Day018と同じ選択で、シリーズとして耳が揃う。 */
export const RITSU = [0, 2, 5, 7, 9];

/** 開示の音高。1文字目は高く、開き切ると低い。「下がる＝損している」を音の向きで表す */
export const REVEAL_TOP = 24;
export const REVEAL_BOTTOM = 5;

/** 心拍を鳴らし始める深さ（0=奥、1=着弾）。ここより手前でないと、ただの騒音になる */
export const HEARTBEAT_FROM = 0.55;
export const HEARTBEAT_SLOW_MS = 820;
export const HEARTBEAT_FAST_MS = 240;

export function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * 読みが1文字開いたときの音高。開いた割合が大きいほど低い。
 * 単調に下がることをテストで固定してある（上がると「得した」に聞こえてしまう）。
 */
export function revealPitch(revealed, kanaLength) {
  if (!(kanaLength > 0)) return midiToHz(ROOT_MIDI + REVEAL_TOP);
  const ratio = Math.min(1, Math.max(0, revealed / kanaLength));
  const semitone = REVEAL_TOP + (REVEAL_BOTTOM - REVEAL_TOP) * ratio;
  return midiToHz(ROOT_MIDI + semitone);
}

/**
 * 打ち切って弾けたときの3音。上行型。
 * kept（伏せたまま残せた割合）が高いほど全体が高くなる＝「うまく打てた」が耳で分かる。
 */
export function burstNotes(kept) {
  const k = Math.min(1, Math.max(0, kept));
  const base = ROOT_MIDI + 12 + Math.round(k * 7);
  return [0, 1, 2].map((n) => ({
    freq: midiToHz(base + RITSU[n * 2]),
    delay: n * 90
  }));
}

/** 心拍の間隔。着弾が近いほど短い。HEARTBEAT_FROM より奥では鳴らさない（0を返す） */
export function heartbeatIntervalMs(depth) {
  if (!(depth >= HEARTBEAT_FROM)) return 0;
  const t = Math.min(1, (depth - HEARTBEAT_FROM) / (1 - HEARTBEAT_FROM));
  return Math.round(HEARTBEAT_SLOW_MS + (HEARTBEAT_FAST_MS - HEARTBEAT_SLOW_MS) * t);
}

/** いま心拍を鳴らすか。毎フレーム呼ばれるので、間隔を跨いだときだけ true */
export function shouldBeat(lastAt, now, depth) {
  const interval = heartbeatIntervalMs(depth);
  if (!interval) return false;
  return now - lastAt >= interval;
}

/** 打ち間違いの音。連打されたときに重ならないよう間引く */
export function shouldPlayMiss(lastAt, now, gapMs = 120) {
  return now - lastAt >= gapMs;
}

// ---------------------------------------------------------------- 鳴らす部分（AudioContext）

/* AudioContext はこのモジュールに1つだけ。作るのは「はじめる」を押した瞬間で、
   それまでは1つも作らない（開いただけの人のタブに音の権利を握らせない）。 */
let ctx = null;
let master = null;
let enabled = true;
let lastMissAt = -Infinity;
let lastBeatAt = -Infinity;

/* 鳴らした音をそのまま控えておく口。既定では何もしない。
   デモ動画は Playwright が音を録れないので、ここに残った「実際に鳴らしたもの」を
   tools/render-demo-audio.mjs が同じ波形で組み立て直して重ねる。
   別の音を被せるのではなく、アプリが鳴らしたものを再現するための仕掛け（Day012と同じ考え）。 */
let log = null;
let logOrigin = 0;

export function startSoundLog() { log = []; return log; }
export function getSoundLog() { return log ? log.slice() : null; }

function record(entry) {
  if (log) log.push({ ...entry, at: Number((entry.at - logOrigin).toFixed(4)) });
}

function hasAudio() {
  return typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext);
}

function ensure() {
  if (ctx || !enabled || !hasAudio()) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0.22;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp);
  comp.connect(ctx.destination);
  return ctx;
}

/** 短い音を1つ鳴らす。音色の違いは波形と減衰だけ（Day018と同じ作り） */
function tone(at, { freq, dur, gain, type = 'triangle', glideTo = 0, cutoff = 0 }) {
  record({ kind: 'tone', at, freq, dur, gain, type, glideTo, cutoff });
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
  osc.connect(amp);
  tail.connect(master);
  osc.start(at);
  osc.stop(at + dur / 1000 + 0.05);
}

/** 打ち間違い専用の短いノイズ。音階に乗らない音は1つだけにしてある（揃いを崩す役） */
function noise(at, { dur, gain, cutoff }) {
  record({ kind: 'noise', at, dur, gain, cutoff });
  const frames = Math.max(1, Math.floor((ctx.sampleRate * dur) / 1000));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, at);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur / 1000);
  src.connect(filter);
  filter.connect(amp);
  amp.connect(master);
  src.start(at);
  src.stop(at + dur / 1000 + 0.02);
}

export const sound = {
  isEnabled() { return enabled; },
  /** 音を出す設定になっているか（実際に鳴らせるかは arm() のあと） */
  isLive() { return Boolean(enabled && ctx); },

  /* 設定を切り替えるだけ。ここでは AudioContext を作らない——読み込んだ時点で
     既定値を入れに来るので、作ってしまうと「開いただけで音の権利を握る」ことになる。 */
  setEnabled(next) {
    enabled = Boolean(next);
    if (master) master.gain.value = enabled ? 0.22 : 0;
  },

  /** 「はじめる」を押した瞬間に呼ぶ。ここで初めて AudioContext が生まれる */
  arm() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  },

  beginRound() {
    lastMissAt = -Infinity;
    lastBeatAt = -Infinity;
    if (ctx && ctx.state === 'suspended') ctx.resume();
    if (ctx) logOrigin = ctx.currentTime;
  },

  /** 読みが1文字開いた。開くほど低い＝持ち点が減っていることを耳で知らせる */
  reveal(revealed, kanaLength) {
    if (!this.isLive()) return;
    tone(ctx.currentTime, {
      freq: revealPitch(revealed, kanaLength),
      dur: 110, gain: 0.06, type: 'sine', cutoff: 2600
    });
  },

  /** 打ち切って弾けた。上行型。伏せたまま残せたぶんだけ高い */
  burst(kept) {
    if (!this.isLive()) return;
    const at = ctx.currentTime;
    for (const note of burstNotes(kept)) {
      tone(at + note.delay / 1000, {
        freq: note.freq, dur: 260, gain: 0.16, type: 'triangle', cutoff: 3200
      });
    }
  },

  /** 打ち間違い。控えめに、そして続けざまには鳴らさない */
  miss(now) {
    if (!this.isLive()) return;
    if (!shouldPlayMiss(lastMissAt, now)) return;
    lastMissAt = now;
    noise(ctx.currentTime, { dur: 60, gain: 0.05, cutoff: 1400 });
  },

  /** 毎フレームから呼ばれる。着弾が近いほど速い心拍。新しいタイマーは増やさない */
  approach(depth, now) {
    if (!this.isLive()) return;
    if (!shouldBeat(lastBeatAt, now, depth)) return;
    lastBeatAt = now;
    tone(ctx.currentTime, {
      freq: midiToHz(ROOT_MIDI - 12), dur: 140, gain: 0.09, type: 'sine', cutoff: 320
    });
  },

  /** 手前まで来られた・降参した。下行型で、弾けた音とは向きを逆にする */
  fail() {
    if (!this.isLive()) return;
    const at = ctx.currentTime;
    tone(at, { freq: midiToHz(ROOT_MIDI + 7), dur: 240, gain: 0.12, type: 'sine', glideTo: midiToHz(ROOT_MIDI - 2), cutoff: 1600 });
    tone(at + 0.16, { freq: midiToHz(ROOT_MIDI - 5), dur: 420, gain: 0.08, type: 'sine', cutoff: 900 });
  }
};
