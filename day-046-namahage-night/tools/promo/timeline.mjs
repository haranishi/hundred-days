export const DURATION_SECONDS = 30;
export const DEFAULT_FPS = 30;
export const END_START = 27;
// 場面ごとに、どの面をゲーム内の何秒から見せるかを決める。
// gameFrom は「その字幕の出来事だけが写る窓」を実測で選ぶこと（時刻が合っていても中身が違うと嘘になる）。
export const STORYBOARD = Object.freeze([
  // 各面の自動操縦は 1-3 が 5.7秒・1-1 が 5.3秒（餅 2.1秒）・2-3 が 6.1秒・3-2 が 6.1秒・4-1 が 6.7秒（餅 1.5秒）で戸口に着く。
  // 場面の終わりが「戸口に着く −0.2秒」より前になるように窓を切ってある（クリア画面が字幕と食い違わないように）。
  { id: 'S0', start: 0, end: 4, name: '雪山を走るちび', level: '1-3', gameFrom: 0.3, focus: 'run' },
  { id: 'S1', start: 4, end: 8, name: '餅を拾って大きくなる', level: '1-1', gameFrom: 0.6, focus: 'grow' },
  { id: 'S2', start: 8, end: 13, name: '杉林のカラス', level: '2-3', gameFrom: 0.6, focus: 'run' },
  { id: 'S3', start: 13, end: 18, name: '吹雪の氷', level: '3-2', gameFrom: 0.5, focus: 'run' },
  { id: 'S4', start: 18, end: 22, name: '里の屋根を渡る', level: '4-1', gameFrom: 1.0, focus: 'run' },
  { id: 'S5', start: 22, end: END_START, name: '戸口に着く', level: '4-1', gameFrom: 4.2, focus: 'door' },
  { id: 'S6', start: END_START, end: DURATION_SECONDS, name: 'アプリ名とURL', focus: 'end' },
]);
export const CAPTIONS = Object.freeze([
  { start: 0, end: 4, lines: ['大晦日、山を下りる'] },
  { start: 4, end: 8, lines: ['餅で、大きくなる'] },
  { start: 8, end: 13, lines: ['つららと、カラス'] },
  { start: 13, end: 18, lines: ['吹雪の尾根をこえて'] },
  { start: 18, end: 22, lines: ['里の、家々へ'] },
  { start: 22, end: END_START, lines: ['泣ぐ子は、いねがぁ'] },
]);
export const sceneAt = t => STORYBOARD.find(s => t >= s.start && t < s.end);
export const captionAt = t => CAPTIONS.find(c => t >= c.start && t < c.end)?.lines ?? [];
