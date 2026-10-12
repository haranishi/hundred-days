/* 効果音（Web Audio で合成。音のファイルは使わない）。全体の音量は 0.15 まで。
   AudioContext は「発車」を押したときに作る（ブラウザは利用者の操作なしに音を出させない）。
   音を消していても、焦げ・到着は画面の動きと結果の文で分かる（音だけの情報は無い）。 */

const MASTER = 0.15;

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;

  function unlock() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = MASTER;
        master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        let seed = 65;
        for (let i = 0; i < data.length; i++) {
          seed = (seed * 1103515245 + 12345) % 2147483648;
          data[i] = (seed / 1073741824) - 1;
        }
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  function env(gainNode, at, peak, dur, attack = 0.005) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, at);
    g.exponentialRampToValueAtTime(peak, at + attack);
    g.exponentialRampToValueAtTime(0.0001, at + dur);
  }

  function tone({ type = 'sine', freq, to = null, delay = 0, dur = 0.15, peak = 0.6 }) {
    const at = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, at + dur);
    env(gain, at, peak, dur);
    osc.connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  function noise({ delay = 0, dur = 0.3, peak = 0.5, type = 'highpass', freq = 2000, q = 0.7 }) {
    const at = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    env(gain, at, peak, dur, 0.01);
    src.connect(filter).connect(gain).connect(master);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  const SOUNDS = {
    // 発車：低い「ガタン」
    depart() {
      tone({ freq: 90, to: 45, dur: 0.14, peak: 0.9 });
      noise({ dur: 0.08, peak: 0.35, type: 'lowpass', freq: 500 });
      tone({ freq: 80, to: 40, delay: 0.17, dur: 0.16, peak: 0.8 });
      noise({ delay: 0.17, dur: 0.08, peak: 0.3, type: 'lowpass', freq: 450 });
    },
    // 切る：短い「トン」
    cut() {
      tone({ type: 'triangle', freq: 540, to: 300, dur: 0.07, peak: 0.55 });
    },
    // 焼く：ノイズの「ジュッ」
    grill() {
      noise({ dur: 0.38, peak: 0.45, type: 'highpass', freq: 2600 });
    },
    // 煮る：「ポコポコ」
    simmer() {
      [0, 0.11, 0.22].forEach((d, i) => tone({ freq: 260 + i * 40, to: 520 + i * 60, delay: d, dur: 0.07, peak: 0.45 }));
    },
    // 配膳：鈴
    serve() {
      tone({ freq: 1318.5, dur: 0.7, peak: 0.45 });
      tone({ freq: 2637, dur: 0.45, peak: 0.16 });
    },
    // 焦げ：短いブザー
    burn() {
      tone({ type: 'square', freq: 150, dur: 0.28, peak: 0.28 });
    },
    // クリア：上がる音
    clear() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ type: 'triangle', freq: f, delay: i * 0.1, dur: i === 3 ? 0.5 : 0.18, peak: 0.5 }));
    },
    // 失敗：下がる音
    fail() {
      [392, 329.63, 261.63].forEach((f, i) => tone({ type: 'triangle', freq: f, delay: i * 0.15, dur: 0.24, peak: 0.45 }));
    },
  };

  return {
    unlock,
    setMuted(value) {
      muted = Boolean(value);
    },
    get muted() {
      return muted;
    },
    play(name) {
      if (muted || !ctx || !SOUNDS[name]) return;
      try {
        SOUNDS[name]();
      } catch {
        // 鳴らせなくても遊べる
      }
    },
  };
}
