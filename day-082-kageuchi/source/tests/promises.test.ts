// OWNER: core
// RULES.md「人が遊べる約束」の6つ。数値より先に、これを守る。
import { describe, expect, it } from 'vitest';
import { ASSASSINATE, GUARD, MOVE, PHASE } from '../src/config/rules';
import { canSee } from '../src/sim/guards';
import { NavGrid } from '../src/sim/nav';
import { getQuery } from '../src/sim/query';
import type { Sim } from '../src/sim/sim';
import { idleInput, type SimEvent, type SimInput } from '../src/sim/types';
import type { Phase } from '../src/contract/snapshot';
import { DEG, HONNOJI, makeSim, postGuard, seconds, stageWithGuards, stepN } from './helpers';
import { Rng } from '../src/sim/rng';

/** 出来事から「？」（最後の suspicious）→「！」（discovered）の間を、発見ごとに取り出す。 */
function gaps(events: SimEvent[]): { gap: number; distance: number; phase: Phase; cause: string }[] {
  const lastQ = new Map<string, number>();
  const out: { gap: number; distance: number; phase: Phase; cause: string }[] = [];
  for (const e of events) {
    if (e.type === 'suspicious') lastQ.set(e.guardId, e.t);
    if (e.type === 'discovered') {
      const q = lastQ.get(e.guardId);
      if (q === undefined) throw new Error(`「？」なしの発見: ${e.guardId} t=${e.t}`);
      out.push({ gap: e.t - q, distance: e.record.distance, phase: e.record.phase, cause: e.record.cause });
    }
  }
  return out;
}

function checkGap(g: { gap: number; distance: number; phase: Phase }, label: string): void {
  // 発見中を除く（discovered は発見中には出ない）
  expect(g.phase, label).not.toBe('alert');
  const min = g.distance > 3 ? 0.7 : 0.4;
  expect(g.gap, `${label}（距離 ${g.distance.toFixed(2)}m）`).toBeGreaterThanOrEqual(min - 1e-9);
}

