// 清水寺：山の斜面に建つ本堂。檜皮葺きの大きな寄棟の屋根と左右の翼廊、前へ張り出した舞台を、長い柱と貫の格子が下から支える（懸造）。
// 正面（+Z）が谷＝舞台の側。左に朱の仁王門と三重塔、右の谷に京の町家。林は紅葉。
// 白いうちは「斜面に建つ大屋根と、前に張り出す床」まで（長谷寺と迷う）で、段階3の柱と貫の密な格子、色塗りの檜皮と朱、紅葉で決まる。
import { COLORS, type Kit, type Vec3, type XZ } from './kit'

const BARK = '#6B4A35' // 檜皮の屋根
const WOOD = '#8C6A48' // 柱の木肌
const FLOOR = '#B08A5E' // 舞台の床
const WALL = '#9C7650'
// 講評r1：門と三重塔の朱が弱かった → ほかの名所と同じ明るい朱にする（#C8442F→COLORS.vermilion #D8452C）。
// あわせて塔と門の屋根の出を短くし、軒下に朱の組物の帯を足して、朱の見える面積を広げた
const SHU = COLORS.vermilion
const HILL = '#5E7F45'
const STONE = '#A39C91'

/** 山（楕円の台地）。中心・横の伸び・断面 [半径, 高さ] */
const HX = 0
const HZ = -2.55
const SX = 1.4
const PROFILE: readonly XZ[] = [
  [0, 1.3],
  [0.7, 1.28],
  [1.1, 1.2],
  [1.45, 1.1],
  [1.7, 0.98],
  [1.95, 0.62],
  [2.15, 0.26],
  [2.3, 0.05],
  [2.36, 0],
]

/** 本堂と舞台の床の高さ */
const FLOOR_Y = 1.08
const HALL_Z = -1.6
const HALL_W = 2.4
const HALL_D = 1.4
const STAGE_FRONT = -0.1
const STAGE_HALF = 0.78
const WING_X = 1.0

/** (x, z) での山の高さ */
function hillAt(x: number, z: number): number {
  const d = Math.hypot((x - HX) / SX, z - HZ)
  for (let i = 1; i < PROFILE.length; i++) {
    const [r1, y1] = PROFILE[i] as XZ
    const [r0, y0] = PROFILE[i - 1] as XZ
    if (d <= r1) return y0 + ((y1 - y0) * (d - r0)) / (r1 - r0)
  }
  return 0
}

