import { LIMITS, emptyState, validateState, calculate, parseAmount, settlementText, encodeState, decodeState, exampleState, yen } from './lib/model.js';
import { STORAGE_KEY, loadState, saveState } from './lib/storage.js';

const $ = (id) => document.getElementById(id);
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const uid = () => crypto.randomUUID();
let storage;
try { storage = window.localStorage; } catch { /* loadState reports inaccessible storage. */ }
const loaded = loadState(storage);
let state = loaded.state, dirty = false, editingId = null, renamingId = null, conflict = false;
let persisted = !loaded.error, confirming = false;
const emptyResult = $('result-body').firstElementChild.cloneNode(true);

function tell(text) { $('notice').textContent = text; $('notice').hidden = !text; }
function errorAt(id, message = '') { $(id).textContent = message; $(id).hidden = !message; }
function saveStatus() {
  $('save-status').textContent = conflict
    ? '別のタブで変更されました。上書きを防ぐため保存を停止中。今の内容をコピーしてから再読み込みしてください。'
    : persisted ? '入力はこの端末に自動保存されます' : 'この端末に保存できません。ページを閉じる前に精算文や精算URLをコピーしてください。';
}
function commit(next) {
  state = validateState(next);
  if (!conflict) persisted = saveState(storage, state);
  $('manual-copy').hidden = true;
  render();
}
function confirmAction(title, body, yes = '続ける') {
  if (confirming) return Promise.resolve(false);
  confirming = true;
  $('confirm-title').textContent = title; $('confirm-body').textContent = body; $('confirm-yes').textContent = yes;
  const dialog = $('confirm-dialog'); dialog.returnValue = 'cancel';
  return new Promise((resolve) => {
    const finish = (accepted) => {
      dialog.removeEventListener('close', onClose); dialog.removeEventListener('submit', onSubmit);
      confirming = false; resolve(accepted);
    };
    // A queued close event from the previous use can arrive after reopening.
    const onClose = () => { if (!dialog.open) finish(dialog.returnValue === 'yes'); };
    const onSubmit = (event) => {
      event.preventDefault();
      const accepted = event.submitter?.value === 'yes';
      dialog.close(accepted ? 'yes' : 'cancel'); finish(accepted);
    };
    dialog.addEventListener('close', onClose); dialog.addEventListener('submit', onSubmit);
    dialog.showModal();
  });
}
function chosenParticipants() { return Array.from(document.querySelectorAll('#participants input:checked'), (input) => input.value); }
function markDirty() {
  dirty = true; $('cancel-expense').hidden = false; $('draft-note').hidden = false;
  updateSharing();
}
function clearExpense() {
  dirty = false; editingId = null; $('expense-form').reset();
  $('save-expense').replaceChildren(document.createTextNode('支払いを追加 '), node('span', '', '＋'));
  $('cancel-expense').hidden = true; $('draft-note').hidden = true;
  errorAt('expense-error'); renderOptions(); updateSharing();
}
function updateSharing() {
  const allowed = state.expenses.length > 0 && !dirty;
  $('copy-result').disabled = !allowed; $('copy-state').disabled = !allowed;
  $('result-pending').hidden = !dirty;
  $('result').classList.toggle('pending', dirty);
  $('save-expense').disabled = state.expenses.length >= LIMITS.expenses && !editingId;
}
function renderMembers() {
  const list = $('members'); list.replaceChildren();
  for (const member of state.members) {
    const item = node('li', 'member'), avatar = node('span', 'avatar', Array.from(member.name)[0]); avatar.setAttribute('aria-hidden', 'true');
    const rename = node('button', 'member-name', member.name); rename.type = 'button'; rename.setAttribute('aria-label', `${member.name}の名前を変更`);
    rename.addEventListener('click', () => {
      renamingId = member.id; $('rename-name').value = member.name; errorAt('rename-error'); $('rename-dialog').showModal(); $('rename-name').select();
    });
    const remove = node('button', 'remove-member', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `${member.name}を削除`);
    remove.addEventListener('click', () => {
      if (state.expenses.some((expense) => expense.payerId === member.id || expense.participantIds.includes(member.id))) {
        tell('この人に関係する支払いがあります。先に支払いを編集・削除してください。'); return;
      }
      commit({ ...state, members: state.members.filter((entry) => entry.id !== member.id) });
      tell(`${member.name}をメンバーから外しました。`); $('member-name').focus();
    });
    item.append(avatar, rename, remove); list.append(item);
  }
  $('member-count').textContent = `${state.members.length} / 12人`;
  $('members-hint').textContent = state.members.length < 2 ? 'まずは2人以上の名前を追加してください。' : '名前を押すと変更できます。割り勘の対象者は支払いごとに選べます。';
  $('member-form').querySelector('button').disabled = state.members.length >= LIMITS.members;
}
function renderOptions(selection = null) {
  const payer = $('payer').value;
  const chosen = selection ?? (dirty ? chosenParticipants() : state.members.map((member) => member.id));
  $('payer').replaceChildren(); $('participants').replaceChildren();
  for (const member of state.members) {
    const option = node('option', '', member.name); option.value = member.id; $('payer').append(option);
    const label = node('label', 'participant'), checkbox = node('input');
    checkbox.type = 'checkbox'; checkbox.name = 'participant'; checkbox.value = member.id; checkbox.checked = chosen.includes(member.id);
    label.append(checkbox, node('span', '', member.name)); $('participants').append(label);
  }
  if (state.members.some((member) => member.id === payer)) $('payer').value = payer;
  $('expense-fields').disabled = state.members.length < 2;
  $('payment-lock').hidden = state.members.length >= 2;
}
function renderExpenses() {
  const names = new Map(state.members.map((member) => [member.id, member.name]));
  $('expenses').replaceChildren(); $('expense-count').textContent = `${state.expenses.length}件`;
  $('history-empty').hidden = state.expenses.length > 0;
  for (const expense of state.expenses) {
    const item = node('li', 'expense'), info = node('div');
    item.dataset.id = expense.id;
    info.append(node('h3', 'expense-title', expense.label), node('p', 'expense-detail', `${names.get(expense.payerId)}が立て替え · ${expense.participantIds.map((id) => names.get(id)).join('・')}で割り勘`));
    const actions = node('div', 'expense-actions');
    const edit = node('button', '', '編集'); edit.type = 'button'; edit.setAttribute('aria-label', `${expense.label}を編集`);
    edit.addEventListener('click', async () => {
      if (dirty && !await confirmAction('入力中の支払いを置き換えますか？', 'まだ追加・更新していない内容は失われます。', '編集に進む')) return;
      clearExpense(); editingId = expense.id; dirty = true;
      $('payer').value = expense.payerId; $('amount').value = String(expense.amount); $('expense-label').value = expense.label;
      renderOptions(expense.participantIds); $('payer').value = expense.payerId;
      $('save-expense').textContent = '支払いを更新'; markDirty();
      $('expense-label').focus();
    });
    const remove = node('button', '', '削除'); remove.type = 'button'; remove.setAttribute('aria-label', `${expense.label}を削除`);
    remove.addEventListener('click', async () => {
      if (!await confirmAction('この支払いを削除しますか？', `${expense.label}（${yen(expense.amount)}）を削除して精算し直します。${dirty ? '入力中の支払いも取り消されます。' : ''}`, '削除する')) return;
      clearExpense(); commit({ ...state, expenses: state.expenses.filter((entry) => entry.id !== expense.id) }); tell('支払いを削除し、精算し直しました。');
    });
    actions.append(edit, remove); item.append(info, node('p', 'expense-amount', `¥${expense.amount.toLocaleString('ja-JP')}`), actions); $('expenses').append(item);
  }
}
function renderResult() {
  const previousOpen = $('breakdown-host').querySelector('details')?.open ?? false;
  const result = calculate(state), names = new Map(state.members.map((member) => [member.id, member.name]));
  $('total').textContent = `¥${result.total.toLocaleString('ja-JP')}`;
  $('total').parentElement.classList.toggle('wide-total', $('total').textContent.length > 11);
  const host = $('result-body'); host.replaceChildren(); $('breakdown-host').replaceChildren();
  if (!state.expenses.length) { host.append(emptyResult.cloneNode(true)); updateSharing(); return; }
  if (result.transfers.length) {
    const heading = node('div', 'settlement-heading'), title = node('h3', '', '送金は、全部で '), count = node('strong', '', String(result.transfers.length));
    count.append(node('span', '', '回')); title.append(count); heading.append(title, node('span', 'exact-label', '✓ 最小回数'));
    const list = node('ol', 'transfers');
    for (const transfer of result.transfers) {
      const item = node('li', 'transfer'), route = node('div', 'transfer-route');
      route.append(node('span', '', names.get(transfer.from)), node('span', 'arrow', '→'), node('span', '', names.get(transfer.to)));
      item.append(route, node('strong', 'transfer-value', `¥${transfer.amount.toLocaleString('ja-JP')}`)); list.append(item);
    }
    host.append(heading, list);
  } else {
    const settled = node('div', 'settled');
    settled.append(node('span', 'settled-mark', '✓'), node('h3', '', '送金は0回。もう、まるく。'), node('p', '', '全員の過不足がゼロです。\nこのまま精算を終えられます。')); host.append(settled);
  }
  const details = node('details', 'breakdown'); details.open = previousOpen;
  details.append(node('summary', '', 'ひとりずつの支払額・負担額'));
  const table = node('table', 'balance-table'), head = node('thead'), headRow = node('tr');
  for (const title of ['名前', '支払額', '負担額', '差額']) { const cell = node('th', '', title); cell.scope = 'col'; headRow.append(cell); }
  head.append(headRow); const body = node('tbody');
  for (const entry of result.balances) {
    const row = node('tr'), name = node('th', '', entry.name); name.scope = 'row'; row.append(name);
    for (const amount of [entry.paid, entry.owed]) row.append(node('td', '', yen(amount)));
    row.append(node('td', entry.balance > 0 ? 'balance-in' : entry.balance < 0 ? 'balance-out' : '', `${entry.balance > 0 ? '+' : entry.balance < 0 ? '−' : ''}${yen(Math.abs(entry.balance))}`)); body.append(row);
  }
  table.append(head, body); details.append(table, node('p', 'balance-explain', '差額が＋なら受け取り、−なら送金する金額です。負担額は支払いごとの対象者で計算しています。'));
  $('breakdown-host').append(details); updateSharing();
}
function render() { renderMembers(); renderOptions(); renderExpenses(); renderResult(); saveStatus(); }

