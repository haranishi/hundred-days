// CC0の構造化データだけを取得する。写真・記事本文・地図画像は取得しない。
import { execFileSync } from 'node:child_process';
import { PLACES } from '../lib/railways.js';
const overrides = { Kanda: '神田駅 (東京都)', Otsuka: '大塚駅 (東京都)', Okubo: '大久保駅 (東京都)', Omori: '大森駅 (東京都)', Jujo: '十条駅 (東京都)', Asagaya: '阿佐ケ谷駅', Nakano: '中野駅 (東京都)' };
const places = [...PLACES.values()];
const records = [];
for (let start = 0; start < places.length; start += 30) {
  const batch = places.slice(start, start + 30);
  const titles = batch.map(p => overrides[p.id] || `${p.name}駅`);
  const body = execFileSync('curl', ['--fail', '--silent', '--show-error', '--max-time', '30', '--get', 'https://www.wikidata.org/w/api.php', '--data-urlencode', 'action=wbgetentities', '--data-urlencode', 'sites=jawiki', '--data-urlencode', `titles=${titles.join('|')}`, '--data-urlencode', 'props=info|claims|sitelinks', '--data-urlencode', 'format=json', '--data-urlencode', 'redirects=yes'], { encoding: 'utf8', maxBuffer: 5_000_000 });
  const response = JSON.parse(body);
  for (let i = 0; i < batch.length; i++) {
    const entity = Object.values(response.entities || {}).find(e => e.sitelinks?.jawiki?.title === titles[i]);
    const coord = entity?.claims?.P625?.find(c => c.rank !== 'deprecated' && c.mainsnak.datavalue?.value?.latitude)?.mainsnak.datavalue.value;
    if (!coord || coord.latitude < 35.54 || coord.latitude > 35.80 || coord.longitude < 139.54 || coord.longitude > 139.85) throw new Error(`確認できない駅: ${titles[i]}`);
    records.push({ id: batch[i].id, title: titles[i], entity: entity.id, revision: entity.lastrevid, lng: Number(coord.longitude.toFixed(4)), lat: Number(coord.latitude.toFixed(4)) });
  }
}
console.log(JSON.stringify({ retrieved: new Date().toISOString().slice(0, 10), license: 'CC0-1.0', records }, null, 2));
