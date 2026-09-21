export const DURATION_SECONDS = 30;
export const DEFAULT_FPS = 30;
export const RESULT_START = 24;
export const END_START = 28;
export const STORYBOARD = Object.freeze([
  { id: 'S0', start: 0, end: 4, name: '動く艦隊と自機', gameFrom: .3, focus: 'fleet' },
  { id: 'S1', start: 4, end: 9, name: '同じ場所から連射、赤い帯が濃くなる', focus: 'heat', fixedFire: true },
  { id: 'S2', start: 9, end: 14, name: '艦隊がひるむ', gameFrom: 8.9, focus: 'fleet' },
  { id: 'S3', start: 14, end: 19, name: '▽が居場所を狙う', gameFrom: 14.3, focus: 'aim' },
  { id: 'S4', start: 19, end: 24, name: '低い熱から得点2倍', gameFrom: 3, focus: 'bonus' },
  { id: 'S5', start: RESULT_START, end: END_START, name: '実ゲームの結果と講評', focus: 'result' },
  { id: 'S6', start: END_START, end: DURATION_SECONDS, name: 'アプリ名とURL', focus: 'end' },
]);
export const CAPTIONS = Object.freeze([
  { start: 0, end: 4, lines: ['その撃ち方、読まれてる'] },
  { start: 4, end: 9, lines: ['同じ場所から撃つと…'] },
  { start: 9, end: 14, lines: ['艦隊が、よける'] },
  { start: 14, end: 19, lines: ['居場所まで、狙われる'] },
  { start: 19, end: 24, lines: ['裏をかけば、得点2倍'] },
  { start: 24, end: 28, lines: ['あなたの癖を、1行で'] },
]);
export const sceneAt = t => STORYBOARD.find(s => t >= s.start && t < s.end);
export const captionAt = t => CAPTIONS.find(c => t >= c.start && t < c.end)?.lines ?? [];
