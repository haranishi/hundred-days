// OWNER: core
// ゲームの規則の本体。固定刻み（1/60 秒）で決定的に進む。three も DOM も import しない。
// 乱数は種から作り、機能ごとに別の系列（いまは捜索の点だけが使う）。
// 1刻みの順：前の位置を残す → 手提灯の位置 → プレイヤー → 小石 → 知覚 → 倒れた仲間 → 番兵の動き → 寺の構え → 捕まる → 扇。
import type { CharacterSnap, ConeSnap, MarkSnap, MovingLight, Phase, SimSnapshot } from '../contract/snapshot';
import type { GuardDef, StageDef } from '../stage/types';
import { ASSASSINATE, BODY, CAPTURE, FINALE, GUARD, LIGHT, MELEE, NOISE, PHASE, SIGHT, STONE, TICK } from '../config/rules';
import { DEG, angleTo, clamp, dist, lerp, lerpAngle } from './math';
import { getGuardNav, NavGrid, type Pt } from './nav';
import { SightField, buildCone, halfAngleRad, phaseSightMul, stanceSightMul } from './perception';
import { getQuery, lightTier, StageQuery } from './query';
import { rngStream, type Rng } from './rng';
import { guardAwareness, hear, initGuard, markOf, perceive, startChase, startReturn, startRush, startSearch, updateGuard, updateRush, wake } from './guards';
import { initPlayer, refreshPlayerSense, stepIn, updatePlayer } from './player';
import type { DetectCause, DetectRecord, GuardState, NoiseKind, PlayerState, SimEvent, SimInput } from './types';
import { Mission, updateMission } from './mission';

export interface SimOptions {
  seed: number;
  /** 捕まらない（?god=1）。 */
  god?: boolean;
  /** 番兵が気づかない（撮影とタイトルの背景）。扇は出す。 */
  oblivious?: boolean;
  /** プレイヤーを写しに出さない（タイトルの背景）。 */
  hidePlayer?: boolean;
  /** 計測用に番兵を足す。 */
  extraGuards?: GuardDef[];
}

export interface StoneFlight {
  sx: number;
  sz: number;
  tx: number;
  tz: number;
  t0: number;
}

export interface NoiseRing {
  x: number;
  z: number;
  radius: number;
  age: number;
  kind: NoiseKind;
}

export interface SimStats {
  discoveries: number;
  takedowns: number;
  stonesUsed: number;
  /** 討ち取った（または捕まった）時刻。 */
  endTime: number;
}

export class Sim {
  readonly stage: StageDef;
  readonly q: StageQuery;
  nav: NavGrid;
  readonly mission = new Mission();
  readonly opts: SimOptions;
  readonly rngSearch: Rng;
  t = 0;
  tick = 0;
  phase: Phase = 'normal';
  /** いまの段階の残り秒（normal では 0）。 */
  phaseLeft = 0;
  /** 発見中、誰にも見られていない秒数。 */
  alertUnseen = 0;
  /** 発見の最後に見た位置（番兵が共有する）。 */
  lastSeen: Pt | null = null;
  lastSeenVersion = 0;
  /** いまの発見を起こした理由（捕まった記録に使う）。 */
  alertCause: DetectCause = 'sight';
  sightedThisTick = false;
  readonly player: PlayerState;
  readonly guards: GuardState[] = [];
  readonly byId = new Map<string, GuardState>();
  readonly nobunaga: GuardState | null;
  readonly stones: StoneFlight[] = [];
  readonly noises: NoiseRing[] = [];
  movingLights: MovingLight[] = [];
  readonly stats: SimStats = { discoveries: 0, takedowns: 0, stonesUsed: 0, endTime: 0 };
  outcome: null | 'win' | 'caught' = null;
  outcomeT = 0;
  /** 討ち取った後の演出の進み 0→1（null なら通常）。 */
  finale: number | null = null;
  firstDetect: DetectRecord | null = null;
  capture: DetectRecord | null = null;
  readonly events: SimEvent[] = [];
  /** 番兵に目標を与えた記録（テストが「今の位置を壁越しに知らない」を確かめる口）。 */
  onGoal: ((g: GuardState, x: number, z: number, why: 'sight' | 'noise' | 'alert' | 'search' | 'body' | 'return') => void) | null = null;

