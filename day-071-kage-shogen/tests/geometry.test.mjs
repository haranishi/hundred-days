import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GRID, castShadows, depthRatio, flattenShape, iou, maskArea, placePolygons, project, propShadow, rasterize, shadowMask,
} from '../lib/geometry.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const rect = (left, bottom, right, top) => [[left, bottom], [right, bottom], [right, top], [left, top]];

test('rect と trap は中心・上下の辺から4点の輪郭になる', () => {
  assert.deepEqual(flattenShape([['rect', 10, 20, 8, 6]]), [rect(6, 17, 14, 23)]);
  assert.deepEqual(flattenShape([['trap', 10, 20, 4, 8, 6]]), [
    [[6, 17], [14, 17], [12, 23], [8, 23]],
  ]);
});

test('circle は半径を保つ28点、ellipse は回転した輪郭になる', () => {
  const [circle] = flattenShape([['circle', 10, 20, 7]]);
  assert.equal(circle.length, 28);
  for (const [x, y] of circle) close(Math.hypot(x - 10, y - 20), 7);
  const [ellipse] = flattenShape([['ellipse', 10, 20, 8, 3, 90]]);
  assert.equal(ellipse.length, 28);
  close(ellipse[0][0], 10);
  close(ellipse[0][1], 28);
  for (const [x, y] of ellipse) close(((x - 10) / 3) ** 2 + ((y - 20) / 8) ** 2, 1);
});

test('arc は外周と逆順の内周を持ち、短い弧にも6分割を使う', () => {
  for (const [from, to, steps] of [[0, 180, 15], [0, 30, 6], [180, -40, 18]]) {
    const [arc] = flattenShape([['arc', 5, 10, 8, 3, from, to]]);
    assert.equal(arc.length, (steps + 1) * 2);
    arc.forEach(([x, y], index) => close(Math.hypot(x - 5, y - 10), index <= steps ? 8 : 3));
    const start = from * Math.PI / 180;
    const end = to * Math.PI / 180;
    close(arc[0][0], 5 + Math.cos(start) * 8);
    close(arc[steps][1], 10 + Math.sin(end) * 8);
    close(arc.at(-1)[0], 5 + Math.cos(start) * 3);
  }
});

test('poly は点を複製し、未知の種類と空の形は TypeError になる', () => {
  const polygon = rect(0, 0, 4, 4);
  const [copy] = flattenShape([['poly', polygon]]);
  assert.deepEqual(copy, polygon);
  assert.notStrictEqual(copy, polygon);
  assert.notStrictEqual(copy[0], polygon[0]);
  for (const shape of [[], null, undefined, [['unknown', 1, 2]]]) {
    assert.throws(() => flattenShape(shape), TypeError);
  }
});

test('placePolygons は回転・拡縮・平行移動を行い、元の形を変えない', () => {
  const polygon = Object.freeze([Object.freeze([1, 0]), Object.freeze([0, 1])]);
  const shape = Object.freeze([polygon]);
  const rotated = placePolygons(shape, { rot: 90 });
  close(rotated[0][0][0], 0);
  close(rotated[0][0][1], 1);
  assert.deepEqual(placePolygons(shape, { scale: 3 }), [[[3, 0], [0, 3]]]);
  assert.deepEqual(placePolygons(shape, { x: 10, y: 20 }), [[[11, 20], [10, 21]]]);
  const combined = placePolygons(shape, { rot: 90, scale: 2, x: 10, y: 20 });
  close(combined[0][0][0], 10);
  close(combined[0][0][1], 22);
  assert.deepEqual(placePolygons(shape), shape);
  assert.deepEqual(shape, [[[1, 0], [0, 1]]]);
  assert.notStrictEqual(rotated[0], polygon);
});

test('depthRatio は奥行きと灯りの距離を検証する', () => {
  assert.equal(depthRatio(0, 300), 1);
  assert.equal(depthRatio(150, 300), 2);
  assert.equal(depthRatio(280, 300), 15);
  for (const [z, distance] of [
    [-1, 300], [281, 300], [0, 19], [NaN, 300], [Infinity, 300], [-Infinity, 300],
    [0, NaN], [0, Infinity], [0, -Infinity], ['150', 300], [undefined, 300],
  ]) assert.throws(() => depthRatio(z, distance), RangeError);
});

test('project は灯りを中心に点を拡大する', () => {
  const shape = [[[110, 60], [100, 50]]];
  assert.deepEqual(project(shape, { x: 100, y: 50 }, 2), [[[120, 70], [100, 50]]]);
  assert.deepEqual(shape, [[[110, 60], [100, 50]]]);
});

