import {spline,clamp} from '../../../src/world/surface-math.js';
import {smooth01,zoneId} from './features.js';
import {makeDrops} from './drops.js';

const rad=Math.PI/180;
export const JUMP_SPECS={S:{speed:[10,14],air:[.7,1],pitch:.03,run:22,landing:26},M:{speed:[13,18],air:[1.1,1.5],pitch:.18,run:28,landing:38},L:{speed:[16,22],air:[1.6,2.1],pitch:.35,run:34,landing:50},XL:{speed:[20,26],air:[2.3,3],pitch:.62,run:42,landing:70}};
export function local(f,x,z){const dx=x-f.x,dz=z-f.z;return {s:dx*Math.sin(f.heading)-dz*Math.cos(f.heading),t:dx*Math.cos(f.heading)+dz*Math.sin(f.heading)};}
export function hermite(x,a,b,ha,hb,ma,mb){const t=clamp((x-a)/(b-a),0,1),l=b-a;return (2*t**3-3*t*t+1)*ha+(t**3-2*t*t+t)*l*ma+(-2*t**3+3*t*t)*hb+(t**3-t*t)*l*mb;}
export function jumpProfile(s,f){
  const p=f.profile,q=Math.tan(32*rad),v=((p.designSpeed??f.speed)[0]+(p.designSpeed??f.speed)[1])/2/Math.sqrt(1+p.pitch*p.pitch),T=(f.air[0]+f.air[1])/2;
  const land=v*T+3,y=p.pitch*(land-3)-4.905*T*T+3*p.pitch+.4+(f.size==='L'?.8:0),knuckle=Math.max(8,land*.85),ky=y+q*(land-knuckle);
  const entryGrade=p.entryGrade??.14,entry=-(p.pitch-entryGrade)*p.run/2;
  if(s< -p.run)return entry-entryGrade*(s+p.run);
  if(s<=0)return hermite(s,-p.run,0,entry,0,-entryGrade,p.pitch);
  if(s<knuckle)return hermite(s,0,knuckle,0,ky,p.pitch,-q);
  if(s<land+24)return y-q*(s-land);
  const end=land+70,ey=-.14*end;
  return s<end?hermite(s,land+24,end,y-q*24,ey,-q,-.14):ey-.14*(s-end);
}
function visit(c,x,z,r,fn){const n=c.grid,h=c.size/2;for(let j=Math.max(1,Math.floor((z-r+h)/c.cell));j<=Math.min(n-2,Math.ceil((z+r+h)/c.cell));j++)for(let i=Math.max(1,Math.floor((x-r+h)/c.cell));i<=Math.min(n-2,Math.ceil((x+r+h)/c.cell));i++)fn(j*n+i,(i+.5)*c.cell-h,(j+.5)*c.cell-h);}
export function authorFeatures(buffers,c){
  const read=(x,z)=>spline(buffers.height,c.grid,(x+c.size/2)/c.cell-.5,(z+c.size/2)/c.cell-.5),features=[];
  const addJump=(id,name,size,x,z,practice=false)=>{
    const spec=JUMP_SPECS[size],f={id,kind:'kicker',size,name,x,z,y:read(x,z),heading:Math.PI,length:spec.run+spec.landing+70,width:24,...spec,profile:{pitch:spec.pitch,run:spec.run}};
    if(practice){f.speed=[12.6,13];f.air=[.4,.6];f.profile={pitch:-.1,run:18,entryGrade:.015,designSpeed:[7,9]};f.width=18;}
    f.approach={x,z:z-(practice?35:45),heading:f.heading,speed:(f.speed[0]+f.speed[1])/2};features.push(f);
  };
  // Four independent cuts on one downhill line. The transverse blend preserves the surrounding mountain.
  for(const [i,size,z] of [[1,'S',250],[2,'M',420],[3,'M',620],[4,'L',850]])addJump(`jv-${i}`,['','小さい台','中の台・上','中の台・下','大きい台'][i],size,1400,z);
  addJump('bigair-1','特大の台','XL',950,-1000);
  addJump('practice-1','初めの小さい台','S',1665,1985,true);addJump('practice-2','次の小さい台','S',1735,1985,true);
  // Shared park grade supplies continuous approaches rather than separate piles of snow.
  const parkY=read(1400,250);
  const integral=(x,start,width)=>{const t=(x-start)/width;return t<=0?0:t>=1?x-start-width/2:width*(t**3-.5*t**4);};
  const parkHeight=z=>parkY-.14*(z-250)-.08*integral(z,320,80)-.05*integral(z,680,80);
  visit(c,1400,530,620,(k,x,z)=>{const w=(1-smooth01((Math.abs(x-1400)-28)/38))*(smooth01((z-120)/60))*(1-smooth01((z-1030)/100));if(w>0)buffers.height[k]=buffers.height[k]*(1-w)+parkHeight(z)*w;});
  for(const f of features){
    f.y=read(f.x,f.z);
    if(f.id.startsWith('jv'))f.y=parkHeight(f.z);
    const end=((f.profile.designSpeed??f.speed)[1]*f.air[1])+75;
    visit(c,f.x,f.z,Math.max(end,90)+65,(k,x,z)=>{if(Math.abs(x-1700)<=100&&z>=1590&&z<=1890)return;const {s,t}=local(f,x,z),w=(1-smooth01((Math.abs(t)-f.width/2)/28))*smooth01((s+80)/25)*(1-smooth01((s-end)/40));if(w>0)buffers.height[k]=buffers.height[k]*(1-w)+(f.y+jumpProfile(s,f))*w;});
  }
  for(let i=0;i<8;i++){
    const x=[-650,-1020,-410,-850,-520,-1130,-780,-300][i],z=[-1150,-980,-1320,-720,-560,-420,-300,-1050][i],h=[4.9,4.9,4.7,5,6.5,7.5,8.5,12][i];
    const f={id:`cliff-${i+1}`,name:`岩の段${i+1}`,kind:'cliff',height:h,x,z,y:read(x,z),heading:[-.5,-.7,.1,-.35,-.8,-.55,-1.1,.35][i],length:130,width:28,speed:[12,20],air:[0,10],approach:{x:x-Math.sin([-.5,-.7,.1,-.35,-.8,-.55,-1.1,.35][i])*45,z:z+Math.cos([-.5,-.7,.1,-.35,-.8,-.55,-1.1,.35][i])*45,heading:[-.5,-.7,.1,-.35,-.8,-.55,-1.1,.35][i],speed:16}};features.push(f);
    visit(c,x,z,150,(k,xx,zz)=>{const {s,t}=local(f,xx,zz),w=(1-smooth01((Math.abs(t)-14)/35))*smooth01((s+85)/30)*(1-smooth01((s-100)/35));
      let profile=s<=-12?6-.08*(s+12):s<=-.3?-.5*s:s<.3?.15-(h+.384)*smooth01((s+.3)/.6): -h-.234-Math.tan(38*rad)*(s-.3);
      if(w>0)buffers.height[k]=buffers.height[k]*(1-w)+(f.y+profile)*w;
    });
  }
  // Remove tile perturbation only inside authored snow routes. Rock faces remain exposed.
  for(let j=0;j<c.maskGrid;j++)for(let i=0;i<c.maskGrid;i++){
    const x=(i+.5)*c.cell*2-c.size/2,z=(j+.5)*c.cell*2-c.size/2,k=(j*c.maskGrid+i)*4;
    for(const f of features){const {s,t}=local(f,x,z);if(s>=-90&&s<=f.length&&Math.abs(t)<f.width/2+15){buffers.masksB[k]=0;buffers.masksB[k+1]=0;if(f.kind==='cliff'&&s>-3&&s<3){buffers.masksA[k+3]=255;buffers.masksA[k]=0;}else{buffers.masksA[k]=90;buffers.masksA[k+1]=40;buffers.masksA[k+2]=15;buffers.masksA[k+3]=0;}break;}}
  }
  // The published cliff marker belongs on the upper snow shelf, not halfway down the smoothed face.
  // The baked heightfield remains unchanged; a 6m setback stays above the B-spline-rounded edge.
  for(const f of features)if(f.kind==='cliff'){f.x-=Math.sin(f.heading)*6;f.z+=Math.cos(f.heading)*6;f.y=read(f.x,f.z);}
  return features;
}
export function featureDrops(c,b,existing,features){
  const kinds=['practice','open','open','gully','ridge','plateau','forest'];
  const drops=existing.map((d,i)=>({...d,kind:kinds[i],hidden:false,about:['上の平面から小さい凸へ','広い雪面を東へ滑る','火口の棚から開口へ','西へ下る沢の入口','南へ延びる尾根','緩い樹氷の原','木の間へ入る斜面'][i]}));
  const extras=[['north-wall','北壁',100,-1100,4,'steep'],['crater-chute','火口壁のルンゼ',-80,-650,4,'chute'],['summit-spine','山頂の背',650,-350,4,'spine'],['cornice-shoulder','雪庇の肩',-500,-950,3,'ridge'],['rock-window','岩峰の窓',650,-850,3,'chute'],['wind-saddle','風の鞍部',500,1000,3,'ridge'],['birch-shelf','ダケカンバの棚',-900,1600,2,'forest']];
  for(const [id,name,x,z,level,kind]of extras){const d=makeDrops(c,b,[{id,name,x,z,level}])[0];drops.push({...d,kind,hidden:drops.length>=10,about:`${name}から谷へ下る`});}
  for(const [id,name,fid,level,kind]of [['jump-valley','ジャンプ台の谷','jv-1',1,'park'],['big-air','大ジャンプ台','bigair-1',3,'bigair']]){
    const f=features.find(f=>f.id===fid),a=f.approach;drops.push({id,name,...a,y:spline(b.height,c.grid,(a.x+c.size/2)/c.cell-.5,(a.z+c.size/2)/c.cell-.5),level,kind,zone:zoneId(a.x,a.z,f.y),hidden:false,about:kind==='park'?'四つの台を順に飛ぶ':'特大の台へまっすぐ入る'});
  }
  return drops;
}
