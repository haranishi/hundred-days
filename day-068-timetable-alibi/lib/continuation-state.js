import {EPISODE_CASE} from './episode-data.js';
import {EDITOR_RECORD} from './continuation-data.js';
import {investigate} from './logic.js';
export const NEXT_PHASES=['request','crossroads','archive','travel','riding','central','harbor-intro','harbor','confession','camera','complete'];
export const NEXT_VISITS=['archive-ledger','archive-envelope','akari','editor','harbor-board'];
export const NEXT_FREE_PHASES=['archive','travel','central','harbor'];
export const NEXT_EVIDENCE=['photo-memory','toru-note','akari-story','station-log','archive-note','return-table','editor-claim','original-returned','last-photo'];
const unique=a=>[...new Set(a)];
const has=(s,...ids)=>ids.every(id=>s.evidence.includes(id));
const add=(s,...ids)=>({...s,evidence:unique([...s.evidence,...ids])});
const visit=(s,id)=>({...s,visited:unique([...s.visited,id])});
export function freshContinuation(){return {photoChoice:null,route:null,journey:[],activeLeg:null,finalProof:null,solvedFinal:false,framing:'people'};}
export function planningPoint(s){
 if(s.phase==='central')return {station:'central',time:s.journey.at(-1)?.arrive??1417,transfer:true};
 return {station:'ridge',time:s.route==='station'?1405:1401,transfer:false};
}
export function judgeBoarding(s,trainId){
 if(!['travel','central'].includes(s.phase))return {status:'not-planning'};
 const train=EPISODE_CASE.trains.find(t=>t.id===trainId);if(!train)return {status:'unknown'};
 const at=planningPoint(s),index=train.stops.findIndex(t=>t.station===at.station);
 if(index<0||index===train.stops.length-1)return {status:'not-served',station:at.station};
 const first=train.stops[index],last=train.stops.at(-1);
 if(first.depart<at.time)return {status:'departed',depart:first.depart,now:at.time};
 if(at.transfer&&first.depart<at.time+EPISODE_CASE.transferMinutes)return {status:'transfer',available:first.depart-at.time,required:EPISODE_CASE.transferMinutes};
 if(last.station!=='harbor'&&!(at.station==='ridge'&&last.station==='central'))return {status:'wrong-destination',station:last.station};
 const leg={trainId:train.id,from:at.station,to:last.station,depart:first.depart,arrive:last.arrive};
 return {status:'valid',leg,connection:last.station==='central'};
}
export function judgeFinalProof(s,selected,reason){
 if(!Array.isArray(selected)||selected.length!==2||new Set(selected).size!==2)return {status:'choose-two'};
 if(!selected.every(id=>s.evidence.includes(id)))return {status:'not-owned'};
 const record=s.route==='escort'?'toru-note':s.route==='station'?'station-log':null;
 if(!record||!selected.includes(record)||!selected.includes('return-table')||!has(s,'editor-claim'))return {status:'unrelated'};
 if(reason!=='arrival')return {status:reason?'wrong-reason':'choose-reason'};
 const answer=investigate(EPISODE_CASE,{record:EDITOR_RECORD,claim:{station:'harbor',time:1414}});
 return {status:answer.contradiction?'contradiction':'supported',...answer};
}
export function advanceContinuation(s,e){
 switch(e.type){
 case 'continue-story':return s.phase==='ending'?{...s,phase:'request'}:s;
 case 'photo-decision':
  if(s.phase!=='request'||!['erase','keep'].includes(e.value))return s;
  return {...s,photoChoice:e.value,phase:'crossroads',evidence:e.value==='erase'?unique([...s.evidence.filter(id=>id!=='photo'),'photo-memory']):s.evidence};
 case 'choose-route':
  if(s.phase!=='crossroads'||!['escort','station'].includes(e.value))return s;
  return {...s,route:e.value,phase:e.value==='escort'?'travel':'archive'};
 case 'archive-ledger':return s.phase==='archive'?visit(add(s,'station-log'),'archive-ledger'):s;
 case 'archive-envelope':return s.phase==='archive'?visit(add(s,'archive-note'),'archive-envelope'):s;
 case 'leave-archive':
  return s.phase==='archive'&&has(s,'station-log','archive-note')?{...s,phase:'travel'}:s;
 case 'record-return-table':
  return ['travel','central','harbor'].includes(s.phase)?visit(add(s,'return-table'),'harbor-board'):s;
 case 'board-train':{
  const a=judgeBoarding(s,e.trainId);return a.status==='valid'?{...s,phase:'riding',activeLeg:a.leg}:s;
 }
 case 'arrive':
  if(s.phase!=='riding'||!s.activeLeg)return s;
  return {...s,phase:s.activeLeg.to==='harbor'?'harbor-intro':'central',journey:[...s.journey,s.activeLeg],activeLeg:null};
 case 'heard-harbor':return s.phase==='harbor-intro'?{...s,phase:'harbor'}:s;
 case 'heard-akari':
  return s.phase==='harbor'&&s.route==='escort'?visit(add(s,'toru-note','akari-story'),'akari'):s;
 case 'heard-editor':return s.phase==='harbor'?visit(add(s,'editor-claim'),'editor'):s;
 case 'present-final':
  if(s.phase!=='harbor'||judgeFinalProof(s,e.selected,e.reason).status!=='contradiction')return s;
  return {...s,phase:'confession',finalProof:{selected:[...e.selected],reason:e.reason}};
 case 'resolve':
  if(s.phase!=='confession'||!s.finalProof||judgeFinalProof(s,s.finalProof.selected,s.finalProof.reason).status!=='contradiction')return s;
  return add({...s,phase:'camera',solvedFinal:true},'original-returned');
 case 'set-framing':
  return s.phase==='camera'&&['people','tickets'].includes(e.value)?{...s,framing:e.value}:s;
 case 'take-photo':
  return s.phase==='camera'&&s.solvedFinal?add({...s,phase:'complete'},'last-photo'):s;
 case 'rewind-continuation':
  if(s.phase!=='complete')return s;
  return {...s,...freshContinuation(),phase:'ending',evidence:unique([...s.evidence.filter(id=>!NEXT_EVIDENCE.includes(id)),'photo']),visited:s.visited.filter(id=>!NEXT_VISITS.includes(id)),log:s.log.filter(l=>!l.id.startsWith('ct-'))};
 default:return s;
 }
}
function sameLeg(a,b){return a&&b&&['trainId','from','to','depart','arrive'].every(k=>a[k]===b[k]);}
export function readContinuationFields(raw){
 return {...freshContinuation(),photoChoice:['erase','keep'].includes(raw.photoChoice)?raw.photoChoice:null,route:['escort','station'].includes(raw.route)?raw.route:null,framing:raw.framing==='tickets'?'tickets':'people',solvedFinal:raw.solvedFinal===true};
}
export function restoreContinuation(s,raw){
 if(!NEXT_PHASES.includes(s.phase))return s;
 let phase=s.phase,rank=NEXT_PHASES.indexOf(phase);
 const cap=p=>{if(rank>NEXT_PHASES.indexOf(p)){phase=p;rank=NEXT_PHASES.indexOf(p);}};
 if(!s.photoChoice)cap('request');
 if(!s.route)cap('crossroads');
 if(s.photoChoice==='erase')s.evidence=s.evidence.filter(id=>id!=='photo');
 if(s.route==='station'&&rank>=3&&!has(s,'station-log','archive-note'))cap('archive');
 if(s.route==='escort'&&phase==='archive'){phase='travel';rank=3;}
 const journey=[];
 for(const leg of Array.isArray(raw.journey)?raw.journey.slice(0,2):[]){
  const seed={...s,phase:journey.length?'central':'travel',journey};
  if(journey.length&&journey.at(-1).to!=='central')break;
  const a=judgeBoarding(seed,leg?.trainId);
  if(a.status!=='valid'||!sameLeg(leg,a.leg))break;
  journey.push(a.leg);
 }
 s.journey=journey;s.activeLeg=null;
 if(phase==='riding'){
  const a=judgeBoarding({...s,phase:journey.length?'central':'travel'},raw.activeLeg?.trainId);
  if(a.status==='valid'&&sameLeg(raw.activeLeg,a.leg))s.activeLeg=a.leg;
  else{phase=journey.at(-1)?.to==='central'?'central':'travel';rank=NEXT_PHASES.indexOf(phase);}
 }
 if(rank>=5&&rank!==4&&!journey.length)cap('travel');
 if(phase==='central'&&journey.at(-1)?.to!=='central')cap('travel');
 if(rank>=6&&journey.at(-1)?.to!=='harbor')cap(journey.at(-1)?.to==='central'?'central':'travel');
 const proof=raw.finalProof;
 s.finalProof=proof&&judgeFinalProof(s,proof.selected,proof.reason).status==='contradiction'?{selected:[...proof.selected],reason:proof.reason}:null;
 if(rank>=8&&!s.finalProof)cap('harbor');
 if(rank>=9&&(!s.solvedFinal||!has(s,'original-returned')))cap('confession');
 if(phase==='complete'&&!has(s,'last-photo'))cap('camera');
 if(rank<9){s.solvedFinal=false;s.evidence=s.evidence.filter(id=>!['original-returned','last-photo'].includes(id));}
 if(rank<10)s.evidence=s.evidence.filter(id=>id!=='last-photo');
 return {...s,phase};
}
export function continuationObjective(s){
 switch(s.phase){
 case 'request':return '透が写真を消したがる理由を聞き、扱いを決める。';
 case 'crossroads':return '透と港へ行くか、栞と駅に残るかを選ぶ。';
 case 'archive':
  if(!has(s,'station-log'))return '駅務室で、入構の帳簿を調べる。';
  if(!has(s,'archive-note'))return '赤い封筒の受領控えを確かめる。';
  return '23:25。列車を選び、港へ向かう。';
 case 'travel':return s.route==='station'?'23:25。霧山から港へ向かう列車を選ぶ。':'港へ向かう列車を、自分で選ぶ。';
 case 'riding':return '乗車中。会話を読み、次の駅へ進む。';
 case 'central':return '中央23:37着。乗換えの2分を見て、港行きを選ぶ。';
 case 'harbor-intro':return '港に着いた。選んだ道の先で、話を聞く。';
 case 'harbor':
  if(s.route==='escort'&&!has(s,'toru-note'))return '青い傘の人に、映像と編集者のことを聞く。';
  if(!has(s,'editor-claim'))return '黒いコートの高瀬に、行動を確かめる。';
  if(!has(s,'return-table'))return '港の発車案内で、霧山からの運行表を記録する。';
  return '霧山の記録と運行表で、高瀬の証言を確かめる。';
 case 'confession':return '最後の嘘を崩し、原板を撮った本人へ返す。';
 case 'camera':return '23:47。構図を選んで、最後のシャッターを切る。';
 case 'complete':return '約束を果たした。あなたが残した一枚を振り返る。';
 default:return null;
 }
}
export function continuationTime(s){
 switch(s.phase){
 case 'request':case 'crossroads':return 1401;
 case 'archive':return 1405;
 case 'travel':return s.route==='station'?1405:1401;
 case 'riding':return s.activeLeg?.depart??1401;
 case 'central':return s.journey.at(-1)?.arrive??1417;
 case 'harbor-intro':case 'harbor':return s.journey.at(-1)?.arrive??1423;
 case 'confession':return 1426;
 case 'camera':case 'complete':return 1427;
 default:return null;
 }
}