  constructor(stage: StageDef, opts: SimOptions) {
    this.stage = stage;
    this.opts = opts;
    // 仕掛けを使う面はSimごとに問い合わせを持つ。再挑戦や別seedへ消灯・開放を漏らさない。
    this.q = stage.interactions?.length ? new StageQuery(stage) : getQuery(stage);
    this.nav = getGuardNav(stage);
    this.rngSearch = rngStream(opts.seed, 'search');
    this.player = initPlayer(this);
    for (const def of [...stage.guards, ...(opts.extraGuards ?? [])]) {
      const g = initGuard(def);
      this.guards.push(g);
      this.byId.set(g.id, g);
    }
    this.nobunaga = this.guards.find((g) => g.role === 'target') ?? null;
    this.updateMovingLights();
    refreshPlayerSense(this);
    this.rebuildCones(true);
  }

  get hidePlayer(): boolean {
    return this.opts.hidePlayer === true;
  }

  // ------------------------------------------------------------------ 1刻み

  step(input: SimInput): void {
    const dt = TICK;
    this.t += dt;
    this.tick++;
    const p = this.player;
    p.prevX = p.x;
    p.prevZ = p.z;
    p.prevYaw = p.yaw;
    for (const g of this.guards) {
      g.prevX = g.x;
      g.prevZ = g.z;
      g.prevYaw = g.yaw;
      g.prevHeadYaw = g.headYaw;
    }
    for (const n of this.noises) n.age += dt;
    while (this.noises.length > 0 && this.noises[0].age >= NOISE.ringLife) this.noises.shift();

    if (this.outcome === 'win') {
      this.finale = clamp((this.t - this.outcomeT) / FINALE.duration, 0, 1);
      this.advanceActions(dt);
      stepIn(this);
      const nb = this.nobunaga;
      if (nb) for (const g of this.guards) if (g.mode === 'rush') updateRush(this, g, nb, dt);
      this.updateMovingLights();
      return;
    }
    if (this.outcome === 'caught') {
      this.advanceActions(dt);
      return;
    }

    this.sightedThisTick = false;
    this.updateMovingLights();
    updatePlayer(this, input, dt);
    updateMission(this, input, dt);
    this.updateStones();
    for (const g of this.guards) perceive(this, g, dt);
    this.noticeBodies();
    this.planPaths();
    for (const g of this.guards) updateGuard(this, g, dt);
    this.separateGuards();
    this.updatePhase(dt);
    this.checkCapture();
    this.refreshMarks();
    this.updateMovingLights();
    this.rebuildCones(false);
  }

  /**
   * 頭の上の印を決める。印が「？」に変わった瞬間を qSince に残し、出来事「不審」を出す（約束 1 はここから数える）。
   * 印が消えて s も 0 なら、きっかけ（origin）を忘れる。
   */
  private refreshMarks(): void {
    for (const g of this.guards) {
      const m = markOf(this, g);
      if (m === '?' && g.mark !== '?') {
        g.qSince = this.t;
        this.emit({ type: 'suspicious', t: this.t, guardId: g.id, cause: g.origin ?? 'sight' });
      } else if (m !== '?') {
        g.qSince = -1;
      }
      if (m === null && g.s <= 0) g.origin = null;
      g.mark = m;
    }
  }

  /** 溜まった出来事を取り出す（画面と音が購読する）。 */
  drainEvents(): SimEvent[] {
    return this.events.splice(0, this.events.length);
  }

  emit(e: SimEvent): void {
    this.events.push(e);
  }

  // ------------------------------------------------------------------ 動作（当て身・討ち取り・突き）

