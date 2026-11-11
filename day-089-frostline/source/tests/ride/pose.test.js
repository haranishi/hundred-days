import { describe, it, expect } from 'vitest';
import { BODY, createPose, createPoseMemory, solvePose } from '../../src/render/ride/pose.js';
import { riding, flat, distance } from './fixtures.js';
const pairs = [['hipL', 'kneeL', 'thigh'], ['kneeL', 'ankleL', 'shin'], ['hipR', 'kneeR', 'thigh'], ['kneeR', 'ankleR', 'shin'],
  ['shoulderL', 'elbowL', 'upperArm'], ['elbowL', 'handL', 'forearm'], ['shoulderR', 'elbowR', 'upperArm'], ['elbowR', 'handR', 'forearm']];
function checkPose(p) {
  for (const j of Object.values(p.joints)) for (const n of ['x', 'y', 'z']) expect(Number.isFinite(j[n])).toBe(true);
  for (const key of ['fwd', 'up', 'right']) expect(Math.hypot(...Object.values(p.board[key]))).toBeCloseTo(1, 8);
  for (const [a, b, dim] of pairs) {
    const root = a.startsWith('hip') || a.startsWith('knee') ? p.joints[`hip${a.at(-1)}`] : p.joints[`shoulder${a.at(-1)}`];
    const end = a.startsWith('hip') || a.startsWith('knee') ? p.joints[`ankle${a.at(-1)}`] : p.joints[`hand${a.at(-1)}`];
    const reach = a.startsWith('hip') || a.startsWith('knee') ? BODY.thigh + BODY.shin : BODY.upperArm + BODY.forearm;
    if (distance(root, end) <= reach + 1e-9) expect(distance(p.joints[a], p.joints[b])).toBeCloseTo(BODY[dim], 7);
  }
  for (const side of ['L', 'R']) {
    const a = p.joints[`ankle${side}`], b = p.board;
    const h = (a.x - b.pos.x) * b.up.x + (a.y - b.pos.y) * b.up.y + (a.z - b.pos.z) * b.up.z;
    expect(h).toBeCloseTo(0.11, 8);
  }
}
function step(s, m, p, extra = {}) { return solvePose({ state: s, events: [], dt: 1 / 60, jumped: false, heightAt: flat, ...extra }, m, p); }

