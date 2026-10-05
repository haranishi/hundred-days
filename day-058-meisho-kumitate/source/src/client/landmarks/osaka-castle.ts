// 大阪城：内堀と外堀が二重に回る広い城跡。高い石垣の本丸の上に、5重の天守が1棟で立つ。白い壁・緑の屋根・金の飾り。
// 正面（+Z）が南＝本丸の広場の側。奥の右には、堀の外のビル街（大阪ビジネスパーク）。
// 白いうちは「石垣の上の5重の天守」までで姫路城と迷う形にし（天守の作りは姫路城と同じ道具）、
// 段階3の金の鯱・最上層の手すり、色塗りの緑の屋根と金・黒い最上層、二重の堀とビル街で決まる。
import { COLORS, type Finish, type Kit, type Vec3, type XZ } from './kit'

const WALL = '#F1F0EA'
const ROOF = COLORS.copperGreen // 緑青の銅瓦
const GOLD = COLORS.gold
const TOPWALL = '#2C2C31' // 最上層の黒い壁
const STONE = '#9A9387'
const WINDOW = '#3C3F44'
const GRAVEL = '#D9D1BF'
const MOAT = '#3D7590'
const TILE = '#6E747C' // 櫓と門の灰色の瓦

/** 天守の中心と、段の高さ */
const KX = 0
const KZ = -0.4
const PT = 0.95 // 本丸（高い石垣）の上面
const KB = 1.33 // 天守台の上面
/** 本丸の石垣の半分の幅と、内堀の外の縁 */
const HB = 1.95
const HM = 2.62

interface Tier {
  w: number
  d: number
  /** 壁の高さ */
  h: number
  /** その上の屋根の高さ（いちばん上は入母屋の屋根） */
  roof: number
}

/** 天守の5つの重。姫路城とほぼ同じ大きさにして、白いうちは見分けにくくする */
const TIERS: readonly Tier[] = [
  { w: 1.42, d: 1.18, h: 0.34, roof: 0.13 },
  { w: 1.2, d: 1.0, h: 0.27, roof: 0.12 },
  { w: 1.0, d: 0.84, h: 0.25, roof: 0.11 },
  { w: 0.82, d: 0.68, h: 0.23, roof: 0.1 },
  { w: 0.64, d: 0.52, h: 0.24, roof: 0.3 },
]
const TOP = TIERS.length - 1

/** 破風 [重, 向き(0=正面 1=右 2=奥 3=左), 面に沿ったずれ, 種類(c=千鳥破風 k=唐破風), 幅] */
const GABLES: readonly (readonly [number, 0 | 1 | 2 | 3, number, 'c' | 'k', number])[] = [
  [0, 0, 0, 'c', 0.46],
  [0, 2, 0, 'c', 0.46],
  [0, 1, 0, 'c', 0.4],
  [0, 3, 0, 'c', 0.4],
  [1, 0, -0.3, 'c', 0.28],
  [1, 0, 0.3, 'c', 0.28],
  [1, 2, -0.3, 'c', 0.28],
  [1, 2, 0.3, 'c', 0.28],
  [2, 0, 0, 'k', 0.38],
  [2, 2, 0, 'k', 0.38],
  [2, 1, 0, 'c', 0.3],
  [2, 3, 0, 'c', 0.3],
  [3, 0, 0, 'c', 0.3],
  [3, 2, 0, 'c', 0.3],
]

