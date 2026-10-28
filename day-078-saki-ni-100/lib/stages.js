const range = n => Array.from({ length: n }, (_, i) => i + 1);
const rows = [
  ['ならう', 10, range(3), false, 'human', .50],
  ['ならう', 17, range(3), false, 'human', .40],
  ['ならう', 20, range(3), false, 'cpu', .35],
  ['ひろげる', 31, range(5), false, 'human', .30],
  ['ひろげる', 36, range(5), false, 'cpu', .25],
  ['ひろげる', 50, range(5), false, 'human', .20],
  ['ふぞろい', 26, [1, 3, 4], false, 'human', .15],
  ['ふぞろい', 30, [2, 5, 7], false, 'human', .10],
  ['ふぞろい', 26, [3, 4, 5], false, 'cpu', .10],
  ['さかさま', 30, range(5), true, 'human', .05],
  ['さかさま', 21, range(3), true, 'cpu', .05],
  ['さいご', 100, range(10), false, 'human', 0]
];
export const STAGES = Object.freeze(rows.map(([chapter, target, moves, misere, first, cpuError], i) =>
  Object.freeze({ id: i + 1, chapter, target, moves: Object.freeze(moves), misere, first, cpuError })));
