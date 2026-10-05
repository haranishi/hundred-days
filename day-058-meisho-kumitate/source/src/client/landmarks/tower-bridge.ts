// タワーブリッジ：テムズ川に立つ2本のゴシック様式の塔（四隅に小塔）、塔の上をつなぐ2本の青い歩道橋、塔と岸の間の青い吊りの鎖。
// 中央の橋桁は2枚に分かれて跳ね上がり、その間を帆船がくぐる。待っているバスと車は、塔と岸の間の橋の上に止まっている。
// 川は前後（z 方向）に流れ、橋は左右（x 方向）にかかる。左の岸の奥にロンドン塔、右の岸に煉瓦の倉庫街。
// 白いうちは「川の中の2本の石の塔と、岸へつながる道」まで（ブルックリン橋やロンドン塔、ビッグ・ベンと迷う）。
// 段階3の上の歩道橋（上下2段の形）・跳ね上がった橋桁・吊りの鎖・塔のとがった屋根で決まり、色塗りの青と白の鉄と灰色の石、
// 段階4の帆船と赤い2階建てバスでほぼ全員が当たる。川の色・岸の作り・バス・街路樹・建物は big-ben.ts と同じ値にそろえる。
import { type Kit, type Vec3, type XZ } from './kit'

// ---- ロンドンの部品（big-ben.ts と同じ値） ----
/** 陸（岸）の高さ。川面はこれより低く、岸壁の石が見える */
const BANK = 0.12
const RIVER = '#4D7488'
const QUAY = '#B3AC9D'
const QUAY_TOP = '#D3CDC0'
const PAVE = '#C8C2B5'
const ROAD = '#74777A'
const LAWN = '#79A957'
const PLANE_TREES = ['#5E8F4A', '#6A9A52', '#55834A'] as const
const BUS_RED = '#C8312B'
const CAB = '#25272B'
const PORTLAND = '#E3DCCB'
const SLATE = '#5D646D'
const WINDOW = '#4A4C50'

// ---- この名所の色 ----
const STONE = '#CFCBC2' // 塔を覆う花崗岩とポートランド石
const STONE_DARK = '#B5B0A5'
const BLUE = '#3E7CB1'
const WHITE = '#F2F2F2'
const GLASS = '#2E4558'
const ROOF = '#4A5560'
const GOLD = '#C9A14A'
const BRICK = '#9E5A3F'

/** 両岸の線（±x） */
const RIVER_X = 2.55
/** 主塔の中心（±x）と大きさ */
const TX = 1.38
const TW = 0.62
const TD = 0.8
/** 橋脚の上・道路の面・主塔の胴の上・歩道橋の下と上の高さ */
const PIER_TOP = 0.3
const DECK = 0.42
const PARAPET = 2.62
const WALK0 = 2.02
const WALK1 = 2.27
/** 岸の小さな塔の中心（±x）と高さ */
const AX = 2.78
const ABUT_TOP = 1.0
/** 中央の橋桁を跳ね上げる角度（度） */
const LIFT = 52
/** 主塔の内側の面（±x）。中央の橋桁の根もと */
const INNER = TX - TW / 2

