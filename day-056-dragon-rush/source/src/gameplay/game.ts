// OWNER: gameplay
// 遊びの本体（純データ・three を読まない）。操作を1刻みずつ受け取り、体・攻撃・壊れ方・燃え広がり・点数を進め、
// 出来事を EventBus に出し、竜の見た目へ DragonIntent を書く。描画・音・記録は、この出来事と状態を読むだけにする。
// r03-roster：遊ぶ怪獣（creature）を持つ。始める前と結果の画面でだけ setCreature で替えられる（遊んでいる途中は点の比べ方がぶれるので替えない）。
// r04-roster2：焔角の押し倒したビルが隣を巻き込むドミノ（domino.ts）。ほかの怪獣には設定が無く、何も起きない。
import { LANDING, RAGE_DIVE, type RingSpec, type TimeScaleHit } from '../config/attacks';
import { CameraClearance } from '../camera/clearance';
import { emptySolve, shoulderFor } from '../camera/placement';
import { CAMERA_CLEARANCE, CAMERA_PLACE, cameraProfileOf, type CameraProfile } from '../config/camera';
import { damped, smoothDamp } from '../core/springs';
import { LOOK } from '../config/controls';
import { CREATURE_CONFIG, DEFAULT_CREATURE, type CreatureConfig, type CreatureId } from '../config/creatures';
import { BUILDING_RULES } from '../config/gameplay';
import { LOCOMOTION } from '../config/locomotion';
import { EventBus, type BuildingEvent } from '../core/events';
import { createIntent, type ActionPhase, type DragonIntent } from '../dragon/intent';
import type { CityIndex } from '../world/query';
import type { CityData } from '../world/types';
import { breathReaches, castAim, fixedCamera, lookUpScale, mouthOf, spawnView, type View } from './aim';
import { Coach } from './coach';
import { Combat, applyRing, type CombatWorld, type CueKind } from './combat';
import { BodyContact } from './contact';
import { emptyControls, type ControlFrame } from './controls';
import { DamageState, STAGE, type StageChange } from './damage';
import { Domino, type DominoStats } from './domino';
import { FireState, type Ignition } from './fire';
import { DragonBody, emptyBodyEvents, type Spawn } from './locomotion';
import { DEG, clamp, directionOf, forwardOf, tuple, vec3, yawOf } from './math';
import { ScoreKeeper } from './score';
import { Session } from './session';
import { footprintCenter } from './shapes';
import type { TechniqueStats } from './techniques';

const STAGE_EVENT = ['', 'building.crack', 'building.peel', 'building.tilt', 'building.collapse'] as const;

/** 当たった瞬間の手応え。カメラ（描画の側）が毎コマ取り出して揺れ・画角・沈み込みに変える。 */
export interface Feedback {
  shake: number;
  fovKick: number;
  sink: number;
}

/** 照準の様子（HUD が読む）。reach は炎が届く所か、building は照準の先の建物（無ければ -1）。 */
export interface AimInfo {
  reach: boolean;
  building: number;
  /** 口から狙いの点までの距離（m） */
  distance: number;
}

/** 3体の違いを数字で示すための数え（受け入れ条件4。__state.creature.stats に出る）。r04-roster2：ドミノの数えも足した */
export interface CreatureStats extends TechniqueStats, DominoStats {
  /** 空中（飛ぶ・急降下）の水平の速さの最高（m/s） */
  maxAirSpeed: number;
  /** 地面からいちばん高く上がった高さ（m、飛ぶ・跳ぶ） */
  maxAltitude: number;
  /** 飛んでいた（mode が air か dive）時間の合計（秒）。焔角は 0 */
  airSeconds: number;
  jumps: number;
  charges: number;
  /** 突進で傾きまで押し倒した棟数 */
  chargeTilts: number;
}

const zeroStats = (): Omit<CreatureStats, keyof TechniqueStats | keyof DominoStats | 'chargeTilts'> => ({ maxAirSpeed: 0, maxAltitude: 0, airSeconds: 0, jumps: 0, charges: 0 });

