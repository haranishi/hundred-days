import { BLOCK_SCHEMA, MAX_BLOCKS } from './contract.js';
import { attachDrag } from './dnd.js';
import { removeWithUndo } from './keys.js';
import { stageMark, toolIcon } from './ui-goal.js';

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
  const announcement = root.querySelector('[data-announcement]');
  let previous = null;
  let rows = new Map();

  function move(id, to) {
    ctx.dispatch({ type: 'moveBlock', id, to });
    ctx.select(id, { tab: ctx.getTab() });
  }
  const drag = attachDrag(list, scroller, move);

  function render({ state, selectedId, action }) {
    if (previous !== state.blocks) {
      drag.cancel();
      const y = scroller.scrollTop;
      const focused = list.contains(document.activeElement) ? document.activeElement : null;
      const oldRow = focused?.closest('[data-row]');
      const oldIndex = oldRow ? [...list.children].indexOf(oldRow) : -1;
      const next = new Map();
      const blocks = state.blocks;
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
      root.querySelector('[data-empty]').hidden = blocks.length > 0;
      if (focused && (document.activeElement !== focused || focused.disabled)) {
        const nextRow = rows.get(oldRow?.dataset.row) ?? list.children[Math.min(oldIndex, blocks.length - 1)];
        const same = rows.has(oldRow?.dataset.row) && nextRow?.querySelector('[data-act="' + focused.dataset.act + '"]');
        const target = same && !same.disabled ? same : nextRow?.querySelector('[data-act="select"]');
        (target ?? add).focus({ preventScroll: true });
      }
      scroller.scrollTop = y;
      if (focused && action?.type === 'moveBlock' && list.contains(document.activeElement)) {
        const box = scroller.getBoundingClientRect();
        const target = document.activeElement.getBoundingClientRect();
        if (target.top < box.top) scroller.scrollTop += target.top - box.top - 4;
        else if (target.bottom > box.bottom) scroller.scrollTop += target.bottom - box.bottom + 4;
      }
      previous = blocks;
      if (action?.type === 'moveBlock') {
        const index = blocks.findIndex(block => block.id === action.id);
        if (index >= 0) announcement.textContent = BLOCK_SCHEMA[blocks[index].type].label + 'を' + (index + 1) + '番目に移動しました';
      }
    }
    for (const [id, row] of rows) {
      row.classList.toggle('is-selected', id === selectedId);
      row.querySelector('[data-act="select"]').setAttribute('aria-pressed', String(id === selectedId));
    }
  }

  function click(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button === add) { ctx.openPalette(undefined, add); return; }
    const id = button.closest('[data-row]')?.dataset.row;
    if (!id) return;
    const blocks = ctx.getState().blocks;
    const from = blocks.findIndex(block => block.id === id);
    switch (button.dataset.act) {
      case 'up': move(id, from - 1); break;
      case 'down': move(id, from + 1); break;
      case 'remove': removeWithUndo(ctx, id); break;
      case 'copy': {
        ctx.dispatch({ type: 'duplicateBlock', id });
        const added = ctx.getState().blocks[from + 1];
        if (added && blocks.length < ctx.getState().blocks.length) ctx.select(added.id, { tab: ctx.getTab() });
        break;
      }
      case 'grip': ctx.select(id, { tab: ctx.getTab() }); break;
      case 'select': ctx.select(id); break;
    }
  }
  const unsubscribe = ctx.subscribe(render);
  root.addEventListener('click', click);
  return { destroy() { unsubscribe(); drag.destroy(); root.removeEventListener('click', click); } };
}
