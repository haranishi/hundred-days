import { STORAGE_KEY, SOURCES, OPTIONS, CHARGES, CONCERNS, DOCUMENTS, DOC_LABELS,
  emptyData, moneyText, parseMoney, selectedCharges, subtotalText, comparisonNote,
  questions, labelFor, documentGroups, hasInput, issues, memoText, decodeDraft, encodeDraft } from './lib/model.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let data = emptyData();
let step = 0;
let persisted = false;
let exported = '';
const headings = ['いま、どんな状況ですか？', 'どんな費用が、気になりますか？', '手元の資料を確認しましょう'];
const descriptions = ['空欄のままでも大丈夫。わかるところから。', '請求書を見ながら、わかる項目だけで大丈夫。', '「ない」も大事な情報。相談の前に整理しておきます。'];
const amountError = '0〜999,999,999円の整数で入力してください。不明なら空欄にできます。';

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function buildFields() {
  for (const [key, options] of Object.entries(OPTIONS)) {
    for (const [value, label] of options) {
      const option = node('option', '', label);
      option.value = value;
      $(`#${key}`).append(option);
    }
  }
  for (const [id, title] of CHARGES) {
    const row = node('div', 'charge-row');
    const label = node('label', 'check-label');
    const check = node('input');
    check.type = 'checkbox'; check.id = `charge-${id}`; check.dataset.charge = id;
    label.append(check, node('span', '', title));
    const field = node('div', 'charge-amount');
    field.id = `charge-field-${id}`; field.hidden = true;
    const amountLabel = node('label', '', `${title}の金額（任意）`);
    amountLabel.htmlFor = `amount-${id}`;
    const group = node('div', 'money-input');
    const input = node('input');
    input.type = 'text'; input.inputMode = 'numeric'; input.maxLength = 20;
    input.id = `amount-${id}`; input.dataset.amount = id;
    input.placeholder = '不明なら空欄'; input.disabled = true;
    input.setAttribute('aria-describedby', `amount-${id}-error`);
    const error = node('p', 'field-error'); error.id = `amount-${id}-error`; error.hidden = true;
    group.append(input, node('span', '', '円'));
    field.append(amountLabel, group, error);
    row.append(label, field); $('#charge-fields').append(row);
  }
  for (const [id, title] of CONCERNS) {
    const label = node('label', 'check-label concern-option');
    const input = node('input'); input.type = 'checkbox'; input.dataset.concern = id;
    label.append(input, node('span', '', title)); $('#concern-fields').append(label);
  }
  for (const [id, title, hint] of DOCUMENTS) {
    const field = node('fieldset', 'document-row');
    field.append(node('legend', '', title), node('p', 'field-help', hint));
    const choices = node('div', 'document-choices');
    for (const [value, text] of [['have', 'ある'], ['missing', 'ない'], ['unknown', '未確認']]) {
      const label = node('label');
      const input = node('input'); input.type = 'radio'; input.name = `doc-${id}`;
      input.value = value; input.dataset.document = id;
      label.append(input, node('span', '', text)); choices.append(label);
    }
    field.append(choices); $('#document-fields').append(field);
  }
  for (const source of SOURCES) $('#print-sources').append(node('p', '', `${source.title}：${source.url}`));
}

function hydrate() {
  for (const key of [...Object.keys(OPTIONS), 'invoice', 'deposit']) $(`#${key}`).value = data[key];
  for (const [id] of CHARGES) {
    const value = data.charges[id];
    $(`#charge-${id}`).checked = value.selected;
    $(`#amount-${id}`).value = value.amount;
    $(`#amount-${id}`).disabled = !value.selected;
    $(`#charge-field-${id}`).hidden = !value.selected;
  }
  for (const input of $$('[data-concern]')) input.checked = data.concerns.includes(input.dataset.concern);
  for (const input of $$('[data-document]')) input.checked = data.documents[input.dataset.document] === input.value;
}

function pairs(host, entries) {
  host.replaceChildren();
  for (const [key, value] of entries) host.append(node('dt', '', key), node('dd', '', value));
}

