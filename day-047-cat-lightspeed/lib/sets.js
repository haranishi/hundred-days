import * as THREE from '../vendor/three.js';
// 6世界の背景。1世界ぶんだけを表示し、近景は流れる速さ×1、遠景は×0.25前後で流して視差を作る。
// 象徴（PLAN-v3のLandmark）は、投影に使う点の集まりとして各世界が返す。

export function rng(seed){let s=seed>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
const color=new THREE.Color(),euler=new THREE.Euler(),quat=new THREE.Quaternion(),matrix=new THREE.Matrix4(),vec=new THREE.Vector3(),scale=new THREE.Vector3();
// 頂点色つきの形状を1つにまとめる（1ドローコール）。part=[形状,色,x,y,z,sx,sy,sz,rx,ry,rz]
export function mergeParts(parts){
  const positions=[],normals=[],colors=[];
  for(const [source,hex,x=0,y=0,z=0,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0] of parts){
    const g=source.index?source.toNonIndexed():source.clone();
    g.applyMatrix4(matrix.compose(vec.set(x,y,z),quat.setFromEuler(euler.set(rx,ry,rz)),scale.set(sx,sy,sz)));
    const p=g.attributes.position,n=g.attributes.normal;color.set(hex);
    for(let i=0;i<p.count;i++){positions.push(p.getX(i),p.getY(i),p.getZ(i));normals.push(n.getX(i),n.getY(i),n.getZ(i));colors.push(color.r,color.g,color.b);}
    g.dispose();
  }
  const out=new THREE.BufferGeometry();
  out.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));out.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));out.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  out.computeBoundingSphere();out.computeBoundingBox();return out;
}
const shapes={box:new THREE.BoxGeometry(1,1,1),ico:new THREE.IcosahedronGeometry(1,0),ico1:new THREE.IcosahedronGeometry(1,1),cyl:new THREE.CylinderGeometry(1,1,1,10),cone:new THREE.ConeGeometry(1,1,6),prism:new THREE.CylinderGeometry(1,1,1,3)};
export const lambert=()=>new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true});

// 流れる層：items の z を毎フレーム +dz×factor 進め、手前 near を越えたら span 奥へ戻す。
export function layer(geometry,material,items,{span=140,near=18,factor=1,cull=true}={}){
  const mesh=new THREE.InstancedMesh(geometry,material,Math.max(1,items.length));mesh.frustumCulled=false;mesh.count=0;
  if(!geometry.boundingSphere)geometry.computeBoundingSphere();
  const object=new THREE.Object3D(),sphere=new THREE.Sphere();
  const tinted=items.some(it=>it.color!==undefined);
  return {mesh,items,factor,
    update(dz){for(const it of items){it.z+=dz*factor;if(it.z>near)it.z-=span;}},
    write(frustum){
      let n=0;
      for(const it of items){
        object.position.set(it.x,it.y,it.z);object.rotation.set(it.rx||0,it.ry||0,it.rz||0);object.scale.set(it.s*(it.sx??1),it.s*(it.sy??1),it.s*(it.sz??1));object.updateMatrix();
        if(cull&&frustum){sphere.copy(geometry.boundingSphere).applyMatrix4(object.matrix);if(!frustum.intersectsSphere(sphere))continue;}
        mesh.setMatrixAt(n,object.matrix);if(tinted)mesh.setColorAt(n,color.set(it.color??0xffffff));n++;
      }
      mesh.count=n;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    },
    // 象徴の投影用：各要素の外接球
    spheres(){return items.map(it=>{object.position.set(it.x,it.y,it.z);object.rotation.set(it.rx||0,it.ry||0,it.rz||0);object.scale.set(it.s*(it.sx??1),it.s*(it.sy??1),it.s*(it.sz??1));object.updateMatrix();return sphere.clone().copy(geometry.boundingSphere).applyMatrix4(object.matrix);});}
  };
}
// Kenneyの同梱GLB（材質グループつき）を層にする
function kenney(models,id,items,options){const g=models[id];return layer(g,g.userData.material,items,options);}
function spread(count,{x,y=0,z0=12,span=140,s=1,jx=0,js=0,seed=1,ry=true,color}){const r=rng(seed);return Array.from({length:count},(_,i)=>({x:(Array.isArray(x)?x[0]+(x[1]-x[0])*r():x)+(r()-.5)*jx,y,z:z0-i*span/count-r()*span/count*.5,s:s*(1+(r()-.5)*js),ry:ry?r()*Math.PI*2:0,color}));}

