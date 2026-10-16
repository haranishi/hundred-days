import * as T from '../vendor/three.module.js';
import { STATIONS, TRACKS, trackPoints } from './network.js';
const mats = new Map();
const geo = {
  box: new T.BoxGeometry(1,1,1),
  cone: new T.ConeGeometry(1,1,7),
  cylinder: new T.CylinderGeometry(1,1,1,12),
  sphere: new T.SphereGeometry(1,12,8)
};
const roofShape = new T.Shape().moveTo(-.5,0).lineTo(.5,0).lineTo(0,.42).lineTo(-.5,0);
geo.roof = new T.ExtrudeGeometry(roofShape,{depth:1,bevelEnabled:false});
geo.roof.translate(0,0,-.5);
export function material(color, glow = false) {
  const key = color + (glow ? 'g' : '');
  if (!mats.has(key)) mats.set(key,glow
    ? new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:2.1,roughness:.45})
    : new T.MeshStandardMaterial({color,roughness:.75,metalness:.06}));
  return mats.get(key);
}
export function piece(parent, kind, color, x,y,z,sx,sy,sz, rotate = 0, glow = false) {
  const mesh=new T.Mesh(geo[kind],material(color,glow));
  mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.rotation.y=rotate;
  mesh.castShadow=!glow;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function random(seed=6831) {
  return () => { seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296; };
}
function house(parent,x,z,w,h,d,color,angle=0) {
  const g=new T.Group();g.position.set(x,.3,z);g.rotation.y=angle;parent.add(g);
  piece(g,'box',color,0,h/2,0,w,h,d);
  piece(g,'box','#d1b994',0,h*.17,d/2+.01,w*.92,.1,.04);
  piece(g,'roof','#293e47',0,h+.02,0,w*1.16,w*.9,d*1.14);
  piece(g,'box','#223d43',w*.27,h+.3,-d*.15,.16,.5,.18);
  piece(g,'box','#243e43',0,.26,d/2+.025,.23,.52,.025);
  for (let floor=.54; floor<h-.1;floor+=.43) {
    for (const side of [-1,1]) {
      piece(g,'box','#ffcd85',side*w*.28,floor,d/2+.018,.16,.21,.025,0,true);
      piece(g,'box','#f1bd76',w/2+.018,floor,side*d*.27,.025,.21,.15,0,true);
    }
  }
}
function tree(parent,x,z,size,rng) {
  const green=['#214f48','#2b6252','#3b6b55'][Math.floor(rng()*3)];
  piece(parent,'cylinder','#6b5543',x,.42,z,.055,.65,.055);
  for(let i=0;i<3;i++) piece(parent,'cone',green,x,.75+size*(.24+i*.27),z,size*(.44-i*.09),size*.8,size*(.44-i*.09),rng()*6);
}
function platform(parent,s) {
  const g=new T.Group();g.position.set(s.x,.3,s.z);parent.add(g);
  piece(g,'box','#9b9b83',0,.08,.72,3.3,.18,1.12);
  piece(g,'box','#b6a777',0,.19,.21,3.3,.045,.055);
  piece(g,'box','#283c41',0,.75,1.04,2.6,.1,1.15);
  for(const x of [-1.05,0,1.05]) piece(g,'box','#bca783',x,.44,1.26,.055,.7,.055);
  piece(g,'box','#ffce8d',0,.67,1.04,2.2,.025,.07,0,true);
  if(s.kind==='town') {
    house(parent,s.x,s.z+2.35,3.5,1.8,1.45,'#b7ac8b');
    const clock=new T.Mesh(new T.CylinderGeometry(.28,.28,.025,32),material('#eedab4'));
    clock.rotation.x=Math.PI/2;clock.position.set(s.x,1.65,s.z+3.1);parent.add(clock);
    piece(parent,'box','#203b41',s.x,1.74,s.z+3.12,.025,.18,.02);
    piece(parent,'box','#203b41',s.x+.06,1.65,s.z+3.12,.14,.025,.02);
    for(const dx of [-1.2,1.2]) piece(parent,'cylinder','#d0b990',s.x+dx,1.0,s.z+3.1,.08,1.4,.08);
  } else house(parent,s.x,s.z+1.75,1.6,1.05,1,'#b5b79b');
}
function lighthouse(parent) {
  const x=-16,z=4;
  piece(parent,'cylinder','#8b8d7c',x,.45,z,1,.35,1);
  piece(parent,'cylinder','#d5c8a4',x,1.7,z,.42,2.7,.42);
  piece(parent,'cylinder','#b96e56',x,2.35,z,.44,.3,.44);
  piece(parent,'cylinder','#233d42',x,3.18,z,.58,.1,.58);
  piece(parent,'cylinder','#ffcc7e',x,3.42,z,.32,.4,.32,0,true);
  piece(parent,'cone','#294a48',x,3.85,z,.63,.5,.63);
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4;
    piece(parent,'cylinder','#d8bf88',x+Math.sin(a)*.5,3.39,z+Math.cos(a)*.5,.025,.38,.025);
  }
  piece(parent,'box','#7e6f53',-14.1,.15,8.2,1.1,.18,5.4);
  for(let i=0;i<10;i++) piece(parent,'box','#a18c68',-14.1,.26,6+i*.5,1.2,.08,.04);
  for(const dz of [6.4,8.2,10]) for(const dx of [-.7,.7]) piece(parent,'cylinder','#4e5952',-14.1+dx,-.25,dz,.07,1.2,.07);
  // A small wooden boat alongside the dock.
  piece(parent,'sphere','#54716a',-12.2,-.03,9.2,.65,.28,1.6);
  piece(parent,'box','#b5aa83',-12.2,.23,9.3,.6,.5,.7);
  piece(parent,'box','#ffd18c',-12.2,.28,9.67,.3,.19,.03,0,true);
}
function terrain(parent) {
  const shape=new T.Shape();
  for(let i=0;i<=72;i++) {
    const a=i/72*Math.PI*2, r=1+.06*Math.sin(a*5)+.025*Math.cos(a*11);
    const x=Math.cos(a)*19.6*r,z=Math.sin(a)*11.7*r-.5;
    if(!i)shape.moveTo(x,z);else shape.lineTo(x,z);
  }
  const rock=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:1.6,bevelEnabled:true,bevelSize:.28,bevelThickness:.25,bevelSegments:2,steps:1}),material('#253f43'));
  rock.rotation.x=-Math.PI/2;rock.position.y=-1.34;rock.receiveShadow=true;parent.add(rock);
  const top=new T.Mesh(new T.ShapeGeometry(shape,50),material('#304e45'));
  top.rotation.x=-Math.PI/2;top.position.y=.28;top.receiveShadow=true;parent.add(top);
  // Mountain ridges sit beyond the railway, keeping the route unobscured.
  const rng=random(913);
  for(let i=0;i<13;i++) {
    const x=-1+i*1.3,z=-10-rng()*1.1,h=1.5+rng()*3.8;
    piece(parent,'cone',i%2?'#344f50':'#3d5856',x,h/2+.25,z,1.5+rng(),h,1.6+rng(),rng()*6);
    if(h>4) piece(parent,'cone','#8caca6',x,h*.9+.25,z,.42,h*.2,.48,rng()*6);
  }
}
export function createLandscape() {
  const root=new T.Group();terrain(root);
  const rng=random();
  for(const track of TRACKS) {
    const points=trackPoints(track);
    const curves=points.map(p=>new T.Vector3(p.x,.43,p.z));
    const path=new T.CatmullRomCurve3(curves);
    const bed=new T.Mesh(new T.TubeGeometry(path,90,.22,5,false),material('#79725a'));
    bed.receiveShadow=true;root.add(bed);
    for(const offset of [-.12,.12]) {
      const ps=points.map((p,i)=>{
        const before=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+1)];
        const angle=Math.atan2(after.x-before.x,after.z-before.z);
        return new T.Vector3(p.x+Math.cos(angle)*offset,.54,p.z-Math.sin(angle)*offset);
      });
      const line=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(ps),100,.025,5,false),material(track.color));
      root.add(line);
    }
    for(let i=0;i<points.length-1;i++) {
      const p=points[i],q=points[i+1],angle=Math.atan2(q.x-p.x,q.z-p.z);
      piece(root,'box','#b6a47b',p.x,.48,p.z,.57,.04,.055,angle);
    }
    // Telegraph poles and their fine overhead wire.
    for(let i=3;i<points.length;i+=11) {
      const p=points[i];
      piece(root,'cylinder','#5b6050',p.x+.6,1.05,p.z,.026,1.5,.026);
      piece(root,'box','#958b64',p.x+.6,1.8,p.z,.55,.04,.04);
    }
  }
  for(const s of STATIONS) platform(root,s);
  for(let i=0;i<90;i++) {
    const x=(rng()-.5)*31,z=(rng()-.5)*17;
    const cluster=Math.min(Math.hypot(x+5,z-3),Math.hypot(x+11,z-3));
    if(cluster>6.3||STATIONS.some(s=>Math.hypot(x-s.x,z-s.z)<3))continue;
    if(TRACKS.some(t=>trackPoints(t).some(p=>Math.hypot(x-p.x,z-p.z)<1.0)))continue;
    house(root,x,z,.65+rng()*.6,.6+rng()*1.2,.65+rng()*.45,['#879488','#a9a78a','#7b9990','#aaa08a'][i%4],rng()*.5-.25);
  }
  for(let i=0;i<290;i++) {
    const x=(rng()-.5)*33,z=(rng()-.5)*20;
    if(x*x/(17*17)+z*z/(10.3*10.3)>1||Math.hypot(x+7,z-3)<5.5)continue;
    if(STATIONS.some(s=>Math.hypot(x-s.x,z-s.z)<2.7))continue;
    if(TRACKS.some(t=>trackPoints(t).some(p=>Math.hypot(x-p.x,z-p.z)<.75)))continue;
    tree(root,x,z,.45+rng()*.6,rng);
  }
  lighthouse(root);
  // Onsen courtyard, torii and stone lanterns.
  house(root,14.7,-5.0,2.1,1.1,1.6,'#a8a07f');
  for(const x of [11.3,12.4]) piece(root,'cylinder','#aa6c48',x,1.1,-.7,.07,1.65,.07);
  piece(root,'box','#c28b5c',11.85,1.85,-.7,1.6,.1,.18);
  piece(root,'box','#3a5146',11.85,2,-.7,1.85,.1,.27);
  for(let i=0;i<19;i++) {
    const x=-17+rng()*34,z=-9+rng()*18;
    piece(root,'sphere','#647565',x,.38,z,.2+rng()*.25,.18,.3);
  }
  scenicDetails(root);
  optimizeStatic(root);
  return root;
}
export function createTrain(color) {
  const g=new T.Group();
  for(let car=0;car<2;car++) {
    const z=-car*1.07;
    piece(g,'box','#d3d5bd',0,.28,z,.45,.4,.92);
    piece(g,'box',color,0,.2,z,.48,.12,.94);
    piece(g,'box','#4e6463',0,.51,z,.47,.08,.92);
    for(const side of [-1,1]) for(let i=0;i<3;i++)
      piece(g,'box','#ffdb9b',side*.233,.36,z-.29+i*.29,.015,.12,.16,0,true);
    for(const wheelZ of [-.31,.31]) piece(g,'box','#1b3039',0,.06,z+wheelZ,.54,.1,.12);
  }
  piece(g,'box','#ffe5ac',0,.3,.47,.25,.09,.025,0,true);
  optimizeStatic(g);return g;
}
export function optimizeStatic(root) {
  root.updateMatrixWorld(true);
  const groups=new Map(),inv=root.matrixWorld.clone().invert();
  root.traverse(o=>{
    if(!o.isMesh||Array.isArray(o.material))return;
    const key=o.geometry.uuid+'|'+o.material.uuid+'|'+o.castShadow;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(o);
  });
  for(const meshes of groups.values()) {
    if(meshes.length<2)continue;
    const first=meshes[0],batch=new T.InstancedMesh(first.geometry,first.material,meshes.length);
    batch.castShadow=first.castShadow;batch.receiveShadow=true;
    for(let i=0;i<meshes.length;i++) {
      batch.setMatrixAt(i,new T.Matrix4().multiplyMatrices(inv,meshes[i].matrixWorld));
      meshes[i].removeFromParent();
    }
    batch.computeBoundingSphere();root.add(batch);
  }
}

