import {equipmentGear,skinBoneForGear} from '../../src/render/ride/gear-parts.js';
import {createPose,createPoseMemory,solvePose} from '../../src/render/ride/pose.js';
import {createState} from '../../src/sim/state.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {encodeModel} from './format.mjs';
import {readRiderData} from '../../src/render/ride/rider-data.js';
import {encodePNG} from '../worldgen/lib/png.js';
import {createSkeletonState,solveSkeleton} from '../../src/render/ride/skeleton-math.js';
import {sub,unit,cross,dot} from './sdf.mjs';
export function bendPose(pose){
 const p=structuredClone(pose),j=p.joints;
 for(const s of ['L','R'])for(const [a,b,c] of [['shoulder','elbow','hand'],['hip','knee','ankle']]){
  const root=j[a+s],mid=j[b+s],end=j[c+s],v=unit([mid.x-root.x,mid.y-root.y,mid.z-root.z]);
  const lower=[end.x-mid.x,end.y-mid.y,end.z-mid.z],along=dot(lower,v),d=unit(lower.map((x,k)=>x-v[k]*along)),length=Math.hypot(...lower);
  end.x=mid.x+d[0]*length;end.y=mid.y+d[1]*length;end.z=mid.z+d[2]*length;
 }
 return p;
}
export function skinMesh(model,pose){
 const matrices=solveSkeleton(pose,1,createSkeletonState(model.pose)),m=model.mesh;
 const skinBone=(a,b)=>skinBoneForGear(model.parts[a.part].name,b,pose.gear);
 const points=m.p.map((p,i)=>{const q=[0,0,0];for(const [bone,w]of m.a[i].weights)for(let k=0,b=skinBone(m.a[i],bone);k<3;k++)q[k]+=w*(matrices[b*16+k]*p[0]+matrices[b*16+4+k]*p[1]+matrices[b*16+8+k]*p[2]+matrices[b*16+12+k]);return q;});
 const normals=m.n.map((n,i)=>{const q=[0,0,0];for(const [bone,w]of m.a[i].weights)for(let k=0,b=skinBone(m.a[i],bone);k<3;k++)q[k]+=w*(matrices[b*16+k]*n[0]+matrices[b*16+4+k]*n[1]+matrices[b*16+8+k]*n[2]);return unit(q);});
 return {...m,p:points,n:normals,skinned:true,tri:m.tri.filter(t=>{const a=m.a[t[0]],g=equipmentGear(model.parts[a.part].name,a.weights[0][0]);return !g||g===(pose.gear==='ski'?'ski':'board');})};
}
// The runtime skeleton projects headFwd onto chestUp. Apply a synthetic pitch
// only in this coverage preview, so the collar is also checked at actual ±20°.
export function skinHeadTurn(model,pose,pitch){
 const mesh=skinMesh(model,pose),head=Object.values(pose.joints.head);
 const axis=unit(cross([0,1,0],Object.values(pose.headFwd))),angle=pitch*Math.PI/180;
 const rotate=v=>{const c=Math.cos(angle),s=Math.sin(angle),n=cross(axis,v),d=dot(axis,v);return v.map((x,k)=>x*c+n[k]*s+axis[k]*d*(1-c));};
 for(let i=0;i<mesh.p.length;i++)if(mesh.a[i].weights.some(([bone,w])=>bone===4&&w>.99)){
  mesh.p[i]=rotate(sub(mesh.p[i],head)).map((x,k)=>x+head[k]);mesh.n[i]=rotate(mesh.n[i]);
 }
 return mesh;
}
export async function render(mesh,parts,path,view,width=720,height=1000,{center=[0,.87,0],scale=450,perspectiveDistance=0}={}){
 const dir=unit(view),right=unit(cross([0,1,0],dir)),up=cross(dir,right);
 const rgba=new Uint8Array(width*height*4),depth=new Float64Array(width*height).fill(-Infinity);
 for(let i=0;i<width*height;i++){const y=Math.floor(i/width);rgba.set([219-y*.022,229-y*.016,235-y*.008,255],i*4);}
 const project=p=>{const v=sub(p,center);const z=dot(v,dir),s=perspectiveDistance?scale*perspectiveDistance/(perspectiveDistance-z):scale;return [width/2+dot(v,right)*s,height/2-dot(v,up)*s,z];};
 const projected=mesh.p.map(project),light=unit([.55,.8,.65]);
 for(const tri of mesh.tri){
  if(!mesh.skinned && equipmentGear(parts[mesh.a[tri[0]].part].name,mesh.a[tri[0]].weights[0][0])==='ski')continue;
  const [a,b,c]=tri.map(i=>projected[i]),area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(Math.abs(area)<1e-9)continue;
  const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),x1=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c[0]))),y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),y1=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c[1])));
  const colors=tri.map(id=>{const hex=parts[mesh.a[id].part].color;return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));});
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const px=x+.5,py=y+.5,w1=((px-a[0])*(c[1]-a[1])-(py-a[1])*(c[0]-a[0]))/area,w2=((b[0]-a[0])*(py-a[1])-(b[1]-a[1])*(px-a[0]))/area,w0=1-w1-w2;
   if(w0<0||w1<0||w2<0)continue;const z=w0*a[2]+w1*b[2]+w2*c[2],id=y*width+x;if(z<=depth[id])continue;depth[id]=z;
   const weights=[w0,w1,w2],n=[0,0,0];let seam=0,ao=0,tone=0;
   for(let k=0;k<3;k++){for(let d=0;d<3;d++)n[d]+=mesh.n[tri[k]][d]*weights[k];seam+=mesh.a[tri[k]].seam*weights[k];ao+=mesh.a[tri[k]].ao*weights[k];tone+=mesh.a[tri[k]].tone*weights[k];}
   const part=parts[mesh.a[tri[0]].part],secondary=part.secondaryColor;
   const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
   const line=1-smooth(.04,.06,seam),blend=smooth(127/255,129/255,tone);
   const shade=(.40+.60*Math.max(0,dot(unit(n),light)))*(.55+.45*ao)*(1-.50*line);
   const c2=secondary?[1,3,5].map(i=>parseInt(secondary.slice(i,i+2),16)):null;
   rgba.set([0,1,2].map(k=>{let color=colors[0][k]*w0+colors[1][k]*w1+colors[2][k]*w2;if(c2)color=c2[k]+(color-c2[k])*blend;return Math.min(255,color*shade);}).concat(255),id*4);
  }
 }
 await writeFile(path,encodePNG(width,height,rgba));
}
export function exportedModel(model){
 const {bin,meta}=encodeModel(model),d=readRiderData(bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.byteLength),meta);
 return {...model,mesh:{p:Array.from({length:meta.vertexCount},(_,i)=>Array.from(d.position.subarray(i*3,i*3+3))),
 n:Array.from({length:meta.vertexCount},(_,i)=>Array.from(d.normal.subarray(i*3,i*3+3))),
 a:model.mesh.a.map((a,i)=>({...a,seam:d.seam[i],tone:d.tone[i],wrinkle:d.wrinkle[i],flutter:d.flutter[i],ao:d.ao[i],weights:Array.from({length:4},(_,k)=>[d.skinIndex[i*4+k],d.skinWeight[i*4+k]])})),tri:model.mesh.tri}};
}
export async function renderViews(model,dir,prefix){
 model=exportedModel(model);
 await mkdir(dir,{recursive:true});
 for(const [name,view]of [['front',[1,.08,0]],['side',[0,.08,1]],['back',[-1,.08,0]],['oblique',[1,.22,1]]])await render(model.mesh,model.parts,`${dir}/${prefix}-${name}.png`,view);
 await render(model.mesh,model.parts,`${dir}/${prefix}-head-chest.png`,[1,.13,.55],720,900,{center:[.02,1.4,0],scale:1000});
 await render(model.mesh,model.parts,`${dir}/${prefix}-feet.png`,[.8,.55,1],900,650,{center:[0,.16,0],scale:950});
 for(const [name,pose]of realPoses())await render(skinMesh(model,pose),model.parts,`${dir}/${prefix}-pose-${name}.png`,[1,.22,1]);
 for(const [name,pose]of realPoses().filter(([n])=>['crouch','air-ready','deep-toe','deep-heel'].includes(n))){
  const mesh=skinMesh(model,pose);
  // Camera axes follow the torso so front/back retain their meaning in a carve.
  const f=Object.values(pose.chestFwd),u=Object.values(pose.chestUp);
  for(const [view,direction]of [['front',f.map((v,k)=>v+u[k]*.08)],['back',f.map((v,k)=>-v+u[k]*.08)],['below',f.map((v,k)=>v*.8-u[k]*.7)],['below-back',f.map((v,k)=>-v*.8-u[k]*.7)]])
   await render(mesh,model.parts,`${dir}/${prefix}-${name}-${view}.png`,direction,640,800,{center:Object.values(pose.joints.pelvis).map((v,k)=>v+u[k]*.10),scale:460});
 }
 for(const [name,pose]of realPoses().filter(([n])=>['stand','crouch','air-ready','deep-toe','deep-heel'].includes(n))){
  const f=Object.values(pose.chestFwd),u=Object.values(pose.chestUp),mesh=skinMesh(model,pose);
  for(const [camera,view]of [['back-high',f.map((v,k)=>-v+u[k]*.8)],['medium-back',f.map((v,k)=>-v+u[k]*.25)],['medium-front',f.map((v,k)=>v+u[k]*.25)]])
   await render(mesh,model.parts,`${dir}/${prefix}-${name}-${camera}.png`,view,1000,760,{center:Object.values(pose.joints.pelvis).map((v,k)=>v+u[k]*.1),scale:camera.startsWith('medium')?160:380});
 }
 for(const [name,pose]of realPoses().filter(([n])=>['stand','deep-heel','crouch'].includes(n))){
  const view=name==='stand'?[0,Math.tan(Math.PI/12),1]:name==='deep-heel'?[0,.08,1]:[-1,.8,.5];
  await render(skinMesh(model,pose),model.parts,`${dir}/${prefix}-required-${name}.png`,view,1000,760,{center:[0,.78,0],scale:name==='stand'?270:340,perspectiveDistance:name==='stand'?3:0});
 }
 await captureViews(model,dir,prefix);
 for(const [name,pose]of shoulderRaises(model.pose))await render(skinMesh(model,pose),model.parts,dir+'/'+prefix+'-shoulder-'+name+'.png',[1,.15,1],1000,760,{center:[0,1.3,0],scale:320});
 for(const yaw of [-60,60])for(const pitch of [-20,20]){
  const pose=structuredClone(model.pose),y=yaw*Math.PI/180,p=pitch*Math.PI/180;
  pose.headFwd={x:Math.cos(y)*Math.cos(p),y:Math.sin(p),z:Math.sin(y)*Math.cos(p)};
  await render(skinHeadTurn(model,pose,pitch),model.parts,`${dir}/${prefix}-head-yaw${yaw}-pitch${pitch}-back-high.png`,[-1,.8,.6],1000,760,{center:[0,1.50,0],scale:1050});
 }
 await render(skinMesh(model,bendPose(model.pose)),model.parts,`${dir}/${prefix}-bend90.png`,[1,.22,1]);
}

