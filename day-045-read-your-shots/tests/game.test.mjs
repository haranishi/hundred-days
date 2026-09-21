import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, snapshot, autoInput } from '../lib/game.js';
import { HEAT_MAX, HEAT_DECAY_SECONDS, heatOf } from '../lib/lanes.js';
import { waveConfig, ENEMY_BULLETS_MAX } from '../lib/fleet.js';
import { mulberry32 } from '../lib/rng.js';
const run=(s,seconds,input={},rng=()=>.99)=>{for(let i=0;i<Math.round(seconds*60);i++)s=step(s,1/60,input,rng);return s;};
test('emptyとpausedでは進まない',()=>{for(const status of ['empty','paused','over']) {const s=createGame(status);assert.equal(step(s,.02,{}),s);}});
test('入力状態を破壊しない',()=>{const s=createGame('playing');step(s,.02,{});assert.equal(s.bullets.length,0);assert.equal(s.time,0);});
test('左右移動を画面に収める',()=>{let s=run(createGame('playing'),2,{left:true});assert.equal(s.player.x,24);s=run(s,2,{right:true});assert.equal(s.player.x,456);});
test('LV1同時2発・250ms間隔・速さ860',()=>{let s=step(createGame('playing'),.01,{},()=>.99);assert.equal(s.bullets[0].y,568-8.6);s=run(s,.2,{});assert.equal(s.bullets.length,1);s=run(s,.05,{});assert.equal(s.bullets.length,2);for(let i=0;i<120;i++){s=step(s,1/60,{},()=>.99);assert.ok(s.bullets.length<=2);}});
test('初期位置から最初の1隻を落とせる',()=>{for(const seed of [1,2,3,20260921]) {const s=run(createGame('playing'),.7,{},mulberry32(seed));assert.ok(s.score>=10);}});
test('熱の低い発射は2倍得点',()=>{let s=createGame('playing');s.fleet.enemies.forEach(e=>e.alive=false);const e=s.fleet.enemies[21];e.alive=true;s.bullets=[{x:e.x-2,y:e.y+10,w:4,h:16,bonus:true}];s=step(s,.01,{});assert.equal(s.score,70);assert.equal(s.kills,1);assert.equal(s.bonusKills,1);});
test('熱いレーンはひるみ、150ms後に戻り700msは再発動不可',()=>{let s=createGame('playing');s.shotHeat[6]=6;s=step(s,.01,{},()=>0);assert.equal(Math.abs(s.fleet.offset),16);s.bullets=[];s.shotCooldown=0;s=run(s,.2,{});assert.equal(s.fleet.offset,0);s=step(s,.01,{},()=>0);assert.equal(s.fleet.offset,0);});
test('200msごとに居場所が蓄積',()=>{const s=run(createGame('playing'),1);assert.equal(s.positions.length,5);assert.ok(Math.abs(s.predictedX-264)<1e-10);});
test('被弾でライフ減少、1.2秒艦隊停止、復帰',()=>{let s=createGame('playing');s.enemyBullets=[{x:264,y:584,w:6,h:12,vx:0,vy:0}];s=step(s,.01,{});assert.equal(s.lives,2);assert.equal(s.invincible,1.2);const f=s.fleet.x;s=run(s,1,{});assert.equal(s.fleet.x,f);assert.equal(s.lives,2);s=run(s,.3,{});assert.equal(s.invincible,0);});
test('ライフ0で終了',()=>{let s=createGame('playing');s.lives=1;s.enemyBullets=[{x:264,y:584,w:6,h:12,vx:0,vy:0}];assert.equal(step(s,.01,{}).status,'over');});
test('侵入でも終了',()=>{let s=createGame('playing');s.fleet.y=368;assert.equal(step(s,.01,{}).status,'over');});
test('全滅で報酬、1.5秒の空白、その後35隻と3秒の猶予',()=>{let s=createGame('playing');s.fleet.enemies.forEach(e=>e.alive=false);s=step(s,.01,{});assert.equal(s.wave,2);assert.equal(s.score,50);assert.equal(s.waveTransition,1.5);assert.equal(s.floats[0].text,'ウェーブ1 クリア +50');assert.ok(s.events.includes('wave'));assert.ok(s.events.includes('levelup'));assert.equal(s.level,2);s=run(s,1.4,{});assert.equal(s.fleet.enemies.filter(e=>e.alive).length,0);assert.equal(s.enemyBullets.length,0);s=run(s,.1);assert.equal(s.fleet.enemies.filter(e=>e.alive).length,35);assert.equal(s.waveTime,0);s=run(s,3);assert.equal(s.enemyBullets.length,0);const score=s.score;s.fleet.enemies.forEach(e=>e.alive=false);s=step(s,.01);assert.equal(s.score,score+100);});
test('敵弾は現在地でなく履歴を狙う',()=>{let s=createGame('playing');s.positions=Array(50).fill(40);s.player.x=450;s.waveTime=3;s.enemyClock=8;s=step(s,.01,{},()=>.99);assert.ok(s.enemyBullets[0].vx<0);assert.equal(s.predictedX,40);});
test('snapshotは書き換えても本体を変えない',()=>{const s=createGame();const p=snapshot(s);p.fleet.offset=99;p.heat[0]=1;assert.equal(s.fleet.offset,0);assert.equal(s.heat[0],0);});
test('自動操縦は固定seedで再現し18秒遊べる',()=>{const play=()=>{let s=createGame('playing'),rng=mulberry32(20260921);for(let i=0;i<1080;i++)s=step(s,1/60,autoInput(s),rng);return s;};const s=play();assert.deepEqual(s,play());assert.ok(s.score>0);assert.equal(s.status,'playing');});

