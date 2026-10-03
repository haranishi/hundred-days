// OWNER: camera
// r05-camera：当たりと着地の重さ（純データ・three を読まない）。遊びの出来事（core/events.ts）をカメラの側で受け、
// 揺れ（向きの振れ、度）・画角の跳ね（度）・沈み込み（m）に直す。強さ＝出来事の大きさ × 竜からの距離の減り（config/camera.ts）。
// 指摘（r01・r03 の見た目の採点 TOP2/TOP1）「揺れは位置で2〜4cm と目に見えず、画角の跳ねは2°未満。足音や崩落で画面が揺れない」。
import { CAMERA_KICK as KICK, CAMERA_SHAKE as S, CAMERA_SINK as SINK } from '../config/camera';
import { KickSpring } from '../core/springs';
import type { GameEvent } from '../core/events';

/** 出来事1つぶんの手応え。deg は揺れ（視線の振れの最大、度）、kickDeg は画角の跳ねの山（度）、sinkM は沈み込みの深さ（m）。 */
export interface Impulse {
  deg: number;
  seconds: number;
  /** 縦に揺らす（着地・足音・のしかかり・怒りの大技）。そうでなければ、出来事の見える向きへ横に寄せて揺らす */
  vertical: boolean;
  /** 出来事の位置（横に寄せる向きを決める。無ければ縦） */
  pos: readonly [number, number, number] | null;
  kickDeg: number;
  sinkM: number;
  /** r06-camera2：揺れの波の周波数（Hz。1往復で2回向きを変える）。重い出来事ほど遅い */
  hz: number;
  /** r06-camera2：出来事の側へ傾く角度（度、符号なし。見える向きは呼ぶ側が掛ける）。崩落と傾きだけ */
  leanDeg: number;
}

/**
 * r06-camera2：重い出来事の揺れの速さ（Hz）と減る秒数を、出来事の大きさ size（0〜1）で決める。大きいほど遅く、長く。
 * 周波数 hzMax〜hzMin（1秒に向きを変える回数はその2倍＝4〜6回）、減り secondsMin〜secondsMax。
 */
export function heavyRate(size: number): { hz: number; seconds: number } {
  const H = S.heavy;
  const k = Math.min(1, Math.max(0, size));
  return { hz: H.hzMax + (H.hzMin - H.hzMax) * k, seconds: H.secondsMin + (H.secondsMax - H.secondsMin) * k };
}

/** 小さな出来事（足音・爪・尾・技の着弾）の揺れの周波数（r05-camera のまま：0.6°以上は hzBig、未満は hzSmall）。 */
export function lightHz(deg: number): number {
  return deg >= 0.6 ? S.hzBig : S.hzSmall;
}

/** 崩落の大きさ（0〜1）：建物の高さ ÷ sizeHeight（sizeMin〜1）。距離では弱めない（遠い崩落も、揺れは小さいが遅い） */
export function collapseSize(height: number): number {
  const C = S.collapse;
  return Math.min(1, Math.max(C.sizeMin, height / C.sizeHeight));
}

/** 揺れの強さを距離で弱める割合：1 ÷ (1 + (距離 ÷ falloffDistance)²)。 */
export function falloff(distance: number): number {
  const k = distance / S.falloffDistance;
  return 1 / (1 + k * k);
}

/** 着地の揺れ（度）：衝撃 0〜1 で minDeg〜maxDeg。 */
export function landingShakeDeg(impact: number): number {
  const L = S.landing;
  return L.minDeg + (L.maxDeg - L.minDeg) * Math.min(1, Math.max(0, impact));
}

/** 崩落の揺れ（度）：建物の高さで大きさを決め（sizeMin〜1）、竜からの距離で弱める。 */
export function collapseShakeDeg(height: number, distance: number): number {
  return S.collapse.maxDeg * collapseSize(height) * falloff(distance);
}

/** 当たった棟数で強める（爪・尾）：1棟で deg、1棟増えるごとに perExtra、上限 maxDeg。 */
export function hitShakeDeg(spec: { deg: number; perExtra: number; maxDeg: number }, count: number): number {
  return Math.min(spec.maxDeg, spec.deg + spec.perExtra * Math.max(0, count - 1));
}

