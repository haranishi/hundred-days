import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceEpisode as step,restoreEpisode,storyTime,loadEpisode,EPISODE_STORAGE_KEY} from '../lib/episode-state.js';
import {judgeBoarding,judgeFinalProof} from '../lib/continuation-state.js';
import {EPISODE_CASE} from '../lib/episode-data.js';
import {EDITOR_RECORD} from '../lib/continuation-data.js';
import {validateCase} from '../lib/logic.js';
import {STATIONS} from '../lib/network.js';
import {actOne,continuationSeed} from './story-fixtures.mjs';
const e=(type,extra={})=>({type,...extra});
function arrive(s,id){s=step(s,e('board-train',{trainId:id}));assert.equal(s.phase,'riding');return step(s,e('arrive'));}
function atHarbor(photo,route,track){
 let s=continuationSeed(photo,route);track?.(s);
 if(route==='station'){for(const type of ['archive-ledger','archive-envelope','leave-archive']){s=step(s,e(type));track?.(s);}}
 s=step(s,e('board-train',{trainId:route==='station'?'R504':'R502'}));track?.(s);s=step(s,e('arrive'));track?.(s);
 if(s.phase==='central'){s=step(s,e('board-train',{trainId:'E405'}));track?.(s);s=step(s,e('arrive'));track?.(s);}
 s=step(s,e('heard-harbor'));track?.(s);
 if(route==='escort'){s=step(s,e('heard-akari'));track?.(s);}
 s=step(s,e('heard-editor'));s=step(s,e('record-return-table'));track?.(s);return s;
}
test('new timetable stays valid and a direct train needs no change at Central',()=>{
 assert.equal(validateCase(EPISODE_CASE,STATIONS),true);
 const a=judgeBoarding(continuationSeed(),'R502');assert.equal(a.status,'valid');assert.equal(a.leg.arrive,1423);assert.equal(a.connection,false);
});
test('erasing and keeping genuinely change owned photographs and both preserve the first solution',()=>{
 for(const photo of ['erase','keep']){
  const s=continuationSeed(photo);assert.equal(s.evidence.includes('photo'),photo==='keep');assert.equal(s.evidence.includes('photo-memory'),photo==='erase');assert.ok(s.evidence.includes('key')&&s.evidence.includes('reunion'));assert.deepEqual(restoreEpisode(s),s);
 }
});
test('route choice changes the investigation, evidence, clock and available departures',()=>{
 const a=continuationSeed('keep','escort'),b=continuationSeed('keep','station');assert.equal(a.phase,'travel');assert.equal(b.phase,'archive');assert.equal(storyTime(a),'23:21');assert.equal(storyTime(b),'23:25');
 assert.equal(judgeBoarding({...b,phase:'travel'},'R502').status,'departed');assert.strictEqual(step(b,e('leave-archive')),b);
 assert.strictEqual(step({...a,phase:'harbor'},e('archive-ledger')).evidence,a.evidence);
});
test('wrong destination, passing express and missed trains never advance the story',()=>{
 const s=continuationSeed();assert.equal(judgeBoarding(s,'M501').status,'wrong-destination');assert.equal(judgeBoarding(s,'EX1').status,'not-served');
 for(const trainId of ['EX1','M501','unknown'])assert.strictEqual(step(s,e('board-train',{trainId})),s);
});
test('one minute transfer is rejected, a three minute transfer reaches port at 23:46',()=>{
 let s=continuationSeed();s=arrive(s,'R504');assert.equal(s.phase,'central');assert.equal(storyTime(s),'23:37');
 assert.equal(judgeBoarding(s,'E404').status,'transfer');assert.strictEqual(step(s,e('board-train',{trainId:'E404'})),s);
 s=arrive(s,'E405');assert.equal(s.phase,'harbor-intro');assert.equal(storyTime(s),'23:46');assert.deepEqual(s.journey.map(l=>l.trainId),['R504','E405']);
});
test('all four photo and investigation combinations solve with owned route-specific evidence',()=>{
 for(const photo of ['erase','keep'])for(const route of ['escort','station']){
  let s=atHarbor(photo,route),record=route==='escort'?'toru-note':'station-log',proof={selected:[record,'return-table'],reason:'arrival'};
  const a=judgeFinalProof(s,proof.selected,proof.reason);assert.equal(a.status,'contradiction');assert.equal(a.arrival,1423);assert.equal(a.gap,9);
  s=step(s,e('present-final',proof));s=step(s,e('resolve'));assert.equal(s.phase,'camera');assert.ok(s.evidence.includes('original-returned'));s=step(s,e('set-framing',{value:'tickets'}));s=step(s,e('take-photo'));assert.equal(s.phase,'complete');assert.equal(storyTime(s),'23:47');assert.equal(s.framing,'tickets');assert.strictEqual(step(s,e('take-photo')),s);
 }
});
test('the other branch record cannot be invented, and wrong final reasons do not solve',()=>{
 const s=atHarbor('erase','escort');assert.equal(judgeFinalProof(s,['station-log','return-table'],'arrival').status,'not-owned');assert.equal(judgeFinalProof(s,['photo-memory','return-table'],'arrival').status,'unrelated');assert.equal(judgeFinalProof(s,['toru-note','return-table'],'umbrella').status,'wrong-reason');
 assert.strictEqual(step(s,e('present-final',{selected:['toru-note','return-table'],reason:'umbrella'})),s);assert.strictEqual(step(s,e('take-photo')),s);
});
test('every legitimate continuation milestone restores including erased photos and second leg riding',()=>{
 for(const photo of ['erase','keep'])for(const route of ['escort','station']){
  const track=s=>assert.deepEqual(restoreEpisode(JSON.parse(JSON.stringify(s))),s,'restore '+s.phase+' '+route+' '+photo);
  let s=atHarbor(photo,route,track);s=step(s,e('present-final',{selected:[route==='escort'?'toru-note':'station-log','return-table'],reason:'arrival'}));track(s);s=step(s,e('resolve'));track(s);s=step(s,e('set-framing',{value:'tickets'}));track(s);s=step(s,e('take-photo'));track(s);
 }
});
test('old version-one completion upgrades in place and can start the continuation',()=>{
 const old={...actOne(),version:1};for(const k of ['photoChoice','route','journey','activeLeg','finalProof','solvedFinal','framing'])delete old[k];
 const values=new Map([[EPISODE_STORAGE_KEY,JSON.stringify(old)],['timetable-alibi-v1','keep']]);
 const s=loadEpisode({getItem:k=>values.get(k)}).state;assert.equal(s.phase,'ending');assert.equal(s.version,2);assert.equal(step(s,e('continue-story')).phase,'request');assert.equal(values.get('timetable-alibi-v1'),'keep');
});
test('corrupt completed saves fall back before unearned travel, proof and photographs',()=>{
 const s=continuationSeed('erase','escort');assert.equal(restoreEpisode({...s,phase:'complete',solvedFinal:true}).phase,'travel');
 let h=atHarbor('keep','station');assert.equal(restoreEpisode({...h,phase:'complete',solvedFinal:true,evidence:[...h.evidence,'last-photo','original-returned']}).phase,'harbor');
});
test('rewinding the fictional timeline retains the first investigation and resets only continuation choices',()=>{
 let s=atHarbor('erase','escort');s=step(s,e('present-final',{selected:['toru-note','return-table'],reason:'arrival'}));s=step(s,e('resolve'));s=step(s,e('take-photo'));s=step(s,e('rewind-continuation'));
 assert.equal(s.phase,'ending');assert.equal(s.photoChoice,null);assert.equal(s.route,null);assert.deepEqual(s.journey,[]);assert.ok(s.evidence.includes('photo')&&s.evidence.includes('key'));assert.ok(!s.evidence.includes('last-photo'));assert.deepEqual(restoreEpisode(s),s);
});

test('the editor visits after the camera record and before the witness has already hidden Toru',()=>{
 const [h,m]=storyTime({phase:'witness'}).split(':').map(Number);
 assert.ok(EDITOR_RECORD.time>=EPISODE_CASE.people[0].record.time);
 assert.ok(EDITOR_RECORD.time<h*60+m);
});
