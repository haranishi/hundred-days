// 白川郷（荻町）：急な茅葺きの切妻屋根の合掌造りの家が、田んぼの中に散らばる山あいの集落。
// 正面（+Z）が南。家はどれも三角の妻面を南北（±Z）に向けてそろって並ぶ。左（西）に庄川と吊り橋、奥と右は杉の山。
// 白いうちは「田畑と家の集落」→「急な三角屋根の家」まで（大内宿と迷う）。段階3の厚い茅の屋根と妻面の窓で決まり、
// 色塗りの茅の茶色と田んぼの緑、段階4の杉の山と吊り橋でほぼ全員が当たる。
import { type Kit, type Vec3, type XZ } from './kit'

const THATCH = ['#8A7350', '#7E6949', '#958060'] as const
const RIDGE = '#5E4C36'
const WOOD = '#4A3A2B'
const SHOJI = '#E9E2CF'
const PADDY = '#6E9A4C'
const GRASS = '#93A563'
const ROAD = '#B3A587'
const RIVER = '#4F8FA8'
const MOUNTAIN = '#2E5536'

/** 屋根の勾配（度）。合掌造りは45〜60度 */
const PITCH = 58
const WALL_H = 0.15

interface House {
  x: number
  z: number
  /** 棟に直角な幅（東西） */
  w: number
  /** 棟の長さ（南北） */
  l: number
  /** 南北からのわずかなずれ（度） */
  turn: number
}

/** 集落の家（妻面を南北に向ける） */
const HOUSES: readonly House[] = [
  { x: -0.9, z: -1.6, w: 0.55, l: 0.95, turn: 2 },
  { x: 0.4, z: -2.15, w: 0.5, l: 0.85, turn: -3 },
  { x: 1.65, z: -1.5, w: 0.58, l: 1.0, turn: 1 },
  { x: -0.4, z: -0.2, w: 0.5, l: 0.85, turn: -2 },
  { x: 0.95, z: 0.2, w: 0.62, l: 1.08, turn: 0 },
  { x: 2.3, z: 0.05, w: 0.46, l: 0.8, turn: 4 },
  { x: -1.2, z: 1.05, w: 0.48, l: 0.8, turn: -4 },
  { x: 0.2, z: 1.55, w: 0.52, l: 0.9, turn: 3 },
  { x: 1.65, z: 1.75, w: 0.48, l: 0.82, turn: -1 },
  { x: -0.7, z: 2.65, w: 0.5, l: 0.88, turn: 2 },
  { x: 0.9, z: 3.05, w: 0.46, l: 0.8, turn: -3 },
  { x: 2.3, z: 2.65, w: 0.44, l: 0.75, turn: 1 },
  { x: -1.15, z: 3.85, w: 0.42, l: 0.7, turn: -2 },
]

/** 小さな納屋（茅葺き） */
const BARNS: readonly House[] = [
  { x: 2.75, z: -1.05, w: 0.26, l: 0.36, turn: 6 },
  { x: -0.05, z: 0.75, w: 0.24, l: 0.32, turn: -5 },
  { x: 1.75, z: 3.55, w: 0.24, l: 0.34, turn: 3 },
  { x: -1.45, z: -0.75, w: 0.24, l: 0.3, turn: -4 },
]

/** 庄川の流れの中心線（手前から奥へ） */
const RIVER_LINE: readonly XZ[] = [
  [-2.75, 3.95],
  [-3.15, 2.5],
  [-3.45, 0.8],
  [-3.45, -0.9],
  [-3.1, -2.6],
  [-2.6, -3.95],
]

/** 山 [x, z, 横の半径, 奥の半径, 高さ] */
const MOUNTAINS: readonly (readonly [number, number, number, number, number])[] = [
  [0.4, -3.6, 2.4, 1.1, 1.3],
  [3.55, -0.6, 0.95, 2.2, 1.0],
  [-4.2, -0.4, 0.55, 1.7, 0.65],
  [2.45, -2.95, 1.0, 0.8, 0.85],
]

