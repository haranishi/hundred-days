import { OPENING, openingStage } from '../src/opening-script';
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, transition, maxHp, has, objective, travelAllowed } from '../src/state';
import { loadGame, saveGame, SAVE_KEY, validateSave } from '../src/persistence';
import { createMap, findPath, walkable, groundWalkable } from '../src/maps';
import { intentFor } from '../src/encounters';
import { DISCOVERIES } from '../src/exploration';
import { BROTHERS, ITEMS } from '../src/content';
import type { Action, CombatCommand, EnemyId, GameState, Zone } from '../src/types';
function apply(s:GameState,a:Action){const r=transition(s,a);assert.ok(r.ok,r.message);return r.state;}
function win(state:GameState,enemy:EnemyId){
 let s=apply(state,{type:'startBattle',enemy});
 for(let n=0;n<100&&s.battle?.result==='active';n++){
 const b=s.battle;let command:CombatCommand=b.turn%3===0?'guard':b.energy===5&&has(s,'awakened')?'resonate':b.hp<maxHp(s)*.4&&s.inventory.potion?'potion':b.cooldown===0&&s.party.length?'support':'attack';
 s=apply(s,{type:'combat',command});
 }
 assert.equal(s.battle?.result,'won',JSON.stringify(s.battle));return apply(s,{type:'leaveBattle'});
}
function early(){let s=freshState();s=apply(s,{type:'flag',flag:'intro'});s=apply(s,{type:'trade',item:'wheat',direction:'buy',quantity:5});s=apply(s,{type:'deliver',quest:'bread'});s=apply(s,{type:'trade',item:'wheat',direction:'sell',quantity:4});return s;}
function beforeTrials(){let s=early();s=apply(s,{type:'travel',zone:'forest'});for(const id of ['herb1','herb2'])s=apply(s,{type:'gather',id});s=apply(s,{type:'travel',zone:'town'});s=apply(s,{type:'deliver',quest:'medicine'});s=apply(s,{type:'travel',zone:'forest'});s=win(s,'bramble');s=apply(s,{type:'travel',zone:'town'});s=apply(s,{type:'travel',zone:'palace'});return apply(s,{type:'audience'});}
test('取引の保存則・不足時の非変更・個数検査',()=>{
 let s=freshState();for(const q of [0,-1,1.5,100,NaN]){const r=transition(s,{type:'trade',item:'wheat',direction:'buy',quantity:q});assert.equal(r.ok,false);assert.deepEqual(r.state,s);}
 assert.equal(transition(s,{type:'trade',item:'crystal',direction:'buy',quantity:3}).ok,false);
 assert.equal(transition(s,{type:'trade',item:'wheat',direction:'sell',quantity:1}).ok,false);
 for(const item of ['wheat','herb','crystal'] as const){const initial=s.gold;s=apply(s,{type:'trade',item,direction:'buy',quantity:1});assert.equal(s.gold,initial-ITEMS[item].buy);s=apply(s,{type:'trade',item,direction:'sell',quantity:1});assert.equal(s.gold,initial+ITEMS[item].sell-ITEMS[item].buy);assert.equal(s.inventory[item],0);}
});
test('報酬と採集は一度だけ、依頼の在庫不足は進行を変えない',()=>{
 let s=freshState();assert.equal(transition(s,{type:'deliver',quest:'bread'}).ok,false);s=early();assert.equal(s.profit,24);assert.equal(s.gold,108);assert.deepEqual(s.party,['nora']);assert.equal(transition(s,{type:'deliver',quest:'bread'}).ok,false);
 s=apply(s,{type:'travel',zone:'forest'});s=apply(s,{type:'gather',id:'herb1'});assert.equal(s.inventory.herb,2);assert.equal(transition(s,{type:'gather',id:'herb1'}).ok,false);
});
test('地域・謁見・試練・覚醒を飛ばせず、全編を正規操作で完走できる',()=>{
 assert.ok(travelAllowed(freshState(),'palace'));assert.ok(travelAllowed(freshState(),'abyss'));
 assert.equal(transition(freshState(),{type:'awaken'}).ok,false);assert.equal(transition(freshState(),{type:'startBattle',enemy:'demon'}).ok,false);
 let s=beforeTrials();assert.equal(has(s,'promoted'),true);assert.equal(s.party.length,3);
 for(const brother of BROTHERS){s=win(s,brother);assert.equal(transition(s,{type:'startBattle',enemy:brother}).ok,false);}
 s=apply(s,{type:'awaken'});assert.equal(transition(s,{type:'awaken'}).ok,false);s=apply(s,{type:'travel',zone:'abyss'});s=win(s,'demon');assert.ok(has(s,'ended'));assert.equal(objective(s).progress,100);assert.ok(validateSave(s));
});
test('強攻撃を防御で軽減し、敗北後は資金・物語を失わず再戦する',()=>{
 let s=early();s=apply(s,{type:'travel',zone:'forest'});s=apply(s,{type:'startBattle',enemy:'bramble'});s.battle!.turn=3;
 const guard=apply(s,{type:'combat',command:'guard'}),hit=apply(s,{type:'combat',command:'attack'});
 assert.ok(guard.battle!.hp>hit.battle!.hp);assert.equal(guard.battle!.energy,2);
 const gold=s.gold,flags=[...s.flags];s.battle!.hp=1;s=apply(s,{type:'combat',command:'guard'});assert.equal(s.battle!.result,'lost');s=apply(s,{type:'leaveBattle'});assert.equal(s.gold,gold);assert.deepEqual(s.flags,flags);assert.ok(s.inventory.potion>=3);s=win(s,'bramble');assert.ok(has(s,'bramble'));
});
test('戦闘中の取引・移動と戦闘後の二重報酬を防ぐ',()=>{
 let s=beforeTrials();s=apply(s,{type:'startBattle',enemy:'flame'});for(const a of [{type:'travel',zone:'town'},{type:'trade',item:'wheat',direction:'buy',quantity:1},{type:'audience'}] as Action[])assert.equal(transition(s,a).ok,false);
 s.battle!.enemyHp=1;s=apply(s,{type:'combat',command:'attack'});const gold=s.gold;assert.equal(transition(s,{type:'combat',command:'attack'}).ok,false);assert.equal(s.gold,gold);
});
class MemoryStorage { values=new Map<string,string>();getItem(k:string){return this.values.get(k)??null;}setItem(k:string,v:string){this.values.set(k,v);} }
test('保存・復帰・破損バックアップ・未来版と不整合の拒否',()=>{
 const store=new MemoryStorage();const s=early();assert.equal(saveGame(store,s).ok,true);assert.deepEqual(loadGame(store).state,s);
 const newer=apply(s,{type:'trade',item:'wheat',direction:'buy',quantity:1});saveGame(store,newer);store.setItem(SAVE_KEY,'{broken');const recovered=loadGame(store);assert.equal(recovered.status,'recovered');assert.deepEqual(recovered.state,s);
 for(const d of [{...s,version:2},{...s,gold:-1},{...s,flags:['ended']},{...s,party:[]},{...s,inventory:{...s.inventory,wheat:NaN}},{...s,position:{x:NaN,y:2}}])assert.equal(validateSave(d),null);
 assert.equal(saveGame({getItem:()=>null,setItem:()=>{throw new Error('quota');}},s).ok,false);
 assert.equal(loadGame({getItem:()=>{throw new Error('denied');},setItem:()=>{}}).status,'unavailable');
});
test('4地域の全目標に出発点から歩いて到達でき、道は壁や水を横切らない',()=>{
 for(const zone of ['town','forest','palace','abyss'] as Zone[]){const m=createMap(zone);assert.ok(walkable(m,m.spawn.x,m.spawn.y),zone+' spawn');for(const point of m.points){const path=findPath(m,m.spawn,point);assert.ok(path.length>0,zone+':'+point.id);for(const p of path)assert.ok(walkable(m,p.x,p.y),zone+':'+point.id);}}
});

