export const DURATION_SECONDS = 36;
export const DEFAULT_FPS = 30;

/* 撮影日を固定する。ここと記録の日付がずれると「水をあげた日」の数もしおれ具合も変わる。
   render-promo.mjs が page.clock.setFixedTime に渡し、promo.js が iframe 側の日付を照合する。 */
export const FIXED_TIME = '2026-09-04T09:00:00+09:00';
export const FIXED_TODAY = '2026-09-04';

// 3つの記録も、フックとエンドの木も同じ種。同じ木が育っていく話に見せる。
export const PLANT_SEED = 280904; // demo-scenario.mjs と同じ種＝デモ・スクショ・プロモで同じ木

export const T_WATER1 = 7.4;
export const T_WATER2 = 13.4;
export const T_WATER3 = 19.6;
export const T_REPLAY = 22.8;
export const REPLAY_SECONDS = 3;
export const DROP_SECONDS = .5; // しずくが落ちきるまで
export const GROW_SECONDS = .9; // しずくの着地から枝葉が開ききるまで
// 約束の消えぎわとエンドの出はじめを重ねる（ここを揃えないと1コマだけ何も無い画になる）
export const END_START = 29.9;

/* 読み込ませる記録。撮影日が 2026-09-04 なので R1・R2 は「最後が昨日」、R3 は「最後が5日前」。
   水をあげる操作は promo.js が click で流すので、ここには押す前の状態だけを書く。 */
export const TREE_RECORDS = Object.freeze({
  R1: { firstDay: '2026-08-24', days: 11, at: 0 },
  R2: { firstDay: '2026-08-23', days: 12, at: 11 },
  R3: { firstDay: '2026-08-18', days: 13, at: 16 }
});

export const WATER_TIMES = Object.freeze({ R1: T_WATER1, R2: T_WATER2, R3: T_WATER3 });

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック', start: 0, end: 2.6 },
  { id: 'S1', name: 'タイトル', start: 2.6, end: 5 },
  { id: 'S2', name: '水をあげる', start: 5, end: 11 },
  { id: 'S3', name: '次の日', start: 11, end: 16 },
  { id: 'S4', name: '忘れても', start: 16, end: 22 },
  { id: 'S5', name: '成長を見る', start: 22, end: 26 },
  { id: 'S6', name: '約束', start: 26, end: 30 },
  { id: 'S7', name: 'エンド', start: 30, end: 36 }
]);

// 1行16字以内・2行以内。組み幅は 776px なので 66px の字なら11字までが1行に収まる。
export const CAPTIONS = Object.freeze([
  { start: .35, end: 2.6, lines: ['毎日、ひとしずく。', 'それだけで育つ木。'], kind: 'hook' },
  { start: 5.8, end: T_WATER1, lines: ['開いて、押すだけ'] },
  { start: 7.6, end: 9.6, lines: ['今日のぶんだけ、伸びる'] },
  { start: 9.6, end: 11, lines: ['1日1回まで'] },
  { start: 11.6, end: T_WATER2, lines: ['次の日も、ひとしずく'] },
  { start: 13.8, end: 16, lines: ['昨日は無かった枝がある'] },
  { start: 16.6, end: 19.4, lines: ['忘れた日は、しおれる'] },
  { start: 19.8, end: 22, lines: ['でも、枯れない'] },
  { start: 22.6, end: 26, lines: ['これまでの成長を再生'] }
]);

