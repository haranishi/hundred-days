// OWNER: tests
// 土台：乱数の系列が機能ごとに独立していること、固定刻みのループ、起動引数の読み取り。
import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../../src/core/loop';
import { Rng, hashString, stream } from '../../src/core/rng';
import { parseSettings } from '../../src/core/settings';

describe('乱数', () => {
  it('同じ種なら同じ列になる', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('系列は名前ごとに独立で、ほかの系列を何回引いても影響しない', () => {
    const ref = stream(7, 'city.lots', 3);
    const expected = Array.from({ length: 20 }, () => ref.next());
    const other = stream(7, 'city.roofs', 3);
    for (let i = 0; i < 500; i++) other.next();
    const again = stream(7, 'city.lots', 3);
    expect(Array.from({ length: 20 }, () => again.next())).toEqual(expected);
    expect(stream(7, 'city.roofs', 3).next()).not.toBe(expected[0]);
    expect(hashString('city.lots')).not.toBe(hashString('city.roofs'));
  });

  it('値の範囲と分布が偏っていない', () => {
    const r = new Rng(123);
    let sum = 0;
    for (let i = 0; i < 20000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(Math.abs(sum / 20000 - 0.5)).toBeLessThan(0.01);
    const counts = [0, 0, 0];
    for (let i = 0; i < 9000; i++) counts[r.int(0, 2)]++;
    for (const c of counts) expect(Math.abs(c - 3000)).toBeLessThan(250);
  });
});

describe('固定刻みのループ', () => {
  it('実時間の経過を固定刻みに割って進め、刻みの大きさは常に同じ', () => {
    const dts: number[] = [];
    let renders = 0;
    const loop = new FixedStepLoop(
      {
        update: (dt) => dts.push(dt),
        render: () => renders++,
      },
      { step: 1 / 60, maxSubSteps: 8 },
    );
    loop.advanceRealtime(0);
    loop.advanceRealtime(0.1); // 0.1 秒 = 6 刻み
    expect(dts.length).toBe(6);
    expect(new Set(dts)).toEqual(new Set([1 / 60]));
    expect(loop.simTime).toBeCloseTo(0.1, 6);
    expect(renders).toBe(2);
  });

  it('手動で進めると、実時間に関係なく1刻みずつ進む（撮影・コマ撮り用）', () => {
    let updates = 0;
    const loop = new FixedStepLoop({ update: () => updates++, render: () => undefined }, { step: 1 / 60, maxSubSteps: 4 });
    loop.setSimTime(12);
    loop.stepManual();
    loop.stepManual(2);
    expect(updates).toBe(3);
    expect(loop.simTime).toBeCloseTo(12 + 3 / 60, 9);
  });

  it('重いコマの遅れは捨てずに次のコマで取り戻す（r02-controls：バグ B2）', () => {
    const loop = new FixedStepLoop({ update: () => undefined, render: () => undefined }, { step: 1 / 60, maxSubSteps: 5 });
    let now = 0;
    loop.advanceRealtime(now);
    // 200ms の引っかかり（12刻みぶん）：そのコマは5刻みまで。残りは次の数コマで進める
    loop.advanceRealtime((now += 0.2));
    expect(loop.simTime).toBeCloseTo(5 / 60, 9);
    for (let i = 0; i < 6; i++) loop.advanceRealtime((now += 1 / 60));
    expect(now - loop.simTime).toBeLessThan(1 / 60 + 1e-9);
    // ずっと 100ms のコマ（10fps）でも、上限 8 なら実時間に付いていく
    const slow = new FixedStepLoop({ update: () => undefined, render: () => undefined }, { step: 1 / 60, maxSubSteps: 8 });
    let t = 0;
    slow.advanceRealtime(t);
    for (let i = 0; i < 50; i++) slow.advanceRealtime((t += 0.1));
    expect(t - slow.simTime).toBeLessThan(1 / 60 + 1e-9);
  });

  it('止まったあと（背景タブなど）の大きな経過は上限で打ち切る', () => {
    let updates = 0;
    const loop = new FixedStepLoop({ update: () => updates++, render: () => undefined }, { step: 1 / 60, maxSubSteps: 5 });
    loop.advanceRealtime(0);
    loop.advanceRealtime(10);
    expect(updates).toBe(5);
  });
});

describe('起動引数', () => {
  it('?shot と ?film と ?perf でモードが決まる', () => {
    expect(parseSettings('').mode).toBe('play');
    expect(parseSettings('?shot=street')).toMatchObject({ mode: 'shot', shotName: 'street', hud: false });
    expect(parseSettings('?film=overview&frames=90&drive=ext')).toMatchObject({ mode: 'film', shotName: 'overview', filmFrames: 90, externalDrive: true });
    expect(parseSettings('?perf=1&secs=5')).toMatchObject({ mode: 'perf', perfSeconds: 5 });
  });

  it('画質は1か所の既定値を使い、?q で上書きできる。不正な値は既定に戻る', () => {
    expect(parseSettings('?q=low').quality).toBe('low');
    expect(parseSettings('?q=ultra').quality).toBe(parseSettings('').quality);
  });
});
