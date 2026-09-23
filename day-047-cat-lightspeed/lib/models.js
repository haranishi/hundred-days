import * as THREE from '../vendor/three.js';
export const MODEL_FILES={tree:'tree_cone_fall.glb',pine:'tree_pineRoundA.glb',log:'log_large.glb',stump:'stump_old.glb',fence:'fence_simple.glb',rock:'rock_smallI.glb',grass:'grass_leafs.glb',flower:'flower_yellowA.glb',crops:'crops_dirtDoubleRowCorner.glb',building:'building-type-g.glb',buildingA:'building-type-a.glb',buildingC:'building-type-c.glb',buildingE:'building-type-e.glb',stone:'path-stones-long.glb',cityFence:'fence-1x4.glb'};
// Merge transforms without changing glTF materials, UVs or texture transforms.
// Nature meshes keep material groups; city templates have one material/draw call.
export function mergeMaterials(root){
  root.updateMatrixWorld(true);
  const positions=[],normals=[],uvs=[],materials=[],g=new THREE.BufferGeometry();
  root.traverse(o=>{
    if(!o.isMesh)return;
    const part=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();part.applyMatrix4(o.matrixWorld);
    const offset=positions.length/3,p=part.attributes.position;
    positions.push(...p.array);normals.push(...part.attributes.normal.array);
    uvs.push(...(part.attributes.uv?.array||new Float32Array(p.count*2)));
    const mats=Array.isArray(o.material)?o.material:[o.material];
    for(const group of part.groups.length?part.groups:[{start:0,count:p.count,materialIndex:0}]){
      const mat=Array.isArray(o.material)?mats[group.materialIndex]:mats[0];let index=materials.indexOf(mat);
      if(index<0){
        // 🔴 Kenney Nature Kit の材質は metallicFactor=1。環境マップの無いこの場面では真っ黒に落ちる。
        // baseColorFactor で色を持っている（テクスチャを使わない）材質だけ、金属味を外して色を出す。
        if(mat&&mat.isMeshStandardMaterial&&!mat.map&&mat.metalness>=1){mat.metalness=0;mat.roughness=Math.min(1,mat.roughness??1);}
        index=materials.length;materials.push(mat);
      }
      g.addGroup(offset+group.start,group.count,index);
    }
    part.dispose();
  });
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  g.userData.material=materials.length===1?materials[0]:materials;
  g.computeBoundingSphere();return g;
}
export async function loadModels(read=async file=>(await fetch(new URL(`../assets/models/${file}`,import.meta.url))).arrayBuffer(),manager){
  const loader=new THREE.GLTFLoader(manager),base=new URL('../assets/models/',import.meta.url).href;
  const entries=await Promise.all(Object.entries(MODEL_FILES).map(async([id,file])=>{
    const gltf=await loader.parseAsync(await read(file),base),g=mergeMaterials(gltf.scene);
    g.computeBoundingBox();const box=g.boundingBox,size=box.getSize(new THREE.Vector3()),scale=1/Math.max(...size.toArray());
    g.translate(-(box.min.x+box.max.x)/2,-box.min.y,-(box.min.z+box.max.z)/2);g.scale(scale,scale,scale);g.computeBoundingBox();g.computeBoundingSphere();
    gltf.scene.traverse(o=>o.geometry?.dispose());return [id,g];
  }));return Object.fromEntries(entries);
}
export const BACKGROUND_LAYOUT={
  farm:[...['tree','pine','crops','grass','flower','rock','fence'].flatMap((type,i)=>[[type,-3,0,2-i*2, type==='tree'||type==='pine'?2:1],[type,3,0,1-i*2,1]] )],
  // The four buildings live in the destructible street rows, not duplicated scenery.
  city:[['cityFence',-3,0,-2,2],['cityFence',-3,0,-7,2],['stone',2.6,0,-1,2],['stone',2.6,0,-5,2]]
};
export function templates(models,world){
  const primitive=(type,color,sx=1,sy=1,sz=1)=>{const g=type==='rock'?new THREE.IcosahedronGeometry(.5,0):type==='ring'?new THREE.TorusGeometry(.4,.08,3,8):type==='buoy'?new THREE.OctahedronGeometry(.5,0):new THREE.BoxGeometry(1,1,1);g.scale(sx,sy,sz);g.translate(0,.5,0);return mergeMaterials(new THREE.Mesh(g,new THREE.MeshStandardMaterial({color})));};
  const mapping={farm:['log','stump','fence'],city:['buildingA','buildingC','buildingE','building']};
  if(mapping[world])return mapping[world].map(id=>models[id]);
  if(world==='sky')return [primitive('buoy',0xf3c36a),primitive('box',0xb1c4d0,.8,.6,.8),primitive('rock',0xaee8ee)];
  const craft=()=>{const root=new THREE.Group();for(const [x,y,z,sx,sy,sz,color] of [[0,.45,0,.35,.4,.45,0xc3cbce],[-.4,.4,0,.4,.04,.7,0x548cbe],[.4,.4,0,.4,.04,.7,0x548cbe],[0,.78,0,.04,.3,.04,0xd7bc81]]){const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),new THREE.MeshStandardMaterial({color}));m.position.set(x,y,z);root.add(m);}return mergeMaterials(root);};
  if(world==='orbit')return [craft(),primitive('box',0x548cbe,1,.08,.8),primitive('ring',0xc1cace)];
  if(world==='solar')return [primitive('rock',0xa88879),primitive('rock',0xbadce8),craft()];
  return [primitive('buoy',0xbbabe2),primitive('rock',0x5e667b),primitive('ring',0x94c9ce)];
}
export const triangles=g=>(g.index?.count??g.attributes.position.count)/3;
// Same compaction/culling path is used by WebGL and the deterministic Node audit.
export function createBatch(geometry,capacity,material){const mesh=new THREE.InstancedMesh(geometry,geometry.userData.material||material,capacity);mesh.count=0;mesh.frustumCulled=false;return mesh;}
const transform=new THREE.Object3D(),sphere=new THREE.Sphere();
export function packBatch(mesh,items,frustum){
  mesh.count=0;
  for(const item of items){if(mesh.count>=mesh.instanceMatrix.count)break;transform.position.set(item.x,item.y,item.z);transform.rotation.set(item.angle||0,(item.angle||0)*.7,0);const scale=item.scale??1;transform.scale.set(scale*(item.sx??1),scale*(item.sy??1),scale*(item.sz??1));transform.updateMatrix();sphere.copy(mesh.geometry.boundingSphere||new THREE.Sphere(new THREE.Vector3(),2)).applyMatrix4(transform.matrix);if(frustum&&!frustum.intersectsSphere(sphere))continue;mesh.setMatrixAt(mesh.count,transform.matrix);if(item.color!==undefined)mesh.setColorAt(mesh.count,new THREE.Color(item.color));mesh.count++;}
  mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;return {calls:mesh.count?(Array.isArray(mesh.material)?mesh.geometry.groups.length:1):0,triangles:triangles(mesh.geometry)*mesh.count};
}
