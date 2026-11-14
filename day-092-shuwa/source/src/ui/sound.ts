import type { Settings } from '../store/schema';
type Cue = 'correct' | 'wrong' | 'complete';
let context: AudioContext | undefined;
/** 必ずユーザー操作から呼ぶ。AudioContextは最初の操作まで作らない。 */
export function unlockSound(settings: Pick<Settings, 'sound'>): void {
  if (!settings.sound || typeof AudioContext === 'undefined') return;
  try { context ??= new AudioContext(); if (context.state === 'suspended') void context.resume().catch(() => {}); } catch { /* 音なしでも学習できる */ }
}
export function playCue(cue: Cue, settings: Pick<Settings, 'sound' | 'vibration'>): void {
  unlockSound(settings);
  if (settings.sound && context) {
    try {
      const notes = cue === 'wrong' ? [164] : cue === 'correct' ? [523, 784] : [523, 659, 784, 1047];
      const now = context.currentTime;
      notes.forEach((frequency, index) => {
        const oscillator = context!.createOscillator();
        const gain = context!.createGain();
        const start = now + index * 0.09;
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.08, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
        oscillator.connect(gain); gain.connect(context!.destination);
        oscillator.start(start); oscillator.stop(start + 0.22);
      });
    } catch { /* 音の失敗は進行を止めない */ }
  }
  if (settings.vibration && typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(cue === 'wrong' ? [30, 30, 30] : cue === 'complete' ? [25, 40, 50] : 20); } catch { /* 非対応 */ }
  }
}
