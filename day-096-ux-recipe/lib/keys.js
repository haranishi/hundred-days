export function keyAction({ key, ctrlKey, metaKey, altKey, shiftKey, editing, modal, isComposing, keyCode, repeat }) {
  if (editing || modal || isComposing || keyCode === 229) return null;
  const letter = key.toLowerCase();
  if ((ctrlKey || metaKey) && !altKey) {
    if (letter === 'z') return shiftKey ? 'redo' : 'undo';
    if (letter === 'y' && ctrlKey && !shiftKey) return 'redo';
    return null;
  }
  if (ctrlKey || metaKey || shiftKey) return null;
  if (altKey) return ({ ArrowUp: 'up', ArrowDown: 'down' })[key] ?? null;
  if (key === 'Escape') return 'escape';
  return key === 'Delete' && !repeat ? 'remove' : null;
}

export function removeWithUndo(ctx, id) {
  if (!ctx.getState().blocks.some(block => block.id === id)) return;
  ctx.dispatch({ type: 'removeBlock', id });
  const after = ctx.getState();
  ctx.toast('部品を削除しました。', {
    actionLabel: '元に戻す',
    onAction() {
      // 古い通知から、その後に書いた文章まで取り消してしまうのを防ぐ。
      if (ctx.getState() === after) ctx.undo();
      else ctx.toast('上の「元に戻す」で、変更を順番に戻せます。');
    },
  });
}

export function mountKeys(root, ctx) {
  function keydown(event) {
    if (root.dataset.screen !== 'editor' || event.defaultPrevented) return;
    const target = event.target;
    const action = keyAction({
      key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey,
      shiftKey: event.shiftKey, repeat: event.repeat, keyCode: event.keyCode, isComposing: event.isComposing,
      editing: target.isContentEditable || !!target.closest?.('input, textarea, select, [role="textbox"]'),
      modal: !!root.querySelector('dialog[open]'),
    });
    if (!action) return;
    const gripRow = target.closest?.('[data-act="grip"]')?.closest('[data-row]');
    const id = gripRow?.dataset.row ?? ctx.getSelectedId();
    if (action === 'undo' || action === 'redo') {
      event.preventDefault();
      ctx[action]();
    } else if (action === 'escape') {
      ctx.select(null, { tab: ctx.getTab() });
    } else if (id) {
      event.preventDefault();
      if (action === 'remove') removeWithUndo(ctx, id);
      else {
        const blocks = ctx.getState().blocks;
        const from = blocks.findIndex(block => block.id === id);
        const to = from + (action === 'up' ? -1 : 1);
        if (from >= 0 && to >= 0 && to < blocks.length) {
          ctx.dispatch({ type: 'moveBlock', id, to });
          ctx.select(id, { tab: ctx.getTab() });
        }
      }
    }
  }
  document.addEventListener('keydown', keydown);
  return { destroy() { document.removeEventListener('keydown', keydown); } };
}
