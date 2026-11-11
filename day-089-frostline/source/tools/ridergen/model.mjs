import {addSkis,SKI_PARTS} from './ski.mjs';
import {buildCloth,loft} from './cloth.mjs';
import {createBindPose,createSkeletonState,getBindBones} from '../../src/render/ride/skeleton-math.js';
import {solid} from './sdf.mjs';
export const PARTS=[['jacket','#e77932',false],['pants','#38495c',false],['mittens','#202b36',false],
 ['gaiter','#27313b',false],['hood','#a94925',false],['helmet','#415769',true],['goggleFrame','#15232c',true],
 ['lens','#efb345',true],['goggleBand','#dd7334',true],['boots','#28333e',true],['bindings','#8b9da8',true],
 ['pack','#496454',true],['board','#29485b',true],['metalEdge','#becbd1',true],['trim','#f2c891',false],['straps','#262f34',true],['graphic','#ed7534',true],['boardBase','#eef1f2',true],...SKI_PARTS.map(([n,c])=>[n,c,true])]
 .map(([name,color,rigid],id)=>({id,name,color,rigid}));
const point=a=>[a.x,a.y,a.z];
export function buildModel({revision=34}={}) {
 const pose=createBindPose(),state=createSkeletonState(pose),bones=getBindBones(state),j=Object.fromEntries(Object.entries(pose.joints).map(([k,v])=>[k,point(v)]));
 const mesh={p:[],n:[],a:[],tri:[]},h=j.pelvis[1];
 buildCloth(mesh,j);
 function rigid(part,bone,c,r,power=4,segments=3,warp){solid(mesh,c,r,power,()=>({part,weights:[[bone,1]],wrinkle:0,flutter:0,ao:1,seam:1,tone:1}),warp,segments);}
 // Helmet shell, peak and actual vent depressions (not a painted product motif).
 const head=j.head;
 const helmetWarp=p=>{if(revision>=4&&p[1]>.055){const g=[-.055,0,.055].reduce((sum,z)=>sum+Math.exp(-(((p[2]-z)/.009)**2)),0)*.003;p[1]-=g;}// Extend the shell itself over each ear, rather than attaching round pads.
  if(p[1]<-.025){const ear=Math.exp(-((p[0]/.065)**4))*Math.abs(p[2]/.13)**3;p[1]-=.038*ear;}
  return p;};
 rigid(5,4,[head[0]-.005,head[1]+.005,0],[.130,.140,.130],2,7,helmetWarp);
 rigid(5,4,[.119,head[1]+.026,0],[.018,.007,.119],4,3);
 rigid(6,4,[.112,head[1]-.030,0],[.025,.055,.124],4,6,p=>[p[0]-.027*(p[2]/.124)**2,p[1],p[2]]);
 rigid(7,4,[.145,head[1]-.030,0],[.008,.042,.108],4,6,p=>[p[0]-.028*(p[2]/.108)**2,p[1],p[2]]);
 // Narrow webbing descends from the integral ear coverage and meets under the chin.
 for(const sg of [-1,1])loft(mesh,16,8,(t,a)=>({
  p:[.018+.025*Math.sin(t*Math.PI/2)+.003*Math.cos(a),head[1]-.09-.094*t,
   sg*(.108*(1-t)+.025*t)+.006*Math.sin(a)],
  a:{part:15,weights:[[4,1]],wrinkle:0,flutter:0,ao:1,seam:1,tone:1}
 }),{reverse:false});
 rigid(15,4,[-.132,head[1]-.02,0],[.008,.028,.012],4,3);
 // Wide goggle strap follows helmet sides and back.
 for(const sg of [-1,1])rigid(8,4,[-.015,head[1]-.012,sg*.124],[.115,.019,.012],4,5);
 rigid(8,4,[-.139,head[1]-.012,0],[.012,.019,.116],4,5);
 // Backpack: separate hard chest-attached object and visible shoulder webbing.
 rigid(11,2,[-.170,h+.085,0],[.030,.105,.139],4,6);
 rigid(11,2,[-.202,h+.065,0],[.012,.052,.102],4,3);
 for(const sg of [-1,1]){
  // Flat 4cm webbing bends over shoulders, 1cm thick, resting on cloth.
  loft(mesh,24,8,(t,a)=>{
   const angle=-.20+t*3.45,x=.127*Math.cos(angle),y=h+.27+.245*Math.sin(angle)-.11*Math.max(0,(t-.5)*2)**2;
   return {p:[x+.005*Math.cos(a)*Math.cos(angle),y+.005*Math.cos(a)*Math.sin(angle),sg*.148+.020*Math.sin(a)],
    a:{part:15,weights:[[2,1]],wrinkle:0,flutter:0,ao:1,seam:1,tone:1}};
  });
 }
 rigid(15,2,[.146,h+.32,0],[.005,.008,.15],4,3);
 rigid(10,2,[.154,h+.32,0],[.006,.014,.018],4,3);
 rigid(11,2,[-.172,h+.172,0],[.032,.018,.143],4,4);
 for(const y of [h+.020,h+.120])rigid(15,2,[-.204,y,0],[.006,.012,.14],4,3);
 // Feet are authored in the exact bind binding frame. Local toe is -Z.
 for(const [suffix,bone] of [['L',13],['R',16]]){
  const start=mesh.p.length,ankle=j['ankle'+suffix];
  function foot(part,c,r,power=4,seg=4,warp){rigid(part,bone,c,r,power,seg,warp);}
  foot(9,[0,-.035,-.035],[.063,.063,.143],3,5);foot(9,[0,.038,.025],[.057,.10,.063],3,4);
  foot(9,[0,-.088,-.03],[.067,.012,.146],4,4);
  foot(10,[0,-.105,-.015],[.076,.012,.154],4,4);
  foot(10,[0,.002,.121],[.065,.105,.010],4,5,p=>[p[0],p[1],p[2]-.020*(p[0]/.065)**2]);
  foot(10,[0,-.088,0],[.044,.008,.044],2,5);
  for(const z of [-.115,.025]){foot(15,[0,-.018,z],[.073,.023,.023],4,5,p=>[p[0],p[1]+.029*(1-(p[0]/.073)**2),p[2]]);foot(10,[.073,-.014,z],[.010,.014,.018],4,3);}
  if(revision>=3)for(let y=0;y<5;y++)foot(14,[0,-.004+y*.022,-.053+y*.004],[.043,.003,.009],4,2);
  const f=bones[bone].basis;
  for(let i=start;i<mesh.p.length;i++){
   const p=mesh.p[i],n=mesh.n[i];mesh.p[i]=ankle.map((v,k)=>v+f[k]*p[0]+f[3+k]*p[1]+f[6+k]*p[2]);
   mesh.n[i]=[0,1,2].map(k=>f[k]*n[0]+f[3+k]*n[1]+f[6+k]*n[2]);
  }
 }
 // Curved board uses a smooth superellipse, sidecut and raised tips.
 for(const [part,y,halfWidth,halfLength,thickness] of [[13,0,.130,.78,.004],[12,.002,.127,.777,.003],[17,-.004,.127,.777,.001]]){
  loft(mesh,40,8,(t,a)=>{
   let z=(t*2-1)*halfLength;const row=t*40;for(const target of [-.495,-.46,-.425,.425,.46,.495]){const at=Math.round((target/halfLength+1)*20);if(Math.abs(row-at)<.1)z=target;}
   const tip=Math.max(0,(Math.abs(z)-.55)/.23),end=Math.sqrt(Math.max(.001,1-tip*tip));
   const width=halfWidth*(.94+.06*(Math.min(Math.abs(z),.55)/.55)**2)*end;
   const x=width*Math.cos(a);z-=.7*x*Math.exp(-(((Math.abs(z)-.46)/.13)**4));
   return {p:[x,y+thickness*Math.sin(a)+.055*tip*tip,z],
    a:{part,weights:[[19,1]],wrinkle:0,flutter:0,ao:1,seam:1,tone:1}};
  },{reverse:false});
 }
 // Board graphics live in tone; retained part 16 is available for customization.
 for(let i=0;i<mesh.a.length;i++)if(mesh.a[i].part===12){const p=mesh.p[i];mesh.a[i].tone=Math.max(0,Math.min(1,.5+(Math.min(Math.abs(p[2]-.46+p[0]*.7),Math.abs(p[2]+.46+p[0]*.7))-.035)/.04));}
 addSkis(mesh,bones,j);
 return {mesh,bones,parts:PARTS.map(p=>p.id===0?{...p,secondaryColor:'#843d2b'}:p.id===12?{...p,secondaryColor:'#ed7534'}:p.id===18?{...p,secondaryColor:'#f2cc78'}:p),pose};
}