/** 体の跳ぶ段階 → 意図の段階（屈む＝振りかぶり、上がる＝当たり、落ちる＝戻り）。 */
const JUMP_PHASE: Record<string, ActionPhase> = { none: 'none', crouch: 'windup', rise: 'active', fall: 'recovery' };

export class Game {
  readonly bus = new EventBus();
  readonly damage: DamageState;
  readonly fire: FireState;
  readonly score: ScoreKeeper;
  readonly session: Session;
  readonly body: DragonBody;
  readonly combat: Combat;
  /** 押し倒したビルが隣を巻き込む（焔角） */
  readonly domino: Domino;
  readonly coach = new Coach();
  readonly intent: DragonIntent = createIntent();
  /** 遊ぶ怪獣（config/creatures/） */
  creature: CreatureConfig;
  /** r05-camera：遊ぶ怪獣のカメラの値（照準の光線と追うカメラが同じ値で置く） */
  cameraProfile: CameraProfile;
  /** r05-camera：カメラを瓦礫の山の上へ逃がす規則（照準の光線と追うカメラが同じものを使う） */
  readonly cameraClearance: CameraClearance;
  /** 始まりの位置と向き・視点（怪獣と街から決める。やり直しでもここへ戻る） */
  spawn: Spawn;
  spawnView: View;
  /** 視点の向き（シミュレーションが持つ。カメラはこれを読む） */
  readonly view: View;
  /** 狙いの点：決まった位置のカメラから視線を伸ばし、最初に当たった建物か地面 */
  readonly aimPoint = vec3();
  readonly aim: AimInfo = { reach: false, building: -1, distance: Infinity };
  /** 照準の合図の回数（増えたら HUD が印を光らせる） */
  readonly cues: Record<CueKind, number> = { hit: 0, miss: 0, noRage: 0 };
  /** ゲーム内時刻（秒）。遊び始めてから進み、一時停止中は止まる。結果の後も街は動き続ける。残り時間もこの時計で数える */
  clock = 0;
  /** 時間切れになったゲーム内時刻（まだなら null） */
  endedAt: number | null = null;
  firstCollapseAt: number | null = null;
  readonly feedback: Feedback[] = [];
  private timeScales: { scale: number; remaining: number }[] = [];
  private readonly contact: BodyContact;
  private readonly changes: StageChange[] = [];
  private readonly ignitions: Ignition[] = [];
  /** 攻撃が街へ問い合わせる口（テストと撮影の場面作りが技を直接出すのにも使う） */
  readonly world: CombatWorld;
  private readonly aimCam = vec3();
  /** r06-camera2：照準の様子（HUD）を決める光線の出どころ（ばねを通した高さ。追うカメラと同じ所） */
  private readonly aimSeenCam = vec3();
  /** r06-camera2：置き方の規則の答え（照準の光線の分。追うカメラも同じ関数で寄せる距離を決める） */
  readonly cameraSolve = emptySolve();
  /**
   * r06-camera2：照準の様子（HUD）の光線と追うカメラが一緒に上げる高さ（m）。規則の答えへ、追うカメラと同じばね（上げるとき速く、下げるとき
   * ゆっくり）で固定刻みで近づける。追うカメラはこの値をそのまま使うので、ばねの途中でも画面の中央と照準の明るさが同じ直線で決まる
   * （体験の採点 r05 の B2：瓦礫の山の上へ持ち上げたカメラで、照準の判定が持ち上げる前の位置で行われていた）。
   * 主砲の狙いの点は r05 までと同じく、ばねを通さない規則の答えの高さから（updateAim）
   */
  readonly cameraRise = damped();
  /**
   * r06-camera2：照準の光線と追うカメラが使う肩越しのずれ（m）。回転の中心が右の建物に入らない値（camera/placement.ts の shoulderFor）へ、
   * ばねで近づける（縮めない怪獣はいつも設定の値）
   */
  readonly cameraShoulder = damped(-1);
  private moveStats = zeroStats();
  private wasCharging = false;
  /** 時間切れの瞬間の数え（結果の後も街と体は少し動き続けるので、3分ちょうどの値を残す） */
  endStats: CreatureStats | null = null;

