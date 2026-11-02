// OWNER: chars-art
// 足運び。接地している足は世界の座標に固定し（だから滑らない）、振り出す足は「着地の時に体がいる所」の先へ運ぶ。
// 歩調の位相は時間ではなく進んだ距離で進める（速さが変わっても、接地足が体に対して決まった幅だけ後ろへ流れる）。
//   ・歩き出し：片足が地面、もう片足が振り出しの途中で横に並ぶ「すれ違い位相」から始める
//   ・止まる：振り出しの途中の足は時間で振り切り、着地点を体の真横へ寄せる。その後ずれた足は一歩で直す
//   ・その場で向きを変える：足が体の向きからずれたら、一歩ずつ踏み直す
// かかとから着いて（かかとを支点に）、足裏で立ち、つま先で蹴る（つま先を支点に）ので、支点は常に地面に止まっている。
import { GAIT } from '../config';
import { clamp01, ease, lerp, smoothstep, TAU } from '../util/math';
import { wrapAngle } from '../util/springs';

export interface GaitParams {
  /** 歩調（歩/秒）と歩幅（m/歩）。 */
  cadence: number;
  step: number;
  /** 1周期のうち足が着いている割合。 */
  duty: number;
  /** 振り出す足の高さ（m）。 */
  lift: number;
  /** 走りの混ざり具合 0→1。 */
  run: number;
  /** 着地点の、接地の範囲の中での前寄り（0.5 で真ん中）。 */
  land: number;
  heelStrike: number;
  toeOff: number;
}

export function gaitParams(speed: number, crouch: number, cadenceMul: number, out: GaitParams): GaitParams {
  const v = Math.max(0, speed);
  const run = smoothstep(GAIT.runBlend[0], GAIT.runBlend[1], v) * (1 - crouch);
  // r01-chars-周1: 指摘「5.2 m/s でも走りの形にならず、大股の歩きになる」 run を書き込んでいなかった（常に 0）→ 書き込む
  out.run = run;
  const fast = clamp01((v - 1.0) / 1.8);
  const cw = GAIT.walkCadence[0] + GAIT.walkCadence[1] * v;
  const cr = GAIT.runCadence[0] + GAIT.runCadence[1] * v;
  const cc = GAIT.crouchCadence[0] + GAIT.crouchCadence[1] * v;
  const stand = lerp(cw, cr, run);
  out.cadence = Math.max(0.8, lerp(stand, cc, crouch) * cadenceMul);
  out.step = Math.max(0.05, v / out.cadence);
  const dWalk = lerp(GAIT.walkDuty[0], GAIT.walkDuty[1], fast);
  out.duty = lerp(lerp(dWalk, GAIT.runDuty, run), GAIT.crouchDuty, crouch);
  const lWalk = lerp(GAIT.walkLift[0], GAIT.walkLift[1], fast);
  out.lift = lerp(lerp(lWalk, GAIT.runLift, run), GAIT.crouchLift, crouch);
  out.land = lerp(0.5, 0.3, run);
  out.heelStrike = GAIT.heelStrikeDeg * (1 - 0.6 * run) * (1 - 0.4 * crouch);
  out.toeOff = lerp(GAIT.toeOffDeg[0], GAIT.toeOffDeg[1], run) * (1 - 0.3 * crouch);
  return out;
}

export class Foot {
  planted = true;
  /** 足の裏の基準点（足首の真下）の世界の位置と、足の向き（Object3D.rotation.y と同じ測り方）。 */
  x = 0;
  z = 0;
  rotY = 0;
  // 振り出し
  lx = 0;
  lz = 0;
  lRotY = 0;
  lH = 0;
  lPitch = 0;
  prog = 0;
  len = 0.5;
  settle = false;
  /** 着地点（毎コマ、体の動きから予想し直す）。 */
  tx = 0;
  tz = 0;
  tRotY = 0;
  /** いまの持ち上がり（m）と、つま先の上がり（度。正でつま先が上＝かかとが支点、負でかかとが上＝つま先が支点）。 */
  height = 0;
  pitch = 0;
  pitchTarget = 0;
  pitchVel = 0;
  /** 接地を始めた時の位相（巻き戻さない通しの値）。接地の進み具合はここから測る。 */
  stance0 = 0;
}