export function build(kit: Kit): void {
  kit.ground(COLORS.grass)

  // ---- 段階1：山の斜面・谷の道と、本堂の塊（白） ----
  kit.stage(1)
  kit.order(-1)
  kit.appear('grow')
  // 山（下から上へ点を並べ、底のふたの向きが斜面の陰に混ざらないよう角の点を2つ置く）
  const pts: XZ[] = [[0, 0], [2.36, 0], ...[...PROFILE].reverse()]
  kit.lathe({ points: pts, seg: 40, at: [HX, 0, HZ], scale: [SX, 1, 1], color: HILL })
  kit.appear('drop')
  // 本堂の床下の土台と、本堂の壁（山のすぐ次に出す）
  kit.order(0)
  kit.part(() => {
    kit.box({ w: HALL_W, h: FLOOR_Y - 0.8, d: HALL_D, at: [0, 0.8, HALL_Z], color: STONE })
    kit.box({ w: HALL_W, h: 0.32, d: HALL_D, at: [0, FLOOR_Y, HALL_Z], color: WALL })
  })
  kit.order(1)
  kit.mound({ r: 1.0, rx: 1.1, rz: 0.9, h: 0.45, at: [-3.2, 0, -1.6], color: HILL })
  // 参道（谷の手前から仁王門へ）
  path(kit, [
    [0.2, 4.4],
    [-0.6, 3.2],
    [-1.5, 2.0],
    [-2.2, 1.0],
    [-2.55, 0.35],
  ])
  kit.order(0)

  // ---- 段階2：形の特徴＝大きな寄棟の屋根と翼廊の屋根、前に張り出す舞台の床、三重塔（白） ----
  kit.stage(2)
  kit.order(-1) // 大屋根を先に
  kit.curvedRoof({ w: HALL_W, d: HALL_D, h: 0.72, at: [0, FLOOR_Y + 0.32, HALL_Z], style: 'yosemune', overhang: 0.3, upturn: 0.1, curve: 1.5, color: BARK })
  kit.order(0)
  for (const sx of [-1, 1]) {
    kit.part(() => {
      kit.box({ w: 0.46, h: 0.28, d: 0.52, at: [sx * WING_X, FLOOR_Y, -0.64], color: WALL })
      kit.box({ w: 0.5, h: 0.05, d: 0.56, at: [sx * WING_X, FLOOR_Y - 0.05, -0.64], color: FLOOR })
      kit.curvedRoof({ w: 0.62, d: 0.46, h: 0.36, at: [sx * WING_X, FLOOR_Y + 0.28, -0.6], rotY: 90, style: 'irimoya', overhang: 0.14, upturn: 0.07, color: BARK, gableColor: WOOD })
    })
  }
  // 舞台の床と、前の角の柱だけ（格子は段階3）
  kit.part(() => {
    kit.box({ w: STAGE_HALF * 2, h: 0.05, d: STAGE_FRONT + 0.9, at: [0, FLOOR_Y - 0.05, (-0.9 + STAGE_FRONT) / 2], color: FLOOR })
    for (const x of [-0.7, 0.7]) kit.cylinder({ r: 0.03, h: FLOOR_Y - 0.05, at: [x, 0, STAGE_FRONT - 0.05], seg: 8, color: WOOD })
  })
  threeStoryPagoda(kit, [-2.45, 0, -1.55], 'body')

  // ---- 段階3：決め手の細部（白）＝舞台を支える柱と貫の密な格子、舞台の高欄、塔の相輪、仁王門 ----
  kit.stage(3)
  lattice(kit)
  kit.part(() => {
    const y = FLOOR_Y
    const rail = (from: Vec3, to: Vec3) => kit.beam({ from, to, size: 0.02, color: WOOD })
    rail([-STAGE_HALF, y + 0.08, -0.62], [-STAGE_HALF, y + 0.08, STAGE_FRONT])
    rail([-STAGE_HALF, y + 0.08, STAGE_FRONT], [STAGE_HALF, y + 0.08, STAGE_FRONT])
    rail([STAGE_HALF, y + 0.08, STAGE_FRONT], [STAGE_HALF, y + 0.08, -0.62])
    for (let i = 0; i <= 8; i++) {
      const x = -STAGE_HALF + (STAGE_HALF * 2 * i) / 8
      kit.box({ w: 0.018, h: 0.08, d: 0.018, at: [x, y, STAGE_FRONT], color: WOOD })
    }
    for (const sx of [-1, 1]) {
      for (let k = 0; k <= 3; k++) kit.box({ w: 0.018, h: 0.08, d: 0.018, at: [sx * STAGE_HALF, y, STAGE_FRONT - k * 0.17], color: WOOD })
    }
  })
  threeStoryPagoda(kit, [-2.45, 0, -1.55], 'finial')
  niomon(kit, [-2.75, 0, 0.15])

  // ---- 段階4：周りの景色（色つき）＝紅葉の林・谷の町家・音羽の滝・人 ----
  kit.stage(4)
  // 山の林（紅葉が多め）
  kit.scatter(
    {
      count: 52,
      rMin: 0.6,
      rMax: 4.7,
      gap: 0.33,
      ok: (x, z) => {
        const onHill = hillAt(x, z) > 0.08 || Math.hypot(x + 3.2, z + 1.6) < 0.9
        const nearHall = Math.abs(x) < HALL_W / 2 + 0.35 && z > HALL_Z - HALL_D / 2 - 0.4
        const nearPagoda = Math.hypot(x + 2.45, z + 1.55) < 0.5
        return onHill && !nearHall && !nearPagoda
      },
    },
    (_i, x, z) => {
      const kind = kit.pick(['round', 'round', 'round', 'cone'] as const)
      const color = kind === 'cone' ? '#355E3B' : kit.pick(['#C8432B', '#D9652A', '#E39A32', '#B83A2A', '#4C7D45', '#5C8A48', '#D9652A'])
      kit.tree({ kind, h: kit.range(0.42, 0.62), at: [x, Math.max(0, Math.max(hillAt(x, z), kit.groundAt(x, z)) - 0.05), z], color })
    },
  )
  // 谷の木（舞台の下の手前と、参道の両わき）
  for (const [x, z] of [
    [-1.2, 0.4],
    [1.35, 0.25],
    [0.6, 0.85],
    [-0.5, 1.0],
    [2.0, -0.2],
    [-1.05, 2.6],
    [-0.15, 2.45],
    [-1.95, 1.75],
    [-2.9, 1.2],
    [-0.35, 3.75],
    [0.7, 3.6],
    // 講評r1：この木が仁王門の朱を正面から隠していた → 左へずらす（-3.3, 0.6 → -3.75, 0.25）
    [-3.75, 0.25],
    [0.3, 1.8],
    [-1.6, 3.2],
  ] as const) {
    kit.tree({ kind: kit.pick(['round', 'round', 'sakura'] as const), h: kit.range(0.42, 0.6), at: [x, 0, z], color: kit.pick(['#C8432B', '#E39A32', '#4C7D45', '#D9652A', '#5C8A48']) })
  }
  townHouses(kit)
  otowaFalls(kit)
  // 舞台の上の人
  kit.scatter({ count: 10, rMin: 0, rMax: 1.2, gap: 0.16, ok: (x, z) => Math.abs(x) < STAGE_HALF - 0.08 && z < STAGE_FRONT - 0.08 && z > -0.85 }, (_i, x, z) =>
    kit.person({ at: [x, FLOOR_Y, z], rotY: kit.range(140, 220) }),
  )
  // 参道と仁王門の前の人
  for (const [x, z] of [
    [-0.45, 3.0],
    [-0.75, 2.7],
    [-1.4, 1.95],
    [-1.75, 1.6],
    [-2.25, 0.95],
    [-2.5, 0.6],
    [0.0, 3.85],
  ] as const) {
    kit.person({ at: [x, 0.02, z], rotY: kit.range(0, 360) })
  }
}

