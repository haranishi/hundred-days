export const DURATION_SECONDS = 30;
export const DEFAULT_FPS = 30;
export const END_START = 27;
// 場面ごとに、どの面をゲーム内の何秒から見せるかを決める。
// gameFrom は「その字幕の出来事だけが写る窓」を実測で選ぶこと（時刻が合っていても中身が違うと嘘になる）。
export const STORYBOARD = Object.freeze([
  { id: 'S0', start: 0, end: 5, name: '雪山を走るちび', level: '1-1', gameFrom: 0.6, focus: 'run' },
  { id: 'S1', start: 5, end: 10, name: '餅を拾って大きくなる', level: '1-1', gameFrom: 1.9, focus: 'grow' },
  { id: 'S2', start: 10, end: 15, name: '杉林のカラス', level: '2-3', gameFrom: 2.4, focus: 'run' },
  { id: 'S3', start: 15, end: 20, name: '吹雪の氷', level: '3-2', gameFrom: 1.6, focus: 'run' },
  { id: 'S4', start: 20, end: 24, name: '里の屋根を渡る', level: '4-1', gameFrom: 2.2, focus: 'run' },
  { id: 'S5', start: 24, end: END_START, name: '戸口に着く', level: '4-1', gameFrom: 6.4, focus: 'door' },
  { id: 'S6', start: END_START, end: DURATION_SECONDS, name: 'アプリ名とURL', focus: 'end' },
]);
export const CAPTIONS = Object.freeze([
  { start: 0, end: 5, lines: ['大晦日、山を下りる'] },
  { start: 5, end: 10, lines: ['餅で、大きくなる'] },
  { start: 10, end: 15, lines: ['つららと、カラス'] },
  { start: 15, end: 20, lines: ['吹雪の尾根をこえて'] },
  { start: 20, end: 24, lines: ['里の、家々へ'] },
  { start: 24, end: END_START, lines: ['泣ぐ子は、いねがぁ'] },
]);
export const sceneAt = t => STORYBOARD.find(s => t >= s.start && t < s.end);
export const captionAt = t => CAPTIONS.find(c => t >= c.start && t < c.end)?.lines ?? [];
