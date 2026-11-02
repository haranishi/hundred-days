// OWNER: core
// 番兵の振る舞い：見回り（loop/pingpong・待ち・見る向き）、立ち番の見回し、居眠り、調べる、追う、捜索、戻る、倒れた仲間、
// 討ち取りの瞬間に信長へ駆け寄る（rush。演出の間だけ）。
// 持ち場へ戻る・追う・調べるときは 0.5m 格子の A* で壁を回り込む（Sim.setGoal）。見回りの道順は直線でたどる。
// 番兵が目指すのは「最後に見た位置」か「音の位置」だけ（人が遊べる約束 2）。プレイヤーの今の位置は、見えている間しか使わない。
import type { Awareness, MarkSnap } from '../contract/snapshot';
import type { GuardDef } from '../stage/types';
import { ASSASSINATE, BODY, FINALE, GUARD, INVESTIGATE, NOISE, PHASE, SIGHT, SUSPICION } from '../config/rules';
import { DEG, angleTo, approachAngle, dist, wrapAngle } from './math';
import { SightField, fillTime, halfAngleRad, minGapFor, phaseSightMul, stanceSightMul } from './perception';
import type { Sim } from './sim';
import type { GuardState, NoiseKind } from './types';

export function initGuard(def: GuardDef): GuardState {
  const base = def.dozing ? 'doze' : def.seated || def.role === 'target' ? 'seated' : def.route && def.route.length > 0 ? 'patrol' : 'post';
  const atFirst = def.route && def.route.length > 0 && dist(def.start.x, def.start.z, def.route[0].pos.x, def.route[0].pos.z) < 0.3;
  const yaw = def.facingDeg * DEG;
  return {
    def,
    id: def.id,
    name: def.name,
    role: def.role,
    x: def.start.x,
    z: def.start.z,
    prevX: def.start.x,
    prevZ: def.start.z,
    yaw,
    prevYaw: yaw,
    headYaw: 0,
    prevHeadYaw: 0,
    speed: 0,
    base,
    mode: 'base',
    dozing: def.dozing === true,
    awakeSince: 0,
    sightMul: def.sightMul ?? 1,
    fillMul: def.fillMul ?? 1,
    lantern: def.lantern === true,
    walkSpeed: def.speed ?? GUARD.defaultSpeed,
    lookIdx: 0,
    lookHeld: 0,
    wpIdx: 0,
    wpDir: 1,
    waitLeft: atFirst ? def.route![0].wait : 0,
    path: null,
    pathIdx: 0,
    pathPending: false,
    repathAt: 0,
    goal: null,
    lookLeft: -1,
    lookClock: 0,
    searchPts: [],
    searchIdx: 0,
    bodyTarget: null,
    s: 0,
    lastSeenT: -Infinity,
    qSince: -1,
    mark: null,
    origin: null,
    sees: false,
    chaseVersion: -1,
    down: false,
    meleeHits: 0,
    attackCharge: 0,
    bodyFound: false,
    bodyClaimedBy: null,
    action: null,
    cone: new Float32Array(2 * (SIGHT.coneRays + 1)),
    coneCount: 0,
    bands: new Float32Array(8 * SIGHT.coneBands),
    bandCount: 0,
  };
}

export function guardAwareness(sim: Sim, g: GuardState): Awareness {
  if (g.down || g.mode === 'victim') return 'calm';
  if (g.mode === 'chase' || g.mode === 'strike' || g.mode === 'rush') return 'alert';
  if (g.role === 'target' && sim.phase === 'alert' && g.s >= 1) return 'alert';
  if (g.s > 0 || g.mode === 'investigate' || g.mode === 'search' || g.mode === 'body' || g.mode === 'lookAt') return 'suspicious';
  return 'calm';
}

export function wake(sim: Sim, g: GuardState): void {
  if (!g.dozing) return;
  g.dozing = false;
  g.awakeSince = sim.t;
}

function busy(g: GuardState): boolean {
  return g.down || g.mode === 'victim' || g.mode === 'strike' || g.mode === 'stagger';
}

// ---------------------------------------------------------------------- 知覚（視界）

/** 見えるかの判定に使う視界の場（使い回す）。 */
const SEE_FIELD = new SightField();

