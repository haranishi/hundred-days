import { BLOCK_SCHEMA, MAX_BLOCKS } from './contract.js';
import { attachDrag } from './dnd.js';
import { removeWithUndo } from './keys.js';
import { stageMark, toolIcon } from './ui-goal.js';
import { blockLimitMessage } from './ui-palette.js';

export function blockExcerpt(block) {
  const fields = BLOCK_SCHEMA[block.type].fields;
  const preferred = [block.props.title, block.props.heading, block.props.name];
  const words = fields.filter(f => f.kind === 'text' || f.kind === 'long').map(f => block.props[f.key]);
  return [...preferred, ...words].find(value => value?.trim()) || '文章はまだありません';
}

function control(action, icon, label, visible = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ed-row-control';
  button.dataset.act = action;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(toolIcon(icon));
  if (visible) button.append(label);
  return button;
}

function makeRow(block) {
  const row = document.createElement('li');
  row.className = 'ed-row';
  row.dataset.row = block.id;
  row.dataset.blockId = block.id;
  row.dataset.type = block.type;
  const pick = document.createElement('button');
  pick.type = 'button';
  pick.className = 'ed-pick';
  pick.dataset.act = 'select';
  const name = document.createElement('strong');
  name.textContent = BLOCK_SCHEMA[block.type].label;
  const summary = document.createElement('span');
  summary.className = 'ed-excerpt';
  name.id = 'ed-name-' + block.id;
  summary.id = 'ed-excerpt-' + block.id;
  pick.setAttribute('aria-labelledby', name.id);
  pick.setAttribute('aria-describedby', summary.id);
  pick.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
  const text = document.createElement('span');
  text.className = 'ed-row-text';
  text.append(name, summary);
  pick.append(stageMark(BLOCK_SCHEMA[block.type].stage), text);
  const grip = control('grip', 'grip', '並べ替えのつまみ');
  grip.setAttribute('aria-describedby', 'ed-grip-help');
  grip.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
  const group = document.createElement('div');
  group.className = 'ed-row-actions';
  group.append(control('up', 'up', '上へ移動'), control('down', 'down', '下へ移動'),
    control('copy', 'copy', '複製', true), control('remove', 'remove', '削除', true));
  row.append(pick, grip, group);
  return row;
}

