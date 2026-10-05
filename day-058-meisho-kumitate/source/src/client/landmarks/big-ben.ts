// ビッグ・ベン（エリザベス・タワー）：テムズ川の岸に立つ四角い時計塔。四面の丸い文字盤、その上の鐘楼と細い尖塔。
// 塔の足もとから横長のウェストミンスター宮殿（国会議事堂）が川ぞいに奥へ続き、奥の端に太いヴィクトリア・タワーが立つ。
// 正面（+Z）が北＝ウェストミンスター橋の側、左（-X）がテムズ川。いつもの角度では、川ごしに宮殿の長い正面と時計塔が見える。
// 白いうちは「川ぞいの長い建物と塔の根もと」→「四角い塔と横長の建物」まで（札幌市時計台やウェストミンスター寺院、ロンドン塔と迷う）。
// 段階3の文字盤・鐘楼・尖塔と宮殿の尖った飾りで決まり、色塗りの砂色の石と金の文字盤、段階4の緑の橋と赤い2階建てバスでほぼ全員が当たる。
// 文字盤は目盛りと針の模様だけで、数字や文字は入れない。川の色・岸の作り・バス・街路樹は tower-bridge.ts と同じ値にそろえる。
import { type Kit, type Vec3, type XZ } from './kit'

// ---- ロンドンの部品（tower-bridge.ts と同じ値） ----
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
const PORTLAND = '#E3DCCB' // 街の石の建物
const SLATE = '#5D646D'

// ---- この名所の色 ----
const STONE = '#CDB98E' // 砂色の石灰岩
const STONE_DARK = '#B9A47A'
const SPIRE = '#3B4652'
const GOLD = '#C9A14A'
const DIAL = '#F4F1E6'
const HAND = '#26292E'
const WINDOW = '#4A4A48'
const BRIDGE_GREEN = '#4E7A5E'

/** 川の両岸の線（x）。左の対岸と右の宮殿側 */
const FAR_BANK = -4.05
const NEAR_BANK = -1.8
/** 時計塔の中心と、塔の高さの区切り */
const TX = -1.3
const TZ = 2.3
const SHAFT = 0.56
const SHAFT_MID = BANK + 1.3
const CLOCK0 = BANK + 2.33
const CLOCK1 = BANK + 2.93
const DIAL_Y = BANK + 2.63
const BELFRY1 = BANK + 3.36
const SPIRE1 = BANK + 4.42
/** 宮殿の川側の長い棟（x の範囲・z の範囲・高さ） */
const RF_X0 = -1.72
const RF_X1 = -1.0
const RF_Z0 = -3.45
const RF_Z1 = 1.82
const RF_H = 0.9
/** 川側の棟の、少し高いパビリオンの位置（z） */
const PAVILIONS = [1.5, 0.32, -0.9, -2.12, -3.15] as const
/** ヴィクトリア・タワー */
const VX = -0.42
const VZ = -3.2
const VW = 0.66
const VTOP = BANK + 2.35
/** 橋の通り（z） */
const BRIDGE_Z = 3.02

