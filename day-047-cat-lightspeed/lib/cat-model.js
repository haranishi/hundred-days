import * as THREE from '../vendor/three.js';
export const CAT_RUN_RATE_MIN=.6;
export const CAT_RUN_RATE_MAX=2.4;
export function catRunRate(speed){
  const v=Number.isNaN(speed)?0:Math.max(0,speed);
  return CAT_RUN_RATE_MIN+(CAT_RUN_RATE_MAX-CAT_RUN_RATE_MIN)*Math.min(1,Math.sqrt(v/2025));
}
function movingTracks(clip){return clip.tracks.filter(t=>{const size=t.getValueSize();return t.values.some((v,i)=>Math.abs(v-t.values[i%size])>1e-5);}).length;}
export function selectRunClip(clips){
  // The supplied EmptyAction also has 105 tracks. Break ties by actual motion,
  // never by the exporter-generated name or the order of equal-size clips.
  return clips.filter(c=>c.tracks.length&&c.duration>0).reduce((best,c)=>!best||c.tracks.length>best.tracks.length||(c.tracks.length===best.tracks.length&&movingTracks(c)>movingTracks(best))?c:best,null);
}
// モデルの鼻は+X。π/2で進行方向の-Zへ向ける。
// 以前のyaw=0は後方カメラで横姿を見せる対症療法だった。
// 今はカメラを+X側に置き、走る方向と体の向きを一致させる。
export const CAT_MODEL_YAW=Math.PI/2;
export const CAT_MODEL_SCALE=5.2;
export async function loadCatModel(read=async()=>{
  const response=await fetch(new URL('../assets/models/cat-run.glb',import.meta.url));
  if(!response.ok)throw new Error('Cat model unavailable');
  return response.arrayBuffer();
}){
  const gltf=await new THREE.GLTFLoader().parseAsync(await read(),'');
  const clip=selectRunClip(gltf.animations);
  if(!clip)throw new Error('Cat run animation missing');
  const cat=new THREE.Group(),model=gltf.scene;cat.position.set(0,.18,.65);
  model.updateMatrixWorld(true);
  const coatMaterials=new Map(),coats=[],point=new THREE.Vector3();
  model.traverse(part=>{
    if(!part.isMesh)return;
    const p=part.geometry.attributes.position,colors=[];
    // Bind-pose world coordinates: +X toward the nose, +Y up. Colors stay
    // attached to the skin during animation; no texture fetch or extra draw pass.
    for(let i=0;i<p.count;i++){
      point.fromBufferAttribute(p,i).applyMatrix4(part.matrixWorld);
      const {x,y,z}=point;
      const cream=y<.045||(y<.14&&x>-.13&&x<.14);
      const stripe=!cream&&Math.sin(x*105+Math.abs(z)*25)>.45;
      // 顔：モデルに目鼻の色が無い。鼻先（x≈0.281・y≈0.205）と口元は頂点色、目は頭の骨に付けた小さな玉で置く（頂点色だと面ににじんで覆面に見えた）。
      const nose=x>.272&&y>.192&&y<.214,muzzle=!nose&&x>.25&&y<.196;
      const color=new THREE.Color(nose?0xd98b8b:muzzle||cream?0xffe9ce:stripe?0x99552e:0xd89a5c);
      colors.push(color.r,color.g,color.b);
    }
    const attribute=new THREE.Float32BufferAttribute(colors,3);
    part.geometry.setAttribute('color',attribute);coats.push({attribute,base:attribute.array.slice()});
    const old=Array.isArray(part.material)?part.material:[part.material];old.forEach(m=>m.dispose());
    part.material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.85});
    coatMaterials.set(part.material,part.material.color.clone());
    // Skinned bounds vary every frame; avoid stale bind-pose GPU culling.
    part.frustumCulled=false;
  });
  model.rotation.y=CAT_MODEL_YAW;model.scale.setScalar(CAT_MODEL_SCALE);cat.add(model);
  const mixer=new THREE.AnimationMixer(model),action=mixer.clipAction(clip);action.play();mixer.update(0);
  // 光の猫：同じ骨で動く「殻」を裏面だけ加算で描き、輪郭を白青に光らせる（1ドローコール）。
  let skinned=null;model.traverse(o=>{if(o.isSkinnedMesh&&!skinned)skinned=o;});
  const shellMaterial=new THREE.MeshBasicMaterial({color:0xcfeaff,transparent:true,opacity:0,side:THREE.BackSide,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
  const shellWidth={value:.0045};
  shellMaterial.onBeforeCompile=shader=>{shader.uniforms.shellWidth=shellWidth;shader.vertexShader='uniform float shellWidth;\n'+shader.vertexShader.replace('#include <skinning_vertex>','#include <skinning_vertex>\n\ttransformed+=normalize(objectNormal)*shellWidth;');};
  let shell=null;
  if(skinned){shell=new THREE.SkinnedMesh(skinned.geometry,shellMaterial);shell.bind(skinned.skeleton,skinned.bindMatrix);shell.position.copy(skinned.position);shell.quaternion.copy(skinned.quaternion);shell.scale.copy(skinned.scale);shell.frustumCulled=false;shell.visible=false;shell.renderOrder=2;skinned.parent.add(shell);}
  const bones={};model.traverse(o=>{if(o.isBone&&['neck','head'].includes(o.name))bones[o.name]=o;});
  // 目：黒目と白い光を1つの形状にまとめ、頭の骨の子に置く（1ドローコール）。位置は描き込み前の姿勢でのモデル座標から骨の座標へ移す。
  let eyes=null;
  if(bones.head){
    const parts=[],sphere=new THREE.SphereGeometry(1,8,6),small=new THREE.SphereGeometry(1,6,4),m=new THREE.Matrix4(),q=new THREE.Quaternion(),sc=new THREE.Vector3();
    const add=(color,x,y,z,r)=>{const g=(r<.005?small:sphere).clone();g.applyMatrix4(m.compose(new THREE.Vector3(x,y,z),q,sc.set(r,r*1.15,r)));const c=new THREE.Color(color),cols=[];for(let i=0;i<g.attributes.position.count;i++)cols.push(c.r,c.g,c.b);g.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));parts.push(g.index?g.toNonIndexed():g);};
    for(const side of [-1,1]){add(0x16201c,.259,.222,side*.029,.0105);add(0xffffff,.2655,.227,side*.031,.0032);}
    const merged=new THREE.BufferGeometry(),pos=[],nor=[],col=[];for(const g of parts){pos.push(...g.attributes.position.array);nor.push(...g.attributes.normal.array);col.push(...g.attributes.color.array);g.dispose();}sphere.dispose();
    small.dispose();merged.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));merged.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));merged.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    // 目の位置は読み込み時のモデル座標（＝結合時の姿勢）。骨の結合時の逆行列で骨の座標へ移す（いまの姿勢の行列を使うとずれる）。
    const index=skinned?.skeleton.bones.indexOf(bones.head)??-1;merged.applyMatrix4(index>=0?skinned.skeleton.boneInverses[index]:new THREE.Matrix4().copy(bones.head.matrixWorld).invert());
    eyes=new THREE.Mesh(merged,new THREE.MeshBasicMaterial({vertexColors:true,fog:false}));eyes.frustumCulled=false;bones.head.add(eyes);
  }
  const up=new THREE.Vector3(0,1,0),turn=new THREE.Quaternion(),parentQuat=new THREE.Quaternion(),local=new THREE.Quaternion();
  let headTurn=0;
  // 走りの姿勢のあとで首と頭をカメラ側へ振り、横顔から少し顔が見えるようにする。
  function applyHeadTurn(){if(!headTurn)return;for(const [name,share] of [['neck',.45],['head',.55]]){const bone=bones[name];if(!bone)continue;bone.parent.getWorldQuaternion(parentQuat);turn.setFromAxisAngle(up,headTurn*share);local.copy(parentQuat).invert().multiply(turn).multiply(parentQuat);bone.quaternion.premultiply(local);}}
  // 毛色は純白へ寄せる（青みは発光色 #bfe4ff で足す）。
  const white=new THREE.Color(0xffffff);let lastWhiten=-1;
  return {cat,model,mixer,action,clip,coatMaterials,shell,eyes,
    whiten(amount){if(amount===lastWhiten)return;lastWhiten=amount;for(const {attribute,base} of coats){const a=attribute.array;for(let i=0;i<base.length;i+=3){a[i]=base[i]+(white.r-base[i])*amount;a[i+1]=base[i+1]+(white.g-base[i+1])*amount;a[i+2]=base[i+2]+(white.b-base[i+2])*amount;}attribute.needsUpdate=true;}},
    setLight({rim=0,emissive=0,tint=0xcfeaff}={}){if(shell){shell.visible=rim>.001;shellMaterial.opacity=Math.min(1,rim);shellMaterial.color.setHex(tint);shellWidth.value=.0035+.004*rim;}for(const material of coatMaterials.keys()){material.emissive.setHex(0xbfe4ff);material.emissiveIntensity=emissive;}},
    turnHead(angle){headTurn=angle;},
    simulate(speed,dt,playing,motion=1){action.timeScale=catRunRate(speed);if(playing&&speed>.01)mixer.update(dt*motion);else mixer.update(0);applyHeadTurn();},
    reset(){action.reset().play();mixer.update(0);applyHeadTurn();},
    dispose(){mixer.stopAllAction();mixer.uncacheRoot(model);shellMaterial.dispose();eyes?.geometry.dispose();eyes?.material.dispose();model.traverse(o=>{if(o!==shell){o.geometry?.dispose();o.material?.dispose?.();}});}
  };
}
