// OWNER: core
// 倒れた仲間：見える距離 (4 + 10×L)（その仲間の足元の明るさ）で気づき、そこへ行って警戒（60 秒）を起こす。1人につき1回。
import { describe, expect, it } from 'vitest';
import { PHASE } from '../src/config/rules';
import { idleInput } from '../src/sim/types';
import { makeSim, postGuard, seconds, stageWithGuards, stepN, walkInput } from './helpers';

describe('倒れた仲間', () => {
  it('当て身で倒した番兵を別の番兵が見つけると、行って警戒（60 秒）を起こす', () => {
    // a は東向き。b は a の南 4.5m で、はじめ南を向き（当て身を見ない）、3 秒後に北（a の方）を向く
    const sim = makeSim({}, stageWithGuards([
      postGuard('a', -20, 8, 0),
      postGuard('b', -20, 12.5, 90, { lookAround: [{ yawDeg: 90, hold: 3 }, { yawDeg: 270, hold: 6 }] }),
    ]));
    sim.teleport(-21.2, 8);
    const ev = [...stepN(sim, 1, { ...idleInput(), interact: true }), ...stepN(sim, seconds(1.1))];
    const a = sim.byId.get('a')!;
    const b = sim.byId.get('b')!;
    expect(a.down).toBe(true);
    expect(ev.some((e) => e.type === 'discovered')).toBe(false);
    // 闇へ離れる（西へ歩く）
    stepN(sim, seconds(2.5), walkInput(180));
    const ev2 = stepN(sim, seconds(8));
    const noticed = ev2.find((e) => e.type === 'bodyNoticed');
    expect(noticed).toBeDefined();
    const found = ev2.find((e) => e.type === 'bodyFound');
    expect(found).toBeDefined();
    expect(sim.phase).toBe('caution');
    expect(sim.phaseLeft).toBeGreaterThan(PHASE.cautionFromBody - 8);
    expect(a.bodyFound).toBe(true);
    expect(b.mode === 'body' || b.mode === 'return' || b.mode === 'base').toBe(true);
  });

  it('暗がりの仲間には遠くから気づかない（4 + 10×L より遠い）', () => {
    const sim = makeSim({}, stageWithGuards([
      postGuard('a', -20, 8, 0),
      postGuard('b', -20, 14.5, 90, { lookAround: [{ yawDeg: 90, hold: 3 }, { yawDeg: 270, hold: 30 }] }),
    ]));
    sim.teleport(-21.2, 8);
    stepN(sim, 1, { ...idleInput(), interact: true });
    stepN(sim, seconds(1.1));
    stepN(sim, seconds(2.5), walkInput(180));
    const ev = stepN(sim, seconds(10));
    // 距離 6.5m、足元の明るさ 0.12 → 4 + 1.2 = 5.2m より遠い
    expect(ev.some((e) => e.type === 'bodyNoticed')).toBe(false);
    expect(sim.phase).toBe('normal');
  });
});
