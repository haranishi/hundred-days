import {paintGullySnow} from './gully-snow.js';
import {groomSettlementRoads} from './settlement-roads.js';
import {settlementFlood} from './settlement-drainage.js';
import {forestNearest,forestSamples,groomForestTrail} from './forest-trail.js';
import {parkLocal} from './park-search.js';
import {parkBands,parkKickers} from './park-features.js';
import {spline,clamp} from '../../../src/world/surface-math.js';
import {periodicNoise as noise} from './noise.js';
import {hashString} from './rng.js';
import {smooth,lakeRadius,lakeInside,glacierCoord,glacierHeight,glacierWidth,glacierWeight,glacierStep,GLACIER_STEPS,trailDistance,zoneId,RESERVED,reservedDistance,streamX,setPistes,pathDistance} from './valley-layout.js';
import {foundations,foundationWeight} from './valley-objects.js';
import {VALLEY as VALLEY_LINE} from './alpine.js';
import {boundaryHeight} from './landscape-inputs.js';
const readAt=(a,c,x,z)=>spline(a,c.grid,(x+2048)/c.cell-.5,(z+2048)/c.cell-.5);
export function addGlacierAndEdges(height,c,seed){
 const original=height.slice(),s=hashString(seed+':fractures');
 for(let j=0;j<c.grid;j++)for(let i=0;i<c.grid;i++){
  const k=j*c.grid+i,x=(i+.5)*c.cell-2048,z=(j+.5)*c.cell-2048,g=glacierCoord(x,z),w=glacierWeight(g);
  if(w>0){const ice=glacierHeight(g.s,g.t),trough=ice-24+35*(2*g.t/glacierWidth(g.s))**2;const bed=Math.min(height[k],trough);height[k]=height[k]*(1-w)+(bed+Math.max(0,ice-bed))*w;}
  const slope=Math.hypot(readAt(original,c,x+8,z)-readAt(original,c,x-8,z),readAt(original,c,x,z+8)-readAt(original,c,x,z-8))/16;
  if(slope>.75&&w<.01)height[k]+=(1+3*clamp((slope-.75)/.7,0,1))*(.5-Math.abs(noise((x*.83+z*.55)/13,(-x*.55+z*.83)/65,65536,s)));
  const edge=2048-Math.max(Math.abs(x),Math.abs(z));if(edge<300){const ew=1-smooth(edge/300),low=(readAt(original,c,x-80,z)+readAt(original,c,x+80,z)+readAt(original,c,x,z-80)+readAt(original,c,x,z+80))/4; height[k]=height[k]*(1-ew)+((1-ew)*low+ew*boundaryHeight(x,z))*ew;}
  if(lakeRadius(x,z)<1.035)height[k]=1180;
 }
}
/** Morphological snow deposition. Its thickness, rather than a slope paint, exposes rock. */
export function depositSnow(rock,c){
 const n=c.grid,a=rock.slice(),temp=new Float32Array(a.length),radius=Math.max(1,Math.round(12/c.cell));
 for(let pass=0;pass<6;pass++){
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const k=j*n+i;temp[k]=(a[j*n+Math.max(0,i-radius)]+2*a[k]+a[j*n+Math.min(n-1,i+radius)])/4;}
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const k=j*n+i;a[k]=Math.max(rock[k]+1.4,(temp[Math.max(0,j-radius)*n+i]+2*temp[k]+temp[Math.min(n-1,j+radius)*n+i])/4);}
 }
 const depth=new Float32Array(a.length);
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const k=j*n+i,x=(i+.5)*c.cell-2048,z=(j+.5)*c.cell-2048,h=rock[k],hx=(readAt(rock,c,x+8,z)-readAt(rock,c,x-8,z))/16,hz=(readAt(rock,c,x,z+8)-readAt(rock,c,x,z-8))/16;
  const convex=h-(readAt(rock,c,x+20,z)+readAt(rock,c,x-20,z)+readAt(rock,c,x,z+20)+readAt(rock,c,x,z-20))/4;
  const retain=(1-smooth((Math.atan(Math.hypot(hx,hz))*180/Math.PI-42)/8))*(1-smooth((convex-1)/4));
  depth[k]=lakeRadius(x,z)<1.035?0:Math.min(convex<-.5?15:5,Math.max(1.4,a[k]-h))*retain;a[k]=h+depth[k];
 }return {height:a,depth};
}
export function makePistes(height,c){
 const read=(x,z)=>readAt(height,c,x,z),lines=[];
 for(let q=0;q<5;q++){let x=1480+(q-2)*55,z=-420;const line=[[x,z]];for(let t=0;t<200;t++){
  const hx=(read(x+16,z)-read(x-16,z))/32,hz=(read(x,z+16)-read(x,z-16))/32,l=Math.hypot(hx,hz);if(l<.002||x<330||x>1740||z>1160||z< -650)break;x-=hx/l*16;z-=hz/l*16;line.push([x,z]);
 }lines.push(line);}
 setPistes(lines);return lines;
}
export function chooseReserve(height,c){
 let best=null;const read=(x,z)=>readAt(height,c,x,z);
 for(let z=-450;z<650;z+=80)for(let x=550;x<1500;x+=80){const hx=(read(x+12,z)-read(x-12,z))/24,hz=(read(x,z+12)-read(x,z-12))/24,heading=Math.atan2(-hx,hz);let error=0,min=90,max=0,inside=true;
  for(let s=0;s<=400;s+=25)for(const t of [-30,0,30]){const xx=x+Math.sin(heading)*s+Math.cos(heading)*t,zz=z-Math.cos(heading)*s+Math.sin(heading)*t,a=Math.atan(Math.hypot(read(xx+8,zz)-read(xx-8,zz),read(xx,zz+8)-read(xx,zz-8))/16)*180/Math.PI;if(xx<350||xx>1700||zz< -600||zz>1150)inside=false;min=Math.min(min,a);max=Math.max(max,a);error+=Math.max(0,18-a,a-24)**2;}
  if(inside&&(!best||error<best.error))best={x,z,heading,error,min,max};
 }Object.assign(RESERVED,{x:best.x,z:best.z,heading:best.heading,angle:(best.min+best.max)/2,slopeRange:[best.min,best.max]});return {...RESERVED};
}
/**
 * 谷の下の滑走ルート（集落へ下る最後の 800 m）を、圧雪車がならした帯にする：線に沿って必ず下り、横断は浅い皿（中央が低い）。
 * ならす前は、無操作で滑ると、小さなこぶで脇へそれて木に当たった。最初の出発地点（初雪の練習斜面）は、ここを下る。
 * 変えるのは、線から 80 m 以内・Z 440〜1,250 だけ（ほかの場所の高さは変えない）。
 */
