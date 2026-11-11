import {it,expect} from 'vitest';
import {BODY,createPose,createPoseMemory,solvePose} from '../../src/render/ride/pose.js';
import {createSkeletonState,solveSkeleton} from '../../src/render/ride/skeleton-math.js';
import {mixState} from '../../src/render/ride/mix.js';
import {equipmentGear,upperEquipment} from '../../src/render/ride/gear-parts.js';
import {skiContact} from '../../src/render/ride/track-builder.js';
import {createTracks} from '../../src/render/ride/tracks.js';
import {createSpray} from '../../src/render/ride/spray.js';
import {createFigure} from '../../src/render/ride/figure.js';
import {readRiderData} from '../../src/render/ride/rider-data.js';
import {readFileSync} from 'node:fs';
import * as THREE from 'three/webgpu';
import {riding,distance,flat} from './fixtures.js';
function pose(extra={}){const state=riding({gear:'ski',...extra}),p=createPose(),m=createPoseMemory();for(let i=0;i<60;i++)solvePose({state,dt:1/60,events:[],heightAt:flat},m,p);return p;}
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
function kneeAngle(p,side){const j=p.joints,a=distance(j['hip'+side],j['ankle'+side]);return Math.acos((BODY.thigh**2+BODY.shin**2-a*a)/(2*BODY.thigh*BODY.shin))*180/Math.PI;}
it.each([0,-.8,.8])('keeps separated parallel skis, forward knees and hands at edge %s',edge=>{
 const p=pose({edge}),j=p.joints,s=createSkeletonState();solveSkeleton(p,1,s);
 const gap=distance(j.ankleL,j.ankleR);expect(gap).toBeGreaterThanOrEqual(.25);expect(gap).toBeLessThanOrEqual(.4);
 expect(gap-.098).toBeGreaterThanOrEqual(.16);
 for(const [side,bone]of [['L',13],['R',16]]){
  const toe={x:-s.frames[bone*9+6],y:-s.frames[bone*9+7],z:-s.frames[bone*9+8]};
  expect(dot(toe,p.board.fwd)).toBeGreaterThan(Math.cos(3*Math.PI/180));
  if(!edge||side===(edge>0?'R':'L'))expect(kneeAngle(p,side)).toBeLessThanOrEqual(150);
  else expect(kneeAngle(p,side)).toBeGreaterThanOrEqual(150);
  expect(dot(sub(j['knee'+side],j['ankle'+side]),p.board.fwd)).toBeGreaterThan(.08);
  expect(dot(sub(j['hand'+side],j.pelvis),p.board.fwd)).toBeGreaterThan(0);
 }
 if(edge){const inner=edge>0?'R':'L',outer=edge>0?'L':'R';expect(kneeAngle(p,outer)).toBeGreaterThan(kneeAngle(p,inner));expect(p.chestUp.x*edge).toBeGreaterThan(0);}
});
it.each([1,2,3])('makes grab %s reachable with fixed arm lengths',grab=>{
 const p=pose({mode:'air',crouch:1,air:{grab,grabTime:.5}}),side=grab===2?'L':'R',ski=grab===2?'R':side,a=p.joints['ankle'+ski],b=p.board;
 // テールは、板の後ろの端の上（縁の真上へ寄せた。靴の横をつかむセーフティは、靴の外）
 const lateral=grab===2?.080:grab===3?.060:.119,drop=.030,forward=grab===3?-.50:grab===2?.23:0;
 const target={x:a.x+b.right.x*lateral-b.up.x*drop+b.fwd.x*forward,y:a.y+b.right.y*lateral-b.up.y*drop+b.fwd.y*forward,z:a.z+b.right.z*lateral-b.up.z*drop+b.fwd.z*forward};
 expect(distance(p.joints['hand'+side],target)).toBeLessThan(.015);
 for(const s of ['L','R']){expect(distance(p.joints['shoulder'+s],p.joints['elbow'+s])).toBeCloseTo(.29,8);expect(distance(p.joints['elbow'+s],p.joints['hand'+s])).toBeCloseTo(.27,8);}
});
it('keeps upper body down the velocity during braking',()=>{
 const fwd={x:Math.sin(1.1),y:0,z:-Math.cos(1.1)},p=pose({mode:'skid',slip:1.1,fwd});
 expect(p.chestFwd.z).toBeLessThan(-.9);expect(dot(p.board.fwd,fwd)).toBeCloseTo(1,8);
});
it('carries current gear through interpolation and defaults missing gear to board',()=>{
 const a=riding({gear:'ski'}),b=riding();delete b.gear;const out=structuredClone(a);
 expect(mixState(a,b,.2,out).gear).toBe('board');b.gear='ski';expect(mixState(a,b,.2,out).gear).toBe('ski');
 const p=createPose(),m=createPoseMemory();solvePose({state:a,dt:1/60,events:[],heightAt:flat},m,p);solvePose({state:{...b,gear:undefined},dt:1/60,events:[],heightAt:flat},m,p);
 expect(p.gear).toBeUndefined();expect(p.poleDirs).toBeUndefined();
});
it('classifies equipment without hiding backpack buckle or first-person pole tips',()=>{
 expect(equipmentGear('bindings',2)).toBeNull();expect(equipmentGear('bindings',13)).toBe('board');expect(equipmentGear('ski',13)).toBe('ski');expect(upperEquipment('poleShaft')).toBe(false);expect(upperEquipment('poleGrip')).toBe(true);
});
function context(){return {scene:new THREE.Scene(),tier:{antialias:'fxaa'},lighting:{}};}
it('leaves two narrow independent tracks at the ski contacts and breaks on landing/gear change',()=>{
 const tracks=createTracks({context:context(),world:{heightAt:flat},capacity:8}),state=riding({gear:'ski'}),p=pose();
 tracks.update(state,p);state.pos.z=-1;const q=pose({pos:{x:0,y:0,z:-1}});tracks.update(state,q);
 expect(tracks.lanes.map(l=>l.builder.count)).toEqual([2,2]);
 for(const [i,side]of ['L','R'].entries()){
  const b=tracks.lanes[i].builder,c=skiContact(q,side,{});expect((b.positions[6]+b.positions[9])/2).toBeCloseTo(c.x,6);expect(Math.abs(b.positions[6]-b.positions[9])).toBeCloseTo(.055,6);
 }
 state.mode='air';tracks.update(state,q);state.mode='carve';state.pos.z=-2;tracks.update(state,pose({pos:state.pos}));for(const l of tracks.lanes)expect(l.builder.breaks[2]).toBe(1);
 state.gear='board';tracks.update(state,pose());expect(tracks.lanes[1].builder.count).toBe(0);tracks.dispose();
});
it('draws only selected equipment and hides the pole grip in first person',()=>{
 const bin=readFileSync('public/models/rider-v1.bin'),meta=JSON.parse(readFileSync('public/models/rider-v1.json'));
 const d=readRiderData(bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.byteLength),meta),fig=createFigure(d,{detail:false});
 fig.apply(pose(),{firstPerson:true});const byName=name=>fig.group.children.find(m=>m.name===name);
 const mitten=d.part.findIndex(id=>d.parts[id].name==='mittens'),bone=d.skinIndex[mitten*4];
 expect(byName('rider-upper').geometry.getAttribute('skinIndex').array[mitten*4]).toBe(bone===6?7:10);
 expect(byName('ski-lower').visible).toBe(true);expect(byName('ski-upper').visible).toBe(false);expect(byName('board-lower').visible).toBe(false);expect(byName('rider-upper').visible).toBe(false);
 const board=createPose();solvePose({state:riding(),dt:1/60,events:[],heightAt:flat},createPoseMemory(),board);fig.apply(board);
 expect(byName('rider-upper').geometry.getAttribute('skinIndex').array[mitten*4]).toBe(bone);
 expect(byName('ski-lower').visible).toBe(false);expect(byName('board-lower').visible).toBe(true);fig.dispose();
});
it('emits unchanged amounts from both ski edges',()=>{
 const ctx=context();ctx.sun={dir:new THREE.Vector3(1,1,0),color:{}};ctx.textures={sunVis:new THREE.Texture()};
 const world={half:100,size:200},state=riding({gear:'ski',mode:'carve',edge:0}),p=pose(),spray=createSpray({context:ctx,world,capacity:128});
 state.tele.spray=.2;state.tele.edgeForce=0;state.snow.powder=0;state.snow.packed=1;
 spray.emit(state,p,[],.1);const count=spray.stats.emitted,data=spray.mesh.geometry.getAttribute('pA').array;
 const xs=Array.from({length:count},(_,i)=>data[i*4]);expect(xs.some(x=>x<-.10)).toBe(true);expect(xs.some(x=>x>.10)).toBe(true);
 const boardSpray=createSpray({context:ctx,world,capacity:128});state.gear='board';boardSpray.emit(state,p,[],.1);expect(boardSpray.stats.emitted).toBe(count);spray.dispose();boardSpray.dispose();
});
it('rotates the ski pose and pole tips rigidly with airborne flips',()=>{
 const base=pose({mode:'air',crouch:.5}),angle=1.2,c=Math.cos(angle),sn=Math.sin(angle),rot=v=>({x:v.x,y:c*v.y-sn*v.z,z:sn*v.y+c*v.z});
 const flipped=pose({mode:'air',crouch:.5,fwd:rot({x:0,y:0,z:-1}),up:rot({x:0,y:1,z:0})});
 for(const [name,j]of Object.entries(base.joints))expect(distance(rot(j),flipped.joints[name])).toBeLessThan(1e-8);
 for(const side of ['L','R'])expect(distance(rot(base.poleDirs[side]),flipped.poleDirs[side])).toBeLessThan(1e-8);
});
it('follows state.gear only: the address no longer forces the figure',async()=>{
 const {createRideFeedback}=await import('../../src/render/ride/index.js');
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'location');
 try{
  Object.defineProperty(globalThis,'location',{configurable:true,value:{search:'?gear=ski'}});
  const view={addSystem(){},setCameraController(){}},feedback=createRideFeedback({view,world:{heightAt:flat}});
  feedback.system.update({state:riding({gear:'board'}),frameDt:1/60});expect(feedback.debug().pose.gear).toBeUndefined();
  feedback.system.update({state:riding({gear:'ski'}),frameDt:1/60});expect(feedback.debug().pose.gear).toBe('ski');
  feedback.system.dispose();
 }finally{if(descriptor)Object.defineProperty(globalThis,'location',descriptor);else delete globalThis.location;}
});
it('転んだら、尻もちをついて、腕を投げ出す（立ったままにならない）。起き上がると、元の姿勢へ戻る',()=>{
 const m=createPoseMemory(),p=createPose();
 const step=(state,n=1)=>{for(let i=0;i<n;i++)solvePose({state,events:[],dt:1/60,jumped:false},m,p);return p;};
 const standing=step(riding({gear:'ski',speed:12}),30),pelvisUp=standing.joints.pelvis.y,chestUp=standing.joints.chest.y-standing.joints.pelvis.y;
 const fallen=step(riding({gear:'ski',mode:'crash',speed:9}),60);
 expect(fallen.joints.pelvis.y).toBeLessThan(pelvisUp-.35);                       // 腰が、雪の近くまで落ちる
 expect(fallen.joints.chest.y-fallen.joints.pelvis.y).toBeLessThan(chestUp*.6);   // 上半身が、後ろへ倒れる
 expect(fallen.joints.chest.z).toBeGreaterThan(fallen.joints.pelvis.z);           // 進む向き（−Z）の後ろへ倒れる＝足から先に滑る
 expect(distance(fallen.joints.handL,fallen.joints.handR)).toBeGreaterThan(.9);   // 腕を、横へ投げ出す（体が傾くので、3 次元の距離で測る）
 for(const side of ['L','R'])expect(fallen.joints['ankle'+side].y).toBeGreaterThanOrEqual(.12); // 転倒時は描画だけ足を引き上げる
 const back=step(riding({gear:'ski',speed:6}),90);
 expect(back.joints.pelvis.y).toBeGreaterThan(pelvisUp-.05);
});

