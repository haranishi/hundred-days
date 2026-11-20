import { GOAL_LABEL, MAX_SLOTS, SITE_NAME_MAX } from './contract.js';
import { button, controlId, element, textField } from './ui-look.js';
import { dialogFrame } from './ui-share.js';

const dateFormat = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function slotListModel(slots) {
  const dated = slots.map((slot) => {
    const time = new Date(slot.savedAt ?? NaN).getTime();
    return { slot, time: Number.isFinite(time) ? time : -Infinity };
  });
  dated.sort((a, b) => b.time - a.time);
  const rows = dated.map(({ slot, time }) => {
    const validDate = Number.isFinite(time);
    return {
      id: slot.id, savedAt: slot.savedAt, name: slot.name || '無題', goal: GOAL_LABEL[slot.goal] ?? '目的不明',
      date: validDate ? dateFormat.format(time) : '日時不明',
      iso: validDate ? new Date(time).toISOString() : '', blocks: '部品' + slot.blocks + '個',
    };
  });
  return { rows, count: rows.length + '/' + MAX_SLOTS, full: rows.length >= MAX_SLOTS };
}

export function mountSlots(dialog, ctx) {
  const frame = dialogFrame(dialog, '保存・開く');
  const form = element('form', 'cs-slot-form');
  const nameField = textField({ label: '保存する名前', max: SITE_NAME_MAX });
  const name = nameField.input;
  const save = element('button', 'cs-btn cs-primary', '保存する');
  save.type = 'submit';
  const inputRow = element('div', 'cs-save-row');
  nameField.root.insertBefore(inputRow, name);
  inputRow.append(name, save);
  const hint = element('p', 'cs-help');
  form.append(element('h3', 'cs-subtitle', '名前をつけて保存'), nameField.root, hint);
  const head = element('div', 'cs-field-head');
  const count = element('span', 'cs-count');
  count.setAttribute('aria-live', 'polite');
  head.append(element('h3', 'cs-subtitle', '保存したページ'), count);
  const list = element('ul', 'cs-slots');
  const empty = element('p', 'cs-empty', 'まだ保存したページはありません。');
  frame.body.append(form, head, list, empty);
  let full = false;

  function availability() {
    const hasPage = Boolean(ctx.getState());
    name.disabled = save.disabled = !hasPage || full;
    if (!hasPage) hint.textContent = 'ページを作ると、この端末に保存できます。';
    else if (full) hint.textContent = '新しく保存するには、不要なページを一覧から消してください。';
    else hint.textContent = 'この端末に' + MAX_SLOTS + '件まで保存できます。';
  }

  function load(id) {
    const state = ctx.slots.load(id);
    if (!state) { refreshList(); return; }
    // 下書きのない入口から開くと履歴は空で、戻せる作業もない。
    const hadPage = Boolean(ctx.getState());
    ctx.dispatch({ type: 'replace', state });
    dialog.close();
    ctx.toast('保存したページを開きました。', hadPage
      ? { actionLabel: '元に戻す', onAction: () => ctx.undo() }
      : undefined);
  }

  function focusRow(index) {
    const next = list.querySelectorAll('[data-slot-open]');
    (next[Math.min(index, next.length - 1)] ?? (name.disabled ? frame.close : name)).focus();
  }

  function editName(slot, index, row, actions, trigger) {
    const form = element('form', 'cs-field');
    const field = textField({ label: '新しい保存名', max: SITE_NAME_MAX, value: slot.name });
    const submit = element('button', 'cs-btn cs-primary', '変更する');
    submit.type = 'submit';
    const cancel = button('やめる', () => {
      form.remove();
      actions.hidden = false;
      trigger.focus();
    });
    const buttons = element('div', 'cs-actions');
    buttons.append(submit, cancel);
    form.append(field.root, buttons);
    actions.hidden = true;
    row.append(form);
    field.input.focus();
    form.addEventListener('submit', event => {
      event.preventDefault();
      ctx.slots.rename(slot.id, field.input.value, { savedAt: slot.savedAt });
      if (!row.isConnected) focusRow(index);
    });
  }

  function refreshList(focusId) {
    const model = slotListModel(ctx.slots.list());
    const scroll = dialog.scrollTop;
    full = model.full;
    availability();
    count.textContent = model.count;
    empty.hidden = model.rows.length > 0;
    list.replaceChildren(...model.rows.map((slot, index) => {
      const row = element('li', 'cs-slot-row');
      const title = element('h4', 'cs-slot-name', slot.name);
      title.id = controlId('saved');
      const meta = element('p', 'cs-slot-meta');
      const time = element('time', '', slot.date);
      if (slot.iso) time.dateTime = slot.iso;
      meta.append(element('span', '', slot.goal), element('span', '', slot.blocks), time);
      const actions = element('div', 'cs-actions');
      const open = button('開く', () => load(slot.id));
      open.dataset.slotOpen = slot.id;
      const rename = button('名前を変える', () => editName(slot, index, row, actions, rename));
      const remove = button('消す', () => {
        ctx.slots.remove(slot.id, { savedAt: slot.savedAt });
        focusRow(index);
      }, 'cs-btn cs-danger');
      open.setAttribute('aria-describedby', title.id);
      rename.setAttribute('aria-describedby', title.id);
      remove.setAttribute('aria-describedby', title.id);
      actions.append(open, rename, remove);
      row.append(title, meta, actions);
      return row;
    }));
    dialog.scrollTop = scroll;
    if (dialog.open && focusId !== undefined) {
      Array.from(list.querySelectorAll('[data-slot-open]')).find(open => open.dataset.slotOpen === focusId)?.focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (save.disabled) return;
    ctx.slots.save(name.value);
    refreshList();
    if (name.disabled) list.querySelector('[data-slot-open]')?.focus();
  });
  const off = ctx.subscribe(() => { if (dialog.open) availability(); });
  return {
    refreshList,
    open() {
      if (!dialog.open) nameField.update(ctx.getState()?.site.name ?? '');
      refreshList();
      frame.show(name.disabled ? list.querySelector('[data-slot-open]') ?? frame.close : name);
    },
    destroy() { off(); frame.destroy(); },
  };
}
