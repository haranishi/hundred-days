// OWNER: dragon
// 意図（DragonIntent）から「どのクリップを、どの重みで、どの時刻で見せるか」を決める。three を使わない純粋な計算なので、テストで確かめられる。
// 重ね方は3段：移動（idle・walk・run・fly・glide・dive、重みの和が1）→ 一度きり（takeoff・land・jump）で上書き → 技（breath・claw・tail・roar・stomp）を部位ごとに上書き。
// 重みは目標へ指数で近づけ、切り替えで跳ばない。時刻は、歩き・走りが「速さ÷歩幅」、羽ばたきが遊びの側の位相、技が遊びの側の段階から決まる。
// r03-roster：怪獣ごとのクリップの表を読む。無いクリップ（焔角の fly など）は重み 0 のまま。地上の E は怪獣の specialClip（焔角は stomp）で見せ、
// 跳ぶ（焔角）は intent.jump の段階（屈む・上がる・落ちる）をクリップ jump の区切り（crouch・leap・fall）へ当てる。
import { CREATURE_CLIPS, type ClipName, type CreatureViewConfig } from '../config/creatures';
import { DRAGON_MOTION as M, type DragonClipName } from '../config/dragon';
import type { ActionIntent, DragonIntent } from './intent';

export interface ClipMeta {
  duration: number;
  loop: boolean;
  /** 区切り（秒）：技は windup・active・recovery、炎は charge・thrust・loop、離陸は crouch・leap、跳ぶは crouch・leap・fall */
  marks?: Record<string, [number, number]>;
  /** 歩き・走り：1周で進む距離（m）。Blender のスクリプトが接地した足の速さから測った値 */
  stride?: number;
}
/** 紅竜の12本のクリップの表（r00c の GLB）。 */
export type ClipTable = Record<DragonClipName, ClipMeta>;
/** 怪獣のクリップの表（あるクリップだけ）。 */
export type CreatureClipTable = Partial<Record<ClipName, ClipMeta>>;

export const LOCOMOTION: readonly ClipName[] = ['idle', 'walk', 'run', 'fly', 'glide', 'dive'];
export const ONE_SHOTS: readonly ClipName[] = ['takeoff', 'land', 'jump'];
export const ACTIONS: readonly ClipName[] = ['breath', 'claw', 'tail', 'roar', 'stomp'];

export interface ClipSample {
  weight: number;
  time: number;
}

/** 動きの重ね方の怪獣ごとの違い（既定は紅竜）。 */
export interface AnimOptions {
  anim: CreatureViewConfig['anim'];
  specialClip: CreatureViewConfig['specialClip'];
}

const KURENAI_ANIM: AnimOptions = {
  anim: { walkFrom: M.walkFrom, walkFull: M.walkFull, runFrom: M.runFrom, runFull: M.runFull, flapFrom: M.flapFrom, flapFull: M.flapFull },
  specialClip: 'roar',
};

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const smooth = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
/** 目標へ時間 tau で近づける（指数）。dt が 0 なら動かない。 */
const follow = (v: number, target: number, tau: number, dt: number): number => (dt <= 0 ? v : target + (v - target) * Math.exp(-dt / Math.max(1e-4, tau)));
const wrapHalf = (x: number): number => x - Math.round(x);

/** 遊びの側の段階（振りかぶり・当たり・戻り）を、クリップの区切りの中の時刻に直す。 */
export function actionClipTime(a: ActionIntent, marks: Record<string, [number, number]>, fallback: number): number {
  if (a.phase === 'none') return fallback;
  const m = marks[a.phase];
  if (!m) return fallback;
  const p = a.duration > 0 ? clamp01(a.time / a.duration) : 0;
  return m[0] + p * (m[1] - m[0]);
}

export class AnimState {
  readonly clip: Record<ClipName, ClipSample>;
  /** 見た目の歩きの位相（0〜1、0 で後ろ左足が着く） */
  gaitPhase = 0;
  /** 離陸・着地・技・跳ぶが始まった回数（検証用。地上の E はクリップによらず roar で数える） */
  readonly starts: Record<string, number> = { takeoff: 0, land: 0, breath: 0, claw: 0, tail: 0, roar: 0, jump: 0 };
  /** 地上・空中を問わず、技の上書きを部位でどう効かせるか（空中では脚と翼を上書きしない） */
  airborne = false;
  /** 着地の強さ（0〜1）。着地のクリップの重みと、ばねの揺れに使う */
  landImpact = 0;
  private first = true;
  private prevGrounded = false;
  private oneShot: Record<'takeoff' | 'land', number> = { takeoff: -1, land: -1 };
  private landScale = 1;
  private readonly free = { idle: 0, glide: 0, dive: 0 };
  private breathActive = false;
  private jumpPhase = 'none';
  private readonly actionEnd: Record<'claw' | 'tail' | 'roar', number> = { claw: 0, tail: 0, roar: 0 };
  private readonly prevPhase: Record<'claw' | 'tail' | 'roar', string> = { claw: 'none', tail: 'none', roar: 'none' };
  private readonly anim: AnimOptions['anim'];
  /** 地上の E（intent.roar）を見せるクリップ */
  readonly specialClip: ClipName;

