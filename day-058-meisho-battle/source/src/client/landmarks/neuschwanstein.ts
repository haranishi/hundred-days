// ノイシュヴァンシュタイン城：森に覆われた山の上の岩の高台に、白い石灰石の城が細長く連なる。
// 西（-X）に背の高い本館（パラス）とその角の小塔、北側に細く高い階段の塔、中ほどに四角い塔、東（+X）の端に赤い煉瓦の門楼。
// 正面（+Z）が南。手前左にアルプ湖、手前右の小山に黄色いホーエンシュヴァンガウ城、奥にアルプスの山並み。
// 白いうちは「岩山の上の、白い壁の大きな建物」まで（姫路城やモン・サン＝ミシェル、ロンドン塔と迷う）。屋根の形もまだ出さない。
// 段階3の細い円塔のとがった屋根・本館の急な屋根と小塔で決まり、色塗りの青灰の屋根と赤い門楼・灰色の岩と深い森、
// 段階4のトウヒの森・黄色い城・馬車でほぼ全員が当たる（姫路城の芝生・松・桜・堀とは景色で見分けがつく）。
// 名前は商標なので、模型の中に文字やロゴは作らない（research/rights.md）。
import { type Kit, type Vec3, type XZ } from './kit'

const WALL = '#EDEAE2'
const TRIM = '#D6D0C2'
const ROOF = '#4F5B69'
const BRICK = '#A4513B'
const ROCK = '#8C8578'
const ROCK_DARK = '#776F63'
const WINDOW = '#3D4147'
const FOREST = '#4C7A45'
const MOUNTAIN = '#5F8456'
const LAKE = '#3E7F9C'
const YELLOW = '#E2B85E'

/** 城の建つ岩の高台の上面の高さ */
const Y0 = 1.25

/** 岩の高台（上から見た輪郭）。下の大きな岩はこれを広げた形 */
const PLATEAU: readonly XZ[] = [
  [-1.38, -1.18],
  [-0.5, -1.36],
  [0.6, -1.26],
  [1.55, -0.98],
  [1.75, -0.32],
  [1.52, 0.24],
  [0.62, 0.5],
  [-0.4, 0.56],
  [-1.22, 0.36],
  [-1.5, -0.4],
]
const ROCK_CENTER: XZ = [0.12, -0.4]

/** アルプ湖（手前左） */
const ALPSEE: readonly XZ[] = [
  [-3.9, 1.5],
  [-3.2, 1.25],
  [-2.3, 1.55],
  [-1.75, 2.15],
  [-1.85, 2.85],
  [-2.5, 3.35],
  [-3.3, 3.25],
  [-3.85, 2.7],
  [-4.1, 2.1],
]