/** プレイヤーが見えるか（角・明るさで決まる D・壁）。D は扇と同じ SightField.dAt で測る。 */
export function canSee(sim: Sim, g: GuardState): { sees: boolean; d: number; sightD: number } {
  const p = sim.player;
  const dx = p.x - g.x;
  const dz = p.z - g.z;
  const d = Math.hypot(dx, dz);
  if (angleTo(g.yaw + g.headYaw, dx, dz) > halfAngleRad(sim.phase)) return { sees: false, d, sightD: 0 };
  // 扇（sim.ts の rebuildCones）と同じ視界の場で D を測る。明るさ・植え込みの足し方も扇と同じ
  const sightD = SEE_FIELD.prepare(sim.q, g.x, g.z, stanceSightMul(p.moveStance), g.sightMul, phaseSightMul(sim.phase), p.crouch, sim.movingLights, false).dAt(p.x, p.z);
  if (d > sightD) return { sees: false, d, sightD };
  if (sim.q.blocked(g.x, g.z, p.x, p.z)) return { sees: false, d, sightD };
  return { sees: true, d, sightD };
}

export function perceive(sim: Sim, g: GuardState, dt: number): void {
  g.sees = false;
  if (busy(g) || sim.opts.oblivious || sim.hidePlayer) {
    if (!busy(g)) decay(sim, g, dt);
    return;
  }
  const p = sim.player;
  const look = canSee(sim, g);
  if (!look.sees) {
    decay(sim, g, dt);
    return;
  }
  g.sees = true;
  g.lastSeenT = sim.t;

  // 当て身の最中を見られた：その場で発見。ただし約束 1 を守り、「？」を出してから最短の秒数（0.4／0.7 秒）で「！」にする
  // （r01-core: RULES の「その場で発見」と約束 1 が食い違うので、約束を先に守る）
  if (p.action && p.action.kind === 'takedown' && p.action.targetId !== g.id && sim.phase !== 'alert') {
    g.origin = 'takedown';
    if (sim.t - questionSince(sim, g) + 1e-9 >= minGapFor(look.d)) {
      sim.discover(g, 'takedown');
      return;
    }
    g.s = Math.max(g.s, 0.999);
    investigate(sim, g, p.x, p.z, 'sight');
    return;
  }

  // 発見中：見た番兵はすぐに「！」（約束 1 は発見中を除く）
  if (sim.phase === 'alert') {
    g.s = 1;
    sim.sighting();
    if (g.role === 'guard' && g.mode !== 'chase') startChase(sim, g);
    return;
  }

  let mul = g.fillMul;
  if (p.still) mul *= SUSPICION.mulStill;
  if (p.moveStance === 'crouch') mul *= SUSPICION.mulCrouch;
  else if (p.moveStance === 'run') mul *= SUSPICION.mulRun;
  if (sim.phase === 'caution') mul *= SUSPICION.mulCaution;
  else if (sim.phase === 'evasion') mul *= SUSPICION.mulEvasion;
  if (g.dozing) mul *= SUSPICION.mulDoze;

  if (!g.origin) g.origin = 'sight';
  g.s += dt / fillTime(look.d, look.sightD, mul);
  if (g.s >= 1) {
    // 「？」が出てから約束の秒数がたつまでは「！」にしない（音で 0.4 まで上がった直後に見られた場合など）
    if (sim.t - questionSince(sim, g) + 1e-9 >= minGapFor(look.d)) {
      sim.discover(g, g.origin ?? 'sight');
      return;
    }
    g.s = 0.999;
  }
  if (g.s > SUSPICION.investigateAt) investigate(sim, g, p.x, p.z, 'sight');
}

function decay(sim: Sim, g: GuardState, dt: number): void {
  if (sim.t - g.lastSeenT > SUSPICION.decayDelay && g.s > 0 && g.mode !== 'chase') {
    g.s = Math.max(0, g.s - SUSPICION.decayPerSec * dt);
  }
}

/**
 * 「？」が出た時刻。印は刻みの終わりに Sim.refreshMarks が決めるので、まだ出ていなければ「いま」とみなす
 * （この刻みの終わりに出る）。約束 1 の秒数は、ここから数える。
 */
function questionSince(sim: Sim, g: GuardState): number {
  return g.qSince >= 0 ? g.qSince : sim.t;
}

