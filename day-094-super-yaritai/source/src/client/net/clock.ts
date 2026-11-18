// サーバーの時計に合わせる。名所バトルの clock.ts を写した（倍速の仕組みは使わないので外した）。
// ping を送った時刻・pong を受けた時刻（端末の時計）と、サーバーが返した時刻から「ずれ」を測る。
// 往復がいちばん短い回のずれを使う（往復が短いほど、行きと帰りの片寄りによる誤差が小さいため）。

export interface ClockSample {
  /** 往復にかかった時間（端末の時計・ミリ秒） */
  rtt: number
  /** サーバーの時刻 − 端末の時計 */
  offset: number
}

/** 往復がいちばん短い回。同じなら新しい回。無ければ null */
export function pickBestSample(samples: readonly ClockSample[]): ClockSample | null {
  let best: ClockSample | null = null
  for (const s of samples) if (best === null || s.rtt <= best.rtt) best = s
  return best
}

export class ClockSync {
  private samples: ClockSample[] = []
  /** 往復のわからない値（welcome の serverNow）からの仮のずれ */
  private rough: number | null = null

  constructor(private readonly maxSamples = 12) {}

  /** 測り直す（つなぎ直したとき・画面が裏から戻ったとき。端末の時計が止まっていた可能性があるため） */
  reset(): void {
    this.samples = []
  }

  get sampleCount(): number {
    return this.samples.length
  }

  /** welcome などで届いたサーバー時刻で、仮に合わせる（ping の結果が出るまでの間だけ使う） */
  seed(serverNow: number, localNow: number): void {
    if (Number.isFinite(serverNow) && Number.isFinite(localNow)) this.rough = serverNow - localNow
  }

  /** ping を送った時刻・pong を受けた時刻（端末の時計）と、pong の serverNow */
  addSample(sentAt: number, receivedAt: number, serverNow: number): void {
    const rtt = receivedAt - sentAt
    if (!Number.isFinite(rtt) || rtt < 0 || !Number.isFinite(serverNow)) return
    this.samples.push({ rtt, offset: serverNow - (sentAt + rtt / 2) })
    if (this.samples.length > this.maxSamples) this.samples.shift()
  }

  /** いま使っているずれ（ミリ秒） */
  offset(): number {
    return pickBestSample(this.samples)?.offset ?? this.rough ?? 0
  }

  /** いちばん良い回の往復（まだ測っていなければ null） */
  bestRtt(): number | null {
    return pickBestSample(this.samples)?.rtt ?? null
  }

  /** 端末の時計が localNow のときの、サーバーの時刻 */
  serverNow(localNow: number): number {
    return localNow + this.offset()
  }
}
