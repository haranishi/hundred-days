import {forestNearest,forestSamples} from './forest-trail.js';
import {createObstacleStore} from '../../../src/world/obstacles.js';
import {traceValley} from './stations.js';
import {runRide} from './verify-features.js';
import {RESERVED} from './valley-layout.js';
export function makeStructures(){
 // 山荘は、橋のすぐ東・流れの東の岸（参考画像は、橋の向こうに山荘が大きく見える）。正面は西（流れと湖）を向く
 // 建物の正面は、南〜南西（湖・橋・朝日の側）を向ける。西向きにすると、朝の光で正面が陰になった。真南にすると、橋からは妻の面しか見えなかった
 const lodge={x:218,y:1188,z:1324,yaw:-1.18,length:46,width:19};
 const chalets=[[262,1232],[300,1262],[318,1208],[268,1178],[342,1160],[300,1128],[368,1228],[392,1118]].map(([x,z],i)=>({x,y:1194+(1290-z)*.055,z,yaw:-Math.PI/2+(i%3-1)*.3,variant:i%3,length:[10.7,12.2,13.7][i%3],width:[8.5,9.85,10.15][i%3]}));
 const yaw=Math.atan2(1080,1600),base={x:400,y:1200,z:1180,yaw,length:14.5,width:8.2},top={x:1480,y:1880,z:-420,yaw,length:14.5,width:8.2};
 const towers=Array.from({length:8},(_,i)=>{const t=(i+1)/9;return {x:base.x+(top.x-base.x)*t,y:0,z:base.z+(top.z-base.z)*t,height:14,yaw};});
 return {lodge,chalets,bridge:{x:160,y:1184,z:1345,yaw:Math.PI/2,length:22,width:4,rise:2.2},lift:{base,top,towers},// 道：リフト乗り場 → 集落 → 山荘の西（流れとのあいだ）→ 橋。もう 1 本は、集落の中を北へ
  roads:[[[400,1180],[345,1196],[292,1236],[236,1280],[196,1298],[182,1330],[171,1345]],[[292,1236],[294,1178],[322,1142],[372,1100]]]};
}
export function foundations(structures){return [structures.lodge,...structures.chalets,structures.lift.base,structures.lift.top];}
export function foundationWeight(b,x,z,margin=0){const dx=x-b.x,dz=z-b.z,s=Math.sin(b.yaw),c=Math.cos(b.yaw),u=dx*s-dz*c,v=dx*c+dz*s;return Math.max(Math.abs(u)/(b.length/2+margin),Math.abs(v)/(b.width/2+margin));}
const CANDIDATES=[
 // 最初の出発地点（並びの先頭＝ゲームを開いて最初に滑る所）は、森の道。2026-11-11 に、谷の広い帯から入れ替えた。
 // でたらめな舵で 60 回ずつ滑らせた比べ：森の道は転倒 0 回・最高時速 28 km。谷の広い帯は、どこから出ても転倒 5〜36 回・最高時速 70〜82 km
 // （ならした帯でも、傾きが 15〜26° ある。無操作で時速 95 km に達し、「練習斜面」の名前に合わなかった：体験の採点 1 周目）。
 // 谷の広い帯は、名前を「谷のゲレンデ」に変えて、速さを楽しむ地点として残す（集落まで 650 m・35 秒ほど）
 ['forest-trail','森の道',1,'forest',480,1020,'はじめての一本に。針葉樹のあいだの、ゆるい道を湖畔へ下る'],
 ['first-snow','谷のゲレンデ',2,'open',35,600,'谷の底の、広くならした雪の帯を、集落と湖へ下る。速さが乗る'],
 ['east-piste','東のゲレンデ',1,'open',1460,-380,'リフト上駅の前の広い滑走面'],
 ['jump-valley','ジャンプ台の列',2,'park',1280,-380,'次の台づくりに残した東の帯'],
 ['east-ridge','東の尾根',2,'ridge',1560,-600,'東の尾根から谷を見渡す'],
 ['valley-head','谷の入口',2,'gully',40,-1000,'上の盆から中央の谷へ入る'],
 ['upper-bowl','上の雪原',2,'open',60,-1250,'山頂の下に広がる雪の盆'],
 ['big-air','大ジャンプ台',3,'bigair',1000,187,'東斜面の中ほどの開けた面'],
 ['rock-garden','岩の庭',3,'steep',-93,-280,'中央の谷の散岩を縫う面'],
 ['summit','山頂',3,'steep',158,-1484,'北の山頂直下から湖へ続く長い線'],
 ['glacier-top','氷河の上',4,'steep',-1060,-1262,'西の青い氷河の上。氷の段のあいだを縫う'],
 ['west-couloir','西壁のルンゼ',4,'chute',-1213,-433,'西の岩壁を切る雪の溝'],
 ['ice-shoulder','氷の段の肩',4,'steep',-867,-1120,'氷河の段を横から望む肩'],
 ['rock-window','岩峰の窓',4,'steep',-700,-1550,'北の岩稜の間から谷を望む'],
 ['wind-saddle','風の鞍部',3,'ridge',1700,-200,'東の尾根の風が抜ける鞍部'],
 ['lake-shelf','湖を見おろす棚',3,'ridge',-1060,1320,'西の尾根の南から湖を見下ろす']
];
export function makeValleyDrops(world){return CANDIDATES.map(([id,name,level,kind,x,z,about],i)=>{const s=world.sampleSurface(x,z,{});return {id,name,level,kind,x,z,y:s.h,heading:Math.atan2(s.nx,-s.nz),zone:world.zoneAt(x,z).id,about,hidden:i>=12,finish:'village'};});}
export function findSafeValleyDrops(world){
 const audit=[],base=world.meta.stations.find(p=>p.id==='village');
 for(const d of world.drops){
  // 森の道（最初の一本）は、秒速 6 m の押し出しで始める。止まった所からだと、8 秒で時速 18 km にしかならず、出だしが遅かった（体験の採点 2 周目）
  if(d.id==='forest-trail'&&world.meta.structures.forestTrail){const q=forestNearest(d.x,d.z,forestSamples());Object.assign(d,{heading:q.heading,speed:6,y:world.heightAt(d.x,d.z)});audit.push({id:d.id,pass:!runRide(world,d,25).crash});continue;}
  if(d.speed!==undefined)continue;
  const original={...d},origin=d.id==='summit'?{x:40,z:-1660}:{x:d.x,z:d.z},required=d.level<=2?25:6;
  let best=null,attempts=0;const fallback=[];
  if(d.id==='summit'&&Math.hypot(d.x-40,d.z+1660)<=250){world.obstaclesNear=createObstacleStore(world);const r=runRide(world,{...d,speed:0},required);attempts++;if(!r.crash){const route=traceValley(world,d),distance=Math.min(...route.points.map(p=>Math.hypot(p.x-base.x,p.z-base.z)));best={candidate:{...d},ring:Math.hypot(d.x-40,d.z+1660),distance};}}
  for(let ring=0;ring<=240&&!best;ring+=20){const connected=[];
   for(let k=0;k<(ring?16:1);k++){
    const x=origin.x+ring*Math.cos(k*Math.PI/8),z=origin.z+ring*Math.sin(k*Math.PI/8),sf=world.sampleSurface(x,z,{}),snow=world.snowAt(x,z,{}),angle=Math.acos(sf.ny)*180/Math.PI;
    if(Math.abs(x)>world.half-80||Math.abs(z)>world.half-80||angle>(d.id==='summit'?60:44)||snow.rock>.25||world.waterAt(x,z)||d.id==='summit'&&z< -1660)continue;
    const route=traceValley(world,{x,z});let distance=Infinity;for(const p of route.points)distance=Math.min(distance,Math.hypot(p.x-base.x,p.z-base.z));
    const candidate={...original,x,z,y:sf.h,zone:world.zoneAt(x,z).id,heading:Math.atan2(sf.nx,-sf.nz)};
    const p={candidate,distance,ring};if(distance<=150)connected.push(p);else fallback.push(p);
   }
   for(const p of connected){for(const turn of [0,-.4,.4]){Object.assign(d,p.candidate,{heading:p.candidate.heading+turn});world.obstaclesNear=createObstacleStore(world);const r=runRide(world,{...d,speed:0},required);attempts++;
    if(!r.crash&&Math.hypot(r.end.x-d.x,r.end.z-d.z)>5){best={...p,candidate:{...d}};break;}}
    if(best)break;
   }
  }
  if(!best)for(const p of fallback){Object.assign(d,p.candidate);world.obstaclesNear=createObstacleStore(world);const r=runRide(world,{...d,speed:0},required);attempts++;if(!r.crash&&Math.hypot(r.end.x-d.x,r.end.z-d.z)>5){best=p;break;}}
  Object.assign(d,best?.candidate??original);
  audit.push({id:d.id,attempts,offset:Math.hypot(d.x-origin.x,d.z-origin.z),pass:!!best,distance:best?.distance??null,reason:d.id==='summit'&&best?.ring>100?'山頂南100m以内に安全な雪面がないため250m以内で探索':best?null:'250m以内で無操作の安全条件に未達'});
 }
 world.obstaclesNear=createObstacleStore(world);return audit;
}
export function makeValleyStations(world){return [['village','湖畔の村',205,1255,true],['lift-top','リフトの山頂側',1480,-420,false],['valley-mid','谷の中ほど',-80,100,false]].map(([id,name,x,z,base])=>({id,name,x,z,y:world.heightAt(x,z),radius:30,base}));}
/**
 * 参考画像と同じ構図の視点（9 つ）。場所は、新しい山の配置（lib/alpine.js）に合わせてある。
 * 高さに「地面からの高さ」を書いたもの（lift）は、できた地形から決める。
 */
