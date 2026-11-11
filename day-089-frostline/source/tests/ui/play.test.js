import { it, expect } from 'vitest';
import { summaryContent } from '../../src/ui/summary.js';
import { markerLayout, mapContent, phrases, nearestDrop, stepDrop, lockedText } from '../../src/ui/map.js';
import { createHudTracker, hudContent, STOP_NOTE } from '../../src/ui/hud.js';
import { createPlay } from '../../src/play/index.js';
import { mountain, rider } from '../play/fixture.js';
it('記録の表示は数字5つ・課題3つ・今回の★・開いた地点・おすすめを含む',()=>{
  const p=createPlay({world:mountain(),storage:null});p.begin('d0',rider());p.update(rider({speed:0,pos:{x:0,y:300,z:500}}),[],65);
  const m=summaryContent(p.snapshot().summary);expect(m.stats).toHaveLength(5);expect(m.goals).toHaveLength(3);
  expect(m.goals[0]).toMatchObject({mark:'★',note:'今回達成',fresh:true});
  expect(m.primary.label).toContain('次の一本：');expect(m.secondary).toMatchObject({id:'d0',label:'同じ地点をもう一度'});
  // 数字は、値と単位に分かれる（単位を小さく出すため）。つなげて読んだ形も持つ
  expect(m.stats[2]).toMatchObject({label:'時間',text:'1分5秒',parts:[['1','分'],['5','秒']]});expect(m.stats[0].parts[0][1]).toBe(' m');
  expect(summaryContent(null)).toBeNull();
});
it('駅外で区切っても順は次・もう一度・地図、橙はもう一度',()=>{
  const p=createPlay({world:mountain(),storage:null});p.begin('d0',rider());p.update(rider({speed:0}),[],5);p.finish();
  const s=p.snapshot().summary,m=summaryContent(s);
  expect(s.next.id).not.toBe('d0');
  expect(m.primary).toMatchObject({id:'d0',label:'同じ地点をもう一度'});
  expect(m.actions.map(a=>a.action)).toEqual(['next','again','map']);
  expect(m.actions.map(a=>a.primary)).toEqual([false,true,false]);
  expect(m.goals.every(g=>g.mark==='☆'&&g.note==='まだ')).toBe(true);
});
it('地図は名前・難度・文字の状態・鍵・最高点・課題を絵なしでも返す',()=>{
  const p=createPlay({world:mountain(),storage:null}),m=mapContent(p.map(),'d13');expect(m.selected).toMatchObject({id:'d13',difficulty:'●●●●',state:'鍵がかかっています',best:0,remaining:3000,stars:0});
  expect(m.selected.goals).toHaveLength(3);const old=createPlay({world:{drops:[{id:'old',x:0,z:0,name:'雪原'}]},storage:null});expect(mapContent(old.map()).image).toBeNull();
});
it('案内は転倒＞端＞技＞発見＞着地＞区切り＞操作、点は0で隠す',()=>{
  const state=rider(),play={trick:{name:'360',score:300},notice:'見つけました',canFinish:true,run:{score:300}};
  expect(hudContent({state:{...state,mode:'crash'},reason:'landing-inverted',atBounds:true,play}).message).toContain('回転が合わない');
  expect(hudContent({state,atBounds:true,play}).message).toContain('山の端');expect(hudContent({state,play,landing:'clean'}).message).toBe('360　＋300 点');
  expect(hudContent({state,play:{...play,trick:{name:'テール 180',score:1419}}}).message).toBe('テール 180　＋1,419 点');
  expect(hudContent({state,play:{...play,trick:null},landing:'clean'}).message).toBe('見つけました');
  expect(hudContent({state,play:{canFinish:true},landing:'clean'}).message).toContain('きれい');expect(hudContent({state,play:{canFinish:true},hints:false}).message).toBe(STOP_NOTE);expect(STOP_NOTE).not.toContain('区切れます');
  expect(hudContent({state}).score).toBe(0);expect(hudContent({state,play}).score).toBe(300);
});
it.each(['keyboard','gamepad','touch'])('初飛行の後は%sの回転案内、試した後は宙返りを案内',device=>{
  const h=createHudTracker();const state=rider({mode:'air',air:{time:.7}});
  expect(h.update({state,device}).message).toContain('左右で回る');expect(h.update({state,device,input:{jump:true,steer:1}}).message).toContain('上下で宙返り');
  expect(h.update({state,device,input:{jump:true,tuck:1}}).message).not.toContain('宙返り');
});

