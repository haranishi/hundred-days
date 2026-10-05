// 東大寺大仏殿：横に広い巨大な仏殿。下に裳階（もこし）の屋根、上に長い棟の寄棟の大屋根。棟の両端に金の鴟尾。
// 正面の裳階の中央に弓なりの唐破風（中に観相窓）、殿の前に金銅の八角燈籠。中門と回廊が砂利の庭を囲み、外の芝生に鹿。
// 正面（+Z）が南＝中門の側。白いうちは「大きな寺の屋根」まで（唐招提寺と迷う）で、
// 段階3の唐破風・鴟尾・八角燈籠と人の背丈との桁違いの大きさ、色塗りの金と朱の回廊、鹿で決まる。
import { COLORS, type Finish, type Kit, type Vec3, type XZ } from './kit'

const ROOF = '#3D3F42' // 黒っぽい瓦
const WALL = '#ECE6D8' // 白壁
const FRAME = '#5A3E2B' // 柱や梁の焦げ茶
const DOOR = '#4A3426'
const LATTICE = '#5B5E58'
const GOLD = COLORS.gold
const BRONZE = '#B08D57'
const STONE = '#B8B0A0'
const GRAVEL = '#D6CFBF'
const SHU = '#C8452F' // 回廊・中門の朱
const TILE = '#5A5E64'

/** 大仏殿の中心と各部の寸法 */
const HZ = -1.45
const POD = 0.14 // 基壇
const W1 = 3.3 // 下の壁（裳階の内側）
const D1 = 2.9
const H1 = 0.72
const MOKOSHI = 0.3 // 裳階の屋根の高さ
const W2 = 2.85 // 上の壁
const D2 = 2.45
const H2 = 0.58
const ROOF_H = 0.9
const RIDGE = 1.0 // 棟の長さの半分
const Y1 = POD + H1 // 下の壁の上
const Y2 = Y1 + MOKOSHI // 上の壁の下
const Y3 = Y2 + H2 // 大屋根の付け根

/** 回廊 */
const CX = 3.0 // 左右の回廊の位置
const CF = 3.3 // 前の回廊の位置
const CW = 0.3 // 回廊の幅