describe('rider pose', () => {
  it('holds a flexed riding stance: the pelvis follows state.leg but stays below a straight-legged stand', () => {
    // 見た目の決定（依頼元）：滑走中は直立しない。腰の高さは leg の 0.86 倍（上限 0.78 m）＋足首の高さ。
    const p = createPose(); step(riding({ leg: 0.9 }), createPoseMemory(), p);
    expect(p.joints.pelvis.y - p.board.pos.y).toBeCloseTo(0.9 * 0.86 + BODY.ankleHeight, 10);
    const head = p.joints.head.y - p.board.pos.y;
    expect(head).toBeLessThan(BODY.height - 0.1);
    expect(head).toBeGreaterThan(1.4);
    // 脚を縮めると、腰も下がる
    const q = createPose(); step(riding({ leg: 0.6 }), createPoseMemory(), q);
    expect(q.joints.pelvis.y - q.board.pos.y).toBeCloseTo(0.6 * 0.86 + BODY.ankleHeight, 10);
  });
  it('keeps dimensions and finite joints over both stances, switch and all modes', () => {
    for (const stance of [1, -1]) for (const sw of [false, true]) for (const edge of [-Math.PI / 3, 0, Math.PI / 3]) {
      for (const crouch of [0, 0.5, 1]) for (const mode of ['carve', 'skid', 'air', 'crash', 'rest']) {
        const s = riding({ stance, switch: sw, edge, crouch, mode, gLoad: 3 });
        const m = createPoseMemory(), p = createPose();
        for (let i = 0; i < 3; i++) step(s, m, p); checkPose(p);
      }
    }
  });
  it('settles after two seconds and preserves output objects', () => {
    const s = riding({ edge: 0.5, crouch: 0.4, yawRate: 0.5 }), p = createPose(), m = createPoseMemory();
    const joint = p.joints.handL, board = p.board;
    step(s, m, p); for (let i = 0; i < 120; i++) step(s, m, p);
    const before = structuredClone(p); step(s, m, p);
    for (const name in p.joints) expect(distance(before.joints[name], p.joints[name])).toBeLessThan(1e-5);
    expect(p.joints.handL).toBe(joint); expect(p.board).toBe(board);
  });
  it('keeps left/right hips on the same board ends as their ankles in both stances', () => {
    for (const stance of [1, -1]) {
      const p = createPose(); step(riding({ stance }), createPoseMemory(), p);
      const hipDelta = p.joints.hipL.z - p.joints.hipR.z;
      const ankleDelta = p.joints.ankleL.z - p.joints.ankleR.z;
      expect(hipDelta * ankleDelta).toBeGreaterThan(0);
    }
  });
  it('gets up within 0.4 seconds and does not unwind after a long crash', () => {
    const s = riding({ speed: 30, mode: 'rest' }), m = createPoseMemory(), p = createPose(); step(s, m, p);
    s.mode = 'carve';
    for (let i = 0; i < 24; i++) step(s, m, p, { events: i === 0 ? [{ type: 'recover' }] : [] });
    const normal = createPose(); step(s, createPoseMemory(), normal);
    expect(distance(p.joints.pelvis, normal.joints.pelvis)).toBeLessThan(0.025);
    expect(distance(p.joints.head, normal.joints.head)).toBeLessThan(0.04);
    s.mode = 'crash';
    for (let i = 0; i < 300; i++) step(s, m, p);
    s.mode = 'rest';
    for (let i = 0; i < 90; i++) {
      const previous = structuredClone(p); step(s, m, p);
      for (const name in p.joints) expect(distance(p.joints[name], previous.joints[name]), name).toBeLessThanOrEqual(0.25);
    }
  });
  it('keeps elbows continuous throughout ten seconds of crash rolling', () => {
    const s = riding({ speed: 30, mode: 'crash' }), p = createPose(), m = createPoseMemory(); step(s, m, p);
    for (let i = 0; i < 600; i++) {
      const previous = structuredClone(p); step(s, m, p);
      for (const name in p.joints) expect(distance(p.joints[name], previous.joints[name]), name).toBeLessThanOrEqual(0.25);
    }
  });
  it('smooths abrupt carve-air-land and recover transitions; jumped resets memory', () => {
    const s = riding(), p = createPose(), m = createPoseMemory(); step(s, m, p);
    for (const mode of ['carve', 'air', 'carve', 'crash', 'rest', 'carve']) {
      s.mode = mode; s.edge = mode === 'carve' ? 0.8 : 0; s.crouch = mode === 'air' ? 1 : 0.3;
      for (let i = 0; i < 30; i++) {
        const prev = structuredClone(p);
        step(s, m, p, { events: i === 0 && mode === 'carve' ? [{ type: 'land', efh: 1 }, { type: 'recover' }] : [] });
        for (const name in p.joints) expect(distance(prev.joints[name], p.joints[name]), name).toBeLessThanOrEqual(0.25);
      }
    }
    s.pos.x = 100; step(s, m, p, { jumped: true });
    expect(p.board.pos.x).toBe(100); expect(p.joints.pelvis.x).toBeGreaterThan(99);
    const fresh = createPose(); step(s, createPoseMemory(), fresh, { jumped: true });
    for (const name in p.joints) expect(distance(p.joints[name], fresh.joints[name])).toBeLessThan(1e-10);
  });
  it('matches slope pitch only on the ground and has a right-handed board basis', () => {
    const s = riding(), p = createPose(), m = createPoseMemory();
    step(s, m, p, { heightAt: (x, z) => -z * 0.3 }); expect(p.board.fwd.y).toBeGreaterThan(0.2);
    const { fwd: f, up: u, right: r } = p.board;
    expect(r.x).toBeCloseTo(f.y * u.z - f.z * u.y, 9);
    expect(r.y).toBeCloseTo(f.z * u.x - f.x * u.z, 9);
    expect(r.z).toBeCloseTo(f.x * u.y - f.y * u.x, 9);
    s.mode = 'air'; step(s, m, p, { heightAt: (x, z) => -z * 0.3 }); expect(p.board.fwd.y).toBeCloseTo(0, 10);
  });
  it('extends before landing and changes toe/heel shapes and gaze in switch', () => {
    const s = riding({ mode: 'air', crouch: 1 }); s.pos.y = 5;
    const high = createPose(), low = createPose(); step(s, createPoseMemory(), high);
    s.pos.y = 0.3; s.vel.y = -3; step(s, createPoseMemory(), low);
    expect(low.joints.pelvis.y - s.pos.y).toBeGreaterThan(high.joints.pelvis.y - 5);
    s.mode = 'carve'; s.pos.y = 0; s.edge = 0.6;
    const toe = createPose(), heel = createPose(); step(s, createPoseMemory(), toe);
    s.edge = -0.6; step(s, createPoseMemory(), heel);
    expect(distance(toe.joints.pelvis, heel.joints.pelvis)).toBeGreaterThan(0.1);
    s.switch = true; s.vel.z = 15; const sw = createPose(); step(s, createPoseMemory(), sw);
    expect(sw.headFwd.z).toBeGreaterThan(0.8);
  });
  it('preserves the previous output on non-finite terrain and can recover next frame', () => {
    const s = riding(), m = createPoseMemory(), p = createPose(); step(s, m, p); const prev = structuredClone(p);
    s.edge = 0.8; step(s, m, p, { heightAt: () => NaN });
    for (const name in p.joints) expect(distance(prev.joints[name], p.joints[name])).toBe(0);
    step(s, m, p); checkPose(p);
  });
  it('does not change the incoming state or events', () => {
    const s = riding(), before = JSON.stringify(s), e = Object.freeze([{ type: 'land', efh: 1 }]);
    step(s, createPoseMemory(), createPose(), { events: e }); expect(JSON.stringify(s)).toBe(before);
  });
});

