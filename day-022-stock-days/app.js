import { BUILTIN_ROWS, calculate, shortageFor, validateNumber } from './lib/calc.js';
import { expiryStatus } from './lib/expiry.js';
import { clear, initialState, load, save } from './lib/store.js';

const $ = (id) => document.getElementById(id);
const rowIds = BUILTIN_ROWS.map(({ id }) => id);
const standardUnits = ['本', '回', '枚', '日', '袋', '個'];
const candidateRows = [
  { name: 'カセットボンベ', unit: '本' },
  { name: '粉ミルク・液体ミルク', unit: '回', infant: true },
  { name: 'おむつ', unit: '枚', infant: true },
  { name: 'ペットフード', unit: '袋', pet: true },
  { name: 'ペットの水', unit: 'L', pet: true },
  { name: '常備薬', unit: '日' },
  { name: 'その他', unit: '個', editable: true }
];

let storage = null;
try { storage = window.localStorage; } catch { /* 保存なしでも計算は続ける */ }
const loaded = load(storage);
let state = loaded.state;
let canSave = loaded.canSave;
let clearArmed = false;
let clearTimer = null;
let copyTimer = null;
let shortageCopyText = '';

function format(value) {
  if (!Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function setHidden(node, hidden) {
  node.hidden = hidden;
}

function persist() {
  if (!canSave) return;
  const result = save(storage, state);
  if (!result.saved) {
    canSave = false;
    renderStorageState();
  }
}

function renderStorageState() {
  setHidden($('storage-error'), canSave);
  $('save-note').textContent = canSave
    ? 'この端末に保存されています。外には送りません。'
    : 'この環境では保存できません。入力は画面を閉じるまで有効です。';
}

function currentExpiryRows() {
  const result = [];
  for (const row of BUILTIN_ROWS) {
    const status = expiryStatus(state.rows[row.id].expiry);
    if (status === 'expired') result.push(row.name);
  }
  for (const row of state.custom) {
    if (expiryStatus(row.expiry) === 'expired') result.push(row.name || '追加の行');
  }
  return result;
}

function renderExpiry(id, name, expiry) {
  const badge = $(`${id}-expiry-badge`);
  if (!badge) return;
  const status = expiryStatus(expiry);
  badge.className = 'expiry-badge';
  if (status === 'expired') {
    badge.textContent = '期限切れ';
    badge.classList.add('is-expired');
    badge.hidden = false;
  } else if (status === 'soon') {
    badge.textContent = '期限が近い';
    badge.classList.add('is-soon');
    badge.hidden = false;
  } else {
    badge.textContent = '';
    badge.hidden = true;
  }
  badge.setAttribute('aria-label', `${name} ${badge.textContent}`.trim());
}

function createSummaryExpiry() {
  const expired = currentExpiryRows();
  if (!expired.length) return null;
  const firstExpired = [...BUILTIN_ROWS.map((row) => ({ id: row.id, expiry: state.rows[row.id].expiry })), ...state.custom]
    .find((row) => expiryStatus(row.expiry) === 'expired');
  const expiry = document.createElement('a');
  expiry.id = 'summary-expiry';
  expiry.className = 'summary__chip summary__chip--expiry';
  expiry.href = `#row-${firstExpired.id}`;
  const visible = document.createElement('span');
  visible.setAttribute('aria-hidden', 'true');
  visible.textContent = `期限切れ：${expired.join('、')}`;
  const legacy = document.createElement('span');
  legacy.className = 'sr-only';
  legacy.setAttribute('aria-hidden', 'true');
  legacy.textContent = `期限切れ: ${expired.join('、')}`;
  expiry.append(visible, legacy);
  return expiry;
}

function renderSummary(calculation) {
  const summary = $('summary');
  const main = $('summary-main');
  const emptyAction = $('summary-empty-action');
  main.replaceChildren();
  setHidden(emptyAction, true);
  summary.classList.toggle('is-invalid', calculation.errors.length > 0);
  if (calculation.errors.length) {
    main.textContent = '入力を直してください';
    main.className = 'summary__message';
  } else if (!calculation.hasStock) {
    main.textContent = '人数と在庫を入れると、ここに日数が出ます';
    main.className = 'summary__message';
    setHidden(emptyAction, false);
  } else if (!calculation.bottleneck) {
    main.textContent = '1日に使う量を入れると、ここに日数が出ます';
    main.className = 'summary__message';
  } else {
    const shortage = shortageFor(
      calculation.bottleneck.stock,
      calculation.bottleneck.perDay,
      calculation.targetDays,
      { water: calculation.bottleneck.id === 'water' }
    );
    const amount = format(shortage.amount);
    if (shortage.amount === 0) {
      main.textContent = `${calculation.targetDays}日分そろっています`;
      main.className = 'summary__message';
    } else {
      main.className = 'summary__content';
      const days = document.createElement('p');
      days.className = 'summary__days';
      days.append('あと ');
      const daysValue = document.createElement('strong');
      daysValue.id = 'summary-days';
      daysValue.textContent = calculation.overallDays.toFixed(1);
      const daysUnit = document.createElement('span');
      daysUnit.textContent = '日';
      days.append(daysValue, ' ', daysUnit);

      const facts = document.createElement('div');
      facts.className = 'summary__facts';
      const bottleneck = document.createElement('a');
      bottleneck.id = 'summary-bottleneck';
      bottleneck.className = 'summary__chip';
      bottleneck.href = `#row-${calculation.bottleneck.id}`;
      const bottleneckVisible = document.createElement('span');
      bottleneckVisible.setAttribute('aria-hidden', 'true');
      bottleneckVisible.textContent = `先に尽きる：${calculation.bottleneck.name}`;
      const bottleneckLegacy = document.createElement('span');
      bottleneckLegacy.className = 'sr-only';
      bottleneckLegacy.setAttribute('aria-hidden', 'true');
      bottleneckLegacy.textContent = `先に尽きるのは ${calculation.bottleneck.name}`;
      bottleneck.append(bottleneckVisible, bottleneckLegacy);

      const shortageLink = document.createElement('a');
      shortageLink.id = 'summary-shortage';
      shortageLink.className = 'summary__chip';
      shortageLink.href = '#result';
      shortageLink.textContent = `${calculation.targetDays}日まで：${calculation.bottleneck.name} あと${amount}${calculation.bottleneck.unit}`;
      facts.append(bottleneck, shortageLink);
      main.append(days, facts);
    }
  }
  const expiry = createSummaryExpiry();
  if (expiry) {
    const facts = main.querySelector('.summary__facts');
    if (facts) facts.append(expiry);
    else main.append(expiry);
  }
}

function renderRowResult(row, bottleneckId, targetDays) {
  const card = document.querySelector(`[data-row-id="${CSS.escape(row.id)}"]`);
  if (!card) return;
  const days = $(`${row.id}-days`);
  const bar = $(`${row.id}-bar`);
  const number = document.createElement('span');
  number.className = 'days-number';
  number.textContent = row.days === null ? '—' : row.days.toFixed(1);
  const unit = document.createElement('span');
  unit.className = 'days-unit';
  unit.textContent = '日';
  days.replaceChildren(number, ' ', unit);
  bar.value = row.days === null ? 0 : Math.min(7, row.days);
  bar.setAttribute('aria-label', `${row.name}の日数 ${row.days === null ? '未計算' : `${row.days.toFixed(1)}日`}`);
  const isReady = row.days !== null && row.days >= 7;
  const isBottleneck = row.id === bottleneckId;
  card.classList.toggle('is-ready', isReady);
  card.classList.toggle('is-bottleneck', isBottleneck);
  const status = $(`${row.id}-status`);
  if (status) {
    status.className = 'row-status';
    if (isBottleneck) {
      status.textContent = '先に尽きます';
      status.classList.add('is-bottleneck');
      status.hidden = false;
    } else if (isReady) {
      status.textContent = '7日分あります';
      status.classList.add('is-ready');
      status.hidden = false;
    } else {
      status.textContent = '';
      status.hidden = true;
    }
  }
  card.querySelector('.mark--three')?.classList.toggle('is-target', targetDays === 3);
  card.querySelector('.mark--seven')?.classList.toggle('is-target', targetDays === 7);
}

function renderErrors(calculation) {
  const errorKeys = new Set(calculation.errors.map(({ id, field }) => `${id}:${field}`));
  setHidden($('people-error'), !errorKeys.has('people:people'));
  for (const id of rowIds) setHidden($(`${id}-error`), !errorKeys.has(`${id}:stock`));
  for (const row of state.custom) {
    const parts = [];
    if (errorKeys.has(`${row.id}:stock`)) parts.push('手持ちの量');
    if (errorKeys.has(`${row.id}:perDay`)) parts.push('1日に使う量');
    const node = $(`${row.id}-error`);
    if (!node) continue;
    node.textContent = parts.length ? `${parts.join('と')}を0〜100000の数値で入力してください` : '';
    setHidden(node, parts.length === 0);
  }
}

function renderShortages(calculation) {
  const list = $('shortage-list');
  const copyButton = $('copy-shortage');
  const fallback = $('copy-shortage-fallback');
  list.replaceChildren();
  clearTimeout(copyTimer);
  copyButton.textContent = '買い足しリストをコピー';
  copyButton.hidden = true;
  fallback.hidden = true;
  fallback.value = '';
  shortageCopyText = '';
  if (calculation.errors.length || !calculation.people) {
    $('result-lead').textContent = '入力を直すと、不足量を計算します。';
    return;
  }

  const shortageRows = calculation.rows.filter((row) => row.priority < 3 || (row.valid && row.perDay > 0));
  const results = shortageRows.map((row) => {
    const stock = row.stock ?? 0;
    return { row, shortage: shortageFor(stock, row.perDay, calculation.targetDays, { water: row.id === 'water' }) };
  });
  const allReady = results.length > 0 && results.every(({ shortage }) => shortage.amount === 0);
  if (allReady) {
    const item = document.createElement('li');
    item.className = 'all-ready';
    item.textContent = `${calculation.targetDays}日分そろっています`;
    list.append(item);
    $('result-lead').textContent = '目標量に届いています。期限もあわせて確認してください。';
    return;
  }

  $('result-lead').textContent = `${calculation.targetDays}日分にするための目安です。`;
  const copyLines = [`${calculation.targetDays}日分まで`];
  for (const { row, shortage } of results) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    const amount = document.createElement('strong');
    name.textContent = row.name;
    if (shortage.amount === 0) {
      amount.textContent = '足りています';
      amount.className = 'all-ready';
    } else if (row.id === 'water') {
      amount.textContent = `+${format(shortage.amount)}L（2Lペット${shortage.bottles}本）`;
      copyLines.push(`${row.name} ${amount.textContent}`);
    } else {
      amount.textContent = `+${format(shortage.amount)}${row.unit}`;
      copyLines.push(`${row.name} ${amount.textContent}`);
    }
    item.classList.toggle('is-bottleneck', row.id === calculation.bottleneck?.id && shortage.amount > 0);
    item.append(name, amount);
    list.append(item);
  }
  shortageCopyText = copyLines.join('\n');
  copyButton.hidden = copyLines.length === 1;
}

function showCopyFallback() {
  const fallback = $('copy-shortage-fallback');
  fallback.value = shortageCopyText;
  fallback.hidden = false;
  fallback.focus();
  fallback.select();
}

async function copyShortages() {
  if (!shortageCopyText) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(shortageCopyText);
    const button = $('copy-shortage');
    $('copy-shortage-fallback').hidden = true;
    button.textContent = 'コピーしました';
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { button.textContent = '買い足しリストをコピー'; }, 2000);
  } catch {
    showCopyFallback();
  }
}

