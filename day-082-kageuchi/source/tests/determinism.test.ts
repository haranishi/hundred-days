// OWNER: core
// 決定性：同じ種と入力なら、同じ結果になる（捜索の乱数も種から）。
import { describe, expect, it } from 'vitest';
import type { Sim } from '../src/sim/sim';
import { idleInput, type SimInput } from '../src/sim/types';
import { Rng } from '../src/sim/rng';
import { DEG, makeSim, seconds } from './helpers';

/** 種から作った、でたらめだが毎回同じ入力の並び。見つかる・逃げる・小石・しゃがみを混ぜる。 */
function script(seed: number, n: number): SimInput[] {
  const r = new Rng(seed);
  const out: SimInput[] = [];
  let cur = idleInput();
  for (let i = 0; i < n; i++) {
    if (i % 40 === 0) {
      cur = { ...idleInput(r.range(0, Math.PI * 2)), moveY: r.next() < 0.85 ? 1 : 0, run: r.next() < 0.4 };
    }
    const aim = i % 300 > 280;
    out.push({ ...cur, crouchToggle: i % 211 === 0, interact: i % 97 === 0, aim, aimPoint: aim ? { x: -20 + (i % 13), z: 8 - (i % 7) } : null });
  }
  return out;
}

function fingerprint(sim: Sim): string {
  const p = sim.player;
  const parts = [sim.t.toFixed(6), sim.phase, sim.phaseLeft.toFixed(6), p.x.toFixed(9), p.z.toFixed(9), p.yaw.toFixed(9), String(p.stones), String(sim.stats.discoveries)];
  for (const g of sim.guards) parts.push(`${g.id}:${g.x.toFixed(9)},${g.z.toFixed(9)},${g.yaw.toFixed(9)},${g.s.toFixed(9)},${g.mode}`);
  return parts.join('|');
}

function run(seed: number, inputSeed: number, ticks: number): { prints: string[]; events: string } {
  const sim = makeSim({ seed, god: true });
  // 表門の篝火の前に立って見つかり、3 秒後に北西の路地（寺の外の闇）へ消えて、そこを歩き回る
  sim.teleport(0, 31.5);
  const inputs = script(inputSeed, ticks);
  const prints: string[] = [];
  const events: string[] = [];
  for (let i = 0; i < ticks; i++) {
    if (i === seconds(3)) sim.teleport(-40, -34);
    sim.step(i < seconds(3) ? idleInput() : inputs[i]);
    for (const e of sim.drainEvents()) events.push(JSON.stringify(e));
    if (i % 60 === 0) prints.push(fingerprint(sim));
  }
  return { prints, events: events.join('\n') };
}

describe('決定性', () => {
  it('同じ種と入力なら、毎秒の状態と出来事の並びがすべて一致する', { timeout: 120_000 }, () => {
    const a = run(7, 99, seconds(120));
    const b = run(7, 99, seconds(120));
    expect(a.prints.length).toBe(b.prints.length);
    for (let i = 0; i < a.prints.length; i++) expect(a.prints[i], `${i} 秒`).toBe(b.prints[i]);
    expect(a.events).toBe(b.events);
    // 試しの入力が、本当に見つかる場面と捜索を通っていること
    expect(a.events).toContain('"type":"discovered"');
    expect(a.events).toContain('"to":"evasion"');
  });

  it('捜索の点は種で変わる（乱数は種から作っている）', { timeout: 60_000 }, () => {
    const pts = (seed: number) => {
      const sim = makeSim({ seed, god: true });
      sim.teleport(0, 31.5);
      // 表門の篝火の前で見つかり、闇へ消えて捜索を待つ
      for (let i = 0; i < seconds(10) && sim.phase !== 'alert'; i++) sim.step({ ...idleInput(0 * DEG) });
      sim.teleport(-40, -34);
      for (let i = 0; i < seconds(12); i++) sim.step(idleInput());
      return sim.guards.filter((g) => g.mode === 'search').map((g) => g.searchPts.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`).join(' ')).join('|');
    };
    const p1 = pts(1);
    expect(p1.length).toBeGreaterThan(0);
    expect(pts(1)).toBe(p1);
    expect(pts(2)).not.toBe(p1);
  });
});
