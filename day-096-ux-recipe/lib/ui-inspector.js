import { BLOCK_SCHEMA, STAGE_COLORS, STAGE_LABEL } from './contract.js';
import { BLOCK_INFO } from './blocks.js';
import { formModel, listControls } from './ui-form-model.js';
import { button, element, radioChoices, textField } from './ui-look.js';

export function scalarEditor(field, id, ctx) {
  const path = field.path;
  const key = path.join('.');
  const change = (value, history) => ctx.dispatch({ type: 'setProp', id, path, value }, history);
  if (field.kind === 'check') {
    const root = element('label', 'cs-check');
    const input = element('input');
    input.type = 'checkbox';
    input.dataset.path = key;
    root.append(input, element('span', '', field.label));
    input.addEventListener('change', () => change(input.checked));
    return { root, input, update(next) { input.checked = next.value; } };
  }

  const text = textField(field, (value) => change(value, { coalesce: 'p:' + id + ':' + key }));
  text.input.dataset.path = key;
  if (field.suggestions.length) {
    const choices = element('div', 'cs-suggestions');
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', field.label + 'の言い換え候補');
    choices.append(element('span', 'cs-help', '言い換え候補'));
    for (const suggestion of field.suggestions) {
      choices.append(button(suggestion, () => {
        change(suggestion);
        text.input.focus();
      }, 'cs-chip'));
    }
    text.root.append(choices);
  }
  return { root: text.root, input: text.input, update(next) { text.update(next.value); } };
}

function listEditor(field, id, ctx, hint) {
  const root = element('section', 'cs-list');
  const header = element('div', 'cs-field-head');
  const count = element('span', 'cs-count');
  header.append(element('h3', 'cs-subtitle', field.label), count);
  const body = element('div', 'cs-rows');
  const rows = [];
  const add = button('項目を足す', () => act({ type: 'addItem' }, rows.length));
  root.append(header, body, add);
  if (hint) root.insertBefore(hint, body);

  function act(action, nextIndex) {
    ctx.dispatch({ ...action, id, path: field.path });
    // 行の操作でボタンが消えたり無効になっても、移った先から編集を続けられる。
    const row = rows[Math.min(nextIndex, rows.length - 1)];
    (row?.editors[0].input ?? add).focus();
  }

  function makeRow(fields, index) {
    const row = element('fieldset', 'cs-list-row');
    row.append(element('legend', 'cs-row-title', field.label + ' ' + (index + 1)));
    const editors = fields.map((child) => scalarEditor(child, id, ctx));
    const actions = element('div', 'cs-actions');
    const up = button('上へ', () => act({ type: 'moveItem', from: index, to: index - 1 }, index - 1));
    const down = button('下へ', () => act({ type: 'moveItem', from: index, to: index + 1 }, index + 1));
    const remove = button('項目を消す', () => act({ type: 'removeItem', index }, index), 'cs-btn cs-danger');
    actions.append(up, down, remove);
    row.append(...editors.map((editor) => editor.root), actions);
    body.append(row);
    return { row, editors, up, down, remove };
  }

  return {
    root,
    update(next) {
      const length = next.items.length;
      while (rows.length > length) rows.pop().row.remove();
      next.items.forEach((fields, index) => {
        if (!rows[index]) rows.push(makeRow(fields, index));
        const row = rows[index];
        const controls = listControls(length, next.min, next.max, index);
        row.up.disabled = !controls.canMoveUp;
        row.down.disabled = !controls.canMoveDown;
        row.remove.disabled = !controls.canRemove;
        fields.forEach((child, i) => row.editors[i].update(child));
      });
      add.disabled = !listControls(length, next.min, next.max).canAdd;
      count.textContent = length + '/' + next.max + '件';
    },
  };
}

function blockEditor(block, goal, ctx) {
  const { id, type } = block;
  const schema = BLOCK_SCHEMA[type];
  const info = BLOCK_INFO[type];
  const panel = element('div', 'cs-panel');
  const header = element('div', 'cs-block-head');
  const color = STAGE_COLORS[schema.stage];
  const stage = element('span', 'cs-stage');
  stage.style.backgroundColor = color.soft;
  stage.style.color = color.ink;
  const glyph = element('b', 'cs-stage-glyph', color.glyph);
  glyph.setAttribute('aria-hidden', 'true');
  stage.append(glyph, element('span', '', STAGE_LABEL[schema.stage]));
  header.append(stage, element('h2', 'cs-title', schema.label));

  const why = element('details', 'cs-why');
  why.open = true;
  const notes = element('dl', 'cs-explainer');
  notes.append(element('dt', '', '置く場所'), element('dd', '', info.place),
    element('dt', '', '気をつけること'), element('dd', '', info.mistake));
  why.append(element('summary', 'cs-summary', 'なぜこの部品？'), element('p', 'cs-role', info.role), notes);

  const variants = radioChoices('部品の見た目', schema.variants.map((label, value) => ({ value, label })),
    (variant) => ctx.dispatch({ type: 'setVariant', id, variant }));
  const fields = formModel(block, goal);
  const hint = type === 'form' ? element('p', 'cs-help', 'ひとこと表示では、先頭の1項目だけがページに出ます。') : null;
  const editors = fields.map((field) => field.kind === 'list' ? listEditor(field, id, ctx, hint) : scalarEditor(field, id, ctx));
  panel.append(header, why, variants.root, ...editors.map((editor) => editor.root));

  function update(next, model = formModel(next, goal)) {
    if (hint) hint.hidden = next.variant !== 1;
    variants.update(next.variant);
    model.forEach((field, i) => editors[i].update(field));
  }
  update(block, fields);
  return { panel, update };
}

export function mountInspector(root, ctx) {
  let previous = null;
  let previousGoal;
  let editor;
  const off = ctx.subscribe(({ state, selectedId }) => {
    const block = state?.blocks.find((item) => item.id === selectedId);
    const goal = state?.goal;
    if (previous === block && previousGoal === goal && root.firstChild) return;
    let scroll = 0;
    if (!block) {
      root.replaceChildren(element('p', 'cs-empty', '構成の一覧かプレビューで、編集したい部品を選んでください。'));
      editor = null;
    } else if (editor && previous?.id === block.id && previous.type === block.type && previousGoal === goal) {
      scroll = root.scrollTop;
      editor.update(block);
    } else {
      editor = blockEditor(block, goal, ctx);
      root.replaceChildren(editor.panel);
    }
    previous = block;
    previousGoal = goal;
    root.scrollTop = scroll;
  });

  return {
    focusPath(path) {
      const key = Array.isArray(path) ? path.join('.') : path;
      const input = Array.from(root.querySelectorAll('[data-path]')).find((el) => el.dataset.path === key);
      if (input) {
        input.focus({ preventScroll: true });
        input.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    },
    destroy() { off(); root.replaceChildren(); },
  };
}
