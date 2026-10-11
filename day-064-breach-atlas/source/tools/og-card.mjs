import { readFile, writeFile } from 'node:fs/promises';
import { groupLocations, GLOBE_COLORS } from '../src/geo-model.mjs';

const source = new URL('../', import.meta.url);
const data = JSON.parse(await readFile(new URL('src/data.json', source), 'utf8'));
const land = JSON.parse(await readFile(new URL('public/data/map-land.json', source), 'utf8'));
const groups = groupLocations(data.incidents, data.incidents.map((_, index) => index));
const number = value => new Intl.NumberFormat('ja-JP').format(value);
const center = { x: 888, y: 317, radius: 248, lat: 27 * Math.PI / 180, lon: 138 * Math.PI / 180 };
function project(lat, lon) {
  const phi = lat * Math.PI / 180, theta = lon * Math.PI / 180 - center.lon;
  return { x: center.x + center.radius * Math.cos(phi) * Math.sin(theta), y: center.y - center.radius * (Math.cos(center.lat) * Math.sin(phi) - Math.sin(center.lat) * Math.cos(phi) * Math.cos(theta)), front: Math.sin(center.lat) * Math.sin(phi) + Math.cos(center.lat) * Math.cos(phi) * Math.cos(theta) > 0 };
}
function path(points) {
  let visible = false;
  return points.map(([lon, lat]) => {
    const point = project(lat, lon);
    if (!point.front) { visible = false; return ''; }
    const command = visible ? 'L' : 'M'; visible = true;
    return `${command}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }).join(' ');
}
const grid = [];
for (let lon = -180; lon < 180; lon += 20) grid.push(path(Array.from({ length: 91 }, (_, i) => [lon, -90 + i * 2])));
for (let lat = -60; lat <= 60; lat += 20) grid.push(path(Array.from({ length: 181 }, (_, i) => [-180 + i * 2, lat])));
const coast = land.polygons.flatMap(polygon => polygon.map(ring => path(ring))).join(' ');
const points = groups.map(group => {
  const point = project(group.lat, group.lon);
  if (!point.front) return '';
  const color = GLOBE_COLORS[Object.entries(group.causes).sort((a,b) => b[1] - a[1])[0][0]];
  const radius = 2 + Math.log10(group.count + 1);
  return `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${radius.toFixed(1)}" fill="${color}" fill-opacity=".8"/><circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${(radius + 4).toFixed(1)}" fill="none" stroke="${color}" stroke-opacity=".35"/>`;
}).join('');
const japan = data.incidents.filter(record => record.region === 'japan').length;
const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><radialGradient id="earth" cx=".4" cy=".35"><stop stop-color="#164553"/><stop offset="1" stop-color="#061828"/></radialGradient><radialGradient id="halo"><stop offset=".84" stop-color="#64d5d6" stop-opacity="0"/><stop offset=".93" stop-color="#64d5d6" stop-opacity=".2"/><stop offset="1" stop-color="#64d5d6" stop-opacity="0"/></radialGradient></defs>
<rect width="1200" height="630" fill="#070f1d"/>
<g font-family="-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif">
<g stroke="#83e2d2" stroke-width="1.6" fill="none"><path d="M72 59 92 72v21l-20 13-20-13V72ZM52 72l20 14 20-14M72 86v20M72 59v27"/></g>
<text x="112" y="86" fill="#a8b8cc" font-size="16" letter-spacing="3" font-family="monospace">DAY 064 / BREACH ATLAS</text>
<text x="51" y="220" fill="#e6edf6" font-size="70" font-weight="600" letter-spacing="4">漏洩の地図<tspan fill="#83e2d2">.</tspan></text>
<text x="55" y="304" fill="#c0d0df" font-size="30">過去の記録から、</text><text x="55" y="351" fill="#c0d0df" font-size="30">これからの備えへ。</text>
<rect x="55" y="412" width="380" height="50" rx="7" fill="#123435" stroke="#47767c"/><text x="78" y="446" fill="#83e2d2" font-size="20">${number(data.incidents.length)}の公表記録をたどる →</text>
<text x="55" y="504" fill="#a8b8cc" font-size="17">原資料で確かめ、備えを学ぶ。</text><text x="55" y="569" fill="#a8b8cc" font-size="14">過去の公表・報道記録 · ${data.asOf.replaceAll('-', '.')}確認</text>
<circle cx="888" cy="317" r="275" fill="url(#halo)"/><circle cx="888" cy="317" r="248" fill="url(#earth)" stroke="#3d9398" stroke-opacity=".7"/>
<path d="${grid.join(' ')}" fill="none" stroke="#397b88" stroke-width=".7" stroke-opacity=".4"/><path d="${coast}" fill="none" stroke="#51a6aa" stroke-width=".8" stroke-opacity=".7"/>${points}
<rect x="784" y="256" width="214" height="72" rx="8" fill="#0b1e30" stroke="#83e2d2"/><text x="800" y="282" fill="#e6edf6" font-size="16">日本 ${number(japan)}記録</text><text x="800" y="307" fill="#a8b8cc" font-size="12">資料に関連する地域</text>
<text x="1148" y="598" text-anchor="end" fill="#a8b8cc" font-size="13">国・地域の代表点 / Made with Natural Earth</text>
</g></svg>`;
await writeFile(new URL('public/og-card.svg', source), markup + '\n');
