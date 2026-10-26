/**
 * 保安検査スワイパー用 Web Audio API 効果音シンセサイザー
 * 外部音源ファイルを使わず、ブラウザ標準AudioContextで検査場の電子音・ブザー音を合成する。
 */

export function createSoundController() {
  let ctx = null;
  let enabled = false;

  function ensureContext() {
    if (!enabled) return null;
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctx) {
      try {
        ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function playTone({ freq = 440, type = 'sine', duration = 0.1, delay = 0, gain = 0.12, endFreq = null }) {
    const audio = ensureContext();
    if (!audio) return;
    try {
      const now = audio.currentTime + delay;
      const osc = audio.createOscillator();
      const amp = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (endFreq !== null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
      }
      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.linearRampToValueAtTime(gain, now + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(amp);
      amp.connect(audio.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch {
      // Audio再生失敗は無視
    }
  }

  return {
    isEnabled() {
      return enabled;
    },
    setEnabled(next) {
      enabled = Boolean(next);
      if (enabled) {
        ensureContext();
      }
      return enabled;
    },
    playCorrect(combo = 1) {
      const pitchBoost = Math.min(combo, 10) * 28;
      playTone({ freq: 660 + pitchBoost, type: 'triangle', duration: 0.08, delay: 0, gain: 0.12 });
      playTone({ freq: 880 + pitchBoost, type: 'triangle', duration: 0.11, delay: 0.065, gain: 0.14 });
    },
    playWrong() {
      playTone({ freq: 210, type: 'sawtooth', duration: 0.14, delay: 0, gain: 0.13, endFreq: 170 });
      playTone({ freq: 165, type: 'sawtooth', duration: 0.18, delay: 0.12, gain: 0.13, endFreq: 135 });
    },
    playStart() {
      playTone({ freq: 523.25, type: 'sine', duration: 0.08, delay: 0, gain: 0.11 });
      playTone({ freq: 659.25, type: 'sine', duration: 0.08, delay: 0.07, gain: 0.11 });
      playTone({ freq: 783.99, type: 'sine', duration: 0.14, delay: 0.14, gain: 0.13 });
    },
    playFinish() {
      playTone({ freq: 587.33, type: 'triangle', duration: 0.1, delay: 0, gain: 0.12 });
      playTone({ freq: 783.99, type: 'triangle', duration: 0.1, delay: 0.09, gain: 0.12 });
      playTone({ freq: 1046.5, type: 'triangle', duration: 0.22, delay: 0.18, gain: 0.15 });
    }
  };
}
