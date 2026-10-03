// OWNER: audio
// BGM の段階（0 静・1 暴・2 頂）を怒りと連鎖から決める（Web Audio を使わない純粋な部品）。
// 上がるのはすぐ（曲の側が次の小節の頭で重ねる）。下がるのは、下の段階の条件が holdBars 小節ぶん続いてから1段ずつ。
// 大技（咆哮・怒りの急降下・地割れ）の直後は頂に保つ。頂は「ご褒美」なので、条件が続いても maxPeakSeconds で暴へ戻し、
// しばらく（peakCooldownSeconds）は条件だけでは頂に戻さない（大技を出せばすぐ戻る）。
// r05-audio：頂の条件は怪獣ごと（config/audio.ts の INTENSITY_BY_MONSTER）。頂から暴へ下りたら peakLockBars 小節は、大技でも頂へ戻さない。
import { INTENSITY, intensityRules, type IntensityRules } from '../config/audio';

export interface IntensityInput {
  /** ゲーム内時刻（秒） */
  t: number;
  playing: boolean;
  rage: number;
  rageFull: boolean;
  combo: number;
}

export type Stage = 0 | 1 | 2;

export class IntensityDirector {
  private stage: Stage = 0;
  private lowSince: number | null = null;
  private releaseUntil = -Infinity;
  private collapses: number[] = [];
  private peakSince: number | null = null;
  private cooldownUntil = -Infinity;
  /** 頂から暴へ下りた後、頂へ戻さない時刻まで */
  private lockUntil = -Infinity;
  private rules: IntensityRules;

  constructor(
    private readonly barSeconds = 2.5,
    rules: IntensityRules = intensityRules('dragon'),
  ) {
    this.rules = rules;
  }

  get current(): Stage {
    return this.stage;
  }

  /** 怪獣を替えたら、その怪獣の頂の条件にする（MONSTER_SOUNDS の名前）。 */
  setMonster(monster: string): void {
    this.rules = intensityRules(monster);
  }

  get conditions(): IntensityRules {
    return this.rules;
  }

  onRelease(t: number): void {
    // 頂へ戻せない間に出した大技は、戻せるようになってから数える（ご褒美を削らない）
    this.releaseUntil = Math.max(t, this.lockUntil) + this.rules.releaseHoldSeconds;
    // 大技はご褒美の時計を巻き戻す（連続して頂に居られる時間は、最後の大技から数える）
    this.peakSince = null;
    this.cooldownUntil = -Infinity;
  }

  onCollapse(t: number): void {
    this.collapses.push(t);
    if (this.collapses.length > 64) this.collapses.splice(0, this.collapses.length - 64);
  }

  /** 条件だけで決まる段階（ためらいなし）。 */
  raw(i: IntensityInput): Stage {
    if (!i.playing) return 0;
    const recent = this.collapses.filter((c) => c > i.t - INTENSITY.collapseWindow).length;
    const P = this.rules.peak;
    const peakByPlay = (P.rageFull && i.rageFull) || i.combo >= P.combo || recent >= P.collapses;
    const locked = i.t < this.lockUntil;
    if (!locked && (i.t < this.releaseUntil || (peakByPlay && i.t >= this.cooldownUntil))) return 2;
    const R = this.rules.rampage;
    if (peakByPlay || i.t < this.releaseUntil || i.combo >= R.combo || i.rage >= R.rage || (R.rageFull && i.rageFull) || recent >= R.collapses) return 1;
    return 0;
  }

  /** 頂から下りた瞬間：しばらく頂へ戻さない。 */
  private leavePeak(t: number): void {
    this.peakSince = null;
    this.lockUntil = t + INTENSITY.peakLockBars * this.barSeconds;
  }

  /** 今の段階（上がるのはすぐ、下がるのはためらってから1段ずつ。頂は長く居すぎたら暴へ）。 */
  update(i: IntensityInput): Stage {
    if (this.stage === 2) {
      this.peakSince ??= i.t;
      if (i.t - this.peakSince >= this.rules.maxPeakSeconds && i.t >= this.releaseUntil) {
        this.stage = 1;
        this.leavePeak(i.t);
        this.cooldownUntil = i.t + this.rules.peakCooldownSeconds;
        this.lowSince = null;
        return this.stage;
      }
    } else this.peakSince = null;
    const want = this.raw(i);
    if (want > this.stage) {
      if (want === 2) this.peakSince = i.t;
      this.stage = want;
      this.lowSince = null;
    } else if (want < this.stage) {
      if (this.lowSince === null) this.lowSince = i.t;
      if (i.t - this.lowSince >= INTENSITY.holdBars * this.barSeconds) {
        if (this.stage === 2) this.leavePeak(i.t);
        this.stage = (this.stage - 1) as Stage;
        this.lowSince = i.t;
      }
    } else this.lowSince = null;
    return this.stage;
  }

  reset(): void {
    this.stage = 0;
    this.lowSince = null;
    this.releaseUntil = -Infinity;
    this.collapses = [];
    this.peakSince = null;
    this.cooldownUntil = -Infinity;
    this.lockUntil = -Infinity;
  }
}

/** 曲の頭 songStart から数えて、now + margin 以降で最初の小節の頭（秒）。 */
export function nextBarTime(songStart: number, now: number, barSeconds: number, margin = 0.05): number {
  const k = Math.ceil((now + margin - songStart) / barSeconds - 1e-9);
  return songStart + Math.max(0, k) * barSeconds;
}
