import { CONTEXTS, BEHAVIORS, VALUES, STEPS, LIMITS, STORAGE_KEY, emptyData, normalizeData, validateStep, firstIncomplete, buildReport, reportText, hasContent, EXAMPLE } from './lib/model.js';
import { readSaved, writeSaved, removeSaved } from './lib/storage.js';

export function initReflection() {
const $ = selector => document.querySelector(selector);
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const usageExample = buildReport(EXAMPLE);
if (usageExample) {
  $('#usage-story-title').textContent = usageExample.data.title;
  $('#usage-action').textContent = usageExample.data.action;
  $('#usage-behaviors').textContent = usageExample.strengths.map(item => item.label).join(' / ');
  $('#usage-strengths').replaceChildren(...usageExample.strengths.map(item => element('li', '', item.strength)));
  $('#usage-values').textContent = usageExample.values.map(item => item.label).join(' / ');
  $('#usage-question').textContent = usageExample.values[0].question;
}
let storage;
try { storage = window.localStorage; } catch { storage = null; }
const restored = readSaved(storage);
let state = restored.ok && restored.state ? restored.state : { data: emptyData(), step: 0, screen: 'welcome', demo: false };
let saveEnabled = Boolean(restored.ok && restored.state);
let savingPaused = false;
let savedText = restored.text ?? null;
let confirmAction = null;
let lastErrors = {};

function announce(message) { $('#storage-status').textContent = message; }
function pauseSaving() {
  saveEnabled = false; savingPaused = true; $('#save-toggle').checked = false;
  announce('別のタブで保存内容が変わりました。今の入力は画面に残っています。保存を始める・再開するときに確認します。');
}
function persist() {
  if (!saveEnabled) return;
  try { if (storage.getItem(STORAGE_KEY) !== savedText) { pauseSaving(); return; } } catch { /* writeSaved reports unavailable storage below. */ }
  const written = writeSaved(storage, state);
  if (!written.ok) {
    saveEnabled = false;
    $('#save-toggle').checked = false;
    announce('この端末に保存できませんでした。今の入力は画面に残っています。結果をコピーかテキスト保存で残せます。');
  } else { savedText = written.text; announce('このブラウザに保存しています。'); }
}
function focusHeading(selector) {
  requestAnimationFrame(() => {
    $(selector).focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
}
function confirm(title, description, label, action) {
  $('#confirm-title').textContent = title;
  $('#confirm-description').textContent = description;
  $('#confirm-ok').textContent = label;
  confirmAction = action;
  $('#confirm-dialog').showModal();
}
$('#confirm-cancel').addEventListener('click', () => { confirmAction = null; $('#confirm-dialog').close(); });
$('#confirm-dialog').addEventListener('cancel', () => { confirmAction = null; });
$('#confirm-ok').addEventListener('click', () => {
  const action = confirmAction;
  confirmAction = null;
  $('#confirm-dialog').close();
  action?.();
});

const ICONS = {
  work: '<path d="M5 8h18v16H5zM10 8V4h8v4M5 14h18M11 14v3h6v-3"/>',
  study: '<path d="M3 5c5-2 8-1 11 1 3-2 6-3 11-1v18c-5-2-8-1-11 1-3-2-6-3-11-1zM14 6v18M7 10h3M7 14h3M18 10h3M18 14h3"/>',
  team: '<circle cx="14" cy="8" r="4"/><path d="M8 25v-4a6 6 0 0 1 12 0v4M4 9a3 3 0 0 0 0 6m20-6a3 3 0 0 1 0 6M3 24v-4a4 4 0 0 1 3-4m19 8v-4a4 4 0 0 0-3-4"/>',
  life: '<path d="M3 13 14 3l11 10M6 11v14h16V11M11 25v-8h6v8M12 10h4"/>',
  challenge: '<path d="M5 25V3m0 1h17l-3 5 3 5H5M2 25h7"/>',
  other: '<path d="M12 4h9a3 3 0 0 1 3 3v17H7a3 3 0 0 1-3-3V8m3 16a3 3 0 0 1 0-6h17M9 2v10l4-3 4 3V2z"/>',
};
for (const item of CONTEXTS) {
  const wrapper = element('div', 'context-option');
  const input = element('input');
  input.type = 'radio'; input.name = 'context'; input.id = 'context-' + item.id; input.value = item.id;
  const label = element('label'); label.htmlFor = input.id;
  const icon = element('span');
  icon.innerHTML = '<svg viewBox="0 0 28 28" aria-hidden="true">' + ICONS[item.id] + '</svg>';
  const words = element('span');
  words.append(element('strong', '', item.label), element('small', '', item.note));
  label.append(icon, words, element('span', 'context-check', '✓'));
  input.addEventListener('change', () => {
    state.data.context = item.id;
    $('#start-button').disabled = false;
    $('#begin-hint').textContent = item.hint;
    persist();
  });
  wrapper.append(input, label); $('#context-options').append(wrapper);
}

const FIELDS = {
  title: { label: '経験に、短い見出しを付ける', placeholder: '例：文化祭の準備で、役割を見直した', hint: 'あとで自分が思い出せる言葉で。', input: true },
  situation: { label: 'どんな場面でしたか？', placeholder: 'いつ、どこで、誰と。思い出したことから書いてみよう。', hint: '自分はどんな立場で、何に取り組んでいましたか。', rows: 4 },
  challenge: { label: '困っていたこと・目指したこと', placeholder: 'そのとき、何を変えたいと思いましたか。', hint: '大きな目標でも、身近な困りごとでも構いません。', rows: 3 },
  action: { label: '自分で考えて、やってみたこと', placeholder: '「私は」で始めてみると、自分の行動を思い出しやすくなります。', hint: '誰に、何を、どんな順番で。考えた理由も書き添えてみよう。', rows: 5 },
  result: { label: 'その後に起きたこと・変わったこと', placeholder: '相手の反応、自分の気づき、まだ解決していないことなど。', hint: '数字がなくても、うまくいかなかった経験でも大丈夫です。', rows: 4 },
  learning: { label: '次に試したいこと・学んだこと', placeholder: 'もう一度やるなら、どうしたいですか。', hint: '今は思いつかなければ、空欄でも進めます。', rows: 3, optional: true },
  reason: { label: 'それを大切にしたいのは、なぜ？', placeholder: 'うれしかったこと、譲れなかったこと。そのときの気持ちを言葉に。', hint: '選んだ価値観と、今回の経験をつなげてみましょう。', rows: 4 },
};

function fieldControl(field) {
  const spec = FIELDS[field];
  const wrapper = element('div', 'field');
  const label = element('label', 'field-label', spec.label); label.htmlFor = 'field-' + field;
  if (spec.optional) label.append(element('span', 'optional', '任意'));
  const hint = element('p', 'field-hint', spec.hint); hint.id = field + '-hint';
  const control = element(spec.input ? 'input' : 'textarea');
  if (spec.input) control.type = 'text'; else control.rows = spec.rows;
  control.id = 'field-' + field; control.name = field; control.maxLength = LIMITS[field];
  control.value = state.data[field]; control.placeholder = spec.placeholder;
  control.required = !spec.optional;
  control.setAttribute('aria-describedby', field + '-hint ' + field + '-error ' + field + '-count');
  const meta = element('div', 'field-meta');
  const error = element('p', 'field-error'); error.id = field + '-error';
  const count = element('span', 'character-count', state.data[field].length + ' / ' + LIMITS[field]); count.id = field + '-count';
  meta.append(error, count);
  control.addEventListener('input', () => {
    state.data[field] = control.value;
    count.textContent = control.value.length + ' / ' + LIMITS[field];
    error.textContent = ''; control.removeAttribute('aria-invalid');
    $('#form-error').textContent = '';
    $('#reset-button').hidden = !hasContent(state.data);
    updateMemo(); persist();
  });
  wrapper.append(label, hint, control, meta);
  return wrapper;
}

function choiceControl(field, list, title) {
  const wrapper = element('fieldset', 'choice-field');
  wrapper.id = 'field-' + field;
  wrapper.append(element('legend', '', title));
  const hint = element('p', 'field-hint', '今回の経験に近いものを、1つか2つ選んでください。');
  const grid = element('div', 'choice-grid');
  const error = element('p', 'field-error'); error.id = field + '-error'; error.setAttribute('aria-live', 'polite');
  const count = element('p', 'selection-count'); count.id = field + '-count';
  wrapper.setAttribute('aria-describedby', error.id + ' ' + count.id);
  const buttons = [];
  function update() {
    for (const [button, id, mark] of buttons) {
      const checked = state.data[field].includes(id);
      button.setAttribute('aria-pressed', String(checked)); mark.textContent = checked ? '✓' : '';
    }
    count.textContent = state.data[field].length + ' / 2 選択中';
  }
  for (const item of list) {
    const button = element('button', 'choice-button'); button.type = 'button';
    const mark = element('span', 'choice-mark'); mark.setAttribute('aria-hidden', 'true');
    button.append(mark, element('span', '', item.label));
    button.addEventListener('click', () => {
      const selected = state.data[field];
      if (selected.includes(item.id)) state.data[field] = selected.filter(id => id !== item.id);
      else if (selected.length < 2) state.data[field] = [...selected, item.id];
      else { error.textContent = '選べるのは2つまでです。選び直すときは、今の選択を1つ外してください。'; return; }
      error.textContent = ''; $('#form-error').textContent = ''; update(); persist();
    });
    buttons.push([button, item.id, mark]); grid.append(button);
  }
  update(); wrapper.append(hint, grid, count, error); return wrapper;
}

function updateMemo() {
  const context = CONTEXTS.find(item => item.id === state.data.context);
  $('#memo-context').textContent = context?.label ?? '経験を選ぼう';
  $('#memo-title').textContent = state.data.title.trim() || '経験の見出し';
  const host = $('#memo-items'); host.replaceChildren();
  for (const [field, label] of [['situation', '場面'], ['action', '自分の行動'], ['result', 'その後の変化']]) {
    const entry = element('dl', 'memo-entry');
    entry.append(element('dt', '', label), element('dd', state.data[field].trim() ? '' : 'is-empty', state.data[field].trim() || 'これから、言葉にしていこう。'));
    host.append(entry);
  }
}

function showErrors(errors) {
  for (const [field, message] of Object.entries(errors)) {
    const error = $('#' + field + '-error');
    if (error) error.textContent = message;
    $('#field-' + field)?.setAttribute('aria-invalid', 'true');
  }
  $('#form-error').textContent = errors.form ?? errors.context ?? 'まだ空いているところがあります。一言からで大丈夫です。';
  const first = Object.keys(errors)[0];
  const target = $('#field-' + first);
  (target?.matches('fieldset') ? target.querySelector('button') : target)?.focus();
}

function renderWork() {
  const step = STEPS[state.step];
  $('#question-kicker').textContent = 'STEP 0' + (state.step + 1) + ' / ' + step.label;
  $('#question-title').textContent = step.title;
  $('#question-intro').textContent = step.intro;
  $('#context-hint').textContent = CONTEXTS.find(item => item.id === state.data.context)?.hint ?? '';
  $('#step-count').textContent = '0' + (state.step + 1) + ' / 04';
  $('#demo-banner').hidden = !state.demo;
  $('#next-button').textContent = state.step === 3 ? '振り返りシートを見る →' : '次へ →';
  $('#steps').replaceChildren();
  STEPS.forEach((item, index) => {
    const button = element('button', 'step-button' + (index < state.step ? ' is-complete' : '')); button.type = 'button';
    button.append(element('span', '', index < state.step ? '✓' : '0' + (index + 1)), element('span', '', item.label));
    if (index === state.step) button.setAttribute('aria-current', 'step');
    button.disabled = index > state.step;
    button.addEventListener('click', () => { state.step = index; lastErrors = {}; render(); focusHeading('#question-title'); persist(); });
    $('#steps').append(button);
  });
  const fields = $('#question-fields'); fields.replaceChildren();
  if (state.step === 3) {
    fields.append(choiceControl('behaviors', BEHAVIORS, 'そのとき、どんな行動を取りましたか？'), choiceControl('values', VALUES, 'その経験で、大切にしたいと感じたことは？'));
  }
  for (const field of step.fields) if (FIELDS[field]) fields.append(fieldControl(field));
  $('#form-error').textContent = '';
  updateMemo();
  if (Object.keys(lastErrors).length) showErrors(lastErrors);
}

function exportText() { return (state.demo ? '【架空の見本】\n\n' : '') + reportText(state.data); }
function renderResult() {
  const report = buildReport(state.data);
  if (!report) { state.screen = 'work'; state.step = Math.max(0, firstIncomplete(state.data)); render(); return; }
  $('#result-demo').hidden = !state.demo;
  $('#strengths-list').replaceChildren();
  for (const item of report.strengths) {
    const card = element('div', 'strength-item');
    card.append(element('h3', '', item.strength), element('p', 'behavior-label', '選んだ行動：' + item.label));
    const short = [...state.data.action.trim()];
    card.append(element('p', 'evidence', short.slice(0, 150).join('') + (short.length > 150 ? '…' : '')));
    $('#strengths-list').append(card);
  }
  const values = $('#values-list'); values.className = 'values-list'; values.replaceChildren();
  for (const item of report.values) values.append(element('span', 'value-tag', item.label));
  $('#result-reason').textContent = state.data.reason.trim();
  $('#story-title').textContent = state.data.title.trim();
  $('#story-context').textContent = report.context.label;
  $('#story-list').replaceChildren();
  for (const [field, label] of [['situation', 'どんな場面で'], ['challenge', '何を目指して'], ['action', 'どう動いたか'], ['result', '何が変わったか'], ['learning', '次に試したいこと']]) {
    if (state.data[field].trim()) $('#story-list').append(element('dt', '', label), element('dd', '', state.data[field].trim()));
  }
  $('#questions-list').replaceChildren();
  for (const item of report.questions) {
    const row = element('li'); row.append(element('span', '', item.kind), document.createTextNode(item.text)); $('#questions-list').append(row);
  }
  $('#copy-text').value = exportText();
  $('#manual-copy').hidden = true; $('#manual-copy').open = false;
  $('#export-status').textContent = '';
}

function render() {
  for (const screen of ['welcome', 'work', 'result']) $('#' + screen).hidden = state.screen !== screen;
  $('#save-control').hidden = state.screen === 'welcome' && !hasContent(state.data);
  $('#save-toggle').checked = saveEnabled;
  $('#reset-button').hidden = !hasContent(state.data);
  if (state.screen === 'welcome') {
    for (const input of document.querySelectorAll('input[name=context]')) input.checked = input.value === state.data.context;
    $('#start-button').disabled = !state.data.context;
    $('#start-button').textContent = hasContent(state.data) ? '続きから振り返る →' : '振り返りをはじめる →';
    $('#begin-hint').textContent = CONTEXTS.find(item => item.id === state.data.context)?.hint ?? '思い出しやすいものを、ひとつ選んでください。';
  } else if (state.screen === 'work') renderWork();
  else renderResult();
}

$('#start-button').addEventListener('click', () => {
  if (!state.data.context) return;
  state.screen = 'work'; lastErrors = {}; render(); focusHeading('#question-title'); persist();
});
$('#work-form').addEventListener('submit', event => {
  event.preventDefault();
  const errors = validateStep(state.data, state.step);
  if (Object.keys(errors).length) { lastErrors = errors; showErrors(errors); return; }
  if (state.step === 3) {
    const incomplete = firstIncomplete(state.data);
    if (incomplete !== -1) { state.step = incomplete; lastErrors = validateStep(state.data, incomplete); render(); return; }
    state.screen = 'result';
  } else state.step++;
  lastErrors = {}; render(); focusHeading(state.screen === 'result' ? '#result-title' : '#question-title'); persist();
});
$('#back-button').addEventListener('click', () => {
  if (state.step === 0) state.screen = 'welcome'; else state.step--;
  lastErrors = {}; render();
  if (state.screen === 'welcome') $('#start-button').focus(); else focusHeading('#question-title');
  persist();
});
$('#edit-button').addEventListener('click', () => { state.screen = 'work'; state.step = 0; lastErrors = {}; render(); focusHeading('#question-title'); persist(); });

function beginExample() {
  state = { data: normalizeData(EXAMPLE), step: 0, screen: 'work', demo: true };
  lastErrors = {}; render(); focusHeading('#question-title'); persist();
}
for (const button of document.querySelectorAll('[data-start-example]')) button.addEventListener('click', () => {
  if (hasContent(state.data)) confirm('今の内容を、見本に置き換えますか？', '現在の入力は置き換わります。必要なら、先に振り返りシートをコピーかテキスト保存で残してください。', '見本に置き換える', beginExample);
  else beginExample();
});
function clearAll() {
  const removed = removeSaved(storage).ok;
  state = { data: emptyData(), step: 0, screen: 'welcome', demo: false };
  saveEnabled = false; savingPaused = false; lastErrors = {};
  if (removed) savedText = null;
  for (const selector of ['#question-fields', '#memo-items', '#strengths-list', '#values-list', '#story-list', '#questions-list']) $(selector).replaceChildren();
  for (const selector of ['#story-title', '#result-reason', '#memo-title', '#memo-context', '#export-status']) $(selector).textContent = '';
  $('#copy-text').value = ''; $('#manual-copy').hidden = true;
  announce(removed ? 'このアプリの入力と、保存した内容を消しました。' : '画面の入力は消しましたが、ブラウザの保存内容は削除できませんでした。ブラウザのサイトデータで確認してください。'); render();
  $('#context-work').focus(); window.scrollTo({ top: 0, behavior: 'instant' });
}
function requestClear() { confirm('入力を消して、最初から始めますか？', 'このアプリの入力と、この端末に保存した内容を削除します。必要なら、先にシートをコピーかテキスト保存で残してください。', '消して始める', clearAll); }
$('#reset-button').addEventListener('click', requestClear);
$('#new-button').addEventListener('click', requestClear);
$('#own-button').addEventListener('click', requestClear);

function enableSaving() {
  try { savedText = storage.getItem(STORAGE_KEY); } catch { /* persist will surface the storage failure. */ }
  saveEnabled = true; savingPaused = false; $('#save-toggle').checked = true; persist();
}
$('#save-toggle').addEventListener('change', event => {
  if (event.target.checked) {
    try { if (storage.getItem(STORAGE_KEY) !== savedText) savingPaused = true; } catch { /* enableSaving reports the failure. */ }
    if (savingPaused) {
      event.target.checked = false;
      confirm('保存内容を、今の回答で置き換えますか？', '別のタブで保存内容が変わっています。保存を再開すると、今の画面の回答で置き換えます。', 'この回答を保存する', enableSaving);
    } else enableSaving();
  } else if (removeSaved(storage).ok) {
    saveEnabled = false; savingPaused = false; savedText = null; announce('端末の保存をオフにし、保存した内容を削除しました。今の入力は画面に残っています。');
  } else {
    event.target.checked = true;
    announce('保存した内容を消せませんでした。ブラウザのサイトデータから削除できます。');
  }
});
window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY || event.key === null) pauseSaving();
});