const hdist = (p: readonly [number, number, number], body: { x: number; z: number }): number => Math.hypot(p[0] - body.x, p[2] - body.z);

/** 小さな出来事の手応え（速さは振れの大きさで r05-camera のまま、傾きなし） */
const light = (deg: number, seconds: number, vertical: boolean, pos: readonly [number, number, number] | null, kickDeg = 0, sinkM = 0): Impulse => ({
  deg,
  seconds,
  vertical,
  pos,
  kickDeg,
  sinkM,
  hz: lightHz(deg),
  leanDeg: 0,
});

/** 重い出来事の手応え（速さと減る秒数は大きさ size で決める） */
const heavy = (deg: number, size: number, vertical: boolean, pos: readonly [number, number, number] | null, kickDeg = 0, sinkM = 0, leanDeg = 0): Impulse => {
  const rate = heavyRate(size);
  return { deg, seconds: rate.seconds, vertical, pos, kickDeg, sinkM, hz: rate.hz, leanDeg };
};

/**
 * 出来事 → 手応え（無ければ null）。body は竜の体の中心、running は走っているか（足音の強さ）。
 * 規則：着地と近い崩落は 0.5〜1°、足音は 0.1°前後。大きな当たり（急降下の着地・のしかかり・突進で押し倒す・怒りの大技）の画角の跳ねは 3〜5°。
 * 焔角ののしかかりと突進も同じ規則。r06-camera2：重い出来事（着地・のしかかり・崩落・傾き・突進・怒りの大技）は大きさで遅く長く
 * （1秒に4〜6回向きを変え、0.6〜1秒で減る）、崩落と傾きは崩れたビルの側へ少し傾く。足音・爪・尾・技の着弾は今の細かさと減り方のまま。
 */
export function impulseFor(e: GameEvent, body: { x: number; y: number; z: number }, running: boolean): Impulse | null {
  switch (e.type) {
    case 'dragon.land': {
      if (e.slam) return heavy(S.slam.deg, 1, true, null, KICK.slamDeg, SINK.slamDepth);
      const k = Math.min(1, Math.max(0, e.impact));
      const kick = k >= KICK.landingMinImpact ? KICK.landingDeg * k : 0;
      const sink = k >= SINK.minImpact ? SINK.depth * k : 0;
      return heavy(landingShakeDeg(k), k, true, null, kick, sink);
    }
    case 'building.collapse':
    case 'building.tilt': {
      const near = falloff(hdist(e.pos, body));
      const size = collapseSize(e.height);
      let deg = S.collapse.maxDeg * size * near;
      let lean = S.lean.deg * size * near;
      if (e.type === 'building.tilt') {
        deg *= S.collapse.tiltShare;
        lean *= S.collapse.tiltShare;
      }
      const kick = e.type === 'building.collapse' && deg >= KICK.nearShakeDeg ? deg * KICK.collapsePerDeg : 0;
      return heavy(deg, size, false, e.pos, kick, 0, lean);
    }
    case 'dragon.step':
      return light(running ? S.step.runDeg : S.step.walkDeg, S.step.seconds, true, null);
    case 'dragon.claw':
      return e.hit ? light(hitShakeDeg(S.claw, e.count), S.claw.seconds, false, e.pos, KICK.clawDeg) : null;
    case 'dragon.tail':
      return e.hit ? light(hitShakeDeg(S.tail, e.count), S.tail.seconds, false, e.pos, KICK.tailDeg) : null;
    case 'charge.shove':
      return heavy(S.charge.deg, 0.8, false, e.pos, KICK.chargeDeg);
    case 'rage.release':
      return heavy(S.rage.deg, 1, true, null, KICK.rageDeg);
    case 'lava.impact':
      return light(S.lava.deg * falloff(hdist(e.pos, body)), S.lava.seconds, false, e.pos);
    case 'fissure.crack':
      return light(S.fissure.deg * falloff(hdist(e.pos, body)), S.fissure.seconds, false, e.pos);
    case 'lightning.bolt':
      return light(S.bolt.deg * falloff(hdist(e.pos, body)), S.bolt.seconds, false, e.pos);
    case 'lightning.hop':
      return e.id >= 0 ? light(S.hop.deg * falloff(hdist(e.to, body)), S.hop.seconds, false, e.to) : null;
    default:
      return null;
  }
}

