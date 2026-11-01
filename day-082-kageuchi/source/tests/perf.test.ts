// OWNER: core
// 1刻みの sim の時間（番兵 10 人＋信長・扇つき）。プレイヤーが歩き回り、見つかって追われ、捜索まで起きる場面で測る。
// 目安は 1.5ms 以下。機械が混んでいると壁時計が伸びるので、CPU 時間（process.cpuUsage）も出す。数字は .captures/perf-sim.json にも残す。
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/sim/rng';
import { idleInput } from '../src/sim/types';
import type { GuardDef } from '../src/stage/types';
import { HONNOJI, makeSim, seconds } from './helpers';

/** 10 人目の番兵：庫裏の西を往復する提灯持ち（道順は当たりに重ならない）。 */
const EXTRA: GuardDef = {
  id: 'perf-extra',
  name: '計測用の見回り',
  kind: 'ashigaru',
  role: 'guard',
  weapon: 'spear',
  lantern: true,
  start: { x: 16, z: 16 },
  facingDeg: 270,
  routeMode: 'pingpong',
  speed: 1.2,
  route: [
    { pos: { x: 16, z: 16 }, wait: 2, looks: [90, 180] },
    { pos: { x: 16, z: 0 }, wait: 2, looks: [270, 0] },
  ],
};

describe('性能', () => {
  it('1刻みの sim の時間（本面の番兵＋計測用1人・扇つき）', { timeout: 300_000 }, () => {
    const sim = makeSim({ seed: 9, god: true, extraGuards: [EXTRA] });
    const guards = sim.guards.filter((g) => g.role === 'guard').length;
    expect(guards).toBe(HONNOJI.guards.filter((g) => g.role === 'guard').length + 1);
    const rng = new Rng(77);
    // 温め（JIT・格子・問い合わせ）
    for (let i = 0; i < 600; i++) sim.step(idleInput());
    sim.teleport(-20, 8);
    const ticks = seconds(240);
    const wall = new Float64Array(ticks);
    let input = idleInput();
    const spots: [number, number][] = [[-20, 8], [0, 31.5], [5, 18], [-30, -10], [12, -18], [-5, -20], [25, -5]];
    let alerts = 0;
    const c0 = process.cpuUsage();
    for (let i = 0; i < ticks; i++) {
      if (i % seconds(15) === 0) sim.teleport(...spots[Math.floor(rng.next() * spots.length)]);
      if (i % 40 === 0) input = { ...idleInput(rng.range(0, Math.PI * 2)), moveY: rng.next() < 0.85 ? 1 : 0, run: rng.next() < 0.5 };
      const t0 = performance.now();
      sim.step(input);
      wall[i] = performance.now() - t0;
      if (sim.drainEvents().some((e) => e.type === 'discovered')) alerts++;
    }
    const cpu = process.cpuUsage(c0);
    const sorted = Array.from(wall).sort((a, b) => a - b);
    const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
    const avgWall = wall.reduce((a, b) => a + b, 0) / ticks;
    const avgCpu = (cpu.user + cpu.system) / 1000 / ticks;
    const r = {
      guards,
      cones: sim.guards.length,
      ticks,
      discoveries: alerts,
      avgCpuMs: Number(avgCpu.toFixed(4)),
      avgWallMs: Number(avgWall.toFixed(4)),
      p50WallMs: Number(pct(50).toFixed(4)),
      p95WallMs: Number(pct(95).toFixed(4)),
      p99WallMs: Number(pct(99).toFixed(4)),
      maxWallMs: Number(sorted[sorted.length - 1].toFixed(3)),
      date: new Date().toISOString(),
    };
    mkdirSync('.captures', { recursive: true });
    writeFileSync('.captures/perf-sim.json', JSON.stringify(r, null, 2));
    process.stdout.write(`sim 1刻み：CPU 平均 ${r.avgCpuMs}ms・壁時計 平均 ${r.avgWallMs}ms / p50 ${r.p50WallMs} / p95 ${r.p95WallMs} / p99 ${r.p99WallMs} / 最大 ${r.maxWallMs}ms（番兵 ${guards}・扇 ${r.cones}・発見 ${alerts} 回）\n`);
    // 見つかって追われる場面を通っていること（A* と扇が重い場面を含める）
    expect(alerts).toBeGreaterThan(0);
    // 目安 1.5ms（CPU 時間の平均）
    expect(r.avgCpuMs).toBeLessThan(1.5);
    void HONNOJI;
  });
});
