/* 拍と秒の行き来、それと入力の補正値。

   音ゲーで秒を直接扱うと、テンポを変えた瞬間に全部書き直しになる。
   譜面は拍で持ち、鳴らす直前に秒へ落とす。時計の正本は AudioContext.currentTime。 */

/* カウントインの長さ。前半4拍で「練習の1発」を撃たせ、後半4拍で数える。
   4拍しかないと、1回も成功しないまま本編が始まる（体験評価1周目の指摘）。 */
export const COUNT_IN_BEATS = 8;

/** 1拍の長さ(秒)。BPMが壊れていたら 120 として扱う（曲を止めないため）。 */
export function secondsPerBeat(bpm) {
  return Number.isFinite(bpm) && bpm > 0 ? 60 / bpm : 0.5;
}

/** 拍 → 曲の開始からの秒。カウントインぶんを足した位置を返す。 */
export function beatToSeconds(beat, bpm) {
  if (!Number.isFinite(beat)) return 0;
  return (beat + COUNT_IN_BEATS) * secondsPerBeat(bpm);
}

/** 秒 → 拍。カウントイン中は負の拍になる（曲はまだ始まっていない）。 */
export function secondsToBeat(seconds, bpm) {
  if (!Number.isFinite(seconds)) return -COUNT_IN_BEATS;
  return seconds / secondsPerBeat(bpm) - COUNT_IN_BEATS;
}

/* 補正値。localStorage が解禁されていない（Day 21から）ので保存できない。
   代わりに URL のハッシュへ載せる。保存ではなくリンクなので制約の内側で、
   合わせた値をブックマークすれば次回も同じ位置から始められる。 */

export const CALIBRATION_LIMIT_MS = 150;
export const CALIBRATION_STEP_MS = 5;

/** ハッシュ（#cal=-20）から補正値(ms)を読む。範囲外・数でないものは不正入力として返す。 */
export function readCalibration(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return { ms: 0, invalid: false, present: false };

  const found = /(?:^|&)cal=(-?\d+(?:\.\d+)?)/.exec(raw);
  if (!found) return { ms: 0, invalid: false, present: false };

  const value = Number(found[1]);
  if (!Number.isFinite(value) || Math.abs(value) > CALIBRATION_LIMIT_MS) {
    return { ms: 0, invalid: true, present: true };
  }
  // 刻みに合わせて丸める。手で書き換えられた半端な値をそのまま信じない
  const stepped = Math.round(value / CALIBRATION_STEP_MS) * CALIBRATION_STEP_MS;
  return { ms: stepped, invalid: false, present: true };
}

/** 補正値(ms) → ハッシュ。0 のときは何も付けない（初期状態のURLを汚さない）。 */
export function writeCalibration(ms) {
  const value = Math.round(Number(ms) / CALIBRATION_STEP_MS) * CALIBRATION_STEP_MS;
  if (!Number.isFinite(value) || value === 0) return '';
  const clamped = Math.max(-CALIBRATION_LIMIT_MS, Math.min(CALIBRATION_LIMIT_MS, value));
  return `#cal=${clamped}`;
}
