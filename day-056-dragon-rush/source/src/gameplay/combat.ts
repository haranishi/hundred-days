// OWNER: gameplay
// 攻撃の出し方と当たり。形と数値は config/attacks.ts と怪獣ごとの設定（config/creatures/ の moves）にあり、ここは入力との対応と、街の純データへの問い合わせだけを持つ。
// 当たりはすべて建物の箱（Building.masses）に問い合わせる。倒れる向きは「竜から建物へ」の向き。
// r02-controls：炎・爪・尾は、押した瞬間の照準の向きへ AIM_TURN.seconds で向き直ってから当てる（爪は照準へ、尾は背を照準へ向けて振る）。
// 技の最中に押した技は、その技の戻りを切り上げられる所まで覚えておき、必ず出す（連打の取りこぼしをなくす）。
// r03-roster：キーの役割は3体で同じで、技の中身だけを怪獣の表から引く（左クリック＝炎／雷の息／溶岩の礫、右クリック＝爪／翼／角、
// Q＝尾／尾の鞭／尾の鎚、E＝咆哮・急降下／落雷の輪／地割れ）。時間をかけて続く技（雷の跳ね・礫・裂け目）は techniques.ts が進める。
// r05-play：照準の点が口より体の側（口の真下・後ろ）にあるときは、主砲の出どころを点の手前へ引き戻す（近い的でも溜めのまま止まらない）。
// r06-balance：向きのある大技（焔角の地割れ）は、E を押した瞬間の照準の向きへ、溜めの間に体を向け直して走らせる。
// 紅竜の咆哮は、まわりで燃えている建物の炎を隣へ燃え移らせ、輪の外側の数棟に火を付ける（ROAR.fan・rim）。
// 怒りのたまり方の怪獣ごとの倍率（config/creatures の rage）を、毎刻み点数の係へ渡す（game.ts を変えずに怪獣を伝えるため）。
import { AIM_TURN, CLOSE_AIM, INPUT_BUFFER_SECONDS, type MeleeSpec, type ROAR } from '../config/attacks';
import { BREATH } from '../config/attacks';
import { CREATURE_CONFIG, type CreatureConfig, type LavaSpec, type LightningSpec } from '../config/creatures';
import type { DamageCause } from '../core/events';
import { wrapAngle } from '../core/springs';
import type { ActionIntent, ActionPhase } from '../dragon/intent';
import type { Building } from '../world/types';
import type { DragonBody } from './locomotion';
import { DEG, forwardOf, localToWorld, normalize3, tuple, vec3, yawOf, type Vec3 } from './math';
import { applyRing, type CombatWorld, type CueKind } from './ring';
import { fanTouchesBuilding, footprintCenter, footprintDistance, rayGround, rayMass, sphereTouchesBuilding } from './shapes';
import { Techniques } from './techniques';

export { applyRing, type CombatWorld, type CueKind };

export interface CombatInput {
  breathHeld: boolean;
  clawPressed: boolean;
  tailPressed: boolean;
  specialPressed: boolean;
}

/** 攻撃が体の動きへ返す指示。 */
export interface CombatSteer {
  moveScale: number;
  faceYaw: number | null;
  /** 向き直りの速さ（rad/s）。null なら体のふだんの旋回の速さ */
  faceRate: number | null;
  rageDive: boolean;
}

/** 体の向き bodyYaw から target へ、AIM_TURN.seconds で回りきる速さ（rad/s、最低 minRateDeg）。 */
export function pivotRate(bodyYaw: number, target: number): number {
  return Math.max(AIM_TURN.minRateDeg * DEG, Math.abs(wrapAngle(target - bodyYaw)) / AIM_TURN.seconds);
}

/**
 * 主砲の出どころの、体の前への距離（m、体の局所の z。r05-play、config/attacks.ts の CLOSE_AIM）。ふだんは口の local[2]。
 * 照準の点が体の前後の線に沿って口より lead m 先に無いときは、点の lead m 手前まで体の側へ引き戻す（体の中心より後ろへは引かない）。
 */