  private advanceActions(dt: number): void {
    const p = this.player;
    if (p.action) p.action.elapsed = Math.min(p.action.duration, p.action.elapsed + dt);
    for (const g of this.guards) {
      if (!g.action) continue;
      g.action.elapsed = Math.min(g.action.duration, g.action.elapsed + dt);
      if (g.action.kind === 'assassinateVictim' && g.action.elapsed >= g.action.duration) {
        g.down = true;
        g.mode = 'down';
      }
    }
  }

  // ------------------------------------------------------------------ 手提灯

  private updateMovingLights(): void {
    const out: MovingLight[] = [];
    for (const g of this.guards) {
      if (!g.lantern || g.down) continue;
      out.push(lanternLight(g.id, g.x, g.z, g.yaw));
    }
    this.movingLights = out;
  }

  // ------------------------------------------------------------------ 物音

  /** 物音を出す。輪を残し、聞こえた番兵を「調べる」へ移す。 */
  emitNoise(x: number, z: number, radius: number, kind: NoiseKind): void {
    this.noises.push({ x, z, radius, age: 0, kind });
    for (const g of this.guards) hear(this, g, x, z, radius, kind);
  }

  private updateStones(): void {
    for (let i = this.stones.length - 1; i >= 0; i--) {
      const s = this.stones[i];
      if (this.t - s.t0 < STONE_FLIGHT - 1e-9) continue;
      this.stones.splice(i, 1);
      this.emit({ type: 'stoneLanded', t: this.t, x: s.tx, z: s.tz });
      this.emitNoise(s.tx, s.tz, NOISE.stone, 'stone');
    }
  }

  // ------------------------------------------------------------------ 倒れた仲間

  private noticeBodies(): void {
    if (this.opts.oblivious) return;
    const half = halfAngleRad(this.phase);
    for (const g of this.guards) {
      if (g.role !== 'guard' || g.down || g.mode === 'victim' || g.mode === 'strike' || g.mode === 'stagger' || g.mode === 'chase' || g.mode === 'body') continue;
      if (g.dozing) continue;
      for (const b of this.guards) {
        if (!b.down || b.bodyFound || b.bodyClaimedBy || b === g || b.role !== 'guard') continue;
        const dx = b.x - g.x;
        const dz = b.z - g.z;
        const d = Math.hypot(dx, dz);
        const L = this.q.brightnessAt(b.x, b.z, this.movingLights);
        if (d > BODY_BASE + BODY_PER_LIGHT * L) continue;
        if (angleTo(g.yaw + g.headYaw, dx, dz) > half) continue;
        if (this.q.blocked(g.x, g.z, b.x, b.z)) continue;
        b.bodyClaimedBy = g.id;
        g.bodyTarget = b.id;
        g.mode = 'body';
        g.lookLeft = -1;
        if (!g.origin) g.origin = 'body';
        this.setGoal(g, b.x, b.z, 'body');
        this.emit({ type: 'bodyNoticed', t: this.t, guardId: g.id, bodyId: b.id });
        break;
      }
    }
  }

  /** 倒れた仲間のそばに着いた：警戒を起こす（1人につき1回）。 */
  bodyReached(g: GuardState, b: GuardState): void {
    if (b.bodyFound) return;
    b.bodyFound = true;
    this.emit({ type: 'bodyFound', t: this.t, guardId: g.id, bodyId: b.id });
    if (this.phase === 'normal') this.setPhase('caution', PHASE.cautionFromBody);
    else if (this.phase === 'caution') this.phaseLeft = Math.max(this.phaseLeft, PHASE.cautionFromBody);
  }

  // ------------------------------------------------------------------ 寺の構え

  setPhase(to: Phase, left: number): void {
    const from = this.phase;
    this.phase = to;
    this.phaseLeft = left;
    if (from !== to) this.emit({ type: 'phase', t: this.t, from, to });
    if (to !== 'normal') for (const g of this.guards) if (g.dozing) wake(this, g);
  }

