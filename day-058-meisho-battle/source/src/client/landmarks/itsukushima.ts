// 厳島神社：海に立つ朱の大鳥居（主柱2本の前後に袖柱を添えた6本足の両部鳥居）と、海の上に建つ社殿・回廊、後ろの弥山の森。
// 正面（+Z）が海＝大鳥居の側、奥（-Z）が社殿と山。白いうちは「鳥居と社殿」まで（平安神宮・伏見稲荷と迷う）で、
// 袖柱の6本足（段階3）と、色塗りで出る海の青・朱で決まる。
import { COLORS, type Finish, type Kit, type Vec3, type XZ } from './kit'

const SHU = COLORS.vermilion
const BARK = '#5B4636' // 檜皮葺きの屋根
const WALL = '#F4F0E6'
const DECK = '#9E8763' // 床板
const SAND = '#CDB98D' // 干潟と浜の砂（地面）
const SEA = '#2B76A0'
const HILL = '#4E7F4A'

/** 大鳥居の位置（海の中）と拡大。主役なので実物の比率より一回り大きくする */
const TZ = 2.1
const TS = 1.25
/** 社殿の床の高さ（海の上に柱で立つ） */
const FY = 0.13

/** 海の輪郭。手前はすべて海で、奥の入り江に社殿が建つ。左右の奥は浜と山 */
const SHORE: readonly XZ[] = [
  [4.35, -2.31],
  [3.6, -1.6],
  [2.9, -1.05],
  [2.35, -1.0],
  [2.05, -1.35],
  [1.95, -2.1],
  [1.6, -2.65],
  [0.8, -2.85],
  [0, -2.9],
  [-0.8, -2.85],
  [-1.6, -2.65],
  [-1.95, -2.1],
  [-2.05, -1.35],
  [-2.4, -0.98],
  [-3.0, -1.0],
  [-3.7, -1.55],
  [-4.35, -2.31],
]

/** 山（弥山とその左右） [x, z, 横の半径, 奥の半径, 高さ] */
const HILLS: readonly (readonly [number, number, number, number, number])[] = [
  [-0.3, -3.55, 2.3, 1.15, 1.75],
  [2.2, -2.95, 1.35, 1.05, 1.15],
  [-2.45, -2.6, 1.2, 1.0, 0.7],
]

