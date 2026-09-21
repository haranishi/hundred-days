import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../lib/game.js';
import { MAX_LEVEL, loadout } from '../lib/upgrades.js';
import { waveConfig } from '../lib/fleet.js';
import { mulberry32 } from '../lib/rng.js';

test('決定的step測定：毎回取得でLV30まで29回、全段階が単調', t => {
  let s=createGame('playing'),count=0;
  s.invincible=100;
  const rng=mulberry32(20260921);
  while(s.level<MAX_LEVEL && count<100) {
    s.items=[{x:s.player.x-10,y:574,w:20,h:20,vy:120}];
    const before=loadout(s.level);
    s=step(s,1/60,{},rng);count++;
    const after=loadout(s.level);
    assert.ok(after.cooldown<=before.cooldown);
    for(const key of ['volleys','columns','width'])assert.ok(after[key]>=before[key]);
    assert.ok(s.events.includes('levelup'));
  }
  assert.equal(s.level,30);assert.equal(count,29);
  t.diagnostic(`LV${s.level}到達: ${count}回、cooldown非増加・volleys/columns/width非減少: pass`);
});

test('測定：ウェーブ1・4・7・10・13のburst', t => {
  const waves=[1,4,7,10,13],bursts=waves.map(w=>waveConfig(w).burst);
  assert.deepEqual(bursts,[1,2,3,4,5]);
  t.diagnostic(JSON.stringify({waves,bursts}));
});

test('決定的step測定：20秒の往復は静止より読まれ度平均が明確に低い', t => {
  const measure=moving=>{
    let s=createGame('playing'),sum=0,target=24;
    // 被弾・ゲーム終了を除外し、実際の移動・熱・読まれ度計算を比較する。
    s.invincible=100;
    const rng=mulberry32(20260921);
    for(let frame=0;frame<1200;frame++) {
      if(s.player.x===target)target=target===24?456:24;
      s=step(s,1/60,moving?{targetX:target}:{},rng);
      sum+=s.readLevel;
    }
    assert.equal(s.status,'playing');assert.ok(Math.abs(s.time-20)<1e-9);
    return sum/1200;
  };
  const stationary=measure(false),shuttle=measure(true);
  assert.ok(shuttle<stationary*.6);
  t.diagnostic(JSON.stringify({seconds:20,dt:1/60,frames:1200,stationary,shuttle}));
});
