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
  const doc = root.ownerDocument;

  function skip(event) {
    const link = event.target.closest?.('a[data-skip]');
    if (!link) return;
    // ページ内移動で共有リンクの断片や戻る履歴を書き換えない。
    event.preventDefault();
    if (root.dataset.screen !== 'editor' || root.querySelector('dialog[open]')) return;
    let target;
    switch (link.dataset.skip) {
      case 'outline': {
        const outline = root.querySelector('#slot-outline');
        if (outline.closest('#panel-outline')) ctx.setTab('outline');
        target = outline.querySelector('.is-selected [data-act="select"]') ??
          outline.querySelector('[data-act="select"]') ?? outline.querySelector('[data-add]');
        break;
      }
      case 'preview': {
        const preview = root.querySelector('#slot-preview');
        target = preview.querySelector('.is-selected[data-block-id]') ?? preview.querySelector('.ed-preview-scroll');
        break;
      }
      case 'panel':
        target = root.querySelector('#slot-panel [role="tab"][tabindex="0"]');
        if (target) ctx.setTab(target.dataset.tab);
        break;
    }
    target?.focus();
  }

  function keydown(event) {
    if (root.dataset.screen !== 'editor' || event.defaultPrevented) return;
    const target = event.target;
    const modal = !!root.querySelector('dialog[open]');
    if (event.key === 'Tab' && !modal && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey &&
        target.matches?.('#slot-topbar [data-site]')) {
      // 編集開始時は見出しにフォーカスがあるため、最初のTabで手前の近道を飛び越してしまう。
      event.preventDefault();
      root.querySelector('.ed-skips a').focus();
      return;
    }
    const action = keyAction({
      key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey,
      shiftKey: event.shiftKey, repeat: event.repeat, keyCode: event.keyCode, isComposing: event.isComposing,
      editing: target.isContentEditable || !!target.closest?.('input, textarea, select, [role="textbox"]'),
      modal,
    });
    if (!action) return;
    if (action === 'undo' || action === 'redo') {
      event.preventDefault();
      ctx[action]();
    } else if (action === 'escape') {
      ctx.select(null, { tab: ctx.getTab() });
    } else {
      const id = target.closest?.('#slot-outline [data-row]')?.dataset.row ??
        target.closest?.('#slot-preview [data-block-id]')?.dataset.blockId;
      if (!id) return;
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
  doc.addEventListener('keydown', keydown);
  root.addEventListener('click', skip);
  return { destroy() {
    doc.removeEventListener('keydown', keydown);
    root.removeEventListener('click', skip);
  } };
}
