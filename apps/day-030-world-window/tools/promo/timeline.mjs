export const DURATION_SECONDS = 36;
export const DEFAULT_FPS = 30;

export const CAMERA_COUNT = 9151;
export const TALLINN_CAMERA = 'n8244685419';
// 画像が大きく、街の名前も分かりやすい固定カメラにして乱数へ依存させない。
export const SECOND_CAMERA = 'n5451417033';

export const SEARCH_START = 5.8;
export const SEARCH_END = 7.8;
export const T_SEARCH_TAP = 8.45;
export const T_TALLINN_CAMERA = 8.75;
export const T_RANDOM_TAP = 19.25;
export const T_SECOND_CAMERA = 19.7;
export const END_START = 30;

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック', start: 0, end: 2.6 },
  { id: 'S1', name: 'タイトル', start: 2.6, end: 5.2 },
  { id: 'S2', name: '検索', start: 5.2, end: 12 },
  { id: 'S3', name: '詳細', start: 12, end: 18 },
  { id: 'S4', name: 'どこかの窓', start: 18, end: 24 },
  { id: 'S5', name: '約束', start: 24, end: 30 },
  { id: 'S6', name: 'エンド', start: 30, end: 36 },
]);

export const CAPTIONS = Object.freeze([
  { start: .25, end: 2.6, lines: ['世界中の公開カメラを', '1枚の地図に'], kind: 'hook' },
  { start: 5.55, end: 8.8, lines: ['探して、押すだけ'] },
  { start: 8.8, end: 12, lines: ['その場所の、いまが見える'] },
  { start: 12.35, end: 15.1, lines: ['国・向き・現地時刻も'] },
  { start: 15.1, end: 18, lines: ['いま昼か夜かも'] },
  { start: 18.15, end: 20.15, lines: ['どこかの窓を開く'] },
  { start: 20.15, end: 24, lines: ['知らない街の、いま'] },
]);

export const TAPS = Object.freeze([
  { at: T_SEARCH_TAP, target: 'search-result' },
  { at: T_RANDOM_TAP, target: 'random-button' },
]);

export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const mix = (from, to, amount) => from + (to - from) * amount;
export const easeOutCubic = (x) => 1 - (1 - clamp(x)) ** 3;
export const easeInOutCubic = (x) => {
  const p = clamp(x);
  return p < .5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
};
export const progress = (t, start, end, easing = (x) => x) => easing(clamp((t - start) / (end - start)));

export function captionAt(t) {
  return CAPTIONS.find(({ start, end }) => t >= start && t < end) ?? null;
}

export function countAt(t) {
  // 1コマ目はXのサムネになる。0から数え始めると「0 か所」が看板になるので、下駄を履かせて数え上げる
  return Math.round(CAMERA_COUNT * (0.18 + 0.82 * progress(t, 0, 2.15, easeOutCubic)));
}

export function searchTextAt(t) {
  if (t < SEARCH_START) return '';
  const text = 'Tallinn';
  return text.slice(0, Math.floor(progress(t, SEARCH_START, SEARCH_END) * text.length + .001));
}

/* ナビゲーションを伴う場面だけキーを分ける。スクロールと入力値は同じ文書内で時刻から描く。 */
export function appSceneAt(t) {
  if (t < 5.2) return 'world';
  if (t < T_TALLINN_CAMERA) return 'search';
  if (t < T_SECOND_CAMERA) return 'tallinn';
  if (t < 24) return 'madrid';
  return 'world';
}

export function panelScrollAt(t, maxScroll) {
  if (t < 12 || t >= 18) return 0;
  if (t < 15.8) return mix(0, Math.min(620, maxScroll), progress(t, 12.2, 15.8, easeInOutCubic));
  return Math.min(620, maxScroll);
}

export function phoneTimeline(t) {
  const active = (t < 2.6) || (t >= 5.2 && t < 24);
  return {
    opacity: active ? 1 : 0,
    translateY: t >= 5.2 && t < 5.8 ? mix(1450, 0, progress(t, 5.2, 5.8, easeOutCubic)) : 0,
  };
}

export function previewTimes() {
  return [0, .8, 2.25, 3.35, 4.65, 5.4, 6.2, 7.1, 8.25, 8.55, 9.6, 11.5,
    12.4, 14.2, 16.4, 18.4, 19.2, 19.85, 21.2, 23.5, 24.4, 26.1, 28.4, 30.4, 32.2, 35.4];
}
