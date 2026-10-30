import test from 'node:test';
import assert from 'node:assert/strict';
import {createMap,walkable,groundWalkable,findPath,clearSegment,moveOnMap,safePosition} from '../src/maps';
import {OPENING,openingStage} from '../src/opening-script';
import {endingStory} from '../src/story-content';
import {checkpoints} from './story-fixtures';
import {worldLayout} from '../src/world-layout';
import type {Zone} from '../src/types';
test('描画する台座と障害物が一致し、柱・露店・柵・本棚・井戸を通行できない',()=>{
 for(const zone of ['town','forest','palace','abyss'] as Zone[]){const m=createMap(zone);assert.deepEqual(m.obstacles,worldLayout(m).flatMap(p=>p.obstacles));}
 for(const [zone,x,y] of [['town',280,318],['town',200,415],['palace',544,379],['abyss',264,344],['abyss',520,344],['forest',456,456]] as const){const m=createMap(zone);assert.ok(groundWalkable(m,x,y),zone);assert.equal(walkable(m,x,y),false,`${zone} ${x},${y}`);}
});
test('足元の矩形と小ステップで、薄い柵・壁角・水際を越えず壁沿いに滑る',()=>{
 const m=createMap('town');let p={x:200,y:440};p=moveOnMap(m,p,0,-120);assert.ok(p.y>=421&&p.y<440);assert.ok(walkable(m,p.x,p.y));
 const sliding=moveOnMap(m,{x:260,y:160},-40,30);assert.equal(sliding.x,260);assert.ok(sliding.y>185);assert.ok(walkable(m,sliding.x,sliding.y));
 const water=moveOnMap(m,{x:568,y:280},150,0);assert.ok(water.x<=572);assert.ok(walkable(m,water.x,water.y));
 for(const step of [1.56,2.13,5.12,20,120]){let at={x:200,y:440};for(let n=0;n<100;n++){at=moveOnMap(m,at,0,-step);assert.ok(walkable(m,at.x,at.y));assert.ok(at.y>=421);}}
});
test('全地域の案内は実位置から全ての辺が通れ、対象の手前まで歩いて接近できる',()=>{
 for(const zone of ['town','forest','palace','abyss'] as Zone[]){const m=createMap(zone);for(const target of m.points){let previous={...m.spawn};const path=findPath(m,previous,target);assert.ok(path.length,zone+':'+target.id);for(const point of path){assert.ok(clearSegment(m,previous,point),zone+':'+target.id);let at=previous;for(let frame=0;frame<Math.ceil(Math.hypot(point.x-previous.x,point.y-previous.y)/3)+8&&Math.hypot(point.x-at.x,point.y-at.y)>.01;frame++){const d=Math.hypot(point.x-at.x,point.y-at.y),speed=Math.min(3,d);at=moveOnMap(m,at,(point.x-at.x)/d*speed,(point.y-at.y)/d*speed);assert.ok(walkable(m,at.x,at.y));}assert.ok(Math.hypot(point.x-at.x,point.y-at.y)<.1,zone+':'+target.id);previous=point;}assert.ok(Math.hypot(previous.x-target.x,previous.y-target.y)<=24);}}
});
test('壁や新しい台座へ重なる旧位置だけを、安全な近傍へ戻せる',()=>{
 for(const [zone,from] of [['town',{x:257,y:160}],['abyss',{x:264,y:344}],['palace',{x:544,y:379}]] as const){const m=createMap(zone);assert.equal(walkable(m,from.x,from.y),false);const restored=safePosition(m,from);assert.ok(walkable(m,restored.x,restored.y));assert.ok(Math.hypot(restored.x-from.x,restored.y-from.y)<40);assert.deepEqual(safePosition(m,restored),restored);}
});

test('手動で入れる細い通路からも案内を開始できる',()=>{
 for(const [zone,from] of [['town',{x:432,y:314}],['town',{x:104,y:110}],...Array.from({length:8},(_,i)=>['town',{x:510+i,y:110}] as const),['forest',{x:118,y:426}]] as const){const m=createMap(zone);assert.ok(walkable(m,from.x,from.y));for(const target of m.points){const path=findPath(m,from,target);if(Math.hypot(from.x-target.x,from.y-target.y)<=24)continue;assert.ok(path.length,zone+':'+target.id);let previous:{x:number;y:number}=from;for(const p of path){assert.ok(clearSegment(m,previous,p));previous=p;}}}
});

test('クリックした端数の床へも安全な格子を経て到達できる',()=>{
 const m=createMap('town');for(const to of [{x:336,y:48},{x:104,y:110},...Array.from({length:8},(_,i)=>({x:510+i,y:110})),{x:432,y:313},{x:432,y:314},{x:432.5,y:317.5}]){assert.ok(walkable(m,to.x,to.y));const from={x:376,y:368},path=findPath(m,from,to);assert.ok(path.length);let previous:{x:number;y:number}=from;for(const p of path){assert.ok(clearSegment(m,previous,p));previous=p;}assert.deepEqual(path.at(-1),to);}
});

test('序章と終章で歩いて入る人物も、壁や台座を横切らない',()=>{
 const stages=[...OPENING.map(b=>openingStage(b.scene,b.lights)),...endingStory(checkpoints().ended).map(p=>p.stage!)];for(const st of stages){const m=createMap(st.zone);for(const a of st.actors)if(a.fromY!==undefined)assert.ok(clearSegment(m,{x:a.x,y:a.fromY},{x:a.x,y:a.y}),st.zone+':'+a.id);}
});