export const HOME_RUN={from:440,to:1250,half:46,blend:34};
export function groomHomeRun(height,c){
 const pts=[];for(let i=1;i<VALLEY_LINE.length;i++){let [ax,az]=VALLEY_LINE[i-1],[bx,bz]=VALLEY_LINE[i];if(bz<=HOME_RUN.from||az>=HOME_RUN.to)continue;
  if(az<HOME_RUN.from){const t=(HOME_RUN.from-az)/(bz-az);ax+=(bx-ax)*t;az=HOME_RUN.from;}if(bz>HOME_RUN.to){const t=(HOME_RUN.to-az)/(bz-az);bx=ax+(bx-ax)*t;bz=HOME_RUN.to;}
  if(!pts.length)pts.push([ax,az]);pts.push([bx,bz]);}
 // 角を丸める（角を 3 回切る）。谷の線は 180 m ごとに 40° ほど折れている。折れたままだと、速さの出た滑走者が、曲がりで帯から飛び出した
 for(let pass=0;pass<3;pass++){const out=[pts[0]];for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];out.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);}out.push(pts.at(-1));pts.length=0;pts.push(...out);}
 // 線に沿って 4 m おきに、いまの面の高さを読む
 const samples=[];let total=0;
 for(let i=1;i<pts.length;i++){const [ax,az]=pts[i-1],[bx,bz]=pts[i],len=Math.hypot(bx-ax,bz-az),n=Math.max(1,Math.round(len/4));
  for(let q=i===1?0:1;q<=n;q++){const t=q/n,x=ax+(bx-ax)*t,z=az+(bz-az)*t;samples.push({x,z,s:total+len*t,h:readAt(height,c,x,z)});}total+=len;}
 // ならして（前後 20 m の平均）、上から下へ必ず下る形に直す（少なくとも 5%）
 const raw=samples.map(p=>p.h);for(let i=0;i<samples.length;i++){let sum=0,n=0;for(let q=Math.max(0,i-5);q<=Math.min(samples.length-1,i+5);q++){sum+=raw[q];n++;}samples[i].h=sum/n;}
 for(let i=1;i<samples.length;i++)samples[i].h=Math.min(samples[i].h,samples[i-1].h-.05*(samples[i].s-samples[i-1].s));
 const reach=HOME_RUN.half+HOME_RUN.blend,x0=Math.min(...pts.map(p=>p[0]))-reach,x1=Math.max(...pts.map(p=>p[0]))+reach;
 const i0=Math.max(1,Math.floor((x0+2048)/c.cell)),i1=Math.min(c.grid-2,Math.ceil((x1+2048)/c.cell)),j0=Math.max(1,Math.floor((HOME_RUN.from-reach+2048)/c.cell)),j1=Math.min(c.grid-2,Math.ceil((HOME_RUN.to+reach+2048)/c.cell));
 for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
  const x=(i+.5)*c.cell-2048,z=(j+.5)*c.cell-2048;let best=Infinity;
  for(const p of samples){const d=(p.x-x)**2+(p.z-z)**2;if(d<best)best=d;}
  const d=Math.sqrt(best);if(d>=reach)continue;
  // 中央の高さと、線に沿った位置は、近い点ほど重くした平均で決める。「いちばん近い点」だけで決めると、線の曲がりの内側で、
  // 近い点が手前の区間から先の区間へ飛び、そこに 10 m の段ができた（無操作で滑ると、そこで飛んで転んだ）
  let sw=0,sh=0,ss=0;for(const p of samples){const q=Math.sqrt((p.x-x)**2+(p.z-z)**2)-d;if(q>60)continue;const w=Math.exp(-q/9);sw+=w;sh+=w*p.h;ss+=w*p.s;}
  const hc=sh/sw,along=ss/sw;
  // 帯の両端は、80 m かけて元の地形へ戻す。横は、46 m まではならした面、その外 34 m でなじませる
  const w=(1-smooth((d-HOME_RUN.half)/HOME_RUN.blend))*smooth(along/80)*(1-smooth((along-(total-80))/80));
  // 横断は、中央が低い皿（46 m 先で 6 m 高い）。曲がりの外側が土手になって、無操作でも帯の中へ戻される
  const k=j*c.grid+i;height[k]=height[k]*(1-w)+(hc+.0028*d*d)*w;
 }
}
export function finishValleyTerrain(height,c,structures){
 groomHomeRun(height,c);
 structures.preDrainage=settlementFlood(height,c,{apply:true});
 structures.forestTrail=groomForestTrail(height,c);
 // 森の道の下の 200 m は、谷の広い帯（ならした滑走ルート）へ合流する。並木は、帯の外だけに立てる：
 // 帯の中にも立てたら、谷のゲレンデを無操作で下る人が、30 秒目に、帯の真ん中の並木へ当たって転んだ（2026-11-11。I17d の後の裏取り）
 {const line=VALLEY_LINE.map(p=>[p[0],p[1]]),ft=structures.forestTrail;ft.trees=ft.trees.filter(t=>pathDistance(t.x,t.z,line)>HOME_RUN.half+8);}
 groomSettlementRoads(height,c,structures.roads);
 const original=height.slice(),buildings=foundations(structures);
 // 建物の下の高さは、できた地形から取る（決め打ちの高さへ合わせると、地形とずれた所に穴や台ができる）
 for(const b of buildings)b.y=readAt(original,c,b.x,b.z);
 {const b=structures.bridge;b.y=(readAt(original,c,b.x-13,b.z)+readAt(original,c,b.x+13,b.z))/2;}
 for(let j=0;j<c.grid;j++)for(let i=0;i<c.grid;i++){
  const k=j*c.grid+i,x=(i+.5)*c.cell-2048,z=(j+.5)*c.cell-2048;
  const d=trailDistance(x,z);if(d<40&&forestNearest(x,z,structures.forestTrail.samples).distance>12){const hx=(readAt(original,c,x+8,z)-readAt(original,c,x-8,z))/16,hz=(readAt(original,c,x,z+8)-readAt(original,c,x,z-8))/16,l=Math.hypot(hx,hz)||1;const across=(readAt(original,c,x-hz/l*20,z+hx/l*20)+readAt(original,c,x+hz/l*20,z-hx/l*20))/2;height[k]=height[k]*(smooth((d-25)/15)) + Math.max(original[k]-.5,across)*(1-smooth((d-25)/15));}

  const b=structures.bridge,bank=(1-smooth((Math.abs(x-b.x)-15)/12))*(1-smooth((Math.abs(z-b.z)-5)/12));height[k]=height[k]*(1-bank)+b.y*bank;
  for(const b of buildings){const dx=x-b.x,dz=z-b.z,u=Math.abs(dx*Math.sin(b.yaw)-dz*Math.cos(b.yaw))-b.length/2-3,v=Math.abs(dx*Math.cos(b.yaw)+dz*Math.sin(b.yaw))-b.width/2-3,d=Math.max(u,v),w=1-smooth(d/12);if(w>0)height[k]=height[k]*(1-w)+b.y*w;}
  if(z>1290&&z<1405){const axis=streamX(z),d=Math.abs(x-axis),w=(1-smooth((d-4)/5))*smooth((z-1290)/15),naturalBanks=(readAt(original,c,axis-11,z)+readAt(original,c,axis+11,z))/2,bridgeBlend=(1-smooth((Math.abs(z-structures.bridge.z)-5)/16)),banks=naturalBanks*(1-bridgeBlend)+structures.bridge.y*bridgeBlend,bed=banks-2.5;height[k]=height[k]*(1-w)+bed*w;}
  if(lakeRadius(x,z)<1.035)height[k]=1180;
 }
 groomSettlementRoads(height,c,structures.roads);
 structures.drainage=settlementFlood(height,c,{apply:true});
 for(const b of buildings){b.y=readAt(height,c,b.x,b.z);const reach=Math.hypot(b.length,b.width)/2+15;for(let j=Math.floor((b.z-reach+2048)/c.cell);j<=Math.ceil((b.z+reach+2048)/c.cell);j++)for(let i=Math.floor((b.x-reach+2048)/c.cell);i<=Math.ceil((b.x+reach+2048)/c.cell);i++){const x=(i+.5)*c.cell-2048,z=(j+.5)*c.cell-2048,dx=x-b.x,dz=z-b.z,u=Math.abs(dx*Math.sin(b.yaw)-dz*Math.cos(b.yaw))-b.length/2-3,v=Math.abs(dx*Math.cos(b.yaw)+dz*Math.sin(b.yaw))-b.width/2-3,d=Math.max(u,v),w=1-smooth(d/3),k=j*c.grid+i;if(w>0)height[k]=height[k]*(1-w)+b.y*w;}}
}
/** extra：山の形を作る側が出した地図（glacier：氷河の帯か・ice：氷の面か）。あれば、式の氷河ではなく、こちらを使う */
export function makeValleySnow(height,c,seed,structures,depth,extra={}){
 const parkFeatures=extra.park?parkKickers(extra.park):[],forest=structures.forestTrail?.samples??forestSamples();
 const m=c.maskGrid,masksA=new Uint8Array(m*m*4),masksB=new Uint8Array(m*m*4),s=hashString(seed+':forest'),buildings=foundations(structures),read=(x,z)=>readAt(height,c,x,z);
 for(let j=0;j<m;j++)for(let i=0;i<m;i++){
  const x=(i+.5)*c.cell*2-2048,z=(j+.5)*c.cell*2-2048,k=(j*m+i)*4,h=read(x,z),hx=(read(x+8,z)-read(x-8,z))/16,hz=(read(x,z+8)-read(x,z-8))/16,angle=Math.atan(Math.hypot(hx,hz))*180/Math.PI;
  const lake=lakeInside(x,z),g=glacierCoord(x,z),glacier=extra.glacier?readAt(extra.glacier,c,x,z)>.35:glacierWeight(g)>.25,rd=reservedDistance(x,z),reserved=rd.along>=-8&&rd.along<=408&&Math.abs(rd.across)<(30+9*noise(rd.along/55,.3,65536,s+61))*smooth((rd.along+8)/40)*smooth((408-rd.along)/40),piste=trailDistance(x,z)<25+17*noise(x/120,z/120,65536,s+91);
  const road=structures.roads.some(line=>pathDistance(x,z,line)<10),settled=buildings.some(b=>foundationWeight(b,x,z,18)<1),station=[structures.lift.base,structures.lift.top,{x:-80,z:100},{x:205,z:1255}].some(b=>Math.hypot(x-b.x,z-b.z)<32+9*noise(x/23,z/23,65536,s+31)),stream=z>1290&&z<1405&&Math.abs(x-streamX(z))<13;
  // 集落の広場：山荘と橋のあいだ・山荘の前は、木を生やさない（橋から山荘が見えるように）
  const green=Math.hypot((x-215)/98,(z-1338)/64)<1;
  // 谷の底の滑走ルート：山頂の下の盆から集落まで、森を切り開いた帯が続く（本人の配置の指示「中央＝山頂から麓へ連続して下る谷と滑走ルート」。幅は場所でゆらす）
  const runD=pathDistance(x,z,VALLEY_LINE),run=z>-1050&&runD<22+20*(.5+.5*noise(x/140,z/140,65536,s+81));
  // ならした帯（谷の下の 800 m）：木を、帯の幅より広く除く。雪は圧雪
  const home=z>HOME_RUN.from-20&&z<HOME_RUN.to+20&&runD<HOME_RUN.half+10+8*noise(x/60,z/60,65536,s+83);
  // リフトの下の切り開き（上空から、森を抜ける細い線として見える）
  const liftCut=pathDistance(x,z,[[structures.lift.base.x,structures.lift.base.z],[structures.lift.top.x,structures.lift.top.z]])<9;
  const forestD=forestNearest(x,z,forest).distance;
  // 森の道のほかの理由で開けてある所（谷の広い帯・道・駅・集落・湖など）
  const openElse=lake||glacier||piste||road||reserved||settled||station||stream||green||run||home||liftCut;
  const open=forestD<9||openElse;
  let d=depth?readAt(depth,c,x,z):1.4;if(open&&!lake)d=Math.max(.3,d);
  // 森の道をならした範囲（道の両わき 80 m）は、雪で覆う。切った土手が、雪の浅い所＝岩として描かれ、
  // 湖の岸から見て、斜面にベージュの板が立っているように見えた（見た目の採点 3 周目）
  if(forestD<80&&!lake)d=Math.max(.9,d);
  const rock=lake||glacier?0:1-smooth((d-.08)/.07),convex=h-(read(x+30,z)+read(x-30,z)+read(x,z+30)+read(x,z-30))/4;
  const group=noise(x/390,z/510,65536,s),treeline=1750-35*clamp(convex,-2,2)+45*noise(x/650,z/630,65536,s+4),sun=clamp(.6-.4*(hx+hz)/Math.sqrt(1+hx*hx+hz*hz),0,1);
  // 森は、森の上の端より下の、急すぎない面を広く覆う（参考画像は、谷の両側と麓が針葉樹林）。大きなむら（group）は、濃さを少しゆらすだけにする
  // 急な斜面（40° 前後まで）にも木を生やす：谷の西側は 35〜45° なので、31° で切ると、谷の片側だけ森が無かった
  // 林間の空き地：50〜120 m の雑音で、森の 3 割ほどを開ける。大きなむら（group）でも、開けた雪原を混ぜる
  // （森の上の端より下を、ほぼ全部覆っていたときは、上空から、灰緑の平らな面に見えた：見た目の採点 2 周目）
  const glade=.6*noise(x/95,z/120,65536,s+71)+.4*noise(x/38,z/41,65536,s+72);
  // 沢（くぼんだ所）には木を生やさない：雪崩の通り道。森は、沢と沢のあいだの背に、舌の形で残る（雑音の空き地だけだと、迷彩の模様に見えた）
  // （くぼみの判定は、はっきりした沢だけ：ゆるいくぼみまで切ると、森がほとんど消えた）
  const gully=smooth((-(h-(read(x+45,z)+read(x-45,z)+read(x,z+45)+read(x,z-45))/4)-2.4)/2.6);
  let trees=.9*smooth((treeline-h)/85)*(1-smooth((angle-38)/8))*(.5+.5*smooth((group+.45)/.5))*smooth((glade+.52)/.3)*(1-.9*gully)*smooth(d/.7)*(.65+.35*sun);if(open)trees=0;
  // 地図の縁の帯（地形をならしてある）は、木を、ゆらいだ線で減らす（そのままだと、縁に沿って、まっすぐな森の枠ができた）
  trees*=smooth((2048-Math.max(Math.abs(x),Math.abs(z))-70-150*(.5+.5*noise(x/210,z/210,65536,s+51)))/170);
  // 森の道の並木（道の両わき 9〜16 m を、木でいっぱいにする）。ほかの理由で開けてある所には立てない：
  // 森の道の下の 200 m は、谷の広い帯へ合流する。そこにも並木を立てたら、谷のゲレンデを無操作で下る人が、帯の真ん中の木へ当たって転んだ（2026-11-11）
  if(forestD>=9&&forestD<=16&&!openElse)trees=1;
  const front=extra.ice?glacier&&readAt(extra.ice,c,x,z)>.45:glacier&&GLACIER_STEPS.some(at=>{const v=glacierStep(g.s,g.t)-at;return v>=0&&v<14;}),ice=lake?.65:glacier?(front?.96:.4+.07*noise(x/31,z/31,65536,s+41)):.015,powder=forestD<8||piste||road||(home&&runD<HOME_RUN.half)?.05:glacier?(front?.02:.85):.75*(1-rock);
  masksA[k]=Math.round(clamp(d/.02,0,255));masksA[k+1]=Math.round(powder*255);masksA[k+2]=Math.round(ice*255);masksA[k+3]=Math.round(rock*255);
  for(const band of extra.park?parkBands(extra.park):[]){const q=parkLocal(band,x,z);if(q.s>=-24&&q.s<=band.length+24&&Math.abs(q.t)<=99){trees=0;masksA[k+1]=13;masksA[k+2]=masksA[k+3]=0;for(const f of parkFeatures){const r=parkLocal(f,x,z);if(r.s>=0&&r.s<=f.landingEnd+20&&Math.abs(r.t)<=12){masksA[k]=Math.max(50,masksA[k]);masksA[k+1]=255;}}}}
  masksB[k]=Math.round(trees*255);masksB[k+1]=0;masksB[k+2]=Math.round(sun*255);masksB[k+3]=zoneId(x,z,h);
 }const snowGullies=paintGullySnow(height,c,masksA);return {height,masksA,masksB,snowGullies};
}
/**
 * 湖の絵（0＝陸、1〜199＝氷、200〜255＝水）。描画と、水に落ちる判定（world.waterAt）が、同じ絵を読む。
 * 氷の板と水のまだらを、ここで絵に焼く（描画の側で境目を崩すと、見た目は氷なのに水に落ちる所ができる）。
 * 氷の値は、厚い所（雪の乗った白）で小さく、水に近い薄い所で大きい（描画が、透けた青にする）。
 * 橋の下の流れ（山荘の西から湖まで）も、水にする。
 */