export function build(kit: Kit): void {
  kit.ground(PAVE)

  // ---- 段階1：川と両岸・宮殿の川側の長い棟・内側の棟・ウェストミンスター・ホールの壁・2つの塔の根もと（白） ----
  kit.stage(1)
  kit.order(-1)
  kit.water({ points: bandX(FAR_BANK, NEAR_BANK, 4.9), h: 0.05, color: RIVER })
  kit.appear('grow')
  kit.part(() => {
    kit.extrude({ points: landSide(NEAR_BANK, 1, 4.9), h: BANK, color: PAVE })
    quayWall(kit, NEAR_BANK, 1)
    // 橋の通りと、宮殿の陸側の通り、国会議事堂広場の芝生
    kit.box({ w: 5.3, h: 0.012, d: 0.44, at: [0.85, BANK, BRIDGE_Z], color: ROAD })
    kit.box({ w: 0.38, h: 0.012, d: 6.9, at: [0.9, BANK, -0.35], color: ROAD })
    kit.box({ w: 1.5, h: 0.016, d: 1.25, at: [2.0, BANK, 1.75], color: LAWN })
  })
  kit.part(() => {
    kit.extrude({ points: landSide(FAR_BANK, -1, 4.9), h: BANK, color: PAVE })
    quayWall(kit, FAR_BANK, -1)
  })
  kit.appear('drop')
  kit.order(0)
  // 宮殿：川側の長い棟（パビリオンの部分は少し前へ出す）
  kit.part(() => {
    kit.box({ w: RF_X1 - RF_X0, h: RF_H, d: RF_Z1 - RF_Z0, at: [(RF_X0 + RF_X1) / 2, BANK, (RF_Z0 + RF_Z1) / 2], color: STONE })
    kit.box({ w: RF_X1 - RF_X0 + 0.06, h: 0.1, d: RF_Z1 - RF_Z0 + 0.06, at: [(RF_X0 + RF_X1) / 2, BANK, (RF_Z0 + RF_Z1) / 2], color: STONE_DARK })
  })
  // 内側の棟とウェストミンスター・ホールの壁
  kit.box({ w: 0.9, h: 0.76, d: 4.45, at: [-0.55, BANK, -0.75], color: STONE })
  kit.box({ w: 0.56, h: 0.6, d: 1.55, at: [0.22, BANK, 1.15], color: STONE_DARK })
  // 時計塔とヴィクトリア・タワーの根もと
  towerShaft(kit, BANK, SHAFT_MID, true)
  kit.box({ w: VW, h: 1.05, d: VW, at: [VX, BANK, VZ], color: STONE })

  // ---- 段階2：形の特徴＝細長い四角い塔の上半分・宮殿の屋根とパビリオン・ヴィクトリア・タワーの上半分・中央の塔の胴（白） ----
  kit.stage(2)
  // 細長い塔の上半分は段階2の最初に出す（高い所にあるので、順番の指定がないと最後になる）
  kit.order(-1)
  towerShaft(kit, SHAFT_MID, CLOCK0, false)
  kit.order(0)
  for (const z of PAVILIONS) {
    kit.part(() => {
      kit.box({ w: RF_X1 - RF_X0 + 0.1, h: RF_H + 0.28, d: 0.46, at: [(RF_X0 + RF_X1) / 2, BANK, z], color: STONE })
      kit.hipRoof({ w: RF_X1 - RF_X0 + 0.1, d: 0.46, h: 0.26, overhang: 0.01, ridge: 0.08, at: [(RF_X0 + RF_X1) / 2, BANK + RF_H + 0.28, z], color: SLATE })
    })
  }
  kit.part(() => {
    // 長い棟の急な屋根（棟は z 方向）
    kit.hipRoof({ w: RF_Z1 - RF_Z0, d: RF_X1 - RF_X0 - 0.06, h: 0.24, overhang: 0.0, at: [(RF_X0 + RF_X1) / 2, BANK + RF_H, (RF_Z0 + RF_Z1) / 2], rotY: 90, color: SLATE })
    kit.hipRoof({ w: 4.45, d: 0.84, h: 0.26, overhang: 0.0, at: [-0.55, BANK + 0.76, -0.75], rotY: 90, color: SLATE })
  })
  // ウェストミンスター・ホールの急な切妻屋根（棟は z 方向）
  kit.gableRoof({ w: 1.55, d: 0.56, h: 0.42, overhang: 0.03, at: [0.22, BANK + 0.6, 1.15], rotY: 90, color: SLATE })
  // ヴィクトリア・タワーの上半分
  kit.part(() => {
    kit.box({ w: VW, h: VTOP - BANK - 1.05, d: VW, at: [VX, BANK + 1.05, VZ], color: STONE })
    kit.box({ w: VW + 0.04, h: 0.05, d: VW + 0.04, at: [VX, BANK + 1.05, VZ], color: STONE_DARK })
  })
  // 中央の塔の胴（八角形）
  kit.cylinder({ r: 0.21, h: 0.62, at: [-0.6, BANK + 0.9, -0.62], seg: 8, rotY: 22.5, color: STONE })

  // ---- 段階3：決め手の細部（白）＝四面の文字盤の段・鐘楼・尖塔、宮殿の縦の筋・窓・尖った飾り、塔の頂の小塔 ----
  kit.stage(3)
  clockStage(kit)
  belfryAndSpire(kit)
  kit.part(() => riverFacade(kit))
  victoriaTop(kit)
  // 中央の塔の尖塔
  kit.part(() => {
    kit.cone({ r: 0.22, h: 0.62, at: [-0.6, BANK + 1.52, -0.62], seg: 8, rotY: 22.5, color: SPIRE })
    kit.cylinder({ r: 0.012, h: 0.12, at: [-0.6, BANK + 2.12, -0.62], seg: 6, color: GOLD, finish: 'gold' })
    kit.ring(8, 0.21, (_i, x, z) => {
      kit.cylinder({ r: 0.018, h: 0.12, at: [-0.6 + x, BANK + 1.5, -0.62 + z], seg: 6, color: STONE })
      kit.cone({ r: 0.022, h: 0.07, at: [-0.6 + x, BANK + 1.62, -0.62 + z], seg: 6, color: STONE })
    }, 22.5)
  })
  // ウェストミンスター・ホールの北の妻の大窓と、両わきの小塔
  kit.part(() => {
    plate(kit, gothicArch(0.32, 0.36, 0.56), 0.012, [0.22, BANK + 0.12, 1.15 + 0.785], WINDOW)
    for (const s of [-1, 1]) {
      kit.box({ w: 0.08, h: 0.88, d: 0.08, at: [0.22 + s * 0.29, BANK, 1.92], color: STONE })
      kit.cone({ r: 0.06, h: 0.16, at: [0.22 + s * 0.29, BANK + 0.88, 1.92], seg: 4, rotY: 45, color: STONE })
    }
  })

  // ---- 段階4：周りの景色（色つき）＝緑のウェストミンスター橋・赤い2階建てバスと黒いタクシー・川の遊覧船・街路樹・街・人 ----
  kit.stage(4)
  westminsterBridge(kit)
  bus(kit, [-2.55, 0.29, BRIDGE_Z - 0.09], -90)
  bus(kit, [0.2, BANK + 0.012, BRIDGE_Z + 0.09], 90)
  bus(kit, [0.98, BANK + 0.012, -1.6], 0)
  kit.car({ at: [-3.25, 0.29, BRIDGE_Z + 0.09], rotY: 90, color: CAB })
  kit.car({ at: [1.65, BANK + 0.012, BRIDGE_Z - 0.09], rotY: -90, color: CAB })
  kit.car({ at: [0.82, BANK + 0.012, 0.6], rotY: 180, color: CAB })
  kit.car({ at: [2.6, BANK + 0.012, BRIDGE_Z + 0.09], rotY: 90 })
  kit.car({ at: [0.98, BANK + 0.012, -3.3], rotY: 0 })
  // 川の遊覧船
  kit.boat({ kind: 'ship', at: [-2.55, 0.05, 0.6], rotY: 180, len: 0.85 })
  kit.boat({ kind: 'ship', at: [-3.3, 0.05, -1.9], rotY: 0, len: 0.75, color: '#F2EFE6' })
  // 街の石の建物（右の奥）
  for (const [x, z, w, d, h, wall] of [
    [1.75, -0.35, 1.0, 0.85, 0.82, PORTLAND],
    [3.0, -0.2, 1.05, 0.75, 0.95, '#D9CDB4'],
    [1.75, -1.65, 1.0, 1.1, 0.9, PORTLAND],
    [3.0, -1.55, 1.05, 1.0, 0.78, '#B07A5A'],
    [1.7, -3.0, 0.95, 1.0, 0.8, '#D9CDB4'],
    [2.95, -2.9, 0.9, 0.85, 0.7, PORTLAND],
    [3.9, 0.9, 0.55, 0.7, 0.7, '#B07A5A'],
  ] as const) {
    building(kit, x, z, w, d, h, wall)
  }
  // 国会議事堂広場・川ぞい・対岸の並木
  for (const [x, z] of [
    [1.35, 1.25],
    [1.35, 2.25],
    [2.65, 1.25],
    [2.65, 2.25],
    [2.0, 2.45],
    [3.55, 2.45],
    [3.85, 1.85],
    [-1.55, 3.7],
    [-0.9, 3.95],
    [-0.25, 4.1],
    [0.5, 4.05],
    [-1.2, -3.85],
    [-0.4, -4.0],
    [0.35, -3.9],
  ] as const) {
    kit.tree({ kind: 'round', h: kit.range(0.42, 0.52), at: [x, BANK, z], color: kit.pick(PLANE_TREES) })
  }
  for (let k = 0; k < 5; k++) {
    const z = -1.7 + k * 0.85
    kit.tree({ kind: 'round', h: kit.range(0.4, 0.48), at: [-4.36, BANK, z], color: kit.pick(PLANE_TREES) })
  }
  // 人（橋の歩道・広場・対岸の遊歩道・塔の足もと）
  for (const [x, z] of [
    [-2.2, BRIDGE_Z + 0.2],
    [-2.9, BRIDGE_Z + 0.2],
    [-3.2, BRIDGE_Z - 0.2],
    [-2.0, BRIDGE_Z - 0.2],
  ] as const) {
    kit.person({ at: [x, 0.29, z], rotY: kit.range(0, 360) })
  }
  for (const [x, z] of [
    [-0.95, 2.72],
    [-0.6, 2.7],
    [-1.65, 2.72],
    [1.7, 1.5],
    [2.3, 2.0],
    [2.0, 1.2],
    [-4.2, 0.4],
    [-4.25, -0.9],
    [-4.15, 1.5],
    [0.55, 2.6],
  ] as const) {
    kit.person({ at: [x, BANK, z], rotY: kit.range(0, 360) })
  }
}