export function build(kit: Kit): void {
  kit.ground(FOREST)

  // ---- 段階1：山並み・城の山と岩の高台・湖・小山と道、城の建物の下の階（白） ----
  kit.stage(1)
  kit.order(-1)
  kit.mound({ r: 1.4, rx: 1.4, rz: 1.0, h: 2.0, at: [-2.0, 0, -3.0], seg: 24, color: MOUNTAIN })
  kit.mound({ r: 1.7, rx: 1.7, rz: 0.95, h: 2.35, at: [1.0, 0, -3.55], seg: 24, color: MOUNTAIN })
  kit.mound({ r: 0.95, h: 1.5, at: [3.1, 0, -2.1], seg: 20, color: MOUNTAIN })
  kit.mound({ r: 2.2, rx: 2.2, rz: 1.65, h: 1.05, at: [ROCK_CENTER[0], 0, ROCK_CENTER[1]], seg: 28, color: FOREST })
  kit.mound({ r: 0.85, h: 0.36, at: [2.65, 0, 2.25], color: '#6E9A55' })
  kit.part(
    () => {
      kit.water({ points: ALPSEE, h: 0.03, color: LAKE })
      kit.water({ points: forggensee(), h: 0.03, color: LAKE })
      for (let i = 0; i + 1 < ROAD.length; i++) strip(kit, ROAD[i] as XZ, ROAD[i + 1] as XZ, 0.2, '#B9AE98')
    },
    { appear: 'grow' },
  )
  kit.order(0)
  // 岩の高台（3段の切り立った崖）。下ほど広く、城の載る上の岩は城の足もとぎりぎり
  // 段ごとに輪郭の点を少しずらして、人の作った台に見えないようにする
  kit.extrude({ points: roughen(kit, scaleAround(PLATEAU, ROCK_CENTER, 1.24), 0.09), h: 0.5, color: ROCK_DARK })
  kit.extrude({ points: roughen(kit, scaleAround(PLATEAU, ROCK_CENTER, 1.11), 0.06), h: 0.92, color: '#81796D' })
  kit.extrude({ points: PLATEAU, h: Y0, color: ROCK })
  // 城の建物の下の階（白い壁の塊）
  kit.part(() => {
    block(kit, PALAS, 0, 0.6)
    block(kit, BOWER, 0, 0.45)
    block(kit, KNIGHTS, 0, 0.4)
  })
  kit.part(() => block(kit, GATE, 0, 0.36, BRICK))

  // ---- 段階2：形の特徴＝高さの違う白い棟と、四角い塔・丸い塔の胴（屋根はまだ） ----
  kit.stage(2)
  kit.part(() => block(kit, PALAS, 0.6, PALAS.h))
  kit.part(() => {
    block(kit, BOWER, 0.45, BOWER.h)
    block(kit, KNIGHTS, 0.4, KNIGHTS.h)
    // 中庭を囲む壁
    kit.box({ w: 0.08, h: 0.38, d: 0.7, at: [0.82, Y0, -0.42], color: WALL })
    kit.box({ w: 1.0, h: 0.3, d: 0.08, at: [0.45, Y0, -1.08], color: WALL })
  })
  kit.part(() => block(kit, GATE, 0.36, GATE.h, BRICK))
  // 四角い塔と、細く高い階段の塔の胴
  kit.box({ w: 0.25, h: SQ_H, d: 0.25, at: [0.25, Y0, -0.42], color: WALL })
  kit.cylinder({ r: 0.1, h: 1.6, at: [STAIR[0], Y0, STAIR[1]], seg: 14, color: WALL })

  // ---- 段階3：決め手の細部（白）＝急な屋根・細い円塔のとがった屋根・角の小塔・窓・門楼の小塔 ----
  kit.stage(3)
  // 本館の急な切妻屋根と、妻の上のとがった飾り
  kit.part(() => {
    gable(kit, PALAS, 0.52)
    for (const s of [-1, 1]) {
      kit.cylinder({ r: 0.022, h: 0.16, at: [PALAS.x + s * (PALAS.w / 2), Y0 + PALAS.h + 0.48, PALAS.z], seg: 6, color: WALL })
      kit.cone({ r: 0.035, h: 0.12, at: [PALAS.x + s * (PALAS.w / 2), Y0 + PALAS.h + 0.64, PALAS.z], seg: 6, color: ROOF })
    }
  })
  kit.part(() => {
    gable(kit, BOWER, 0.28)
    gable(kit, KNIGHTS, 0.24)
  })
  kit.part(() => gable(kit, GATE, 0.24))
  // 細く高い階段の塔（いちばん高い）と、そばの細い小塔
  kit.part(() => {
    kit.cylinder({ r: 0.1, h: 0.25, at: [STAIR[0], Y0 + 1.6, STAIR[1]], seg: 14, color: WALL })
    kit.cylinder({ r: 0.118, h: 0.035, at: [STAIR[0], Y0 + 1.85, STAIR[1]], seg: 14, color: TRIM })
    kit.cone({ r: 0.122, h: 0.56, at: [STAIR[0], Y0 + 1.885, STAIR[1]], seg: 14, color: ROOF })
    kit.cylinder({ r: 0.008, h: 0.1, at: [STAIR[0], Y0 + 2.44, STAIR[1]], seg: 6, color: '#C9A14A', finish: 'gold' })
    kit.cylinder({ r: 0.05, h: 1.72, at: [STAIR[0] + 0.13, Y0, STAIR[1] - 0.06], seg: 10, color: WALL })
    kit.cone({ r: 0.06, h: 0.3, at: [STAIR[0] + 0.13, Y0 + 1.72, STAIR[1] - 0.06], seg: 10, color: ROOF })
  })
  // 四角い塔の屋根と四隅の小塔
  kit.part(() => {
    kit.box({ w: 0.29, h: 0.04, d: 0.29, at: [0.25, Y0 + SQ_H, -0.42], color: TRIM })
    kit.pyramid({ w: 0.23, h: 0.34, at: [0.25, Y0 + SQ_H + 0.04, -0.42], color: ROOF })
    for (const [sx, sz] of CORNERS) {
      kit.cylinder({ r: 0.035, h: 0.22, at: [0.25 + sx * 0.125, Y0 + SQ_H - 0.12, -0.42 + sz * 0.125], seg: 8, color: WALL })
      kit.cone({ r: 0.045, h: 0.16, at: [0.25 + sx * 0.125, Y0 + SQ_H + 0.1, -0.42 + sz * 0.125], seg: 8, color: ROOF })
    }
  })
  // 本館と小館の角の小塔（とがった円すいの屋根）
  kit.part(() => {
    for (const [x, z, y0, h, r] of TURRETS) {
      kit.cylinder({ r, h, at: [x, Y0 + y0, z], seg: 10, color: WALL })
      kit.cylinder({ r: r * 0.85, rTop: r, h: 0.08, at: [x, Y0 + y0 - 0.08, z], seg: 10, color: TRIM })
      kit.cone({ r: r * 1.12, h: r * 3.6, at: [x, Y0 + y0 + h, z], seg: 10, color: ROOF })
    }
  })
  // 窓（本館の長い面と妻・小館）と、本館の西のバルコニー
  kit.part(() => {
    windows(kit, PALAS, 5)
    windows(kit, BOWER, 3)
    windows(kit, KNIGHTS, 2)
    kit.box({ w: 0.08, h: 0.03, d: 0.3, at: [PALAS.x - PALAS.w / 2 - 0.04, Y0 + 0.78, PALAS.z], color: TRIM })
    kit.box({ w: 0.012, h: 0.07, d: 0.3, at: [PALAS.x - PALAS.w / 2 - 0.075, Y0 + 0.81, PALAS.z], color: TRIM })
  })
  // 門楼の東の2つの小塔（胸壁）と門のアーチ
  kit.part(() => {
    for (const s of [-1, 1]) {
      const x = GATE.x + GATE.w / 2 - 0.02
      const z = GATE.z + s * (GATE.d / 2 - 0.04)
      kit.box({ w: 0.16, h: GATE.h + 0.16, d: 0.16, at: [x, Y0, z], color: BRICK })
      for (const [mx, mz] of CORNERS) kit.box({ w: 0.04, h: 0.05, d: 0.04, at: [x + mx * 0.06, Y0 + GATE.h + 0.16, z + mz * 0.06], color: BRICK })
    }
    kit.box({ w: 0.012, h: 0.24, d: 0.16, at: [GATE.x + GATE.w / 2 + 0.004, Y0, GATE.z], color: '#4A3A30' })
    kit.box({ w: 0.04, h: 0.03, d: GATE.d + 0.02, at: [GATE.x, Y0 + GATE.h - 0.03, GATE.z], color: WALL })
  })

  // ---- 段階4：周りの景色（色つき）＝トウヒの森・黄色いホーエンシュヴァンガウ城・馬車と人・湖のボート ----
  kit.stage(4)
  hohenschwangau(kit, [2.65, kit.groundAt(2.65, 2.25) - 0.04, 2.25])
  const inLake = (x: number, z: number) => Math.hypot(x + 2.95, z - 2.3) < 1.25
  const onRock = (x: number, z: number) => Math.abs(x - 0.12) < 1.75 && Math.abs(z + 0.4) < 1.0
  kit.scatter(
    {
      count: 92,
      rMax: 4.7,
      gap: 0.27,
      ok: (x, z) => !inLake(x, z) && !onRock(x, z) && Math.hypot(x - 2.65, z - 2.25) > 0.6 && !nearRoad(x, z) && !(z > 3.0 && x > -1.2 && x < 1.6),
    },
    (_i, x, z) => {
      const y = Math.max(0, kit.groundAt(x, z) - 0.04)
      const spruce = kit.chance(0.72)
      kit.tree({
        kind: spruce ? 'cone' : 'round',
        h: kit.range(0.34, 0.5),
        at: [x, y, z],
        color: spruce ? kit.pick(['#2F5A36', '#2B5233', '#365F3D']) : kit.pick(['#4F8A45', '#5C9A4C']),
      })
    },
  )
  // 馬車と人（ふもとの道）
  carriage(kit, [1.55, 0, 3.05], 200)
  carriage(kit, [0.4, 0, 3.55], 250)
  for (const [x, z] of [
    [1.1, 3.35],
    [1.25, 3.25],
    [-0.4, 3.75],
    [2.1, 2.85],
    [3.2, 1.75],
    [-1.6, 2.5],
    [-1.7, 2.65],
  ] as const) {
    kit.person({ at: [x, 0.02, z], rotY: kit.range(0, 360) })
  }
  kit.boat({ kind: 'row', at: [-2.9, 0.03, 2.4], rotY: 40, len: 0.36, color: '#8A5A3A' })
  kit.boat({ kind: 'row', at: [-3.4, 0.03, 1.95], rotY: 120, len: 0.32, color: '#E8E4DA' })
}

