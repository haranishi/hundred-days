/**
 * CPUのライバル。自分と同じルールで遊ぶ（docs/03）：格子と A* で歩き、近い悪事を選んでやる→次へ。
 * 入力は人と同じ InputState の形で Simulation に渡す（特別な近道はしない）。
 * 1つの悪事は「行く・押す・長押し・待つ・向く・運転する」の手順の並びで表す。
 * 強さ（tuning.ts の CPU）：速さ・判断の間・回る悪事・1回の訪問でやる量・追われたら逃げるか・本気の小技（皮を置く・放送でそらす）。
 */
import type { InputState } from '../../../shared/input';
import { EMPTY_INPUT } from '../../../shared/input';
import type { ShelfFace } from '../../../shared/layout/store';
import { BANANA, BELL, CART, CPU, CPU_PLAN, FREEZER, PA, PICKUP_RANGE, SAMPLES, TANTRUM, type CpuTask, type CpuTuning } from '../../../shared/rules/tuning';
import type { Rng } from '../../../shared/rng';
import type { CpuLevel } from '../../../shared/view';
import type { P2 } from '../nav/grid';
import { NavGrid } from '../nav/grid';
import type { Controller, Simulation } from '../Simulation';
import { activePeels } from '../systems/banana';
import { bellRingsLeft } from '../systems/bell';
import { melonsOnWagon } from '../systems/bowling';
import { nearestFreeCart } from '../systems/cart';
import { paReady } from '../systems/pa';
import { pyramidStanding } from '../systems/pyramid';
import { samplesLeft } from '../systems/samples';
import { sweepTargets } from '../systems/sweep';
import type { AvatarState } from '../types';

type TaskKind = CpuTask | 'wander' | 'flee';

type Step =
  | { k: 'go'; to: P2 | (() => P2 | null); arrive: number }
  | { k: 'press'; system: string | null; times: number; interval: number; limit: number }
  | { k: 'hold'; secs: number; system: string | null }
  | { k: 'wait'; secs: number }
  | { k: 'face'; dx: number; dz: number }
  | { k: 'drive'; route: P2[]; meters: number }
  | { k: 'sweepRun'; face: ShelfFace; units: number }
  | { k: 'flee'; from: number; secs: number };

interface Task {
  kind: TaskKind;
  key: string;
  steps: Step[];
  i: number;
  startedAt: number;
  stepAt: number;
  count: number;
  path: P2[];
  pathI: number;
  pathTo: P2 | null;
  /** ステップ開始時の目的地。経路の引き直しとは独立して保つ */
  frozenTo: P2 | null;
  routeI: number;
  metersAtStart: number;
}

interface Candidate {
  kind: TaskKind;
  key: string;
  goal: P2;
  value: number;
  time: number;
  steps: () => Step[];
}

/** カートで走る道：カート置き場→レジの手前を西へ→広場を西の端まで→東の端まで→缶ピラミッドの特売台へ突っ込む */
const CART_ROUTE: P2[] = [
  { x: 6.0, z: 10.1 },
  { x: 4.0, z: 8.0 },
  { x: 2.0, z: 5.6 },
  { x: -12.0, z: 5.4 },
  { x: -14.0, z: 4.5 },
  { x: -10.0, z: 5.6 },
  { x: 14.0, z: 5.6 },
  { x: 15.5, z: 4.6 },
  { x: 8.0, z: 5.8 },
  { x: 3.5, z: 4.4 },
];

export class CpuBrain implements Controller {
  private task: Task | null = null;
  private idleUntil = 0;
  private lastPress = -Infinity;
  private stuckCheckAt = 0;
  private stuckFrom: P2 = { x: 0, z: 0 };
  private stuckCount = 0;
  private lastKind: TaskKind | null = null;
  private readonly lastDone = new Map<TaskKind, number>();
  private readonly failed = new Map<string, number>();
  private readonly tune: CpuTuning;
  /** これまでに選んだ回数（最初の1回だけ、上位からくじで選ぶ） */
  private picks = 0;

  constructor(
    readonly level: CpuLevel,
    private readonly rng: Rng,
  ) {
    this.tune = CPU[level];
  }

