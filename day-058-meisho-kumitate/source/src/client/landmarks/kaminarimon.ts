// 雷門（浅草寺の風雷神門）：朱の八脚門。中央の通り道に、門の高さの約3分の1もある大きな赤い提灯を吊るす（文字は入れない）。
// 正面（+Z）が南＝雷門通り。奥（-Z）へ仲見世の店の列が続き、その先に宝蔵門。
// 白いうちは「門と、その奥の店の列」まで（平安神宮の門・清水寺の仁王門と迷う）で、段階3の大提灯と風神・雷神、色塗りの朱と赤で決まる。
import { COLORS, type Finish, type Kit, type Vec3, type XZ } from './kit'

const SHU = '#D2452D' // 門の朱
const LANTERN = '#B8202A' // 大提灯の赤
const RING = '#B8B2A6' // 提灯の下の金属の輪
const ROOF = '#55595F'
const STONE = '#B9B2A4'
const SHOP = '#EFE7D6'
const PAVE = '#C8BFAE'

/** 門の位置（底の中心）と拡大。門の中の寸法は、この位置を原点にした値 */
const GZ = 1.0
const GS = 1.25
/** 門の各部の高さ（拡大の前） */
const BASE = 0.06 // 基壇
const POST = 1.04 // 柱の上（貫の下）
const FRIEZE = 0.2 // 貫と組物の帯
const EAVE = 1.3 // 軒の高さ
const RIDGE = 1.78 // 棟の高さ
const HALF_D = 0.3 // 柱の列の奥行きの半分
const EAVE_D = 0.62 // 軒の出（中心から）。斜め上から大提灯が見えるよう、前の軒は短め
/** 大提灯を吊るす位置（門の中心より少し前。斜めから見ても像の部屋に隠れないように） */
const LZ = 0.12

/** 仲見世の店の列の区切り（z の範囲） */
const SHOPS: readonly (readonly [number, number])[] = [
  [0.12, -0.55],
  [-0.66, -1.36],
  [-1.47, -2.17],
  [-2.28, -2.95],
]
const SHOP_X = 0.63 // 店の列の中心（左右）
const SHOP_W = 0.42

