// 量子化（docs/05・依頼書）：位置は cm の int16、回転は smallest-three（32ビット）、向きは uint16。
// 店の内側は x −18〜18、z −14〜14 なので、int16 の cm（±327m）で足りる。

/** 位置の倍率（1m＝100） */
export const POS_SCALE = 100
/** 位置の誤差の上限（m）。cm に丸めるので半分の 0.5cm */
export const POS_MAX_ERROR = 0.5 / POS_SCALE
/** 向きの誤差の上限（ラジアン）。2π を 65536 に分けた半分 */
export const YAW_MAX_ERROR = Math.PI / 65536

const TWO_PI = Math.PI * 2

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

/** m → cm の int16（範囲の外は端に寄せる。NaN は0） */
export function qPos(m: number): number {
  if (!Number.isFinite(m)) return 0
  return clamp(Math.round(m * POS_SCALE), -32768, 32767)
}

export function dqPos(q: number): number {
  return q / POS_SCALE
}

/** 向き（ラジアン）→ uint16（1周を65536に分ける） */
export function qYaw(rad: number): number {
  if (!Number.isFinite(rad)) return 0
  const turns = rad / TWO_PI
  return Math.round((turns - Math.floor(turns)) * 65536) & 0xffff
}

/** uint16 → 向き（−π〜π） */
export function dqYaw(q: number): number {
  const a = (q * TWO_PI) / 65536
  return a > Math.PI ? a - TWO_PI : a
}

/** 秒 → 0.01秒の uint16（0〜655秒） */
export function qCenti(sec: number): number {
  if (!Number.isFinite(sec)) return 0
  return clamp(Math.round(sec * 100), 0, 0xffff)
}

export function dqCenti(q: number): number {
  return q / 100
}

/** 0〜1 → uint8 */
export function qUnit8(v: number): number {
  if (!Number.isFinite(v)) return 0
  return clamp(Math.round(v * 255), 0, 255)
}

export function dqUnit8(q: number): number {
  return q / 255
}

/** 0〜1 → uint16 */
export function qUnit16(v: number): number {
  if (!Number.isFinite(v)) return 0
  return clamp(Math.round(v * 65535), 0, 65535)
}

export function dqUnit16(q: number): number {
  return q / 65535
}

// ── 回転：smallest-three ──
// 四元数のうち絶対値がいちばん大きい成分を省き（ほかの3つから求められる）、残りの3つを10ビットずつにする。
// 省いた成分の位置（2ビット）＋10ビット×3＝32ビット。省く成分は正にそろえる（q と −q は同じ回転）。

const R = Math.SQRT1_2
/** 10ビットのうち 0〜1022 を使う（真ん中の511がちょうど0になり、止まっている商品の回転がずれない） */
const MAXV = 1022
/** 回転の誤差の上限（ラジアン）。各成分の丸め誤差 0.00069 から見積もった値に余裕を持たせたもの */
export const QUAT_MAX_ERROR_RAD = 0.004

export function packQuat(x: number, y: number, z: number, w: number): number {
  let len = Math.hypot(x, y, z, w)
  if (!Number.isFinite(len) || len < 1e-9) {
    x = 0
    y = 0
    z = 0
    w = 1
    len = 1
  }
  const c = [x / len, y / len, z / len, w / len] as const
  let li = 0
  let lv = Math.abs(c[0])
  for (let i = 1; i < 4; i++) {
    const a = Math.abs(c[i] as number)
    if (a > lv) {
      li = i
      lv = a
    }
  }
  const sign = (c[li] as number) < 0 ? -1 : 1
  let packed = li
  for (let i = 0; i < 4; i++) {
    if (i === li) continue
    const v = clamp((c[i] as number) * sign, -R, R)
    packed = packed * 1024 + Math.round(((v + R) / (2 * R)) * MAXV)
  }
  return packed
}

/** 32ビットから四元数（x, y, z, w）を out[o..o+3] に書く */
export function unpackQuat(packed: number, out: { [i: number]: number }, o = 0): void {
  const p = packed >>> 0
  const li = (p >>> 30) & 3
  const parts = [(p >>> 20) & 1023, (p >>> 10) & 1023, p & 1023].map((q) => (q / MAXV) * 2 * R - R)
  const sum = parts.reduce((s, v) => s + v * v, 0)
  const largest = Math.sqrt(Math.max(0, 1 - sum))
  let k = 0
  const q: number[] = [0, 0, 0, 0]
  for (let i = 0; i < 4; i++) q[i] = i === li ? largest : (parts[k++] as number)
  const len = Math.hypot(q[0] as number, q[1] as number, q[2] as number, q[3] as number) || 1
  for (let i = 0; i < 4; i++) out[o + i] = (q[i] as number) / len
}

/** Y軸まわりの向き（yaw）の四元数を out[o..o+3] に書く（PropDef.home の向きから定位置の回転を作る） */
export function yawQuat(yaw: number, out: { [i: number]: number }, o = 0): void {
  out[o] = 0
  out[o + 1] = Math.sin(yaw / 2)
  out[o + 2] = 0
  out[o + 3] = Math.cos(yaw / 2)
}

/** 2つの回転の間の角度（ラジアン） */
export function quatAngle(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const dot = Math.abs((a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0) + (a[3] ?? 0) * (b[3] ?? 0))
  return 2 * Math.acos(Math.min(1, dot))
}
