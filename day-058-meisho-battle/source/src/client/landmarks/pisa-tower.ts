// ピサの斜塔：ドゥオモ広場の芝生に立つ白い大理石の円筒形の鐘楼。8層（1階の閉じたアーケード＋6層の柱廊＋鐘楼）。
// 正面（+Z）が南、右（+X）が東。塔は南東へ傾く。左（西）にピサ大聖堂、その奥（さらに西）に洗礼堂、北に墓所の回廊。
// 白いうちは「大聖堂とその横の円い塔」まで（サン・ピエトロ大聖堂などと迷う）。積み上がるほど傾きがはっきりし、
// 段階3の鐘楼と大聖堂の正面のアーケードで決まる。色塗りの芝生の緑と大理石の白、段階4の洗礼堂と観光客でほぼ全員が当たる。
import { type Kit, type Vec3 } from './kit'

const MARBLE = '#EDE8DD'
/** 柱廊の奥の壁。影になる色にして、色が付いたあとも柱の列が読めるようにする */
const SHADE = '#CFC7B7'
const LEAD = '#8E9295'
const STRIPE = '#A9AAA3'
const LAWN = '#6FA04F'
const PAVE = '#DCD3C2'
const DOOR = '#5C5048'

/** 塔の底の中心と傾き。実物は3.97度だが、模型の小ささでも傾きが読めるよう少し大きくする */
const T: Vec3 = [1.75, 0, 0.35]
const LEAN = 5
/** 傾ける向き（上から見て南東＝+X と +Z の間） */
const LEAN_YAW = -45

/** 塔の各層の高さ。全体の高さは直径の約3.6倍 */
const BASE_TOP = 0.08
const FLOOR1_TOP = 0.9
const LOGGIA_H = 0.5
const LOGGIA0 = 0.95
const BELL0 = LOGGIA0 + LOGGIA_H * 6

/** 大聖堂（ラテン十字形）。身廊は X 方向、正面は西（-X） */
const CZ = -1.25
const FACADE_X = -2.95
const APSE_X = 0.7
const CROSS_X = -0.2

export function build(kit: Kit): void {
  kit.ground(LAWN)

  // ---- 段階1：広場の舗装、塔の下の層、大聖堂の大きな箱（白） ----
  kit.stage(1)
  kit.order(-1)
  paving(kit)
  kit.order(0)
  leaning(kit, () => {
    kit.part(() => {
      kit.cylinder({ r: 0.74, h: 0.04, seg: 24, color: PAVE })
      kit.cylinder({ r: 0.69, h: 0.04, at: [0, 0.04, 0], seg: 24, color: MARBLE })
    })
    floor1(kit)
    loggia(kit, 0)
  })
  cathedralBody(kit)

  // ---- 段階2：形の特徴＝積み上がる柱廊（傾きがはっきりする）、大聖堂の屋根と丸屋根（白） ----
  kit.stage(2)
  leaning(kit, () => {
    for (let i = 1; i < 5; i++) loggia(kit, i)
  })
  cathedralRoofs(kit)

  // ---- 段階3：決め手の細部（白）＝いちばん上の柱廊と小さな鐘楼、大聖堂の正面のアーケード ----
  kit.stage(3)
  leaning(kit, () => {
    loggia(kit, 5)
    belfry(kit)
  })
  facade(kit)

  // ---- 段階4：周りの景色（色つき）＝洗礼堂、墓所の回廊、木、土産物の屋台、観光客 ----
  kit.stage(4)
  scenery(kit)
}

// ===== 塔 =====

/** 塔の座標（底の中心が原点、南東へ傾く）の中で作る */
function leaning(kit: Kit, fn: () => void): void {
  kit.at({ at: T, rot: [0, 0, -LEAN], rotY: LEAN_YAW }, fn)
}

/**
 * 円周に並ぶアーケード。アーチの板（kit.arch）を外向きに bays 枚並べる。
 * 板の幅は隣とすき間なくつながる弦の長さ
 */
function arcade(kit: Kit, o: { r: number; y: number; h: number; bays: number; pier: number; d: number; color: string }): void {
  const w = 2 * o.r * Math.sin(Math.PI / o.bays) + 0.004
  for (let i = 0; i < o.bays; i++) {
    const a = (360 * i) / o.bays
    const rad = (a * Math.PI) / 180
    const rr = o.r * Math.cos(Math.PI / o.bays)
    kit.arch({ w, h: o.h, d: o.d, thick: o.pier, at: [Math.sin(rad) * rr, o.y, Math.cos(rad) * rr], rotY: a, seg: 6, color: o.color })
  }
}

