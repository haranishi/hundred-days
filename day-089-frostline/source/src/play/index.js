import { RULES as R } from './rules.js';
import { createRun, updateRun } from './run.js';
import { createProgress } from './progress.js';
import { goalsFor, evaluateGoals } from './goals.js';
/** DOM・物理の実装を知らず、渡された状態と出来事だけを読む。 */
export function createPlay({world={},storage}={}) {
  const drops=world.drops ?? world.meta?.drops ?? [], stations=world.stations ?? world.meta?.stations ?? [], features=world.features ?? world.meta?.features ?? [];
  const progress=createProgress(storage), thresholds=new Map(drops.filter(d=>d.level===4).map((d,i)=>[d.id,R.unlocks[i]??10000]));
  let run=null,summary=null,current=null,trick=null,trickFor=0,notice='',noticeFor=0,retry=null,retryFor=0;
  const copy=v=>structuredClone(v);
  const unlocked=d=>progress.get().totals.descent>=(thresholds.get(d.id)??0);
  const visible=d=>!d.hidden||progress.get().discovered.includes(d.id);
  function announce(text){notice=text;noticeFor=R.noticeSeconds;}
  function map(){
    const p=progress.get(),meta=world.map??world.meta?.map;
    return copy({image:meta?.file?`/world/${meta.file}`:null,size:world.size??world.meta?.size??6144,stations,features,total:p.totals.descent,
      drops:drops.filter(visible).map(d=>({...d,locked:!unlocked(d),remaining:Math.max(0,(thresholds.get(d.id)??0)-p.totals.descent),threshold:thresholds.get(d.id)??0,
        station:stations.find(s=>s.id===d.finish)?.name??'駅の情報はありません',best:p.drops[d.id]?.best??0,
        runs:p.drops[d.id]?.runs??0,goals:goalsFor(d.kind).map((g,i)=>({...g,earned:p.drops[d.id]?.stars[i]??false}))}))});
  }
  /** except：その地点は選ばない（「いまと違う地点」を出すため） */
  function recommend(except=null){
    const available=map().drops.filter(d=>!d.locked&&d.id!==except).sort((a,b)=>(a.level??1)-(b.level??1));
    return available.find(d=>!d.goals[0].earned)??available.find(d=>d.goals.some(g=>!g.earned))??available.find(d=>d.id!==current?.id)??available[0]??null;
  }
  function finish({silent=false}={}){
    if(!run)return null;
    const p=progress.get(),before=new Set(drops.filter(unlocked).map(d=>d.id)),id=run.dropId;
    const old=p.drops[id]??{runs:0,best:0,stars:[false,false,false]},earned=evaluateGoals(current?.kind,run);
    const goals=goalsFor(current?.kind).map((g,i)=>({...g,earned:old.stars[i]||earned[i],fresh:!old.stars[i]&&earned[i]}));
    p.drops[id]={runs:old.runs+1,best:Math.max(old.best,run.score),stars:goals.map(g=>g.earned)};
    for(const key in p.totals)p.totals[key]+=key==='runs'?1:run[key]??0;
    p.lastDrop=id;
    const opened=drops.filter(d=>!before.has(d.id)&&unlocked(d)).map(d=>({id:d.id,name:d.name}));
    const completed=copy({...run,dropName:current?.name??run.dropId,goals,opened,bestTrick:run.tricks.filter(t=>t.name&&t.score>0).reduce((best,t)=>!best||t.score>best.score?t:best,null)});
    // 次の一本は必ず、いま滑った地点とは別のおすすめにする。
    run=null; completed.next=recommend(id); completed.other=completed.next; summary=silent?null:completed; progress.save();
    if(opened.length)announce(`${opened.map(d=>d.name).join('・')}が開きました`);
    else if(goals.some(g=>g.fresh))announce('新しい★を取りました');
    return copy(completed);
  }
  function begin(id,state,{keepRetry=false}={}){
    const d=typeof id==='object'?id:drops.find(d=>d.id===id);
    if(!d||!unlocked(d)||!visible(d))return false;
    if(run)finish({silent:true});
    // 前の一本の知らせ（「新しい★を取りました」など）は、次の一本へ持ち越さない（別の一本を始めた後にも出ていた：体験の採点 2 周目）
    current=copy(d); summary=null; run=createRun(d,state);trick=null;trickFor=0;if(!keepRetry){retry=null;retryFor=0;notice='';noticeFor=0;}return true;
  }
  function update(state,events=[],dt=0){
    if(!run||!Number.isFinite(dt)||dt<0)return false;
    trickFor=Math.max(0,trickFor-dt);if(!trickFor)trick=null;
    noticeFor=Math.max(0,noticeFor-dt);if(!noticeFor)notice='';
    retryFor=Math.max(0,retryFor-dt);
    const landed=updateRun(run,state,events,dt,stations);
    if(landed.length){trick=landed.at(-1);trickFor=R.trickSeconds;}
    if(state.mode!=='air'&&state.mode!=='crash'&&state.speed>0) {
      for(const d of drops)if(d.hidden&&!visible(d)&&Math.hypot(state.pos.x-d.x,state.pos.z-d.z)<=R.discoverRadius){progress.get().discovered.push(d.id);announce(`${d.name}を見つけました`);progress.save();}
    }
    for(const f of features)if(f.approach&&Math.hypot(state.pos.x-f.x,state.pos.z-f.z)<=Math.max(f.width??0, f.length??0, 12)/2){retry=copy(f.approach);retryFor=R.retrySeconds;}
    if(run.station){finish();return true;}
    return false;
  }
  function snapshot(){return copy({run,summary,progress:progress.get(),current,trick,notice,canFinish:!!run&&run.stopped+1e-9>=R.manualStop});}
  return {begin,update,finish,map,recommend,snapshot,retryPoint:()=>copy(retryFor>0?retry:current),
    clearProgress(){progress.clear();summary=null;announce('進み具合を消しました');}};
}