  input(sim: Simulation, av: AvatarState): InputState {
    const out: InputState = { ...EMPTY_INPUT };
    if (sim.phase !== 'playing' || av.stunned > 0) {
      this.task = null;
      return out;
    }
    // 追われたら逃げる（本気は、放送が近ければ放送で店員をそらす）
    const chaser = this.chaser(sim, av);
    if (chaser && this.tune.flee && this.task?.kind !== 'flee' && this.task?.kind !== 'pa' && av.ridingCart === null) {
      const pa = sim.layout.places.pa;
      if (this.tune.tricks && paReady(sim) && Math.hypot(av.pos.x - pa.x, av.pos.z - pa.z) < 9) this.task = this.makeTask('pa', 'pa:escape', this.paSteps(sim));
      else this.task = this.makeTask('flee', 'flee', [{ k: 'flee', from: chaser.id, secs: 7 }]);
      if (av.holding !== null && this.task.kind === 'flee') this.task.steps.unshift({ k: 'press', system: null, times: 1, interval: 0, limit: 0.2 });
      this.resetStuck(sim, av);
    }
    if (!this.task) {
      if (sim.time < this.idleUntil) return out;
      this.task = this.choose(sim, av);
      if (!this.task) {
        this.idleUntil = sim.time + this.tune.think;
        return out;
      }
      this.resetStuck(sim, av);
    }
    this.run(sim, av, this.task, out);
    return out;
  }

  // ───────── 状況 ─────────

  private chaser(sim: Simulation, av: AvatarState): { id: number; x: number; z: number } | null {
    for (const n of sim.npcs) {
      if (n.hidden) continue;
      const v = n.view();
      if (v.state === 'chase' && v.target === av.slot && Math.hypot(v.pos.x - av.pos.x, v.pos.z - av.pos.z) < 14) return { id: n.id, x: v.pos.x, z: v.pos.z };
    }
    return null;
  }

  private finish(sim: Simulation, kind: TaskKind): void {
    this.lastKind = kind;
    this.lastDone.set(kind, sim.time);
    this.task = null;
    this.idleUntil = sim.time + this.tune.think;
  }

  private fail(sim: Simulation, t: Task): void {
    this.failed.set(t.key, sim.time);
    this.finish(sim, t.kind);
  }

  private makeTask(kind: TaskKind, key: string, steps: Step[]): Task {
    return { kind, key, steps, i: 0, startedAt: 0, stepAt: 0, count: 0, path: [], pathI: 0, pathTo: null, frozenTo: null, routeI: 0, metersAtStart: 0 };
  }

  // ───────── えらぶ ─────────