function renderCalculation() {
  const calculation = calculate(state);
  renderErrors(calculation);
  for (const row of calculation.rows) renderRowResult(row, calculation.bottleneck?.id, calculation.targetDays);
  for (const row of BUILTIN_ROWS) renderExpiry(row.id, row.name, state.rows[row.id].expiry);
  for (const row of state.custom) renderExpiry(row.id, row.name || '追加の行', row.expiry);
  for (const row of calculation.rows.filter((item) => item.priority >= 3)) {
    const help = $(`${row.id}-help`);
    if (help) {
      help.textContent = row.needsPerDay ? '1日に使う量を入れると日数が出ます' : '';
      setHidden(help, !row.needsPerDay);
    }
  }
  renderSummary(calculation);
  renderShortages(calculation);
}

function updateCustom(id, key, value) {
  const row = state.custom.find((item) => item.id === id);
  if (!row) return;
  row[key] = value;
  if (key === 'name') {
    const title = document.querySelector(`[data-row-id="${CSS.escape(id)}"] h3`);
    if (title) title.textContent = value || '追加の行';
  }
  persist();
  renderCalculation();
}

function inputField(labelText, id, value, key, rowId, options = {}) {
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.id = id;
  input.value = value ?? '';
  if (options.maxLength) input.maxLength = options.maxLength;
  input.type = options.type ?? 'text';
  if (options.inputMode) input.inputMode = options.inputMode;
  if (options.type === 'number') {
    input.min = '0';
    input.max = '100000';
    input.step = '0.1';
  }
  input.addEventListener('input', () => updateCustom(rowId, key, input.value));
  label.append(input);
  return label;
}

