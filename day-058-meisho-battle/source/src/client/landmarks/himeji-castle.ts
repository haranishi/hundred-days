// 姫路城：姫山の上に段々の石垣、その上に5重の大天守と、渡櫓でつながる3つの小天守（連立式天守）。白い漆喰の壁と灰色の瓦。
// 正面（+Z）が南＝大手前の側。手前に三の丸の芝生と内堀、大手前通り。
// 白いうちは「石垣の上の5重の天守」までで大阪城と迷う形にし、段階3の小天守・破風の多さ、色塗りの白一色と灰色の屋根、松と桜で決まる。
import { COLORS, type Finish, type Kit, type Vec3, type XZ } from './kit'

const WALL = '#F2F1EC' // 白漆喰
const ROOF = '#8A9098' // 灰色の瓦（白い目地で明るく見える）
const STONE = '#9C9488'
const WINDOW = '#3C3F44'
const GRAVEL = '#D9D1BF'
const MOAT = '#3E7896'

/** 大天守の中心と、段の高さ */
const KX = 0.45
const KZ = -0.85
const T1 = 0.42 // 二の丸（下の段）の上面
const T2 = 0.78 // 本丸（上の段）の上面
const KB = 1.04 // 天守台の上面

interface Tier {
  w: number
  d: number
  /** 壁の高さ */
  h: number
  /** その上の屋根の高さ（いちばん上は入母屋の屋根） */
  roof: number
}

/** 大天守の5つの重。下ほど大きい */
const TIERS: readonly Tier[] = [
  { w: 1.36, d: 1.12, h: 0.34, roof: 0.13 },
  { w: 1.16, d: 0.95, h: 0.26, roof: 0.12 },
  { w: 0.98, d: 0.8, h: 0.24, roof: 0.11 },
  { w: 0.8, d: 0.64, h: 0.22, roof: 0.1 },
  { w: 0.62, d: 0.5, h: 0.24, roof: 0.3 },
]

/** 小天守（3重） */
const SMALL: readonly Tier[] = [
  { w: 0.62, d: 0.52, h: 0.2, roof: 0.09 },
  { w: 0.5, d: 0.42, h: 0.16, roof: 0.08 },
  { w: 0.4, d: 0.32, h: 0.16, roof: 0.2 },
]

/** 破風 [重, 向き(0=正面 1=右 2=奥 3=左), 面に沿ったずれ, 種類(c=千鳥破風 k=唐破風), 幅] */
const GABLES: readonly (readonly [number, 0 | 1 | 2 | 3, number, 'c' | 'k', number])[] = [
  [0, 0, -0.33, 'c', 0.3],
  [0, 0, 0.33, 'c', 0.3],
  [0, 2, 0, 'c', 0.4],
  [0, 1, 0, 'c', 0.36],
  [0, 3, 0, 'c', 0.36],
  [1, 0, 0, 'k', 0.36],
  [1, 2, 0, 'k', 0.36],
  [1, 1, 0, 'c', 0.3],
  [1, 3, 0, 'c', 0.3],
  [2, 0, 0, 'c', 0.46],
  [2, 2, 0, 'c', 0.46],
  [3, 0, -0.18, 'c', 0.22],
  [3, 0, 0.18, 'c', 0.22],
  [3, 1, 0, 'c', 0.24],
  [3, 3, 0, 'c', 0.24],
]

/** 三の丸の前の内堀（手前の弧） */
function moatOutline(): XZ[] {
  const outer: XZ[] = []
  const inner: XZ[] = []
  const n = 16
  for (let i = 0; i <= n; i++) {
    const a = ((-52 + (104 * i) / n) * Math.PI) / 180
    outer.push([Math.sin(a) * 3.95, Math.cos(a) * 3.95])
    inner.push([Math.sin(a) * 3.35, Math.cos(a) * 3.35])
  }
  return [...outer, ...inner.reverse()]
}