  private choose(sim: Simulation, av: AvatarState): Task | null {
    const speed = 5 * this.tune.speed;
    const eta = (p: P2): number => (Math.hypot(p.x - av.pos.x, p.z - av.pos.z) * 1.35) / speed;
    const achieved = (id: string): boolean => av.book.achieved.includes(id as never);
    const bonus = (id: string, share = 1): number => (achieved(id) ? 0 : 300 * share);
    const recentlyFailed = (key: string): boolean => sim.time - (this.failed.get(key) ?? -Infinity) < 8;
    const places = sim.layout.places;
    const cands: Candidate[] = [];
    const add = (c: Candidate): void => {
      if (!recentlyFailed(c.key)) cands.push(c);
    };

    // ベル
    const left = bellRingsLeft(sim, av.slot);
    if (left > 0) {
      const goal = { x: places.bell.x, z: places.bell.z - 0.2 };
      const rings = Math.min(left, this.tune.bellRings);
      const prog = av.progress.bell ?? 0;
      add({ kind: 'bell', key: 'bell', goal, value: rings * BELL.points + bonus('bell', Math.min(1, (prog + rings) / BELL.goal)), time: eta(goal) + rings * this.tune.mashInterval, steps: () => [{ k: 'go', to: goal, arrive: 0.6 }, { k: 'press', system: 'bell', times: rings, interval: this.tune.mashInterval, limit: 7 }] });
    }
    // カート（缶ピラミッドへ突っ込んで終わる）
    const cart = nearestFreeCart(sim, av.pos.x, av.pos.z, 60);
    if (cart) {
      const getCart = (): P2 | null => {
        const c = sim.carts[cart.id];
        if (!c || c.rider !== null) return null;
        const t = c.body.translation();
        return { x: t.x, z: t.z };
      };
      const ct = cart.body.translation();
      add({ kind: 'cart', key: `cart:${cart.id}`, goal: { x: ct.x, z: ct.z }, value: 160 + bonus('cart') + (av.book.secrets.includes('secret-cart-strike') || !pyramidStanding(sim) ? 0 : 250), time: eta({ x: ct.x, z: ct.z }) + 9, steps: () => [{ k: 'go', to: getCart, arrive: CART.rideRange - 0.35 }, { k: 'press', system: 'cart', times: 1, interval: 0.3, limit: 2 }, { k: 'drive', route: [], meters: CART.goalMeters + 4 }, { k: 'press', system: 'cart', times: 1, interval: 0.3, limit: 1 }] });
    }
    // 缶ピラミッド
    if (sim.elapsed >= CPU_PLAN.openingPyramidGrace && pyramidStanding(sim)) {
      const goal = { x: places.pyramid.x, z: places.pyramid.z - 0.25 };
      add({ kind: 'pyramid', key: 'pyramid', goal, value: 24 * 15 + 500 + bonus('pyramid'), time: eta(goal) + 3, steps: () => [{ k: 'go', to: goal, arrive: 0.6 }, { k: 'press', system: 'pyramid', times: this.tune.pyramidKicks, interval: 0.6, limit: 4 }] });
    }
    // なぎ払い：商品の残っている面のうち、近くて多いもの
    let bestFace: { face: ShelfFace; goal: P2; n: number; score: number } | null = null;
    for (const face of sim.layout.faces) {
      if (recentlyFailed(`sweep:${face.id}`)) continue;
      const goal = standPoint(face);
      if (!sim.nav.isFree(goal.x, goal.z)) continue;
      const n = sweepTargets(sim, face, goal.x, goal.z).length;
      if (n < 2) continue;
      const score = n / (eta(goal) + 1.5);
      if (!bestFace || score > bestFace.score) bestFace = { face, goal, n, score };
    }
    if (bestFace) {
      const bf = bestFace;
      const prog = av.progress.sweep ?? 0;
      const n = bf.n * 2;
      add({ kind: 'sweep', key: `sweep:${bf.face.id}`, goal: bf.goal, value: n * 10 + bonus('sweep', Math.min(1, n / Math.max(1, 20 - prog))), time: eta(bf.goal) + 2, steps: () => [{ k: 'go', to: bf.goal, arrive: 0.45 }, { k: 'sweepRun', face: bf.face, units: this.tune.sweeps }] });
    }
    // 試食
    const samples = samplesLeft(sim);
    if (samples > 0) {
      const goal = { x: places.samples.x, z: places.samples.z };
      const bites = Math.min(samples, this.tune.bites);
      add({ kind: 'samples', key: 'samples', goal, value: bites * SAMPLES.points + (bites >= samples ? SAMPLES.allBonus : 0) + bonus('samples', Math.min(1, ((av.progress.samples ?? 0) + bites) / SAMPLES.count)), time: eta(goal) + bites * Math.max(this.tune.mashInterval, SAMPLES.biteInterval), steps: () => [{ k: 'go', to: goal, arrive: 0.7 }, { k: 'press', system: 'samples', times: bites, interval: Math.max(this.tune.mashInterval, SAMPLES.biteInterval + 0.02), limit: 6 }] });
    }
    // 放送
    if (paReady(sim)) {
      const goal = { x: places.pa.x, z: places.pa.z };
      add({ kind: 'pa', key: 'pa', goal, value: PA.points + bonus('pa'), time: eta(goal) + PA.holdTime, steps: () => this.paSteps(sim) });
    }
    // 冷凍ケース
    const fz = sim.layout.fixtures.filter((f) => f.kind === 'freezer');
    const fr = fz.reduce((a, f) => (Math.hypot(f.pos.x - av.pos.x, f.pos.z - av.pos.z) < Math.hypot(a.pos.x - av.pos.x, a.pos.z - av.pos.z) ? f : a), fz[0]!);
    if (fr) {
      const goal = { x: fr.pos.x, z: fr.pos.z + fr.size.z / 2 + 0.65 };
      add({ kind: 'freezer', key: 'freezer', goal, value: FREEZER.pointsPerSecond * FREEZER.maxSeconds + bonus('freezer'), time: eta(goal) + FREEZER.maxSeconds + 1.5, steps: () => [{ k: 'go', to: goal, arrive: 0.5 }, { k: 'press', system: 'freezer', times: 1, interval: 0.3, limit: 1.5 }, { k: 'wait', secs: FREEZER.maxSeconds + 0.6 }, { k: 'press', system: 'freezer', times: 1, interval: 0.3, limit: 1.5 }, { k: 'wait', secs: 0.6 }] });
    }
    // バナナ（本気は相手の通り道に置く）
    const mine = activePeels(sim).filter((p) => p.owner === av.slot).length;
    const arriveBanana = 0.55;
    const bananaGoals = sim.props
      .filter((p) => p.def.kind === 'banana' && !p.hidden && p.heldBy === null)
      .map((p) => {
        const center = sim.propCenter(p);
        const goal = sim.nav.nearestFree(center.x, center.z);
        return goal && Math.hypot(goal.x - center.x, goal.z - center.z) + arriveBanana < PICKUP_RANGE ? goal : null;
      })
      .filter((p): p is P2 => p !== null)
      .sort((a, b) => eta(a) - eta(b));
    const bananaGoal = bananaGoals[0];
    if (mine < BANANA.maxPeels && bananaGoal) {
      const goal = bananaGoal;
      const drop = (): P2 | null => this.peelSpot(sim, av);
      add({
        kind: 'banana',
        key: 'banana',
        goal,
        value: (this.tune.tricks ? 380 : 140) + bonus('banana', 0.4),
        time: eta(goal) + 8,
        steps: () => [
          { k: 'go', to: goal, arrive: arriveBanana },
          { k: 'press', system: 'banana', times: 1, interval: 0.3, limit: 1.5 },
          { k: 'go', to: drop, arrive: 0.6 },
          { k: 'press', system: 'banana', times: 1, interval: 0.3, limit: 1.5 },
        ],
      });
    }
    // 駄々
    {
      const goal = { x: places.tantrum.x, z: places.tantrum.z };
      add({ kind: 'tantrum', key: 'tantrum', goal, value: TANTRUM.pointsPerSecond * TANTRUM.maxSeconds + bonus('tantrum'), time: eta(goal) + TANTRUM.maxSeconds + 0.6, steps: () => [{ k: 'go', to: goal, arrive: 0.6 }, { k: 'wait', secs: 0.3 }, { k: 'hold', secs: TANTRUM.maxSeconds + TANTRUM.holdDelay + 0.3, system: null }] });
    }
    // ボウリング
    if (melonsOnWagon(sim) > 0) {
      const goal = { x: places.wagon.x, z: places.wagon.z };
      const lane = { x: places.lane.x, z: places.lane.z };
      add({ kind: 'bowling', key: 'bowling', goal, value: 7 * 50 + bonus('bowling'), time: eta(goal) + 5, steps: () => [{ k: 'go', to: goal, arrive: 0.8 }, { k: 'press', system: 'bowling', times: 1, interval: 0.3, limit: 1.5 }, { k: 'go', to: lane, arrive: 0.55 }, { k: 'face', dx: 0, dz: -1 }, { k: 'press', system: 'bowling', times: 1, interval: 0.3, limit: 1.5 }, { k: 'wait', secs: 1.2 }] });
    }

    // 強さで決めた悪事だけ。同じ悪事は repeatGap 秒あける（達成前は急ぐので待たない）
    const allowed = cands.filter((c) => this.tune.kinds.includes(c.kind as CpuTask) && (!achieved(c.kind) || sim.time - (this.lastDone.get(c.kind) ?? -Infinity) >= this.tune.repeatGap));
    if (allowed.length === 0) {
      const goal = sim.nav.nearestFree(av.pos.x + this.rng.range(-8, 8), Math.min(6, Math.max(-9, av.pos.z + this.rng.range(-8, 8)))) ?? { x: 0, z: 5 };
      return this.makeTask('wander', 'wander', [{ k: 'go', to: goal, arrive: 0.6 }, { k: 'press', system: null, times: 1, interval: 0, limit: 0.2 }]);
    }
    const scored = allowed.map((c) => {
      let u = c.value / (c.time + 2);
      if (achieved(c.kind)) u *= this.tune.revisit;
      // 同じ悪事を続けるとコンボが上がらないので、別の種類を少し好む
      if (c.kind === this.lastKind) u *= 0.55;
      // 缶ピラミッドは点が大きいぶん、遠くからわざわざは行かない（毎回まっ先に取られないように）
      if (c.kind === 'pyramid' && Math.hypot(c.goal.x - av.pos.x, c.goal.z - av.pos.z) > CPU_PLAN.pyramidNear) u *= CPU_PLAN.pyramidFarScale;
      u *= this.rng.range(0.85, 1.15);
      return { c, u };
    });
    scored.sort((a, b) => b.u - a.u);
    // 試合の最初の行き先は、上位からくじで選ぶ（毎回同じ所へ行かない）
    const first = this.picks === 0;
    this.picks++;
    const best = first ? scored[Math.floor(this.rng.next() * Math.min(CPU_PLAN.firstPick, scored.length))]!.c : scored[0]!.c;
    const steps = best.steps();
    if (av.holding !== null) steps.unshift({ k: 'press', system: null, times: 1, interval: 0, limit: 0.2 });
    return this.makeTask(best.kind, best.key, steps);
  }

