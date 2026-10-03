// OWNER: gameplay
// 建物ごとの壊れ方の状態（純データ）。ひび → 外壁の剥がれ → 傾き → 崩落 → 瓦礫、の順に1段ずつ進む。
// 損傷が一度に耐久を超えても、各段階を最低 minDwell 秒は見せてから次へ進める（一瞬で消す作りにしない）。
// 描画（city/damageTexture.ts）・点数・燃え広がり・当たり判定が、同じ配列を読む。
import { BUILDING_RULES, HP, STAGES } from '../config/gameplay';
import { hash01 } from '../core/rng';
import type { DamageCause } from '../core/events';
import type { Building, CityData } from '../world/types';
import { clamp } from './math';

export const STAGE = { intact: 0, crack: 1, peel: 2, tilt: 3, collapse: 4, rubble: 5 } as const;
export type StageId = (typeof STAGE)[keyof typeof STAGE];
/** 出来事になる段階（ひび・剥がれ・傾き・崩落）。瓦礫は崩落の終わりで、出来事は出さない */
export type StageStep = 1 | 2 | 3 | 4;

/** この秒数以内に竜の直接の攻撃があれば、段階の進みを竜の手柄にする（連鎖に数える）。 */
const PLAYER_CREDIT_SECONDS = 2.5;

export interface HitSource {
  cause: DamageCause;
  /** 攻撃した側の位置（倒れる向きは、ここから建物の中心へ向かう向き） */
  fromX: number;
  fromZ: number;
  /** 当たった高さ（ひびと炎の中心） */
  y: number;
  /** 竜の直接の攻撃か */
  player: boolean;
}

export interface StageChange {
  id: number;
  stage: StageStep;
  cause: DamageCause;
  player: boolean;
}

/**
 * r03-fx：割れる高さ（m、純データ）。指摘「ビルが1つの箱のまま傾いて沈む」。傾きに入る瞬間の当たった高さに最も近い
 * 階の境目で上下に割る（外壁の階の帯と同じ割り付け：1階の上から階高ごと）。上の塊は2階分（高さの45%まで）、下は1階分
 * （高さの30%まで）以上を残す。見た目のための値で、遊びの規則（耐久・段階・点数）は読まない。
 */
export function splitHeight(b: Building, impactY: number): number {
  const base = b.masses[0].y0;
  const f = b.facade;
  // ガラスの高層は、基壇（階高 4.6m）と塔（塔の根元から階高ごと）で階の割り付けが違う（city/buildingGeometry.ts と同じ）
  const m = b.masses.find((mm) => impactY >= mm.y0 && impactY <= mm.y1) ?? b.masses[b.masses.length - 1];
  const tower = b.kind === 'glassTower' && m !== b.masses[0];
  const floorH = b.kind === 'glassTower' && !tower && b.masses.length > 1 ? 4.6 : f.floorHeight;
  const first = tower ? m.y0 : base + f.groundFloor;
  const lo = base + Math.min(Math.max(f.groundFloor, floorH), (b.height - base) * 0.3);
  const hi = b.height - Math.min(2 * floorH, (b.height - base) * 0.45);
  const y = Math.min(hi, Math.max(lo, impactY));
  const k = Math.round((y - first) / floorH);
  const line = first + k * floorH;
  if (line >= lo - 1e-6 && line <= hi + 1e-6) return line;
  // 階の境目が範囲に無い（低い建物）：範囲の中の近い方の境目、無ければ範囲の中の高さ
  const up = first + Math.ceil((lo - first) / floorH) * floorH;
  return up <= hi ? up : y;
}

export function buildingHp(b: Building): number {
  return HP.scale * BUILDING_RULES[b.kind].toughness * Math.pow(b.volume, HP.exponent);
}

/** 損傷の割合から、進むべき段階（0〜4）。 */
export function stageForFraction(f: number): StageId {
  let s = 0;
  for (const th of STAGES.thresholds) if (f >= th) s++;
  return s as StageId;
}

/** 窓の枚数の目安（外壁の面積 ÷ 窓1枚の区画）。 */
function paneCount(b: Building): number {
  let area = 0;
  for (const m of b.masses) area += 2 * (m.rect.x1 - m.rect.x0 + (m.rect.z1 - m.rect.z0)) * (m.y1 - m.y0);
  return Math.max(4, Math.round(area / Math.max(1, b.facade.bayWidth * b.facade.floorHeight)));
}

