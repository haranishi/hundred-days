import { GOAL_LABEL } from './contract.js';

const SAVE_LABEL = {
  idle: '端末に自動保存', pending: '保存中…', saved: '端末に保存済み', error: '端末に保存できません',
};

export function mountTopbar(root, ctx) {
  const undo = root.querySelector('[data-undo]');
  const redo = root.querySelector('[data-redo]');
  const site = root.querySelector('[data-site]');
  const goal = root.querySelector('[data-goal-name]');
  const status = root.querySelector('[data-save-status]');
  function render({ state }) {
    const name = state.site.name || '名前のないページ';
    if (site.textContent !== name) site.textContent = name;
    goal.textContent = GOAL_LABEL[state.goal];
    undo.disabled = !ctx.canUndo();
    redo.disabled = !ctx.canRedo();
  }
  function click(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button === undo) ctx.undo();
    else if (button === redo) ctx.redo();
    else if (button.hasAttribute('data-goal')) ctx.toGoalScreen();
    else if (button.hasAttribute('data-slots')) ctx.openSlots(button);
    else if (button.hasAttribute('data-send')) ctx.openShare('link', button);
  }
  const unsubscribe = ctx.subscribe(render);
  root.addEventListener('click', click);
  return {
    setSaveStatus(value) {
      if (status.dataset.status === value) return;
      status.dataset.status = value;
      status.textContent = SAVE_LABEL[value];
    },
    destroy() { unsubscribe(); root.removeEventListener('click', click); },
  };
}