// ===== 時計塔 =====

/** 塔の胴（y0〜y1）。四隅の控え壁・面の縦の筋・横の帯・細い窓。lower は足もとの台も作る */
function towerShaft(kit: Kit, y0: number, y1: number, lower: boolean): void {
  kit.at({ at: [TX, 0, TZ] }, () =>
    kit.part(() => {
      if (lower) kit.box({ w: SHAFT + 0.1, h: 0.2, d: SHAFT + 0.1, at: [0, y0, 0], color: STONE_DARK })
      kit.box({ w: SHAFT, h: y1 - y0, d: SHAFT, at: [0, y0, 0], color: STONE })
      for (const [sx, sz] of [
        [1, 1],
        [-1, 1],
        [-1, -1],
        [1, -1],
      ] as const) {
        kit.box({ w: 0.07, h: y1 - y0, d: 0.07, at: [(sx * SHAFT) / 2, y0, (sz * SHAFT) / 2], color: STONE })
      }
      for (let f = 0; f < 4; f++) {
        kit.at({ rotY: f * 90 }, () => {
          for (const x of [-0.1, 0.1]) kit.box({ w: 0.028, h: y1 - y0, d: 0.016, at: [x, y0, SHAFT / 2], color: STONE })
          for (let y = y0 + 0.45; y < y1 - 0.1; y += 0.5) {
            kit.box({ w: SHAFT + 0.03, h: 0.03, d: 0.03, at: [0, y, SHAFT / 2 - 0.005], color: STONE_DARK })
            for (const x of [-0.19, 0, 0.19]) kit.box({ w: 0.035, h: 0.16, d: 0.01, at: [x, y + 0.12, SHAFT / 2 + 0.004], color: WINDOW })
          }
        })
      }
    }),
  )
}