  private paSteps(sim: Simulation): Step[] {
    const p = sim.layout.places.pa;
    return [{ k: 'go', to: { x: p.x, z: p.z }, arrive: 0.6 }, { k: 'hold', secs: PA.holdTime + 0.4, system: 'pa' }];
  }

  /** バナナの皮を置く所：本気は相手の少し先、ふつうは人の通るベルの前あたり */
  private peelSpot(sim: Simulation, av: AvatarState): P2 | null {
    if (this.tune.tricks) {
      const opponents = sim.avatars.filter((a) => a.slot !== av.slot && a.connected);
      const opp = opponents.find((a) => a.kind === 'human') ?? opponents[0];
      if (opp) {
        const p = sim.nav.nearestFree(opp.pos.x + opp.vel.x * 1.2 + Math.sin(av.yaw) * BANANA.dropBehind, opp.pos.z + opp.vel.z * 1.2 + Math.cos(av.yaw) * BANANA.dropBehind);
        if (p) return p;
      }
    }
    const b = sim.layout.places.bell;
    return sim.nav.nearestFree(b.x + this.rng.range(-2, 2), b.z - 1.5 + this.rng.range(-1, 1));
  }

  // ───────── やる ─────────

  private run(sim: Simulation, av: AvatarState, t: Task, out: InputState): void {
    if (t.startedAt === 0) {
      t.startedAt = sim.time;
      t.stepAt = sim.time;
    }
    if (sim.time - t.startedAt > 30) {
      this.fail(sim, t);
      return;
    }
    const step = t.steps[t.i];
    if (!step) {
      this.finish(sim, t.kind);
      return;
    }
    const next = (): void => {
      t.i++;
      t.stepAt = sim.time;
      t.count = 0;
      t.path = [];
      t.pathI = 0;
      t.pathTo = null;
      t.frozenTo = null;
      this.resetStuck(sim, av);
    };
    const since = sim.time - t.stepAt;
    switch (step.k) {
      case 'go': {
        let to: P2 | null;
        if (t.kind === 'cart') {
          to = typeof step.to === 'function' ? step.to() : step.to;
        } else {
          if (!t.frozenTo) {
            const target = typeof step.to === 'function' ? step.to() : step.to;
            if (target) t.frozenTo = { ...target };
          }
          to = t.frozenTo;
        }
        if (!to) {
          this.fail(sim, t);
          return;
        }
        if (this.follow(sim, av, t, to, step.arrive, out)) next();
        else this.checkStuck(sim, av, t);
        return;
      }
      case 'press': {
        // 案内がその悪事でないなら（離れた・まだ近づいていない）、目標へ少し寄る
        const ok = step.system === null || av.offer?.system.id === step.system;
        if (t.count >= step.times || since > step.limit + step.times * step.interval) {
          if (t.count === 0 && step.system !== null) this.fail(sim, t);
          else next();
          return;
        }
        if (ok && sim.time - this.lastPress >= step.interval) {
          this.lastPress = sim.time;
          out.action = true;
          out.actionPressed = true;
          t.count++;
        }
        return;
      }
      case 'hold': {
        if (since >= step.secs || (step.system !== null && since > 0.4 && av.offer?.system.id !== step.system)) {
          next();
          return;
        }
        out.action = true;
        if (since < 1 / 30) out.actionPressed = true;
        return;
      }
      case 'wait':
        if (since >= step.secs) next();
        return;
      case 'face': {
        // スイカで狙っている間は、人と同じく←→で向きを合わせる（向きが合うか1.5秒で次へ）
        if (sim.aimingMelon(av)) {
          let d = Math.atan2(step.dx, step.dz) - av.yaw;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          if (Math.abs(d) < 0.03 || since >= 1.5) next();
          else out.moveX = Math.max(-1, Math.min(1, -d * 4));
          return;
        }
        if (since >= 0.15) next();
        else {
          out.moveX = step.dx * 0.15;
          out.moveZ = step.dz * 0.15;
        }
        return;
      }
      case 'drive':
        if (this.driveCart(sim, av, t, step, out)) next();
        return;
      case 'sweepRun':
        if (this.sweepRun(sim, av, t, step, out)) next();
        return;
      case 'flee':
        if (this.flee(sim, av, t, step, out)) this.finish(sim, t.kind);
        return;
    }
  }

