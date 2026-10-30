import assert from 'node:assert/strict';
import { newAdventure, transition, maxHp, has } from '../src/state';
import { validateSave } from '../src/persistence';
import { storyTasks } from '../src/story';
import type { Action, CombatCommand, EnemyId, GameState, StoryChoice, StoryEpisode, Zone } from '../src/types';
export function apply(s:GameState,a:Action){const result=transition(s,a);assert.ok(result.ok,result.message+' '+JSON.stringify(a));if(!result.state.battle)assert.ok(validateSave(result.state),'valid snapshot after '+JSON.stringify(a));return result.state;}
export function travelTo(s:GameState,zone:Zone):GameState{
 if(s.zone===zone)return s;
 if(s.zone==='forest')s=apply(s,{type:'travel',zone:'town'});
 if(s.zone==='abyss')s=apply(s,{type:'travel',zone:'palace'});
 if(s.zone===zone)return s;
 if(zone==='forest'){if(s.zone==='palace')s=apply(s,{type:'travel',zone:'town'});return apply(s,{type:'travel',zone});}
 if(zone==='abyss'){if(s.zone==='town')s=apply(s,{type:'travel',zone:'palace'});return apply(s,{type:'travel',zone});}
 return apply(s,{type:'travel',zone});
}
export function win(s:GameState,enemy:EnemyId):GameState{
 s=apply(s,{type:'startBattle',enemy});for(let n=0;n<100&&s.battle?.result==='active';n++){
 const b=s.battle!;const command:CombatCommand=b.turn%3===0?'guard':b.energy===5&&has(s,'awakened')?'resonate':b.hp<maxHp(s)*.4&&s.inventory.potion?'potion':b.cooldown===0&&s.party.length?'support':'attack';s=apply(s,{type:'combat',command});
 }assert.equal(s.battle!.result,'won');return apply(s,{type:'leaveBattle'});
}
export function finishEpisode(s:GameState,id:StoryEpisode,choices:Partial<Record<StoryEpisode,StoryChoice>>={}):GameState{
 const events:Record<StoryEpisode,string[]>={bread:['bread.pack','bread.elder','bread.child','bread.finish'],mira:['mira.start','mira.case','mira.water','mira.heal'],forge:['forge.start','forge.inspect','forge.parts','forge.light'],forest:['forest.start','forest.observe','forest.pick','forest.deliver'],family:['family.supper'],citadel:['citadel.power','citadel.voices']};
 for(const event of events[id]){const task=storyTasks(s,id).find(t=>t.event===event);assert.ok(task,event);s=travelTo(s,task.zone);const choice=event==='bread.pack'?choices.bread??'share':event==='mira.heal'?choices.mira??'trust':event==='forge.parts'?choices.forge??'reuse':event==='forge.light'?'steady':event==='forest.pick'?'leaf':event==='family.supper'?choices.family??'time':event.startsWith('citadel.')?'together':undefined;s=apply(s,{type:'story',event:task.event,choice});}
 return s;
}
export function checkpoints(choices:Partial<Record<StoryEpisode,StoryChoice>>={}){
 let s=newAdventure();const result:Record<string,GameState>={};s=apply(s,{type:'trade',item:'wheat',direction:'buy',quantity:5});s=apply(s,{type:'deliver',quest:'bread'});result.bread=s;
 s=finishEpisode(s,'bread',choices);s=apply(s,{type:'trade',item:'wheat',direction:'sell',quantity:4});s=travelTo(s,'forest');s=apply(s,{type:'gather',id:'herb1'});s=apply(s,{type:'gather',id:'herb2'});s=travelTo(s,'town');s=apply(s,{type:'deliver',quest:'medicine'});result.mira=s;
 s=finishEpisode(s,'mira',choices);s=travelTo(s,'forest');s=win(s,'bramble');s=travelTo(s,'town');s=apply(s,{type:'equip'});s=travelTo(s,'palace');s=apply(s,{type:'audience'});result.forge=s;
 if(choices.forge==='crystal'){s=travelTo(s,'town');s=apply(s,{type:'trade',item:'crystal',direction:'buy',quantity:1});}
 s=finishEpisode(s,'forge',choices);result.forest=s;s=finishEpisode(s,'forest',choices);result.trials=s;s=travelTo(s,'palace');for(const enemy of ['flame','tide','grove','storm'] as const)s=win(s,enemy);result.family=s;
 s=finishEpisode(s,'family',choices);s=travelTo(s,'palace');s=apply(s,{type:'awaken'});result.citadel=s;
 s=finishEpisode(s,'citadel',choices);s=win(s,'demon');result.ended=s;return result;
}
