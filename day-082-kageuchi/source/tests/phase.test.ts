// OWNER: core
// 寺の構えの移り変わり：発見 →（誰にも見られず 10 秒）→ 捜索 →（20 秒）→ 警戒 →（45 秒）→ 平常。
// 捜索中に見つかれば発見へ戻る。発見で 35m 以内の番兵が最後に見た位置へ走る。
import { describe, expect, it } from 'vitest';
import { PHASE } from '../src/config/rules';
import { makeSim, postGuard, seconds, stageWithGuards, stepN } from './helpers';
import { idleInput, type SimEvent } from '../src/sim/types';

function phaseLog(ev: SimEvent[]): { to: string; t: number }[] {
  return ev.filter((e): e is Extract<SimEvent, { type: 'phase' }> => e.type === 'phase').map((e) => ({ to: e.to, t: e.t }));
}

describe('寺の構え', () => {
  it('発見 → 10 秒 → 捜索 → 20 秒 → 警戒 → 45 秒 → 平常', { timeout: 60_000 }, () => {
    const sim = makeSim({ god: true }, stageWithGuards([postGuard('a', -25, 8, 0), postGuard('b', -18, 14, 270)]));
    sim.teleport(-21, 8);
    // 見えるところに立って、見つかるまで待つ
    let ev = stepN(sim, seconds(3));
    const found = ev.find((e) => e.type === 'discovered');
    expect(found).toBeDefined();
    expect(sim.phase).toBe('alert');
    // 遠くの闇（寺の外の北西の路地）へ消える。最後に見られたのは、この直前の刻み
    const tGone = sim.t;
    sim.teleport(-40, -34);
    ev = stepN(sim, seconds(80));
    const log = phaseLog(ev);
    expect(log.map((l) => l.to)).toEqual(['evasion', 'caution', 'normal']);
    // 最後に見られた時刻から 10 秒
    expect(log[0].t - tGone).toBeGreaterThanOrEqual(PHASE.alertCalmAfter - 0.02);
    expect(log[0].t - tGone).toBeLessThan(PHASE.alertCalmAfter + 0.05);
    expect(log[1].t - log[0].t).toBeCloseTo(PHASE.evasionTime, 1);
    expect(log[2].t - log[1].t).toBeCloseTo(PHASE.cautionTime, 1);
    expect(sim.stats.discoveries).toBe(1);
  });

  it('発見で、最後に見た位置から 35m 以内の番兵が走ってくる（3.6 m/s）。遠い番兵は来ない', () => {
    const sim = makeSim({ god: true }, stageWithGuards([postGuard('a', -25, 8, 0), postGuard('near', -10, 20, 90), postGuard('far', 15, -25, 90)]));
    sim.teleport(-21, 8);
    stepN(sim, seconds(3));
    expect(sim.phase).toBe('alert');
    expect(sim.byId.get('near')!.mode).toBe('chase');
    expect(sim.byId.get('far')!.mode).toBe('base');
  });

  it('捜索中に見つかれば、発見へ戻る（発見の数が 2 になる）', { timeout: 60_000 }, () => {
    const sim = makeSim({ god: true }, stageWithGuards([postGuard('a', -25, 8, 0)]));
    sim.teleport(-21, 8);
    stepN(sim, seconds(3));
    sim.teleport(-40, -34);
    stepN(sim, seconds(12));
    expect(sim.phase).toBe('evasion');
    // 捜索している番兵の前に出る
    const a = sim.byId.get('a')!;
    expect(a.mode).toBe('search');
    sim.teleport(a.x + Math.cos(a.yaw) * 3, a.z + Math.sin(a.yaw) * 3);
    stepN(sim, seconds(3));
    expect(sim.phase).toBe('alert');
    expect(sim.stats.discoveries).toBe(2);
  });

  it('捕まる：発見中の番兵が、視線の通る 1.3m 以内に入ると「討たれた」', () => {
    const sim = makeSim({}, stageWithGuards([postGuard('a', -25, 8, 0)]));
    sim.teleport(-21, 8);
    const ev = stepN(sim, seconds(6));
    const c = ev.find((e) => e.type === 'caught');
    expect(c).toBeDefined();
    expect(sim.outcome).toBe('caught');
    expect(sim.capture?.guardId).toBe('a');
    expect(sim.capture?.distance).toBeLessThanOrEqual(PHASE.catchDistance + 1e-6);
  });

  it('捜索に移るとき、全員の不審の値 s を 0.5 以下に下げる（RULES の r02 の変更）', { timeout: 30_000 }, () => {
    // r02-fix-play：体験の採点 4 位「捜索の始まりに不審が 0.94 残り、見えてから約 0.5 秒で再び発見になった」
    const sim = makeSim({ god: true }, stageWithGuards([postGuard('a', -25, 8, 0), postGuard('b', -18, 14, 270)]));
    sim.teleport(-21, 8);
    stepN(sim, seconds(3));
    expect(sim.phase).toBe('alert');
    sim.teleport(-40, -34);
    let before = 0;
    for (let i = 0; i < seconds(15) && sim.phase === 'alert'; i++) {
      before = Math.max(...sim.guards.map((g) => g.s));
      sim.step(idleInput());
    }
    expect(sim.phase).toBe('evasion');
    // 移る直前は追っていた番兵の s が 1。移った刻みで全員 0.5 以下
    expect(before).toBeGreaterThan(0.9);
    for (const g of sim.guards) expect(g.s, g.id).toBeLessThanOrEqual(PHASE.evasionSuspicionCap);
    expect(sim.guards.some((g) => g.mode === 'search')).toBe(true);
  });

  it('?god=1 では捕まらない', () => {
    const sim = makeSim({ god: true }, stageWithGuards([postGuard('a', -25, 8, 0)]));
    sim.teleport(-21, 8);
    stepN(sim, seconds(6));
    expect(sim.outcome).toBeNull();
  });
});
