import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundsOf, centerLatitudeOf, dropSliverHoles, keepMainParts, normalizeShape, partArea, positionIn, projectParts } from '../lib/geo.js';

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* 検算しやすいよう、テストの図形はすべて赤道近くの正方形にする。
   経度の縮み cos(緯度) がほぼ 1 なので、投影の前後で長さがほとんど変わらない。 */
/* ring は点の並び、part は [外側リング, 穴リング…]、parts は part の並び（GeoJSON の MultiPolygon と同じ入れ子） */
const ring = (left, top, size) => [
  [left, top], [left + size, top], [left + size, top + size], [left, top + size], [left, top],
];
const parts = (left, top, size) => [[ring(left, top, size)]];
const boxOf = (rings) => {
  const points = rings.flatMap((ring) => {
    const list = [];
    for (let index = 0; index < ring.length; index += 2) list.push([ring[index], ring[index + 1]]);
    return list;
  });
  return boundsOf([[points]]);
};

test('geo: normalizeShape は 0〜1000 の整数に収め、長い辺を 1000 にする', () => {
  const { rings } = normalizeShape(parts(10, 10, 4));
  assert.equal(rings.length, 1);
  for (const value of rings[0]) {
    assert.ok(Number.isInteger(value), `整数でない: ${value}`);
    assert.ok(value >= 0 && value <= 1000, `範囲外: ${value}`);
  }
  const box = boxOf(rings);
  assert.equal(Math.max(box.maxX - box.minX, box.maxY - box.minY), 1000);
});

test('geo: normalizeShape は縦横比を保ち、短い辺を中央へ寄せる', () => {
  // 経度2度 × 緯度1度 ＝ 横長。短い辺は 1000 の半分になり、上下に等しく余白が付く
  const { rings } = normalizeShape([[[[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]]]]);
  const box = boxOf(rings);
  assert.equal(box.maxX - box.minX, 1000);
  assert.ok(Math.abs((box.maxY - box.minY) - 500) <= 2, `短い辺が 500 付近でない: ${box.maxY - box.minY}`);
  assert.ok(Math.abs(box.minY - (1000 - box.maxY)) <= 1, '中央寄せになっていない');
});

test('geo: normalizeShape は穴を残し、連続した重複点を落とす', () => {
  const outer = [[0, 0], [10, 0], [10, 0], [10, 10], [0, 10], [0, 0]];   // [10,0] が重複
  const hole = [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]];
  const { rings } = normalizeShape([[outer, hole]]);
  assert.equal(rings.length, 2, '穴が消えた');
  assert.equal(rings[0].length / 2, 4, '重複点が残っている');
  const holeBox = boxOf([rings[1]]);
  const outerBox = boxOf([rings[0]]);
  assert.ok(holeBox.minX > outerBox.minX && holeBox.maxX < outerBox.maxX, '穴が外側の内に入っていない');
});

test('geo: normalizeShape は点が4つに満たないリングを捨てる', () => {
  // 巨大な外側の中に置いた極小の穴は、整数へ丸めると1点に潰れる
  const outer = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
  const speck = [[50, 50], [50.01, 50], [50.01, 50.01], [50, 50.01], [50, 50]];
  const { rings } = normalizeShape([[outer, speck]]);
  assert.equal(rings.length, 1);
});

test('geo: normalizeShape はリングを閉じずに返す（描く側が Z で閉じる）', () => {
  const { rings } = normalizeShape(parts(0, 0, 10));
  const ring = rings[0];
  assert.notDeepEqual([ring[0], ring[1]], [ring[ring.length - 2], ring[ring.length - 1]]);
});

test('geo: keepMainParts は面積が最大の1%に満たない部分を捨てる', () => {
  const main = ring(0, 0, 10);                 // 面積 100
  const big = ring(12, 0, 1.1);                // 面積 1.21 ＝ 1.21%
  const small = ring(12, 3, 0.9);              // 面積 0.81 ＝ 0.81%
  const kept = keepMainParts([[main], [big], [small]]);
  assert.equal(kept.length, 2);
  assert.deepEqual(kept[0], [main], '最大の部分が先頭に来ていない');
  assert.deepEqual(kept[1], [big]);
});

test('geo: keepMainParts は外接矩形の対角線の1.5倍より遠い部分を捨てる', () => {
  const main = ring(0, 0, 10);                 // 対角線 ≒ 14.1・中心 (5, -5)
  const near = ring(14, 0, 3);                 // 中心 (15.5, -1.5) → 距離 ≒ 11
  const far = ring(40, 0, 3);                  // 中心 (41.5, -1.5) → 距離 ≒ 36.7
  const kept = keepMainParts([[main], [near], [far]]);
  assert.equal(kept.length, 2);
  assert.deepEqual(kept[1], [near]);
  // しきい値は呼ぶ側から緩められる／締められる。ただし遠い帯では面積10%が要るので、
  // 距離だけ広げても 9% の far は残らない
  assert.equal(keepMainParts([[main], [near], [far]], { distanceRatio: 3 }).length, 2);
  assert.equal(keepMainParts([[main], [near], [far]], { distanceRatio: 3, farMinAreaRatio: 0.05 }).length, 3);
  assert.equal(keepMainParts([[main], [near], [far]], { distanceRatio: 0.5 }).length, 1);
});