function scenicDetails(root) {
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,'rgba(255,227,166,.9)');gradient.addColorStop(.18,'rgba(255,206,119,.3)');gradient.addColorStop(1,'rgba(255,206,119,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const texture=new T.CanvasTexture(canvas);
  const glowMat=new T.SpriteMaterial({map:texture,color:'#ffe6b0',transparent:true,opacity:.48,depthWrite:false,blending:T.AdditiveBlending});
  const poolMat=new T.MeshBasicMaterial({map:texture,color:'#eabe80',transparent:true,opacity:.22,depthWrite:false});
  const poolGeo=new T.PlaneGeometry(1,1);
  for(const [x,z] of [[-13,7.8],[-10,3.5],[-8,4],[-6,5.6],[-4,4.9],[-2,3.7],[-.8,2.2],[-4,-1.1],[2.4,-4.7],[5.2,7.8],[12.2,-.6],[14.6,-1.4],[-15.2,5.8]]) {
    piece(root,'cylinder','#39584f',x,1.07,z,.025,1.5,.025);
    piece(root,'box','#edce8c',x,1.86,z,.12,.17,.12,0,true);
    piece(root,'cone','#314a43',x,2,z,.17,.14,.17);
    const glow=new T.Sprite(glowMat);glow.position.set(x,1.86,z);glow.scale.setScalar(.9);root.add(glow);
    const pool=new T.Mesh(poolGeo,poolMat);pool.rotation.x=-Math.PI/2;pool.position.set(x,.31,z);pool.scale.setScalar(2.0);root.add(pool);
  }
  // Curved lanes tie the town together instead of scattering decorative boxes.
  for(const points of [
    [[-12.6,7.1],[-10,4.2],[-8.7,5],[-5.2,5.3],[-3.5,4.4]],
    [[-7.6,3.1],[-6.8,4.4],[-4.8,5.2],[-.7,3.3]],
    [[12.5,-1],[14.5,-.3],[15.2,-1.5],[14.7,-4.2]]
  ]) {
    const curve=new T.CatmullRomCurve3(points.map(([x,z])=>new T.Vector3(x,.305,z)));
    const pts=curve.getPoints(110);
    for(let i=0;i<pts.length-1;i+=2) {
      const a=pts[i],b=pts[i+1],angle=Math.atan2(b.x-a.x,b.z-a.z);
      piece(root,'box','#9c9673',a.x,.31,a.z,.42,.025,.16,angle);
    }
  }
  // Railway signal boxes, crossing arms and platform benches.
  for(const s of STATIONS) {
    house(root,s.x-1.8,s.z+1.6,.6,.62,.6,'#768b77');
    piece(root,'box','#9b7952',s.x+.8,.65,s.z+1.8,.55,.08,.23);
    for(const x of [.59,1.01]) piece(root,'box','#34483d',s.x+x,.46,s.z+1.8,.045,.32,.13);
    piece(root,'cylinder','#344b43',s.x+2,.88,s.z,.04,1.1,.04);
    piece(root,'box','#38534c',s.x+2,1.48,s.z,.15,.28,.12);
    piece(root,'sphere','#e8ba70',s.x+2,1.5,s.z+.07,.045,.045,.03,0,true);
  }
  // The onsen has a sheltered courtyard and a stone-edged pool.
  const pool=new T.Mesh(new T.CylinderGeometry(.8,.8,.07,32),new T.MeshStandardMaterial({color:'#65948a',roughness:.17,metalness:.24}));
  pool.position.set(15.2,.37,.15);root.add(pool);
  for(let i=0;i<14;i++) {
    const a=i/14*Math.PI*2;
    piece(root,'sphere','#8a9780',15.2+Math.cos(a)*.88,.4,.15+Math.sin(a)*.88,.16,.12,.14);
  }
  // Station signs and a small clock: details remain legible when zoomed.
  for(const s of STATIONS) {
    const c=document.createElement('canvas');c.width=512;c.height=128;
    const t=c.getContext('2d');t.fillStyle='#21473e';t.fillRect(0,0,512,128);
    t.strokeStyle='#d2bc85';t.lineWidth=7;t.strokeRect(8,8,496,112);
    t.fillStyle='#eee1bd';t.font='500 63px serif';t.textAlign='center';t.textBaseline='middle';t.fillText(s.name,256,66);
    const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;
    const sign=new T.Mesh(new T.PlaneGeometry(1.15,.29),new T.MeshBasicMaterial({map}));
    sign.position.set(s.x,1.25,s.z+1.64);root.add(sign);
  }
}