export function build(kit: Kit): void {
  kit.ground(SAND)

  // ---- 段階1：海・浜・山と、大きな塊（白） ----
  kit.stage(1)
  kit.order(-1) // 地形を先に
  kit.water({ points: seaOutline(), h: 0.035, color: SEA })
  for (const [x, z, rx, rz, h] of HILLS) kit.mound({ r: Math.max(rx, rz), rx, rz, h, at: [x, 0, z], color: HILL })
  kit.order(0)
  // 社殿の床（海の上に柱で立つ）
  deck(kit, [
    [-0.75, -1.6],
    [0.75, -1.6],
    [0.75, -0.85],
    [0.18, -0.85],
    [0.18, -0.55],
    [-0.18, -0.55],
    [-0.18, -0.85],
    [-0.75, -0.85],
  ])
  deck(kit, rect(0, -2.2, 2.3, 0.95))
  deck(kit, rect(-1.6, -1.65, 0.3, 1.5))
  deck(kit, rect(1.6, -1.65, 0.3, 1.5))
  deck(kit, rect(-2.15, -0.98, 0.95, 0.26))
  deck(kit, rect(2.15, -0.98, 0.95, 0.26))
  // 本社（拝殿・本殿）と祓殿の壁
  body(kit, 0, -2.4, 1.8, 0.5, 0.26)
  body(kit, 0, -1.92, 1.0, 0.4, 0.2)
  // 大鳥居の主柱2本（白いうちは「海に立つ2本の柱」）
  torii(kit, () => {
    for (const x of [-0.6, 0.6]) kit.cylinder({ r: 0.14, rTop: 0.12, h: 1.52, at: [x, 0, 0], seg: 14, color: SHU })
  })

  // ---- 段階2：形の特徴＝鳥居の横木と、社殿・回廊の屋根（白） ----
  kit.stage(2)
  kit.curvedRoof({ w: 1.8, d: 0.5, h: 0.34, at: [0, FY + 0.26, -2.4], style: 'irimoya', overhang: 0.16, upturn: 0.05, color: BARK, gableColor: WALL })
  kit.curvedRoof({ w: 1.0, d: 0.4, h: 0.26, at: [0, FY + 0.2, -1.92], style: 'irimoya', overhang: 0.14, upturn: 0.05, color: BARK, gableColor: WALL })
  corridor(kit, [-1.6, -0.95], [-1.6, -2.35])
  corridor(kit, [-1.6, -2.35], [-0.92, -2.35])
  corridor(kit, [-1.6, -0.98], [-2.6, -0.98])
  corridor(kit, [1.6, -0.95], [1.6, -2.35])
  corridor(kit, [1.6, -2.35], [0.92, -2.35])
  corridor(kit, [1.6, -0.98], [2.6, -0.98])
  // 鳥居の貫・島木・笠木（下から順に落ちる）
  torii(kit, () => {
    kit.box({ w: 2.05, h: 0.11, d: 0.12, at: [0, 1.12, 0], color: SHU })
    plate(kit, curvedBeam(1.22, 0, 0.1, 0.06, 0.02), 0.17, [0, 1.5, 0], SHU)
    kit.part(() => {
      plate(kit, curvedBeam(1.36, 0, 0.13, 0.17, 0.07), 0.2, [0, 1.6, 0], SHU)
      // 笠木の上の檜皮葺きの屋根（黒っぽい）
      plate(kit, curvedBeam(1.45, 0, 0.055, 0.18, 0.04), 0.26, [0, 1.72, 0], BARK)
    })
  })

  // ---- 段階3：決め手の細部（白）＝袖柱4本と控貫、額束、社殿の高欄と高舞台 ----
  kit.stage(3)
  torii(kit, () => {
    for (const x of [-0.6, 0.6]) {
      kit.part(() => {
        for (const dz of [-0.5, 0.5]) {
          kit.cylinder({ r: 0.065, h: 0.92, at: [x, 0, dz], seg: 10, color: SHU })
          kit.hipRoof({ w: 0.17, d: 0.17, h: 0.07, at: [x, 0.92, dz], overhang: 0.03, color: BARK })
        }
        kit.box({ w: 0.07, h: 0.07, d: 1.1, at: [x, 0.84, 0], color: SHU })
        kit.box({ w: 0.07, h: 0.07, d: 1.1, at: [x, 0.46, 0], color: SHU })
      })
    }
    kit.box({ w: 0.13, h: 0.28, d: 0.1, at: [0, 1.225, 0], color: SHU })
  })
  // 平舞台の高欄（朱）と高舞台
  railing(kit, [
    [-0.75, -1.6],
    [-0.75, -0.85],
    [-0.18, -0.85],
    [-0.18, -0.55],
    [0.18, -0.55],
    [0.18, -0.85],
    [0.75, -0.85],
    [0.75, -1.6],
  ])
  kit.part(() => {
    kit.box({ w: 0.5, h: 0.07, d: 0.4, at: [0, FY, -1.2], color: DECK })
    for (const [x, z] of [
      [-0.25, -1.0],
      [0.25, -1.0],
      [-0.25, -1.4],
      [0.25, -1.4],
    ] as const) {
      kit.box({ w: 0.03, h: 0.07, d: 0.03, at: [x, FY + 0.07, z], color: SHU })
    }
    kit.box({ w: 0.5, h: 0.025, d: 0.025, at: [0, FY + 0.14, -1.0], color: SHU })
    kit.box({ w: 0.025, h: 0.025, d: 0.4, at: [-0.25, FY + 0.14, -1.2], color: SHU })
    kit.box({ w: 0.025, h: 0.025, d: 0.4, at: [0.25, FY + 0.14, -1.2], color: SHU })
  })
  // 火焼前の灯籠
  kit.part(() => {
    kit.box({ w: 0.06, h: 0.04, d: 0.06, at: [0, FY, -0.62], color: '#8E8A82' })
    kit.cylinder({ r: 0.018, h: 0.1, at: [0, FY + 0.04, -0.62], seg: 6, color: '#8E8A82' })
    kit.box({ w: 0.07, h: 0.06, d: 0.07, at: [0, FY + 0.14, -0.62], color: '#8E8A82' })
    kit.pyramid({ w: 0.1, h: 0.05, at: [0, FY + 0.2, -0.62], color: '#8E8A82' })
  })

  // ---- 段階4：周りの景色（色つき）＝五重塔・森・浜の松と灯籠・鹿・船・人 ----
  kit.stage(4)
  const on = (x: number, z: number): Vec3 => [x, Math.max(0, kit.groundAt(x, z) - 0.03), z]
  pagoda(kit, on(-2.55, -2.7))
  // 山の森（ところどころ紅葉）
  kit.scatter(
    { count: 46, rMin: 2.2, rMax: 4.6, gap: 0.36, ok: (x, z) => z < -2.5 + Math.abs(x) * 0.12 && !inBay(x, z) && Math.hypot(x + 2.55, z + 2.7) > 0.4 && kit.groundAt(x, z) > 0.12 },
    (_i, x, z) => {
      const maple = kit.chance(0.2)
      kit.tree({
        kind: maple ? 'round' : kit.pick(['cone', 'cone', 'round'] as const),
        h: kit.range(0.45, 0.68),
        at: on(x, z),
        color: maple ? kit.pick(['#C8532E', '#E0892F', '#B83A2A']) : kit.pick(['#3F6F45', '#4A7C4A', '#365F3D', '#2F5E3E']),
      })
    },
  )
  // 浜の松
  for (const [x, z] of [
    [-2.7, -1.62],
    [-3.15, -1.78],
    [-3.95, -2.15],
    [2.75, -1.48],
    [3.4, -1.75],
    [3.95, -2.15],
  ] as const) {
    kit.tree({ kind: 'pine', h: kit.range(0.5, 0.62), at: on(x, z), rotY: kit.range(0, 360) })
  }
  // 浜の石灯籠（御笠浜の並び）
  for (let i = 0; i < 4; i++) stoneLantern(kit, on(-2.6 - i * 0.4, -1.22 - i * 0.16))
  // 鹿
  for (const [x, z, r] of [
    [-2.9, -1.45, 40],
    [-3.55, -1.68, 250],
    [-3.25, -1.25, 160],
    [2.55, -1.38, 300],
    [3.1, -1.3, 200],
  ] as const) {
    kit.deer({ at: on(x, z), rotY: r })
  }
  // 船（大鳥居のそばの小舟と、左の遊覧船）
  kit.boat({ kind: 'row', at: [1.9, 0.035, 3.0], rotY: 25, len: 0.48, color: '#8A5A3A' })
  kit.boat({ kind: 'row', at: [-1.45, 0.035, 3.55], rotY: -70, len: 0.45, color: '#6E4A33' })
  kit.boat({ kind: 'row', at: [0.3, 0.035, 0.95], rotY: 170, len: 0.42, color: '#7C5236' })
  kit.boat({ kind: 'ship', at: [-3.0, 0.035, 2.35], rotY: 60, len: 0.95 })
  // 人：浜の人と、社殿の床の上の人
  for (const [x, z] of [
    [-2.45, -1.32],
    [-2.75, -1.2],
    [-3.7, -1.95],
    [3.25, -1.55],
    [2.6, -1.68],
  ] as const) {
    kit.person({ at: on(x, z), rotY: kit.range(120, 240) })
  }
  for (const [x, z] of [
    [0.05, -0.68],
    [-0.35, -0.98],
    [0.45, -1.45],
    [-1.6, -1.55],
    [1.6, -1.95],
    [-0.55, -1.75],
  ] as const) {
    kit.person({ at: [x, FY, z], rotY: kit.range(120, 240) })
  }
}