export function build(kit: Kit): void {
  kit.ground(COLORS.lawn)

  // ---- 段階1：堀・道・段々の石垣・天守台と、大天守のいちばん下の重（白） ----
  kit.stage(1)
  kit.order(-1)
  kit.water({ points: moatOutline(), color: MOAT })
  // 大手前通り（堀の橋から手前へ）と、堀沿いの道
  kit.box({ w: 0.5, h: 0.02, d: 1.0, at: [0, 0, 4.4], color: COLORS.road })
  kit.extrude({ points: arcBand(4.02, 4.36, -40, 40), h: 0.02, color: COLORS.road })
  kit.order(0)
  stoneWall(kit, 0, -1.25, 0, 3.6, 3.0, T1, '#83A86A')
  stoneWall(kit, 0.1, -1.35, T1, 2.5, 2.3, T2 - T1, GRAVEL)
  stoneWall(kit, KX, KZ, T2, 1.55, 1.3, KB - T2, GRAVEL)
  for (const [x, z] of SMALL_AT) stoneWall(kit, x, z, T2, 0.72, 0.62, 0.14, GRAVEL)
  kit.box({ w: TIERS[0]?.w ?? 1, h: TIERS[0]?.h ?? 0.3, d: TIERS[0]?.d ?? 1, at: [KX, KB, KZ], color: WALL })

  // ---- 段階2：形の特徴＝反り屋根が5重に重なる（白） ----
  kit.stage(2)
  keepUpper(kit, KX, KB, KZ, TIERS)

  // ---- 段階3：決め手の細部（白）＝破風の多さ・窓・鯱、渡櫓でつながる3つの小天守、土塀と百間廊下 ----
  kit.stage(3)
  const ys = tierYs(KB, TIERS)
  kit.part(() => {
    for (const [tier, face, off, kind, size] of GABLES) {
      const t = TIERS[tier] as Tier
      const y = (ys[tier] ?? 0) + t.h
      gable(kit, KX, KZ, y, face, off, kind, size, t)
    }
  })
  kit.part(() => windows(kit, KX, KZ, ys, TIERS))
  kit.part(() => ridgeFish(kit, KX, KZ, ys, TIERS))
  // 小天守と渡櫓
  for (const [x, z] of SMALL_AT) {
    kit.part(() => {
      const sy = tierYs(T2 + 0.14, SMALL)
      SMALL.forEach((t, i) => {
        const y = sy[i] ?? 0
        kit.box({ w: t.w, h: t.h, d: t.d, at: [x, y, z], color: WALL })
        const next = SMALL[i + 1]
        if (next) kit.curvedRoof({ w: t.w, d: t.d, h: t.roof, at: [x, y + t.h, z], style: 'skirt', top: { w: next.w, d: next.d }, overhang: 0.12, upturn: 0.05, thick: 0.035, color: ROOF })
        else kit.curvedRoof({ w: t.w, d: t.d, h: t.roof, at: [x, y + t.h, z], style: 'irimoya', overhang: 0.13, upturn: 0.06, color: ROOF, gableColor: WALL })
      })
      // 小天守の正面の千鳥破風
      const t0 = SMALL[0] as Tier
      gable(kit, x, z, (sy[0] ?? 0) + t0.h, 0, 0, 'c', 0.26, t0)
      gable(kit, x, z, (sy[0] ?? 0) + t0.h, 2, 0, 'c', 0.26, t0)
    })
  }
  watariYagura(kit, [KX - 0.68, KZ - 0.05], [-0.44, KZ - 0.05])
  watariYagura(kit, [-0.75, -1.16], [-0.75, -1.79])
  watariYagura(kit, [-0.44, -2.07], [0.29, -2.07])
  watariYagura(kit, [0.6, -1.84], [0.6, KZ - 0.56])
  // 土塀（白い壁と灰色の笠）
  kit.part(() => {
    earthWall(kit, [-1.0, 0.0], [-0.25, 0.0], T1)
    earthWall(kit, [0.25, 0.0], [1.56, 0.0], T1)
    earthWall(kit, [-0.95, -0.42], [1.15, -0.42], T2)
    earthWall(kit, [1.56, 0.0], [1.56, -2.5], T1)
  })
  // 西の丸の百間廊下と化粧櫓
  kit.part(() => {
    kit.box({ w: 0.2, h: 0.16, d: 2.1, at: [-1.45, T1, -1.4], color: WALL })
    kit.gableRoof({ w: 2.1, d: 0.2, h: 0.08, at: [-1.45, T1 + 0.16, -1.4], rotY: 90, overhang: 0.04, color: ROOF })
    kit.box({ w: 0.34, h: 0.22, d: 0.3, at: [-1.38, T1, -0.2], color: WALL })
    kit.curvedRoof({ w: 0.34, d: 0.3, h: 0.16, at: [-1.38, T1 + 0.22, -0.2], style: 'irimoya', overhang: 0.08, upturn: 0.04, color: ROOF, gableColor: WALL })
  })

  // ---- 段階4：周りの景色（色つき）＝大手門と橋・松・桜・木・人・車 ----
  kit.stage(4)
  // 堀の橋と大手門
  kit.part(() => {
    kit.box({ w: 0.46, h: 0.06, d: 0.75, at: [0, 0, 3.65], color: '#B8AE9C' })
    kit.box({ w: 0.9, h: 0.24, d: 0.22, at: [0, 0, 3.08], color: WALL })
    kit.box({ w: 0.36, h: 0.2, d: 0.24, at: [0, 0, 3.08], color: '#5A4636' })
    kit.curvedRoof({ w: 0.9, d: 0.22, h: 0.14, at: [0, 0.24, 3.08], style: 'irimoya', overhang: 0.07, upturn: 0.04, color: ROOF, gableColor: WALL })
  })
  // 石垣のまわりの松
  for (const [x, z, y] of [
    [-0.6, -0.1, T1],
    [0.75, -0.1, T1],
    [1.3, -0.12, T1],
    [1.42, -0.75, T1],
    [1.42, -1.65, T1],
    [-1.25, -2.5, T1],
    [1.0, -2.45, T1],
    [-2.05, 0.45, 0],
    [2.05, 0.4, 0],
    [-2.15, -1.5, 0],
    [2.15, -1.4, 0],
    [-1.6, -3.1, 0],
    [1.5, -3.15, 0],
    [0.0, -3.2, 0],
  ] as const) {
    kit.tree({ kind: 'pine', h: kit.range(0.42, 0.56), at: [x, y, z], rotY: kit.range(0, 360) })
  }
  // 三の丸の桜（芝生の両わき）
  for (const [x, z] of [
    [-2.4, 1.2],
    [-2.7, 2.0],
    [-1.9, 2.45],
    [-2.95, 0.5],
    [2.4, 1.25],
    [2.75, 2.0],
    [1.95, 2.45],
    [3.0, 0.55],
  ] as const) {
    kit.tree({ kind: 'sakura', h: kit.range(0.46, 0.56), at: [x, 0, z], rotY: kit.range(0, 360) })
  }
  // 姫山の奥と左右の林
  kit.scatter(
    { count: 16, rMin: 2.4, rMax: 4.6, gap: 0.42, ok: (x, z) => z < -0.4 && (Math.abs(x) > 2.0 || z < -2.9) },
    (_i, x, z) => kit.tree({ kind: kit.pick(['round', 'round', 'cone'] as const), h: kit.range(0.45, 0.62), at: [x, 0, z], color: kit.pick(['#3F6F45', '#4A7C4A', '#56874B']) }),
  )
  // 三の丸の芝生の人と、橋の上の人
  kit.scatter({ count: 12, rMin: 0.6, rMax: 3.1, gap: 0.22, ok: (x, z) => z > 0.45 && z < 2.9 && Math.abs(x) < 1.7 }, (_i, x, z) =>
    kit.person({ at: [x, 0, z], rotY: kit.range(140, 220) }),
  )
  kit.person({ at: [0.1, 0.06, 3.55], rotY: 180 })
  kit.person({ at: [-0.12, 0.06, 3.8], rotY: 0 })
  // 道の車（堀沿いの弧の道と、大手前通り）
  for (const [a, dir] of [
    [-33, 1],
    [-14, -1],
    [21, 1],
    [34, -1],
  ] as const) {
    const r = a < 0 ? 4.27 : 4.11
    kit.car({ at: [Math.sin((a * Math.PI) / 180) * r, 0.02, Math.cos((a * Math.PI) / 180) * r], rotY: a + dir * 90 })
  }
  kit.car({ at: [0.1, 0.02, 4.6], rotY: 180 })
}

