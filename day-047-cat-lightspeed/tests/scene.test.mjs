import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../vendor/three.js';
import { createCatModel,createLightTrail,lightTrailLayout,createScene,TRAIL_OPACITY_MAX } from '../lib/scene.js';
import { counterRenderer } from '../scripts/render-budget.mjs';
import { LIGHT_SPEED } from '../lib/milestones.js';
import { MAX_SPEED } from '../lib/physics.js';

test('光の尾は箱の後端より後ろに置き、全頂点が進行方向と反対側へ伸びる',()=>{
  const {cat}=createCatModel(),trail=createLightTrail();
  const box=new THREE.Box3().setFromObject(cat,true),layout=lightTrailLayout(box);
  assert.ok(trail.children.length>0&&trail.children.length<=3);
  for(const [i,piece] of trail.children.entries()){
    piece.position.set(...Object.values(layout[i].root));piece.updateMatrixWorld();
    assert.ok(piece.position.z>box.max.z);assert.ok(!box.containsPoint(piece.position));
    const p=piece.geometry.attributes.position;
    for(let j=0;j<p.count;j++)assert.ok(new THREE.Vector3().fromBufferAttribute(p,j).applyMatrix4(piece.matrixWorld).z>box.max.z);
  }
});

// v2 drew a green cone at opacity 0.75. v3 P0-4: one translucent white-blue trail, opacity 0.35 or less, transparent at the end.
// Only material-level facts are machine-checked; the colour and the fade may live in a shader, so they are left to the image review.
const opacities=material=>[material.opacity,material.uniforms?.opacity?.value].filter(Number.isFinite);
test('光の尾は1本で、半透明（不透明度0.35以下）・深度を書かない',()=>{
  assert.ok(TRAIL_OPACITY_MAX<=.35,`TRAIL_OPACITY_MAX ${TRAIL_OPACITY_MAX}`);
  const trail=createLightTrail();assert.equal(trail.children.length,1);
  for(const piece of trail.children){
    assert.equal(piece.material.transparent,true);assert.equal(piece.material.depthWrite,false);
    assert.ok(opacities(piece.material).every(v=>v<=.35),JSON.stringify(opacities(piece.material)));
  }
});

const readCat=async()=>{const b=readFileSync(new URL('../assets/models/cat-run.glb',import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
test('描画中の光の尾も、音速から完走までどの速度でも不透明度0.35以下',async()=>{
  globalThis.devicePixelRatio=1;globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  const models=Object.fromEntries(['tree','pine','log','stump','fence','rock','grass','flower','crops','building','buildingA','buildingC','buildingE','stone','cityFence'].map(k=>[k,new THREE.BoxGeometry()]));
  let root;const renderer=counterRenderer(),render=renderer.render;renderer.render=function(scene,camera){root=scene;render.call(this,scene,camera);};
  const scene=await createScene({clientWidth:362,clientHeight:540},{models,renderer,readCat});
  for(const speed of [1225,1e5,1e7,LIGHT_SPEED*.9,LIGHT_SPEED*.999,MAX_SPEED]){
    scene.draw(speed,0,true,false);const at=scene.trailBounds().root;let piece;
    root.traverse(o=>{if(o.isMesh&&o.position.distanceTo(at)<1e-9)piece=o;});
    assert.ok(piece,`${speed}km/h：光の尾が見つからない`);
    assert.ok(opacities(piece.material).every(v=>v<=.35),`${speed}km/h：${JSON.stringify(opacities(piece.material))}`);
  }
  scene.dispose();
});