function muzzleForward(body: Vec3, yaw: number, local: readonly [number, number, number], aim: Vec3): number {
  const f = forwardOf(yaw);
  const along = (aim.x - body.x) * f.x + (aim.z - body.z) * f.z;
  return along - CLOSE_AIM.lead >= local[2] ? local[2] : Math.max(0, along - CLOSE_AIM.lead);
}

/**
 * 芯の線（口 m から向き d）が、当たった建物 hits のどれかの塊か地面に入る距離（m）。どれにも入らなければ null。
 * 近い的（出どころを引き戻したとき）は、芯の玉が先に壁をかすめるので、玉の中心でなく、この線の当たる点を当たった点にする（r05-play）。
 */
function coreEntry(m: Vec3, d: Vec3, hits: Building[], groundY: number): number | null {
  let best: number | null = null;
  for (const b of hits) {
    for (const mass of b.masses) {
      const t = rayMass(mass, m, d, BREATH.range);
      if (t >= 0 && (best === null || t < best)) best = t;
    }
  }
  const g = rayGround(m, d, groundY, BREATH.range);
  if (g >= 0 && (best === null || g < best)) best = g;
  return best;
}

const standing = (w: CombatWorld) => (b: Building): boolean => w.damage.isStanding(b.id);

/**
 * 咆哮の炎（r06-balance、config/attacks.ts の ROAR.fan・rim）：(x, z) から fan.radius m 以内で燃えている建物から、燃え移り先の隣へ fan.heat の熱を
 * 一度に送り（燃え移った隣は fire.spread の出来事になる）、外形まで rim.from〜rim.to m の立っている建物のうち近い rim.count 棟に火を付ける。
 * id の順に回すので、1倍と4倍で同じ結果になる。
 */
function roarFire(x: number, z: number, spec: typeof ROAR, w: CombatWorld): void {
  const fire = w.fire;
  const { fan, rim } = spec;
  const burning = [...fire.burning].sort((a, b) => a - b);
  for (const id of burning) {
    const b = w.city.buildings[id];
    if (!w.damage.isStanding(id) || footprintDistance(b, x, z) > fan.radius) continue;
    const y = (fire.fireLow[id] + fire.fireHigh[id]) / 2;
    for (const n of fire.neighborsOf(id)) fire.addHeat(n.id, fan.heat, Math.min(y, w.city.buildings[n.id].height * 0.6), w.damage, w.ignitions, id);
  }
  const ring = w.index
    .buildingsNear(x, z, rim.to)
    .map((b) => ({ b, d: footprintDistance(b, x, z) }))
    .filter(({ b, d }) => d >= rim.from && d <= rim.to && w.damage.isStanding(b.id) && !fire.burning.has(b.id))
    .sort((p, q) => p.d - q.d || p.b.id - q.b.id)
    .slice(0, rim.count);
  for (const { b } of ring) fire.addHeat(b.id, rim.heat, b.height * 0.5, w.damage, w.ignitions);
}

class Melee {
  phase: ActionPhase = 'none';
  time = 0;
  /** 振る向き（扇の中心の yaw） */
  yaw = 0;
  /** 向き直りの速さ（rad/s） */
  turnRate = 0;

  constructor(public spec: MeleeSpec) {}

  get busy(): boolean {
    return this.phase !== 'none';
  }

  /** 戻りに入って cancelAfter を過ぎた：次の技で切り上げられる */
  get cancelable(): boolean {
    return this.phase === 'recovery' && this.time >= this.spec.cancelAfter;
  }

  get duration(): number {
    return this.phase === 'windup' ? this.spec.windup : this.phase === 'active' ? this.spec.active : this.phase === 'recovery' ? this.spec.recovery : 0;
  }

  start(yaw: number, turnRate: number): void {
    this.phase = 'windup';
    this.time = 0;
    this.yaw = yaw;
    this.turnRate = turnRate;
  }

  /** 段階を進める。当たりの段階に入った刻みで true。 */
  advance(dt: number): boolean {
    if (this.phase === 'none') return false;
    this.time += dt;
    if (this.time < this.duration) return false;
    this.time -= this.duration;
    this.phase = this.phase === 'windup' ? 'active' : this.phase === 'active' ? 'recovery' : 'none';
    if (this.phase === 'none') this.time = 0;
    return this.phase === 'active';
  }