export class DamageState {
  readonly count: number;
  readonly hp: Float32Array;
  readonly damage: Float32Array;
  readonly stage: Uint8Array;
  /** 今の段階に入ってからの秒数 */
  readonly stageAge: Float32Array;
  /** 見た目の量（0〜1）。描画はこれを読む */
  readonly crack: Float32Array;
  readonly peel: Float32Array;
  readonly glass: Float32Array;
  readonly char: Float32Array;
  /** 傾き（ラジアン）と崩落の進み（0〜1） */
  readonly tilt: Float32Array;
  readonly collapse: Float32Array;
  /** 最後に当たった高さ（m） */
  readonly impactY: Float32Array;
  /** 倒れる向き（水平の単位ベクトル）と、支点（外形のその向きの辺の中点） */
  readonly dirX: Float32Array;
  readonly dirZ: Float32Array;
  readonly pivotX: Float32Array;
  readonly pivotZ: Float32Array;
  /** 外形の中心から支点までの距離（傾いたとき、浮く側を沈めて根元を地面に付けておくのに使う） */
  readonly reach: Float32Array;
  /** r03-fx：割れる高さ（m）。傾きに入った瞬間に決める（splitHeight）。描画と効果が読む見た目の値 */
  readonly splitY: Float32Array;
  readonly collapseSeconds: Float32Array;
  readonly panes: Float32Array;
  private readonly sinceHit: Float32Array;
  private readonly lastCause: DamageCause[];
  private readonly lastPlayerCause: DamageCause[];
  private readonly active = new Set<number>();

  constructor(private readonly city: CityData) {
    const n = city.buildings.length;
    this.count = n;
    const f32 = (): Float32Array => new Float32Array(n);
    this.hp = f32();
    this.damage = f32();
    this.stage = new Uint8Array(n);
    this.stageAge = f32();
    this.crack = f32();
    this.peel = f32();
    this.glass = f32();
    this.char = f32();
    this.tilt = f32();
    this.collapse = f32();
    this.impactY = f32();
    this.dirX = f32();
    this.dirZ = f32();
    this.pivotX = f32();
    this.pivotZ = f32();
    this.reach = f32();
    this.splitY = f32();
    this.collapseSeconds = f32();
    this.panes = f32();
    this.sinceHit = f32();
    this.lastCause = new Array<DamageCause>(n).fill('fire');
    this.lastPlayerCause = new Array<DamageCause>(n).fill('claw');
    city.buildings.forEach((b, i) => {
      this.hp[i] = buildingHp(b);
      this.collapseSeconds[i] = STAGES.collapseSeconds.base + STAGES.collapseSeconds.perMeter * b.height;
      this.panes[i] = paneCount(b);
    });
    this.reset();
  }

  reset(): void {
    this.damage.fill(0);
    this.stage.fill(STAGE.intact);
    this.stageAge.fill(0);
    this.crack.fill(0);
    this.peel.fill(0);
    this.glass.fill(0);
    this.char.fill(0);
    this.tilt.fill(0);
    this.collapse.fill(0);
    this.splitY.fill(0);
    this.sinceHit.fill(1e6);
    this.active.clear();
    this.city.buildings.forEach((b, i) => {
      // 倒れる向きの初期値は id から決める（炎だけで倒れたとき用）
      const a = hash01(b.id, 7331) * Math.PI * 2;
      this.setDirection(i, Math.sin(a), Math.cos(a));
      this.impactY[i] = b.height * 0.5;
    });
  }

  building(id: number): Building {
    return this.city.buildings[id];
  }

  /** 立っている（崩落が始まっていない）か。 */
  isStanding(id: number): boolean {
    return this.stage[id] < STAGE.collapse;
  }

  fraction(id: number): number {
    return this.damage[id] / this.hp[id];
  }

  /** 損傷を与える。炎による損傷は種類ごとの上限（fireDamageCap）までしか進めない。 */
  hit(id: number, amount: number, src: HitSource): void {
    if (amount <= 0 || this.stage[id] >= STAGE.collapse) return;
    const b = this.city.buildings[id];
    if (src.cause === 'fire') {
      const cap = this.hp[id] * BUILDING_RULES[b.kind].fireDamageCap;
      if (this.damage[id] >= cap) return;
      this.damage[id] = Math.min(cap, this.damage[id] + amount);
    } else {
      this.damage[id] += amount;
    }
    this.lastCause[id] = src.cause;
    if (src.player) {
      this.sinceHit[id] = 0;
      this.lastPlayerCause[id] = src.cause;
      this.impactY[id] = clamp(src.y, b.masses[0].y0 + 1, b.height - 1);
      // 傾き始めるまでは、最後に殴られた向きへ倒れる
      if (this.stage[id] < STAGE.tilt) {
        const cx = (b.footprint.x0 + b.footprint.x1) / 2;
        const cz = (b.footprint.z0 + b.footprint.z1) / 2;
        const dx = cx - src.fromX;
        const dz = cz - src.fromZ;
        const l = Math.hypot(dx, dz);
        if (l > 1e-3) this.setDirection(id, dx / l, dz / l);
      }
    }
    this.active.add(id);
  }

