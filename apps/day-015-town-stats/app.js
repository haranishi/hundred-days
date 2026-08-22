/* 画面の配線。Gemma3:27bの1周目が存在しないライブラリ（select2）を前提にしてしまい
   検収不合格（作話系の失敗2回目）だったため、規約どおり検収側が書き直したファイル。 */
import {
  METRICS, PREFS, barRatio, buildIndex, formatValue, medianOf,
  rankLabel, rankOf, searchTowns, townsOfPref,
} from './lib/stats.js';

const el = (id) => document.getElementById(id);
const statusBox = el('status');
const searchInput = el('search-input');
const searchResults = el('search-results');
const prefSelect = el('pref-select');
const townSelect = el('town-select');
const cards = el('cards');
const cardMain = el('card-main');
const cardVs = el('card-vs');
const compareBox = el('compare');
const vsPref = el('vs-pref');
const vsTown = el('vs-town');
const vsClear = el('vs-clear');

const BASE_TITLE = 'あなたの街のステータス';
const SAMPLE_CODE = '05201';   // 空状態で例として見せる街（秋田市）
const QUICK_PICKS = ['01100', '05201', '13104', '27100', '47201']; // 札幌・秋田・新宿・大阪・那覇
let towns = [];
let index = null;
let mainCode = null;
let vsCode = null;
let activeAt = -1;   // 検索候補のキーボード位置

/* ---- 状態表示（読込中・空・エラーは全部ここ） ---- */
function showStatus(build) {
  statusBox.replaceChildren();
  build(statusBox);
  statusBox.hidden = false;
}

/* 空状態は説明文でなく「動いている実物」を見せる。例のカード＋注記 */
function showSample() {
  const sample = towns.find((t) => t.code === SAMPLE_CODE);
  if (!sample) return;
  showStatus((box) => {
    box.className = 'empty-hint sample-note';
    box.textContent = '例として秋田市を表示しています。検索や上のボタンで、自分の街に切り替えられます。';
  });
  markChip(SAMPLE_CODE);
  renderCard(sample, cardMain);
  compareBox.hidden = true;
  document.title = BASE_TITLE;
}

function showError() {
  showStatus((box) => {
    box.className = '';
    box.append('データを読み込めませんでした。通信の状態を確かめて、もう一度どうぞ。');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.id = 'reload-btn';
    retry.textContent = '再読み込み';
    retry.addEventListener('click', loadData);
    box.append(retry);
  });
}

/* ---- データ読み込み ---- */
async function loadData() {
  showStatus((box) => {
    box.className = 'empty-hint';
    box.textContent = '読み込み中…';
  });
  try {
    const response = await fetch('./data/towns.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    towns = data.towns;
    index = buildIndex(towns);
    fillPrefOptions(prefSelect);
    fillPrefOptions(vsPref);
    fillQuickPicks();
    restoreFromUrl();
    // 読み込み中に検索し始めていた人へ：データが届いた今、候補を出し直す
    //（フォーカスが検索箱にあるときだけ。復元で入れた街名から勝手に開かないように）
    if (document.activeElement === searchInput && searchInput.value.trim() !== '') renderResults();
  } catch {
    showError();
  }
}

/* ---- セレクト ---- */
function fillPrefOptions(select) {
  select.replaceChildren(new Option('都道府県', ''));
  for (const pref of PREFS) select.add(new Option(pref, pref));
}

function fillTownOptions(select, pref) {
  select.replaceChildren(new Option('市区町村', ''));
  for (const town of townsOfPref(towns, pref)) select.add(new Option(town.name, town.code));
  select.disabled = !pref;
}

function fillQuickPicks() {
  const row = el('quick-picks');
  row.replaceChildren();
  for (const code of QUICK_PICKS) {
    const town = towns.find((t) => t.code === code);
    if (!town) continue;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.code = code;
    chip.textContent = town.name;
    chip.addEventListener('click', () => selectTown(code));
    row.append(chip);
  }
}

/* 街を選んだら、一覧セレクトにも同じ選択を映す（URL復元でも食い違わないように） */
function syncSelects(prefEl, townEl, town) {
  prefEl.value = town.pref;
  fillTownOptions(townEl, town.pref);
  townEl.value = town.code;
}

prefSelect.addEventListener('change', () => fillTownOptions(townSelect, prefSelect.value));
townSelect.addEventListener('change', () => { if (townSelect.value) selectTown(townSelect.value); });
vsPref.addEventListener('change', () => fillTownOptions(vsTown, vsPref.value));
vsTown.addEventListener('change', () => { if (vsTown.value) selectVs(vsTown.value); });
vsClear.addEventListener('click', clearVs);

/* ---- 検索 ---- */
function closeResults() {
  searchResults.hidden = true;
  searchResults.replaceChildren();
  activeAt = -1;
}

function renderResults() {
  const hits = searchTowns(towns, searchInput.value, 12);
  searchResults.replaceChildren();
  activeAt = -1;
  if (searchInput.value.trim() === '') { closeResults(); return; }
  if (hits.length === 0) {
    const li = document.createElement('li');
    li.setAttribute('aria-disabled', 'true');
    li.textContent = '見つかりません。都道府県から選べます。';
    searchResults.append(li);
  }
  for (const town of hits) {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.dataset.code = town.code;
    li.append(town.name);
    const small = document.createElement('small');
    small.textContent = town.pref;
    li.append(small);
    li.addEventListener('click', () => { selectTown(town.code); });
    searchResults.append(li);
  }
  searchResults.hidden = false;
}

function moveActive(delta) {
  const options = [...searchResults.querySelectorAll('li[role="option"]')];
  if (options.length === 0) return;
  activeAt = (activeAt + delta + options.length) % options.length;
  options.forEach((li, i) => li.classList.toggle('is-active', i === activeAt));
}

searchInput.addEventListener('input', renderResults);
searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') { event.preventDefault(); moveActive(1); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); moveActive(-1); }
  else if (event.key === 'Enter') {
    const options = [...searchResults.querySelectorAll('li[role="option"]')];
    const pick = options[activeAt] ?? options[0];
    if (pick) selectTown(pick.dataset.code);
  } else if (event.key === 'Escape') {
    closeResults();
  }
});
document.addEventListener('pointerdown', (event) => {
  if (!searchResults.hidden && !event.target.closest('.search-box')) closeResults();
});