export function makeLake(seed){
 const grid=1024,size=700,x0=-405,z0=1158,bytes=new Uint8Array(grid**2),s=hashString(seed+':lake');
 for(let j=0;j<grid;j++)for(let i=0;i<grid;i++){const x=x0+(i+.5)*size/grid,z=z0+(j+.5)*size/grid,r=lakeRadius(x,z),k=j*grid+i;
  // 流れ：幅 5 m ほど。湖へ入る所で広がる
  if(z>1302&&z<1406&&Math.abs(x-streamX(z))<2.4+3.5*smooth((z-1380)/22)&&r>=.98){bytes[k]=210;continue;}
  if(r>=1)continue;
  // 水の見えやすさ：湖の中ほどで高く、岸の近くで低い。大きなむらで、開けた水面の形を決める
  const open=noise(x/95,z/110,65536,s)*.55+.62*(1-r/.82)-.12;
  // 氷の板：水面の縁では、板が割れて散らばる（中くらいと細かい雑音を重ねる）
  const plate=.42*noise(x/26,z/29,65536,s+5)+.2*noise(x/9,z/9.5,65536,s+7);
  const v=open+plate*(1-smooth((Math.abs(open)-.05)/.3));
  if(v>.06)bytes[k]=Math.round(205+50*clamp((open-.06)/.5,0,1));
  else bytes[k]=Math.round(clamp(70+115*smooth((v+.34)/.4),40,190));
 }
 return {meta:{level:1180,x0,z0,size,grid},bytes};
}
