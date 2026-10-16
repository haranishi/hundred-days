import test from 'node:test';
import assert from 'node:assert/strict';
import {newEpisode,advanceEpisode as step,judgeProof,restoreEpisode,loadEpisode,saveEpisode,EPISODE_STORAGE_KEY,objectiveFor,storyTime} from '../lib/episode-state.js';
import {EPISODE_CASE,trustLines,endingLines} from '../lib/episode-data.js';
import {validateCase,investigate} from '../lib/logic.js';
import {STATIONS} from '../lib/network.js';
const event=(type,extra={})=>({type,...extra});
function investigation(){let s=newEpisode();for(const e of [event('opening-choice',{value:'promise'}),event('begin'),event('read-message'),event('heard-witness')])s=step(s,e);return s;}
function proof(){let s=investigation();for(const e of [event('inspect-camera'),event('inspect-board'),event('record-express'),event('present',{selected:['photo','express'],reason:'no-stop'})])s=step(s,e);return s;}
function unlocked(){let s=proof();s=step(s,event('trust-choice',{value:'ticket'}));return step(s,event('receive-key'));}
test('episode schedule is valid and first possible arrival misses testimony by seven minutes',()=>{
 assert.equal(validateCase(EPISODE_CASE,STATIONS),true);
 const a=investigate(EPISODE_CASE,EPISODE_CASE.people[0]);assert.equal(a.arrival,23*60+43);assert.equal(a.gap,7);assert.equal(a.contradiction,true);
});
test('opening and message do not reveal evidence before it is encountered',()=>{
 let s=newEpisode();assert.strictEqual(step(s,event('begin')),s);
 s=step(s,event('opening-choice',{value:'tease'}));s=step(s,event('begin'));assert.deepEqual(s.evidence,['ticket']);
 s=step(s,event('read-message'));assert.deepEqual(s.evidence,['ticket','message']);assert.equal(s.phase,'witness');
 s=step(s,event('heard-witness'));assert.ok(s.evidence.includes('footage'));assert.ok(s.evidence.includes('testimony'));
});
test('camera and board may be investigated in either order, only once per evidence',()=>{
 for(const order of [['inspect-camera','inspect-board','record-express'],['inspect-board','record-express','inspect-camera']]){
  let s=investigation();for(const type of order)s=step(s,event(type));
  assert.ok(s.evidence.includes('photo')&&s.evidence.includes('express'));s=step(s,event('inspect-camera'));assert.equal(s.evidence.filter(v=>v==='photo').length,1);
 }
 const s=investigation();assert.strictEqual(step(s,event('record-express')),s);
});
test('proof requires two distinct owned records and the correct relation',()=>{
 assert.equal(judgeProof(['photo','express'],['photo','photo'],'no-stop').status,'choose-two');
 assert.equal(judgeProof(['photo'],['photo','express'],'no-stop').status,'not-owned');
 assert.equal(judgeProof(['ticket','message'],['ticket','message'],'no-stop').status,'unrelated');
 assert.equal(judgeProof(['photo','express'],['photo','express'],'last-train').status,'wrong-reason');
 assert.equal(judgeProof(['photo','express'],['photo','express']).status,'choose-reason');
 assert.equal(judgeProof(['photo','express'],['photo','express'],'no-stop').status,'contradiction');
});
test('a wrong accusation cannot create the key or open the door',()=>{
 const s=investigation();
 for(const e of [event('receive-key'),event('enter-platform'),event('find-toru'),event('present',{selected:['ticket','message'],reason:'no-stop'})])assert.strictEqual(step(s,e),s);
 const t=proof();assert.strictEqual(step(t,event('receive-key')),t);assert.strictEqual(step(t,event('enter-platform')),t);
});
test('first confrontation changes witness state and yields an actual key after identity choice',()=>{
 const s=unlocked();assert.equal(s.phase,'unlocked');assert.ok(s.evidence.includes('key'));assert.equal(step(s,event('enter-platform')).phase,'platform');assert.match(objectiveFor(s),/扉/);
 assert.match(trustLines('ticket','promise').at(-1).text,/約束/);assert.match(trustLines('concern','tease').at(-1).text,/遅れない/);
});
test('reunion completes with or without optional half ticket and keeps selected response',()=>{
 for(const collect of [false,true]){
  let s=step(unlocked(),event('enter-platform'));if(collect)s=step(s,event('inspect-ticket'));
  s=step(s,event('find-toru'));assert.strictEqual(step(s,event('finish')),s);s=step(s,event('reunion-choice',{value:'warm'}));s=step(s,event('finish'));
  assert.equal(s.phase,'ending');assert.equal(s.evidence.includes('fragment'),collect);assert.ok(s.evidence.includes('reunion'));assert.match(endingLines('warm')[0].text,/無事/);
 }
});
test('every legitimate saved milestone restores with its dependencies',()=>{
 let s=newEpisode();const path=[event('opening-choice',{value:'promise'}),event('begin'),event('read-message'),event('heard-witness'),event('inspect-camera'),event('inspect-board'),event('record-express'),event('present',{selected:['photo','express'],reason:'no-stop'}),event('trust-choice',{value:'concern'}),event('receive-key'),event('enter-platform'),event('find-toru'),event('reunion-choice',{value:'urgent'}),event('finish')];
 for(const e of path){s=step(s,e);assert.deepEqual(restoreEpisode(JSON.parse(JSON.stringify(s))),s);}
});
test('incomplete or corrupt saves cannot bypass the confrontation',()=>{
 assert.equal(restoreEpisode({version:1,phase:'ending',evidence:['key','reunion'],openingChoice:'promise'}).phase,'prologue');
 const s=investigation();const bad=restoreEpisode({...s,phase:'platform',evidence:[...s.evidence,'key'],trustChoice:'ticket'});
 assert.equal(bad.phase,'investigate');assert.ok(!bad.evidence.includes('key'));
 assert.equal(restoreEpisode({version:99,phase:'ending'}).phase,'prologue');
});
test('storage failure does not prevent play and saving touches only the new story key',()=>{
 const values=new Map([['timetable-alibi-v1','legacy-progress']]),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 assert.equal(saveEpisode(storage,unlocked()),true);assert.equal(loadEpisode(storage).state.phase,'unlocked');assert.equal(values.get('timetable-alibi-v1'),'legacy-progress');assert.ok(values.has(EPISODE_STORAGE_KEY));
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 assert.equal(loadEpisode(blocked).available,false);assert.equal(saveEpisode(blocked,newEpisode()),false);
});
test('logs deduplicate replay and story time advances only by milestone',()=>{
 let s=investigation();const e=event('log',{line:{id:'a',name:'栞',text:'透を探しているんですか'}});s=step(s,e);assert.strictEqual(step(s,e),s);assert.equal(storyTime(s),'23:18');
 assert.equal(storyTime(unlocked()),'23:20');assert.equal(storyTime(step(unlocked(),event('enter-platform'))),'23:21');
});