export function build(kit: Kit): void {
  kit.ground(PAVE)

  // ---- 段階1：川と両岸・岸壁・川の中の橋脚・2本の塔の下半分・岸の小さな塔の根もと（白） ----
  kit.stage(1)
  kit.order(-1)
  kit.water({ points: bandX(-RIVER_X, RIVER_X, 4.9), h: 0.05, color: RIVER })
  for (const side of [-1, 1] as const) {
    kit.part(
      () => {
        kit.extrude({ points: landSide(side * RIVER_X, side, 4.9), h: BANK, color: PAVE })
        quayWall(kit, side * RIVER_X, side)
        // 岸の通り（橋から台座の縁へ）と、川ぞいの遊歩道の芝
        kit.box({ w: 1.12, h: 0.012, d: 0.44, at: [side * 4.28, BANK, 0], color: ROAD })
        kit.box({ w: 0.22, h: 0.014, d: 1.8, at: [side * 2.86, BANK, 1.9], color: LAWN })
      },
      { appear: 'grow' },
    )
  }
  kit.order(0)
  for (const sx of [-1, 1] as const) {
    // 川の中の橋脚（上流と下流へとがる）
    kit.extrude({ points: pierOutline(), h: PIER_TOP, at: [sx * TX, 0, 0], color: STONE_DARK })
    // 塔の下半分（道路の通る大きなアーチ）
    towerLower(kit, sx)
    // 岸の小さな塔（道路の通るアーチ）
    kit.at({ at: [sx * AX, BANK, 0], rotY: 90 }, () => kit.part(() => plate(kit, archFrame(0.56, ABUT_TOP - BANK, 0.34, 0.5, 0.68), 0.34, [0, 0, 0], STONE)))
  }

  // ---- 段階2：形の特徴＝2本の塔の上半分と四隅の小塔の胴・塔と岸の間の橋桁・岸へ下りる坂（白） ----
  kit.stage(2)
  for (const sx of [-1, 1] as const) {
    towerUpper(kit, sx)
    sideSpan(kit, sx)
  }

  // ---- 段階3：決め手の細部（白）＝塔の上をつなぐ2本の歩道橋・跳ね上がった中央の橋桁・吊りの鎖・塔のとがった屋根 ----
  kit.stage(3)
  // 決め手の歩道橋は、段階3の中で最初に出す（高い所にあるので、順番の指定がないと最後になる）
  kit.order(-1)
  for (const s of [-1, 1] as const) walkway(kit, s)
  kit.order(0)
  for (const sx of [-1, 1] as const) {
    bascule(kit, sx)
    chains(kit, sx)
    towerTop(kit, sx)
    abutmentTop(kit, sx)
  }

  // ---- 段階4：周りの景色（色つき）＝帆船と遊覧船・待っているバスと車・ロンドン塔・倉庫街・並木・人 ----
  kit.stage(4)
  sailingBarge(kit, [0.05, 0.05, 1.05], 180)
  kit.boat({ kind: 'ship', at: [-1.35, 0.05, -2.75], rotY: 0, len: 0.8 })
  kit.boat({ kind: 'row', at: [1.6, 0.05, 2.9], rotY: 160, len: 0.34, color: '#C84A3A' })
  kit.boat({ kind: 'ship', at: [0.95, 0.05, 2.0], rotY: 175, len: 0.85, color: '#F2EFE6' })
  // 橋が上がっている間、塔と岸の間の橋で待つバスと車
  bus(kit, [-2.2, DECK, -0.1], 90)
  kit.car({ at: [-2.55, DECK, 0.1], rotY: -90, color: CAB })
  bus(kit, [4.25, BANK + 0.012, 0.1], -90)
  kit.car({ at: [2.15, DECK, 0.1], rotY: -90, color: CAB })
  kit.car({ at: [-4.3, BANK + 0.012, -0.1], rotY: 90 })
  towerOfLondon(kit, [-3.45, BANK, -1.78])
  // 右の岸の煉瓦の倉庫街と、左の岸手前の石の建物
  for (const [x, z, w, d, h, wall] of [
    [3.45, 1.15, 0.72, 0.9, 0.72, BRICK],
    [3.4, 2.35, 0.7, 0.8, 0.6, BRICK],
    [3.55, -1.3, 0.8, 1.0, 0.78, BRICK],
    [3.35, -2.6, 0.62, 0.8, 0.62, '#B07A5A'],
    [-3.45, 1.3, 0.72, 0.9, 0.82, PORTLAND],
    [-3.3, 2.5, 0.62, 0.72, 0.64, '#D9CDB4'],
  ] as const) {
    building(kit, x, z, w, d, h, wall)
  }
  // 川ぞいの並木
  for (const sx of [-1, 1] as const) {
    for (const z of [-3.3, -2.6, -1.9, -1.2, 1.2, 1.9, 2.6, 3.3]) {
      if (sx < 0 && z < -0.9 && z > -2.8) continue
      kit.tree({ kind: 'round', h: kit.range(0.38, 0.48), at: [sx * 2.8, BANK, z], color: kit.pick(PLANE_TREES) })
    }
  }
  // 人（塔と岸の間の橋の歩道・川ぞいの遊歩道で、上がった橋と帆船を眺める）
  for (const [x, z] of [
    [-1.95, 0.2],
    [-1.85, -0.22],
    [1.95, -0.2],
    [2.05, 0.22],
    [-2.75, 0.75],
    [-2.72, 0.95],
    [2.75, 0.7],
    [2.72, 0.9],
    [2.7, -0.75],
    [-2.7, -0.7],
  ] as const) {
    const y = Math.abs(x) < RIVER_X ? DECK : BANK
    kit.person({ at: [x, y, z], rotY: kit.range(0, 360) })
  }
}