function createUnitField(row) {
  const label = document.createElement('label');
  label.textContent = '単位';
  const select = document.createElement('select');
  select.id = `${row.id}-unit-select`;
  for (const unit of [...standardUnits, '自由入力']) {
    const option = document.createElement('option');
    option.value = unit;
    option.textContent = unit;
    select.append(option);
  }
  const known = standardUnits.includes(row.unit);
  select.value = known ? row.unit : '自由入力';
  const custom = document.createElement('input');
  custom.id = `${row.id}-unit`;
  custom.maxLength = 4;
  custom.value = known ? '' : row.unit;
  custom.placeholder = '4字まで';
  custom.hidden = known;
  select.addEventListener('change', () => {
    custom.hidden = select.value !== '自由入力';
    updateCustom(row.id, 'unit', select.value === '自由入力' ? custom.value : select.value);
  });
  custom.addEventListener('input', () => updateCustom(row.id, 'unit', custom.value));
  label.append(select, custom);
  return label;
}

function renderCustomRows() {
  const container = $('custom-rows');
  container.replaceChildren();
  for (const row of state.custom) {
    const card = document.createElement('article');
    card.className = 'stock-card custom-card';
    card.id = `row-${row.id}`;
    card.dataset.rowId = row.id;
    const heading = document.createElement('div');
    heading.className = 'stock-card__title';
    const headingBox = document.createElement('div');
    const kicker = document.createElement('p');
    kicker.className = 'kicker';
    kicker.textContent = 'MY STOCK';
    const titleLine = document.createElement('div');
    titleLine.className = 'title-line';
    const title = document.createElement('h3');
    title.textContent = row.name || '追加の行';
    const status = document.createElement('span');
    status.id = `${row.id}-status`;
    status.className = 'row-status';
    status.hidden = true;
    titleLine.append(title, status);
    headingBox.append(kicker, titleLine);
    const rate = document.createElement('span');
    rate.className = 'rate';
    rate.textContent = '世帯で1日の量';
    heading.append(headingBox, rate);

    const grid = document.createElement('div');
    grid.className = 'custom-grid';
    const nameField = inputField('名前', `${row.id}-name`, row.name, 'name', row.id, { maxLength: 20 });
    nameField.className = 'wide';
    grid.append(
      nameField,
      createUnitField(row),
      inputField('手持ちの量', `${row.id}-stock`, row.stock, 'stock', row.id, { type: 'number', inputMode: 'decimal' }),
      inputField('1日に使う量', `${row.id}-per-day`, row.perDay, 'perDay', row.id, { type: 'number', inputMode: 'decimal' }),
      inputField('いちばん早い期限', `${row.id}-expiry`, row.expiry, 'expiry', row.id, { type: 'date' })
    );
    const error = document.createElement('p');
    error.id = `${row.id}-error`;
    error.className = 'field-error';
    error.hidden = true;
    const help = document.createElement('p');
    help.id = `${row.id}-help`;
    help.className = 'custom-help';
    help.textContent = '1日に使う量を入れると日数が出ます';
    const daysLine = document.createElement('div');
    daysLine.className = 'days-line';
    const days = document.createElement('strong');
    days.id = `${row.id}-days`;
    const daysNumber = document.createElement('span');
    daysNumber.className = 'days-number';
    daysNumber.textContent = '—';
    const daysUnit = document.createElement('span');
    daysUnit.className = 'days-unit';
    daysUnit.textContent = '日';
    days.append(daysNumber, ' ', daysUnit);
    const badge = document.createElement('span');
    badge.id = `${row.id}-expiry-badge`;
    badge.className = 'expiry-badge';
    badge.hidden = true;
    daysLine.append(days, badge);
    const tank = document.createElement('div');
    tank.className = 'tank';
    const progress = document.createElement('progress');
    progress.id = `${row.id}-bar`;
    progress.max = 7;
    progress.value = 0;
    progress.setAttribute('aria-label', `${row.name || '追加の行'}の日数 0日`);
    for (const [className, text] of [['mark--zero', '0'], ['mark--three', '3日'], ['mark--seven', '7日']]) {
      const mark = document.createElement('span');
      mark.className = `mark ${className}`;
      mark.textContent = text;
      tank.append(mark);
    }
    tank.prepend(progress);
    const note = document.createElement('p');
    note.className = 'row-note';
    note.textContent = row.name === 'カセットボンベ' ? '農林水産省ガイドでは、大人1人1週間に6本程度の例があります。必要量はご家庭で決めてください。' : '公式の一律な目安は使わず、ご家庭の1日量で計算します。';
    const actions = document.createElement('div');
    actions.className = 'custom-actions';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-button';
    remove.textContent = 'この行を削除';
    remove.addEventListener('click', () => {
      state.custom = state.custom.filter((item) => item.id !== row.id);
      persist();
      renderCustomRows();
      renderChips();
      renderCalculation();
    });
    actions.append(remove);
    card.append(heading, grid, error, help, daysLine, tank, note, actions);
    container.append(card);
  }
  $('custom-count').textContent = `あと${4 - state.custom.length}行`;
}

