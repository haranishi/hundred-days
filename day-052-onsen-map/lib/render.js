// 画面の描き分け。データから来る文字はすべて textContent で入れる（地図データの名前をHTMLとして読まない）。
// ボタンの押下は app.js が親要素でまとめて受ける（data-pref / data-type / data-id / data-open / data-remove）。

import { compactMetrics, metricOf, pillarColor, ranking } from './metrics.js';
import {
  TYPES, TYPE_COLORS, TYPE_LABELS, bathFacts, bathName, bathTotalText, emptyTypeHint, emptyTypeMessage, emptyTypes,
  formatKm, googleMapsUrl, howText, osmUrl, totalOf,
} from './baths.js';
import { summaryText, visitedSummary } from './visited.js';

const $ = (id) => document.getElementById(id);

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (name === 'className') node.className = value;
    else if (name === 'dataset') Object.assign(node.dataset, value);
    else if (name === 'style') Object.assign(node.style, value);
    else node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
}

// 語句の途中で折り返さない
const nowrap = (text) => el('span', { className: 'nowrap' }, text);
const dot = (type) => el('span', { className: 'dot', 'aria-hidden': 'true', style: { background: TYPE_COLORS[type] ?? TYPE_COLORS.other } });

const PANELS = { nation: 'nation', pref: 'pref-card', bath: 'bath-card', near: 'near-card', visited: 'visited-card' };

// 読み込み中・失敗・表示できる状態の切り替えはここ1か所（Day 032 の教訓：成功経路が増えると書き忘れる）
export function setAppState(name, level) {
  const app = $('app');
  app.dataset.state = name;
  $('loading').hidden = name !== 'loading';
  $('failure').hidden = name !== 'error';
  for (const [key, id] of Object.entries(PANELS)) $(id).hidden = name !== 'ready' || key !== level;
  app.dataset.level = level;
  if (name === 'loading') $('headline').textContent = 'データを読み込んでいます…';
  if (name === 'error') $('headline').textContent = 'データを読み込めませんでした';
}

export function renderHeadline(text, trend) {
  const headline = $('headline');
  if (headline.textContent !== text) headline.textContent = text;
  $('trend').textContent = trend;
  $('trend').hidden = !trend;
}

export function renderMetricButtons(metricId) {
  for (const button of document.querySelectorAll('.metric')) button.setAttribute('aria-pressed', String(button.dataset.metric === metricId));
}

// 行った記録のボタンは、1件目に印を付けるまで出さない
export function renderVisitedButton(items) {
  const button = $('visited-open');
  button.hidden = items.length === 0;
  button.textContent = `行った記録（${items.length}）`;
  button.title = summaryText(visitedSummary(items));
}

export function showNotice(text) {
  $('notice').textContent = text;
  $('notice').hidden = !text;
}

export function showTip(text, point) {
  const tip = $('tip');
  if (!text || !point) { tip.hidden = true; return; }
  tip.textContent = text;
  tip.style.left = `${point.x}px`;
  tip.style.top = `${point.y}px`;
  tip.hidden = false;
}

// ---------------------------------------------------------------- 全国：順位の一覧と県の選択

export function renderPrefSelect(prefectures) {
  const select = $('pref-select');
  if (select.options.length > 1) return;
  select.append(...prefectures.map((pref) => el('option', { value: pref.code }, pref.name)));
}

