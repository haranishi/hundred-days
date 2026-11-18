// 参加者の画面で、届いた店の様子を約100ms遅らせて補間する（docs/05「参加者の画面は…約100ms遅らせて補間する」）。
// 1枚ずつの到着は揺れるので、表示は「届いた中でいちばん速かった遅れ＋100ms」だけ過去を描く。その前後の2枚の間を補間する。
// 位置と向きは線形に、回転は四元数を正規化した線形補間（nlerp）で、それ以外（動き・点数・段階など）は近い方の1枚の値を使う。
// 自分のキャラは手元で即座に動かすので、GuestSession がこの結果の自分の分を上書きする。

import { INTERP_DELAY_MS } from '../../shared/protocol/constants'
import type { AvatarView, CartView, NpcView, Vec3, WorldView } from '../../shared/view'

export interface Snapshot {
  seq: number
  /** 試合開始からのミリ秒（主が付けた時刻） */
  t: number
  view: WorldView
  /** 前の1枚から値が変わった商品の番号。null なら全部を補間する */
  changed: ArrayLike<number> | null
}

export interface SnapshotBufferOptions {
  /** 遅らせる時間（ミリ秒） */
  delayMs?: number
  /** 取っておく枚数（毎秒15枚なら32枚で約2秒） */
  capacity?: number
  /** 到着の遅れの最小を取る範囲（枚数） */
  window?: number
}

/** 遅れの見積もりを新しい値へ寄せる割合（1枚ごと。急に跳ばないように少しずつ寄せる） */
const OFFSET_EASE = 0.1
/** これより大きく時刻が戻ったら、別の試合とみなして捨てる */
const RESET_BACKWARD_MS = 1000

export class SnapshotBuffer {
  private snaps: Snapshot[] = []
  private arrivals: number[] = []
  private offset: number | null = null
  private outTransforms: Float32Array | null = null
  private outHidden: Uint8Array | null = null
  private readonly delayMs: number
  private readonly capacity: number
  private readonly windowSize: number

  constructor(opts: SnapshotBufferOptions = {}) {
    this.delayMs = opts.delayMs ?? INTERP_DELAY_MS
    this.capacity = Math.max(2, opts.capacity ?? 32)
    this.windowSize = Math.max(1, opts.window ?? 30)
  }

  get size(): number {
    return this.snaps.length
  }

  latest(): Snapshot | null {
    return this.snaps[this.snaps.length - 1] ?? null
  }

  clear(): void {
    this.snaps = []
    this.arrivals = []
    this.offset = null
  }

  /** 1枚を足す。arrivalLocalMs は届いた時刻（端末の時計） */
  push(snap: Snapshot, arrivalLocalMs: number): void {
    const last = this.latest()
    if (last && snap.t <= last.t) {
      if (last.t - snap.t > RESET_BACKWARD_MS) {
        this.clear()
      } else {
        // 主の時計が少し戻った：時刻の順を保つため、新しい1枚より後ろの分を捨てる（つながりが切れるので全部を補間する）
        while (this.snaps.length > 0 && (this.snaps[this.snaps.length - 1] as Snapshot).t >= snap.t) this.snaps.pop()
        snap = { ...snap, changed: null }
      }
    }
    this.snaps.push(snap)
    if (this.snaps.length > this.capacity) {
      this.snaps.shift()
    }
    this.arrivals.push(arrivalLocalMs - snap.t)
    if (this.arrivals.length > this.windowSize) this.arrivals.shift()
    const target = Math.min(...this.arrivals)
    this.offset = this.offset === null ? target : this.offset + (target - this.offset) * OFFSET_EASE
  }

  /** 端末の時計が localNow のときに描く時刻（試合開始からのミリ秒）。まだ1枚も無ければ null */
  renderTime(localNow: number): number | null {
    return this.offset === null ? null : localNow - this.offset - this.delayMs
  }

  /**
   * renderT の時刻の店の様子。前後の2枚の間を補間する。範囲の外なら端の1枚。1枚も無ければ null。
   * 返す propTransforms・propHidden はこの buffer が使い回す配列（次に sample を呼ぶまで有効）
   */
  sample(renderT: number): WorldView | null {
    const n = this.snaps.length
    if (n === 0) return null
    let i = 0
    while (i < n && (this.snaps[i] as Snapshot).t <= renderT) i++
    if (i === 0) return this.copyOf(this.snaps[0] as Snapshot)
    if (i === n) return this.copyOf(this.snaps[n - 1] as Snapshot)
    const a = this.snaps[i - 1] as Snapshot
    const b = this.snaps[i] as Snapshot
    const span = b.t - a.t
    const alpha = span > 0 ? Math.min(1, Math.max(0, (renderT - a.t) / span)) : 1
    return this.blend(a, b, alpha)
  }