  /** 窓を割る（0〜1 の割合まで）。新しく割れた枚数の目安を返す。 */
  breakGlass(id: number, fraction: number): number {
    const prev = this.glass[id];
    const next = Math.min(1, Math.max(prev, fraction));
    if (next <= prev) return 0;
    this.glass[id] = next;
    return Math.round((next - prev) * this.panes[id]);
  }

  addChar(id: number, amount: number): void {
    this.char[id] = Math.min(1, this.char[id] + amount);
  }

  /** 時間を進め、段階が進んだものを changes に足す。 */
  update(dt: number, changes: StageChange[]): void {
    const th = STAGES.thresholds;
    for (const id of this.active) {
      this.stageAge[id] += dt;
      this.sinceHit[id] += dt;
      const f = this.damage[id] / this.hp[id];
      let s = this.stage[id] as StageId;
      const want = stageForFraction(f);
      const dwell = s === STAGE.intact ? 0 : s <= STAGE.tilt ? STAGES.minDwell[s - 1] : Infinity;
      if (s < STAGE.collapse && want > s && this.stageAge[id] >= dwell) {
        const next = (s + 1) as StageStep;
        s = next;
        this.stage[id] = next;
        this.stageAge[id] = 0;
        this.glass[id] = Math.max(this.glass[id], STAGES.glassByStage[next]);
        if (next === STAGE.tilt) {
          this.fixPivot(id);
          this.splitY[id] = splitHeight(this.city.buildings[id], this.impactY[id]);
        }
        const credited = this.sinceHit[id] <= PLAYER_CREDIT_SECONDS;
        changes.push({ id, stage: next, cause: credited ? this.lastPlayerCause[id] : this.lastCause[id], player: credited });
      }
      // 見た目の量を、段階と損傷の割合へ近づける
      const crackTarget = s >= STAGE.crack ? Math.min(1, 0.45 + 0.55 * clamp((f - th[0]) / (th[1] - th[0]), 0, 1)) : 0;
      const peelTarget = s >= STAGE.peel ? Math.min(1, 0.35 + 0.65 * clamp((f - th[1]) / (th[2] - th[1]), 0, 1)) : 0;
      this.crack[id] = Math.min(crackTarget, this.crack[id] + 2.5 * dt);
      this.peel[id] = Math.min(peelTarget, this.peel[id] + 1.4 * dt);
      let tiltTarget = 0;
      let tiltRate = STAGES.leanRate;
      if (s === STAGE.tilt) tiltTarget = STAGES.leanMax * clamp(0.3 + (0.7 * (f - th[2])) / (th[3] - th[2]), 0.3, 1);
      if (s >= STAGE.collapse) {
        tiltTarget = STAGES.leanMax + STAGES.collapseLean;
        tiltRate = STAGES.leanRate + (STAGES.collapseLean / this.collapseSeconds[id]) * 1.5;
        this.collapse[id] = Math.min(1, this.collapse[id] + dt / this.collapseSeconds[id]);
        if (this.collapse[id] >= 1 && s === STAGE.collapse) {
          this.stage[id] = STAGE.rubble;
          this.stageAge[id] = 0;
        }
      }
      this.tilt[id] = Math.min(tiltTarget, this.tilt[id] + tiltRate * dt);
      const settled =
        this.stage[id] === STAGE.rubble ||
        (s < STAGE.collapse && want <= s && this.crack[id] >= crackTarget && this.peel[id] >= peelTarget && this.tilt[id] >= tiltTarget);
      if (settled && this.sinceHit[id] > PLAYER_CREDIT_SECONDS) this.active.delete(id);
    }
  }

  /** 段階ごとの建物の数。 */
  tally(): { intact: number; cracked: number; peeled: number; tilted: number; collapsing: number; collapsed: number } {
    const c = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < this.count; i++) c[this.stage[i]]++;
    return { intact: c[0], cracked: c[1], peeled: c[2], tilted: c[3], collapsing: c[4], collapsed: c[5] };
  }

  private setDirection(id: number, x: number, z: number): void {
    this.dirX[id] = x;
    this.dirZ[id] = z;
    this.fixPivot(id);
  }

  /** 支点：外形の、倒れる向きの側の辺（向きに沿った支持関数の点）。 */
  private fixPivot(id: number): void {
    const f = this.city.buildings[id].footprint;
    const cx = (f.x0 + f.x1) / 2;
    const cz = (f.z0 + f.z1) / 2;
    const reach = (Math.abs(this.dirX[id]) * (f.x1 - f.x0)) / 2 + (Math.abs(this.dirZ[id]) * (f.z1 - f.z0)) / 2;
    this.reach[id] = reach;
    this.pivotX[id] = cx + this.dirX[id] * reach;
    this.pivotZ[id] = cz + this.dirZ[id] * reach;
  }
}