  constructor(
    readonly city: CityData,
    readonly index: CityIndex,
    duration?: number,
    creature: CreatureId = DEFAULT_CREATURE,
  ) {
    this.creature = CREATURE_CONFIG[creature];
    this.cameraProfile = cameraProfileOf(this.creature.camera);
    this.damage = new DamageState(city);
    this.cameraClearance = new CameraClearance(city.buildings, index, this.groundAt);
    this.fire = new FireState(city, index);
    this.score = new ScoreKeeper(city);
    this.session = new Session(duration);
    const s = this.spawnFor(this.creature);
    this.spawn = s.spawn;
    this.spawnView = s.view;
    this.view = { ...s.view };
    const B = LOCOMOTION.bounds;
    this.body = new DragonBody({ xMin: city.coast.coastX - B.seaMargin, xMax: B.xMax, zMin: B.zMin, zMax: B.zMax }, this.spawn, this.creature);
    this.combat = new Combat(this.creature);
    this.domino = new Domino(this.creature.moves.domino);
    this.contact = new BodyContact(city.buildings.length);
    this.contact.creature = this.creature.id;
    this.world = {
      city,
      index,
      damage: this.damage,
      fire: this.fire,
      score: this.score,
      bus: this.bus,
      ignitions: this.ignitions,
      groundAt: (x, z) => this.groundAt(x, z),
      impact: (hitStop, shake) => this.impact(hitStop, shake),
      cue: (kind) => {
        this.cues[kind]++;
      },
    };
    this.updateAim();
    this.writeIntent();
  }

  /** 足もとの地面の高さ。湾の上は浅瀬の底。 */
  readonly groundAt = (x: number, z: number): number => (this.index.surfaceAt(x, z) === 'water' ? -LOCOMOTION.wadeDepth : this.city.groundLevel);

  /**
   * 怪獣ごとの始まり：飛べる怪獣は都心の西の上空（地面から70m）、飛べない怪獣はその下のいちばん近い大通りの交差点に立つ。
   * どちらも、照準が主砲の届く高層ビルに乗る向き（aim.ts の spawnView）で始める。紅竜は r02-controls の始まりのまま。
   */
  private spawnFor(c: CreatureConfig): { spawn: Spawn; view: View } {
    const L = LOCOMOTION;
    const S = L.spawnAim;
    const mouthLocal = c.body.mouthLocal;
    const reachMax = Math.min(S.reachMax, c.moves.primary.spec.range * 0.85);
    const camera = cameraProfileOf(c.camera);
    let body: { x: number; y: number; z: number };
    let distance: number;
    if (c.motion.canFly) {
      body = { x: L.spawn.x, y: L.spawn.y - L.bodyHeight + c.body.bodyHeight, z: L.spawn.z };
      distance = camera.distanceAir;
    } else {
      const ix = this.index.intersectionNear(L.spawn.x, L.spawn.z);
      const x = this.city.roadLines[ix.nsLineId].pos;
      const z = this.city.roadLines[ix.ewLineId].pos;
      body = { x, y: this.groundAt(x, z) + c.body.bodyHeight, z };
      distance = camera.distanceGround;
    }
    // 地上から始める怪獣は、口のまわり 8m に建物の無い向きを選ぶ（口がビルに埋まると、溶岩の礫が放物線を描く前に弾ける）
    const mouthClearance = c.motion.canFly ? 0 : 8;
    const sv = c.id === 'kurenai' ? spawnView(this.index, this.groundAt) : spawnView(this.index, this.groundAt, { body, distance, mouthLocal, reachMin: S.reachMin, reachMax, mouthClearance, camera, clearSight: true });
    return { spawn: { x: body.x, y: body.y, z: body.z, yaw: sv.view.yaw }, view: sv.view };
  }

