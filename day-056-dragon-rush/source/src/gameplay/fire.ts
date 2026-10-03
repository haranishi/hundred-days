// OWNER: gameplay
// 燃え広がりの規則（純データ・乱数なし）。当たった高さから燃え始め、炎は壁を上へ広がる。
// 燃えている建物は、隙間 neighborGap 以内の建物へ熱を送り、熱が 1 を超えると燃え移る。
// 燃料が尽きると弱まって消え、焦げ跡（DamageState.char）が残る。
import { BUILDING_RULES, FIRE } from '../config/gameplay';
import type { CityData } from '../world/types';
import type { CityIndex } from '../world/query';
import { STAGE, type DamageState } from './damage';

export interface Ignition {
  id: number;
  /** 燃え移った元の建物（竜が直接燃やしたときは null） */
  from: number | null;
  y: number;
}

/** 外形どうしの隙間（m）。重なっていれば 0。 */
function rectGap(a: CityData['buildings'][number]['footprint'], b: CityData['buildings'][number]['footprint']): number {
  const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
  const dz = Math.max(0, a.z0 - b.z1, b.z0 - a.z1);
  return Math.hypot(dx, dz);
}

export class FireState {
  readonly burn: Float32Array;
  readonly heat: Float32Array;
  readonly fuel: Float32Array;
  /** 燃えている高さの範囲（m） */
  readonly fireLow: Float32Array;
  readonly fireHigh: Float32Array;
  /** 燃えている建物（燃え始めた順） */
  readonly burning = new Set<number>();
  /** 燃え移り先の一覧（CSR 形式：neighborStart[i]..neighborStart[i+1] が i の隣） */
  private readonly neighborStart: Int32Array;
  private readonly neighborIds: Int32Array;
  private readonly neighborGaps: Float32Array;

  constructor(
    private readonly city: CityData,
    index: CityIndex,
  ) {
    const n = city.buildings.length;
    this.burn = new Float32Array(n);
    this.heat = new Float32Array(n);
    this.fuel = new Float32Array(n);
    this.fireLow = new Float32Array(n);
    this.fireHigh = new Float32Array(n);
    const start = new Int32Array(n + 1);
    const ids: number[] = [];
    const gaps: number[] = [];
    for (const b of city.buildings) {
      start[b.id] = ids.length;
      const f = b.footprint;
      const reach = Math.hypot(f.x1 - f.x0, f.z1 - f.z0) / 2 + FIRE.neighborGap;
      const near = index.buildingsNear((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2, reach).sort((p, q) => p.id - q.id);
      for (const o of near) {
        if (o.id === b.id) continue;
        const g = rectGap(f, o.footprint);
        if (g <= FIRE.neighborGap) {
          ids.push(o.id);
          gaps.push(g);
        }
      }
    }
    start[n] = ids.length;
    this.neighborStart = start;
    this.neighborIds = Int32Array.from(ids);
    this.neighborGaps = Float32Array.from(gaps);
    this.reset();
  }

  reset(): void {
    this.burn.fill(0);
    this.heat.fill(0);
    this.fireLow.fill(0);
    this.fireHigh.fill(0);
    this.burning.clear();
    this.city.buildings.forEach((b, i) => (this.fuel[i] = BUILDING_RULES[b.kind].fuelSeconds));
  }

  /** 燃え移り先の id と隙間。 */
  neighborsOf(id: number): { id: number; gap: number }[] {
    const out: { id: number; gap: number }[] = [];
    for (let k = this.neighborStart[id]; k < this.neighborStart[id + 1]; k++) out.push({ id: this.neighborIds[k], gap: this.neighborGaps[k] });
    return out;
  }

  /** 熱を足す（燃えやすさを掛ける）。1 を超えたら着火して ignitions に足す。 */
  addHeat(id: number, amount: number, y: number, damage: DamageState, ignitions: Ignition[], from: number | null = null): void {
    if (this.burning.has(id) || this.fuel[id] <= 0 || !damage.isStanding(id)) return;
    const b = this.city.buildings[id];
    this.heat[id] += amount * BUILDING_RULES[b.kind].flammability;
    if (this.heat[id] < 1) return;
    const base = b.masses[0].y0;
    const cy = Math.min(Math.max(y, base + 1), b.height - 1);
    this.burning.add(id);
    this.burn[id] = FIRE.igniteBurn;
    this.fireLow[id] = Math.max(base, cy - FIRE.initialSpan / 2);
    this.fireHigh[id] = Math.min(b.height, cy + FIRE.initialSpan / 2);
    ignitions.push({ id, from, y: cy });
  }

  update(dt: number, damage: DamageState, ignitions: Ignition[]): void {
    for (const id of [...this.burning]) {
      const b = this.city.buildings[id];
      const rule = BUILDING_RULES[b.kind];
      if (damage.stage[id] >= STAGE.collapse) {
        // 崩れた建物は瓦礫の中でくすぶって消える
        this.fuel[id] = 0;
        this.burn[id] = Math.max(0, this.burn[id] - 0.35 * dt);
      } else if (this.fuel[id] > 0) {
        this.burn[id] = Math.min(1, this.burn[id] + FIRE.growRate * dt);
        this.fuel[id] = Math.max(0, this.fuel[id] - dt * (0.5 + 0.5 * this.burn[id]));
      } else {
        this.burn[id] = Math.max(0, this.burn[id] - FIRE.decayRate * dt);
      }
      const burn = this.burn[id];
      if (burn <= 0) {
        this.burning.delete(id);
        continue;
      }
      if (damage.stage[id] >= STAGE.collapse) continue;
      this.fireHigh[id] = Math.min(b.height, this.fireHigh[id] + FIRE.climbRate * burn * dt);
      this.fireLow[id] = Math.max(b.masses[0].y0, this.fireLow[id] - FIRE.sinkRate * burn * dt);
      damage.addChar(id, FIRE.charRate * burn * dt);
      const f = b.footprint;
      damage.hit(id, FIRE.damagePerSecond * rule.flammability * damage.hp[id] * burn * dt, {
        cause: 'fire',
        fromX: (f.x0 + f.x1) / 2,
        fromZ: (f.z0 + f.z1) / 2,
        y: (this.fireLow[id] + this.fireHigh[id]) / 2,
        player: false,
      });
      if (burn < FIRE.spreadMinBurn) continue;
      const midY = (this.fireLow[id] + this.fireHigh[id]) / 2;
      for (let k = this.neighborStart[id]; k < this.neighborStart[id + 1]; k++) {
        const j = this.neighborIds[k];
        const heat = (burn * FIRE.spreadRate * dt) / (1 + this.neighborGaps[k] / FIRE.gapScale);
        this.addHeat(j, heat, Math.min(midY, this.city.buildings[j].height * 0.6), damage, ignitions, id);
      }
    }
  }
}