/** 地面に置く細い道（点を順につなぐ） */
function path(kit: Kit, pts: readonly XZ[]): void {
  kit.part(() => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i] as XZ
      const b = pts[i + 1] as XZ
      const dx = b[0] - a[0]
      const dz = b[1] - a[1]
      const len = Math.hypot(dx, dz)
      kit.box({ w: 0.36, h: 0.02, d: len + 0.18, at: [(a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2], rotY: (Math.atan2(dx, dz) * 180) / Math.PI, color: '#C9B99A' })
    }
  })
}

/** 舞台と翼廊を支える柱と、柱をつなぐ貫の格子。柱は斜面から床の下まで。実物（139本）に近い密度に見えるよう細かく並べる */
function lattice(kit: Kit): void {
  const under = FLOOR_Y - 0.05
  const cols: { x: number; z: number; ground: number; row: number; col: number }[] = []
  const stageZ = [-0.12, -0.32, -0.52, -0.72]
  const stageX = [-0.7, -0.4667, -0.2333, 0, 0.2333, 0.4667, 0.7]
  stageZ.forEach((z, row) => stageX.forEach((x, col) => cols.push({ x, z, ground: hillAt(x, z), row, col })))
  const wingZ = [-0.42, -0.62, -0.82]
  const wingX = [-1.2, -0.95, 0.95, 1.2]
  wingZ.forEach((z, row) => wingX.forEach((x, col) => cols.push({ x, z, ground: hillAt(x, z), row: 10 + row, col: 10 + col })))
  const live = cols.filter((c) => c.ground < under - 0.06)
  kit.part(() => {
    for (const c of live) kit.cylinder({ r: 0.026, h: under - c.ground + 0.03, at: [c.x, c.ground - 0.03, c.z], seg: 8, color: WOOD })
  })
  // 貫：同じ列・同じ段の隣どうしを、4つの高さでつなぐ（地面より上のところだけ）
  for (const levels of [[0.22, 0.44], [0.66, 0.88]] as const) {
    kit.part(() => {
      for (const y of levels) {
        for (const a of live) {
          for (const b of live) {
            const sameRow = a.row === b.row && b.col === a.col + 1 && Math.abs(b.x - a.x) < 0.4
            const sameCol = a.col === b.col && b.row === a.row + 1
            if (!sameRow && !sameCol) continue
            if (a.ground > y - 0.04 || b.ground > y - 0.04) continue
            kit.beam({ from: [a.x, y, a.z], to: [b.x, y, b.z], size: 0.024, color: WOOD })
          }
        }
      }
    })
  }
}

