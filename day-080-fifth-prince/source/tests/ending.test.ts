import test from 'node:test';
import assert from 'node:assert/strict';
import {apply,checkpoints,finishEpisode,travelTo} from './story-fixtures';
import {maxHp,newAdventure,objective,spawns,transition} from '../src/state';
import {loadGame,saveGame,validateSave} from '../src/persistence';
import {brotherResponse,endingStory,reconciliation} from '../src/story-content';
import {createMap,groundWalkable} from '../src/maps';
import type {GameState} from '../src/types';
const route=checkpoints();
const storage=()=>{const values=new Map<string,string>();return {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};};
const empty={wheat:0,herb:0,crystal:0,potion:3};
const bread=finishEpisode(route.bread,'bread');
const exhaustedTrade=():GameState=>({...bread,gold:0,profit:6,inventory:{...empty}});
const exhaustedHerbs=():GameState=>({...bread,gold:36,profit:24,inventory:{...empty},flags:[...bread.flags,...Array.from({length:6},(_,i)=>'gather:herb'+(i+1))]});
test('最終勝利だけを安全に保存し、画面中の戦闘や報酬は変えない',()=>{
 const won:GameState={...route.ended,battle:{enemy:'demon',result:'won',turn:12,hp:maxHp(route.ended),enemyHp:0,energy:2,cooldown:0,log:['VICTORY']}};
 const before=structuredClone(won),store=storage();assert.ok(saveGame(store,won).ok);assert.deepEqual(won,before);
 const loaded=loadGame(store).state!;assert.equal(loaded.battle,null);assert.ok(loaded.flags.includes('ended'));assert.ok(!loaded.flags.includes('ending:seen'));assert.equal(loaded.xp,won.xp);assert.equal(loaded.gold,won.gold);
 assert.equal(saveGame(storage(),{...won,battle:{...won.battle!,result:'active',enemyHp:10}}).ok,false);
 assert.equal(saveGame(storage(),{...won,battle:{...won.battle!,enemy:'flame'}}).ok,false);
});
test('終幕で視聴済みと帰還を一度に記録し、従来のv1も読める',()=>{
 assert.ok(validateSave(route.ended));assert.equal(transition(newAdventure(),{type:'finishEnding'}).ok,false);
 assert.equal(validateSave({...newAdventure(),flags:['story:expanded','ending:seen']}),null);
 const clear=apply(route.ended,{type:'finishEnding'});assert.ok(clear.flags.includes('ending:seen'));assert.equal(clear.zone,'town');assert.deepEqual(clear.position,spawns.town);assert.equal(clear.gold,route.ended.gold);assert.equal(clear.xp,route.ended.xp);
 const twice=transition(clear,{type:'finishEnding'});assert.equal(twice.ok,false);assert.deepEqual(twice.state,clear);
 const store=storage();assert.ok(saveGame(store,clear).ok);assert.deepEqual(loadGame(store).state,clear);assert.match(objective(clear).title,/本編クリア/);
});
test('仕入れも売却もできないときの案内から、仕事と商いを再開できる',()=>{
 let s=exhaustedTrade();assert.ok(validateSave(s));assert.equal(objective(s).target,'nora');s=apply(s,{type:'work'});assert.equal(objective(s).target,'merchant');
 for(let i=0;i<3;i++){s=apply(s,{type:'trade',item:'wheat',direction:'buy',quantity:1});s=apply(s,{type:'trade',item:'wheat',direction:'sell',quantity:1});}
 assert.equal(s.profit,24);assert.notEqual(objective(s).target,'nora');
});
test('全採集地点を使い切っても、案内から薬草を仕入れて依頼を進められる',()=>{
 let s=exhaustedHerbs();assert.ok(validateSave(s));assert.equal(objective(s).target,'merchant');assert.equal(objective(s).zone,'town');s=apply(s,{type:'trade',item:'herb',direction:'buy',quantity:3});assert.equal(objective(s).target,'mira');s=apply(s,{type:'deliver',quest:'medicine'});assert.ok(s.flags.includes('medicine'));
 const poor={...exhaustedHerbs(),gold:0};assert.equal(objective(poor).target,'nora');
 const remaining={...exhaustedHerbs(),flags:exhaustedHerbs().flags.filter(f=>f!=='gather:herb4')};assert.equal(objective(remaining).target,'herb4');
});
test('クリア後の任意章で本編の進捗は戻らず、再訪で初回の和解を繰り返さない',()=>{
 let legacy=apply(route.ended,{type:'finishEnding'});legacy.flags=legacy.flags.filter(f=>!f.startsWith('story:'));legacy=apply(legacy,{type:'focusStory',episode:'bread'});assert.equal(objective(legacy).progress,100);assert.match(objective(legacy).chapter,/任意/);assert.equal(objective(legacy).target,'nora');
 const first={...route.trials,brothers:['flame'] as GameState['brothers']};assert.notDeepEqual(brotherResponse(first,'flame'),reconciliation(first,'flame'));assert.doesNotMatch(brotherResponse(first,'flame').map(p=>p.text).join(''),/追いつかれるのが怖かった/);assert.match(brotherResponse(first,'flame').map(p=>p.text).join(''),/セイル/);
});
test('結末の四場面は実際の床に人物を置き、台詞と場面が一致する',()=>{
 const pages=endingStory(route.ended),before=structuredClone(route.ended);assert.equal(new Set(pages.map(p=>p.heading)).size,4);assert.equal(new Set(pages.map(p=>p.stage!.zone)).size,3);
 for(const page of pages){const st=page.stage!,m=createMap(st.zone);for(const actor of st.actors)assert.ok(groundWalkable(m,actor.x,actor.y),`${page.heading}:${actor.id}`);if(page.speaker==='国王レオニス'){assert.equal(st.zone,'palace');assert.ok(st.actors.some(a=>a.id==='king'));}}
 assert.match(pages.map(p=>p.text).join(''),/僕自身/);assert.match(pages.at(-1)!.text,/兄弟の物語/);assert.deepEqual(route.ended,before);
});

test('森の小章の薬草を失っても、回復の案内から納品まで進められる',()=>{
 let s=travelTo(route.forest,'town');s=apply(s,{type:'story',event:'forest.start'});s=travelTo(s,'forest');s=apply(s,{type:'story',event:'forest.observe'});s=apply(s,{type:'story',event:'forest.pick',choice:'leaf'});
 s={...s,gold:0,inventory:{...empty},flags:[...new Set([...s.flags,...Array.from({length:6},(_,i)=>'gather:herb'+(i+1))])]};assert.ok(validateSave(s));assert.equal(objective(s).target,'nora');assert.match(objective(s).chapter,/森を守り/);
 s=travelTo(s,'town');s=apply(s,{type:'work'});assert.equal(objective(s).target,'merchant');for(let i=0;i<3;i++){s=apply(s,{type:'trade',item:'wheat',direction:'buy',quantity:1});s=apply(s,{type:'trade',item:'wheat',direction:'sell',quantity:1});}
 s=apply(s,{type:'trade',item:'herb',direction:'buy',quantity:2});assert.equal(objective(s).target,'guard');s=apply(s,{type:'story',event:'forest.deliver'});assert.ok(s.flags.includes('story:forest:done'));assert.notEqual(objective(s).target,'guard');
});