describe('人が遊べる約束', () => {
  it('1. 発見中を除き、「？」から「！」まで 0.4 秒以上（3m より遠ければ 0.7 秒以上）：条件の総当たり', { timeout: 120_000 }, () => {
    const behaviours: { name: string; crouch: boolean; input: (sim: Sim, gx: number, gz: number) => SimInput }[] = [
      { name: '立って止まる', crouch: false, input: () => idleInput() },
      { name: 'しゃがんで止まる', crouch: true, input: () => idleInput() },
      { name: '歩いて近づく', crouch: false, input: (s, gx, gz) => toward(s, gx, gz, false) },
      { name: '走って近づく', crouch: false, input: (s, gx, gz) => toward(s, gx, gz, true) },
      { name: 'しゃがんで近づく', crouch: true, input: (s, gx, gz) => toward(s, gx, gz, false) },
      { name: '横へ走る', crouch: false, input: () => ({ ...idleInput(90 * DEG), moveY: 1, run: true }) },
    ];
    const places = [
      // 暗い境内（空 0.12）：東を向いた番兵
      { name: '闇', gx: -25, gz: 8, facing: 0 },
      // 石灯籠のそば（灯り）：南を向いた番兵の前に灯籠
      { name: '灯り', gx: -30.6, gz: 6.5, facing: 90 },
    ];
    const guardKinds = [{ name: '足軽', extra: {} }, { name: '蘭丸並み', extra: { sightMul: 1.15, fillMul: 0.85 } }];
    const phases: Phase[] = ['normal', 'caution', 'evasion'];
    let checked = 0;
    for (const place of places) {
      for (const gk of guardKinds) {
        for (const ph of phases) {
          for (const b of behaviours) {
            for (const dist of [1.6, 2.2, 2.9, 3.5, 5, 7, 10]) {
              for (const ang of [0, 35]) {
                for (const noiseFirst of [false, true]) {
                  const sim = makeSim({ god: true }, stageWithGuards([postGuard('g', place.gx, place.gz, place.facing, gk.extra)]));
                  if (ph !== 'normal') sim.setPhase(ph, 999);
                  const a = (place.facing + ang) * DEG;
                  sim.teleport(place.gx + Math.cos(a) * dist, place.gz + Math.sin(a) * dist);
                  if (sim.q.overlaps(sim.player.x, sim.player.z, MOVE.radius, b.crouch)) continue;
                  sim.setCrouch(b.crouch);
                  const ev: SimEvent[] = [];
                  if (noiseFirst) {
                    // 見える直前に、すぐそばで物音（s が 0.4 まで上がる）
                    sim.emitNoise(sim.player.x, sim.player.z, 50, 'footstep');
                    ev.push(...sim.drainEvents());
                  }
                  for (let i = 0; i < seconds(6) && sim.phase !== 'alert'; i++) {
                    sim.step(b.input(sim, place.gx, place.gz));
                    ev.push(...sim.drainEvents());
                  }
                  for (const g of gaps(ev)) {
                    checkGap(g, `${place.name}・${gk.name}・${ph}・${b.name}・${dist}m・${ang}°・音${noiseFirst ? 'あり' : 'なし'}`);
                    checked++;
                  }
                }
              }
            }
          }
        }
      }
    }
    // 総当たりで、実際に発見まで行った組が十分にあること
    expect(checked).toBeGreaterThan(200);
  });

  // r03-fix-play: 機械が混むと 180 秒を越えて時間切れになった（中身は通る）ので、枠だけ広げた
  it('1. 本物の配置で、でたらめに歩き回っても約束が守られる（種 5 つ × 4 分）', { timeout: 420_000 }, () => {
    let checked = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const sim = makeSim({ seed, god: true });
      const rng = new Rng(seed * 7919);
      let input = idleInput();
      const ev: SimEvent[] = [];
      // 寺の中のあちこちへ置いて歩かせる
      const spots = [[-20, 8], [0, 18], [-30, -8], [10, -16], [30, 0], [-5, -20], [20, 20], [-15, -25]];
      for (let i = 0; i < seconds(240); i++) {
        if (i % seconds(20) === 0) {
          const [x, z] = spots[Math.floor(rng.next() * spots.length)];
          if (!sim.q.overlaps(x, z, MOVE.radius, false)) sim.teleport(x, z);
        }
        if (i % 30 === 0) {
          const k = rng.next();
          input = {
            ...idleInput(rng.range(0, Math.PI * 2)),
            moveY: k < 0.15 ? 0 : 1,
            run: k > 0.75,
            crouchToggle: rng.next() < 0.2,
          };
        } else {
          input = { ...input, crouchToggle: false };
        }
        sim.step(input);
        ev.push(...sim.drainEvents());
      }
      for (const g of gaps(ev)) {
        checkGap(g, `種 ${seed}`);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('2. 見回りの番兵は、プレイヤーの今の位置を壁越しに知らない（目標は見た位置か音の位置だけ）', { timeout: 180_000 }, () => {
    for (const seed of [11, 12, 13]) {
      const sim = makeSim({ seed, god: true });
      const seen: { x: number; z: number }[] = [];
      const noises: { x: number; z: number }[] = [];
      const bad: string[] = [];
      const near = (list: { x: number; z: number }[], x: number, z: number, tol: number) => list.some((p) => Math.hypot(p.x - x, p.z - z) <= tol);
      // 刻みの途中で与えた目標は、その刻みの「見た位置・物音」を記録してから確かめる
      let pending: { id: string; x: number; z: number; why: string }[] = [];
      sim.onGoal = (g, x, z, why) => pending.push({ id: g.id, x, z, why });
      const rng = new Rng(seed);
      let input = idleInput();
      for (let i = 0; i < seconds(180); i++) {
        if (i % 45 === 0) input = { ...idleInput(rng.range(0, Math.PI * 2)), moveY: rng.next() < 0.8 ? 1 : 0, run: rng.next() > 0.6 };
        if (i % seconds(30) === 0) sim.teleport(...([[-20, 8], [5, 20], [-30, -10], [12, -18]][Math.floor(rng.next() * 4)] as [number, number]));
        sim.step(input);
        for (const e of sim.drainEvents()) if (e.type === 'footstep' || e.type === 'stoneLanded') noises.push({ x: e.x, z: e.z });
        if (sim.guards.some((g) => g.sees)) seen.push({ x: sim.player.x, z: sim.player.z });
        for (const gl of pending) {
          if (gl.why === 'sight' || gl.why === 'alert') {
            if (!near(seen, gl.x, gl.z, 1e-6)) bad.push(`${gl.id} ${gl.why} (${gl.x.toFixed(2)},${gl.z.toFixed(2)})`);
          } else if (gl.why === 'noise') {
            if (!near(noises, gl.x, gl.z, 1e-6)) bad.push(`${gl.id} noise (${gl.x.toFixed(2)},${gl.z.toFixed(2)})`);
          } else if (gl.why === 'search') {
            // 捜索の点は、捜索を始めたときの「最後に見た位置」の周り 8m（その後に別の発見で最後に見た位置が動いても、点は変えない）
            if (!near(seen, gl.x, gl.z, PHASE.searchRadius + 1e-6)) bad.push(`${gl.id} search (${gl.x.toFixed(2)},${gl.z.toFixed(2)})`);
          }
        }
        pending = [];
      }
      expect(bad, `種 ${seed}`).toEqual([]);
      expect(seen.length, '見つかる場面があったこと').toBeGreaterThan(0);
    }
  });

  it('2. 発見中に壁の向こうへ隠れると、番兵は最後に見た位置へ行き、今の位置へは来ない', { timeout: 60_000 }, () => {
    const sim = makeSim({ god: true }, stageWithGuards([postGuard('a', -20, -2, 90), postGuard('b', -12, -3, 180)]));
    sim.teleport(-20, 2.5);
    stepN(sim, seconds(2));
    expect(sim.phase).toBe('alert');
    const last = { ...sim.lastSeen! };
    // 板塀の向こう（奥の庭）へ一瞬で隠れる
    sim.teleport(-20, -14);
    stepN(sim, seconds(8));
    for (const id of ['a', 'b']) {
      const g = sim.byId.get(id)!;
      expect(Math.hypot(g.x - last.x, g.z - last.z), `${id} は最後に見た位置のそば`).toBeLessThan(2);
      expect(Math.hypot(g.x + 20, g.z + 14), `${id} は今の位置へ来ない`).toBeGreaterThan(5);
    }
  });

  // r03-fix-play: 既定の 5 秒の枠では、機械が混むと時間切れになった（8.5 秒かかった）
  it('3. 開始地点はどの番兵からも見えず、明るさは「闇」', { timeout: 60_000 }, () => {
    const sim = makeSim();
    expect(sim.player.tier).toBe('dark');
    for (let i = 0; i < seconds(30); i++) {
      for (const g of sim.guards) expect(canSee(sim, g).sees, `${g.id} t=${sim.t.toFixed(2)}`).toBe(false);
      sim.step(idleInput());
      expect(sim.drainEvents().some((e) => e.type === 'suspicious')).toBe(false);
    }
  });

  it('4. 番兵の道順と立ち位置は、建物・塀・池・小物に重ならない（体の半径ぶん離れている）', () => {
    const q = getQuery(HONNOJI);
    for (const g of HONNOJI.guards) {
      expect(q.overlaps(g.start.x, g.start.z, GUARD.radius, false), `${g.id} の立ち位置`).toBe(false);
      const r = g.route ?? [];
      const loop = g.routeMode === 'loop' ? [...r, r[0]] : r;
      for (let i = 0; i + 1 < loop.length; i++) {
        const a = loop[i].pos;
        const b = loop[i + 1].pos;
        const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1);
        for (let k = 0; k <= n; k++) {
          const x = a.x + ((b.x - a.x) * k) / n;
          const z = a.z + ((b.z - a.z) * k) / n;
          expect(q.overlaps(x, z, GUARD.radius, false), `${g.id} の道 ${i}→${i + 1} の (${x.toFixed(1)}, ${z.toFixed(1)})`).toBe(false);
        }
      }
    }
  });

  it('5. 開始地点から信長のそばまで、しゃがみで通れる道が 3 本ある（表門・裏門・水抜き穴）', () => {
    const q = getQuery(HONNOJI);
    const crouchNav = new NavGrid(q, MOVE.radius, true);
    const standNav = new NavGrid(q, MOVE.radius, false);
    const nb = HONNOJI.guards.find((g) => g.role === 'target')!.start;
    const gates = {
      表門: { x0: -3, x1: 3, z0: 29, z1: 31 },
      裏門: { x0: -37, x1: -35, z0: 7.5, z1: 12 },
      水抜き穴: { x0: 35, x1: 37, z0: -28.6, z1: -25.6 },
    };
    const reach = (nav: NavGrid, blocked: { x0: number; x1: number; z0: number; z1: number }[]): boolean => {
      const free = nav.free.slice();
      for (let j = 0; j < nav.h; j++)
        for (let i = 0; i < nav.w; i++) {
          const x = nav.cx(i);
          const z = nav.cz(j);
          if (blocked.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)) free[j * nav.w + i] = 0;
        }
      const start = nav.indexAt(HONNOJI.player.start.x, HONNOJI.player.start.z);
      const seen = new Uint8Array(free.length);
      const stack = [start];
      seen[start] = 1;
      while (stack.length) {
        const c = stack.pop()!;
        const ci = c % nav.w;
        const cj = (c - ci) / nav.w;
        if (Math.hypot(nav.cx(ci) - nb.x, nav.cz(cj) - nb.z) <= ASSASSINATE.range) return true;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = ci + di;
          const nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= nav.w || nj >= nav.h) continue;
          const n = nj * nav.w + ni;
          if (free[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
      return false;
    };
    const names = Object.keys(gates) as (keyof typeof gates)[];
    for (const name of names) {
      const others = names.filter((n) => n !== name).map((n) => gates[n]);
      expect(reach(crouchNav, others), `${name}の道（しゃがみ）`).toBe(true);
    }
    // 水抜き穴は立ったままでは通れない
    expect(reach(standNav, [gates.表門, gates.裏門]), '水抜き穴は立っては通れない').toBe(false);
  });

  it('6. 発見中の番兵の走る速さ（3.6。r03 で 4.3 から下げた）は、プレイヤーの走る速さ（5.2）より遅い', { timeout: 60_000 }, () => {
    expect(PHASE.chaseSpeed).toBeLessThan(MOVE.run);
    // 実際に追わせて、番兵の速さが PHASE.chaseSpeed を越えないこと
    const sim = makeSim({ god: true }, stageWithGuards([postGuard('a', -25, 8, 0)]));
    sim.teleport(-21, 8);
    stepN(sim, seconds(2));
    expect(sim.phase).toBe('alert');
    const a = sim.byId.get('a')!;
    const d0 = Math.hypot(sim.player.x - a.x, sim.player.z - a.z);
    let maxSpeed = 0;
    // 北（板塀まで 20m ひらけている）へ 3 秒走る
    for (let i = 0; i < seconds(3); i++) {
      sim.step({ ...idleInput(270 * DEG), moveY: 1, run: true });
      maxSpeed = Math.max(maxSpeed, a.speed);
    }
    expect(maxSpeed).toBeGreaterThan(3);
    expect(maxSpeed).toBeLessThanOrEqual(PHASE.chaseSpeed + 1e-6);
    // プレイヤーは逃げきれる（距離が開いていく）
    expect(Math.hypot(sim.player.x - a.x, sim.player.z - a.z)).toBeGreaterThan(d0 + 1.5);
  });
});

/** 番兵 (gx, gz) へ向かう入力。 */
function toward(sim: Sim, gx: number, gz: number, run: boolean): SimInput {
  const p = sim.player;
  return { ...idleInput(Math.atan2(gz - p.z, gx - p.x)), moveY: 1, run };
}
