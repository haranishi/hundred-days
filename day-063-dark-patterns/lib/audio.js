/**
 * Web Audio API を用いたリアルタイムシンセシス音響モジュール
 * 外部音声ファイル不要・完全クライアント動作
 */

let audioCtx = null;
let soundEnabled = true;
let bgmInterval = null;
let bgmStep = 0;

function getAudioContext() {
  if (!audioCtx && typeof window !== "undefined") {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

export function setSoundEnabled(enabled) {
  soundEnabled = enabled;
  if (!enabled) {
    stopBgm();
  } else {
    startBgm();
  }
}

export function isSoundEnabled() {
  return soundEnabled;
}

/**
 * 捜査官アンビエントBGM（低音パルス・ミニマルシンセ）
 */
export function startBgm() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx || bgmInterval) return;

  const notes = [65.41, 65.41, 77.78, 65.41, 58.27, 65.41, 87.31, 77.78]; // C2, C2, Eb2, C2, Bb1, C2, F2, Eb2

  bgmInterval = setInterval(() => {
    if (!soundEnabled || !audioCtx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(280, now);

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(notes[bgmStep % notes.length], now);

    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);

    bgmStep++;
  }, 400); // 150 BPM
}

export function stopBgm() {
  if (bgmInterval) {
    clearInterval(bgmInterval);
    bgmInterval = null;
  }
}

/**
 * 看破成功音（爽快なガラス割り＋チャイムアルペジオ）
 */
export function playSuccessSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // キラリと光る高周波ベル
  const freqs = [587.33, 739.99, 880.00, 1174.66, 1760.00]; // D5, F#5, A5, D6, A6
  freqs.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now + idx * 0.05);

    gain.gain.setValueAtTime(0.18, now + idx * 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + idx * 0.05);
    osc.stop(now + idx * 0.05 + 0.4);
  });
}

/**
 * 罠被弾音（レジのチャリン＋重低音ショック）
 */
export function playTrapHitSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // 重低音インパクト
  const subOsc = ctx.createOscillator();
  const subGain = ctx.createGain();
  subOsc.type = "sine";
  subOsc.frequency.setValueAtTime(120, now);
  subOsc.frequency.exponentialRampToValueAtTime(30, now + 0.3);
  subGain.gain.setValueAtTime(0.35, now);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  subOsc.connect(subGain);
  subGain.connect(ctx.destination);
  subOsc.start(now);
  subOsc.stop(now + 0.35);

  // コイン連打音
  [0, 0.06, 0.12].forEach((offset) => {
    const coinOsc = ctx.createOscillator();
    const coinGain = ctx.createGain();
    coinOsc.type = "sine";
    coinOsc.frequency.setValueAtTime(1900 + offset * 400, now + offset);
    coinGain.gain.setValueAtTime(0.15, now + offset);
    coinGain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.2);
    coinOsc.connect(coinGain);
    coinGain.connect(ctx.destination);
    coinOsc.start(now + offset);
    coinOsc.stop(now + offset + 0.2);
  });

  // 警告ブザー
  const buzzOsc = ctx.createOscillator();
  const buzzGain = ctx.createGain();
  buzzOsc.type = "sawtooth";
  buzzOsc.frequency.setValueAtTime(140, now + 0.1);
  buzzOsc.frequency.setValueAtTime(90, now + 0.25);
  buzzGain.gain.setValueAtTime(0.2, now + 0.1);
  buzzGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  buzzOsc.connect(buzzGain);
  buzzGain.connect(ctx.destination);
  buzzOsc.start(now + 0.1);
  buzzOsc.stop(now + 0.5);
}

/**
 * カチッというUIクリック音
 */
export function playClickSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(750, now);
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.04);
}

/**
 * 見破りルーペ音（サーチライトのような高音パルス）
 */
export function playInspectSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(1200, now);
  osc.frequency.linearRampToValueAtTime(1800, now + 0.08);
  gain.gain.setValueAtTime(0.05, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.1);
}

/**
 * 時間警告（心拍音）
 */
export function playHeartbeatSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  [0, 0.12].forEach((offset) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(90, now + offset);
    osc.frequency.exponentialRampToValueAtTime(45, now + offset + 0.08);

    gain.gain.setValueAtTime(0.25, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + offset);
    osc.stop(now + offset + 0.1);
  });
}

/**
 * 捜査完了ファンファーレ
 */
export function playFanfareSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [
    { f: 523.25, d: 0.12 }, // C
    { f: 659.25, d: 0.12 }, // E
    { f: 783.99, d: 0.12 }, // G
    { f: 1046.5, d: 0.4 }   // High C
  ];

  let time = now;
  notes.forEach((note) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(note.f, time);

    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + note.d);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + note.d);

    time += note.d * 0.9;
  });
}
