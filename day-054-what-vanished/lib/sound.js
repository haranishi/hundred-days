// 効果音はすべてその場で合成する（音源ファイルを持たない）。最初の操作のあとで鳴らせるようになる。
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  /** 利用者の操作の中で呼ぶ（自動再生の制約のため） */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  get ready() {
    return this.ctx && this.ctx.state === 'running' && !this.muted;
  }

  tone({ freq, type = 'sine', at = 0, dur = 0.2, gain = 0.2, slide = null, attack = 0.005 }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise({ at = 0, dur = 0.8, gain = 0.25, from = 3000, to = 300, q = 0.8 }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + at;
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  tap() { this.tone({ freq: 660, type: 'triangle', dur: 0.08, gain: 0.08 }); }

  /** 残り10秒の時計の音。偶数と奇数で高さを変えてチクタクにする */
  tick(second) {
    this.tone({ freq: second % 2 ? 1250 : 980, type: 'square', dur: 0.045, gain: second <= 3 ? 0.07 : 0.045 });
  }

  start() {
    [523, 659, 784].forEach((f, i) => this.tone({ freq: f, type: 'triangle', at: i * 0.08, dur: 0.3, gain: 0.12 }));
  }

  /** まぶたが閉じる */
  close() {
    this.noise({ dur: 1.1, gain: 0.22, from: 2400, to: 180 });
    this.tone({ freq: 392, type: 'sine', at: 0.05, dur: 1.2, gain: 0.08, slide: 196 });
  }

  /** 何かが消えた瞬間 */
  vanish() {
    [1568, 1175, 988, 784].forEach((f, i) => this.tone({ freq: f, type: 'sine', at: i * 0.07, dur: 0.5, gain: 0.07 }));
  }

  /** まぶたが開く */
  open() {
    this.noise({ dur: 0.9, gain: 0.16, from: 250, to: 2600 });
  }

  hint() {
    [880, 1109].forEach((f, i) => this.tone({ freq: f, type: 'triangle', at: i * 0.1, dur: 0.25, gain: 0.08 }));
  }

  reveal() {
    [1047, 1319, 1568, 2093, 2637].forEach((f, i) => this.tone({ freq: f, type: 'sine', at: i * 0.06, dur: 0.6, gain: 0.06 }));
  }

  correct() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, type: 'triangle', at: i * 0.1, dur: 0.45, gain: 0.13 }));
    this.tone({ freq: 1568, type: 'sine', at: 0.42, dur: 0.8, gain: 0.08 });
  }

  wrong() {
    this.tone({ freq: 392, type: 'triangle', dur: 0.3, gain: 0.12 });
    this.tone({ freq: 330, type: 'triangle', at: 0.22, dur: 0.5, gain: 0.12, slide: 294 });
  }

  step() {
    this.noise({ dur: 0.09, gain: 0.05, from: 420, to: 160, q: 1.2 });
  }
}
