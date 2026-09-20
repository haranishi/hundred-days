export const DURATION_SECONDS = 36;
export const DEFAULT_FPS = 30;

/* 探す中心。render-promo.mjs が context.setGeolocation に渡す（秋田駅）。
   ここを動かすと件数も並び順も変わるので、字幕の数字と一緒に直すこと。 */
export const ORIGIN = Object.freeze({ latitude: 39.7176, longitude: 140.1305 });

/* アプリの状態が変わる時刻。状態は「探したか・無料で絞ったか・ピンを選んだか」の
   3段だけで、必ずこの順に進む。巻き戻すときは iframe を読み直す（promo.js）。 */
export const T_RESET = 3;      // フックの画面を捨てて、探す前の画面に戻す
export const T_LOCATE = 7.4;   // 「現在地から探す」を押す
export const T_FREE = 17.5;    // 「無料と客向けだけ」を押す
export const T_PIN = 21.3;     // 地図のピンを押す
// 約束の消えぎわとエンドの出はじめを重ねる（ここを揃えないと1コマだけ何も無い画になる）
export const END_START = 30.6;

/* 主役にするスポット。秋田駅前（自治体・無料）は駅から163mで、地図でも
   リストでも上の方に出る。チェーンのピンは3層の説明で使うドトール。 */
export const PIN_SPOT_ID = 'municipal/akita-city/5791';
export const CHAIN_PIN_ID = 'chain/doutor/node/7643040340';

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック', start: 0, end: 2.6 },
  { id: 'S1', name: 'タイトル', start: 2.6, end: 5 },
  { id: 'S2', name: '探す', start: 5, end: 11 },
  { id: 'S3', name: '3層', start: 11, end: 17 },
  { id: 'S4', name: '無料だけ', start: 17, end: 21 },
  { id: 'S5', name: 'ピン', start: 21, end: 25 },
  { id: 'S6', name: 'Googleマップ', start: 25, end: 28 },
  { id: 'S7', name: '約束', start: 28, end: END_START },
  { id: 'S8', name: 'エンド', start: END_START, end: DURATION_SECONDS }
]);

/* 1行11字以内・2行以内。組み幅 776px に 66px の字を並べているので、
   12字を超えると2行になり、下端が10%セーフからはみ出す。 */
export const CAPTIONS = Object.freeze([
  // 1コマ目に字幕が要るので、フックだけ 0 秒より前から始める（t=0 で出終わる直前）
  { start: -.3, end: 2.6, lines: ['近くの無料Wi-Fi、', 'どこにある？'] },
  { start: 5.9, end: T_LOCATE, lines: ['押すだけ'] },
  { start: 7.6, end: 9.45, lines: ['地図にピンが立つ'] },
  { start: 9.45, end: 11, lines: ['近い順に25か所'] },
  { start: 11.2, end: 13.1, lines: ['自治体の公式'] },
  { start: 13.2, end: 15.05, lines: ['OSMの登録'] },
  { start: 15.15, end: 17.05, lines: ['チェーンの推定'] },
  { start: 17.2, end: 19.3, lines: ['有料と不明を隠す'] },
  { start: 19.3, end: 21, lines: ['件数もすぐ変わる'] },
  { start: 21.15, end: 23.2, lines: ['ピンを押すと、'] },
  { start: 23.2, end: 25, lines: ['行き先が分かる'] },
  { start: 25.15, end: 27.9, lines: ['行き先の案内は', 'Googleマップへ'] }
]);

/* 押した指の代わりの波紋。target はアプリ側の CSS セレクタ。
   「Googleマップで開く」は押さない（新しいタブが開く）ので注目リングだけで示す。 */
export const TAPS = Object.freeze([
  { at: T_LOCATE, selector: '#locate' },
  { at: T_FREE, selector: '#only-free' },
  { at: T_PIN, selector: `.wifi-marker[data-id="${PIN_SPOT_ID}"]` }
]);

/* 注目リング。1つの時刻に最大2個まで（promo.html の .focus-ring の数）。
   closest を書くと、その祖先の矩形を囲う。from/to は2要素をまたぐ矩形。 */
