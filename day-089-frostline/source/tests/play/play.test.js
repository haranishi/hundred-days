import { describe, it, expect } from 'vitest';
import { createPlay } from '../../src/play/index.js';
import { scoreTrick } from '../../src/play/tricks.js';
import { goalsFor, evaluateGoals } from '../../src/play/goals.js';
import { mountain, rider, storage } from './fixture.js';
const setup = (world = mountain(), store = null) => { const p = createPlay({ world, storage: store }); p.begin('d0', rider()); return p; };
describe('要件1 一本の記録', () => {
  it('駅で区切り、記録・課題・次の地点を返す。一度だけ累計する', () => {
    const p = setup(); p.update(rider({ speed: 20, pos: { x: 0, y: 400, z: 200 } }), [], 2);
    p.update(rider({ speed: 5, pos: { x: 0, y: 300, z: 500 } }), [], 2);
    const s = p.snapshot(); expect(s.summary).toMatchObject({ descent: 200, distance: expect.any(Number), time: 4, maxSpeed: 20, station: 'base', dropName: '地点0' });
    expect(s.summary.goals[0].earned).toBe(true); expect(s.summary.next.id).toBe('d3');
    p.finish(); expect(p.snapshot().progress.totals.runs).toBe(1);
  });
  it('中腹は低速1.5秒、駅外は3秒で手動、転倒と空中では区切れない', () => {
    const p = setup(), mid = rider({ speed: .5, pos: { x:100,y:400,z:300 } });
    p.update(mid, [], 1.4); expect(p.snapshot().summary).toBeNull(); p.update(mid, [], .1); expect(p.snapshot().summary.station).toBe('mid');
    p.begin('d0', rider()); const stop = rider({ speed:0 }); p.update(stop,[],3); expect(p.snapshot().canFinish).toBe(true);
    p.update({ ...stop, mode:'crash' },[],1); expect(p.snapshot().canFinish).toBe(false);
    p.update({ ...stop, mode:'air' },[],4); expect(p.snapshot().canFinish).toBe(false);
  });
  it('移動の区切りは画面を出さず累計し、距離に移動を含めない', () => {
    const p = setup(); p.update(rider({ pos:{x:0,y:450,z:100} }),[],1); p.begin('d1',rider({pos:{x:90,y:500,z:0}}));
    expect(p.snapshot().summary).toBeNull(); expect(p.snapshot().progress.totals.descent).toBe(50); expect(p.snapshot().run.distance).toBe(0);
  });
});
describe('要件2 技', () => {
  it('そろえた後の端数（357° など）でも、360 として数える', () => {
    expect(scoreTrick({spin:357*Math.PI/180,quality:'clean'}).spin).toBe(360);
    expect(scoreTrick({spin:-183*Math.PI/180,quality:'clean'}).spin).toBe(180);
    expect(scoreTrick({flip:-352*Math.PI/180,quality:'clean'}).flip).toBe(1);
    // 窓に届かない回転は、数えない（120° は 0、300° の宙返りは 0）
    expect(scoreTrick({spin:120*Math.PI/180,air:.6,quality:'clean'})).toBeNull();
    expect(scoreTrick({flip:300*Math.PI/180,air:.6,quality:'clean'})).toBeNull();
    expect(scoreTrick({grab:3,grabTime:.5,quality:'clean'}).name).toBe('テール');
  });
  it.each([[180,100],[360,300],[540,500],[720,800],[900,1100],[1080,1500],[1260,1900]])('%s度の点', (deg,score) => expect(scoreTrick({spin:deg*Math.PI/180,quality:'clean'}).score).toBe(score));
  it('名前の順、組み合わせ、着地、欠けた旧項目', () => {
    const t = scoreTrick({spin:2*Math.PI,flip:-2*Math.PI,grab:1,grabTime:1,air:1.5,switchIn:true,switchOut:true,quality:'heavy'});
    expect(t.name).toBe('スイッチ インディ バックフリップ 360'); expect(t.score).toBe(Math.round(1300*1.3*1.2*1.1*1.1*.8));
    expect(scoreTrick({air:.9,quality:'clean'})).toBeNull(); expect(scoreTrick({air:1,quality:'clean'})).toMatchObject({name:'大きなジャンプ',score:50});
    expect(scoreTrick({spin:Math.PI,quality:'crash'}).score).toBe(0); expect(scoreTrick({})).toBeNull();
  });
  it('空中合計・転倒・技を積み上げ、表示を2秒で消す', () => {
    const p=setup(); p.update(rider({mode:'air'}),[],1); p.update(rider(),[{type:'land',spin:2*Math.PI,air:1,quality:'clean'}],.1); p.update(rider(),[{type:'crash'}],0);
    expect(p.snapshot().run).toMatchObject({air:1,crashes:1,score:350}); expect(p.snapshot().trick.name).toBe('360');
    p.update(rider(),[],2); expect(p.snapshot().trick).toBeNull();
  });
});
describe('要件3 進み具合', () => {
  it('種類ごとの課題は3つで、乱れと転倒は「決める」に含めない', () => {
    for (const kind of ['practice','park','bigair','open','plateau','forest','ridge','gully','steep','chute','spine']) expect(goalsFor(kind)).toHaveLength(3);
    const run={station:'base',maxSpeed:30,score:2500,air:5,crashes:0,tricks:[{spin:360,flip:1,air:3,drop:6,score:2500,quality:'clean'},{air:1,quality:'heavy'}]};
    for(const kind of ['practice','park','bigair','open','forest','ridge','gully','steep']) expect(evaluateGoals(kind,run)).toEqual([true,true,true]);
    expect(evaluateGoals('practice',{...run,tricks:[{spin:360,quality:'sketchy'}]})).toEqual([true,false,true]);
  });
  it('保存・壊れた保存・保存失敗・コピー・消去', () => {
    const store=storage(),p=setup(mountain(),store); p.update(rider({speed:0}),[],3); p.finish();
    const q=createPlay({world:mountain(),storage:store}); expect(q.snapshot().progress.totals.runs).toBe(1);
    const copy=q.snapshot(); copy.progress.totals.runs=99; expect(q.snapshot().progress.totals.runs).toBe(1);
    q.clearProgress(); expect(q.snapshot().progress.totals.runs).toBe(0);
    store.setItem('ginrei.progress.v1','{"totals":{"descent":"bad"},"drops":{"d0":{"stars":"bad"}}}'); expect(()=>setup(mountain(),store)).not.toThrow();
    expect(()=>setup(mountain(),{getItem(){throw Error();},setItem(){throw Error();}})).not.toThrow();
  });
  it('隠れた地点を滑って発見し、累計3000/6000/10000で開く', () => {
    const p=setup(); expect(p.map().drops).toHaveLength(12); p.update(rider({pos:{x:810,y:500,z:0}}),[],1);
    expect(p.map().drops.find(d=>d.id==='d9')).toBeDefined(); expect(p.snapshot().notice).toContain('見つけました');
    for(const [height,expected] of [[3000,1],[6000,2],[10000,3]]) {
      const store=storage(); store.setItem('ginrei.progress.v1',JSON.stringify({totals:{descent:height}})); const q=setup(mountain(),store);
      expect(q.map().drops.filter(d=>d.level===4&&!d.locked)).toHaveLength(expected);
    }
  });
  it('おすすめは未完走の低難度、次に未達の★、最後に別地点', () => {
    const world=mountain(); world.drops=world.drops.slice(0,2); const p=setup(world);
    expect(p.recommend().id).toBe('d0'); p.update(rider({speed:0,pos:{x:0,y:400,z:500}}),[],1); expect(p.recommend().id).toBe('d1');
  });
});
describe('要件4/5/6 地図と戻り先と互換性', () => {
  it('地図は印のデータと鍵の残り、駅、仕掛けを持つ',()=>{const p=setup(); expect(p.map()).toMatchObject({image:'world/map.png',stations:expect.any(Array),features:expect.any(Array)}); expect(p.map().drops.find(d=>d.id==='d13')).toMatchObject({locked:true,remaining:3000}); expect(p.begin('d13',rider())).toBe(false);});
  it('仕掛けを通った30秒だけapproachへ戻る',()=>{const p=setup(); p.update(rider({pos:{x:50,y:490,z:50}}),[],.1); expect(p.retryPoint()).toMatchObject({x:50,z:90,speed:12}); p.update(rider({pos:{x:100,y:400,z:100}}),[],30.1); expect(p.retryPoint().id).toBe('d0');});
  it('古い山・古い出来事でも動き、状態と山を書き換えない',()=>{const world={drops:[{id:'d0',name:'練習',x:0,z:0}]}; const p=setup(world),s=rider({speed:0}); const before=structuredClone(s),w=structuredClone(world); p.update(s,[{type:'land',quality:'clean'}],3); expect(s).toEqual(before); expect(world).toEqual(w); expect(p.snapshot().canFinish).toBe(true); expect(p.finish()).toBeTruthy();});
});
describe('境界と永続化の回帰',()=>{
  it('乱れた着地の点・宙返り2/3回・つかみ上限・逆向きの倍率',()=>{
    expect(scoreTrick({spin:Math.PI,quality:'sketchy'}).score).toBe(40);
    expect(scoreTrick({flip:Math.PI*4,quality:'clean'}).score).toBe(1500);
    expect(scoreTrick({flip:Math.PI*6,quality:'clean'}).score).toBe(2700);
    expect(scoreTrick({grab:2,grabTime:20,quality:'clean'})).toMatchObject({name:'ミュート',score:500});
    expect(scoreTrick({spin:Math.PI,switchOut:true,quality:'clean'}).score).toBe(110);
  });
  it('ふもとは勢いのまま入っても着く（空中と転倒の間は着かない）。中腹は低速が途切れたら数え直す',()=>{
    // ふもとの駅は、ゴールの門の扱い：時速 80 km で通っても「着いた」になる（遅くなるまで待つ決まりだったときは、通り過ぎて、その先の建物に当たった）
    const p=setup(),pos={x:0,y:300,z:500};p.update(rider({pos,speed:23,mode:'air'}),[],1);expect(p.snapshot().summary).toBeNull();
    p.update(rider({pos,speed:23,mode:'crash'}),[],.1);expect(p.snapshot().summary).toBeNull();
    p.update(rider({pos,speed:23}),[],.1);expect(p.snapshot().summary.station).toBe('base');
    p.begin('d0',rider());const middle={x:100,y:400,z:300};
    p.update(rider({pos:middle,speed:.9}),[],1);p.update(rider({pos:middle,speed:1}),[],.1);p.update(rider({pos:middle,speed:.9}),[],1);expect(p.snapshot().summary).toBeNull();
    p.update(rider({pos:middle,speed:.9}),[],.5);expect(p.snapshot().summary.station).toBe('mid');
  });
  it('小さな飛び2回も尾根の課題に使い、★は再取得で強調しない',()=>{
    const world=mountain();world.drops[0].kind='ridge';const p=setup(world);
    p.update(rider(),[{type:'land',air:.6,quality:'clean'},{type:'land',air:.7,quality:'heavy'}],1);p.finish();
    expect(p.snapshot().summary.goals[1]).toMatchObject({earned:true,fresh:true});
    p.begin('d0',rider());p.finish();expect(p.snapshot().summary.goals[1]).toMatchObject({earned:true,fresh:false});
  });
  it('全地点完走なら未達の★、全部達成なら別地点をすすめる',()=>{
    const world=mountain();world.drops=world.drops.slice(0,2);const store=storage();
    store.setItem('ginrei.progress.v1',JSON.stringify({drops:{d0:{runs:1,stars:[true,true,true]},d1:{runs:1,stars:[true,false,true]}}}));
    const p=setup(world,store);expect(p.recommend().id).toBe('d1');
    store.setItem('ginrei.progress.v1',JSON.stringify({drops:{d0:{runs:1,stars:[true,true,true]},d1:{runs:1,stars:[true,true,true]}}}));
    expect(setup(world,store).recommend().id).toBe('d1');
  });
  it('累計による解放は今回の記録に載り、最高点・最後の地点・発見を保存する',()=>{
    const store=storage(),p=setup(mountain(),store);p.update(rider({pos:{x:810,y:-2500,z:0}}),[{type:'land',spin:Math.PI*2,quality:'clean'}],2);p.finish();
    expect(p.snapshot().summary.opened).toEqual([{id:'d13',name:'地点13'}]);
    const q=createPlay({world:mountain(),storage:store});expect(q.snapshot().progress).toMatchObject({lastDrop:'d0',drops:{d0:{best:300,runs:1}},discovered:['d9']});expect(q.map().drops.find(d=>d.id==='d13').locked).toBe(false);
  });
  it('停止したまま・転倒・空中では隠れた地点を発見しない',()=>{
    const p=setup();for(const [mode,speed] of [['rest',0],['air',10],['crash',10]])p.update(rider({mode,speed,pos:{x:810,y:500,z:0}}),[],1);
    expect(p.map().drops.some(d=>d.id==='d9')).toBe(false);
  });
});
it('転んだ飛びは 0 点。技として知らせず、記録の「いちばん高い技」にも載せない',()=>{
  const p=createPlay({world:mountain(),storage:null});p.begin('d0',rider());
  p.update(rider({mode:'crash'}),[{type:'land',air:1.4,quality:'sketchy'},{type:'crash',reason:'landing-hard'}],1/60);
  expect(p.snapshot().trick).toBeNull();
  p.update(rider({speed:0}),[],5);const s=p.finish();
  expect(s.bestTrick).toBeNull();expect(s.score).toBe(0);expect(s.crashes).toBe(1);
});


it('記録の次の一本は未完走でも別地点を選ぶ。一地点の山はnull',()=>{
  const world=mountain();const p=setup(world);p.finish();
  expect(p.snapshot().summary.next.id).not.toBe('d0');
  world.drops=world.drops.slice(0,1);const q=setup(world);q.finish();expect(q.snapshot().summary.next).toBeNull();
});
