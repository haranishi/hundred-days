export const DURATION_SECONDS = 36;
export const DEFAULT_FPS = 30;
export const T_STAMP = 22.8;

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック', start: 0, end: 2.6 },
  { id: 'S1', name: 'タイトル', start: 2.6, end: 5 },
  { id: 'S2', name: '形と月齢', start: 5, end: 10 },
  { id: 'S3', name: '出入り', start: 10, end: 15 },
  { id: 'S4', name: 'なぞる', start: 15, end: 21 },
  { id: 'S5', name: '帳', start: 21, end: 26 },
  { id: 'S6', name: '約束', start: 26, end: 30 },
  { id: 'S7', name: 'エンド', start: 30, end: 36 }
]);

export const CAPTIONS = Object.freeze([
  { start: .4, end: 2.6, lines: ['今夜の月、', '何時に出るか知ってる？'], kind: 'hook' },
  { start: 5.8, end: 8, lines: ['形も、月齢も、', '出る時刻も。'] },
  { start: 8, end: 10, lines: ['今夜の形が、', 'そのまま描かれる'] },
  { start: 10.8, end: 13, lines: ['自分の場所の、', '月の出と入り'] },
  { start: 13, end: 15, lines: ['方位も、翌朝の入りも'] },
  { start: 15.8, end: 18.8, lines: ['日付をなぞると、', '月が満ちていく'] },
  { start: 18.8, end: 19.8, lines: ['中秋の名月まで、', 'あと23日'] },
  { start: 19.8, end: 21, lines: ['今年の名月は、', '満月の2日前'] },
  { start: 21.8, end: 24, lines: ['見た夜を、帳に残す'] },
  { start: 24, end: 26, lines: ['端末の中にだけ、', 'たまっていく'] }
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

export function phoneTimeline(t) {
  const enter = progress(t, 5, 5.6, easeOutCubic);
  const leave = progress(t, 26, 26.6, easeInOutCubic);
  return {
    opacity: t < 5 ? 0 : (t < 26 ? 1 : 1 - leave),
    translateY: t < 5 ? 1450 : (t < 5.6 ? mix(1450, 0, enter) : 0),
    dateOffset: t < 15.8 ? 0
      : t < 18.4 ? Math.round(mix(0, 23, progress(t, 15.8, 18.4, easeInOutCubic)))
        : t < 21 ? 23
          : t < 21.6 ? Math.round(mix(23, 0, progress(t, 21, 21.6, easeInOutCubic))) : 0,
    scrollMode: t < 10 ? 'hero' : t < 15 ? 'times' : t < 18.6 ? 'hero'
      : t < 21 ? 'harvest' : 'journal'
  };
}

export function moonTimeline(t) {
  if (t < 2.6) {
    return {
      centerY: mix(1180, 770, progress(t, 0, 1.6, easeOutCubic)),
      scale: 1,
      opacity: 1,
      halo: mix(.34, .9, progress(t, 0, 1.6, easeOutCubic))
    };
  }
  if (t < 5) {
    const p = progress(t, 2.6, 3.25, easeInOutCubic); // 月が上へ収まってからタイトルを出す（重なり防止）
    return { centerY: mix(770, 420, p), scale: mix(1, .43, p), opacity: 1, halo: .8 };
  }
  if (t < 5.4) return { centerY: 420, scale: .43, opacity: 1 - progress(t, 5, 5.4), halo: .8 };
  if (t < 30) return { centerY: 420, scale: .43, opacity: 0, halo: .8 };
  const endEntrance = progress(t, 30, 30.65, easeOutCubic);
  return {
    centerY: mix(450, 330, endEntrance),
    scale: mix(.52, .43, endEntrance),
    opacity: endEntrance,
    halo: .75
  };
}

export function previewTimes() {
  return STORYBOARD.flatMap(({ start, end }) => [start, (start + end) / 2]);
}