// ===== 塔 =====

/** 主塔の下半分。道路の通る大きなとがったアーチ（x 方向に抜ける）と、四隅の小塔の根もと */
function towerLower(kit: Kit, sx: -1 | 1): void {
  const h = 1.25 - PIER_TOP
  kit.at({ at: [sx * TX, PIER_TOP, 0], rotY: 90 }, () =>
    kit.part(() => {
      // この座標の x は世界の -z、押し出し（奥行き）は世界の x
      plate(kit, archFrame(TD, h, 0.4, 0.34, 0.6), TW, [0, 0, 0], STONE)
    }),
  )
}

/** 主塔の上半分の胴と、四隅の八角の小塔の胴 */
function towerUpper(kit: Kit, sx: -1 | 1): void {
  kit.part(() => {
    kit.box({ w: TW, h: PARAPET - 1.25, d: TD, at: [sx * TX, 1.25, 0], color: STONE })
    kit.box({ w: TW + 0.04, h: 0.05, d: TD + 0.04, at: [sx * TX, 1.25, 0], color: STONE_DARK })
    for (const [cx, cz] of CORNERS) {
      kit.cylinder({ r: 0.1, h: PARAPET + 0.2 - PIER_TOP, at: [sx * TX + (cx * TW) / 2, PIER_TOP, (cz * TD) / 2], seg: 8, rotY: 22.5, color: STONE })
    }
  })
}

/** 主塔の頂：胸壁の帯・中央の四角すいの屋根と金の頂飾り・四隅の小塔のとがった屋根・窓 */
function towerTop(kit: Kit, sx: -1 | 1): void {
  const x = sx * TX
  kit.part(() => {
    kit.box({ w: TW + 0.05, h: 0.06, d: TD + 0.05, at: [x, PARAPET, 0], color: STONE_DARK })
    kit.frustum({ w: TW - 0.08, d: TD - 0.12, topW: 0.06, topD: 0.08, h: 0.4, at: [x, PARAPET + 0.06, 0], color: ROOF })
    kit.cylinder({ r: 0.012, h: 0.16, at: [x, PARAPET + 0.44, 0], seg: 6, color: GOLD, finish: 'gold' })
    // 屋根の小窓（四方）
    for (let f = 0; f < 4; f++) {
      kit.at({ at: [x, 0, 0], rotY: f * 90 }, () => {
        const depth = (f % 2 === 0 ? TD - 0.12 : TW - 0.08) / 2
        kit.box({ w: 0.08, h: 0.09, d: 0.06, at: [0, PARAPET + 0.1, depth - 0.07], color: STONE })
        kit.gableRoof({ w: 0.06, d: 0.08, h: 0.05, overhang: 0.008, at: [0, PARAPET + 0.19, depth - 0.07], rotY: 90, color: ROOF })
      })
    }
    for (const [cx, cz] of CORNERS) {
      const px = x + (cx * TW) / 2
      const pz = (cz * TD) / 2
      kit.cylinder({ r: 0.115, h: 0.04, at: [px, PARAPET + 0.2, pz], seg: 8, rotY: 22.5, color: STONE_DARK })
      kit.cone({ r: 0.11, h: 0.36, at: [px, PARAPET + 0.24, pz], seg: 8, rotY: 22.5, color: ROOF })
      kit.sphere({ r: 0.016, at: [px, PARAPET + 0.6, pz], seg: 6, color: GOLD, finish: 'gold' })
    }
    // 窓（川に向く面に3段、橋に向く面は歩道橋の高さを避けて2段）
    for (let f = 0; f < 4; f++) {
      kit.at({ at: [x, 0, 0], rotY: f * 90 }, () => {
        const face = f % 2 === 0 ? TD / 2 : TW / 2
        const rows = f % 2 === 0 ? [1.4, 1.85, 2.3] : [1.4, 1.72]
        for (const y of rows) {
          for (const u of [-0.11, 0.11]) plate(kit, gothicArch(0.07, 0.13, 0.2), 0.01, [u, y, face + 0.004], WINDOW)
        }
      })
    }
  })
}