export function realPoses(){
 return [['stand',{}],['toe',{mode:'carve',edge:.8}],['heel',{mode:'carve',edge:-.8}],['crouch',{crouch:1}],['brake',{mode:'skid',crouch:.3,edge:.3}],['grab',{mode:'air',crouch:1,air:{grab:1,grabTime:.5},pos:{x:0,y:2,z:0}}],['air-ready',{mode:'air',crouch:.65,air:{grab:0,spin:.8},pos:{x:0,y:2,z:0}}],['deep-toe',{mode:'carve',edge:.95}],['deep-heel',{mode:'carve',edge:-.95}]].map(([name,overrides])=>{
  const state=createState();Object.assign(state,{speed:15,vel:{x:0,y:0,z:-15},leg:.78},overrides);
  const pose=createPose();solvePose({state,dt:1/60,events:[],heightAt:()=>0},createPoseMemory(),pose);
  // Rebase airborne world height solely for framing the image.
  const y=pose.board.pos.y;if(y){pose.board.pos.y-=y;for(const j of Object.values(pose.joints))j.y-=y;}
  return [name,pose];
 });
}
// flipped＝骨で動かした後に、表と裏が入れ替わった面の数。area＝その広さ（m²）。joints＝どの骨のあいだ（重みの大きい 2 本）で起きたか。
// 曲げた関節の内側（脇・ひじの内側）では、面が折り重なって裏返る。外からは見えない所なので、広さと場所で見分けられるようにしてある
export function inversionStats(model,pose){
 const m=skinMesh(model,pose),mat=solveSkeleton(pose,1,createSkeletonState(model.pose));let flipped=0,ignored=0,area=0;const parts={},joints={};
 for(const t of m.tri){
  const n=cross(sub(m.p[t[1]],m.p[t[0]]),sub(m.p[t[2]],m.p[t[0]])),bn=cross(sub(model.mesh.p[t[1]],model.mesh.p[t[0]]),sub(model.mesh.p[t[2]],model.mesh.p[t[0]]));
  if(Math.hypot(...bn)<1e-10||Math.hypot(...n)<1e-10){ignored++;continue;}
  // Transport the bind face normal, independently of smoothed shading normals.
  const expected=[0,0,0],weight=new Map();for(const id of t)for(const[bone,w]of model.mesh.a[id].weights){const b=skinBoneForGear(model.parts[model.mesh.a[id].part].name,bone,pose.gear);weight.set(b,(weight.get(b)||0)+w);for(let k=0;k<3;k++)expected[k]+=w*(mat[b*16+k]*bn[0]+mat[b*16+4+k]*bn[1]+mat[b*16+8+k]*bn[2]);}
  if(dot(n,expected)<-1e-16){
   flipped++;area+=Math.hypot(...n)/2;const part=model.parts[model.mesh.a[t[0]].part].name;parts[part]=(parts[part]||0)+1;
   const joint=[...weight].sort((a,b)=>b[1]-a[1]).slice(0,2).map(v=>model.bones[v[0]].name).sort().join('+');joints[joint]=(joints[joint]||0)+1;
  }
 }
 return {flipped,ignored,parts,area,joints};
}

