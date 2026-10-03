// OWNER: tests
// 二次運動の計測（r06-motion）：怪獣の GLB を Node で読み、遊びの側の体（DragonBody）を台本どおりに動かして、
// 見た目の側（Dragon.applyIntent）が作る姿勢から、首の先・尾の先・翼の先が体よりどれだけ遅れ、どれだけ振れるかを出す。
// 前の版（計測の前に控えた src の写し）でも同じ手順で測れるよう、型には頼らず共通の名前だけを使う（controlsMeasure.ts と同じ考え）。
// 比べる相手は「二次運動を外した同じ版」（DragonProcedural の springs を空にした姿勢）。体の動きは両方で同じなので、差は二次運動だけになる。

/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface MotionMods {
  three: any;
  Dragon: new (kit: any, creature: any) => any;
  MaterialKit: new (atmosphere: any, csm: any) => any;
  DragonBody: new (bounds: any, spawn: any, creature: any) => any;
  emptyBodyEvents: () => any;
  createIntent: () => any;
  CREATURE_CONFIG: Record<string, any>;
  /** public/ の場所（GLB を読む） */
  publicDir: string;
}

export type EventName = 'turn' | 'stop' | 'land' | 'takeoff';
export interface TipStat {
  /** 遅れ（ms）：旋回は「二次運動を外した向きの何 ms 前と合うか」、それ以外は出来事から振れが最大になるまで */
  lagMs: number;
  /** 振れ幅（度）：二次運動を外した姿勢からの、付け根から先への向きのずれの最大 */
  ampDeg: number;
}
export interface EventStat {
  /** 出来事の大きさ（旋回は度/秒の最大、止まるは m/s²、着地と飛び立ちは上下の速さの変わり m/s） */
  size: number;
  tips: Record<string, TipStat>;
}

const DT = 1 / 60;
const DEG = Math.PI / 180;
const JUMP_PHASE: Record<string, string> = { none: 'none', crouch: 'windup', rise: 'active', fall: 'recovery' };

let loaderPatched = false;
/** three の FileLoader を、ディスクから読む形に差し替える（Node の fetch は相対の URL を読めない）。 */
function patchLoader(m: MotionMods): void {
  if (loaderPatched) return;
  loaderPatched = true;
  (globalThis as any).window ??= globalThis;
  m.three.FileLoader.prototype.load = function (url: string, onLoad: (d: ArrayBuffer) => void, _p: unknown, onError?: (e: unknown) => void) {
    try {
      const buf = readFileSync(path.join(m.publicDir, url.replace(/^\/+/, '')));
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      queueMicrotask(() => onLoad(ab));
    } catch (e) {
      if (onError) onError(e);
      else throw e;
    }
  };
}

interface Chain {
  name: string;
  base: any;
  tip: any;
  /** 先の骨の局所で、骨の先端に当たる点（骨の長さ ≒ 1つ手前の節の長さ） */
  tipLocal: any;
}

function chainsOf(m: MotionMods, dragon: any): Chain[] {
  const V = m.three.Vector3;
  const L = dragon.loaded;
  const pb = L.pbones;
  const out: Chain[] = [];
  const segLen = (bone: any): number => bone.position.length();
  const tail = pb.tail as any[];
  out.push({ name: 'tail', base: tail[0], tip: tail[tail.length - 1], tipLocal: new V(0, segLen(tail[tail.length - 1]), 0) });
  out.push({ name: 'neck', base: pb.neck[0], tip: pb.head, tipLocal: new V(0, segLen(pb.head), 0) });
  // 翼の指：先の節（f?b）の付け根から、手前の節と同じ長さだけ先を指の先とみなす
  for (const t of pb.wingTips as { bone: any; side: number }[]) {
    const b = t.bone;
    const hand = b.parent?.parent;
    if (!hand) continue;
    out.push({ name: `wing:${b.name}`, base: hand, tip: b, tipLocal: new V(0, segLen(b), 0) });
  }
  return out;
}

interface Frame {
  t: number;
  yaw: number;
  grounded: boolean;
  /** 各列の、付け根から先への向き（ワールド、長さ1）と先の位置 */
  dirs: Record<string, [number, number, number]>;
}

