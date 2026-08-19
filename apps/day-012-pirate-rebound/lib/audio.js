/* 音。ファイルは1つも読み込まず、発振器と雑音だけで作る。

   時計の正本はここ（AudioContext.currentTime）。画面の更新は requestAnimationFrame だが、
   拍の位置は必ず音の時計から逆算する。ブラウザの描画は遅れても、音はずれない。

   鳴らす予約は「25ms ごとに 100ms 先まで」入れる。setTimeout で直接鳴らすと必ずよれる。 */

export const LOOKAHEAD_SECONDS = 0.1;
export const SCHEDULE_INTERVAL_MS = 25;

export class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.noise = null;
  }

  /** 操作の中から呼ぶこと。ブラウザは操作なしに音を出させない。 */
  async start() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) throw new Error('このブラウザは Web Audio に対応していません');

    if (!this.context) {
      this.context = new Ctor({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(this.context.destination);
      this.noise = this.#makeNoise();
    }
    if (this.context.state !== 'running') await this.context.resume();
    if (this.context.state !== 'running') throw new Error('音の再生が許可されませんでした');
    return this.context;
  }

  get now() {
    return this.context ? this.context.currentTime : 0;
  }

  /** 入力が起きた時刻(performance.now)を、耳に届いた音の時計へ直す。 */
  toContextTime(performanceMs) {
    if (!this.context) return 0;
    const stamp = this.context.getOutputTimestamp ? this.context.getOutputTimestamp() : null;
    if (stamp && Number.isFinite(stamp.contextTime) && Number.isFinite(stamp.performanceTime)) {
      /* ⚠️ 出力タイムスタンプは、音声スレッドが動き出す前に読むと「遅れ0」を返す。
         0を信じると、その1回だけ出力遅れぶん（実測33ms）判定がずれる。
         物理的に遅れは正なので、0以下なら信用せず outputLatency で補う。 */
      const lag = this.context.currentTime - stamp.contextTime;
      if (lag > 0.001) return stamp.contextTime + (performanceMs - stamp.performanceTime) / 1000;
    }
    const latency = this.context.outputLatency || this.context.baseLatency || 0;
    return this.context.currentTime - latency;
  }

  #makeNoise() {
    const length = Math.floor(this.context.sampleRate * 0.5);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    return buffer;
  }

  #envelope(at, attack, duration, peak) {
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    gain.connect(this.master);
    return gain;
  }

  #tone(at, { type = 'triangle', freq, duration, peak, detune = 0 }) {
    const oscillator = this.context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, at);
    if (detune) oscillator.detune.setValueAtTime(detune, at);
    oscillator.connect(this.#envelope(at, Math.min(0.03, duration / 4), duration, peak));
    oscillator.start(at);
    oscillator.stop(at + duration + 0.05);
    return oscillator;
  }

  #burst(at, { duration, peak, type = 'bandpass', frequency = 1800, Q = 1 }) {
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, at);
    filter.Q.setValueAtTime(Q, at);
    source.connect(filter);
    filter.connect(this.#envelope(at, 0.004, duration, peak));
    source.start(at);
    source.stop(at + duration + 0.05);
  }

  /** 伴奏の1音。声部ごとに音色を変える。 */
  playTone(at, event) {
    if (!this.context) return;
    const seconds = event.duration * 0.42;
    if (event.voice === 'bass') {
      this.#tone(at, { type: 'triangle', freq: event.freq, duration: seconds, peak: event.gain });
      this.#tone(at, { type: 'sine', freq: event.freq / 2, duration: seconds, peak: event.gain * 0.6 });
    } else if (event.voice === 'pad') {
      this.#tone(at, { type: 'sine', freq: event.freq, duration: event.duration * 0.5, peak: event.gain });
    } else if (event.voice === 'melody') {
      this.#tone(at, { type: 'triangle', freq: event.freq, duration: seconds, peak: event.gain });
      this.#tone(at, { type: 'sine', freq: event.freq * 2, duration: seconds * 0.6, peak: event.gain * 0.3 });
    } else {
      this.#tone(at, { type: 'square', freq: event.freq, duration: 0.06, peak: event.gain * 0.5 });
    }
  }

  /* 合図の音。ここが聞き分けの全部なので、3種類をはっきり違う音にしてある。
       砲弾   低く沈む「ドン」
       二連弾 同じ音を16分で2つ（打ち方が変わる合図）
       カモメ 発射音ではない鳴き声。上へ跳ねる */
  playFire(at, kind) {
    if (!this.context) return;
    if (kind === 'gull') {
      const oscillator = this.context.createOscillator();
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(720, at);
      oscillator.frequency.exponentialRampToValueAtTime(1180, at + 0.09);
      oscillator.frequency.exponentialRampToValueAtTime(880, at + 0.22);
      oscillator.connect(this.#envelope(at, 0.02, 0.26, 0.16));
      oscillator.start(at);
      oscillator.stop(at + 0.32);
      return;
    }

    const shots = kind === 'double' ? [0, 0.075] : [0];
    for (const offset of shots) {
      const when = at + offset;
      this.#burst(when, { duration: 0.16, peak: 0.3, type: 'lowpass', frequency: 620 });
      const oscillator = this.context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(kind === 'double' ? 210 : 150, when);
      oscillator.frequency.exponentialRampToValueAtTime(48, when + 0.22);
      oscillator.connect(this.#envelope(when, 0.005, 0.26, 0.32));
      oscillator.start(when);
      oscillator.stop(when + 0.32);
    }
  }

  /* 打った音。効果音ではなく伴奏の一部として鳴らす。
     ドンピシャのときだけ和音の上が乗る＝上手いほど曲が豊かになる。 */
  playHit(quality, chordTopFreq) {
    if (!this.context) return;
    const at = this.now + 0.005;
    this.#burst(at, { duration: 0.09, peak: quality === 'perfect' ? 0.42 : 0.3, frequency: 2100, Q: 0.9 });
    this.#tone(at, { type: 'triangle', freq: quality === 'perfect' ? 330 : 262, duration: 0.12, peak: 0.16 });
    if (quality === 'perfect' && chordTopFreq) {
      this.#tone(at + 0.01, { type: 'sine', freq: chordTopFreq * 2, duration: 0.5, peak: 0.12 });
    }
  }

  /* 打ち返した弾が敵船へ届いた音。遠いので、近くの音より低くて丸い。
     段が進んだとき（船の形が変わったとき）だけ、木が裂ける音を重ねる。 */
  playDistantHit(broke) {
    if (!this.context) return;
    const at = this.now + 0.005;
    this.#burst(at, { duration: 0.34, peak: 0.13, type: 'lowpass', frequency: 240 });
    this.#tone(at, { type: 'sine', freq: 70, duration: 0.34, peak: 0.14 });
    if (broke) {
      this.#burst(at + 0.05, { duration: 0.5, peak: 0.11, type: 'bandpass', frequency: 900, Q: 0.6 });
      this.#tone(at + 0.05, { type: 'triangle', freq: 118, duration: 0.5, peak: 0.09 });
    }
  }

  /** 通された音。曲は止めない。船体に当たる鈍い音だけ。 */
  playMiss() {
    if (!this.context) return;
    const at = this.now + 0.005;
    this.#burst(at, { duration: 0.22, peak: 0.26, type: 'lowpass', frequency: 300 });
    this.#tone(at, { type: 'sine', freq: 92, duration: 0.22, peak: 0.2 });
  }

  /** から振り。空を切る音。当たっていないことが音だけで分かる。 */
  playWhiff() {
    if (!this.context) return;
    this.#burst(this.now + 0.005, { duration: 0.13, peak: 0.12, type: 'highpass', frequency: 2600 });
  }

  suspend() {
    if (this.context && this.context.state === 'running') this.context.suspend().catch(() => {});
  }
}

/* 先読みスケジューラ。「いま鳴らす」ではなく「いつ鳴らすか」を予約していく。 */
export class Scheduler {
  constructor(engine, onSchedule) {
    this.engine = engine;
    this.onSchedule = onSchedule;
    this.timer = null;
  }

  start() {
    this.stop();
    this.timer = setInterval(() => {
      this.onSchedule(this.engine.now + LOOKAHEAD_SECONDS);
    }, SCHEDULE_INTERVAL_MS);
    this.onSchedule(this.engine.now + LOOKAHEAD_SECONDS);
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