/** 塔と岸の間の橋桁（道路と、側面の青い帯）と、岸の小さな塔から陸へ下りる坂 */
function sideSpan(kit: Kit, sx: -1 | 1): void {
  const x0 = sx * (TX + TW / 2)
  const x1 = sx * (AX + 0.17)
  kit.part(() => {
    const len = Math.abs(x1 - x0)
    const cx = (x0 + x1) / 2
    kit.box({ w: len, h: 0.07, d: 0.5, at: [cx, DECK - 0.07, 0], color: STONE_DARK })
    kit.box({ w: len, h: 0.01, d: 0.3, at: [cx, DECK, 0], color: ROAD })
    for (const s of [-1, 1]) kit.box({ w: len, h: 0.08, d: 0.02, at: [cx, DECK - 0.06, s * 0.26], color: BLUE })
    // 塔の中を抜ける道路
    kit.box({ w: TW + 0.04, h: 0.07, d: 0.42, at: [sx * TX, DECK - 0.07, 0], color: STONE_DARK })
    kit.box({ w: TW + 0.04, h: 0.01, d: 0.3, at: [sx * TX, DECK, 0], color: ROAD })
    // 岸の小さな塔の外から陸へ下りる坂
    const a: Vec3 = [sx * (AX + 0.17), DECK, 0]
    const b: Vec3 = [sx * 3.74, BANK, 0]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    const slope = (Math.atan2(b[1] - a[1], Math.abs(b[0] - a[0])) * 180) / Math.PI
    kit.at({ at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.07, 0] }, () => {
      kit.box({ w: L + 0.04, h: 0.07, d: 0.46, rot: [0, 0, sx * slope], color: STONE_DARK })
      kit.box({ w: L + 0.04, h: 0.01, d: 0.3, at: [0, 0.07, 0], rot: [0, 0, sx * slope], color: ROAD })
    })
    // 坂の下の支え
    kit.box({ w: L * 0.8, h: (DECK - BANK) * 0.5, d: 0.4, at: [sx * 3.2, BANK, 0], color: STONE_DARK })
  })
}