/** 1階：閉じた壁に、柱と半円のアーチを浮き彫りにした「盲アーケード」 */
function floor1(kit: Kit): void {
  kit.part(() => {
    kit.cylinder({ r: 0.6, h: FLOOR1_TOP - BASE_TOP, at: [0, BASE_TOP, 0], seg: 24, color: MARBLE })
    arcade(kit, { r: 0.64, y: BASE_TOP, h: FLOOR1_TOP - BASE_TOP, bays: 15, pier: 0.035, d: 0.05, color: MARBLE })
    kit.cylinder({ r: 0.67, h: 0.05, at: [0, FLOOR1_TOP, 0], seg: 24, color: MARBLE })
    // 入口の扉（南）
    kit.box({ w: 0.16, h: 0.28, d: 0.04, at: [0, BASE_TOP, 0.655], color: DOOR })
  })
}

/** 柱廊の層 i（0〜5）：床の張り出し、奥の壁、外まわりのアーチの列 */
function loggia(kit: Kit, i: number): void {
  const y0 = LOGGIA0 + i * LOGGIA_H
  kit.part(() => {
    kit.cylinder({ r: 0.68, h: 0.045, at: [0, y0, 0], seg: 24, color: MARBLE })
    kit.cylinder({ r: 0.5, h: LOGGIA_H, at: [0, y0, 0], seg: 20, color: SHADE })
    arcade(kit, { r: 0.65, y: y0 + 0.045, h: LOGGIA_H - 0.07, bays: 22, pier: 0.022, d: 0.04, color: MARBLE })
    kit.cylinder({ r: 0.665, h: 0.028, at: [0, y0 + LOGGIA_H - 0.028, 0], seg: 24, color: MARBLE })
  })
}

/** いちばん上の小さな鐘楼（直径が一回り小さく、大きなアーチが開く） */
function belfry(kit: Kit): void {
  kit.part(() => {
    const y = BELL0
    kit.cylinder({ r: 0.5, h: 0.04, at: [0, y, 0], seg: 20, color: MARBLE })
    kit.cylinder({ r: 0.3, h: 0.44, at: [0, y + 0.04, 0], seg: 16, color: SHADE })
    arcade(kit, { r: 0.43, y: y + 0.04, h: 0.38, bays: 12, pier: 0.03, d: 0.04, color: MARBLE })
    kit.cylinder({ r: 0.46, h: 0.06, at: [0, y + 0.42, 0], seg: 20, color: MARBLE })
    // 屋上の低い手すりと、鐘の屋根
    kit.cylinder({ r: 0.44, h: 0.05, at: [0, y + 0.48, 0], seg: 20, color: MARBLE })
    kit.cylinder({ r: 0.2, h: 0.06, at: [0, y + 0.48, 0], seg: 12, color: SHADE })
  })
}

// ===== 大聖堂 =====

/** 身廊・側廊・袖廊・後陣の壁（白い大理石に灰色の縞） */
function cathedralBody(kit: Kit): void {
  const len = APSE_X - FACADE_X
  const cx = (APSE_X + FACADE_X) / 2
  // 身廊（高い）と側廊（低い）
  kit.part(() => {
    kit.box({ w: len, h: 1.0, d: 0.78, at: [cx, 0, CZ], color: MARBLE })
    stripes(kit, cx, CZ, len + 0.01, 0.79, 1.0)
  })
  kit.part(() => {
    for (const s of [-1, 1]) {
      kit.box({ w: len - 0.1, h: 0.6, d: 0.4, at: [cx + 0.05, 0, CZ + s * 0.58], color: MARBLE })
      stripes(kit, cx + 0.05, CZ + s * 0.58, len - 0.09, 0.41, 0.6)
    }
  })
  // 袖廊（南北に張り出す）
  kit.part(() => {
    kit.box({ w: 0.62, h: 0.9, d: 2.7, at: [CROSS_X, 0, CZ], color: MARBLE })
    stripes(kit, CROSS_X, CZ, 0.63, 2.71, 0.9)
  })
  // 後陣（東の端の半円）
  kit.cylinder({ r: 0.39, h: 0.85, at: [APSE_X, 0, CZ], seg: 16, color: MARBLE })
}

/** 壁の灰色の縞（細い帯を何本か） */
function stripes(kit: Kit, x: number, z: number, w: number, d: number, h: number): void {
  for (let y = 0.12; y < h - 0.08; y += 0.16) kit.box({ w, h: 0.035, d, at: [x, y, z], color: STRIPE })
}