export function build(kit: Kit): void {
  kit.ground(COLORS.lawn)

  // ---- 段階1：二重の堀・高い石垣の本丸・天守台と、天守のいちばん下の重（白） ----
  kit.stage(1)
  kit.order(-1)
  kit.water({ points: innerMoat(1), color: MOAT })
  kit.water({ points: innerMoat(-1), color: MOAT })
  kit.water({ points: arcBand(4.12, 4.72, 7, 118), color: MOAT })
  kit.water({ points: arcBand(4.12, 4.72, -172, -7), color: MOAT })
  kit.order(0)
  stoneWall(kit, 0, 0, 0, HB * 2, HB * 2, PT, GRAVEL)
  stoneWall(kit, KX, KZ, PT, 1.75, 1.5, KB - PT, GRAVEL)
  kit.box({ w: TIERS[0]?.w ?? 1, h: TIERS[0]?.h ?? 0.3, d: TIERS[0]?.d ?? 1, at: [KX, KB, KZ], color: WALL })

  // ---- 段階2：形の特徴＝反り屋根が5重に重なる（白） ----
  kit.stage(2)
  keepUpper(kit, KX, KB, KZ, TIERS)

  // ---- 段階3：決め手の細部（白）＝破風と金の飾り・窓・金の鯱・最上層の手すりと飾り板、外堀の櫓と門、極楽橋 ----
  kit.stage(3)
  const ys = tierYs(KB, TIERS)
  kit.part(() => {
    for (const [tier, face, off, kind, size] of GABLES) {
      const t = TIERS[tier] as Tier
      gable(kit, KX, KZ, (ys[tier] ?? 0) + t.h, face, off, kind, size, t)
    }
  })
  kit.part(() => windows(kit, KX, KZ, ys, TIERS))
  kit.part(() => {
    ridgeFish(kit, KX, KZ, ys, TIERS)
    topFloor(kit, KX, KZ, ys[TOP] ?? 0, TIERS[TOP] as Tier)
  })
  yagura(kit, -0.95, 3.62, 0)
  yagura(kit, -3.25, -1.85, 60)
  // 大手門（外堀の土橋の内側）
  kit.part(() => {
    for (const x of [-0.3, 0.3]) kit.box({ w: 0.07, h: 0.26, d: 0.07, at: [x, 0, 3.95], color: '#4A3C30' })
    kit.box({ w: 0.74, h: 0.05, d: 0.1, at: [0, 0.24, 3.95], color: '#4A3C30' })
    kit.curvedRoof({ w: 0.74, d: 0.16, h: 0.1, at: [0, 0.29, 3.95], style: 'irimoya', overhang: 0.06, upturn: 0.03, color: TILE, gableColor: WALL })
  })
  // 極楽橋（奥の内堀に架かる橋）
  kit.part(() => {
    const zc = -(HB + HM) / 2
    const len = HM - HB + 0.2
    kit.box({ w: 0.34, h: 0.04, d: len, at: [0, 0.08, zc], color: '#8A6A48' })
    for (const x of [-0.16, 0.16]) {
      kit.box({ w: 0.02, h: 0.06, d: len, at: [x, 0.12, zc], color: '#6E5238' })
      for (const z of [zc - len / 2 + 0.05, zc, zc + len / 2 - 0.05]) kit.box({ w: 0.03, h: 0.12, d: 0.03, at: [x, 0, z], color: '#6E5238' })
    }
  })

  // ---- 段階4：周りの景色（色つき）＝公園の木と桜・本丸の広場の人・御座船・ビル街 ----
  kit.stage(4)
  // 二の丸の公園の木（外堀と内堀のあいだ）
  kit.scatter(
    {
      count: 40,
      rMin: 2.7,
      rMax: 4.0,
      gap: 0.34,
      ok: (x, z) =>
        Math.max(Math.abs(x), Math.abs(z)) > HM + 0.18 &&
        !(Math.abs(x) < 0.7 && z > 2.8) &&
        Math.hypot(x + 0.95, z - 3.62) > 0.5 &&
        Math.hypot(x + 3.25, z + 1.85) > 0.5 &&
        !inCity(x, z),
    },
    (_i, x, z) => {
      const kind = kit.pick(['round', 'round', 'round', 'sakura', 'cone'] as const)
      kit.tree({ kind, h: kit.range(0.42, 0.6), at: [x, 0, z], color: kind === 'sakura' ? undefined : kit.pick(['#4F8A45', '#5C9A4C', '#3F7A44']) })
    },
  )
  // 本丸の上の木（広場の両わきと天守の後ろ）
  for (const [x, z] of [
    [-1.3, 0.75],
    [1.3, 0.8],
    [-1.35, 1.35],
    [1.32, 1.3],
    [-1.35, 0.1],
    [1.35, 0.15],
    [-1.3, -0.65],
    [1.3, -0.7],
    [-1.25, -1.35],
    [1.25, -1.3],
    [-0.55, -1.38],
    [0.5, -1.4],
  ] as const) {
    const kind = kit.pick(['round', 'round', 'sakura'] as const)
    kit.tree({ kind, h: kit.range(0.38, 0.48), at: [x, PT, z], color: kind === 'sakura' ? undefined : kit.pick(['#4F8A45', '#5C9A4C']) })
  }
  // 本丸の広場の人
  kit.scatter({ count: 11, rMin: 0.4, rMax: 1.6, gap: 0.2, ok: (x, z) => z > 0.45 && z < 1.4 && Math.abs(x) < 1.0 }, (_i, x, z) =>
    kit.person({ at: [x, PT, z], rotY: kit.range(150, 210) }),
  )
  for (const [x, z] of [
    [0.1, 2.45],
    [-0.12, 3.3],
    [0.15, 4.35],
  ] as const) {
    kit.person({ at: [x, 0, z], rotY: kit.range(0, 360) })
  }
  // 御座船（内堀をめぐる遊覧船）
  kit.at({ at: [-(HB + HM) / 2, 0.035, 0.7] }, () =>
    kit.part(() => {
      kit.boat({ kind: 'row', len: 0.52, color: '#7A4E2E' })
      kit.box({ w: 0.12, h: 0.07, d: 0.2, at: [0, 0.07, -0.02], color: '#B8322A' })
      kit.hipRoof({ w: 0.14, d: 0.22, h: 0.06, at: [0, 0.14, -0.02], overhang: 0.03, color: GOLD, finish: 'gold' })
    }),
  )
  // 奥の右のビル街
  for (const [x, z, w, h, d, color] of [
    [2.45, -3.45, 0.5, 1.9, 0.45, '#8FA6BB'],
    [3.25, -2.75, 0.45, 1.5, 0.5, '#B6C3CF'],
    [1.55, -3.95, 0.42, 1.3, 0.42, '#A7B4C2'],
  ] as const) {
    tower(kit, x, z, w, h, d, color)
  }
}