test('開幕3秒は敵弾0、その後LV1は5秒間隔',()=>{let s=run(createGame('playing'),3);assert.equal(s.enemyBullets.length,0);s=run(s,4.95);assert.equal(s.enemyBullets.length,0);s=run(s,.05);assert.equal(s.enemyBullets.length,1);s.enemyBullets=[];s=run(s,4.95);assert.equal(s.enemyBullets.length,0);s=run(s,.05);assert.equal(s.enemyBullets.length,1);});
test('敵弾の速度と波ごとの狙いのばらつき',()=>{for(const wave of [1,2,3,8])for(const random of [0,.5,.999]){let s=createGame('playing');s.wave=wave;s.waveTime=3;s.enemyClock=8;s=step(s,.01,{},()=>random);const b=s.enemyBullets[0];assert.ok(Math.abs(Math.hypot(b.vx,b.vy)-waveConfig(wave).bulletSpeed)<1e-9);const x=b.x-b.vx*.01,y=b.y-b.vy*.01;const target=x+(s.player.y-y)*b.vx/b.vy;assert.ok(Math.abs(target-(s.predictedX+(random*2-1)*waveConfig(wave).aimSpread))<1e-9);}});
test('3波から2回に1回24pxひるむ',()=>{for(const wave of [1,2,3,4]){let s=createGame('playing');s.wave=wave;for(let n=1;n<=4;n++){s.bullets=[];s.shotCooldown=0;s.fleet.flinchCooldown=0;s=step(s,.01,{},()=>0);assert.equal(Math.abs(s.fleet.offset),wave>=3&&n%2===0?24:16);}}});
test('実発射8回で60以上、移動射撃と時間経過で低下',()=>{let s=createGame('playing'),shots=0;while(shots<8){s=step(s,1/60,{},()=>.99);if(s.events.includes('fire'))shots++;}assert.ok(s.readLevel>=60);const high=s.readLevel;for(let i=0;i<240;i++)s=step(s,1/60,{targetX:Math.floor(i/60)%2?456:24},()=>.99);assert.ok(s.readLevel<high);const old=s.shotHeat[6];s=run(s,1,{targetX:24});assert.ok(s.shotHeat[6]<old);});
test('自動操縦は往復し続け、迫る弾を避け、読まれ度を低く保つ',()=>{
  assert.equal(autoInput(createGame('playing')).targetX,24);
  const t=createGame('playing');t.player.x=264;t.enemyBullets=[{x:280,y:400,w:6,h:12,vx:0,vy:200}];
  assert.equal(autoInput(t).targetX,134);
  // アイテムの真下で止まると熱が振り切れる。落ちていても居座らないこと。
  const held=createGame('playing');held.player.x=240;held.items=[{x:230,y:300,w:20,h:20,vy:120}];
  const a=autoInput(held).targetX;held.time=1.1;
  assert.notEqual(autoInput(held).targetX,a);
  let s=createGame('playing');const rng=mulberry32(20260921);const levels=[];
  for(let i=0;i<60*30;i++){s=step(s,1/60,autoInput(s),rng);if(i%30===0)levels.push(s.readLevel);}
  assert.equal(s.lives,3);
  const mean=levels.reduce((a,b)=>a+b,0)/levels.length;
  assert.ok(mean<45,`自動操縦の読まれ度の平均が高い: ${mean.toFixed(0)}`);
});