  intent(): ActionIntent {
    return { phase: this.phase, time: this.time, duration: this.duration };
  }

  reset(): void {
    this.phase = 'none';
    this.time = 0;
  }
}

/** 炎が建物に当たり続けている間、照準の印を光らせ直す間隔（秒） */
const BREATH_CUE_SECONDS = 0.3;
/** 吐いている間に照準がこの角度（度）より大きく跳んだら、もう一度速く向き直る */
const BREATH_RETURN_DEG = 25;

export class Combat {
  readonly claw: Melee;
  readonly tail: Melee;
  /** 時間をかけて続く技（雷の跳ね・落雷・溶岩の礫・地割れ） */
  readonly techniques = new Techniques();
  creature: CreatureConfig;
  roarPhase: ActionPhase = 'none';
  roarTime = 0;
  /** r06-balance：地上の大技を押した瞬間の照準の向き（地割れが走る向き）と、そこへ向き直る速さ（rad/s） */
  specialYaw = 0;
  private specialTurnRate = 0;
  breathCharge = 0;
  breathActive = false;
  /** 炎の当たっている点（無ければ null）と、炎の向き */
  readonly breathTarget = vec3();
  breathHasTarget = false;
  readonly breathDir = vec3(0, 0, 1);
  readonly mouth = vec3();
  /** 先行入力：押してからの残り秒数（0 で無し）。技の最中（切り上げられるまで）は減らさない */
  private readonly buffered = { claw: 0, tail: 0, special: 0 };
  /** 吐き始めの向き直り：向きの目標と速さ（0 でふだんの旋回） */
  private breathTurnTarget = 0;
  private breathTurnRate = 0;
  private breathCueTimer = 0;
  private breathWasHitting = false;
  /** 雷の息・溶岩の礫：次の1発までの秒数 */
  private shotTimer = 0;

  constructor(creature: CreatureConfig = CREATURE_CONFIG.kurenai) {
    this.creature = creature;
    this.claw = new Melee(creature.moves.near);
    this.tail = new Melee(creature.moves.sweep);
  }

  /** 怪獣を替える（技の表を差し替えて最初に戻す）。 */
  setCreature(creature: CreatureConfig): void {
    this.creature = creature;
    this.claw.spec = creature.moves.near;
    this.tail.spec = creature.moves.sweep;
    this.reset();
  }

  reset(): void {
    this.buffered.claw = this.buffered.tail = this.buffered.special = 0;
    this.claw.reset();
    this.tail.reset();
    this.techniques.reset();
    this.roarPhase = 'none';
    this.roarTime = 0;
    this.specialYaw = 0;
    this.specialTurnRate = 0;
    this.breathCharge = 0;
    this.breathActive = false;
    this.breathHasTarget = false;
    this.breathTurnRate = 0;
    this.breathCueTimer = 0;
    this.breathWasHitting = false;
    this.shotTimer = 0;
  }

  get meleeBusy(): boolean {
    return this.claw.busy || this.tail.busy || this.roarPhase !== 'none';
  }

  /** 次の技を出せる：技の最中でないか、爪・尾の戻りを切り上げられる所まで来ている。咆哮は切り上げない */
  private get free(): boolean {
    if (this.roarPhase !== 'none') return false;
    return (!this.claw.busy || this.claw.cancelable) && (!this.tail.busy || this.tail.cancelable);
  }

  /** 切り上げられる戻りを終わらせる（次の技を出す直前に呼ぶ）。 */
  private cutRecovery(): void {
    if (this.claw.cancelable) this.claw.reset();
    if (this.tail.cancelable) this.tail.reset();
  }

  /** 地上の大技の溜めと戻りの秒数（咆哮・落雷の輪・地割れ）。 */
  private specialTiming(): { windup: number; recovery: number } {
    const s = this.creature.moves.special.ground;
    if (s.kind === 'roar') return { windup: s.spec.windup, recovery: s.spec.recovery };
    if (s.kind === 'thunderRoar') return { windup: s.windup, recovery: s.recovery };
    return { windup: s.spec.windup, recovery: s.spec.recovery };
  }

