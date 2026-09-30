import test from 'node:test';
import assert from 'node:assert/strict';
import { arrange } from '../lib/arrange.js';
import { FLOOR_KINDS, insideRect, placeFixture, placeProp } from '../lib/place.js';
import { FIXTURES, HOUSE, ROOMS, SLOTS, describeSlot, roomAt } from '../lib/plan.js';
import { manifest } from './helpers.mjs';

const RAD = Math.PI / 180;
const corners = (fp) => {
  const c = Math.cos(fp.yaw * RAD);
  const s = Math.sin(fp.yaw * RAD);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
    const x = a * fp.hx;
    const z = b * fp.hz;
    return [fp.cx + x * c + z * s, fp.cz - x * s + z * c];
  });
};
const insideRoomInterior = (room, [x, z], margin = 0.06) => x >= room.rect[0] + margin - 0.01 && x <= room.rect[2] - margin + 0.01 && z >= room.rect[1] + margin - 0.01 && z <= room.rect[3] - margin + 0.01;

test('家具は壁にめり込まず、自分の部屋の中に収まる', () => {
  for (const f of FIXTURES) {
    if (f.ceiling) continue;
    const p = placeFixture(manifest, f);
    const room = roomAt(f.x, f.z);
    for (const pt of corners(p.footprint)) assert.ok(insideRoomInterior(room, pt), `${f.id} の角 ${pt.map(v => v.toFixed(2))} が ${room.name} の外`);
    assert.ok(Math.abs(p.base) < 1e-6, `${f.id} が浮いている`);
  }
});

test('床に置く小物も、壁にめり込まない', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const [id, { slot, yaw }] of Object.entries(arrange(manifest, seed, 0))) {
      const s = SLOTS.find(x => x.id === slot);
      if (!FLOOR_KINDS.has(s.kind)) continue;
      const room = ROOMS.find(r => r.id === s.room);
      const p = placeProp(manifest, id, slot, yaw);
      for (const pt of corners(p.footprint)) assert.ok(insideRoomInterior(room, pt, 0.02), `${id}@${slot} の角が部屋の外`);
    }
  }
});

test('壁掛けは壁に背中を付け、置く物は面の上に乗る', () => {
  const a = arrange(manifest, 3, 0);
  for (const [id, { slot, yaw }] of Object.entries(a)) {
    const s = SLOTS.find(x => x.id === slot);
    const p = placeProp(manifest, id, slot, yaw);
    if (s.kind === 'wall' || s.kind === 'mirror') {
      assert.ok(Math.abs(p.center[1] - s.y) < 1e-6, `${id} の高さ`);
      const off = Math.hypot(p.footprint.cx - s.x, p.footprint.cz - s.z);
      assert.ok(off > 0 && off < 0.1, `${id} の壁からの離れ ${off.toFixed(3)}`);
    } else {
      assert.ok(Math.abs(p.base - s.y) < 1e-6, `${id} が ${slot} の面に乗っていない`);
    }
  }
});

test('置き場所はすべて家の中で、呼び名が付いていて、部屋の名前が重ならない', () => {
  for (const s of SLOTS) {
    assert.ok(s.x > 0 && s.x < HOUSE.width && s.z > 0 && s.z < HOUSE.depth, s.id);
    const text = describeSlot(s.id);
    assert.match(text, /^(廊下|玄関|リビング|台所|寝室|書斎)の./, s.id);
    // 評価の2周目：「台所の台所の棚」「寝室の部屋の角の床」と読み上げにくい言い方が出た
    for (const room of ROOMS) assert.ok(text.split(room.name).length <= 2, `${s.id}: ${text}`);
    assert.ok(!text.includes('部屋の'), `${s.id}: ${text}`);
  }
});

test('天板や棚の上の物は、家具の面からはみ出さない（宙に浮かない）', () => {
  const fixtures = FIXTURES.filter(f => !f.ceiling).map(f => ({ f, fp: placeFixture(manifest, f).footprint }));
  const RAD = Math.PI / 180;
  const bad = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    for (const [id, { slot, yaw }] of Object.entries(arrange(manifest, seed, seed % 3))) {
      const s = SLOTS.find(x => x.id === slot);
      if (!['top', 'shelf', 'stove', 'microwave', 'tv'].includes(s.kind)) continue;
      const host = fixtures.find(({ fp }) => insideRect(fp, s.x, s.z, 0.02));
      assert.ok(host, `${slot} の下に家具が無い`);
      const fp = placeProp(manifest, id, slot, yaw).footprint;
      const c = Math.cos(fp.yaw * RAD);
      const sn = Math.sin(fp.yaw * RAD);
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        // 物の底面の角（外形の9割。模型の外形は丸い物でも四角く数えるため少し内側で見る）
        const x = a * fp.hx * 0.9;
        const z = b * fp.hz * 0.9;
        const wx = fp.cx + x * c + z * sn;
        const wz = fp.cz - x * sn + z * c;
        if (!insideRect(host.fp, wx, wz, 0.03)) bad.add(`${id}@${slot}`);
      }
    }
  }
  assert.deepEqual([...bad], []);
});
