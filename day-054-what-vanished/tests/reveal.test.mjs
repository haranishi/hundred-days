import test from 'node:test';
import assert from 'node:assert/strict';
import { arrange } from '../lib/arrange.js';
import { NavGrid } from '../lib/nav.js';
import { obstacles, placeProp } from '../lib/place.js';
import { SLOTS, roomAt } from '../lib/plan.js';
import { revealViewpoint } from '../lib/reveal.js';
import { manifest } from './helpers.mjs';

test('答え合わせの視点は、歩ける場所で、物と同じ部屋から物の方を向く', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const a = arrange(manifest, seed, 0);
    for (const [id, { slot, yaw }] of Object.entries(a)) {
      const grid = new NavGrid(obstacles(manifest, a, [id]));
      const s = SLOTS.find(x => x.id === slot);
      const p = placeProp(manifest, id, slot, yaw);
      const v = revealViewpoint(grid, p.center, s.rot, 0.4, s.room);
      assert.ok(grid.isFree(v.x, v.z), `${id}@${slot}: 視点が歩けない場所`);
      const room = roomAt(v.x, v.z).id;
      assert.ok(room === s.room || (s.room === 'hall' && room === 'entrance') || (s.room === 'entrance' && room === 'hall'), `${id}@${slot}: 視点が ${room}`);
      const toward = [p.center[0] - v.x, p.center[2] - v.z];
      const look = [-Math.sin(v.yaw * Math.PI / 180), -Math.cos(v.yaw * Math.PI / 180)];
      const cos = (toward[0] * look[0] + toward[1] * look[1]) / Math.hypot(...toward);
      assert.ok(cos > 0.99, `${id}@${slot}: 物の方を向いていない`);
    }
  }
});
