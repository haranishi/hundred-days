import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../lib/game.js';
import { createFleet, waveConfig } from '../lib/fleet.js';

const advance = (s, dt = 0.01) => step(s, dt, {}, () => 0.99);
const bullet = (x, y) => ({ x, y, w: 4, h: 16, bonus: false });

test('自弾の下端が56以下なら消え、56より下なら残る', () => {
  const s = createGame('playing');
  s.shotCooldown = 1;
  s.bullets = [bullet(0, 39), bullet(0, 40), bullet(0, 41)];
  const next = advance(s, 0);
  assert.deepEqual(next.bullets.map(b => b.y), [41]);
  assert.equal(advance(next).bullets.length, 0);
});

test('waveConfigの最上段へ下から飛んだ自弾が命中する', () => {
  for (const wave of [1, 2, 3, 4, 5, 8]) {
    let s = createGame('playing');
    s.wave = wave;
    s.fleet = createFleet(wave);
    s.shotCooldown = 1;
    const enemy = s.fleet.enemies[0];
    assert.equal(enemy.y, waveConfig(wave).startY);
    // 下の行に先に当たるので最上段の1隻だけ残す。全滅すると浮き文字が置き換わるため最後尾も残す。
    s.fleet.enemies.forEach((e, i) => { e.alive = i === 0 || i === s.fleet.enemies.length - 1; });
    s.bullets = [bullet(enemy.x, enemy.y + 35)];
    for (let i = 0; i < 4; i++) s = advance(s);
    assert.equal(s.fleet.enemies[0].alive, false);
    assert.equal(s.score, enemy.points);
    assert.equal(s.bullets.length, 0);
  }
});

function twoTargets(dx, dy) {
  const s = createGame('playing');
  s.shotCooldown = 1;
  // 他の敵を残し、全滅時のメッセージ置き換えを避ける。
  const [a, b] = s.fleet.enemies;
  Object.assign(a, { x: 100, y: 250, points: 20 });
  Object.assign(b, { x: 100 + dx, y: 250 + dy, points: 10 });
  s.bullets = [bullet(a.x, a.y + 8.6), bullet(b.x, b.y + 8.6)];
  return s;
}

test('縦横28px未満で同時撃破すると得点文字1件に合算する', () => {
  const s = advance(twoTargets(27, 27));
  assert.equal(s.kills, 2);
  assert.equal(s.score, 30);
  assert.deepEqual(s.floats, [{ x: 100, y: 250, life: 0.9, kind: 'score', points: 30, text: '+30' }]);
});

test('どちらかの軸で28px以上離れた同時撃破は得点文字2件を保つ', () => {
  for (const [dx, dy] of [[28, 0], [0, 28], [80, 80]]) {
    const s = advance(twoTargets(dx, dy));
    assert.equal(s.kills, 2);
    assert.deepEqual(s.floats.map(f => f.text), ['+20', '+10']);
  }
});

test('合算は既存の浮上後の位置を保ち寿命を0.9秒に戻す', () => {
  const s = twoTargets(20, 20);
  s.bullets = s.bullets.slice(0, 1);
  s.floats = [{ x: 95, y: 245, life: 0.2, kind: 'score', points: 10, text: '+10' }];
  const next = advance(s);
  assert.deepEqual(next.floats, [{ x: 95, y: 245 - 18 * 0.01, life: 0.9, kind: 'score', points: 30, text: '+30' }]);
});

test('レベル・ウェーブ・裏をかいたの文字は得点文字に合算しない', () => {
  const s = twoTargets(20, 20);
  s.floats = [
    { kind: 'level', text: 'LV2 連射が速くなった' },
    { text: 'ウェーブ1 クリア +50' },
    { text: '裏をかいた ×2' },
    { text: '+100' },
  ].map(f => ({ ...f, x: 100, y: 250, life: 1 }));
  const next = advance(s);
  assert.deepEqual(next.floats.slice(0, 4), s.floats.map(f => ({ ...f, y: f.y - 0.18, life: 0.99 })));
  assert.equal(next.floats.length, 5);
  assert.equal(next.floats[4].text, '+30');
});