// I18d acceptance measures use the physical forward/up frame, not screen pixels.
const standards=[['stand',{}],...[-30,30,-45,45].map(a=>['edge'+a,{mode:'carve',edge:a*Math.PI/180}]),['brake',{mode:'skid',edge:.35,slip:1.1,fwd:{x:Math.sin(1.1),y:0,z:-Math.cos(1.1)}}],['tuck',{crouch:1}],['air',{mode:'air',crouch:0}],...[1,2,3].map(grab=>['grab'+grab,{mode:'air',crouch:1,air:{grab}}]),['push',{speed:2,crouch:1}]];
const along=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
const pointSegment=(p,a,b)=>{const ab=sub(b,a),q=dot(sub(p,a),ab)/dot(ab,ab);return distance(p,along(a,b,Math.max(0,Math.min(1,q))));};
const advance=(p,d,t)=>({x:p.x+d.x*t,y:p.y+d.y*t,z:p.z+d.z*t});
it.each(standards.filter(([n])=>n==='stand'||n==='brake'||n.startsWith('edge')))('I18d %s keeps both hands ahead of the chest',(_,extra)=>{
 const p=pose(extra);for(const side of ['L','R'])expect(dot(sub(p.joints['hand'+side],p.joints.chest),p.chestFwd)).toBeGreaterThanOrEqual(.25);
});
it.each(standards.filter(([n])=>!n.startsWith('grab')&&n!=='air'&&n!=='push'))('I18d %s keeps baskets outside both skis and above snow',(_,extra)=>{
 const p=pose(extra),j=p.joints;
 for(const side of ['L','R']){
  const basket=advance(p.poleGrip[side],p.poleDirs[side],1.09);
  expect(basket.y-.006).toBeGreaterThanOrEqual(.03);
  // 横の離れは、棒の向きを決めた枠で測る（切るときの外側の棒は、傾いた体の枠。雪の面で測ると、雪から 50 cm 上の空中にある輪が
  // 「板の真上」と数えられる）。制動だけは、板の横の向きで測る
  const axis=p.poleSkidding?p.skiSurface.right:p.poleBasis[side].right;
  // 輪が、板の面から 45 cm より高い所にあるとき（低い姿勢で、脇に挟んだ棒）は、横の離れを見ない
  if(dot(sub(basket,p.board.pos),p.board.up)<.45)for(const ski of ['L','R'])expect(Math.abs(dot(sub(basket,j['ankle'+ski]),axis))).toBeGreaterThanOrEqual(.15);
  // 「かかとより後ろ」は、制動では、体の向きで測る（板は横を向く）
  expect(dot(sub(basket,j['ankle'+side]),p.poleSkidding?p.chestFwd:p.board.fwd)).toBeLessThan(0);
 }
});
it.each(standards)('I18d %s keeps pole shafts 2cm clear of leg and boot capsules',(_,extra)=>{
 const p=pose(extra),j=p.joints;let clearance=Infinity;
 for(const side of ['L','R'])for(const leg of ['L','R']){
  const a=j['ankle'+leg],boot=advance(a,p.board.up,-.035);
  const capsules=[[j['hip'+leg],j['knee'+leg],.11],[j['knee'+leg],a,.085],[advance(boot,p.board.fwd,-.10),advance(boot,p.board.fwd,.14),.067]];
  for(let i=0;i<=128;i++){
   const q=advance(p.poleGrip[side],p.poleDirs[side],.13+(1.16-.13)*i/128);
   for(const [a,b,r]of capsules)clearance=Math.min(clearance,pointSegment(q,a,b)-r-.007);
  }
 }
 expect(clearance).toBeGreaterThanOrEqual(.02);
});
it.each([-45,-30,30,45])('I18d carve %s has angulation, extended outer leg and inside lead',degrees=>{
 const edge=degrees*Math.PI/180,p=pose({mode:'carve',edge}),j=p.joints,inside=edge>0?'R':'L',outside=edge>0?'L':'R';
 expect(Math.abs(Math.atan2(p.chestUp.x,p.chestUp.y)/p.lean)).toBeGreaterThanOrEqual(.35);
 expect(Math.abs(Math.atan2(p.chestUp.x,p.chestUp.y)/p.lean)).toBeLessThanOrEqual(.75);
 expect(kneeAngle(p,outside)).toBeGreaterThanOrEqual(150);
 expect(kneeAngle(p,outside)-kneeAngle(p,inside)).toBeGreaterThanOrEqual(Math.abs(degrees)===45?25:12);
 expect(dot(sub(j['ankle'+inside],j['ankle'+outside]),p.board.fwd)).toBeGreaterThanOrEqual(.08);
});
it('I18d tuck keeps fists above separated knees, in front of chest',()=>{
 const p=pose({crouch:1}),j=p.joints;
 for(const side of ['L','R']){expect(j['hand'+side].y).toBeGreaterThan(j['knee'+side].y);expect(dot(sub(j['hand'+side],j.chest),p.chestFwd)).toBeGreaterThanOrEqual(.25);}
 expect(Math.abs(j.kneeR.x-j.kneeL.x)-.22).toBeGreaterThanOrEqual(.08);
});
it.each(standards)('I18d %s keeps wrists within 25 degrees independently of shafts',(_,extra)=>{
 const p=pose(extra),sk=createSkeletonState();solveSkeleton(p,1,sk);
 for(const [side,bone]of [['L',7],['R',10]]){
  const forearm=sub(p.joints['hand'+side],p.joints['elbow'+side]),y={x:sk.frames[bone*9+3],y:sk.frames[bone*9+4],z:sk.frames[bone*9+5]};
  expect(dot(forearm,y)/Math.hypot(forearm.x,forearm.y,forearm.z)).toBeGreaterThanOrEqual(Math.cos(25*Math.PI/180));

 }
});
it.each([1,2,3])('I18d grab %s keeps face forward and head above back',grab=>{
 const p=pose({mode:'air',crouch:1,air:{grab}}),sk=createSkeletonState();solveSkeleton(p,1,sk);
 const forward={x:-sk.frames[4*9+6],y:-sk.frames[4*9+7],z:-sk.frames[4*9+8]};
 expect(dot(forward,p.board.fwd)).toBeGreaterThanOrEqual(Math.cos(Math.PI/6));
 expect(p.joints.head.y).toBeGreaterThan(p.joints.neck.y+.15);
});

