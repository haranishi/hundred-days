// シミュレーション用の「答える人」。確率 p（その料理の人が「はい」と答える見込み）から答えを決める。
import { newGame, nextStep, answer, reject, probabilityOf } from '../lib/oracle.js';

export function truthful(p) {
  if (p >= 0.8) return 'yes';
  if (p >= 0.6) return 'probably';
  if (p > 0.4) return 'unknown';
  if (p > 0.2) return 'probablyNot';
  return 'no';
}

const FLIP = { yes: 'no', no: 'yes', probably: 'probablyNot', probablyNot: 'probably', unknown: 'unknown' };
export const flip = (answerId) => FLIP[answerId];

// 1回の占いを最後まで進める。answerFor(qid) が答えを返す。isTarget(id) が推測の当否を返す
export function playOut(model, { seed, answerFor, isTarget, onGuess = () => {}, maxSteps = 80 }) {
  let game = newGame(seed);
  let firstGuessAt = null;
  for (let steps = 0; steps < maxSteps; steps++) {
    const step = nextStep(model, game);
    if (step.type === 'giveup') return { ok: false, questions: game.answers.length, game, firstGuessAt };
    if (step.type === 'guess') {
      firstGuessAt ??= game.answers.length;
      onGuess(step.id, game, step);
      if (isTarget(step.id)) return { ok: true, id: step.id, questions: game.answers.length, game, firstGuessAt };
      game = reject(game, step.id);
      continue;
    }
    game = answer(game, step.q, answerFor(step.q, game));
  }
  throw new Error('占いが終わらない');
}

export function playTruthfully(model, id, seed, transform = (answerId) => answerId) {
  return playOut(model, {
    seed,
    answerFor: (qid) => transform(truthful(probabilityOf(model, id, qid)), qid),
    isTarget: (guess) => guess === id,
  });
}