/** 時計の段：塔より少し太い箱と、四面の文字盤（金の四角い枠・濃い縁・乳白の盤・目盛りと針。数字は入れない） */
function clockStage(kit: Kit): void {
  const W = 0.68
  kit.at({ at: [TX, 0, TZ] }, () => {
    kit.part(() => {
      kit.box({ w: W, h: CLOCK1 - CLOCK0, d: W, at: [0, CLOCK0, 0], color: STONE })
      kit.box({ w: W + 0.04, h: 0.04, d: W + 0.04, at: [0, CLOCK0, 0], color: STONE_DARK })
      kit.box({ w: W + 0.04, h: 0.04, d: W + 0.04, at: [0, CLOCK1 - 0.04, 0], color: STONE_DARK })
      for (let f = 0; f < 4; f++) {
        kit.at({ rotY: f * 90 }, () => dial(kit, W / 2))
      }
      // 上の四隅の小さな尖塔
      for (const [sx, sz] of [
        [1, 1],
        [-1, 1],
        [-1, -1],
        [1, -1],
      ] as const) {
        kit.cylinder({ r: 0.035, h: 0.16, at: [(sx * W) / 2, CLOCK1, (sz * W) / 2], seg: 6, color: STONE })
        kit.cone({ r: 0.045, h: 0.14, at: [(sx * W) / 2, CLOCK1 + 0.16, (sz * W) / 2], seg: 6, color: GOLD, finish: 'gold' })
      }
    })
  })
}

