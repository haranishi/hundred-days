/* 絵コンテ・字幕・振り付け。1コマは時刻 t の純関数で、DOMにも通信にも触れない。
   土台は Day 031 の同名ファイル。差し替えたのは場面・字幕・指の道筋・固定応答。 */

export const DURATION_SECONDS = 36;
export const DEFAULT_FPS = 30;

/* 天気は実APIを叩かず、tests/fixtures/akita-2026-09-08.json を返して撮る（render-promo.mjs の route）。
   時計も同じ日に止める。撮り直すたびに違う数字が出ると、動画と投稿文が食い違う。 */
export const FIXED_NOW = '2026-09-08T09:30:00+09:00';
export const PLACE_CODE = '05201'; // 秋田市
export const PLACE_LABEL = '秋田県秋田市';

// 場面の切れ目
export const TITLE_START = 3.4;
export const PICK_START = 6.4;
export const ANSWER_START = 11.4;
export const FABRIC_START = 16.4;
export const BAR_START = 22.4;
export const WHY_START = 26.4;
export const PROMISE_START = 29.6;
export const END_START = 32.8;

// 指がボタンに触れる時刻
export const T_HOOK_TAP = 1.1;
export const T_PICK_TAP = 7.5;
export const T_TOWN_TAP = 9.4;
export const T_THICK_TAP = 17.6;
export const T_SHADE_TAP = 20.2;
export const T_WHY_TAP = 27.0;

/* promo-audio.mjs が読む。結果画面（＝いちばん静かに落とす場面）の始まり */
export const RESULT_START = WHY_START;

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック（何時に乾く？）', start: 0, end: TITLE_START },
  { id: 'S1', name: 'タイトル', start: TITLE_START, end: PICK_START },
  { id: 'S2', name: '場所を選ぶ', start: PICK_START, end: ANSWER_START },
  { id: 'S3', name: '乾く時刻と取り込みの締切', start: ANSWER_START, end: FABRIC_START },
  { id: 'S4', name: '厚手と日かげで変わる', start: FABRIC_START, end: BAR_START },
  { id: 'S5', name: '24時間の帯', start: BAR_START, end: WHY_START },
  { id: 'S6', name: '計算の根拠', start: WHY_START, end: PROMISE_START },
  { id: 'S7', name: '約束と出典', start: PROMISE_START, end: END_START },
  { id: 'S8', name: 'エンド', start: END_START, end: DURATION_SECONDS }
]);

/* 字幕は1行16字以内・2行以内。フックだけ 0 より前から出して、1コマ目（Xのサムネ）に載せる */
export const CAPTIONS = Object.freeze([
  { start: -0.5, end: TITLE_START, lines: ['この洗濯物、何時に乾く？'], kind: 'hook' },
  { start: 6.55, end: T_TOWN_TAP, lines: ['現在地か、市区町村から'] },
  { start: T_TOWN_TAP, end: ANSWER_START, lines: ['選ぶのはここだけ'] },
  { start: 11.6, end: 14.0, lines: ['答えは時刻ひとつ'] },
  { start: 14.0, end: FABRIC_START, lines: ['取り込みの締切も出る'] },
  { start: 16.6, end: T_SHADE_TAP, lines: ['厚手にすると2時間半のび、', '生乾きの注意が出る'] },
  { start: T_SHADE_TAP, end: BAR_START, lines: ['日かげだと、今日は乾かない'] },
  { start: 22.6, end: WHY_START, lines: ['夜に雨が来るのも見える'] },
  { start: 26.6, end: PROMISE_START, lines: ['なぜその時刻かも開ける'] }
]);

/** 押した瞬間の波紋。kind は色（決め手のタップは晴れ色、選ぶだけのものは墨） */
export const TAPS = Object.freeze([
  { at: T_HOOK_TAP, kind: 'correct' },
  { at: T_PICK_TAP, kind: 'hint' },
  { at: T_TOWN_TAP, kind: 'correct' },
  { at: T_THICK_TAP, kind: 'correct' },
  { at: T_SHADE_TAP, kind: 'hint' },
  { at: T_WHY_TAP, kind: 'hint' }
]);

/* 指の通り道。target はアプリ内の的の名前で、座標は毎コマ測って解決する。
   fade: true のキーフレームで指は消え、次のキーフレームまで出てこない。 */
