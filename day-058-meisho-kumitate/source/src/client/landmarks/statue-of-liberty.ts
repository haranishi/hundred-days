// 自由の女神：港の小さな島（リバティ島）に立つ、松明を高く掲げた青緑の像。像と台座はほぼ同じ高さで、
// 台座の下に11の角を持つ星形の砦。正面（+Z）側を向かせ、いつもの角度で掲げた右腕と冠が見えるようにする。
// 白いうちは「星形の台の上の高い台座と、柱のような像」まで（モアイやラシュモア山と迷う）。
// 段階3の頭と7つの突起の冠・掲げた右腕と松明・左手の銘板で決まり、色塗りの青緑と金の炎、周りの海でほぼ全員が当たる。
import { type Kit, type Vec3, type XZ } from './kit'

const COPPER = '#7FB6A8'
const FLAME = '#E2B33C'
const PEDESTAL = '#B8AE9C'
const FOUNDATION = '#ABA391'
const FORT = '#A39C8C'
const TERRACE = '#C9C2B2'
const LAWN = '#6E9D4E'
const SEA = '#2E6E8E'
const DARK = '#6F6656'

/** 像の向き（上から見て、正面 +Z からいつものカメラの側へ少し回す） */
const FACING = -25

/** 高さ：砦の上面・台座の足もと・像の足もと（像と台座はほぼ同じ高さ） */
const FORT_H = 0.28
const PED0 = 0.95
const STATUE0 = 2.85

/** 島の輪郭（上から見た形）。台座の円の内側に収め、まわりは海 */
const ISLAND: readonly XZ[] = [
  [-0.4, 2.65],
  [1.0, 2.55],
  [2.2, 1.95],
  [2.95, 0.9],
  [3.2, -0.3],
  [2.9, -1.4],
  [2.2, -2.3],
  [1.2, -2.95],
  [-0.2, -3.35],
  [-1.5, -3.25],
  [-2.6, -2.65],
  [-3.25, -1.6],
  [-3.25, -0.4],
  [-2.85, 0.8],
  [-2.15, 1.8],
  [-1.3, 2.45],
]

export function build(kit: Kit): void {
  kit.ground(SEA)

  // ---- 段階1：海と島、星形の砦、台座の土台の段（白） ----
  kit.stage(1)
  kit.order(-1)
  kit.water({ r: 4.88, h: 0.03, color: SEA })
  kit.appear('grow')
  // 島：ふちを石の護岸と遊歩道、内側を芝生に
  kit.part(() => {
    kit.extrude({ points: ISLAND, h: 0.08, color: '#B7AE9C' })
    kit.extrude({ points: ISLAND.map(([x, z]): XZ => [x * 0.93, z * 0.93]), h: 0.012, at: [0, 0.08, 0], color: LAWN })
  })
  kit.appear('drop')
  kit.order(0)
  kit.at({ rotY: FACING }, () => {
    kit.part(() => {
      kit.extrude({ points: star(11, 1.85, 1.42), h: FORT_H, color: FORT })
      kit.extrude({ points: star(11, 1.74, 1.33), h: 0.02, at: [0, FORT_H, 0], color: TERRACE })
    })
    // 台座の土台は3段に積む
    kit.box({ w: 1.6, h: 0.22, d: 1.6, at: [0, FORT_H, 0], color: FOUNDATION })
    kit.box({ w: 1.42, h: 0.22, d: 1.42, at: [0, FORT_H + 0.22, 0], color: FOUNDATION })
    kit.frustum({ w: 1.26, h: 0.23, topW: 1.12, at: [0, FORT_H + 0.44, 0], color: FOUNDATION })
  })

  // ---- 段階2：形の特徴＝高い台座と、すそが広がった衣の像の胴（白） ----
  kit.stage(2)
  kit.at({ rotY: FACING }, () => {
    pedestal(kit)
    kit.at({ at: [0, STATUE0, 0] }, () => robe(kit))
  })

  // ---- 段階3：決め手の細部（白）＝冠の7つの突起・掲げた右腕と松明・左手の銘板、台座の柱廊 ----
  kit.stage(3)
  kit.at({ rotY: FACING }, () => {
    loggias(kit)
    kit.at({ at: [0, STATUE0, 0] }, () => {
      head(kit)
      rightArm(kit)
      leftArm(kit)
    })
  })

  // ---- 段階4：周りの景色（色つき）＝島の木と道、桟橋とフェリー、海の船、人 ----
  kit.stage(4)
  scenery(kit)
}