/** 体から見た、足の休みの位置（横・前、m）と、つま先の開き（度）。 */
export interface RestFeet {
  latL: number;
  latR: number;
  fwdL: number;
  fwdR: number;
  outDeg: number;
}

export interface GaitInput {
  x: number;
  z: number;
  /** 体の見た目の向き（rotation.y）。 */
  rotY: number;
  /** 速度の向き（世界、なめらかにした単位ベクトル）と速さ。 */
  dirX: number;
  dirZ: number;
  speed: number;
  /** このコマに動いた距離（m）。 */
  disp: number;
}

const FOOT_OFF = [0, 0.5];

export class Gait {
  phase = 0;
  readonly feet = [new Foot(), new Foot()];
  moving = false;
  /** 止まってから足を直すまでの待ち（秒）。 */
  settleWait = 0;
  readonly params: GaitParams = { cadence: 2, step: 0.6, duty: 0.6, lift: 0.07, run: 0, land: 0.5, heelStrike: 12, toeOff: 24 };
  private lastCycleRate = 1.2;

  /** 体の真下に両足を置き直す（最初のコマと、瞬間移動の後）。 */
  reset(inp: GaitInput, rest: RestFeet): void {
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      this.restWorld(i, inp.x, inp.z, inp.rotY, rest, f);
      f.x = f.tx;
      f.z = f.tz;
      f.rotY = f.tRotY;
      f.planted = true;
      f.settle = false;
      f.height = 0;
      f.pitch = 0;
      f.pitchTarget = 0;
      f.pitchVel = 0;
    }
    this.moving = false;
    this.phase = 0;
    this.settleWait = 0;
  }

  /** i の足の休みの位置（世界）を f.tx・f.tz・f.tRotY に入れる。 */
  private restWorld(i: number, x: number, z: number, rotY: number, rest: RestFeet, f: Foot, ox = 0, oz = 0): void {
    const lat = i === 0 ? rest.latL : -rest.latR;
    const fwd = i === 0 ? rest.fwdL : rest.fwdR;
    const s = Math.sin(rotY);
    const c = Math.cos(rotY);
    // 体の前 F=(sin, cos)、体の左 L=(cos, -sin)
    f.tx = x + lat * c + fwd * s + ox;
    f.tz = z - lat * s + fwd * c + oz;
    f.tRotY = rotY + (i === 0 ? 1 : -1) * rest.outDeg * (Math.PI / 180);
  }

  /** 振り出しを始める。prog0 は、このコマの位相の進みのうち離地の点を過ぎた分（振り出しの進みとして先に数える）。 */
  private startSwing(f: Foot, len: number, settle: boolean, prog0 = 0): void {
    f.planted = false;
    f.settle = settle;
    f.lx = f.x;
    f.lz = f.z;
    f.lRotY = f.rotY;
    f.lH = f.height;
    f.lPitch = f.pitch;
    f.len = Math.max(0.05, len);
    f.prog = Math.max(0, prog0);
    this.swingStartedNow = true;
  }

  /** このコマに振り出しを始めた（その足の進みは startSwing で数え済み）。 */
  private swingStartedNow = false;

  update(dt: number, inp: GaitInput, crouch: number, cadenceMul: number, rest: RestFeet): void {
    const P = gaitParams(inp.speed, crouch, cadenceMul, this.params);
    const cycleLen = 2 * P.step;
    const wasMoving = this.moving;
    this.moving = this.moving ? inp.speed > GAIT.stopSpeed * 0.7 : inp.speed > GAIT.stopSpeed * 1.2;
    const moveF = smoothstep(0.1, 0.55, inp.speed);

    // 歩き出し：後ろにある足から振り出す。もう片方の足は接地の真ん中、振り出す足は振り出しの途中（すれ違い位相）
    if (this.moving && !wasMoving) {
      let lead = 1;
      const rel = (k: number) => (this.feet[k].x - inp.x) * inp.dirX + (this.feet[k].z - inp.z) * inp.dirZ;
      if (!this.feet[0].planted && this.feet[0].settle) lead = 0;
      else if (!this.feet[1].planted && this.feet[1].settle) lead = 1;
      else lead = rel(0) < rel(1) - 0.02 ? 0 : 1;
      const pLead = P.duty / 2 + 0.5;
      this.phase = pLead - FOOT_OFF[lead];
      const f = this.feet[lead];
      this.startSwing(f, 1 - pLead, false);
      const o = this.feet[1 - lead];
      if (!o.planted) {
        // 足を直している途中で歩き出したら、その場へ下ろす
        o.planted = true;
        o.settle = false;
      }
      o.stance0 = this.phase - P.duty / 2;
    }

    let dPhase = 0;
    if (this.moving) {
      dPhase = inp.disp / cycleLen;
      this.lastCycleRate = Math.max(1.0, P.cadence / 2);
    } else if (this.feet.some((f) => !f.planted && !f.settle)) {
      // 止まった時に振り出しの途中だった足は、時間で振り切る
      dPhase = dt * this.lastCycleRate;
    }
    const prevPhase = this.phase;
    this.phase += dPhase;

    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      const pPrev = fracp(prevPhase + FOOT_OFF[i]);
      const p = fracp(this.phase + FOOT_OFF[i]);
      this.swingStartedNow = false;
      if (f.planted) {
        // 離地：接地の割合を過ぎたら振り出す（歩いている間だけ）。過ぎた分は振り出しの進みとして数える
        // r02-chars-周2: 指摘「振り出したコマの位相の進みを二重に数え、1コマ早く着地して、着地直後をつま先の蹴りと取り違える」
        const crossed = dPhase > 0 && this.moving && ((pPrev < P.duty && p >= P.duty) || (p < pPrev && pPrev < P.duty));
        if (crossed) {
          const len = 1 - P.duty;
          this.startSwing(f, len, false, (fracp(p - P.duty + 1) % 1) / len);
        }
      }
      if (f.planted) {
        // 接地中の足の傾き：着いた直後はかかとで転がり、離れる前はつま先で蹴る（接地を始めた位相から測る）
        if (this.moving) {
          const s = clamp01((this.phase - f.stance0) / Math.max(0.05, P.duty));
          if (s < GAIT.heelRock) f.pitchTarget = P.heelStrike * (1 - ease(s / GAIT.heelRock));
          else if (s > 1 - GAIT.toeRock) f.pitchTarget = -P.toeOff * ease((s - (1 - GAIT.toeRock)) / GAIT.toeRock);
          else f.pitchTarget = 0;
        } else f.pitchTarget = 0;
        f.height = 0;
        continue;
      }
      // 振り出し中（このコマに振り出しを始めた足は、進みを数え済み）
      if (f.settle) f.prog += dt / GAIT.settleTime;
      else if (!this.swingStartedNow) f.prog += dPhase / f.len;
      const u = clamp01(f.prog);
      if (f.settle) {
        this.restWorld(i, inp.x, inp.z, inp.rotY, rest, f);
      } else {
        // 着地の時に体がいる所（速度の向きに残りの距離だけ先）の、歩幅の前寄りの点へ
        const remain = (1 - u) * f.len * cycleLen * (this.moving ? 1 : 0);
        const ahead = P.step * 2 * P.duty * P.land * moveF;
        this.restWorld(i, inp.x, inp.z, inp.rotY, rest, f, inp.dirX * (remain + ahead), inp.dirZ * (remain + ahead));
      }
      const run = this.params.run;
      const eh = f.settle ? ease(u) : lerp(swingEase(u), smoothstep(0.04, 0.92, u), run);
      f.x = lerp(f.lx, f.tx, eh);
      f.z = lerp(f.lz, f.tz, eh);
      f.rotY = f.lRotY + wrapAngle(f.tRotY - f.lRotY) * eh;
      const H = f.settle ? GAIT.settleLift : P.lift;
      const hc = f.settle ? Math.sin(Math.PI * u) : lerp(walkLiftCurve(u), runLiftCurve(u), run);
      f.height = H * hc + f.lH * (1 - u);
      f.pitchTarget = f.settle ? 0 : lerp(f.lPitch, -P.toeOff * 0.4, smoothstep(0, 0.25, u)) * (1 - smoothstep(0.2, 0.55, u)) + P.heelStrike * smoothstep(0.55, 0.95, u);
      if (f.prog >= 1) {
        // 着地：行き過ぎた分だけ、接地の始まりを前へずらす
        const over = f.settle ? 0 : (f.prog - 1) * f.len;
        f.planted = true;
        f.settle = false;
        f.x = f.tx;
        f.z = f.tz;
        f.rotY = f.tRotY;
        f.height = 0;
        f.stance0 = this.phase - over;
        this.settleWait = 0.08;
      }
    }

    // 止まっている間：休みの位置からずれた足を一歩ずつ直す（向きを変えた時・構えを変えた時も）
    if (!this.moving && this.feet[0].planted && this.feet[1].planted) {
      this.settleWait -= dt;
      if (this.settleWait <= 0) {
        let worst = -1;
        let worstErr = 0;
        const tmp = new Foot();
        for (let i = 0; i < 2; i++) {
          const f = this.feet[i];
          this.restWorld(i, inp.x, inp.z, inp.rotY, rest, tmp);
          const d = Math.hypot(f.x - tmp.tx, f.z - tmp.tz);
          const a = Math.abs(wrapAngle(f.rotY - tmp.tRotY)) * (180 / Math.PI);
          const err = Math.max(d / GAIT.settleDist, a / GAIT.settleYawDeg);
          if (err > 1 && err > worstErr) {
            worst = i;
            worstErr = err;
          }
        }
        if (worst >= 0) this.startSwing(this.feet[worst], 1, true);
      }
    }

    // 足の傾きは速く追う（支点が地面に止まっているので、傾きを変えても足は滑らない）
    for (const f of this.feet) {
      const k = 1 - Math.exp(-dt / 0.035);
      const next = f.pitch + (f.pitchTarget - f.pitch) * k;
      // r02-chars-周2: 指摘「しゃがみ始めに接地足が 1 コマだけ 0.089 m/s 滑る」
      //   傾きが1コマでかかと側からつま先側へ符号をまたぐと、支点の切り替えの途中でつま先が少し動く。またぐコマは一度 0（足裏）で止める
      f.pitch = (f.pitch > 0 && next < 0) || (f.pitch < 0 && next > 0) ? 0 : next;
    }
  }
}

function fracp(x: number): number {
  return x - Math.floor(x);
}

/** 歩きの振り出しの横の進み（端で速さ0、中ほどで速い）。 */
function swingEase(u: number): number {
  return u - Math.sin(TAU * u) / TAU;
}

/** 歩きの足の持ち上がり：つま先が離れてすぐ上がり、着地の手前で低く降りてくる。 */
function walkLiftCurve(u: number): number {
  const a = Math.pow(clamp01(u), 0.8);
  return Math.min(1, 4 * a * (1 - a) * 1.05);
}

/** 走りの足の持ち上がり：蹴った足が後ろで高く上がり（かかとが尻へ）、前へ振り出して下ろす。 */
function runLiftCurve(u: number): number {
  return Math.sin(Math.PI * Math.pow(clamp01(u), 0.7));
}
