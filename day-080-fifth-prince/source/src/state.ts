import { BROTHERS, ENEMIES, ITEMS } from './content';
import { intentFor } from './encounters';
import { advanceStory, focusStory, storyBlock, storyGoal, activeEpisode } from './story';
import { DISCOVERIES } from './exploration';
import type { Action, Ally, Brother, CombatCommand, EnemyId, GameState, Item, Objective, Result, Zone } from './types';
export const has=(s:GameState,f:string)=>s.flags.includes(f);
export const level=(s:GameState)=>1+Math.floor(Math.sqrt(s.xp/25));
export const maxHp=(s:GameState)=>104+level(s)*14+s.party.length*8;
export const attack=(s:GameState)=>15+level(s)*4+(s.weapon?9:0);
export const rank=(s:GameState)=>has(s,'ended')?'光をつなぐ勇者':has(s,'awakened')?'共鳴の勇者':has(s,'promoted')?'王都の使節':s.trust>=15?'街の協力者':'名もなき第五王子';
export const freshState=():GameState=>({version:1,zone:'town',position:{x:376,y:368},gold:60,xp:0,trust:0,profit:0,inventory:{wheat:0,herb:0,crystal:0,potion:3},flags:[],party:[],brothers:[],weapon:false,battle:null,playSeconds:0});
export const newAdventure=():GameState=>({...freshState(),flags:['story:expanded']});
const hasSaleStock=(s:GameState)=>(Object.keys(ITEMS) as Item[]).some(id=>ITEMS[id].sell>0&&s.inventory[id]>0);
function herbSupply(s:GameState,needed:number,goal:Objective):Objective{
 const herb=Array.from({length:6},(_,i)=>'herb'+(i+1)).find(id=>!has(s,'gather:'+id));
 if(herb)return {...goal,zone:'forest',target:herb,hint:`未採集の月しずく草を探そう。現在 ${s.inventory.herb} / ${needed}個。`};
 if(s.gold<8&&!hasSaleStock(s))return {...goal,title:'仕入れ代を、ノラの店の仕事で作ろう',zone:'town',target:'nora',hint:'採集地は採集済み。ノラの店を手伝うと8Gを受け取れる。黄金麦の売買で薬草の仕入れ代を作ろう。'};
 return {...goal,title:'足りない薬草を、オルンから仕入れよう',zone:'town',target:'merchant',hint:`森の採集地は採集済み。商店で不足分を買える。仕入れ代は黄金麦の売買でも増やせる。現在 ${s.inventory.herb} / ${needed}個。`};
}
export function objective(s:GameState):Objective {
 let story=storyGoal(s);if(story&&activeEpisode(s)==='forest'&&has(s,'story:forest:picked')&&s.inventory.herb<2)story=herbSupply(s,2,story);
 if(story)return has(s,'ended')?{...story,chapter:'クリア後・任意の物語',progress:100}:story;
 const o=(title:string,hint:string,zone:Zone,target:string,chapter:string,progress:number)=>({title,hint,zone,target,chapter,progress});
 if(has(s,'ended'))return o(has(s,'ending:seen')?'本編クリア ― 第五王子と、名もなき加護':'魔王撃破 ― 結末を見届けよう',has(s,'ending:seen')?'物語は完結しました。結末の読み返しや、王都の散策は自由に楽しめます。':'魔王との決着を、帰還と五人の食卓まで見届けよう。','town','nora','終章　名もなき加護',100);
 const work=()=>o('仕入れ代を、ノラの店の仕事で作ろう','売れる品物も仕入れ代もないときは、ノラの店を手伝うと8Gを受け取れる。','town','nora','第一章　商いを立て直す',17);
 if(!has(s,'bread')){
  if(s.inventory.wheat>0)return o('黄金麦を、ノラのパン屋へ','仕入れた黄金麦1つを、パン職人ノラに届けよう。','town','nora','第一章　最初の約束',7);
  if(s.gold<8)return o('ノラの店を手伝おう','仕入れ代が足りないときは、ノラの店で仕事を手伝える。','town','nora','第一章　最初の約束',7);
  return o('まずは、黄金麦を1つ仕入れよう','パン屋の右下の広場にいるオルンから、黄金麦1つを8Gで仕入れよう。','town','merchant','第一章　銀貨60枚の旅立ち',7);
 }
 if(s.profit<24&&s.gold<8&&!hasSaleStock(s))return work();
 if(s.profit<24)return o('仕入れ・販売で利益24G',`商いの利益は仕入れと販売の差額。ノラの32Gは配達のお礼です。黄金麦は8Gで仕入れ、14Gで販売。4つで24G。現在 ${s.profit} / 24G。`,'town','merchant','第一章　小さな商い',17);
 if(!has(s,'medicine')){
  const goal=o('薬師ミラに、月しずく草を3つ','薬房のミラへ届けよう。','town','mira','第二章　誰かのための一歩',29);
  return s.inventory.herb>=3?goal:herbSupply(s,3,goal);
 }
 if(!has(s,'bramble'))return o('森の鍛冶師を助けよう','東の森で、いばらの番獣に閉じ込められたトーマを探そう。','forest','bramble','第二章　差し出した手',40);
 if(!has(s,'promoted'))return o('王宮へ、あなたの歩みを届けよう','信頼30以上・利益24G以上で国王に謁見できる。','palace','king','第三章　名もなき者の謁見',52);
 const b=BROTHERS.find(id=>!s.brothers.includes(id));
 if(b)return o('兄たちと、同じ目線で向き合う',`四人の試練を越えよう。協力を約束した兄 ${s.brothers.length} / 4人。`,'palace',b,'第三章　四つの誇り',58+s.brothers.length*6);
 if(!has(s,'awakened'))return o('星詠みに、第五の加護をたずねる','王宮の記録室にいるエルダに会おう。','palace','sage','第四章　消えた紋章',84);
 return o('五人で、孤絶の王に挑む','魔王城へ進もう。強攻撃の予兆では「守る」、共鳴が5つたまったら「五光の共鳴」。','abyss','demon','最終章　僕たちは、ひとりじゃない',92);
}
export function travelAllowed(s:GameState,z:Zone):string|null{
 if(z==='palace' && (s.trust<30||s.profit<24))return `謁見には信頼30と商いの利益24Gが必要です。現在 信頼${s.trust}・利益${s.profit}G。`;
 if(z==='abyss'&&!has(s,'awakened'))return '四人の兄と和解し、星詠みエルダから第五の加護を聞きましょう。';
 return null;
}
export const spawns:Record<Zone,{x:number;y:number}>={town:{x:376,y:368},forest:{x:104,y:336},palace:{x:376,y:432},abyss:{x:376,y:432}};
export function transition(original:GameState,a:Action):Result {
 const s=structuredClone(original);let message='';
 const fail=(m:string):Result=>({state:original,message:m,ok:false});
 const flag=(f:string)=>{if(!has(s,f))s.flags.push(f);};
 const reward=(key:string,gold:number,xp:number,trust:number,ally?:Ally)=>{if(has(s,key))return false;flag(key);s.gold+=gold;s.xp+=xp;s.trust+=trust;if(ally&&!s.party.includes(ally))s.party.push(ally);return true;};
 // Only combat commands and leaving a resolved battle can mutate a combat snapshot.
 if(s.battle&&a.type!=='combat'&&a.type!=='leaveBattle')return fail('戦闘を終えてから行いましょう。');
 switch(a.type){
 case 'story': return advanceStory(original,a.event,a.choice);
 case 'focusStory': return focusStory(original,a.episode);
 case 'finishEnding':
  if(!has(s,'ended'))return fail('魔王との戦いを終えてから、結末を見届けましょう。');
  if(has(s,'ending:seen'))return fail('結末はすでに記録されています。手帳から読み返せます。');
  flag('ending:seen');s.zone='town';s.position={...spawns.town};message='本編クリア。五人の物語を、最後まで見届けました。';break;
 case 'flag': flag(a.flag); break;
 case 'discover': {
 const d=DISCOVERIES[a.id];if(!d||d.zone!==s.zone)return fail('この場所では調べられません。');
 if(has(s,'found:'+a.id))return fail('ここは、すでに調べてあります。');
 flag('found:'+a.id);s.gold+=d.gold;s.xp+=d.xp;s.inventory.herb+=d.herb;s.inventory.potion+=d.potion;message=d.kind==='chest'?`発見！ ${d.gold?d.gold+'G ':''}${d.herb?'月しずく草×'+d.herb+' ':''}${d.potion?'癒やしの薬×'+d.potion:''}`:'新しい物語を、手帳に記しました。';break;
 }
 case 'work':
 if(s.zone!=='town')return fail('王都のパン屋で仕事を手伝えます。');
 if(s.gold>=8)return fail('まずは今ある資金で商いを始めてみましょう。');
 s.gold+=8;message='店の片づけを手伝い、8Gを受け取りました。黄金麦を1つ仕入れられます。';break;
 case 'trade':{
 const item=ITEMS[a.item];if(!item||!Number.isSafeInteger(a.quantity)||a.quantity<1||a.quantity>99)return fail('個数を1〜99個で指定してください。');
 if(a.direction==='sell'&&a.item==='potion')return fail('癒やしの薬は、冒険で使いましょう。販売はできません。');
 const amount=(a.direction==='buy'?item.buy:item.sell)*a.quantity;
 if(a.direction==='buy'){
 if(s.gold<amount)return fail('所持金が足りません。森の薬草を採集して売るか、依頼を達成しましょう。');
 s.gold-=amount;s.inventory[a.item]+=a.quantity;message=`${item.name}を${a.quantity}個仕入れました。−${amount}G`;
 }else{
 if(s.inventory[a.item]<a.quantity)return fail('売れる在庫がありません。先に仕入れましょう。');
 s.gold+=amount;s.inventory[a.item]-=a.quantity;s.profit+=Math.max(0,item.sell-item.buy)*a.quantity;message=`${item.name}を${a.quantity}個販売。＋${amount}G`;
 }break;}
 case 'gather':
 if(s.zone!=='forest'||!['herb1','herb2','herb3','herb4','herb5','herb6'].includes(a.id))return fail('森の薬草を調べてください。');
 if(has(s,'gather:'+a.id))return fail('ここは採集済みです。他の薬草を探しましょう。');
 flag('gather:'+a.id);s.inventory.herb+=2;message='月しずく草を2つ採集しました。';break;
 case 'deliver':
 if(a.quest==='bread'){
 if(has(s,'bread'))return fail('ノラへの麦は届けてあります。');
 if(s.inventory.wheat<1)return fail('黄金麦が1つ必要です。商人オルンから8Gで仕入れられます。');
 s.inventory.wheat--;reward('bread',32,25,14,'nora');message='ノラが仲間に！ 信頼＋14 ／ 32G ／ 25EXP';
 }else{
 if(has(s,'medicine'))return fail('ミラへの薬草は届けてあります。');
 if(s.inventory.herb<3)return fail('月しずく草が3つ必要です。森で採集するか商人から仕入れましょう。');
 s.inventory.herb-=3;reward('medicine',45,35,16,'mira');s.inventory.potion+=2;message='ミラが仲間に！ 信頼＋16 ／ 45G ／ 癒やしの薬×2';
 }break;
 case 'audience':{
 const story=storyBlock(s,'audience');if(story)return fail(story);
 const reason=travelAllowed(s,'palace');if(reason)return fail(reason);
 if(!has(s,'bramble')||s.party.length<3)return fail('森に取り残された鍛冶師トーマにも、手を差し伸べましょう。');
 if(!reward('promoted',60,40,12))return fail('王都の使節に任命されています。兄たちに会いましょう。');
 message='「王都の使節」に昇格！ 兄たちの試練が開かれました。';break;}
 case 'awaken':{const story=storyBlock(s,'awaken');if(story)return fail(story);}
 if(s.brothers.length<4)return fail('四人の兄と向き合ったとき、第五の加護の記録が開かれます。');
 if(has(s,'awakened'))return fail('共鳴の加護は、もうあなたの中にあります。');
 flag('awakened');s.trust+=20;s.xp+=65;message='第五の加護「共鳴」が覚醒。五人の力がひとつになる。';break;
 case 'equip':
 if(!s.party.includes('toma'))return fail('鍛冶師トーマを仲間にすると、剣を鍛えられます。');
 if(s.weapon)return fail('絆の剣は、すでに装備しています。');
 if(s.gold<60)return fail('剣を鍛えるには60G必要です。');
 s.gold-=60;s.weapon=true;message='「絆の剣」を装備。攻撃力＋9。';break;
 case 'heal':s.inventory.potion=Math.max(s.inventory.potion,3);message='ひと休みしました。癒やしの薬を3つまで無料補充。戦闘は全快で始まります。';break;
 case 'travel':{
 const reason=travelAllowed(s,a.zone);if(reason)return fail(reason);
 const links:Record<Zone,Zone[]>={town:['forest','palace'],forest:['town'],palace:['town','abyss'],abyss:['palace']};
 if(!links[s.zone].includes(a.zone))return fail('その地域へは、道がつながっていません。');
 s.zone=a.zone;s.position={...spawns[a.zone]};break;}
 case 'startBattle':{
 const enemy=ENEMIES[a.enemy];if(!enemy)return fail('敵が見つかりません。');
 const required:Record<EnemyId,Zone>={bramble:'forest',flame:'palace',tide:'palace',grove:'palace',storm:'palace',demon:'abyss'};
 if(s.zone!==required[a.enemy])return fail('相手のいる場所まで向かいましょう。');
 if(a.enemy==='bramble'&&has(s,'bramble'))return fail('森は平穏を取り戻しています。');
 if(BROTHERS.includes(a.enemy as Brother)){
 const story=storyBlock(s,'trial');if(story)return fail(story);
 if(!has(s,'promoted'))return fail('まず国王への謁見を終えましょう。');
 if(s.brothers.includes(a.enemy as Brother))return fail('この兄とは、すでに協力を約束しました。');
 }
 if(a.enemy==='demon'){const story=storyBlock(s,'demon');if(story)return fail(story);}
 if(a.enemy==='demon'&&(!has(s,'awakened')||s.brothers.length<4))return fail('五人の力をつなぐ準備が必要です。');
 if(a.enemy==='demon'&&has(s,'ended'))return fail('魔王はすでに倒されました。');
 s.battle={enemy:a.enemy,hp:maxHp(s),enemyHp:enemy.hp,turn:1,energy:0,cooldown:0,log:[`${enemy.name}が立ちはだかった！`],result:'active'};break;}
 case 'combat':{
 const b=s.battle;if(!b||b.result!=='active')return fail('いまはコマンドを選べません。');
 const cmd:CombatCommand=a.command;const enemy=ENEMIES[b.enemy];const intent=intentFor(b);const lines:string[]=[];b.events=[];let damage=0;let guard=false;
 switch(cmd){
 case 'attack':damage=attack(s);b.energy=Math.min(5,b.energy+1);lines.push(`リュカの一撃！ ${damage}ダメージ。`);break;
 case 'guard':guard=true;b.energy=Math.min(5,b.energy+2);lines.push('身を守り、仲間の声に耳を澄ます。共鳴＋2。');break;
 case 'potion':if(s.inventory.potion<1)return fail('癒やしの薬がありません。守るか、仲間に頼りましょう。');s.inventory.potion--;b.hp=Math.min(maxHp(s),b.hp+65);lines.push('癒やしの薬でHPを65回復。');break;
 case 'support':if(!s.party.length)return fail('まだ仲間がいません。');if(b.cooldown>0)return fail(`仲間の支援まであと${b.cooldown}ターン。`);damage=attack(s)+s.party.length*7;b.hp=Math.min(maxHp(s),b.hp+(s.party.includes('mira')?30:10));b.energy=Math.min(5,b.energy+1);b.cooldown=3;lines.push(`仲間が駆けつける！ ${damage}ダメージ、HP回復。`);break;
 case 'resonate':if(!has(s,'awakened'))return fail('この技は、まだ目覚めていません。');if(b.energy<5)return fail('共鳴を5つためましょう。攻撃で＋1、守るで＋2。');damage=attack(s)*4+55;b.hp=Math.min(maxHp(s),b.hp+35);b.energy=0;lines.push(`五光の共鳴！ 火・水・木・雷・絆。${damage}ダメージ！`);break;
 default:return fail('コマンドを選んでください。');
 }
 b.enemyHp=Math.max(0,b.enemyHp-damage);
 if(damage)b.events.push({kind:cmd==='resonate'?'resonate':cmd==='support'?'support':'player-hit',amount:damage,text:lines[0]});
 if(cmd==='support')b.events.push({kind:'heal',amount:s.party.includes('mira')?30:10,text:'仲間の回復'});
 if(cmd==='guard')b.events.push({kind:'guard',amount:0,text:'守りを固めた！'});
 if(cmd==='potion')b.events.push({kind:'heal',amount:65,text:'癒やしの薬'});
 if(b.enemyHp===0){
 b.result='won';lines.push(`${enemy.name}を乗り越えた！`);b.events.push({kind:'victory',amount:0,text:'VICTORY'});
 if(b.enemy==='bramble')reward('bramble',enemy.reward,enemy.xp,14,'toma');
 else if(b.enemy==='demon'){reward('ended',0,enemy.xp,30);}
 else if(!s.brothers.includes(b.enemy as Brother)){s.brothers.push(b.enemy as Brother);s.gold+=enemy.reward;s.xp+=enemy.xp;s.trust+=6;}
 }else{
 const enraged=b.enemy==='demon'&&b.enemyHp<enemy.hp*.45;
 if(intent.kind==='heal'){
  if(cmd==='support'||cmd==='resonate'){lines.push('連携で集中を崩した！ 回復を阻止。');b.events.push({kind:'guard',amount:0,text:'回復を阻止！'});}
  else{const heal=b.enemy==='demon'?40:23;b.enemyHp=Math.min(enemy.hp,b.enemyHp+heal);lines.push(`${intent.name}。敵のHPが${heal}回復。`);b.events.push({kind:'enemy-heal',amount:heal,text:intent.name});}
 }else{
  const hit=Math.round(enemy.attack*intent.multiplier*(enraged?1.12:1)*(guard?.25:1));b.hp=Math.max(0,b.hp-hit);
  lines.push(`${intent.name}！ ${hit}ダメージ${guard?'（防御で軽減）':''}。`);b.events.push({kind:'enemy-hit',amount:hit,text:intent.name});
  if(intent.kind==='drain'&&!guard){const drain=b.enemy==='demon'?2:1;b.energy=Math.max(0,b.energy-drain);lines.push(`共鳴が${drain}つほどけた……。「守る」で防げる。`);b.events.push({kind:'drain',amount:drain,text:'共鳴 −'+drain});}
  if(b.hp===0){b.result='lost';lines.push('倒れかけたあなたを、仲間が連れ戻した。進行は失われません。');b.events.push({kind:'defeat',amount:0,text:'立ち上がる力は、まだある。'});}
 }
 b.turn++;b.cooldown=Math.max(0,b.cooldown-1);
 }
 b.log=[...b.log,...lines].slice(-7);break;}
 case 'leaveBattle':
 if(!s.battle||s.battle.result==='active')return fail('戦闘はまだ続いています。');
 if(s.battle.result==='lost')s.inventory.potion=Math.max(s.inventory.potion,3);
 s.battle=null;break;
 }
 return {state:s,message,ok:true};
}
