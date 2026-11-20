import { GOAL_LABEL, MAX_SLOTS } from './contract.js';
import { button, controlId, element } from './ui-look.js';
import { dialogFrame } from './ui-share.js';

const dateFormat = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function slotListModel(slots) {
  const rows = slots.map((slot) => {
    const date = new Date(slot.savedAt ?? NaN);
    const validDate = Number.isFinite(date.getTime());
    return {
      id: slot.id, name: slot.name || '無題', goal: GOAL_LABEL[slot.goal] ?? '目的不明',
      date: validDate ? dateFormat.format(date) : '日時不明',
      iso: validDate ? date.toISOString() : '', blocks: '部品' + slot.blocks + '個',
    };
  }).sort((a, b) => b.iso.localeCompare(a.iso));
  return { rows, count: rows.length + '/' + MAX_SLOTS, full: rows.length >= MAX_SLOTS };
}

export function mountSlots(dialog, ctx) {
  const frame = dialogFrame(dialog, '保存・開く');
  const form = element('form', 'cs-slot-form');
  const name = element('input', 'cs-input');
  name.type = 'text';
  name.id = controlId('slot-name');
  const label = element('label', 'cs-label', '保存する名前');
  label.htmlFor = name.id;
  const save = element('button', 'cs-btn cs-primary', '保存する');
  save.type = 'submit';
  const inputRow = element('div', 'cs-save-row');
  inputRow.append(name, save);
  const hint = element('p', 'cs-help');
  form.append(element('h3', 'cs-subtitle', '名前をつけて保存'), label, inputRow, hint);
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
    // 履歴を引き継ぐことで、開く直前の編集へも戻れる。
    ctx.dispatch({ type: 'replace', state });
    dialog.close();
  }

  function refreshList() {
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
      const remove = button('消す', () => {
        ctx.slots.remove(slot.id);
        refreshList();
        const next = list.querySelectorAll('[data-slot-open]');
        (next[Math.min(index, next.length - 1)] ?? (name.disabled ? frame.close : name)).focus();
      }, 'cs-btn cs-danger');
      open.setAttribute('aria-describedby', title.id);
      remove.setAttribute('aria-describedby', title.id);
      actions.append(open, remove);
      row.append(title, meta, actions);
      return row;
    }));
    dialog.scrollTop = scroll;
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
    open() {
      if (!dialog.open) name.value = ctx.getState()?.site.name ?? '';
      refreshList();
      frame.show(name.disabled ? list.querySelector('[data-slot-open]') ?? frame.close : name);
    },
    destroy() { off(); frame.destroy(); },
  };
}