function addCustom(candidate) {
  if (state.custom.length >= 4) return;
  const id = `custom-${Date.now()}-${state.custom.length + 1}`;
  state.custom.push({ id, name: candidate.editable ? '' : candidate.name, unit: candidate.unit, stock: '', perDay: '', expiry: '' });
  persist();
  renderCustomRows();
  renderChips();
  renderCalculation();
  $(`${id}-name`)?.focus();
}

function renderChips() {
  const chips = $('custom-chips');
  chips.replaceChildren();
  const visible = candidateRows.filter((row) => (!row.infant || state.flags.infant) && (!row.pet || state.flags.pet));
  for (const candidate of visible) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = `＋ ${candidate.name}`;
    button.disabled = state.custom.length >= 4;
    button.addEventListener('click', () => addCustom(candidate));
    chips.append(button);
  }
}

function syncInputsFromState() {
  $('people').value = state.people;
  document.querySelector(`input[name="target"][value="${state.targetDays}"]`).checked = true;
  $('flag-infant').checked = state.flags.infant;
  $('flag-pet').checked = state.flags.pet;
  for (const id of rowIds) {
    $(`${id}-stock`).value = state.rows[id].stock;
    $(`${id}-expiry`).value = state.rows[id].expiry;
  }
}

function resetClearButton() {
  clearArmed = false;
  clearTimeout(clearTimer);
  $('clear-button').textContent = '入力を消す';
  $('clear-button').classList.remove('is-armed');
}