export function build(kit: Kit): void {
  kit.ground(GRASS)

  // ---- 段階1：山・川・道・田んぼと、家の低い壁（白） ----
  kit.stage(1)
  kit.order(-1)
  for (const [x, z, rx, rz, h] of MOUNTAINS) kit.mound({ r: Math.max(rx, rz), rx, rz, h, at: [x, 0, z], color: MOUNTAIN })
  kit.water({ points: riverOutline(0.56), h: 0.03, color: RIVER })
  kit.appear('grow')
  kit.box({ w: 0.24, h: 0.018, d: 7.1, at: [-1.92, 0, 0.75], rotY: 1, color: ROAD })
  kit.box({ w: 4.6, h: 0.018, d: 0.2, at: [0.35, 0, -0.85], color: ROAD })
  paddies(kit)
  kit.appear('drop')
  kit.order(0)
  for (const h of [...HOUSES, ...BARNS]) onHouse(kit, h, () => kit.box({ w: h.l, h: WALL_H, d: h.w, color: WOOD }))

  // ---- 段階2：形の特徴＝急な三角屋根（妻面の板壁の三角）（白） ----
  kit.stage(2)
  for (const h of HOUSES) onHouse(kit, h, () => kit.gableRoof({ w: h.l, d: h.w, h: roofH(h), overhang: 0, at: [0, WALL_H, 0], color: WOOD }))

  // ---- 段階3：決め手の細部（白）＝厚い茅の屋根、妻面の障子窓、納屋の屋根 ----
  kit.stage(3)
  HOUSES.forEach((h, i) => thatch(kit, h, THATCH[i % THATCH.length] ?? THATCH[0], true))
  BARNS.forEach((h, i) => thatch(kit, h, THATCH[(i + 1) % THATCH.length] ?? THATCH[0], false))

  // ---- 段階4：周りの景色（色つき）＝杉の山、家のまわりの木、吊り橋、駐車場の車、人 ----
  kit.stage(4)
  scenery(kit)
}

/** 家の座標（底の中心が原点、棟は X 方向＝世界の南北）の中で作る */
function onHouse(kit: Kit, h: House, fn: () => void): void {
  kit.at({ at: [h.x, 0, h.z], rotY: 90 + h.turn }, fn)
}

function roofH(h: House): number {
  return (h.w / 2) * Math.tan((PITCH * Math.PI) / 180)
}

/** 軒先の厚い段：[軒から測った斜面の長さの割合, 屋根の厚みの倍率, 棟の押さえの色へ寄せる割合, 軒先から張り出す長さ] */
const EAVE_STEPS: readonly (readonly [number, number, number, number])[] = [
  [0.55, 1.35, 0.12, 0.006],
  [0.22, 1.75, 0.25, 0.012],
]

/**
 * 茅の屋根：棟から軒へ下りる厚い板を2枚。妻側と軒側へ張り出す。てっぺんに棟の押さえ。
 * 講評r1：茅葺きが平らな一枚板に見えた → 軒先ほど厚くなる段を2つ重ねる（厚み1倍→斜面の下55%は1.35倍・下22%は1.75倍）。
 * 斜面に横の段の筋が2本出て、妻側の切り口も段々になる。軒先の段ほど色を少し暗く（古い茅）する
 */
function thatch(kit: Kit, h: House, color: string, windows: boolean): void {
  const rh = roofH(h)
  const t = Math.max(0.06, h.w * 0.15)
  const over = Math.max(0.05, h.w * 0.14)
  onHouse(kit, h, () =>
    kit.part(() => {
      for (const s of [-1, 1]) {
        // 屋根の面の線（妻の三角の斜辺）を、厚みの半分だけ外へずらし、軒の側へ伸ばす
        const ez = (s * h.w) / 2
        const ey = WALL_H
        const ry = WALL_H + rh
        const len = Math.hypot(ez, rh)
        const dz = -ez / len
        const dy = rh / len
        const nz = s * (rh / len)
        const ny = h.w / 2 / len
        const from: Vec3 = [0, ey - dy * over + ny * (t / 2), ez - dz * over + nz * (t / 2)]
        const to: Vec3 = [0, ry + dy * 0.02 + ny * (t / 2), dz * 0.02 + nz * (t / 2)]
        kit.beam({ from, to, size: t, width: h.l + over * 2, color })
        // 軒先の厚い段。下の面はもとの板よりわずかに上（0.002）に置き、軒の切り口も少しずつ前へ出して、面が重ならないようにする
        for (const [a, k, dark, ahead] of EAVE_STEPS) {
          const st = t * k
          const off = st / 2 + 0.002
          const back = over + ahead
          const fromS: Vec3 = [0, ey - dy * back + ny * off, ez - dz * back + nz * off]
          const toS: Vec3 = [0, ey + dy * a * len + ny * off, ez + dz * a * len + nz * off]
          kit.beam({ from: fromS, to: toS, size: st, width: h.l + over * 2 + ahead, color: mixHex(color, RIDGE, dark) })
        }
      }
      kit.box({ w: h.l + over * 2 + 0.02, h: t * 0.7, d: t * 1.3, at: [0, WALL_H + rh + t * 0.3, 0], color: RIDGE })
      if (windows) gableWindows(kit, h, rh)
    }),
  )
}

