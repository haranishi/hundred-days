import * as THREE from '../vendor/three.js';
import { loadModels } from './models.js';
import { createImpactView } from './impact-view.js';
import { LIGHT_SPEED } from './milestones.js';
import { worldAt } from './worlds.js';
import { loadCatModel,CAT_MODEL_SCALE } from './cat-model.js';
import { catLightAppearance } from './cat-light.js';
import { createSets,skyDome,radialTexture,rng } from './sets.js';
import { flowSpeed,CONTACT_Z,FLOAT_Y } from './impacts.js';
import { createRivalView } from './rivals.js';

// GLBが読めないときの予備の猫（コード生成）
export function createCatModel(mesh=(parent,type,color,x,y,z,sx,sy,sz)=>{
  const geometry=type==='sphere'?new THREE.SphereGeometry(1,16,10):type==='cone'?new THREE.ConeGeometry(1,1,4):new THREE.BoxGeometry(1,1,1);
  const part=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.85}));
  part.position.set(x,y,z);part.scale.set(sx,sy,sz);parent.add(part);return part;
}) {
  const cat=new THREE.Group();cat.position.set(0,.55,1);
  const body=mesh(cat,'sphere',0xf4ba76,0,.45,0,.43,.43,.85),chest=mesh(cat,'sphere',0xffe6bd,0,.53,-.52,.36,.41,.4);
  const head=new THREE.Group();head.position.set(0,.84,-.82);cat.add(head);mesh(head,'sphere',0xf4ba76,0,0,0,.43,.4,.38);
  for(const x of [-.28,.28]){const ear=mesh(head,'cone',0xeaa462,x,.37,.02,.23,.45,.22);ear.rotation.y=Math.PI/4;mesh(head,'cone',0xefaa9e,x,.39,-.05,.13,.27,.1).rotation.y=Math.PI/4;}
  mesh(head,'sphere',0xffe9ce,0,-.14,-.3,.26,.17,.13);mesh(head,'sphere',0x745348,0,-.09,-.42,.065,.045,.04);
  for(const x of [-.23,.23])mesh(head,'sphere',0x203b32,x,.04,-.29,.055,.075,.045);
  for(const x of [-1,1])for(let i=0;i<3;i++){const whisker=mesh(head,'box',0xffefd5,x*.39,-.09+i*.07,-.32,.35,.012,.012);whisker.rotation.z=x*(i-1)*.18;}
  const paws=[];for(const x of [-.27,.27])for(const z of [-.47,.5]){const leg=new THREE.Group();leg.position.set(x,.25,z);cat.add(leg);mesh(leg,'sphere',0xf4ba76,0,-.2,0,.14,.3,.15);mesh(leg,'sphere',0xffe9ce,0,-.42,-.07,.16,.12,.23);paws.push(leg);}
  const tail=new THREE.Group();tail.position.set(0,.68,.63);cat.add(tail);for(let i=0;i<5;i++)mesh(tail,'sphere',i===4?0xffe6bd:0xe7a364,0,.09*i,.19*i,.14-i*.014,.15-i*.01,.23);tail.rotation.x=-.65;
  for(let i=0;i<3;i++)mesh(cat,'box',0xc68650,0,.84,-.2+i*.29,.4,.035,.08);
  const coatMaterials=new Map();
  cat.traverse(part=>{if(part.material?.isMeshStandardMaterial&&!coatMaterials.has(part.material))coatMaterials.set(part.material,part.material.color.clone());});
  return {cat,body,chest,head,paws,tail,coatMaterials};
}

