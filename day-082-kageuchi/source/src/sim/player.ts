// OWNER: core
// プレイヤー：カメラの向き基準の移動、加減速、壁に沿って滑る、しゃがみ（水抜き穴はしゃがみの時だけ通れる）、走り、足音、
// 当て身・討ち取り・小石。
import { ASSASSINATE, GUARD, MELEE, MOVE, NOISE, STONE, SUSPICION, TAKEDOWN } from '../config/rules';
import type { SurfaceKind } from '../stage/types';
import { DEG, angleTo, approachAngle, clamp, dist, lerp } from './math';
import { lightTier } from './query';
import type { Sim } from './sim';
import type { GuardState, PlayerState, SimInput } from './types';

export function initPlayer(sim: Sim): PlayerState {
  const st = sim.stage.player;
  const yaw = st.facingDeg * DEG;
  return {
    x: st.start.x,
    z: st.start.z,
    prevX: st.start.x,
    prevZ: st.start.z,
    yaw,
    prevYaw: yaw,
    vx: 0,
    vz: 0,
    speed: 0,
    crouch: false,
    running: false,
    moveStance: 'walk',
    still: true,
    stones: st.stones,
    stepTimer: 0,
    action: null,
    light: 0,
    tier: 'dark',
    inBush: false,
    surface: sim.stage.surfaceDefault,
    aiming: false,
    aim: null,
    aimCancelled: false,
    prompt: null,
  };
}

export function surfaceNoiseMul(s: SurfaceKind): number {
  switch (s) {
    case 'gravel':
      return NOISE.surfaceGravel;
    case 'stone':
      return NOISE.surfaceStone;
    case 'moss':
      return NOISE.surfaceMoss;
    default:
      return NOISE.surfaceDirt;
  }
}

/** 足元の明るさ・段・植え込み・地面・その場でできること を測り直す。 */
export function refreshPlayerSense(sim: Sim): void {
  const p = sim.player;
  p.light = sim.q.brightnessAt(p.x, p.z, sim.movingLights);
  p.tier = lightTier(p.light);
  p.inBush = sim.q.inBush(p.x, p.z);
  p.surface = sim.q.surfaceAt(p.x, p.z);
  p.moveStance = p.crouch ? 'crouch' : p.running ? 'run' : 'walk';
  p.prompt = findPrompt(sim);
}

/**
 * 当て身：番兵の 1.6m 以内で、番兵の向きからプレイヤーへの角が 120° 以上（真後ろの左右 60°）、番兵が発見中でない。
 * 居眠り中に限り、角 90° 以上（横からでも）でよい（RULES の r02 の変更）。
 */
export function canTakedown(sim: Sim, g: GuardState): boolean {
  const p = sim.player;
  if (g.role !== 'guard' || g.down || g.mode === 'victim' || g.mode === 'strike' || g.mode === 'chase') return false;
  const dx = p.x - g.x;
  const dz = p.z - g.z;
  if (Math.hypot(dx, dz) > TAKEDOWN.range) return false;
  const minAngle = g.dozing ? TAKEDOWN.minAngleDoze : TAKEDOWN.minAngle;
  if (angleTo(g.yaw + g.headYaw, dx, dz) < minAngle * DEG - 1e-9) return false;
  return !sim.q.blocked(g.x, g.z, p.x, p.z);
}

/** 討ち取り：信長の 1.7m 以内で、信長の視界（左右 55°）の外。発見中でもできる。 */
export function canAssassinate(sim: Sim, nb: GuardState): boolean {
  const p = sim.player;
  if (nb.down || nb.mode === 'victim') return false;
  const dx = p.x - nb.x;
  const dz = p.z - nb.z;
  if (Math.hypot(dx, dz) > ASSASSINATE.range) return false;
  if (angleTo(nb.yaw + nb.headYaw, dx, dz) <= ASSASSINATE.halfAngle * DEG) return false;
  return !sim.q.blocked(nb.x, nb.z, p.x, p.z);
}

