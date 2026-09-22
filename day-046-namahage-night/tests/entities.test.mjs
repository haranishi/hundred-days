import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateEntities,travel } from '../lib/entities.js';
import { DT,step } from '../lib/physics.js';
import { fixture,run } from './helpers.mjs';
test('カラス3マス・床4マスを決定的に往復',()=>{assert.equal(travel(2,24,48),48);assert.equal(travel(4,24,48),0);assert.equal(travel(64/24,24,64),64);let s=fixture([[8,8,'C'],[12,9,'M']]);const e=updateEntities(s.entities,s.level,s.player,2,DT);assert.equal(e[0].x,176);});
test('犬は穴の端で折り返す',()=>{let s=fixture([[5,10,'D'],[7,11,'.']]);s=run(s,240);const dog=s.entities.find(e=>e.type==='D');assert.ok(dog.x<96);assert.equal(dog.direction,-1);});
test('つららは真下に入って0.4秒後から落ちる',()=>{let s=fixture([[5,4,'^']]);s.player.x=80;s=run(s,47);let e=s.entities.find(e=>e.type==='^');assert.equal(e.y,64);s=step(s);e=s.entities.find(e=>e.type==='^');assert.ok(e.y>64);});
test('動く床に乗ると移動量を引き継ぐ',()=>{let s=fixture([[5,9,'M']]);const e=s.entities.find(e=>e.type==='M');Object.assign(s.player,{x:82,y:130,support:e.id});s=step(s);assert.ok(Math.abs(s.player.x-82.2)<1e-9);assert.equal(s.player.y,130);assert.equal(s.player.grounded,true);});
test('縦の床の上昇・下降の両方で足元が離れない',()=>{
 let s=fixture([[5,9,'M']]);const e=s.entities.find(e=>e.type==='M');e.axis='y';Object.assign(s.player,{x:82,y:130,support:e.id});
 for(let i=0;i<640;i++){s=step(s);const floor=s.entities.find(e=>e.type==='M');assert.ok(s.player.grounded,`tick ${i}`);assert.ok(Math.abs(s.player.y+s.player.h-floor.y)<1e-9);}
});

test('Rは画面外で停止し、60tickから36tick予告、96tick後に跳ぶ', () => {
  let s = fixture([[14, 10, 'R']]);
  let entities = s.entities;
  const rabbit = () => entities.find(e => e.type === 'R');
  const update = player => {
    entities = updateEntities(entities, s.level, player, 0, DT);
  };
  for (let i = 0; i < 300; i++) update({ x: -100, y: 162, w: 10, h: 14 });
  assert.equal(rabbit().ageTicks, 0);
  const player = { x: 160, y: 162, w: 10, h: 14 };
  for (let i = 0; i < 59; i++) update(player);
  assert.equal(rabbit().phase, 'waiting');
  update(player);
  assert.equal(rabbit().phase, 'warning');
  for (let i = 0; i < 35; i++) update(player);
  assert.equal(rabbit().phase, 'warning');
  update(player);
  assert.equal(rabbit().phase, 'moving');
  assert.equal(rabbit().vy, -210);
  assert.equal(rabbit().vx, 48);
  let landings = 0;
  for (let i = 0; i < 1200; i++) {
    const previous = rabbit().phase;
    update(player);
    assert.ok(rabbit().x >= 224 && rabbit().x <= 272);
    if (previous === 'moving' && rabbit().phase === 'waiting') {
      landings++;
      assert.equal(rabbit().y, 160);
      assert.equal(rabbit().vx, 0);
    }
  }
  assert.ok(landings >= 6);
});

test('Bは60tick後に方向固定、48tick予告・60tick突進・72tick休息', () => {
  const s = fixture([[10, 10, 'B']]);
  let entities = s.entities;
  let player = { x: 120, y: 162, w: 10, h: 14 };
  const boar = () => entities.find(e => e.type === 'B');
  const update = () => { entities = updateEntities(entities, s.level, player, 0, DT); };
  for (let i = 0; i < 59; i++) update();
  assert.equal(boar().phase, 'waiting');
  update();
  assert.equal(boar().phase, 'warning');
  assert.equal(boar().direction, -1);
  player = { ...player, x: 200 };
  for (let i = 0; i < 47; i++) update();
  assert.equal(boar().phase, 'warning');
  update();
  assert.equal(boar().vx, -96);
  for (let i = 0; i < 60; i++) update();
  assert.equal(boar().phase, 'resting');
  assert.ok(Math.abs(boar().x - 112) < 1e-8);
  for (let i = 0; i < 71; i++) update();
  assert.equal(boar().phase, 'resting');
  update();
  assert.equal(boar().phase, 'waiting');
});