export function makeViews(world){
 const specs=[
  // 上空：南から、52° 見おろす（奥に、地図の外の山並みが続く）
  // （湖の南の岸まで入るよう、見る先を少し南へ。これより引くと、地図の四角い縁が写る：地図の外の山並みは、縁の近くが無地の雪で、境目が見える）
  ['aerial','全体',[0,5300,3000],[0,1500,90],40,null],
  // 真上：山頂から湖までが、ちょうど入る高さ
  ['topdown','真上',[0,6150,0],[0,1500,0],40,null],
  // 山頂の南西の支尾根から、谷と湖を見おろす（右手前に、氷河）
  ['summit','山頂から',[-300,0,-1240],[60,1330,1000],74,34],
  // 西の尾根から張り出した支尾根の上から、谷ごしに、東の斜面と湖を見る
  ['west','西の尾根から',[-800,0,170],[500,1480,900],72,35],
  // 東の斜面の上から、西の岩壁と氷河の谷・山頂を見る（左下に湖）
  ['east','東の斜面から',[1500,0,300],[-800,1700,-300],75,90],
  // 湖の南東の岸から、氷と水ごしに、集落と山を見る
  // （画角を狭くして、対岸の山荘と橋を大きく写す。左奥に山頂）
  ['south','南の岸から',[120,0,1615],[257,1366,640],38,2.4],
  // 氷河の末端のすぐ下から、氷の滝を見上げる
  ['glacier','氷河の下から',[-470,0,-850],[-1010,2330,-1210],60,28],
  // 森の道（ならした道の両わきに、背の高い針葉樹の並木）の上から、道の先を見る。奥に、雪の筋の入った岩壁
  // （湖と山荘は、並木に隠れて写らない。山荘の見える向きへ振ると、並木の片側だけが写って、道に見えなかった）
  ['forest','森の道から',[330,0,1036],[150,1210,1190],62,2.2],
  // 橋の西の岸から、橋ごしに山荘を見る
  ['bridge','橋の手前から',[139,0,1359],[224,1199,1326],40,1.7]];
 return specs.map(([id,name,pos,target,fov,lift],i)=>{if(lift!==null)pos[1]=world.heightAt(pos[0],pos[2])+lift;return {id,name,ref:`0${i+1}-${['aerial','topdown','from-summit','from-west','from-east','from-south','glacier','forest-trail','bridge-lodge'][i]}.png`,pos,target,fov};});
}
export {RESERVED};