test('ウェーブ通過は報酬とレベルの2件を高さを分けて表示',()=>{let s=createGame('playing');s.floats=[{x:100,y:400,life:.9,text:'+30'},{x:200,y:300,life:.5,text:'裏をかいた ×2'}];s.fleet.enemies.forEach(e=>{e.alive=false;});s=step(s,.01,{});assert.equal(s.floats.length,2);assert.equal(s.floats[1].y,390);assert.equal(s.floats[1].text,'LV2 連射が速くなった');assert.equal(s.floats[0].text,'ウェーブ1 クリア +50');assert.equal(s.floats[0].y,250);});
test('▽の意味は4秒以降に重なった最初の1回だけ',()=>{const hinted=s=>s.floats.some(f=>f.text==='▽ ここを狙われている');let s=run(createGame('playing'),3.9);assert.equal(s.aimHintShown,false);assert.equal(hinted(s),false);s=run(s,.2);assert.equal(s.aimHintShown,true);const hint=s.floats.find(f=>f.text==='▽ ここを狙われている');assert.ok(hint.y<=535&&hint.y>500);s=run(s,1.6);assert.equal(hinted(s),false);s=run(s,2);assert.equal(hinted(s),false);});

test('入力なしでも発射しfire:falseでも止まらない',()=>{for(const input of [{},{fire:false}])assert.ok(run(createGame('playing'),.1,input).bullets.length>0);assert.equal('fire' in autoInput(createGame()),false);});
test('LV1は2発、LV6は6発までで斉射単位の空きを待つ',()=>{for(const [level,limit] of [[1,2],[6,6]]){let s=createGame('playing'),peak=0;s.level=level;s.player.x=24;for(let i=0;i<180;i++){s=step(s,1/60,{},()=>.99);peak=Math.max(peak,s.bullets.length);assert.ok(s.bullets.length<=limit);}assert.equal(peak,limit);}let s=createGame('playing');s.level=6;s.bullets=Array.from({length:5},()=>({x:0,y:500,w:6,h:16}));s=step(s,.01,{},()=>.99);assert.equal(s.bullets.length,5);assert.equal(s.events.includes('fire'),false);});
test('斉射の位置・幅・倍率・クールダウンは装備に従う',()=>{for(const [level,offsets,width,cooldown] of [[1,[0],4,.25],[6,[-11,11],6,.2],[15,[-20,0,20],12,.16]]){let s=createGame('playing');s.level=level;s.shotHeat[0]=12;s=step(s,.01,{},()=>.99);assert.deepEqual(s.bullets.map(b=>b.x+b.w/2-s.player.x),offsets);assert.ok(s.bullets.every(b=>b.w===width&&b.h===16&&b.bonus===true));assert.equal(s.shotCooldown,cooldown);}});
test('同じ位置に2秒留まる熱と読まれ度は連射速度に依らない',()=>{const play=level=>{const s=createGame('playing');s.level=level;return run(s,2);};const a=play(1),b=play(11);assert.ok(Math.abs(a.readLevel-b.readLevel)<=5);assert.deepEqual(a.shotHeat,b.shotHeat);assert.ok(a.readLevel>60);});
test('熱は毎秒4加算と3秒減衰、1.5秒で約0.79、2.1秒で最大',()=>{
  let s=run(createGame('playing'),1.5);
  const q=Math.exp(-1/60/HEAT_DECAY_SECONDS),expected=(4/60)*(1-q**90)/(1-q);
  assert.ok(Math.abs(s.shotHeat[6]-expected)<1e-9);
  assert.ok(Math.abs(heatOf(s.shotHeat)[6]-.79)<.01);
  s=run(s,.6);assert.equal(s.heat[6],1);
});
// 敵による終了を避け、熱と移動は本番のstepを20秒以上通す。
const heatGame=()=>{const s=createGame('playing');s.invincible=100;return s;};
test('20秒留まり続けても生の熱は6を超えない',()=>{
  let s=heatGame();
  for(let i=0;i<20*60;i++){s=step(s,1/60);assert.ok(s.shotHeat.every(v=>v<=HEAT_MAX));}
  assert.equal(s.status,'playing');assert.ok(Math.abs(s.time-20)<1e-9);assert.equal(s.shotHeat[6],HEAT_MAX);
});
test('3秒と20秒の静止後、離脱2秒後の熱の差は0.02以内',()=>{
  const cooled=[3,20].map(seconds=>{
    let s=run(heatGame(),seconds);assert.equal(s.heat[6],1);
    // レーンを離れた瞬間から計時（移動中の加熱時間を含めない）。
    s.player.x=24;s=run(s,2);assert.equal(s.status,'playing');
    assert.ok(Math.abs(s.heat[6]-.51)<.01);return s.heat[6];
  });
  assert.ok(Math.abs(cooled[0]-cooled[1])<=.02);
});
test('飽和したレーンから離れると1秒0.72、2秒0.51、4秒0.26',()=>{
  const s=run(heatGame(),2.1);s.player.x=24;
  for(const [seconds,expected] of [[1,.72],[2,.51],[4,.26]])assert.ok(Math.abs(run(s,seconds).heat[6]-expected)<.01);
});
const killSetup=()=>{const s=createGame('playing'),e=s.fleet.enemies[21];s.shotCooldown=1;s.bullets=[{x:e.x-2,y:e.y+10,w:4,h:16,bonus:false}];return s;};
test('撃破の16%でアイテムを落とし、上限6個を超えない',()=>{for(const [random,count] of [[0,1],[.1599,1],[.16,0],[.99,0]]){const s=step(killSetup(),.01,{},()=>random);assert.equal(s.kills,1);assert.equal(s.items.length,count);if(count)assert.deepEqual(s.items[0],{x:96,y:192,w:20,h:20,vy:120});}for(const count of [5,6]){const s=killSetup();s.items=Array.from({length:count},()=>({x:0,y:200,w:20,h:20,vy:120}));assert.equal(step(s,.01,{},()=>0).items.length,6);}});
test('アイテムは落下し、660を超えたら消える',()=>{const s=createGame('playing');s.items=[{x:0,y:200,w:20,h:20,vy:120},{x:0,y:659,w:20,h:20,vy:120}];const n=step(s,.02,{},()=>.99);assert.equal(n.items.length,1);assert.equal(n.items[0].y,202.4);assert.equal(s.items[0].y,200);});
test('取得で1レベル上昇、音と浮き文字とフラッシュ、次プレイはLV1',()=>{const s=createGame('playing');s.items=[{x:s.player.x-10,y:574,w:20,h:20,vy:120}];let n=step(s,.01,{},()=>.99);assert.equal(n.level,2);assert.equal(n.items.length,0);assert.ok(n.events.includes('pickup')&&n.events.includes('levelup'));assert.equal(n.levelFlash,1.4);assert.deepEqual(n.floats[0],{x:240,y:390,life:1.4,kind:'level',text:'LV2 連射が速くなった'});n=run(n,.1);assert.ok(Math.abs(n.levelFlash-1.3)<1e-9);assert.equal(createGame().level,1);assert.equal(createGame('playing').level,1);assert.equal(s.level,1);});
test('被弾停止・ウェーブ待ちでもアイテムは落下して拾える',()=>{for(const flag of ['invincible','waveTransition']){const s=createGame('playing');s[flag]=1;s.items=[{x:254,y:574,w:20,h:20,vy:120},{x:0,y:200,w:20,h:20,vy:120}];const n=step(s,.05,{},()=>.99);assert.equal(n.level,2);assert.equal(n.items.length,1);assert.equal(n.items[0].y,206);}});
test('裏をかいた浮き文字は連続斉射・複数命中でも0.6秒に1回、得点は常に2倍',()=>{let s=createGame('playing'),last=-Infinity,shown=0;s.level=13;s.shotHeat.fill(1000);s.shotHeat[6]=0;for(let i=0;i<90;i++){s.shotHeat[6]=0;s.shotCooldown=0;s.bullets=[];for(const [j,e] of s.fleet.enemies.entries()){e.alive=true;e.x=s.player.x+[-20,0,20][j%3];e.y=550;e.w=10;}s.fleet.clock=0;s.fleet.flinchCooldown=1;const score=s.score,kills=s.kills;s=step(s,1/60,{},()=>.99);const added=s.floats.filter(f=>f.text==='裏をかいた ×2'&&f.life===.9);assert.ok(added.length<=1);if(added.length){assert.ok(s.time-last>=.6-1e-9);last=s.time;shown++;}assert.equal(s.kills-kills,3);assert.equal(s.score-score,180);assert.equal(s.bonusKills,s.kills);}assert.equal(shown,3);});

