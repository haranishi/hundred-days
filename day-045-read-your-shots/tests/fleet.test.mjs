import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../lib/fleet.js';
test('初波4行7列、点数と寸法', () => { const f=F.createFleet(); assert.equal(f.enemies.length,28); assert.deepEqual([0,7,21].map(i=>f.enemies[i].points),[30,20,10]); assert.equal(f.enemies[1].x-f.enemies[0].x,46); assert.equal(f.enemies[7].y-f.enemies[0].y,40); });
test('艦隊は一段ずつ横移動', () => { const f=F.createFleet(), n=F.march(f); assert.equal(n.x,12); assert.equal(f.x,0); });
test('端で反転して24降下', () => { const f=F.createFleet(); f.x=64; const n=F.march(f); assert.equal(n.y,24); assert.equal(n.direction,-1); });
test('残数が減るほど速い', () => assert.ok(F.interval(1)<F.interval(35)));
test('各列の最下行だけが射手', () => { const f=F.createFleet(); f.enemies[21].alive=false; assert.equal(F.shooters(f)[0].row,2); assert.equal(F.shooters(f).length,7); });
test('撃破された最下行は侵入判定に使わない', () => { const f=F.createFleet(); f.y=368; assert.equal(F.invaded(f),true); f.enemies.filter(e=>e.row===3).forEach(e=>e.alive=false); assert.equal(F.invaded(f),false); });
test('次波は開始位置と速度が上昇、射撃間隔には下限', () => { assert.equal(F.waveConfig(2).startY-F.waveConfig(1).startY,24); assert.ok(F.interval(35,2)<F.interval(35,1)); assert.equal(F.waveConfig(100).fireInterval,.45); });
test('矩形に艦隊とひるみの変位が反映される', () => { const f=F.createFleet(); f.x=12; f.offset=16; assert.equal(F.enemyRect(f,f.enemies[0]).x,109); });

test('2波以降は5行35隻、種類c/b/b/a/a',()=>{const f=F.createFleet(2);assert.equal(f.enemies.length,35);assert.deepEqual([0,7,14,21,28].map(i=>f.enemies[i].type),['c','b','b','a','a']);assert.equal(f.enemies[0].x,96);});
test('歩みと敵弾の指定間隔',()=>{assert.equal(F.interval(28),.1+.72*28/35);assert.equal(F.waveConfig(2).speed,1.18);assert.equal(F.waveConfig(1).fireInterval,1.7);assert.ok(Math.abs(F.waveConfig(2).fireInterval-1.7*.85)<1e-12);assert.ok(Math.abs(F.waveConfig(5).fireInterval-1.7*.85**4)<1e-12);});
test('開始行は5波目で頭打ち',()=>{assert.deepEqual([1,2,5,6,20].map(w=>F.waveConfig(w).startY),[72,96,168,168,168]);});