/** 大鳥居の座標の中で作る（底の中心が原点、拡大 TS） */
function torii(kit: Kit, fn: () => void): void {
  kit.at({ at: [0, 0, TZ], scale: TS }, fn)
}

/** 手前の海の輪郭：岸の線と、台座のふちの円弧をつなぐ */
function seaOutline(): XZ[] {
  const pts: XZ[] = [...SHORE]
  const r = 4.88
  const a0 = -118
  const a1 = 118
  const n = 28
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180
    pts.push([Math.sin(a) * r, Math.cos(a) * r])
  }
  return pts
}

/** 入り江（社殿の建つ海）の中か */
function inBay(x: number, z: number): boolean {
  return Math.abs(x) < 2.1 && z > -2.95
}

/** 中心 (x, z)、幅 w・奥行き d の長方形の輪郭 */
function rect(x: number, z: number, w: number, d: number): XZ[] {
  return [
    [x - w / 2, z - d / 2],
    [x + w / 2, z - d / 2],
    [x + w / 2, z + d / 2],
    [x - w / 2, z + d / 2],
  ]
}

/** 海の上の床：輪郭の板と、下の朱の柱をまとめて1つの部品に */
function deck(kit: Kit, outline: readonly XZ[]): void {
  kit.part(() => {
    kit.extrude({ points: outline, h: 0.04, at: [0, FY - 0.04, 0], color: DECK })
    const xs = outline.map((p) => p[0])
    const zs = outline.map((p) => p[1])
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minZ = Math.min(...zs)
    const maxZ = Math.max(...zs)
    const nx = Math.max(1, Math.round((maxX - minX) / 0.3))
    const nz = Math.max(1, Math.round((maxZ - minZ) / 0.3))
    for (let i = 0; i <= nx; i++) {
      for (let k = 0; k <= nz; k++) {
        const x = minX + 0.04 + ((maxX - minX - 0.08) * i) / nx
        const z = minZ + 0.04 + ((maxZ - minZ - 0.08) * k) / nz
        if (!inside(outline, x, z)) continue
        kit.cylinder({ r: 0.02, h: FY - 0.04, at: [x, 0, z], seg: 6, color: SHU })
      }
    }
  })
}