test('LV29で2個同時取得するとLV30になり余った1個は100点', () => {
  const s=createGame('playing');s.level=29;s.invincible=1;
  s.items=Array.from({length:2},()=>({x:254,y:574,w:20,h:20,vy:120}));
  const n=step(s,1/60,{},()=>.99);
  assert.equal(n.level,30);assert.equal(n.score,100);assert.equal(n.items.length,0);
  assert.equal(n.events.filter(e=>e==='pickup').length,2);
  assert.equal(n.events.filter(e=>e==='levelup').length,1);
  assert.deepEqual(n.floats.map(f=>f.text),['LV30 最大出力','+100']);
});
test('LV30の取得は100点とpickupだけで強化演出を起こさない', () => {
  const s=createGame('playing');s.level=30;s.invincible=1;
  s.items=[{x:254,y:574,w:20,h:20,vy:120}];
  const n=step(s,1/60,{},()=>.99);
  assert.equal(n.level,30);assert.equal(n.score,100);assert.equal(n.levelFlash,0);
  assert.deepEqual(n.events,['pickup']);assert.equal(n.floats[0].text,'+100');
});
test('LV30のウェーブ通過は通常報酬に100点を加えレベルアップしない', () => {
  const s=createGame('playing');s.level=30;s.fleet.enemies.forEach(e=>e.alive=false);
  const n=step(s,1/60,{},()=>.99);
  assert.equal(n.level,30);assert.equal(n.score,150);assert.equal(n.wave,2);
  assert.equal(n.levelFlash,0);assert.ok(!n.events.includes('levelup'));
  assert.deepEqual(n.floats.map(f=>f.text),['ウェーブ1 クリア +50','+100']);
});
test('波ごとの同時弾は射手を一巡してから再利用し、射手ゼロなら撃たない', () => {
  for(const [wave,expected] of [[1,1],[4,2],[7,3],[10,4],[13,5]])for(const available of [0,1,2,7]) {
    const s=createGame('playing');s.wave=wave;s.waveTime=3;s.enemyClock=8;s.shotCooldown=1;
    s.fleet.enemies.forEach(e=>{e.alive=e.col<available;});
    const n=step(s,1/60,{},()=>.5);
    assert.equal(n.enemyBullets.length,available ? expected : 0);
    const origins=n.enemyBullets.map(b=>Math.round(b.x-b.vx/60));
    assert.equal(new Set(origins).size,Math.min(expected,available));
  }
});


