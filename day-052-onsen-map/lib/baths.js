// OpenStreetMap のお風呂（data/baths.json）を画面に出すための整形。DOMには触らない。

import { TYPES, TYPE_LABELS } from './classify.js';
import { haversineKm } from './geo.js';

export { TYPES, TYPE_LABELS };

// 点の5色。色覚の違いでも見分けやすい Okabe-Ito の配色から選び、判断できないものは灰色にする。
// 凡例（絞り込みのチップ）・一覧・カードにも同じ色を使い、色だけに頼らず文字でも種類を出す
export const TYPE_COLORS = {
  onsen: '#E69F00',
  sento: '#56B4E9',
  super: '#F0E442',
  foot: '#009E73',
  other: '#9AA1AD',
};

export const bathName = (bath) => bath?.name || '名前の登録なし';

export function isBathId(value) {
  return typeof value === 'string' && /^[nwr][1-9]\d{0,14}$/.test(value);
}

// 種類と、その判断の根拠。how は tag=地図データに登録あり／name=名前から判断／none=判断できず
export function howText(bath) {
  if (!bath || bath.how === 'none' || bath.t === 'other') return '種類の登録なし';
  const label = TYPE_LABELS[bath.t] ?? TYPE_LABELS.other;
  return bath.how === 'tag' ? `種類：${label}（地図データに登録あり）` : `種類：${label}（名前から判断）`;
}

// Day 029 と同じ形（小数5桁の座標検索）
export function googleMapsUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
}

// id の先頭1文字が OSM の要素の種類（n=node・w=way・r=relation）
export function osmUrl(id) {
  if (!isBathId(id)) return null;
  const kind = { n: 'node', w: 'way', r: 'relation' }[id[0]];
  return `https://www.openstreetmap.org/${kind}/${id.slice(1)}`;
}

// 地図データに書かれていることだけを並べる。無い項目は出さない
export function bathFacts(bath) {
  const facts = [];
  if (bath?.oh) facts.push({ label: '営業時間（地図データの記載）', value: bath.oh });
  if (bath?.fee === 'yes') facts.push({ label: '料金（地図データの記載）', value: 'あり' });
  if (bath?.fee === 'no') facts.push({ label: '料金（地図データの記載）', value: '無料' });
  if (bath?.air === true) facts.push({ label: '露天風呂（地図データの記載）', value: 'あり' });
  return facts;
}

export const totalOf = (counts) => TYPES.reduce((sum, type) => sum + (counts?.[type] ?? 0), 0);

// 「温泉79、スーパー銭湯など1、足湯・手湯4、種類の登録なし37」。区切りを「・」にすると足湯・手湯と混ざるので読点にする
export function countsText(counts) {
  return TYPES.filter((type) => (counts?.[type] ?? 0) > 0).map((type) => `${TYPE_LABELS[type]}${counts[type]}`).join('、');
}

// 県のカードの見出し。「地図に載っているお風呂 121件」。内訳（countsText）はその下の1行に出す
export const bathTotalText = (counts) => `地図に載っているお風呂 ${totalOf(counts)}件`;

export function filterByType(baths, type) {
  return type && type !== 'all' ? baths.filter((bath) => bath.t === type) : baths;
}

const collator = new Intl.Collator('ja');
// ひらがな・カタカナ・漢字をひとつでも含む名前を「日本語の名前」とみなす
const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
export const hasJapanese = (name) => JAPANESE.test(name ?? '');

// 名前順。日本語の名前を先に、英字だけの名前をその後ろに、名前の無いものは最後に（種類の順・番号の順）
export function sortBaths(baths) {
  const byName = (a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id);
  const japanese = baths.filter((bath) => bath.name && hasJapanese(bath.name)).sort(byName);
  const latin = baths.filter((bath) => bath.name && !hasJapanese(bath.name)).sort(byName);
  const unnamed = baths.filter((bath) => !bath.name)
    .sort((a, b) => TYPES.indexOf(a.t) - TYPES.indexOf(b.t) || a.id.localeCompare(b.id));
  return [...japanese, ...latin, ...unnamed];
}

// 県の中の件数が0の種類。チップを押せなくする

// 選んだ種類がこの県に0件のとき。国の統計に数があるもの（温泉・銭湯）は添える
export function emptyTypeMessage(type, pref) {
  const label = TYPE_LABELS[type];
  if (type === 'sento') return `この県で地図に載っている銭湯はありません（国の統計では${pref.sento.toLocaleString('ja-JP')}軒）`;
  if (type === 'onsen') return `この県で地図に載っている温泉はありません（国の統計では温泉地${pref.areas.toLocaleString('ja-JP')}か所）`;
  if (type === 'other') return 'この県で地図に載っている、種類の登録がないお風呂はありません';
  if (!label) return 'この県で地図に載っているお風呂はありません';
  return `この県で地図に載っている${label}はありません`;
}

export const emptyTypes = (counts) => TYPES.filter((type) => !(counts?.[type] > 0));

export function emptyTypeHint(type) {
  if (type === 'sento') return '地図データでは、銭湯の多くが「種類の登録なし」に入っています。地図に無いことは、お風呂が無いことを意味しません。';
  return '地図の点は、OpenStreetMapに登録されたお風呂だけです。地図に無いことは、お風呂が無いことを意味しません。';
}

export function nearestBaths(baths, point, { limit = 10, maxKm = 20 } = {}) {
  return baths
    .map((bath) => ({ bath, km: haversineKm(point, bath) }))
    .filter((row) => row.km <= maxKm)
    .sort((a, b) => a.km - b.km || a.bath.id.localeCompare(b.bath.id))
    .slice(0, limit);
}

export function formatKm(km) {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)}m`;
  return km < 10 ? `${km.toFixed(1)}km` : `${Math.round(km)}km`;
}
