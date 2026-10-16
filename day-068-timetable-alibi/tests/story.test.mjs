import test from 'node:test';
import assert from 'node:assert/strict';
import {CASES} from '../lib/cases.js';
import {investigate,formatTime} from '../lib/logic.js';
import {STORIES,assessEvidence,confrontationLines} from '../lib/story.js';

for(const c of CASES){
 test(c.title+': only the contradictory person AND the relevant evidence solve the chapter',()=>{
  const accepted=[];
  for(const p of c.people){
   for(const e of STORIES[c.id].evidence){
    const answer=assessEvidence(c,p,e.id);
    if(answer.status==='contradiction')accepted.push({p:p.id,e:e.id});
    else if(!investigate(c,p).contradiction)assert.equal(answer.status,'supported');
    else assert.equal(answer.status,'irrelevant');
   }
  }
  assert.deepEqual(accepted,[{p:c.people.find(p=>investigate(c,p).contradiction).id,e:STORIES[c.id].key}]);
 });
 test(c.title+': forged evidence never solves, and a now-feasible claim cannot be accused',()=>{
  const p=c.people.find(p=>investigate(c,p).contradiction),arrival=investigate(c,p).arrival;
  assert.equal(assessEvidence(c,p,'forged').status,'invalid');
  const feasible={...p,claim:{...p.claim,time:arrival}};
  assert.equal(assessEvidence(c,feasible,STORIES[c.id].key).status,'supported');
 });
 test(c.title+': confrontation uses calculated arrival and gives a character response',()=>{
  const p=c.people.find(p=>investigate(c,p).contradiction),answer=investigate(c,p),lines=confrontationLines(c,p,answer);
  assert.ok(lines[0].text.includes(formatTime(answer.arrival)));
  assert.ok(lines[0].text.includes(String(answer.gap)+'分'));
  assert.equal(lines[0].speaker,'detective');
  assert.equal(lines[1].mood,'surprised');
  assert.equal(lines.at(-1).mood,'relieved');
  for(const person of c.people){
   const story=STORIES[c.id].people[person.id];
   assert.ok(story.greeting&&story.defense&&story.questions.length);
   assert.equal(new Set(story.questions.map(q=>q.id)).size,story.questions.length);
   for(const q of story.questions)assert.ok(q.label&&q.text&&q.note);
  }
 });
}
test('the final confession identifies the ticket location, rather than declaring a criminal',()=>{
 assert.match(STORIES['passing-station'].reveal.map(l=>l.text).join(''),/霧山の待合室/);
 assert.match(STORIES['passing-station'].reveal.map(l=>l.text).join(''),/時刻表の箱/);
 assert.doesNotMatch(STORIES['passing-station'].reveal.map(l=>l.text).join(''),/逮捕|殺人/);
});