export function build(kit: Kit): void {
  kit.ground('#BDB5A6')

  // ---- 段階1：道と広場・仲見世の石畳、門の土台と左右の像の部屋、店の列と宝蔵門の塊（白） ----
  kit.stage(1)
  kit.order(-1)
  kit.box({ w: 6.6, h: 0.02, d: 0.85, at: [0, 0, 3.075], color: COLORS.road })
  kit.box({ w: 4.6, h: 0.03, d: 0.4, at: [0, 0, 3.7], color: COLORS.pavement })
  kit.box({ w: 5.8, h: 0.03, d: 1.15, at: [0, 0, 2.08], color: COLORS.pavement })
  kit.box({ w: 0.84, h: 0.025, d: 3.9, at: [0, 0, -1.2], color: PAVE })
  kit.order(0)
  gate(kit, () => {
    kit.box({ w: 2.1, h: BASE, d: 0.95, color: STONE })
    // 左右の像の部屋（前後の部屋をまとめた塊。前の面は柱の列より奥に下げ、通り道の大提灯を隠さない）
    for (const sx of [-1, 1]) kit.box({ w: 0.55, h: 0.86, d: 0.3, at: [sx * 0.615, BASE, 0], color: SHU })
  })
  // 仲見世の店の列（2階建ての長い塊）
  for (const sx of [-1, 1]) {
    for (const [z0, z1] of SHOPS) {
      kit.box({ w: SHOP_W, h: 0.3, d: z0 - z1, at: [sx * SHOP_X, 0, (z0 + z1) / 2], color: SHOP })
    }
  }
  // 宝蔵門の下の階（左右の仁王の部屋と、中央の通り道）
  kit.box({ w: 1.6, h: 0.05, d: 0.8, at: [0, 0, -3.65], color: STONE })
  for (const sx of [-1, 1]) kit.box({ w: 0.46, h: 0.55, d: 0.62, at: [sx * 0.47, 0.05, -3.65], color: SHU })

  // ---- 段階2：形の特徴＝柱・貫の帯・反りのある切妻屋根、店と宝蔵門の屋根（白） ----
  kit.stage(2)
  gate(kit, () => {
    kit.part(() => {
      for (const x of [-0.9, -0.33, 0.33, 0.9]) {
        for (const z of [-HALF_D, 0, HALF_D]) kit.cylinder({ r: 0.048, h: POST - BASE, at: [x, BASE, z], seg: 10, color: SHU })
      }
    })
    kit.part(() => {
      kit.box({ w: 2.0, h: FRIEZE, d: 0.7, at: [0, POST, 0], color: SHU })
      // 組物のでこぼこ（帯の前後に小さな箱を並べる）
      for (let i = 0; i < 9; i++) {
        const x = -0.92 + i * 0.23
        for (const s of [-1, 1]) kit.box({ w: 0.1, h: 0.08, d: 0.06, at: [x, POST + FRIEZE - 0.08, s * 0.37], color: '#3F6E5A' })
      }
    })
    kit.part(() => {
      gateRoof(kit)
      // 妻（屋根の下の三角）。上の辺は屋根の裏に沿わせる
      const gableEnd: XZ[] = [
        [-0.42, POST + FRIEZE],
        [0.42, POST + FRIEZE],
      ]
      for (let i = 0; i <= 8; i++) {
        const zz = 0.42 - (0.84 * i) / 8
        gableEnd.push([zz, roofY(zz) - 0.08])
      }
      for (const sx of [-1, 1]) kit.at({ at: [sx * 1.0, 0, 0], rotY: 90 }, () => plate(kit, gableEnd, 0.04, [0, 0, 0], '#8E3326'))
    })
  })
  // 仲見世の屋根
  kit.part(() => {
    for (const sx of [-1, 1]) {
      for (const [z0, z1] of SHOPS) {
        kit.gableRoof({ w: z0 - z1, d: SHOP_W, h: 0.13, at: [sx * SHOP_X, 0.3, (z0 + z1) / 2], rotY: 90, overhang: 0.05, color: ROOF })
      }
    }
  })
  // 宝蔵門の上の階と屋根
  kit.part(() => {
    kit.box({ w: 0.5, h: 0.08, d: 0.62, at: [0, 0.52, -3.65], color: SHU })
    kit.curvedRoof({ w: 1.4, d: 0.62, h: 0.14, at: [0, 0.6, -3.65], style: 'skirt', top: { w: 1.15, d: 0.5 }, overhang: 0.2, upturn: 0.05, color: ROOF })
    kit.box({ w: 1.15, h: 0.4, d: 0.5, at: [0, 0.74, -3.65], color: SHU })
    kit.curvedRoof({ w: 1.15, d: 0.5, h: 0.42, at: [0, 1.14, -3.65], style: 'irimoya', overhang: 0.24, upturn: 0.08, color: ROOF, gableColor: '#8E3326' })
  })

  // ---- 段階3：決め手の細部（白）＝中央の大提灯、風神・雷神と囲い、棟の鬼瓦、宝蔵門の提灯 ----
  kit.stage(3)
  gate(kit, () => {
    bigLantern(kit, [0, POST - 0.72 * 1.1, LZ], 1.1)
    statue(kit, 1)
    statue(kit, -1)
    kit.part(() => {
      for (const sx of [-1, 1]) kit.box({ w: 0.1, h: 0.14, d: 0.12, at: [sx * 1.14, RIDGE - 0.04, 0], color: '#3E4146' })
    })
  })
  bigLantern(kit, [0, 0.12, -3.62], 0.6)

  // ---- 段階4：周りの景色（色つき）＝人の波・人力車・車・街路樹・店の日よけ・まわりのビル・五重塔 ----
  kit.stage(4)
  // 店の日よけ（通りに面した色とりどりの布）
  kit.part(() => {
    for (const sx of [-1, 1]) {
      for (const [z0, z1] of SHOPS) {
        const n = 3
        for (let i = 0; i < n; i++) {
          const za = z0 - ((z0 - z1) * i) / n - 0.02
          const zb = z0 - ((z0 - z1) * (i + 1)) / n + 0.02
          kit.beam({
            from: [sx * (SHOP_X - SHOP_W / 2 + 0.01), 0.24, (za + zb) / 2],
            to: [sx * (SHOP_X - SHOP_W / 2 - 0.1), 0.19, (za + zb) / 2],
            size: Math.abs(za - zb),
            width: 0.01,
            color: kit.pick(['#C8453B', '#3D5BA9', '#E2A93B', '#3F8C6B', '#F2F0EA']),
          })
        }
      }
    }
  })
  // 横断歩道の白い帯（文字ではない）
  kit.part(() => {
    for (let i = 0; i < 7; i++) kit.box({ w: 0.1, h: 0.006, d: 0.68, at: [-0.6 + i * 0.2, 0.02, 3.075], color: '#F2F0EA' })
  })
  townBlocks(kit)
  pagoda(kit, [-2.15, 0, -3.15])
  // 街路樹
  for (const x of [-3.0, -2.2, -1.4, 1.4, 2.2, 3.0]) {
    kit.tree({ kind: 'round', h: 0.5, at: [x, 0.03, 2.55], color: '#4F8A45' })
  }
  // 人力車
  rickshaw(kit, [-1.75, 0.03, 2.05], 70)
  rickshaw(kit, [1.95, 0.03, 1.95], -110)
  rickshaw(kit, [2.4, 0.02, 2.88], 90)
  // 車（雷門通り）
  for (const [x, dir, color] of [
    [-2.6, 1, '#F0C43A'],
    [-0.9, -1, undefined],
    [0.7, 1, undefined],
    [-3.2, -1, undefined],
  ] as const) {
    kit.car({ at: [x, 0.02, 3.075 - dir * 0.2], rotY: dir * 90, color })
  }
  // 人：門の前の広場、門の下、仲見世の通り、宝蔵門の前
  kit.scatter({ count: 18, rMin: 0.2, rMax: 3.3, gap: 0.17, ok: (x, z) => z > 1.72 && z < 2.45 && Math.abs(x) < 2.6 }, (_i, x, z) =>
    kit.person({ at: [x, 0.03, z], h: 0.12, rotY: kit.range(0, 360) }),
  )
  for (const [x, z] of [
    [0.16, 1.48],
    [-0.18, 1.52],
    [0.1, 0.52],
  ] as const) {
    kit.person({ at: [x, BASE * GS, z], h: 0.12, rotY: kit.range(0, 360) })
  }
  kit.scatter({ count: 14, rMin: 0, rMax: 3.4, gap: 0.2, ok: (x, z) => Math.abs(x) < 0.3 && z < 0.1 && z > -3.1 }, (_i, x, z) =>
    kit.person({ at: [x, 0.025, z], h: 0.12, rotY: kit.pick([0, 180]) + kit.range(-20, 20) }),
  )
}

