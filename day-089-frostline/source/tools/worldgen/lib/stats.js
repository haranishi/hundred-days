export const SLOPE_LIMITS=[[5,15],[15,30],[30,42],[15,25],[6,14]];
export const SLOPE_LABELS=['<10','10–20','20–35','35–45','>45'];
export function rawStats(a,c) {
  let min=Infinity,max=-Infinity,total=0,channels=0;const bins=[0,0,0,0,0],n=c.grid;
  for(let j=1;j<n-1;j++)for(let i=1;i<n-1;i++){
    const k=j*n+i,h=a[k];min=Math.min(min,h);max=Math.max(max,h);total+=h;
    const hx=(a[k+1]-a[k-1])/(2*c.cell),hz=(a[k+n]-a[k-n])/(2*c.cell),angle=Math.atan(Math.hypot(hx,hz))*180/Math.PI;
    bins[angle<10?0:angle<20?1:angle<35?2:angle<45?3:4]++;
    if((a[k+1]+a[k-1]+a[k+n]+a[k-n]-4*h)/(c.cell*c.cell)>.002)channels++;
  }
  const count=(n-2)**2;return {min,max,relief:max-min,mean:total/count,channelSamples:channels,slopePercent:bins.map(v=>100*v/count)};
}

export function worldStats(world,checkDrop,relaxed=false) {
  const c=world.meta,b=world.buffers,n=c.grid,step=1,surface={},bins=[0,0,0,0,0];
  let min=Infinity,max=-Infinity,count=0,steep=0,snowySteep=0;const snow={};
  for(let j=0;j<n;j+=step)for(let i=0;i<n;i+=step){
    const x=(i+.5)*c.cell-c.size/2,z=(j+.5)*c.cell-c.size/2;world.sampleSurface(x,z,surface);
    min=Math.min(min,surface.h);max=Math.max(max,surface.h);const angle=Math.acos(surface.ny)*180/Math.PI;
    bins[angle<10?0:angle<20?1:angle<35?2:angle<45?3:4]++;count++;
    if(angle>=35&&angle<=50){steep++;world.snowAt(x,z,snow);if(snow.rock<.3)snowySteep++;}
  }
  const slopePercent=bins.map(v=>100*v/count),slopeChecks=slopePercent.map((v,k)=>{
    const [lo,hi]=SLOPE_LIMITS[k],mid=(lo+hi)/2,half=(hi-lo)/2*(relaxed?1.5:1);return v>=mid-half&&v<=mid+half;
  });
  const p=c.practice;let practiceMin=90,practiceMax=0,practiceCurve=0,practiceCount=0;
  for(let z=p.z-p.length/2;z<=p.z+p.length/2;z+=10)for(let x=p.x-p.width/2;x<=p.x+p.width/2;x+=10){
    world.sampleSurface(x,z,surface);const a=Math.acos(surface.ny)*180/Math.PI;practiceMin=Math.min(practiceMin,a);practiceMax=Math.max(practiceMax,a);
    const h=world.heightAt(x,z),hdd=Math.abs(world.heightAt(x,z+1.5)+world.heightAt(x,z-1.5)-2*h)/2.25;practiceCurve=Math.max(practiceCurve,hdd);practiceCount++;
  }
  const near=[];
  const drops=world.drops.map(d=>{
    const check=checkDrop(c,b,d);let obstacleCount=0;
    for(let t=0;t<=150;t+=6){world.obstaclesNear(d.x+Math.sin(d.heading)*t,d.z-Math.cos(d.heading)*t,10,near);obstacleCount+=near.length;}
    world.sampleSurface(d.x,d.z,surface);world.snowAt(d.x,d.z,snow);world.obstaclesNear(d.x,d.z,3,near);
    const slope=Math.acos(surface.ny)*180/Math.PI;
    return {...d,...check,entry150Safe:check.safe,obstacleCount,startSlope:slope,startRock:snow.rock,startSnow:snow.depth,safe:check.safe&&obstacleCount===0};
  });
  const practice={...p,slopeMin:practiceMin,slopeMax:practiceMax,maxSecondDifference:practiceCurve,samples:practiceCount,pass:p.width>=200&&p.length>=300&&practiceMin>=12&&practiceMax<=18&&practiceCurve<.01};
  const checks={size:c.size===6144,relief:max-min>=2000,slopes:slopeChecks.every(Boolean),steepSnow:snowySteep/steep>=.6,practice:practice.pass,drops:drops.length===16&&drops.every(d=>d.safe),firstDrop:world.drops[0]?.id==='first-snow'&&Math.abs(world.drops[0].x-p.x)<=p.width/2&&Math.abs(world.drops[0].z-p.z)<=p.length/2};
  return {steepSnow:{samples:steep,snowy:snowySteep,fraction:snowySteep/steep},seed:c.seed,version:c.version,grid:c.grid,size:c.size,sampling:{count,spacing:c.cell*step},height:{min,max,relief:max-min},slopeLabels:SLOPE_LABELS,slopePercent,slopeLimits:SLOPE_LIMITS,slopeChecks,practice,drops,checks,pass:Object.values(checks).every(Boolean)};
}
export function statsMarkdown(stats) {
  return `# 山の生成統計\n\n種: ${stats.seed} / 格子: ${stats.grid}² / 標高: ${stats.height.min.toFixed(1)}–${stats.height.max.toFixed(1)} m / 差: ${stats.height.relief.toFixed(1)} m\n\n共有雪面を ${stats.sampling.spacing} m 間隔・${stats.sampling.count} 点で計測。\n\n|斜度|面積割合|要件|合否|\n|---|---:|---:|---|\n`+
    stats.slopeLabels.map((label,i)=>`|${label}°|${stats.slopePercent[i].toFixed(2)}%|${SLOPE_LIMITS[i].join('–')}%|${stats.slopeChecks[i]?'合格':'不合格'}|`).join('\n')+
    `\n\n練習斜面: ${stats.practice.width}×${stats.practice.length} m、${stats.practice.slopeMin.toFixed(2)}–${stats.practice.slopeMax.toFixed(2)}°、最大2階差分 ${stats.practice.maxSecondDifference.toFixed(5)} 1/m。\n\n|出発地点|X|Y|Z|向き(rad)|谷向きとの差(°)|区域|難度|前方150m|\n|---|---:|---:|---:|---:|---:|---:|---:|---|\n`+
    stats.drops.map(d=>`|${d.name}|${d.x.toFixed(0)}|${d.y.toFixed(1)}|${d.z.toFixed(0)}|${d.heading.toFixed(3)}|${(d.downhillAngle??NaN).toFixed(2)}|${d.zone}|${d.level}|${d.safe?'合格':'不合格'}|`).join('\n')+
    `\n\n必須条件の数値検査: ${stats.pass?'合格':'不合格'}\n`+
    `\n35〜50°の雪被覆: ${(100*stats.steepSnow.fraction).toFixed(2)}%。判定: ${JSON.stringify(stats.checks)}。\n`+
    (stats.rideRelief?rideMarkdown(stats.rideRelief):'')+
    (stats.drainage?`\n流域: ${stats.drainage.majorChannels}本の主要沢（流域≥50000m²、半径1700m、両岸±100mとの高低差20〜90m）。流路交差全${stats.drainage.routedCrossings}本、合流${stats.drainage.confluences}か所。主要沢の起伏 ${stats.drainage.majorReliefRange.map(v=>v.toFixed(1)).join('–')} m、交差全体の中央値${stats.drainage.relief.median.toFixed(1)} m。全升から端へ排水: ${stats.drainage.allCellsReachBoundary?'可':'不可'}。同心輪候補: ${stats.drainage.rings.coherentRadii.length}。\n`: '');
}

function rideMarkdown(r){
  return `\n小起伏: 原${r.fields.length}か所、開けた10〜28°雪面${(r.openArea/1e6).toFixed(3)}km²の${(r.coverage*100).toFixed(2)}%（${(r.fieldArea/1e6).toFixed(3)}km²）。段${r.ledges.length}か所。練習3峰 Z=${r.practice.centers.map(p=>p.z).join('/')}。\n\n浮ける凸: 20m/s、κ<−9.81cosθ/v²が3m以上。600m×3本（横±10m）、共有雪面を0.5m刻みの勾配追跡。\n\n|出発地点|左/中/右の区間数|個/km|\n|---|---|---:|\n`+
    r.drops.map(d=>`|${d.name}|${d.lines.map(l=>l.count).join('/')}|${d.perKm.toFixed(2)}|`).join('\n')+
    `\n\n全地点平均: ${r.meanPerKm.toFixed(2)}個/km。段の着地20〜32°/障害物なし: ${r.landingAudit.filter(p=>p.landingPass).length}/${r.ledges.length}。I9検査: ${JSON.stringify(r.checks)}。quickは12m格子のため小起伏の形状/曲率は本番3m格子で判定する。\n`;
}