  /** 怪獣を替える（始める前と結果の画面から。遊んでいる途中は替えない）。体・技・始まりの位置と視点を、その怪獣のものにする。 */
  setCreature(id: CreatureId): void {
    if (this.creature.id === id) return;
    const phase = this.session.phase;
    if (phase === 'playing' || phase === 'paused') throw new Error('遊んでいる途中では怪獣を替えない');
    this.creature = CREATURE_CONFIG[id];
    this.cameraProfile = cameraProfileOf(this.creature.camera);
    const s = this.spawnFor(this.creature);
    this.spawn = s.spawn;
    this.spawnView = s.view;
    this.body.setCreature(this.creature, s.spawn);
    this.combat.setCreature(this.creature);
    this.domino.spec = this.creature.moves.domino;
    this.domino.reset();
    this.contact.creature = id;
    this.contact.reset();
    this.view.yaw = s.view.yaw;
    this.view.pitch = s.view.pitch;
    this.moveStats = zeroStats();
    this.wasCharging = false;
    this.endStats = null;
    this.updateAim();
    this.writeIntent();
  }

  /** 3体の違いを数字で示すための数え。 */
  get stats(): CreatureStats {
    return { ...this.moveStats, ...this.combat.techniques.stats, chargeTilts: this.contact.chargeTilts, ...this.domino.stats };
  }

  /** 今の時間の倍率（ヒットストップ中は 1 未満）。 */
  get timeScale(): number {
    return this.timeScales.reduce((m, r) => Math.min(m, r.scale), 1);
  }

  start(): void {
    if (this.session.start()) this.bus.emit('session.start', { t: this.clock, creature: this.creature.id });
  }

  pause(): void {
    this.session.pause();
  }

  resume(): void {
    this.session.resume();
  }

  /** やり直し：街・点数・竜・時間をすべて最初に戻し、すぐ遊べる状態にする。 */
  restart(): void {
    this.damage.reset();
    this.fire.reset();
    this.score.reset();
    this.body.reset();
    this.combat.reset();
    this.domino.reset();
    this.coach.reset();
    this.contact.reset();
    this.view.yaw = this.spawnView.yaw;
    this.view.pitch = this.spawnView.pitch;
    this.clock = 0;
    this.endedAt = null;
    this.firstCollapseAt = null;
    this.timeScales = [];
    this.feedback.length = 0;
    this.changes.length = 0;
    this.ignitions.length = 0;
    this.moveStats = zeroStats();
    this.wasCharging = false;
    this.endStats = null;
    this.bus.resetLog();
    this.session.restart();
    this.bus.emit('session.start', { t: 0, creature: this.creature.id });
    this.updateAim();
    this.writeIntent();
  }