/** 三重塔（朱）。part='body' は塔の本体と台、'finial' はてっぺんの相輪 */
function threeStoryPagoda(kit: Kit, at: Vec3, part: 'body' | 'finial'): void {
  const ground = hillAt(at[0], at[2])
  const tiers = [0.4, 0.34, 0.28]
  // 講評r1：朱の壁が屋根に隠れて細い筋にしか見えなかった → 各層を高く（0.17→0.2）、屋根の出を短く（0.14→0.1・0.15→0.11）
  const th = 0.2
  const rh = 0.07
  /** 軒下の組物（朱の帯）の高さ */
  const bracket = 0.035
  let y = ground + 0.04
  const tops: number[] = []
  for (let i = 0; i < tiers.length; i++) {
    tops.push(y)
    y += th + (i < tiers.length - 1 ? rh : 0.14)
  }
  if (part === 'finial') {
    kit.part(() => {
      kit.cylinder({ r: 0.014, h: 0.36, at: [at[0], y - 0.02, at[2]], seg: 6, color: '#B89A55', finish: 'gold' })
      for (let k = 0; k < 6; k++) kit.cylinder({ r: 0.034, h: 0.012, at: [at[0], y + 0.05 + k * 0.04, at[2]], seg: 8, color: '#B89A55', finish: 'gold' })
    })
    return
  }
  kit.part(() => {
    // 斜面に据えた台。講評r1：灰色の台が斜面の下側で高い壁になり、宙に浮いて見えた
    // → 斜面より下は山と同じ緑の土台にして、上の 0.06 だけを石の台にする
    kit.box({ w: 0.5, h: ground - 0.02, d: 0.5, at: [at[0], 0, at[2]], color: HILL })
    kit.box({ w: 0.5, h: 0.06, d: 0.5, at: [at[0], ground - 0.02, at[2]], color: STONE })
    tiers.forEach((w, i) => {
      const yy = tops[i] ?? 0
      kit.box({ w, h: th, d: w, at: [at[0], yy, at[2]], color: SHU })
      // 軒下の朱の組物：壁より少し外へ張り出す帯。屋根の厚み（0.035）の中に隠れないよう、その下に置く
      kit.box({ w: w + 0.05, h: bracket, d: w + 0.05, at: [at[0], yy + th - 0.035 - bracket, at[2]], color: SHU })
      const next = tiers[i + 1]
      if (next) kit.curvedRoof({ w, d: w, h: rh, at: [at[0], yy + th, at[2]], style: 'skirt', top: { w: next, d: next }, overhang: 0.1, upturn: 0.05, thick: 0.035, color: BARK })
      else kit.curvedRoof({ w, d: w, h: 0.14, at: [at[0], yy + th, at[2]], style: 'hogyo', overhang: 0.11, upturn: 0.05, thick: 0.035, color: BARK })
    })
  })
}