/** 頭の上の印。？＝不審（s が溜まっている・調べている・捜している）、！＝発見、zzz＝居眠り、!?＝倒れた仲間に気づいた。 */
export function markOf(sim: Sim, g: GuardState): MarkSnap['kind'] | null {
  if (g.down || g.mode === 'victim' || g.mode === 'strike') return null;
  if (g.dozing && g.mode === 'base') return 'zzz';
  if (guardAwareness(sim, g) === 'alert') return '!';
  if (g.mode === 'body') return '!?';
  if (g.s > 0 || g.mode === 'investigate' || g.mode === 'search' || g.mode === 'lookAt') return '?';
  return null;
}

// ---------------------------------------------------------------------- 物音

export function hear(sim: Sim, g: GuardState, x: number, z: number, radius: number, kind: NoiseKind): void {
  if (busy(g) || sim.opts.oblivious || sim.hidePlayer) return;
  // 発見中は無視
  if (sim.phase === 'alert' || g.mode === 'chase') return;
  const d = dist(g.x, g.z, x, z);
  if (d > radius) return;
  const r = sim.q.blocked(g.x, g.z, x, z) ? radius * NOISE.throughWall : radius;
  if (d > r) return;
  sim.emit({ type: 'heard', t: sim.t, guardId: g.id, kind, x, z });
  wake(sim, g);
  // 小石はプレイヤーへの不審を溜めない（音の位置を調べに行くだけ）
  if (kind !== 'stone') g.s = Math.max(g.s, NOISE.heardSuspicion);
  if (!g.origin) g.origin = kind === 'stone' ? 'stone' : 'noise';
  if (g.mode === 'body') return;
  investigate(sim, g, x, z, 'noise');
}

// ---------------------------------------------------------------------- 振る舞いの切り替え

/** 調べる：その位置へ 1.5 m/s で歩き、見回してから持ち場へ戻る。座っている者（信長）は向きを変えるだけ。 */
export function investigate(sim: Sim, g: GuardState, x: number, z: number, why: 'sight' | 'noise'): void {
  if (g.base === 'seated') {
    g.mode = 'lookAt';
    g.goal = { x, z };
    g.lookLeft = INVESTIGATE.lookTime;
    sim.onGoal?.(g, x, z, why);
    return;
  }
  wake(sim, g);
  if (g.mode === 'body') releaseBody(sim, g);
  if (g.mode === 'investigate' && g.goal) {
    if (dist(g.goal.x, g.goal.z, x, z) < 0.3) return;
    // 道を待っている間は、目標だけ差し替える
    if (g.pathPending) {
      g.goal = { x, z };
      g.lookLeft = -1;
      sim.onGoal?.(g, x, z, why);
      return;
    }
    // 道を引き直すのは間隔を空けて。それまでは道の終わりだけ差し替える
    if (sim.t < g.repathAt && g.path && g.pathIdx < g.path.length) {
      g.goal = { x, z };
      g.path[g.path.length - 1] = { x, z };
      g.lookLeft = -1;
      sim.onGoal?.(g, x, z, why);
      return;
    }
  }
  g.mode = 'investigate';
  g.lookLeft = -1;
  sim.setGoal(g, x, z, why);
}

function releaseBody(sim: Sim, g: GuardState): void {
  if (!g.bodyTarget) return;
  const b = sim.byId.get(g.bodyTarget);
  if (b && b.bodyClaimedBy === g.id && !b.bodyFound) b.bodyClaimedBy = null;
  g.bodyTarget = null;
}

/** 追う：最後に見た位置へ PHASE.chaseSpeed（3.6 m/s）で走る。 */
export function startChase(sim: Sim, g: GuardState): void {
  if (busy(g) || g.role !== 'guard') return;
  wake(sim, g);
  if (g.mode === 'body') releaseBody(sim, g);
  g.mode = 'chase';
  g.s = 1;
  g.lookLeft = -1;
  g.chaseVersion = sim.lastSeenVersion;
  const ls = sim.lastSeen;
  if (ls) sim.setGoal(g, ls.x, ls.z, 'alert');
}