export const RINGS = Object.freeze([
  { start: 11.3, holdEnd: 12.7, end: 13.05, targets: [
    { selector: '#layer-municipal', closest: 'label', pad: 6 },
    { selector: `.wifi-marker[data-id="${PIN_SPOT_ID}"]`, pad: 8, round: true }
  ] },
  { start: 13.3, holdEnd: 14.65, end: 15, targets: [
    { selector: '#layer-osm', closest: 'label', pad: 6 },
    { from: '.map-legend span:nth-child(2)', to: '.map-legend span:nth-child(5)', pad: 6 }
  ] },
  { start: 15.25, holdEnd: 16.6, end: 16.95, targets: [
    { selector: '#layer-chain', closest: 'label', pad: 6 },
    { selector: `.wifi-marker[data-id="${CHAIN_PIN_ID}"]`, pad: 8, round: true }
  ] },
  { start: 18, holdEnd: 20.3, end: 20.85, targets: [{ selector: '#summary', pad: 8 }] },
  // 地図は 21.9 秒から上へ抜けていく。ピンが見えなくなる前に消し切る
  { start: 21.55, holdEnd: 21.95, end: 22.3, targets: [
    { selector: `.wifi-marker[data-id="${PIN_SPOT_ID}"]`, pad: 10, round: true }
  ] },
  { start: 23.15, holdEnd: 24.6, end: 25, targets: [
    { selector: `.spot[data-id="${PIN_SPOT_ID}"]`, pad: 8 }
  ] },
  { start: 25.5, holdEnd: 27.3, end: 27.7, targets: [
    { selector: `.spot[data-id="${PIN_SPOT_ID}"] a.maps`, pad: 8 }
  ] }
]);

/* iframe の中をどこまで送るか。anchor の上端が画面の offset px の位置に来るように送る
   （offset が負なら、その要素は画面の上へはみ出す）。位置は毎コマ実測するので、
   検索の前後でカードの高さが変わっても崩れない。 */
export const SCROLL_KEYS = Object.freeze([
  { t: 0, anchor: 'map', offset: -6 },       // 地図が丸ごと見える。ここが1コマ目
  { t: 2.6, anchor: 'map', offset: -230 },   // リストが下から上がってくる
  { t: 5, anchor: 'top', offset: 0 },        // 探す前。見出しと「現在地から探す」
  { t: 7.65, anchor: 'top', offset: 0 },
  { t: 8.75, anchor: 'map', offset: -6 },    // 地図・絞り込み・要約・1件目が同時に見える位置
  { t: 21.9, anchor: 'map', offset: -6 },
  { t: 23.3, anchor: 'spot', offset: 250 },  // 選んだ項目と「Googleマップで開く」
  { t: DURATION_SECONDS, anchor: 'spot', offset: 250 }
]);

export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const mix = (from, to, amount) => from + (to - from) * amount;
export const easeOutCubic = (x) => 1 - (1 - clamp(x)) ** 3;
// 立ち上がりに少しだけ行き過ぎる。ピンが「ぽん」と立つ感じを作るため。
export const easeOutBack = (x) => {
  const p = clamp(x) - 1;
  return 1 + 2.35 * p ** 3 + 1.35 * p ** 2;
};
export const easeInOutCubic = (x) => {
  const p = clamp(x);
  return p < .5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
};
export const progress = (t, start, end, easing = (x) => x) => (
  easing(clamp((t - start) / (end - start)))
);

export function captionAt(t) {
  return CAPTIONS.find(({ start, end }) => t >= start && t < end) ?? null;
}

export function ringAt(t) {
  return RINGS.find(({ start, end }) => t >= start && t < end) ?? null;
}

export function ringOpacity(t, { start, holdEnd, end }) {
  if (t < start || t >= end) return 0;
  if (t < start + .3) return progress(t, start, start + .3, easeOutCubic);
  if (t > holdEnd) return 1 - progress(t, holdEnd, end, easeInOutCubic);
  return 1;
}

/* アプリの状態は0〜3の段で、必ずこの順に進む。
   0=探す前／1=探した／2=無料と客向けだけ／3=ピンを選んだ。
   フック（t < T_RESET）は「探したあと」の画面をそのまま使う。 */
