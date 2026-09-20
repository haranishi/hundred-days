export const DURATION_SECONDS = 36;
export const DEFAULT_FPS = 30;
export const T_PASTE = 6.9;
export const T_SAVE = 23.4;
export const T_FRAME = 20.7;
// 約束の消えぎわとエンドの出はじめを重ねる（ここを揃えないと1コマだけ何も無い画になる）
export const END_START = 29.9;

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック', start: 0, end: 2.6 },
  { id: 'S1', name: 'タイトル', start: 2.6, end: 5 },
  { id: 'S2', name: '貼る', start: 5, end: 10 },
  { id: 'S3', name: '背景', start: 10, end: 15 },
  { id: 'S4', name: '比率', start: 15, end: 20 },
  { id: 'S5', name: '枠と保存', start: 20, end: 26 },
  { id: 'S6', name: '約束', start: 26, end: 30 },
  { id: 'S7', name: 'エンド', start: 30, end: 36 }
]);

export const CAPTIONS = Object.freeze([
  { start: .35, end: 2.6, lines: ['そのスクショ、', 'そのまま貼ってない？'], kind: 'hook' },
  { start: 5.8, end: 8, lines: ['⌘V で貼るだけ'] },
  { start: 8, end: 10, lines: ['1秒で、整う'] },
  { start: 10.7, end: 12.8, lines: ['背景は10種'] },
  { start: 12.8, end: 15, lines: ['単色も、透明も'] },
  { start: 15.6, end: 17.6, lines: ['正方形や4:5にも'] },
  { start: 17.6, end: 20, lines: ['画像は切らず、', '背景を足す'] },
  { start: 20.5, end: 22.4, lines: ['ウィンドウ風の枠も'] },
  { start: 22.4, end: 24.6, lines: ['PNGで保存。', 'コピーもできる'] },
  { start: 24.6, end: 26, lines: ['そのまま、投稿に貼れる'] }
]);

// アプリの状態は時刻から決める。実際の click は promo.js が「前回との差分」だけ流す。
export const BACKGROUND_CUES = Object.freeze([
  { at: 10.8, id: 'sunset' },
  { at: 11.7, id: 'ocean' },
  { at: 12.6, id: 'midnight' },
  { at: 13.5, id: 'paper' },
  { at: 14.4, id: 'graphite' },
  { at: 15.3, id: 'grape' }
]);

export const ASPECT_CUES = Object.freeze([
  { at: 15.8, id: '1:1' },
  { at: 17.6, id: '4:5' }
]);

export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const mix = (from, to, amount) => from + (to - from) * amount;
export const easeOutCubic = (x) => 1 - (1 - clamp(x)) ** 3;
export const easeInOutCubic = (x) => {
  const p = clamp(x);
  return p < .5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
};
export const progress = (t, start, end, easing = (x) => x) => (
  easing(clamp((t - start) / (end - start)))
);

export function sceneAt(t) {
  const time = clamp(Number(t) || 0, 0, DURATION_SECONDS);
  return STORYBOARD.find((scene, index) => (
    time >= scene.start && (time < scene.end || index === STORYBOARD.length - 1)
  )) ?? STORYBOARD[0];
}

export function captionAt(t) {
  return CAPTIONS.find(({ start, end }) => t >= start && t < end) ?? null;
}

export function appStateAt(t) {
  const last = (cues, fallback) => cues.reduce((value, cue) => (t >= cue.at ? cue.id : value), fallback);
  return {
    loaded: t >= T_PASTE,
    bg: last(BACKGROUND_CUES, 'grape'),
    aspect: last(ASPECT_CUES, 'auto'),
    frame: t >= T_FRAME,
    saved: t >= T_SAVE
  };
}

// 素のスクショ → 額縁付きカード。frame が 0 なら余白も角丸も影も無い＝ただのスクショ。
export function heroTimeline(t) {
  // t=0 で額縁が半分できかけ（1コマ目＝Xのサムネで「額縁」が伝わる。素のスクショだけだと Day 026 の投稿に見える）
  const frame = progress(t, -.35, 1.4, easeOutCubic);
  if (t < 2.6) {
    return { centerY: 880, scale: mix(.94, 1, progress(t, 0, .5, easeOutCubic)), opacity: 1, frame };
  }
  if (t < 5) {
    const p = progress(t, 2.6, 3.25, easeInOutCubic); // 上へ収まってからタイトルを出す（重なり防止）
    return { centerY: mix(880, 420, p), scale: mix(1, .43, p), opacity: 1, frame: 1 };
  }
  if (t < 5.4) return { centerY: 420, scale: .43, opacity: 1 - progress(t, 5, 5.4, easeInOutCubic), frame: 1 };
  if (t < END_START) return { centerY: 420, scale: .43, opacity: 0, frame: 1 };
  const back = progress(t, END_START, END_START + .65, easeOutCubic); // エンドでもう一度、額縁の付いた1枚を見せる
  return { centerY: mix(590, 548, back), scale: mix(.46, .4, back), opacity: back, frame: 1 };
}

export function phoneTimeline(t) {
  return {
    opacity: t < 5 ? 0 : (t < 26 ? 1 : 1 - progress(t, 26, 26.6, easeInOutCubic)),
    translateY: t < 5 ? 1450 : (t < 5.6 ? mix(1450, 0, progress(t, 5, 5.6, easeOutCubic)) : 0)
  };
}

/* 押したら早めに退く。着地したプレビューを隠さないよう、フェードは 7.3 で終わらせる。 */
export function keycapTimeline(t) {
  if (t < 6.2 || t >= 7.3) return { opacity: 0, scale: 1 };
  const appear = progress(t, 6.2, 6.45, easeOutCubic);
  const press = progress(t, 6.85, 6.95, easeOutCubic);
  return {
    opacity: appear * (1 - progress(t, 6.98, 7.3, easeInOutCubic)),
    scale: mix(.62, 1, appear) * mix(1, .92, press)
  };
}

// プレビュー上端を画面 19px に置く。アプリ側の高さが変わっても毎コマ追従させる。
export function scrollAt(t, target) {
  if (t < 10) return 0;
  if (t < 10.6) return mix(0, target, progress(t, 10, 10.6, easeInOutCubic));
  return target;
}

export function ringOpacity(t, start, holdEnd, end) {
  if (t < start || t >= end) return 0;
  if (t < start + .3) return progress(t, start, start + .3, easeOutCubic);
  if (t > holdEnd) return 1 - progress(t, holdEnd, end, easeInOutCubic);
  return 1;
}

export function previewTimes() {
  return STORYBOARD.flatMap(({ start, end }) => [start, (start + end) / 2]);
}
