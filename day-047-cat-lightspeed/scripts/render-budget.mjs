import {loadModels} from '../scripts/audit-models.mjs';
// No browser / WebGL context. Count the production scene's submitted primitives
// after the same CPU instance packing and Three Frustum culling. No GPU timing.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as THREE from '../vendor/three.js';
import {createScene} from '../lib/scene.js';
import {triangles,templates,BACKGROUND_LAYOUT} from '../lib/models.js';
import {createImpacts,updateImpacts,TYPES,LIMITS} from '../lib/impacts.js';
import {targetGeometries} from '../lib/impact-view.js';
import {worldAt} from '../lib/worlds.js';
export function counterRenderer(){return {info:{render:{}},setPixelRatio(){},getPixelRatio(){return 1.5;},setSize(){},dispose(){},render(scene,camera){
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));let calls=0,count=0,lines=0;
  scene.traverseVisible(o=>{if(!o.isMesh&&!o.isLine)return;if(o.frustumCulled&&!frustum.intersectsObject(o))return;const n=o.isInstancedMesh?o.count:1;if(!n)return;const groups=Array.isArray(o.material)?o.geometry.groups:[{count:o.geometry.index?.count??o.geometry.attributes.position.count,materialIndex:0}];
    for(const group of groups){const material=Array.isArray(o.material)?o.material[group.materialIndex]:o.material,passes=material.transparent&&material.side===THREE.DoubleSide&&!material.forceSinglePass?2:1;calls+=passes;
      if(o.isLine)lines+=group.count/2*n;
      else if(material.wireframe)lines+=group.count*n;
      else count+=group.count/3*n*passes;
    }
  });this.info.render={calls,triangles:count,lines};}};}
export async function audit({forceFallback=false}={}){
  globalThis.devicePixelRatio=1;let reduce=false;globalThis.matchMedia=()=>({get matches(){return reduce;}});globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  const models=await loadModels(async file=>{const b=readFileSync(new URL(`../assets/models/${file}`,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);});
  const rows=[],caps=[];
  // v3の上限：的は待機5＋飛行4、破片12（箱12三角形）、白い衝撃4（板2三角形）。
  const targets=targetGeometries(models);
  for(const world of Object.keys(TYPES)){const geometry=TYPES[world].map(type=>targets[type]),body=Math.max(...geometry.map(triangles))*(LIMITS.waiting+LIMITS.flying);caps.push({world,body,fragments:LIMITS.fragments*12,flashes:LIMITS.flashes*2,total:body+LIMITS.fragments*12+LIMITS.flashes*2});}
  for(const viewport of [{width:1080,height:450},{width:362,height:540},{width:362,height:374}])for(const reduced of [false,true]){
    reduce=reduced;const renderer=counterRenderer(),canvas={clientWidth:viewport.width,clientHeight:viewport.height},scene=await createScene(canvas,{models,renderer,forceFallback,readCat:async()=>{const b=readFileSync(new URL('../assets/models/cat-run.glb',import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}});
    for(const speed of [0,30,300,1000,3000,30000,100000,300000,3000000,1079252849*.9999]){
      const world=worldAt(speed).id,state=createImpacts();updateImpacts(state,{speed,world,dt:3,reduced});
      for(let phase=0;phase<12;phase++){
        scene.simulate(speed,1/12,true);scene.draw(speed,0,true,false,state);const framing=scene.catScreen();rows.push({viewport,reduced,speed,world,mode:'simulation',phase,...renderer.info.render,catScreen:framing});
      }
      // Saturate every type independently: a conservative scene-space stress fixture.
      for(let type=0;type<TYPES[world].length;type++){
        // 同じ種類で上限いっぱい：待機5・飛行4・破片12・白い衝撃4。
        state.queues=[Array.from({length:LIMITS.waiting},(_,i)=>({id:`s${i}`,serial:i,s:state.distance+2+i*3,x:0,type:TYPES[world][type],world,size:1.2,turn:.3}))];state.cooldown=0;state.flying=Array.from({length:LIMITS.flying},(_,i)=>({world,type:TYPES[world][type],x:-(i+1)*.6,y:.6,z:-.7+i*.4,life:1,age:.1,angle:.2,size:1.2,turn:.3}));
        state.fragments=Array.from({length:reduced?LIMITS.fragmentsReduced:LIMITS.fragments},(_,i)=>({x:(i%4-2)*.3,y:.5,z:-Math.floor(i/4),life:1,age:.1,angle:.2,size:.15}));
        state.flashes=Array.from({length:LIMITS.flashes},(_,i)=>({x:-.25,y:.45,z:-.7-i*.2,age:.02,life:.15,strength:.5}));
        scene.draw(speed,0,true,false,state);rows.push({viewport,reduced,speed,world,mode:`saturated-type-${type}`,...renderer.info.render});
      }
    }
    scene.dispose();
  }
  const peak=rows.reduce((a,b)=>a.triangles>b.triangles?a:b),maxCalls=Math.max(...rows.map(r=>r.calls));
  return {method:'Production geometry + instance compaction + Three Frustum; CPU submission count, not renderer.info measured on a GPU',modelTriangles:Object.fromEntries(Object.entries(models).map(([k,g])=>[k,triangles(g)])),backgroundGeometry:Object.fromEntries(Object.entries(BACKGROUND_LAYOUT).map(([id,items])=>[id,items.reduce((sum,[key])=>sum+triangles(models[key]),24)])),impactCaps:caps,peak,maxCalls,samples:rows.length,rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const report=await audit();console.log(JSON.stringify(process.argv.includes('--full')?report:{...report,rows:undefined},null,2));}