  roarIntent(): ActionIntent {
    const T = this.specialTiming();
    const duration = this.roarPhase === 'windup' ? T.windup : this.roarPhase === 'active' ? 0.1 : this.roarPhase === 'recovery' ? T.recovery : 0;
    return { phase: this.roarPhase, time: this.roarTime, duration };
  }

  /**
   * 1刻み進める。aim は狙いの点（画面の中央の先）。
   * 戻り値は体の動きへの指示（攻撃中の減速・向き・向き直りの速さ・怒りの急降下）。
   */
  update(dt: number, t: number, input: CombatInput, body: DragonBody, aim: Vec3, w: CombatWorld): CombatSteer {
    const steer: CombatSteer = { moveScale: 1, faceYaw: null, faceRate: null, rageDive: false };
    w.score.rageScale = this.creature.rage.gainScale;
    this.techniques.update(dt, t, w);
    const diving = body.mode === 'dive';
    // 跳んでいる間（屈むところから）も技を始めない（押した技は先行入力に残り、着地して出る）
    const locked = diving || body.mode === 'jump' || body.jump.phase !== 'none';
    const buf = this.buffered;
    const blocked = !this.free;
    const decay = (v: number): number => (blocked ? v : Math.max(0, v - dt));
    buf.claw = input.clawPressed ? INPUT_BUFFER_SECONDS : decay(buf.claw);
    buf.tail = input.tailPressed ? INPUT_BUFFER_SECONDS : decay(buf.tail);
    buf.special = input.specialPressed ? INPUT_BUFFER_SECONDS : decay(buf.special);
    if (input.specialPressed && !w.score.rageFull) {
      buf.special = 0;
      w.cue('noRage');
    }
    // 照準の向き（体の中心から狙いの点へ、水平）
    const toAim = yawOf(aim.x - body.pos.x, aim.z - body.pos.z);
    const special = this.creature.moves.special;

    if (!blocked && !locked) {
      if (buf.special > 0 && w.score.rageFull && (body.grounded || special.air !== null)) {
        buf.special = 0;
        w.score.spendRage();
        this.stopBreath(t, w);
        this.cutRecovery();
        if (body.grounded) {
          this.roarPhase = 'windup';
          this.roarTime = 0;
          this.specialYaw = toAim;
          this.specialTurnRate = pivotRate(body.yaw, toAim);
          w.bus.emit('rage.release', { t, kind: special.ground.kind === 'fissure' ? 'fissure' : 'roar', value: 100 });
        } else {
          steer.rageDive = true;
          w.bus.emit('rage.release', { t, kind: 'dive', value: 100 });
        }
      } else if (buf.claw > 0) {
        buf.claw = 0;
        this.stopBreath(t, w);
        this.cutRecovery();
        // 爪は照準の向きへ振る。体も同じ向きへ、振りかぶりより短い時間で向き直る
        this.claw.start(toAim, pivotRate(body.yaw, toAim));
      } else if (buf.tail > 0) {
        buf.tail = 0;
        this.stopBreath(t, w);
        this.cutRecovery();
        // 尾は背の側を払う：扇の中心を照準へ向け、体は照準に背を向ける
        this.tail.start(toAim, pivotRate(body.yaw, wrapAngle(toAim + Math.PI)));
      }
    }
    for (const m of [this.claw, this.tail]) {
      if (!m.busy) continue;
      steer.moveScale = Math.min(steer.moveScale, m.spec.moveScale);
      steer.faceYaw = m === this.claw ? m.yaw : wrapAngle(m.yaw + Math.PI);
      steer.faceRate = m.turnRate;
      if (m.advance(dt)) this.strike(m, t, body, w);
    }
    this.updateRoar(dt, t, body, w, steer);
    const breathing = input.breathHeld && this.free && !locked;
    if (breathing) this.cutRecovery();
    this.updateBreath(dt, t, breathing, body, aim, toAim, w, steer);
    return steer;
  }

