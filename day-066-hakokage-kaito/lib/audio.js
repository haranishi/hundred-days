/* 効果音（Web Audio で合成。音のファイルは使わない）。最大の音量は 0.15。作り方は作業記録の 02_ui_states.md の表のとおり。
   AudioContext は最初の操作（ボタンかキー）で作る（ブラウザは利用者の操作なしに音を出させない）。
   音を切っても、同じ場面で文と動きが出る（音だけの情報は無い）。作れない端末・鳴らせない端末では、黙って音なしで続ける。 */

export const MAX_VOLUME = 0.15;
export const SOUND_NAMES = Object.freeze(['step', 'push', 'bump', 'wait', 'treasure', 'caught', 'dead', 'clear']);

export function createAudio({ muted = false } = {}) {
  let ctx = null;
  let noiseBuffer = null;
  let off = Boolean(muted);

  function unlock() {
    try {
      if (typeof window === 'undefined') return false;
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        let seed = 66;
        for (let i = 0; i < data.length; i++) {
          seed = (seed * 1103515245 + 12345) % 2147483648;
          data[i] = seed / 1073741824 - 1;
        }
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  // 立ち上がり4ms、そのあと指数で減衰
  function envelope(gainNode, at, peak, dur) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, at);
    g.exponentialRampToValueAtTime(Math.max(0.0002, Math.min(peak, MAX_VOLUME)), at + 0.004);
    g.exponentialRampToValueAtTime(0.0001, at + dur);
  }

  function tone({ type = 'sine', freq, to = null, delay = 0, dur, gain }) {
    const at = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, at + dur);
    envelope(amp, at, gain, dur);
    osc.connect(amp).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  function noise({ delay = 0, dur, gain, freq }) {
    const at = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const amp = ctx.createGain();
    envelope(amp, at, gain, dur);
    src.connect(filter).connect(amp).connect(ctx.destination);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  const SOUNDS = {
    step: () => tone({ type: 'triangle', freq: 220, dur: 0.04, gain: 0.06 }), // 歩く：短い足音
    push: () => noise({ dur: 0.12, freq: 400, gain: 0.1 }), // 箱を押す：低くこする音
    bump: () => tone({ type: 'sine', freq: 110, dur: 0.06, gain: 0.08 }), // ぶつかる：鈍い音
    wait: () => tone({ type: 'sine', freq: 1200, dur: 0.02, gain: 0.03 }), // 待つ：小さな時計の音
    treasure: () => [880, 1320, 1760].forEach((freq, i) => tone({ freq, delay: i * 0.06, dur: 0.06, gain: 0.1 })), // 宝：きらめき
    caught: () => [880, 660].forEach((freq, i) => tone({ type: 'square', freq, delay: i * 0.15, dur: 0.15, gain: 0.1 })), // 見つかった：警報
    dead: () => tone({ freq: 330, to: 196, dur: 0.3, gain: 0.08 }), // 詰み：下がる音
    clear: () => [523, 659, 784].forEach((freq, i) => tone({ type: 'triangle', freq, delay: i * 0.11, dur: 0.11, gain: 0.12 })), // 成功：上がる3音
  };

  return {
    unlock,
    setMuted(on) {
      off = Boolean(on);
    },
    get muted() {
      return off;
    },
    play(name) {
      if (off || !ctx || !SOUNDS[name]) return false;
      try {
        SOUNDS[name]();
        return true;
      } catch {
        return false; // 鳴らせなくても遊べる
      }
    },
  };
}