function findPrompt(sim: Sim): PlayerState['prompt'] {
  if (sim.outcome || sim.hidePlayer) return null;
  const p = sim.player;
  const nb = sim.nobunaga;
  if (nb && canAssassinate(sim, nb)) return { kind: 'assassinate', targetId: nb.id };
  let best: GuardState | null = null;
  let bestD = Infinity;
  for (const g of sim.guards) {
    if (!canTakedown(sim, g)) continue;
    const d = dist(g.x, g.z, p.x, p.z);
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  return best ? { kind: 'takedown', targetId: best.id } : null;
}

/** 小石の着地点として良いか：範囲の中・固い物の中でない・高い屋根（建物）を越えない。塀は越えてよい。 */
export function stoneTargetValid(sim: Sim, fx: number, fz: number, tx: number, tz: number): boolean {
  const bd = sim.stage.bounds;
  if (tx < bd.x0 + 1 || tx > bd.x1 - 1 || tz < bd.z0 + 1 || tz > bd.z1 - 1) return false;
  if (sim.q.overlaps(tx, tz, 0.15, false)) return false;
  for (const b of sim.q.boxes) {
    if (b.kind !== 'building') continue;
    // 長方形の建物：線分が外枠に入るか（建物は軸に沿う）
    if (segHitsRect(fx, fz, tx, tz, b.minX, b.minZ, b.maxX, b.maxZ)) return false;
  }
  return true;
}

function segHitsRect(ax: number, az: number, bx: number, bz: number, x0: number, z0: number, x1: number, z1: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, ax - x0) && clip(dx, x1 - ax) && clip(-dz, az - z0) && clip(dz, z1 - az) && t0 <= t1;
}

const tmp = { x: 0, z: 0 };

