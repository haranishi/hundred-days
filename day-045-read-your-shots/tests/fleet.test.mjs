import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../lib/fleet.js';
test('初波4行7列、点数と寸法', () => { const f=F.createFleet(); assert.equal(f.enemies.length,28); assert.deepEqual([0,7,21].map(i=>f.enemies[i].points),[30,20,10]); assert.equal(f.enemies[1].x-f.enemies[0].x,46); assert.equal(f.enemies[7].y-f.enemies[0].y,40); });
test('艦隊は一段ずつ横移動', () => { const f=F.createFleet(), n=F.march(f); assert.equal(n.x,12); assert.equal(f.x,0); });
test('端で反転して24降下', () => { const f=F.createFleet(); f.x=64; const n=F.march(f); assert.equal(n.y,24); assert.equal(n.direction,-1); });
test('残数が減るほど速い', () => assert.ok(F.interval(1)<F.interval(35)));
test('各列の最下行だけが射手', () => { const f=F.createFleet(); f.enemies[21].alive=false; assert.equal(F.shooters(f)[0].row,2); assert.equal(F.shooters(f).length,7); });
test('撃破された最下行は侵入判定に使わない', () => { const f=F.createFleet(); f.y=368; assert.equal(F.invaded(f),true); f.enemies.filter(e=>e.row===3).forEach(e=>e.alive=false); assert.equal(F.invaded(f),false); });
test('次波は開始位置と速度が上昇、射撃間隔には下限', () => { assert.equal(F.waveConfig(2).startY-F.waveConfig(1).startY,24); assert.ok(F.interval(35,2)<F.interval(35,1)); assert.equal(F.waveConfig(100).fireInterval,.22); });
test('矩形に艦隊とひるみの変位が反映される', () => { const f=F.createFleet(); f.x=12; f.offset=16; assert.equal(F.enemyRect(f,f.enemies[0]).x,109); });

test('2〜3波は5行35隻、種類c/b/b/a/a',()=>{const f=F.createFleet(2);assert.equal(f.enemies.length,35);assert.deepEqual([0,7,14,21,28].map(i=>f.enemies[i].type),['c','b','b','a','a']);assert.equal(f.enemies[0].x,96);});
test('歩みと敵弾の指定間隔',()=>{assert.equal(F.interval(28),.1+.72*28/35);assert.equal(F.waveConfig(2).speed,1.22);assert.equal(F.waveConfig(1).fireInterval,5);assert.ok(Math.abs(F.waveConfig(2).fireInterval-3)<1e-12);assert.ok(Math.abs(F.waveConfig(5).fireInterval-5*.6**4)<1e-12);});
test('開始行は5波目で頭打ち',()=>{assert.deepEqual([1,2,5,6,20].map(w=>F.waveConfig(w).startY),[72,96,168,168,168]);});

test('敵数は1波28、2〜3波35、4波以降42',()=>{assert.deepEqual([1,2,3,4,10].map(w=>F.createFleet(w).enemies.length),[28,35,35,42,42]);assert.equal(F.createFleet(4).enemies[41].row,5);});


test('同時弾は初期1発、波とレベルで増え上限6', () => {
  assert.equal(F.waveConfig(1,1).burst,1);
  assert.equal(F.waveConfig(4,30).burst,6);
  assert.equal(F.waveConfig(40,30).burst,6);
});
test('全1200組：敵弾速は620以下、レベル加算は4で早期飽和しない', () => {
  assert.equal(F.ENEMY_BULLET_SPEED_MAX,620);
  for(let wave=1;wave<=40;wave++)for(let level=1;level<=30;level++) {
    const speed=F.waveConfig(wave,level).bulletSpeed;
    assert.ok(speed<=620);
    assert.equal(speed,Math.min(620,170+22*wave+4*level));
  }
  assert.equal(F.waveConfig(5,15).bulletSpeed,340);
  assert.equal(F.waveConfig(11,30).bulletSpeed,532);
});
test('同時弾は波・レベルに非減少、上限6', () => {
  for(let wave=1;wave<=40;wave++)for(let level=1;level<=30;level++) {
    const current=F.waveConfig(wave,level);
    assert.ok(current.burst>=1&&current.burst<=6);
    for(const next of [F.waveConfig(wave+1,level),F.waveConfig(wave,level+1)])
      assert.ok(next.burst>=current.burst&&next.burst<=6);
  }
});
test('射撃間隔は波・レベルに非増加、下限0.22秒、序盤も共通式', () => {
  for(let wave=1;wave<=40;wave++)for(let level=1;level<=30;level++) {
    const current=F.waveConfig(wave,level);
    assert.ok(current.fireInterval>=.22);
    assert.equal(current.fireInterval,Math.max(.22,5*.6**(wave-1)*.9**(level-1)));
    for(const next of [F.waveConfig(wave+1,level),F.waveConfig(wave,level+1)])
      assert.ok(next.fireInterval<=current.fireInterval&&next.fireInterval>=.22);
  }
});
test('狙いのばらつきは全ウェーブ・レベルで8px以上', () => {
  for(let wave=1;wave<=40;wave++)for(let level=1;level<=30;level++)
    assert.ok(F.waveConfig(wave,level).aimSpread>=8);
  assert.equal(F.waveConfig(40,30).aimSpread,8);
});
test('全1200組：行進は指定式で加速し上限4', () => {
  for(let wave=1;wave<=40;wave++)for(let level=1;level<=30;level++) {
    const speed=F.waveConfig(wave,level).speed;
    assert.ok(speed<=4);
    assert.equal(speed,Math.min(4,1+.22*(wave-1)+.05*Math.max(0,level-10)));
  }
});
test('全1200組：隻数はレベルによらず28・35・35・42、上限42', () => {
  for(let wave=1;wave<=40;wave++)for(let level=1;level<=30;level++) {
    const count=F.createFleet(wave,level).enemies.length;
    assert.equal(count,[28,35,35,42][Math.min(wave,4)-1]);
    assert.ok(count<=42);
  }
});