  private buffers(len: number): { tr: Float32Array; hidden: Uint8Array } {
    if (!this.outTransforms || this.outTransforms.length !== len) this.outTransforms = new Float32Array(len)
    if (!this.outHidden || this.outHidden.length !== len / 7) this.outHidden = new Uint8Array(len / 7)
    return { tr: this.outTransforms, hidden: this.outHidden }
  }

  private copyOf(s: Snapshot): WorldView {
    const { tr, hidden } = this.buffers(s.view.propTransforms.length)
    tr.set(s.view.propTransforms)
    hidden.set(s.view.propHidden)
    return { ...s.view, propTransforms: tr, propHidden: hidden, events: [] }
  }

  private blend(a: Snapshot, b: Snapshot, alpha: number): WorldView {
    const near = alpha < 0.5 ? a.view : b.view
    const av = a.view
    const bv = b.view
    if (av.propTransforms.length !== bv.propTransforms.length) return this.copyOf(alpha < 0.5 ? a : b)
    const { tr, hidden } = this.buffers(bv.propTransforms.length)
    tr.set(av.propTransforms)
    hidden.set(near.propHidden)
    const count = bv.propTransforms.length / 7
    if (b.changed === null) {
      for (let id = 0; id < count; id++) blendProp(tr, av.propTransforms, bv.propTransforms, id, alpha)
    } else {
      for (let k = 0; k < b.changed.length; k++) {
        const id = b.changed[k] as number
        if (id < count) blendProp(tr, av.propTransforms, bv.propTransforms, id, alpha)
      }
    }
    return {
      ...near,
      timeLeft: lerp(av.timeLeft, bv.timeLeft, alpha),
      avatars: bv.avatars.map((x) => blendMover<AvatarView>(av.avatars.find((y) => y.slot === x.slot), x, alpha)),
      npcs: bv.npcs.map((x) => blendMover<NpcView>(av.npcs.find((y) => y.id === x.id), x, alpha)),
      carts: bv.carts.map((x) => {
        const prev = av.carts.find((y) => y.id === x.id)
        const c = blendMover<CartView>(prev, x, alpha)
        return prev ? { ...c, speed: lerp(prev.speed, x.speed, alpha) } : c
      }),
      propTransforms: tr,
      propHidden: hidden,
      events: [],
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) }
}

/** 向きの補間（近い回り方で） */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

/** 位置と向きだけを補間し、ほかは近い方の値を使う */
function blendMover<T extends { pos: Vec3; yaw: number }>(prev: T | undefined, next: T, alpha: number): T {
  if (!prev) return next
  const base = alpha < 0.5 ? prev : next
  return { ...base, pos: lerpVec(prev.pos, next.pos, alpha), yaw: lerpAngle(prev.yaw, next.yaw, alpha) }
}

function blendProp(out: Float32Array, a: Float32Array, b: Float32Array, id: number, t: number): void {
  const o = id * 7
  out[o] = lerp(a[o] as number, b[o] as number, t)
  out[o + 1] = lerp(a[o + 1] as number, b[o + 1] as number, t)
  out[o + 2] = lerp(a[o + 2] as number, b[o + 2] as number, t)
  let bx = b[o + 3] as number
  let by = b[o + 4] as number
  let bz = b[o + 5] as number
  let bw = b[o + 6] as number
  const ax = a[o + 3] as number
  const ay = a[o + 4] as number
  const az = a[o + 5] as number
  const aw = a[o + 6] as number
  // q と −q は同じ回転。近い方へ回す
  if (ax * bx + ay * by + az * bz + aw * bw < 0) {
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
  }
  const x = lerp(ax, bx, t)
  const y = lerp(ay, by, t)
  const z = lerp(az, bz, t)
  const w = lerp(aw, bw, t)
  const len = Math.hypot(x, y, z, w) || 1
  out[o + 3] = x / len
  out[o + 4] = y / len
  out[o + 5] = z / len
  out[o + 6] = w / len
}
