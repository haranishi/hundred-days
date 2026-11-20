const SOUNDS = {
  snip: [[890, 220, 0, 0.054, 0.045, 'triangle'], [390, 160, 0.027, 0.06, 0.026, 'triangle']],
  wire: [[330, 510, 0, 0.14, 0.028, 'triangle'], [740, 670, 0.036, 0.105, 0.016, 'sine']],
  pinch: [[710, 430, 0, 0.085, 0.038, 'sine']],
  season: [[523, 523, 0, 0.21, 0.028, 'sine'], [784, 784, 0.075, 0.26, 0.021, 'sine']],
};

export function createAudio(mutedAtStart) {
  let context;
  let output;
  let muted = mutedAtStart;

  function unlock() {
    if (muted) return;
    try {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!context && Audio) {
        context = new Audio();
        output = context.createGain();
        output.connect(context.destination);
      }
      if (context?.state === 'suspended') context.resume().catch(() => {});
    } catch {
      // 自動再生の制限や音の機能がない端末では、音なしで同じ操作を続けられる。
    }
  }

  function play(kind) {
    if (muted || context?.state !== 'running' || !output) return;
    try {
      for (const [from, to, delay, duration, volume, waveform] of SOUNDS[kind] ?? []) {
        const at = context.currentTime + delay;
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        oscillator.type = waveform;
        oscillator.frequency.setValueAtTime(from, at);
        oscillator.frequency.exponentialRampToValueAtTime(to, at + duration);
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.exponentialRampToValueAtTime(volume, at + 0.006);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        oscillator.connect(envelope);
        envelope.connect(output);
        oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
        oscillator.start(at);
        oscillator.stop(at + duration);
      }
    } catch {
      // 音の再生は、枝の操作や保存の成否に影響させない。
    }
  }

  function setMuted(value) {
    muted = value;
    if (output) output.gain.value = muted ? 0 : 1;
  }

  return { unlock, play, setMuted };
}
