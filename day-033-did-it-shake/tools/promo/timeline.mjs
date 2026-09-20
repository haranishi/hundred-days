/* Day 032 の合成方式を継承。時刻 t だけから場面・字幕・動きを決める。 */
export const DURATION_SECONDS = 36;
export const DEFAULT_FPS = 30;
export const FIXED_NOW = '2026-08-23T02:07:00+09:00';
export const PLACE_CODE = '08201';
export const PLACE_LABEL = '茨城県水戸市';
export const TITLE_START = 3.4;
export const ANSWER_START = 6.4;
export const BAR_START = 12.4;
export const PICK_START = 18.4;
export const LAST_START = 24.4;
export const PROMISE_START = 29.4;
export const END_START = 32.8;
export const RESULT_START = LAST_START;
// 冒頭はタップ直後。指も答えも0秒ですでに見える。
export const T_HOOK_TAP = -.08;
export const T_PICK_TAP = 19.1;
export const T_PREF_TAP = 20.3;
export const T_TOWN_TAP = 21.5;
export const T_CONFIRM_TAP = 22.7;
export const T_RECENT_TAP = 26.5;
export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック', start: 0, end: TITLE_START },
  { id: 'S1', name: 'タイトル', start: TITLE_START, end: ANSWER_START },
  { id: 'S2', name: '答え', start: ANSWER_START, end: BAR_START },
  { id: 'S3', name: '回数と帯', start: BAR_START, end: PICK_START },
  { id: 'S4', name: '場所', start: PICK_START, end: LAST_START },
  { id: 'S5', name: '最後の揺れと一覧', start: LAST_START, end: PROMISE_START },
  { id: 'S6', name: '約束', start: PROMISE_START, end: END_START },
  { id: 'S7', name: 'エンド', start: END_START, end: DURATION_SECONDS }
]);
export const CAPTIONS = Object.freeze([
  { start: -.5, end: TITLE_START, lines: ['いま揺れた？ 地震だった？'], kind: 'hook' },
  { start: ANSWER_START, end: 9.4, lines: ['答えは1行'] },
  { start: 9.4, end: BAR_START, lines: ['あなたの街の震度が出る'] },
  { start: BAR_START, end: 15.4, lines: ['毎日いくつも揺れている'] },
  { start: 15.4, end: PICK_START, lines: ['右端が、いまの揺れ'] },
  { start: PICK_START, end: 21.4, lines: ['場所は市区町村から'] },
  { start: 21.4, end: LAST_START, lines: ['座標は端末の外に出ない'] },
  { start: LAST_START, end: T_RECENT_TAP, lines: ['この街の最後の揺れも'] },
  { start: T_RECENT_TAP, end: PROMISE_START, lines: ['直近10件はここ'] }
]);
export const TAPS = Object.freeze([
  { at: T_HOOK_TAP, target: 'check', kind: 'correct' },
  { at: T_PICK_TAP, target: 'pick', kind: 'hint' },
  { at: T_PREF_TAP, target: 'pref', kind: 'hint' },
  { at: T_TOWN_TAP, target: 'town', kind: 'hint' },
  { at: T_CONFIRM_TAP, target: 'confirm', kind: 'correct' },
  { at: T_RECENT_TAP, target: 'recent', kind: 'hint' }
]);
export const FINGER = Object.freeze(TAPS.flatMap(({ at, target }) => [
  { at: at - .5, target: 'idle' },
  { at, target },
  { at: at + .18, target },
  { at: at + .65, target: 'idle', fade: true }
]));
export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const mix = (from, to, amount) => from + (to - from) * amount;
export const easeOutCubic = (x) => 1 - (1 - clamp(x)) ** 3;
export const easeInOutCubic = (x) => {
  const p = clamp(x);
  return p < .5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
};
export const progress = (t, start, end, easing = (x) => x) => easing(clamp((t - start) / (end - start)));
export const captionAt = (t) => CAPTIONS.find(({ start, end }) => t >= start && t < end) ?? null;
export function appSceneAt(t) {
  if (t < TITLE_START) return 'hook';
  if (t < BAR_START) return 'answer';
  if (t < PICK_START) return 'bar';
  if (t < T_PICK_TAP) return 'pick-start';
  if (t < T_PREF_TAP) return 'pick-dialog';
  if (t < T_TOWN_TAP) return 'pick-pref';
  if (t < T_CONFIRM_TAP + .22) return 'pick-town';
  if (t < LAST_START) return 'pick-done';
  if (t < T_RECENT_TAP) return 'last';
  return 'recent';
}
export const stripRevealAt = (t, index, count) => t < BAR_START || t >= PICK_START ? 1
  : progress(t, BAR_START + .7 + index / count * 1.25, BAR_START + 1 + index / count * 1.25, easeOutCubic);
export function scrollWindowAt(t) {
  if (t < TITLE_START) return null;
  if (t < BAR_START) return { target: 'answer', amount: 1 };
  if (t < PICK_START) return { target: 'bar', amount: progress(t, BAR_START, BAR_START + .7, easeInOutCubic) };
  if (t < LAST_START) return { target: 'place', amount: 1 };
  return { target: 'last', amount: 1 };
}
export function phoneTimeline(t) {
  if (t < TITLE_START) return { opacity: 1 - progress(t, TITLE_START - .3, TITLE_START, easeInOutCubic), x: 0, y: 0 };
  if (t < ANSWER_START || t >= PROMISE_START) return { opacity: 0, x: 0, y: 0 };
  let opacity = progress(t, ANSWER_START, ANSWER_START + .4, easeOutCubic)
    * (1 - progress(t, PROMISE_START - .32, PROMISE_START, easeInOutCubic));
  let x = 0;
  for (const at of [PICK_START, LAST_START]) {
    if (t >= at - .26 && t < at) {
      const p = progress(t, at - .26, at, easeInOutCubic); x = mix(0, -170, p); opacity *= 1 - p;
    } else if (t >= at && t < at + .3) {
      const p = progress(t, at, at + .3, easeOutCubic); x = mix(170, 0, p); opacity *= p;
    }
  }
  return { opacity, x, y: mix(110, 0, progress(t, ANSWER_START, ANSWER_START + .45, easeOutCubic)) };
}
export function backdropDrift(t, index) {
  return { x: Math.sin(t * .19 + index * 1.7) * 16, y: Math.cos(t * .15 + index * 2.3) * 20 };
}
export const previewTimes = () => [0, .3, 1.5, 3.1, 3.8, 4.8, 5.8, 6.8, 8, 9.6, 11.8,
  12.6, 13.2, 14.6, 15.6, 17.8, 18.7, 19.1, 19.6, 20.3, 20.8, 21.5, 22.2,
  22.7, 23, 23.8, 24.8, 25.6, 26.5, 27, 28.6, 29.8, 30.8, 32.2, 33.4, 34.8];