/** 妻面（南北の三角の板壁）の障子窓：下から3つ・2つ・1つ */
function gableWindows(kit: Kit, h: House, rh: number): void {
  const rows: readonly (readonly [number, readonly number[]])[] = [
    [0.22, [-0.28, 0, 0.28]],
    [0.47, [-0.14, 0.14]],
    [0.7, [0]],
  ]
  for (const sx of [-1, 1]) {
    for (const [fy, zs] of rows) {
      const y = WALL_H + rh * fy
      for (const fz of zs) {
        kit.box({ w: 0.012, h: rh * 0.11, d: h.w * 0.16, at: [(sx * h.l) / 2, y, fz * h.w], color: SHOJI })
      }
    }
  }
}

/** 川の輪郭：中心線の両側に幅 w/2 ずつ。台座の円からはみ出す点は内へ寄せる */
function riverOutline(w: number): XZ[] {
  const left: XZ[] = []
  const right: XZ[] = []
  for (let i = 0; i < RIVER_LINE.length; i++) {
    const p = RIVER_LINE[i] as XZ
    const a = RIVER_LINE[Math.max(0, i - 1)] as XZ
    const b = RIVER_LINE[Math.min(RIVER_LINE.length - 1, i + 1)] as XZ
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const len = Math.hypot(dx, dz)
    const nx = -dz / len
    const nz = dx / len
    left.push(clampDisc([p[0] + (nx * w) / 2, p[1] + (nz * w) / 2]))
    right.push(clampDisc([p[0] - (nx * w) / 2, p[1] - (nz * w) / 2]))
  }
  return [...left, ...right.reverse()]
}

function clampDisc(p: XZ): XZ {
  const r = Math.hypot(p[0], p[1])
  const max = 4.88
  return r > max ? [(p[0] * max) / r, (p[1] * max) / r] : p
}

/** 川の中心線の、奥行き z での x（川沿いの物を置くため） */
function riverX(z: number): number {
  for (let i = 1; i < RIVER_LINE.length; i++) {
    const [x0, z0] = RIVER_LINE[i - 1] as XZ
    const [x1, z1] = RIVER_LINE[i] as XZ
    if ((z <= z0 && z >= z1) || (z >= z0 && z <= z1)) return x0 + ((x1 - x0) * (z - z0)) / (z1 - z0)
  }
  return -3.3
}

/** 田んぼ：家・道・川・山を避けて、すき間（あぜ）を残して並べる。横の列ごとに1つの部品 */
function paddies(kit: Kit): void {
  const cw = 0.36
  const cd = 0.3
  for (let row = 0; row < 22; row++) {
    const z = -2.8 + row * (cd + 0.04)
    const cells: XZ[] = []
    for (let col = 0; col < 14; col++) {
      const x = -1.55 + col * (cw + 0.04) + (row % 2 === 0 ? 0 : 0.07)
      if (!paddyOk(kit, x, z, cw, cd)) continue
      cells.push([x, z])
    }
    if (cells.length === 0) continue
    kit.part(() => {
      for (const [x, z] of cells) kit.box({ w: cw, h: 0.025, d: cd, at: [x, 0, z], color: PADDY, finish: 'satin' })
    })
  }
}

