/* 日本語版の編集が届いた時だけ鳴らす音を決める。
   何が届いても濁らないようにペンタトニック（黒鍵だけの音階と同じ響き）へ丸め、
   大きい編集ほど低く長く鳴らす。音源ファイルは持たず、Web Audioでその場で合成する。 */

// A3から2オクターブぶんのAマイナーペンタトニック（A C D E G）
export const SCALE = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99];

// これ以上の増減はまとめて「いちばん大きい編集」として扱う
export const LOUDEST_BYTES = 4096;

/** バイト増減 → 鳴らす音。delta が大きいほど低く・大きく・長い。 */
export function toneFor(delta) {
  const size = Math.abs(Number.isFinite(delta) ? delta : 0);
  const weight = Math.min(1, Math.log10(size + 1) / Math.log10(LOUDEST_BYTES + 1));
  const index = Math.round((1 - weight) * (SCALE.length - 1));

  return {
    freq: SCALE[index],
    gain: Number((0.04 + 0.1 * weight).toFixed(4)),
    durationMs: Math.round(260 + 900 * weight),
    // 減った編集は少し暗い音色にする（倍音を減らす）
    timbre: delta < 0 ? 'triangle' : 'sine',
  };
}