/** 1つの面の文字盤。face は面の位置（この座標の +Z 側の壁の位置） */
function dial(kit: Kit, face: number): void {
  const r = 0.175
  // 金の四角い枠と、文字盤の上の小さな三角の飾り
  plate(kit, square(0.5), 0.016, [0, DIAL_Y - 0.25, face + 0.008], GOLD, 'gold')
  plate(kit, square(0.44), 0.01, [0, DIAL_Y - 0.22, face + 0.02], STONE_DARK)
  // 濃い縁と乳白の盤（円柱を前へ向けて寝かせる）
  kit.cylinder({ r: r + 0.018, h: 0.03, at: [0, DIAL_Y, face + 0.012], rot: [90, 0, 0], seg: 24, color: HAND })
  kit.cylinder({ r, h: 0.036, at: [0, DIAL_Y, face + 0.012], rot: [90, 0, 0], seg: 24, color: DIAL, finish: 'satin' })
  const zf = face + 0.05
  // 目盛り（12）と針（10時10分）
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    const big = k % 3 === 0
    const rr = r * 0.8
    kit.box({
      w: big ? 0.022 : 0.012,
      h: big ? 0.04 : 0.025,
      d: 0.006,
      at: [Math.sin(a) * rr, DIAL_Y + Math.cos(a) * rr - (big ? 0.02 : 0.0125), zf],
      rot: [0, 0, (-k * 360) / 12],
      color: HAND,
    })
  }
  kit.beam({ from: [0, DIAL_Y, zf], to: [-0.085, DIAL_Y + 0.05, zf], size: 0.008, width: 0.016, color: HAND })
  kit.beam({ from: [0, DIAL_Y, zf], to: [0.1, DIAL_Y + 0.085, zf], size: 0.008, width: 0.011, color: HAND })
  kit.cylinder({ r: 0.014, h: 0.008, at: [0, DIAL_Y, zf], rot: [90, 0, 0], seg: 8, color: GOLD, finish: 'gold' })
}

/** 鐘楼（細長いアーチの窓が3つ並ぶ）・文字盤の上の三角の破風・急な四角すいの尖塔と小窓・頂の飾り */
function belfryAndSpire(kit: Kit): void {
  const B = 0.54
  kit.at({ at: [TX, 0, TZ] }, () => {
    kit.part(() => {
      kit.box({ w: B, h: BELFRY1 - CLOCK1, d: B, at: [0, CLOCK1, 0], color: STONE })
      kit.box({ w: B + 0.05, h: 0.045, d: B + 0.05, at: [0, BELFRY1 - 0.045, 0], color: STONE_DARK })
      for (let f = 0; f < 4; f++) {
        kit.at({ rotY: f * 90 }, () => {
          // 文字盤の上の破風
          plate(kit, [[-0.3, 0], [0.3, 0], [0, 0.2]], 0.03, [0, CLOCK1, 0.33], STONE)
          for (const x of [-0.13, 0, 0.13]) plate(kit, gothicArch(0.075, 0.15, 0.24), 0.01, [x, CLOCK1 + 0.08, B / 2 + 0.004], WINDOW)
        })
      }
      // 鐘楼の四隅の小塔（金の先）
      for (const [sx, sz] of [
        [1, 1],
        [-1, 1],
        [-1, -1],
        [1, -1],
      ] as const) {
        kit.cylinder({ r: 0.04, h: BELFRY1 - CLOCK1 + 0.12, at: [(sx * B) / 2, CLOCK1, (sz * B) / 2], seg: 6, color: STONE })
        kit.cone({ r: 0.05, h: 0.2, at: [(sx * B) / 2, BELFRY1 + 0.12, (sz * B) / 2], seg: 6, color: SPIRE })
        kit.sphere({ r: 0.018, at: [(sx * B) / 2, BELFRY1 + 0.31, (sz * B) / 2], seg: 6, color: GOLD, finish: 'gold' })
      }
    })
    kit.part(() => {
      kit.pyramid({ w: B - 0.04, h: SPIRE1 - BELFRY1, at: [0, BELFRY1, 0], color: SPIRE, finish: 'satin' })
      // 尖塔の面の小窓（2段）
      for (let f = 0; f < 4; f++) {
        kit.at({ rotY: f * 90 }, () => {
          for (const [y, s] of [
            [0.2, 1],
            [0.5, 0.7],
          ] as const) {
            const inset = ((B - 0.04) / 2) * (1 - y / (SPIRE1 - BELFRY1))
            kit.box({ w: 0.08 * s, h: 0.11 * s, d: 0.06, at: [0, BELFRY1 + y, inset - 0.01], color: SPIRE })
            kit.gableRoof({ w: 0.06, d: 0.08 * s, h: 0.06 * s, overhang: 0.008, at: [0, BELFRY1 + y + 0.11 * s, inset - 0.01], rotY: 90, color: GOLD, finish: 'gold' })
          }
        })
      }
      // 頂の飾り（玉と十字）
      kit.cylinder({ r: 0.02, h: 0.14, at: [0, SPIRE1 - 0.02, 0], seg: 6, color: GOLD, finish: 'gold' })
      kit.sphere({ r: 0.03, at: [0, SPIRE1 + 0.1, 0], seg: 8, color: GOLD, finish: 'gold' })
      kit.box({ w: 0.012, h: 0.1, d: 0.012, at: [0, SPIRE1 + 0.15, 0], color: GOLD, finish: 'gold' })
      kit.box({ w: 0.06, h: 0.012, d: 0.012, at: [0, SPIRE1 + 0.21, 0], color: GOLD, finish: 'gold' })
    })
  })
}