export function renderRanking(prefectures, metricId) {
  const metric = metricOf(metricId);
  const rows = ranking(prefectures, metricId);
  const max = rows[0].value;
  const zero = rows.filter((row) => row.value === 0).map((row) => row.name);
  $('ranking-title').textContent = `${metric.label}の順位`;
  $('pillar-note').replaceChildren(
    `柱の高さは${metric.label}（1位の${rows[0].name}がいちばん高い）。`,
    zero.length ? `0の${zero.join('・')}には柱を立てていません。` : '',
    '柱は', nowrap('県庁所在地'), 'に立てていて、県の中の分布ではありません。',
  );
  // 棒は全行同じ縮尺（1位が棒の右端）。値の列は固定幅なので、どの行でも棒の右端がそろう
  $('rank-list').replaceChildren(...rows.map((row) => {
    const ratio = max ? row.value / max : 0;
    return el('li', {}, el('button', { type: 'button', className: 'rank-row', dataset: { pref: row.code } },
      el('span', { className: 'rank' }, String(row.rank), el('span', { className: 'sr-only' }, '位')), ' ',
      el('span', { className: 'name' }, row.name), ' ',
      el('span', { className: 'bar', 'aria-hidden': 'true' },
        el('span', { style: { width: `${(ratio * 100).toFixed(2)}%`, background: pillarColor(metric.family, ratio) } })),
      el('span', { className: 'value' }, metric.format(row.value), row.value === 0 ? el('span', { className: 'none' }, '（柱なし）') : null),
      el('span', { className: 'chevron', 'aria-hidden': 'true' }, '›')));
  }));
}

// ---------------------------------------------------------------- 県のカード

function bathRow(bath, { visited = false, meta = TYPE_LABELS[bath.t] } = {}) {
  return el('li', {}, el('button', { type: 'button', className: 'bath-row', dataset: { id: bath.id } },
    dot(bath.t),
    el('span', { className: 'bath-name' }, bathName(bath), visited ? el('span', { className: 'went' }, '行った') : null), ' ',
    el('span', { className: 'bath-meta' }, meta),
    el('span', { className: 'chevron', 'aria-hidden': 'true' }, '›')));
}

// チップの並び。「すべて」「温泉」の次に「種類の登録なし」（銭湯の多くはここに入る）。この県に0件の種類は末尾へ
export const CHIP_ORDER = ['onsen', 'other', 'sento', 'super', 'foot'];
export function chipTypes(counts) {
  const empty = new Set(emptyTypes(counts));
  return ['all', ...CHIP_ORDER.filter((type) => !empty.has(type)), ...CHIP_ORDER.filter((type) => empty.has(type))];
}

// 絞り込みのチップは凡例も兼ねる（色と文字）。この県に0件の種類は淡くして押せなくする
function renderTypeFilter(counts, filter) {
  const empty = new Set(emptyTypes(counts));
  const chips = chipTypes(counts).map((type) => (type === 'all'
    ? { type, label: 'すべて', count: totalOf(counts) }
    : { type, label: TYPE_LABELS[type], count: counts?.[type] ?? 0 }));
  $('type-filter').replaceChildren(...chips.map((chip) => {
    const off = chip.type !== 'all' && empty.has(chip.type);
    return el('button', {
      type: 'button', className: 'type-chip', 'aria-pressed': String(chip.type === filter), dataset: { type: chip.type },
      disabled: off, 'aria-disabled': off ? 'true' : null,
    }, chip.type === 'all' ? null : dot(chip.type), nowrap(chip.label), ' ', el('span', { className: 'count' }, `${chip.count}件`));
  }));
  $('type-filter').hidden = false;
}

export function renderPrefCard({ stats, pref, metricId, counts, baths, filter, limit, visitedIds, loading, failed }) {
  // 県名と選んでいる指標は上の帯の見出しに1回だけ出す（ここの見出しは読み上げ用）。シートには残りの3指標を短く2行以内に並べる
  $('pref-title').textContent = pref.name;
  const others = compactMetrics(stats.prefectures, pref, metricId);
  $('pref-metrics').replaceChildren(...others.flatMap((text, index) => [index ? '・' : '', nowrap(text)]));
  $('baths-failure').hidden = !failed;
  const ready = !loading && !failed && Array.isArray(baths);
  for (const id of ['pref-legend-note', 'sort-note']) $(id).hidden = !ready;
  // 「銭湯の多くは『種類の登録なし』に入っています」。押すとそのチップを選ぶので、この県に0件なら出さない
  $('sento-note').hidden = !ready || !(counts?.other > 0);
  if (!ready) {
    $('pref-summary-title').textContent = '地図に載っているお風呂';
    $('pref-status').textContent = loading ? 'お風呂の位置を読み込んでいます…' : '';
    $('pref-status').hidden = !loading;
    $('type-filter').hidden = true;
    $('pref-empty').hidden = true;
    $('bath-list').replaceChildren();
    $('bath-more').hidden = true;
    return;
  }
  $('pref-status').hidden = true;
  $('pref-summary-title').textContent = bathTotalText(counts);
  renderTypeFilter(counts, filter);
  $('pref-empty').hidden = baths.length > 0;
  if (!baths.length) {
    $('pref-empty-text').textContent = emptyTypeMessage(filter, pref);
    $('pref-empty-hint').textContent = emptyTypeHint(filter);
  }
  const shown = baths.slice(0, limit);
  $('bath-list').replaceChildren(...shown.map((bath) => bathRow(bath, { visited: visitedIds.has(bath.id) })));
  const rest = baths.length - shown.length;
  $('bath-more').hidden = rest <= 0;
  $('bath-more').textContent = `もっと見る（残り${rest}件）`;
}