/** 揺れの包絡（0〜1）：hold 秒は 1、そこから seconds で 0 へ（2乗で）。 */
export function shakeEnvelope(age: number, seconds: number, hold: number = S.hold): number {
  if (age <= hold) return 1;
  const k = 1 - (age - hold) / Math.max(1e-3, seconds - hold);
  return k > 0 ? k * k : 0;
}

/**
 * r06-camera2：崩れたビルの側への傾きの包絡（0〜1）：rise 秒で立ち上がり（なだらかに）、seconds で 0 へ（2乗で）戻る。
 */
export function leanEnvelope(age: number, seconds: number): number {
  const rise = S.lean.rise;
  if (age >= seconds) return 0;
  if (age < rise) {
    const k = age / rise;
    return k * k * (3 - 2 * k);
  }
  const k = 1 - (age - rise) / Math.max(1e-3, seconds - rise);
  return k * k;
}

interface Slot {
  on: boolean;
  amp: number;
  seconds: number;
  age: number;
  hz: number;
  /** 振れる向き（画面の右・上の単位ベクトル） */
  dx: number;
  dy: number;
  phase: number;
  /** 立ち上げの秒数（重い出来事のゆっくりの波だけ） */
  attack: number;
  /** 減り始めるまでの秒数（重い出来事は最初の山まで減らさない＝振れ幅を r05-camera のまま） */
  hold: number;
  /** 出来事の側への傾き（度、符号つき：正で画面の右） */
  lean: number;
}

/** 今の振れ（度）：上下・左右・ロールと、視線の振れの大きさ。lean は崩れたビルの側への傾き（度、正で右。yaw と roll に含まれる） */
export interface ShakeSample {
  pitch: number;
  yaw: number;
  roll: number;
  deg: number;
  lean: number;
}

/** 揺れの重なり。振れの合計は、いちばん大きい揺れ（包絡を掛けた振幅）を上限にする。傾きは揺れとは別に足し、lean.deg を上限にする。 */
export class ShakePool {
  private readonly slots: Slot[] = Array.from({ length: 10 }, () => ({ on: false, amp: 0, seconds: 0, age: 0, hz: 10, dx: 0, dy: 1, phase: 0, attack: 0, hold: S.hold, lean: 0 }));
  private count = 0;
  readonly out: ShakeSample = { pitch: 0, yaw: 0, roll: 0, deg: 0, lean: 0 };

  /**
   * 揺れを1つ足す。hz を省くと r05-camera の決め方（振れの大きさで 8Hz か 13Hz）。lean は出来事の側への傾き（度、正で画面の右）。
   * 重い出来事（hz が hzBig 未満）の波は、山から始めると1コマで画面が跳ぶので、attack 秒かけて立ち上げる。
   */
  add(deg: number, seconds: number, dx: number, dy: number, hz: number = lightHz(deg), lean = 0): void {
    if (deg < S.minDeg && Math.abs(lean) < S.minDeg) return;
    let slot = this.slots.find((s) => !s.on);
    if (!slot) {
      // 空きが無ければ、いちばん弱くなった揺れを置き換える
      slot = this.slots.reduce((a, b) => (a.amp * shakeEnvelope(a.age, a.seconds, a.hold) <= b.amp * shakeEnvelope(b.age, b.seconds, b.hold) ? a : b));
    }
    const l = Math.hypot(dx, dy) || 1;
    this.count++;
    const slow = hz < S.hzBig;
    // 速い波は山の少し手前から（r05-camera のまま）、遅い波は 0 から立ち上げて最初の山を attack の後に
    const phase = slow ? 0 : Math.PI / 2 - 2 * Math.PI * hz * 0.02;
    // 遅い波の最初の山は 1/4 周期の後。そこまで減らさない
    const hold = slow ? Math.max(S.hold, 0.25 / hz) : S.hold;
    Object.assign(slot, { on: true, amp: deg, seconds, age: 0, hz, dx: dx / l, dy: dy / l, phase: phase + (this.count % 2) * Math.PI, attack: slow ? S.heavy.attack : 0, hold, lean });
  }

