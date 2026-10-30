import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, checkpoints, finishEpisode, travelTo } from './story-fixtures';
import { newAdventure, objective, transition } from '../src/state';
import { loadGame, saveGame, validateSave } from '../src/persistence';
import { EPISODES, STORY_FLAGS, chosen, done, eventAt, remembered, storyTasks } from '../src/story';
import { awakening, endingStory, replayEpisode, scriptFor } from '../src/story-content';
import { createMap, groundWalkable } from '../src/maps';
import type { GameState, StoryEvent } from '../src/types';
const route=checkpoints();
test('追加六章と戦闘を正規操作で完走し、各段階のセーブが有効',()=>{
 for(const s of Object.values(route))assert.ok(validateSave(s));const s=route.ended;
 assert.ok(EPISODES.every(e=>done(s,e.id)));assert.equal(s.brothers.length,4);assert.ok(s.flags.includes('ended'));assert.equal(objective(s).progress,100);assert.ok(s.gold>=0);assert.ok(s.flags.length<100);assert.equal(new Set(STORY_FLAGS).size,STORY_FLAGS.length);
});
test('納品・勝利だけでは新規プレイの謁見・試練・覚醒・魔王へ飛べない',()=>{
 for(const [s,action] of [[route.bread,{type:'audience'}],[route.forge,{type:'startBattle',enemy:'flame'}],[route.family,{type:'awaken'}],[travelTo(route.citadel,'abyss'),{type:'startBattle',enemy:'demon'}]] as const){const r=transition(s,action);assert.equal(r.ok,false);assert.deepEqual(r.state,s);}
});
test('二つの配達先はどちらからでもよく、既読の発見報酬と重複しない',()=>{
 let s=apply(route.bread,{type:'discover',id:'town:child'});const before=s.xp;s=apply(s,{type:'story',event:'bread.pack',choice:'order'});s=apply(s,{type:'story',event:'bread.child'});assert.equal(s.xp,before);assert.equal(eventAt(s,'town:elder'),'bread.elder');
 s=apply(s,{type:'story',event:'bread.elder'});const beforeGold=s.gold;s=apply(s,{type:'story',event:'bread.finish'});assert.equal(s.gold,beforeGold+12);assert.ok(done(s,'bread'));assert.equal(transition(s,{type:'story',event:'bread.finish'}).ok,false);
});
test('主要選択の両側が完走し、覚醒・結末に自分の選択が返る',()=>{
 const other=checkpoints({bread:'order',mira:'review',forge:'crystal',family:'forgive'}).ended;
 for(const id of ['bread','mira','forge','family'] as const)assert.notEqual(remembered(other,id),remembered(route.ended,id));
 assert.match(awakening(other).map(p=>p.text).join(''),/手帳を一緒に読/);assert.match(awakening(route.ended).map(p=>p.text).join(''),/許すまで時間/);
 assert.match(endingStory(other).map(p=>p.text).join(''),/定期便/);assert.match(endingStory(route.ended).map(p=>p.text).join(''),/まだ話したくない日/);
});
test('誤った火・採集・単独行動は進行と在庫を変えず、無料で再挑戦できる',()=>{
 let s=route.forge;s=travelTo(s,'town');for(const event of ['forge.start','forge.inspect'] as const)s=apply(s,{type:'story',event});assert.equal(transition(s,{type:'story',event:'forge.parts',choice:'crystal'}).ok,false);s=apply({...s,gold:0},{type:'story',event:'forge.parts',choice:'reuse'});
 const wrong=transition(s,{type:'story',event:'forge.light',choice:'force'});assert.equal(wrong.ok,false);assert.deepEqual(wrong.state,s);assert.match(wrong.message,/小さな火/);assert.ok(transition(s,{type:'story',event:'forge.light',choice:'steady'}).ok);
 s=travelTo(route.forest,'town');s=apply(s,{type:'story',event:'forest.start'});s=travelTo(s,'forest');s=apply(s,{type:'story',event:'forest.observe'});assert.deepEqual(transition(s,{type:'story',event:'forest.pick',choice:'root'}).state,s);
 s=travelTo(route.citadel,'abyss');for(const event of ['citadel.voices','citadel.power'] as const)assert.deepEqual(transition(s,{type:'story',event,choice:'alone'}).state,s);
});
test('途中保存から続けられ、前提・排他・完了を偽った保存は拒否する',()=>{
 let s=apply(route.bread,{type:'story',event:'bread.pack',choice:'share'});s=apply(s,{type:'story',event:'bread.elder'});const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
 assert.ok(saveGame(storage,s).ok);s=loadGame(storage).state!;assert.equal(eventAt(s,'town:child'),'bread.child');assert.ok(chosen(s,'bread','elder'));
 for(const flags of [[...s.flags,'story:bread:order'],[...newAdventure().flags,'story:mira:water'],[...s.flags,'story:bread:done'],[...route.forge.flags,'story:family:done']])assert.equal(validateSave({...s,flags}),null);
});
test('旧セーブの任意章は手帳で案内でき、主線を巻き戻さない',()=>{
 let s=structuredClone(route.ended);s.flags=s.flags.filter(f=>!f.startsWith('story:'));assert.ok(validateSave(s));assert.equal(objective(s).progress,100);assert.ok(transition(s,{type:'focusStory',episode:'forest'}).ok===false);
 s=apply(s,{type:'focusStory',episode:'bread'});assert.equal(objective(s).target,'nora');s=finishEpisode(s,'bread');assert.ok(s.flags.includes('ended'));assert.equal(s.brothers.length,4);assert.equal(objective(s).progress,100);
 const copy=structuredClone(s);const replay=replayEpisode(s,'bread');assert.ok(replay.length>10);assert.deepEqual(s,copy);assert.ok(validateSave(s));
});
test('全会話の人物は実マップの床に立ち、共鳴の正体を小章の前半では明かさない',()=>{
 const events:StoryEvent[]=['bread.pack','bread.child','bread.elder','bread.finish','mira.start','mira.case','mira.water','mira.heal','forge.start','forge.inspect','forge.parts','forge.light','forest.start','forest.observe','forest.pick','forest.deliver','family.supper','citadel.voices','citadel.power'];
 for(const event of events){const script=scriptFor(event,route.ended);for(const page of [...script.pages,...(script.response?.('together')??[])]){const st=page.stage!;const m=createMap(st.zone);for(const actor of st.actors)assert.ok(groundWalkable(m,actor.x,actor.y),`${event}:${actor.id} (${actor.x},${actor.y})`);}if(!event.startsWith('citadel.'))assert.doesNotMatch(script.pages.map(p=>p.text).join(''),/「共鳴」|共鳴の加護/);}
});

test('旧記録で一部の章だけ体験しても、未体験の思い出を語らない',()=>{
 const legacy=structuredClone(route.ended);legacy.flags=legacy.flags.filter(f=>!f.startsWith('story:'));
 const family=finishEpisode(legacy,'family');const text=awakening(family).map(p=>p.text).join('');assert.doesNotMatch(text,/手帳を一緒に読|決めるまで、待って|弟子に返事|定期便/);assert.doesNotMatch(endingStory(family).map(p=>p.text).join(''),/弟子から返事|定期便/);
});