// ===== 宮殿 =====

/** 川側の正面：縦の筋（控え壁）・窓の列・屋根の上の尖った飾りの列、パビリオンの角の小塔 */
function riverFacade(kit: Kit): void {
  const x = RF_X0 - 0.004
  const n = Math.round((RF_Z1 - RF_Z0) / 0.2)
  for (let i = 0; i <= n; i++) {
    const z = RF_Z0 + ((RF_Z1 - RF_Z0) * i) / n
    const pav = PAVILIONS.some((p) => Math.abs(p - z) < 0.26)
    const h = RF_H + (pav ? 0.28 : 0)
    const xf = pav ? x - 0.05 : x
    kit.box({ w: 0.03, h, d: 0.035, at: [xf, BANK, z], color: STONE })
    kit.cylinder({ r: 0.014, h: 0.1, at: [xf + 0.01, BANK + h, z], seg: 4, color: STONE })
    kit.cone({ r: 0.02, h: 0.07, at: [xf + 0.01, BANK + h + 0.1, z], seg: 4, color: STONE })
    if (i < n) {
      const zc = z + (RF_Z1 - RF_Z0) / n / 2
      const pavc = PAVILIONS.some((p) => Math.abs(p - zc) < 0.26)
      const rows = pavc ? 4 : 3
      for (let r = 0; r < rows; r++) {
        kit.box({ w: 0.01, h: 0.13, d: 0.08, at: [(pavc ? x - 0.05 : x) - 0.004, BANK + 0.16 + r * 0.25, zc], color: WINDOW })
      }
    }
  }
  // 北の端（時計塔の側）の妻の窓
  for (const y of [0.16, 0.41, 0.66]) {
    for (const xx of [-1.55, -1.36, -1.17]) kit.box({ w: 0.08, h: 0.13, d: 0.01, at: [xx, BANK + y, RF_Z1 + 0.004], color: WINDOW })
  }
}

/** ヴィクトリア・タワーの頂：四隅の八角の小塔と小さな尖り屋根・胸壁・旗竿、面の縦長の窓 */
function victoriaTop(kit: Kit): void {
  kit.at({ at: [VX, 0, VZ] }, () =>
    kit.part(() => {
      kit.box({ w: VW + 0.04, h: 0.06, d: VW + 0.04, at: [0, VTOP, 0], color: STONE_DARK })
      for (const [sx, sz] of [
        [1, 1],
        [-1, 1],
        [-1, -1],
        [1, -1],
      ] as const) {
        kit.cylinder({ r: 0.075, h: VTOP - BANK + 0.22, at: [(sx * VW) / 2, BANK, (sz * VW) / 2], seg: 8, color: STONE })
        kit.cone({ r: 0.085, h: 0.16, at: [(sx * VW) / 2, VTOP + 0.22, (sz * VW) / 2], seg: 8, color: GOLD, finish: 'gold' })
      }
      kit.cylinder({ r: 0.01, h: 0.42, at: [0, VTOP + 0.06, 0], seg: 6, color: '#E8E4DA' })
      for (let f = 0; f < 4; f++) {
        kit.at({ rotY: f * 90 }, () => {
          for (const x of [-0.13, 0.13]) {
            for (const y of [1.2, 1.65]) plate(kit, gothicArch(0.08, 0.26, 0.34), 0.01, [x, BANK + y, VW / 2 + 0.004], WINDOW)
          }
          kit.box({ w: VW + 0.02, h: 0.05, d: 0.02, at: [0, VTOP + 0.06, VW / 2], color: STONE })
        })
      }
      // 正面の入口の大きなアーチ
      plate(kit, gothicArch(0.3, 0.28, 0.46), 0.012, [0, BANK, VW / 2 + 0.004], WINDOW)
    }),
  )
}