/** 点が輪郭の中か（偶奇判定） */
function inside(poly: readonly XZ[], x: number, z: number): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i] as XZ
    const [xj, zj] = poly[j] as XZ
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit
  }
  return hit
}

/** 社殿の壁（白）と正面の朱の柱 */
function body(kit: Kit, x: number, z: number, w: number, d: number, h: number): void {
  kit.part(() => {
    kit.box({ w: w - 0.06, h, d: d - 0.06, at: [x, FY, z], color: WALL })
    const n = Math.max(2, Math.round(w / 0.25))
    for (let i = 0; i <= n; i++) {
      const px = x - w / 2 + (w * i) / n
      kit.box({ w: 0.04, h, d: 0.04, at: [px, FY, z + d / 2 - 0.02], color: SHU })
      kit.box({ w: 0.04, h, d: 0.04, at: [px, FY, z - d / 2 + 0.02], color: SHU })
    }
    kit.box({ w, h: 0.04, d, at: [x, FY + h - 0.04, z], color: SHU })
  })
}

/** 回廊の一続き：朱の柱の列と、檜皮の切妻屋根 */
function corridor(kit: Kit, from: XZ, to: XZ): void {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const len = Math.hypot(dx, dz)
  const rotY = (Math.atan2(dx, dz) * 180) / Math.PI - 90
  const cx = (from[0] + to[0]) / 2
  const cz = (from[1] + to[1]) / 2
  kit.at({ at: [cx, FY, cz], rotY }, () =>
    kit.part(() => {
      const n = Math.max(1, Math.round(len / 0.24))
      for (let i = 0; i <= n; i++) {
        const x = -len / 2 + (len * i) / n
        kit.box({ w: 0.035, h: 0.2, d: 0.035, at: [x, 0, 0.11], color: SHU })
        kit.box({ w: 0.035, h: 0.2, d: 0.035, at: [x, 0, -0.11], color: SHU })
      }
      kit.box({ w: len, h: 0.03, d: 0.26, at: [0, 0.2, 0], color: SHU })
      kit.gableRoof({ w: len, d: 0.26, h: 0.1, at: [0, 0.23, 0], overhang: 0.05, color: BARK })
    }),
  )
}