test('資金を使い切って採集物がなくても、店の仕事から商いを再開できる',()=>{
 let s=freshState();s.gold=0;s.inventory={wheat:0,herb:0,crystal:0,potion:0};s.flags.push(...Array.from({length:6},(_,n)=>'gather:herb'+(n+1)));
 assert.equal(objective(s).target,'nora');s=apply(s,{type:'work'});assert.equal(s.gold,8);assert.equal(transition(s,{type:'work'}).ok,false);
 s=apply(s,{type:'trade',item:'wheat',direction:'buy',quantity:1});s=apply(s,{type:'trade',item:'wheat',direction:'sell',quantity:1});assert.equal(s.gold,14);
 s=apply(s,{type:'heal'});assert.equal(transition(s,{type:'trade',item:'potion',direction:'sell',quantity:1}).ok,false);
});

test('各王子の固有行動と、回復の阻止・根の防御が戦況を変える',()=>{
 const promoted=beforeTrials();let tide=apply(promoted,{type:'startBattle',enemy:'tide'});tide.battle!.turn=2;tide.battle!.enemyHp=80;assert.equal(intentFor(tide.battle!).kind,'heal');
 const ordinary=apply(tide,{type:'combat',command:'attack'}),interrupted=apply(tide,{type:'combat',command:'support'});assert.ok(ordinary.battle!.events!.some(e=>e.kind==='enemy-heal'));assert.ok(!interrupted.battle!.events!.some(e=>e.kind==='enemy-heal'));assert.ok(interrupted.battle!.enemyHp<ordinary.battle!.enemyHp);
 let grove=apply(promoted,{type:'startBattle',enemy:'grove'});grove.battle!.energy=4;const guard=apply(grove,{type:'combat',command:'guard'}),attack=apply(grove,{type:'combat',command:'attack'});assert.equal(guard.battle!.energy,5);assert.equal(attack.battle!.energy,4);assert.ok(guard.battle!.hp>attack.battle!.hp);
 const storm=apply(promoted,{type:'startBattle',enemy:'storm'});assert.equal(intentFor(storm.battle!).kind,'barrage');const flame=apply(promoted,{type:'startBattle',enemy:'flame'});flame.battle!.turn=2;assert.equal(intentFor(flame.battle!).kind,'heavy');
});
test('宝物と会話は一度だけ報酬を与え、既存セーブと共存する',()=>{
 let s=early();const before=s.gold;s=apply(s,{type:'discover',id:'town:parcel'});assert.equal(s.gold,before+18);assert.equal(s.inventory.potion,4);assert.equal(transition(s,{type:'discover',id:'town:parcel'}).ok,false);assert.equal(transition(s,{type:'discover',id:'forest:well'}).ok,false);
 assert.ok(validateSave(s));assert.ok(validateSave(early()));const memory=new MemoryStorage();assert.equal(saveGame(memory,s).ok,true);assert.deepEqual(loadGame(memory).state,s);
 for(const [id,d] of Object.entries(DISCOVERIES)){let state=freshState();state.zone=d.zone;const r=transition(state,{type:'discover',id});assert.ok(r.ok,id);assert.ok(r.state.flags.includes('found:'+id));}
});