/** 門の中心から前後に zz 離れたところの、屋根の上の面の高さ（棟で高く、軒先でわずかに反り上がる） */
function roofY(zz: number): number {
  const t = Math.min(1, Math.abs(zz) / EAVE_D)
  return RIDGE - (RIDGE - EAVE) * (t ** 0.75 - 0.06 * t ** 6)
}

/** 門の座標（原点は門の底の中心、拡大 GS）の中で作る */
function gate(kit: Kit, fn: () => void): void {
  kit.at({ at: [0, 0, GZ], scale: GS }, fn)
}

/** 反りのある切妻屋根（棟は X 方向）と棟 */
function gateRoof(kit: Kit): void {
  const n = 10
  const top: XZ[] = []
  const bottom: XZ[] = []
  for (let i = 0; i <= n; i++) {
    const u = -1 + (2 * i) / n
    const y = roofY(u * EAVE_D)
    top.push([u * EAVE_D, y])
    bottom.push([u * EAVE_D, y - 0.075])
  }
  kit.at({ rotY: 90 }, () => plate(kit, [...top, ...bottom.reverse()], 2.36, [0, 0, 0], ROOF, 'satin'))
  kit.box({ w: 2.3, h: 0.08, d: 0.11, at: [0, RIDGE - 0.05, 0], color: '#3E4146' })
}

/** 大提灯。at は提灯の底の中心、s は大きさ（雷門は1） */
function bigLantern(kit: Kit, at: Vec3, s: number): void {
  kit.at({ at, scale: s }, () =>
    kit.part(() => {
      // 下の金属の輪
      kit.cylinder({ r: 0.21, h: 0.06, seg: 16, color: RING, finish: 'metal' })
      // 胴（たる形）
      kit.lathe({
        points: [
          [0, 0.05],
          [0.21, 0.05],
          [0.25, 0.1],
          [0.275, 0.2],
          [0.285, 0.33],
          [0.275, 0.46],
          [0.25, 0.56],
          [0.21, 0.61],
          [0, 0.61],
        ],
        seg: 18,
        color: LANTERN,
        finish: 'satin',
      })
      // 骨の筋
      for (const [y, r] of [
        [0.15, 0.266],
        [0.25, 0.282],
        [0.4, 0.282],
        [0.5, 0.266],
      ] as const) {
        kit.torus({ r, tube: 0.007, flat: true, seg: 22, at: [0, y, 0], color: '#8E1A20' })
      }
      // 上の黒い輪と吊り棒
      kit.cylinder({ r: 0.215, h: 0.05, at: [0, 0.6, 0], seg: 16, color: '#2A2422' })
      kit.cylinder({ r: 0.02, h: 0.07, at: [0, 0.65, 0], seg: 6, color: '#2A2422' })
    }),
  )
}