// 押した指の代わりの波紋。#replay は押さず、再生そのものは overlay 側で描く。
export const TAPS = Object.freeze([
  { at: T_WATER1, target: 'water' },
  { at: T_WATER2, target: 'water' },
  { at: T_WATER3, target: 'water' },
  { at: T_REPLAY, target: 'replay' }
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

const DAY_MS = 86_400_000;
const dayValue = (text) => {
  const [year, month, day] = text.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};

export function recordDays({ firstDay, days }) {
  return Array.from({ length: days }, (_, index) => (
    new Date(dayValue(firstDay) + index * DAY_MS).toISOString().slice(0, 10)
  ));
}

// lib/decide.js と同じ式。最後の水やりの翌日から6日でしおれ切る。
export function recordWilt(record) {
  const sinceWater = (dayValue(FIXED_TODAY) - dayValue(recordDays(record).at(-1))) / DAY_MS;
  return clamp((sinceWater - 1) / 6);
}

export function captionAt(t) {
  return CAPTIONS.find(({ start, end }) => t >= start && t < end) ?? null;
}

/* アプリの状態は「どの記録を読み込んでいるか」と「水をあげたか」だけ。
   実際の localStorage 書き込みと click は promo.js が前回との差分だけ流す。 */
export function appStateAt(t) {
  let record = 'R1';
  for (const [id, definition] of Object.entries(TREE_RECORDS)) {
    if (t >= definition.at) record = id;
  }
  return { record, watered: t >= WATER_TIMES[record] };
}

/* 木の絵は合成側で描く。撮影は reduced motion なのでアプリ側の演出は動かない。
   しずく→波紋→新しい枝葉、しおれの持ち上がり、成長の再生をここで組み立てる。 */
export function treeStateAt(t) {
  const { record, watered } = appStateAt(t);
  const definition = TREE_RECORDS[record];
  const wilt = recordWilt(definition);
  if (!watered) return { steps: definition.days, wilt, progress: 1, newborn: null, drop: null, ripple: null };

  const at = WATER_TIMES[record];
  const grown = progress(t, at + DROP_SECONDS, at + DROP_SECONDS + GROW_SECONDS, easeOutCubic);
  const grownState = {
    steps: definition.days + 1,
    wilt: wilt * (1 - grown), // 水をあげると葉が持ち上がる
    progress: grown,
    /* 新芽の色は場面が変わるまで残す。R1に水をあげた木と R2 の木は同じ12歩＝同じ形なので、
       11秒で色だけが落ち着き、「昨日の新芽が木の一部になった」ように見える。 */
    newborn: definition.days + 1
  };
  if (t >= T_REPLAY) return { ...replayState(t, grownState), drop: null, ripple: null };
  return {
    ...grownState,
    drop: t < at + DROP_SECONDS ? progress(t, at, at + DROP_SECONDS) : null,
    ripple: t >= at + .45 && t < at + .8 ? progress(t, at + .45, at + .8) : null
  };
}

// app.js の replay と同じ刻み方。1歩ぶんずつ、途中まで伸びた枝を見せながら進む。
function replayState(t, final) {
  const position = progress(t, T_REPLAY, T_REPLAY + REPLAY_SECONDS) * final.steps;
  if (position >= final.steps) return final;
  const step = Math.min(final.steps, Math.max(1, Math.ceil(position)));
  return {
    steps: step,
    wilt: 0,
    progress: step === 1 && position === 0 ? 0 : position - Math.floor(position) || 1,
    newborn: step
  };
}

export const HERO_FIRST_STEPS = 30; // 枝分かれが見える大きさから始める（1コマ目＝Xのサムネ）
export const HERO_LAST_STEPS = 60;
const HERO_GROW_END = 2.4;

/* フックの木。1コマ目から枝が伸びている途中にする——ここが X のサムネになる。
   position は歩数の途中を含む位置。promo.js はこれで寄りの強さも決める。 */
export function heroPlantAt(t) {
  const position = mix(HERO_FIRST_STEPS + .5, HERO_LAST_STEPS, progress(t, 0, HERO_GROW_END));
  if (position >= HERO_LAST_STEPS) {
    return { position: HERO_LAST_STEPS, steps: HERO_LAST_STEPS, progress: 1, newborn: null };
  }
  const step = Math.ceil(position);
  return { position, steps: step, progress: position - Math.floor(position), newborn: step };
}

export function heroTimeline(t) {
  if (t < 2.6) {
    return { centerY: 880, scale: mix(.96, 1, progress(t, 0, .6, easeOutCubic)), opacity: 1 };
  }
  if (t < 5) {
    const p = progress(t, 2.6, 3.25, easeInOutCubic); // 上へ収まってからタイトルを出す（重なり防止）
    return { centerY: mix(880, 420, p), scale: mix(1, .43, p), opacity: 1 };
  }
  if (t < 5.4) return { centerY: 420, scale: .43, opacity: 1 - progress(t, 5, 5.4, easeInOutCubic) };
  if (t < END_START) return { centerY: 420, scale: .43, opacity: 0 };
  const back = progress(t, END_START, END_START + .65, easeOutCubic); // エンドでもう一度、育ち切った木を見せる
  return { centerY: mix(590, 548, back), scale: mix(.46, .4, back), opacity: back };
}

export function phoneTimeline(t) {
  return {
    opacity: t < 5 ? 0 : (t < 26 ? 1 : 1 - progress(t, 26, 26.6, easeInOutCubic)),
    translateY: t < 5 ? 1450 : (t < 5.6 ? mix(1450, 0, progress(t, 5, 5.6, easeOutCubic)) : 0)
  };
}

export function ringOpacity(t, start, holdEnd, end) {
  if (t < start || t >= end) return 0;
  if (t < start + .3) return progress(t, start, start + .3, easeOutCubic);
  if (t > holdEnd) return 1 - progress(t, holdEnd, end, easeInOutCubic);
  return 1;
}

/* プレビューは各場面の頭と、水やり（しずくの途中と伸び切ったところ）・再生・
   1日1回の枠・暗転を狙って撮る。21コマなので接触シートは4×6になる。 */
export function previewTimes() {
  const scenes = STORYBOARD.map(({ start }) => start + .8);
  const waterBeats = Object.values(WATER_TIMES).flatMap((at) => [at + .25, at + 1]);
  return [...new Set([0, 1.2, 2.4, ...scenes, ...waterBeats, 10.2, T_REPLAY + 1.2, 25.6, 35.5])]
    .filter((time) => time < DURATION_SECONDS)
    .sort((a, b) => a - b);
}