test('geo: keepMainParts は 1.0〜1.5 倍の帯にある部分に面積10%を求める', () => {
  const main = ring(0, 0, 10);                      // 面積 100・対角線 ≒ 14.1・中心 (5, -5)
  // 中心が対角線の 1.2 倍ほど離れた位置（距離 ≒ 17）に、大きさちがいの島を1つずつ置く
  const chunk = ring(19, 8.5, 4);                   // 面積 16 ＝ 16%
  const speck = ring(19, 8.5, 2.5);                 // 面積 6.25 ＝ 6.25%
  const distanceOf = (part) => {
    const [[x0, y0]] = part;
    return Math.hypot(x0 + 2 - 5, -(y0 + 2) + 5);   // だいたいの中心どうしの距離
  };
  assert.ok(distanceOf(chunk) > 14.1 && distanceOf(chunk) < 14.1 * 1.5, '帯の中に置けていない');
  assert.equal(keepMainParts([[main], [chunk]]).length, 2, '10%以上の島まで落としている');
  assert.equal(keepMainParts([[main], [speck]]).length, 1, '10%未満の島が残っている');
  // 1.0 倍以内なら 6.25% でも残る（近い島の条件は 1% のまま）
  const nearSpeck = ring(13, 3, 2.5);
  assert.equal(keepMainParts([[main], [nearSpeck]]).length, 2);
  // しきい値は呼ぶ側から動かせる
  assert.equal(keepMainParts([[main], [speck]], { farMinAreaRatio: 0.05 }).length, 2);
  assert.equal(keepMainParts([[main], [nearSpeck]], { nearRatio: 0.1 }).length, 1);
});

test('geo: keepMainParts は distanceRatio を縮めると中間の帯が消える（県の輪郭の呼び方）', () => {
  const main = ring(0, 0, 10);
  const chunk = ring(19, 8.5, 4);                   // 1.2 倍の位置・16%
  assert.equal(keepMainParts([[main], [chunk]]).length, 2, '市区町村の既定では残る');
  assert.equal(keepMainParts([[main], [chunk]], { distanceRatio: 1 }).length, 1, '県の輪郭では落ちる');
});

test('geo: keepMainParts は面積で穴を差し引き、1つだけの部分はそのまま返す', () => {
  const solid = ring(0, 0, 10);
  const shell = [ring(20, 0, 10), ring(20.5, 0.5, 9)];   // 面積 100 − 81 ＝ 19
  assert.equal(Math.round(partArea(shell)), 19);
  const kept = keepMainParts([[solid], shell]);
  assert.deepEqual(kept[0], [solid], '面積は穴を引いた値で比べていない');
  assert.equal(keepMainParts([[solid]]).length, 1);
  assert.equal(keepMainParts([]).length, 0);
});

test('geo: dropSliverHoles は糸のような穴を落とし、四角い穴は残す', () => {
  const outer = ring(0, 0, 100);                                    // 面積 10000
  const box = ring(40, 40, 8);                                      // 面積 64 ＝ 0.64%・等周比 ≒ 0.785
  // 幅 0.3・長さ 60 の糸（面積 18 ＝ 0.18%・等周比 ≒ 0.0019）。旧境界に沿って残る隙間の形
  const thread = [[20, 20], [80, 20], [80, 20.3], [20, 20.3], [20, 20]];
  const kept = dropSliverHoles([[outer, box, thread]]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].length, 2, '穴が1つだけ残っていない');
  assert.deepEqual(kept[0][1], box, '四角い穴まで落としている');
  // 外側リングは細長くても触らない（島の取捨は keepMainParts の担当）
  assert.deepEqual(dropSliverHoles([[thread]]), [[thread]]);
});

test('geo: dropSliverHoles は面積が小さすぎる穴も落とす（しきい値は動かせる）', () => {
  const outer = ring(0, 0, 100);                                    // 面積 10000
  const speck = ring(50, 50, 2);                                    // 面積 4 ＝ 0.04%・形は正方形
  assert.equal(dropSliverHoles([[outer, speck]])[0].length, 1, '点にしかならない穴が残っている');
  assert.equal(dropSliverHoles([[outer, speck]], { minAreaRatio: 0.0001 })[0].length, 2);
  const box = ring(40, 40, 8);                                      // 0.64%・残る大きさ
  assert.equal(dropSliverHoles([[outer, box]])[0].length, 2);
  assert.equal(dropSliverHoles([[outer, box]], { minIsoperimetric: 0.9 })[0].length, 1);
});

