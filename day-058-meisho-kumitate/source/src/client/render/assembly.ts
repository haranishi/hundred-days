// 組み立ての計算。p（進み具合）から「出ている部品・落下中の部品・色塗りの度合い」を決める。
// three.js にも時刻にも頼らない純粋な関数だけを置く。同じ p なら必ず同じ結果になるので、
// 固定ショットとネット対戦の画面がそろう。
import {
  BOUNCE_HEIGHT,
  CONTACT_AT,
  DROP_HEIGHT,
  FALL_P,
  HEIGHT_BAND,
  PAINT_END,
  PAINT_START,
  STAGE_RANGES,
  type StageNo,
} from './stages'

/** 予定を立てるのに要る、部品ごとの情報（形そのものは要らない） */
export interface PartInfo {
  stage: StageNo
  /** 小さい組から先に出す。指定がなければ 0 */
  order?: number
  /** 部品の底の高さ */
  minY: number
  /** 中心軸から部品の中心までの水平距離 */
  radial: number
  /** 部品の大きさ（外接球の半径）。着地の知らせに付ける */
  size: number
}

export interface ScheduledPart {
  /** 部品の番号（PartInfo の並び） */
  index: number
  stage: StageNo
  /** 落ち始める p */
  start: number
  /** 地面に触れる p。着地の知らせはここで出す */
  land: number
  /** 跳ねが終わって止まる p */
  end: number
  size: number
}

export interface Schedule {
  /** 部品の番号順 */
  parts: readonly ScheduledPart[]
  /** 着地の早い順 */
  byLand: readonly ScheduledPart[]
}

const STAGES: readonly StageNo[] = [1, 2, 3, 4]

/**
 * 部品の出る順と時刻（p）を決める。
 * 段階ごとに、順番の組 → 下から上（HEIGHT_BAND 刻み） → 中心から外 → 作った順、で並べ、
 * 段階の区間の中に等間隔で落とす。最後の部品は区間の終わりちょうどに止まる。
 */
export function buildSchedule(parts: readonly PartInfo[]): Schedule {
  const result: ScheduledPart[] = new Array<ScheduledPart>(parts.length)
  for (const stage of STAGES) {
    const members: { info: PartInfo; index: number }[] = []
    parts.forEach((info, index) => {
      if (info.stage === stage) members.push({ info, index })
    })
    members.sort(
      (a, b) =>
        (a.info.order ?? 0) - (b.info.order ?? 0) ||
        heightBand(a.info.minY) - heightBand(b.info.minY) ||
        radialStep(a.info.radial) - radialStep(b.info.radial) ||
        a.index - b.index,
    )
    const [from, to] = STAGE_RANGES[stage]
    const span = Math.max(0, to - FALL_P - from)
    const n = members.length
    members.forEach((m, k) => {
      const start = from + (n <= 1 ? 0 : (span * k) / (n - 1))
      result[m.index] = {
        index: m.index,
        stage,
        start,
        land: start + FALL_P * CONTACT_AT,
        end: start + FALL_P,
        size: m.info.size,
      }
    })
  }
  for (let i = 0; i < parts.length; i++) {
    if (!result[i]) throw new Error(`部品 ${i} の段階が 1〜4 ではありません`)
  }
  const byLand = [...result].sort((a, b) => a.land - b.land || a.index - b.index)
  return { parts: result, byLand }
}

function heightBand(minY: number): number {
  return Math.floor(minY / HEIGHT_BAND + 1e-6)
}

function radialStep(radial: number): number {
  return Math.round(radial / 0.05)
}

/** 部品の見え方。lift は上へのずれ、scaleY / scaleXZ は部品の底を中心にした伸び縮み */
export interface PartPose {
  visible: boolean
  /** 0〜1。落ち始めから止まるまでの進み（1 で静止） */
  t: number
  lift: number
  scaleY: number
  scaleXZ: number
}

/** 出方。drop は上から落ちて跳ねる。grow は地面から伸びる（地面の起伏・水面・木など） */
export type Appear = 'drop' | 'grow'

const HIDDEN: PartPose = { visible: false, t: 0, lift: 0, scaleY: 1, scaleXZ: 1 }
const RESTING: PartPose = { visible: true, t: 1, lift: 0, scaleY: 1, scaleXZ: 1 }

/**
 * p の時点での部品の見え方。p だけで決まる（時刻は使わない）。
 * 動きを減らす設定のときは、落下も跳ねもなく、着地の瞬間にその場に現れる。
 */
