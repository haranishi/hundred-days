import { legalMoves } from './rules.js';
export function chooseCpuMove(solver, state, random, errorRate) {
  const legal = legalMoves(state);
  if (!legal.length) return null;
  const wins = solver.winningMoves(state.total);
  const misses = legal.filter(n => !wins.includes(n));
  let choices;
  if (!wins.length) choices = solver.trapMoves(state.total);
  else choices = misses.length && random() < errorRate ? misses : wins;
  return choices[Math.floor(random() * choices.length)];
}
