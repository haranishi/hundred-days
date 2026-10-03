// OWNER: gameplay
// 点数：被害総額（円）・破壊率・連鎖と倍率・怒り。段階が1つ進むたびに、その段階の「壊れた割合」の差分を足す。
// 連鎖は竜の直接の攻撃で段階が進むたびに1つ伸び、windowSeconds 以内に次が無ければ 0 に戻る。
// 倍率は連鎖から決まり、上がるときは即座に、連鎖が切れたらゆっくり 1 へ戻る（倍率の減衰）。
import { BUILDING_RULES, COMBO, RAGE, STAGES } from '../config/gameplay';
import type { DamageCause } from '../core/events';
import type { CityData } from '../world/types';
import { clamp } from './math';

export interface StageScore {
  /** 加算した円 */
  yen: number;
  comboChanged: boolean;
  /** この加算で怒りが満タンになった */
  rageFull: boolean;
}

export function multiplierFor(combo: number): number {
  return 1 + COMBO.multiplierStep * Math.min(combo, COMBO.multiplierCap);
}

/** 怒りの大きさの倍率：clamp((体積 / sizeRef)^sizeExponent, 下限, 上限)。大きい建物ほど多くたまる。 */
export function rageSizeFactor(volume: number): number {
  return clamp(Math.pow(volume / RAGE.sizeRef, RAGE.sizeExponent), RAGE.sizeFactorRange[0], RAGE.sizeFactorRange[1]);
}

/**
 * 建物1棟が段階 stage（1〜4）に入ったときにたまる怒り（大技で壊した分は呼ぶ側で 0 にする）。
 * = 段階の量 × 大きさの倍率 × （竜の手柄なら 1、燃え広がりなら fireFactor）× 怪獣ごとの倍率（r06-balance）
 */
export function rageGain(stage: number, size: number, player: boolean, scale: number): number {
  return RAGE.gainByStage[stage] * size * (player ? 1 : RAGE.fireFactor) * scale;
}

export class ScoreKeeper {
  yen = 0;
  destroyedVolume = 0;
  combo = 0;
  maxCombo = 0;
  multiplier = 1;
  rage = 0;
  rageFull = false;
  /**
   * r06-balance：怒りのたまり方の倍率（遊んでいる怪獣の config/creatures の rage.gainScale）。点数の係は怪獣を知らないので、
   * 技の係（combat.ts）が毎刻み入れる。やり直しでは戻さない（怪獣の値なので）
   */
  rageScale = 1;
  readonly totalVolume: number;
  readonly totalValue: number;
  private comboTimer = 0;
  private readonly volume: Float64Array;
  private readonly value: Float64Array;

  constructor(city: CityData) {
    const n = city.buildings.length;
    this.volume = new Float64Array(n);
    this.value = new Float64Array(n);
    let total = 0;
    let totalValue = 0;
    city.buildings.forEach((b, i) => {
      this.volume[i] = b.volume;
      this.value[i] = b.volume * BUILDING_RULES[b.kind].pricePerM3;
      total += b.volume;
      totalValue += this.value[i];
    });
    this.totalVolume = total;
    this.totalValue = totalValue;
  }

  reset(): void {
    this.yen = 0;
    this.destroyedVolume = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.multiplier = 1;
    this.rage = 0;
    this.rageFull = false;
    this.comboTimer = 0;
  }

  /** 破壊率（0〜1）：壊れた体積 ÷ 街の建物の体積の合計。 */
  get destruction(): number {
    return this.destroyedVolume / this.totalVolume;
  }

  /** 連鎖が切れるまでの残り秒数。 */
  get comboTimeLeft(): number {
    return this.combo > 0 ? this.comboTimer : 0;
  }

  /** 建物 id が段階 stage（1〜4）に入った。player は竜の直接の攻撃によるか、cause は壊した原因。 */
  onStage(id: number, stage: number, player: boolean, cause: DamageCause = player ? 'claw' : 'fire'): StageScore {
    const w = STAGES.destroyedWeight;
    const delta = w[stage] - w[stage - 1];
    let comboChanged = false;
    if (player) {
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.comboTimer = COMBO.windowSeconds;
      this.multiplier = Math.max(this.multiplier, multiplierFor(this.combo));
      comboChanged = true;
    }
    const yen = this.value[id] * delta * (player ? this.multiplier : 1);
    this.yen += yen;
    this.destroyedVolume += this.volume[id] * delta;
    const size = rageSizeFactor(this.volume[id]);
    // r03-roster：焔角の地割れ（fissure）も大技。雷翼の落雷の輪は咆哮（roar）と急降下（rageDive）の原因で数える
    const special = cause === 'roar' || cause === 'rageDive' || cause === 'fissure';
    const gain = special ? 0 : rageGain(stage, size, player, this.rageScale);
    const wasFull = this.rageFull;
    this.rage = Math.min(RAGE.max, this.rage + gain);
    this.rageFull = this.rage >= RAGE.max;
    return { yen, comboChanged, rageFull: this.rageFull && !wasFull };
  }

  /** 時間を進める。連鎖が切れたら true。 */
  tick(dt: number): boolean {
    let broke = false;
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboTimer = 0;
        broke = true;
      }
    }
    const target = multiplierFor(this.combo);
    if (this.multiplier > target) this.multiplier = Math.max(target, this.multiplier - COMBO.multiplierDecayPerSecond * dt);
    return broke;
  }

  /** 怒りが満タンなら使い切って true。 */
  spendRage(): boolean {
    if (!this.rageFull) return false;
    this.rage = 0;
    this.rageFull = false;
    return true;
  }
}
