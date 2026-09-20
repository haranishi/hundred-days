import { distanceM } from './geo.js';

/* 8種類の災害と、それぞれのタイル番号。並びと正式名は国土地理院の配信に合わせる */
export const HAZARDS = [
  { id: 1, name: '洪水' },
  { id: 2, name: '崖崩れ、土石流及び地滑り' },
  { id: 3, name: '高潮' },
  { id: 4, name: '地震' },
  { id: 5, name: '津波' },
  { id: 6, name: '大規模な火事' },
  { id: 7, name: '内水氾濫' },
  { id: 8, name: '火山現象' },
];
export const hazardName = (id) => HAZARDS.find((h) => h.id === Number(id))?.name ?? '';

/* 配信されているのはズーム10だけ（9も11も404）。1区画はおよそ30km四方 */
export const ZOOM = 10;
const SIDE = 2 ** ZOOM;
const BASE = 'https://cyberjapandata.gsi.go.jp';

const rad = (n) => n * Math.PI / 180;

export function tileOf(point) {
  const phi = rad(point.lat);
  return {
    x: Math.floor((point.lng + 180) / 360 * SIDE),
    y: Math.floor((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2 * SIDE),
  };
}

export function tileEdges(tile) {
  const lng = (x) => x / SIDE * 360 - 180;
  const lat = (y) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / SIDE))) * 180 / Math.PI;
  return { west: lng(tile.x), east: lng(tile.x + 1), north: lat(tile.y), south: lat(tile.y + 1) };
}

/* 区画の辺まで5km未満なら、その方向の隣も取る（角なら斜めも。最大4区画）。
   避難場所は区画をまたいだ向こう側にあることがあり、それを取りこぼすと
   「いちばん近い」が嘘になる。逆に常に4区画取ると通信量が4倍になる */
export function tilesNear(point, reachM = 5000) {
  const base = tileOf(point);
  const edge = tileEdges(base);
  const nearWest = distanceM(point, { lat: point.lat, lng: edge.west }) < reachM;
  const nearEast = distanceM(point, { lat: point.lat, lng: edge.east }) < reachM;
  const nearNorth = distanceM(point, { lat: edge.north, lng: point.lng }) < reachM;
  const nearSouth = distanceM(point, { lat: edge.south, lng: point.lng }) < reachM;
  const dx = nearWest ? -1 : nearEast ? 1 : 0;
  const dy = nearNorth ? -1 : nearSouth ? 1 : 0;
  const tiles = [base];
  if (dx) tiles.push({ x: base.x + dx, y: base.y });
  if (dy) tiles.push({ x: base.x, y: base.y + dy });
  if (dx && dy) tiles.push({ x: base.x + dx, y: base.y + dy });
  return tiles;
}

export const tileUrl = (hazard, tile) => `${BASE}/xyz/skhb0${hazard}/${ZOOM}/${tile.x}/${tile.y}.geojson`;
export const mapTileUrl = `${BASE}/xyz/pale/{z}/{x}/{y}.png`;

/* Access-Control-Expose-Headers に last-modified が入っているので配信日を読める */
export function issuedOn(header) {
  const at = Date.parse(header || '');
  return Number.isFinite(at) ? new Date(at).toISOString().slice(0, 10) : '';
}

/* URLごとに応答を持つ。災害の種類を切り替えても取り直さないための貯め場 */
export function createTileStore(fetcher = fetch) {
  const held = new Map();
  return {
    get: (url) => held.get(url),
    async load(urls, options = {}) {
      await Promise.all([...new Set(urls)].filter((url) => !held.has(url)).map(async (url) => {
        const response = await fetcher(url, { signal: options.signal });
        // その区画に該当が無い種類はタイルごと404。0件であって、失敗ではない
        if (response.status === 404) return void held.set(url, { features: [], issued: '' });
        if (!response.ok) throw new Error('避難場所のタイルを取得できません');
        const data = await response.json();
        if (!data || !Array.isArray(data.features)) throw new Error('避難場所のタイルを読み取れません');
        held.set(url, { features: data.features, issued: issuedOn(response.headers?.get?.('last-modified')) });
      }));
      return urls.map((url) => held.get(url));
    },
  };
}