const CORNERS: readonly XZ[] = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
]

interface Block {
  x: number
  z: number
  /** x 方向の幅（棟は x 方向） */
  w: number
  d: number
  /** 壁の高さ */
  h: number
}

/** 本館（パラス）・小館（ケメナーテ）・騎士の館・門楼 */
const PALAS: Block = { x: -0.9, z: -0.42, w: 0.78, d: 0.46, h: 1.34 }
const BOWER: Block = { x: -0.2, z: 0.06, w: 0.56, d: 0.36, h: 0.86 }
const KNIGHTS: Block = { x: 0.45, z: -0.82, w: 0.62, d: 0.32, h: 0.7 }
/** 四角い塔の胴の高さ */
const SQ_H = 1.5
const GATE: Block = { x: 1.18, z: -0.42, w: 0.42, d: 0.78, h: 0.6 }
/** 細く高い階段の塔（本館の北の中庭側） */
const STAIR: XZ = [-0.45, -0.86]
/** 角の小塔 [x, z, 根もとの高さ, 胴の高さ, 半径] */
const TURRETS: readonly (readonly [number, number, number, number, number])[] = [
  [PALAS.x - PALAS.w / 2, PALAS.z + PALAS.d / 2, 0.7, 0.95, 0.075],
  [PALAS.x - PALAS.w / 2, PALAS.z - PALAS.d / 2, 0.7, 0.95, 0.075],
  [PALAS.x + PALAS.w / 2, PALAS.z + PALAS.d / 2, 0.95, 0.62, 0.06],
  [BOWER.x + BOWER.w / 2, BOWER.z + BOWER.d / 2, 0.35, 0.76, 0.07],
  [KNIGHTS.x - KNIGHTS.w / 2, KNIGHTS.z - KNIGHTS.d / 2, 0.3, 0.6, 0.055],
]