function renderMemo() {
  pairs($('#memo-situation'), [['退去の状況', labelFor('stage', data.stage)], ['入居期間', labelFor('tenure', data.tenure)], ['支払い', labelFor('payment', data.payment)]]);
  $('#memo-invoice').textContent = moneyText(data.invoice);
  $('#memo-deposit').textContent = moneyText(data.deposit);
  pairs($('#memo-charges'), selectedCharges(data).map((item) => [item.label, moneyText(item.raw)]));
  $('#memo-subtotal').textContent = $('#form-subtotal').textContent = subtotalText(data);
  const comparison = comparisonNote(data);
  $('#comparison').textContent = comparison; $('#comparison').hidden = !comparison;
  $('#memo-questions').replaceChildren(...questions(data).map((question) => node('li', '', question)));
  $('#memo-documents').replaceChildren(...documentGroups(data).filter((group) => group.items.length).map((group) => {
    const row = node('div', `document-summary ${group.status}`);
    row.append(node('span', 'doc-badge', group.label), node('p', '', group.items.join('・')));
    return row;
  }));
}

function storageMessage(message, error = false) {
  $('#storage-status').textContent = message;
  $('#storage-status').classList.toggle('storage-error', error);
}

function persist() {
  persisted = false;
  if (!$('#remember').checked) return;
  try {
    // 入力途中の誤字も残すが、保存形式に合わない文字は保存しない。
    const encoded = encodeDraft(data);
    decodeDraft(encoded);
    localStorage.setItem(STORAGE_KEY, encoded);
    persisted = true;
    storageMessage('この端末に下書きを保存しました。');
  } catch {
    storageMessage('下書きを保存できません。金額の入力とブラウザの保存設定を確認し、メモをコピーまたは保存してください。', true);
  }
}

function markErrors() {
  const errors = issues(data);
  for (const input of $$('#consult-form input[type="text"]')) {
    const error = errors.find((item) => item.id === input.id);
    input.setAttribute('aria-invalid', String(Boolean(error)));
    const message = $(`#${input.id}-error`);
    message.hidden = !error;
    message.textContent = error ? amountError : '';
  }
  if (!errors.length) $('#form-error').hidden = true;
  return errors;
}

function focusSection(target) {
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}

function showStep(nextStep, focus = true) {
  step = nextStep;
  for (const panel of $$('[data-panel]')) panel.hidden = Number(panel.dataset.panel) !== step;
  for (const button of $$('[data-step]')) {
    if (Number(button.dataset.step) === step) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  }
  $('#step-counter').textContent = `STEP 0${step + 1} / 03`;
  $('#step-title').textContent = headings[step];
  $('#step-description').textContent = descriptions[step];
  $('#back').hidden = step === 0;
  $('#next').textContent = ['次へ：請求の内訳 →', '次へ：手元の資料 →', '相談メモを確認する →'][step];
  $('#preview').hidden = step === 2;
  $('#form-error').hidden = true;
  if (focus) focusSection($('#step-title'));
}

function validate(all = false) {
  const error = markErrors().find((item) => all || item.step === step);
  if (!error) return true;
  showStep(error.step, false);
  $('#form-error').textContent = `${error.label}を確認してください。わからない場合は空欄のまま進めます。`;
  $('#form-error').hidden = false;
  $(`#${error.id}`).focus();
  return false;
}

function viewMemo() {
  if (validate(true)) focusSection($('#memo-heading'));
}

async function copyText(value) {
  try { await navigator.clipboard.writeText(value); return true; } catch { /* フォールバック */ }
  const active = document.activeElement;
  const textarea = node('textarea', 'copy-fallback');
  textarea.value = value; textarea.setAttribute('readonly', '');
  document.body.append(textarea); textarea.select();
  let success = false;
  try { success = document.execCommand('copy'); } catch { /* 保存ボタンも案内する */ }
  textarea.remove(); active?.focus({ preventScroll: true });
  return success;
}

buildFields();
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) {
    data = decodeDraft(saved); $('#remember').checked = true; persisted = true;
    storageMessage('この端末の下書きを読み込みました。');
  }
} catch {
  storageMessage('下書きを読み込めませんでした。保存形式やブラウザの設定を確認してください。今の入力は空の状態です。', true);
}
hydrate(); renderMemo(); markErrors();

