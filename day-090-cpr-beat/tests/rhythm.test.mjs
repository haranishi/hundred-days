import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyInterval, summarize, Session, MotionDetector, DURATION } from '../lib/rhythm.js';

test('100 and 120 per minute are inclusive; faster/slower/invalid intervals are distinct', () => {
  assert.equal(classifyInterval(600), 'in-range'); assert.equal(classifyInterval(500), 'in-range');
  assert.equal(classifyInterval(499.9), 'fast'); assert.equal(classifyInterval(600.1), 'slow');
  for (const value of [0, -1, NaN, Infinity]) assert.equal(classifyInterval(value), 'unknown');
});
test('steady 110 BPM is counted from intervals, without first-tap or rounding bias', () => {
  const times = Array.from({ length: 55 }, (_, i) => 100 + i * 60000 / 110);
  const result = summarize(times, 0, DURATION);
  assert.equal(result.taps, 55); assert.equal(result.intervalCount, 54);
  assert.equal(result.inRange, 54); assert.equal(result.percent, 100);
  assert.ok(Math.abs(result.averageBpm - 110) < 1e-8); assert.equal(result.enoughData, true);
});
test('slow gaps are retained in average and range rate; leading/trailing silence is visible', () => {
  const times = [5000,5550,6100,6650,7200,7750,8300,8850,9400,9950,10500,15000];
  const result = summarize(times, 0, 30000);
  assert.equal(result.intervalCount, 11); assert.equal(result.inRange, 10);
  assert.equal(result.percent, 91); assert.equal(result.averageBpm, 66); assert.equal(result.longestGap, 15000);
});
test('zero taps, one tap, and short bursts are insufficient data rather than a success', () => {
  for (const times of [[], [100], [0,550], Array.from({length:11}, (_,i)=>i*100)]) {
    assert.equal(summarize(times, 0, 30000).enoughData, false);
  }
  assert.equal(summarize([], 0, 30000).longestGap, 30000);
  assert.equal(summarize([], 0, 30000).averageBpm, null);
});
test('session rejects pre-start, end boundary, duplicate and backwards input', () => {
  const session = new Session(3000);
  for (const now of [2000,33000,Infinity,NaN]) assert.equal(session.record(now), false);
  assert.equal(session.record(3000), true); assert.equal(session.record(3500), true);
  assert.equal(session.record(3500), false); assert.equal(session.record(3400), false);
  assert.equal(session.record(32999), true); assert.equal(session.result().taps, 3);
});
test('recent feedback uses recent six real intervals, including a pause', () => {
  const session = new Session(0);
  [0,550,1100].forEach(t=>session.record(t)); assert.equal(session.recent(), null);
  session.record(1650); assert.equal(session.recent().classification, 'in-range');
  session.record(5000); assert.equal(session.recent().classification, 'slow');
});
test('motion detector ignores startup, static gravity, null and nonnumeric samples', () => {
  const detector = new MotionDetector();
  for (let i=0;i<50;i++) assert.equal(detector.feed({accelerationIncludingGravity:{x:0,y:0,z:9.8}},i*20).pulse,false);
  for (const event of [{}, {acceleration:{x:null,y:0,z:0}}, {acceleration:{x:Infinity,y:0,z:0}}]) assert.equal(detector.feed(event,2000).valid,false);
});
test('one motion per pulse with hysteresis/refractory period, then detects the next cycle', () => {
  const detector = new MotionDetector();
  const feed = (x,t)=>detector.feed({acceleration:{x,y:0,z:0}},t).pulse;
  for(let i=0;i<4;i++) feed(0,i*10);
  assert.equal(feed(4,100),true); assert.equal(feed(5,120),false);
  assert.equal(feed(-4,150),false); assert.equal(feed(4,200),false);
  assert.equal(feed(4,650),true); assert.equal(feed(4,670),false);
  feed(-4,800); assert.equal(feed(4,1200),true);
});

for (const bpm of [100, 110, 120]) {
  for (const gravity of [false,true]) {
    test(`a whole oscillation counts once at ${bpm} BPM, gravity=${gravity}`,()=>{
      const detector=new MotionDetector(), times=[];
      for(let t=0;t<15000;t+=10){
        const v=5*Math.sin(2*Math.PI*t/(60000/bpm));
        const xyz={x:v*.36,y:v*.8,z:v*.48+(gravity?9.8:0)};
        const event=gravity?{accelerationIncludingGravity:xyz}:{acceleration:xyz};
        if(detector.feed(event,t).pulse)times.push(t);
      }
      const measured=60000*(times.length-1)/(times.at(-1)-times[0]);
      assert.ok(Math.abs(measured-bpm)<2, `${measured} differs from ${bpm}`);
      assert.ok(times.every((t,i)=>!i||t-times[i-1]>450));
    });
  }
}
