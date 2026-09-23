import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.js';
import {catRunRate,CAT_RUN_RATE_MIN,CAT_RUN_RATE_MAX,selectRunClip,loadCatModel} from '../lib/cat-model.js';
import {LIGHT_SPEED} from '../lib/milestones.js';
import {FINISH_RATIO} from '../lib/physics.js';
import {createScene} from '../lib/scene.js';
import {counterRenderer} from '../scripts/render-budget.mjs';
const readCat=async()=>{const b=readFileSync(new URL('../assets/models/cat-run.glb',import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
test('走りは速度に応じて単調増加、下限0.6・上限2.4を固定',()=>{
  assert.equal(CAT_RUN_RATE_MIN,.6);assert.equal(CAT_RUN_RATE_MAX,2.4);
  const values=[0,.05,1,10,100,1000,100000,LIGHT_SPEED].map(catRunRate);
  values.forEach((v,i)=>{assert.ok(v>=.6&&v<=2.4);if(i)assert.ok(v>=values[i-1]);});
  for(const v of [-Infinity,-1,NaN])assert.equal(catRunRate(v),.6);
  assert.ok(catRunRate(1)<.65);assert.ok(catRunRate(813)>1.7);assert.ok(Math.abs(catRunRate(1225)-2)<.05);
  for(const v of [2025,LIGHT_SPEED,1e30,Infinity])assert.equal(catRunRate(v),2.4);
});
test('名前に依存せず最大トラック数を選び、空クリップを除外する',()=>{
  const track=new THREE.NumberKeyframeTrack('.position[x]',[0,1],[0,1]);
  const empty=new THREE.AnimationClip('run',1,[]),small=new THREE.AnimationClip('fast',1,[track]),large=new THREE.AnimationClip('EmptyAction',1,[track,track]);
  assert.equal(selectRunClip([empty,small,large]),large);assert.equal(selectRunClip([empty]),null);assert.equal(selectRunClip([]),null);
});
test('実GLBは同数105トラックのEmptyActionを順序によらず避ける',async()=>{
  const gltf=await new THREE.GLTFLoader().parseAsync(await readCat(),'');
  const selected=selectRunClip(gltf.animations);assert.equal(selected.tracks.length,105);
  assert.equal(selected.name,'Armature|Armature|ArmatureAction');assert.equal(selectRunClip([...gltf.animations].reverse()),selected);
});
test('実スキンが走りで変形、停止では時計維持、resetで復元する',async()=>{
  // The coat skin is the first SkinnedMesh; a later one may be a glow shell that shares its skeleton.
  const view=await loadCatModel(readCat);let mesh;view.cat.traverse(o=>{if(o.isSkinnedMesh&&!mesh)mesh=o;});
  const vertices=()=>{view.cat.updateMatrixWorld(true);return Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.getVertexPosition(i,new THREE.Vector3()).toArray());};
  const initial=vertices();view.simulate(1000,.3,true);assert.notDeepEqual(vertices(),initial);assert.equal(view.action.timeScale,catRunRate(1000));
  const time=view.action.time;view.simulate(0,1,true);view.simulate(1000,1,false);assert.equal(view.action.time,time);
  view.reset();assert.equal(view.action.time,0);assert.deepEqual(vertices(),initial);assert.ok(mesh.material.isMeshStandardMaterial&&mesh.material.vertexColors);view.dispose();
});
test('GLBの読込失敗・不正バイナリはコード猫にフォールバックする',async()=>{
  globalThis.devicePixelRatio=1;globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  const keys=['tree','pine','log','stump','fence','rock','grass','flower','crops','building','buildingA','buildingC','buildingE','stone','cityFence'];
  const models=Object.fromEntries(keys.map(k=>[k,new THREE.BoxGeometry()]));
  for(const readCat of [async()=>{throw new Error('offline');},async()=>new ArrayBuffer(8)]){
    const scene=await createScene({clientWidth:1080,clientHeight:450},{models,renderer:counterRenderer(),readCat});
    scene.draw(1000,0,true,false);assert.equal(scene.stats().catModel,'procedural');assert.ok(scene.stats().triangles>0);assert.ok(scene.catScreen().h>=.18);scene.dispose();
  }
});
// v2 fixed emissive 0.16 / halo 0.24 / whitening 18%. v3 (P0-5): the coat keeps its colour below 99%,
// and at 99.9% every vertex colour has moved at least 80% of the way to white (1.0 per linear channel).
test('GLB猫は光速比99%未満では毛色を保ち、99.9%以上で頂点色が8割以上白へ寄り、止まると元の色に戻る',async()=>{
  globalThis.devicePixelRatio=1;globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  const models=Object.fromEntries(['tree','pine','log','stump','fence','rock','grass','flower','crops','building','buildingA','buildingC','buildingE','stone','cityFence'].map(k=>[k,new THREE.BoxGeometry()]));
  let root;const renderer=counterRenderer(),render=renderer.render;renderer.render=function(scene,camera){root=scene;render.call(this,scene,camera);};
  const scene=await createScene({clientWidth:1080,clientHeight:450},{models,renderer,readCat});scene.draw(0,0,false,false);
  let skin;root.traverse(o=>{if(o.isSkinnedMesh&&!skin)skin=o;});
  const colors=skin.geometry.attributes.color.array.slice(),now=()=>skin.geometry.attributes.color.array;
  scene.draw(LIGHT_SPEED*.98,0,true,false);assert.deepEqual(now(),colors,'光速比98%で毛色が変わった');
  for(const ratio of [.999,FINISH_RATIO]){
    scene.draw(LIGHT_SPEED*ratio,0,true,false);assert.equal(skin.material.transparent,false,'毛皮が透けると輪郭が消える');
    for(let i=0;i<colors.length;i++)assert.ok(now()[i]>=colors[i]+(1-colors[i])*.8-1e-6,`光速比${ratio}：頂点色[${i}] ${now()[i]}（元 ${colors[i]}・必要 ${colors[i]+(1-colors[i])*.8}）`);
  }
  scene.draw(0,0,false,false);assert.deepEqual(now(),colors);assert.equal(skin.material.emissiveIntensity,0);scene.dispose();
});