export function mountOutline(root, ctx) {
  const list = root.querySelector('.ed-rows');
  const scroller = root.querySelector('[data-scroller]');
  const count = root.querySelector('[data-count]');
  const add = root.querySelector('[data-add]');
  const limitNote = root.querySelector('[data-add-limit]');
  limitNote.textContent = blockLimitMessage;
  const announcement = root.querySelector('[data-announcement]');
  const wide = matchMedia('(min-width: 1100px)');
  let previous = null;
  let rows = new Map();

  function move(id, to) {
    ctx.dispatch({ type: 'moveBlock', id, to });
    ctx.select(id, { tab: ctx.getTab() });
  }
  const drag = attachDrag(list, scroller, move);

  function render({ state, selectedId, action }) {
    const blocks = state.blocks;
    const changed = previous !== blocks;
    const y = scroller.scrollTop;
    const active = root.ownerDocument.activeElement;
    const focused = list.contains(active) ? active : null;
    const oldRow = focused?.closest('[data-row]');
    const oldIndex = oldRow ? [...list.children].indexOf(oldRow) : -1;
    if (changed) {
      drag.cancel();
      const next = new Map();
      for (const [index, block] of blocks.entries()) {
        const existing = rows.get(block.id);
        const row = existing?.dataset.type === block.type ? existing : makeRow(block);
        next.set(block.id, row);
        if (list.children[index] !== row) list.insertBefore(row, list.children[index] ?? null);
        const excerpt = row.querySelector('.ed-excerpt');
        const words = blockExcerpt(block);
        if (excerpt.textContent !== words) excerpt.textContent = words;
        row.querySelector('[data-act="up"]').disabled = index === 0;
        row.querySelector('[data-act="down"]').disabled = index === blocks.length - 1;
        row.querySelector('[data-act="copy"]').disabled = blocks.length >= MAX_BLOCKS;
      }
      for (const [id, row] of rows) if (next.get(id) !== row) row.remove();
      rows = next;
      count.textContent = blocks.length + ' / ' + MAX_BLOCKS;
      add.disabled = blocks.length >= MAX_BLOCKS;
      limitNote.hidden = !add.disabled;
      if (add.disabled) add.setAttribute('aria-describedby', limitNote.id);
      else add.removeAttribute('aria-describedby');
      root.querySelector('[data-empty]').hidden = blocks.length > 0;
      previous = blocks;
      if (action?.type === 'moveBlock') {
        const index = blocks.findIndex(block => block.id === action.id);
        if (index >= 0) announcement.textContent = BLOCK_SCHEMA[blocks[index].type].label + 'を' + (index + 1) + '番目に移動しました';
      }
    }
    for (const [id, row] of rows) {
      const selected = id === selectedId;
      row.classList.toggle('is-selected', selected);
      row.querySelector('.ed-row-actions').hidden = wide.matches && !selected;
      // 名前でも並べ替えられるため、広い画面ではTabで選択行の操作段へ直接進める。
      row.querySelector('[data-act="grip"]').tabIndex = wide.matches ? -1 : 0;
      row.querySelector('[data-act="select"]').setAttribute('aria-pressed', String(selected));
    }
    if (oldRow && !root.closest('[hidden]') &&
        (root.ownerDocument.activeElement !== focused || focused.disabled || focused.closest('[hidden]'))) {
      const sameRow = rows.get(oldRow.dataset.row);
      const same = sameRow?.querySelector('[data-act="' + focused.dataset.act + '"]');
      const nextRow = sameRow ?? list.children[Math.min(oldIndex, blocks.length - 1)];
      const target = same && !same.disabled && !same.closest('[hidden]') ? same : nextRow?.querySelector('[data-act="select"]');
      (target ?? add).focus({ preventScroll: true });
    }
    if (changed) scroller.scrollTop = y;
    if (focused && action?.type === 'moveBlock' && list.contains(root.ownerDocument.activeElement)) {
      const box = scroller.getBoundingClientRect();
      const target = root.ownerDocument.activeElement.getBoundingClientRect();
      if (target.top < box.top) scroller.scrollTop += target.top - box.top - 4;
      else if (target.bottom > box.bottom) scroller.scrollTop += target.bottom - box.bottom + 4;
    }
  }

  function click(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button === add) { ctx.openPalette(undefined, add); return; }
    const id = button.closest('[data-row]')?.dataset.row;
    if (!id) return;
    button.focus({ preventScroll: true });
    const blocks = ctx.getState().blocks;
    const from = blocks.findIndex(block => block.id === id);
    switch (button.dataset.act) {
      case 'up': move(id, from - 1); break;
      case 'down': move(id, from + 1); break;
      case 'remove': removeWithUndo(ctx, id); break;
      case 'copy': {
        ctx.dispatch({ type: 'duplicateBlock', id });
        const added = ctx.getState().blocks[from + 1];
        if (added && blocks.length < ctx.getState().blocks.length) {
          ctx.select(added.id, { tab: ctx.getTab() });
          // 広い画面では複製元の操作段が閉じるので、複製先で続きの操作ができるようにする。
          if (wide.matches) {
            const row = rows.get(added.id);
            const copy = row.querySelector('[data-act="copy"]');
            (copy.disabled ? row.querySelector('[data-act="select"]') : copy).focus();
          }
        }
        break;
      }
      case 'grip': ctx.select(id, { tab: ctx.getTab() }); break;
      case 'select': ctx.select(id); break;
    }
  }
  const resize = () => render({ state: ctx.getState(), selectedId: ctx.getSelectedId() });
  const unsubscribe = ctx.subscribe(render);
  wide.addEventListener('change', resize);
  root.addEventListener('click', click);
  return { destroy() {
    unsubscribe();
    drag.destroy();
    wide.removeEventListener('change', resize);
    root.removeEventListener('click', click);
    for (const row of rows.values()) row.remove();
    rows.clear();
  } };
}