/** ふもとの道（手前右から湖のほとりへ） */
const ROAD: readonly XZ[] = [
  [3.62, 2.95],
  [2.6, 3.15],
  [1.4, 3.15],
  [0.2, 3.65],
  [-1.0, 3.75],
  [-1.7, 3.35],
]

function nearRoad(x: number, z: number): boolean {
  return ROAD.some(([rx, rz]) => (rx - x) ** 2 + (rz - z) ** 2 < 0.36 * 0.36)
}

/** 白い棟の壁（高さ y0〜y1）。color を渡すと門楼の煉瓦 */
function block(kit: Kit, b: Block, y0: number, y1: number, color = WALL): void {
  kit.box({ w: b.w, h: y1 - y0, d: b.d, at: [b.x, Y0 + y0, b.z], color })
  if (y1 >= b.h - 1e-6) kit.box({ w: b.w + 0.03, h: 0.035, d: b.d + 0.03, at: [b.x, Y0 + b.h - 0.035, b.z], color: TRIM })
}

/** 棟の急な切妻屋根（棟は x 方向） */
function gable(kit: Kit, b: Block, h: number): void {
  kit.gableRoof({ w: b.w, d: b.d, h, overhang: 0.03, at: [b.x, Y0 + b.h, b.z], color: ROOF })
}

/** 棟の窓の列（rows 段）。長い面（±z）と妻（±x）に小さな暗い窓 */
function windows(kit: Kit, b: Block, rows: number): void {
  const nx = Math.max(2, Math.round(b.w / 0.15))
  const nz = Math.max(1, Math.round(b.d / 0.17))
  for (let r = 0; r < rows; r++) {
    const y = Y0 + 0.12 + (r * (b.h - 0.22)) / Math.max(1, rows - 0.4)
    for (let k = 0; k < nx; k++) {
      const x = b.x - b.w / 2 + (b.w * (k + 0.5)) / nx
      for (const s of [-1, 1]) kit.box({ w: 0.04, h: 0.1, d: 0.012, at: [x, y, b.z + s * (b.d / 2 + 0.004)], color: WINDOW })
    }
    for (let k = 0; k < nz; k++) {
      const z = b.z - b.d / 2 + (b.d * (k + 0.5)) / nz
      for (const s of [-1, 1]) kit.box({ w: 0.012, h: 0.1, d: 0.04, at: [b.x + s * (b.w / 2 + 0.004), y, z], color: WINDOW })
    }
  }
}