it('密集した地図の印も44pxと間隔を保ち、元の座標を残す',()=>{
  const m=markerLayout(Array.from({length:64},(_,i)=>({id:String(i),left:50,top:50})));
  for(let i=0;i<m.items.length;i++){
    const a=m.items[i];expect(a.anchorLeft).toBe(50);expect(a.left*m.side/100-22).toBeGreaterThanOrEqual(-1e-9);expect(a.left*m.side/100+22).toBeLessThanOrEqual(m.side+1e-9);
    for(const b of m.items.slice(i+1))expect(Math.max(Math.abs(a.left-b.left),Math.abs(a.top-b.top))*m.side/100).toBeGreaterThanOrEqual(47.9);
  }
});
it('離れた印は動かさず、近い印だけを最小限に動かす（山の上の位置関係を保つ）',()=>{
  const items=[{id:'a',left:20,top:20},{id:'b',left:80,top:70},{id:'c',left:22,top:21}];
  const m=markerLayout(items,600);
  expect(m.items[0]).toMatchObject({left:20,top:20});expect(m.items[1]).toMatchObject({left:80,top:70});
  const c=m.items[2],moved=Math.hypot(c.left-22,c.top-21)*600/100;
  expect(moved).toBeGreaterThan(0);expect(moved).toBeLessThan(70); // 44px の印 1 つぶんほど動けば足りる
  expect(Math.max(Math.abs(c.left-20),Math.abs(c.top-20))*600/100).toBeGreaterThanOrEqual(47.9);
});
it.each([225,242,340])('一辺%sの小さな地図は拡大も格子化もせず、本当の位置から12px以内',side=>{
  const items=Array.from({length:16},(_,i)=>({id:String(i),left:40+(i%4)*4,top:35+Math.floor(i/4)*5}));
  const m=markerLayout(items,side);expect(m.side).toBe(side);expect(m.roomy).toBe(false);
  m.items.forEach((d,i)=>expect(Math.hypot(d.left-items[i].left,d.top-items[i].top)*side/100).toBeLessThanOrEqual(12+1e-6));
});
it('地図面は44px以内の最も近い印を選ぶ。範囲外と空は選ばない',()=>{
  const items=[{id:'a',left:20,top:20},{id:'b',left:40,top:20}];
  expect(nearestDrop(items,200,75,40)?.id).toBe('b');
  expect(nearestDrop(items,200,40,84)?.id).toBe('a');
  expect(nearestDrop(items,200,40,84.01)).toBeNull();
  expect(nearestDrop(items,200,200,200)).toBeNull();
  expect(nearestDrop([],200,0,0)).toBeNull();
  expect(nearestDrop(items,200,60,40)?.id).toBe('a');
});
it('送りは表示順で鍵も含めて前後に循環し、全地点に届く',()=>{
  const items=[{id:'a'},{id:'b',locked:true},{id:'c'}];
  expect(stepDrop(items,'a',-1).id).toBe('c');
  let id='a'; const visited=[];
  for(let i=0;i<3;i++){id=stepDrop(items,id,1).id;visited.push(id);}
  expect(visited).toEqual(['b','c','a']);expect(stepDrop([{id:'a'}],'a',1).id).toBe('a');
  expect(stepDrop([],'a',1)).toBeNull();
});
it('鍵の文は合計と残りを一か所にまとめる',()=>{
  expect(lockedText({threshold:6000,remaining:2600})).toBe('滑った標高差の合計 6,000 m で開きます（あと 2,600 m）');
});
it('駅で滑りきった記録も順は固定、橙は次の一本。地点名を見出しに含む',()=>{
  const p=createPlay({world:mountain(),storage:null});p.begin('d0',rider());p.update(rider({speed:0,pos:{x:0,y:300,z:500}}),[],5);
  const s=p.snapshot().summary,m=summaryContent(s);
  expect(m.title).toBe(`一本の記録：${s.dropName}`);
  expect(m.actions.map(a=>a.action)).toEqual(['next','again','map']);
  expect(m.actions.map(a=>a.primary)).toEqual([true,false,false]);
  expect(m.actions[0].id).not.toBe(s.dropId);
});
it('過去に完走済みでも今回は駅外ならもう一度が橙、地点が一つなら次を出さない',()=>{
  const world=mountain();world.drops=world.drops.slice(0,1);
  const p=createPlay({world,storage:null});p.begin('d0',rider());p.update(rider({speed:0,pos:{x:0,y:300,z:500}}),[],5);
  expect(summaryContent(p.snapshot().summary).actions.map(a=>a.action)).toEqual(['again','map']);
  p.begin('d0',rider());p.finish();const m=summaryContent(p.snapshot().summary);
  expect(m.goals[0]).toMatchObject({earned:true,fresh:false});
  expect(m.actions.map(a=>a.primary)).toEqual([true,false]);
});
it('技のない短い飛びは、記録の最高の技には載せない',()=>{
  const p=createPlay({world:mountain(),storage:null});p.begin('d0',rider());p.update(rider(),[{type:'land',air:.7,quality:'clean'}],1);p.finish();
  expect(summaryContent(p.snapshot().summary).best).toBe('技はまだありません');
});
it('ゆとりのある地図の44px丸は、駅の記号も避けて置く',()=>{
  const items=[{id:'a',left:50,top:50}],station=[{left:50,top:50}];
  const m=markerLayout(items,400,station),a=m.items[0];
  expect(m.roomy).toBe(true);expect(Math.hypot(a.left-50,a.top-50)*4).toBeGreaterThanOrEqual(30-1e-6);
});
it('名前は、の・を・へ の後ろでだけ折れる。前後が 2 文字より短くなる所では折らない',()=>{
  expect(phrases('初雪の練習斜面')).toEqual(['初雪の','練習斜面']);expect(phrases('湖を見おろす棚')).toEqual(['湖を','見おろす棚']);
  expect(phrases('ジャンプ台の列')).toEqual(['ジャンプ台の列']);expect(phrases('大ジャンプ台')).toEqual(['大ジャンプ台']);expect(phrases('山頂')).toEqual(['山頂']);
});