$('#copy-button').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(exportText()); $('#export-status').textContent = '振り返りシートをコピーしました。';
  } catch {
    $('#export-status').textContent = '自動コピーが使えませんでした。下の文章を選んでコピーできます。';
    $('#manual-copy').hidden = false; $('#manual-copy').open = true;
    $('#copy-text').focus(); $('#copy-text').select();
  }
});
$('#download-button').addEventListener('click', () => {
  const file = new Blob([exportText()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(file);
  const link = element('a'); link.href = url; link.download = 'じぶんの手がかり.txt';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('#export-status').textContent = 'テキストファイルの保存を開始しました。';
});
$('#print-button').addEventListener('click', () => window.print());
for (const [button, dialog] of [['#about-button', '#about-dialog'], ['#share-button', '#share-dialog']]) {
  $(button).addEventListener('click', () => $(dialog).showModal());
  $(dialog).querySelector('[data-close]').addEventListener('click', () => $(dialog).close());
  $(dialog).addEventListener('click', event => { if (event.target === $(dialog)) { const r = $(dialog).getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $(dialog).close(); } });
}
const narrow = window.matchMedia('(max-width: 650px)');
$('#memo-details').open = !narrow.matches;
narrow.addEventListener('change', event => { $('#memo-details').open = !event.matches; });
render();
if (restored.ok && restored.state) announce('保存した続きから開きました。');
else if (restored.kind === 'corrupt') announce('保存した内容を読み込めませんでした。新しく始めるか、ブラウザのサイトデータを確認してください。');

return {
  restored: Boolean(restored.ok && restored.state),
  confirm,
  show() { render(); focusHeading(state.screen === 'result' ? '#result-title' : state.screen === 'work' ? '#question-title' : '#begin-title'); },
  home() { state.screen = 'welcome'; lastErrors = {}; render(); persist(); $('#start-button').focus(); window.scrollTo({ top: 0, behavior: 'instant' }); },
};
}
