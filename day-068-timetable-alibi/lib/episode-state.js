import {NEXT_PHASES,NEXT_VISITS,freshContinuation,advanceContinuation,readContinuationFields,restoreContinuation,continuationObjective,continuationTime} from './continuation-state.js';
import {EPISODE_CASE,EVIDENCE} from './episode-data.js';
import {investigate} from './logic.js';
export const EPISODE_STORAGE_KEY='day68-story-episode1-v1';
export const PHASES=['prologue','incoming','witness','investigate','trust','unlocked','platform','reunion','ending',...NEXT_PHASES];
const visits=['camera','board','door','ticket','staircase',...NEXT_VISITS];
const questions=['about-toru','why-locked'];
const includes=(list,values)=>values.every(v=>list.includes(v));
const unique=(arr)=>[...new Set(arr)];
export function newEpisode(sound=false){
 return {...freshContinuation(),version:2,phase:'prologue',evidence:[],visited:[],asked:[],openingChoice:null,trustChoice:null,reunionChoice:null,sound,log:[]};
}
function withEvidence(s,...ids){return {...s,evidence:unique([...s.evidence,...ids])};}
function visit(s,id){return {...s,visited:unique([...s.visited,id])};}
export function judgeProof(owned,selected,reason){
 if(!Array.isArray(selected)||selected.length!==2||new Set(selected).size!==2)return {status:'choose-two'};
 if(!selected.every(id=>owned.includes(id)))return {status:'not-owned'};
 if(!includes(selected,['photo','express']))return {status:'unrelated'};
 if(reason!=='no-stop')return {status:reason?'wrong-reason':'choose-reason'};
 const answer=investigate(EPISODE_CASE,EPISODE_CASE.people[0]);
 return {status:answer.contradiction?'contradiction':'supported',...answer};
}
export function advanceEpisode(state,event){
 let s={...state};
 const at=(...phases)=>phases.includes(s.phase);
 switch(event.type){
 case 'opening-choice':
  if(!at('prologue')||!['promise','tease'].includes(event.value))return state;
  return {...s,openingChoice:event.value};
 case 'begin':
  if(!at('prologue')||!s.openingChoice)return state;
  return withEvidence({...s,phase:'incoming'},'ticket');
 case 'read-message':
  if(!at('incoming'))return state;
  return withEvidence({...s,phase:'witness'},'message');
 case 'heard-witness':
  if(!at('witness'))return state;
  return withEvidence({...s,phase:'investigate'},'testimony','footage');
 case 'inspect-camera':
  if(!at('investigate','unlocked'))return state;
  return visit(withEvidence(s,'photo'),'camera');
 case 'inspect-board':
  if(!at('investigate','unlocked'))return state;
  return visit(s,'board');
 case 'record-express':
  if(!at('investigate','unlocked')||!s.visited.includes('board'))return state;
  return withEvidence(s,'express');
 case 'inspect-door':
  if(!at('investigate','unlocked'))return state;
  return visit(s,'door');
 case 'ask':
  if(!at('investigate','unlocked')||!questions.includes(event.value))return state;
  return {...s,asked:unique([...s.asked,event.value])};
 case 'present':
  if(!at('investigate')||judgeProof(s.evidence,event.selected,event.reason).status!=='contradiction')return state;
  return {...s,phase:'trust'};
 case 'trust-choice':
  if(!at('trust')||!['ticket','concern'].includes(event.value))return state;
  return {...s,trustChoice:event.value};
 case 'receive-key':
  if(!at('trust')||!s.trustChoice)return state;
  return withEvidence({...s,phase:'unlocked'},'key');
 case 'enter-platform':
  if(!at('unlocked')||!s.evidence.includes('key'))return state;
  return {...s,phase:'platform'};
 case 'inspect-ticket':
  if(!at('platform'))return state;
  return visit(withEvidence(s,'fragment'),'ticket');
 case 'find-toru':
  if(!at('platform'))return state;
  return visit({...s,phase:'reunion'},'staircase');
 case 'reunion-choice':
  if(!at('reunion')||!['warm','urgent'].includes(event.value))return state;
  return {...s,reunionChoice:event.value};
 case 'finish':
  if(!at('reunion')||!s.reunionChoice)return state;
  return withEvidence({...s,phase:'ending'},'reunion');
 case 'set-sound':return {...s,sound:event.value===true};
 case 'log':{
  const l=event.line;
  if(!l||typeof l.text!=='string'||typeof l.name!=='string')return state;
  if(s.log.some(p=>p.id===l.id&&p.text===l.text))return state;
  return {...s,log:[...s.log,{id:String(l.id||''),name:l.name.slice(0,40),text:l.text.slice(0,600)}].slice(-160)};
 }
 default:return advanceContinuation(state,event);
 }
}
export function restoreEpisode(raw){
 if(!raw||![1,2].includes(raw.version)||!PHASES.includes(raw.phase))return newEpisode();
 const s={...newEpisode(raw.sound===true),...readContinuationFields(raw)};
 s.evidence=unique(Array.isArray(raw.evidence)?raw.evidence.filter(id=>Object.hasOwn(EVIDENCE,id)):[]);
 s.visited=unique(Array.isArray(raw.visited)?raw.visited.filter(id=>visits.includes(id)):[]);
 s.asked=unique(Array.isArray(raw.asked)?raw.asked.filter(id=>questions.includes(id)):[]);
 s.openingChoice=['promise','tease'].includes(raw.openingChoice)?raw.openingChoice:null;
 s.trustChoice=['ticket','concern'].includes(raw.trustChoice)?raw.trustChoice:null;
 s.reunionChoice=['warm','urgent'].includes(raw.reunionChoice)?raw.reunionChoice:null;
 let rank=PHASES.indexOf(raw.phase);
 if(rank>=1&&(!s.openingChoice||!s.evidence.includes('ticket')))rank=0;
 if(rank>=2&&!s.evidence.includes('message'))rank=1;
 if(rank>=3&&!includes(s.evidence,['testimony','footage']))rank=2;
 if(rank>=4&&(!s.evidence.includes('express')||!(s.evidence.includes('photo')||(rank>=9&&s.photoChoice==='erase'&&s.evidence.includes('photo-memory')))))rank=3;
 if(rank>=5&&(!s.trustChoice||!s.evidence.includes('key')))rank=4;
 if(rank>=8&&(!s.reunionChoice||!s.evidence.includes('reunion')))rank=7;
 s.phase=PHASES[rank];
 if(rank<5)s.evidence=s.evidence.filter(id=>!['key','fragment','reunion'].includes(id));
 if(rank<6)s.evidence=s.evidence.filter(id=>!['fragment','reunion'].includes(id));
 s.log=Array.isArray(raw.log)?raw.log.filter(l=>l&&typeof l.name==='string'&&typeof l.text==='string').slice(-160).map(l=>({id:String(l.id||''),name:l.name.slice(0,40),text:l.text.slice(0,600)})):[];
 return restoreContinuation(s,raw);
}
export function loadEpisode(storage){
 try{return {state:restoreEpisode(JSON.parse(storage.getItem(EPISODE_STORAGE_KEY))),available:true};}
 catch{return {state:newEpisode(),available:false};}
}
export function saveEpisode(storage,state){
 try{storage.setItem(EPISODE_STORAGE_KEY,JSON.stringify(state));return true;}catch{return false;}
}
export function objectiveFor(s){
 const next=continuationObjective(s);if(next)return next;
 if(s.phase==='prologue')return '帰りの約束を、透と交わす。';
 if(s.phase==='incoming')return '透から届いた、伝言を読む。';
 if(s.phase==='witness')return '駅文庫の栞に、透の行方を聞く。';
 if(s.phase==='investigate'){
  if(!s.evidence.includes('photo'))return 'ベンチに残された、透のカメラを調べる。';
  if(!s.evidence.includes('express'))return '発車案内で、急行の停車駅を確かめる。';
  return '二つの記録を結び付け、栞に証拠を示す。';
 }
 if(s.phase==='trust')return '栞が行き先を偽った理由を聞く。';
 if(s.phase==='unlocked')return '栞から受け取った鍵で、奥の扉を開ける。';
 if(s.phase==='platform')return '閉鎖ホームで、透の足取りを探す。';
 if(s.phase==='reunion')return '見つけた相棒に、声をかける。';
 return '相棒は見つかった。映像の人物の謎が残る。';
}
export function storyTime(s){
 const next=continuationTime(s);if(next!==null){const h=Math.floor(next/60),m=next%60;return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');}
 return s.phase==='prologue'?'22:30':['incoming','witness','investigate'].includes(s.phase)?'23:18':['trust','unlocked'].includes(s.phase)?'23:20':'23:21';
}