/** 小天守の位置（西・乾・東） */
const SMALL_AT: readonly XZ[] = [
  [-0.75, -0.9],
  [-0.75, -2.05],
  [0.6, -2.1],
]

/** 各重の壁の底の高さ */
function tierYs(base: number, tiers: readonly Tier[]): number[] {
  const ys: number[] = []
  let y = base
  for (const t of tiers) {
    ys.push(y)
    y += t.h + t.roof
  }
  return ys
}

/** 天守のいちばん下の屋根から上（いちばん下の壁は段階1に作る） */
function keepUpper(kit: Kit, x: number, base: number, z: number, tiers: readonly Tier[]): void {
  const ys = tierYs(base, tiers)
  tiers.forEach((t, i) => {
    const y = ys[i] ?? 0
    kit.part(() => {
      if (i > 0) kit.box({ w: t.w, h: t.h, d: t.d, at: [x, y, z], color: WALL })
      const next = tiers[i + 1]
      if (next) {
        kit.curvedRoof({ w: t.w, d: t.d, h: t.roof, at: [x, y + t.h, z], style: 'skirt', top: { w: next.w, d: next.d }, overhang: 0.12, upturn: 0.06, thick: 0.04, color: ROOF })
      } else {
        kit.curvedRoof({ w: t.w, d: t.d, h: t.roof, at: [x, y + t.h, z], style: 'irimoya', overhang: 0.17, upturn: 0.08, color: ROOF, gableColor: WALL })
      }
    })
  })
}