  /** 1刻み進める（dt は実時間の刻み。ヒットストップの倍率はここで掛ける）。 */
  step(dt: number, controls: ControlFrame): void {
    this.view.yaw -= controls.lookDx * LOOK.sensitivity;
    this.view.pitch = clamp(this.view.pitch - controls.lookDy * LOOK.sensitivity, LOOK.pitchMinDeg * DEG, LOOK.pitchMaxDeg * DEG);
    const phase = this.session.phase;
    if (phase === 'ready' || phase === 'paused') {
      if (phase === 'ready') this.body.hover(dt);
      this.updateAim(dt);
      this.writeIntent();
      return;
    }
    const g = dt * this.timeScale;
    for (const r of this.timeScales) r.remaining -= dt;
    this.timeScales = this.timeScales.filter((r) => r.remaining > 0);
    this.clock += g;
    const playing = phase === 'playing';
    // r02-controls：残り時間もゲーム内時刻（ヒットストップで遅くなる時計）で減らす。旧は実時間で減らし、結果が177.5秒で出た
    if (playing && this.session.update(g)) {
      this.endedAt = this.clock;
      this.endStats = this.stats;
      this.bus.emit('session.end', { t: this.clock, yen: this.score.yen, destruction: this.score.destruction, maxCombo: this.score.maxCombo });
    }
    const c = playing ? controls : emptyControls();
    this.updateAim(dt);

    const claws = this.bus.count('dragon.claw');
    const releases = this.bus.count('rage.release');
    const steer = this.combat.update(
      g,
      this.clock,
      { breathHeld: c.breathHeld, clawPressed: c.clawPressed, tailPressed: c.tailPressed, specialPressed: c.specialPressed },
      this.body,
      this.aimPoint,
      this.world,
    );
    const f = forwardOf(this.view.yaw);
    let mx = f.x * c.moveForward - Math.cos(this.view.yaw) * c.moveRight;
    let mz = f.z * c.moveForward + Math.sin(this.view.yaw) * c.moveRight;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    const ev = emptyBodyEvents();
    this.body.update(
      g,
      {
        moveX: mx,
        moveZ: mz,
        ascendPressed: c.ascendPressed,
        ascendHeld: c.ascendHeld,
        descendHeld: c.descendHeld,
        sprintHeld: c.sprintHeld,
        speedScale: steer.moveScale,
        faceYaw: steer.faceYaw,
        faceRate: steer.faceRate,
        rageDive: steer.rageDive,
      },
      this.groundAt,
      ev,
    );
    this.contact.update(this.clock, this.body, this.world);
    for (const s of ev.steps) {
      this.bus.emit('dragon.step', { t: this.clock, foot: s.foot, pos: tuple(s.pos), speed: this.body.speed });
      this.pushFeedback(this.body.gait === 'run' ? 0.1 : 0.05, 0, 0.12);
    }
    for (const strength of ev.flaps) this.bus.emit('dragon.wingFlap', { t: this.clock, strength, pos: tuple(this.body.pos) });
    if (ev.jumped) {
      this.moveStats.jumps++;
      this.bus.emit('dragon.jump', { t: this.clock, creature: this.creature.id, pos: [this.body.pos.x, this.body.groundY, this.body.pos.z] });
    }
    if (ev.landing) this.onLanding(ev.landing.pos.x, ev.landing.pos.y, ev.landing.pos.z, ev.landing.fallSpeed, ev.landing.impact, ev.landing.dive, ev.landing.slam);
    this.trackMotion(g);

    this.domino.update(this.clock, this.damage, this.index);
    this.damage.update(g, this.changes);
    this.fire.update(g, this.damage, this.ignitions);
    this.flushChanges(playing);
    if (playing && this.score.tick(g)) this.bus.emit('combo.change', { t: this.clock, value: 0, multiplier: this.score.multiplier });
    if (playing) {
      this.coach.update(g, {
        moving: c.moveForward !== 0 || c.moveRight !== 0,
        breathing: this.combat.breathActive,
        clawed: this.bus.count('dragon.claw') > claws,
        // 飛べない怪獣は、跳んでいる間を「飛ぶ」の段の操作として数える
        climbing: c.ascendHeld || this.body.mode === 'jump',
        rageFull: this.score.rageFull,
        released: this.bus.count('rage.release') > releases,
        // r05-play：爪の段は最初の崩落の後に済ませ、使われない段は崩せていれば一定の秒数で進める（gameplay/coach.ts）
        collapsed: this.firstCollapseAt !== null,
      });
    }
    this.writeIntent();
  }

  /** 空中の速さと高さ・突進の始まりと終わりを数える（3体の違いの数字）。 */
  private trackMotion(g: number): void {
    const b = this.body;
    const flying = b.mode === 'air' || b.mode === 'dive';
    const s = this.moveStats;
    if (flying) {
      s.maxAirSpeed = Math.max(s.maxAirSpeed, b.speed);
      s.airSeconds += g;
    }
    if (!b.grounded) s.maxAltitude = Math.max(s.maxAltitude, b.altitude);
    const charging = b.charging;
    if (charging !== this.wasCharging) {
      this.wasCharging = charging;
      const pos: [number, number, number] = [b.pos.x, b.groundY, b.pos.z];
      if (charging) s.charges++;
      this.bus.emit(charging ? 'charge.start' : 'charge.stop', { t: this.clock, creature: this.creature.id, pos });
    }
  }

  /** 竜も攻撃も動かさず、街（壊れ方・燃え広がり）だけを進める。撮影の場面作りとテストで使う。 */
  advanceWorld(dt: number): void {
    this.clock += dt;
    this.combat.techniques.update(dt, this.clock, this.world);
    this.domino.update(this.clock, this.damage, this.index);
    this.damage.update(dt, this.changes);
    this.fire.update(dt, this.damage, this.ignitions);
    this.flushChanges(false);
  }

