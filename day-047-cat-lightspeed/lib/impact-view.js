import * as THREE from '../vendor/three.js';
import { TYPES,CONTACT_Z,LIMITS,FLOAT_Y } from './impacts.js';
import { triangles } from './models.js';
import { mergeParts,lambert,radialTexture } from './sets.js';
// 弾く的の見た目。どれも底面が y=0、幅がほぼ1の頂点色つき形状（1種類1ドローコール）。
const box=new THREE.BoxGeometry(1,1,1),cyl=new THREE.CylinderGeometry(1,1,1,12),cone=new THREE.ConeGeometry(1,1,10),sphere=new THREE.IcosahedronGeometry(1,1),ico=new THREE.IcosahedronGeometry(1,0),octa=new THREE.OctahedronGeometry(1,0);
export function targetGeometries(models){
  const g={
    hay:mergeParts([[cyl,0xe2c15f,0,.42,0,.46,.84,.46,0,0,Math.PI/2],[cyl,0xc79b3c,0,.42,0,.47,.08,.47,0,0,Math.PI/2],[cyl,0xc79b3c,.25,.42,0,.47,.06,.47,0,0,Math.PI/2],[cyl,0xc79b3c,-.25,.42,0,.47,.06,.47,0,0,Math.PI/2]]),
    crate:mergeParts([[box,0xb77a45,0,.4,0,.8,.8,.8],[box,0x8a5a32,0,.4,.41,.84,.12,.02],[box,0x8a5a32,0,.4,-.41,.84,.12,.02],[box,0x8a5a32,.41,.4,0,.02,.12,.84],[box,0x8a5a32,-.41,.4,0,.02,.12,.84]]),
    cone:mergeParts([[cone,0xf06a2c,0,.45,0,.3,.9,.3],[cyl,0xf5f1e8,0,.5,0,.2,.1,.2],[box,0x2e3438,0,.03,0,.7,.06,.7]]),
    bin:mergeParts([[cyl,0x3f7d5c,0,.45,0,.33,.9,.33],[cyl,0x2f5f45,0,.93,0,.36,.08,.36]]),
    box:mergeParts([[box,0xc9a06b,0,.32,0,.8,.64,.64],[box,0xe8d9b8,0,.645,0,.82,.02,.12]]),
    balloon:mergeParts([[sphere,0xe8505b,0,1.1,0,.5,.6,.5],[cyl,0xf4efe6,0,.4,0,.015,.8,.015],[box,0xb88a4e,0,0,0,.22,.18,.22]]),
    drone:mergeParts([[box,0x39424a,0,.4,0,.5,.16,.5],...[[.42,.42],[-.42,.42],[.42,-.42],[-.42,-.42]].flatMap(([x,z])=>[[box,0x39424a,x/2,.4,z/2,.06,.06,.6,0,Math.atan2(x,z),0],[cyl,0xdfe7ec,x,.5,z,.22,.02,.22]]),[box,0xff5e3a,0,.3,.26,.1,.06,.02]]),
    satellite:mergeParts([[box,0xd9dde2,0,.5,0,.45,.5,.45],[box,0x2d5ea8,-.75,.5,0,.9,.04,.5],[box,0x2d5ea8,.75,.5,0,.9,.04,.5],[cyl,0xe8c56b,0,.9,0,.03,.4,.03],[sphere,0xf2f2f2,0,1.12,0,.08,.08,.08]]),
    junk:mergeParts([[box,0x9aa3ab,0,.3,0,.7,.1,.45,.3,.4,0],[box,0x2d5ea8,.2,.34,.1,.4,.03,.3,.1,.2,.5]]),
    asteroid:mergeParts([[ico,0x8f7766,0,.55,0,.6,.5,.55],[ico,0x6e5b4f,.3,.7,.2,.25,.22,.25]]),
    ice:mergeParts([[ico,0xcfeaf5,0,.5,0,.45,.55,.4],[ico,0xa9d6ea,-.2,.75,0,.2,.25,.2]]),
    crystal:mergeParts([[octa,0xb9a4ff,0,.6,0,.35,.6,.35],[octa,0xe2d8ff,.2,.35,.1,.15,.25,.15]]),
    shard:mergeParts([[octa,0x8fd8ff,0,.5,0,.22,.5,.22,.3,0,.2]])
  };
  const log=models?.log;g.log=log||mergeParts([[cyl,0x8a5a32,0,.25,0,.25,1,.25,0,0,Math.PI/2]]);
  for(const geometry of Object.values(g)){geometry.computeBoundingBox();geometry.computeBoundingSphere();}
  return g;
}
export function createImpactView(models){
  const root=new THREE.Group(),material=lambert(),geometries=targetGeometries(models),capacity=LIMITS.waiting+LIMITS.flying;
  const meshes={};
  for(const [type,geometry] of Object.entries(geometries)){const mat=type==='log'&&models?.log?(geometry.userData.material||material):material;const mesh=new THREE.InstancedMesh(geometry,mat,capacity);mesh.count=0;mesh.frustumCulled=false;mesh.visible=false;root.add(mesh);meshes[type]=mesh;}
  const fragments=new THREE.InstancedMesh(box,new THREE.MeshLambertMaterial({color:0xffffff,flatShading:true}),LIMITS.fragments);fragments.count=0;fragments.frustumCulled=false;root.add(fragments);
  const flashes=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:radialTexture(48,[255,255,255]),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}),LIMITS.flashes);flashes.count=0;flashes.frustumCulled=false;root.add(flashes);
  const object=new THREE.Object3D(),sphere=new THREE.Sphere(),color=new THREE.Color(),fragmentColors={farm:0xd8b36a,city:0xcfc6b6,sky:0xf2f2f2,orbit:0xc5ccd3,solar:0xa7907f,interstellar:0xc9bcff};
  let budget={calls:0,triangles:0,visibleTargets:0};
  function put(mesh,items,frustum,camera){
    let n=0;
    for(const it of items){if(n>=mesh.instanceMatrix.count)break;object.position.set(it.x,it.y,it.z);if(camera)object.quaternion.copy(camera.quaternion);else object.rotation.set(it.rx||0,it.ry||0,it.rz||0);object.scale.set(it.sx??it.scale??1,it.sy??it.scale??1,it.sz??it.scale??1);object.updateMatrix();
      if(frustum&&mesh.geometry.boundingSphere){sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(object.matrix);if(!frustum.intersectsSphere(sphere))continue;}
      mesh.setMatrixAt(n,object.matrix);if(it.color!==undefined&&mesh.instanceColor!==undefined){mesh.setColorAt(n,color.set(it.color));}n++;}
    mesh.count=n;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    const groups=Array.isArray(mesh.material)?mesh.geometry.groups.length:1;return {calls:n?groups:0,triangles:triangles(mesh.geometry)*n};
  }
  function sync(s,speed,reduced,frustum,camera){
    budget={calls:0,triangles:0,visibleTargets:0};const world=s.world,types=TYPES[world]||[];
    for(const [type,mesh] of Object.entries(meshes)){mesh.visible=types.includes(type);if(!mesh.visible)mesh.count=0;}
    for(const type of types){
      const mesh=meshes[type],floor=FLOAT_Y[world]??0,waiting=s.queues.flat().filter(o=>o.type===type).map(o=>({x:o.x,y:floor,z:CONTACT_Z-(o.s-s.distance),ry:o.turn,scale:o.size}));
      const flying=s.flying.filter(o=>o.world===world&&o.type===type).map(o=>{const fade=Math.min(1,(o.life-o.age)/.15);return {x:o.x,y:o.y,z:o.z,rx:o.angle,ry:o.turn+o.angle*.6,rz:o.angle*.4,scale:o.size*fade};});
      for(const o of waiting){if(!frustum||frustum.containsPoint(new THREE.Vector3(o.x,o.y+.4*o.scale,o.z)))budget.visibleTargets++;}
      const packed=put(mesh,[...waiting,...flying],frustum);budget.calls+=packed.calls;budget.triangles+=packed.triangles;
    }
    fragments.material.color.setHex(fragmentColors[world]||0xffffff);
    const f=put(fragments,s.fragments.map(o=>({x:o.x,y:o.y,z:o.z,rx:o.angle,ry:o.angle*.7,scale:o.size*Math.min(1,(o.life-o.age)/.12)})),frustum);budget.calls+=f.calls;budget.triangles+=f.triangles;
    const fl=put(flashes,s.flashes.map(o=>{const t=o.age/o.life;return {x:o.x,y:o.y,z:o.z,scale:(reduced?.6:.7+1.1*t)*(1+o.strength*.5)};}),frustum,camera);flashes.material.opacity=1;budget.calls+=fl.calls;budget.triangles+=fl.triangles;
    return budget;
  }
  return {root,sync,stats:()=>budget};
}
