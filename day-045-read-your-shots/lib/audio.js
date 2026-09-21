export function createAudio() {
  let context, mute = false, march = 0;
  return {
    unlock() {
      try { const Audio = globalThis.AudioContext || globalThis.webkitAudioContext; if (!Audio) return; context ||= new Audio(); context.resume().catch(() => {}); } catch { /* 音なしで継続 */ }
    },
    setMute(value) { mute = value; },
    play(name) {
      if (mute || !context || context.state !== 'running') return;
      const notes = { fire: [720, 320, 0.08], hit: [390, 780, 0.12], hurt: [150, 45, 0.3], flinch: [260, 530, 0.09], wave: [440, 880, 0.4], pickup: [880, 1320, 0.1], levelup: [520, 1560, 0.45], march: [[130, 195, 165][march % 3], 110, 0.055] };
      if (name === 'march') march++;
      const [from, to, duration] = notes[name] || notes.fire;
      const osc = context.createOscillator(), gain = context.createGain(), now = context.currentTime;
      osc.type = name === 'hurt' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(from, now); osc.frequency.exponentialRampToValueAtTime(to, now + duration);
      gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.07, now + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain); gain.connect(context.destination); osc.start(now); osc.stop(now + duration);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
  };
}