  /** (x, z) に落下速度 fallSpeed で着地したのと同じ地響きを起こす（撮影の場面作り用）。 */
  stomp(x: number, z: number, fallSpeed: number, rage = false): void {
    const y = this.groundAt(x, z);
    this.onLanding(x, y, z, fallSpeed, Math.min(1, fallSpeed / 70), rage ? 'rage' : 'normal', false);
  }

  /** 建物を高さ y で燃やす（竜の炎が当たったのと同じ着火。撮影の場面作り用）。 */
  ignite(id: number, y: number): void {
    this.fire.addHeat(id, 10, y, this.damage, this.ignitions);
    this.flushChanges(false);
  }

  /** 撮影の場面作り用：口 from から点 to へ、いま遊んでいる怪獣の主砲を1発（雷は落とし、溶岩は投げる。炎の怪獣では何もしない）。 */
  fireAt(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): void {
    const p = this.creature.moves.primary;
    const m = vec3(from.x, from.y, from.z);
    if (p.kind === 'lightning') {
      const d = vec3(to.x - m.x, to.y - m.y, to.z - m.z);
      const l = Math.hypot(d.x, d.y, d.z) || 1;
      this.combat.techniques.fireLightning(this.clock, m, vec3(d.x / l, d.y / l, d.z / l), this.groundAt(m.x, m.z), p.spec, this.body.pos, this.world, this.creature.id);
    } else if (p.kind === 'lava') this.combat.techniques.launchLava(this.clock, m, vec3(to.x, to.y, to.z), p.spec, this.world, this.creature.id);
    this.flushChanges(false);
  }

  private onLanding(x: number, y: number, z: number, fallSpeed: number, impact: number, dive: 'normal' | 'rage' | null, slam: boolean): void {
    const t = this.clock;
    this.bus.emit('dragon.land', slam ? { t, pos: [x, y, z], impact, speed: fallSpeed, dive: dive !== null, slam: true } : { t, pos: [x, y, z], impact, speed: fallSpeed, dive: dive !== null });
    if (dive === 'rage') {
      if (applyRing(this.world, t, x, z, RAGE_DIVE, 'rageDive') > 0) this.cues.hit++;
      const air = this.creature.moves.special.air;
      // 雷翼：着地点のまわりに落雷の輪（1本ずつ遅れて落ちる）
      if (air && air.kind === 'thunderDive') this.combat.techniques.thunderRing(t, x, z, y, air.thunder, 'rageDive', this.creature.id);
      this.impact(RAGE_DIVE.hitStop, RAGE_DIVE.shake);
      return;
    }
    const slamRing = this.creature.moves.slam;
    if (slam && slamRing) {
      // 焔角：跳んで着地した点のまわりを、のしかかりの輪で壊す
      if (applyRing(this.world, t, x, z, slamRing, 'slam') > 0) this.cues.hit++;
      this.impact(slamRing.hitStop, slamRing.shake);
      return;
    }
    if (fallSpeed < LANDING.minSpeed) {
      this.pushFeedback(0.12 + 0.3 * impact, impact, impact);
      return;
    }
    const radius = LANDING.radiusBase + LANDING.radiusPerSpeed * fallSpeed;
    const ring: RingSpec = {
      radius,
      damage: LANDING.damagePerSpeed * fallSpeed,
      glass: Math.min(1, LANDING.glassPerSpeed * fallSpeed),
      glassRadius: radius * 1.3,
      hitStop: { scale: 0.25, seconds: 0.04 + 0.0012 * fallSpeed },
      shake: Math.min(1, LANDING.shakePerSpeed * fallSpeed),
    };
    if (applyRing(this.world, t, x, z, ring, 'dive') > 0) this.cues.hit++;
    this.impact(ring.hitStop, ring.shake);
  }

  private impact(hitStop: TimeScaleHit | null, shake: number): void {
    if (hitStop) this.timeScales.push({ scale: hitStop.scale, remaining: hitStop.seconds });
    this.pushFeedback(shake, shake, shake * 0.8);
  }