/** 塔の上をつなぐ歩道橋（s は手前 +1 か奥 -1）。青い上下の弦材と柱、白い筋かい、中の暗い窓の帯 */
function walkway(kit: Kit, s: -1 | 1): void {
  const z = s * 0.25
  const L = INNER * 2
  const n = 10
  kit.part(() => {
    kit.box({ w: L + 0.04, h: WALK1 - WALK0 - 0.08, d: 0.1, at: [0, WALK0 + 0.04, z], color: GLASS, finish: 'gloss' })
    kit.box({ w: L + 0.04, h: 0.045, d: 0.13, at: [0, WALK0, z], color: BLUE })
    kit.box({ w: L + 0.04, h: 0.045, d: 0.13, at: [0, WALK1 - 0.045, z], color: BLUE })
    kit.box({ w: L, h: 0.012, d: 0.12, at: [0, WALK1, z], color: '#C9D3DC' })
    for (let i = 0; i <= n; i++) {
      const x = -INNER + (L * i) / n
      kit.box({ w: 0.028, h: WALK1 - WALK0, d: 0.13, at: [x, WALK0, z], color: BLUE })
    }
    for (let i = 0; i < n; i++) {
      const xa = -INNER + (L * i) / n
      const xb = -INNER + (L * (i + 1)) / n
      for (const zf of [z - 0.067, z + 0.067]) {
        kit.beam({ from: [xa, WALK0 + 0.045, zf], to: [xb, WALK1 - 0.045, zf], size: 0.012, width: 0.018, color: WHITE })
        kit.beam({ from: [xb, WALK0 + 0.045, zf], to: [xa, WALK1 - 0.045, zf], size: 0.012, width: 0.018, color: WHITE })
      }
    }
    // 塔に取り付く持ち送り
    for (const sx of [-1, 1]) kit.box({ w: 0.08, h: 0.06, d: 0.15, at: [sx * (INNER - 0.03), WALK0 - 0.06, z], color: BLUE })
  })
}

/** 中央の橋桁の片側（sx の塔の内側の面を軸に、LIFT 度だけ跳ね上がる） */
function bascule(kit: Kit, sx: -1 | 1): void {
  const L = INNER - 0.015
  kit.at({ at: [sx * INNER, DECK - 0.07, 0] }, () =>
    kit.at({ rot: [0, 0, -sx * LIFT] }, () =>
      kit.part(() => {
        kit.box({ w: L, h: 0.07, d: 0.48, at: [(-sx * L) / 2, 0, 0], color: STONE_DARK })
        kit.box({ w: L, h: 0.01, d: 0.3, at: [(-sx * L) / 2, 0.07, 0], color: ROAD })
        for (const s of [-1, 1]) kit.box({ w: L, h: 0.09, d: 0.02, at: [(-sx * L) / 2, -0.02, s * 0.25], color: BLUE })
        for (const s of [-1, 1]) kit.box({ w: L, h: 0.04, d: 0.015, at: [(-sx * L) / 2, 0.07, s * 0.23], color: WHITE })
      }),
    ),
  )
}

/** 塔と岸の小さな塔の間の青い吊りの鎖（手前と奥の2本）と、橋桁へ下りる白い吊り材 */
function chains(kit: Kit, sx: -1 | 1): void {
  const xt = sx * (TX + TW / 2 - 0.02)
  const xa = sx * (AX - 0.12)
  const yt = WALK0 + 0.1
  const ya = ABUT_TOP - 0.06
  // 塔から下がり、岸の手前でいちばん低くなる弧（最も低い所は岸から15%）
  const k = (yt - ya) / 0.7
  const yMin = ya - 0.0225 * k
  const yAt = (t: number) => yMin + k * (t - 0.85) ** 2
  const n = 10
  kit.part(() => {
    for (const s of [-1, 1]) {
      const z = s * 0.29
      for (let i = 0; i < n; i++) {
        const t0 = i / n
        const t1 = (i + 1) / n
        const p0: Vec3 = [xt + (xa - xt) * t0, yAt(t0), z]
        const p1: Vec3 = [xt + (xa - xt) * t1, yAt(t1), z]
        kit.beam({ from: p0, to: p1, size: 0.035, width: 0.075, color: BLUE })
      }
      for (let i = 1; i < 8; i++) {
        const t = i / 8
        const x = xt + (xa - xt) * t
        kit.beam({ from: [x, yAt(t) - 0.03, z], to: [x, DECK - 0.01, z], size: 0.012, color: WHITE })
      }
    }
  })
}

