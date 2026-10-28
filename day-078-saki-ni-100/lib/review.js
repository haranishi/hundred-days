import { createSolver } from './solver.js';
import { createState, applyMove } from './rules.js';

// あなたの手のうち、「勝てる手が他にあったのに、勝てない手を打った」もの（古い順）。
// immediate は、その場で勝てる手を見逃したとき true。
export function findMistakes(stage, history) {
  const solver = createSolver(stage);
  let state = createState(stage);
  const mistakes = [];
  for (const [index, step] of history.entries()) {
    const winningMoves = solver.winningMoves(state.total);
    if (step.by === 'human' && winningMoves.length && !winningMoves.includes(step.n)) {
      const immediate = winningMoves.some(n => applyMove(state, n).winner === 'human');
      mistakes.push({ index, total: state.total, n: step.n, winningMoves, immediate });
    }
    state = applyMove(state, step.n);
  }
  return mistakes;
}

// いちばん最初に勝ち筋を外した手。無ければ null。
export function findTurningPoint(stage, history) {
  const [first] = findMistakes(stage, history);
  return first ? { index: first.index, total: first.total, n: first.n, winningMoves: first.winningMoves } : null;
}

// 勝ちの合計が「目標から数えて p ずつ」同じ形でくり返すとき、その p（2以上）。くり返さなければ null。
function findPeriod(winningTotals, target) {
  const offsets = new Set(winningTotals.map(t => target - t));
  for (let p = 2; p * 2 <= target; p++) {
    let periodic = true;
    for (let o = 0; o + p <= target - 1 && periodic; o++) periodic = offsets.has(o) === offsets.has(o + p);
    if (periodic) return p;
  }
  return null;
}

export function explain(stage) {
  const { winningTotals } = createSolver(stage);
  const gap = winningTotals.length > 1 ? winningTotals[1] - winningTotals[0] : null;
  const interval = gap && winningTotals.every((t, i) => !i || t - winningTotals[i - 1] === gap) ? gap : null;
  const period = interval ? null : findPeriod(winningTotals, stage.target);
  const text = interval
    ? `あいてが足した数と合わせて${interval}になるように足し、この合計に乗せ続けよう。`
    : period
      ? `${period}ずつ、同じ形がくり返します。この合計に乗せ続けよう。`
      : '目標から逆に数えていくと、勝ちの合計が見つかります。この合計に乗せ続けよう。';
  return { winningTotals, interval, period, text: `勝ちの合計は ${winningTotals.join('・')}。${text}${stage.misere ? '目標ちょうどは、あいてに渡そう。' : ''}` };
}

const missText = m => `合計${m.total}から${m.n}を足した手。${m.winningMoves.join('・')}を足せば、${m.immediate ? 'その場で勝てました' : '勝ちをつなげました'}。`;

// 負けたあとの説明。最後に見逃したその場の勝ちがあれば、それを先に言い、最初の分かれ目はあとに回す。
export function describeLoss(stage, history) {
  const mistakes = findMistakes(stage, history);
  if (!mistakes.length) return { mistakes, lines: ['今回は、分かれ目がありません。もう一度、勝ちの合計を目指そう。'] };
  const first = mistakes[0];
  const missed = [...mistakes].reverse().find(m => m.immediate);
  const lines = missed && missed !== first
    ? [`いちばん惜しかったのは、${missText(missed)}`, `最初の分かれ目は、${missText(first)}`]
    : [`分かれ目は、${missText(first)}`];
  return { mistakes, lines };
}

// 勝ったあとの説明。勝ち筋を外した手があれば、あいてのミスに助けられたことも伝える。
export function describeWin(stage, history) {
  const mistakes = findMistakes(stage, history);
  const text = explain(stage).text;
  return mistakes.length
    ? { clean: false, mistakes, lines: [`途中で、勝ち筋を外した手が${mistakes.length}回ありました。あいてのミスにも助けられた勝ちです。`, text] }
    : { clean: true, mistakes, lines: [text] };
}