export function build(kit: Kit): void {
  kit.ground(COLORS.lawn)

  // ---- 段階1：砂利の庭と参道・裏の丘、大仏殿の基壇と下の壁、回廊と中門の壁（白） ----
  kit.stage(1)
  kit.order(-1)
  kit.box({ w: CX * 2 - 0.1, h: 0.012, d: CF - HZ - 0.1, at: [0, 0, (CF + HZ) / 2], color: GRAVEL })
  kit.box({ w: 0.5, h: 0.022, d: CF - 0.2, at: [0, 0, CF / 2 + 0.05], color: STONE })
  kit.mound({ r: 1.6, rx: 1.6, rz: 0.72, h: 0.6, at: [0.6, 0, -4.05], color: '#7FA85A' })
  kit.order(0)
  kit.part(() => {
    kit.box({ w: W1 + 0.45, h: POD, d: D1 + 0.4, at: [0, 0, HZ], color: STONE })
    kit.box({ w: W1, h: H1, d: D1, at: [0, POD, HZ], color: WALL })
  })
  for (const [from, to] of CORRIDORS) corridorBody(kit, from, to)
  kit.box({ w: 1.1, h: 0.42, d: 0.5, at: [0, 0, CF], color: SHU })

  // ---- 段階2：形の特徴＝裳階の屋根と、長い棟の寄棟の大屋根。回廊と中門の屋根（白） ----
  kit.stage(2)
  kit.order(-1) // 大屋根を先に
  kit.curvedRoof({ w: W1, d: D1, h: MOKOSHI, at: [0, Y1, HZ], style: 'skirt', top: { w: W2, d: D2 }, overhang: 0.32, upturn: 0.07, thick: 0.05, color: ROOF })
  kit.part(() => {
    kit.box({ w: W2, h: H2, d: D2, at: [0, Y2, HZ], color: WALL })
    kit.curvedRoof({ w: W2, d: D2, h: ROOF_H, at: [0, Y3, HZ], style: 'yosemune', ridge: RIDGE, overhang: 0.4, upturn: 0.12, curve: 1.45, thick: 0.06, color: ROOF })
  })
  kit.order(0)
  for (const [from, to] of CORRIDORS) corridorRoof(kit, from, to)
  // 中門の上の階と屋根
  kit.part(() => {
    kit.curvedRoof({ w: 1.1, d: 0.5, h: 0.1, at: [0, 0.42, CF], style: 'skirt', top: { w: 0.86, d: 0.38 }, overhang: 0.16, upturn: 0.04, thick: 0.035, color: TILE })
    kit.box({ w: 0.86, h: 0.26, d: 0.38, at: [0, 0.52, CF], color: SHU })
    kit.curvedRoof({ w: 0.86, d: 0.38, h: 0.26, at: [0, 0.78, CF], style: 'irimoya', overhang: 0.17, upturn: 0.06, color: TILE, gableColor: WALL })
  })

  // ---- 段階3：決め手の細部（白）＝正面の唐破風と観相窓、金の鴟尾、正面の柱と扉、金銅八角燈籠 ----
  kit.stage(3)
  karahafu(kit)
  kit.part(() => {
    for (const s of [-1, 1] as const) shibi(kit, s)
  })
  facade(kit)
  octagonalLantern(kit, [0, 0.02, 0.95])

  // ---- 段階4：周りの景色（色つき）＝鹿・松と木・人 ----
  kit.stage(4)
  const outside = (x: number, z: number) => Math.abs(x) > CX + 0.3 || z > CF + 0.3 || (z < HZ - 0.3 && Math.abs(x) > 2.1) || z < HZ - D1 / 2 - 0.5
  // 回廊の外の松と木
  kit.scatter({ count: 26, rMin: 2.2, rMax: 4.65, gap: 0.42, ok: (x, z) => outside(x, z) && !(Math.abs(x) < 1.0 && z > CF) }, (_i, x, z) => {
    const kind = kit.pick(['pine', 'round', 'round', 'cone'] as const)
    kit.tree({ kind, h: kit.range(0.48, 0.66), at: [x, Math.max(0, kit.groundAt(x, z) - 0.04), z], rotY: kit.range(0, 360), color: kind === 'pine' ? undefined : kit.pick(['#4F8A45', '#5C9A4C', '#3F7A44']) })
  })
  // 鹿（芝生の上）
  kit.scatter({ count: 18, rMin: 1.8, rMax: 4.7, gap: 0.26, ok: (x, z) => outside(x, z) }, (_i, x, z) =>
    kit.deer({ at: [x, Math.max(0, kit.groundAt(x, z) - 0.02), z], rotY: kit.range(0, 360) }),
  )
  // 人（庭の参道と燈籠のまわり、中門の外）
  kit.scatter({ count: 14, rMin: 0.3, rMax: 3.2, gap: 0.2, ok: (x, z) => Math.abs(x) < 2.6 && z > 0.55 && z < CF - 0.4 && Math.hypot(x, z - 0.95) > 0.28 }, (_i, x, z) =>
    kit.person({ at: [x, 0.015, z], rotY: kit.range(140, 220) }),
  )
  for (const [x, z] of [
    [-0.6, 3.85],
    [0.45, 3.95],
    [1.2, 4.1],
    [-1.3, 4.05],
  ] as const) {
    kit.person({ at: [x, 0, z], rotY: kit.range(0, 360) })
  }
}

/** 回廊（中門から左右へ、横を奥へ、大仏殿の横へ） */
const CORRIDORS: readonly (readonly [XZ, XZ])[] = [
  [[-0.55, CF], [-CX, CF]],
  [[0.55, CF], [CX, CF]],
  [[-CX, CF], [-CX, HZ]],
  [[CX, CF], [CX, HZ]],
  [[-CX, HZ], [-W1 / 2 - 0.22, HZ]],
  [[CX, HZ], [W1 / 2 + 0.22, HZ]],
]