/** 高欄（低い手すり）。輪郭の点を順につなぐ */
function railing(kit: Kit, pts: readonly XZ[]): void {
  kit.part(() => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i] as XZ
      const b = pts[i + 1] as XZ
      kit.beam({ from: [a[0], FY + 0.07, a[1]], to: [b[0], FY + 0.07, b[1]], size: 0.022, color: SHU })
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      const n = Math.max(1, Math.round(len / 0.18))
      for (let k = 0; k <= n; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / n
        const z = a[1] + ((b[1] - a[1]) * k) / n
        kit.box({ w: 0.02, h: 0.08, d: 0.02, at: [x, FY, z], color: SHU })
      }
    }
  })
}

/** 正面から見た輪郭 points（[x, y]）を、奥行き depth の板にする。板は at を中心に Z の前後へ半分ずつ */
function plate(kit: Kit, points: readonly XZ[], depth: number, at: Vec3, color: string, finish?: Finish): void {
  kit.at({ at }, () => kit.extrude({ points, h: depth, rot: [-90, 0, 0], at: [0, 0, depth / 2], color, finish }))
}

/** 両端が反り上がる横木の輪郭（正面から見た形）。half は下の辺の半分の長さ、spread は上の辺がさらに外へ出る長さ */
function curvedBeam(half: number, y0: number, thick: number, lift: number, spread: number): XZ[] {
  const n = 14
  const bottom: XZ[] = []
  const top: XZ[] = []
  for (let i = 0; i <= n; i++) {
    const u = -1 + (2 * i) / n
    bottom.push([u * half, y0 + lift * Math.abs(u) ** 2.2])
    const ut = u * (half + spread)
    top.push([ut, y0 + thick + lift * Math.min(1.25, Math.abs(ut) / half) ** 2.2])
  }
  return [...bottom, ...top.reverse()]
}

/** 浜の石灯籠 */
function stoneLantern(kit: Kit, at: Vec3): void {
  const c = { color: '#9A958C' }
  kit.part(() =>
    kit.at({ at }, () => {
      kit.box({ w: 0.07, h: 0.03, d: 0.07, ...c })
      kit.cylinder({ r: 0.016, h: 0.08, at: [0, 0.03, 0], seg: 6, ...c })
      kit.box({ w: 0.06, h: 0.05, d: 0.06, at: [0, 0.11, 0], ...c })
      kit.pyramid({ w: 0.1, h: 0.045, at: [0, 0.16, 0], ...c })
    }),
  )
}

/** 五重塔（朱） */
function pagoda(kit: Kit, at: Vec3): void {
  kit.part(() =>
    kit.at({ at }, () => {
      kit.box({ w: 0.42, h: 0.05, d: 0.42, color: '#A39C91' })
      let y = 0.05
      for (let i = 0; i < 5; i++) {
        const w = 0.28 - i * 0.028
        const h = 0.095
        kit.box({ w, h, d: w, at: [0, y, 0], color: SHU })
        y += h
        if (i < 4) {
          const wn = w - 0.028
          kit.curvedRoof({ w, d: w, h: 0.045, at: [0, y, 0], style: 'skirt', top: { w: wn, d: wn }, overhang: 0.09, upturn: 0.03, thick: 0.03, color: BARK })
          y += 0.045
        } else {
          kit.curvedRoof({ w, d: w, h: 0.09, at: [0, y, 0], style: 'hogyo', overhang: 0.09, upturn: 0.03, thick: 0.03, color: BARK })
          y += 0.09
        }
      }
      kit.cylinder({ r: 0.012, h: 0.26, at: [0, y - 0.02, 0], seg: 6, color: '#7A6A4E' })
      for (let k = 0; k < 5; k++) kit.cylinder({ r: 0.028, h: 0.012, at: [0, y + 0.04 + k * 0.032, 0], seg: 8, color: '#7A6A4E' })
    }),
  )
}