/**
 * 反りのある石垣（扇の勾配）。裾ほど緩く上ほど急な曲線に沿って石積みの段を重ね、上面に色の板を置く。
 * 講評r1：3枚の四角すい台で一枚板に見えた → 段を細かく（約0.12ごと。高さ0.95なら3段→8段）、段ごとに石の色を少し変え、
 * 段の上に細い縁（横の目地の筋）を残す。縁は斜面がゆるい下の段ほど広く（最大0.02）、ほぼ垂直な上の段では細くする
 */
function stoneWall(kit: Kit, x: number, z: number, y: number, w: number, d: number, h: number, top: string): void {
  const inset = h * 0.45
  const n = Math.max(3, Math.round(h / 0.12))
  const curve = (f: number): number => 1 - (1 - f) ** 2
  kit.part(() => {
    for (let k = 0; k < n; k++) {
      const f0 = k / n
      const f1 = (k + 1) / n
      const i0 = inset * curve(f0)
      const i1 = inset * curve(f1)
      // 段が逆に張り出さないよう、縁は段の中の内への寄りの半分より細くする
      const ledge = k < n - 1 ? Math.min(0.02, (i1 - i0) * 0.45) : 0
      kit.frustum({
        w: w - 2 * i0,
        d: d - 2 * i0,
        topW: w - 2 * (i1 - ledge),
        topD: d - 2 * (i1 - ledge),
        h: h * (f1 - f0),
        at: [x, y + h * f0, z],
        color: STONE_SHADES[SHADE_ORDER[k % SHADE_ORDER.length] ?? 0] ?? STONE,
      })
    }
    kit.box({ w: w - 2 * inset - 0.02, h: 0.012, d: d - 2 * inset - 0.02, at: [x, y + h, z], color: top })
  })
}

/** 石垣の段の色：基本の石の色と、少し明るい色・少し暗い色。並びは規則的な縞に見えないよう混ぜる */
const STONE_SHADES = [STONE, shade(STONE, 1.08), shade(STONE, 0.9)] as const
const SHADE_ORDER = [0, 2, 1, 0, 1, 2, 0, 2, 1] as const

/** 色（#RRGGBB）の明るさを k 倍する */
function shade(hex: string, k: number): string {
  let out = '#'
  for (let i = 0; i < 3; i++) {
    const v = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
    out += Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0')
  }
  return out
}

/** 破風。向き face の壁の外に、千鳥破風（三角）か唐破風（弓なり）を置く。y は下の屋根の軒の高さ */
function gable(kit: Kit, x: number, z: number, y: number, face: 0 | 1 | 2 | 3, off: number, kind: 'c' | 'k', size: number, t: Tier): void {
  const fd = (face % 2 === 0 ? t.d : t.w) / 2
  const zBack = fd - 0.06
  const zFront = fd + 0.1
  const len = zFront - zBack
  const zc = (zFront + zBack) / 2
  kit.at({ at: [x, 0, z], rotY: face * 90 }, () => {
    if (kind === 'c') {
      const g = size * 0.6
      kit.gableRoof({ w: len, d: size, h: g, at: [off, y - 0.01, zc], rotY: 90, overhang: 0.02, color: ROOF })
      plate(kit, [
        [-size / 2 + 0.035, 0.012],
        [size / 2 - 0.035, 0.012],
        [0, g - 0.045],
      ], 0.012, [off, y - 0.01, zFront + 0.026], WALL)
    } else {
      const g = size * 0.42
      const top = (u: number) => g * (0.12 + 0.88 * ((1 + Math.cos(Math.PI * u)) / 2))
      const slab: XZ[] = []
      const face2: XZ[] = []
      const n = 12
      for (let i = 0; i <= n; i++) {
        const u = -1 + (2 * i) / n
        slab.push([(u * size) / 2, top(u)])
      }
      for (let i = n; i >= 0; i--) {
        const u = -1 + (2 * i) / n
        slab.push([(u * size) / 2, top(u) - 0.035])
      }
      face2.push([(-0.9 * size) / 2, 0.01])
      for (let i = 0; i <= n; i++) {
        const u = -0.9 + (1.8 * i) / n
        face2.push([(u * size) / 2, Math.max(0.012, top(u) - 0.05)])
      }
      face2.push([(0.9 * size) / 2, 0.01])
      plate(kit, slab, len + 0.02, [off, y - 0.01, zc + 0.01], ROOF)
      plate(kit, face2, 0.012, [off, y - 0.01, zFront + 0.006], WALL)
    }
  })
}

