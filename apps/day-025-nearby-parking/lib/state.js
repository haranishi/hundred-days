// 800m=徒歩10分圏＝「ちかく」の実用上限。見つからない土地だけ3200mへ一度だけ広げる
export const RADII = [800, 3200];

// 一覧に出す上限。800mでも都市部は数百件返るため、近い順に切って描画量を抑える
export const MAX_VISIBLE = 50;

export function nextRadius(radius, count) {
  if (count >= 3) return null;
  const index = RADII.indexOf(radius);
  return index >= 0 && index < RADII.length - 1 ? RADII[index + 1] : null;
}

export function createState(saved = {}) {
  return {
    center: null,
    radius: RADII[0],
    results: [],
    filter: 'all',
    showRestricted: Boolean(saved.showRestricted),
    selectedId: null,
  };
}

// 半径拡大の判定に使う件数。既定で隠れるrestrictedは数えない（そこだけの場所で空振りするため）
export function displayableCount(items) {
  return items.filter((item) => !item.restricted).length;
}

// 条件に合う全件（50件で切る前）。「50件」が上限に当たった数字なのかを画面で言い分けるために使う
export function matchedResults(state) {
  return state.results.filter((item) =>
    (state.showRestricted || !item.restricted)
    && (state.filter === 'all' || item.fee === state.filter));
}

export function visibleResults(state) {
  // resultsは距離昇順（addDistances）。フィルタ後に切るので、タブごとに「その条件の近い順50件」になる
  return matchedResults(state).slice(0, MAX_VISIBLE);
}
