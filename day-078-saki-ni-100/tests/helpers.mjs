// Independent bottom-up oracle: true means the next player can force a win.
export function oracle(stage) {
  const table = Array(stage.target + 1).fill(false);
  table[stage.target] = stage.misere;
  for (let total = stage.target - 1; total >= 0; total--) {
    for (const n of stage.moves) if (total + n <= stage.target && !table[total + n]) table[total] = true;
  }
  return table;
}
export function randomSequence(values) {
  let i = 0;
  return () => values[i++ % values.length];
}
