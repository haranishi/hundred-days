// 効果音とBGMは外部音源を使わず合成する。
// 紹介動画に音を後付けする tools/render-demo-audio.mjs も同じ定数を読むので、
// 音色を変えるときはここだけ直せば動画側にも同じ音が出る。

// 効果音の [開始周波数, 終了周波数, 長さ(秒)]。周波数は指数カーブで移る。
export const TONES = Object.freeze({
  jump: [330, 660, 0.12],
  stomp: [180, 90, 0.1],
  mochi: [523, 1046, 0.22],
  hurt: [150, 50, 0.25],
  door: [660, 1320, 0.4],
});
export const WAVE = 'triangle';
export const EFFECT_GAIN = 0.12; // 効果音の鳴り始めの音量
export const TAIL_GAIN = 0.001; // 指数で落ちきる先。0にすると exponentialRamp が使えない
// BGMは8音をぐるぐる回すだけ。効果音より十分低く保つ。
export const BGM_NOTES = Object.freeze([220, 330, 392, 330, 196, 294, 349, 294]);
export const BGM_STEP = 0.35; // 次の音までの間隔(秒)
export const BGM_LENGTH = 0.28; // 1音の長さ(秒)
export const BGM_GAIN = 0.035;

export function createAudio(muted = false) {
  let context,
    master,
    timer,
    beat = 0,
    playing = false;
  function tone(a, b, duration, volume = EFFECT_GAIN) {
    if (!context || muted || context.state !== 'running') {
      return;
    }
    const osc = context.createOscillator(),
      gain = context.createGain(),
      now = context.currentTime;
    osc.type = WAVE;
    osc.frequency.setValueAtTime(a, now);
    osc.frequency.exponentialRampToValueAtTime(b, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(TAIL_GAIN, now + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  return {
    async unlock() {
      try {
        if (!context) {
          const Audio =
            globalThis.AudioContext ?? globalThis.webkitAudioContext;
          if (!Audio) {
            return;
          }
          context = new Audio();
          master = context.createGain();
          master.gain.value = muted ? 0 : 1;
          master.connect(context.destination);
        }
        await context.resume();
        if (!timer) {
          timer = setInterval(() => {
            if (playing) {
              const n = BGM_NOTES[beat++ % BGM_NOTES.length];
              tone(n, n, BGM_LENGTH, BGM_GAIN);
            }
          }, BGM_STEP * 1000);
        }
      } catch {
        /* 無音でも遊べる */
      }
    },
    effect(name) {
      if (TONES[name]) {
        tone(...TONES[name]);
      }
    },
    setPlaying(value) {
      playing = value;
    },
    setMuted(value) {
      muted = value;
      if (master) {
        master.gain.value = value ? 0 : 1;
      }
    },
  };
}