// 進行方向は−Z。光の尾は猫の後端より後ろから、白青の半透明で伸ばして先を透明にする。
export const TRAIL_OPACITY_MAX=.32;
export function lightTrailLayout(box=new THREE.Box3(new THREE.Vector3(-.5,0,-1),new THREE.Vector3(.5,1,1))) {
  return [{root:{x:(box.min.x+box.max.x)/2,y:box.min.y+(box.max.y-box.min.y)*.45,z:box.max.z+.08},color:0xcfeaff}];
}
export const TRAIL_DIRECTION=Object.freeze([-.42,.06,1]);
export function createLightTrail() {
  const group=new THREE.Group();
  for(const {root,color} of lightTrailLayout()){
    // 長さ方向 z∈[0,1]（根元→先）、幅方向 x∈[-.5,.5]。幅と長さの両方で透明へ落とす。
    const geometry=new THREE.PlaneGeometry(1,1,1,10);geometry.rotateX(-Math.PI/2);geometry.translate(0,0,.5);
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,side:THREE.DoubleSide,uniforms:{tint:{value:new THREE.Color(color)},opacity:{value:TRAIL_OPACITY_MAX}},
      vertexShader:'varying vec2 vUv;void main(){vUv=vec2(position.x+.5,position.z);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform vec3 tint;uniform float opacity;varying vec2 vUv;void main(){float across=1.-abs(vUv.x*2.-1.);float a=pow(across,2.2)*pow(1.-vUv.y,1.6)*opacity;gl_FragColor=vec4(tint*a,a);}'});
    material.opacity=TRAIL_OPACITY_MAX;
    const piece=new THREE.Mesh(geometry,material);piece.position.set(root.x,root.y,root.z);group.add(piece);
  }
  return group;
}

// 流線の本数：空12→軌道30→太陽系60→星間90→光速付近120。星点と合わせて180以下。
export const SPEED_LINES_MAX=120, STAR_POINTS=60;
export function speedLineTarget(world,speed){
  const ratio=speed/LIGHT_SPEED;
  if(world==='sky')return 12;if(world==='orbit')return 30;if(world==='solar')return 60;
  if(world==='interstellar')return Math.round(90+30*Math.min(1,Math.max(0,(ratio-.5)/.5)));
  return 0;
}
// 猫を斜め後ろ上から追うカメラ。道の先（進行方向）が画面の奥へ伸び、弾く的が3〜5個先まで見える。
// 縦長ほど後ろへ回し（道が右へ抜けず上へ伸びる）、横長は横顔が見える角度に寄せる。猫は画面高の約30%。
export function cameraRig(aspect){
  const t=Math.max(0,Math.min(1,(aspect-.55)/(1.6-.55)));
  const mix=(a,b)=>a+(b-a)*t;
  return {azimuth:mix(1.22,.95),elevation:mix(.55,.42),distance:mix(12.5,10.5),lookAhead:mix(3,2.4),lookUp:1,lookSide:mix(-.9,-.5),fov:45,headTurn:-mix(.6,.45)};
}
// 鳴くときだけ、首と頭をさらにカメラ側へ振り向かせて顔を見せる（ラジアン）。
export const MEOW_LOOK_BACK=.5;

