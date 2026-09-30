import test from 'node:test';
import assert from 'node:assert/strict';
import { arrange } from '../lib/arrange.js';
import { NavGrid } from '../lib/nav.js';
import { FLOOR_KINDS, obstacles, placeProp } from '../lib/place.js';
import { HOUSE, ROOMS, SLOTS } from '../lib/plan.js';
import { manifest } from './helpers.mjs';

test('玄関の出発点から、どの置き方でも全部の部屋へ歩いて行ける', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const grid = new NavGrid(obstacles(manifest, arrange(manifest, seed, seed % 3)));
    assert.ok(grid.isFree(HOUSE.start.x, HOUSE.start.z), '出発点が塞がっている');
    for (const r of ROOMS) {
      const cx = (r.rect[0] + r.rect[2]) / 2;
      const cz = (r.rect[1] + r.rect[3]) / 2;
      const path = grid.path(HOUSE.start.x, HOUSE.start.z, cx, cz);
      assert.ok(path && path.length >= 2, `${seed}: ${r.name}へ行けない`);
    }
  }
});

test('壁は通り抜けられない（寝室から壁に向かって歩いても台所側へ出ない）', () => {
  const grid = new NavGrid(obstacles(manifest, {}));
  let [x, z] = [3.0, 3.2];
  for (let i = 0; i < 200; i++) [x, z] = grid.move(x, z, 0, 0.05);
  assert.ok(z < 4 - 0.06, `z=${z.toFixed(2)} まで進んだ`);
});

test('道順の角と角のあいだは、まっすぐ歩ける', () => {
  const grid = new NavGrid(obstacles(manifest, arrange(manifest, 9, 0)));
  const path = grid.path(HOUSE.start.x, HOUSE.start.z, 10.8, 1.5);
  assert.ok(path);
  for (let i = 1; i < path.length; i++) assert.ok(grid.clearLine(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]));
});

test('消えた家具の跡は歩けるようになる（見えない物にぶつからない）', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const a = arrange(manifest, seed, 0);
    for (const [id, { slot, yaw }] of Object.entries(a)) {
      const s = SLOTS.find(x => x.id === slot);
      if (!FLOOR_KINDS.has(s.kind)) continue;
      const fp = placeProp(manifest, id, slot, yaw).footprint;
      const before = new NavGrid(obstacles(manifest, a));
      const after = new NavGrid(obstacles(manifest, a, [id]));
      assert.equal(before.isFree(fp.cx, fp.cz), false, `${id} の場所が最初から空いている`);
      // 壁ぎわの物は、消えても体の半径ぶんは歩けない。中心が壁から十分離れているときだけ確かめる
      const nearWall = [fp.cx, fp.cz, HOUSE.width - fp.cx, HOUSE.depth - fp.cz].some(d => d < 0.5);
      if (!nearWall && after.nearestFree(fp.cx, fp.cz, 0.5)) {
        const freed = after.blocked.reduce((n, v, i) => n + (v === 0 && before.blocked[i] === 1 ? 1 : 0), 0);
        assert.ok(freed > 0, `${id} を消しても歩ける場所が増えない`);
      }
    }
  }
});

test('押した場所が家具の上でも、その近くの歩ける点まで行く', () => {
  const grid = new NavGrid(obstacles(manifest, {}));
  const path = grid.path(HOUSE.start.x, HOUSE.start.z, 9.6, 7.0); // 食卓の真ん中
  assert.ok(path);
  const [gx, gz] = path[path.length - 1];
  assert.ok(Math.hypot(gx - 9.6, gz - 7.0) < 1.6);
});
