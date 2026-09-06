import test from 'node:test';
import assert from 'node:assert/strict';
import { displayName, filterByKinds, inBounds, normalizeText, parseCameras, pickRandom, rankForList, searchCameras } from '../lib/data.js';

const compact = {
  generatedAt: '2026-09-05',
  osmTimestamp: '2026-09-05T02:14:01Z',
  count: 3,
  kinds: { yt: 1, img: 1, page: 1 },
  cameras: [
    { i: 'n1', a: 35, o: 139, k: 'yt', n: 'ＴＯＫＹＯ駅', u: 'v:one', c: 'JP', p: '鉄道会社', r: 'A-1' },
    { i: 'n2', a: 52.5, o: 13.4, k: 'img', n: 'Berlin', u: 'https://example.test/b.jpg', c: 'DE' },
    { i: 'n3', a: 0, o: -179, k: 'page', u: 'https://example.test/c' },
  ],
};

test('data: 同梱圧縮形式を公開Camera形式へ欠損null付きで復元する', () => {
  const parsed = parseCameras(JSON.stringify(compact));
  assert.deepEqual(parsed.meta, {
    generatedAt: compact.generatedAt,
    osmTimestamp: compact.osmTimestamp,
    count: 3,
    kinds: compact.kinds,
  });
  assert.equal(parsed.cameras[0].id, 'n1');
  assert.equal(parsed.cameras[0].operator, '鉄道会社');
  assert.equal(parsed.cameras[0].description, null);
  assert.equal(Object.keys(parsed.cameras[0]).length, 14);
});

test('data: 種別フィルタと日付変更線をまたぐ範囲を扱う', () => {
  const { cameras } = parseCameras(compact);
  assert.deepEqual(filterByKinds(cameras, new Set(['yt'])).map(({ id }) => id), ['n1']);
  assert.deepEqual(inBounds(cameras, { north: 10, south: -10, west: 170, east: -170 }).map(({ id }) => id), ['n3']);
});

test('data: ランダム選択は有効な映像・画像をpageより優先する', () => {
  const { cameras } = parseCameras(compact);
  assert.equal(pickRandom(cameras, new Set(['yt', 'img', 'page']), () => 0.99).kind, 'img');
  assert.equal(pickRandom(cameras, new Set(['page']), () => 0).kind, 'page');
  assert.equal(pickRandom(cameras, new Set(), () => 0), null);
});

test('data: NFKC・大小文字で正規化し名前・運営者・国名・refを検索する', () => {
  const { cameras } = parseCameras(compact);
  const countries = { JP: { ja: '日本', en: 'Japan' }, DE: { ja: 'ドイツ', en: 'Germany' } };
  assert.equal(normalizeText(' ＡＢＣ '), 'abc');
  assert.equal(searchCameras(cameras, 'tokyo', countries)[0].camera.id, 'n1');
  assert.equal(searchCameras(cameras, '日本', countries)[0].camera.id, 'n1');
  assert.equal(searchCameras(cameras, 'a-1', countries)[0].camera.id, 'n1');
  assert.deepEqual(searchCameras(cameras, '   ', countries), []);
});

test('data: 検索はどの項目で当たったかを返す', () => {
  const { cameras } = parseCameras(compact);
  const countries = { JP: { ja: '日本', en: 'Japan' }, DE: { ja: 'ドイツ', en: 'Germany' } };
  // 名前で当たったものは、同じ語が国名にもあっても name を優先する（強調するのは名前の中だから）
  assert.deepEqual(searchCameras(cameras, 'tokyo', countries).map(({ matched }) => matched), ['name']);
  // 「鉄道会社」は名前に無い＝候補が出た理由は運営者
  assert.deepEqual(searchCameras(cameras, '鉄道', countries), [{ camera: cameras[0], matched: 'operator' }]);
  assert.deepEqual(searchCameras(cameras, 'a-1', countries).map(({ matched }) => matched), ['ref']);
  assert.deepEqual(searchCameras(cameras, 'ドイツ', countries).map(({ camera, matched }) => [camera.id, matched]), [['n2', 'country']]);
  assert.deepEqual(searchCameras(cameras, 'Japan', countries).map(({ camera, matched }) => [camera.id, matched]), [['n1', 'country']]);
  // 上限は「候補の数」で数える（打ち切っても件数表示と並びが食い違わない）
  assert.equal(searchCameras(cameras, 'e', countries, 1).length, 1);
  assert.deepEqual(searchCameras(cameras, 'tokyo', countries, 0), []);
});

test('data: 一覧は見られる種別を先に、その中で近い順に並べる', () => {
  const cameras = [
    { id: 'far-video', kind: 'yt', lat: 40, lon: 139 },
    { id: 'near-page', kind: 'page', lat: 35.1, lon: 139.1 },
    { id: 'near-video', kind: 'hls', lat: 35.2, lon: 139.2 },
    { id: 'mid-image', kind: 'img', lat: 36, lon: 139 },
    { id: 'far-page', kind: 'page', lat: 45, lon: 139 },
  ];
  const result = rankForList(cameras, { lat: 35.1, lon: 139.1 }, 4);
  assert.equal(result.total, 5);
  // 距離だけなら near-page が先頭に来るが、リンクのみは後ろへ回る
  assert.deepEqual(result.items.map(({ id }) => id), ['near-video', 'far-video', 'mid-image', 'near-page']);
  // 同じ種別・同じ距離なら元の順序を崩さない（描き直しても並びが跳ねない）
  const tie = rankForList([
    { id: 'a', kind: 'img', lat: 10, lon: 10 },
    { id: 'b', kind: 'img', lat: 10, lon: 10 },
  ], { lat: 0, lon: 0 });
  assert.deepEqual(tie.items.map(({ id }) => id), ['a', 'b']);
});

test('data: 名前が無いカメラは ref・区分・国から代わりの名前を作る', () => {
  const countries = { JP: { ja: '日本' }, DE: { ja: 'ドイツ' } };
  assert.equal(displayName({ name: '秋田駅前', ref: 'A-1', country: 'JP' }, countries), '秋田駅前');
  assert.equal(displayName({ ref: 'A-1', country: 'JP', zone: 'traffic' }, countries), 'カメラ A-1');
  assert.equal(displayName({ country: 'JP', zone: 'traffic' }, countries), '交通カメラ（日本）');
  assert.equal(displayName({ country: 'DE' }, countries), 'カメラ（ドイツ）');
  // 国名の対応表に無い国コードは、コードのまま出して情報を残す
  assert.equal(displayName({ country: 'XX', zone: 'beach' }, countries), '海岸カメラ（XX）');
  assert.equal(displayName({}, countries), '名前のないカメラ');
});
