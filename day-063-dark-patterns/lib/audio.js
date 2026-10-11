/**
 * Web Audio API 本格シンセサイザー音響エンジン
 * 外部音声ファイルゼロ・完全クライアント動作
 */

let audioCtx = null;
let soundEnabled = true;
let bgmTimer = null;
let bgmStep = 0;
// BGMを流すべき場面か（捜査中だけ）。開始画面で音をオンに戻したときにBGMが鳴り出さないようにする
let bgmWanted = false;

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
    haltBgm();
  } else if (bgmWanted) {
    startBgm();
  }
}

export function isSoundEnabled() {
  return soundEnabled;
}

/**
 * 本格サスペンス・アルペジオBGM (130 BPM)
 * 和音進行: Am -> F -> C -> Em（各8ステップ。下の chords の並び）
 */
export function startBgm() {
  bgmWanted = true;
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx || bgmTimer) return;

  // 和音アルペジオノート (周波数 Hz)
  const chordAm = [220.00, 261.63, 329.63, 440.00]; // A3, C4, E4, A4
  const chordF  = [174.61, 220.00, 261.63, 349.23]; // F3, A3, C4, F4
  const chordC  = [196.00, 261.63, 329.63, 392.00]; // G3, C4, E4, G4
  const chordEm = [164.81, 196.00, 246.94, 329.63]; // E3, G3, B3, E4

  const chords = [chordAm, chordF, chordC, chordEm];

  bgmTimer = setInterval(() => {
    if (!soundEnabled || !audioCtx) return;
    const now = ctx.currentTime;
    const currentChord = chords[Math.floor((bgmStep % 32) / 8)];
    const noteFreq = currentChord[bgmStep % 4];

    // 1. アルペジオ・シンセリード
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(noteFreq, now);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.18);

    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.18);

    // 2. 4分音符ごとのキックドラム (ステップ 0, 4, 8...)
    if (bgmStep % 4 === 0) {
      const kickOsc = ctx.createOscillator();
      const kickGain = ctx.createGain();
      kickOsc.type = "sine";
      kickOsc.frequency.setValueAtTime(130, now);
      kickOsc.frequency.exponentialRampToValueAtTime(35, now + 0.12);

      kickGain.gain.setValueAtTime(0.12, now);
      kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      kickOsc.connect(kickGain);
      kickGain.connect(ctx.destination);

      kickOsc.start(now);
      kickOsc.stop(now + 0.14);
    }

    // 3. ハイハット (奇数ステップ＝裏拍)
    if (bgmStep % 2 === 1) {
      const hhOsc = ctx.createOscillator();
      const hhGain = ctx.createGain();
      hhOsc.type = "square";
      hhOsc.frequency.setValueAtTime(8000, now);

      hhGain.gain.setValueAtTime(0.015, now);
      hhGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      hhOsc.connect(hhGain);
      hhGain.connect(ctx.destination);

      hhOsc.start(now);
      hhOsc.stop(now + 0.04);
    }

    bgmStep++;
  }, 115); // 約 130 BPM (16分音符刻み)
}

export function stopBgm() {
  bgmWanted = false;
  haltBgm();
}

function haltBgm() {
  if (bgmTimer) {
    clearInterval(bgmTimer);
    bgmTimer = null;
  }
}

/**
 * 罠解除成功音 (クリスタル・ディスアーム)
 */
export function playDisarmSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const freqs = [880, 1174.66, 1760];

  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(f, now + i * 0.04);

    gain.gain.setValueAtTime(0.12, now + i * 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + i * 0.04);
    osc.stop(now + i * 0.04 + 0.25);
  });
}

/**
 * ステージ完全看破音 (大成功ファンファーレ)
 */
export function playSuccessSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const chord = [523.25, 659.25, 783.99, 1046.50, 1318.51];

  chord.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + idx * 0.04);

    gain.gain.setValueAtTime(0.15, now + idx * 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + idx * 0.04);
    osc.stop(now + idx * 0.04 + 0.45);
  });
}

/**
 * 罠被弾・金銭被害音 (強烈なコイン音＋重低音ショック)
 */
export function playTrapHitSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // 重低音インパクト
  const subOsc = ctx.createOscillator();
  const subGain = ctx.createGain();
  subOsc.type = "sawtooth";
  subOsc.frequency.setValueAtTime(100, now);
  subOsc.frequency.exponentialRampToValueAtTime(25, now + 0.35);

  subGain.gain.setValueAtTime(0.3, now);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

  subOsc.connect(subGain);
  subGain.connect(ctx.destination);

  subOsc.start(now);
  subOsc.stop(now + 0.35);

  // コインチャリン多重音
  [0, 0.05, 0.10, 0.15].forEach((offset) => {
    const coin = ctx.createOscillator();
    const cGain = ctx.createGain();
    coin.type = "sine";
    coin.frequency.setValueAtTime(2100 + offset * 300, now + offset);

    cGain.gain.setValueAtTime(0.16, now + offset);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.2);

    coin.connect(cGain);
    cGain.connect(ctx.destination);

    coin.start(now + offset);
    coin.stop(now + offset + 0.2);
  });
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
  osc.frequency.setValueAtTime(800, now);
  gain.gain.setValueAtTime(0.07, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.03);
}

/**
 * 見破り・サーチ音
 */
export function playInspectSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(1400, now);
  osc.frequency.linearRampToValueAtTime(2200, now + 0.08);

  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.09);
}

/**
 * 心拍警告音
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
    osc.frequency.setValueAtTime(95, now + offset);
    osc.frequency.exponentialRampToValueAtTime(45, now + offset + 0.08);

    gain.gain.setValueAtTime(0.28, now + offset);
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
    { f: 1046.5, d: 0.45 }  // High C
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
