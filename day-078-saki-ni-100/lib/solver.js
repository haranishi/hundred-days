export function createSolver(stage) {
  const memo = new Map();
  const movesAt = total => stage.moves.filter(n => total + n <= stage.target).sort((a, b) => a - b);
  function moverWins(total) {
    if (memo.has(total)) return memo.get(total);
    if (total === stage.target) return stage.misere;
    const win = movesAt(total).some(n => !moverWins(total + n));
    memo.set(total, win);
    return win;
  }
  function winningMoves(total) {
    return total >= stage.target ? [] : movesAt(total).filter(n => !moverWins(total + n));
  }
  function trapScore(total, n) {
    const replies = total + n < stage.target ? movesAt(total + n) : [];
    if (!replies.length) return 0;
    return 1 - winningMoves(total + n).length / replies.length;
  }
  function trapMoves(total) {
    const choices = movesAt(total);
    const best = Math.max(...choices.map(n => trapScore(total, n)));
    return choices.filter(n => trapScore(total, n) === best);
  }
  const winningTotals = Array.from({ length: stage.target }, (_, i) => i + 1).filter(t => !moverWins(t));
  return { stage, moverWins, winningTotals, winningMoves, trapScore, trapMoves };
}
