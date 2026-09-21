import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.js';
import { createCatModel,createLightTrail,lightTrailLayout } from '../lib/scene.js';

test('光の尾は3本以下・単色で、実モデルの境界箱内のしっぽより下から出る',()=>{
  const {cat,tail}=createCatModel(),trail=createLightTrail();
  assert.ok(trail.children.length>0&&trail.children.length<=3);
  assert.equal(trail.children.length,lightTrailLayout().length);
  for(const level of [0,.25,.65,1])for(const bounce of [0,.08]){
    cat.position.y=.55+bounce;cat.scale.z=1+level*.35;
    const box=new THREE.Box3().setFromObject(cat);
    cat.add(trail);cat.updateWorldMatrix(true,true);
    for(const piece of trail.children){
      const root=piece.getWorldPosition(new THREE.Vector3());
      assert.ok(box.containsPoint(root),`root outside cat at level ${level}`);
      assert.ok(root.y<tail.getWorldPosition(new THREE.Vector3()).y-.2);
      assert.equal(piece.material.color.getHex(),0xd6f775);
      assert.deepEqual(piece.position.toArray(),Object.values(lightTrailLayout()[0].root));
    }
    cat.remove(trail);
  }
});

test('円錐は根元が太く先端が細く、実頂点の不透明度が0.75から0へ減衰する',()=>{
  for(const piece of createLightTrail().children){
    assert.equal(piece.material.transparent,true);assert.equal(piece.material.depthWrite,false);
    assert.equal(piece.material.opacity,.75);assert.equal(piece.material.vertexColors,true);
    const position=piece.geometry.getAttribute('position'),color=piece.geometry.getAttribute('color');
    let rootRadius=0,tipCount=0,midCount=0;
    for(let i=0;i<position.count;i++){
      const z=position.getZ(i),radius=Math.hypot(position.getX(i),position.getY(i)),alpha=color.getW(i)*piece.material.opacity;
      assert.ok(Math.abs(alpha-.75*(1-z))<1e-6);
      if(z<1e-6)rootRadius=Math.max(rootRadius,radius);
      else if(z>1-1e-6){assert.ok(radius<1e-6);assert.ok(alpha<1e-6);tipCount++;}
      else {assert.ok(radius<1&&alpha>0&&alpha<.75);midCount++;}
    }
    assert.ok(rootRadius>.99&&tipCount>0&&midCount>0);
  }
});