/** 屋根（鉛の灰色）と、交差部の楕円の丸屋根 */
function cathedralRoofs(kit: Kit): void {
  const len = APSE_X - FACADE_X
  const cx = (APSE_X + FACADE_X) / 2
  kit.gableRoof({ w: len, d: 0.78, h: 0.24, at: [cx, 1.0, CZ], overhang: 0.04, color: LEAD })
  kit.part(() => {
    for (const s of [-1, 1]) {
      kit.beam({ from: [cx + 0.05, 0.6, CZ + s * 0.8], to: [cx + 0.05, 0.8, CZ + s * 0.39], size: 0.04, width: len - 0.1, color: LEAD })
    }
  })
  kit.gableRoof({ w: 2.7, d: 0.62, h: 0.22, at: [CROSS_X, 0.9, CZ], rotY: 90, overhang: 0.04, color: LEAD })
  kit.sphere({ r: 0.39, squash: 0.45, at: [APSE_X, 0.85, CZ], seg: 14, color: LEAD })
  // 丸屋根：低い胴と、少し縦長の丸屋根
  kit.part(() => {
    kit.cylinder({ r: 0.3, h: 0.22, at: [CROSS_X, 1.14, CZ], seg: 16, color: MARBLE })
    kit.at({ at: [CROSS_X, 0, CZ] }, () => arcade(kit, { r: 0.315, y: 1.14, h: 0.2, bays: 12, pier: 0.02, d: 0.025, color: MARBLE }))
    kit.sphere({ r: 0.31, squash: 0.95, at: [CROSS_X, 1.34, CZ], seg: 14, color: LEAD })
    kit.cylinder({ r: 0.06, h: 0.1, at: [CROSS_X, 1.91, CZ], seg: 8, color: MARBLE })
    kit.cone({ r: 0.07, h: 0.08, at: [CROSS_X, 2.01, CZ], seg: 8, color: LEAD })
  })
}

/** 西の正面：下の幅広い壁に扉3つ、上は4段の小さなアーケードと三角の破風 */
function facade(kit: Kit): void {
  // 正面は -X を向く。作るときは +Z 向きに作って、Y軸まわりに -90 度回す
  kit.at({ at: [FACADE_X - 0.05, 0, CZ], rotY: -90 }, () => {
    kit.part(() => {
      kit.box({ w: 1.62, h: 0.66, d: 0.1, color: MARBLE })
      flatArcade(kit, { x0: -0.78, x1: 0.78, y: 0.04, h: 0.58, bays: 7, pier: 0.03, color: MARBLE })
      for (const x of [-0.5, 0, 0.5]) kit.box({ w: 0.13, h: 0.3, d: 0.03, at: [x, 0, 0.06], color: DOOR })
      // 斜めの肩と上の壁
      kit.box({ w: 0.86, h: 0.62, d: 0.1, at: [0, 0.66, 0], color: MARBLE })
      for (const s of [-1, 1]) {
        kit.beam({ from: [s * 0.81, 0.66, 0], to: [s * 0.43, 0.86, 0], size: 0.1, width: 0.05, color: MARBLE })
      }
      flatArcade(kit, { x0: -0.78, x1: 0.78, y: 0.68, h: 0.13, bays: 12, pier: 0.012, color: MARBLE, d: 0.14 })
      flatArcade(kit, { x0: -0.42, x1: 0.42, y: 0.84, h: 0.13, bays: 7, pier: 0.012, color: MARBLE, d: 0.14 })
      flatArcade(kit, { x0: -0.42, x1: 0.42, y: 1.0, h: 0.13, bays: 7, pier: 0.012, color: MARBLE, d: 0.14 })
      kit.gableRoof({ w: 0.92, d: 0.12, h: 0.22, at: [0, 1.28, 0], rotY: 90, overhang: 0, color: MARBLE })
      flatArcade(kit, { x0: -0.24, x1: 0.24, y: 1.16, h: 0.11, bays: 4, pier: 0.012, color: MARBLE, d: 0.14 })
    })
  })
}

/** 平らな壁の前（z の位置）に、x0〜x1 に並ぶアーチの列。正面は +Z */
function flatArcade(kit: Kit, o: { x0: number; x1: number; y: number; h: number; bays: number; pier: number; color: string; d?: number; z?: number }): void {
  const w = (o.x1 - o.x0) / o.bays
  for (let i = 0; i < o.bays; i++) {
    kit.arch({ w, h: o.h, d: o.d ?? 0.04, thick: o.pier, at: [o.x0 + w * (i + 0.5), o.y, o.z ?? 0.05], seg: 6, color: o.color })
  }
}

// ===== 広場と景色 =====

function paving(kit: Kit): void {
  kit.appear('grow')
  // 大聖堂のまわりの舗装、塔のまわりの丸い舗装、南の通りへの道
  kit.box({ w: 4.35, h: 0.02, d: 3.25, at: [(FACADE_X + APSE_X) / 2 + 0.05, 0, CZ], color: PAVE })
  kit.cylinder({ r: 1.05, h: 0.02, at: [T[0], 0, T[2]], seg: 28, color: PAVE })
  kit.box({ w: 8.2, h: 0.02, d: 0.42, at: [0, 0, 2.25], color: PAVE })
  kit.box({ w: 0.36, h: 0.02, d: 1.0, at: [T[0], 0, 1.5], color: PAVE })
  kit.box({ w: 0.36, h: 0.02, d: 1.55, at: [-1.35, 0, 1.2], color: PAVE })
  // 洗礼堂の前の舗装
  kit.cylinder({ r: 0.82, h: 0.02, at: [-3.85, 0, CZ], seg: 24, color: PAVE })
  kit.appear('drop')
}