/** 風神（side=1、門に向かって右）と雷神（side=-1、左）。像の部屋の前の黒い格子の奥に立つ */
function statue(kit: Kit, side: 1 | -1): void {
  const x = side * 0.615
  const z = 0.15
  const body = side > 0 ? '#5E8C6A' : '#B8483A'
  kit.part(() => {
    // 暗い奥（格子の向こう）
    kit.box({ w: 0.46, h: 0.66, d: 0.02, at: [x, BASE + 0.08, z], color: '#2B1D1A' })
    // 像（台・体・頭・腕）
    kit.box({ w: 0.2, h: 0.08, d: 0.06, at: [x, BASE + 0.08, z + 0.03], color: '#5A4A3C' })
    kit.cylinder({ r: 0.06, rTop: 0.07, h: 0.26, at: [x, BASE + 0.16, z + 0.04], seg: 8, color: body })
    kit.sphere({ r: 0.055, at: [x, BASE + 0.41, z + 0.04], seg: 8, color: body })
    kit.beam({ from: [x - 0.05, BASE + 0.36, z + 0.05], to: [x - 0.14, BASE + 0.48, z + 0.05], size: 0.03, color: body })
    kit.beam({ from: [x + 0.05, BASE + 0.36, z + 0.05], to: [x + 0.14, BASE + 0.48, z + 0.05], size: 0.03, color: body })
    if (side > 0) {
      // 風神の風袋（頭の上の弓なりの布）
      kit.torus({ r: 0.12, tube: 0.022, arc: 180, seg: 12, at: [x, BASE + 0.4, z + 0.04], color: '#E8E2D2' })
    } else {
      // 雷神の太鼓の輪
      kit.torus({ r: 0.15, tube: 0.012, seg: 16, at: [x, BASE + 0.27, z + 0.02], color: '#C9A23F' })
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        kit.cylinder({ r: 0.03, h: 0.02, at: [x + Math.cos(a) * 0.15, BASE + 0.42 + Math.sin(a) * 0.15, z + 0.02], rot: [90, 0, 0], seg: 8, color: '#C9A23F' })
      }
    }
    // 格子（朱の細い縦の棒）。柱の列に張る
    for (let k = 0; k <= 5; k++) kit.box({ w: 0.012, h: 0.66, d: 0.012, at: [x - 0.23 + k * 0.092, BASE + 0.08, HALF_D], color: SHU })
    kit.box({ w: 0.5, h: 0.02, d: 0.02, at: [x, BASE + 0.74, HALF_D], color: SHU })
  })
}

/** 人力車（車夫つき）。前は +Z */
function rickshaw(kit: Kit, at: Vec3, rotY: number): void {
  kit.at({ at, rotY }, () =>
    kit.part(() => {
      for (const s of [-1, 1]) kit.torus({ r: 0.055, tube: 0.01, seg: 12, at: [s * 0.075, 0, -0.03], rotY: 90, color: '#2B2B2E' })
      kit.box({ w: 0.13, h: 0.05, d: 0.1, at: [0, 0.07, -0.02], color: '#8E2A25' })
      kit.box({ w: 0.13, h: 0.06, d: 0.02, at: [0, 0.12, -0.07], color: '#8E2A25' })
      kit.torus({ r: 0.06, tube: 0.012, arc: 120, seg: 8, at: [0, 0.1, -0.05], rotY: 90, rot: [0, 0, 30], color: '#1F1F22' })
      for (const s of [-1, 1]) kit.beam({ from: [s * 0.06, 0.08, 0.02], to: [s * 0.06, 0.05, 0.2], size: 0.01, color: '#2B2B2E' })
      // 車夫
      kit.cylinder({ r: 0.022, rTop: 0.017, h: 0.065, at: [0, 0, 0.22], seg: 6, color: '#1F2A44' })
      kit.sphere({ r: 0.018, at: [0, 0.065, 0.22], seg: 6, color: COLORS.skin })
      // 乗っている人
      kit.sphere({ r: 0.02, at: [0, 0.13, -0.03], seg: 6, color: COLORS.skin })
    }),
  )
}

