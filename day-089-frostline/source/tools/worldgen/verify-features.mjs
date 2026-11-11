import {verifyPark} from './lib/verify-park.js';
import {parkPoint} from './lib/park-search.js';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDelivered} from './verify-valley.mjs';
import {sha256} from './generate.mjs';
import {calibrateFeature,featureRide} from './lib/feature-rides.js';
import {runRide} from './lib/verify-features.js';
import {traceValley} from './lib/stations.js';
import {encodePNG} from './lib/png.js';
import {RULES} from '../../src/play/rules.js';
const fmt=n=>Number.isFinite(n)?n.toFixed(3):'—',COLORS=[[30,132,218],[210,118,20],[163,61,184]];
function section(world,f,runs){
 const width=900,height=480,data=new Uint8Array(width*height*4).fill(255),lo=-50,hi=f.length+30,ground=[];
 for(let s=lo;s<=hi;s+=.5)ground.push({s,y:world.heightAt(f.x+Math.sin(f.heading)*s,f.z-Math.cos(f.heading)*s)});
 const pts=[...ground,...runs.flatMap(r=>r.points.filter(p=>p.s>=lo&&p.s<=hi))],min=Math.min(...pts.map(p=>p.y))-3,max=Math.max(...pts.map(p=>p.y))+3,scale=Math.min(820/(hi-lo),390/(max-min));
 const xy=p=>[40+(p.s-lo)*scale,35+(max-p.y)*scale],dot=(x,y,c,r=1)=>{for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const ix=Math.round(x+dx),iy=Math.round(y+dy);if(ix>=0&&ix<width&&iy>=0&&iy<height)data.set([...c,255],(iy*width+ix)*4);}};
 const line=(a,b,c)=>{const [x,y]=xy(a),[u,v]=xy(b),d=Math.max(1,Math.hypot(u-x,v-y));for(let i=0;i<=d;i++)dot(x+(u-x)*i/d,y+(v-y)*i/d,c,0);};
 for(let s=-40;s<=hi;s+=10)line({s,y:min},{s,y:max},[228,232,238]);
 for(let y=Math.ceil(min/10)*10;y<max;y+=10)line({s:lo,y},{s:hi,y},[228,232,238]);
 for(let i=1;i<ground.length;i++)line(ground[i-1],ground[i],[50,65,76]);
 line({s:0,y:min},{s:0,y:max},[213,58,55]);
 for(const [j,r]of runs.entries()){
  const c=COLORS[j];for(let i=1;i<r.points.length;i++){const p=r.points[i],prev=r.points[i-1];if(p.s<lo||p.s>hi||prev.s<lo||prev.s>hi)continue;line(prev,p,c);if(i%3===0)dot(...xy({s:p.s,y:world.heightAt(p.x,p.z)}),c,0);}
  if(r.flight)dot(...xy({s:r.flight.landing.s,y:r.flight.landing.y}),c,4);
 }
 return {width,height,data,png:encodePNG(width,height,data)};
}
export function verifyFeatures({out='public/world',dir='.agent-harness/runs/worldgen/i17d/features'}={}){
 const w=readDelivered(out);if(w.meta.cell!==2||w.meta.grid!==2048)throw new Error('本番2m格子が必要');mkdirSync(dir,{recursive:true});
 const sections=[],features=w.meta.features.map(f=>{
  const targets=f.kind==='rollers'?[20,20,20]:[f.speed[0],(f.speed[0]+f.speed[1])/2,f.speed[1]],runs=targets.map(target=>calibrateFeature(w,f.kind==='kicker'?{...f,approach:{...parkPoint(f,-15),heading:f.heading,speed:0}}:f,target,{trace:true}));
  for(const r of runs)r.pass=r.error<.15&&Math.abs(r.edgeT)<=f.width/2&&!!r.flight&&r.flight.air>=(f.kind==='rollers'?.2:f.kind==='kicker'?(f.size==='S'?.55:.85):.5)&&(f.kind!=='rollers'||r.flights.filter(p=>p.s>=0&&p.s<60).length>=2&&r.flights.filter(p=>p.s>=0&&p.s<60).every(p=>p.air>=.2&&p.air<=.5))&&!r.crash&&r.completed&&(f.kind==='kicker'||r.flight.landing.powder>=.85&&r.flight.landing.depth>=.9)&&r.flight.impact<=r.flight.limit;
  const retry=featureRide(w,f,f.approach.speed),retryPass=retry.edge!==null&&retry.edge>=f.speed[0]-.15&&retry.edge<=f.speed[1]+.15&&!!retry.flight&&!retry.crash&&retry.completed;
  let obstacleCount=0;for(let s=-60;s<=f.length+20;s+=10)for(let t=-f.width/2;t<=f.width/2;t+=8)obstacleCount+=w.obstaclesNear(f.x+Math.sin(f.heading)*s+Math.cos(f.heading)*t,f.z-Math.cos(f.heading)*s+Math.sin(f.heading)*t,2,[]).length;
  const picture=section(w,f,runs);writeFileSync(`${dir}/${f.id}.png`,picture.png);sections.push(picture);
  return {...f,runs:runs.map(({points,...r})=>r),retry:{edge:retry.edge,air:retry.flight?.air,crash:retry.crash,pass:retryPass},obstacleCount,pass:runs.every(r=>r.pass)&&retryPass&&obstacleCount===0};
 });
 for(let start=0;start<sections.length;start+=4){const width=1800,height=960,data=new Uint8Array(width*height*4).fill(255);sections.slice(start,start+4).forEach((p,i)=>{for(let y=0;y<p.height;y++)data.set(p.data.subarray(y*p.width*4,(y+1)*p.width*4),((Math.floor(i/2)*480+y)*width+(i%2)*900)*4);});writeFileSync(`${dir}/review-${start/4+1}.png`,encodePNG(width,height,data));}
 const village=w.meta.stations.find(s=>s.id==='village'),drops=w.drops.map(d=>{const required=d.level<=2?25:6,r=runRide(w,{...d,speed:d.speed??0},required),route=traceValley(w,d),distance=Math.min(...route.points.map(p=>Math.hypot(p.x-village.x,p.z-village.z)));return {...d,required,crash:r.crash,travel:Math.hypot(r.end.x-d.x,r.end.z-d.z),distance,routeReason:route.reason,pass:!r.crash};});
 const natural=features.filter(f=>f.kind==='cliff'||f.kind==='lip'),longest=natural.reduce((a,b)=>a.runs[1].flight.air>=b.runs[1].flight.air?a:b),quotas={eastEasy:natural.filter(f=>f.region==='east'&&f.drop>=2&&f.drop<=4).length,central:natural.filter(f=>f.region==='central').length,westHigh:natural.filter(f=>f.region==='west'&&f.drop>=5).length,long12:natural.filter(f=>Math.max(...f.runs.map(r=>r.flight.air))>=1.2).length,long20:natural.filter(f=>Math.max(...f.runs.map(r=>r.flight.air))>=2).length};
 const simulationHashes=Object.fromEntries(readdirSync('src/sim').filter(p=>p.endsWith('.js')).sort().map(p=>[p,sha256(readFileSync('src/sim/'+p))]));
 const checks={naturalCount:natural.length>=10,featurePhysics:features.every(f=>f.pass),eastEasy:quotas.eastEasy>=3,central:quotas.central>=3,westHigh:quotas.westHigh>=3,long12:quotas.long12>=4,long20:quotas.long20>=1,dropRides:drops.length===(w.meta.park?.independent?18:16)&&drops.every(d=>d.pass),stationRoutes:drops.filter(d=>d.distance<=150).length>=12,parkPair:features.filter(f=>f.kind==='kicker').length===3,rollers:features.filter(f=>f.kind==='rollers').length>=2,bigAirRule:Math.abs(RULES.bigAir-longest.runs[1].flight.air*.85)<1e-6,dropHeightRule:features.some(f=>f.kind==='cliff'&&f.drop>=RULES.dropHeight)};
 const park=verifyPark(w,resolve(dir,'..'));if(park)checks.parkAcceptance=Object.values(park.checks).every(Boolean);
 const result={park,features,drops,quotas,longest:{id:longest.id,centralAir:longest.runs[1].flight.air,goal:longest.runs[1].flight.air*.85},simulationHashes,checks,pass:Object.values(checks).every(Boolean)};
 writeFileSync(`${dir}/verify-features.json`,JSON.stringify(result,null,2)+'\n');
 const lines=['# I17b 現地形の実物理検証','','createRide既定値・無操作・1/240秒。縁はs=0の実速度、air/EFHはlandイベント。3速度とも仕掛けの着地後12秒まで継続する。転倒・未着地・速度誤差0.15m/s以上は不合格。新雪の転倒境界も併記。','','|名前 / 座標 / 種類 / 落差|目標|実速度|滞空s|EFH m|新雪割合|深さm|転倒境界m|転倒|判定|','|---|---:|---:|---:|---:|---:|---:|---:|---|---|'];
 for(const f of features)for(const r of f.runs)lines.push(`|${f.name} (${f.x},${f.z}) ${f.kind} ${fmt(f.drop)}m|${r.target}|${fmt(r.edge)}|${fmt(r.flight?.air)}|${fmt(r.flight?.impact)}|${fmt(r.flight?.landing.powder)}|${fmt(r.flight?.landing.depth)}|${fmt(r.flight?.limit)}|${r.crash?.reason??'なし'}|${r.pass?'○':'未達'}|`);
 lines.push('',...features.filter(f=>f.kind==='rollers').map(f=>f.name+'：全離雪の 滞空s/EFH m = '+f.runs[0].flights.map(p=>fmt(p.air)+'/'+fmt(p.impact)).join(', ')));
 lines.push('','|出発地点|X,Z|秒|転倒|移動m|村までm|','|---|---|---:|---|---:|---:|');for(const d of drops)lines.push(`|${d.id}|${fmt(d.x)},${fmt(d.z)}|${d.required}|${d.crash?.reason??'なし'}|${fmt(d.travel)}|${fmt(d.distance)}|`);
 lines.push('',`合否: ${JSON.stringify(checks)}`,`地域・長い飛び: ${JSON.stringify(quotas)}`,`最長中央速度: ${JSON.stringify(result.longest)}`,'','断面: 各id.png。review-N.pngはデータ順に4枚ずつ（左上→右上→左下→右下）。縦横は同じ縮尺、格子10m、灰=中心断面、色の点=実軌道直下の地形、青/橙/紫=3軌道、大点=着地点、赤線=縁。各PNGと対応する実数はJSONを参照。','',`物理ソースSHA256: ${JSON.stringify(simulationHashes)}`);
 writeFileSync(`${dir}/verify-features.md`,lines.join('\n')+'\n');return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const r=verifyFeatures();console.log(JSON.stringify({checks:r.checks,quotas:r.quotas,longest:r.longest}));if(!r.pass)process.exitCode=1;}
