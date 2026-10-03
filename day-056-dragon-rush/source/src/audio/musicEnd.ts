// OWNER: audio
// r05-audio：曲の終わりを時間切れに合わせるための純粋な部品（Web Audio を使わない）。曲の並べ方そのものは music.ts。
// 遊びの時計はヒットストップで実時間より遅れるので、残りのゲーム内時間を「最近の遊びの時計の速さ」で実時間に直してから比べる。
// r06-audio：時間切れの結果の音を曲の最後の大太鼓に合わせる決まり（resultCue）と、63 小節目の後に足す「溜め」の小節の選び方（holdIndexFor）。
import { MUSIC_END, RESULT_CUE } from '../config/audio';

/**
 * 時間切れの時点の記録（r05-audio）：受けた時刻・最後の大太鼓の時刻・跳んだか・跳んで飛ばした秒数（すべてコンテキストの秒）。
 * drum は、その時刻に最後の大太鼓を本当に鳴らす（鳴らした）か（r06-audio：塊が間に合わず並べられなかったときは false）。
 */
export interface EndAlign {
  sessionEndAt: number;
  finalAt: number | null;
  extensionBars: number;
  cut: boolean;
  skippedSeconds: number;
  drum?: boolean;
}

/**
 * r06-audio：結果の音の鳴らし方。gong＝銅鑼だけを at（曲の最後の大太鼓の時刻）に、full＝銅鑼と大太鼓2打を at（すぐ）に。
 * 指摘「時間切れの瞬間に結果の音（銅鑼と大太鼓2打）と曲の最後の大太鼓が 0.2 秒ずれて重なり、ドドンと二度打ちに聞こえる」
 */
export interface ResultCue {
  kind: 'gong' | 'full';
  at: number;
}

/**
 * 時間切れを受けた now と、曲の終わりの記録 end から、結果の音の鳴らし方を決める（純粋な計算）。
 * 曲が最後の大太鼓を鳴らせる（鳴らした）なら、銅鑼だけをその時刻に（もう過ぎていればすぐ）鳴らす。
 * 曲が止まっている・一時停止中・大太鼓を並べられなかった・大太鼓が遠い（maxWait より先か maxLate より前）ときだけ、今の結果の音をすぐ鳴らす。
 */
export function resultCue(now: number, end: EndAlign | null, rules: { maxWaitSeconds: number; maxLateSeconds: number } = RESULT_CUE): ResultCue {
  if (!end || end.finalAt === null || end.drum === false) return { kind: 'full', at: now };
  const d = end.finalAt - now;
  if (d > rules.maxWaitSeconds || d < -rules.maxLateSeconds) return { kind: 'full', at: now };
  return { kind: 'gong', at: Math.max(now, end.finalAt) };
}

/**
 * r06-audio：63 小節目の後に足す k 番目（0 から）の小節に、どの「溜め」の小節（0 から holds-1）を鳴らすか。
 * 1回ごとに少しずつ盛り上がる順に並べてあるので頭から順に使い、足りなければ最後の2つを交互に使う（同じ小節を続けて鳴らさない）。
 */
export function holdIndexFor(k: number, holds: number): number {
  if (holds <= 1) return 0;
  if (k < holds) return k;
  return holds - 2 + ((k - holds) % 2);
}

/**
 * 曲の終わりを合わせるために足す長さ（純粋な計算）：小節の数と、残りの拍の数（0〜3）。
 * untilEnd は時間切れまでの実時間の見込み、untilFinal は足さずに進んだときの最後の大太鼓までの秒数。
 * 差を拍に丸めるので、大太鼓は時間切れの見込みから半拍（0.31 秒）以内に来る。曲のほうが遅れていれば足さない（時間切れで最後の小節へ跳ぶ）。
 */
export function extensionFor(o: { untilEnd: number; untilFinal: number; barSeconds: number; beatSeconds: number; maxBars?: number }): { bars: number; beats: number } {
  const perBar = Math.round(o.barSeconds / o.beatSeconds);
  const max = (o.maxBars ?? MUSIC_END.maxExtraBars) * perBar;
  const total = Math.max(0, Math.min(max, Math.round((o.untilEnd - o.untilFinal) / o.beatSeconds)));
  return { bars: Math.floor(total / perBar), beats: total % perBar };
}

/** 遊びの時計の速さ（ゲーム内の秒 ÷ 実時間の秒）を最近の窓で測る。ヒットストップの間は 1 より小さくなる。 */
export class ClockRate {
  private samples: { at: number; clock: number }[] = [];

  constructor(private readonly window = MUSIC_END.rateWindowSeconds) {}

  add(at: number, clock: number, playing: boolean): void {
    if (!playing) {
      this.samples.length = 0;
      return;
    }
    const last = this.samples[this.samples.length - 1];
    if (last && at - last.at < 0.25) return;
    this.samples.push({ at, clock });
    while (this.samples.length > 2 && this.samples[1].at < at - this.window) this.samples.shift();
  }

  /** 速さ（測れるだけの長さが無ければ 1）。 */
  get rate(): number {
    const a = this.samples[0];
    const b = this.samples[this.samples.length - 1];
    if (!a || !b || b.at - a.at < 3) return 1;
    return Math.max(0.5, Math.min(1.2, (b.clock - a.clock) / (b.at - a.at)));
  }

  reset(): void {
    this.samples.length = 0;
  }
}