/** まわりの街（低いビル） */
function townBlocks(kit: Kit): void {
  const blocks: readonly (readonly [number, number, number, number, number, string])[] = [
    [-2.05, 0.95, 0.55, 0.55, 0.6, '#E6DED0'],
    [-2.85, 0.9, 0.8, 0.75, 0.6, '#D7D2C8'],
    [-3.65, 0.75, 0.55, 0.6, 0.6, '#C8CED6'],
    [-1.65, -0.35, 0.6, 0.5, 0.9, '#EDE6D9'],
    [-2.6, -0.4, 0.9, 0.85, 0.8, '#B9C6D2'],
    [-3.6, -0.6, 0.6, 0.55, 0.9, '#E8DFD0'],
    [-1.6, -1.75, 0.55, 0.45, 0.9, '#DCE0E5'],
    [2.05, 0.95, 0.55, 0.6, 0.6, '#D9CDB8'],
    [2.85, 0.9, 0.8, 0.7, 0.6, '#E6E0D4'],
    [3.65, 0.75, 0.55, 0.55, 0.6, '#AFC0CF'],
    [1.65, -0.35, 0.6, 0.5, 0.9, '#E8DFD0'],
    [2.6, -0.45, 0.9, 0.9, 0.8, '#C3C0B8'],
    [3.6, -0.6, 0.6, 0.6, 0.9, '#D7D2C8'],
    [1.65, -1.75, 0.55, 0.5, 0.9, '#EDE6D9'],
    [2.55, -1.85, 0.9, 0.65, 0.8, '#B9C6D2'],
    [1.8, -3.05, 0.7, 0.45, 0.8, '#E6DED0'],
  ]
  for (const [x, z, w, h, d, color] of blocks) {
    kit.part(() => {
      kit.box({ w, h, d, at: [x, 0, z], color, finish: 'satin' })
      const floors = Math.max(1, Math.floor(h / 0.17))
      for (let f = 0; f < floors; f++) kit.box({ w: w + 0.012, h: 0.045, d: d + 0.012, at: [x, 0.08 + f * 0.17, z], color: '#56677A', finish: 'gloss' })
    })
  }
}

/** 浅草寺の五重塔（朱）。at は底の中心 */
function pagoda(kit: Kit, at: Vec3): void {
  kit.part(() =>
    kit.at({ at }, () => {
      kit.box({ w: 0.5, h: 0.06, d: 0.5, color: STONE })
      let y = 0.06
      for (let i = 0; i < 5; i++) {
        const w = 0.34 - i * 0.03
        const h = 0.13
        kit.box({ w, h, d: w, at: [0, y, 0], color: SHU })
        y += h
        if (i < 4) {
          const wn = w - 0.03
          kit.curvedRoof({ w, d: w, h: 0.05, at: [0, y, 0], style: 'skirt', top: { w: wn, d: wn }, overhang: 0.1, upturn: 0.035, thick: 0.03, color: ROOF })
          y += 0.05
        } else {
          kit.curvedRoof({ w, d: w, h: 0.11, at: [0, y, 0], style: 'hogyo', overhang: 0.11, upturn: 0.035, thick: 0.03, color: ROOF })
          y += 0.11
        }
      }
      kit.cylinder({ r: 0.014, h: 0.34, at: [0, y - 0.02, 0], seg: 6, color: '#B89A55', finish: 'gold' })
      for (let k = 0; k < 6; k++) kit.cylinder({ r: 0.032, h: 0.012, at: [0, y + 0.05 + k * 0.038, 0], seg: 8, color: '#B89A55', finish: 'gold' })
    }),
  )
}

/** 正面から見た輪郭 points（[x, y]）を、奥行き depth の板にする。板は at を中心に Z の前後へ半分ずつ */
function plate(kit: Kit, points: readonly XZ[], depth: number, at: Vec3, color: string, finish?: Finish): void {
  kit.at({ at }, () => kit.extrude({ points, h: depth, rot: [-90, 0, 0], at: [0, 0, depth / 2], color, finish }))
}
