import { HISTORY_LIMIT } from './contract.js';

export function createHistory(limit = HISTORY_LIMIT) {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError('履歴の上限は0以上の整数です');
  const past = [];
  const future = [];

  function push(stack, tree) {
    if (limit === 0) return;
    stack.push(tree.clone());
    if (stack.length > limit) stack.shift();
  }

  return {
    record(tree) {
      push(past, tree);
      future.length = 0;
    },
    undo(currentTree) {
      if (!past.length) return null;
      push(future, currentTree);
      return past.pop();
    },
    redo(currentTree) {
      if (!future.length) return null;
      push(past, currentTree);
      return future.pop();
    },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    clear() {
      past.length = 0;
      future.length = 0;
    },
  };
}