  constructor(
    private readonly meta: CreatureClipTable,
    options: AnimOptions = KURENAI_ANIM,
  ) {
    this.anim = options.anim;
    this.specialClip = options.specialClip;
    this.clip = {} as Record<ClipName, ClipSample>;
    for (const name of CREATURE_CLIPS) this.clip[name] = { weight: 0, time: 0 };
    for (const name of ['claw', 'tail', 'roar'] as const) {
      const m = meta[this.clipFor(name)];
      this.actionEnd[name] = m?.marks?.recovery?.[1] ?? m?.duration ?? 0;
    }
  }

  /** そのクリップが GLB にあるか。 */
  has(name: ClipName): boolean {
    return this.meta[name] !== undefined;
  }

  private clipFor(action: 'claw' | 'tail' | 'roar'): ClipName {
    return action === 'roar' ? this.specialClip : action;
  }

  /** 1コマ進める。dt は遊びの時刻の進み（一時停止・撮影モードでは 0）。 */
  update(it: DragonIntent, dt: number): void {
    const snap = this.first;
    this.first = false;
    const grounded = it.grounded;
    this.airborne = !grounded;
    if (snap) {
      this.gaitPhase = it.gaitPhase;
      this.prevGrounded = grounded;
    }
    this.updateLocomotion(it, dt, snap);
    this.updateOneShots(it, dt, grounded);
    this.updateJump(it, dt, snap);
    this.updateBreath(it, dt, snap);
    for (const name of ['claw', 'tail', 'roar'] as const) this.updateAction(name, it[name], dt, snap);
    this.prevGrounded = grounded;
  }

  private updateLocomotion(it: DragonIntent, dt: number, snap: boolean): void {
    const A = this.anim;
    const target: Partial<Record<ClipName, number>> = {};
    let runW = 0;
    if (it.grounded) {
      const move = smooth(A.walkFrom, A.walkFull, it.speed);
      runW = smooth(A.runFrom, A.runFull, it.speed);
      target.idle = 1 - move;
      target.walk = move * (1 - runW);
      target.run = move * runW;
    } else if (it.mode === 'jump' || !this.has('fly')) {
      // 跳んでいる間は、跳ぶクリップ（一度きり）が全身を上書きする。下に敷く移動は立ち姿
      target.idle = 1;
    } else if (it.mode === 'dive') {
      target.dive = 1;
    } else {
      const f = smooth(A.flapFrom, A.flapFull, it.flapStrength);
      target.fly = f;
      target.glide = 1 - f;
    }
    const tau = it.grounded === this.prevGrounded ? M.crossfade.locomotion : M.crossfade.air;
    let sum = 0;
    for (const name of LOCOMOTION) {
      const c = this.clip[name];
      c.weight = snap ? (target[name] ?? 0) : follow(c.weight, target[name] ?? 0, tau, dt);
      sum += c.weight;
    }
    for (const name of LOCOMOTION) this.clip[name].weight /= sum > 1e-6 ? sum : 1;

    // 歩き・走り：速さ÷歩幅で位相を進め、遊びの側の位相（足音・土煙の時刻）へ少しずつ寄せる
    const walk = this.meta.walk as ClipMeta;
    const run = this.meta.run as ClipMeta;
    if (it.grounded && it.speed > 0.3 && dt > 0) {
      const stride = (walk.stride ?? 15) + ((run.stride ?? 24) - (walk.stride ?? 15)) * runW;
      this.gaitPhase += (dt * it.speed) / stride;
      this.gaitPhase += wrapHalf(it.gaitPhase - this.gaitPhase) * Math.min(1, M.gaitLock * dt);
      this.gaitPhase -= Math.floor(this.gaitPhase);
    }
    this.clip.walk.time = this.gaitPhase * walk.duration;
    this.clip.run.time = this.gaitPhase * run.duration;
    // 羽ばたき：遊びの側の位相そのもの（0 が振り上げの頂点。羽ばたきの音と合う）
    if (this.meta.fly) this.clip.fly.time = (it.flapPhase - Math.floor(it.flapPhase)) * this.meta.fly.duration;
    for (const name of ['idle', 'glide', 'dive'] as const) {
      const m = this.meta[name];
      if (!m) continue;
      this.free[name] = (this.free[name] + dt) % m.duration;
      this.clip[name].time = this.free[name];
    }
  }