  /** 道をたどる。着いたら true */
  private follow(sim: Simulation, av: AvatarState, t: Task, to: P2, arrive: number, out: InputState): boolean {
    if (Math.hypot(to.x - av.pos.x, to.z - av.pos.z) < arrive) return true;
    if (!t.pathTo || Math.hypot(t.pathTo.x - to.x, t.pathTo.z - to.z) > 1) {
      t.path = sim.nav.findPath(av.pos, to) ?? [to];
      t.pathI = 0;
      t.pathTo = to;
    }
    while (t.pathI < t.path.length - 1) {
      const wp = t.path[t.pathI]!;
      if (Math.hypot(wp.x - av.pos.x, wp.z - av.pos.z) < 0.4) t.pathI++;
      else break;
    }
    const wp = t.path[Math.min(t.pathI, t.path.length - 1)] ?? to;
    steer(av.pos, wp, out);
    if (this.tune.dashTravel && av.dashCooldown <= 0) {
      const rest = NavGrid.pathLength(av.pos, t.path.slice(t.pathI));
      if (rest > 7 && this.rng.chance(0.05)) out.dash = true;
    }
    return false;
  }

  private resetStuck(sim: Simulation, av: AvatarState): void {
    this.stuckCheckAt = sim.time + 1;
    this.stuckFrom = { x: av.pos.x, z: av.pos.z };
    this.stuckCount = 0;
  }