/** 回廊の向き（中心・長さ・回転） */
function segment(from: XZ, to: XZ): { cx: number; cz: number; len: number; rotY: number } {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  return { cx: (from[0] + to[0]) / 2, cz: (from[1] + to[1]) / 2, len: Math.hypot(dx, dz), rotY: (Math.atan2(dx, dz) * 180) / Math.PI - 90 }
}

/** 回廊の壁（外側の白壁と、内側の朱の柱） */
function corridorBody(kit: Kit, from: XZ, to: XZ): void {
  const { cx, cz, len, rotY } = segment(from, to)
  kit.at({ at: [cx, 0, cz], rotY }, () =>
    kit.part(() => {
      kit.box({ w: len + CW, h: 0.04, d: CW, color: STONE })
      kit.box({ w: len + CW, h: 0.3, d: 0.08, at: [0, 0.04, 0], color: WALL })
      const n = Math.max(1, Math.round(len / 0.32))
      for (let i = 0; i <= n; i++) {
        const x = -len / 2 + (len * i) / n
        for (const s of [-1, 1]) kit.box({ w: 0.04, h: 0.3, d: 0.04, at: [x, 0.04, s * (CW / 2 - 0.02)], color: SHU })
      }
    }),
  )
}

/** 回廊の屋根（灰色の切妻） */
function corridorRoof(kit: Kit, from: XZ, to: XZ): void {
  const { cx, cz, len, rotY } = segment(from, to)
  kit.at({ at: [cx, 0.34, cz], rotY }, () => kit.gableRoof({ w: len + CW, d: CW, h: 0.13, overhang: 0.06, color: TILE }))
}

/** 正面の裳階の中央の唐破風。中に観相窓（格子の窓） */
function karahafu(kit: Kit): void {
  const span = 1.2
  const g = 0.46
  const zWall = HZ + D2 / 2
  const zFront = HZ + D1 / 2 + 0.34
  const len = zFront - zWall + 0.05
  const zc = (zFront + zWall) / 2
  const top = (u: number) => g * (0.1 + 0.9 * ((1 + Math.cos(Math.PI * u)) / 2) ** 0.85)
  const slab: XZ[] = []
  const n = 14
  for (let i = 0; i <= n; i++) {
    const u = -1 + (2 * i) / n
    slab.push([(u * span) / 2, top(u)])
  }
  for (let i = n; i >= 0; i--) {
    const u = -1 + (2 * i) / n
    slab.push([(u * span) / 2, top(u) - 0.06])
  }
  const face: XZ[] = [[(-0.92 * span) / 2, 0]]
  for (let i = 0; i <= n; i++) {
    const u = -0.92 + (1.84 * i) / n
    face.push([(u * span) / 2, Math.max(0.01, top(u) - 0.075)])
  }
  face.push([(0.92 * span) / 2, 0])
  kit.part(() => {
    plate(kit, slab, len, [0, Y1 - 0.02, zc], ROOF)
    plate(kit, face, 0.03, [0, Y1 - 0.02, zFront - 0.02], FRAME)
    // 観相窓（唐破風の中の横長の窓）と金の飾り
    kit.box({ w: 0.44, h: 0.12, d: 0.02, at: [0, Y1 + 0.08, zFront - 0.002], color: LATTICE })
    for (let k = 0; k <= 6; k++) kit.box({ w: 0.012, h: 0.12, d: 0.024, at: [-0.22 + k * 0.0733, Y1 + 0.08, zFront], color: '#2E2A26' })
    kit.box({ w: 0.08, h: 0.06, d: 0.02, at: [0, Y1 + g - 0.15, zFront], color: GOLD, finish: 'gold' })
  })
}