  private updateOneShots(it: DragonIntent, dt: number, grounded: boolean): void {
    if (this.prevGrounded && !grounded && it.mode === 'air' && this.meta.takeoff) {
      this.oneShot.takeoff = this.meta.takeoff.marks?.leap?.[0] ?? 0;
      this.oneShot.land = -1;
      this.starts.takeoff++;
    }
    if (!this.prevGrounded && grounded) {
      this.oneShot.land = 0;
      this.oneShot.takeoff = -1;
      this.landImpact = clamp01(it.landingImpact);
      this.landScale = 0.55 + 0.45 * this.landImpact;
      this.starts.land++;
    }
    for (const name of ['takeoff', 'land'] as const) {
      const c = this.clip[name];
      const meta = this.meta[name];
      if (!meta) continue;
      const dur = meta.duration;
      let t = this.oneShot[name];
      if (t >= 0) {
        t += dt;
        if (t >= dur) t = -1;
        this.oneShot[name] = t;
      }
      if (t < 0) {
        c.weight = follow(c.weight, 0, M.crossfade.oneShotOut * 0.5, dt);
        continue;
      }
      const start = name === 'takeoff' ? (meta.marks?.leap?.[0] ?? 0) : 0;
      const env = Math.min(smooth(start, start + M.crossfade.oneShotIn, t), 1 - smooth(dur - M.crossfade.oneShotOut * 1.4, dur, t));
      c.weight = env * (name === 'land' ? this.landScale : 1);
      c.time = Math.min(t, dur - 1e-3);
    }
  }

  /** 跳ぶ（焔角）：屈む・上がる・落ちるを、クリップの crouch・leap・fall の中の時刻に当てる。着地したら land が引き継ぐ。 */
  private updateJump(it: DragonIntent, dt: number, snap: boolean): void {
    const meta = this.meta.jump;
    if (!meta) return;
    const c = this.clip.jump;
    const j = it.jump;
    if (j.phase !== 'none' && this.jumpPhase === 'none') this.starts.jump++;
    this.jumpPhase = j.phase;
    const marks = meta.marks ?? {};
    const byPhase = { windup: marks.crouch, active: marks.leap, recovery: marks.fall } as Record<string, [number, number] | undefined>;
    if (j.phase !== 'none') {
      const m = byPhase[j.phase];
      const p = j.duration > 0 ? clamp01(j.time / j.duration) : 1;
      c.time = m ? m[0] + p * (m[1] - m[0]) : c.time;
    }
    const target = j.phase === 'none' ? 0 : 1;
    c.weight = snap ? target : follow(c.weight, target, target > c.weight ? M.crossfade.oneShotIn : M.crossfade.oneShotOut * 0.5, dt);
  }

  private updateBreath(it: DragonIntent, dt: number, snap: boolean): void {
    const c = this.clip.breath;
    const meta = this.meta.breath as ClipMeta;
    const marks = meta.marks ?? {};
    const charge = marks.charge ?? [0, 0.3];
    const loop = marks.loop ?? [0.6, meta.duration];
    const on = it.breath.active || it.breath.charge > 0.02;
    if (it.breath.active) {
      if (!this.breathActive) {
        c.time = charge[1];
        this.starts.breath++;
      } else {
        c.time += dt;
        if (c.time >= loop[1]) c.time = loop[0] + ((c.time - loop[0]) % (loop[1] - loop[0]));
      }
    } else if (it.breath.charge > 0.001) {
      c.time = it.breath.charge * charge[1];
    }
    this.breathActive = it.breath.active;
    const target = on ? 1 : 0;
    c.weight = snap ? target : follow(c.weight, target, on ? M.crossfade.actionIn : M.crossfade.breathOut, dt);
  }

  private updateAction(name: 'claw' | 'tail' | 'roar', a: ActionIntent, dt: number, snap: boolean): void {
    const clipName = this.clipFor(name);
    const c = this.clip[clipName];
    const marks = this.meta[clipName]?.marks ?? {};
    if (a.phase !== 'none' && this.prevPhase[name] === 'none') this.starts[name]++;
    this.prevPhase[name] = a.phase;
    c.time = actionClipTime(a, marks, a.phase === 'none' && c.weight > 0.001 ? Math.min(c.time, this.actionEnd[name]) : 0);
    const target = a.phase === 'none' ? 0 : 1;
    c.weight = snap ? target : follow(c.weight, target, target > c.weight ? M.crossfade.actionIn : M.crossfade.actionOut, dt);
  }

  /** いちばん目立っているクリップ（技 → 一度きり → 移動の順に、重みが 0.5 を超えたもの）。 */
  dominant(): ClipName {
    for (const group of [ACTIONS, ONE_SHOTS]) {
      let best: ClipName | null = null;
      for (const name of group) if (this.clip[name].weight > 0.5 && (!best || this.clip[name].weight > this.clip[best].weight)) best = name;
      if (best) return best;
    }
    let best: ClipName = 'idle';
    for (const name of LOCOMOTION) if (this.clip[name].weight > this.clip[best].weight) best = name;
    return best;
  }
}