  /** 1秒ごとに進み具合を見る。進まなければ道を引き直し、それでもだめなら諦める */
  private checkStuck(sim: Simulation, av: AvatarState, t: Task): void {
    if (sim.time < this.stuckCheckAt) return;
    const moved = Math.hypot(av.pos.x - this.stuckFrom.x, av.pos.z - this.stuckFrom.z);
    this.stuckCheckAt = sim.time + 1;
    this.stuckFrom = { x: av.pos.x, z: av.pos.z };
    if (moved > 0.3) {
      this.stuckCount = 0;
      return;
    }
    this.stuckCount++;
    if (this.stuckCount >= 4) {
      this.fail(sim, t);
      return;
    }
    t.pathTo = null;
  }

  private sweepRun(sim: Simulation, av: AvatarState, t: Task, step: Extract<Step, { k: 'sweepRun' }>, out: InputState): boolean {
    const face = step.face;
    const since = sim.time - t.stepAt;
    // 棚の方を向いてから振る
    if (since < 0.12) {
      out.moveX = -face.nx * 0.15;
      out.moveZ = -face.nz * 0.15;
      return false;
    }
    if (av.offer?.system.id === 'sweep' && sim.time - this.lastPress >= 0.65) {
      this.lastPress = sim.time;
      out.action = true;
      out.actionPressed = true;
      t.count++;
      return false;
    }
    if (sim.time - this.lastPress < 0.65) return false;
    // ここの商品がなくなったら、同じ面の隣の台へ
    if (t.count >= step.units) return true;
    const tx = -face.nz;
    const tz = face.nx;
    for (const d of [1.9, -1.9]) {
      const p = { x: av.pos.x + tx * d, z: av.pos.z + tz * d };
      if (sim.nav.isFree(p.x, p.z) && sweepTargets(sim, face, p.x, p.z).length >= 2) {
        t.steps.splice(t.i, 0, { k: 'go', to: p, arrive: 0.45 });
        t.stepAt = sim.time;
        return false;
      }
    }
    return true;
  }