/** 捜索：最後に見た位置の周り 8m の点を、種から作った順に見て回る。 */
export function startSearch(sim: Sim, g: GuardState): void {
  const c = sim.lastSeen ?? { x: g.x, z: g.z };
  const pts: { x: number; z: number }[] = [];
  for (let tries = 0; pts.length < PHASE.searchPoints && tries < 40; tries++) {
    const a = sim.rngSearch.range(0, Math.PI * 2);
    const r = PHASE.searchRadius * Math.sqrt(sim.rngSearch.next());
    const x = c.x + Math.cos(a) * r;
    const z = c.z + Math.sin(a) * r;
    if (sim.nav.isFreeAt(x, z)) pts.push({ x, z });
  }
  if (pts.length === 0) pts.push({ x: c.x, z: c.z });
  g.mode = 'search';
  g.searchPts = pts;
  g.searchIdx = 0;
  g.lookLeft = -1;
  sim.setGoal(g, pts[0].x, pts[0].z, 'search');
}

/** 持ち場（見回りなら今の道順の点）へ戻る。 */
export function startReturn(sim: Sim, g: GuardState): void {
  if (busy(g)) return;
  if (g.mode === 'body') releaseBody(sim, g);
  const route = g.def.route;
  const home = g.base === 'patrol' && route ? route[g.wpIdx].pos : g.def.start;
  g.mode = 'return';
  g.lookLeft = -1;
  g.headYaw = 0;
  sim.setGoal(g, home.x, home.z, 'return');
}

// ---------------------------------------------------------------------- 毎刻みの動き

export function updateGuard(sim: Sim, g: GuardState, dt: number): void {
  const x0 = g.x;
  const z0 = g.z;
  if (g.action && g.action.kind !== 'takedownVictim') g.action.elapsed = Math.min(g.action.duration, g.action.elapsed + dt);
  let sweeping = false;
  switch (g.mode) {
    case 'stagger':
      if (!g.action || g.action.elapsed >= g.action.duration) {
        g.action = null;
        if (g.down) g.mode = 'down';
        else {
          // r07: よろめきの拘束を解いてから遷移する。busyのままではstartChaseが復帰を拒む。
          g.mode = 'base';
          if (sim.phase === 'alert' && g.s >= 1) startChase(sim, g);
          else investigate(sim, g, g.goal?.x ?? g.x, g.goal?.z ?? g.z, 'noise');
        }
      }
      break;
    case 'base':
      updateBase(sim, g, dt);
      break;
    case 'investigate':
      sweeping = updateInvestigate(sim, g, dt);
      break;
    case 'chase':
      sweeping = updateChase(sim, g, dt);
      break;
    case 'search':
      sweeping = updateSearch(sim, g, dt);
      break;
    case 'return':
      updateReturn(sim, g, dt);
      break;
    case 'body':
      sweeping = updateBody(sim, g, dt);
      break;
    case 'lookAt':
      updateLookAt(sim, g, dt);
      break;
    default:
      break;
  }
  if (!sweeping) g.headYaw = approachAngle(g.headYaw, 0, GUARD.turnRate * DEG * dt);
  // r06-physics: 見回り・追跡にも同じ連続衝突を使い、細い塀の反対側へ押し出されないようにする。
  const dx = g.x - x0;
  const dz = g.z - z0;
  g.x = x0;
  g.z = z0;
  sim.q.move(g, dx, dz, GUARD.radius, false);
  g.speed = Math.hypot(g.x - x0, g.z - z0) / dt;
}

function turnTo(g: GuardState, yaw: number, dt: number, mul = 1): boolean {
  g.yaw = approachAngle(g.yaw, yaw, GUARD.turnRate * DEG * mul * dt);
  return Math.abs(wrapAngle(g.yaw - yaw)) < 1e-3;
}

/** 道（g.path）に沿って進む。着いたら true。道を引く順番待ちの間は、目標の方を向いて待つ。 */
function followPath(g: GuardState, speed: number, dt: number): boolean {
  if (g.pathPending) {
    if (g.goal) turnTo(g, Math.atan2(g.goal.z - g.z, g.goal.x - g.x), dt, 1.8);
    return false;
  }
  if (!g.path || g.pathIdx >= g.path.length) return true;
  let remaining = speed * dt;
  let faceYaw: number | null = null;
  while (remaining > 1e-9 && g.pathIdx < g.path.length) {
    const pt = g.path[g.pathIdx];
    const dx = pt.x - g.x;
    const dz = pt.z - g.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-4) faceYaw = Math.atan2(dz, dx);
    if (d <= remaining) {
      g.x = pt.x;
      g.z = pt.z;
      remaining -= d;
      g.pathIdx++;
    } else {
      g.x += (dx / d) * remaining;
      g.z += (dz / d) * remaining;
      remaining = 0;
    }
  }
  if (faceYaw !== null) turnTo(g, faceYaw, dt, 1.8);
  return g.pathIdx >= g.path.length;
}