function scenery(kit: Kit): void {
  baptistery(kit, [-3.85, 0, CZ])
  // 北の墓所の回廊（低く長い白い建物）
  kit.part(() => {
    kit.box({ w: 4.6, h: 0.42, d: 0.55, at: [-0.9, 0, -3.35], color: MARBLE })
    kit.gableRoof({ w: 4.6, d: 0.55, h: 0.14, at: [-0.9, 0.42, -3.35], overhang: 0.03, color: '#B9876A' })
    flatArcade(kit, { x0: -3.15, x1: 1.35, y: 0.04, h: 0.3, bays: 14, pier: 0.03, color: MARBLE, z: -3.35 + 0.29 })
  })
  // 南の通りの土産物の屋台（白い屋根と色の付いた日よけ）
  const awnings = ['#C8453B', '#3D6FA9', '#E2A93B', '#3F8C6B', '#C8453B', '#6D4C93']
  awnings.forEach((color, i) => {
    const x = -2.6 + i * 0.75
    kit.part(() => {
      kit.box({ w: 0.42, h: 0.18, d: 0.3, at: [x, 0, 2.85], color: '#F2EEE6' })
      kit.beam({ from: [x, 0.2, 2.62], to: [x, 0.26, 2.95], size: 0.025, width: 0.48, color })
    })
  })
  // 木（広場のふちに少しだけ）
  for (const [x, z, h] of [
    [3.4, -1.6, 0.6],
    [3.0, -2.6, 0.55],
    [3.9, -0.5, 0.5],
    [3.7, 1.3, 0.55],
    [-4.1, 1.0, 0.5],
    [-3.3, 1.55, 0.45],
    [2.2, -3.4, 0.55],
    [-3.6, -3.05, 0.5],
  ] as const) {
    kit.tree({ kind: 'round', h, at: [x, 0, z], color: '#5E8F45' })
  }
  // 観光客：塔のまわり（塔を支えるしぐさの人も）、芝生、大聖堂の前、通り
  for (const [x, z] of [
    [0.75, 0.9],
    [0.95, 1.2],
    [1.2, 1.35],
    [2.6, 1.1],
    [2.85, 0.6],
    [2.7, -0.35],
    [0.6, -0.1],
    [-0.5, 0.9],
    [-1.3, 0.6],
    [-1.45, 1.6],
    [-2.3, 0.75],
    [-3.3, -0.3],
    [-3.55, -2.2],
    [0.2, 2.25],
    [-0.9, 2.3],
    [1.9, 2.2],
    [2.6, 2.3],
    [-2.0, 2.15],
  ] as const) {
    kit.person({ at: [x, 0.02, z], rotY: kit.range(0, 360) })
  }
}

/** 洗礼堂：円い2層の建物と、とがった丸屋根 */
function baptistery(kit: Kit, at: Vec3): void {
  kit.part(() =>
    kit.at({ at }, () => {
      kit.cylinder({ r: 0.62, h: 0.44, seg: 20, color: MARBLE })
      stripesRound(kit, 0.625, 0.44)
      arcade(kit, { r: 0.64, y: 0.0, h: 0.42, bays: 14, pier: 0.04, d: 0.04, color: MARBLE })
      kit.cylinder({ r: 0.6, h: 0.24, at: [0, 0.44, 0], seg: 20, color: MARBLE })
      arcade(kit, { r: 0.62, y: 0.44, h: 0.22, bays: 18, pier: 0.02, d: 0.03, color: MARBLE })
      kit.cylinder({ r: 0.52, h: 0.12, at: [0, 0.68, 0], seg: 20, color: MARBLE })
      // 円すい台の屋根（鉛）と、上の小さな丸屋根（赤い瓦）
      kit.cylinder({ r: 0.52, rTop: 0.2, h: 0.38, at: [0, 0.8, 0], seg: 20, color: LEAD })
      kit.sphere({ r: 0.2, squash: 0.85, at: [0, 1.12, 0], seg: 12, color: '#B9876A' })
      kit.cylinder({ r: 0.035, h: 0.12, at: [0, 1.44, 0], seg: 8, color: MARBLE })
    }),
  )
}

function stripesRound(kit: Kit, r: number, h: number): void {
  for (let y = 0.1; y < h - 0.05; y += 0.12) kit.cylinder({ r, h: 0.03, at: [0, y, 0], seg: 20, color: STRIPE })
}
