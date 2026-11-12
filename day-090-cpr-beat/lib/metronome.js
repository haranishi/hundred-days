export class Metronome {
  constructor(onBeat, onAudioUnavailable) {
    this.onBeat = onBeat; this.onAudioUnavailable = onAudioUnavailable;
    this.context = null; this.nodes = new Set(); this.timer = null; this.active = false;
  }
  async prepare(wantsAudio) {
    if (!wantsAudio) return false;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('unavailable');
      if (!this.context || this.context.state === 'closed') this.context = new Audio();
      let timeout;
      try {
        await Promise.race([this.context.resume(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('timeout')), 1500); })]);
      } finally { clearTimeout(timeout); }
      if (this.context.state !== 'running') throw new Error('not-running');
      return true;
    } catch { this.onAudioUnavailable(); return false; }
  }
  start(bpm, audio, startAt = performance.now() + 70) {
    this.stop(); this.active = true; this.period = 60_000 / bpm;
    this.audio = audio; this.next = startAt; this.pending = [];
    const pump = () => {
      if (!this.active) return;
      const now = performance.now();
      // Missed beats are skipped; resuming a delayed timer must not make a burst.
      while (this.next < now - 60) this.next += this.period;
      while (this.next < now + 110) {
        const time = this.next;
        if (this.audio && this.context?.state === 'running') this.schedule(time, now);
        this.pending.push(time); this.next += this.period;
      }
      while (this.pending.length && this.pending[0] <= now) {
        const time = this.pending.shift();
        if (now - time <= 80) this.onBeat(time);
      }
    };
    pump(); this.timer = setInterval(pump, 20);
  }
  schedule(time, now) {
    const context = this.context;
    const at = context.currentTime + Math.max(0, (time - now) / 1000);
    const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(1000, at);
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(0.14, at + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
    oscillator.connect(gain); gain.connect(context.destination); this.nodes.add(oscillator);
    oscillator.onended = () => { this.nodes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(at); oscillator.stop(at + 0.05);
  }
  stop() {
    this.active = false; clearInterval(this.timer); this.timer = null; this.pending = [];
    for (const node of this.nodes) { try { node.stop(); } catch { /* already ended */ } }
    this.nodes.clear();
  }
}