/** n の角を持つ星形（上から見た輪郭）。tip は角の先、valley は角の間の半径 */
function star(n: number, tip: number, valley: number): XZ[] {
  const pts: XZ[] = []
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n
    const r = i % 2 === 0 ? tip : valley
    pts.push([Math.sin(a) * r, Math.cos(a) * r])
  }
  return pts
}

/** 花こう岩の台座：下の台、胴、軒、上の段、手すりのある展望台 */
function pedestal(kit: Kit): void {
  const c = { color: PEDESTAL }
  kit.box({ w: 1.08, h: 0.42, d: 1.08, at: [0, PED0, 0], ...c })
  kit.part(() => {
    kit.box({ w: 0.94, h: 0.96, d: 0.94, at: [0, PED0 + 0.42, 0], ...c })
    // 四隅の付け柱
    for (const [sx, sz] of [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ] as const) {
      kit.box({ w: 0.12, h: 0.96, d: 0.12, at: [sx * 0.45, PED0 + 0.42, sz * 0.45], ...c })
    }
  })
  kit.part(() => {
    kit.box({ w: 1.06, h: 0.09, d: 1.06, at: [0, PED0 + 1.38, 0], ...c })
    kit.box({ w: 0.86, h: 0.34, d: 0.86, at: [0, PED0 + 1.47, 0], ...c })
    kit.box({ w: 0.94, h: 0.07, d: 0.94, at: [0, PED0 + 1.81, 0], ...c })
    kit.box({ w: 0.9, h: 0.05, d: 0.9, at: [0, PED0 + 1.88, 0], ...c })
  })
}

/** 台座の胴の上の方の、柱が並ぶくぼみ（各面に柱4本） */
function loggias(kit: Kit): void {
  kit.part(() => {
    for (let k = 0; k < 4; k++) {
      kit.at({ rotY: 90 * k }, () => {
        kit.box({ w: 0.6, h: 0.3, d: 0.02, at: [0, PED0 + 0.95, 0.475], color: DARK })
        for (const x of [-0.22, -0.075, 0.075, 0.22]) {
          kit.cylinder({ r: 0.022, h: 0.3, at: [x, PED0 + 0.95, 0.5], seg: 6, color: PEDESTAL })
        }
        kit.box({ w: 0.66, h: 0.04, d: 0.07, at: [0, PED0 + 0.91, 0.49], color: PEDESTAL })
      })
    }
  })
}

/** 衣をまとった胴（すそが広がり、肩でまとまる）。前後に少し薄い */
function robe(kit: Kit): void {
  kit.part(() => {
    kit.box({ w: 0.66, h: 0.06, d: 0.6, color: COPPER })
    kit.lathe({
      points: [
        [0, 0],
        [0.31, 0],
        [0.32, 0.08],
        [0.3, 0.3],
        [0.27, 0.6],
        [0.245, 0.9],
        [0.23, 1.12],
        [0.245, 1.32],
        [0.235, 1.5],
        [0.18, 1.6],
        [0.07, 1.64],
        [0, 1.65],
      ],
      seg: 14,
      scale: [1, 1, 0.8],
      color: COPPER,
    })
    // 斜めにかかる衣のひだ（肩から腰へ）
    kit.beam({ from: [-0.2, 1.45, 0.17], to: [0.16, 0.95, 0.2], size: 0.05, width: 0.09, color: COPPER })
    // 一歩踏み出した左足のすそ
    kit.sphere({ r: 0.12, squash: 0.5, at: [0.1, 0.0, 0.22], seg: 8, color: COPPER })
  })
}

