// 効果音はすべて WebAudio で合成する。音源ファイルを持たないので転送量も権利確認も要らない。
// AudioContext は最初の入力で作る（自動再生の制限で、入力前に作ると鳴らない端末がある）
const LEVEL = 0.55;

export function createAudio({ createContext } = {}) {
  let ctx = null;
  let out = null;
  let noiseBuf = null;
  let failed = false;
  let muted = false;

  function ensure() {
    if (ctx || failed || typeof createContext !== 'function') return ctx;
    try {
      ctx = createContext();
      out = ctx.createGain();
      out.gain.value = muted ? 0 : LEVEL;
      out.connect(ctx.destination);
    } catch {
      failed = true;
      ctx = null;
    }
    return ctx;
  }

  function resume() {
    try {
      if (ctx && ctx.state === 'suspended') {
        const p = ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch {
      /* 再開できなくても遊べる */
    }
  }

  function envGain(t0, attack, dur, vol) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(out);
    return g;
  }

  function tone(type, f0, f1, t0, dur, vol, attack = 0.005) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur * 0.8);
    o.connect(envGain(t0, attack, dur, vol));
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise(t0, dur, freq, q, vol) {
    if (!noiseBuf) {
      const len = Math.floor(ctx.sampleRate * 0.25);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      let s = 1;
      for (let i = 0; i < len; i += 1) {
        s = (s * 16807) % 2147483647;
        data[i] = (s / 2147483647) * 2 - 1;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f);
    f.connect(envGain(t0, 0.003, dur, vol));
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  const SOUNDS = {
    // ぱた：布をはたくような短い2打
    flap(t) {
      noise(t, 0.045, 1500, 1.1, 0.5);
      noise(t + 0.055, 0.04, 1050, 1.1, 0.35);
    },
    // ちりん：鈴。倍音をずらして重ねる
    pass(t) {
      tone('sine', 1975, 1975, t, 0.45, 0.16, 0.003);
      tone('sine', 2960, 2960, t + 0.004, 0.3, 0.07, 0.003);
    },
    // ぽん：音程が下がる丸い音
    fish(t) {
      tone('sine', 980, 520, t, 0.14, 0.32);
      tone('triangle', 1470, 780, t, 0.09, 0.08);
    },
    // ぽこっ：木を軽くたたいた音。痛そうに聞こえないよう低く短く
    bonk(t) {
      tone('triangle', 360, 170, t, 0.16, 0.42);
      noise(t, 0.025, 2400, 0.9, 0.18);
    },
    // にゃ：のこぎり波をフォルマントのように動くフィルタに通す
    meow(t) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(560, t);
      o.frequency.linearRampToValueAtTime(820, t + 0.09);
      o.frequency.linearRampToValueAtTime(610, t + 0.3);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 5;
      f.frequency.setValueAtTime(900, t);
      f.frequency.linearRampToValueAtTime(1900, t + 0.1);
      f.frequency.linearRampToValueAtTime(1150, t + 0.3);
      o.connect(f);
      f.connect(envGain(t, 0.03, 0.34, 0.3));
      o.start(t);
      o.stop(t + 0.36);
    },
    fanfare(t) {
      const notes = [784, 988, 1175, 1568];
      notes.forEach((hz, i) => tone('square', hz, hz, t + i * 0.09, i === 3 ? 0.42 : 0.12, 0.07));
    },
  };

  return {
    names: Object.keys(SOUNDS),
    ensure,
    resume,
    play(name, delay = 0) {
      if (muted || !SOUNDS[name]) return false;
      if (!ensure()) return false;
      try {
        SOUNDS[name](ctx.currentTime + 0.004 + delay);
        return true;
      } catch {
        return false;
      }
    },
    setMuted(value) {
      muted = !!value;
      try {
        if (out) out.gain.setValueAtTime(muted ? 0 : LEVEL, ctx.currentTime);
      } catch {
        /* 音量を変えられない環境でも、以後 play が鳴らさないので実害はない */
      }
    },
    isMuted: () => muted,
  };
}
