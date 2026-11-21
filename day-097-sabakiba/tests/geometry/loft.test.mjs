import test from 'node:test';
import assert from 'node:assert/strict';
import { loft } from '../../lib/loft.js';

test('凹んだ輪の斜めの蓋でも、一直線上の全辺を共有して閉じます', () => {
  const section = [[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2], [0, 1]];
  for (const order of [section, [...section].reverse()]) {
    const geo = loft([0, 3].map(x => order.map(([y, z]) => ({ p: [x + y * 0.3, y, z], tag: y === 2 ? 2 : 4 }))));
    const attr = geo.attributes.position, edges = new Map();
    let volume = 0;
    for (let i = 0; i < geo.index.count; i += 3) {
      const triangle = Array.from(geo.index.array.slice(i, i + 3), j => [attr.getX(j), attr.getY(j), attr.getZ(j)]);
      for (let j = 0; j < 3; j++) {
        const key = [triangle[j].join(','), triangle[(j + 1) % 3].join(',')].sort().join('|');
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
      const [[x,y,z], [a,b,c], [d,e,f]] = triangle;
      volume += (x*(b*f-c*e) + y*(c*d-a*f) + z*(a*e-b*d)) / 6;
    }
    assert.ok([...edges.values()].every(n => n === 2));
    assert.ok(Math.abs(volume - 9) < 1e-6);
    assert.deepEqual([...new Set(geo.attributes.aSeg.array)].sort(), [2, 3, 4]);
  }
});

test('殻の両端と側縁は開き、指定した法線・UVを保持します', () => {
  const geo = loft([0, 1].map(x => [0, 1, 2].map(y => ({ p: [x,y,0], n: [0,0,-1], uv: [x,y/2], tag: 0 }))),
    { wrap: false, flip: false });
  assert.equal(geo.index.count / 3, 4);
  assert.ok(geo.attributes.aSeg.array.every(x => x === 0));
  assert.equal(geo.attributes.uv.count, 6);
  assert.equal(geo.attributes.normal.getZ(0), -1);
});