/** 奥の右の、堀の外のビル街か */
function inCity(x: number, z: number): boolean {
  const a = (Math.atan2(x, z) * 180) / Math.PI
  return a > 112 || a < -176
}

/** 内堀の半分（side=1 が右、-1 が左）。四角い本丸を囲み、正面だけ土橋で切れる */
function innerMoat(side: 1 | -1): XZ[] {
  const c = 0.25
  const pts: XZ[] = [
    [0.3, HM],
    [HM - c, HM],
    [HM, HM - c],
    [HM, -HM + c],
    [HM - c, -HM],
    [0, -HM],
    [0, -HB],
    [HB - 0.17, -HB],
    [HB, -HB + 0.17],
    [HB, HB - 0.17],
    [HB - 0.17, HB],
    [0.3, HB],
  ]
  return pts.map(([x, z]) => [x * side, z])
}

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

/** 天守のいちばん下の屋根から上（いちばん下の壁は段階1に作る）。最上層の壁は黒 */
function keepUpper(kit: Kit, x: number, base: number, z: number, tiers: readonly Tier[]): void {
  const ys = tierYs(base, tiers)
  tiers.forEach((t, i) => {
    const y = ys[i] ?? 0
    kit.part(() => {
      if (i > 0) kit.box({ w: t.w, h: t.h, d: t.d, at: [x, y, z], color: i === TOP ? TOPWALL : WALL })
      const next = tiers[i + 1]
      if (next) {
        kit.curvedRoof({ w: t.w, d: t.d, h: t.roof, at: [x, y + t.h, z], style: 'skirt', top: { w: next.w, d: next.d }, overhang: 0.16, upturn: 0.06, thick: 0.04, color: ROOF })
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

/** 破風。向き face の壁の外に、千鳥破風（三角）か唐破風（弓なり）を置き、金の飾りを付ける。y は下の屋根の軒の高さ */
function gable(kit: Kit, x: number, z: number, y: number, face: 0 | 1 | 2 | 3, off: number, kind: 'c' | 'k', size: number, t: Tier): void {
  const fd = (face % 2 === 0 ? t.d : t.w) / 2
  const zBack = fd - 0.06
  const zFront = fd + 0.1
  const len = zFront - zBack
  const zc = (zFront + zBack) / 2
  const gold = { color: GOLD, finish: 'gold' as const }
  kit.at({ at: [x, 0, z], rotY: face * 90 }, () => {
    if (kind === 'c') {
      const g = size * 0.6
      kit.gableRoof({ w: len, d: size, h: g, at: [off, y - 0.01, zc], rotY: 90, overhang: 0.02, color: ROOF })
      plate(kit, [
        [-size / 2 + 0.035, 0.012],
        [size / 2 - 0.035, 0.012],
        [0, g - 0.045],
      ], 0.012, [off, y - 0.01, zFront + 0.026], WALL)
      kit.box({ w: 0.035, h: 0.045, d: 0.012, at: [off, y + g - 0.11, zFront + 0.036], ...gold })
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
      kit.box({ w: 0.05, h: 0.035, d: 0.012, at: [off, y + g - 0.1, zFront + 0.016], ...gold })
    }
  })
}

/** 各重の窓（正面・奥・左右に並べる）。最上層は飾り板を付けるので窓を開けない */
function windows(kit: Kit, x: number, z: number, ys: readonly number[], tiers: readonly Tier[]): void {
  tiers.forEach((t, i) => {
    if (i === TOP) return
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

/** 最上層：黒い壁の金の飾り板（虎と鶴の場所）と、まわりの展望の手すり */
function topFloor(kit: Kit, x: number, z: number, y: number, t: Tier): void {
  const gold = { color: GOLD, finish: 'gold' as const }
  for (const s of [-1, 0, 1]) {
    kit.box({ w: 0.12, h: 0.07, d: 0.012, at: [x + s * 0.2, y + 0.09, z + t.d / 2 + 0.004], ...gold })
    kit.box({ w: 0.12, h: 0.07, d: 0.012, at: [x + s * 0.2, y + 0.09, z - t.d / 2 - 0.004], ...gold })
  }
  for (const s of [-1, 1]) {
    kit.box({ w: 0.012, h: 0.07, d: 0.12, at: [x + t.w / 2 + 0.004, y + 0.09, z + s * 0.12], ...gold })
    kit.box({ w: 0.012, h: 0.07, d: 0.12, at: [x - t.w / 2 - 0.004, y + 0.09, z + s * 0.12], ...gold })
  }
  const rw = t.w + 0.14
  const rd = t.d + 0.14
  const ry = y + 0.06
  const rail = { color: '#3A3A3E' }
  kit.box({ w: rw, h: 0.016, d: 0.016, at: [x, ry, z + rd / 2], ...rail })
  kit.box({ w: rw, h: 0.016, d: 0.016, at: [x, ry, z - rd / 2], ...rail })
  kit.box({ w: 0.016, h: 0.016, d: rd, at: [x + rw / 2, ry, z], ...rail })
  kit.box({ w: 0.016, h: 0.016, d: rd, at: [x - rw / 2, ry, z], ...rail })
  for (let k = 0; k <= 6; k++) {
    const f = -0.5 + k / 6
    kit.box({ w: 0.014, h: 0.06, d: 0.014, at: [x + f * rw, y, z + rd / 2], ...rail })
    kit.box({ w: 0.014, h: 0.06, d: 0.014, at: [x + f * rw, y, z - rd / 2], ...rail })
    kit.box({ w: 0.014, h: 0.06, d: 0.014, at: [x + rw / 2, y, z + f * rd], ...rail })
    kit.box({ w: 0.014, h: 0.06, d: 0.014, at: [x - rw / 2, y, z + f * rd], ...rail })
  }
}

/** いちばん上の屋根の棟の両端の金の鯱 */
function ridgeFish(kit: Kit, x: number, z: number, ys: readonly number[], tiers: readonly Tier[]): void {
  const last = tiers.length - 1
  const t = tiers[last] as Tier
  const y = (ys[last] ?? 0) + t.h + t.roof + 0.02
  const half = Math.max((t.w / 2 + 0.17) * 0.38, t.w / 2 + 0.17 - (t.d / 2 + 0.17) * 0.62)
  const gold = { color: GOLD, finish: 'gold' as const }
  for (const s of [-1, 1]) {
    const px = x + s * (half + 0.01)
    kit.box({ w: 0.04, h: 0.055, d: 0.04, at: [px, y, z], ...gold })
    kit.beam({ from: [px, y + 0.05, z], to: [px + s * 0.03, y + 0.115, z], size: 0.026, ...gold })
    kit.beam({ from: [px + s * 0.03, y + 0.11, z], to: [px + s * 0.012, y + 0.15, z], size: 0.012, width: 0.04, ...gold })
  }
}

/** 二重の櫓（白い壁と灰色の瓦）。rotY で向きを変える */
function yagura(kit: Kit, x: number, z: number, rotY: number): void {
  kit.at({ at: [x, 0, z], rotY }, () =>
    kit.part(() => {
      kit.box({ w: 0.5, h: 0.2, d: 0.36, color: WALL })
      kit.curvedRoof({ w: 0.5, d: 0.36, h: 0.08, at: [0, 0.2, 0], style: 'skirt', top: { w: 0.36, d: 0.26 }, overhang: 0.08, upturn: 0.03, thick: 0.03, color: TILE })
      kit.box({ w: 0.36, h: 0.16, d: 0.26, at: [0, 0.28, 0], color: WALL })
      kit.curvedRoof({ w: 0.36, d: 0.26, h: 0.15, at: [0, 0.44, 0], style: 'irimoya', overhang: 0.08, upturn: 0.04, color: TILE, gableColor: WALL })
    }),
  )
}

/** ビル（ガラスの帯を巻いた箱） */
function tower(kit: Kit, x: number, z: number, w: number, h: number, d: number, color: string): void {
  kit.part(() => {
    kit.box({ w, h, d, at: [x, 0, z], color, finish: 'satin' })
    const floors = Math.floor(h / 0.16)
    for (let f = 0; f < floors; f++) {
      kit.box({ w: w + 0.012, h: 0.05, d: d + 0.012, at: [x, 0.07 + f * 0.16, z], color: '#4E6378', finish: 'gloss' })
    }
    kit.box({ w: w * 0.55, h: 0.06, d: d * 0.5, at: [x, h, z], color: '#C5C1B8' })
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
  const n = 24
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180
    outer.push([Math.sin(a) * r1, Math.cos(a) * r1])
    inner.push([Math.sin(a) * r0, Math.cos(a) * r0])
  }
  return [...outer, ...inner.reverse()]
}