  private pushFeedback(shake: number, fovKick: number, sink: number): void {
    this.feedback.push({ shake, fovKick, sink });
    if (this.feedback.length > 32) this.feedback.splice(0, this.feedback.length - 32);
  }

  /** 段階の変化と着火を出来事に直し、点数へ渡す。 */
  private flushChanges(playing: boolean): void {
    const t = this.clock;
    this.domino.onChanges(t, this.changes);
    for (const ch of this.changes) {
      const b = this.city.buildings[ch.id];
      const c = footprintCenter(b);
      const ev: BuildingEvent = {
        t,
        id: ch.id,
        pos: [c.x, this.damage.impactY[ch.id], c.z],
        volume: b.volume,
        height: b.height,
        material: BUILDING_RULES[b.kind].material,
        cause: ch.cause,
      };
      this.bus.emit(STAGE_EVENT[ch.stage] as 'building.crack', ev);
      if (ch.stage === STAGE.collapse && this.firstCollapseAt === null) this.firstCollapseAt = t;
      if (!playing) continue;
      const r = this.score.onStage(ch.id, ch.stage, ch.player, ch.cause);
      if (r.comboChanged) this.bus.emit('combo.change', { t, value: this.score.combo, multiplier: this.score.multiplier });
      if (r.rageFull) this.bus.emit('rage.full', { t, value: this.score.rage });
    }
    this.changes.length = 0;
    for (const ig of this.ignitions) {
      const b = this.city.buildings[ig.id];
      const c = footprintCenter(b);
      const payload = { t, id: ig.id, pos: [c.x, ig.y, c.z] as [number, number, number], size: Math.cbrt(b.volume) };
      if (ig.from === null) this.bus.emit('fire.ignite', payload);
      else this.bus.emit('fire.spread', { ...payload, from: ig.from });
    }
    this.ignitions.length = 0;
  }