  update(dt: number): ShakeSample {
    let p = 0;
    let y = 0;
    let r = 0;
    let top = 0;
    let lean = 0;
    for (const s of this.slots) {
      if (!s.on) continue;
      s.age += dt;
      const env = shakeEnvelope(s.age, s.seconds, s.hold);
      const le = s.lean !== 0 ? leanEnvelope(s.age, s.seconds) : 0;
      if (env <= 0 && le <= 0) {
        s.on = false;
        continue;
      }
      const atk = s.attack > 0 ? Math.min(1, s.age / s.attack) : 1;
      const a = s.amp * env * atk * atk * (3 - 2 * atk);
      const w = Math.sin(2 * Math.PI * s.hz * s.age + s.phase);
      p += a * w * s.dy;
      y += a * w * s.dx;
      r += a * Math.sin(2 * Math.PI * s.hz * 0.71 * s.age + s.phase + 1.3);
      top = Math.max(top, a);
      lean += s.lean * le;
    }
    const m = Math.hypot(p, y);
    if (m > top && m > 0) {
      p *= top / m;
      y *= top / m;
    }
    lean = Math.max(-S.lean.deg, Math.min(S.lean.deg, lean));
    this.out.pitch = p;
    // 傾き：その建物の見える側へ向きを回し（rotateY は正で左へ回るので符号を逆に）、同じ側へ rollShare 倍だけ傾ける
    this.out.yaw = y - lean;
    this.out.roll = Math.max(-top, Math.min(top, r)) * S.rollShare - lean * S.rollShare;
    this.out.deg = Math.min(m, top);
    this.out.lean = lean;
    return this.out;
  }

  reset(): void {
    for (const s of this.slots) s.on = false;
    this.out.pitch = this.out.yaw = this.out.roll = this.out.deg = this.out.lean = 0;
  }
}

/** 初速 1 を与えたばねの山（値の最大）。画角の跳ね・沈み込みの山を、度・m で指定するのに使う。 */
export function springPeak(hz: number, zeta: number): number {
  const s = new KickSpring(hz, zeta);
  s.kick(1);
  let peak = 0;
  for (let i = 0; i < 960; i++) peak = Math.max(peak, Math.abs(s.update(1 / 240)));
  return peak;
}

/** 減衰比 zeta のばねが、初速を与えてから peakSeconds 秒で山になる周波数（Hz）。 */
export function hzForPeak(peakSeconds: number, zeta: number): number {
  const z = Math.min(0.999, Math.max(0.01, zeta));
  const r = Math.sqrt(1 - z * z);
  return Math.atan(r / z) / (peakSeconds * r) / (2 * Math.PI);
}

/** 画角の跳ねのばね（山が度で指定どおりになるよう初速を決める。重なっても maxDeg まで）。 */
export class FovKick {
  private readonly spring = new KickSpring(KICK.hz, KICK.zeta);
  private readonly unit = springPeak(KICK.hz, KICK.zeta);
  kick(deg: number): void {
    if (deg > 0) this.spring.kick(deg / this.unit);
  }
  update(dt: number): number {
    return Math.max(-KICK.maxDeg, Math.min(KICK.maxDeg, this.spring.update(dt)));
  }
  reset(): void {
    this.spring.reset();
  }
}

/** 着地の沈み込み：約 peakSeconds 秒遅れて depth だけ下がって戻る（下向きを負で返す）。 */
export class LandingSink {
  private readonly hz = hzForPeak(SINK.peakSeconds, SINK.zeta);
  private readonly spring = new KickSpring(this.hz, SINK.zeta);
  private readonly unit = springPeak(this.hz, SINK.zeta);
  sink(depth: number): void {
    if (depth > 0) this.spring.kick(-depth / this.unit);
  }
  update(dt: number): number {
    return this.spring.update(dt);
  }
  reset(): void {
    this.spring.reset();
  }
}