  private updatePhase(dt: number): void {
    if (this.phase === 'alert') {
      if (this.sightedThisTick) this.alertUnseen = 0;
      else this.alertUnseen += dt;
      this.phaseLeft = Math.max(0, PHASE.alertCalmAfter - this.alertUnseen);
      if (this.alertUnseen >= PHASE.alertCalmAfter) {
        this.setPhase('evasion', PHASE.evasionTime);
        for (const g of this.guards) {
          if (g.mode === 'chase') startSearch(this, g);
          // 発見の名残で「見えた瞬間にまた発見」にならないよう、全員の不審を下げる（RULES の r02 の変更）
          g.s = Math.min(g.s, PHASE.evasionSuspicionCap);
        }
      }
    } else if (this.phase === 'evasion') {
      this.phaseLeft -= dt;
      if (this.phaseLeft <= 0) {
        this.setPhase('caution', PHASE.cautionTime);
        for (const g of this.guards) if (g.mode === 'search') startReturn(this, g);
      }
    } else if (this.phase === 'caution') {
      this.phaseLeft -= dt;
      if (this.phaseLeft <= 0) this.setPhase('normal', 0);
    }
  }

  /** 発見中に誰かがプレイヤーを見た：最後に見た位置を共有し、静まるまでの数えを戻す。 */
  sighting(): void {
    const p = this.player;
    this.sightedThisTick = true;
    this.alertUnseen = 0;
    if (!this.lastSeen || dist(this.lastSeen.x, this.lastSeen.z, p.x, p.z) > 0.25) {
      this.lastSeen = { x: p.x, z: p.z };
      this.lastSeenVersion++;
    }
  }

  /** s が 1 に届いた（または当て身を見られた）：発見。 */
  discover(g: GuardState, cause: DetectCause): void {
    if (this.outcome) return;
    const rec = this.makeRecord(g, cause);
    if (!this.firstDetect) this.firstDetect = rec;
    g.s = 1;
    if (this.phase !== 'alert') {
      this.stats.discoveries++;
      this.alertCause = cause;
      this.alertUnseen = 0;
      this.setPhase('alert', PHASE.alertCalmAfter);
    }
    this.sighting();
    this.emit({ type: 'discovered', t: this.t, guardId: g.id, record: rec, count: this.stats.discoveries });
    if (g.role === 'target') this.emit({ type: 'shout', t: this.t, guardId: g.id, text: '曲者じゃ！' });
    const ls = this.lastSeen!;
    for (const h of this.guards) {
      if (h.role !== 'guard' || h.down || h.mode === 'victim' || h.mode === 'strike' || h.mode === 'stagger') continue;
      if (h === g || dist(h.x, h.z, ls.x, ls.z) <= PHASE.alertRadius) startChase(this, h);
    }
  }

  makeRecord(g: GuardState, cause: DetectCause): DetectRecord {
    const p = this.player;
    return {
      t: this.t,
      guardId: g.id,
      guardName: g.name,
      cause,
      light: p.light,
      lightTier: lightTier(p.light),
      stance: p.moveStance,
      still: p.still,
      inBush: p.inBush,
      surface: p.surface,
      distance: dist(g.x, g.z, p.x, p.z),
      phase: this.phase,
      x: p.x,
      z: p.z,
    };
  }

  // ------------------------------------------------------------------ 捕まる・討ち取る

  private checkCapture(): void {
    if (this.phase !== 'alert' || this.opts.god || this.outcome) return;
    const p = this.player;
    for (const g of this.guards) {
      if (g.mode !== 'chase' || g.down) { g.attackCharge = 0; continue; }
      if (dist(g.x, g.z, p.x, p.z) > PHASE.catchDistance || this.q.blocked(g.x, g.z, p.x, p.z)) {
        g.attackCharge = 0;
        continue;
      }
      // r07: 槍の振りかぶりを見て、反撃か退避を選べる猶予。
      g.attackCharge += TICK;
      if (g.attackCharge < MELEE.windup) continue;
      this.caught(g, this.alertCause);
      return;
    }
  }