export function updatePlayer(sim: Sim, input: SimInput, dt: number): void {
  const p = sim.player;
  const q = sim.q;

  // 動作の進み（当て身は 1.0 秒動けない。投げる動作は動ける）
  if (p.action) {
    p.action.elapsed += dt;
    stepIn(sim);
    if (p.action.kind === 'melee' && !p.action.effectDone && p.action.elapsed >= MELEE.hitAt) strike(sim);
    const victim = p.action.targetId ? sim.byId.get(p.action.targetId) : undefined;
    if (p.action.kind === 'takedown' && victim?.action) victim.action.elapsed = Math.min(victim.action.duration, p.action.elapsed);
    if (p.action.elapsed >= p.action.duration) {
      if (p.action.kind === 'takedown' && victim) completeTakedown(sim, victim);
      p.action = null;
    }
  }
  const locked = p.action !== null && p.action.kind !== 'throw';

  // しゃがみの切り替え。水抜き穴の中では立てない
  if (input.crouchToggle && !locked) {
    if (p.crouch) {
      if (!q.overlapsCrawl(p.x, p.z, MOVE.radius)) p.crouch = false;
    } else {
      p.crouch = true;
    }
  }

  // カメラの向き基準の入力
  let mx = input.moveX;
  let my = input.moveY;
  const ml = Math.hypot(mx, my);
  if (ml > 1) {
    mx /= ml;
    my /= ml;
  }
  const moving = ml > 0.01 && !locked;
  const wantRun = input.run && moving;
  // 走り出すと立つ（水抜き穴の中を除く）
  if (wantRun && p.crouch && !q.overlapsCrawl(p.x, p.z, MOVE.radius)) p.crouch = false;
  const top = p.crouch ? MOVE.crouch : wantRun ? MOVE.run : MOVE.walk;
  const fx = Math.cos(input.camYaw);
  const fz = Math.sin(input.camYaw);
  // 前 (fx, fz)・右 (−fz, fx)。(mx, my) の長さ（最大 1）がそのまま速さの割合になる
  let desX = 0;
  let desZ = 0;
  if (moving) {
    desX = (fx * my - fz * mx) * top;
    desZ = (fz * my + fx * mx) * top;
  }
  const ddx = desX - p.vx;
  const ddz = desZ - p.vz;
  const dd = Math.hypot(ddx, ddz);
  const rate = Math.hypot(desX, desZ) > Math.hypot(p.vx, p.vz) + 1e-6 ? MOVE.accel : MOVE.decel;
  const dv = rate * dt;
  if (dd <= dv) {
    p.vx = desX;
    p.vz = desZ;
  } else {
    p.vx += (ddx / dd) * dv;
    p.vz += (ddz / dd) * dv;
  }

  // r06-physics: 移動の線全体で衝突を求める。人物から押される分も塀を越えない。
  const bodies = sim.guards.filter((g) => !g.down).map((g) => ({ id: g.id, x: g.x, z: g.z, r: GUARD.radius }));
  tmp.x = p.x;
  tmp.z = p.z;
  q.move(tmp, p.vx * dt, p.vz * dt, MOVE.radius, p.crouch, bodies);
  const movedX = tmp.x;
  const movedZ = tmp.z;
  // 壁・人物に遮られた操作移動だけを次の刻みへ持ち越す。
  // 押し戻しを速度に含めると、番兵との接触が逆向きの加速・滑走を生む。
  p.vx = (movedX - p.x) / dt;
  p.vz = (movedZ - p.z) / dt;
  pushFromCharacters(sim, tmp);
  const pushX = tmp.x - movedX;
  const pushZ = tmp.z - movedZ;
  tmp.x = movedX;
  tmp.z = movedZ;
  q.move(tmp, pushX, pushZ, MOVE.radius, p.crouch);
  // 足運び・足音には、押された分も含めた実際の移動量を使う。
  p.speed = Math.hypot(tmp.x - p.x, tmp.z - p.z) / dt;
  p.x = tmp.x;
  p.z = tmp.z;
  if (Math.hypot(p.vx, p.vz) > 0.2 && !locked) p.yaw = approachAngle(p.yaw, Math.atan2(p.vz, p.vx), MOVE.turnRate * DEG * dt);

  p.running = !p.crouch && wantRun && p.speed > SUSPICION.stillSpeed;
  p.still = p.speed < SUSPICION.stillSpeed;
  refreshPlayerSense(sim);

  // 足音
  if (!p.still) {
    const interval = p.crouch ? NOISE.stepCrouch : p.running ? NOISE.stepRun : NOISE.stepWalk;
    p.stepTimer += dt;
    if (p.stepTimer >= interval) {
      p.stepTimer -= interval;
      const base = p.crouch ? NOISE.radiusCrouch : p.running ? NOISE.radiusRun : NOISE.radiusWalk;
      const radius = base * surfaceNoiseMul(p.surface);
      sim.emit({ type: 'footstep', t: sim.t, x: p.x, z: p.z, radius, surface: p.surface, stance: p.moveStance });
      sim.emitNoise(p.x, p.z, radius, 'footstep');
    }
  } else {
    // 止まっていたら、歩き出してすぐ一歩目が出るように半分から数える
    p.stepTimer = NOISE.stepWalk * 0.5;
  }

  // 当て身・討ち取り
  if (input.interact && !locked && p.prompt) {
    if (p.prompt.kind === 'assassinate') {
      sim.assassinate();
      return;
    }
    const g = sim.byId.get(p.prompt.targetId);
    if (g) startTakedown(sim, g);
  }

  if (input.attack && !p.action && !p.aiming && !sim.outcome) {
    p.yaw = input.camYaw;
    const target = meleeTarget(sim);
    p.action = { kind: 'melee', elapsed: 0, duration: MELEE.duration, targetId: target?.id };
    p.vx = p.vz = 0;
    p.aim = null;
    sim.mission.active = null;
    sim.emit({ type: 'melee', t: sim.t, stage: 'start', guardId: target?.id ?? null });
    sim.emitNoise(p.x, p.z, MELEE.noise, 'takedown');
  }

  // 小石：Q を押している間は狙い、離したら投げる。
  // 狙いの最中に右クリックか Esc（cancelAim）で、投げずにやめる。Q を押したままなら、離すまで狙い直さない（r03-fix-play：体験の採点「取り消しがない」）
  const lockedNow = p.action !== null && p.action.kind !== 'throw';
  if (input.cancelAim && (p.aiming || input.aim)) {
    p.aiming = false;
    p.aim = null;
    p.aimCancelled = input.aim;
  }
  if (!input.aim) p.aimCancelled = false;
  if (input.aim && !p.aimCancelled && p.stones > 0 && !lockedNow) {
    p.aiming = true;
    let ax: number;
    let az: number;
    if (input.aimPoint) {
      ax = input.aimPoint.x - p.x;
      az = input.aimPoint.z - p.z;
    } else {
      ax = fx * STONE.defaultAim;
      az = fz * STONE.defaultAim;
    }
    let d = Math.hypot(ax, az);
    if (d < 1e-6) {
      ax = fx;
      az = fz;
      d = 1;
    }
    const dc = clamp(d, STONE.minRange, STONE.maxRange);
    const tx = p.x + (ax / d) * dc;
    const tz = p.z + (az / d) * dc;
    p.aim = { x: tx, z: tz, valid: stoneTargetValid(sim, p.x, p.z, tx, tz) };
  } else if (p.aiming) {
    if (!input.aim && p.aim && p.aim.valid && p.stones > 0 && !lockedNow) throwStone(sim, p.aim.x, p.aim.z);
    p.aiming = false;
    p.aim = null;
  }
}