// ===== 橋と街 =====

/** 緑に塗ったウェストミンスター橋（低いアーチ3つ・石の橋脚・緑の欄干） */
function westminsterBridge(kit: Kit): void {
  const x0 = NEAR_BANK + 0.02
  const x1 = -3.6
  const deck = 0.24
  kit.part(() => {
    kit.box({ w: x0 - x1, h: 0.05, d: 0.5, at: [(x0 + x1) / 2, deck, BRIDGE_Z], color: '#8C918C' })
    kit.box({ w: x0 - x1, h: 0.012, d: 0.3, at: [(x0 + x1) / 2, deck + 0.05, BRIDGE_Z], color: ROAD })
    for (const s of [-1, 1]) {
      kit.box({ w: x0 - x1, h: 0.05, d: 0.025, at: [(x0 + x1) / 2, deck + 0.05, BRIDGE_Z + s * 0.24], color: BRIDGE_GREEN })
      kit.box({ w: x0 - x1, h: 0.03, d: 0.03, at: [(x0 + x1) / 2, deck - 0.03, BRIDGE_Z + s * 0.25], color: BRIDGE_GREEN })
    }
    // 橋脚とアーチ
    const piers = [-2.4, -3.0]
    for (const px of piers) {
      kit.box({ w: 0.14, h: deck, d: 0.56, at: [px, 0, BRIDGE_Z], color: QUAY })
      for (const s of [-1, 1]) kit.cylinder({ r: 0.07, h: deck, at: [px, 0, BRIDGE_Z + s * 0.28], seg: 8, color: QUAY })
    }
    const spans: [number, number][] = [
      [x0, -2.33],
      [-2.47, -2.93],
      [-3.07, x1],
    ]
    for (const [a, b] of spans) {
      const w = a - b
      for (const s of [-1, 1]) {
        plate(kit, flatArch(w, deck - 0.05, 0.08), 0.03, [(a + b) / 2, 0.05, BRIDGE_Z + s * 0.235], BRIDGE_GREEN)
      }
    }
  })
}

/** ロンドンの建物（石か煉瓦の壁・縦横に並ぶ窓・灰色の屋根・煙突）。at は陸の上。tower-bridge.ts と同じ作り */
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

// ===== 形の下ごしらえ =====

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
function plate(kit: Kit, points: readonly XZ[], depth: number, at: Vec3, color: string, finish?: 'gold' | 'satin'): void {
  kit.at({ at }, () => kit.extrude({ points, h: depth, rot: [-90, 0, 0], at: [0, 0, depth / 2], color, finish }))
}

/** 下の辺の中央を原点にした正方形（一辺 s） */
function square(s: number): XZ[] {
  return [
    [-s / 2, 0],
    [s / 2, 0],
    [s / 2, s],
    [-s / 2, s],
  ]
}

/** とがったゴシックのアーチ（幅 w・立ち上がり s・頂 top）を塗りつぶした形 */
function gothicArch(w: number, s: number, top: number): XZ[] {
  const pts: XZ[] = [[w / 2, 0]]
  const n = 5
  for (let i = 0; i <= n; i++) {
    const t = i / n
    pts.push([(w / 2) * (1 - t) ** 1.4, s + (top - s) * Math.sin((t * Math.PI) / 2)])
  }
  for (let i = n - 1; i >= 0; i--) {
    const t = i / n
    pts.push([(-w / 2) * (1 - t) ** 1.4, s + (top - s) * Math.sin((t * Math.PI) / 2)])
  }
  pts.push([-w / 2, 0])
  return pts
}

/** 橋の横の板：下が浅い弧に抜けた帯（幅 w・高さ h・弧の上の残りの厚み t） */
function flatArch(w: number, h: number, t: number): XZ[] {
  const pts: XZ[] = [
    [-w / 2, 0],
    [-w / 2, h],
    [w / 2, h],
    [w / 2, 0],
  ]
  const n = 10
  const rise = h - t
  for (let i = 0; i <= n; i++) {
    const u = 1 - (2 * i) / n
    pts.push([(u * w) / 2, rise * (1 - u * u)])
  }
  return pts
}