// 空のドーム：上下で色を変える（世界ごとに色だけ差し替える）
export function skyDome(){
  const g=new THREE.SphereGeometry(300,24,12),c=[];const p=g.attributes.position;
  for(let i=0;i<p.count;i++){const t=Math.max(0,Math.min(1,(p.getY(i)/300+.15)/1.1));c.push(t,t,t);}
  g.setAttribute('shade',new THREE.Float32BufferAttribute(c,3));
  const material=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{top:{value:new THREE.Color()},bottom:{value:new THREE.Color()}},
    vertexShader:'attribute vec3 shade;varying float vShade;void main(){vShade=shade.x;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform vec3 top;uniform vec3 bottom;varying float vShade;void main(){gl_FragColor=vec4(mix(bottom,top,smoothstep(0.,1.,vShade)),1.);}'});
  const mesh=new THREE.Mesh(g,material);mesh.renderOrder=-10;mesh.frustumCulled=false;return mesh;
}

// ── 牧場：土の道＋木立2群（手前の林と奥の林）＋赤い納屋＋丘 ──
function farm(models){
  const group=new THREE.Group(),mat=lambert();
  const ground=new THREE.Mesh(mergeParts([[shapes.box,0x8db85f,0,-.5,-60,400,1,400],[shapes.box,0xd9c38c,0,.004,-60,3.2,1,400],[shapes.box,0xc4ad78,-1.75,.006,-60,.25,1,400],[shapes.box,0xc4ad78,1.75,.006,-60,.25,1,400]]),mat);
  ground.geometry.translate(0,0,0);group.add(ground);
  const hills=new THREE.Mesh(mergeParts([[shapes.ico1,0x6f9c52,-70,-14,-120,60,24,60],[shapes.ico1,0x7aa65a,-30,-18,-170,70,26,50],[shapes.ico1,0x5f8f4a,40,-20,-190,80,28,60],[shapes.ico1,0x86b061,-120,-12,-60,70,22,80]]),mat);group.add(hills);
  const ruts=layer(mergeParts([[shapes.box,0xb79d69,0,0,0,.09,.012,.9]]),mat,Array.from({length:40},(_,i)=>({x:(i%2?.45:-.45)+(i%5-2)*.05,y:.01,z:14-i*3.5,s:1})),{span:140});
  const grass=kenney(models,'grass',spread(22,{x:[1.95,2.5],z0:14,span:140,s:.4,js:.5,seed:3}),{span:140});
  const flowers=kenney(models,'flower',spread(18,{x:[-2.7,-3.8],z0:10,span:140,s:.55,js:.4,seed:5}),{span:140});
  const fence=kenney(models,'fence',Array.from({length:36},(_,i)=>({x:-2.35,y:0,z:14-i*3.9,s:1.9,ry:Math.PI/2})),{span:140});
  const nearTrees=kenney(models,'tree',spread(16,{x:[-4.2,-7.5],z0:12,span:140,s:3.2,js:.45,seed:7}),{span:140});
  const pines=kenney(models,'pine',spread(14,{x:[-5,-9],z0:8,span:140,s:3.8,js:.4,seed:9}),{span:140});
  const farTrees=kenney(models,'pine',spread(14,{x:[-16,-26],z0:10,span:200,s:5.8,js:.35,seed:11}),{span:200,near:24,factor:.3});
  const barnGeometry=mergeParts([[shapes.box,0xb8453a,0,1.6,0,4.2,3.2,5],[shapes.prism,0x6a3a2c,0,3.9,0,2.9,5.2,2.9,Math.PI/2,0,Math.PI/2],[shapes.box,0xf2eee4,2.11,1.3,0,.05,2.2,1.6],[shapes.cyl,0xd9d4c8,0,3,4.6,1.3,6,1.3],[shapes.cone,0x7d8a8f,0,6.6,4.6,1.45,1.3,1.45]]);
  const barn=layer(barnGeometry,mat,[{x:-13,y:0,z:-18,s:1,ry:.35},{x:-15,y:0,z:-98,s:1.1,ry:-.2}],{span:160,near:26,factor:.45});
  const layers=[ruts,grass,flowers,fence,nearTrees,pines,farTrees,barn];for(const l of layers)group.add(l.mesh);
  const road=[];for(let z=-70;z<=6;z+=4)for(const x of [-1.6,1.6])road.push(new THREE.Vector3(x,0,z));
  return {id:'farm',group,layers,colors:{top:0x7fb8dc,bottom:0xd7ecf2,fog:0xcfe5ea,ground:0x6f9a55},fog:[30,120],
    landmarks:[{id:'pasture',points:()=>[...road,...nearTrees.spheres().flatMap(s=>[s.center.clone().setY(0),s.center.clone().setY(s.radius*1.6)]),...pines.spheres().map(s=>s.center)]}]};
}
// ── 街：車道・白線・歩道＋手前の家並み＋奥の高層ビル群 ──
function city(models){
  const group=new THREE.Group(),mat=lambert();
  group.add(new THREE.Mesh(mergeParts([[shapes.box,0x3d474d,0,-.5,-60,400,1,400],[shapes.box,0x2f363b,0,.004,-60,4.4,1,400],[shapes.box,0x9aa3a3,-2.9,.06,-60,1.4,.12,400],[shapes.box,0x9aa3a3,2.9,.06,-60,1.4,.12,400],[shapes.box,0xe9e3cf,-2.15,.01,-60,.07,1,400],[shapes.box,0xe9e3cf,2.15,.01,-60,.07,1,400]]),mat));
  const dashes=layer(mergeParts([[shapes.box,0xf1ede0,0,0,0,.12,.014,1.1]]),mat,Array.from({length:40},(_,i)=>({x:0,y:.012,z:14-i*3.5,s:1})),{span:140});
  const lampGeometry=mergeParts([[shapes.cyl,0x6b7479,0,1.6,0,.05,3.2,.05],[shapes.box,0x6b7479,-.35,3.15,0,.7,.06,.08],[shapes.box,0xfff2c2,-.66,3.08,0,.22,.08,.16]]);
  const lamps=layer(lampGeometry,mat,Array.from({length:14},(_,i)=>({x:3.35,y:0,z:12-i*10,s:1})),{span:140});
  const lampsFar=layer(lampGeometry,mat,Array.from({length:14},(_,i)=>({x:-3.35,y:0,z:7-i*10,s:1,ry:Math.PI})),{span:140});
  // 通りの奥まで見えるので、Kenneyの家（1棟約1,200三角形）は2種×3棟に絞り、間を軽い家（約40三角形）で埋める。
  const r=rng(21),houses=['buildingA','buildingC'].map((id,k)=>kenney(models,id,Array.from({length:3},(_,i)=>({x:-6.6-r()*.8,y:0,z:10-(i*2+k)*23,s:6.2+r()*.8,ry:Math.PI/2})),{span:138}));
  const cottage=mergeParts([[shapes.box,0xe9e4da,0,1.4,0,3.6,2.8,4.2],[shapes.prism,0x3f8f6a,0,3.35,0,2.3,4.6,2.3,Math.PI/2,0,Math.PI/2],[shapes.box,0x6d8aa3,1.81,1.5,-.9,.04,.8,.9],[shapes.box,0x6d8aa3,1.81,1.5,.9,.04,.8,.9],[shapes.box,0x5b4636,1.81,.7,0,.04,1.4,.7]]);
  const cottages=layer(cottage,mat,Array.from({length:6},(_,i)=>({x:-6.9-r()*.6,y:0,z:-1.5-i*23,s:1+r()*.15,color:[0xffffff,0xf2e6d8,0xe3ecf2][i%3]})),{span:138});
  const towers=[];const rr=rng(33);
  for(let i=0;i<34;i++){const h=6+rr()*18,w=2.5+rr()*3,x=-20-rr()*26,z=-10-i*8.5,shade=[0x8d9aa6,0x7b8894,0xa3adb6,0x6f7c88][i%4];towers.push([shapes.box,shade,x,h/2,z,w,h,w]);for(const k of [.35,.7])towers.push([shapes.box,0xe8dca8,x+w/2+.02,h*k,z,.04,h*.16,w*.7]);}
  const skyline=layer(mergeParts(towers),mat,[{x:0,y:0,z:0,s:1},{x:0,y:0,z:-290,s:1}],{span:580,near:300,factor:.25});
  const layers=[dashes,lamps,lampsFar,...houses,cottages,skyline];for(const l of layers)group.add(l.mesh);
  const road=[];for(let z=-70;z<=6;z+=4)for(const x of [-2.2,2.2])road.push(new THREE.Vector3(x,0,z));
  return {id:'city',group,layers,colors:{top:0x8fb3c9,bottom:0xd3dde0,fog:0xc4d0d4,ground:0x59656b},fog:[34,130],
    landmarks:[{id:'street',points:()=>[...road,...houses.flatMap(h=>h.spheres().flatMap(s=>[s.center.clone().setY(0),s.center.clone().setY(s.radius)]))]}]};
}
// ── 空：高さの違う雲3群（下・横・上）と、はるか下の地面 ──
function sky(){
  // 雲は丸い陰影（flatShadingなし）。下は遠い雲海、横と上に1群ずつ。近すぎる雲は置かない。
  const group=new THREE.Group(),mat=new THREE.MeshLambertMaterial({vertexColors:true}),r=rng(41);
  const puff=[];for(let i=0;i<5;i++)puff.push([shapes.ico1,i===2?0xffffff:0xf2f5f8,(i-2)*1.15,Math.sin(i*1.9)*.3+(i===2?.35:0),Math.cos(i*2.3)*.45,1.05+r()*.45,.72+r()*.35,.95+r()*.5]);
  const cloud=mergeParts(puff);
  const low=layer(cloud,mat,Array.from({length:8},(_,i)=>({x:-40+r()*50,y:-19-r()*7,z:8-i*19,s:4.4+r()*2.6})),{span:154});
  const side=layer(cloud,mat,Array.from({length:5},(_,i)=>({x:-18-r()*12,y:-1+r()*5,z:4-i*30,s:2.8+r()*1.6})),{span:150,factor:.7});
  const high=layer(cloud,mat,Array.from({length:4},(_,i)=>({x:-26+r()*20,y:15+r()*5,z:-6-i*37,s:4.4+r()*2,color:0xeef3f8})),{span:150,near:36,factor:.4});
  const land=new THREE.Mesh(mergeParts(Array.from({length:60},(_,i)=>[shapes.box,[0x6f8f5a,0x839e63,0x5d7f55,0xa89e6c,0x6b8a73][i%5],((i%10)-5)*28,-60,-(Math.floor(i/10))*40+20,26,1,36])),mat);
  const layers=[low,side,high];for(const l of layers)group.add(l.mesh);group.add(land);
  let drift=0;
  return {id:'sky',group,layers,colors:{top:0x3f86c6,bottom:0xb9dcef,fog:0xa9cfe6,ground:0x6f8f5a},fog:[40,170],
    update(dt,flow){drift+=dt*flow*.06;land.position.z=(drift%40);},
    landmarks:[{id:'clouds',points:()=>[low,side,high].flatMap(l=>l.spheres().flatMap(s=>sphereSamples(s)))}]};
}
// ── 軌道：画面下を大きく占める地球の弧＋星 ──
const noise=`vec3 hash3(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(vec3(p.x*p.y*p.z,p.x+p.y*p.z,p.x*p.z+p.y));}
float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);float a=hash3(i).x,b=hash3(i+vec3(1,0,0)).x,c=hash3(i+vec3(0,1,0)).x,d=hash3(i+vec3(1,1,0)).x,e=hash3(i+vec3(0,0,1)).x,g=hash3(i+vec3(1,0,1)).x,h=hash3(i+vec3(0,1,1)).x,k=hash3(i+vec3(1,1,1)).x;return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y),mix(mix(e,g,f.x),mix(h,k,f.x),f.y),f.z);}
float fbm(vec3 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*n3(p);p*=2.03;a*=.5;}return s;}`;
export function earthMaterial(){
  return new THREE.ShaderMaterial({fog:false,uniforms:{time:{value:0},sun:{value:new THREE.Vector3(-.5,.6,.4).normalize()}},
    vertexShader:'varying vec3 vPos;varying vec3 vNormal;varying vec3 vView;void main(){vPos=position;vNormal=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vView=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
    fragmentShader:`uniform float time;uniform vec3 sun;varying vec3 vPos;varying vec3 vNormal;varying vec3 vView;${noise}
void main(){vec3 p=normalize(vPos);float land=fbm(p*2.6+vec3(1.7,0.,3.1));float cloud=fbm(p*5.+vec3(time*.01,0.,time*.006));
vec3 ocean=mix(vec3(.05,.20,.45),vec3(.10,.36,.62),fbm(p*7.));vec3 ground=mix(vec3(.30,.50,.24),vec3(.62,.56,.36),smoothstep(.55,.72,fbm(p*6.+4.)));
vec3 c=land>.53?ground:ocean;c=mix(c,vec3(.95),smoothstep(.55,.78,cloud)*.85);float ice=smoothstep(.82,.93,abs(p.y));c=mix(c,vec3(.93,.96,1.),ice);
vec3 n=normalize(vNormal);float light=clamp(dot(n,normalize((viewMatrix*vec4(sun,0.)).xyz))*.9+.35,.18,1.2);float rim=pow(1.-max(dot(n,vView),0.),3.);
gl_FragColor=vec4(c*light+vec3(.35,.65,1.)*rim*.9,1.);}`});
}
export function glowShell(radius,colorHex,power=3){
  return new THREE.Mesh(new THREE.SphereGeometry(radius,40,24),new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.BackSide,blending:THREE.AdditiveBlending,fog:false,uniforms:{tint:{value:new THREE.Color(colorHex)}},
    vertexShader:'varying vec3 vNormal;varying vec3 vView;void main(){vNormal=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vView=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
    fragmentShader:`uniform vec3 tint;varying vec3 vNormal;varying vec3 vView;void main(){float f=pow(clamp(1.-abs(dot(normalize(vNormal),vView)),0.,1.),${power.toFixed(1)});gl_FragColor=vec4(tint*f,f);}`}));
}
function orbit(){
  const group=new THREE.Group();
  const earth=new THREE.Mesh(new THREE.SphereGeometry(1,56,36),earthMaterial());earth.rotation.z=.35;group.add(earth);
  const air=glowShell(1.035,0x6fb8ff,2.2);group.add(air);
  const moon=new THREE.Mesh(new THREE.IcosahedronGeometry(1,2),new THREE.MeshLambertMaterial({color:0xcfd3d8,flatShading:true}));group.add(moon);
  let spin=0;
  return {id:'orbit',group,layers:[],colors:{top:0x02040c,bottom:0x0b1734,fog:0x0b1734,ground:0x33507a},fog:[400,900],stars:true,
    // 地球の大きさは画面幅の割合で決める（縦長・横長のどちらでも弧が下部の7割以上を占める）。速さとともに少し沈んで遠ざかる。
    frame(camera,cat,speed=0){const away=Math.max(0,Math.min(1,Math.log10(Math.max(1e4,speed))-4)),fovX=2*Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect),distance=90,radius=distance*Math.tan(fovX/2)*1.25*(1-.18*away);
      const forward=new THREE.Vector3();camera.getWorldDirection(forward);const center=camera.position.clone().addScaledVector(forward,distance).add(new THREE.Vector3(0,-radius-distance*Math.tan(camera.fov*Math.PI/360)*(.35+.12*away),0));
      earth.position.copy(center);earth.scale.setScalar(radius);air.position.copy(center);air.scale.setScalar(radius);
      moon.position.copy(camera.position).addScaledVector(forward,160).add(new THREE.Vector3(-distance*.9*Math.tan(fovX/2),distance*.55*Math.tan(camera.fov*Math.PI/360)*1.6,0));moon.scale.setScalar(radius*.035);},
    update(dt,flow,speed,clock){spin+=dt*(.03+flow*.004);earth.rotation.y=spin;earth.material.uniforms.time.value=clock;},
    landmarks:[{id:'earth',points:camera=>sphereSilhouette(earth.position,earth.scale.x,camera.position)}]};
}
// ── 太陽系：左上の太陽と、右上の環のある惑星 ──
export function sunMaterial(){
  return new THREE.ShaderMaterial({fog:false,uniforms:{time:{value:0}},vertexShader:'varying vec3 vPos;varying vec3 vNormal;varying vec3 vView;void main(){vPos=position;vNormal=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vView=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
    fragmentShader:`uniform float time;varying vec3 vPos;varying vec3 vNormal;varying vec3 vView;${noise}void main(){float g=fbm(normalize(vPos)*4.+vec3(time*.05));float limb=pow(max(dot(normalize(vNormal),vView),0.),.45);vec3 c=mix(vec3(1.,.55,.16),vec3(1.,.93,.62),g)*mix(.75,1.15,limb);gl_FragColor=vec4(c,1.);}`});
}
function bandedMaterial(){
  return new THREE.ShaderMaterial({fog:false,uniforms:{light:{value:new THREE.Vector3(-1,.3,.4).normalize()}},vertexShader:'varying vec3 vPos;varying vec3 vNormal;void main(){vPos=position;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform vec3 light;varying vec3 vPos;varying vec3 vNormal;${noise}void main(){float b=sin(normalize(vPos).y*18.+fbm(vPos*3.)*3.);vec3 c=mix(vec3(.85,.72,.50),vec3(.96,.88,.70),b*.5+.5);float l=clamp(dot(normalize(vNormal),normalize((viewMatrix*vec4(light,0.)).xyz))*.9+.25,.12,1.1);gl_FragColor=vec4(c*l,1.);}`});
}
export function radialTexture(size=64,inner=[255,255,255]){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const d=Math.hypot(x-size/2+.5,y-size/2+.5)/(size/2),a=Math.max(0,1-d);const i=(y*size+x)*4;data[i]=inner[0];data[i+1]=inner[1];data[i+2]=inner[2];data[i+3]=Math.round(255*a*a);}
  const t=new THREE.DataTexture(data,size,size);t.needsUpdate=true;t.colorSpace=THREE.SRGBColorSpace;return t;
}
function solar(){
  const group=new THREE.Group();
  const sun=new THREE.Mesh(new THREE.SphereGeometry(1,40,24),sunMaterial());group.add(sun);
  const corona=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:radialTexture(64,[255,196,110]),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));group.add(corona);
  const planet=new THREE.Group();const body=new THREE.Mesh(new THREE.SphereGeometry(1,32,20),bandedMaterial());planet.add(body);
  const ringGeometry=new THREE.RingGeometry(1.35,2.25,64,1),ringShade=[];const rp=ringGeometry.attributes.position;
  for(let i=0;i<rp.count;i++){const d=Math.hypot(rp.getX(i),rp.getY(i));const t=(d-1.35)/.9;const v=.55+.35*Math.sin(t*22)*.5+.2*(1-t);ringShade.push(v*.93,v*.84,v*.66);}
  ringGeometry.setAttribute('color',new THREE.Float32BufferAttribute(ringShade,3));
  const ring=new THREE.Mesh(ringGeometry,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,opacity:.92,fog:false,depthWrite:false}));ring.rotation.x=1.18;ring.rotation.y=.32;planet.add(ring);group.add(planet);
  let turn=0,slide=.15,sunSlide=0;
  return {id:'solar',enter(){slide=.15;sunSlide=0;},group,layers:[],colors:{top:0x03040a,bottom:0x0c1022,fog:0x0c1022,ground:0x4a4466},fog:[400,900],stars:true,
    frame(camera){const tanY=Math.tan(camera.fov*Math.PI/360),tanX=tanY*camera.aspect,right=new THREE.Vector3(),up=new THREE.Vector3(),forward=new THREE.Vector3();camera.getWorldDirection(forward);right.crossVectors(forward,camera.up).normalize();up.crossVectors(right,forward).normalize();
      const place=(object,distance,sx,sy,widthRatio)=>{object.position.copy(camera.position).addScaledVector(forward,distance).addScaledVector(right,sx*distance*tanX).addScaledVector(up,sy*distance*tanY);const r=distance*tanX*widthRatio;object.userData.radius=r;return r;};
      const sr=place(sun,220,-.5+sunSlide,.42,.23);sun.scale.setScalar(sr);corona.position.copy(sun.position);corona.scale.setScalar(sr*4.2);corona.quaternion.copy(camera.quaternion);
      const tall=camera.aspect<.8,pr=place(planet,180,(tall?.34:.5)+slide,tall?.6:.42,.075);planet.scale.setScalar(pr);planet.userData.body=pr;},
    // 惑星は約5秒で右から左へ通り過ぎる（入って1秒後・3秒後も画面内）。
    update(dt,flow,speed,clock){turn+=dt*.05;planet.rotation.y=turn*.3;sun.material.uniforms.time.value=clock;slide=Math.max(-.7,slide-dt*.11);sunSlide=Math.max(-.12,sunSlide-dt*.02);},
    landmarks:[{id:'sun',points:camera=>sphereSilhouette(sun.position,sun.scale.x,camera.position)},{id:'ringedPlanet',points:()=>{planet.updateMatrixWorld(true);const pts=[];for(let i=0;i<48;i++){const a=i/48*Math.PI*2;pts.push(new THREE.Vector3(Math.cos(a)*2.25,Math.sin(a)*2.25,0).applyMatrix4(ring.matrixWorld));}return [...pts,...sphereSilhouette(planet.position,planet.scale.x,null)];}}]};
}
// ── 星間：斜めに走る星の帯（天の川）と星雲 ──
function interstellar(){
  const group=new THREE.Group(),r=rng(77),count=56,positions=new Float32Array(count*3),colors=new Float32Array(count*3),seeds=[];
  for(let i=0;i<count;i++){const t=(r()-.5)*2.2,w=((r()+r()+r())/3-.5)*.5;seeds.push([t,w]);const b=.6+r()*.4;colors.set([b*.82,b*.9,b],i*3);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const stars=new THREE.Points(g,new THREE.PointsMaterial({size:3,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:.95,fog:false,depthWrite:false}));stars.frustumCulled=false;group.add(stars);
  const haze=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,uniforms:{time:{value:0},warm:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform float time;uniform float warm;varying vec2 vUv;${noise}void main(){vec2 q=vUv-.5;float d=abs(q.y*2.);float f=fbm(vec3(vUv*vec2(7.,2.5),time*.03));float a=(1.-smoothstep(.0,.7,d))*(.25+.75*f)*smoothstep(.5,.28,abs(q.x));vec3 c=mix(vec3(.45,.55,1.),vec3(.95,.7,1.),f*.6+warm*.2);gl_FragColor=vec4(c*a*.7,a*.7);}`}));group.add(haze);
  // 通り過ぎる明るい星（4個）：猫の奥側を前方から後ろへ一気に抜ける。星の帯・流線と合わせて点と線は180以下。
  const PASS=4,passPositions=new Float32Array(PASS*3),passBase=Array.from({length:PASS},(_,i)=>({x:-6-r()*6,y:1.5+r()*5,z:-40-i*55}));
  const passGeometry=new THREE.BufferGeometry();passGeometry.setAttribute('position',new THREE.BufferAttribute(passPositions,3));
  const passing=new THREE.Points(passGeometry,new THREE.PointsMaterial({map:radialTexture(64,[235,244,255]),size:1.6,sizeAttenuation:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));passing.frustumCulled=false;group.add(passing);
  const center=new THREE.Vector3(),along=new THREE.Vector3(),across=new THREE.Vector3();
  return {id:'interstellar',group,layers:[],points:count+PASS,colors:{top:0x02030a,bottom:0x070b1e,fog:0x070b1e,ground:0x3a4a70},fog:[500,1000],
    // 画面の左下→右上へ走る帯。視野の中に置き、縦長でも横長でも帯が見える。
    // 光速に近づくほど星の帯が進行方向（画面中央）へ寄って青白くなる（光行差のイメージ。演出で、正確な再現ではない）。
    frame(camera,cat,speed=0){const tanY=Math.tan(camera.fov*Math.PI/360),tanX=tanY*camera.aspect,forward=new THREE.Vector3(),right=new THREE.Vector3(),up=new THREE.Vector3();camera.getWorldDirection(forward);right.crossVectors(forward,camera.up).normalize();up.crossVectors(right,forward).normalize();
      const ratio=speed/1079252849,ab=Math.pow(Math.max(0,Math.min(1,(ratio-.3)/.7)),1.5)*.5,distance=320,halfW=distance*tanX*(1-ab),halfH=distance*tanY*(1-ab),angle=Math.atan2(halfH*1.2,halfW);stars.material.color.setRGB(1-ab*.35,1-ab*.12,1);
      center.copy(camera.position).addScaledVector(forward,distance).addScaledVector(up,distance*tanY*.18*(1-ab));along.copy(right).multiplyScalar(Math.cos(angle)).addScaledVector(up,Math.sin(angle)).normalize();across.crossVectors(forward,along).normalize();
      const length=Math.hypot(halfW,halfH)*2,width=Math.min(halfW,halfH)*.55;
      for(let i=0;i<count;i++){const [t,w]=seeds[i];const p=center.clone().addScaledVector(along,t*length/2).addScaledVector(across,w*width*2);positions.set(p.toArray(),i*3);}g.attributes.position.needsUpdate=true;
      haze.position.copy(center).addScaledVector(forward,20);haze.quaternion.copy(camera.quaternion);haze.rotateZ(angle);haze.scale.set(length*1.1,width*2.4,1);},
    update(dt,flow,speed,clock){haze.material.uniforms.time.value=clock;const v=30+50*Math.min(1,speed/1079252849);for(let i=0;i<PASS;i++){const b=passBase[i];b.z+=dt*v;if(b.z>18)b.z-=220;passPositions.set([b.x,b.y,b.z],i*3);}passGeometry.attributes.position.needsUpdate=true;},
    landmarks:[{id:'starfield',points:()=>{const out=[];for(let i=0;i<count;i++)out.push(new THREE.Vector3(positions[i*3],positions[i*3+1],positions[i*3+2]));return out;}}]};
}
export function sphereSamples(s,n=10){const out=[];for(let i=0;i<n;i++){const a=i/n*Math.PI*2;out.push(new THREE.Vector3(s.center.x+Math.cos(a)*s.radius,s.center.y+Math.sin(a)*s.radius*.6,s.center.z+Math.sin(a)*s.radius*.4));}return out;}
// 球の輪郭（カメラから見た接線の円）を点で返す。viewer が無ければ赤道の円で代用。
export function sphereSilhouette(center,radius,viewer,n=64){
  const out=[];let c=center.clone(),r=radius,axis=new THREE.Vector3(0,0,1);
  if(viewer){const d=viewer.clone().sub(center),len=d.length();if(len>radius){axis=d.clone().normalize();c=center.clone().addScaledVector(axis,radius*radius/len);r=radius*Math.sqrt(1-radius*radius/(len*len));}}
  const u=new THREE.Vector3(0,1,0).cross(axis);if(u.lengthSq()<1e-6)u.set(1,0,0);u.normalize();const v=axis.clone().cross(u).normalize();
  for(let i=0;i<n;i++){const a=i/n*Math.PI*2;out.push(c.clone().addScaledVector(u,Math.cos(a)*r).addScaledVector(v,Math.sin(a)*r));}
  return out;
}
export function createSets(models){return {farm:farm(models),city:city(models),sky:sky(),orbit:orbit(),solar:solar(),interstellar:interstellar()};}