  private caught(g: GuardState, cause: DetectCause): void {
    const p = this.player;
    this.outcome = 'caught';
    this.outcomeT = this.t;
    this.stats.endTime = this.t;
    this.capture = this.makeRecord(g, cause);
    g.mode = 'strike';
    g.path = null;
    g.yaw = Math.atan2(p.z - g.z, p.x - g.x);
    g.action = { kind: 'strike', elapsed: 0, duration: CAPTURE.strike, targetId: 'player' };
    p.action = { kind: 'struck', elapsed: 0, duration: CAPTURE.struck, targetId: g.id };
    p.vx = 0;
    p.vz = 0;
    p.aiming = false;
    p.aim = null;
    this.emit({ type: 'caught', t: this.t, guardId: g.id, record: this.capture });
  }

  /** 信長を討つ（演出へ移る）。 */
  assassinate(): void {
    const nb = this.nobunaga;
    const p = this.player;
    if (!nb || this.outcome) return;
    this.outcome = 'win';
    this.outcomeT = this.t;
    this.stats.endTime = this.t;
    this.finale = 0;
    p.vx = 0;
    p.vz = 0;
    p.aiming = false;
    p.aim = null;
    p.yaw = Math.atan2(nb.z - p.z, nb.x - p.x);
    p.action = { kind: 'assassinate', elapsed: 0, duration: ASSASSINATE.duration, targetId: nb.id };
    nb.mode = 'victim';
    nb.path = null;
    nb.action = { kind: 'assassinateVictim', elapsed: 0, duration: ASSASSINATE.victimDuration, targetId: 'player' };
    for (const g of this.guards) {
      g.coneCount = 0;
      g.bandCount = 0;
      g.speed = 0;
    }
    // 蘭丸が振り向いて駆け寄る（間に合わない）。倒れていれば動かない
    for (const g of this.guards) {
      if (g.def.kind === 'ranmaru' && !g.down && g.mode !== 'victim') startRush(this, g, nb);
    }
    this.emit({ type: 'assassinated', t: this.t });
  }

  // ------------------------------------------------------------------ 番兵どうし