test('rasterize は2cmのセル中心で長方形の300セルを塗る', () => {
  const mask = rasterize([rect(20, 10, 60, 40)]);
  assert.equal(mask.length, GRID.cols * GRID.rows);
  assert.equal(maskArea(mask), 300);
  assert.equal(mask[5 * GRID.cols + 10], 1);
  assert.equal(mask[19 * GRID.cols + 29], 1);
  assert.equal(mask[5 * GRID.cols + 9], 0);
  assert.equal(mask[20 * GRID.cols + 10], 0);
  assert.deepEqual(rasterize([rect(20, 10, 60, 40).reverse()]), mask);
});

test('rasterize は壁外を捨て、重なりを和集合として一度だけ数える', () => {
  assert.equal(maskArea(rasterize([])), 0);
  for (const polygon of [rect(-20, -20, -2, -2), rect(242, 0, 260, 20), rect(0, 182, 20, 200)]) {
    assert.equal(maskArea(rasterize([polygon])), 0);
  }
  const first = rect(20, 10, 60, 40);
  const second = rect(40, 10, 80, 40);
  assert.equal(maskArea(rasterize([first, second])), 450);
  assert.equal(maskArea(rasterize([first, first])), 300);
  assert.equal(maskArea(rasterize([rect(230, 170, 250, 190)])), 25);
  assert.equal(maskArea(rasterize([rect(-10, -10, 10, 10)])), 25);
});

test('セル中心が境界上なら左と下を含み、右と上を含まない', () => {
  const grid = { cell: 2, cols: 3, rows: 2 };
  assert.deepEqual([...rasterize([rect(1, 1, 3, 3)], grid)], [1, 0, 0, 0, 0, 0]);
  assert.deepEqual([...rasterize([rect(1.01, 1.01, 3.01, 3.01)], grid)], [0, 0, 0, 0, 1, 0]);
});

test('iou は同一・非重複・半分の重複・空を扱い、対称である', () => {
  const a = new Uint8Array([1, 1, 0, 0]);
  const b = new Uint8Array([0, 1, 1, 0]);
  assert.equal(iou(a, a), 1);
  assert.equal(iou(a, new Uint8Array([0, 0, 1, 1])), 0);
  assert.equal(iou(a, b), 1 / 3);
  assert.equal(iou(a, b), iou(b, a));
  assert.equal(iou(new Uint8Array(4), new Uint8Array(4)), 1);
  assert.equal(iou(a, new Uint8Array(4)), 0);
  assert.throws(() => iou(a, new Uint8Array(3)), RangeError);
});

test('propShadow は z=0 なら輪郭そのもの、比率2なら灯りから2倍になる', () => {
  const polygons = [rect(-2, -1, 2, 1)];
  const prop = { id: 'box', polygons, z: 0 };
  const placement = { x: 110, y: 60 };
  const lamp = { x: 100, y: 50 };
  assert.deepEqual(propShadow(prop, placement, lamp, 300), [rect(108, 59, 112, 61)]);
  assert.deepEqual(propShadow({ ...prop, z: 150 }, placement, lamp, 300), [rect(116, 68, 124, 72)]);
});

test('castShadows と shadowMask は複数の道具を合わせる', () => {
  const polygons = [rect(-2, -1, 2, 1)];
  const props = [{ id: 'wall', polygons, z: 0 }, { id: 'near', polygons, z: 150 }];
  const placements = { wall: { x: 20, y: 20 }, near: { x: 110, y: 60 } };
  const lamp = { x: 100, y: 50 };
  const expected = [rect(18, 19, 22, 21), rect(116, 68, 124, 72)];
  assert.deepEqual(castShadows(props, placements, lamp, 300), expected);
  assert.deepEqual(shadowMask(props, placements, lamp, 300), rasterize(expected));
  assert.equal(maskArea(shadowMask(props, placements, lamp, 300)), 10);
});

test('灯りを縦に d 動かすと、影は (1−k)·d 動く', () => {
  const polygons = [rect(-4, -2, 4, 2)];
  for (const z of [0, 100, 150]) {
    const prop = { id: 'box', polygons, z };
    const placements = { box: { x: 110, y: 70 } };
    const before = castShadows([prop], placements, { x: 100, y: 50 }, 300);
    const after = castShadows([prop], placements, { x: 100, y: 60 }, 300);
    const dy = (1 - depthRatio(z, 300)) * 10;
    before[0].forEach(([x, y], index) => {
      close(after[0][index][0], x);
      close(after[0][index][1], y + dy);
    });
    assert.deepEqual(shadowMask([prop], placements, { x: 100, y: 60 }, 300), rasterize(after));
  }
});