  private strike(m: Melee, t: number, body: DragonBody, w: CombatWorld): void {
    const s = m.spec;
    const near = m === this.claw;
    const f = forwardOf(m.yaw);
    const half = s.halfAngleDeg * DEG;
    const yLo = body.pos.y - s.below;
    const yHi = body.pos.y + s.above;
    let count = 0;
    const candidates = w.index.buildingsNear(body.pos.x, body.pos.z, s.range).sort((p, q) => p.id - q.id);
    for (const b of candidates) {
      if (!w.damage.isStanding(b.id)) continue;
      if (b.height < yLo || b.masses[0].y0 > yHi) continue;
      if (!fanTouchesBuilding(b, body.pos.x, body.pos.z, f.x, f.z, s.range, half)) continue;
      const cause: DamageCause = near ? 'claw' : 'tail';
      w.damage.hit(b.id, s.damage, { cause, fromX: body.pos.x, fromZ: body.pos.z, y: Math.min(b.height - 1, Math.max(yLo, body.pos.y)), player: true });
      const panes = w.damage.breakGlass(b.id, Math.min(1, w.damage.glass[b.id] + s.glass));
      if (panes > 0) {
        const c = footprintCenter(b);
        w.bus.emit('glass.shatter', { t, id: b.id, pos: [c.x, Math.min(b.height, body.pos.y), c.z], count: panes });
      }
      count++;
    }
    const at = localToWorld(body.pos, m.yaw, 0, 0, s.range * 0.6);
    const payload = { t, pos: tuple(at), hit: count > 0, count };
    if (near) w.bus.emit('dragon.claw', payload);
    else w.bus.emit('dragon.tail', payload);
    w.impact(count > 0 ? s.hitStop : null, count > 0 ? s.shake : s.shake * 0.35);
    w.cue(count > 0 ? 'hit' : 'miss');
  }

  private updateRoar(dt: number, t: number, body: DragonBody, w: CombatWorld, steer: CombatSteer): void {
    if (this.roarPhase === 'none') return;
    const T = this.specialTiming();
    steer.moveScale = 0;
    // 地割れは照準の向きへ走るので、溜めの間に体もその向きへ向き直る（爪と同じ速さ。咆哮・落雷の輪は体のまわりなので向きを変えない）
    if (this.roarPhase === 'windup' && this.creature.moves.special.ground.kind === 'fissure') {
      steer.faceYaw = this.specialYaw;
      steer.faceRate = this.specialTurnRate;
    }
    this.roarTime += dt;
    if (this.roarPhase === 'windup' && this.roarTime >= T.windup) {
      this.roarPhase = 'active';
      this.roarTime = 0;
      this.releaseSpecial(t, body, w);
    } else if (this.roarPhase === 'active' && this.roarTime >= 0.1) {
      this.roarPhase = 'recovery';
      this.roarTime = 0;
    } else if (this.roarPhase === 'recovery' && this.roarTime >= T.recovery) {
      this.roarPhase = 'none';
      this.roarTime = 0;
    }
  }

  /** 地上の大技の当たりの瞬間：咆哮の輪（紅竜）・咆哮と落雷の輪（雷翼）・地割れ（焔角）。 */
  private releaseSpecial(t: number, body: DragonBody, w: CombatWorld): void {
    const s = this.creature.moves.special.ground;
    const dir = forwardOf(body.yaw);
    if (s.kind === 'fissure') {
      this.techniques.fissure(t, vec3(body.pos.x, body.groundY, body.pos.z), this.specialYaw, s.spec, w, this.creature.id);
      w.impact(null, 0.55);
      return;
    }
    w.bus.emit('dragon.roar', { t, pos: tuple(body.pos), dir: tuple(dir) });
    if (s.kind === 'roar') {
      if (applyRing(w, t, body.pos.x, body.pos.z, s.spec.ring, 'roar') > 0) w.cue('hit');
      roarFire(body.pos.x, body.pos.z, s.spec, w);
      w.impact(s.spec.ring.hitStop, s.spec.ring.shake);
      return;
    }
    this.techniques.thunderRing(t, body.pos.x, body.pos.z, body.groundY, s.thunder, 'roar', this.creature.id);
    w.impact(null, 0.5);
  }