  private separateGuards(): void {
    const minD = GUARD.radius * 2;
    const gs = this.guards;
    for (let i = 0; i < gs.length; i++) {
      const a = gs[i];
      if (a.down || a.base === 'seated') continue;
      for (let j = i + 1; j < gs.length; j++) {
        const b = gs[j];
        if (b.down || b.base === 'seated') continue;
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= minD * minD) continue;
        const d = Math.sqrt(d2);
        // 完全に重なっていても、配列の順に同じ方向へ分ける（乱数を使わず再現できる）。
        if (d < 1e-6) {
          dx = 1;
          dz = 0;
        }
        const push = (minD - d) / 2 / (d < 1e-6 ? 1 : d);
        // r06-physics: 人物どうしの押し合いも、移動途中の塀や柱で止める。
        this.q.move(a, -dx * push, -dz * push, GUARD.radius, false);
        this.q.move(b, dx * push, dz * push, GUARD.radius, false);
      }
    }
    const tmp = { x: 0, z: 0 };
    for (const g of gs) {
      if (g.down || g.base === 'seated') continue;
      tmp.x = g.x;
      tmp.z = g.z;
      this.q.resolve(tmp, GUARD.radius, false);
      g.x = tmp.x;
      g.z = tmp.z;
      g.speed = Math.hypot(g.x - g.prevX, g.z - g.prevZ) / TICK;
    }
  }

  // ------------------------------------------------------------------ 目標（記録つき）

  /**
   * 目標を与える。道（A*）はすぐには引かず、順番待ちに入れる（1刻みに引く本数を PATHS_PER_TICK 本に抑え、
   * 何人も一度に追い始めた刻みが重くならないようにする）。道を待つ間、番兵は目標の方を向く。
   */
  setGoal(g: GuardState, x: number, z: number, why: 'sight' | 'noise' | 'alert' | 'search' | 'body' | 'return'): void {
    g.goal = { x, z };
    g.path = null;
    g.pathIdx = 0;
    g.pathPending = true;
    g.repathAt = this.t + PHASE.repathInterval;
    if (this.onGoal) this.onGoal(g, x, z, why);
  }

  private planPaths(): void {
    const n = this.guards.length;
    let budget = PATHS_PER_TICK;
    for (let k = 0; k < n && budget > 0; k++) {
      const g = this.guards[(this.pathCursor + k) % n];
      if (!g.pathPending || !g.goal || g.down || g.mode === 'victim' || g.mode === 'strike') continue;
      g.pathPending = false;
      g.path = this.nav.findPath(g.x, g.z, g.goal.x, g.goal.z) ?? [{ x: g.goal.x, z: g.goal.z }];
      g.pathIdx = 0;
      budget--;
      this.pathCursor = (this.pathCursor + k + 1) % n;
    }
  }
  private pathCursor = 0;

  // ------------------------------------------------------------------ 扇

  private rebuildCones(all: boolean): void {
    const p = this.player;
    const half = halfAngleRad(this.phase);
    const stanceMul = stanceSightMul(p.moveStance);
    const phaseMul = phaseSightMul(this.phase);
    const every = Math.max(1, Math.round(60 / SIGHT.coneHz));
    for (let i = 0; i < this.guards.length; i++) {
      const g = this.guards[i];
      if (g.down || g.mode === 'victim' || g.mode === 'strike' || g.mode === 'stagger' || this.outcome === 'win') {
        g.coneCount = 0;
        g.bandCount = 0;
        continue;
      }
      if (!all && (this.tick + i) % every !== 0) continue;
      // 判定（canSee）と同じ視界の場で作る：扇に出ている所だけが見つかる所
      CONE_FIELD.prepare(this.q, g.x, g.z, stanceMul, g.sightMul, phaseMul, p.crouch, this.movingLights, true);
      g.bandCount = buildCone({ poly: g.cone, bands: g.bands }, CONE_FIELD, g.yaw + g.headYaw, half);
      g.coneCount = SIGHT.coneRays + 1;
    }
  }

  // ------------------------------------------------------------------ 写し

  /** 描画に渡す写し。alpha は前の刻みと今の刻みの間の位置（0..1）。 */
  snapshot(alpha = 1): SimSnapshot {
    const a = clamp(alpha, 0, 1);
    const p = this.player;
    const characters: CharacterSnap[] = [];
    if (!this.hidePlayer) {
      characters.push({
        id: 'player',
        kind: 'player',
        x: lerp(p.prevX, p.x, a),
        z: lerp(p.prevZ, p.z, a),
        yaw: lerpAngle(p.prevYaw, p.yaw, a),
        pose: {
          speed: p.speed,
          stance: p.action?.kind === 'struck' && p.action.elapsed >= p.action.duration ? 'down' : p.crouch ? 'crouch' : 'stand',
          awareness: 'calm',
          headYaw: 0,
          action: p.action ? { kind: p.action.kind, t: clamp(p.action.elapsed / p.action.duration, 0, 1) } : null,
          lantern: false,
          weapon: 'katana',
        },
      });
    }
    const lights: MovingLight[] = [];
    const cones: ConeSnap[] = [];
    const marks: MarkSnap[] = [];
    for (const g of this.guards) {
      const x = lerp(g.prevX, g.x, a);
      const z = lerp(g.prevZ, g.z, a);
      const yaw = lerpAngle(g.prevYaw, g.yaw, a);
      const awareness = guardAwareness(this, g);
      const stance = g.down ? 'down' : g.dozing ? 'doze' : g.base === 'seated' ? 'sit' : 'stand';
      characters.push({
        id: g.id,
        kind: g.def.kind,
        x,
        z,
        yaw,
        pose: {
          speed: g.speed,
          stance,
          awareness,
          headYaw: lerpAngle(g.prevHeadYaw, g.headYaw, a),
          action: g.action ? { kind: g.action.kind, t: clamp(g.action.elapsed / g.action.duration, 0, 1) }
            : g.attackCharge > 0 ? { kind: 'strike', t: 0.22 * Math.min(1, g.attackCharge / MELEE.windup) } : null,
          lantern: g.lantern && !g.down,
          weapon: g.def.weapon,
        },
      });
      if (g.lantern && !g.down) lights.push(lanternLight(g.id, x, z, yaw));
      if (g.coneCount > 0 && this.outcome !== 'win') cones.push({ id: g.id, poly: g.cone.subarray(0, g.coneCount * 2), bands: g.bands.subarray(0, g.bandCount * 8), awareness, fill: g.s });
      const mark = this.outcome === 'win' ? null : g.mark;
      if (mark) marks.push({ id: g.id, kind: mark, fill: mark === '!' ? 1 : g.s, x, y: g.dozing || g.base === 'seated' ? GUARD.markSit : GUARD.markStand, z });
    }
    return {
      interactions: this.mission.snapshots(this.stage),
      disabledLights: [...this.mission.disabledLights],
      t: this.t,
      phase: this.phase,
      phaseLeft: this.phase === 'normal' ? 0 : this.phaseLeft,
      characters,
      lights,
      stones: this.stones.map((s) => stonePos(s, this.t)),
      noises: this.noises.map((n) => ({ x: n.x, z: n.z, radius: n.radius, age: n.age })),
      cones,
      marks,
      aim: p.aim ? { x: p.aim.x, z: p.aim.z, valid: p.aim.valid } : null,
      finale: this.finale,
    };
  }

  // ------------------------------------------------------------------ デバッグの口

  teleport(x: number, z: number, yawDeg?: number): void {
    const p = this.player;
    p.x = p.prevX = x;
    p.z = p.prevZ = z;
    p.vx = 0;
    p.vz = 0;
    p.speed = 0;
    if (yawDeg !== undefined) p.yaw = p.prevYaw = yawDeg * DEG;
    refreshPlayerSense(this);
  }

  setCrouch(on: boolean): void {
    this.player.crouch = on;
    refreshPlayerSense(this);
    this.rebuildCones(true);
  }

  forceWin(): void {
    this.assassinate();
  }

  forceLose(): void {
    if (this.outcome) return;
    const p = this.player;
    let best: GuardState | null = null;
    for (const g of this.guards) {
      if (g.role !== 'guard' || g.down) continue;
      if (!best || dist(g.x, g.z, p.x, p.z) < dist(best.x, best.z, p.x, p.z)) best = g;
    }
    if (best) this.caught(best, 'debug');
  }
}