type Scenario = {
  name: EventName;
  /** 体を最初の状態に置く */
  setup(body: any, creature: any): void;
  /** t 秒の入力 */
  input(t: number, body: any, creature: any): any;
  /** 出来事の起きた時刻を体の状態から見つける（記録しながら呼ぶ） */
  detect(prev: any, body: any, t: number): boolean;
  seconds: number;
};

const baseInput = (): any => ({
  moveX: 0,
  moveZ: 0,
  ascendPressed: false,
  ascendHeld: false,
  descendHeld: false,
  sprintHeld: false,
  speedScale: 1,
  faceYaw: null,
  faceRate: null,
  rageDive: false,
});

const groundStart = (body: any): void => {
  body.mode = 'ground';
  body.groundY = 0;
  body.pos.y = body.shape.bodyHeight;
  body.vel.y = 0;
};

/** 出来事の台本：どの怪獣でも同じ入力（焔角の「着地」「飛び立ち」は、跳んでのしかかる着地と跳び上がり）。 */
export function scenarios(): Scenario[] {
  const T0 = 2.0;
  return [
    {
      // 歩いている途中で、進みたい向きを 0.4 秒で180度回す（視点をマウスで振り向くのと同じ。tools/capture.mjs の turn）。
      // 怪獣は歩きの速さのまま、遊びの側の旋回の速さで振り向く
      name: 'turn',
      seconds: T0 + 3.0,
      setup: groundStart,
      input: (t, body) => {
        const i = baseInput();
        const a = body.spawn.yaw - Math.PI * Math.min(1, Math.max(0, (t - T0) / 0.4));
        i.moveX = Math.sin(a);
        i.moveZ = Math.cos(a);
        return i;
      },
      detect: (_p, _b, t) => t >= T0 - 1e-9,
    },
    {
      // 走りの最高速から入力を離して止まる
      name: 'stop',
      seconds: T0 + 2.5 + 1.0,
      setup: groundStart,
      input: (t, body) => {
        const i = baseInput();
        if (t < T0 + 1.0) {
          i.moveX = Math.sin(body.spawn.yaw);
          i.moveZ = Math.cos(body.spawn.yaw);
          i.sprintHeld = true;
        }
        return i;
      },
      detect: (_p, _b, t) => t >= T0 + 1.0 - 1e-9,
    },
    {
      // 空中（地面から60m）を前へ飛び、急降下で着地する。焔角は前へ跳んでのしかかる
      name: 'land',
      seconds: 6.0,
      setup: (body, creature) => {
        if (creature.motion.canFly) {
          body.mode = 'air';
          body.groundY = 0;
          body.pos.y = body.shape.bodyHeight + 60;
          body.vel.y = 0;
          body.speed = 20;
        } else groundStart(body);
      },
      input: (t, body, creature) => {
        const i = baseInput();
        i.moveX = Math.sin(body.spawn.yaw);
        i.moveZ = Math.cos(body.spawn.yaw);
        if (creature.motion.canFly) i.sprintHeld = t > 0.5 && body.mode !== 'landing' && body.mode !== 'ground';
        else i.ascendPressed = Math.abs(t - 0.5) < DT / 2;
        if (body.mode === 'landing' || (t > 1 && body.mode === 'ground')) {
          i.moveX = 0;
          i.moveZ = 0;
        }
        return i;
      },
      detect: (prev, body) => prev.grounded === false && body.grounded,
    },
    {
      // 立っている所から飛び立つ（Space を押し続ける）。焔角は跳び上がる（屈んで跳ぶ）
      name: 'takeoff',
      seconds: T0 + 3.0,
      setup: groundStart,
      input: (t, _body, creature) => {
        const i = baseInput();
        if (creature.motion.canFly) {
          i.ascendPressed = Math.abs(t - T0) < DT / 2;
          i.ascendHeld = t >= T0;
        } else i.ascendPressed = Math.abs(t - (T0 - 0.3)) < DT / 2;
        return i;
      },
      detect: (prev, body) => prev.grounded === true && !body.grounded,
    },
  ];
}