/** 仁王門（朱の楼門） */
function niomon(kit: Kit, at: Vec3): void {
  // 講評r1：朱が屋根に隠れていた → 上の層を高く（0.18→0.22）、屋根の出を短く（0.12→0.08・0.13→0.09）、
  // 通り抜けの左右に朱の柱、上下の軒下（屋根の厚みの下）に朱の組物の帯を足す
  kit.at({ at, rotY: 28 }, () =>
    kit.part(() => {
      kit.box({ w: 0.8, h: 0.04, d: 0.42, color: STONE })
      for (const sx of [-1, 1]) kit.box({ w: 0.24, h: 0.32, d: 0.3, at: [sx * 0.26, 0.04, 0], color: SHU })
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.cylinder({ r: 0.022, h: 0.32, at: [sx * 0.11, 0.04, sz * 0.12], seg: 8, color: SHU })
      kit.box({ w: 0.76, h: 0.06, d: 0.34, at: [0, 0.36, 0], color: SHU })
      kit.box({ w: 0.8, h: 0.03, d: 0.38, at: [0, 0.36, 0], color: SHU })
      kit.curvedRoof({ w: 0.76, d: 0.34, h: 0.08, at: [0, 0.42, 0], style: 'skirt', top: { w: 0.6, d: 0.26 }, overhang: 0.08, upturn: 0.04, thick: 0.03, color: BARK })
      kit.box({ w: 0.6, h: 0.22, d: 0.26, at: [0, 0.5, 0], color: SHU })
      kit.box({ w: 0.64, h: 0.03, d: 0.3, at: [0, 0.64, 0], color: SHU })
      kit.curvedRoof({ w: 0.6, d: 0.26, h: 0.2, at: [0, 0.72, 0], style: 'irimoya', overhang: 0.09, upturn: 0.05, color: BARK, gableColor: SHU })
    }),
  )
}

/** 谷の町家（灰色の瓦の低い家） */
function townHouses(kit: Kit): void {
  const houses: readonly (readonly [number, number, number])[] = [
    [1.5, 1.2, 10],
    [2.15, 1.0, -5],
    [2.8, 0.75, 20],
    [1.7, 1.85, 0],
    [2.45, 1.7, 15],
    [3.1, 1.45, -10],
    [1.0, 2.5, 5],
    [1.75, 2.6, -15],
    [2.5, 2.4, 10],
    [3.25, 2.2, 0],
    [1.3, 3.25, -5],
    [2.1, 3.25, 10],
  ]
  for (const [x, z, rot] of houses) {
    kit.at({ at: [x, 0, z], rotY: rot }, () =>
      kit.part(() => {
        kit.box({ w: 0.4, h: 0.17, d: 0.3, color: kit.pick(['#E9E0CD', '#DCCFB6', '#5E4634']) })
        kit.gableRoof({ w: 0.4, d: 0.3, h: 0.1, at: [0, 0.17, 0], overhang: 0.04, color: '#5A5E66' })
      }),
    )
  }
}

/** 音羽の滝（舞台の右下）：屋根と、細い3筋の水、池 */
function otowaFalls(kit: Kit): void {
  const x = 1.65
  const z = -0.2
  kit.part(() => {
    kit.water({ r: 0.22, at: [x, 0, z + 0.2], color: '#4F86A8' })
    for (const dx of [-0.08, 0, 0.08]) kit.cylinder({ r: 0.008, h: 0.32, at: [x + dx, 0, z], seg: 6, color: '#BFE0F0', finish: 'water' })
    kit.box({ w: 0.36, h: 0.05, d: 0.14, at: [x, 0.32, z - 0.03], color: STONE })
    kit.gableRoof({ w: 0.42, d: 0.22, h: 0.09, at: [x, 0.42, z + 0.05], overhang: 0.04, color: BARK })
    for (const dx of [-0.18, 0.18]) kit.box({ w: 0.025, h: 0.42, d: 0.025, at: [x + dx, 0, z + 0.14], color: WOOD })
  })
  for (const dx of [-0.12, 0.05, 0.18]) kit.person({ at: [x + dx, 0, z + 0.48], rotY: 180 })
}