function paddyOk(kit: Kit, x: number, z: number, w: number, d: number): boolean {
  for (const [cx, cz] of [
    [x - w / 2, z - d / 2],
    [x + w / 2, z - d / 2],
    [x - w / 2, z + d / 2],
    [x + w / 2, z + d / 2],
  ] as const) {
    if (Math.hypot(cx, cz) > 4.75) return false
    if (kit.groundAt(cx, cz) > 0.005) return false
    if (Math.abs(cx - riverX(cz)) < 0.55) return false
  }
  if (Math.abs(x + 1.92) < w / 2 + 0.16) return false
  if (Math.abs(z + 0.85) < d / 2 + 0.12) return false
  for (const h of [...HOUSES, ...BARNS]) {
    if (Math.abs(x - h.x) < w / 2 + h.w / 2 + 0.1 && Math.abs(z - h.z) < d / 2 + h.l / 2 + 0.1) return false
  }
  return true
}

function scenery(kit: Kit): void {
  // 杉の山（山の上にだけ）
  kit.scatter(
    { count: 46, rMin: 1.5, rMax: 4.7, gap: 0.3, ok: (x, z) => kit.groundAt(x, z) > 0.12 },
    (_i, x, z) => {
      kit.tree({ kind: 'cone', h: kit.range(0.42, 0.62), at: [x, kit.groundAt(x, z) - 0.04, z], color: kit.pick(['#2E5536', '#36603D', '#294C30']) })
    },
  )
  // 家のまわりの木と、川沿いの木
  for (const [x, z] of [
    [-1.55, 0.25],
    [1.35, -0.55],
    [-0.15, -1.25],
    [2.75, 1.0],
    [-1.6, 2.05],
    [0.15, 3.85],
    [2.75, 3.2],
    [1.25, 2.4],
  ] as const) {
    kit.tree({ kind: 'round', h: kit.range(0.36, 0.48), at: [x, 0, z], color: kit.pick(['#4E7F3E', '#5A8B45']) })
  }
  for (const z of [3.2, 0.0, -1.7, -3.0]) {
    kit.tree({ kind: 'round', h: kit.range(0.36, 0.44), at: [riverX(z) + 0.5, 0, z], color: '#557F40' })
  }
  // 吊り橋（出合橋）：川をまたぐ細い板と、たわんだ綱
  const bz = 1.7
  const bx0 = riverX(bz) + 0.5
  const bx1 = riverX(bz) - 0.55
  kit.part(() => {
    kit.box({ w: bx0 - bx1, h: 0.02, d: 0.12, at: [(bx0 + bx1) / 2, 0.12, bz], color: '#8A6E4E' })
    for (const s of [-0.06, 0.06]) {
      const mid = (bx0 + bx1) / 2
      kit.beam({ from: [bx0, 0.3, bz + s], to: [mid, 0.17, bz + s], size: 0.012, color: '#5E5A55' })
      kit.beam({ from: [mid, 0.17, bz + s], to: [bx1, 0.3, bz + s], size: 0.012, color: '#5E5A55' })
      kit.box({ w: 0.03, h: 0.3, d: 0.03, at: [bx0, 0, bz + s], color: '#5E5A55' })
      kit.box({ w: 0.03, h: 0.3, d: 0.03, at: [bx1, 0, bz + s], color: '#5E5A55' })
    }
  })
  // 対岸の駐車場の車と、道の車
  for (const [x, z, r] of [
    [-4.05, 1.35, 90],
    [-4.05, 1.65, 90],
    [-4.05, 1.95, 90],
    [-4.0, 2.25, 60],
    [-1.98, 3.4, 0],
    [-1.86, -1.9, 180],
  ] as const) {
    kit.car({ at: [x, 0.018, z], rotY: r })
  }
  // 人：道と、家のまわり
  for (const [x, z] of [
    [-1.88, 2.4],
    [-1.98, 1.9],
    [-1.9, 0.2],
    [-1.0, -0.85],
    [0.2, -0.82],
    [1.1, -0.88],
    [-0.1, 2.15],
    [1.3, 1.05],
    [-3.1, 1.7],
    [0.5, -1.35],
  ] as const) {
    kit.person({ at: [x, 0.02, z], rotY: kit.range(0, 360) })
  }
}

/** 2つの色（#RRGGBB）を t の割合で混ぜる */
function mixHex(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number): number => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  let out = '#'
  for (let i = 0; i < 3; i++) out += Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')
  return out
}
