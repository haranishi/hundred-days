// OWNER: tests
// 人に近い遊び方（r06-balance）：体験の採点役が Playwright から実時間で送っていた入力（.captures/r05-evalplay/evp_full.mjs）を、
// 描画なしの遊びの本体で1刻みずつ回せる台本にした。判断の間 0.15〜0.25秒、照準は狙う点を水平±3m・上下±2m ずらして2回で合わせる。
// 1つの遊び方に合わせ込まないよう、遊び方を4通り持つ。eval＝採点役の組み立ての写し、signature＝札の一行どおり得意技に寄せる、
// rotation＝案内の順（主砲→近く→払う→飛ぶ・跳ぶ）に全部の技を回す、brawler＝近くを殴る（雷翼は急降下で落ちて殴る）。
// 乱数の種で、判断の間・照準のずれ・的の選び方・飛ぶ間隔が変わる。
// 待ち時間は人の時計（刻みの数）で数え、ヒットストップで遅れるゲーム内時刻とは分ける（採点役の sleep が実時間なのと同じ）。
// 入力は人と同じ経路（InputState → readControls）で入れ、押した・離した・視点の動きを刻みの時刻つきで残す。
// 残した列は、ブラウザの自動プレイの台本（tools/play.mjs --script）でそのまま流せる。
// 前の版（.captures に控えた src）でも同じ手順で測れるよう、遊びの本体の型には頼らない（controlsMeasure.ts と同じ作り）。

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyGame = any;

/**
 * eval_raw は採点役の台本そのまま。採点役の紅竜だけは崩れた建物も的に選ぶ（雷翼と焔角は照準が「建物なし」なら次の的へ移るが、
 * 紅竜にはその確かめが無い）。eval はその確かめを紅竜にも入れたもの（雷翼と焔角では eval_raw と同じ）。計測の4通りは STYLES
 */
export type Style = 'eval' | 'eval_raw' | 'signature' | 'rotation' | 'brawler';
export const STYLES: readonly Style[] = ['eval', 'signature', 'rotation', 'brawler'];
export const CREATURES = ['kurenai', 'raiyoku', 'homuratsuno'] as const;
export type Creature = (typeof CREATURES)[number];

/** 遊びの本体を作る部品（今の src でも、控えた前の版の src でもよい）。 */
export interface HumanMods {
  Game: new (city: any, index: any, duration: number | undefined, creature: string) => AnyGame;
  InputState: new () => any;
  readControls: (input: any) => any;
  pressInput: (sink: any, name: string | number) => void;
  releaseInput: (sink: any, name: string | number) => void;
  city: any;
  index: any;
  /** マウス1画素あたりの視点の回転（ラジアン、config/controls.ts の LOOK.sensitivity） */
  sensitivity: number;
}

/** ブラウザの台本（src/harness/playtest.ts の ScriptStep と同じ形）。at は遊び始めからの秒（刻みの数 × 1/60）。 */
export interface ScriptStep {
  at: number;
  do: 'press' | 'release' | 'look';
  key?: string;
  dx?: number;
  dy?: number;
}

/** 大技を1回使った記録（出来事 rage.release の時刻から数える。ブラウザの tools/play.mjs --measure と同じ数え方）。 */
export interface SpecialUse {
  /** 使ったゲーム内時刻（秒）と、大技の種類（roar・dive・fissure）と、そのときの体の状態（ground・air・dive・landing・jump） */
  t: number;
  kind: string;
  mode: string;
  /** 使ってから3秒・8秒の破壊率の伸び（%。時間切れまで） */
  gain3: number;
  gain8: number;
  /** 3秒たつ前に時間切れになった */
  truncated: boolean;
}

export interface HumanRun {
  creature: Creature;
  style: Style;
  seed: number;
  /** 3分の破壊率（%）・被害総額・最大連鎖・崩した建物 */
  destruction: number;
  yen: number;
  maxCombo: number;
  collapsed: number;
  endedAt: number | null;
  /** 怒りが初めて満タンになったゲーム内時刻（秒） */
  rageFull: number | null;
  specials: SpecialUse[];
  /** 原因ごとの破壊率（%）と怒り（点）。段階が進んだ瞬間の原因（竜の手柄の数え方は damage.ts と同じ） */
  destructionByCause: Record<string, number>;
  rageByCause: Record<string, number>;
  /** 建物の種類ごとの破壊率（%） */
  destructionByKind: Record<string, number>;
  /** 30秒ごとの破壊率（%） */
  timeline: number[];
  /** 空中にいた秒数・雷の発射・地上にいた秒数など（遊びの本体の数え） */
  stats: Record<string, number>;
  /** 遊び方の出来事の数（skipDead＝照準が「建物なし」で次の的へ、など） */
  log: Record<string, number>;
  inputs?: ScriptStep[];
  /** trace を付けたとき：段階が進むたびの [ゲーム内時刻, 建物, 段階, 原因, 破壊率の増え(%)] と、0.5秒ごとの体の [時刻, x, z, 状態, 高さ] */
  trace?: { stages: [number, number, number, string, number][]; body: [number, number, number, string, number][] };
}

const DT = 1 / 60;
const DEG = Math.PI / 180;

interface Bld {
  id: number;
  cx: number;
  cz: number;
  w: number;
  d: number;
  h: number;
  kind: string;
}

interface Near extends Bld {
  edge: number;
}