export async function createScene(canvas,{models:providedModels,renderer:providedRenderer,readCat,forceFallback=false}={}) {
  const models=providedModels||await loadModels();
  const texturedTemplates=Object.values(models).filter(g=>{const mats=Array.isArray(g.userData.material)?g.userData.material:[g.userData.material];return mats.some(m=>m?.map?.image?.width>0);}).length;
  const renderer=providedRenderer||new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.1,1400);
  const hemi=new THREE.HemisphereLight(0xffffff,0x557c67,2.2);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xfff1d6,2.6);sun.position.set(-6,12,4);scene.add(sun);
  const dome=skyDome();scene.add(dome);
  const sets=createSets(models);for(const set of Object.values(sets)){set.group.visible=false;scene.add(set.group);}
  scene.fog=new THREE.Fog(0xcfe5ea,30,120);

  // 猫
  let loadedCat=null;
  if(!forceFallback)try{loadedCat=await loadCatModel(readCat);}catch{/* 読めなければ予備の猫 */}
  const fallback=loadedCat?null:createCatModel();
  const {cat,coatMaterials}=loadedCat||fallback;const {body,chest,head,paws,tail}=fallback||{};scene.add(cat);
  const trails=createLightTrail();trails.visible=false;scene.add(trails);
  const glow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:radialTexture(64,[210,236,255]),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));glow.visible=false;scene.add(glow);
  const impactView=createImpactView(models);scene.add(impactView.root);
  const rivals=createRivalView();scene.add(rivals.group);

  // 星（軌道・太陽系）と流線（空〜星間）
  const starGeometry=new THREE.BufferGeometry(),starPositions=new Float32Array(STAR_POINTS*3),r=rng(5);
  for(let i=0;i<STAR_POINTS;i++){const a=r()*Math.PI*2,b=(r()*.9+.05)*Math.PI;starPositions.set([Math.cos(a)*Math.sin(b)*500,Math.cos(b)*500+40,Math.sin(a)*Math.sin(b)*500],i*3);}
  starGeometry.setAttribute('position',new THREE.BufferAttribute(starPositions,3));
  const stars=new THREE.Points(starGeometry,new THREE.PointsMaterial({color:0xdfeaff,size:2,sizeAttenuation:false,fog:false,transparent:true,opacity:.9,depthWrite:false}));stars.frustumCulled=false;stars.visible=false;scene.add(stars);
  const linePositions=new Float32Array(SPEED_LINES_MAX*6),lineColors=new Float32Array(SPEED_LINES_MAX*6),lineBase=[];
  for(let i=0;i<SPEED_LINES_MAX;i++){const a=r()*Math.PI*2,rad=2.2+r()*9;lineBase.push({x:Math.cos(a)*rad,y:.9+Math.sin(a)*rad*.8,z:10-r()*120});lineColors.set([.85,.93,1,0,0,0],i*6);}
  const DUST=40,dustPositions=new Float32Array(DUST*3),dustBase=[];
  for(let i=0;i<DUST;i++){dustBase.push({x:(r()-.5)*14,y:-2+r()*8,z:10-r()*80});}
  const dustGeometry=new THREE.BufferGeometry();dustGeometry.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));
  const dust=new THREE.Points(dustGeometry,new THREE.PointsMaterial({color:0xc9d8ee,size:2.6,sizeAttenuation:false,fog:false,transparent:true,opacity:.8,depthWrite:false}));dust.frustumCulled=false;dust.visible=false;scene.add(dust);
  const lineGeometry=new THREE.BufferGeometry();lineGeometry.setAttribute('position',new THREE.BufferAttribute(linePositions,3));lineGeometry.setAttribute('color',new THREE.BufferAttribute(lineColors,3));lineGeometry.setDrawRange(0,0);
  const speedLines=new THREE.LineSegments(lineGeometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));speedLines.frustumCulled=false;scene.add(speedLines);

  const reduced=globalThis.matchMedia?matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
  let worldId='',clock=0,lineCount=0,shakePx=0,lastImpacts=null,lastDraw=null,headTurn=-.6,turnClock=0,rig=cameraRig(1),colorFrom=null,colorAt=-1;
  const colorNow={top:new THREE.Color(),bottom:new THREE.Color(),fog:new THREE.Color(),ground:new THREE.Color()};
  const frustum=new THREE.Frustum(),projection=new THREE.Matrix4(),baseCamera=new THREE.Vector3(),lookPoint=new THREE.Vector3(),right=new THREE.Vector3(),up=new THREE.Vector3(),point=new THREE.Vector3();
  const motion=()=>reduced.matches?.2:1;

  function setWorld(id){
    if(id===worldId)return;const previous=sets[worldId];
    colorFrom=previous?{top:colorNow.top.clone(),bottom:colorNow.bottom.clone(),fog:colorNow.fog.clone(),ground:colorNow.ground.clone()}:null;colorAt=clock;
    worldId=id;for(const [key,set] of Object.entries(sets))set.group.visible=key===id;
    const set=sets[id];scene.fog.near=set.fog[0];scene.fog.far=set.fog[1];stars.visible=Boolean(set.stars);set.enter?.();set.frame?.(camera,cat,0);
  }
  // 世界ごとの色へ0.6秒で補間。空は速さとともに成層圏の紺へ寄せる。
  function applyColors(speed){
    const set=sets[worldId],target={top:new THREE.Color(set.colors.top),bottom:new THREE.Color(set.colors.bottom),fog:new THREE.Color(set.colors.fog),ground:new THREE.Color(set.colors.ground)};
    if(worldId==='sky'){const k=Math.max(0,Math.min(1,Math.log10(Math.max(1000,speed)/1000)));target.top.lerp(new THREE.Color(0x0e2552),k*.8);target.bottom.lerp(new THREE.Color(0x6d9cc8),k*.6);target.fog.lerp(new THREE.Color(0x5d88b4),k*.6);}
    const t=colorFrom&&!reduced.matches?Math.min(1,(clock-colorAt)/.6):1;
    for(const key of Object.keys(colorNow))colorNow[key].copy(colorFrom?colorFrom[key]:target[key]).lerp(target[key],t);
    dome.material.uniforms.top.value.copy(colorNow.top);dome.material.uniforms.bottom.value.copy(colorNow.bottom);scene.fog.color.copy(colorNow.fog);hemi.groundColor.copy(colorNow.ground);
    scene.background=colorNow.bottom;
  }
  function placeCamera(){
    const {azimuth,elevation,distance,lookAhead,lookUp,lookSide=0}=rig,center=new THREE.Vector3(0,lookUp,.75);
    baseCamera.set(Math.cos(azimuth)*Math.cos(elevation)*distance,Math.sin(elevation)*distance+lookUp,center.z+Math.sin(azimuth)*Math.cos(elevation)*distance);
    lookPoint.set(lookSide,lookUp,center.z-lookAhead);camera.position.copy(baseCamera);camera.lookAt(lookPoint);camera.updateMatrixWorld();
  }
  function resize(){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;rig=cameraRig(w/h);camera.fov=rig.fov;camera.updateProjectionMatrix();
    loadedCat?.model.scale.setScalar(CAT_MODEL_SCALE);headTurn=rig.headTurn;loadedCat?.turnHead(headTurn);placeCamera();for(const set of Object.values(sets))set.frame?.(camera,cat,lastDraw?.[0]??0);
    if(lastDraw)draw(...lastDraw);
  }
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();

  // surge：往復ごとのひと押し（0〜1）。歩幅（走りの速さ）と背景・流線の流れを一瞬強める。
  function simulate(speed,dt,playing,surge=0){
    clock+=dt;const m=motion(),kick=reduced.matches?0:Math.max(0,Math.min(1,surge));loadedCat?.simulate(speed,dt,playing,(reduced.matches?.18:1)*(1+.45*kick));
    const id=worldAt(speed).id;setWorld(id);const set=sets[id],flow=playing?flowSpeed(speed):0,dz=flow*dt*m*(1+.7*kick);
    for(const l of set.layers)l.update(dz);set.update?.(dt,flow,speed,clock);
    // 流線は背景より速く流し、長さは速さの桁で伸ばす。
    const lineSpeed=(18+70*Math.min(1,Math.log10(1+speed)/9))*m*(1+.8*kick),length=reduced.matches?0:.6+Math.min(1,Math.log10(1+speed)/9)*7+(speed/LIGHT_SPEED)*10;
    for(const b of lineBase){b.z+=dt*lineSpeed;if(b.z>12)b.z-=120;}
    lineCount=reduced.matches?0:speedLineTarget(id,speed);
    for(let i=0;i<lineCount;i++){const b=lineBase[i];linePositions.set([b.x,b.y,b.z,b.x,b.y,b.z+length],i*6);}
    dust.visible=!reduced.matches&&(id==='orbit'||id==='solar');if(dust.visible){for(let i=0;i<DUST;i++){const b=dustBase[i];b.z+=dt*lineSpeed*.55;if(b.z>12)b.z-=80;dustPositions.set([b.x,b.y,b.z],i*3);}dustGeometry.attributes.position.needsUpdate=true;}
    lineGeometry.attributes.position.needsUpdate=true;lineGeometry.setDrawRange(0,lineCount*2);speedLines.visible=lineCount>0;
  }
  function reset(){clock=0;loadedCat?.reset();lastImpacts=null;shakePx=0;}
  function draw(speed,dt,playing,mouth,impacts=lastImpacts){
    lastImpacts=impacts;lastDraw=[speed,0,playing,mouth,impacts];setWorld(worldAt(speed).id);applyColors(speed);
    if(loadedCat){const target=rig.headTurn-(mouth&&!reduced.matches?MEOW_LOOK_BACK:0),k=Math.min(1,Math.max(0,clock-turnClock)*7);headTurn+=(target-headTurn)*(reduced.matches?1:k);turnClock=clock;loadedCat.turnHead(headTurn);}
    const level=Math.min(1,Math.log10(1+speed)/9),ratio=speed/LIGHT_SPEED,light=catLightAppearance(level,ratio);
    // 光の猫
    // 縁の光：毛色の段階でも暖かい白で薄く付けて背景（牧場の道など）から猫を浮かせ、光の段階では白青に強める。
    if(loadedCat){loadedCat.whiten(light.whiten);loadedCat.setLight({rim:Math.max(.2,light.rim),emissive:.55*light.amount,tint:light.amount>0?0xcfeaff:0xfff1dc});}
    else{for(const [material,baseColor] of coatMaterials){material.color.copy(baseColor).lerp(new THREE.Color(0xffffff),light.whiten);material.emissive.setHex(0xbfe4ff);material.emissiveIntensity=.55*light.amount;}
      const running=playing&&speed>.01,pace=running?Math.min(24,5+level*22):0;for(let i=0;i<paws.length;i++)paws[i].rotation.x=Math.sin(clock*pace+(i===0||i===3?0:Math.PI))*.8*motion();
      body.scale.z=.85+level*.4;head.rotation.y=-.8;cat.position.y=.55+(running?Math.abs(Math.sin(clock*pace))*.08*motion():0);tail.rotation.x=-.65+level*.55;if(head)head.scale.y=mouth?1.08:1;}
    cat.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(cat,true),center=box.getCenter(new THREE.Vector3()),trailRoot=lightTrailLayout(box)[0].root;
    const trailLevel=Math.max(0,Math.min(1,(Math.log10(1+speed)-3)/2.5));trails.visible=trailLevel>0;
    for(const piece of trails.children){piece.position.set(trailRoot.x,trailRoot.y,trailRoot.z);const along=new THREE.Vector3(...TRAIL_DIRECTION).normalize(),toCamera=camera.position.clone().sub(piece.position),side=new THREE.Vector3().crossVectors(along,toCamera).normalize(),normal=new THREE.Vector3().crossVectors(side,along).normalize();piece.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side,normal,along));piece.scale.set(.45+.35*trailLevel+.6*light.amount,1,1.6+trailLevel*3.2+light.amount*4);const opacity=TRAIL_OPACITY_MAX*Math.min(1,.3+.7*trailLevel+light.amount);piece.material.opacity=opacity;piece.material.uniforms.opacity.value=Math.min(TRAIL_OPACITY_MAX,opacity);}
    glow.visible=light.amount>0;glow.material.opacity=Math.min(.75,light.amount*.8);glow.position.copy(center).addScaledVector(camera.getWorldDirection(point),2.2);glow.quaternion.copy(camera.quaternion);glow.scale.setScalar(4.2+light.amount*2.4);
    // 衝突の揺れ：最大2px・120ms。動きを減らす設定では揺らさない。
    placeCamera();shakePx=0;
    if(impacts?.shake&&!reduced.matches){const age=impacts.time-impacts.shake.time;if(age>=0&&age<.12){shakePx=2*(1-age/.12)*Math.abs(Math.sin(age*Math.PI*2*18+Math.PI/2));const unitsPerPx=2*camera.position.distanceTo(center)*Math.tan(camera.fov*Math.PI/360)/Math.max(1,canvas.clientHeight);right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);camera.position.addScaledVector(right,shakePx*unitsPerPx*.8).addScaledVector(up,shakePx*unitsPerPx*.6);camera.updateMatrixWorld();}}
    sets[worldId].frame?.(camera,cat,speed);rivals.update(speed,.65,clock);
    dome.position.copy(camera.position);stars.position.copy(camera.position);
    projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);
    for(const l of sets[worldId].layers)l.write(frustum);
    if(impacts){impactView.sync(impacts,speed,reduced.matches,frustum,camera);measureFaceCover(impacts);}
    renderer.render(scene,camera);
  }
  const toScreen=v=>{point.copy(v).project(camera);return {x:(point.x+1)/2,y:(1-point.y)/2};};
  // 猫だけ（光の尾・光の殻・後光を除く）の投影箱
  function catScreen(){
    cat.updateMatrixWorld(true);camera.updateMatrixWorld();
    const box=new THREE.Box3();cat.traverse(part=>{if(part.isMesh&&part!==loadedCat?.shell)box.expandByObject(part,true);});
    let left=Infinity,rightEdge=-Infinity,top=Infinity,bottom=-Infinity;
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=toScreen(new THREE.Vector3(x,y,z));left=Math.min(left,p.x);rightEdge=Math.max(rightEdge,p.x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);}
    const mid=(box.min.y+box.max.y)/2,headPoint=toScreen(new THREE.Vector3((box.min.x+box.max.x)/2,mid,box.min.z)),tailPoint=toScreen(new THREE.Vector3((box.min.x+box.max.x)/2,mid,box.max.z));
    // flowX：背景が流れる向き（+Z）が画面上で左へ進むなら負。
    const flowX=toScreen(new THREE.Vector3(0,mid,1.65)).x-toScreen(new THREE.Vector3(0,mid,.65)).x;
    return {x:(left+rightEdge)/2,y:(top+bottom)/2,w:rightEdge-left,h:bottom-top,head:headPoint,tail:tailPoint,spread:Math.abs(headPoint.x-tailPoint.x),camera:camera.position.toArray(),flowX,face:faceScreen()?.point??null};
  }
  function faceScreen(){
    if(loadedCat){let bone=null;loadedCat.model.traverse(o=>{if(o.isBone&&o.name==='head')bone=o;});if(!bone)return null;bone.updateWorldMatrix(true,false);const p=bone.getWorldPosition(new THREE.Vector3());return {point:toScreen(p),points:[toScreen(p)],facing:camera.position.clone().sub(p).normalize().z};}
    head.updateWorldMatrix(true,true);const c=head.getWorldPosition(new THREE.Vector3()),forward=new THREE.Vector3(0,0,-1).transformDirection(head.matrixWorld),toCamera=camera.position.clone().sub(c).normalize(),points=[[-.23,.04,-.29],[.23,.04,-.29],[0,-.09,-.42]].map(v=>toScreen(new THREE.Vector3(...v).applyMatrix4(head.matrixWorld)));
    return {point:toScreen(c),points,facing:forward.dot(toCamera)};
  }
  // 顔を隠している的・飛んでいる物の数。顔（頭の骨）より手前にあり、画面上で顔の円（画面高の4%）に重なるものだけ数える。
  let faceCover={overlaps:0,clearance:null};
  function measureFaceCover(impacts){
    faceCover={overlaps:0,clearance:null};if(!impacts||!loadedCat)return;let bone=null;loadedCat.model.traverse(o=>{if(o.isBone&&o.name==='head')bone=o;});if(!bone)return;
    const headWorld=bone.getWorldPosition(new THREE.Vector3()),face=toScreen(headWorld),faceDepth=headWorld.clone().applyMatrix4(camera.matrixWorldInverse).z,upVec=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1),floor=FLOAT_Y[impacts.world]??0;
    const items=[...impacts.queues.flat().map(o=>({p:new THREE.Vector3(o.x,floor+.4*o.size,CONTACT_Z-(o.s-impacts.distance)),r:.5*o.size})),...impacts.flying.filter(o=>o.world===impacts.world).map(o=>({p:new THREE.Vector3(o.x,o.y+.4*(o.size||1),o.z),r:.5*(o.size||1)*Math.min(1,(o.life-o.age)/.15)}))];
    let min=Infinity;
    for(const it of items){const view=it.p.clone().applyMatrix4(camera.matrixWorldInverse);if(view.z>-camera.near)continue;const s=toScreen(it.p),edge=toScreen(it.p.clone().addScaledVector(upVec,it.r)),rr=Math.hypot((edge.x-s.x)*camera.aspect,edge.y-s.y),d=Math.hypot((s.x-face.x)*camera.aspect,s.y-face.y)-rr;
      if(view.z>faceDepth){min=Math.min(min,d);if(d<.04)faceCover.overlaps++;}}
    faceCover.clearance=Number.isFinite(min)?+min.toFixed(4):null;
  }
  // 象徴の投影矩形（canvas左上原点・幅高1）。画面に入っていない象徴は返さない。
  function landmarks(){
    camera.updateMatrixWorld();const view=new THREE.Vector3(),out=[];
    for(const mark of sets[worldId]?.landmarks||[]){
      let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
      for(const p of mark.points(camera)){view.copy(p).applyMatrix4(camera.matrixWorldInverse);if(view.z>-camera.near)continue;const s=toScreen(p);x0=Math.min(x0,s.x);y0=Math.min(y0,s.y);x1=Math.max(x1,s.x);y1=Math.max(y1,s.y);}
      x0=Math.max(0,x0);y0=Math.max(0,y0);x1=Math.min(1,x1);y1=Math.min(1,y1);
      if(x1>x0&&y1>y0)out.push({id:mark.id,rect:{x:x0,y:y0,w:x1-x0,h:y1-y0}});
    }
    return out;
  }
  // 結果画面の「光の猫」：いまの描画から猫の周りを切り抜いて写す。
  // 枠は猫の投影箱が縦横どちらも収まる大きさ（頭から尾まで）。撮る瞬間だけ的と破片を描かない。
  function capture(target){
    try{const ctx=target.getContext('2d');if(!ctx||!renderer.domElement)return false;
      const shown=impactView.root.visible;impactView.root.visible=false;renderer.render(scene,camera);impactView.root.visible=shown;
      const s=catScreen(),source=renderer.domElement,W=source.width,H=source.height,aspect=target.width/target.height;
      let cw=Math.max(s.w*W,s.h*H*aspect)*1.3,ch=cw/aspect;if(cw>W){cw=W;ch=cw/aspect;}if(ch>H){ch=H;cw=ch*aspect;}
      const cx=Math.max(0,Math.min(W-cw,s.x*W-cw/2)),cy=Math.max(0,Math.min(H-ch,s.y*H-ch/2));
      ctx.fillStyle='#081021';ctx.fillRect(0,0,target.width,target.height);ctx.drawImage(source,cx,cy,cw,ch,0,0,target.width,target.height);
      renderer.render(scene,camera);return {x:cx/W,y:cy/H,w:cw/W,h:ch/H};}catch{return false;}
  }
  return {draw,simulate,reset,resize,catScreen,faceScreen,landmarks,capture,
    motion:()=>({shakePx,speedLineCount:lineCount}),
    trailBounds:()=>({box:new THREE.Box3().setFromObject(cat,true),root:trails.children[0].position.clone()}),
    stats:()=>({texturedTemplates,catModel:loadedCat?'glb':'procedural',catAnimation:loadedCat?{tracks:loadedCat.clip.tracks.length,time:loadedCat.action.time,rate:loadedCat.action.timeScale}:null,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,points:renderer.info.render.points,lines:renderer.info.render.lines,pixelRatio:renderer.getPixelRatio(),stars:(stars.visible?STAR_POINTS:0)+(dust.visible?DUST:0),pointsTotal:(stars.visible?STAR_POINTS:0)+(dust.visible?DUST:0)+(sets[worldId]?.points||0),speedLines:lineCount,rival:rivals.stats(),faceCover:{...faceCover},impact:impactView.stats()}),
    dispose(){loadedCat?.dispose();observer.disconnect();renderer.dispose();for(const piece of trails.children){piece.geometry.dispose();piece.material.dispose();}}};
}