  private stopBreath(t: number, w: CombatWorld): void {
    if (!this.breathActive) return;
    this.breathActive = false;
    // 溶岩の礫は1発ずつの出来事（lava.launch）なので、吐き始め・終わりの出来事は出さない
    if (this.creature.moves.primary.kind !== 'lava') w.bus.emit('dragon.breath.stop', { t, pos: tuple(this.mouth), dir: tuple(this.breathDir) });
  }

  private updateBreath(dt: number, t: number, held: boolean, body: DragonBody, aim: Vec3, toAim: number, w: CombatWorld, steer: CombatSteer): void {
    const P = this.creature.moves.primary;
    const spec = P.spec;
    // r05-play：照準の点が口より体の側にあるときは、出どころを点の手前へ引き戻す（近い的でも首の振れる範囲に入り、口の前から点へ当たる）。
    // 遠い的では z が口の local[2] のままで、前と同じ口の位置になる
    const local = this.creature.body.mouthLocal;
    const z = muzzleForward(body.pos, body.yaw, local, aim);
    const close = z < local[2];
    const m = localToWorld(body.pos, body.yaw, local[0], local[1], z);
    this.mouth.x = m.x;
    this.mouth.y = m.y;
    this.mouth.z = m.z;
    if (!held) {
      this.stopBreath(t, w);
      this.breathCharge = Math.max(0, this.breathCharge - dt / spec.windup);
      this.breathHasTarget = false;
      this.breathTurnRate = 0;
      this.breathWasHitting = false;
      return;
    }
    steer.moveScale = Math.min(steer.moveScale, spec.moveScale);
    // 体を照準へ向け続ける。吐き始めと、照準が大きく跳んだときだけ、AIM_TURN の速さで回る
    if (this.breathTurnRate === 0 && this.breathCharge === 0) this.breathTurnRate = pivotRate(body.yaw, toAim);
    else if (Math.abs(wrapAngle(toAim - this.breathTurnTarget)) > BREATH_RETURN_DEG * DEG) this.breathTurnRate = pivotRate(body.yaw, toAim);
    this.breathTurnTarget = toAim;
    if (Math.abs(wrapAngle(toAim - body.yaw)) < 2 * DEG) this.breathTurnRate = 0;
    steer.faceYaw = toAim;
    steer.faceRate = this.breathTurnRate > 0 ? this.breathTurnRate : null;

    const d = vec3(aim.x - m.x, aim.y - m.y, aim.z - m.z);
    normalize3(d);
    this.breathDir.x = d.x;
    this.breathDir.y = d.y;
    this.breathDir.z = d.z;
    if (this.breathCharge < 1) {
      this.breathCharge = Math.min(1, this.breathCharge + dt / spec.windup);
      if (this.breathCharge < 1) return;
    }
    // 首の振れる範囲に照準が入るまで（向き直りの途中）は、炎を出さない
    if (!this.breathActive && Math.abs(wrapAngle(yawOf(d.x, d.z) - body.yaw)) > spec.neckYawLimitDeg * DEG) return;
    if (!this.breathActive) {
      this.breathActive = true;
      this.shotTimer = 0;
      if (P.kind !== 'lava') w.bus.emit('dragon.breath.start', { t, pos: tuple(m), dir: tuple(d) });
    }
    if (P.kind === 'lightning') return this.shootLightning(dt, t, m, d, body, P.spec, w);
    if (P.kind === 'lava') return this.throwLava(dt, t, m, aim, P.spec, w);
    const hitBuilding = this.burn(dt, t, m, d, body, w, close);
    this.breathHasTarget = hitBuilding !== null;
    this.breathCueTimer -= dt;
    if (hitBuilding === 'building' && (!this.breathWasHitting || this.breathCueTimer <= 0)) {
      w.cue('hit');
      this.breathCueTimer = BREATH_CUE_SECONDS;
    }
    this.breathWasHitting = hitBuilding === 'building';
  }