/** 1刻みに引く A* の道の本数。r01-core 追加 */
const PATHS_PER_TICK = 1;
const STONE_FLIGHT = STONE.flightTime;
const BODY_BASE = BODY.base;
const BODY_PER_LIGHT = BODY.perLight;

/** 手提灯：番兵の前 0.35m・右 0.2m・高さ 0.9m。 */
export function lanternLight(id: string, x: number, z: number, yaw: number): MovingLight {
  const fx = Math.cos(yaw);
  const fz = Math.sin(yaw);
  // 右は (−sin yaw, cos yaw)（東を向くと南が右）
  return {
    id: `lantern-${id}`,
    x: x + fx * LIGHT.lanternForward - fz * LIGHT.lanternRight,
    y: LIGHT.lanternHeight,
    z: z + fz * LIGHT.lanternForward + fx * LIGHT.lanternRight,
    radius: LIGHT.lanternRadius,
    intensity: LIGHT.lanternIntensity,
  };
}

export function stonePos(s: StoneFlight, t: number): { x: number; y: number; z: number } {
  const u = clamp((t - s.t0) / STONE_FLIGHT, 0, 1);
  return {
    x: lerp(s.sx, s.tx, u),
    y: lerp(STONE.releaseHeight, 0.05, u) + 4 * STONE.arcHeight * u * (1 - u),
    z: lerp(s.sz, s.tz, u),
  };
}

/** 扇を作るときの視界の場（使い回す）。 */
const CONE_FIELD = new SightField();
