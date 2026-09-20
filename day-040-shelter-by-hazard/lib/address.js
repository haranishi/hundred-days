const SEARCH = 'https://msearch.gsi.go.jp/address-search/AddressSearch';
export const addressUrl = (query) => `${SEARCH}?q=${encodeURIComponent(query)}`;

/* 応答は GeoJSON の配列。「秋田駅」では北海道中頓別町秋田が先頭に来るので、
   1件のときだけ自動で選び、2件以上は必ず選ばせる。掴んだ場所の名前は画面に出す */
export function readAddressResults(data, limit = 10) {
  const items = (Array.isArray(data) ? data : []).map((feature) => {
    const coordinates = feature?.geometry?.coordinates;
    const title = feature?.properties?.title;
    if (!Array.isArray(coordinates) || typeof title !== 'string' || !title) return null;
    const lng = Number(coordinates[0]), lat = Number(coordinates[1]);
    return Number.isFinite(lng) && Number.isFinite(lat) ? { title, lng, lat } : null;
  }).filter(Boolean).slice(0, limit);
  if (!items.length) return { kind: 'none', items: [] };
  return { kind: items.length === 1 ? 'one' : 'many', items };
}

/* 「秋田駅」の「駅」を落とした語を目印にする。国土地理院の候補は無関係な地名が先に来ることがあるので、
   目印が題名の早い位置に出るものを前に並べる（「秋田県秋田市」が「北海道中頓別町秋田」より前）。順位が同じなら元の順 */
export const candidateStem = (query) => String(query ?? '').trim().replace(/駅$/, '');
export function rankCandidates(items, query) {
  const stem = candidateStem(query);
  const at = (item) => { const index = stem ? item.title.indexOf(stem) : -1; return index < 0 ? Number.MAX_SAFE_INTEGER : index; };
  return items.map((item, order) => ({ item, order, at: at(item) }))
    .sort((a, b) => a.at - b.at || a.order - b.order).map(({ item }) => item);
}

export const notFoundText = (query) => `「${query}」に当たる場所が見つかりませんでした。住所や町名で試してください。`;
