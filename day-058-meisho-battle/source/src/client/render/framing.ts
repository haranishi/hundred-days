// カメラの寄せ方。台座と模型の外形（中心軸のまわりの輪の集まり）が、画面の余白の内側に収まる
// いちばん近い距離を探し、上下のずれはレンズを上下にずらして（シフト）中央へ寄せる。
// 外形は回る台で回しても変わらない輪なので、回転中にカメラが寄ったり引いたりしない。

export interface FrameInput {
  /** [中心軸からの距離, 高さ] の組（ワールドの座標） */
  rings: readonly (readonly [number, number])[]
  /** カメラの見下ろし角（度） */
  elevationDeg: number
  /** 縦の画角（度） */
  vFovDeg: number
  /** 横 ÷ 縦 */
  aspect: number
  /** カメラが向く点の高さ */
  targetY: number
  /** 画面の端から内側へ取る余白（-1〜1 の画面座標で、収める範囲の半分の幅） */
  fitX: number
  fitY: number
}

export interface FrameResult {
  distance: number
  /** 画面の上下のずれ（-1〜1 の画面座標）。これだけレンズをずらすと上下の中央にそろう */
  shiftY: number
}

const DEG = Math.PI / 180
const ANGLES = 24

/** 外形の点を、カメラの右・上・手前の向きに分けておく */
function projectRings(input: FrameInput): { x: number; y: number; z: number }[] {
  const el = input.elevationDeg * DEG
  const ux = 0
  const uy = Math.sin(el)
  const uz = Math.cos(el)
  // 上向き = (0, cos, -sin)、右向き = (1, 0, 0)
  const points: { x: number; y: number; z: number }[] = []
  for (const [r, h] of input.rings) {
    for (let k = 0; k < ANGLES; k++) {
      const a = (k / ANGLES) * Math.PI * 2
      const px = Math.cos(a) * r
      const py = h - input.targetY
      const pz = Math.sin(a) * r
      points.push({
        x: px,
        y: py * Math.cos(el) - pz * Math.sin(el),
        z: px * ux + py * uy + pz * uz,
      })
    }
  }
  return points
}

function extents(points: readonly { x: number; y: number; z: number }[], d: number, tanV: number, tanH: number) {
  let maxX = 0
  let minY = Infinity
  let maxY = -Infinity
  for (const p of points) {
    const depth = d - p.z
    if (depth <= 0.01) return null
    maxX = Math.max(maxX, Math.abs(p.x) / (depth * tanH))
    const ny = p.y / (depth * tanV)
    minY = Math.min(minY, ny)
    maxY = Math.max(maxY, ny)
  }
  return { maxX, minY, maxY }
}

export function fitFrame(input: FrameInput): FrameResult {
  const tanV = Math.tan((input.vFovDeg * DEG) / 2)
  const tanH = tanV * input.aspect
  const points = projectRings(input)
  const fits = (d: number) => {
    const e = extents(points, d, tanV, tanH)
    return e !== null && e.maxX <= input.fitX && (e.maxY - e.minY) / 2 <= input.fitY
  }
  let lo = 0.5
  let hi = 400
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) hi = mid
    else lo = mid
  }
  const e = extents(points, hi, tanV, tanH)
  return { distance: hi, shiftY: e ? (e.maxY + e.minY) / 2 : 0 }
}