export function partPose(
  sp: ScheduledPart,
  p: number,
  appear: Appear = 'drop',
  reducedMotion = false,
): PartPose {
  if (reducedMotion) return p >= sp.land - EPS ? RESTING : HIDDEN
  if (!(p > sp.start)) return HIDDEN
  const t = Math.min(1, (p - sp.start) / FALL_P)
  // 境目ちょうどの p で小数の誤差に負けないよう、わずかな余裕を見る
  if (t >= 1 - EPS) return RESTING
  return appear === 'grow' ? growPose(t) : dropPose(t)
}

const EPS = 1e-9

function dropPose(t: number): PartPose {
  if (t < CONTACT_AT - EPS) {
    const u = t / CONTACT_AT
    // 重力のように速くなりながら落ちる。出始めは少し小さく、すぐ元の大きさになる
    const appearK = easeOutCubic(Math.min(1, u / 0.25))
    const s = 0.4 + 0.6 * appearK
    return { visible: true, t, lift: DROP_HEIGHT * (1 - u * u), scaleY: s, scaleXZ: s }
  }
  const u = Math.max(0, (t - CONTACT_AT) / (1 - CONTACT_AT))
  // 触れた瞬間につぶれ、小さく跳ねて止まる
  const squash = Math.max(0, 1 - u / 0.45) ** 2
  return {
    visible: true,
    t,
    lift: BOUNCE_HEIGHT * 4 * u * (1 - u),
    scaleY: 1 - 0.16 * squash,
    scaleXZ: 1 + 0.08 * squash,
  }
}

function growPose(t: number): PartPose {
  if (t < CONTACT_AT - EPS) {
    const u = easeOutCubic(t / CONTACT_AT)
    return { visible: true, t, lift: 0, scaleY: 0.02 + 1.06 * u, scaleXZ: 0.7 + 0.3 * u }
  }
  const u = Math.max(0, (t - CONTACT_AT) / (1 - CONTACT_AT))
  // 少し伸びすぎてから元に戻る
  return { visible: true, t, lift: 0, scaleY: 1 + 0.08 * (1 - u) * (1 - u), scaleXZ: 1 }
}

function easeOutCubic(x: number): number {
  const k = 1 - x
  return 1 - k * k * k
}

/** 色塗りの度合い（0 は白、1 は本当の色）。PAINT_START〜PAINT_END でなめらかに変わる */
export function paintAmount(p: number): number {
  if (!(p > PAINT_START)) return 0
  if (p >= PAINT_END) return 1
  const x = (p - PAINT_START) / (PAINT_END - PAINT_START)
  return x * x * (3 - 2 * x)
}

/** p を 0〜1 に収める。1 を超えたら完成のまま。数でない値は 0 */
export function clampProgress(p: number): number {
  if (!Number.isFinite(p)) return p === Infinity ? 1 : 0
  return Math.min(1, Math.max(0, p))
}

export interface AssemblyNotice {
  /** 新しく着地した部品（着地の早い順） */
  landed: ScheduledPart[]
  /** 色塗りが始まったか */
  paintStarted: boolean
}

/**
 * 着地と色塗りの始まりを外へ知らせるための見張り。
 * これまでに見た p のいちばん先（印）を覚え、印より先へ進んだぶんだけを知らせる。
 * p が戻っても印は戻さないので、同じ着地を二度知らせない。大きく飛んだときは、間の着地をまとめて知らせる。
 */
export class AssemblyEvents {
  private mark = 0
  private next = 0
  private painted = false

  constructor(private readonly byLand: readonly ScheduledPart[]) {}

  advance(p: number): AssemblyNotice {
    const q = clampProgress(p)
    if (!(q > this.mark)) return { landed: [], paintStarted: false }
    const landed: ScheduledPart[] = []
    while (this.next < this.byLand.length) {
      const sp = this.byLand[this.next]
      if (!sp || sp.land > q) break
      landed.push(sp)
      this.next++
    }
    const paintStarted = !this.painted && q >= PAINT_START
    if (paintStarted) this.painted = true
    this.mark = q
    return { landed, paintStarted }
  }

  /** 知らせずに印を進める（答えあわせで完成形を見せるときなど） */
  skipTo(p: number): void {
    const q = clampProgress(p)
    if (!(q > this.mark)) return
    while (this.next < this.byLand.length) {
      const sp = this.byLand[this.next]
      if (!sp || sp.land > q) break
      this.next++
    }
    if (q >= PAINT_START) this.painted = true
    this.mark = q
  }
}