export const FINGER = Object.freeze([
  { at: -1, target: 'idle' },
  { at: T_HOOK_TAP, target: 'fabric:thick' },
  { at: 1.8, target: 'idle', fade: true },

  { at: 6.7, target: 'idle' },
  { at: T_PICK_TAP, target: 'pick' },
  { at: 8.3, target: 'idle' },
  { at: T_TOWN_TAP, target: 'confirm' },
  { at: 10.1, target: 'idle', fade: true },

  { at: 16.7, target: 'idle' },
  { at: T_THICK_TAP, target: 'fabric:thick' },
  { at: 18.5, target: 'idle' },
  { at: T_SHADE_TAP, target: 'place:shade' },
  { at: 21.0, target: 'idle', fade: true },

  { at: 26.5, target: 'idle' },
  { at: T_WHY_TAP, target: 'why' },
  { at: 27.9, target: 'idle', fade: true }
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

/* アプリを読み直す単位。場面が変わったときだけ iframe を開き直し、同じ場面の中では読み直さない。
   キーは promo.js の PLANS（どの設定で開き、どのボタンを順に押すか）と対になっている。 */
export function appSceneAt(t) {
  if (t < T_HOOK_TAP) return 'hook';
  if (t < TITLE_START) return 'hook-thick';
  if (t < T_PICK_TAP) return 'pick-start';
  if (t < T_TOWN_TAP) return 'pick-dialog';
  if (t < T_THICK_TAP) return 'answer';
  if (t < T_SHADE_TAP) return 'thick';
  if (t < BAR_START) return 'shade';
  if (t < T_WHY_TAP) return 'bar';
  return 'why';
}

/* 数字が入れ替わるところをふわっと見せる（撮影は動きを減らす設定なのでアプリ側は描かない）。
   窓の始まりは、その数字が変わるタップの時刻。 */
const TIME_FADES = [-0.6, T_HOOK_TAP, ANSWER_START, T_THICK_TAP, T_SHADE_TAP, BAR_START];
export function timeFadeAt(t) {
  const start = TIME_FADES.filter((value) => t >= value).pop();
  return start === undefined ? 0 : progress(t, start, start + 0.42, easeOutCubic);
}

/** 24時間の帯が左から伸びる。数字と同じタイミングで描き直す */
export function barGrowAt(t) {
  const start = TIME_FADES.filter((value) => t >= value).pop();
  return start === undefined ? 0 : progress(t, start, start + 0.6, easeOutCubic);
}

/** 生乾きの注意がせり上がる（厚手にしたときだけ出る） */
export function smellFadeAt(t) {
  if (t < T_THICK_TAP) return 0;
  return progress(t, T_THICK_TAP + .15, T_THICK_TAP + .6, easeOutCubic);
}

/** 計算の根拠が開く度合い */
export function whyOpenAt(t) {
  if (t < T_WHY_TAP) return 0;
  return progress(t, T_WHY_TAP, T_WHY_TAP + .45, easeOutCubic);
}

/* 画面のどこを見せるか。値は「測った目標位置に掛ける率」で、目標は promo.js が毎コマ測る。 */
const SCROLL_WINDOWS = [
  { target: 'bar', from: BAR_START + .2, to: BAR_START + 1.1, until: WHY_START },
  { target: 'why', from: T_WHY_TAP + .1, to: T_WHY_TAP + 1.0, until: PROMISE_START }
];
export function scrollWindowAt(t) {
  const window = SCROLL_WINDOWS.find(({ from, until }) => t >= from - .25 && t < until);
  if (!window) return null;
  return { target: window.target, amount: progress(t, window.from, window.to, easeInOutCubic) };
}

/* 端末の出入り。S2 と S5 は別の場面へ切り替わるので、横にスワイプして入れ替える */
const SWIPES = [PICK_START, BAR_START];
export function phoneTimeline(t) {
  if (t < TITLE_START) return { opacity: 1 - progress(t, TITLE_START - .3, TITLE_START, easeInOutCubic), x: 0, y: 0 };
  if (t < PICK_START || t >= PROMISE_START) return { opacity: 0, x: 0, y: 0 };
  let opacity = progress(t, PICK_START, PICK_START + .4, easeOutCubic)
    * (1 - progress(t, PROMISE_START - .32, PROMISE_START, easeInOutCubic));
  let x = 0;
  for (const at of SWIPES) {
    if (at === PICK_START) continue; // 入場そのものなので横移動は付けない
    if (t >= at - .26 && t < at) {
      const p = progress(t, at - .26, at, easeInOutCubic);
      x = mix(0, -170, p);
      opacity *= 1 - p;
    } else if (t >= at && t < at + .3) {
      const p = progress(t, at, at + .3, easeOutCubic);
      x = mix(170, 0, p);
      opacity *= p;
    }
  }
  return { opacity, x, y: mix(110, 0, progress(t, PICK_START, PICK_START + .45, easeOutCubic)) };
}

/** 背景の雫のゆっくりした漂い（コマの純関数のまま息をさせる） */
export function backdropDrift(t, index) {
  return {
    x: Math.sin(t * .19 + index * 1.7) * 16,
    y: Math.cos(t * .15 + index * 2.3) * 20
  };
}

export function previewTimes() {
  return [
    0, .6, 1.1, 1.5, 2.4, 3.1, 3.8, 4.8, 5.8, 6.6, 7.5, 8.4,
    9.4, 10.2, 11.6, 12.8, 14.2, 15.4, 16.6, 17.6, 18.4, 19.4, 20.2, 21.2,
    22.6, 23.6, 24.8, 25.8, 26.6, 27.1, 28.2, 29.2, 30.4, 31.8, 33.2, 34.6
  ];
}