/** 岸の小さな塔の頂（胸壁と四隅の小塔のとがった屋根） */
function abutmentTop(kit: Kit, sx: -1 | 1): void {
  const x = sx * AX
  kit.part(() => {
    kit.box({ w: 0.38, h: 0.04, d: 0.58, at: [x, ABUT_TOP, 0], color: STONE_DARK })
    kit.pyramid({ w: 0.26, d: 0.42, h: 0.18, at: [x, ABUT_TOP + 0.04, 0], color: ROOF })
    for (const [cx, cz] of CORNERS) {
      const px = x + cx * 0.17
      const pz = cz * 0.27
      kit.cylinder({ r: 0.05, h: ABUT_TOP - BANK + 0.1, at: [px, BANK, pz], seg: 8, color: STONE })
      kit.cone({ r: 0.055, h: 0.16, at: [px, ABUT_TOP + 0.1, pz], seg: 8, color: ROOF })
    }
  })
}

// ===== 景色 =====

const CORNERS: readonly XZ[] = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
]

/** 川の中の橋脚の輪郭（上流と下流へとがる） */
function pierOutline(): XZ[] {
  return [
    [0.42, -0.5],
    [0, -0.78],
    [-0.42, -0.5],
    [-0.42, 0.5],
    [0, 0.78],
    [0.42, 0.5],
  ]
}

/** テムズ川の帆船（黒い船体・赤茶の帆）。前は rotY で回した +Z */
function sailingBarge(kit: Kit, at: Vec3, rotY: number): void {
  kit.at({ at, rotY }, () =>
    kit.part(() => {
      const hull: XZ[] = [
        [-0.11, -0.4],
        [0.11, -0.4],
        [0.12, 0.2],
        [0, 0.42],
        [-0.12, 0.2],
      ]
      kit.extrude({ points: hull, h: 0.07, color: '#2B2B2D' })
      kit.extrude({ points: hull.map(([x, z]): XZ => [x * 0.86, z * 0.92]), h: 0.012, at: [0, 0.07, 0], color: '#8C6A48' })
      kit.cylinder({ r: 0.012, h: 1.2, at: [0, 0.07, 0.06], seg: 6, color: '#5A4632' })
      // 帆（縦の板。船の向きにそって張る）。この座標の x は船の -z（後ろが +）
      kit.at({ rotY: 90 }, () => {
        plate(kit, [[0.0, 0.12], [0.34, 0.12], [0.3, 0.86], [0.0, 1.12]], 0.01, [-0.06, 0.07, 0], '#9A4A2E')
        plate(kit, [[0.0, 0.15], [0.0, 0.95], [-0.3, 0.15]], 0.01, [-0.06, 0.07, 0], '#A85A36')
      })
      kit.beam({ from: [0, 0.25, 0.06], to: [0, 1.0, -0.24], size: 0.012, color: '#5A4632' })
    }),
  )
}