export function appStepAt(t) {
  if (t < T_RESET) return 1;
  if (t < T_LOCATE) return 0;
  if (t < T_FREE) return 1;
  if (t < T_PIN) return 2;
  return 3;
}

/* 結果が出た瞬間の演出。撮影は reduced motion なのでアプリ側の 0.4 秒は動かない。
   ピンとリストは実物のまま、出てくる順番だけをここで決める。 */
export function stageAt(t) {
  if (t < T_RESET) {
    // 0秒より前から立て始める。1コマ目（Xのサムネ）で半分ほど立っていて、残りがまだ動いている状態にする
    return { marker: { start: -1, stagger: .075, duration: .42 }, spot: { start: -.25, stagger: .12, duration: .42 } };
  }
  if (t < T_LOCATE) return null;
  if (t < T_FREE) {
    const start = T_LOCATE + .18;
    return { marker: { start, stagger: .05, duration: .4 }, spot: { start: start + .05, stagger: .05, duration: .4 } };
  }
  /* 絞り込みは「消えて出直す」ではなく「軽く詰め直す」。floor を高く取らないと、
     残った候補まで一瞬消えて不具合に見える（実際に見て直した）。 */
  if (t < T_PIN) {
    const start = T_FREE + .02;
    return {
      marker: { start, stagger: .008, duration: .26, floor: .72 },
      spot: { start, stagger: .012, duration: .26, floor: .72 }
    };
  }
  return null; // ピンを選んだあとは動かさない。強調そのものが変化なので足すと五月蝿い
}

export function revealProgress(index, t, { start, stagger, duration, floor = 0 }) {
  return floor + (1 - floor) * clamp((t - (start + index * stagger)) / duration);
}

// 画面いっぱいの地図から始めて、タイトルでいったん引く。エンドでは出さない。
export function phoneTimeline(t) {
  // フックだけ寄る。地図を主役にしたいので 1.15 倍まで（それ以上だと枠の上が切れる）
  if (t < 2.6) return { opacity: 1, translateY: 0, scale: mix(1.1, 1.15, progress(t, 0, 2.6)) };
  if (t < 2.95) {
    const p = progress(t, 2.6, 2.95, easeInOutCubic);
    return { opacity: 1 - p, translateY: mix(0, 260, p), scale: mix(1.15, 1, p) };
  }
  if (t < 4.8) return { opacity: 0, translateY: 260, scale: 1 };
  if (t < 5.5) {
    const p = progress(t, 4.8, 5.5, easeOutCubic);
    return { opacity: 1, translateY: mix(1500, 0, p), scale: 1 };
  }
  if (t < 25) return { opacity: 1, translateY: 0, scale: 1 };
  if (t < 27.45) return { opacity: 1, translateY: 0, scale: mix(1, 1.05, progress(t, 25, 27.45, easeInOutCubic)) };
  const p = progress(t, 27.45, 27.9, easeInOutCubic);
  return { opacity: 1 - p, translateY: mix(0, -90, p), scale: 1.05 };
}

export function scrollAt(t, anchorTop) {
  const value = ({ anchor, offset }) => anchorTop(anchor) - offset;
  const last = SCROLL_KEYS.at(-1);
  if (t <= SCROLL_KEYS[0].t) return value(SCROLL_KEYS[0]);
  if (t >= last.t) return value(last);
  const index = SCROLL_KEYS.findIndex((key) => key.t > t);
  const from = SCROLL_KEYS[index - 1];
  const to = SCROLL_KEYS[index];
  return mix(value(from), value(to), progress(t, from.t, to.t, easeInOutCubic));
}

/* プレビューは各場面の頭と、押した瞬間・押した直後・スクロールの途中を狙って撮る。
   24コマなので接触シートは4×6になる。 */
export function previewTimes() {
  return [
    0, 1, 2.2, 3.4, 5.4, 6.6, 7.5, 8.2, 9.4, 10.6, 11.6, 13.6,
    15.6, 17.7, 18.6, 20, 21.5, 22.4, 23.8, 25.9, 27.2, 28.6, 31.2, 35.4
  ].filter((time) => time < DURATION_SECONDS);
}