function bindEvents() {
  $('copy-shortage').addEventListener('click', copyShortages);
  $('summary-empty-action').addEventListener('click', () => {
    $('water-stock').focus();
  });
  $('people').addEventListener('input', () => {
    state.people = $('people').value;
    persist();
    renderCalculation();
  });
  $('people-minus').addEventListener('click', () => {
    const check = validateNumber(state.people, { integer: true, min: 1, max: 20 });
    state.people = Math.max(1, (check.valid && !check.empty ? check.value : 2) - 1);
    $('people').value = state.people;
    persist();
    renderCalculation();
  });
  $('people-plus').addEventListener('click', () => {
    const check = validateNumber(state.people, { integer: true, min: 1, max: 20 });
    state.people = Math.min(20, (check.valid && !check.empty ? check.value : 2) + 1);
    $('people').value = state.people;
    persist();
    renderCalculation();
  });
  document.querySelectorAll('input[name="target"]').forEach((input) => input.addEventListener('change', () => {
    state.targetDays = Number(input.value);
    persist();
    renderCalculation();
  }));
  for (const [id, flag] of [['flag-infant', 'infant'], ['flag-pet', 'pet']]) {
    $(id).addEventListener('change', () => {
      state.flags[flag] = $(id).checked;
      persist();
      renderChips();
    });
  }
  for (const id of rowIds) {
    $(`${id}-stock`).addEventListener('input', () => {
      state.rows[id].stock = $(`${id}-stock`).value;
      persist();
      renderCalculation();
    });
    $(`${id}-expiry`).addEventListener('input', () => {
      state.rows[id].expiry = $(`${id}-expiry`).value;
      persist();
      renderCalculation();
    });
  }
  $('clear-button').addEventListener('click', () => {
    if (!clearArmed) {
      clearArmed = true;
      $('clear-button').textContent = 'もう一度押すと消えます';
      $('clear-button').classList.add('is-armed');
      clearTimer = setTimeout(resetClearButton, 3000);
      return;
    }
    const result = clear(storage);
    if (!result.cleared) canSave = false;
    state = initialState();
    resetClearButton();
    syncInputsFromState();
    renderCustomRows();
    renderChips();
    renderStorageState();
    renderCalculation();
  });
}

syncInputsFromState();
renderCustomRows();
renderChips();
renderStorageState();
bindEvents();
renderCalculation();
