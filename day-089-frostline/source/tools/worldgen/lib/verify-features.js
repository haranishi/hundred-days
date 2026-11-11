import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRide} from '../../../src/sim/index.js';
import {checkDrop} from './drops.js';
import {traceValley} from './stations.js';
import {local} from './terrain-features.js';
export function runRide(world,spawn,seconds=25,feature=null){
  const ride=createRide(world);ride.reset(spawn);const dt=1/240,flights=[],collisions=[];let flight=null,crash=null,rockSeconds=0,maxImpact=0,lipSpeed=null,lipDistance=Infinity;
  for(let tick=0;tick<seconds*240;tick++){
    const before=ride.state.mode;ride.step({},dt);const s=ride.state,time=(tick+1)*dt;
    if(feature){const distance=Math.abs(local(feature,s.pos.x,s.pos.z).s);if(distance<lipDistance){lipDistance=distance;lipSpeed=s.speed;}}
    if(before!=='air'&&s.mode==='air')flight={start:time,x:s.pos.x,z:s.pos.z,speed:s.speed};
    if(flight&&s.mode!=='air'){
      flight.air=time-flight.start;flight.impact=s.tele.lastImpact;flights.push(flight);flight=null;
      maxImpact=Math.max(maxImpact,s.tele.lastImpact);
    }
    for(const e of ride.events){if(e.type==='collision')collisions.push({time,reason:e.obstacleType});if(e.type==='crash'&&!crash)crash={time,reason:e.reason};}
    if(s.snow.rock>.3)rockSeconds+=dt;
    if(s.mode==='crash'&&!crash)crash={time,reason:'crash'};
    if(feature){const at=local(feature,s.pos.x,s.pos.z);if(at.s>feature.length+15||crash||flights.some(p=>{const a=local(feature,p.x,p.z);return a.s>=-18&&a.s<=25&&p.air>=.08&&(feature.kind!=='cliff'||at.s>35);})||(at.s>35&&s.mode!=='air'))break;}
    if(crash)break;
  }
  const relevant=feature?flights.filter(f=>{const p=local(feature,f.x,f.z);return p.s>=-18&&p.s<=25&&Math.abs(p.t)<feature.width/2&&f.air>=.08;}):flights;
  const selected=relevant.reduce((a,b)=>!a||b.air>a.air?b:a,null);
  return {crash,collisions,rockSeconds,maxImpact,lipSpeed,flight:selected,flights:relevant,end:{...ride.state.pos},speed:ride.state.speed};
}
export function calibrate(world,f,target){
  let lo=0,hi=48,best=null;
  for(let i=0;i<9;i++){
    const speed=(lo+hi)/2,r=runRide(world,{...f.approach,speed},15,f),actual=r.flight?.speed??r.lipSpeed??r.speed,error=Math.abs(actual-target);
    if(!best||error<best.error)best={...r,initial:speed,incoming:actual,error};
    if(actual<target)lo=speed;else hi=speed;
  }
  return best;
}
export function verifyFeatures(world,{calibrateApproaches=false}={}){
  const simulationHashes=Object.fromEntries(readdirSync(new URL('../../../src/sim/',import.meta.url)).filter(f=>f.endsWith('.js')).sort().map(f=>[f,createHash('sha256').update(readFileSync(new URL('../../../src/sim/'+f,import.meta.url))).digest('hex')]));
  const features=world.meta.features??[],stations=world.meta.stations??[],surface={},snow={},near=[];
  const jumps=[],cliffs=[];
  for(const f of features.filter(f=>f.kind==='kicker'||f.kind==='cliff')){
    const speeds=[f.speed[0],(f.speed[0]+f.speed[1])/2,f.speed[1]],runs=speeds.map(target=>{
      const r=calibrate(world,f,target),air=r.flight?.air??null,impact=r.flight?.impact??null;
      const speedPass=r.flight!==null&&Math.abs(r.incoming-target)<.1;
      return {target,initial:r.initial,incoming:r.flight?.speed??r.lipSpeed,air,impact,crash:r.crash,collisions:r.collisions,
        pass:speedPass&&air!==null&&(!f.id.startsWith('practice')&&f.kind==='kicker'?air>=f.air[0]&&air<=f.air[1]:f.kind==='cliff'||air>=.4&&air<=.6)&&impact<=(f.kind==='cliff'?1.2:.8)&&!r.crash&&r.collisions.length===0};
    });
    if(calibrateApproaches){f.approach.speed=runs[1].initial;const drop=world.drops.find(d=>(d.id==='jump-valley'&&f.id==='jv-1')||(d.id==='big-air'&&f.id==='bigair-1'));if(drop)drop.speed=f.approach.speed;}
    const retry=runRide(world,f.approach,15,f);
    const retrySpeed=retry.flight?.speed??null,retryPass=retrySpeed!==null&&retrySpeed>=f.speed[0]&&retrySpeed<=f.speed[1]&&!retry.crash;
    const row={id:f.id,name:f.name,size:f.size,height:f.height,runs,retry:{speed:retrySpeed,crash:retry.crash,pass:retryPass},pass:runs.every(r=>r.pass)&&retryPass};
    (f.kind==='kicker'?jumps:cliffs).push(row);
  }
  const drops=world.drops.map(d=>{
    const r=runRide(world,{...d,speed:d.speed??0}),required=d.level<=2?25:6;
    const route=traceValley(world,d);let distance=Infinity,station=null;
    for(const p of route.points)for(const s of stations){const dist=Math.hypot(p.x-s.x,p.z-s.z);if(dist<distance){distance=dist;station=s.id;}}
    let finishDistance=Infinity;for(const p of route.points){const s=stations.find(s=>s.id===d.finish);if(s)finishDistance=Math.min(finishDistance,Math.hypot(p.x-s.x,p.z-s.z));}
    return {id:d.id,name:d.name,level:d.level,kind:d.kind,finish:d.finish,hidden:d.hidden,crash:r.crash,collisions:r.collisions,rockSeconds:r.rockSeconds,end:r.end,requiredSeconds:required,safe:!r.crash||r.crash.time>=required,stationDistance:distance,station,finishDistance,routeReason:route.reason,stationPass:distance<=150&&finishDistance<=150};
  });
  const park=world.drops.find(d=>d.id==='jump-valley'),parkRide=park?runRide(world,{...park,speed:park.speed??0},50):null;
  const parkFeatures=features.filter(f=>f.id.startsWith('jv-'));
  const parkVisits=parkFeatures.map(f=>{const flights=parkRide?.flights.filter(p=>{const t=local(f,p.x,p.z);return t.s>=-18&&t.s<=25&&Math.abs(t.t)<f.width/2&&p.air>=.08;})??[];return {id:f.id,speeds:flights.map(f=>f.speed),pass:flights.some(p=>p.speed>=f.speed[0]&&p.speed<=f.speed[1])};});
  let obstacles=0;const clearance=[];
  for(const f of features){let count=0;for(let s=-60;s<=f.length;s+=10)for(let t=-f.width/2;t<=f.width/2;t+=7){world.obstaclesNear(f.x+Math.sin(f.heading)*s+Math.cos(f.heading)*t,f.z-Math.cos(f.heading)*s+Math.sin(f.heading)*t,2,near);count+=near.length;}clearance.push({id:f.id,obstacles:count});obstacles+=count;}
  const stationAudit=stations.map(s=>{let slope=0,count=0;for(let x=-25;x<=25;x+=5)for(let z=-25;z<=25;z+=5)if(Math.hypot(x,z)<=25){world.sampleSurface(s.x+x,s.z+z,surface);slope=Math.max(slope,Math.acos(surface.ny)*180/Math.PI);world.obstaclesNear(s.x+x,s.z+z,2,near);count+=near.length;}obstacles+=count;return {id:s.id,maxSlope:slope,obstacles:count,pass:slope<=10&&count===0};});
  const geometry=features.filter(f=>f.kind==='cliff').map(f=>{
    let lipMax=0,shelfMax=0,landingMin=90,landingMax=0,maxRock=0;
    for(let s=-25;s<=65;s+=1){const x=f.x+Math.sin(f.heading)*s,z=f.z-Math.cos(f.heading)*s;world.sampleSurface(x,z,surface);world.snowAt(x,z,snow);const a=Math.acos(surface.ny)*180/Math.PI;if(s>=-4&&s<=12)lipMax=Math.max(lipMax,a);if(s<=-5)shelfMax=Math.max(shelfMax,a);if(s>=12&&s<=52){landingMin=Math.min(landingMin,a);landingMax=Math.max(landingMax,a);maxRock=Math.max(maxRock,snow.rock);}}
    return {id:f.id,lipMax,shelfMax,landingMin,landingMax,maxRock,pass:lipMax>=60&&shelfMax<=30&&landingMin>=35&&landingMax<=42&&maxRock<.3};
  });
  const kickerGeometry=features.filter(f=>f.kind==='kicker').map(f=>{
    const p=f.profile,v=(f.speed[0]+f.speed[1])/2/Math.sqrt(1+p.pitch*p.pitch),d=v*(f.air[0]+f.air[1])/2+3;
    let min=90,max=0,rock=0;for(let along=d;along<=d+20;along+=2)for(const side of [-7,0,7]){
      const x=f.x+Math.sin(f.heading)*along+Math.cos(f.heading)*side,z=f.z-Math.cos(f.heading)*along+Math.sin(f.heading)*side;
      world.sampleSurface(x,z,surface);world.snowAt(x,z,snow);const a=Math.acos(surface.ny)*180/Math.PI;min=Math.min(min,a);max=Math.max(max,a);rock=Math.max(rock,snow.rock);
    }
    return {id:f.id,width:f.width,min,max,rock,pass:f.width>=14&&min>=30&&max<=35&&rock<.3};
  });
  return {simulationHashes,jumps,cliffs,drops,park:{visits:parkVisits,crash:parkRide?.crash,pass:!!parkRide&&!parkRide.crash&&parkVisits.every(p=>p.pass)},clearance,stations:stationAudit,cliffGeometry:geometry,kickerGeometry,
    checks:{kickerGeometry:kickerGeometry.length===7&&kickerGeometry.every(g=>g.pass),jumpPhysics:jumps.length===7&&jumps.every(r=>r.pass),parkLine:!!parkRide&&!parkRide.crash&&parkVisits.length===4&&parkVisits.every(p=>p.pass),cliffPhysics:cliffs.length>=8&&cliffs.every(r=>r.pass),dropRides:drops.length===16&&drops.every(d=>d.safe),stationRoutes:drops.length===16&&drops.every(d=>d.stationPass),featureClearance:obstacles===0,stations:stationAudit.length>=5&&stationAudit.every(s=>s.pass),cliffGeometry:geometry.length>=8&&geometry.every(g=>g.pass)}};
}
export function verificationMarkdown(v){
  const fmt=n=>n===null||n===undefined?'—':n.toFixed(3);
  return '# I11 本番格子の物理検査\n\ncreateRide既定値、無操作、1/240秒。速度は雪面上の3次元速度。衝撃はEFH(m)。初速を二分探索し、踏み切り実測速度も併記。飛べなかった走行は不合格。\n\n|台/崖|目標速度|初速|実速度|滞空s|衝撃m|転倒|合否|\n|---|---:|---:|---:|---:|---:|---|---|\n'+[...v.jumps,...v.cliffs].flatMap(f=>f.runs.map(r=>`|${f.id}|${r.target}|${fmt(r.initial)}|${fmt(r.incoming)}|${fmt(r.air)}|${fmt(r.impact)}|${r.crash?`${r.crash.reason}@${fmt(r.crash.time)}s`:'なし'}|${r.pass?'○':'未達'}|`)).join('\n')+
  '\n\n|出発地点|難度/種類|駅|無操作25s|岩の秒数|駅までm|指定駅までm|経路終了|\n|---|---|---|---|---:|---:|---:|---|\n'+v.drops.map(d=>`|${d.name}|${d.level}/${d.kind}|${d.finish}|${d.crash?`${d.crash.reason}@${fmt(d.crash.time)}s`:'転倒なし'}|${fmt(d.rockSeconds)}|${fmt(d.stationDistance)}|${fmt(d.finishDistance)}|${d.routeReason}|`).join('\n')+`\n\n判定: ${JSON.stringify(v.checks)}\n\n連続パーク: ${JSON.stringify(v.park)}\n\n崖の寸法検査: ${JSON.stringify(v.cliffGeometry)}\n\n駅: ${JSON.stringify(v.stations)}\n\n台の着地: ${JSON.stringify(v.kickerGeometry)}\n\n物理ソースSHA-256: ${JSON.stringify(v.simulationHashes)}\n`;
}