/** 棟の端の金の鴟尾（side=1 が右）。魚の尾のように、上で内側へ反る */
function shibi(kit: Kit, side: 1 | -1): void {
  const y = Y3 + ROOF_H + 0.02
  const x = side * (RIDGE + 0.02)
  const s = side
  const pts: XZ[] = [
    [-0.07 * s, 0],
    [0.08 * s, 0],
    [0.11 * s, 0.12],
    [0.08 * s, 0.25],
    [0.0, 0.33],
    [-0.1 * s, 0.36],
    [-0.07 * s, 0.28],
    [-0.03 * s, 0.19],
    [-0.06 * s, 0.09],
  ]
  plate(kit, pts, 0.13, [x, y, HZ], GOLD, 'gold')
}

/** 正面の柱・梁・扉・格子窓（下の階と上の階） */
function facade(kit: Kit): void {
  kit.part(() => {
    const z1 = HZ + D1 / 2 + 0.006
    const z2 = HZ + D2 / 2 + 0.006
    const bays = 7
    for (let i = 0; i <= bays; i++) {
      const x1 = -W1 / 2 + (W1 * i) / bays
      kit.box({ w: 0.08, h: H1, d: 0.025, at: [x1, POD, z1], color: FRAME })
      const x2 = -W2 / 2 + (W2 * i) / bays
      kit.box({ w: 0.07, h: H2, d: 0.025, at: [x2, Y2, z2], color: FRAME })
    }
    kit.box({ w: W1, h: 0.07, d: 0.03, at: [0, Y1 - 0.08, z1], color: FRAME })
    kit.box({ w: W1, h: 0.05, d: 0.03, at: [0, POD, z1], color: FRAME })
    kit.box({ w: W2, h: 0.06, d: 0.03, at: [0, Y3 - 0.07, z2], color: FRAME })
    for (let i = 0; i < bays; i++) {
      const xc = -W1 / 2 + (W1 * (i + 0.5)) / bays
      const bw = W1 / bays - 0.12
      if (i >= 2 && i <= 4) kit.box({ w: bw, h: 0.48, d: 0.02, at: [xc, POD + 0.05, z1], color: DOOR })
      else kit.box({ w: bw, h: 0.16, d: 0.02, at: [xc, POD + 0.38, z1], color: LATTICE })
      const xc2 = -W2 / 2 + (W2 * (i + 0.5)) / bays
      kit.box({ w: W2 / bays - 0.12, h: 0.14, d: 0.02, at: [xc2, Y2 + 0.24, z2], color: LATTICE })
    }
  })
}

/** 金銅の八角燈籠（石の台つき）。実物より大きめにして、殿の前で見えるようにする */
function octagonalLantern(kit: Kit, at: Vec3): void {
  const b = { color: BRONZE, finish: 'metal' as Finish }
  kit.at({ at }, () =>
    kit.part(() => {
      kit.box({ w: 0.34, h: 0.05, d: 0.34, color: STONE })
      kit.cylinder({ r: 0.12, h: 0.05, at: [0, 0.05, 0], seg: 8, rotY: 22.5, ...b })
      kit.cylinder({ r: 0.035, h: 0.15, at: [0, 0.1, 0], seg: 8, ...b })
      kit.cylinder({ r: 0.1, h: 0.03, at: [0, 0.25, 0], seg: 8, rotY: 22.5, ...b })
      kit.cylinder({ r: 0.075, h: 0.13, at: [0, 0.28, 0], seg: 8, rotY: 22.5, ...b })
      kit.cone({ r: 0.13, h: 0.08, at: [0, 0.41, 0], seg: 8, rotY: 22.5, ...b })
      kit.sphere({ r: 0.025, at: [0, 0.48, 0], seg: 8, ...b })
    }),
  )
}

/** 正面から見た輪郭 points（[x, y]）を、奥行き depth の板にする。板は at を中心に Z の前後へ半分ずつ */
function plate(kit: Kit, points: readonly XZ[], depth: number, at: Vec3, color: string, finish?: Finish): void {
  kit.at({ at }, () => kit.extrude({ points, h: depth, rot: [-90, 0, 0], at: [0, 0, depth / 2], color, finish }))
}
