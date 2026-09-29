// 4つの指標（源泉の数・温泉地の数・湧き出る量・銭湯の数）の表示と順位。
// 47都道府県は stats.json の prefectures の並び（01→47）のまま扱う。
// Object.keys() で県コードを回すと "10"〜"47" が先に並ぶ（数字の添字として扱われる）ので使わない。

const NUMBER = new Intl.NumberFormat('ja-JP');

export const formatNumber = (value) => NUMBER.format(value);

// short は県のカードで残りの3指標を短く並べるときの名前
export const METRICS = [
  { id: 'sources', label: '源泉の数', short: '源泉', family: 'onsen', format: (value) => `${NUMBER.format(value)}か所` },
  { id: 'areas', label: '温泉地の数', short: '温泉地', family: 'onsen', format: (value) => `${NUMBER.format(value)}か所` },
  { id: 'flow', label: '湧き出る量', short: '湧き出る量', family: 'onsen', format: (value) => `毎分${NUMBER.format(value)}L` },
  { id: 'sento', label: '銭湯の数', short: '銭湯', family: 'sento', format: (value) => `${NUMBER.format(value)}軒` },
];

export const DEFAULT_METRIC = 'sources';
export const METRIC_IDS = METRICS.map((metric) => metric.id);

export function metricOf(id) {
  return METRICS.find((metric) => metric.id === id) ?? null;
}

export function formatValue(metricId, value) {
  const metric = metricOf(metricId);
  if (!metric) throw new Error(`知らない指標です: ${metricId}`);
  return metric.format(value);
}

// 同じ値は同じ順位にする（1,2,2,4 の数え方）。同じ値どうしは県コードの順に並べる
export function ranking(prefectures, metricId) {
  const rows = prefectures.map((pref, index) => ({ code: pref.code, name: pref.name, value: pref[metricId], index }));
  rows.sort((left, right) => right.value - left.value || left.index - right.index);
  let rank = 0;
  rows.forEach((row, position) => {
    if (position === 0 || row.value !== rows[position - 1].value) rank = position + 1;
    row.rank = rank;
  });
  return rows;
}

export function rankOf(prefectures, metricId, code) {
  return ranking(prefectures, metricId).find((row) => row.code === code)?.rank ?? null;
}

// 見出しの1行。「源泉の数、1位は大分県。5,094か所」
export function headline(prefectures, metricId) {
  const metric = metricOf(metricId);
  const top = ranking(prefectures, metricId).filter((row) => row.rank === 1);
  return `${metric.label}、1位は${top.map((row) => row.name).join('・')}。${metric.format(top[0].value)}`;
}

// 銭湯のときだけ添える推移。「全国の銭湯は4年で3,231軒→2,730軒（501軒減）」
export function sentoTrend(series) {
  if (!Array.isArray(series) || series.length < 2) return '';
  const first = series[0];
  const last = series.at(-1);
  const difference = first.count - last.count;
  const change = difference > 0 ? `${NUMBER.format(difference)}軒減`
    : difference < 0 ? `${NUMBER.format(-difference)}軒増` : '増減なし';
  return `全国の銭湯は${last.fy - first.fy}年で${NUMBER.format(first.count)}軒→${NUMBER.format(last.count)}軒（${change}）`;
}

// 県のカードの1行。「源泉の数 616か所（全国11位）」
export function metricLine(prefectures, pref, metricId) {
  const metric = metricOf(metricId);
  return `${metric.label} ${metric.format(pref[metricId])}（全国${rankOf(prefectures, metricId, pref.code)}位）`;
}

// 選んでいない残りの3指標を短く。「温泉地 104か所（7位）」の並び（画面では語句ごとに折り返さない）
export function compactMetrics(prefectures, pref, metricId) {
  return METRICS.filter((metric) => metric.id !== metricId)
    .map((metric) => `${metric.short} ${metric.format(pref[metric.id])}（${rankOf(prefectures, metric.id, pref.code)}位）`);
}

// 県の画面の見出し。「秋田県　源泉の数 616か所・全国11位」
export function prefHeadline(prefectures, pref, metricId) {
  const metric = metricOf(metricId);
  return `${pref.name}\u3000${metric.label} ${metric.format(pref[metricId])}・全国${rankOf(prefectures, metricId, pref.code)}位`;
}

// 全国の地図で柱の根元に置く上位3県の文字。「大分県 5,094」（3位が同数なら並べて出す）
export function topLabels(prefectures, metricId, count = 3) {
  const byCode = new Map(prefectures.map((pref) => [pref.code, pref]));
  return ranking(prefectures, metricId)
    .filter((row) => row.rank <= count && row.value > 0)
    .map((row) => ({ code: row.code, lng: byCode.get(row.code).capital.lng, lat: byCode.get(row.code).capital.lat, text: `${row.name} ${NUMBER.format(row.value)}` }));
}

// 柱の高さ（メートル）。値÷最大値×最大高さ。0の県は柱を立てない
export const MAX_PILLAR_METERS = 480_000;

export function pillarHeight(value, max, maxMeters = MAX_PILLAR_METERS) {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.round((value / max) * maxMeters);
}

// 温泉の指標は朱→橙、銭湯は藍→水色。値が大きいほど明るくして、暗い地図の上で光らせる
export const PALETTES = {
  onsen: ['#d8432b', '#ffb43e'],
  sento: ['#3a63d6', '#8fe0ff'],
};

const channels = (hex) => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
const toHex = (values) => `#${values.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;

export function mixColor(from, to, ratio) {
  const t = Math.min(1, Math.max(0, Number(ratio) || 0));
  const [a, b] = [channels(from), channels(to)];
  return toHex(a.map((value, index) => value + (b[index] - value) * t));
}

// 色は平方根で配る。源泉は大分だけが飛び抜けるので、値の比のままだと他の県がほぼ同じ色になる
export function pillarColor(family, ratio) {
  const [from, to] = PALETTES[family] ?? PALETTES.onsen;
  return mixColor(from, to, Math.sqrt(Math.min(1, Math.max(0, Number(ratio) || 0))));
}