$('#consult-form').addEventListener('submit', (event) => event.preventDefault());
$('#consult-form').addEventListener('input', (event) => {
  const input = event.target;
  if (Object.hasOwn(OPTIONS, input.id) || ['invoice', 'deposit'].includes(input.id)) data[input.id] = input.value;
  else if (input.dataset.charge) {
    const id = input.dataset.charge;
    data.charges[id].selected = input.checked;
    $(`#charge-field-${id}`).hidden = !input.checked;
    $(`#amount-${id}`).disabled = !input.checked;
  } else if (input.dataset.amount) data.charges[input.dataset.amount].amount = input.value;
  else if (input.dataset.concern) data.concerns = $$('[data-concern]:checked').map((checkbox) => checkbox.dataset.concern);
  else if (input.dataset.document) data.documents[input.dataset.document] = input.value;
  else return;
  $('#export-status').textContent = '';
  renderMemo(); markErrors(); persist();
});
for (const button of $$('[data-step]')) button.addEventListener('click', () => {
  const next = Number(button.dataset.step);
  if (next < step || validate()) showStep(next);
});
$('#next').addEventListener('click', () => { if (!validate()) return; step < 2 ? showStep(step + 1) : viewMemo(); });
$('#back').addEventListener('click', () => showStep(Math.max(0, step - 1)));
$('#preview').addEventListener('click', viewMemo);
$('#edit-again').addEventListener('click', () => focusSection($('#step-title')));
$('#remember').addEventListener('change', () => {
  if ($('#remember').checked) persist();
  else {
    try {
      localStorage.removeItem(STORAGE_KEY); persisted = false;
      storageMessage('端末の下書きを削除しました。今の画面の入力は残っています。');
    } catch {
      $('#remember').checked = true; persisted = false;
      storageMessage('端末の下書きを削除できませんでした。ブラウザのサイトデータ設定を確認してください。', true);
    }
  }
});
$('#reset').addEventListener('click', () => $('#reset-dialog').showModal());
$('#cancel-reset').addEventListener('click', () => $('#reset-dialog').close());
$('#confirm-reset').addEventListener('click', () => {
  let removed = true;
  try { localStorage.removeItem(STORAGE_KEY); } catch { removed = false; }
  data = emptyData(); persisted = false; exported = ''; $('#remember').checked = false;
  hydrate(); renderMemo(); markErrors(); showStep(0, false);
  $('#export-status').textContent = '';
  storageMessage(removed ? '入力と端末の下書きを消しました。' : '画面の入力は消しました。端末の下書きは削除できず、次に開いたとき戻る可能性があります。ブラウザのサイトデータ設定で削除してください。', !removed);
  $('#reset-dialog').close(); focusSection($('#step-title'));
});
$('#copy-memo').addEventListener('click', async () => {
  if (!validate(true)) return;
  const snapshot = JSON.stringify(data);
  const ok = await copyText(memoText(data));
  if (ok) exported = snapshot;
  $('#export-status').textContent = ok ? 'メモをコピーしました。相談用のメモ帳などに貼り付けられます。' : 'コピーできませんでした。「テキスト保存」または「印刷・PDF保存」をお使いください。';
});
$('#download-memo').addEventListener('click', () => {
  if (!validate(true)) return;
  try {
    const url = URL.createObjectURL(new Blob(['\uFEFF', memoText(data)], { type: 'text/plain;charset=utf-8' }));
    const anchor = node('a'); anchor.href = url; anchor.download = '退去費用の相談メモ.txt';
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    exported = JSON.stringify(data);
    $('#export-status').textContent = 'テキストの保存を開始しました。ダウンロード先を確認してください。';
  } catch { $('#export-status').textContent = '保存を開始できませんでした。メモのコピーか印刷をお試しください。'; }
});
$('#print-memo').addEventListener('click', () => {
  if (!validate(true)) return;
  $('#export-status').textContent = '印刷画面で、プリンターまたはPDFの保存先を選んでください。';
  window.print();
});
window.addEventListener('beforeunload', (event) => {
  if (hasInput(data) && !persisted && exported !== JSON.stringify(data)) { event.preventDefault(); event.returnValue = ''; }
});
document.documentElement.dataset.ready = 'true';