/** 直線でその点へ歩く（見回りの道順）。着いたら true。 */
function walkStraight(g: GuardState, tx: number, tz: number, speed: number, dt: number): boolean {
  const dx = tx - g.x;
  const dz = tz - g.z;
  const d = Math.hypot(dx, dz);
  const stepLen = speed * dt;
  if (d <= Math.max(stepLen, 1e-4)) {
    g.x = tx;
    g.z = tz;
    return true;
  }
  g.x += (dx / d) * stepLen;
  g.z += (dz / d) * stepLen;
  turnTo(g, Math.atan2(dz, dx), dt, 1.8);
  return false;
}

function lookAround(g: GuardState, dt: number, mul: number): void {
  const la = g.def.lookAround;
  if (!la || la.length === 0) {
    turnTo(g, g.def.facingDeg * DEG, dt, mul);
    return;
  }
  const cur = la[g.lookIdx % la.length];
  if (turnTo(g, cur.yawDeg * DEG, dt, mul)) {
    g.lookHeld += dt;
    if (g.lookHeld >= cur.hold) {
      g.lookIdx = (g.lookIdx + 1) % la.length;
      g.lookHeld = 0;
    }
  }
}

function sweep(g: GuardState, dt: number): void {
  g.lookClock += dt;
  g.headYaw = INVESTIGATE.sweepDeg * DEG * Math.sin((2 * Math.PI * g.lookClock) / INVESTIGATE.sweepPeriod);
}

function speedMul(sim: Sim): number {
  return sim.phase === 'caution' ? PHASE.cautionSpeedMul : 1;
}

function atHome(g: GuardState): boolean {
  return dist(g.x, g.z, g.def.start.x, g.def.start.z) <= 0.3;
}

function updateBase(sim: Sim, g: GuardState, dt: number): void {
  switch (g.base) {
    case 'seated':
      lookAround(g, dt, 1);
      return;
    case 'post':
      if (!atHome(g)) {
        startReturn(sim, g);
        return;
      }
      lookAround(g, dt, 1);
      return;
    case 'doze':
      // 居眠り中は向きを変えない（見回しをしない）。RULES の r02 の変更：眠りながら約 100° 揺れ、背後の当て身の範囲ごと動いていた
      if (g.dozing) return;
      if (!atHome(g)) {
        startReturn(sim, g);
        return;
      }
      if (sim.phase === 'normal' && g.s <= 0 && sim.t - g.awakeSince >= GUARD.redozeAfter) {
        // また眠る前に持ち場の向きへ戻る（いつも同じ向きで眠るので、背後の位置が変わらない）
        if (turnTo(g, g.def.facingDeg * DEG, dt)) g.dozing = true;
        return;
      }
      lookAround(g, dt, 1);
      return;
    case 'patrol':
      patrol(sim, g, dt);
      return;
  }
}

function advanceWaypoint(g: GuardState): void {
  const route = g.def.route!;
  const n = route.length;
  if (n <= 1) return;
  if (g.def.routeMode === 'pingpong') {
    let next = g.wpIdx + g.wpDir;
    if (next < 0 || next >= n) {
      g.wpDir = g.wpDir === 1 ? -1 : 1;
      next = g.wpIdx + g.wpDir;
    }
    g.wpIdx = next;
  } else {
    g.wpIdx = (g.wpIdx + 1) % n;
  }
}