it('I18d unheld flight keeps knees lightly flexed',()=>{const p=pose({mode:'air',crouch:0});for(const s of ['L','R']){expect(kneeAngle(p,s)).toBeGreaterThanOrEqual(110);expect(kneeAngle(p,s)).toBeLessThanOrEqual(125);}});

// I18e: retained even when unmet; no relaxed bounds or skipped poses.
import {skiPoses} from '../../tools/ridergen/ski-preview.mjs';
import {measures} from '../../tools/ridergen/ski-measures.mjs';
import {realPoses} from '../../tools/ridergen/preview.mjs';
const required=skiPoses();
// 転倒は、別の決まり（下の「転倒の棒」）：腕を投げ出すので、棒も体から離れる向き（横や上）へ伸びる。
// 後ろへ流す決まりのままにしていたときは、投げ出した手の棒が、胸や顔の上を横切った
const upright=required.filter(([n])=>!n.startsWith('crash')),fallen=required.filter(([n])=>n.startsWith('crash'));
it.each(upright)('I18e %s keeps shaft sideways component <= 0.35',(_,p)=>{
 for(const v of Object.values(measures(p)))expect(v.lateral).toBeLessThanOrEqual(.35000001);
});
it.each(upright)('I18e %s keeps tips above snow and baskets 10cm outside ski edges',(name,p)=>{
 // 空中（air・grab）は、先の高さを見ない：雪が無いので、先が板の面より下へ出てよい（板の外側 10 cm は守る）。
 // 見ていたときは、しゃがんでつかむ間、つかまない手の棒が、上へ逃げて、頭の前を通った（見た目の採点 3 周目）
 const flying=name==='air'||name.startsWith('grab');
 for(const v of Object.values(measures(p))){if(!flying)expect(v.tipHeight).toBeGreaterThanOrEqual(name==='push-front'||name==='push-back'?0:.03);if(name==='push-front'||name==='push-back')expect(v.tipHeight).toBeLessThanOrEqual(.02);expect(v.edgeGap).toBeGreaterThanOrEqual(.10);if(!name.startsWith('push'))expect(v.behindHeel).toBeLessThanOrEqual(0);}
});
it.each(fallen)('転倒の棒（%s）：前腕の先へ伸びて、体から離れる。先は雪に潜らない',(_,p)=>{
 for(const side of ['L','R']){
  const j=p.joints,forearm=sub(j['hand'+side],j['elbow'+side]),n=Math.hypot(forearm.x,forearm.y,forearm.z),d=p.poleDirs[side];
  const tip=advance(j['hand'+side],d,1.16);
  expect(tip.y).toBeGreaterThanOrEqual(.03);
  // 先が雪に潜る向きだけ、起こしてよい。それ以外は、前腕の向きのまま
  if(j['hand'+side].y+forearm.y/n*1.16>=.05)expect(dot(d,forearm)/n).toBeGreaterThan(.99);
  // 棒は、握りから先へ行くほど、胸から遠ざかる
  expect(distance(tip,j.chest)).toBeGreaterThan(distance(j['hand'+side],j.chest)+.3);
 }
});
it.each(required)('I18e %s keeps shafts 3cm clear of torso, arms, legs and boots',(_,p)=>{
 for(const v of Object.values(measures(p)))expect(v.clearance).toBeGreaterThanOrEqual(.03);
});
it.each(required)('I18e %s keeps hands aligned with forearms and pole bones at grip',(_,p)=>{
 const sk=createSkeletonState();solveSkeleton(p,1,sk);
 for(const [side,hand,pole]of [['L',7,20],['R',10,21]]){
  const d=sub(p.joints['hand'+side],p.joints['elbow'+side]),n=Math.hypot(...Object.values(d));
  expect(dot(d,{x:sk.frames[hand*9+3],y:sk.frames[hand*9+4],z:sk.frames[hand*9+5]})/n).toBeGreaterThanOrEqual(Math.cos(25*Math.PI/180));
  // 棒の支点は、握りのまん中（手首の関節から、前腕の向きへ 7 cm 先＝こぶしの中。板をつかむ手は 1 cm）
  expect(Array.from(sk.origins.slice(pole*3,pole*3+3))).toEqual(Object.values(p.poleGrip[side]));
  const ahead=sub(p.poleGrip[side],p.joints['hand'+side]);expect(dot(ahead,d)/n).toBeCloseTo(p.grabHand===side?.01:.07,6);
  expect(dot(p.poleDirs[side],{x:-sk.frames[pole*9+3],y:-sk.frames[pole*9+4],z:-sk.frames[pole*9+5]})).toBeCloseTo(1,8);
 }
});
it('I18e preserves all first 20 snowboard matrices exactly',()=>{
 const baseline=JSON.parse(readFileSync(new URL('./board-matrices-before-I18e.json',import.meta.url)));
 for(const [name,p]of realPoses())expect(Array.from(solveSkeleton(p,1,createSkeletonState()).slice(0,320)),name).toEqual(baseline.find(([n])=>n===name)[1]);
});
it('I18e stand is 135–150 degrees and unheld air is 15+ degrees deeper',()=>{
 const stand=required.find(([n])=>n==='stand')[1],air=required.find(([n])=>n==='air')[1];
 for(const side of ['L','R']){expect(kneeAngle(stand,side)).toBeGreaterThanOrEqual(135);expect(kneeAngle(stand,side)).toBeLessThanOrEqual(150);expect(kneeAngle(stand,side)-kneeAngle(air,side)).toBeGreaterThanOrEqual(15);}
});
it('I18e tail hand is 25+ cm behind the heel',()=>{
 const p=required.find(([n])=>n==='grab-3')[1];expect(dot(sub(p.joints.handR,p.joints.ankleR),p.board.fwd)).toBeLessThanOrEqual(-.43);
});
it('I18e both poles touch snow for at least half a one-second stroke',()=>{
 const state=riding({gear:'ski',speed:2,crouch:1}),p=createPose(),m=createPoseMemory();let contact=0;
 solvePose({state,dt:0,events:[],heightAt:flat},m,p);
 for(let i=0;i<120;i++){solvePose({state,dt:1/120,events:[],heightAt:flat},m,p);if(Object.values(measures(p)).every(v=>v.tipHeight>=-1e-8&&v.tipHeight<=.02))contact++;}
 expect(contact/120).toBeGreaterThanOrEqual(.5);
});
it('I18e crash keeps joints above snow, hips <=35cm and chest rotates >=60 degrees',()=>{
 const state=riding({gear:'ski',mode:'crash',speed:10}),p=createPose(),m=createPoseMemory(),normals=[];
 for(let i=0;i<60;i++){solvePose({state,dt:1/60,events:[],heightAt:flat},m,p);normals.push({...p.chestFwd});expect(p.joints.pelvis.y).toBeLessThanOrEqual(.35);for(const j of Object.values(p.joints))expect(j.y).toBeGreaterThanOrEqual(0);}
 let max=0;for(const a of normals)for(const b of normals)max=Math.max(max,Math.acos(Math.min(1,Math.max(-1,dot(a,b))))*180/Math.PI);expect(max).toBeGreaterThanOrEqual(60);
 state.speed=0;const normal={...p.chestFwd};for(let i=0;i<30;i++)solvePose({state,dt:1/60,events:[],heightAt:flat},m,p);expect(distance(p.chestFwd,normal)).toBeLessThan(1e-8);
 state.mode='carve';for(let i=0;i<25;i++)solvePose({state,dt:1/60,events:[],heightAt:flat},m,p);expect(m.skiFall).toBe(0);
});