$('member-form').addEventListener('submit', (event) => {
  event.preventDefault(); errorAt('member-error');
  try {
    commit({ ...state, members: [...state.members, { id: uid(), name: $('member-name').value }] });
    $('member-name').value = ''; $('member-name').focus(); tell('');
  } catch (error) { errorAt('member-error', error.message); $('member-name').focus(); }
});
$('rename-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    commit({ ...state, members: state.members.map((member) => member.id === renamingId ? { ...member, name: $('rename-name').value } : member) });
    $('rename-dialog').close(); tell('名前を変更しました。');
  } catch (error) { errorAt('rename-error', error.message); $('rename-name').focus(); }
});
$('rename-cancel').addEventListener('click', () => $('rename-dialog').close());
$('expense-form').addEventListener('input', markDirty);
$('expense-form').addEventListener('change', markDirty);
$('select-all').addEventListener('click', () => { document.querySelectorAll('#participants input').forEach((input) => { input.checked = true; }); markDirty(); });
$('expense-form').addEventListener('submit', (event) => {
  event.preventDefault(); errorAt('expense-error');
  try {
    const expense = { id: editingId || uid(), payerId: $('payer').value, label: $('expense-label').value, amount: parseAmount($('amount').value), participantIds: chosenParticipants() };
    const next = validateState({ ...state, expenses: editingId ? state.expenses.map((entry) => entry.id === editingId ? expense : entry) : [...state.expenses, expense] });
    const wasEditing = !!editingId; clearExpense(); commit(next);
    tell(wasEditing ? '支払いを更新し、精算し直しました。' : '支払いを追加し、精算票に反映しました。'); $('amount').focus();
  } catch (error) { errorAt('expense-error', error.message); }
});
$('cancel-expense').addEventListener('click', async () => {
  if (!await confirmAction('入力中の支払いを取り消しますか？', '追加・更新していない内容が消えます。登録済みの支払いは残ります。', '取り消す')) return;
  clearExpense(); renderResult(); tell('入力中の支払いを取り消しました。'); $('amount').focus();
});
$('example').addEventListener('click', async () => {
  if ((state.members.length || dirty) && !await confirmAction('見本に置き換えますか？', '今の入力を4人旅行の見本に置き換えます。残したい場合は、先に精算URLをコピーしてください。', '見本に置き換える')) return;
  clearExpense(); commit(exampleState()); tell('4人旅行の見本です。支払いを編集して、結果の変化も試せます。'); $('result').focus();
});
$('reset').addEventListener('click', async () => {
  if (!await confirmAction('最初から始めますか？', 'この端末に保存したメンバーと支払いを消し、新しい精算を始めます。', '消して始める')) return;
  clearExpense(); commit(emptyState()); $('member-name').value = ''; tell('新しい精算を始めます。'); $('member-name').focus();
});

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const area = node('textarea'); area.value = text; area.className = 'sr-only'; area.setAttribute('readonly', ''); document.body.append(area); area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* Show the manual copy UI below. */ }
    area.remove(); return ok;
  }
}
async function deliverCopy(text, message) {
  $('manual-copy').hidden = true;
  if (await copy(text)) tell(message);
  else { $('copy-text').value = text; $('manual-copy').hidden = false; $('copy-text').focus(); $('copy-text').select(); tell('コピーできませんでした。精算票の下から手動でコピーできます。'); }
}
$('copy-result').addEventListener('click', () => {
  if (!dirty && state.expenses.length) deliverCopy(settlementText(state), '精算文をコピーしました。グループLINEに貼り付けてください。');
});
$('copy-state').addEventListener('click', () => {
  if (dirty || !state.expenses.length) return;
  try {
    const base = new URL(document.querySelector('link[rel="canonical"]')?.href || location.href); base.hash = ''; base.search = '';
    deliverCopy(base.href + encodeState(state), 'この精算のURLをコピーしました。名前・金額を含むので、参加者だけに送ってください。');
  } catch (error) { tell(error.message); }
});
window.addEventListener('storage', (event) => {
  if ((event.key === STORAGE_KEY || event.key === null) && event.storageArea === storage) {
    conflict = true; saveStatus(); tell('別のタブで保存内容が変わりました。今の画面は保持しています。必要な内容をコピーしてから再読み込みしてください。');
  }
});
window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });

async function importHash() {
  const hash = location.hash;
  if (!hash || hash === '#result' || !hash.startsWith('#v1')) return;
  // The fragment is never sent in HTTP requests; remove it before any later navigation.
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const incoming = decodeState(hash);
    if (!await confirmAction('共有された精算を開きますか？', `${incoming.members.length}人・支払い${incoming.expenses.length}件のデータです。開くと、この端末に保存した内容を置き換えます。`, 'この精算を開く')) return;
    clearExpense(); commit(incoming); tell('共有された精算を読み込みました。これは共有時点のコピーです。変更は送り主の画面には反映されません。');
  } catch (error) { tell(error.message); }
}
render();
if (loaded.error) tell(loaded.error);
importHash();
window.addEventListener('hashchange', importHash);