/** ロンドン塔（四隅に小塔のある白い天守と、まわりの城壁と丸い塔）。at は陸の上の中心 */
function towerOfLondon(kit: Kit, at: Vec3): void {
  const wall = '#CFC6B3'
  kit.at({ at }, () =>
    kit.part(() => {
      kit.box({ w: 1.0, h: 0.012, d: 0.86, color: LAWN })
      for (const [w, d, x, z] of [
        [1.06, 0.06, 0, 0.43],
        [1.06, 0.06, 0, -0.43],
        [0.06, 0.86, 0.53, 0],
        [0.06, 0.86, -0.53, 0],
      ] as const) {
        kit.box({ w, h: 0.14, d, at: [x, 0, z], color: wall })
      }
      for (const [cx, cz] of CORNERS) kit.cylinder({ r: 0.075, h: 0.2, at: [cx * 0.53, 0, cz * 0.43], seg: 10, color: wall })
      // 白い天守と四隅の小塔（鉛の丸い屋根）
      kit.box({ w: 0.44, h: 0.4, d: 0.36, at: [0, 0, -0.02], color: '#E6DFCF' })
      for (let i = 0; i < 5; i++) {
        for (const s of [-1, 1]) kit.box({ w: 0.035, h: 0.035, d: 0.02, at: [-0.16 + i * 0.08, 0.4, -0.02 + s * 0.17], color: '#E6DFCF' })
      }
      for (const [cx, cz] of CORNERS) {
        const px = cx * 0.22
        const pz = -0.02 + cz * 0.18
        kit.box({ w: 0.07, h: 0.5, d: 0.07, at: [px, 0, pz], color: '#E6DFCF' })
        kit.sphere({ r: 0.045, squash: 1.1, at: [px, 0.5, pz], seg: 8, color: '#6F767C' })
        kit.cylinder({ r: 0.006, h: 0.06, at: [px, 0.58, pz], seg: 4, color: '#6F767C' })
      }
      for (const u of [-0.12, 0, 0.12]) kit.box({ w: 0.035, h: 0.07, d: 0.01, at: [u, 0.22, 0.165], color: WINDOW })
    }),
  )
}

/** ロンドンの建物（石か煉瓦の壁・縦横に並ぶ窓・灰色の屋根・煙突）。at は陸の上 */
function building(kit: Kit, x: number, z: number, w: number, d: number, h: number, wall: string): void {
  kit.part(() => {
    kit.box({ w, h, d, at: [x, BANK, z], color: wall, finish: 'satin' })
    const floors = Math.max(2, Math.round((h - 0.1) / 0.16))
    const nx = Math.max(2, Math.round(w / 0.15))
    const nz = Math.max(2, Math.round(d / 0.15))
    for (let f = 0; f < floors; f++) {
      const y = BANK + 0.08 + (f * (h - 0.14)) / floors
      for (let i = 0; i < nx; i++) {
        const px = x - w / 2 + (w * (i + 0.5)) / nx
        for (const s of [-1, 1]) kit.box({ w: 0.05, h: 0.07, d: 0.01, at: [px, y, z + s * (d / 2 + 0.003)], color: WINDOW })
      }
      for (let i = 0; i < nz; i++) {
        const pz = z - d / 2 + (d * (i + 0.5)) / nz
        for (const s of [-1, 1]) kit.box({ w: 0.01, h: 0.07, d: 0.05, at: [x + s * (w / 2 + 0.003), y, pz], color: WINDOW })
      }
    }
    kit.box({ w: w + 0.03, h: 0.03, d: d + 0.03, at: [x, BANK + h - 0.03, z], color: '#E9E3D6' })
    kit.hipRoof({ w: w - 0.04, d: d - 0.04, h: 0.14, overhang: 0, at: [x, BANK + h, z], color: SLATE })
    for (const s of [-0.3, 0.3]) kit.box({ w: 0.05, h: 0.08, d: 0.05, at: [x + w * s, BANK + h + 0.05, z + d * 0.25], color: '#9A6E58' })
  })
}

/** 赤い2階建てバス（前は rotY で回した +Z）。at は道路の面の点 */
function bus(kit: Kit, at: Vec3, rotY: number): void {
  kit.at({ at, rotY }, () =>
    kit.part(() => {
      kit.box({ w: 0.12, h: 0.03, d: 0.38, color: '#2E2F33' })
      kit.box({ w: 0.13, h: 0.2, d: 0.44, at: [0, 0.02, 0], color: BUS_RED, finish: 'gloss' })
      kit.box({ w: 0.134, h: 0.045, d: 0.4, at: [0, 0.07, 0], color: '#2C3640', finish: 'gloss' })
      kit.box({ w: 0.134, h: 0.045, d: 0.4, at: [0, 0.15, 0], color: '#2C3640', finish: 'gloss' })
      kit.box({ w: 0.124, h: 0.01, d: 0.42, at: [0, 0.22, 0], color: '#E8E4DA' })
    }),
  )
}