// ---------------------------------------------------------------- お風呂のカード

export function renderBathCard({ bath, pref, context, visited, storageOk, items }) {
  $('bath-back').textContent = context === 'near' ? '← 近くのお風呂へ' : context === 'visited' ? '← 行った記録へ' : `← ${pref.name}の一覧へ`;
  $('bath-where').textContent = `${pref.name}のお風呂`;
  $('bath-title').textContent = bathName(bath);
  $('bath-type').replaceChildren(dot(bath.t), howText(bath));
  $('bath-maps').href = googleMapsUrl(bath.lat, bath.lng);
  $('bath-visit').setAttribute('aria-pressed', String(visited));
  $('bath-visit-note').textContent = !storageOk
    ? 'この端末では記録を保存できません。画面を閉じると消えます。'
    : visited ? `行った記録に入れました（${summaryText(visitedSummary(items))}）` : '';
  const facts = bathFacts(bath);
  $('bath-facts').replaceChildren(...facts.flatMap((fact) => [el('dt', {}, fact.label), el('dd', {}, fact.value)]));
  $('bath-facts').hidden = !facts.length;
  const osm = osmUrl(bath.id);
  $('bath-osm').hidden = !osm;
  if (osm) $('bath-osm').href = osm;
}

// ---------------------------------------------------------------- 近く・行った記録

export function renderNearCard({ rows, visitedIds, maxKm }) {
  $('near-lead').textContent = rows.length
    ? `現在地から${maxKm}km以内の、地図に載っているお風呂を近い順に${rows.length}件`
    : `現在地から${maxKm}km以内に、地図に載っているお風呂はありません`;
  $('near-list').replaceChildren(...rows.map(({ bath, km }) => bathRow(bath, {
    visited: visitedIds.has(bath.id), meta: `${TYPE_LABELS[bath.t]}・${formatKm(km)}`,
  })));
}

export function renderVisitedCard({ items, prefNames, storageOk, backLabel }) {
  const summary = visitedSummary(items);
  $('visited-back').textContent = backLabel;
  $('visited-lead').textContent = items.length
    ? `${summary.baths}か所・${summary.prefs}都道府県`
    : 'まだありません。お風呂のカードの「行った」を押すと、ここに残ります。';
  $('visited-list').replaceChildren(...[...items].reverse().map((item) => {
    const name = item.name || '名前の登録なし';
    return el('li', { className: 'visited-item' },
      el('button', { type: 'button', className: 'bath-row', dataset: { open: item.id } },
        el('span', { className: 'bath-name' }, name), ' ', el('span', { className: 'bath-meta' }, prefNames.get(item.pref) ?? '')),
      el('button', { type: 'button', className: 'button button--ghost', dataset: { remove: item.id }, 'aria-label': `${name}を行った記録から外す` }, '外す'));
  }));
  $('visited-storage').textContent = storageOk
    ? '記録はこの端末（ブラウザ）の中だけにあります。'
    : 'この端末では記録を保存できません。画面を閉じると消えます。';
}