/* ---- カード ---- */
function statRow(town, metric) {
  const li = document.createElement('li');
  li.className = 'stat';

  const head = document.createElement('div');
  head.className = 'stat__head';
  const label = document.createElement('span');
  label.className = 'stat__label';
  label.textContent = metric.label;
  const noteText = metric.note ?? (metric.key === 'area' ? '面積調 2026年4月1日時点' : null);
  if (noteText) {
    const note = document.createElement('small');
    note.className = 'stat__note';
    note.textContent = noteText;
    label.append(note);
  }
  head.append(label);
  const rank = rankOf(index, metric.key, town.code);
  if (rank) {
    const badge = document.createElement('span');
    badge.className = 'stat__rank';
    badge.textContent = rankLabel(metric, rank.rank, rank.of);
    head.append(badge);
  }
  li.append(head);

  const reading = document.createElement('div');
  reading.className = 'stat__reading';
  const value = document.createElement('span');
  value.className = 'stat__value';
  value.textContent = formatValue(metric, town[metric.key]);
  reading.append(value);
  if (metric.unit) {
    const unit = document.createElement('span');
    unit.className = 'stat__unit';
    unit.textContent = metric.unit;
    reading.append(unit);
  }
  li.append(reading);

  const ratio = barRatio(town[metric.key], medianOf(index, metric.key));
  if (ratio !== null) {
    const bar = document.createElement('div');
    bar.className = 'stat__bar';
    const fill = document.createElement('div');
    fill.className = 'stat__bar-fill';
    fill.style.setProperty('--r', String(ratio));
    const mid = document.createElement('span');
    mid.className = 'stat__bar-mid';
    bar.append(fill, mid);
    li.append(bar);
  }
  return li;
}

function renderCard(town, container) {
  container.replaceChildren();

  const head = document.createElement('div');
  head.className = 'card__head';
  const title = document.createElement('h2');
  title.className = 'card__title';
  title.textContent = town.name;
  const pref = document.createElement('span');
  pref.className = 'card__pref';
  pref.textContent = town.pref;
  const en = document.createElement('span');
  en.className = 'card__en';
  en.textContent = town.en;
  head.append(title, pref, en);
  container.append(head);

  const vintage = document.createElement('span');
  vintage.className = 'card__vintage';
  vintage.textContent = '2020年10月1日時点';
  container.append(vintage);

  if (town.areaNote) {
    const note = document.createElement('p');
    note.className = 'card__note';
    note.textContent = '面積は境界未定部分を含む参考値です';
    container.append(note);
  }

  const list = document.createElement('ul');
  list.className = 'stat-list';
  for (const metric of METRICS) list.append(statRow(town, metric));
  container.append(list);

  container.hidden = false;
  /* バーの読み方は、バーを読む前に1回だけ（カードごとに繰り返さない） */
  el('cards-legend').hidden = false;
}

/* ---- 選択と比較 ---- */
function markChip(code) {
  for (const chip of document.querySelectorAll('#quick-picks .chip')) {
    chip.setAttribute('aria-current', chip.dataset.code === code ? 'true' : 'false');
  }
}

function selectTown(code) {
  const town = towns.find((t) => t.code === code);
  if (!town) return;
  mainCode = code;
  searchInput.value = town.name;
  closeResults();
  statusBox.hidden = true;
  markChip(code);
  syncSelects(prefSelect, townSelect, town);
  renderCard(town, cardMain);
  compareBox.hidden = false;
  document.title = `${town.name}のステータス | ${BASE_TITLE}`;
  syncUrl();
}

function selectVs(code) {
  const town = towns.find((t) => t.code === code);
  if (!town) return;
  vsCode = code;
  syncSelects(vsPref, vsTown, town);
  renderCard(town, cardVs);
  cards.classList.add('has-vs');
  vsClear.hidden = false;
  syncUrl();
}

function clearVs() {
  vsCode = null;
  cardVs.hidden = true;
  cardVs.replaceChildren();
  cards.classList.remove('has-vs');
  vsClear.hidden = true;
  vsPref.value = '';
  fillTownOptions(vsTown, '');
  syncUrl();
}

function syncUrl() {
  const params = new URLSearchParams();
  if (mainCode) params.set('c', mainCode);
  if (vsCode) params.set('vs', vsCode);
  const query = params.toString();
  history.replaceState({}, '', query ? `${location.pathname}?${query}` : location.pathname);
}

function restoreFromUrl() {
  const params = new URLSearchParams(location.search);
  const c = params.get('c');
  const vs = params.get('vs');
  if (c && towns.some((t) => t.code === c)) {
    selectTown(c);
    if (vs && towns.some((t) => t.code === vs)) selectVs(vs);
  } else {
    showSample();
  }
}

loadData();