test('敵の実発射に現在レベルの同時弾・間隔・弾速が反映される', () => {
  for(const [level,count,speed] of [[1,1,196],[5,2,212],[30,6,312]]) {
    let s=createGame('playing');s.level=level;s.waveTime=3;s.shotCooldown=10;
    const fireInterval=waveConfig(1,level).fireInterval;
    s.enemyClock=fireInterval-.02;
    s=step(s,.01,{},()=>.99);assert.equal(s.enemyBullets.length,0);
    s=step(s,.01,{},()=>.99);assert.equal(s.enemyBullets.length,count);
    for(const bullet of s.enemyBullets)assert.ok(Math.abs(Math.hypot(bullet.vx,bullet.vy)-speed)<1e-9);
  }
});
test('LV30でもウェーブ1の最初の3秒は敵が撃たない', () => {
  const initial=createGame('playing');initial.level=30;initial.enemyClock=8;
  let s=initial;
  for(let frame=0;frame<179;frame++) {
    s=step(s,1/60,{targetX:24},()=>.99);
    assert.equal(s.enemyBullets.length,0);
  }
});

test('近距離でも発射から自機高さまで0.45秒以上、当たり判定の先端も保護', () => {
  for(const y of [200,312,448,540,560])for(const random of [0,.5,.999]) {
    const s=createGame('playing');s.wave=40;s.level=30;s.waveTime=3;s.enemyClock=8;s.shotCooldown=10;
    s.fleet.enemies.forEach((e,i)=>{e.alive=i===0;e.y=y;e.x=264;});
    let observed=0;
    step(s,1/60,{},()=>random,b=>{
      observed++;
      assert.ok(Math.hypot(b.vx,b.vy)<=620+1e-9);
      assert.ok((592-b.y)/b.vy>=.45);
      assert.ok((580-b.h-b.y)/b.vy>=.45-1e-9);
    });
    if(y<560)assert.equal(observed,6);else assert.equal(observed,0);
  }
});
test('発射観測は同フレーム被弾で消える弾も数える、最大6発を実発射', () => {
  const s=createGame('playing');s.wave=40;s.level=30;s.waveTime=3;s.enemyClock=8;s.shotCooldown=10;
  s.enemyBullets=[{x:264,y:584,w:6,h:12,vx:0,vy:0}];
  const shots=[];
  const n=step(s,1/60,{},()=>.5,(b,count)=>shots.push({y:b.y,count}));
  assert.equal(shots.length,6);assert.equal(shots.at(-1).count,7);
  assert.ok(shots.every(b=>b.y===206));
  assert.equal(n.enemyBullets.length,0);assert.equal(n.lives,2);
});
test('次波の敵数は現在レベルによらず42隻', () => {
  const s=createGame('playing');s.wave=4;s.level=20;s.waveTransition=1/60;
  assert.equal(step(s,1/60,{},()=>.99).fleet.enemies.length,42);
});