test('最初の約束は仕入れから配達へ変わり、資金不足なら仕事へ戻れる',()=>{
 const s=freshState();const before=objective(s);assert.equal(before.target,'merchant');assert.match(before.hint,/8G/);
 const bought=transition(s,{type:'trade',item:'wheat',direction:'buy',quantity:1});assert.equal(bought.ok,true);assert.equal(objective(bought.state).target,'nora');assert.match(objective(bought.state).title,/ノラ/);
 const delivered=transition(bought.state,{type:'deliver',quest:'bread'});assert.equal(delivered.ok,true);assert.equal(objective(delivered.state).target,'merchant');assert.match(objective(delivered.state).title,/利益/);
 assert.equal(objective({...s,gold:0}).target,'nora');assert.match(objective({...s,gold:0}).title,/手伝/);
});
test('序章の各場面は実マップの床に人物を置き、識別子を重複させない',()=>{
 assert.equal(new Set(OPENING.map(b=>b.id)).size,OPENING.length);
 for(const beat of OPENING){const stage=openingStage(beat.scene,beat.lights),map=createMap(stage.zone);assert.ok(groundWalkable(map,stage.focus.x,stage.focus.y));assert.equal(new Set(stage.actors.map(a=>a.id)).size,stage.actors.length);for(const a of stage.actors){assert.ok(groundWalkable(map,a.x,a.y),beat.id+':'+a.id);if(a.fromY!==undefined)assert.ok(groundWalkable(map,a.x,a.fromY));}}
});
