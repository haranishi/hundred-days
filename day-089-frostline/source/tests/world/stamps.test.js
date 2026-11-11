import {describe,it,expect} from 'vitest';
import {makeKicker,makeCliff,makeLip,makeRollers,applyStamp,KICKER_SPECS} from '../../tools/worldgen/lib/feature-stamps.js';
import {evaluateStamp,stampWorld,runStamp} from '../../tools/worldgen/verify-stamps.mjs';

describe('独立した仕掛けの型',()=>{
  it('同じ入力で同じ高さ・有限の支持範囲を返す',()=>{
    for(const size of ['practice','small','medium'])for(const slopeDeg of [14,18,22,26]){
      const a=makeKicker({size,slopeDeg}),b=makeKicker({size,slopeDeg});
      for(let s=-a.before;s<a.after;s+=3.7)for(const t of [0,2,a.width/2]){
        expect(Number.isFinite(a.delta(s,t))).toBe(true);expect(a.delta(s,t)).toBe(b.delta(s,t));
      }
      expect(a.delta(-a.before-1,0)).toBe(0);expect(a.delta(a.after+1,0)).toBe(0);
      expect(a.delta(0,a.width/2+1)).toBe(0);
    }
  });
  it('外周では高さ差と接線を平面へ戻す',()=>{
    for(const a of [makeKicker({size:'medium',slopeDeg:22}),makeCliff({height:7,slopeDeg:34}),makeRollers({slopeDeg:12})]){
      const e=.001;
      expect(Math.abs(a.delta(-a.before+e,0)/e)).toBeLessThan(.01);
      expect(Math.abs(a.delta(a.after-e,0)/e)).toBeLessThan(.01);
      expect(Math.abs(a.delta(10,a.width/2-e)/e)).toBeLessThan(.01);
    }
  });
  it('横ずれ±2mは同じ滑走面、幅外は元の地形',()=>{
    const a=makeKicker({size:'practice',slopeDeg:14});
    for(let s=-a.before;s<a.after;s+=1.3){expect(a.delta(s,2)).toBe(a.delta(s,0));expect(a.delta(s,-2)).toBe(a.delta(s,0));}
    expect(a.width).toBeGreaterThanOrEqual(a.edgeWidth*1.5+20);
  });
  it('向きを変えて重ねても局所座標が一致する',()=>{
    const a=makeKicker({size:'small',slopeDeg:18}),heading=.7,x=120,z=-80,base=(x,z)=>100+.2*x-.3*z;
    const f=applyStamp(base,a,{x,z,heading});
    for(const s of [-10,0,10,40])for(const t of [-2,0,5]){
      const px=x+Math.sin(heading)*s+Math.cos(heading)*t,pz=z-Math.cos(heading)*s+Math.sin(heading)*t;
      expect(f(px,pz)-base(px,pz)).toBeCloseTo(a.delta(s,t),8);
    }
  });
  it('深い新雪と岩面を0〜1で返す。台には付けない',()=>{
    const a=makeCliff({height:12,slopeDeg:40}),k=makeKicker({size:'small',slopeDeg:18});
    expect(a.powder(20,0)).toBe(1);expect(a.rock(3,0)).toBe(1);
    for(let s=-50;s<300;s+=7)for(const t of [0,20,100])for(const f of ['powder','rock']){expect(a[f](s,t)).toBeGreaterThanOrEqual(0);expect(a[f](s,t)).toBeLessThanOrEqual(1);}
    expect(k.powder(10,0)).toBe(0);expect(k.rock(1,0)).toBe(0);
  });
  it('1024m・2m格子を本物のcreateWorldとして作る',()=>{
    const a=makeCliff({height:4,slopeDeg:28}),w=stampWorld(a),snow={};
    expect(w.meta.size).toBe(1024);expect(w.meta.cell).toBe(2);w.snowAt(0,240,snow);
    expect(snow.powder).toBe(1);expect(snow.depth).toBeGreaterThanOrEqual(.8);
  });
  it('戻り先の初速は中央の縁速度へ校正されている',()=>{
    const stamps=[...['practice','small','medium'].map(size=>makeKicker({size,slopeDeg:18})),makeCliff({height:7,slopeDeg:34}),makeRollers({slopeDeg:12})];
    for(const a of stamps){const r=runStamp(stampWorld(a),a,a.approach.speed,{entryOnly:true});expect(r.edge).not.toBeNull();expect(Math.abs(r.edge-(a.speed[0]+a.speed[1])/2)).toBeLessThan(.1);}
  });
  it('不正な型・寸法を拒否する',()=>{
    expect(()=>makeKicker({size:'unknown',slopeDeg:18})).toThrow();expect(()=>makeCliff({height:5,slopeDeg:28})).toThrow();
    expect(()=>makeLip({height:5,slopeDeg:26})).toThrow();expect(()=>makeRollers({slopeDeg:12,count:0})).toThrow();
  });
  it.each(['small','medium'])('採用対象：%s台18°の速度3通り、下限・衝撃・無転倒',size=>{
    const r=evaluateStamp(makeKicker({size,slopeDeg:18}),{trace:false,extras:false});
    const minimum=size==='small'?.6:.9;
    // One 240Hz tick of timing resolution; no upper airtime bound.
    const failed=r.runs.filter(x=>!x.flight||x.flight.air<minimum-1/240||x.flight.impact>.8||x.crash||!x.completed||x.error>=.1).map(x=>({mode:x.mode,edge:x.edge,air:x.flight?.air,impact:x.flight?.impact,crash:x.crash,completed:x.completed}));
    expect(failed).toEqual([]);
  },60000);
  it.each([4,7,12])('必須：%sm崖34°を8・13・18m/sで新雪へ降りて転ばない',height=>{
    const r=evaluateStamp(makeCliff({height,slopeDeg:34}),{trace:false,extras:false});
    expect(r.runs.filter(x=>!x.pass).map(x=>({edge:x.edge,error:x.error,air:x.flight?.air,impact:x.flight?.impact,crash:x.crash,completed:x.completed}))).toEqual([]);
  },60000);
});
