import { GOAL_LABEL, MAX_SLOTS, SITE_NAME_MAX } from './contract.js';
import { deleteSlot, getSlotRecord, restoreSlot } from './persist.js';
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
      id: slot.id, name: slot.name || '無題', goal: GOAL_LABEL[slot.goal] ?? '目的不明',
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
    // 履歴を引き継ぐことで、開く直前の編集へも戻れる。
    ctx.dispatch({ type: 'replace', state });
    dialog.close();
  }

  function removeSlot(slot, index) {
    const record = getSlotRecord(slot.id);
    // 通常の削除通知と二重にせず、記録を確保できたときだけ削除して取り消しを案内する。
    const removed = record && deleteSlot(slot.id);
    refreshList();
    const next = list.querySelectorAll('[data-slot-open]');
    (next[Math.min(index, next.length - 1)] ?? (name.disabled ? frame.close : name)).focus();
    if (!removed) {
      ctx.toast('保存を削除できませんでした。', { kind: 'error' });
      return;
    }
    ctx.toast(slot.name + 'を消しました。', {
      actionLabel: '元に戻す',
      onAction() {
        // 通知を押すまでに、空いたIDを新しい保存が使うことがある。
        const slots = ctx.slots.list();
        const available = slots.length < MAX_SLOTS && !slots.some(current => current.id === slot.id);
        const restored = available && restoreSlot(record);
        refreshList();
        if (!restored) {
          ctx.toast('元に戻せませんでした（保存枠がいっぱいです）。', { kind: 'error' });
          return;
        }
        if (dialog.open) {
          const buttons = Array.from(list.querySelectorAll('[data-slot-open]'));
          buttons.find(open => open.dataset.slotOpen === slot.id)?.focus();
        }
        ctx.toast('元に戻しました。');
      },
    });
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
      const remove = button('消す', () => removeSlot(slot, index), 'cs-btn cs-danger');
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
      if (!dialog.open) nameField.update(ctx.getState()?.site.name ?? '');
      refreshList();
      frame.show(name.disabled ? list.querySelector('[data-slot-open]') ?? frame.close : name);
    },
    destroy() { off(); frame.destroy(); },
  };
}