/** 正面の最も近い番兵。信長の勝利条件を通常攻撃で飛ばさない。 */
export function meleeTarget(sim: Sim): GuardState | null {
  const p = sim.player;
  let best: GuardState | null = null;
  let distance: number = MELEE.range;
  for (const g of sim.guards) {
    if (g.role !== 'guard' || g.down || g.mode === 'victim' || g.mode === 'strike') continue;
    const d = Math.hypot(g.x - p.x, g.z - p.z);
    if (d > distance || angleTo(p.yaw, g.x - p.x, g.z - p.z) > MELEE.halfAngle * DEG || sim.q.blocked(p.x, p.z, g.x, g.z)) continue;
    best = g;
    distance = d;
  }
  return best;
}

function strike(sim: Sim): void {
  const p = sim.player;
  const a = p.action!;
  a.effectDone = true;
  const g = a.targetId ? sim.byId.get(a.targetId) : undefined;
  if (!g || g.role !== 'guard' || g.down || Math.hypot(p.x - g.x, p.z - g.z) > MELEE.range ||
    angleTo(p.yaw, g.x - p.x, g.z - p.z) > MELEE.halfAngle * DEG || sim.q.blocked(p.x, p.z, g.x, g.z)) {
    sim.emit({ type: 'melee', t: sim.t, stage: 'miss', guardId: null });
    sim.mission.message = '空振り。相手を正面の間合いに捉えよう';
    sim.mission.messageUntil = sim.t + 2;
    return;
  }
  g.meleeHits++;
  if (g.bodyTarget) {
    const body = sim.byId.get(g.bodyTarget);
    if (body?.bodyClaimedBy === g.id && !body.bodyFound) body.bodyClaimedBy = null;
    g.bodyTarget = null;
  }
  g.attackCharge = 0;
  g.dozing = false;
  g.mode = 'stagger';
  g.action = { kind: 'stagger', elapsed: 0, duration: MELEE.stagger, targetId: 'player' };
  g.goal = { x: p.x, z: p.z };
  g.path = null;
  g.s = Math.max(g.s, 0.4);
  if (g.meleeHits >= MELEE.hits) {
    g.down = true;
    g.coneCount = g.bandCount = 0;
    sim.stats.takedowns++;
    sim.emit({ type: 'takedown', t: sim.t, guardId: g.id, stage: 'done' });
  }
  sim.mission.message = g.down ? '制圧した。倒れた番兵を見られると警戒される' : '命中。正面の制圧にはもう一撃。周囲にも音が届く';
  sim.mission.messageUntil = sim.t + 3;
  sim.emit({ type: 'melee', t: sim.t, stage: 'hit', guardId: g.id });
}

function pushFromCharacters(sim: Sim, pos: { x: number; z: number }): void {
  for (const g of sim.guards) {
    if (g.down) continue;
    const dx = pos.x - g.x;
    const dz = pos.z - g.z;
    const rr = MOVE.radius + GUARD.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2);
    if (d < 1e-6) {
      pos.x += rr;
      continue;
    }
    const k = (rr - d) / d;
    pos.x += dx * k;
    pos.z += dz * k;
  }
}

