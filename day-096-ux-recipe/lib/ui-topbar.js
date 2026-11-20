import { GOAL_LABEL } from './contract.js';

const SAVE_LABEL = {
  idle: '端末に自動保存', pending: '保存中…', saved: '端末に保存済み', error: '端末に保存できません',
  paused: '自動保存を一時停止中',
};

export function mountTopbar(root, ctx) {
  const undo = root.querySelector('[data-undo]');
  const redo = root.querySelector('[data-redo]');
  const site = root.querySelector('[data-site]');
  const goal = root.querySelector('[data-goal-name]');
  const status = root.querySelector('[data-save-status]');
  const live = root.ownerDocument.createElement('span');
  live.className = 'ed-sr';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  const originalRole = status.getAttribute('role');
  const originalLive = status.getAttribute('aria-live');
  status.removeAttribute('role');
  status.setAttribute('aria-live', 'off');
  status.after(live);
  let lastInput;
  let timer;
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
      if (status.dataset.status === value && value !== 'pending') return;
      clearTimeout(timer);
      status.dataset.status = value;
      status.textContent = SAVE_LABEL[value];
      if (value === 'pending') {
        lastInput = Date.now();
        live.textContent = '';
      } else if (value === 'saved' && lastInput !== undefined) {
        // 自動保存の間隔よりゆっくり打つ人にも、入力が落ち着いたときだけ伝える。
        timer = setTimeout(() => { live.textContent = '保存しました'; }, Math.max(0, lastInput + 5000 - Date.now()));
        lastInput = undefined;
      } else {
        lastInput = undefined;
        live.textContent = value === 'error' ? SAVE_LABEL.error : '';
      }
    },
    destroy() {
      clearTimeout(timer);
      unsubscribe();
      root.removeEventListener('click', click);
      live.remove();
      if (originalRole === null) status.removeAttribute('role');
      else status.setAttribute('role', originalRole);
      if (originalLive === null) status.removeAttribute('aria-live');
      else status.setAttribute('aria-live', originalLive);
      delete status.dataset.status;
      status.textContent = '';
    },
  };
}

export function mountStorageNotice(topbar, keepLocal, loadOther) {
  return mountNotice(topbar, '別のタブで、この作業が更新されました。', [
    ['このタブの内容で保存を続ける', keepLocal],
    ['別のタブの内容を読み込む', loadOther],
  ]);
}

export function mountNotice(topbar, message, choices) {
  const doc = topbar.ownerDocument;
  const group = doc.createElement('div');
  const banner = doc.createElement('div');
  banner.className = 'app-mast';
  banner.setAttribute('role', 'status');
  const inner = doc.createElement('div');
  inner.className = 'app-mast-inner';
  const note = doc.createElement('span');
  note.textContent = message;
  const actions = doc.createElement('div');
  actions.className = 'app-view-actions';
  const events = new AbortController();
  for (const [label, choose] of choices) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'app-btn';
    button.textContent = label;
    button.addEventListener('click', choose, { signal: events.signal });
    actions.append(button);
  }
  // 同じグリッド行に収め、案内が折り返してもプレビューに重ならないようにする。
  topbar.before(group);
  group.append(topbar, banner);
  banner.append(inner);
  inner.append(note, actions);
  return {
    setMessage(text) { note.textContent = text; },
    destroy() {
      events.abort();
      group.before(topbar);
      group.remove();
    },
  };
}