/** Search nearby existing snow for entry safety; never modify the simulation to pass a ride. */
export function chooseSafeEntrances(world,makeDrops,createWorld){
  const changes=[];
  for(let index=0;index<world.drops.length;index++){
    const original={...world.drops[index]};if(original.kind==='park'||original.kind==='bigair')continue;
    const required=original.level<=2?25:6,base=runRide(createWorld(world.meta,world.buffers),{...original,speed:0},required);
    const entrySurface={};world.sampleSurface(original.x,original.z,entrySurface);
    if(!base.crash&&Math.acos(entrySurface.ny)*180/Math.PI<=42&&checkDrop(world.meta,world.buffers,original).safe)continue;
    let selected=null;
    for(const radius of [72,144]){for(let i=0;i<8;i++){
      const angle=i*Math.PI/4,x=original.x+Math.cos(angle)*radius,z=original.z+Math.sin(angle)*radius;
      let d;try{d=makeDrops(world.meta,world.buffers,[{...original,x,z,heading:undefined}])[0];}catch{continue;}
      world.drops[index]=d;
      const r=runRide(createWorld(world.meta,world.buffers),{...d,speed:0},required);
      if(!r.crash){selected=d;break;}
    }if(selected)break;}
    world.drops[index]=selected??original;
    changes.push({id:original.id,old:{x:original.x,z:original.z},next:{x:world.drops[index].x,z:world.drops[index].z},pass:!!selected});
  }
  return changes;
}