/** 頭と、7つの突起の冠 */
function head(kit: Kit): void {
  kit.part(() => {
    kit.cylinder({ r: 0.065, h: 0.1, at: [0, 1.6, 0], seg: 8, color: COPPER })
    kit.sphere({ r: 0.135, at: [0, 1.66, 0.02], seg: 12, color: COPPER })
    kit.cylinder({ r: 0.145, h: 0.06, at: [0, 1.83, 0.01], seg: 12, color: COPPER })
    for (let i = 0; i < 7; i++) {
      const a = ((-90 + i * 30) * Math.PI) / 180
      const from: Vec3 = [Math.sin(a) * 0.12, 1.87, 0.01 + Math.cos(a) * 0.12]
      const to: Vec3 = [Math.sin(a) * 0.36, 1.97 + (i === 3 ? 0.05 : 0), 0.01 + Math.cos(a) * 0.36]
      kit.beam({ from, to, size: 0.035, color: COPPER })
    }
  })
}

/** 高く掲げた右腕（像から見て右＝-X）と松明。炎は金色 */
function rightArm(kit: Kit): void {
  kit.part(() => {
    const shoulder: Vec3 = [-0.21, 1.48, 0]
    const elbow: Vec3 = [-0.28, 1.92, 0.03]
    const hand: Vec3 = [-0.31, 2.3, 0.05]
    kit.sphere({ r: 0.1, at: [-0.21, 1.4, 0], seg: 10, color: COPPER })
    kit.beam({ from: shoulder, to: elbow, size: 0.11, color: COPPER })
    kit.beam({ from: elbow, to: hand, size: 0.09, color: COPPER })
    // 垂れた袖
    kit.beam({ from: [-0.24, 1.55, 0.0], to: [-0.3, 1.36, -0.02], size: 0.08, width: 0.12, color: COPPER })
    kit.sphere({ r: 0.06, at: [hand[0], hand[1] - 0.05, hand[2]], seg: 8, color: COPPER })
    // 松明：握り、受け皿、炎
    kit.cylinder({ r: 0.032, rTop: 0.04, h: 0.13, at: [hand[0], hand[1] + 0.03, hand[2]], seg: 8, color: COPPER })
    kit.cylinder({ r: 0.07, rTop: 0.095, h: 0.06, at: [hand[0], hand[1] + 0.16, hand[2]], seg: 10, color: COPPER })
    kit.cone({ r: 0.075, h: 0.2, at: [hand[0], hand[1] + 0.22, hand[2]], seg: 10, color: FLAME, finish: 'gold' })
  })
}

/** 左腕と、抱えた銘板（像から見て左＝+X） */
function leftArm(kit: Kit): void {
  kit.part(() => {
    const shoulder: Vec3 = [0.21, 1.48, 0]
    const elbow: Vec3 = [0.3, 1.16, 0.04]
    const hand: Vec3 = [0.25, 1.27, 0.2]
    kit.beam({ from: shoulder, to: elbow, size: 0.09, color: COPPER })
    kit.beam({ from: elbow, to: hand, size: 0.075, color: COPPER })
    kit.box({ w: 0.06, h: 0.44, d: 0.26, at: [0.3, 0.88, 0.1], rot: [-18, 0, 8], color: COPPER })
  })
}

