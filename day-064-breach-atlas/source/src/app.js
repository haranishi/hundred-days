import './style.css';
import './globe.css';
import './clarity.css';
import { LESSONS, renderLearning } from './learning.js';
import { CAUSES, UNITS, REGIONS, REGISTRIES, STATUSES, SECTORS, DEFAULT_FILTERS, shortScale, shareUrl, relatedIncidents, companyCount } from './model.mjs';
import { decodeIndex } from './engine.mjs';
import { QueryClient } from './query-client.js';
import { LOCATIONS, GEO_BASIS, groupLocations, GLOBE_COLORS } from './geo-model.mjs';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const number = value => new Intl.NumberFormat('ja-JP').format(value);
const formatDate = value => value ? value.replaceAll('-', '.') : '日付の記載なし';
const PAGE_SIZE = 24, MAP_LIMIT = 120;
const filters = { ...DEFAULT_FILTERS };
const mobile = matchMedia('(max-width: 768px)'), reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let data, records = [], byId = new Map(), client, result, page = 0, view = 'globe', selectedId, graph, graphLoading, globe, globeLoading, playback;
let queryVersion = 0, noteVersion = 0, toastTimer, searchTimer, drawerOpener, geographicScope;
const detailCache = new Map();

async function start() {
  const params = new URL(location.href).searchParams;
  view = ['globe','timeline','compare','map','learn'].includes(params.get('view')) ? params.get('view') : params.has('incident') ? 'timeline' : 'globe';
  syncView();
  $('overview-charts').open = false;
  $('learning-content').innerHTML = renderLearning();
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/index.json`);
    if (!response.ok) throw new Error('Index unavailable');
    data = await response.json(); records = decodeIndex(data); byId = new Map(records.map(record => [record.id, record]));
    selectedId = byId.has(new URL(location.href).searchParams.get('incident')) ? new URL(location.href).searchParams.get('incident') : null;
    $('total-incidents').textContent = number(records.length); $('total-companies').textContent = number(companyCount(records));
    const years = records.map(record => record.year);
    $('year-range').innerHTML = `${Math.min(...years)}<span>–</span>${Math.max(...years)}`;
    $('as-of').textContent = formatDate(data.asOf); $('as-of').dateTime = data.asOf;
    $('footer-asof').textContent = `資料確認 ${formatDate(data.asOf)}`; $('footer-asof').dateTime = data.asOf;
    $('total-sources').textContent = number(data.sourceCount);
    $('cause').innerHTML = '<option value="all">すべての原因</option>' + Object.entries(CAUSES).map(([key, value]) => `<option value="${key}">${value.label}</option>`).join('');
    $('registry').innerHTML = Object.entries(REGISTRIES).map(([key, value]) => `<option value="${key}">${value}</option>`).join('');
    const geographicCodes = new Set(records.map(record => record.geoCode));
    const locationOptions = '<option value="all">すべての地域</option>' + Object.values(LOCATIONS).filter(location => geographicCodes.has(location.code)).map(location => `<option value="${location.code}">${escape(location.label)}</option>`).join('');
    $('location').innerHTML = $('globe-location').innerHTML = locationOptions;
    $('globe-year').min = Math.min(...years); $('globe-year').max = Math.max(...years);
    $('period').innerHTML = '<option value="all">すべての年</option><option value="recent">2025–2026年</option><option value="historical">2024年以前</option>' + [...new Set(years)].sort((a, b) => b - a).map(year => `<option value="${year}">${year}年</option>`).join('');
    $('unit-tabs').innerHTML = Object.entries(UNITS).map(([unit, config]) => `<button data-unit="${unit}" aria-pressed="false">${config.label}<span>—</span></button>`).join('');
    $('region-tabs').innerHTML = ['all', 'japan', 'us'].map(region => `<button data-region="${region}" aria-pressed="false">${region === 'all' ? '全地域' : region === 'japan' ? '日本' : '米国'}<span>—</span></button>`).join('');
    $('cause-legend').innerHTML = Object.entries(CAUSES).map(([cause, config]) => `<button data-cause="${cause}" style="--cause-color:${config.color}" aria-pressed="false"><i class="cause-dot" aria-hidden="true"></i>${config.short}</button>`).join('');
    renderCoverage(); bindEvents();
    client = new QueryClient(records); await client.start();
    document.documentElement.dataset.engine = client.mode;
    await runQuery(selectedId); document.documentElement.dataset.ready = 'true';
  } catch {
    view = 'timeline'; syncView();
    $('history-content').innerHTML = '<div class="startup-error"><h3>記録を読み込めませんでした。</h3><p>接続を確認し、もう一度お試しください。</p><button class="quiet-button" id="retry-load">再読み込み</button></div>';
    $('retry-load').addEventListener('click', () => location.reload());
    $('announcer').textContent = '公表記録を読み込めませんでした。再読み込みできます。';
  }
}
function order() { return view === 'compare' && !['all', 'unknown'].includes(filters.unit) ? 'scale' : $('sort').value === 'oldest' ? 'oldest' : 'date'; }
async function runQuery(preferredId = null) {
  if (!client) return;
  const version = ++queryVersion;
  $('timeline-view').setAttribute('aria-busy', 'true'); $('comparison-view').setAttribute('aria-busy', 'true');
  const response = await client.query({ ...filters }, order());
  if (version !== queryVersion) return;
  result = response.result;
  document.documentElement.dataset.engine = response.mode;
  document.documentElement.dataset.queryMs = response.elapsed.toFixed(3);
  const position = preferredId ? result.indices.findIndex(index => records[index].id === preferredId) : -1;
  page = position >= 0 ? Math.floor(position / PAGE_SIZE) : 0;
  if (!result.indices.some(index => records[index].id === selectedId)) selectedId = null;
  if (!selectedId && result.count) selectedId = records[result.indices[0]].id;
  renderControls(); renderPage(); renderNote();
  $('timeline-view').setAttribute('aria-busy', 'false'); $('comparison-view').setAttribute('aria-busy', 'false');
  $('announcer').textContent = `${number(result.count)}記録が見つかりました。${REGIONS[filters.region]}。`;
  if (view === 'map') await updateGraph();
  if (view === 'globe') await updateGlobe();
}
function visiblePage() { return result.indices.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(index => records[index]); }
function renderControls() {
  const focusedChip = document.activeElement.closest('#active-filters [data-clear-filter]')?.dataset.clearFilter;
  for (const field of ['cause', 'period', 'status', 'registry', 'location']) $(field).value = filters[field];
  $('globe-location').value = filters.location;
  $('search').value = filters.query;
  $('quick-search').value = filters.query;
  $('clear-search').hidden = !filters.query;
  Object.keys(UNITS).forEach((unit, index) => {
    const button = $('unit-tabs').querySelector(`[data-unit="${unit}"]`);
    button.setAttribute('aria-pressed', String(unit === filters.unit)); button.querySelector('span').textContent = number(result.units[index]);
    button.setAttribute('aria-label', `${UNITS[unit].label}、条件に合う${number(result.units[index])}記録`);
  });
  ['all', 'japan', 'us'].forEach((region, index) => {
    const button = $('region-tabs').querySelector(`[data-region="${region}"]`);
    button.setAttribute('aria-pressed', String(region === filters.region)); button.querySelector('span').textContent = number(result.regions[index]);
  });
  $('list-count').textContent = `${number(result.count)}記録`;
  $('visible-count').textContent = `${number(result.count)}記録 · ${number(result.companies)}組織`;
  $('list-subtitle').textContent = view === 'compare' && order() === 'scale' ? '同じ単位の規模順 · 現在のページ' : `記録の日付が${$('sort').value === 'oldest' ? '古い' : '新しい'}順 · 現在のページ`;
  $('unit-note').textContent = filters.unit === 'all' ? '全ての単位を表示。異なる単位の数字は合計・順位付けしません。' : `${UNITS[filters.unit].description}の記録を表示。別事故・別の届出の人数は合算しません。`;
  const active = [];
  if (filters.region !== 'all') active.push(['region', REGIONS[filters.region]]);
  if (filters.registry !== 'all') active.push(['registry', REGISTRIES[filters.registry]]);
  if (filters.location !== 'all') active.push(['location', LOCATIONS[filters.location]?.label || filters.location]);
  if (filters.query) active.push(['query', `検索「${filters.query}」`]);
  if (filters.unit !== 'all') active.push(['unit', UNITS[filters.unit].label]);
  if (filters.cause !== 'all') active.push(['cause', CAUSES[filters.cause].short]);
  if (filters.period !== 'all') active.push(['period', filters.period === 'recent' ? '2025–2026年' : filters.period === 'historical' ? '2024年以前' : `${filters.period}年`]);
  if (filters.status !== 'all') active.push(['status', STATUSES[filters.status]]);
  $('active-filters').innerHTML = active.length ? active.map(([key, label]) => `<button class="filter-chip" data-clear-filter="${key}" aria-label="${escape(label)}の条件を解除">${escape(label)}<span aria-hidden="true">×</span></button>`).join('') + '<button class="text-button" data-reset-all="true">すべて解除</button>' : `<span>${view === 'globe' ? '光点や地域を選んで記録を絞り込みます。位置は地域の代表点です。' : 'すべての公表記録を表示。カードを選ぶと詳細と出典が開きます。'}</span>`;
  if (focusedChip) ($('active-filters').querySelector(`[data-clear-filter="${focusedChip}"]`) || $('active-filters').querySelector('button') || $('quick-search')).focus({ preventScroll: true });
  renderCharts();
  const empty = result.count === 0; $('list-empty').hidden = !empty; $('company-list').hidden = empty;
  const alternatives = Object.keys(UNITS).filter((unit, index) => unit !== filters.unit && result.units[index] > 0);
  $('other-units').textContent = alternatives.length ? '別の単位に条件に合う記録があります。' : '検索語や絞り込み条件を変えてみてください。';
  $('other-unit-buttons').innerHTML = alternatives.map(unit => `<button class="quiet-button" data-unit="${unit}">${UNITS[unit].label}で見る →</button>`).join('');
  $('graph-empty').hidden = !empty;
  $('globe-empty').hidden = !empty;
  $('globe-year-label').textContent = /^\d{4}$/.test(filters.period) ? `${filters.period}年` : filters.period === 'all' ? '全期間' : filters.period === 'recent' ? '2025–2026年' : '2024年以前';
  if (/^\d{4}$/.test(filters.period)) $('globe-year').value = filters.period;
  else if (filters.period === 'all') $('globe-year').value = $('globe-year').max;
  $('globe-year').setAttribute('aria-valuetext', $('globe-year-label').textContent);
  $('globe-definition').textContent = filters.location !== 'all' ? `${LOCATIONS[filters.location].label}の代表点を表示。地域の根拠は各記録に併記しています。事故地点・攻撃元の位置ではありません。` : '光点は地域の代表点です。資料の関連地域を集約し、事故地点・攻撃経路は示しません。年代再生は過去の公表記録です。';
}
function renderCharts() {
  const focused = document.activeElement;
  const focusedYear = focused.closest('#year-chart') ? focused.dataset.year : null;
  const focusedCause = focused.closest('#cause-chart') ? focused.dataset.cause : null;
  const first = Math.min(...records.map(record => record.year)), last = Math.max(...records.map(record => record.year));
  const maximum = Math.max(1, ...result.years.slice(first - 1900, last - 1900 + 1));
  const scroll = $('year-chart').parentElement.scrollLeft;
  $('year-chart').innerHTML = Array.from({ length: last - first + 1 }, (_, offset) => {
    const year = first + offset, count = result.years[year - 1900];
    return `<button class="year-column${count === maximum ? ' is-peak' : ''}" data-year="${year}" style="--bar-height:${count ? count / maximum * 76 : 0}px" aria-pressed="${filters.period === String(year)}" aria-label="${year}年、${number(count)}記録で絞り込み"><span class="year-count">${count ? number(count) : '—'}</span><span class="year-bar" aria-hidden="true"></span><span class="year-label">${year}</span></button>`;
  }).join('');
  $('year-chart').parentElement.scrollLeft = scroll;
  const maxCause = Math.max(1, ...result.causes);
  $('cause-chart').innerHTML = Object.entries(CAUSES).map(([cause, config], index) => `<button class="cause-row" data-cause="${cause}" aria-pressed="${filters.cause === cause}" aria-label="${config.label}、${number(result.causes[index])}記録で絞り込み" style="--cause-color:${config.color};--cause-width:${result.causes[index] / maxCause * 100}%"><span class="cause-name"><i class="cause-dot" aria-hidden="true"></i>${config.short}</span><span class="cause-track"><span class="cause-fill"></span></span><span class="cause-count">${number(result.causes[index])}</span></button>`).join('');
  if (focusedYear) $('year-chart').querySelector(`[data-year="${focusedYear}"]`)?.focus({ preventScroll: true });
  if (focusedCause) $('cause-chart').querySelector(`[data-cause="${focusedCause}"]`)?.focus({ preventScroll: true });
  $('cause-legend').querySelectorAll('[data-cause]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.cause === filters.cause)));
}
const sourceLabel = record => record.registry === 'hhs' ? '米国 / HHS' : record.registry === 'california' ? '米国 / CA通知' : record.sourceKind === 'municipal-disclosure' ? '日本 / 自治体公表' : record.sourceKind === 'news-index' ? '日本 / 報道一覧' : record.sourceKind === 'official-notice-archive' ? '日本 / 公表アーカイブ' : '日本 / 公表事例';
const statusNotes = { confirmed: '資料で流出・公開等の確認あり', possible: '可能性・紛失等を含む · 全数の流出確認ではない', reported: '当局への届出 · 組織の報告に基づく', notice: '公表・報道の記録 · 流出の有無は原資料を参照' };
const statusMarkup = record => `<span class="status-indicator ${record.status}">${STATUSES[record.status]}</span>`;
function renderPage() {
  const items = visiblePage(), start = page * PAGE_SIZE, last = Math.min(result.count, start + PAGE_SIZE);
  $('globe-records').innerHTML = items.map(record => `<button class="globe-record" data-incident-id="${escape(record.id)}" aria-current="${record.id === selectedId}" style="--point-color:${GLOBE_COLORS[record.cause]}"><span class="globe-record-dot" aria-hidden="true"></span><strong>${escape(record.shortName)}</strong><time>${formatDate(record.announcedAt)}</time><span>${escape(shortScale(record.scale))}</span><span aria-hidden="true">↗</span></button>`).join('') || '<p class="globe-record-empty">条件に合う記録がありません。</p>';
  $('globe-record-count').textContent = result.count ? `${number(start + 1)}–${number(last)} / ${number(result.count)}` : '0記録';
  $('company-list').innerHTML = items.map((record, index) => `<li><button class="company-item" data-incident-id="${escape(record.id)}" aria-current="${record.id === selectedId}" style="--cause-color:${CAUSES[record.cause].color}"><span class="company-rank">${number(start + index + 1)}</span><span><span class="company-title"><i class="cause-dot" aria-hidden="true"></i>${escape(record.shortName)}</span><span class="company-scale">${escape(shortScale(record.scale))}<span class="company-year">${record.year}</span></span></span></button></li>`).join('');
  $('timeline-description').textContent = `記録の日付で並べる · ${number(start + (result.count ? 1 : 0))}–${number(last)}記録`;
  let previousYear = null;
  $('history-content').innerHTML = items.length ? items.map(record => {
    const heading = previousYear !== record.year ? `<h3 class="year-heading">${record.year}<small>年の記録</small></h3>` : '';
    previousYear = record.year;
    const context = record.registry === 'california' ? '州への通知記録。人数・原因は台帳に未記載。' : record.registry === 'hhs' ? '医療情報の侵害に関する届出。人数は組織の報告値。' : '国内の公表・報道記録。数字と確認状態は詳細へ。';
    return `${heading}<div class="incident-cards"><button class="incident-card" data-incident-id="${escape(record.id)}" aria-current="${record.id === selectedId}" style="--cause-color:${CAUSES[record.cause].color}"><span class="card-top"><time class="card-date" datetime="${record.announcedAt}">${formatDate(record.announcedAt)}</time><span class="source-kind">${sourceLabel(record)}</span></span><span class="card-main"><strong class="card-company">${escape(record.shortName)}</strong><span class="card-scale">${escape(shortScale(record.scale))}</span></span><span class="card-summary">${context}</span><span class="card-foot"><span class="cause-tag"><i class="cause-dot" aria-hidden="true"></i>${CAUSES[record.cause].short}</span>${statusMarkup(record)}<span class="card-action">記録・出典を読む ↗</span></span></button></div>`;
  }).join('') : '<div class="history-empty"><h3>条件に合う記録がありません</h3><p>検索語や地域・年代の条件を変えてみてください。</p><button class="quiet-button" data-reset-all="true">条件をすべて解除</button></div>';
  renderComparison(items);
  $('page-range').textContent = result.count ? `${number(start + 1)}–${number(last)} / ${number(result.count)}` : '0 / 0';
  $('page-first').disabled = $('page-prev').disabled = page === 0;
  $('page-next').disabled = $('page-last').disabled = last >= result.count;
  $('pagination').hidden = view === 'map' || view === 'learn';
  $('company-list').scrollTop = 0;
  if (view === 'timeline') $('history-content').scrollTop = 0;
  if (view === 'compare') $('comparison-content').scrollTop = 0;
}
function renderComparison(items) {
  if (['all', 'unknown'].includes(filters.unit)) {
    $('comparison-description').textContent = '比較する単位を選んでください';
    $('comparison-content').innerHTML = `<div class="compare-empty"><h3>同じ単位の数字で比べる。</h3><p>「件」「人」「ID」は異なる数字です。規模が公表された単位を一つ選ぶと、数字に比例した棒グラフを表示します。</p>${['records', 'people', 'accounts'].map(unit => `<button class="quiet-button" data-unit="${unit}">${UNITS[unit].label}で比べる →</button>`).join('')}</div>`;
    return;
  }
  $('comparison-description').textContent = `${UNITS[filters.unit].description}だけを、規模の大きい順で比較`;
  const maximum = records[result.indices[0]]?.scale.value || 1;
  $('comparison-content').innerHTML = items.length ? items.map((record, index) => `<button class="compare-row" data-incident-id="${escape(record.id)}" aria-current="${record.id === selectedId}" style="--cause-color:${CAUSES[record.cause].color};--scale-width:${record.scale.value / maximum * 100}%"><span class="compare-top"><span class="compare-rank">${number(page * PAGE_SIZE + index + 1)}</span><strong class="compare-company">${escape(record.shortName)}</strong><span class="compare-scale">${escape(shortScale(record.scale))}</span></span><span class="compare-track"><span class="compare-fill"></span></span><span class="compare-meta"><span>${record.year}年</span><span>${CAUSES[record.cause].short}</span><span>${STATUSES[record.status]}</span></span></button>`).join('') : '<p class="history-empty">この単位の記録はありません。</p>';
}
function syncView() {
  document.documentElement.dataset.view = view;
  document.querySelector('.workspace').dataset.view = view;
  for (const name of ['globe', 'timeline', 'compare', 'map', 'learn']) {
    $(name === 'compare' ? 'comparison-view' : name === 'learn' ? 'learning-view' : `${name}-view`).hidden = view !== name;
    $(`view-${name}`).setAttribute('aria-pressed', String(view === name));
  }
  $('map-title').textContent = view === 'globe' ? '地域から公表記録を探す' : view === 'timeline' ? '公表記録を読む' : view === 'compare' ? '同じ単位で規模を比べる' : view === 'learn' ? '事例から備えを学ぶ' : '共通の原因でつながる記録';
  $('analysis-menu').dataset.active = String(['compare','map'].includes(view));
}
async function changeView(nextView) {
  if (!['globe','timeline','compare','map','learn'].includes(nextView)) return;
  if (nextView !== 'globe') stopPlayback();
  view = nextView; syncView();
  const analysisFocused = $('analysis-menu').contains(document.activeElement);
  $('analysis-menu').open = false;
  if (analysisFocused) $('analysis-menu').querySelector('summary').focus({ preventScroll: true });
  await runQuery(selectedId);
}
function globeUnavailable() {
  $('globe-3d').disabled = true;
  $('globe-3d').setAttribute('aria-pressed','false'); $('globe-2d').setAttribute('aria-pressed','true');
  $('globe-hint').textContent = '3Dを利用できないため平面表示です。地域・検索・出典は引き続き使えます。';
}
async function updateGlobe() {
  if (view !== 'globe') return;
  try {
    if (!globeLoading) globeLoading = Promise.all([import('./globe.js'), fetch(`${import.meta.env.BASE_URL}data/map-land.json`).then(response => { if (!response.ok) throw new Error('Map unavailable'); return response.json(); })]).then(([module, land]) => {
      globe = new module.BreachGlobe($('globe-stage'), $('globe-mount'), $('globe-labels'), land, selectLocation, globeUnavailable);
      if (!globe.available3D) globeUnavailable(); return globe;
    }).catch(error => { globeLoading = null; throw error; });
    await globeLoading;
    if (view !== 'globe') return;
    $('globe-error').hidden = true;
    const groups = groupLocations(records, result.indices);
    const countryOnly = groups.filter(group => group.level === 'country').reduce((sum, group) => sum + group.count, 0);
    $('globe-summary').textContent = `${number(result.count)}記録 / ${groups.length}地域 · 国単位 ${number(countryOnly)}`;
    $('globe-causes').innerHTML = Object.entries(CAUSES).map(([cause, config], index) => `<button data-cause="${cause}" aria-pressed="${filters.cause === cause}" style="--point-color:${GLOBE_COLORS[cause]}"><i aria-hidden="true"></i>${config.short}<span>${number(result.causes[index])}</span></button>`).join('');
    globe.setData(groups); globe.select(byId.get(selectedId)?.geoCode); globe.resize();
    const scope = [filters.query, filters.region, filters.registry, filters.location].join('|');
    if (geographicScope !== scope) {
      geographicScope = scope;
      if (filters.location !== 'all') globe.focus(filters.location, true);
      else if (groups.length === 1) globe.focus(groups[0].code, true);
      else if (filters.region !== 'all') globe.focus(filters.region === 'japan' ? 'JP' : 'US', false);
      else if (filters.query && groups.length && groups.every(group => group.country === groups[0].country)) globe.focus(groups[0].country, false);
      else globe.fit();
    }
  } catch {
    $('globe-error').hidden = false;
    $('globe-error').innerHTML = '地形を読み込めませんでした。検索と記録一覧は利用できます。<button class="quiet-button" id="retry-globe">地図を再読み込み</button>';
    $('retry-globe').addEventListener('click', updateGlobe);
  }
}
async function selectLocation(code) {
  if (!LOCATIONS[code]) return;
  stopPlayback(); await setFilter('location', code); globe?.focus(code, true);
  $('globe-definition').textContent = `${LOCATIONS[code].label}の代表点を表示。地域の根拠は各記録に併記しています。事故地点・攻撃元の位置ではありません。`;
}
function stopPlayback() {
  clearTimeout(playback); playback = null;
  $('globe-play').setAttribute('aria-pressed','false'); $('globe-play').textContent = '▷ 年代を再生';
}
async function playYears() {
  if (playback) { stopPlayback(); return; }
  let year = /^\d{4}$/.test(filters.period) ? Number(filters.period) + 1 : Number($('globe-year').min);
  if (year > Number($('globe-year').max)) year = Number($('globe-year').min);
  $('globe-play').setAttribute('aria-pressed','true'); $('globe-play').textContent = 'Ⅱ 再生を止める';
  const advance = async () => {
    playback = -1;
    await setFilter('period', String(year));
    if (!playback || view !== 'globe') return;
    year++;
    if (year > Number($('globe-year').max)) { stopPlayback(); return; }
    playback = setTimeout(advance, 1300);
  };
  await advance();
}
async function updateGraph() {
  if (view !== 'map') return;
  if (!graphLoading) graphLoading = import('./graph.js').then(({ BreachGraph }) => {
    graph = new BreachGraph($('graph-stage'), $('graph-mount'), $('graph-labels'), id => selectIncident(id, true), unavailable3D);
    if (!graph.available3D) unavailable3D(); return graph;
  });
  await graphLoading;
  if (view !== 'map') return;
  const latest = [...result.indices].sort((a, b) => records[b].announcedAt.localeCompare(records[a].announcedAt) || a - b).slice(0, MAP_LIMIT).map(index => records[index]);
  if (selectedId && !latest.some(record => record.id === selectedId) && result.indices.some(index => records[index].id === selectedId)) {
    if (latest.length >= MAP_LIMIT) latest.pop(); latest.push(byId.get(selectedId));
  }
  $('map-scale-note').textContent = `${number(latest.length)} / ${number(result.count)}記録を描画（最新120件まで）。${filters.unit === 'all' || filters.unit === 'unknown' ? '球は同じ大きさ。' : '球の大きさは対数尺度。'}`;
  graph.setData(latest, ['all', 'unknown'].includes(filters.unit)); graph.select(selectedId); updateInstruction();
}
function unavailable3D() {
  $('graph-fallback').hidden = false; $('mode-3d').disabled = true;
  $('mode-3d').setAttribute('aria-pressed', 'false'); $('mode-2d').setAttribute('aria-pressed', 'true'); updateInstruction();
}
function updateInstruction() {
  if (!graph) return;
  $('graph-instruction').textContent = `ドラッグで${graph.mode === '3d' ? '回転' : '移動'} · ${mobile.matches ? 'ピンチ' : 'スクロール'}で拡大 · 記録を選択`;
}
async function loadDetail(record) {
  const chunk = Math.floor(record.index / data.chunkSize);
  if (!detailCache.has(chunk)) detailCache.set(chunk, fetch(`${import.meta.env.BASE_URL}data/details/${chunk}.json`).then(response => { if (!response.ok) throw new Error('Detail unavailable'); return response.json(); }).catch(error => { detailCache.delete(chunk); throw error; }));
  const items = await detailCache.get(chunk), detail = items.find(item => item.id === record.id);
  if (!detail) throw new Error('Detail/index mismatch'); return detail;
}
async function renderNote() {
  const version = ++noteVersion, record = byId.get(selectedId);
  $('note-index').textContent = record ? `${record.year} / ${sourceLabel(record)}` : '記録を選択';
  document.querySelectorAll('[data-incident-id]').forEach(button => button.setAttribute('aria-current', String(button.dataset.incidentId === selectedId)));
  graph?.select(selectedId);
  globe?.select(record?.geoCode);
  if (!record) { $('note-content').innerHTML = '<div class="note-unselected"><p class="eyebrow">FOLLOW THE RECORD</p><h3>記録から、<br>経緯と出典をたどる。</h3><p>カードや一覧を選ぶと、公表規模・対象範囲・数字の注意・原資料を読めます。</p></div>'; return; }
  $('note-content').innerHTML = `<div class="note-unselected"><h3>${escape(record.shortName)}</h3><p role="status">記録の詳細を読み込み中…</p></div>`;
  try {
    const incident = await loadDetail(record);
    if (version !== noteVersion) return;
    const cause = CAUSES[incident.cause], link = shareUrl(location.href, incident.id, records);
    const sameCompany = relatedIncidents(records, record);
    const dateLabel = incident.dateKind === 'mixed' ? '一覧に記載された日付（公表・発生・報道）' : incident.dateKind === 'reported' ? incident.registry === 'japan' ? '報道時期' : '当局への届出日' : '公表日';
    const sourceAction = incident.sourceKind === 'news-index' ? '参照記事・一覧を開く' : '原資料を開く';
    const confirmationNote = incident.noticeDetails?.outcome === 'not-leaked' ? '最終報で個人情報等の流出なしと公表' : incident.noticeDetails?.outcome === 'not-confirmed' ? '公表時点で情報流出は未確認' : statusNotes[incident.status];
    const municipal = incident.municipalDetails;
    const credit = incident.sourceKind === 'news-index' ? '出典・著作権：サイバーセキュリティ.com。組織名・記載日等の事実を本アプリが整理しています。'
      : incident.sources.some(source => new URL(source.url).hostname === 'www.ppc.go.jp') ? '出典：個人情報保護委員会の掲載資料。事実を本アプリが整理・加工して作成しています。'
      : incident.sources.some(source => new URL(source.url).hostname === 'www.ipa.go.jp') ? '出典：IPAの掲載資料。事実を本アプリが整理・加工して作成しています。' : '';
    const municipalDate = !municipal ? '' : `<div><dt>${municipal.publisher === '横浜市' ? '資料の報告を受けた日' : '資料の覚知日'}（発生日とは別）</dt><dd>${formatDate(municipal.receivedAt)}</dd></div>`;
    const municipalMarkup = !municipal ? '' : `<section class="note-section municipal-details"><h3>自治体の公表資料の掲載行</h3><dl class="record-details"><dt>所管課</dt><dd>${escape(municipal.department)}</dd><dt>掲載番号</dt><dd>No.${municipal.row}${municipal.page ? ` / ${municipal.page}ページ` : ''}</dd><dt>本アプリの整理区分</dt><dd>${escape(municipal.classification)}</dd></dl></section>`;
    const details = incident.registerDetails;
    const registerMarkup = !details ? '' : incident.registry === 'california' ? `<section class="note-section"><h3>台帳記載の発生日</h3><p>${escape(details.breachDates || '記載なし')}（米国表記 月/日/年）</p><p class="record-context">公表・届出日とは別です。範囲・複数日付は原表記を保っています。</p></section>` : `<section class="note-section"><h3>届出の分類</h3><dl class="record-details"><dt>侵害の分類（原表記）</dt><dd>${escape(details.breachType || '未記載')}</dd><dt>情報の保管場所（原表記）</dt><dd>${escape(details.location || '未記載')}</dd><dt>台帳の区分</dt><dd>${details.reviewState === 'investigation' ? '調査中 / Under Investigation' : 'アーカイブ / Archive'}</dd></dl></section>`;
    $('note-content').innerHTML = `<article style="--cause-color:${cause.color}"><div class="note-meta"><span class="cause-tag"><i class="cause-dot" aria-hidden="true"></i>${cause.short}</span><span>${escape(SECTORS[incident.sector] || 'その他')}</span></div><h3 class="note-company">${escape(incident.shortName)}</h3>${incident.shortName !== incident.company ? `<p class="note-fullname">${escape(incident.company)}</p>` : ''}<span class="record-context">${sourceLabel(incident)}</span><a class="source-shortcut" href="${escape(incident.sources[0].url)}" target="_blank" rel="noopener noreferrer" aria-label="${sourceAction}：${escape(incident.sources[0].title)}"><span>${sourceAction}</span><span aria-hidden="true">↗</span></a><section class="note-section note-summary"><h3>何が公表されたか</h3><p>${escape(incident.summary)}</p></section><div class="note-scale-block"><p class="note-scale-caption">${incident.scale.value === null ? '公表された規模' : `公表規模 / ${UNITS[incident.scale.unit].description}`}</p><p class="note-scale ${incident.scale.value === null ? 'no-total' : ''}">${escape(shortScale(incident.scale))}</p><p class="note-scale-exact">${escape(incident.scale.label)}</p><span class="status-badge ${incident.status}">${escape(confirmationNote)}</span></div><dl class="note-dates"><div><dt>${dateLabel}</dt><dd>${formatDate(incident.announcedAt)}${incident.datePrecision === 'month' ? '（月単位）' : ''}</dd></div>${municipalDate}${incident.sourceUpdatedAt ? `<div><dt>反映した続報・更新</dt><dd>${formatDate(incident.sourceUpdatedAt)}</dd></div>` : ''}</dl><section class="note-learning"><p>公表された原因から、一般的な備えを考える</p><button class="text-button" data-learn-cause="${incident.cause}">${escape(LESSONS.find(lesson => lesson.cause === incident.cause)?.title || '資料を確かめて、備えを考える')} →</button></section><details class="note-extra"><summary>対象範囲・数字・資料を詳しく読む</summary>${registerMarkup}${municipalMarkup}<section class="note-section"><h3>対象となった情報</h3><ul class="info-tags">${incident.informationTypes.map(type => `<li>${escape(type)}</li>`).join('')}</ul></section><section class="note-section"><h3>対象範囲</h3><p>${escape(incident.scopeNote)}</p></section><section class="note-section count-note"><h3>数字を読むときの注意</h3><p>${escape(incident.countNote)}</p></section><section class="note-section"><h3>資料・参照リンク <span class="source-count">/ ${incident.sources.length}</span></h3><div class="source-list">${incident.sources.map(source => `<a class="source-link" href="${escape(source.url)}" target="_blank" rel="noopener noreferrer"><span>${escape(source.title)}</span><span aria-hidden="true">↗</span><small>${escape(new URL(source.url).hostname)}${source.publishedAt ? ` · ${formatDate(source.publishedAt)}` : ''}</small></a>`).join('')}</div></section></details>${sameCompany.length ? `<section class="note-section other-incidents"><h3>同じ名称の別記録（合算しません）</h3>${sameCompany.slice(0, 24).map(other => `<button data-other-id="${escape(other.id)}">${formatDate(other.announcedAt)} · ${escape(shortScale(other.scale))} →</button>`).join('')}${sameCompany.length > 24 ? `<p>${sameCompany.length}記録あります。企業名検索で全てを確認できます。</p>` : ''}</section>` : ''}<section class="share-section"><p>この公表記録へのリンクを共有</p><div class="share-actions"><button id="native-share">共有</button><button id="copy-link">リンクをコピー</button></div></section></article>`;
    const geographicNote = document.createElement('section'); geographicNote.className = 'note-section geographic-note';
    const geoTitle = document.createElement('h3'); geoTitle.textContent = '地図に表示する関連地域';
    const geoLabel = document.createElement('p'); geoLabel.textContent = LOCATIONS[incident.geoCode]?.label || '地域未特定';
    const geoContext = document.createElement('p'); geoContext.className = 'record-context'; geoContext.textContent = `${GEO_BASIS[incident.geoBasis] || GEO_BASIS['country-only']}。地域の代表点で、実際の事故地点・サーバー位置ではありません。`;
    geographicNote.append(geoTitle, geoLabel, geoContext); $('note-content').querySelector('.note-extra summary').after(geographicNote);
    $('note-content').scrollTop = 0;
    if (credit) {
      const attribution = document.createElement('p'); attribution.className = 'record-context source-credit'; attribution.textContent = credit;
      $('note-content').querySelector('.note-summary').append(attribution);
    }
    $('copy-link').addEventListener('click', () => copyLink(link));
    $('native-share').addEventListener('click', async () => {
      if (!navigator.share) { openCopyDialog(link); return; }
      try { await navigator.share({ title: '漏洩の地図', text: `${incident.shortName}の公表記録と原資料`, url: link }); }
      catch (error) { if (error.name !== 'AbortError') openCopyDialog(link); }
    });
  } catch {
    if (version !== noteVersion) return;
    $('note-content').innerHTML = `<div class="note-unselected"><h3>${escape(record.shortName)}</h3><p>詳細を読み込めませんでした。</p><button class="quiet-button" id="retry-detail">もう一度読み込む</button></div>`;
    $('retry-detail').addEventListener('click', renderNote);
  }
}
function selectIncident(id, moveToNote = false) {
  if (!byId.has(id) || !result.indices.some(index => records[index].id === id)) return;
  selectedId = id; history.replaceState(null, '', shareUrl(location.href, selectedId, records)); renderNote();
  const wasDrawer = $('explorer').classList.contains('drawer-open'); if (wasDrawer) closeDrawer();
  if (mobile.matches && (moveToNote || wasDrawer)) $('company-note').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
  $('announcer').textContent = `${byId.get(id).shortName}の記録と出典を開きました。`;
}
function resetFilters() {
  stopPlayback();
  clearTimeout(searchTimer); Object.assign(filters, DEFAULT_FILTERS); selectedId = null;
  history.replaceState(null, '', shareUrl(location.href, null, records)); runQuery();
}
function setFilter(key, value) {
  clearTimeout(searchTimer);
  filters[key] = value;
  if (key === 'region') { filters.registry = 'all'; filters.location = 'all'; }
  if (key === 'registry' && value !== 'all') { filters.region = value === 'japan' ? 'japan' : 'us'; filters.location = 'all'; }
  if (key === 'location' && value !== 'all') { filters.region = LOCATIONS[value]?.country === 'JP' ? 'japan' : 'us'; if (filters.registry === 'japan' && filters.region !== 'japan' || filters.registry !== 'all' && filters.registry !== 'japan' && filters.region === 'japan') filters.registry = 'all'; }
  return runQuery();
}
function renderCoverage() {
  $('coverage-explanation').textContent = data.coverage.explanation;
  const groups = [...new Set(data.coverage.reports.map(report => report.publisher))];
  $('coverage-content').innerHTML = groups.map(publisher => {
    const reports = data.coverage.reports.filter(report => report.publisher === publisher);
    return `<h3 class="coverage-heading">${escape(publisher)}<small>${reports.length}資料</small></h3><div class="coverage-table-wrap"><table class="coverage-table"><thead><tr><th>参照資料</th><th>掲載行</th><th>新規収録</th><th>重複・除外等</th></tr></thead><tbody>${reports.map(report => `<tr><td><a href="${escape(report.sourceUrl || report.url)}" target="_blank" rel="noopener noreferrer">${escape(report.title || `${report.fiscalYear || report.year}年の報告`)} ↗</a><span class="coverage-status">${escape(report.selection || report.scope || (report.registry ? '公開台帳の全掲載行を確認' : ''))}</span></td><td>${number(report.tableRows ?? report.sourceRows ?? 0)}</td><td>${number(report.included ?? report.imported ?? report.added ?? report.newIncidents ?? 0)}</td><td>${number((report.excluded ?? 0) + (report.duplicate ?? 0) + (report['merged-existing'] ?? 0))}</td></tr>`).join('')}</tbody></table></div>`;
  }).join('') + `<div class="coverage-gaps"><h3>収録範囲と未収録</h3><ul><li>日本の公表・報道記録${number(records.filter(record => record.region === 'japan').length)}件。米国政府の届出記録${number(records.filter(record => record.region === 'us').length)}件。世界中の全事故の一覧ではありません。</li><li>CA台帳5,350行、HHS調査中754行・アーカイブ7,261行を確認。全列一致の重複14行と通知元空欄2行を除外しました。</li><li>海外台帳間の同一事故や委託元・委託先の別届出は残ります。記録数・人数を独立した事故数・被害総人数として合計しません。</li>${data.coverage.gaps.map(gap => `<li>${escape(gap)}</li>`).join('')}</ul></div>`;

}
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3200); }
async function copyLink(link) { try { if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(link); toast('記録へのリンクをコピーしました'); } catch { openCopyDialog(link); } }
function openCopyDialog(link) { $('share-link').value = link; $('share-dialog').showModal(); $('share-link').focus(); $('share-link').select(); }
const drawerBackground = () => document.querySelectorAll('.masthead,.overview,.scope-bar,.unit-bar,.map-panel,.company-note,.page-footer');
function openDrawer() {
  drawerOpener = document.activeElement; $('explorer').classList.add('drawer-open'); $('explorer').setAttribute('role', 'dialog'); $('explorer').setAttribute('aria-modal', 'true');
  $('drawer-backdrop').hidden = false; $('open-explorer').setAttribute('aria-expanded', 'true'); drawerBackground().forEach(element => { element.inert = true; }); document.body.style.overflow = 'hidden'; $('search').focus();
}
function closeDrawer() {
  $('explorer').classList.remove('drawer-open'); $('explorer').removeAttribute('role'); $('explorer').removeAttribute('aria-modal'); $('drawer-backdrop').hidden = true;
  $('open-explorer').setAttribute('aria-expanded', 'false'); drawerBackground().forEach(element => { element.inert = false; }); document.body.style.overflow = ''; drawerOpener?.focus();
}
function bindEvents() {
  const searchInput = event => {
    if (view === 'learn') { Object.assign(filters, DEFAULT_FILTERS); selectedId = null; }
    filters.query = event.target.value;
    for (const id of ['search', 'quick-search']) if ($(id) !== event.target) $(id).value = filters.query;
    $('clear-search').hidden = !filters.query;
    clearTimeout(searchTimer); searchTimer = setTimeout(() => view === 'learn' ? changeView('timeline') : runQuery(), 90);
  };
  $('search').addEventListener('input', searchInput);
  $('quick-search').addEventListener('input', searchInput);
  const revealResults = () => { document.querySelector('.map-panel').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' }); };
  $('quick-search-form').addEventListener('submit', async event => { event.preventDefault(); clearTimeout(searchTimer); await (view === 'learn' ? changeView('timeline') : runQuery()); revealResults(); });
  $('clear-search').addEventListener('click', () => { setFilter('query', ''); $('quick-search').focus(); });
  for (const field of ['cause', 'period', 'status', 'registry', 'location']) $(field).addEventListener('change', event => { stopPlayback(); setFilter(field, event.target.value); });
  $('globe-location').addEventListener('change', event => event.target.value === 'all' ? setFilter('location', 'all') : selectLocation(event.target.value));
  $('globe-year').addEventListener('input', event => { stopPlayback(); setFilter('period', event.target.value); });
  $('globe-all-years').addEventListener('click', () => { stopPlayback(); setFilter('period', 'all'); });
  $('globe-play').addEventListener('click', playYears);
  for (const mode of ['3d','2d']) $(`globe-${mode}`).addEventListener('click', () => {
    globe?.setMode(mode);
    $('globe-3d').setAttribute('aria-pressed', String(globe?.mode === '3d')); $('globe-2d').setAttribute('aria-pressed', String(globe?.mode === '2d'));
    if (globe?.available3D) $('globe-hint').textContent = globe.mode === '2d' ? 'ドラッグで移動 · 光点で地域を選択' : 'ドラッグで回転 · 光点で地域を選択';
  });
  $('globe-zoom-in').addEventListener('click', () => globe?.zoom(1.2));
  $('globe-zoom-out').addEventListener('click', () => globe?.zoom(1 / 1.2));
  $('globe-fit').addEventListener('click', () => globe?.fit());
  $('sort').addEventListener('change', () => runQuery(selectedId));
  document.addEventListener('click', async event => {
    const target = event.target.closest('button'); if (!target) return;
    if (target.dataset.clearFilter) {
      const keyboard = event.detail === 0;
      await setFilter(target.dataset.clearFilter, target.dataset.clearFilter === 'query' ? '' : 'all');
      if (keyboard) ($('active-filters').querySelector('button') || $('quick-search')).focus();
    }
    else if (target.dataset.resetAll) resetFilters();
    else if (target.id === 'show-japan-intrusions') {
      clearTimeout(searchTimer); Object.assign(filters, DEFAULT_FILTERS, { region: 'japan', cause: 'intrusion' }); selectedId = null;
      history.replaceState(null, '', shareUrl(location.href, null, records)); await changeView('timeline'); revealResults();
    }
    else if (target.dataset.searchExample) {
      clearTimeout(searchTimer); Object.assign(filters, DEFAULT_FILTERS, { query: target.dataset.searchExample }); selectedId = null;
      history.replaceState(null, '', shareUrl(location.href, null, records)); await (view === 'learn' ? changeView('timeline') : runQuery()); revealResults();
    }
    else if (target.dataset.learnCause) {
      await changeView('learn');
      const card = $(`lesson-${target.dataset.learnCause}`);
      document.querySelectorAll('.lesson-card').forEach(element => delete element.dataset.highlight);
      if (card) card.dataset.highlight = 'true';
      const heading = card?.querySelector('h3') || $('learning-title');
      heading.tabIndex = -1; heading.focus({ preventScroll: true });
      (card || $('learning-title')).scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
    }
    else if (target.dataset.lessonRecords) {
      Object.assign(filters, DEFAULT_FILTERS, { region: 'japan', cause: target.dataset.lessonRecords }); selectedId = null;
      history.replaceState(null, '', shareUrl(location.href, null, records));
      await changeView('timeline'); revealResults(); $('map-title').focus({ preventScroll: true });
    }
    else if (target.dataset.unit) setFilter('unit', target.dataset.unit);
    else if (target.dataset.region) setFilter('region', target.dataset.region);
    else if (target.dataset.cause) setFilter('cause', filters.cause === target.dataset.cause ? 'all' : target.dataset.cause);
    else if (target.dataset.year) setFilter('period', filters.period === target.dataset.year ? 'all' : target.dataset.year);
    else if (target.dataset.view) changeView(target.dataset.view);
    else if (target.dataset.incidentId) selectIncident(target.dataset.incidentId, target.classList.contains('incident-card') || target.classList.contains('compare-row') || target.classList.contains('globe-record'));
    else if (target.dataset.otherId) { Object.assign(filters, DEFAULT_FILTERS); selectedId = target.dataset.otherId; filters.query = byId.get(selectedId).company; filters.region = byId.get(selectedId).region; history.replaceState(null, '', shareUrl(location.href, selectedId, records)); runQuery(selectedId); }
  });
  for (const id of ['reset-filters', 'empty-reset']) $(id).addEventListener('click', resetFilters);
  for (const [id, action] of Object.entries({ 'page-first': () => 0, 'page-prev': () => page - 1, 'page-next': () => page + 1, 'page-last': () => Math.ceil(result.count / PAGE_SIZE) - 1 })) $(id).addEventListener('click', () => {
    page = Math.max(0, Math.min(action(), Math.ceil(result.count / PAGE_SIZE) - 1));
    selectedId = visiblePage()[0]?.id || null; renderPage(); renderNote(); $('announcer').textContent = `${page + 1}ページ目を表示しました。`;
  });
  for (const mode of ['3d', '2d']) $(`mode-${mode}`).addEventListener('click', () => {
    graph?.setMode(mode); $('mode-3d').setAttribute('aria-pressed', String(graph?.mode === '3d')); $('mode-2d').setAttribute('aria-pressed', String(graph?.mode === '2d')); updateInstruction();
  });
  $('fit-map').addEventListener('click', () => graph?.fit());
  $('open-explorer').addEventListener('click', openDrawer); $('close-explorer').addEventListener('click', closeDrawer); $('drawer-backdrop').addEventListener('click', closeDrawer);
  $('apply-filters').addEventListener('click', () => { closeDrawer(); revealResults(); $('map-title').focus({ preventScroll: true }); });
  document.querySelector('.skip-link').addEventListener('click', event => { event.preventDefault(); revealResults(); $('map-title').focus({ preventScroll: true }); });
  $('back-to-records').addEventListener('click', () => { revealResults(); $('map-title').focus({ preventScroll: true }); });
  let showedYears = false;
  $('overview-charts').addEventListener('toggle', () => {
    if ($('overview-charts').open && mobile.matches && !showedYears) { $('year-chart').parentElement.scrollLeft = $('year-chart').scrollWidth; showedYears = true; }
  });
  mobile.addEventListener('change', () => { if (!mobile.matches && $('explorer').classList.contains('drawer-open')) closeDrawer(); updateInstruction(); });
  for (const id of ['open-coverage', 'open-method']) $(id).addEventListener('click', () => $(id === 'open-method' ? 'method-dialog' : 'coverage-dialog').showModal());
  document.querySelector('[data-open-coverage]').addEventListener('click', () => $('coverage-dialog').showModal());
  for (const kind of ['method', 'coverage']) for (const id of [`close-${kind}`, `${kind}-done`]) $(id).addEventListener('click', () => $(`${kind}-dialog`).close());
  $('close-share').addEventListener('click', () => $('share-dialog').close());
  document.addEventListener('keydown', event => {
    if ($('explorer').classList.contains('drawer-open')) {
      if (event.key === 'Escape') { event.preventDefault(); closeDrawer(); }
      if (event.key === 'Tab') {
        const focusable = [...$('explorer').querySelectorAll('button,input,select,a[href]')].filter(element => !element.disabled && element.getClientRects().length), first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); if (mobile.matches) openDrawer(); else $('quick-search').focus(); }
  });
}
start();
