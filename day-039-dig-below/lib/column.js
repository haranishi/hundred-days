import { ageRange, environment, gapYears, years } from './geology.js';
import { groupsFor } from './taxa.js';
import { formatDistance } from './geo.js';
export function contrast(a, b) {
  const lum = (hex) => hex.slice(1).match(/../g).map((c) => parseInt(c, 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const x = lum(a), y = lum(b);
  return Math.round((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) * 100) / 100;
}
export const textSurface = (color) => contrast('#171713', color) >= 4.5 ? color : '#ffffff';
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
};
export function renderColumn(container, layers, tables) {
  container.replaceChildren();
  layers.forEach((layer, i) => {
    const gap = i && layer.en !== 'unknown' && layers[i - 1].en !== 'unknown' ? gapYears(layers[i - 1], layer) : 0;
    if (gap) container.append(el('p', `ここで${years(gap, false)}飛ぶ`, 'gap'));
    const details = el('details', '', 'layer');
    details.style.setProperty('--stratum', layer.color);
    details.style.setProperty('--surface', textSurface(layer.color));
    const summary = el('summary');
    const body = el('div', '', 'layer-face');
    body.append(el('h3', layer.ja), el('p', layer.en === 'unknown' ? '年代を区分できない記録' : ageRange(layer.from, layer.to), 'age'));
    body.append(el('p', `${layer.collections.length}産地 · いちばん近くは${formatDistance(layer.collections[0].distance)}先`));
    /* 環境を全部つなぐと層の高さを超える。いちばん近い産地のものを代表に置き、残りは数で示す */
    const envs = [...new Set(layer.collections.map((c) => environment(c.env, tables.env)?.ja).filter(Boolean))];
    if (envs.length) body.append(el('p', envs.length > 1 ? `${envs[0]} ほか${envs.length - 1}種類` : envs[0], 'environments'));
    const groups = groupsFor(layer.occurrences, tables.taxa);
    const top = groups.slice(0, 3).map(([name, n]) => `${name} ${n}件`);
    if (groups.length > 3) top.push(`ほか${groups.length - 3}種類`);
    body.append(el('p', groups.length ? top.join(' · ') : '生きものの記録なし', 'groups'));
    body.append(el('span', '産地・出典をひらく', 'open-label'));
    summary.append(body);
    details.append(summary);
    const expanded = el('div', '', 'layer-details');
    if (groups.length) expanded.append(el('p', groups.map(([name, n]) => `${name} ${n}件`).join('／')));
    for (const c of layer.collections) {
      const section = el('section');
      section.append(el('h4', `${c.nam || '名称のない産地'} — ${formatDistance(c.distance)}先で見つかった記録`));
      section.append(el('p', ageRange(c.eag, c.lag)));
      const env = environment(c.env, tables.env);
      if (env) section.append(el('p', `堆積環境：${env.ja}`));
      const occs = layer.occurrences.filter((o) => o.cid === c.oid);
      const names = [...new Set(occs.map((o) => o.tna || o.idn).filter(Boolean))];
      if (names.length) section.append(el('p', `学名：${names.join('、')}`, 'scientific'));
      const refs = [...new Set(occs.map((o) => o.ref).filter(Boolean))];
      section.append(el('h5', '出典論文'));
      if (!refs.length) section.append(el('p', 'この応答には書誌情報がありません。'));
      refs.forEach((ref) => section.append(el('p', ref, 'reference')));
      expanded.append(section);
    }
    details.append(expanded);
    container.append(details);
  });
}
