/* 同梱データの検算。towns.json と land.json は作り直せるので、
   ここが門番になっていないと、静かに欠けたまま公開してしまう。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPECTED_TOWNS, JAPAN, buildTowns, prefName, readOrder, verifyTowns } from '../tools/build-towns.mjs';
import { MAX_BYTES, TOLERANCE, WINDOW, buildLand, simplify } from '../tools/build-land.mjs';
import { area, class20relm, landJson, landText, rawAreaText, townsJson } from './fixtures.mjs';

test('class20s の並び順は、ファイルに書かれている順（北→南）で取る', () => {
  /* JSON.parse のキー順は使えない。先頭が0でない6〜7桁は配列添字とみなされて前に回るので、
     北海道（0110000〜）が全部うしろへ行く。実際に群馬の前橋市が先頭になる */
  const parsed = Object.keys(area.class20s);
  assert.equal(area.class20s[parsed[0]].name, '前橋市', 'キー順の先頭は北海道ではない');
  const order = readOrder(rawAreaText);
  assert.equal(order.length, EXPECTED_TOWNS);
  assert.equal(area.class20s[order[0]].name, '札幌市');
  assert.equal(area.class20s[order[order.length - 1]].name, '与那国町');
  assert.equal(new Set(order).size, EXPECTED_TOWNS, '同じコードを二重に拾っていない');
});

test('都道府県名の寄せ方', () => {
  assert.equal(prefName('130000', '東京都'), '東京都');
  assert.equal(prefName('460100', '鹿児島県（奄美地方除く）'), '鹿児島県');
  assert.equal(prefName('016000', '石狩・空知・後志地方'), '北海道');
  assert.equal(prefName('471000', '沖縄本島地方'), '沖縄県');
  assert.equal(prefName('460040', '奄美地方'), '鹿児島県');
});

test('towns.json は1805件で、地域コードが全部 class15s にある', () => {
  assert.equal(townsJson.version, 1);
  assert.equal(townsJson.towns.length, EXPECTED_TOWNS);
  const { errors, duplicateLabels } = verifyTowns(townsJson.towns, area);
  assert.deepEqual(errors, []);
  assert.equal(duplicateLabels, 0, '名前と都道府県が同じ市区町村があると候補で選べない');
});

test('代表点が全部日本の範囲に入る', () => {
  for (const town of townsJson.towns) {
    assert.ok(town.lat >= JAPAN.minLat && town.lat <= JAPAN.maxLat, `${town.name} の緯度 ${town.lat}`);
    assert.ok(town.lng >= JAPAN.minLng && town.lng <= JAPAN.maxLng, `${town.name} の経度 ${town.lng}`);
    assert.ok(town.sw[0] <= town.ne[0] && town.sw[1] <= town.ne[1], `${town.name} の外接矩形が逆`);
  }
});

test('作り直しても同じものが出る', () => {
  const order = readOrder(rawAreaText);
  const points = Object.fromEntries(townsJson.towns.map((town) => [town.code.slice(0, 5), [town.lng, town.lat]]));
  const rebuilt = buildTowns({ area, relm: class20relm, points, order });
  assert.equal(rebuilt.length, townsJson.towns.length);
  assert.deepEqual(rebuilt.map((town) => town.code), townsJson.towns.map((town) => town.code));
  assert.deepEqual(rebuilt.map((town) => town.pref), townsJson.towns.map((town) => town.pref));
  assert.equal(rebuilt[0].order, 0);
  assert.equal(rebuilt.at(-1).order, EXPECTED_TOWNS - 1);
});

test('定義も外接矩形も欠けていたら作らせない', () => {
  const order = ['1310100'];
  assert.throws(() => buildTowns({ area, relm: {}, points: {}, order }), /外接矩形/);
  const broken = { ...area, class15s: {} };
  assert.throws(() => buildTowns({ area: broken, relm: class20relm, points: {}, order }), /都道府県/);
});

test('land.json は120KB以内で、日本のまわりだけ持つ', () => {
  assert.ok(landText.length <= MAX_BYTES, `${landText.length} bytes`);
  assert.equal(landJson.license, 'Public Domain');
  assert.equal(landJson.source, 'Natural Earth 1:50m land');
  assert.deepEqual(landJson.bbox, [WINDOW.west, WINDOW.south, WINDOW.east, WINDOW.north]);
  assert.ok(landJson.polygons.length > 0, '陸が1つも無い＝取得に失敗したまま公開している');
  for (const ring of landJson.polygons) {
    assert.ok(ring.length >= 4, '輪が3点未満');
    for (const [lng, lat] of ring) {
      assert.ok(Number.isFinite(lng) && Number.isFinite(lat));
    }
  }
  /* 窓のどこかに掛かる輪だけを残している */
  const touches = landJson.polygons.filter((ring) => ring.some(([lng, lat]) =>
    lng >= WINDOW.west && lng <= WINDOW.east && lat >= WINDOW.south && lat <= WINDOW.north));
  assert.equal(touches.length, landJson.polygons.length);
});

test('本州がある（間引きで消えていない）', () => {
  const honshu = landJson.polygons.find((ring) => ring.some(([lng, lat]) =>
    Math.abs(lng - 139.7) < 1.5 && Math.abs(lat - 35.7) < 1.5));
  assert.ok(honshu, '関東あたりの海岸線が見つからない');
  assert.ok(honshu.length > 100, `本州の輪が ${honshu.length} 点しかない`);
});

test('間引きは端の点を残し、許容より小さいふくらみだけ落とす', () => {
  const line = [[0, 0], [1, 0.001], [2, 0], [3, 0.001], [4, 0]];
  const thin = simplify(line, TOLERANCE);
  assert.deepEqual(thin[0], [0, 0]);
  assert.deepEqual(thin.at(-1), [4, 0]);
  assert.ok(thin.length < line.length);
  const bent = simplify([[0, 0], [1, 5], [2, 0], [3, 5], [4, 0]], TOLERANCE);
  assert.equal(bent.length, 5, '大きな折れは残す');
});

test('取得できなかったときは、陸のない land.json を作って地図を海だけにする', () => {
  const empty = buildLand({ features: [] });
  assert.deepEqual(empty.polygons, []);
  assert.equal(empty.license, 'Public Domain');
});

test('窓の外だけのポリゴンは落とす', () => {
  const far = buildLand({
    features: [{ geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } }],
  });
  assert.deepEqual(far.polygons, []);
});