  /** 雷の息：吐いている間、interval 秒ごとに1発（吐き始めにすぐ1発）。当たった点を breathTarget に入れる。 */
  private shootLightning(dt: number, t: number, m: Vec3, d: Vec3, body: DragonBody, spec: LightningSpec, w: CombatWorld): void {
    this.shotTimer -= dt;
    if (this.shotTimer > 0) return;
    this.shotTimer += spec.interval;
    if (this.shotTimer <= 0) this.shotTimer = spec.interval;
    const hit = this.techniques.fireLightning(t, m, d, body.groundY, spec, body.pos, w, this.creature.id);
    this.breathHasTarget = hit === 'building';
    this.breathTarget.x = m.x + d.x * spec.range;
    this.breathTarget.y = m.y + d.y * spec.range;
    this.breathTarget.z = m.z + d.z * spec.range;
  }

  /** 溶岩の礫：吐いている間、interval 秒ごとに照準の点へ1つ投げる（吐き始めにすぐ1つ）。 */
  private throwLava(dt: number, t: number, m: Vec3, aim: Vec3, spec: LavaSpec, w: CombatWorld): void {
    this.breathTarget.x = aim.x;
    this.breathTarget.y = aim.y;
    this.breathTarget.z = aim.z;
    this.breathHasTarget = true;
    this.shotTimer -= dt;
    if (this.shotTimer > 0) return;
    this.shotTimer += spec.interval;
    if (this.shotTimer <= 0) this.shotTimer = spec.interval;
    this.techniques.launchLava(t, m, aim, spec, w, this.creature.id);
  }

  /**
   * 口から照準へ芯を進め、芯に最初に当たった建物（か地面）を燃やす。当たった点を breathTarget に入れる。
   * 燃え移りの熱は、当たった点のまわり（splashRadius）へ配る。何に当たったかを返す（届かなければ null）。
   * close（r05-play：出どころを引き戻した近い的）のときは、芯の線が当たった建物か地面に入る点を当たった点にする。
   * 近い的では芯が壁に沿って急に上下するので、玉の中心のままだと照準の点より 5〜9m 手前の壁を当たった点にしていた
   */
  private burn(dt: number, t: number, m: Vec3, d: Vec3, body: DragonBody, w: CombatWorld, close = false): 'building' | 'ground' | null {
    const isStanding = standing(w);
    for (let s = 6; s <= BREATH.range; s += 4) {
      let px = m.x + d.x * s;
      let py = m.y + d.y * s;
      let pz = m.z + d.z * s;
      const r = BREATH.coreRadius + BREATH.coreSpread * s;
      const hitGround = py <= body.groundY + 0.5;
      const hits = hitGround ? [] : w.index.buildingsNear(px, pz, r).filter((b) => isStanding(b) && sphereTouchesBuilding(b, px, py, pz, r));
      if (hits.length === 0 && !hitGround) continue;
      hits.sort((p, q) => p.id - q.id);
      const entry = close ? coreEntry(m, d, hits, body.groundY) : null;
      if (entry !== null) {
        px = m.x + d.x * entry;
        py = Math.max(body.groundY, m.y + d.y * entry);
        pz = m.z + d.z * entry;
      }
      for (const b of hits) {
        w.damage.hit(b.id, BREATH.damagePerSecond * dt, { cause: 'breath', fromX: body.pos.x, fromZ: body.pos.z, y: py, player: true });
        w.fire.addHeat(b.id, BREATH.heatPerSecond * dt, py, w.damage, w.ignitions);
        const panes = w.damage.breakGlass(b.id, Math.min(1, w.damage.glass[b.id] + BREATH.glass * dt));
        if (panes > 0) w.bus.emit('glass.shatter', { t, id: b.id, pos: [px, py, pz], count: panes });
      }
      const gy = hitGround ? body.groundY : py;
      for (const b of w.index.buildingsNear(px, pz, BREATH.splashRadius)) {
        if (!isStanding(b) || hits.includes(b)) continue;
        w.fire.addHeat(b.id, BREATH.splashHeat * dt, gy + 3, w.damage, w.ignitions);
      }
      this.breathTarget.x = px;
      this.breathTarget.y = gy;
      this.breathTarget.z = pz;
      return hits.length > 0 ? 'building' : 'ground';
    }
    this.breathTarget.x = m.x + d.x * BREATH.range;
    this.breathTarget.y = m.y + d.y * BREATH.range;
    this.breathTarget.z = m.z + d.z * BREATH.range;
    return null;
  }
}