/** 輪郭の各点を、決まった乱数で少しだけ外か内へずらす（岩の段の不ぞろい） */
function roughen(kit: Kit, points: readonly XZ[], amount: number): XZ[] {
  return points.map(([x, z]): XZ => {
    const k = 1 + kit.range(-amount, amount)
    return [ROCK_CENTER[0] + (x - ROCK_CENTER[0]) * k, ROCK_CENTER[1] + (z - ROCK_CENTER[1]) * k]
  })
}

/** 輪郭を中心 c のまわりに k 倍に広げる */
function scaleAround(points: readonly XZ[], c: XZ, k: number): XZ[] {
  return points.map(([x, z]): XZ => [c[0] + (x - c[0]) * k, c[1] + (z - c[1]) * k])
}

/** 奥の平野の湖（フォルッゲン湖）。右奥の山のふもとの台座の縁ぞい */
function forggensee(): XZ[] {
  return [
    [3.55, -0.9],
    [4.3, -1.25],
    [4.62, -0.4],
    [4.55, 0.55],
    [4.05, 0.75],
    [3.6, 0.2],
  ]
}

/** 黄色いホーエンシュヴァンガウ城（胸壁のある四角い館と、丸い塔2つ）。at は小山の上 */
function hohenschwangau(kit: Kit, at: Vec3): void {
  kit.at({ at, rotY: -20 }, () =>
    kit.part(() => {
      kit.box({ w: 0.62, h: 0.32, d: 0.3, color: YELLOW })
      for (let i = 0; i < 7; i++) {
        for (const s of [-1, 1]) kit.box({ w: 0.04, h: 0.04, d: 0.03, at: [-0.27 + i * 0.09, 0.32, s * 0.14], color: YELLOW })
      }
      for (const [x, z, h] of [
        [-0.32, 0.12, 0.46],
        [0.33, -0.1, 0.4],
      ] as const) {
        kit.cylinder({ r: 0.085, h, at: [x, 0, z], seg: 10, color: YELLOW })
        kit.ring(6, 0.075, (_i, mx, mz) => kit.box({ w: 0.035, h: 0.04, d: 0.035, at: [x + mx, h, z + mz], color: YELLOW }), 15)
      }
      kit.box({ w: 0.3, h: 0.012, d: 0.012, at: [0, 0.2, 0.156], color: '#8C6B3E' })
      for (const x of [-0.18, -0.06, 0.06, 0.18]) kit.box({ w: 0.035, h: 0.06, d: 0.01, at: [x, 0.1, 0.153], color: WINDOW })
    }),
  )
}

/** 馬車（白い馬と、黒い屋根つきの車）。前は rotY で回した +Z */
function carriage(kit: Kit, at: Vec3, rotY: number): void {
  kit.part(() =>
    kit.at({ at, rotY }, () => {
      for (const x of [-0.035, 0.035]) {
        for (const [lx, lz] of [
          [-0.012, 0.13],
          [0.012, 0.13],
          [-0.012, 0.2],
          [0.012, 0.2],
        ] as const) {
          kit.box({ w: 0.01, h: 0.05, d: 0.01, at: [x + lx, 0, lz], color: '#E8E2D6' })
        }
        kit.box({ w: 0.035, h: 0.035, d: 0.1, at: [x, 0.045, 0.165], color: '#E8E2D6' })
        kit.beam({ from: [x, 0.07, 0.205], to: [x, 0.11, 0.235], size: 0.02, color: '#E8E2D6' })
      }
      kit.box({ w: 0.12, h: 0.07, d: 0.15, at: [0, 0.04, -0.02], color: '#2E2A28', finish: 'gloss' })
      kit.box({ w: 0.13, h: 0.012, d: 0.16, at: [0, 0.11, -0.02], color: '#2E2A28' })
      for (const s of [-1, 1]) kit.cylinder({ r: 0.035, h: 0.012, at: [s * 0.066, 0.035, -0.06], rot: [0, 0, 90], seg: 10, color: '#5A3E2A' })
      kit.person({ at: [0, 0.11, 0.05], h: 0.08 })
    }),
  )
}

/** 地面に置く細長い帯（道）。from から to まで */
function strip(kit: Kit, from: XZ, to: XZ, width: number, color: string): void {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const len = Math.hypot(dx, dz)
  const rotY = (Math.atan2(dx, dz) * 180) / Math.PI
  kit.box({ w: width, h: 0.02, d: len + width * 0.5, at: [(from[0] + to[0]) / 2, 0, (from[1] + to[1]) / 2], rotY, color })
}
