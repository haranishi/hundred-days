/**
 * Web Audio API を用いたリアルタイムシンセシス音響モジュール
 * 外部音声ファイル不要・完全クライアント動作
 */

let audioCtx = null;
let soundEnabled = true;

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
}

export function isSoundEnabled() {
  return soundEnabled;
}

/**
 * 看破成功音（明るく爽快なチャイム）
 */
export function playSuccessSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

  freqs.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + idx * 0.08);

    gain.gain.setValueAtTime(0, now + idx * 0.08);
    gain.gain.linearRampToValueAtTime(0.15, now + idx * 0.08 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + idx * 0.08);
    osc.stop(now + idx * 0.08 + 0.35);
  });
}

/**
 * 罠被弾音（レジのチャリン＋警告ブザー）
 */
export function playTrapHitSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // レジのコイン音
  const coinOsc = ctx.createOscillator();
  const coinGain = ctx.createGain();
  coinOsc.type = "sine";
  coinOsc.frequency.setValueAtTime(1760, now);
  coinOsc.frequency.setValueAtTime(2637, now + 0.06);
  coinGain.gain.setValueAtTime(0.2, now);
  coinGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  coinOsc.connect(coinGain);
  coinGain.connect(ctx.destination);
  coinOsc.start(now);
  coinOsc.stop(now + 0.25);

  // 警告ブザー
  const buzzOsc = ctx.createOscillator();
  const buzzGain = ctx.createGain();
  buzzOsc.type = "sawtooth";
  buzzOsc.frequency.setValueAtTime(150, now + 0.1);
  buzzOsc.frequency.setValueAtTime(110, now + 0.2);
  buzzGain.gain.setValueAtTime(0.15, now + 0.1);
  buzzGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
  buzzOsc.connect(buzzGain);
  buzzGain.connect(ctx.destination);
  buzzOsc.start(now + 0.1);
  buzzOsc.stop(now + 0.45);
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
  osc.frequency.setValueAtTime(600, now);
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.05);
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
    osc.frequency.setValueAtTime(80, now + offset);
    osc.frequency.exponentialRampToValueAtTime(45, now + offset + 0.08);

    gain.gain.setValueAtTime(0.2, now + offset);
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
    { f: 1046.5, d: 0.35 }  // High C
  ];

  let time = now;
  notes.forEach((note) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(note.f, time);

    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + note.d);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + note.d);

    time += note.d * 0.9;
  });
}