/**
 * 制圧・討ち取りの踏み込み：動作の初め（stepIn 秒）に、相手との間合いを reach まで、相手へ向かう線の上でなめらかに詰める。
 * 人物の動作は決まった間合いで手を伸ばすので、1.6m 離れて始めても手が首に届くようにする（r01-integrate）。足音は出さない。
 */
export function stepIn(sim: Sim): void {
  const p = sim.player;
  const a = p.action;
  if (!a || (a.kind !== 'takedown' && a.kind !== 'assassinate' && a.kind !== 'melee') || !a.targetId) return;
  const v = sim.byId.get(a.targetId);
  if (!v) return;
  const cfg = a.kind === 'melee' ? MELEE : a.kind === 'takedown' ? TAKEDOWN : ASSASSINATE;
  if (!a.stepFrom || !a.stepTo) {
    const dx = p.x - v.x;
    const dz = p.z - v.z;
    const d = Math.hypot(dx, dz);
    const ux = d > 1e-6 ? dx / d : -Math.cos(v.yaw);
    const uz = d > 1e-6 ? dz / d : -Math.sin(v.yaw);
    a.stepFrom = { x: p.x, z: p.z };
    // 間合いの外から始まった（デバッグの forceWin など）ときは動かさない
    a.stepTo = d <= cfg.range + 0.5 && (a.kind !== 'melee' || d > cfg.reach)
      ? { x: v.x + ux * cfg.reach, z: v.z + uz * cfg.reach } : { x: p.x, z: p.z };
  }
  const u = clamp(a.elapsed / cfg.stepIn, 0, 1);
  const k = u * u * (3 - 2 * u);
  const toX = lerp(a.stepFrom.x, a.stepTo.x, k);
  const toZ = lerp(a.stepFrom.z, a.stepTo.z, k);
  tmp.x = p.x;
  tmp.z = p.z;
  sim.q.move(tmp, toX - p.x, toZ - p.z, MOVE.radius, p.crouch);
  p.x = tmp.x;
  p.z = tmp.z;
  p.yaw = Math.atan2(v.z - p.z, v.x - p.x);
}

function startTakedown(sim: Sim, g: GuardState): void {
  const p = sim.player;
  p.action = { kind: 'takedown', elapsed: 0, duration: TAKEDOWN.duration, targetId: g.id };
  p.vx = 0;
  p.vz = 0;
  p.yaw = Math.atan2(g.z - p.z, g.x - p.x);
  p.aiming = false;
  p.aim = null;
  g.mode = 'victim';
  g.path = null;
  g.s = 0;
  g.dozing = false;
  g.action = { kind: 'takedownVictim', elapsed: 0, duration: TAKEDOWN.duration, targetId: 'player' };
  sim.emit({ type: 'takedown', t: sim.t, guardId: g.id, stage: 'start' });
}

function completeTakedown(sim: Sim, g: GuardState): void {
  g.mode = 'down';
  g.down = true;
  g.action = null;
  g.speed = 0;
  g.coneCount = 0;
  g.bandCount = 0;
  // この番兵が向かっていた倒れた仲間は、ほかの番兵が見つけられるように戻す
  if (g.bodyTarget) {
    const b = sim.byId.get(g.bodyTarget);
    if (b && b.bodyClaimedBy === g.id && !b.bodyFound) b.bodyClaimedBy = null;
    g.bodyTarget = null;
  }
  sim.stats.takedowns++;
  sim.emit({ type: 'takedown', t: sim.t, guardId: g.id, stage: 'done' });
  sim.emitNoise(g.x, g.z, NOISE.takedown, 'takedown');
}

function throwStone(sim: Sim, tx: number, tz: number): void {
  const p = sim.player;
  p.stones--;
  sim.stats.stonesUsed++;
  sim.stones.push({ sx: p.x, sz: p.z, tx, tz, t0: sim.t });
  p.action = { kind: 'throw', elapsed: 0, duration: STONE.throwAction };
  sim.emit({ type: 'stoneThrown', t: sim.t, x: tx, z: tz });
}
