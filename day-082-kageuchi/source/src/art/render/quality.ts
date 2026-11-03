// OWNER: world-art
// 描画の4段と自動の引き下げ。DOM・three・遊びの規則から離し、時刻を渡すだけで判定できるようにする。
import { MAX_PIXEL_RATIO } from './config';

export const QUALITY_TIERS = [
  { id: 'high', label: '標準', maxPixelRatio: MAX_PIXEL_RATIO, ao: true },
  { id: 'mid', label: 'やや軽い', maxPixelRatio: 1.25, ao: false },
  { id: 'low', label: '軽い', maxPixelRatio: 1, ao: false },
  { id: 'min', label: '最軽量', maxPixelRatio: 0.75, ao: false },
] as const;

export function initialTier({ touch, param }: { touch: boolean; param: string | null }): { tier: number; explicit: boolean } {
  const tier = QUALITY_TIERS.findIndex((q) => q.id === param);
  return tier >= 0 ? { tier, explicit: true } : { tier: touch ? 1 : 0, explicit: false };
}

export function adaptiveAllowed({ touch, explicit, automation, shotOrPerf }: {
  touch: boolean; explicit: boolean; automation: boolean; shotOrPerf: boolean;
}): boolean {
  return touch && !explicit && !automation && !shotOrPerf;
}

export interface GovernorOptions {
  /** 判定に使う直近の長さ（ms） */
  windowMs: number;
  /** 判定に要る最小のコマ数。遅い機種でも届くよう小さくしてある（コマ数でなく下の時間で見る） */
  minSamples: number;
  /** 窓の中で、最初と最後のコマの時刻が離れているべき長さ（ms）。2秒の窓の4分の3 */
  minSpanMs: number;
  /** 「重い」とみなす1コマの長さ（ms）。34ms＝約29fps */
  slowMs: number;
  percentile: number;
  cooldownMs: number;
  warmupMs: number;
  /** これを超えるコマは外れ値（タブの切り替え・一瞬の停止）として窓に入れない */
  outlierMs: number;
  /** 窓の中に外れ値がこの回数あれば、一瞬ではなく止まり続けているとみなして重いと判断する */
  stallCount: number;
  floorTier: number;
}

// 2026-11-03 mobile-touch 2.2: 当初の minSamples 40 は「2秒に40コマ＝20fps以上」でないと判定が働かず、
// 重い機種（15fps など）ほど降下しなかった。コマ数でなく時間で見る形に直した（旧 minSamples 40 → 6 と minSpanMs 1500）。
// 3fps 未満では 250ms 超が続いて 1 コマも窓に入らないので、外れ値の回数（stallCount）でも降下できるようにした。
const DEFAULTS: GovernorOptions = {
  windowMs: 2000, minSamples: 6, minSpanMs: 1500, slowMs: 34, percentile: 0.9,
  cooldownMs: 4000, warmupMs: 3000, outlierMs: 250, stallCount: 4, floorTier: 3,
};

export class QualityGovernor {
  private readonly opts: GovernorOptions;
  private currentTier = 0;
  private samples: { ms: number; at: number }[] = [];
  private stalls: number[] = [];
  private lastNow: number | null = null;
  private warmUntil = 0;
  private cooldownUntil = 0;

  constructor(opts: Partial<GovernorOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  get tier(): number { return this.currentTier; }

  start(tier: number, nowMs: number): void {
    this.currentTier = tier;
    this.clearWindow();
    this.lastNow = nowMs;
    this.warmUntil = nowMs + this.opts.warmupMs;
    this.cooldownUntil = nowMs;
  }

  discontinuity(nowMs: number): void {
    this.observeClock(nowMs);
    this.clearWindow();
    // 起動時の待ち・降下の間隔は、中断があっても短くしない。
    this.warmUntil = Math.max(this.warmUntil, nowMs + this.opts.warmupMs / 2);
  }

  private clearWindow(): void {
    this.samples = [];
    this.stalls = [];
  }

  private observeClock(nowMs: number): void {
    if (this.lastNow !== null && nowMs < this.lastNow) {
      // 時計の巻き戻りでは、待ちの残りを保って窓だけ捨てる（古い時刻を窓に残さない）。
      const delta = nowMs - this.lastNow;
      this.warmUntil += delta;
      this.cooldownUntil += delta;
      this.clearWindow();
      this.warmUntil = Math.max(this.warmUntil, nowMs + this.opts.warmupMs / 2);
    }
    this.lastNow = nowMs;
  }

  /** 1コマ分。段階を1つ下げるべきなら新しい段階番号を返す（上げることはしない）。 */
  sample(frameMs: number, nowMs: number): number | null {
    if (this.lastNow === null) return null;
    this.observeClock(nowMs);
    const from = nowMs - this.opts.windowMs;
    this.samples = this.samples.filter((s) => s.at >= from);
    this.stalls = this.stalls.filter((t) => t >= from);
    if (nowMs < this.warmUntil || !Number.isFinite(frameMs) || frameMs < 0) return null;
    if (frameMs > this.opts.outlierMs) this.stalls.push(nowMs);
    else this.samples.push({ ms: frameMs, at: nowMs });
    if (nowMs < this.cooldownUntil || this.currentTier >= this.opts.floorTier) return null;
    if (!this.isSlow()) return null;
    this.currentTier++;
    this.clearWindow();
    this.cooldownUntil = nowMs + this.opts.cooldownMs;
    return this.currentTier;
  }

  private isSlow(): boolean {
    if (this.stalls.length >= this.opts.stallCount) return true;
    const n = this.samples.length;
    if (n < this.opts.minSamples || this.samples[n - 1].at - this.samples[0].at < this.opts.minSpanMs) return false;
    const sorted = this.samples.map((s) => s.ms).sort((a, b) => a - b);
    // nearest-rank：昇順の ceil(p * 件数) 番目（1始まり）。34msちょうどでは下げない。
    const rank = Math.max(1, Math.min(n, Math.ceil(this.opts.percentile * n)));
    return sorted[rank - 1] > this.opts.slowMs;
  }
}