/** 各重の窓（小さな黒い窓を、正面・奥・左右に並べる） */
function windows(kit: Kit, x: number, z: number, ys: readonly number[], tiers: readonly Tier[]): void {
  tiers.forEach((t, i) => {
    const y = (ys[i] ?? 0) + t.h * 0.42
    const nx = Math.max(2, Math.round(t.w / 0.24))
    const nz = Math.max(2, Math.round(t.d / 0.24))
    for (let k = 0; k < nx; k++) {
      const px = x - t.w / 2 + (t.w * (k + 0.5)) / nx
      kit.box({ w: 0.06, h: 0.055, d: 0.012, at: [px, y, z + t.d / 2 + 0.004], color: WINDOW })
      kit.box({ w: 0.06, h: 0.055, d: 0.012, at: [px, y, z - t.d / 2 - 0.004], color: WINDOW })
    }
    for (let k = 0; k < nz; k++) {
      const pz = z - t.d / 2 + (t.d * (k + 0.5)) / nz
      kit.box({ w: 0.012, h: 0.055, d: 0.06, at: [x + t.w / 2 + 0.004, y, pz], color: WINDOW })
      kit.box({ w: 0.012, h: 0.055, d: 0.06, at: [x - t.w / 2 - 0.004, y, pz], color: WINDOW })
    }
  })
}

/** いちばん上の屋根の棟の両端の鯱 */
function ridgeFish(kit: Kit, x: number, z: number, ys: readonly number[], tiers: readonly Tier[]): void {
  const last = tiers.length - 1
  const t = tiers[last] as Tier
  const y = (ys[last] ?? 0) + t.h + t.roof + 0.02
  const half = Math.max((t.w / 2 + 0.17) * 0.38, t.w / 2 + 0.17 - (t.d / 2 + 0.17) * 0.62)
  for (const s of [-1, 1]) {
    const px = x + s * (half + 0.01)
    kit.box({ w: 0.035, h: 0.05, d: 0.035, at: [px, y, z], color: '#5E636A' })
    kit.beam({ from: [px, y + 0.045, z], to: [px + s * 0.025, y + 0.1, z], size: 0.022, color: '#5E636A' })
  }
}

/** 渡櫓（白い壁の長い櫓と灰色の切妻屋根） */
function watariYagura(kit: Kit, from: XZ, to: XZ): void {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const len = Math.hypot(dx, dz)
  const rotY = (Math.atan2(dx, dz) * 180) / Math.PI - 90
  kit.at({ at: [(from[0] + to[0]) / 2, T2, (from[1] + to[1]) / 2], rotY }, () =>
    kit.part(() => {
      kit.box({ w: len + 0.04, h: 0.26, d: 0.26, color: WALL })
      kit.gableRoof({ w: len + 0.04, d: 0.26, h: 0.11, at: [0, 0.26, 0], overhang: 0.05, color: ROOF })
    }),
  )
}

/** 土塀（白い壁と灰色の笠）。y は立てる面の高さ */
function earthWall(kit: Kit, from: XZ, to: XZ, y: number): void {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const len = Math.hypot(dx, dz)
  const rotY = (Math.atan2(dx, dz) * 180) / Math.PI - 90
  kit.at({ at: [(from[0] + to[0]) / 2, y, (from[1] + to[1]) / 2], rotY }, () => {
    kit.box({ w: len, h: 0.085, d: 0.035, color: WALL })
    kit.gableRoof({ w: len, d: 0.035, h: 0.028, at: [0, 0.085, 0], overhang: 0.018, color: ROOF })
  })
}

/** 正面から見た輪郭 points（[x, y]）を、奥行き depth の板にする。板は at を中心に Z の前後へ半分ずつ */
function plate(kit: Kit, points: readonly XZ[], depth: number, at: Vec3, color: string, finish?: Finish): void {
  kit.at({ at }, () => kit.extrude({ points, h: depth, rot: [-90, 0, 0], at: [0, 0, depth / 2], color, finish }))
}

/** 円弧の帯（中心からの距離 r0〜r1、角度 a0〜a1 度。0度が正面 +Z） */
function arcBand(r0: number, r1: number, a0: number, a1: number): XZ[] {
  const outer: XZ[] = []
  const inner: XZ[] = []
  const n = 14
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180
    outer.push([Math.sin(a) * r1, Math.cos(a) * r1])
    inner.push([Math.sin(a) * r0, Math.cos(a) * r0])
  }
  return [...outer, ...inner.reverse()]
}
