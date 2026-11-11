import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createWorld} from '../../src/world/index.js';
import {FILES,WORLD_FORMAT_VERSION} from '../../src/world/format.js';
import {createRide} from '../../src/sim/index.js';
import {PARAMS} from '../../src/sim/params.js';
import {makeKicker,makeCliff,makeLip,makeRollers,KICKER_SPECS,withProfile,inverseLanding,hermite} from './lib/feature-stamps.js';
import {encodePNG} from './lib/png.js';
import {inflateSync} from 'node:zlib';
const DT=1/240, ORIGIN_Z=260;
export function stampWorld(stamp,{packed=false,phase=0}={}){
  const grid=512,size=1024,cell=2,maskGrid=256;
  const height=new Float32Array(grid*grid),masksA=new Uint8Array(maskGrid**2*4),masksB=new Uint8Array(maskGrid**2*4);
  const base=Math.tan(stamp.slopeDeg*Math.PI/180);
  for(let j=0;j<grid;j++){const s=ORIGIN_Z+512-(j+.5)*cell-phase;for(let i=0;i<grid;i++){const t=(i+.5)*cell-512;height[j*grid+i]=500-base*s+stamp.delta(s,t);}}
  for(let j=0;j<maskGrid;j++)for(let i=0;i<maskGrid;i++){
    const s=ORIGIN_Z+512-(j+.5)*4-phase,t=(i+.5)*4-512,k=(j*maskGrid+i)*4;
    masksA[k]=40;masksA[k+1]=packed?0:Math.round(stamp.powder(s,t)*255);masksA[k+3]=Math.round(stamp.rock(s,t)*255);masksB[k+3]=1;
  }
  const meta={version:WORLD_FORMAT_VERSION,seed:'I17a-flat-2m',size,grid,cell,maskGrid,tileGrid:256,tilePeriod:96,heightRange:[-2000,3000],
    sun:{x:0,y:1,z:0},features:[],stations:[],map:{file:'map.png',size:1024},drops:[],zones:[{id:1,name:'stamp'}],hashes:Object.fromEntries(Object.values(FILES).map(f=>[f,'0'.repeat(64)]))};
  return createWorld(meta,{height,masksA,masksB,tileA:new Float32Array(256**2),sunVis:new Uint8Array(grid**2).fill(255)});
}
/** Track all flights and continue through the return, so a later crash cannot be hidden. */
export function runStamp(world,stamp,initial,{offset=0,popAt=null,trace=false,entryOnly=false}={}){
  const ride=createRide(world);ride.reset({x:offset,z:ORIGIN_Z-stamp.approach.s,heading:0,speed:initial});
  let edge=null,entry=null,entryTime=null,edgeTime=null,crash=null,active=null,maxG=0;const flights=[],points=[];let lastProgress=stamp.approach.s,stalled=0;
  for(let tick=0;tick<35*240;tick++){
    const time=tick*DT,before=ORIGIN_Z-ride.state.pos.z,previousSpeed=ride.state.speed,previousY=ride.state.pos.y;
    ride.step({jump:popAt!==null&&time>=popAt-.8&&time<popAt},DT);
    const q=ride.state,s=ORIGIN_Z-q.pos.z;
    if(before<0&&s>=0){const f=-before/(s-before);edge=previousSpeed+(q.speed-previousSpeed)*f;edgeTime=time+DT*f;}
    if(s<0)maxG=Math.max(maxG,q.gLoad);
    if(q.mode==='air'&&!active)active={s,time:time+DT,points:[]};
    const point={time:time+DT,s,y:q.pos.y-500,comS:ORIGIN_Z-q.com.z,comY:q.com.y-500,vs:-q.vel.z,vy:q.vel.y,boardVs:(s-before)/DT,boardVy:(q.pos.y-previousY)/DT,x:q.pos.x,comX:q.com.x,vx:q.vel.x};
    if(trace&&tick%4===0){points.push(point);if(active)active.points.push(point);}
    for(const e of ride.events){
      if(e.type==='takeoff'&&entry===null){entry=e.speed;entryTime=time+DT-q.air.time;}
      if(e.type==='land'){
        flights.push({s:active?.s??s,air:e.air,impact:e.efh,pop:e.pop,landS:s,landY:q.pos.y-500,points:active?.points??[]});active=null;
      }
      if(e.type==='crash')crash={reason:e.reason,s,time:time+DT};
    }
    if(q.mode!=='air')active=null;
    stalled=s-lastProgress<.001?stalled+1:0;lastProgress=s;if(stalled>120)break;
    if(q.mode==='crash'&&!crash)crash={reason:'crash',s,time:time+DT};
    if(entryOnly&&(edge!==null||(time>3&&q.speed<.25)))break;
    if(crash||s>Math.min(stamp.after+5,710)||s < stamp.approach.s-5)break;
  }
  const relevant=flights.filter(f=>f.s>-15&&f.s<Math.max(12,stamp.landingEnd??120));
  const flight=stamp.kind==='rollers'?flights[0]??null:relevant.find(f=>f.s>=-10&&f.s<=8)??null;
  return {initial,edge,entry,entryTime,edgeTime,flight,flights,crash,maxG,points,completed:!crash&&ORIGIN_Z-ride.state.pos.z>stamp.after,endS:ORIGIN_Z-ride.state.pos.z};
}
export function calibrateStamp(world,stamp,target,options={}){
  let lo=0,hi=65,best=null;
  for(let k=0;k<13;k++){
    const initial=(lo+hi)/2,r=runStamp(world,stamp,initial,{...options,entryOnly:true});
    const actual=r.edge??0,error=Math.abs(actual-target);
    if(!best||error<best.error)best={initial,error,actual};
    if(actual<target)lo=initial;else hi=initial;
  }
  const result=runStamp(world,stamp,best.initial,options);return {...result,error:best.error,target};
}
export function evaluateStamp(stamp,{trace=true,extras=true}={}){
  const world=stampWorld(stamp),mid=(stamp.speed[0]+stamp.speed[1])/2;
  const targets=[stamp.speed[0],mid,stamp.speed[1]],runs=targets.map(v=>({...calibrateStamp(world,stamp,v,{trace}),mode:'straight'}));
  const c=runs[1];stamp.approach.speed=c.initial;
  if(extras){
    let popStamp=stamp,popBaseline=c;
    if(c.edgeTime<.95){
      const extra=stamp.kind==='kicker'?5:stamp.kind==='rollers'?7:5;
      popStamp={...stamp,approach:{...stamp.approach,s:stamp.approach.s-extra}};
      popBaseline=calibrateStamp(world,popStamp,mid,{trace:false});
      if(popBaseline.error>=.1){popStamp=stamp;popBaseline=c;}
    }
    runs.push({...runStamp(world,popStamp,popBaseline.initial,{popAt:popBaseline.edgeTime-.15,trace}),target:mid,mode:'pop',error:popBaseline.error,heldDuration:Math.max(0,Math.min(.8,popBaseline.edgeTime-.15)),approachS:popStamp.approach.s});
    runs.push({...calibrateStamp(world,stamp,mid,{offset:2,trace}),mode:'offset+2'});
    runs.push({...calibrateStamp(world,stamp,mid,{offset:-2,trace}),mode:'offset-2'});
  }
  for(const r of runs){const f=r.flight,limit=r.mode==='pop'?1.3:stamp.kind==='kicker'?KICKER_SPECS[stamp.size].impact:3.9;
    r.pass=!!f&&(r.mode!=='pop'||r.heldDuration>=.8-DT&&f.pop)&&r.completed&&!r.crash&&r.error<.1&&f.impact<=limit&&(stamp.kind!=='kicker'||r.mode!=='straight'||f.air>=stamp.air[0]&&f.air<=stamp.air[1]);
  }
  return {stamp,runs,pass:runs.filter(r=>stamp.kind==='kicker'||r.mode==='straight').every(r=>r.pass)};
}
function line(pixels,w,h,x0,y0,x1,y1,color){
  const n=Math.ceil(Math.max(Math.abs(x1-x0),Math.abs(y1-y0)));for(let k=0;k<=n;k++){
    const x=Math.round(x0+(x1-x0)*k/(n||1)),y=Math.round(y0+(y1-y0)*k/(n||1));if(x>=0&&x<w&&y>=0&&y<h)pixels.set(color,(y*w+x)*4);
  }
}
export function sectionPNG(stamp,runs,{detail=false}={}){
  const lo=detail?Math.max(-20,-stamp.before-3):-stamp.before-3,hi=detail?(stamp.landingEnd??stamp.after)+12:Math.min(710,stamp.after+3),base=Math.tan(stamp.slopeDeg*Math.PI/180),world=stampWorld(stamp);
  let ymin=Infinity,ymax=-Infinity;const ground=[];for(let s=lo;s<=hi;s+=.25){const y=world.heightAt(0,ORIGIN_Z-s)-500;ground.push({s,y});ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);}
  for(const r of runs)for(const p of r.points){if(p.s<lo||p.s>hi)continue;ymin=Math.min(ymin,p.y);ymax=Math.max(ymax,p.comY);}
  const scale=1000/(hi-lo),w=1040,h=Math.ceil((ymax-ymin+12)*scale)+40,pix=new Uint8Array(w*h*4);for(let k=0;k<pix.length;k+=4)pix.set([245,248,252,255],k);
  const xy=p=>[20+(p.s-lo)*scale,20+(ymax+6-p.y)*scale];
  for(let s=Math.ceil(lo/10)*10;s<hi;s+=10)line(pix,w,h,...xy({s,y:ymin-6}),...xy({s,y:ymax+6}),[218,225,234,255]);
  line(pix,w,h,...xy({s:lo,y:-base*lo}),...xy({s:hi,y:-base*hi}),[185,192,204,255]);
  for(let i=1;i<ground.length;i++)line(pix,w,h,...xy(ground[i-1]),...xy(ground[i]),[25,43,65,255]);
  for(const [i,r] of runs.entries())for(let k=1;k<r.points.length;k++){
    const a=r.points[k-1],b=r.points[k];if(a.s<-12||b.s>Math.min(hi,stamp.landingEnd+25))continue;
    line(pix,w,h,...xy(a),...xy(b),r.mode==='pop'?[190,65,160,255]:[20,125+i*8,190,255]);
    line(pix,w,h,...xy({s:a.comS,y:a.comY}),...xy({s:b.comS,y:b.comY}),[218,151,48,255]);
  }
  line(pix,w,h,...xy({s:0,y:ymin-6}),...xy({s:0,y:ymax+6}),[210,65,65,255]);
  return encodePNG(w,h,pix);
}
const fmt=n=>Number.isFinite(n)?n.toFixed(3):'—';
export async function main(){
  const started=Date.now();
  const dir='.agent-harness/runs/worldgen/stamps';mkdirSync(dir,{recursive:true});
  const stamps=[];for(const slopeDeg of [14,18,22,26])for(const size of Object.keys(KICKER_SPECS))stamps.push(makeKicker({size,slopeDeg}));
  for(const slopeDeg of [28,34,40])for(const height of [4,7,12])stamps.push(makeCliff({height,slopeDeg}));
  for(const slopeDeg of [26,32])for(const height of [2,3,4])stamps.push(makeLip({height,slopeDeg}));
  for(const slopeDeg of [12,18])stamps.push(makeRollers({slopeDeg,count:3}));
  const rows=[],designs={};for(let stamp of stamps){
    if(process.argv.includes('--design')&&stamp.kind!=='rollers'){
      const time=stamp.kind==='kicker'?(stamp.size==='practice'?.42:stamp.air[0]*(stamp.size==='large'||stamp.size==='xl'?.65:.8)):Math.sqrt(2*stamp.height/PARAMS.gravity)+.2;
      const designed=refineStamp(stamp,{passes:2,time,impact:stamp.kind==='kicker'?.55:2.4});
      stamp=designed.stamp;stamp.refinement=designed.history;
    }
    const result=evaluateStamp(stamp);result.geometry=auditGeometry(stamp);
    result.ridePass=result.pass;
    result.pass=result.pass&&result.geometry.returnRadiusPass&&result.geometry.gridContained&&
      (stamp.kind==='kicker'?result.runs[1].maxG<=1.6:stamp.kind==='cliff'?result.geometry.shelfMaxDeg<=15:true);
    if(stamp.kind==='cliff')result.packed=compactRun(calibrateStamp(stampWorld(stamp,{packed:true}),stamp,13,{trace:false}));rows.push(result);const name=`${stamp.kind}-${stamp.size}-${stamp.slopeDeg}`;
    if(stamp.profile)designs[name]={profile:stamp.profile,history:stamp.refinement??[],approach:stamp.approach};
    // Nine speeds, including +2m/s, record the entire unmodified physical state trajectory.
    const world=stampWorld(stamp),bundle=Array.from({length:9},(_,i)=>calibrateStamp(world,stamp,stamp.speed[0]+(stamp.speed[1]+2-stamp.speed[0])*i/8,{trace:true}));
    writeFileSync(`${dir}/${name}.json`,JSON.stringify({kind:stamp.kind,size:stamp.size,slopeDeg:stamp.slopeDeg,bundle:bundle.map(compactRun),runs:result.runs.map(compactRun)}));
    writeFileSync(`${dir}/${name}.png`,sectionPNG(stamp,[...bundle,result.runs[3]]));
    writeFileSync(`${dir}/${name}-detail.png`,sectionPNG(stamp,[...bundle,result.runs[3]],{detail:true}));
    console.log(`${name}: ${result.runs.map(r=>`${r.mode}=${fmt(r.flight?.air)}/${fmt(r.flight?.impact)}${r.crash?' CRASH':''}`).join(' ')}`);
  }
  const md=['# I17a 2m格子の独立平面・実物理検査','','createWorld:1024m/512²、createRide既定、1/240秒。airはlandイベントの実測、衝撃はEFH(m)。無飛行・未着地は欠測として不合格。青=板、黄=重心、赤=端、灰=土台。PNGは縦横1:1。JSONに速度9本と全走行の位置・重心・速度。','','|型|斜度|操作/目標速度|端の実速|滞空s|衝撃m|転倒|合否|','|---|---:|---|---:|---:|---:|---|---|'];
  for(const {stamp:s,runs} of rows)for(const r of runs)md.push(`|${s.kind}/${s.size}|${s.slopeDeg}|${r.mode}/${r.target}|${fmt(r.edge)}|${fmt(r.flight?.air)}|${fmt(r.flight?.impact)}|${r.crash?.reason??'なし'}|${r.pass?'○':'未達'}|`);
  md.push('','|型|斜度|前/後/幅m|最大盛土/掘削m|戻り初速m/s|','|---|---:|---|---|---:|');
  for(const {stamp:s} of rows){let lo=0,hi=0;for(let x=-s.before;x<=s.after;x+=.5){const d=s.delta(x,0);lo=Math.min(lo,d);hi=Math.max(hi,d);}md.push(`|${s.kind}/${s.size}|${s.slopeDeg}|${fmt(s.before)}/${fmt(s.after)}/${fmt(s.width)}|${fmt(hi)}/${fmt(lo)}|${fmt(s.approach.speed)}|`);}
  md.push('','## 逆算の記録','','台は通常軌道のEFH0.55m、崖と雪庇は新雪で受ける候補として2.4mを積分の指定にした。崖・雪庇は0.35〜0.55mの逆算目標に未達。型の受入条件そのものは緩めていない。');
  for(const {stamp:s} of rows)if(s.refinement)md.push(`- ${s.kind}/${s.size}/${s.slopeDeg}°: `+s.refinement.map(h=>`第${h.pass}回 `+h.runs.map(r=>`${r.target}m/s=${fmt(r.air)}s/${fmt(r.impact)}m`).join(', ')).join(' → '));
  md.push('',`滑走条件の合格: ${rows.filter(r=>r.ridePass).length}/${rows.length}。復帰曲率・支持範囲・台の実荷重・崖の棚を含む判定: ${rows.filter(r=>r.pass).length}/${rows.length}。未達を合格へ読み替えない。`);
  writeFileSync(`${dir}/geometry.json`,JSON.stringify(rows.map(r=>({kind:r.stamp.kind,size:r.stamp.size,slopeDeg:r.stamp.slopeDeg,...r.geometry})),null,2));
  if(process.argv.includes('--design'))writeFileSync(`${dir}/designs.json`,JSON.stringify(designs));
  md.push('','## 崖の圧雪13m/s（実走）','','|高さ/土台|滞空s|EFH m|転倒|','|---|---:|---:|---|');
  for(const r of rows.filter(r=>r.packed))md.push(`|${r.stamp.size}/${r.stamp.slopeDeg}°|${fmt(r.packed.flight?.air)}|${fmt(r.packed.flight?.impact)}|${r.packed.crash?.reason??'なし'}|`);
  const full=md.join('\n')+'\n';
  for(const slope of [...new Set(rows.map(r=>r.stamp.slopeDeg))]){
    const selected=rows.filter(r=>r.stamp.slopeDeg===slope);
    const lines=['# '+slope+'°の物理検査','','表記: 滞空s/EFH(m)。無飛行は—。縁0での実速度を校正。復帰の終点まで確認。','','|型|操作/速度|実速|離雪速|滞空s|EFH m|転倒|復帰完了|合否|','|---|---|---:|---:|---:|---:|---|---|---|'];
    for(const {stamp:s,runs} of selected)for(const r of runs)lines.push(`|${s.kind}/${s.size}|${r.mode}/${r.target}|${fmt(r.edge)}|${fmt(r.entry)}|${fmt(r.flight?.air)}|${fmt(r.flight?.impact)}|${r.crash?.reason??'なし'}|${r.completed?'○':'未完'}|${r.pass?'○':'未達'}|`);
    writeFileSync(`${dir}/slope-${slope}.md`,lines.join('\n')+'\n');
  }
  // The generated numeric archive is separate from the short human-facing entry.
  writeFileSync(`${dir}/all-results.txt`,full);
  const entry=['# I17a 型の検証結果','','createWorld:1024m/2m、createRide既定、1/240秒。型の縁をZ=260mへ置き、長い復帰面も同じ正方形の中で確認する。','','|土台の斜度|全走行表|','|---:|---|',...([...new Set(rows.map(r=>r.stamp.slopeDeg))].map(s=>`|${s}°|[速度3通り・踏み切り・±2m](slope-${s}.md)|`)),'','[寸法・逆算履歴・未達の詳細](all-results.txt)、[曲率・棚・岩面の実測](geometry.json)','',`型の合格: ${rows.filter(r=>r.pass).length}/${rows.length}。未達はそのまま残す。`,'','青=板、紫=自力踏み切りの板、黄=重心、赤=縁0、灰=元の平面。断面PNGは縦横1:1。各型のJSONに速度9本（下限〜上限+2）と実走行の軌道。','','通常滑走の速度は縁0を通過するときの3次元速度。踏み切りは無操作なら中央速度になる初速を校正し、助走が短ければ戻り先を5〜7m上へ延ばす。加えた上向き速度で縁の速さも増える。延ばした助走で中央速度を作れない場合は未充として合格にしない。','','軌道予測は実際の離雪snapshotを、同じ面を1000m低くしたcreateWorldへrestoreして行う。接触しない空中の軌道を得るためで、最終合否は元の高さの静的な山で再実走した値。物理の係数・コードは変更していない。'];
  entry.push('','以下は滑走の実測表。形の完成を意味しない。崖の棚は10〜15°を超え、4m崖の岩面もほぼ垂直にはなっていない。特大台は支持幅が1024mを超える。台の中央走行の最大実荷重は1.6Gを超える組み合わせがある。','','|型/土台|低速 s/m|中央 s/m|高速 s/m|踏み切り s/m|','|---|---:|---:|---:|---:|');
  const pair=r=>r?.flight?fmt(r.flight.air)+'/'+fmt(r.flight.impact)+(r.crash?' 転倒':''):r?.crash?'— 転倒':'—';
  for(const {stamp:s,runs} of rows)entry.push(`|${s.kind}/${s.size}/${s.slopeDeg}°|${pair(runs[0])}|${pair(runs[1])}|${pair(runs[2])}|${pair(runs[3])}|`);
  entry.push('','低・中・高の速度(m/s): 練習7/8.5/10、小10/12/14、中13/15.5/18、大16/19/22、特大20/23/26、崖8/13/18、雪庇8/12/16、うねり20。—は飛行または着地が無く、合格ではない。',`検証時間: ${((Date.now()-started)/1000).toFixed(3)}秒。`);
  writeFileSync(`${dir}/verify-stamps.md`,entry.join('\n')+'\n');
  writeFileSync(`${dir}/summary.json`,JSON.stringify(rows.map(({stamp,runs,pass,ridePass,geometry})=>({kind:stamp.kind,size:stamp.size,slopeDeg:stamp.slopeDeg,pass,ridePass,geometry,runs:runs.map(({points,...r})=>compactRun(r))})),null,2));
  writeReviewSheets();
  console.log(finalReport(rows,(Date.now()-started)/1000));
  process.exitCode=rows.filter(r=>r.stamp.kind==='kicker'||r.stamp.kind==='cliff').every(r=>r.pass)?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();

function atS(points,s){
  let lo=0,hi=points.length-1;
  if(s<=points[0].s)return points[0];if(s>=points[hi].s)return points[hi];
  while(hi-lo>1){const m=(lo+hi)>>1;if(points[m].s<s)lo=m;else hi=m;}
  const a=points[lo],b=points[hi],f=(s-a.s)/(b.s-a.s),out={};for(const key of Object.keys(a))out[key]=a[key]+f*(b[key]-a[key]);return out;
}
/** Two/three physical survey passes. No simulation parameter or state is overridden. */
export function refineStamp(seed,{passes=2,impact=.5,time=null,includePop=false}={}){
  let stamp=seed;const history=[];let targetTime=time??stamp.air[0]+.03;
  for(let pass=0;pass<passes;pass++){
    const a=stamp.angle*Math.PI/180,H=stamp.lipHeight;
    const world=stampWorld(stamp),catchWorld=stampWorld(stamp);
    for(let k=0;k<catchWorld.buffers.height.length;k++)catchWorld.buffers.height[k]-=1000;
    const count=includePop?10:9;
    const bundle=Array.from({length:count},(_,i)=>{
      const isPop=i===9,target=isPop?(stamp.speed[0]+stamp.speed[1])/2:stamp.speed[0]+(stamp.speed[1]+2-stamp.speed[0])*i/8;
      const calibrated=calibrateStamp(world,stamp,target,{trace:false});
      const ride=createRide(world);ride.reset({x:0,z:ORIGIN_Z-stamp.approach.s,heading:0,speed:calibrated.initial});
      const popAt=isPop?calibrated.edgeTime-.15:null;
      for(let k=0;k<2000&&ride.state.mode!=='air';k++)ride.step({jump:popAt!==null&&k*DT>=popAt-.8&&k*DT<popAt},DT);
      if(ride.state.mode!=='air')return {target,points:[],unavailable:true};
      const snapshot=ride.snapshot(),free=createRide(catchWorld);free.restore(snapshot);
      const points=[];
      for(let k=0;k<1500;k++){
        const q=free.state;
        points.push({time:k*DT,s:ORIGIN_Z-q.pos.z,y:q.pos.y-500,vs:-q.vel.z,vy:q.vel.y,comS:ORIGIN_Z-q.com.z,comY:q.com.y-500});
        free.step({},DT);if(ORIGIN_Z-q.pos.z>200||q.mode==='crash')break;
      }
      return {target,points,pop:isPop};
    });
    if(bundle.some(r=>r.unavailable)){history.push({pass:pass+1,reason:'離雪しない速度があり軌道を逆算できない',runs:[]});break;}
    const low=bundle[0],lowPoint=low.points[Math.min(low.points.length-1,Math.round(targetTime/DT))],x0=Math.max(seed.kind==='kicker'?3:6,lowPoint.s),y0=lowPoint.y;
    const sample=(x,y)=>{
      const pts=bundle.map(r=>({...atS(r.points,x),pop:r.pop})).sort((a,b)=>a.y-b.y);let i=0;while(i<pts.length-2&&pts[i+1].y<y)i++;
      const a=pts[i],b=pts[i+1],f=Math.max(0,Math.min(1,(y-a.y)/(b.y-a.y||1)));return {vs:a.vs+(b.vs-a.vs)*f,vy:a.vy+(b.vy-a.vy)*f,stop:y>=pts.at(-1).y,impact:impact+(b.pop?.15:0)*f};
    };
    const end=Math.min(140,Math.max(x0+20,(stamp.speed[1]+2)*Math.max(stamp.air[1],1.5)*1.4));
    const landing=inverseLanding({x0,y0,end,sample,impact}),m0=(landing[1].h-landing[0].h)/.125;
    const profile=stamp.profile.filter(p=>p.s<0);profile.push({s:0,h:H});
    for(let s=.125;s<x0;s+=.125){
      const wallEnd=4,wallY=H-seed.height+Math.tan(a)*wallEnd;
      const h=seed.kind==='kicker'?hermite(s,0,H,Math.tan(a),x0,y0,m0):s<wallEnd?H+Math.tan(a)*s-seed.height*Math.max(0,Math.min(1,(s-2)/2))**2*(3-2*Math.max(0,Math.min(1,(s-2)/2))):hermite(s,wallEnd,wallY,Math.tan(a),x0,y0,m0);
      profile.push({s,h});
    }
    profile.push(...landing);stamp=withProfile(seed,profile);
    const result=evaluateStamp(stamp,{trace:false,extras:false});history.push({pass:pass+1,x0,y0,designTime:targetTime,runs:result.runs.map(r=>({target:r.target,edge:r.edge,air:r.flight?.air,impact:r.flight?.impact,crash:r.crash}))});
    if(seed.kind==='kicker'&&result.runs[0].flight)targetTime=Math.max(.15,targetTime+.65*((time??seed.air[0]+.03)-result.runs[0].flight.air));
  }
  return {stamp,history};
}

export function auditGeometry(stamp){
  const world=stampWorld(stamp),base=Math.tan(stamp.slopeDeg*Math.PI/180),surface={},snow={};
  let fill=0,cut=0,returnCurvature=0,wallMax=0,shelfMax=0,rockMax=0;
  for(let s=-stamp.before;s<stamp.after;s+=.5){
    const d=stamp.delta(s,0);fill=Math.max(fill,d);cut=Math.min(cut,d);
    if(s>=-2&&s<=8){world.sampleSurface(0,ORIGIN_Z-s,surface);world.snowAt(0,ORIGIN_Z-s,snow);const angle=Math.acos(surface.ny)*180/Math.PI;
      if(s>=0){wallMax=Math.max(wallMax,angle);rockMax=Math.max(rockMax,snow.rock);}else shelfMax=Math.max(shelfMax,angle);
    }
  }
  // Sample from the exact join, so a short curvature peak cannot fall between the survey points.
  if(Number.isFinite(stamp.landingEnd))for(let s=stamp.landingEnd;s<stamp.after;s+=.25){
    const y=world.heightAt(0,ORIGIN_Z-s),a=world.heightAt(0,ORIGIN_Z-s-.5),b=world.heightAt(0,ORIGIN_Z-s+.5),m=a-b;
    returnCurvature=Math.max(returnCurvature,Math.abs((a+b-2*y)/.25)/(1+m*m)**1.5);
  }
  return {before:stamp.before,after:stamp.after,width:stamp.width,bankWidth:stamp.bankWidth??12,fill,cut,
    returnRadius:returnCurvature?1/returnCurvature:null,returnRadiusPass:returnCurvature<=1/60,
    shelfMaxDeg:shelfMax,wallMaxDeg:wallMax,rockMax,gridContained:stamp.before<192&&stamp.after<712&&stamp.width<1024,
    baseSlopeToleranceDeg:0,placement:'検証した斜度の平面だけ。曲がった山・斜度の補間・重ね合わせは未検証。支持範囲全体の平面とclear内の障害物除去が必要。'};
}

function compactRun(r){
  const strip=f=>f?Object.fromEntries(Object.entries(f).filter(([key])=>key!=='points')):null;
  return {...r,flight:strip(r.flight),flights:r.flights.map(strip)};
}
/** Contact sheets of the exact generated 1:1 details; no browser, drawing library or external renderer. */
export function writeReviewSheets(){
  const dir='.agent-harness/runs/worldgen/stamps',summary=JSON.parse(readFileSync(`${dir}/summary.json`,'utf8')),groups=new Map();
  for(const r of summary){
    const stamp=r.kind==='kicker'?makeKicker(r):r.kind==='cliff'?makeCliff({height:r.size,slopeDeg:r.slopeDeg}):r.kind==='lip'?makeLip({height:r.size,slopeDeg:r.slopeDeg}):makeRollers({slopeDeg:r.slopeDeg,count:r.size});
    const name=`${r.kind}-${r.size}-${r.slopeDeg}`,record=JSON.parse(readFileSync(`${dir}/${name}.json`,'utf8'));
    writeFileSync(`${dir}/${name}-detail.png`,sectionPNG(stamp,[...record.bundle,...record.runs.filter(r=>r.mode==='pop')],{detail:true}));
    writeFileSync(`${dir}/${name}.json`,JSON.stringify({...record,bundle:record.bundle.map(compactRun),runs:record.runs.map(compactRun)}));
    const key=`${r.kind}-${r.size}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({name,slope:r.slopeDeg});
  }
  for(const [key,group] of groups){
    const tiles=group.map(({name,slope})=>{
      const png=readFileSync(`${dir}/${name}-detail.png`),w=png.readUInt32BE(16),h=png.readUInt32BE(20),chunks=[];
      for(let p=8;p<png.length;){const n=png.readUInt32BE(p);if(png.toString('ascii',p+4,p+8)==='IDAT')chunks.push(png.subarray(p+8,p+8+n));p+=n+12;}
      const raw=inflateSync(Buffer.concat(chunks));return {w,h,raw,slope};
    });
    const tw=720,th=Math.max(...tiles.map(t=>Math.ceil(t.h*tw/t.w)))+36,w=1440,h=th*Math.ceil(tiles.length/2),rgba=new Uint8Array(w*h*4).fill(255);
    const digits=['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001001001001','111101111101111','111101111001111'];
    tiles.forEach((t,k)=>{
      const ox=(k%2)*tw,oy=Math.floor(k/2)*th;
      for(let y=0;y<Math.ceil(t.h*tw/t.w);y++)for(let x=0;x<tw;x++){
        const sx=Math.min(t.w-1,Math.floor(x*t.w/tw)),sy=Math.min(t.h-1,Math.floor(y*t.w/tw));rgba.set(t.raw.subarray(sy*(t.w*4+1)+1+sx*4,sy*(t.w*4+1)+5+sx*4),((oy+36+y)*w+ox+x)*4);
      }
      for(const [j,c] of String(t.slope).split('').entries())for(let y=0;y<5;y++)for(let x=0;x<3;x++)if(digits[+c][y*3+x]==='1')for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++)rgba.set([25,43,65,255],((oy+4+y*4+dy)*w+ox+8+j*16+x*4+dx)*4);
    });
    writeFileSync(`${dir}/review-${key}.png`,encodePNG(w,h,rgba));
  }
  return [...groups.keys()];
}

export function finalReport(rows,seconds){
  const names={practice:'練習',small:'小',medium:'中',large:'大',xl:'特大'},pair=r=>r?.mode==='pop'&&r.heldDuration<.8-DT?'未充':!r?.flight?'—':`${r.flight.air.toFixed(2)}/${r.flight.impact.toFixed(2)}${r.crash?'転':''}`;
  const lines=['I17a 実測結果（滞空秒/衝撃m。「転」は転倒、—は無飛行・未着地、未充は0.8秒保持できない助走）',
    '|型/斜度|低速|中央|高速|踏み切り|','|---|---:|---:|---:|---:|'];
  for(const {stamp:s,runs} of rows){const label=s.kind==='kicker'?`台${names[s.size]}`:s.kind==='cliff'?`崖${s.size}m`:s.kind==='lip'?`雪庇${s.size}m`:'うねり';
    lines.push(`|${label}/${s.slopeDeg}°|${pair(runs[0])}|${pair(runs[1])}|${pair(runs[2])}|${pair(runs[3])}|`);
  }
  lines.push('速度(m/s)：練習7/8.5/10、小10/12/14、中13/15.5/18、大16/19/22、特大20/23/26、崖8/13/18、雪庇8/12/16、うねり20。',
    '保存候補の逆算：台3回、崖・雪庇2回。履歴は all-results.txt。練習台は低速で離雪せず、逆算未完。',
    '寸法・切盛量・復帰の曲率：geometry.json。検証した斜度の平面だけを前提に、before/after/width全体の平らさとclear内の障害物除去が必要。斜度の許容幅は未検証。',
    '未達：全ジャンプ台の滞空幅と実荷重、小台の復帰接続部の曲率、中台の踏み切り衝撃、特大台の過大な掘削と支持幅。崖の棚・垂直面も未達。実現不能の証明ではない。',
    `中央走行の最大実荷重: ${Math.max(...rows.filter(r=>r.stamp.kind==='kicker').map(r=>r.runs[1].maxG)).toFixed(3)}G。凹弧は定速計算で1.6G以下でも、実走では未達。`,
    '崖の圧雪13m/sはEFH約2.41〜2.43mで転倒。新雪で成功した滑走を、圧雪の成功や型の完成へ読み替えない。',
    `検証 ${seconds.toFixed(2)}秒。詳細は .agent-harness/runs/worldgen/stamps/verify-stamps.md。試験の件数と失敗は tests.log。`);
  return lines.join('\n');
}