function intentFrom(body: any, it: any): any {
  it.position = [body.pos.x, body.pos.y, body.pos.z];
  it.velocity = [body.vel.x, body.vel.y, body.vel.z];
  it.yaw = body.yaw;
  it.pitch = body.pitch;
  it.roll = body.roll;
  it.speed = body.speed;
  it.mode = body.mode;
  it.grounded = body.grounded;
  it.groundY = body.groundY;
  it.flapPhase = body.flapPhase;
  it.flapStrength = body.flapStrength;
  it.gaitPhase = body.gaitPhase;
  it.gait = body.gait;
  // 照準は体の正面（首と頭は狙いを向けない向き）。旋回では照準の振り向きを足さず、二次運動だけを見る
  it.aimYaw = body.yaw;
  it.aimPitch = -8 * DEG;
  it.jump = { phase: JUMP_PHASE[body.jump.phase] ?? 'none', time: body.jump.time, duration: body.jump.duration };
  it.landingImpact = body.landingImpact;
  return it;
}

async function makeDragon(m: MotionMods, id: string): Promise<any> {
  patchLoader(m);
  const kit = new m.MaterialKit({ uniforms: {} }, null);
  const dragon = new m.Dragon(kit, m.CREATURE_CONFIG[id]);
  await dragon.ready;
  return dragon;
}

/** 1つの台本を流し、毎コマの列の向きと、出来事の時刻と大きさを返す。secondary=false で二次運動を外す。 */
async function run(m: MotionMods, id: string, sc: Scenario, secondary: boolean): Promise<{ frames: Frame[]; eventT: number; size: number }> {
  const creature = m.CREATURE_CONFIG[id];
  const dragon = await makeDragon(m, id);
  if (!secondary) dragon.loaded.proc.springs = (): void => undefined;
  const body = new m.DragonBody({ xMin: -5000, xMax: 5000, zMin: -5000, zMax: 5000 }, { x: 0, y: creature.body.bodyHeight, z: 0, yaw: 0 }, creature);
  sc.setup(body, creature);
  const it = m.createIntent();
  const chains = chainsOf(m, dragon);
  const V = m.three.Vector3;
  const a = new V();
  const b = new V();
  const frames: Frame[] = [];
  let eventT = -1;
  let size = 0;
  const steps = Math.round(sc.seconds / DT);
  for (let k = 0; k < steps; k++) {
    const t = k * DT;
    const prev = { grounded: body.grounded, vy: body.vel.y, yaw: body.yaw, speed: body.speed };
    body.update(DT, sc.input(t, body, creature), () => 0, m.emptyBodyEvents());
    if (eventT < 0 && sc.detect(prev, body, t)) {
      eventT = t;
      // 着地と飛び立ちの大きさは、その刻みの上下の速さの変わり（m/s）
      if (sc.name === 'land' || sc.name === 'takeoff') size = Math.abs(body.vel.y - prev.vy);
    }
    // 旋回と止まるの大きさは、出来事の後 1.5 秒の最大（度/秒・m/s²）
    if (eventT >= 0 && t - eventT <= 1.5) {
      if (sc.name === 'turn') size = Math.max(size, Math.abs(Math.atan2(Math.sin(body.yaw - prev.yaw), Math.cos(body.yaw - prev.yaw))) / DT / DEG);
      else if (sc.name === 'stop') size = Math.max(size, Math.abs(body.speed - prev.speed) / DT);
    }
    dragon.applyIntent(intentFrom(body, it), DT);
    const dirs: Frame['dirs'] = {};
    for (const c of chains) {
      c.base.getWorldPosition(a);
      c.tip.localToWorld(b.copy(c.tipLocal));
      b.sub(a).normalize();
      dirs[c.name] = [b.x, b.y, b.z];
    }
    frames.push({ t, yaw: body.yaw, grounded: body.grounded, dirs });
  }
  return { frames, eventT, size };
}

const angle = (u: number[], v: number[]): number => Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))) / DEG;

/**
 * 旋回：向き（ワールド）が、二次運動を外した向きの何秒前と合うか（-0.3〜0.6 秒を 1/60 秒刻みで探す）。
 * 負は先回り（体より先に回っている）。
 */
