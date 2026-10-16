import test from 'node:test';
import assert from 'node:assert/strict';
import { CASES } from '../lib/cases.js';
import { STATIONS, TRACKS, trackPoints, routePoints, pointAlong } from '../lib/network.js';
import { earliestJourney, investigate, validateCase, trainState, formatTime, readProgress, saveProgress, STORAGE_KEY } from '../lib/logic.js';

// Exhaustive journey enumeration, deliberately independent of the priority-queue solver.
function oracle(c, from, at, to, used = 0) {
  if (from === to) return at;
  if (used > c.trains.length) return Infinity;
  let result = Infinity;
  const ready = at + (used ? c.transferMinutes : 0);
  for (const train of c.trains) {
    for (let i = 0; i < train.stops.length - 1; i++) {
      if (train.stops[i].station !== from || train.stops[i].depart < ready) continue;
      for (const target of train.stops.slice(i+1)) {
        result = Math.min(result, oracle(c,target.station,target.arrive,to,used+1));
      }
    }
  }
  return result;
}
for (const c of CASES) {
  test(c.title + ': exactly one contradiction and no missing station', () => assert.equal(validateCase(c,STATIONS),true));
  test(c.title + ': solver agrees with exhaustive journeys for every station pair', () => {
    for (const a of STATIONS) for (const b of STATIONS) {
      for (let time=c.start;time<=c.end;time+=3) {
        assert.equal(earliestJourney(c,a.id,time,b.id).arrival,oracle(c,a.id,time,b.id),a.id+' '+b.id+' '+time);
      }
    }
  });
}
test('case 1: the fastest possible arrival is 18:38, eight minutes late', () => {
  const answer=investigate(CASES[0],CASES[0].people[1]);
  assert.equal(answer.arrival,18*60+38); assert.equal(answer.gap,8); assert.equal(answer.legs.length,2);
});
test('case 2: a one minute change misses the 19:14 train', () => {
  const answer=investigate(CASES[1],CASES[1].people[0]);
  assert.equal(answer.arrival,19*60+30); assert.equal(answer.legs[1].train,'B3');
});
test('case 3: an express passing a station cannot be used to alight there', () => {
  const answer=investigate(CASES[2],CASES[2].people[2]);
  assert.equal(answer.arrival,20*60+34); assert.equal(answer.gap,9);
  assert.equal(investigate(CASES[2],CASES[2].people[0]).contradiction,false);
});
test('staying on the same train does not incur a platform change', () => {
  assert.equal(earliestJourney(CASES[1],'harbor',19*60+3,'forest').arrival,19*60+22);
});
test('exact departure boundary is permitted; a later boarding misses the train', () => {
  assert.equal(earliestJourney(CASES[0],'harbor',18*60+5,'ridge').arrival,18*60+28);
  assert.equal(earliestJourney(CASES[0],'harbor',18*60+5.01,'ridge').arrival,Infinity);
});
test('arriving early satisfies a later testimony', () => assert.equal(investigate(CASES[0],CASES[0].people[0]).contradiction,false));
test('staying at the confirmed station is valid; missing all trains is impossible', () => {
  assert.deepEqual(earliestJourney(CASES[0],'harbor',1084,'harbor'),{arrival:1084,legs:[]});
  assert.equal(earliestJourney(CASES[0],'harbor',1200,'ridge').arrival,Infinity);
});
test('invalid timetables and ambiguous cases are rejected', () => {
  const c=structuredClone(CASES[0]); c.trains[0].stops[1].arrive=0;
  assert.throws(()=>validateCase(c,STATIONS),/Invalid stop/);
  const ambiguous=structuredClone(CASES[0]); ambiguous.people[0].claim.time=ambiguous.people[0].record.time;
  assert.throws(()=>validateCase(ambiguous,STATIONS),/Expected one/);
});
test('visual train state waits, departs, stops, and arrives at the timetable boundary', () => {
  const t=CASES[0].trains[0];
  assert.equal(trainState(t,1084).kind,'waiting');
  assert.equal(trainState(t,1086).kind,'moving');
  assert.equal(trainState(t,1094).kind,'stopped');
  assert.equal(trainState(t,1096.1).kind,'moving');
  assert.equal(trainState(t,1104).kind,'arrived');
});
test('visual routes stay connected, including the express via unserved stations', () => {
  for(const e of TRACKS) {
    const points=trackPoints(e), a=STATIONS.find(s=>s.id===e.from),b=STATIONS.find(s=>s.id===e.to);
    assert.deepEqual(points[0],{x:a.x,z:a.z}); assert.deepEqual(points.at(-1),{x:b.x,z:b.z});
  }
  const path=routePoints('harbor','onsen');
  assert.equal(path.length,121);
  assert.equal(pointAlong(path,0).x,-13);
  assert.equal(pointAlong(path,1).x,13);
  const reverse=routePoints('onsen','harbor');assert.equal(pointAlong(reverse,1).x,-13);
});
test('saved progress filters unknown cases, deduplicates, and handles broken/blocked storage', () => {
  const ids=CASES.map(c=>c.id), data=new Map();
  const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  assert.equal(saveProgress(storage,{solved:[ids[0]],sound:true}),true);
  assert.deepEqual(readProgress(storage,ids),{solved:[ids[0]],sound:true});
  data.set(STORAGE_KEY,JSON.stringify({solved:[ids[0],ids[0],'unknown'],sound:'yes'}));
  assert.deepEqual(readProgress(storage,ids),{solved:[ids[0]],sound:false});
  data.set(STORAGE_KEY,'{broken');assert.deepEqual(readProgress(storage,ids),{solved:[],sound:false});
  assert.equal(saveProgress(null,{solved:[]}),false);assert.deepEqual(readProgress(null,ids),{solved:[],sound:false});
});
test('times use zero padding and reject unreachable values', () => {
  assert.equal(formatTime(1084.9),'18:04');assert.equal(formatTime(Infinity),'到達不可');
});

test('the contradiction belongs to a different person in each case',()=>{
  const ids=CASES.map(c=>c.people.find(p=>investigate(c,p).contradiction).id);
  assert.equal(new Set(ids).size,CASES.length);
});

test('a transfer of exactly two minutes is feasible but one minute is not',()=>{
  const stop=(station,time)=>({station,arrive:time,depart:time});
  const c={transferMinutes:2,trains:[
    {id:'first',stops:[stop('harbor',100),stop('central',110)]},
    {id:'second',stops:[stop('central',112),stop('ridge',120)]}
  ]};
  assert.equal(earliestJourney(c,'harbor',100,'ridge').arrival,120);
  c.trains[1].stops[0]=stop('central',111);
  assert.equal(earliestJourney(c,'harbor',100,'ridge').arrival,Infinity);
});
