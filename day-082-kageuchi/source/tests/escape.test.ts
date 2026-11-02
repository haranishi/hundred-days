// OWNER: core
// 発見の後の逃げ方（r03-fix-play 追加：体験の採点 1 位「案内『視線を切ったら歩いて離れろ』が追っ手の動きと合わず、案内どおりにすると捕まる」）。
// 追っ手は最後に見た位置まで走ってくる。だから抜け方は「走って視線を切り、その場を離れてからしゃがむ」。
// 振り切るまでに走る距離を、まっすぐな通りと表門の二つの場面で測る（直す前の値は報告 runs/r03-fix-play.md）。
import { describe, expect, it } from 'vitest';
import { PHASE } from '../src/config/rules';
import type { Sim } from '../src/sim/sim';
import { idleInput, type SimInput } from '../src/sim/types';
import { ALERT_TIP } from '../src/ui/text';
import { DEG, makeSim, postGuard, seconds, stageWithGuards } from './helpers';

/** 視線が切れた後の動き方。run＝走り続ける、leaveThenCrouch＝最後に見られた所から 8m 離れるまで走ってからしゃがんで止まる、crouchNow＝その場でしゃがんで止まる。 */
type After = 'run' | 'leaveThenCrouch' | 'crouchNow';
/** 「その場を離れて」の距離（m）。発見中にしゃがんだ者が見える距離（暗がりで約 5.5m）より遠く */
const LEAVE = 8;

interface EscapeRun {
  /** 見つかってから、最後に見られた瞬間までに走った道のり（m）。 */
  runToLastSeen: number;
  caught: boolean;
  /** 発見が切れて捜索へ下がった。 */
  calmed: boolean;
  /** 視線が一度切れた後に、また見られた回数。 */
  reSeen: number;
}

/** 発見中から、道の点を順にたどって走る。視線が切れた後は after の動き方。 */
function escape(sim: Sim, path: { x: number; z: number }[], after: After, maxSec = 40): EscapeRun {
  let wp = 0;
  let dist = 0;
  let runToLastSeen = 0;
  let reSeen = 0;
  let wasUnseen = false;
  let stopped = false;
  for (let i = 0; i < seconds(maxSec); i++) {
    const p = sim.player;
    while (wp < path.length - 1 && Math.hypot(path[wp].x - p.x, path[wp].z - p.z) < 0.5) wp++;
    const t = path[wp];
    const yaw = Math.atan2(t.z - p.z, t.x - p.x);
    const atEnd = wp === path.length - 1 && Math.hypot(t.x - p.x, t.z - p.z) < 0.5;
    const unseen = sim.phase === 'alert' && sim.alertUnseen > 0;
    let inp: SimInput = { ...idleInput(yaw), moveY: atEnd ? 0 : 1, run: true };
    if (unseen && after !== 'run') {
      const ls = sim.lastSeen!;
      if (stopped || after === 'crouchNow' || Math.hypot(p.x - ls.x, p.z - ls.z) >= LEAVE) {
        stopped = true;
        inp = { ...idleInput(yaw), crouchToggle: !p.crouch };
      }
    }
    const x0 = p.x;
    const z0 = p.z;
    sim.step(inp);
    sim.drainEvents();
    dist += Math.hypot(sim.player.x - x0, sim.player.z - z0);
    if (sim.sightedThisTick) {
      runToLastSeen = dist;
      if (wasUnseen) reSeen++;
      wasUnseen = false;
    } else if (sim.phase === 'alert') wasUnseen = true;
    if (sim.outcome === 'caught') return { runToLastSeen, caught: true, calmed: false, reSeen };
    if (sim.phase === 'evasion') return { runToLastSeen, caught: false, calmed: true, reSeen };
  }
  return { runToLastSeen, caught: false, calmed: false, reSeen };
}

/** まっすぐな通り（南の通り・暗がり）で、4m 先の番兵一人に見つかったところ。東へ走る。 */
function street(): { sim: Sim; path: { x: number; z: number }[] } {
  const sim = makeSim({}, stageWithGuards([postGuard('a', -30, 35.5, 0)]));
  sim.teleport(-26, 35.5, 0);
  sim.discover(sim.byId.get('a')!, 'sight');
  sim.drainEvents();
  return { sim, path: [{ x: 41, z: 35.5 }] };
}

/** 表門の篝火の縁で立ち止まって見つかったところ（番兵は全員いる）。通りを西へ走り、西の小路を北へ。 */
function gate(): { sim: Sim; path: { x: number; z: number }[] } {
  const sim = makeSim({ seed: 1 });
  sim.teleport(0, 33.5, 270);
  for (let i = 0; i < seconds(20) && sim.phase !== 'alert'; i++) sim.step(idleInput(270 * DEG));
  sim.drainEvents();
  expect(sim.phase).toBe('alert');
  return { sim, path: [{ x: -3, z: 35.5 }, { x: -40.5, z: 35.5 }, { x: -40.5, z: -30 }] };
}

describe('発見の後の逃げ方', () => {
  it('追っ手の走る速さ（3.6）は、プレイヤーの走り（5.2）より 1.5 m/s 以上遅い（r03：4.3→3.6）', () => {
    expect(PHASE.chaseSpeed).toBeLessThanOrEqual(5.2 - 1.5);
  });

  it('まっすぐな暗い通りで 4m 先から見つかっても、走れば 20m 以内で視線が切れる（r02 の 4.3 m/s では 31.6m）', { timeout: 120_000 }, () => {
    const { sim, path } = street();
    const r = escape(sim, path, 'run');
    process.stdout.write(`まっすぐな通り：最後に見られるまで ${r.runToLastSeen.toFixed(1)}m 走った\n`);
    expect(r.caught).toBe(false);
    expect(r.calmed).toBe(true);
    expect(r.runToLastSeen).toBeLessThanOrEqual(20);
  });

  it('表門の灯りで見つかり、番兵が集まっても、通りを走って 30m 以内で視線が切れる（r02 の 4.3 m/s では 69.6m）', { timeout: 120_000 }, () => {
    const { sim, path } = gate();
    const r = escape(sim, path, 'run');
    process.stdout.write(`表門：最後に見られるまで ${r.runToLastSeen.toFixed(1)}m 走った\n`);
    expect(r.caught).toBe(false);
    expect(r.calmed).toBe(true);
    expect(r.runToLastSeen).toBeLessThanOrEqual(30);
  });

  it('案内どおり（走って視線を切り、その場を離れてからしゃがむ）にすると、捕まらずに捜索へ下がる', { timeout: 120_000 }, () => {
    expect(ALERT_TIP).toContain('離れ');
    expect(ALERT_TIP).toContain('しゃが');
    for (const make of [street, gate]) {
      const { sim, path } = make();
      const r = escape(sim, path, 'leaveThenCrouch');
      expect(r.caught, make.name).toBe(false);
      expect(r.calmed, make.name).toBe(true);
      expect(r.reSeen, make.name).toBe(0);
    }
  });

  it('視線が切れた所でそのまましゃがむと、追っ手が最後に見た位置まで来て、また見つかる（だから案内は「離れてから」）', { timeout: 120_000 }, () => {
    for (const make of [street, gate]) {
      const { sim, path } = make();
      const r = escape(sim, path, 'crouchNow', 25);
      expect(r.reSeen + (r.caught ? 1 : 0), make.name).toBeGreaterThan(0);
    }
  });
});
