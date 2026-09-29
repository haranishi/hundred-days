// 下地の地図（OpenFreeMap の dark スタイル）の文字ラベルの扱い。
// 全国の画面（ズーム6未満）では全部隠し、6以上は日本語名だけにする（ローマ字の併記をやめる）。
// 国名はどのズームでも出さない。州名（日本では都道府県）は日本の範囲の中だけ出す。
// スタイルの中身を直接いじらず「何をどう変えるか」の一覧を返すので、地図なしで確かめられる。

export const LABEL_MIN_ZOOM = 6;
export const JA_NAME = ['coalesce', ['get', 'name:ja'], ['get', 'name']];

// 下地の地図の色。陸と海の比は1.3以上、地名は陸と海のどちらに対しても4.5以上にする（数値はテストで確かめる）
export const BASEMAP = {
  land: '#262d3a',
  water: '#0a1522',
  coast: '#5b6b82',
  label: '#aab3c1',
  halo: '#0d1118',
  stateBorder: '#7d8aa0',
};

const channel = (value) => {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
// WCAG のコントラスト比
export function contrastRatio(one, other) {
  const [light, dark] = [luminance(one), luminance(other)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

// geo.js の JAPAN_BOXES（[西, 南, 東, 北]）を within 式で使える MultiPolygon にする
export function japanArea(boxes) {
  return {
    type: 'MultiPolygon',
    coordinates: boxes.map(([west, south, east, north]) => [[[west, south], [east, south], [east, north], [west, north], [west, south]]]),
  };
}

// 全国の画面（ズーム6未満）では道路・鉄道・空港の線も出さない。陸を明るくしたので、暗い線が網のように浮いて見える
const QUIET_LINES = /^(highway|road|railway|aeroway|bridge|tunnel)/;
export function planQuietLines(layers) {
  return (layers ?? [])
    .filter((layer) => layer?.type === 'line' && QUIET_LINES.test(layer.id))
    .map((layer) => ({ id: layer.id, minzoom: Math.max(LABEL_MIN_ZOOM, layer.minzoom ?? 0), maxzoom: layer.maxzoom ?? 24 }));
}

export function planLabels(layers, area) {
  const plan = [];
  for (const layer of layers ?? []) {
    if (layer?.type !== 'symbol') continue;
    // 国名（place_country_major / minor / other）は日本も含めて出さない
    if (layer.id.startsWith('place_country')) {
      plan.push({ id: layer.id, visibility: 'none' });
      continue;
    }
    // 一方通行の矢印など、文字を持たないものはそのまま
    if (layer.layout?.['text-field'] === undefined) continue;
    const minzoom = Math.max(LABEL_MIN_ZOOM, layer.minzoom ?? 0);
    const maxzoom = layer.maxzoom ?? 24;
    if (maxzoom <= minzoom) {
      plan.push({ id: layer.id, visibility: 'none' });
      continue;
    }
    const step = { id: layer.id, textField: JA_NAME, minzoom, maxzoom, textColor: BASEMAP.label, haloColor: BASEMAP.halo };
    if (layer.id === 'place_state') step.filter = layer.filter ? ['all', layer.filter, ['within', area]] : ['within', area];
    plan.push(step);
  }
  return plan;
}
