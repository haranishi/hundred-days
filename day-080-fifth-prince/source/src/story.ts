import type { GameState, Objective, Result, StoryChoice, StoryEpisode, StoryEvent, Zone } from './types';
const has=(s:GameState,f:string)=>s.flags.includes(f);
const f=(episode:StoryEpisode,step:string)=>`story:${episode}:${step}`;
export const done=(s:GameState,id:StoryEpisode)=>has(s,f(id,'done'));
export const chosen=(s:GameState,id:StoryEpisode,choice:string)=>has(s,f(id,choice));
export const EPISODES:{id:StoryEpisode;title:string;summary:string}[]=[
 {id:'bread',title:'パンを待つ灯り',summary:'ノラと、町の二つの家へパンを届ける。'},
 {id:'mira',title:'失敗した薬と森の水',summary:'ミラと負傷兵を訪ね、森の井戸を調べる。'},
 {id:'forge',title:'強い火、小さな灯り',summary:'トーマ、アレン、ジークとパン窯を直す。'},
 {id:'forest',title:'森を守り、薬を届ける',summary:'セイルとロアンの意見を、森で確かめる。'},
 {id:'family',title:'五人分の食卓',summary:'四つの試練を終え、兄弟で食卓を囲む。'},
 {id:'citadel',title:'返事のない魔王城',summary:'仲間に役割を託し、二つの封印を開く。'}
];
const STEPS:Record<StoryEpisode,string[]>={bread:['pack','share','order','child','elder','done'],mira:['start','case','water','trust','review','done'],forge:['start','inspect','reuse','crystal','done'],forest:['start','observed','picked','done'],family:['forgive','time','done'],citadel:['voices','power','done']};
export const STORY_FLAGS=['story:expanded',...EPISODES.flatMap(({id})=>['story:active:'+id,...STEPS[id].map(step=>f(id,step))])];
export function eligible(s:GameState,id:StoryEpisode):boolean{
 switch(id){case 'bread':return has(s,'bread');case 'mira':return has(s,'medicine');case 'forge':return has(s,'promoted');case 'forest':return done(s,'forge');case 'family':return s.brothers.length===4;case 'citadel':return has(s,'awakened');}
}
export function activeEpisode(s:GameState):StoryEpisode|undefined{
 const focus=EPISODES.find(({id})=>has(s,'story:active:'+id)&&!done(s,id)&&eligible(s,id));
 return focus?.id??(has(s,'story:expanded')?EPISODES.find(({id})=>eligible(s,id)&&!done(s,id))?.id:undefined);
}
interface Task {event:StoryEvent;zone:Zone;point:string;title:string;hint:string}
export function storyTasks(s:GameState,id:StoryEpisode):Task[]{
 const t=(event:StoryEvent,zone:Zone,point:string,title:string,hint:string):Task=>({event,zone,point,title,hint});
 switch(id){
 case 'bread':
  if(!chosen(s,id,'pack'))return [t('bread.pack','town','nora','ノラと、今日の配達を相談する','黄金麦から焼いたパンを、待っている人へ届けよう。')];
  {const tasks:Task[]=[];if(!chosen(s,id,'child'))tasks.push(t('bread.child','town','town:child','ピピに、焼きたてのパンを届ける','南の路地にいるピピへ。古老への配達と、どちらが先でも大丈夫。'));if(!chosen(s,id,'elder'))tasks.push(t('bread.elder','town','town:elder','古老オスカーに、パンを届ける','星降る宿の南にいる古老へ。配達は好きな順で進められる。'));return tasks.length?tasks:[t('bread.finish','town','nora','ノラに、町の返事を伝える','パンを届けた二人の様子を、店へ持ち帰ろう。')];}
 case 'mira':
  if(!chosen(s,id,'start'))return [t('mira.start','town','mira','ミラの、言いかけた言葉を聞く','薬房へ戻り、彼女が気にかけていた兵士の話を聞こう。')];
  if(!chosen(s,id,'case'))return [t('mira.case','town','guard','ミラと、負傷兵レナートを訪ねる','星降る宿の南東で、街道から帰った兵士が休んでいる。')];
  if(!chosen(s,id,'water'))return [t('mira.water','forest','story:well','森の井戸で、調合に使う水を調べる','ミラの手帳にある、根に囲まれた古井戸へ。')];
  return [t('mira.heal','town','guard','ミラとレナートのもとへ戻る','調合を見届けよう。決めるのはミラ自身だ。')];
 case 'forge':
  if(!chosen(s,id,'start'))return [t('forge.start','town','toma','トーマに、町でできる仕事を聞く','謁見を終えた報告を、旅の工房へ。')];
  if(!chosen(s,id,'inspect'))return [t('forge.inspect','town','nora','みんなで、冷えたパン窯を調べる','ノラの店へ。炎を強くする前に、原因を見よう。')];
  if(!chosen(s,id,'reuse')&&!chosen(s,id,'crystal'))return [t('forge.parts','town','merchant','オルンと、修理の部品を選ぶ','古い炉輪は無料。星晶石を1つ使う方法もある。どちらでも直せる。')];
  return [t('forge.light','town','nora','小さな火を、パン窯にともす','トーマの助言を思い出そう。必要なのは、強さより火の安定。')];
 case 'forest':
  if(!chosen(s,id,'start'))return [t('forest.start','town','guard','救護所で、兄たちと必要な薬を確かめる','レナートのもとへ。セイルとロアンも、救護所の不足を調べに来ている。')];
  if(!chosen(s,id,'observed'))return [t('forest.observe','forest','story:patch','二人の兄と、採集地を調べる','森の中央、白い花の群生地へ。まず足元を観察しよう。')];
  if(!chosen(s,id,'picked'))return [t('forest.pick','forest','story:patch','次の芽を残して、薬草を採る','葉の一部を採れば、根からまた芽が出る。')];
  return [t('forest.deliver','town','guard','薬草2つを、レナートへ届ける',`採った薬草で救護所を支えよう。現在 ${s.inventory.herb} / 2個。足りなければ商店でも買える。`)];
 case 'family':return [t('family.supper','town','inn','五人で、同じ食卓を囲む','星降る宿へ。試練の勝敗のあとに、まだ話せていないことがある。')];
 case 'citadel':{
  const tasks:Task[]=[];if(!chosen(s,id,'voices'))tasks.push(t('citadel.voices','abyss','story:voices','声の封印に、仲間と向き合う','西の封印は、ひとりで触れると声を奪う。誰に何を頼むか、考えよう。'));if(!chosen(s,id,'power'))tasks.push(t('citadel.power','abyss','story:power','力の封印に、五人で向き合う','東の封印には、異なる力が同時に必要だ。二つは好きな順で開けられる。'));return tasks;
 }
 }
}
export function storyGoal(s:GameState):Objective|null{
 const id=activeEpisode(s);if(!id)return null;const task=storyTasks(s,id)[0];if(!task)return null;
 return {title:task.title,hint:task.hint,zone:task.zone,target:task.point,chapter:'小章　'+EPISODES.find(e=>e.id===id)!.title,progress:({bread:12,mira:35,forge:54,forest:57,family:82,citadel:90})[id]};
}
export function eventAt(s:GameState,point:string):StoryEvent|undefined{
 const id=activeEpisode(s);return id?storyTasks(s,id).find(task=>task.point===point&&task.zone===s.zone)?.event:undefined;
}
export function storyBlock(s:GameState,milestone:'audience'|'trial'|'awaken'|'demon'):string|null{
 if(!has(s,'story:expanded'))return null;
 const needed:Record<typeof milestone,StoryEpisode[]>={audience:['bread','mira'],trial:['forge','forest'],awaken:['family'],demon:['citadel']};
 const missing=needed[milestone].find(id=>!done(s,id));return missing?`先に「${EPISODES.find(e=>e.id===missing)!.title}」を終えましょう。手帳に次の行き先があります。`:null;
}
export function focusStory(original:GameState,id:StoryEpisode):Result{
 if(!EPISODES.some(e=>e.id===id)||!eligible(original,id)||done(original,id))return {ok:false,state:original,message:'この小章は、まだ始められないか、すでに終えています。'};
 const state=structuredClone(original);state.flags=state.flags.filter(x=>!x.startsWith('story:active:'));state.flags.push('story:active:'+id);return {ok:true,state,message:'手帳に、次の行き先を記しました。'};
}
export function advanceStory(original:GameState,event:StoryEvent,choice?:StoryChoice):Result{
 const id=event.split('.')[0] as StoryEpisode;
 const task=eligible(original,id)&&!done(original,id)?storyTasks(original,id).find(t=>t.event===event):undefined;
 const fail=(message:string):Result=>({ok:false,state:original,message});
 if(!task||original.zone!==task.zone)return fail('先に、手帳に書かれた相手や場所を訪ねましょう。');
 const s=structuredClone(original);const add=(step:string)=>{const flag=f(id,step);if(!has(s,flag))s.flags.push(flag);};
 const finish=(xp=10,trust=4)=>{add('done');s.xp+=xp;s.trust+=trust;s.flags=s.flags.filter(x=>x!=='story:active:'+id);};
 const requireChoice=(options:StoryChoice[])=>!!choice&&options.includes(choice);
 switch(event){
 case 'bread.pack':if(!requireChoice(['share','order']))return fail('パンを届ける方法を選びましょう。');add('pack');add(choice!);break;
 case 'bread.child':case 'bread.elder':{
  const step=event.endsWith('child')?'child':'elder';add(step);const discovery='found:town:'+step;
  if(!has(s,discovery)){s.flags.push(discovery);s.xp+=5;}break;
 }
 case 'bread.finish':if(chosen(s,id,'order'))s.gold+=12;finish(12,chosen(s,id,'share')?6:3);break;
 case 'mira.start':add('start');break;
 case 'mira.case':add('case');break;
 case 'mira.water':add('water');break;
 case 'mira.heal':if(!requireChoice(['trust','review']))return fail('ミラへの返事を選びましょう。');add(choice!);s.inventory.potion++;finish(12,6);break;
 case 'forge.start':add('start');break;
 case 'forge.inspect':add('inspect');break;
 case 'forge.parts':
  if(!requireChoice(['reuse','crystal']))return fail('修理の部品を選びましょう。');
  if(choice==='crystal'){if(s.inventory.crystal<1)return fail('星晶石が1つ必要です。無料の古い炉輪でも修理できます。');s.inventory.crystal--;}
  add(choice!);break;
 case 'forge.light':if(choice!=='steady')return fail('トーマ「火が強すぎると、また炉が割れる。小さな火を、同じ強さで保つんだ」。もう一度試せます。');finish(12,6);break;
 case 'forest.start':add('start');break;
 case 'forest.observe':add('observed');break;
 case 'forest.pick':if(choice!=='leaf')return fail('ロアン「根を抜けば、次の芽まで失う。若い葉は残し、外の葉を少しだけ採ろう」。採り直せます。');add('picked');s.inventory.herb+=2;break;
 case 'forest.deliver':if(s.inventory.herb<2)return fail('救護所へ届ける月しずく草が2つ必要です。森で採るか、オルンから仕入れましょう。');s.inventory.herb-=2;finish(12,6);break;
 case 'family.supper':if(!requireChoice(['forgive','time']))return fail('兄たちに、今の気持ちを伝えましょう。');add(choice!);finish(10,6);break;
 case 'citadel.voices':case 'citadel.power':
  if(choice!=='together')return fail('ひとりで触れると、仲間の声が遠のいた。いったん手を離し、誰に何を頼むか話そう。');
  add(event.endsWith('voices')?'voices':'power');s.xp+=8;if(chosen(s,id,'voices')&&chosen(s,id,'power'))finish(0,4);break;
 }
 return {ok:true,state:s,message:done(s,id)?`「${EPISODES.find(e=>e.id===id)!.title}」を手帳に記しました。`:'約束の続きを、手帳に記しました。'};
}
export function remembered(s:GameState,id:StoryEpisode):string{
 switch(id){case 'bread':return chosen(s,id,'order')?'宿と店の定期便で、届け続ける約束をした。':chosen(s,id,'share')?'今日のパンを分け、町の人の声を聞いた。':'';case 'mira':return chosen(s,id,'review')?'手帳を一緒に読み、最後の判断をミラに託した。':chosen(s,id,'trust')?'ミラが自分で決めるまで、隣で待った。':'';case 'forge':return chosen(s,id,'crystal')?'星晶石を使い、小さな火を保った。':chosen(s,id,'reuse')?'古い炉輪を直し、小さな火を保った。':'';case 'forest':return done(s,id)?'次の芽を残して採り、救護所へ届けた。':'';case 'family':return chosen(s,id,'time')?'傷は残ると伝え、それでも一緒に進むと決めた。':chosen(s,id,'forgive')?'謝罪を受け取り、ここから始め直すと答えた。':'';case 'citadel':return done(s,id)?'ひとりで背負わず、仲間に役割を頼んだ。':'';}
}
export function validateStoryState(s:GameState):boolean{
 const h=(id:StoryEpisode,step:string)=>chosen(s,id,step);
 if(s.flags.filter(x=>x.startsWith('story:active:')).length>1)return false;
 for(const {id} of EPISODES){if(s.flags.some(x=>x.startsWith('story:'+id+':'))&&!eligible(s,id))return false;if(has(s,'story:active:'+id)&&(!eligible(s,id)||done(s,id)))return false;}
 for(const [id,a,b] of [['bread','share','order'],['mira','trust','review'],['forge','reuse','crystal'],['family','forgive','time']] as const){if(h(id,a)&&h(id,b))return false;}
 if((h('bread','share')||h('bread','order'))!==h('bread','pack'))return false;
 if((h('bread','child')||h('bread','elder'))&&!h('bread','pack'))return false;
 if(done(s,'bread')&&(!h('bread','child')||!h('bread','elder')))return false;
 if(h('mira','case')&&!h('mira','start')||h('mira','water')&&!h('mira','case'))return false;
 if((h('mira','trust')||h('mira','review'))!==done(s,'mira')||done(s,'mira')&&!h('mira','water'))return false;
 if(h('forge','inspect')&&!h('forge','start')||(h('forge','reuse')||h('forge','crystal'))&&!h('forge','inspect'))return false;
 if(done(s,'forge')&&!h('forge','reuse')&&!h('forge','crystal'))return false;
 if(h('forest','observed')&&!h('forest','start')||h('forest','picked')&&!h('forest','observed')||done(s,'forest')&&!h('forest','picked'))return false;
 if((h('family','forgive')||h('family','time'))!==done(s,'family'))return false;
 if(done(s,'citadel')!==(h('citadel','voices')&&h('citadel','power')))return false;
 if(has(s,'story:expanded')){if(has(s,'promoted')&&storyBlock(s,'audience'))return false;if(s.brothers.length&&storyBlock(s,'trial'))return false;if(has(s,'awakened')&&storyBlock(s,'awaken'))return false;if(has(s,'ended')&&storyBlock(s,'demon'))return false;}
 return true;
}