function scenery(kit: Kit): void {
  // 島の道（桟橋から砦へ、島のふちの遊歩道）
  kit.part(() => {
    const c = { color: '#CFC7B4' }
    strip(kit, [-2.55, -2.2], [-1.25, -1.0], 0.26, c.color)
    strip(kit, [1.4, 1.5], [2.35, 1.6], 0.22, c.color)
    strip(kit, [-1.0, 1.75], [-2.0, 1.55], 0.22, c.color)
  })
  // 桟橋とフェリー
  kit.part(() => {
    kit.box({ w: 0.3, h: 0.1, d: 1.1, at: [-3.15, 0, -2.9], rotY: -50, color: '#8F8A80' })
  })
  kit.boat({ kind: 'ship', at: [-3.65, 0.03, -2.25], rotY: 40, len: 1.1 })
  kit.boat({ kind: 'ship', at: [2.6, 0.03, 3.25], rotY: -60, len: 0.95 })
  kit.boat({ kind: 'row', at: [3.85, 0.03, -1.55], rotY: 20, len: 0.42, color: '#F2F0EA' })
  kit.boat({ kind: 'ship', at: [-2.9, 0.03, 3.0], rotY: 75, len: 0.8, color: '#E5E2DA' })
  // 桟橋のそばの低い建物
  for (const [x, z, w, d, r] of [
    [-2.35, -2.75, 0.6, 0.38, -50],
    [-1.75, -2.95, 0.42, 0.34, -30],
  ] as const) {
    kit.part(() => {
      kit.box({ w, h: 0.2, d, at: [x, 0.09, z], rotY: r, color: '#E9E3D6' })
      kit.box({ w: w + 0.04, h: 0.04, d: d + 0.04, at: [x, 0.29, z], rotY: r, color: '#7A8187' })
    })
  }
  // 島のふちの木
  const trees: readonly (readonly [number, number])[] = [
    [2.55, 1.25],
    [2.85, 0.25],
    [2.75, -0.85],
    [2.35, -1.75],
    [1.6, -2.45],
    [0.6, -2.85],
    [-0.5, -2.95],
    [-2.75, -1.35],
    [-2.8, -0.35],
    [-2.5, 0.65],
    [-1.85, 1.45],
    [0.6, 2.2],
    [1.55, 2.0],
    [-0.45, 2.3],
  ]
  for (const [x, z] of trees) {
    kit.tree({ kind: 'round', h: kit.range(0.42, 0.55), at: [x, 0.08, z], color: kit.pick(['#4F8A43', '#5E9A4C', '#457C3C']) })
  }
  // 島の奥（北）の木立
  kit.scatter(
    { count: 14, rMin: 2.0, rMax: 3.0, gap: 0.36, ok: (x, z) => z < -1.2 && x > -1.9 && x < 2.2 },
    (_i, x, z) => kit.tree({ kind: 'round', h: kit.range(0.44, 0.58), at: [x, 0.08, z], color: kit.pick(['#4F8A43', '#5E9A4C', '#457C3C']) }),
  )
  // 人：遊歩道、砦の上、台座の展望台
  for (const [x, z] of [
    [-2.2, -1.85],
    [-1.9, -1.55],
    [-1.55, -1.3],
    [1.75, 1.55],
    [2.1, 1.6],
    [-1.4, 1.7],
    [-1.75, 1.6],
    [0.25, 2.0],
    [-0.8, -2.2],
  ] as const) {
    kit.person({ at: [x, 0.09, z], rotY: kit.range(0, 360) })
  }
  kit.at({ rotY: FACING }, () => {
    for (const [x, z] of [
      [0.62, 0.95],
      [-0.7, 0.9],
      [0.95, -0.55],
      [-1.0, -0.4],
      [0.2, -1.05],
    ] as const) {
      kit.person({ at: [x, FORT_H + 0.02, z], rotY: kit.range(0, 360) })
    }
    for (const [x, z] of [
      [0.36, 0.4],
      [-0.38, 0.38],
    ] as const) {
      kit.person({ at: [x, PED0 + 1.93, z], rotY: kit.range(0, 360), h: 0.09 })
    }
  })
}

/** 地面に置く細長い帯（道）。from から to まで */
function strip(kit: Kit, from: XZ, to: XZ, width: number, color: string): void {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const len = Math.hypot(dx, dz)
  const rotY = (Math.atan2(dx, dz) * 180) / Math.PI
  kit.box({ w: width, h: 0.015, d: len, at: [(from[0] + to[0]) / 2, 0.09, (from[1] + to[1]) / 2], rotY, color })
}
