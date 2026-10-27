export const other = by => by === 'human' ? 'cpu' : 'human';
export function createState(stage) {
  return { stage, total: 0, turn: stage.first, history: [], winner: null };
}
export function legalMoves(state) {
  return state.winner ? [] : state.stage.moves.filter(n => state.total + n <= state.stage.target).sort((a, b) => a - b);
}
export function applyMove(state, n) {
  if (!Number.isInteger(n) || !legalMoves(state).includes(n)) throw new RangeError('選べない数です');
  const total = state.total + n;
  const turn = other(state.turn);
  let winner = null;
  if (total === state.stage.target) winner = state.stage.misere ? turn : state.turn;
  else if (!state.stage.moves.some(k => total + k <= state.stage.target)) winner = state.turn;
  return { ...state, total, turn, winner, history: [...state.history, { by: state.turn, n, total }] };
}