test('geo: positionIn は県と同じ枠での中心と長い辺を返す', () => {
  const pref = parts(0, 0, 10);
  const { frame } = normalizeShape(pref);
  const town = parts(2, 2, 1);
  const { pos: [cx, cy, size], far } = positionIn(frame, projectParts(town, frame.centerLatitude));
  // 経度2〜3度＝枠の左から2〜3割、緯度2〜3度＝北が上なので下から7〜8割の位置
  assert.ok(Math.abs(cx - 250) <= 3, `cx=${cx}`);
  assert.ok(Math.abs(cy - 750) <= 3, `cy=${cy}`);
  assert.ok(Math.abs(size - 100) <= 2, `size=${size}`);
  assert.equal(far, false);
  // 県そのものを渡せば枠いっぱい
  const whole = positionIn(frame, projectParts(pref, frame.centerLatitude));
  assert.equal(whole.pos[2], 1000);
  assert.equal(whole.far, false);
  assert.equal(positionIn(frame, []), null, '測れないときは null');
  assert.equal(positionIn(null, projectParts(town, 0)), null);
});

test('geo: positionIn は枠の外に出た町に far を立て、pos は縁へ寄せる', () => {
  const { frame } = normalizeShape(parts(0, 0, 10));
  // 県より5度ぶん北にある離島の町。県の輪郭からは落としてあるので枠の上に出る
  const north = positionIn(frame, projectParts(parts(2, 15, 1), frame.centerLatitude));
  assert.equal(north.far, true);
  assert.equal(north.pos[1], 0, '上の縁に寄っていない');
  assert.ok(north.pos[0] > 200 && north.pos[0] < 300, '横の位置まで潰してはいけない');
  // 東へ出た場合は右の縁へ
  const east = positionIn(frame, projectParts(parts(20, 2, 1), frame.centerLatitude));
  assert.equal(east.far, true);
  assert.equal(east.pos[0], 1000);
  // 枠の隅ぎりぎりの町は far にしない（中心が枠の中にあるかどうかだけで決める）
  const corner = positionIn(frame, projectParts(parts(9.5, 9.5, 1), frame.centerLatitude));
  assert.equal(corner.far, false);
});

test('geo: projectParts と centerLatitudeOf は経度を緯度に応じて縮める', () => {
  const tall = [[[[0, 30], [1, 30], [1, 50], [0, 50], [0, 30]]]];
  assert.equal(centerLatitudeOf(tall), 40);
  const [[projected]] = projectParts(tall, centerLatitudeOf(tall));
  assert.ok(Math.abs(projected[1][0] - Math.cos(40 * Math.PI / 180)) < 1e-12);
  assert.equal(projected[0][1], -30, '緯度の符号が反転していない');
});

/* ここから下は同梱データがあるときだけ。tools/build-data.mjs を走らせる前でもテストは通る */
const prefecturesPath = resolve(APP_DIR, 'data/prefectures.json');
test('geo: 同梱データが正規化の約束を守っている', { skip: !existsSync(prefecturesPath) && '同梱データ未生成' }, () => {
  const prefectures = JSON.parse(readFileSync(prefecturesPath, 'utf8'));
  assert.equal(prefectures.items.length, 47);
  assert.equal(prefectures.items.reduce((total, item) => total + item.towns, 0), 1741);
  const shapes = [...prefectures.items.map((item) => item.shape.rings)];
  for (const code of ['01', '05', '13', '47']) {
    const towns = JSON.parse(readFileSync(resolve(APP_DIR, `data/towns/${code}.json`), 'utf8'));
    for (const item of towns.items) {
      shapes.push(item.shape.rings);
      assert.equal(item.pos.length, 3);
      for (const value of item.pos) assert.ok(Number.isInteger(value) && value >= 0 && value <= 1000);
      // far は立っているときだけ書く。false を持つ項目があってはいけない
      assert.ok(!('far' in item) || item.far === true, `${item.name} の far が true 以外`);
    }
  }
  for (const rings of shapes) {
    assert.ok(rings.length >= 1);
    for (const ring of rings) {
      assert.equal(ring.length % 2, 0);
      assert.ok(ring.length >= 8, 'リングの点が4つに満たない');
      for (const value of ring) assert.ok(Number.isInteger(value) && value >= 0 && value <= 1000, `範囲外: ${value}`);
    }
    const box = boxOf(rings);
    assert.equal(Math.max(box.maxX - box.minX, box.maxY - box.minY), 1000, '長い辺が 1000 でない');
  }
});
