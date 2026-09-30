import test from 'node:test';
import assert from 'node:assert/strict';
import { arrange } from '../lib/arrange.js';
import { NavGrid } from '../lib/nav.js';
import { obstacles } from '../lib/place.js';
import { ROOMS } from '../lib/plan.js';
import { Player } from '../lib/player.js';
import { manifest } from './helpers.mjs';

/* 体験評価の1周目で、見取り図の部屋ボタンでの移動が34回中16回、出入口や廊下で止まった（操作の手応え0点）。
   歩く人を1/60秒ずつ動かして、どの部屋からどの部屋へも着くことを確かめる。 */
const DT = 1 / 60;

function travel(player, room, limit = 14) {
  player.walkTo(room.stand.x, room.stand.z, { faceYaw: room.stand.yaw });
  for (let t = 0; t < limit; t += DT) {
    player.update(DT, {});
    if (player.failed) return { ok: false, why: '着けなかった', at: [player.x, player.z] };
    if (!player.path && Math.hypot(player.x - room.stand.x, player.z - room.stand.z) < 0.35) return { ok: true, t };
  }
  return { ok: false, why: '時間切れ', at: [player.x, player.z] };
}

test('見取り図の移動：どの部屋からどの部屋へも、止まらずに着く（30の置き方）', () => {
  const misses = [];
  for (let seed = 1; seed <= 30; seed++) {
    const a = arrange(manifest, seed, seed % 3);
    const grid = new NavGrid(obstacles(manifest, a));
    for (const from of ROOMS) {
      for (const to of ROOMS) {
        if (from === to) continue;
        const p = new Player(grid);
        p.reset({ x: from.stand.x, z: from.stand.z, yaw: from.stand.yaw });
        const r = travel(p, to);
        if (!r.ok) misses.push(`${seed}: ${from.name}→${to.name} ${r.why} (${r.at.map(v => v.toFixed(2))})`);
      }
    }
  }
  assert.deepEqual(misses, []);
});

test('着いたら、その部屋の家具が見渡せる向きに向き直る', () => {
  const grid = new NavGrid(obstacles(manifest, arrange(manifest, 5, 0)));
  const p = new Player(grid);
  const living = ROOMS.find(r => r.id === 'living');
  const r = travel(p, living);
  assert.ok(r.ok);
  for (let t = 0; t < 2; t += DT) p.update(DT, {});
  const diff = Math.abs(((p.yaw - living.stand.yaw + 540) % 360) - 180);
  assert.ok(diff < 3, `向きのずれ ${diff.toFixed(1)}度`);
});

test('評価で止まった場所（廊下の北端・書斎の出入口の前）から、南へ歩き出せる', () => {
  const grid = new NavGrid(obstacles(manifest, arrange(manifest, 525294 % 1000 || 7, 0)));
  const p = new Player(grid);
  const start = grid.nearestFree(6.7, 2.35);
  p.reset({ x: start[0], z: start[1], yaw: 180 });
  for (let t = 0; t < 1.5; t += DT) p.update(DT, { forward: 1 });
  assert.ok(p.z - start[1] > 1.0, `1.5秒で ${(p.z - start[1]).toFixed(2)}m しか進まない`);
});

test('出入口へ斜めに歩いても、枠の角で止まらずに部屋へ入れる', () => {
  const grid = new NavGrid(obstacles(manifest, {}));
  const cases = [
    { name: '寝室', from: [5.9, 3.0], yaw: 75, room: 'bedroom' },
    { name: '書斎', from: [6.1, 3.0], yaw: -75, room: 'study' },
    { name: 'リビング', from: [5.9, 5.4], yaw: 105, room: 'living' },
    { name: '台所', from: [6.1, 5.4], yaw: -105, room: 'dining' }
  ];
  for (const c of cases) {
    const p = new Player(grid);
    p.reset({ x: c.from[0], z: c.from[1], yaw: c.yaw });
    for (let t = 0; t < 3; t += DT) p.update(DT, { forward: 1 });
    const inside = c.room === 'bedroom' || c.room === 'living' ? p.x < 4.9 : p.x > 7.1;
    assert.ok(inside, `${c.name}へ入れない（${p.x.toFixed(2)}, ${p.z.toFixed(2)}）`);
  }
});

test('壁に向かって歩いても、壁との間に体の半径ぶんの距離が残る（画面が壁一色にならない）', () => {
  const grid = new NavGrid(obstacles(manifest, {}));
  const p = new Player(grid);
  p.reset({ x: 2.5, z: 5.2, yaw: 0 });
  for (let t = 0; t < 3; t += DT) p.update(DT, { forward: 1 });
  assert.ok(p.z - 4.06 >= 0.27, `壁まで ${(p.z - 4.06).toFixed(2)}m`);
});

test('今いる部屋を押したら、歩かずにその場で向き直り、部屋を見回してから元の向きに戻る', () => {
  const grid = new NavGrid(obstacles(manifest, {}));
  const p = new Player(grid);
  const dining = ROOMS.find(r => r.id === 'dining');
  p.reset({ x: 9.0, z: 8.4, yaw: 0 });
  p.faceTo(dining.stand.yaw, { sweep: true });
  let most = 0;
  for (let t = 0; t < 6; t += DT) {
    p.update(DT, {});
    most = Math.max(most, Math.abs(((p.yaw - dining.stand.yaw + 540) % 360) - 180));
  }
  assert.ok(Math.abs(p.x - 9.0) < 1e-9 && Math.abs(p.z - 8.4) < 1e-9, '歩いてしまった');
  assert.ok(most > 60, `見回しの幅 ${most.toFixed(0)}度`);
  const diff = Math.abs(((p.yaw - dining.stand.yaw + 540) % 360) - 180);
  assert.ok(diff < 1, `最後の向きのずれ ${diff.toFixed(1)}度`);
});

test('見回しの途中でドラッグしたら、見回しをやめて操作に従う', () => {
  const grid = new NavGrid(obstacles(manifest, {}));
  const p = new Player(grid);
  p.reset({ x: 9.0, z: 8.4, yaw: 0 });
  p.lookAround(0);
  for (let t = 0; t < 0.5; t += DT) p.update(DT, {});
  p.look(10, 0);
  const yaw = p.yaw;
  for (let t = 0; t < 1; t += DT) p.update(DT, {});
  assert.equal(p.yaw, yaw);
});