  /**
   * 決まった位置のカメラ（ばねを通す前）から視線を伸ばし、竜より先で最初に当たる所を狙いの点にする。
   * r05-camera：カメラの値は怪獣ごと。瓦礫の山の上へ逃がす規則も追うカメラと同じ（照準と画面の中央を一致させたまま）
   * r06-camera2：ビルの裏から寄せる・上げる規則も追うカメラと同じ関数（camera/placement.ts の solveCamera）。照準の様子（aim）は、光線が
   * 竜より手前で入る建物を飛ばした奥の最初の建物か地面で決める（寄せたカメラ・網点の窓越しでも、画面の中央に写る物と照準の明るさが一致する。B2）。
   * 主砲の向きの狙いの点（aimPoint）は今までどおり（当たりの規則を変えない。炎は手前の建物の奥へ向かい、中央のビルに当たる）。
   * 狙いの点の光線は、規則の答えの高さ（ばねを通さない）から。照準の様子の光線は、追うカメラと同じばねを通した高さから（画面の中央と同じ直線）
   */
  private updateAim(dt = 0): void {
    const d = directionOf(this.view.yaw, this.view.pitch);
    const cam = this.cameraProfile;
    const dist = this.body.grounded ? cam.distanceGround : cam.distanceAir;
    this.cameraClearance.refresh(this.damage);
    const flying = this.body.mode === 'air' || this.body.mode === 'dive';
    const sh = this.cameraShoulder;
    const wantShoulder = shoulderFor(cam, this.body.pos, this.view, this.cameraClearance);
    if (dt <= 0 || sh.value < 0) {
      sh.value = wantShoulder;
      sh.velocity = 0;
    } else if (sh.value !== wantShoulder) smoothDamp(sh, wantShoulder, wantShoulder < sh.value ? CAMERA_PLACE.shoulderIn : CAMERA_PLACE.shoulderOut, dt);
    const o = fixedCamera(this.body.pos, this.body.vel, this.body.groundY, dist, this.view, this.aimCam, cam, this.cameraClearance, flying, this.cameraSolve, sh.value);
    // 上げる高さはばねを通す（dt が 0 のとき＝始まり・やり直し・怪獣の替えは、答えへ飛ばす）。追うカメラと照準の様子はこの値で上げる
    const target = this.cameraSolve.rise;
    const rise = this.cameraRise;
    if (dt <= 0) {
      rise.value = target;
      rise.velocity = 0;
    } else smoothDamp(rise, target, target > rise.value ? CAMERA_CLEARANCE.liftRise : CAMERA_CLEARANCE.liftFall, dt);
    const standing = (b: { id: number }): boolean => this.damage.isStanding(b.id);
    // 主砲の向き（狙いの点）は今までどおり：規則の答えの高さ（ばねを通さない。r05 までの瓦礫の山の持ち上げと同じ）のカメラから、光線の
    // 最初の建物が竜より手前なら、その奥の地面か遠い点（当たりの規則は変えない）。ばねの途中の高さを使うと、上げ下げのたびに炎の当たる所が
    // 少しずれ、描画なしの自動プレイ（紅竜）で的の選び方が途中から分かれて崩落が 70→51 棟に変わった
    const hit = castAim(this.index, o, d, this.body.groundY, dist - 4, standing);
    this.aimPoint.x = hit.point.x;
    this.aimPoint.y = hit.point.y;
    this.aimPoint.z = hit.point.z;
    // r06-camera2：照準の様子（HUD の明るさ・建物・距離）は、画面の中央に写る物で決める。光線は追うカメラと同じばねを通した高さから。
    // 竜より手前の建物は寄せたカメラの後ろか網点の中なので飛ばし、奥の最初の建物か地面を見る（体験の採点 B2「炎は中央のビルに当たるのに、
    // 照準は暗い」）。手前に建物が無ければ同じ答え。飛ばすのは照準の線の要の 4m 手前まで（見上げで寄せた距離。追うカメラが網点の対象に
    // する照準の線と同じ長さ）
    const so = this.aimSeenCam;
    so.x = o.x;
    so.y = o.y + rise.value - target;
    so.z = o.z;
    const seen = castAim(this.index, so, d, this.body.groundY, dist * lookUpScale(this.view.pitch) - 4, standing, 700, true);
    const mouth = mouthOf(this.body.pos, this.body.yaw, this.creature.body.mouthLocal);
    this.aim.building = seen.building ? seen.building.id : -1;
    this.aim.distance = Math.hypot(seen.point.x - mouth.x, seen.point.y - mouth.y, seen.point.z - mouth.z);
    this.aim.reach = (seen.building !== null || seen.ground) && breathReaches(mouth, seen.point, this.creature.moves.primary.spec.range);
  }

  private writeIntent(): void {
    const b = this.body;
    const it = this.intent;
    it.position = tuple(b.pos);
    it.velocity = tuple(b.vel);
    it.yaw = b.yaw;
    it.pitch = b.pitch;
    it.roll = b.roll;
    it.speed = b.speed;
    it.mode = b.mode;
    it.grounded = b.grounded;
    it.groundY = b.groundY;
    it.flapPhase = b.flapPhase;
    it.flapStrength = b.flapStrength;
    it.gaitPhase = b.gaitPhase;
    it.gait = b.gait;
    const m = this.combat.mouth;
    const ax = this.aimPoint.x - m.x;
    const ay = this.aimPoint.y - m.y;
    const az = this.aimPoint.z - m.z;
    it.aimYaw = yawOf(ax, az);
    it.aimPitch = Math.atan2(ay, Math.hypot(ax, az));
    const cb = this.combat;
    it.breath = {
      charge: cb.breathCharge,
      active: cb.breathActive,
      target: cb.breathActive ? [cb.breathTarget.x, cb.breathTarget.y, cb.breathTarget.z] : null,
    };
    it.claw = cb.claw.intent();
    it.tail = cb.tail.intent();
    it.roar = cb.roarIntent();
    it.jump = { phase: JUMP_PHASE[b.jump.phase], time: b.jump.time, duration: b.jump.duration };
    it.landingImpact = b.landingImpact;
  }
}