function patrol(sim: Sim, g: GuardState, dt: number): void {
  const route = g.def.route!;
  const wp = route[g.wpIdx];
  if (g.waitLeft > 0) {
    const looks = wp.looks;
    if (looks && looks.length > 0) {
      const per = wp.wait / looks.length;
      const k = Math.min(looks.length - 1, Math.floor((wp.wait - g.waitLeft) / per));
      turnTo(g, looks[k] * DEG, dt);
    }
    g.waitLeft -= dt;
    if (g.waitLeft <= 0) {
      g.waitLeft = 0;
      advanceWaypoint(g);
    }
    return;
  }
  if (walkStraight(g, wp.pos.x, wp.pos.z, g.walkSpeed * speedMul(sim), dt)) {
    if (wp.wait > 0) g.waitLeft = wp.wait;
    else advanceWaypoint(g);
  }
}

/** 着いてから見回す。見回し中なら true（頭を振っている）。 */
function arriveAndLook(g: GuardState, speed: number, dt: number, lookTime: number): 'walking' | 'looking' | 'done' {
  if (g.lookLeft < 0) {
    if (followPath(g, speed, dt)) {
      g.lookLeft = lookTime;
      g.lookClock = 0;
    }
    return 'walking';
  }
  sweep(g, dt);
  g.lookLeft -= dt;
  return g.lookLeft <= 0 ? 'done' : 'looking';
}

function updateInvestigate(sim: Sim, g: GuardState, dt: number): boolean {
  const st = arriveAndLook(g, INVESTIGATE.speed, dt, INVESTIGATE.lookTime);
  if (st === 'done') startReturn(sim, g);
  return st === 'looking';
}

function updateChase(sim: Sim, g: GuardState, dt: number): boolean {
  const p = sim.player;
  if (g.sees && sim.nav.lineFree(g.x, g.z, p.x, p.z)) {
    // 見えていて間に何も無い：まっすぐ追う（見えている間だけ今の位置を使う）
    g.path = [{ x: p.x, z: p.z }];
    g.pathIdx = 0;
    g.pathPending = false;
    g.goal = { x: p.x, z: p.z };
    g.chaseVersion = sim.lastSeenVersion;
    g.lookLeft = -1;
  } else if (sim.lastSeen && g.chaseVersion !== sim.lastSeenVersion && sim.t >= g.repathAt) {
    g.chaseVersion = sim.lastSeenVersion;
    g.lookLeft = -1;
    sim.setGoal(g, sim.lastSeen.x, sim.lastSeen.z, 'alert');
  }
  if (g.lookLeft < 0) {
    if (followPath(g, PHASE.chaseSpeed, dt)) {
      g.lookLeft = 1;
      g.lookClock = 0;
    }
    return false;
  }
  // 最後に見た位置に着いた：新しい手がかりが来るまで見回す
  sweep(g, dt);
  return true;
}

function updateSearch(sim: Sim, g: GuardState, dt: number): boolean {
  const st = arriveAndLook(g, PHASE.searchSpeed, dt, PHASE.searchLook);
  if (st === 'done') {
    g.searchIdx = (g.searchIdx + 1) % g.searchPts.length;
    const pt = g.searchPts[g.searchIdx];
    g.lookLeft = -1;
    sim.setGoal(g, pt.x, pt.z, 'search');
  }
  return st === 'looking';
}

function updateReturn(sim: Sim, g: GuardState, dt: number): void {
  const sp = (g.base === 'patrol' ? g.walkSpeed : GUARD.returnSpeed) * speedMul(sim);
  if (!followPath(g, sp, dt)) return;
  g.mode = 'base';
  g.goal = null;
  g.path = null;
  g.lookIdx = 0;
  g.lookHeld = 0;
  g.awakeSince = sim.t;
  if (g.base === 'patrol') {
    const wp = g.def.route![g.wpIdx];
    if (wp.wait > 0) g.waitLeft = wp.wait;
    else advanceWaypoint(g);
  }
}

function updateBody(sim: Sim, g: GuardState, dt: number): boolean {
  const b = g.bodyTarget ? sim.byId.get(g.bodyTarget) : undefined;
  if (!b) {
    startReturn(sim, g);
    return false;
  }
  if (g.lookLeft < 0) {
    const arrived = followPath(g, BODY.walkSpeed, dt);
    if (arrived || dist(g.x, g.z, b.x, b.z) <= BODY.reach) {
      sim.bodyReached(g, b);
      g.path = null;
      g.lookLeft = INVESTIGATE.lookTime;
      g.lookClock = 0;
    }
    return false;
  }
  sweep(g, dt);
  g.lookLeft -= dt;
  if (g.lookLeft <= 0) {
    g.bodyTarget = null;
    startReturn(sim, g);
  }
  return true;
}