  private driveCart(sim: Simulation, av: AvatarState, t: Task, step: Extract<Step, { k: 'drive' }>, out: InputState): boolean {
    if (av.ridingCart === null) return true;
    const cart = sim.carts[av.ridingCart]!;
    const ct = cart.body.translation();
    if (step.route.length === 0) {
      step.route.push(...routeFrom(av.pos));
      t.routeI = 0;
      t.metersAtStart = av.progress.cart ?? 0;
    }
    const meters = (av.progress.cart ?? 0) - t.metersAtStart;
    const since = sim.time - t.stepAt;
    if (t.routeI >= step.route.length || since > 16 || meters > this.tune.cartMeters || (meters > step.meters && t.routeI >= step.route.length - 2)) return true;
    const wp = step.route[t.routeI]!;
    if (Math.hypot(wp.x - ct.x, wp.z - ct.z) < 1.6) t.routeI++;
    steer({ x: ct.x, z: ct.z }, wp, out);
    // 止まってしまったら次の点へ（壁に向かって押し続けない）
    if (sim.time >= this.stuckCheckAt) {
      this.stuckCheckAt = sim.time + 1;
      this.stuckCount = cart.speed < 0.5 ? this.stuckCount + 1 : 0;
      if (this.stuckCount > 1) t.routeI++;
    }
    return false;
  }

  /** 店員から遠い所へ逃げる（ダッシュを使う）。追われなくなったら true */
  private flee(sim: Simulation, av: AvatarState, t: Task, step: Extract<Step, { k: 'flee' }>, out: InputState): boolean {
    const chaser = this.chaser(sim, av);
    if (!chaser || sim.time - t.stepAt > step.secs) return true;
    if (!t.pathTo || t.pathI >= t.path.length - 1) {
      // 店員と反対側の、見えにくい所を選ぶ
      let best: P2 | null = null;
      let bestS = -Infinity;
      for (const p of sim.layout.wanderPoints) {
        const away = Math.hypot(p.x - chaser.x, p.z - chaser.z) - Math.hypot(p.x - av.pos.x, p.z - av.pos.z) * 0.6;
        const hidden = sim.nav.lineOfSight({ x: chaser.x, z: chaser.z }, p) ? 0 : 4;
        if (away + hidden > bestS) {
          bestS = away + hidden;
          best = p;
        }
      }
      if (best) {
        t.path = sim.nav.findPath(av.pos, best) ?? [best];
        t.pathI = 0;
        t.pathTo = best;
      }
    }
    while (t.pathI < t.path.length - 1 && Math.hypot(t.path[t.pathI]!.x - av.pos.x, t.path[t.pathI]!.z - av.pos.z) < 0.5) t.pathI++;
    const wp = t.path[t.pathI];
    if (wp) steer(av.pos, wp, out);
    if (av.dashCooldown <= 0) out.dash = true;
    return false;
  }
}

/** 面の前の立ち位置 */
export function standPoint(face: ShelfFace): P2 {
  return { x: face.x + face.nx * 0.95, z: face.z + face.nz * 0.95 };
}

function steer(from: { x: number; z: number }, to: P2, out: InputState): void {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return;
  out.moveX = dx / len;
  out.moveZ = dz / len;
}

/** 今いる所から、カートで走る道の続き（最初の3点のうち、いちばん近い点から） */
function routeFrom(p: { x: number; z: number }): P2[] {
  let best = 0;
  let bestD = Infinity;
  CART_ROUTE.forEach((q, i) => {
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bestD && i < 3) {
      bestD = d;
      best = i;
    }
  });
  return CART_ROUTE.slice(best);
}

