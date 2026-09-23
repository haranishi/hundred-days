import {loadModels} from '../scripts/audit-models.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createScene} from '../lib/scene.js';
import {createImpacts,updateImpacts,TYPES} from '../lib/impacts.js';
import {templates,triangles} from '../lib/models.js';
import {counterRenderer} from '../scripts/render-budget.mjs';
import {catRunRate} from '../lib/cat-model.js';
import {LIGHT_SPEED as c} from '../lib/milestones.js';
const read=async file=>{const b=readFileSync(new URL(`../assets/models/${file}`,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
const sizes=[[1080,450],[362,540],[362,374]];
function environment(){globalThis.devicePixelRatio=1;globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};}
// v2 required 6+ intact targets on screen at every frame. v3 P0-4: normally 3–5, never more than 5.
// "Normally" = at least 80% of the 601 frames of each world (switch frame included).
test('3画面×全6世界×代表3速度、開始・切替・10秒の毎フレームで未破壊の可視対象は5体以下、8割以上のフレームで3〜5体',async()=>{
  environment();const models=await loadModels(read);
  for(const [width,height] of sizes){
    const scene=await createScene({clientWidth:width,clientHeight:height},{models,renderer:counterRenderer(),readCat:()=>read('cat-run.glb')});
    for(const speed of [100,1000,100000]){const state=createImpacts();
      for(const world of Object.keys(TYPES)){let normal=0;
        for(let frame=0;frame<=600;frame++){
          updateImpacts(state,{speed,world,dt:frame===0?0:1/60});scene.draw(speed,0,true,false,state);
          const n=scene.stats().impact.visibleTargets;
          assert.ok(n<=5,JSON.stringify({width,height,world,speed,frame,...scene.stats().impact}));if(n>=3)normal++;
        }
        assert.ok(normal>=.8*601,JSON.stringify({width,height,world,speed,framesWith3to5:normal,of:601}));
      }
    }
    scene.dispose();
  }
});
// v2 also required w 0.30–0.70 and h >= 0.15. v3 P0-2: h 18–38% (target 22–30%); a fixed width floor would fight
// that target on wide canvases, so the side-view checks (head right of tail, spread, flowX) carry the orientation.
test('3画面×6世界×4速度×37姿勢で高さ18〜38%・中心x40〜60%・四辺2%内側・横向き、GLB尾の全頂点は箱の後端より後方',async()=>{
  environment();const models=await loadModels(read),speeds=[0,1,30,99,100,300,600,999,1000,3000,6000,9999,10000,30000,60000,99999,100000,300000,600000,999999,1e6,3e6,c*.99,c*.9999];
  for(const [width,height] of sizes){const scene=await createScene({clientWidth:width,clientHeight:height},{models,renderer:counterRenderer(),readCat:()=>read('cat-run.glb')});
    for(const speed of speeds){scene.reset();for(let phase=0;phase<37;phase++){
      scene.simulate(speed,1/24/catRunRate(speed),true);scene.draw(speed,0,true,false);
      const s=scene.catScreen();assert.ok(s.head.x>s.tail.x&&s.spread>=s.w*.55&&s.flowX<0&&s.h>=.18&&s.h<=.38&&s.x>=.4&&s.x<=.6&&s.x-s.w/2>.02&&s.x+s.w/2<.98&&s.y-s.h/2>.02&&s.y+s.h/2<.98,JSON.stringify({width,height,speed,phase,s}));
      const {box,root}=scene.trailBounds();assert.ok(root.z>box.max.z,JSON.stringify({width,height,speed,phase,root,box}));assert.ok(!box.containsPoint(root));assert.ok(Math.abs(root.z-box.max.z-.08)<1e-8);
    }}scene.dispose();
  }
});
// v2 also fixed the city's collision targets to these four buildings (TYPES.city). PLAN-v3 P0-4 does not name the
// collision objects (one readable centre lane), so only the GLB building templates themselves are pinned here.
test('街の建物GLB 4種は元の形状・UV・テクスチャを維持',async()=>{
  const models=await loadModels(read),geometry=templates(models,'city');
  assert.equal(geometry.length,4);
  geometry.forEach(g=>assert.ok(triangles(g)>=1000&&triangles(g)<=1800&&g.attributes.uv&&g.userData.material.map));
  assert.equal(new Set(geometry.map(g=>JSON.stringify([...g.attributes.position.array]))).size,4);
});