describe('I13d ground arm stance',()=>{
  it('keeps at least 35 degrees of elbow flexion on both sides, including spring transitions',()=>{
    for(const stance of [1,-1])for(const sw of [false,true]) {
      const m=createPoseMemory(),p=createPose();
      for(const mode of ['carve','skid','rest','crash'])for(const edge of [-1.1,0,1.1])for(const crouch of [0,.5,1]){
        const s=riding({stance,switch:sw,mode,edge,crouch,gLoad:3});
        for(let frame=0;frame<15;frame++){
          step(s,m,p);
          for(const side of ['L','R']){
            const a=p.joints['shoulder'+side],b=p.joints['elbow'+side],c=p.joints['hand'+side];
            const cosine=['x','y','z'].reduce((sum,k)=>sum+(a[k]-b[k])*(c[k]-b[k]),0)/(distance(a,b)*distance(c,b));
            expect(Math.acos(Math.max(-1,Math.min(1,cosine)))*180/Math.PI).toBeLessThanOrEqual(145+1e-8);
          }
        }
      }
    }
  });
  it('has zero arm/leg capsule penetrations in all ground reference poses',async()=>{
    const {groundPoseCases,armLegClearance}=await import('./fixtures.js');
    for(const c of groundPoseCases){
      const p=createPose(),m=createPoseMemory(),s=riding(c);
      for(let frame=0;frame<120;frame++)step(s,m,p,{heightAt:(x,z)=>-z*(c.slope||0),events:c.impact&&frame===119?[{type:'land',efh:c.impact}]:[]});
      expect(armLegClearance(p),c.name).toBeGreaterThanOrEqual(0);
    }
  });
});

it('I13d lowers the valley hand as the carve deepens, for either stance and edge',()=>{
 for(const stance of [1,-1])for(const edgeSign of [-1,1]){
  let previous=Infinity;
  for(const depth of [.8,.95,1.1]){
   const p=createPose();step(riding({stance,mode:'carve',edge:depth*edgeSign}),createPoseMemory(),p);
   const hand=p.joints[stance*edgeSign>0?'handL':'handR'];
   expect(hand.y).toBeLessThan(previous);previous=hand.y;
  }
 }
});