test('敵弾30発で発射時刻を跨いでも増えず、29発なら斉射途中で打ち切る', () => {
  assert.equal(ENEMY_BULLETS_MAX,30);
  for(const initialCount of [29,30]) {
    let s=createGame('playing');s.wave=40;s.level=30;s.waveTime=3;s.shotCooldown=10;
    s.enemyBullets=Array.from({length:initialCount},()=>({x:10,y:300,w:6,h:12,vx:0,vy:0}));
    let emitted=0;
    for(let frame=0;frame<30;frame++) {
      s=step(s,1/60,{},()=>.5,(_bullet,count)=>{emitted++;assert.ok(count<=30);});
      assert.ok(s.enemyBullets.length<=30);
    }
    assert.equal(emitted,30-initialCount);
    assert.equal(s.enemyBullets.length,30);
    // 上限で見送った回も時計をリセットし、空きができても次の発射時刻を待つ。
    s.enemyBullets.pop();
    s=step(s,1/60,{},()=>.5);assert.equal(s.enemyBullets.length,29);
  }
});
test('連続レベルアップは同時1件、得点の浮き文字を残す', () => {
  let s=createGame('playing');s.level=13;s.invincible=1;
  s.floats=[{x:100,y:300,life:.9,text:'+30'}];
  for(const count of [1,1,2]) {
    s.items=Array.from({length:count},()=>({x:254,y:574,w:20,h:20,vy:120}));
    s=step(s,1/60,{},()=>.99);
    const levels=s.floats.filter(f=>f.kind==='level');
    assert.equal(levels.length,1);
    assert.ok(levels[0].text.startsWith(`LV${s.level} `));
    assert.ok(s.floats.some(f=>f.text==='+30'));
  }
  assert.equal(s.level,17);
});
// 自弾は熱の帯（y=8〜52）の下で消す。常時30発以上が飛ぶので、帯を横切ると中核の指標が読めなくなる。