function shiftLag(on: Frame[], ref: Frame[], key: string, from: number, to: number): number {
  let best = 0;
  let bestErr = Infinity;
  // 0・+1・-1・+2・-2 … の順に試す（同じくらい合うなら 0 に近いずらしが残る）
  const order = [0, ...Array.from({ length: 36 }, (_, i) => [i + 1, -(i + 1)]).flat()].filter((s) => s >= -18 && s <= 36);
  for (const s of order) {
    let err = 0;
    let n = 0;
    for (let k = from; k <= to; k++) {
      if (k - s < 0 || k - s >= ref.length) continue;
      const d = angle(on[k].dirs[key], ref[k - s].dirs[key]);
      err += d * d;
      n++;
    }
    // 同じくらい合うなら 0 に近いずらしを採る（振れが無い列で遅れを作らない）
    if (n > 0 && err / n < bestErr - 1e-6) {
      bestErr = err / n;
      best = s;
    }
  }
  return Math.round(best * DT * 1000);
}

/** 1体ぶん：4つの出来事の、列の先ごとの遅れと振れ幅。 */
export async function measureCreature(m: MotionMods, id: string): Promise<Record<EventName, EventStat>> {
  const out = {} as Record<EventName, EventStat>;
  for (const sc of scenarios()) {
    const on = await run(m, id, sc, true);
    const ref = await run(m, id, sc, false);
    if (on.eventT < 0) throw new Error(`${id} の ${sc.name}：出来事が起きなかった`);
    const from = Math.round(on.eventT / DT);
    // 見る長さ：旋回は振り向き（約0.8秒）の後の振れ戻りまで 2 秒、止まるは減速（約0.8秒）の後まで 1.5 秒、着地と飛び立ちは 1 秒
    const span = { turn: 2.0, stop: 1.5, land: 1.0, takeoff: 1.0 }[sc.name];
    let to = Math.min(on.frames.length - 1, from + Math.round(span / DT));
    // 飛び立ち（焔角は跳び上がり）は、次に地面に着く前までを見る（のしかかりの着地を混ぜない）
    if (sc.name === 'takeoff') for (let k = from + 1; k <= to; k++) if (on.frames[k].grounded) to = k - 1;
    const tips: Record<string, TipStat> = {};
    for (const key of Object.keys(on.frames[0].dirs)) {
      let amp = 0;
      let peakK = from;
      for (let k = from; k <= to; k++) {
        const d = angle(on.frames[k].dirs[key], ref.frames[k].dirs[key]);
        if (d > amp) {
          amp = d;
          peakK = k;
        }
      }
      const lagMs = sc.name === 'turn' ? shiftLag(on.frames, ref.frames, key, from, to) : Math.round((peakK - from) * DT * 1000);
      tips[key] = { lagMs, ampDeg: Math.round(amp * 10) / 10 };
    }
    out[sc.name] = { size: Math.round(on.size * 10) / 10, tips };
  }
  return out;
}

/** 翼の指の列（wing:…）を「翼の先」1つにまとめる（振れ幅が最大の指）。指ごとの値は別に残す。 */
export function summarize(stats: Record<EventName, EventStat>): Record<EventName, { size: number; neck: TipStat; tail: TipStat; wing: (TipStat & { finger: string }) | null }> {
  const out = {} as Record<EventName, { size: number; neck: TipStat; tail: TipStat; wing: (TipStat & { finger: string }) | null }>;
  for (const [ev, s] of Object.entries(stats) as [EventName, EventStat][]) {
    let wing: (TipStat & { finger: string }) | null = null;
    for (const [k, v] of Object.entries(s.tips)) {
      if (!k.startsWith('wing:')) continue;
      if (!wing || v.ampDeg > wing.ampDeg) wing = { ...v, finger: k.slice(5) };
    }
    out[ev] = { size: s.size, neck: s.tips.neck, tail: s.tips.tail, wing };
  }
  return out;
}