/** 外形の縁までの水平の距離で近い順（採点役の nearest と同じ）。 */
function nearest(list: readonly Bld[], x: number, z: number, minH = 0, maxDist = 1e9): Near[] {
  const out: Near[] = [];
  for (const b of list) {
    if (b.h < minH) continue;
    const ex = Math.max(Math.abs(x - b.cx) - b.w / 2, 0);
    const ez = Math.max(Math.abs(z - b.cz) - b.d / 2, 0);
    const edge = Math.hypot(ex, ez);
    if (edge <= maxDist) out.push({ ...b, edge });
  }
  return out.sort((a, b) => a.edge - b.edge || a.id - b.id);
}

const wrap = (a: number): number => {
  let x = a % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  else if (x > Math.PI) x -= 2 * Math.PI;
  return x;
};

/** 種から決まる乱数（mulberry32）。 */
function rng(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 待ち：刻みの数（人の時計）か、条件が満たされるかゲーム内時刻で maxSec たつまで。 */
type Wait = { kind: 'sleep'; ms: number } | { kind: 'until'; pred: () => boolean; maxSec: number };
type Co = Generator<Wait, void, unknown>;
const sleep = (ms: number): Wait => ({ kind: 'sleep', ms });
const until = (pred: () => boolean, maxSec: number): Wait => ({ kind: 'until', pred, maxSec });
/** 1刻み（採点役が状態を1回読むのにかかる間） */
const TICK = sleep(16);

interface Ctx {
  attacked: Map<number, number>;
  dead: Set<number>;
  nextFly: number;
  nextDive: number;
  nextJump: number;
  justTook: boolean;
  eBlockUntil: number;
  turn: number;
}

class Bot {
  readonly inputs: ScriptStep[] = [];
  readonly log: Record<string, number> = {};
  private readonly rnd: () => number;
  private readonly held = new Set<string>();
  private readonly list: Bld[];
  private readonly ctx: Ctx;
  private step = 0;
  private wait: { untilStep: number } | { pred: () => boolean; maxClock: number } | null = null;
  private readonly co: Co;
  private done = false;

  constructor(
    private readonly g: AnyGame,
    private readonly input: any,
    private readonly m: HumanMods,
    readonly creature: Creature,
    readonly style: Style,
    seed: number,
    private readonly record: boolean,
  ) {
    this.rnd = rng(seed);
    this.list = g.city.buildings.map((b: any) => ({
      id: b.id,
      cx: (b.footprint.x0 + b.footprint.x1) / 2,
      cz: (b.footprint.z0 + b.footprint.z1) / 2,
      w: b.footprint.x1 - b.footprint.x0,
      d: b.footprint.z1 - b.footprint.z0,
      h: b.height,
      kind: b.kind,
    }));
    // 飛ぶ・急降下・跳ぶの間隔は、種で ±20% ずらす（採点役の 40・20・25 秒を中心に）
    const k = 0.8 + 0.4 * this.rnd();
    this.ctx = { attacked: new Map(), dead: new Set(), nextFly: 40 * k, nextDive: 20 * k, nextJump: 25 * k, justTook: true, eBlockUntil: -1, turn: 0 };
    this.co = this.main();
  }

  // ---- 入力（人と同じ経路。台本に残す） ----
  private rec(s: Omit<ScriptStep, 'at'>): void {
    if (!this.record) return;
    const at = Math.round((this.step + 0.5) * DT * 1e6) / 1e6;
    const last = this.inputs[this.inputs.length - 1];
    if (s.do === 'look' && last && last.do === 'look' && last.at === at) {
      last.dx = (last.dx ?? 0) + (s.dx ?? 0);
      last.dy = (last.dy ?? 0) + (s.dy ?? 0);
      return;
    }
    this.inputs.push({ at, ...s });
  }
  private down(k: string): void {
    this.m.pressInput(this.input, k);
    this.held.add(k);
    this.rec({ do: 'press', key: k });
  }
  private up(k: string): void {
    this.m.releaseInput(this.input, k);
    this.held.delete(k);
    this.rec({ do: 'release', key: k });
  }
  private look(dx: number, dy: number): void {
    this.input.injectMotion(dx, dy);
    this.rec({ do: 'look', dx, dy });
  }
  private releaseAll(): void {
    for (const k of [...this.held]) this.up(k);
  }

  // ---- 1刻み：待ちが明けていれば台本を進める ----
  tick(step: number): void {
    this.step = step;
    if (this.done) return;
    if (this.g.session.phase !== 'playing') {
      this.releaseAll();
      return;
    }
    const w = this.wait;
    if (w) {
      if ('untilStep' in w) {
        if (step < w.untilStep) return;
      } else if (!w.pred() && this.g.clock < w.maxClock) return;
    }
    const r = this.co.next();
    if (r.done) {
      this.done = true;
      return;
    }
    const v = r.value;
    this.wait = v.kind === 'sleep' ? { untilStep: step + Math.max(1, Math.round(v.ms / 1000 / DT)) } : { pred: v.pred, maxClock: this.g.clock + v.maxSec };
  }

  private count(k: string): void {
    this.log[k] = (this.log[k] ?? 0) + 1;
  }

  // ---- 人の動きの部品 ----
  private jitter(a: number): number {
    return (this.rnd() * 2 - 1) * a;
  }
  private *react(): Co {
    yield sleep(150 + this.rnd() * 100);
  }
  private *tap(k: string, ms = 70): Co {
    this.down(k);
    yield sleep(ms);
    this.up(k);
  }
  private *click(k: string): Co {
    yield* this.tap(k, 60);
  }
  private *hold(k: string, ms: number): Co {
    this.down(k);
    yield sleep(ms);
    this.up(k);
  }

  /** 照準を点へ：狙う点をずらし、カメラから点への向きと今の視線の差だけマウスを動かす（2回、間 60ms）。 */
  private *aim(pt: { x: number; y: number; z: number }, err = 1): Co {
    const t = { x: pt.x + this.jitter(3 * err), y: pt.y + this.jitter(2 * err), z: pt.z + this.jitter(3 * err) };
    for (let pass = 0; pass < 2; pass++) {
      const cam = this.g.aimCam;
      const dx = t.x - cam.x;
      const dy = t.y - cam.y;
      const dz = t.z - cam.z;
      const yaw = Math.atan2(dx, dz);
      const pitch = Math.atan2(dy, Math.hypot(dx, dz));
      const ey = wrap(yaw - this.g.view.yaw);
      const ep = pitch - this.g.view.pitch;
      if (Math.abs(ey) < 0.4 * DEG && Math.abs(ep) < 0.4 * DEG) break;
      this.look(-ey / this.m.sensitivity, -ep / this.m.sensitivity);
      yield sleep(60);
    }
  }
  private aimPt(b: Bld): { x: number; y: number; z: number } {
    return { x: b.cx, y: Math.max(6, Math.min(b.h * 0.45, 28)), z: b.cz };
  }
  private standing(id: number): boolean {
    return this.g.damage.isStanding(id);
  }
  private get body(): any {
    return this.g.body;
  }
  private get mode(): string {
    return this.g.body.mode;
  }
  private get clock(): number {
    return this.g.clock;
  }
  private edgeTo(b: Bld): number {
    const p = this.body.pos;
    return Math.hypot(Math.max(Math.abs(p.x - b.cx) - b.w / 2, 0), Math.max(Math.abs(p.z - b.cz) - b.d / 2, 0));
  }
  private near(minH: number, maxDist: number): Near[] {
    return nearest(this.list, this.body.pos.x, this.body.pos.z, minH, maxDist);
  }
  /** 上位 k 件から種で1つ（同じ近さの的を人は気分で選ぶ）。先頭ほど選ばれやすい */
  private pickTop<T>(xs: T[], k = 2): T | undefined {
    if (xs.length === 0) return undefined;
    const n = Math.min(k, xs.length);
    const r = this.rnd();
    return xs[r < 0.7 || n === 1 ? 0 : 1 + Math.floor(this.rnd() * (n - 1))];
  }
  /** 近くの立っている建物 n 棟の重心（大技を向ける先） */
  private cluster(minH: number, maxDist: number, n: number): { x: number; y: number; z: number } | null {
    const nb = this.near(minH, maxDist)
      .filter((b) => !this.ctx.dead.has(b.id))
      .slice(0, n);
    if (nb.length === 0) return null;
    return { x: nb.reduce((a, b) => a + b.cx, 0) / nb.length, y: 5, z: nb.reduce((a, b) => a + b.cz, 0) / nb.length };
  }

  /** 的へ寄る（採点役の approach）：W（と Shift・左）を押し、縁まで 13m・詰まり・5秒のどれかで止める。0.5秒ごとに狙い直す。 */
  private *approach(tgt: Bld, opt: { fire?: boolean; run?: boolean; stop?: number; maxSec?: number } = {}): Co {
    const stopAt = opt.stop ?? 13;
    yield* this.aim(this.aimPt(tgt));
    this.down('w');
    if (opt.run) this.down('shift');
    if (opt.fire) this.down('left');
    const t0 = this.clock;
    let slow = 0;
    let px = this.body.pos.x;
    let pz = this.body.pos.z;
    let pt = this.clock;
    for (let i = 1; ; i++) {
      yield sleep(100);
      if (this.g.session.phase !== 'playing') break;
      const e = this.edgeTo(tgt);
      const v = Math.hypot(this.body.pos.x - px, this.body.pos.z - pz) / Math.max(1e-3, this.clock - pt);
      slow = v < 1 ? slow + 1 : 0;
      px = this.body.pos.x;
      pz = this.body.pos.z;
      pt = this.clock;
      if (e < stopAt || slow >= 6 || this.clock - t0 > (opt.maxSec ?? 5)) break;
      if (i % 5 === 0) yield* this.aim(this.aimPt(tgt), 0.5);
    }
    if (opt.fire) this.up('left');
    if (opt.run) this.up('shift');
    this.up('w');
    if (slow >= 6) this.count('stuck');
  }

  /** 怒りの大技：怪獣ごとに向きを決めて E。1.2秒たっても怒りが減らなければ3秒は押さない（採点役と同じ）。 */
  private *special(): Co {
    yield* this.react();
    const c = this.creature;
    if (c === 'raiyoku' && this.mode === 'ground') yield* this.hold('space', 1500);
    if (c === 'homuratsuno' && this.style !== 'brawler') {
      const at = this.cluster(10, 150, 12);
      if (at) yield* this.aim(at, 1);
    }
    const t = this.clock;
    yield* this.tap('e');
    yield until(() => this.g.score.rage < 99 || this.g.session.phase !== 'playing', 1.2);
    if (this.g.score.rage >= 99) {
      this.ctx.eBlockUntil = t + 3;
      this.count('eRejected');
      return;
    }
    yield sleep(1500);
  }

  private *main(): Co {
    yield* this.open();
    for (;;) {
      yield TICK;
      if (this.g.session.phase !== 'playing') continue;
      if (this.g.score.rage >= 100 && this.clock >= this.ctx.eBlockUntil) {
        yield* this.special();
        continue;
      }
      const c = this.creature;
      if (c === 'kurenai' && this.mode !== 'ground' && this.style !== 'signature' && this.style !== 'rotation') {
        // 採点役の紅竜は、空中にいたら急降下で降りてから殴る
        this.down('w');
        this.down('shift');
        yield until(() => this.mode === 'ground' || this.g.session.phase !== 'playing', 10);
        this.up('shift');
        this.up('w');
        continue;
      }
      this.ctx.turn++;
      if (this.style === 'eval' || this.style === 'eval_raw') yield* (c === 'kurenai' ? this.kurenaiEval() : c === 'raiyoku' ? this.raiyokuEval() : this.homuraEval());
      else if (this.style === 'signature') yield* (c === 'kurenai' ? this.kurenaiFire() : c === 'raiyoku' ? this.raiyokuSky() : this.homuraCharge());
      else if (this.style === 'rotation') yield* this.rotation();
      else yield* (c === 'kurenai' ? this.kurenaiBrawl() : c === 'raiyoku' ? this.raiyokuDiveBomb() : this.homuraBrawl());
    }
  }

  /** 出だし（採点役と同じ）：紅竜は前の塔へ急降下、雷翼は照準へ雷3秒、焔角は照準のビルへ突進。 */
  private *open(): Co {
    yield sleep(900);
    const c = this.creature;
    const s = this.body;
    if (c === 'kurenai') {
      const f = { x: Math.sin(s.yaw), z: Math.cos(s.yaw) };
      const first = this.list
        .map((b) => {
          const dist = Math.hypot(b.cx - s.pos.x, b.cz - s.pos.z);
          return { b, dist, cos: ((b.cx - s.pos.x) * f.x + (b.cz - s.pos.z) * f.z) / dist };
        })
        .filter((x) => x.b.h > 35 && x.cos > 0.85 && x.dist > 60)
        .sort((a, b) => a.dist - b.dist)[0];
      if (first) yield* this.aim(this.aimPt(first.b));
      if (this.style === 'signature') yield* this.hold('left', 2500);
      this.down('w');
      this.down('shift');
      yield until(() => this.mode === 'ground' || this.mode === 'landing', 12);
      this.up('shift');
      this.up('w');
    } else if (c === 'raiyoku') {
      if (this.style === 'brawler') return;
      yield* this.hold('left', 3000);
    } else {
      const a = this.g.aim;
      const tb = a && a.building >= 0 ? this.list[a.building] : null;
      if (tb) yield* this.approach(tb, { run: true });
      else {
        this.down('shift');
        this.down('w');
        yield sleep(2500);
        this.up('w');
        this.up('shift');
      }
    }
  }

  // ---- eval：採点役の組み立ての写し（evp_full.mjs の kurenaiTurn・raiyokuTurn・homuraTurn） ----
  private *kurenaiEval(): Co {
    const ctx = this.ctx;
    if (this.clock >= ctx.nextFly && this.clock < 165) {
      ctx.nextFly = this.clock + 35;
      const far = this.near(60, 220).filter((b) => b.edge > 90 && !ctx.attacked.has(b.id));
      const tgt = far[Math.floor(this.rnd() * Math.min(3, far.length))];
      yield* this.hold('space', 2000);
      if (tgt) yield* this.aim(this.aimPt(tgt), 2);
      this.down('w');
      const tw = this.clock;
      yield until(() => this.clock >= tw + 2.2, 10);
      this.down('shift');
      yield until(() => this.mode === 'ground' || this.g.session.phase !== 'playing', 10);
      this.up('shift');
      this.up('w');
      this.count('flyDive');
      return;
    }
    const cands = this.near(8, 140).filter((b) => (ctx.attacked.get(b.id) ?? 0) < 2 && !ctx.dead.has(b.id));
    const tgt = cands.sort((a, b) => a.edge - 0.08 * a.h - (b.edge - 0.08 * b.h))[0];
    if (!tgt) {
      yield* this.hold('w', 1500);
      return;
    }
    // 採点役の紅竜は崩れた建物も的に選ぶ（ctx.dead を紅竜では入れない）。eval では、ほかの2体と同じく照準が「建物なし」なら次の的へ
    if (!this.standing(tgt.id)) this.count('rubbleTarget');
    yield* this.react();
    if (this.style === 'eval') {
      yield* this.aim(this.aimPt(tgt));
      if (this.g.aim.building === -1) {
        ctx.dead.add(tgt.id);
        this.count('skipDead');
        return;
      }
    }
    if (tgt.edge > 14) yield* this.approach(tgt, { fire: tgt.edge < 90 });
    yield* this.aim(this.aimPt(tgt));
    yield* this.click('right');
    yield sleep(780);
    yield* this.aim(this.aimPt(tgt), 0.7);
    yield* this.click('right');
    yield sleep(780);
    yield* this.tap('q');
    yield sleep(1000);
    ctx.attacked.set(tgt.id, (ctx.attacked.get(tgt.id) ?? 0) + 1);
  }

  private *raiyokuEval(): Co {
    const ctx = this.ctx;
    if (this.mode === 'ground') {
      const near = this.near(8, 30).filter((b) => !ctx.dead.has(b.id))[0];
      if (near && !ctx.justTook) {
        yield* this.react();
        yield* this.aim(this.aimPt(near));
        yield* this.click('right');
        yield sleep(700);
        yield* this.tap('q');
        yield sleep(900);
        this.count('groundHit');
      }
      ctx.justTook = false;
      yield* this.hold('space', 2500);
      return;
    }
    if (this.clock >= ctx.nextDive && this.clock < 170) {
      ctx.nextDive = this.clock + 20;
      const cl = this.near(20, 160).filter((b) => !ctx.dead.has(b.id) && b.edge > 25)[0];
      if (cl) yield* this.aim({ x: cl.cx, y: 0, z: cl.cz }, 2);
      this.down('w');
      this.down('shift');
      yield until(() => this.mode === 'ground' || this.g.session.phase !== 'playing', 8);
      this.up('shift');
      this.up('w');
      this.count('dive');
      return;
    }
    const cands = this.near(15, 160).filter((b) => !ctx.dead.has(b.id) && (ctx.attacked.get(b.id) ?? 0) < 3 && b.edge > 20);
    const tgt = cands.sort((a, b) => a.edge - 0.15 * a.h - (b.edge - 0.15 * b.h))[0];
    if (!tgt) {
      yield* this.hold('w', 1500);
      return;
    }
    yield* this.react();
    yield* this.aim(this.aimPt(tgt));
    if (this.g.aim.building === -1) {
      ctx.dead.add(tgt.id);
      this.count('skipDead');
      return;
    }
    if (this.body.altitude < 35) yield* this.hold('space', 900);
    yield* this.boltAt(tgt, 2600, true);
    ctx.attacked.set(tgt.id, (ctx.attacked.get(tgt.id) ?? 0) + 1);
  }

  /** 雷（左長押し）を ms だけ。0.4秒ごとに狙い直す。walk なら W で寄り、縁まで 25m で止まる。 */
  private *boltAt(tgt: Bld, ms: number, walk: boolean): Co {
    if (walk) this.down('w');
    this.down('left');
    const t0 = this.clock;
    for (let i = 1; ; i++) {
      yield sleep(120);
      if (this.g.session.phase !== 'playing' || this.clock - t0 > ms / 1000) break;
      if (i % 3 === 0) yield* this.aim(this.aimPt(tgt), 0.5);
      if (walk && this.edgeTo(tgt) < 25 && this.held.has('w')) this.up('w');
    }
    this.up('left');
    if (this.held.has('w')) this.up('w');
    this.count('bolt');
  }

  private *homuraEval(): Co {
    const ctx = this.ctx;
    if (this.clock >= ctx.nextJump && this.clock < 170) {
      ctx.nextJump = this.clock + 25;
      const cl = this.near(8, 40).filter((b) => !ctx.dead.has(b.id))[0];
      if (cl) yield* this.aim(this.aimPt(cl), 1);
      this.down('w');
      yield* this.tap('space');
      yield sleep(1800);
      this.up('w');
      this.count('jump');
      return;
    }
    const cands = this.near(8, 140).filter((b) => (ctx.attacked.get(b.id) ?? 0) < 2 && !ctx.dead.has(b.id));
    const tgt = cands.sort((a, b) => a.edge - 0.08 * a.h - (b.edge - 0.08 * b.h))[0];
    if (!tgt) {
      yield* this.hold('w', 1500);
      return;
    }
    yield* this.react();
    yield* this.aim(this.aimPt(tgt));
    if (this.g.aim.building === -1) {
      ctx.dead.add(tgt.id);
      this.count('skipDead');
      return;
    }
    if (tgt.edge > 60 && this.rnd() < 0.5) {
      yield* this.aim(this.aimPt(tgt));
      yield* this.hold('left', 2500);
      this.count('lava');
      ctx.attacked.set(tgt.id, (ctx.attacked.get(tgt.id) ?? 0) + 1);
      return;
    }
    if (tgt.edge > 14) yield* this.approach(tgt, { run: true });
    yield* this.aim(this.aimPt(tgt));
    yield* this.click('right');
    yield sleep(800);
    yield* this.tap('q');
    yield sleep(1000);
    ctx.attacked.set(tgt.id, (ctx.attacked.get(tgt.id) ?? 0) + 1);
  }

  // ---- signature：札の一行どおり、その怪獣の得意技に寄せる ----
  /** 紅竜「炎で焼き、燃え広がりで街区ごと落とす」：60m まで寄って炎を3秒、近ければ爪。40秒ごとに飛んで別の街区へ急降下 */
  private *kurenaiFire(): Co {
    const ctx = this.ctx;
    if (this.mode !== 'ground') {
      // 空中なら照準の先へ急降下
      this.down('w');
      this.down('shift');
      yield until(() => this.mode === 'ground' || this.g.session.phase !== 'playing', 10);
      this.up('shift');
      this.up('w');
      return;
    }
    if (this.clock >= ctx.nextFly && this.clock < 165) {
      ctx.nextFly = this.clock + 40 * (0.85 + 0.3 * this.rnd());
      const far = this.near(25, 260).filter((b) => b.edge > 110 && this.standing(b.id) && !ctx.attacked.has(b.id));
      const tgt = this.pickTop(far, 3);
      yield* this.hold('space', 1800);
      if (tgt) yield* this.aim(this.aimPt(tgt), 2);
      yield* this.hold('w', 1800);
      if (tgt) yield* this.aim(this.aimPt(tgt), 1);
      yield* this.hold('left', 1500);
      this.count('flyDive');
      return;
    }
    const cands = this.near(10, 160).filter((b) => this.standing(b.id) && (ctx.attacked.get(b.id) ?? 0) < 2);
    const tgt = this.pickTop(
      cands.sort((a, b) => a.edge - 0.1 * a.h - (b.edge - 0.1 * b.h)),
      3,
    );
    if (!tgt) {
      yield* this.hold('w', 1500);
      return;
    }
    yield* this.react();
    if (tgt.edge > 60) yield* this.approach(tgt, { fire: tgt.edge < 120, run: tgt.edge > 120, stop: 55 });
    yield* this.aim(this.aimPt(tgt), 0.7);
    this.down('left');
    const t0 = this.clock;
    const burn = 2.6 + this.rnd() * 1.2;
    for (let i = 1; this.clock - t0 < burn && this.g.session.phase === 'playing'; i++) {
      yield sleep(100);
      if (!this.standing(tgt.id)) break;
      if (i % 5 === 0) yield* this.aim(this.aimPt(tgt), 0.5);
    }
    this.up('left');
    if (this.standing(tgt.id) && this.edgeTo(tgt) < 30) {
      yield* this.aim(this.aimPt(tgt), 0.7);
      yield* this.click('right');
      yield sleep(750);
    }
    ctx.attacked.set(tgt.id, (ctx.attacked.get(tgt.id) ?? 0) + 1);
    this.count('burn');
  }

  /** 雷翼「空から雷。当たったビルから隣のビルへ跳ねる」：高さ45m 以上を保ち、建物の集まった所へ雷を3秒ずつ。30秒ごとに急降下して飛び直す */
  private *raiyokuSky(): Co {
    const ctx = this.ctx;
    if (this.mode === 'ground' || this.mode === 'landing') {
      yield* this.hold('space', 2400);
      return;
    }
    if (this.clock >= ctx.nextDive && this.clock < 170) {
      ctx.nextDive = this.clock + 30 * (0.85 + 0.3 * this.rnd());
      const at = this.cluster(12, 170, 8);
      if (at) yield* this.aim({ ...at, y: 0 }, 2);
      this.down('w');
      this.down('shift');
      yield until(() => this.mode === 'ground' || this.g.session.phase !== 'playing', 8);
      this.up('shift');
      this.up('w');
      this.count('dive');
      return;
    }
    // 照準の的：空から目立つ高さ20m 以上の立っている建物のうち、まわり50m に12m 以上の建物が多いもの（跳ねる先が多い所を狙う）
    const cands = this.near(20, 170).filter((b) => this.standing(b.id) && b.edge > 25 && (ctx.attacked.get(b.id) ?? 0) < 3);
    const scored = cands.slice(0, 24).map((b) => ({ b, n: nearest(this.list, b.cx, b.cz, 12, 50).filter((o) => this.standing(o.id)).length }));
    scored.sort((a, b) => b.n - a.n || a.b.edge - b.b.edge);
    const tgt = this.pickTop(
      scored.map((s) => s.b),
      3,
    );
    if (!tgt) {
      yield* this.hold('w', 1500);
      return;
    }
    yield* this.react();
    if (this.body.altitude < 45) yield* this.hold('space', 800);
    yield* this.aim(this.aimPt(tgt));
    if (this.g.aim.building === -1) {
      ctx.dead.add(tgt.id);
      this.count('skipDead');
      return;
    }
    yield* this.boltAt(tgt, 3000, tgt.edge > 90);
    ctx.attacked.set(tgt.id, (ctx.attacked.get(tgt.id) ?? 0) + 1);
  }

  /** 焔角「地を駆けて突進。溶岩と地割れで押し崩す」：的へ突進してぶつかり角1回。遠い的は3回に1回、礫を1.6秒。20秒ごとに集まった所へ跳ぶ */
  private *homuraCharge(): Co {
    const ctx = this.ctx;
    if (this.clock >= ctx.nextJump && this.clock < 170) {
      ctx.nextJump = this.clock + 20 * (0.85 + 0.3 * this.rnd());
      const at = this.cluster(8, 60, 6);
      if (at) yield* this.aim(at, 1);
      this.down('w');
      yield* this.tap('space');
      yield sleep(1800);
      this.up('w');
      this.count('jump');
      return;
    }
    const cands = this.near(10, 160).filter((b) => this.standing(b.id) && (ctx.attacked.get(b.id) ?? 0) < 2);
    const tgt = this.pickTop(
      cands.sort((a, b) => a.edge - 0.1 * a.h - (b.edge - 0.1 * b.h)),
      3,
    );
    if (!tgt) {
      yield* this.hold('w', 1500);
      return;
    }
    yield* this.react();
    if (tgt.edge > 50 && ctx.turn % 3 === 0) {
      yield* this.aim(this.aimPt(tgt));
      yield* this.hold('left', 1600);
      this.count('lava');
    }
    if (this.standing(tgt.id)) {
      yield* this.approach(tgt, { run: true, stop: 12.5, maxSec: 4 });
      this.count('charge');
      yield* this.aim(this.aimPt(tgt), 0.7);
      yield* this.click('right');
      yield sleep(850);
    }
    ctx.attacked.set(tgt.id, (ctx.attacked.get(tgt.id) ?? 0) + 1);
  }

  // ---- rotation：案内の順に全部の技を回す ----
  /**
   * いちばん近い立っている建物（高さ10m 以上）へ寄り（遠ければ走る・突進）、主砲を1.5秒、近ければ右クリック2回と Q。
   * 飛べる怪獣は30秒ごとに飛び上がって次の的へ急降下、焔角は30秒ごとに跳んでのしかかる。空中にいたら急降下で降りる
   */
  private *rotation(): Co {
    const ctx = this.ctx;
    const c = this.creature;
    if (this.mode === 'air' || this.mode === 'dive') {
      this.down('w');
      this.down('shift');
      yield until(() => this.mode === 'ground' || this.mode === 'landing' || this.g.session.phase !== 'playing', 10);
      this.up('shift');
      this.up('w');
      return;
    }
    if (this.clock >= ctx.nextFly && this.clock < 165) {
      ctx.nextFly = this.clock + 30 * (0.85 + 0.3 * this.rnd());
      const far = this.near(15, 240).filter((b) => b.edge > 70 && this.standing(b.id));
      const tgt = this.pickTop(far, 3);
      if (tgt) yield* this.aim(this.aimPt(tgt), 1.5);
      if (c === 'homuratsuno') {
        this.down('w');
        yield* this.tap('space');
        yield sleep(1800);
        this.up('w');
        this.count('jump');
        return;
      }
      yield* this.hold('space', 1800);
      if (tgt) yield* this.aim(this.aimPt(tgt), 1.5);
      yield* this.hold('w', 1500);
      this.count('flyDive');
      return;
    }
    const tgt = this.pickTop(
      this.near(10, 180).filter((b) => this.standing(b.id) && (ctx.attacked.get(b.id) ?? 0) < 2),
      2,
    );
    if (!tgt) {
      yield* this.hold('w', 1500);
      return;
    }
    yield* this.react();
    const reach = c === 'homuratsuno' ? 70 : 45;
    if (tgt.edge > reach) yield* this.approach(tgt, { run: tgt.edge > 90, stop: reach - 5 });
    yield* this.aim(this.aimPt(tgt), 0.7);
    yield* this.hold('left', 1500);
    if (this.standing(tgt.id)) {
      if (this.edgeTo(tgt) > 14) yield* this.approach(tgt, { run: c === 'homuratsuno', maxSec: 4 });
      for (let k = 0; k < 2 && this.standing(tgt.id); k++) {
        yield* this.aim(this.aimPt(tgt), 0.7);
        yield* this.click('right');
        yield sleep(800);
      }
      yield* this.tap('q');
      yield sleep(1000);
    }
    ctx.attacked.set(tgt.id, (ctx.attacked.get(tgt.id) ?? 0) + 1);
    this.count('rotation');
  }

  // ---- brawler：近くを殴る ----
  /** 紅竜：いちばん近い立っている建物へ走って、爪3回と尾。飛ばない */
  private *kurenaiBrawl(): Co {
    const ctx = this.ctx;
    const tgt = this.pickTop(
      this.near(8, 200).filter((b) => this.standing(b.id) && (ctx.attacked.get(b.id) ?? 0) < 2),
      2,
    );
    if (!tgt) {
      yield* this.hold('w', 1500);
      return;
    }
    yield* this.react();
    if (tgt.edge > 14) yield* this.approach(tgt, { run: tgt.edge > 50 });
    for (let k = 0; k < 3 && this.standing(tgt.id); k++) {
      yield* this.aim(this.aimPt(tgt), 0.7);
      yield* this.click('right');
      yield sleep(700);
    }
    yield* this.tap('q');
    yield sleep(950);
    ctx.attacked.set(tgt.id, (ctx.attacked.get(tgt.id) ?? 0) + 1);
    this.count('brawl');
  }

  /** 雷翼：空から的のビルの足もとへ急降下して、翼2回と尾。すぐ飛び直す（地上は遅いので歩かない） */
  private *raiyokuDiveBomb(): Co {
    const ctx = this.ctx;
    if (this.mode === 'ground' || this.mode === 'landing') {
      const near = this.near(8, 40).filter((b) => this.standing(b.id))[0];
      if (near && !ctx.justTook) {
        yield* this.react();
        for (let k = 0; k < 2 && this.standing(near.id); k++) {
          yield* this.aim(this.aimPt(near), 0.7);
          yield* this.click('right');
          yield sleep(800);
        }
        yield* this.tap('q');
        yield sleep(900);
        this.count('groundHit');
      }
      ctx.justTook = false;
      yield* this.hold('space', 2200);
      return;
    }
    const cands = this.near(10, 200).filter((b) => this.standing(b.id) && b.edge > 30 && (ctx.attacked.get(b.id) ?? 0) < 2);
    const tgt = this.pickTop(
      cands.sort((a, b) => a.edge - 0.1 * a.h - (b.edge - 0.1 * b.h)),
      3,
    );
    if (!tgt) {
      yield* this.hold('w', 1500);
      return;
    }
    yield* this.react();
    if (this.body.altitude < 40) yield* this.hold('space', 1000);
    yield* this.aim({ x: tgt.cx, y: 0, z: tgt.cz }, 1.5);
    this.down('w');
    this.down('shift');
    yield until(() => this.mode === 'ground' || this.mode === 'landing' || this.g.session.phase !== 'playing', 8);
    this.up('shift');
    this.up('w');
    ctx.attacked.set(tgt.id, (ctx.attacked.get(tgt.id) ?? 0) + 1);
    this.count('dive');
  }

  /** 焔角：歩いて（突進せずに）いちばん近い建物へ、角2回と尾の鎚。15秒ごとにその場で跳んでのしかかる */
  private *homuraBrawl(): Co {
    const ctx = this.ctx;
    if (this.clock >= ctx.nextJump && this.clock < 170) {
      ctx.nextJump = this.clock + 15 * (0.85 + 0.3 * this.rnd());
      yield* this.tap('space');
      yield sleep(1800);
      this.count('jump');
      return;
    }
    const tgt = this.pickTop(
      this.near(8, 200).filter((b) => this.standing(b.id) && (ctx.attacked.get(b.id) ?? 0) < 2),
      2,
    );
    if (!tgt) {
      yield* this.hold('w', 1500);
      return;
    }
    yield* this.react();
    if (tgt.edge > 14) yield* this.approach(tgt, { maxSec: 8 });
    for (let k = 0; k < 2 && this.standing(tgt.id); k++) {
      yield* this.aim(this.aimPt(tgt), 0.7);
      yield* this.click('right');
      yield sleep(850);
    }
    yield* this.tap('q');
    yield sleep(1000);
    ctx.attacked.set(tgt.id, (ctx.attacked.get(tgt.id) ?? 0) + 1);
    this.count('brawl');
  }
}

/** 1回の3分（＋時間切れの後少し）を人に近い遊び方で回し、数字を返す。record なら入力の列も返す。 */
export function playHuman(m: HumanMods, creature: Creature, style: Style, seed: number, record = false, trace = false): HumanRun {
  const game = new m.Game(m.city, m.index, undefined, creature);
  const input = new m.InputState();
  const bot = new Bot(game, input, m, creature, style, seed, record);
  const score = game.score;
  const destructionByCause: Record<string, number> = {};
  const rageByCause: Record<string, number> = {};
  const destructionByKind: Record<string, number> = {};
  const stages: [number, number, number, string, number][] = [];
  const bodyTrace: [number, number, number, string, number][] = [];
  const releases: { t: number; kind: string; mode: string }[] = [];
  game.bus.on('rage.release', (e: { t: number; kind: string }) => releases.push({ t: e.t, kind: e.kind, mode: game.body.mode }));
  // 段階が進むたびの破壊と怒り：点数の関数をこの回だけ包んで、原因ごとに足す（遊びの本体は変えない）
  const onStage = score.onStage.bind(score);
  score.onStage = (id: number, stage: number, player: boolean, cause: string) => {
    const v0 = score.destroyedVolume;
    const r0 = score.rage;
    const res = onStage(id, stage, player, cause);
    const dv = ((score.destroyedVolume - v0) / score.totalVolume) * 100;
    destructionByCause[cause] = (destructionByCause[cause] ?? 0) + dv;
    rageByCause[cause] = (rageByCause[cause] ?? 0) + (score.rage - r0);
    const kind = m.city.buildings[id].kind;
    destructionByKind[kind] = (destructionByKind[kind] ?? 0) + dv;
    if (trace) stages.push([Math.round(game.clock * 100) / 100, id, stage, cause, Math.round(dv * 1e4) / 1e4]);
    return res;
  };
  game.start();
  const clocks: number[] = [];
  const des: number[] = [];
  let rageFull: number | null = null;
  let endDestruction: number | null = null;
  for (let k = 0; k < Math.round(200 / DT) && game.session.phase !== 'result'; k++) {
    bot.tick(k);
    game.step(DT, m.readControls(input));
    clocks.push(game.clock);
    des.push(score.destruction * 100);
    if (rageFull === null && score.rageFull) rageFull = game.clock;
    if (game.session.phase === 'result' && endDestruction === null) endDestruction = score.destruction * 100;
    if (trace && k % 30 === 0) bodyTrace.push([Math.round(game.clock * 100) / 100, Math.round(game.body.pos.x), Math.round(game.body.pos.z), game.body.mode, Math.round(game.body.altitude)]);
  }
  const at = (t: number): number => {
    let lo = 0;
    let hi = clocks.length - 1;
    if (clocks[hi] < t) return des[hi];
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (clocks[mid] >= t) hi = mid;
      else lo = mid + 1;
    }
    return des[lo];
  };
  const end = game.endedAt ?? game.clock;
  const specials: SpecialUse[] = releases.map((s) => ({
    ...s,
    gain3: Math.round((at(Math.min(end, s.t + 3)) - at(s.t)) * 1000) / 1000,
    gain8: Math.round((at(Math.min(end, s.t + 8)) - at(s.t)) * 1000) / 1000,
    truncated: s.t + 3 > end,
  }));
  const round = (o: Record<string, number>): Record<string, number> => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));
  const stats = game.endStats ?? game.stats;
  return {
    creature,
    style,
    seed,
    destruction: Math.round((endDestruction ?? score.destruction * 100) * 1000) / 1000,
    yen: Math.round(score.yen),
    maxCombo: score.maxCombo,
    collapsed: game.damage.tally().collapsed + game.damage.tally().collapsing,
    endedAt: game.endedAt,
    rageFull: rageFull === null ? null : Math.round(rageFull * 100) / 100,
    specials,
    destructionByCause: round(destructionByCause),
    rageByCause: round(rageByCause),
    destructionByKind: round(destructionByKind),
    timeline: [30, 60, 90, 120, 150, 180].map((t) => Math.round(at(t) * 100) / 100),
    stats: Object.fromEntries(Object.entries(stats as Record<string, number>).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    log: bot.log,
    ...(record ? { inputs: bot.inputs } : {}),
    ...(trace ? { trace: { stages, body: bodyTrace } } : {}),
  };
}

/** 中央値・最小・最大（数が無ければ null）。 */
export function spread(xs: readonly number[]): { median: number; min: number; max: number; n: number } | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return { median: Math.round(median * 1000) / 1000, min: s[0], max: s[s.length - 1], n: s.length };
}