// Orbits copied from rider-capture.mjs POSES. Poses are solver fixtures, not a
// re-enactment of the game simulation; the supplied game PNGs remain the reference.
export const CAPTURE_VIEWS=[
 ['2-toe-2','toe',3.2,215,10],['4-tuck-1','crouch',3,40,12],['4-tuck-2','crouch',3,190,6],
 ['3-heel-1','heel',3.2,330,12],['3-heel-2','heel',3.2,150,10],['5-brake-1','brake',3.4,20,14],
 ['6-air-grab-1','grab',3.2,60,6],['6-air-grab-2','grab',3.2,200,4],['7-air-spin-1','air-ready',3.4,20,10],['1-stand-3','stand',2.6,110,14]];
export async function captureViews(model,dir,prefix){
 const poses=new Map(realPoses());
 for(const [id,name,distance,az,el]of CAPTURE_VIEWS){
  const pose=poses.get(name),a=az*Math.PI/180,e=el*Math.PI/180;
  const view=[-Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e)];
  const center=Object.values(pose.joints.pelvis).map((v,k)=>v);
  await render(skinMesh(model,pose),model.parts,dir+'/'+prefix+'-capture-'+id+'.png',view,1000,760,
   {center,scale:760/(2*distance*Math.tan(20*Math.PI/180)),perspectiveDistance:distance});
 }
}
export function shoulderRaises(bind){
 return [['forward',[1,0,0]],['lateral',null],['overhead',[0,1,0]]].map(([name,direction])=>{
  const p=structuredClone(bind);
  for(const [side,sign]of [['L',-1],['R',1]]){
   const a=p.joints['shoulder'+side],d=direction||[0,0,sign],bend=name==='forward'?[0,-1,0]:[1,0,0];
   const elbow=p.joints['elbow'+side],hand=p.joints['hand'+side];
   for(let k=0;k<3;k++){
    const axis=['x','y','z'][k];elbow[axis]=a[axis]+d[k]*.29;
    hand[axis]=elbow[axis]+(d[k]*Math.cos(Math.PI/6)+bend[k]*Math.sin(Math.PI/6))*.27;
   }
  }
  return [name,p];
 });
}