// ---------------------------------------------------------------------- 討ち取りの瞬間（演出の間だけ動く）

/**
 * 討ち取りの瞬間：蘭丸が振り向き、信長の自分の側 FINALE.rushStop の所へ走る（間に合わない）。
 * 演出のための動きで、見つかる・捕まるの判定には使わない（討ち取った後の sim は判定を止めている）。
 */
export function startRush(sim: Sim, g: GuardState, nb: GuardState): void {
  const d = Math.hypot(g.x - nb.x, g.z - nb.z);
  const base = d > 1e-6 ? Math.atan2(g.z - nb.z, g.x - nb.x) : nb.yaw;
  // プレイヤーが踏み込み終える位置（信長から ASSASSINATE.reach）。行き先はそこから rushPlayerGap より離す
  const p = sim.player;
  const pd = Math.hypot(p.x - nb.x, p.z - nb.z);
  const pr = pd > 1e-6 && pd <= ASSASSINATE.range + 0.5 ? ASSASSINATE.reach / pd : 1;
  const px = nb.x + (p.x - nb.x) * pr;
  const pz = nb.z + (p.z - nb.z) * pr;
  // 信長から rushStop の円の上で、蘭丸の側に近い順に、プレイヤーから離れていて立てる所を探す
  let goal = { x: nb.x + Math.cos(base) * FINALE.rushStop, z: nb.z + Math.sin(base) * FINALE.rushStop };
  for (let i = 0; i <= 12; i++) {
    const a = base + (i % 2 === 1 ? 1 : -1) * Math.ceil(i / 2) * 15 * DEG;
    const x = nb.x + Math.cos(a) * FINALE.rushStop;
    const z = nb.z + Math.sin(a) * FINALE.rushStop;
    if (Math.hypot(x - px, z - pz) < FINALE.rushPlayerGap + 0.15 || !sim.nav.isFreeAt(x, z)) continue;
    goal = { x, z };
    break;
  }
  if (g.mode === 'body') releaseBody(sim, g);
  g.mode = 'rush';
  g.dozing = false;
  g.goal = goal;
  g.path = d > FINALE.rushStop ? (sim.nav.findPath(g.x, g.z, goal.x, goal.z) ?? [goal]) : [];
  g.pathIdx = 0;
  g.pathPending = false;
  g.lookLeft = -1;
  g.lookClock = 0;
}

/** 駆け寄る：振り向く間は向きだけ、その後は道を走り、着くかプレイヤーに近づきすぎたら止まって信長を向く。 */
export function updateRush(sim: Sim, g: GuardState, nb: GuardState, dt: number): void {
  const x0 = g.x;
  const z0 = g.z;
  g.lookClock += dt;
  g.headYaw = approachAngle(g.headYaw, 0, GUARD.turnRate * DEG * dt);
  const faceNb = Math.atan2(nb.z - g.z, nb.x - g.x);
  if (g.lookClock < FINALE.rushDelay || !g.path || g.pathIdx >= g.path.length) {
    g.yaw = approachAngle(g.yaw, faceNb, FINALE.rushTurnRate * DEG * dt);
  } else {
    followPath(g, FINALE.rushSpeed, dt);
    const dx = g.x - x0;
    const dz = g.z - z0;
    g.x = x0;
    g.z = z0;
    sim.q.move(g, dx, dz, GUARD.radius, false);
    const p = sim.player;
    if (dist(g.x, g.z, p.x, p.z) < FINALE.rushPlayerGap) {
      // プレイヤーに当たる前に止まる（この刻みの動きは取り消す）
      g.x = x0;
      g.z = z0;
      g.path = null;
    }
  }
  g.speed = Math.hypot(g.x - x0, g.z - z0) / dt;
}

function updateLookAt(sim: Sim, g: GuardState, dt: number): void {
  if (g.goal) turnTo(g, Math.atan2(g.goal.z - g.z, g.goal.x - g.x), dt);
  g.lookLeft -= dt;
  if (g.lookLeft <= 0) {
    g.mode = 'base';
    g.goal = null;
    g.lookIdx = 0;
    g.lookHeld = 0;
  }
  void sim;
}