test('Bは床端・壁の2px手前で止まる', () => {
  for (const tile of ['.', '#']) {
    const s = fixture([[10, 10, 'B'], [13, tile === '.' ? 11 : 10, tile]]);
    let entities = s.entities;
    for (let i = 0; i < 160; i++) {
      entities = updateEntities(entities, s.level, { x: 220, y: 162, w: 10, h: 14 }, 0, DT);
    }
    const b = entities.find(e => e.type === 'B');
    assert.equal(b.phase, 'resting');
    assert.ok(b.x + b.w <= 206);
  }
});

test('枝は乗って48tickで消え、240tick後も重なっている間は復帰を延期', () => {
  let s = fixture([[5, 9, '%']]);
  Object.assign(s.player, { x: 82, y: 129, vy: 150, grounded: false, coyote: 0 });
  s = step(s);
  const id = s.entities.find(e => e.type === '%').id;
  assert.equal(s.player.support, id);
  s = run(s, 23);
  assert.equal(s.entities.find(e => e.id === id).phase, 'ready');
  s = step(s);
  assert.equal(s.entities.find(e => e.id === id).phase, 'cracking');
  s = run(s, 24);
  assert.equal(s.entities.find(e => e.id === id).phase, 'absent');
  assert.equal(s.player.grounded, false);
  let entities = s.entities;
  const inside = { x: 82, y: 140, w: 10, h: 14 };
  for (let i = 0; i < 300; i++) entities = updateEntities(entities, s.level, inside, 0, DT);
  assert.equal(entities.find(e => e.id === id).phase, 'absent');
  entities = updateEntities(entities, s.level, { ...inside, x: 20 }, 0, DT);
  assert.equal(entities.find(e => e.id === id).phase, 'ready');
});

test('Mの軸と位相は面メタデータで決まり、drawYは戸口だけにある', () => {
  const s = fixture([[5, 9, 'M']], { entityOptions: { '5,9': { axis: 'y', phaseTicks: 160 } } });
  const m = s.entities.find(e => e.type === 'M');
  assert.equal(m.axis, 'y');
  assert.equal(m.y, 112);
  const next = updateEntities(s.entities, s.level, s.player, DT, DT).find(e => e.type === 'M');
  assert.ok(Math.abs(next.dy + 0.2) < 1e-8);
  assert.ok(s.entities.every(e => Object.hasOwn(e, 'drawY') === (e.type === 'G')));
});

test('敵のvisibleはカメラ窓へ初めて入るtickだけ、予告と動作は遷移時だけ', () => {
  let s = fixture([[20, 10, 'R'], [22, 10, 'B']]);
  // 戸口を移して、観測中にクリアしないよう試験地形を用意する。
  s.entities = s.entities.filter(e => e.type !== 'G');
  const visible = new Map();
  const events = [];
  for (let tick = 0; tick < 600 && s.status === 'playing'; tick++) {
    const before = new Set(visible.keys());
    s = step(s, { right: tick < 170 });
    for (const e of s.entities.filter(e => 'RB'.includes(e.type))) {
      const inside = e.x + e.w > s.player.x - 110 && e.x < s.player.x + 210;
      const seen = s.telemetry.filter(event => event.type === 'visible' && event.entityId === e.id);
      assert.equal(seen.length, inside && !before.has(e.id) ? 1 : 0);
      if (seen.length) visible.set(e.id, s.tick);
    }
    events.push(...s.telemetry);
  }
  assert.equal(visible.size, 2);
  const rabbit = s.entities.find(e => e.type === 'R');
  const warning = events.find(e => e.type === 'warning' && e.entityId === rabbit.id);
  const moving = events.find(e => e.type === 'moving' && e.entityId === rabbit.id);
  assert.ok(warning);
  assert.equal(moving.tick - warning.tick, 36);
  assert.ok(moving.tick - visible.get(rabbit.id) >= 60);
});