// ===== 形の下ごしらえ（big-ben.ts と同じ） =====

/** 台座の円（半径 r）のうち、x が x0 より右（side=1）か左（side=-1）の陸 */
function landSide(x0: number, side: 1 | -1, r: number): XZ[] {
  const a0 = Math.acos(x0 / r)
  const from = side > 0 ? -a0 : a0
  const to = side > 0 ? a0 : 2 * Math.PI - a0
  const pts: XZ[] = []
  const n = 28
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  return pts
}

/** 台座の円（半径 r）のうち x0〜x1 の縦長の帯（川） */
function bandX(x0: number, x1: number, r: number): XZ[] {
  const pts: XZ[] = []
  const n = 12
  const half = (x: number) => Math.sqrt(Math.max(0, r * r - x * x))
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    pts.push([x, half(x)])
  }
  for (let i = n; i >= 0; i--) {
    const x = x0 + ((x1 - x0) * i) / n
    pts.push([x, -half(x)])
  }
  return pts
}

/** 岸の線 x0 に沿う石の岸壁（陸の縁より少し高い笠石つき）。side は陸のある側 */
function quayWall(kit: Kit, x0: number, side: 1 | -1): void {
  const len = 2 * Math.sqrt(4.9 * 4.9 - (Math.abs(x0) + 0.05) ** 2) - 0.06
  kit.box({ w: 0.05, h: BANK + 0.02, d: len, at: [x0 + side * 0.015, 0, 0], color: QUAY })
  kit.box({ w: 0.065, h: 0.018, d: len, at: [x0 + side * 0.015, BANK + 0.02, 0], color: QUAY_TOP })
}

/** 正面から見た輪郭 points（[x, y]）を、奥行き depth の板にする。板は at を中心に Z の前後へ半分ずつ */
function plate(kit: Kit, points: readonly XZ[], depth: number, at: Vec3, color: string): void {
  kit.at({ at }, () => kit.extrude({ points, h: depth, rot: [-90, 0, 0], at: [0, 0, depth / 2], color }))
}

/** とがったアーチの上の線（右の立ち上がり → 頂 → 左の立ち上がり）。2つの円弧で作る。幅 w・立ち上がり s・頂 top */
function pointedCurve(w: number, s: number, top: number): XZ[] {
  const half = w / 2
  const rise = top - s
  // 半径 R の円の中心を反対側へ c だけずらす：R - c = half、R² - c² = rise²
  const R = (half + (rise * rise) / half) / 2
  const c = R - half
  const a1 = Math.acos(Math.min(1, c / R))
  const pts: XZ[] = []
  const n = 6
  for (let i = 0; i <= n; i++) {
    const a = (a1 * i) / n
    pts.push([-c + R * Math.cos(a), s + R * Math.sin(a)])
  }
  for (let i = n - 1; i >= 0; i--) {
    const a = (a1 * i) / n
    pts.push([c - R * Math.cos(a), s + R * Math.sin(a)])
  }
  return pts
}

/** 四角い枠から、とがったアーチの形を抜いた輪郭（下が開いた門の形）。幅 W・高さ H、アーチの幅 w・立ち上がり s・頂 top */
function archFrame(W: number, H: number, w: number, s: number, top: number): XZ[] {
  return [[-W / 2, 0], [-W / 2, H], [W / 2, H], [W / 2, 0], [w / 2, 0], ...pointedCurve(w, s, top), [-w / 2, 0]]
}

/** とがったゴシックのアーチ（幅 w・立ち上がり s・頂 top）を塗りつぶした形 */
function gothicArch(w: number, s: number, top: number): XZ[] {
  return [[w / 2, 0], ...pointedCurve(w, s, top), [-w / 2, 0]]
}