/**
 * 歩き続ける間の揺れ（r06-motion）：歩きの最高速で 4 秒歩き、後ろの 3 秒で、列の先の向きの二次運動によるずれ（二乗平均と最大、度）と、
 * 翼の指どうしの角度（前縁の指と後ろの指の間）が時間でどれだけ変わるか（幅、度）を、二次運動を外した姿勢と比べる。
 * 指どうしの角度が変わらないなら、畳んだ翼は1枚の板として動いている。
 */
export async function measureWalk(m: MotionMods, id: string): Promise<{ tips: Record<string, { rmsDeg: number; ampDeg: number }>; fingerSpread: { pair: string; refRangeDeg: number; onRangeDeg: number } | null }> {
  const sc: Scenario = {
    name: 'turn',
    seconds: 4,
    setup: groundStart,
    input: (_t, body) => {
      const i = baseInput();
      i.moveX = Math.sin(body.spawn.yaw);
      i.moveZ = Math.cos(body.spawn.yaw);
      return i;
    },
    detect: (_p, _b, t) => t >= 1 - 1e-9,
  };
  const on = await run(m, id, sc, true);
  const ref = await run(m, id, sc, false);
  const from = Math.round(1 / DT);
  const to = on.frames.length - 1;
  const tips: Record<string, { rmsDeg: number; ampDeg: number }> = {};
  for (const key of Object.keys(on.frames[0].dirs)) {
    let sum = 0;
    let amp = 0;
    for (let k = from; k <= to; k++) {
      const d = angle(on.frames[k].dirs[key], ref.frames[k].dirs[key]);
      sum += d * d;
      amp = Math.max(amp, d);
    }
    tips[key] = { rmsDeg: Math.round(Math.sqrt(sum / (to - from + 1)) * 10) / 10, ampDeg: Math.round(amp * 10) / 10 };
  }
  const fingers = Object.keys(on.frames[0].dirs).filter((k) => k.startsWith('wing:') && k.endsWith('_L'));
  let fingerSpread = null;
  if (fingers.length >= 2) {
    const first = fingers[0];
    const last = fingers[fingers.length - 1];
    const range = (fr: Frame[]): number => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let k = from; k <= to; k++) {
        const a = angle(fr[k].dirs[first], fr[k].dirs[last]);
        lo = Math.min(lo, a);
        hi = Math.max(hi, a);
      }
      return Math.round((hi - lo) * 10) / 10;
    };
    fingerSpread = { pair: `${first.slice(5)}〜${last.slice(5)}`, refRangeDeg: range(ref.frames), onRangeDeg: range(on.frames) };
  }
  return { tips, fingerSpread };
}

/**
 * 1コマの手間（r06-motion）：歩きと旋回の意図を流し、Dragon.applyIntent 1回の時間（マイクロ秒、中央値と 95%）を測る。
 * 性能の計測（tools/perf.mjs）は撮影の姿勢（setPose）で飛ぶので、遊ぶときだけ動く手続きの層の重さはここで比べる。
 */
export async function measureCost(m: MotionMods, id: string, frames = 900): Promise<{ p50Us: number; p95Us: number }> {
  const creature = m.CREATURE_CONFIG[id];
  const dragon = await makeDragon(m, id);
  const body = new m.DragonBody({ xMin: -5000, xMax: 5000, zMin: -5000, zMax: 5000 }, { x: 0, y: creature.body.bodyHeight, z: 0, yaw: 0 }, creature);
  groundStart(body);
  const it = m.createIntent();
  const times: number[] = [];
  for (let k = 0; k < frames; k++) {
    const i = baseInput();
    const a = k * 0.01;
    i.moveX = Math.sin(a);
    i.moveZ = Math.cos(a);
    i.sprintHeld = k % 300 > 150;
    body.update(DT, i, () => 0, m.emptyBodyEvents());
    intentFrom(body, it);
    const t0 = performance.now();
    dragon.applyIntent(it, DT);
    if (k >= 60) times.push(performance.now() - t0);
  }
  times.sort((x, y) => x - y);
  const q = (p: number): number => Math.round(times[Math.min(times.length - 1, Math.floor(p * times.length))] * 1000);
  return { p50Us: q(0.5), p95Us: q(0.95) };
}
