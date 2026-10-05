// タージ・マハル：赤砂岩の川岸の段の上に白大理石の基壇、角を落とした四角い墓廟、玉ねぎ形の大きなドーム、四隅の細い尖塔4本。
// 正面（+Z）が南＝庭園の側。手前へ一直線に伸びる水路と糸杉の並木、奥（-Z）はヤムナー川、左右に赤砂岩のモスクと迎賓館。
// 白いうちは「基壇の上の四角い建物」→「大きなアーチと丸い胴、4本の塔の根もと」まで（サン・ピエトロ大聖堂などと迷う）。
// 段階3の玉ねぎ形の先・金の頂飾り・屋上の小塔・尖塔の上半分で決まり、色塗りの白大理石と水路、段階4の糸杉と赤砂岩の建物でほぼ全員が当たる。
import { type Finish, type Kit, type Vec3, type XZ } from './kit'

const MARBLE = '#F3F0EA'
const SHADE = '#D8D0C2' // アーチの奥のくぼみ（白大理石の陰）
const TRIM = '#C9BFAE' // 縁取りの帯
const SANDSTONE = '#A0522D'
const SANDSTONE_TOP = '#B86A4C'
const TERRACE = '#C99C82' // 川岸の段（淡い赤砂岩）
const WATER = '#4F86A8'
const RIVER = '#5D8DA3'
const WALK = '#D7BFA0' // 庭の歩道
const GOLD = '#C9A14A'
const CYPRESS = '#2F5A3A'
const DOOR = '#6B5A4A'

/** 基壇（白大理石）の中心と大きさ。奥の川岸の赤砂岩の段の上に載る */
const PZ = -1.55
const TERRACE_H = 0.08
const PLINTH_HALF = 1.8
const PLINTH_TOP = TERRACE_H + 0.26
/** 墓廟：角を落とした正方形（半幅と角の落とし幅）と壁の上端 */
const HALF = 1.1
const CH = 0.36
const ROOF = PLINTH_TOP + 0.98
/** ドームの胴（円筒）とドーム */
const DRUM_R = 0.43
const DRUM_TOP = ROOF + 0.45
const DOME_H = 1.02
/** ドームを段階2と3に分ける高さ（ドームの高さの割合。いちばんふくらむ所） */
const DOME_SPLIT = 0.28
/** 尖塔の中心（基壇の四隅の少し内側） */
const MINARET = 1.6

/** 玉ねぎ形のドームの輪郭 [ドームの高さの割合, 半径]。胴よりふくらんでから、細くとがる */
const ONION: readonly (readonly [number, number])[] = [
  [0, DRUM_R],
  [0.06, 0.48],
  [0.14, 0.512],
  [0.22, 0.528],
  [0.28, 0.53],
  [0.36, 0.52],
  [0.45, 0.49],
  [0.55, 0.43],
  [0.65, 0.345],
  [0.75, 0.245],
  [0.84, 0.15],
  [0.91, 0.075],
  [0.96, 0.035],
  [1, 0.02],
]

export function build(kit: Kit): void {
  kit.ground('#6E9D4E')

  // ---- 段階1：川・川岸の段・庭の水路と歩道・基壇・墓廟の塊とドームの胴・尖塔の根もと（白） ----
  kit.stage(1)
  kit.order(-1)
  kit.part(
    () => {
      kit.water({ points: backSegment(-3.62, 4.9), color: RIVER })
      // 川岸の赤砂岩の段（モスク・基壇・迎賓館が載る）
      kit.extrude({ points: band(-3.6, 0.42, 4.86), h: TERRACE_H, color: TERRACE })
      // 庭：まん中の長い水路と十字の水路（両側に歩道）
      kit.box({ w: 0.7, h: 0.02, d: 4.1, at: [0, 0, 2.5], color: WALK })
      kit.box({ w: 6.4, h: 0.02, d: 0.62, at: [0, 0, 2.45], color: WALK })
      kit.water({ points: rect(0, 2.5, 0.26, 4.0), h: 0.034, color: WATER })
      kit.water({ points: rect(0, 2.45, 6.1, 0.24), h: 0.034, color: WATER })
    },
    { appear: 'grow' },
  )
  kit.order(0)
  // 白大理石の基壇と前の階段
  kit.part(() => {
    kit.box({ w: PLINTH_HALF * 2, h: PLINTH_TOP - TERRACE_H, d: PLINTH_HALF * 2, at: [0, TERRACE_H, PZ], color: MARBLE })
    kit.stairs({ w: 0.9, d: 0.22, h: PLINTH_TOP - TERRACE_H, steps: 4, at: [0, TERRACE_H, PZ + PLINTH_HALF + 0.11], color: MARBLE })
  })
  // 墓廟の角を落とした四角い塊と、ドームの胴
  kit.extrude({ points: octagon(HALF, CH), h: ROOF - PLINTH_TOP, at: [0, PLINTH_TOP, PZ], color: MARBLE })
  kit.part(() => {
    kit.extrude({ points: octagon(HALF + 0.03, CH + 0.012), h: 0.05, at: [0, ROOF - 0.05, PZ], color: TRIM })
    kit.cylinder({ r: DRUM_R + 0.04, h: 0.05, at: [0, ROOF, PZ], seg: 24, color: MARBLE })
    kit.cylinder({ r: DRUM_R, h: DRUM_TOP - ROOF, at: [0, ROOF, PZ], seg: 24, color: MARBLE })
    kit.cylinder({ r: DRUM_R + 0.025, h: 0.035, at: [0, DRUM_TOP - 0.05, PZ], seg: 24, color: TRIM })
  })
  for (const [sx, sz] of CORNERS) minaretBase(kit, sx * MINARET, PZ + sz * MINARET)

  // ---- 段階2：形の特徴＝丸いドームの下半分・四面の大きなアーチの枠・尖塔の中ほど（白） ----
  kit.stage(2)
  kit.order(-1)
  domeBand(kit, 0, DOME_SPLIT)
  kit.order(0)
  for (const face of [0, 1, 2, 3] as const) pishtaq(kit, face)
  for (const [sx, sz] of CORNERS) minaretMiddle(kit, sx * MINARET, PZ + sz * MINARET)

  // ---- 段階3：決め手の細部（白）＝玉ねぎ形の先と金の頂飾り・屋上の4つの小塔・尖塔の上半分・アーチのくぼみ ----
  kit.stage(3)
  domeBand(kit, DOME_SPLIT, 1)
  finial(kit, [0, DRUM_TOP + DOME_H - 0.01, PZ])
  for (const [sx, sz] of CORNERS) chattri(kit, [sx * 0.74, ROOF, PZ + sz * 0.74], 0.16, 0.2)
  for (const [sx, sz] of CORNERS) minaretTop(kit, sx * MINARET, PZ + sz * MINARET)
  kit.part(() => {
    for (const face of [0, 1, 2, 3] as const) sideNiches(kit, face)
    pinnacles(kit)
    plinthArcade(kit)
  })
  // 中央の高い池（大理石のふちと水面）
  kit.part(() => {
    kit.box({ w: 0.86, h: 0.07, d: 0.86, at: [0, 0, 2.45], color: MARBLE })
    kit.box({ w: 0.62, h: 0.012, d: 0.62, at: [0, 0.07, 2.45], color: WATER, finish: 'water' })
  })

  // ---- 段階4：周りの景色（色つき）＝赤砂岩のモスクと迎賓館・糸杉の並木・庭の木・人・川の舟 ----
  kit.stage(4)
  sideHall(kit, -1)
  sideHall(kit, 1)
  // 水路の両側の糸杉の並木
  for (const x of [-0.5, 0.5]) {
    for (let k = 0; k < 13; k++) {
      const z = 0.78 + k * 0.3
      if (z > 1.95 && z < 2.95) continue
      kit.tree({ kind: 'cone', h: kit.range(0.5, 0.58), at: [x, 0, z], scale: [0.55, 1, 0.55], color: CYPRESS })
    }
  }
  // 十字の水路の両側の糸杉
  for (const x of [-3.0, -2.4, -1.8, -1.2, 1.2, 1.8, 2.4, 3.0]) {
    for (const z of [2.0, 2.9]) kit.tree({ kind: 'cone', h: kit.range(0.44, 0.52), at: [x, 0, z], scale: [0.55, 1, 0.55], color: CYPRESS })
  }
  // 庭の四つの区画の木
  kit.scatter(
    { count: 16, rMin: 1.0, rMax: 4.55, gap: 0.5, ok: (x, z) => z > 0.75 && Math.abs(x) > 0.9 && Math.abs(z - 2.45) > 0.62 && Math.abs(x) < 3.7 },
    (_i, x, z) => kit.tree({ kind: 'round', h: kit.range(0.36, 0.48), at: [x, 0, z], color: kit.pick(['#4F8A45', '#5C9A4C', '#47803F']) }),
  )
  // 水路ぞいと基壇の前の人
  for (const [x, z] of [
    [-0.24, 0.62],
    [0.26, 0.7],
    [0.1, 0.55],
    [-0.27, 1.6],
    [0.27, 1.75],
    [-0.25, 3.3],
    [0.26, 3.6],
    [0.28, 3.15],
    [-0.4, 2.15],
    [0.42, 2.78],
    [-0.6, 0.48],
    [0.75, 0.52],
    [-1.4, 2.3],
    [1.6, 2.6],
  ] as const) {
    kit.person({ at: [x, 0.02, z], rotY: kit.range(140, 220), color: kit.pick(['#C8453B', '#E2A93B', '#D9738F', '#3D5BA9', '#F2F0EA', '#3F8C6B']) })
  }
  for (const [x, z] of [
    [-0.5, PZ + PLINTH_HALF - 0.12],
    [0.6, PZ + PLINTH_HALF - 0.1],
    [-1.3, PZ + 1.3],
    [1.35, PZ + 1.45],
  ] as const) {
    kit.person({ at: [x, PLINTH_TOP, z], rotY: kit.range(0, 360) })
  }
  // 川の小舟
  kit.boat({ kind: 'row', at: [-1.6, 0.03, -4.25], rotY: 80, len: 0.42, color: '#8A5A3A' })
  kit.boat({ kind: 'row', at: [1.9, 0.03, -4.1], rotY: -100, len: 0.38, color: '#C9A877' })
}

const CORNERS: readonly XZ[] = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
]

/** 角を落とした正方形（上から見た輪郭） */
function octagon(half: number, ch: number): XZ[] {
  const a = half - ch
  return [
    [a, half],
    [-a, half],
    [-half, a],
    [-half, -a],
    [-a, -half],
    [a, -half],
    [half, -a],
    [half, a],
  ]
}

function rect(x: number, z: number, w: number, d: number): XZ[] {
  return [
    [x - w / 2, z - d / 2],
    [x + w / 2, z - d / 2],
    [x + w / 2, z + d / 2],
    [x - w / 2, z + d / 2],
  ]
}

/** 台座の円（半径 r）のうち z0〜z1 の横長の帯 */
function band(z0: number, z1: number, r: number): XZ[] {
  const pts: XZ[] = []
  const n = 10
  const half = (z: number) => Math.sqrt(Math.max(0, r * r - z * z))
  for (let i = 0; i <= n; i++) {
    const z = z0 + ((z1 - z0) * i) / n
    pts.push([half(z), z])
  }
  for (let i = n; i >= 0; i--) {
    const z = z0 + ((z1 - z0) * i) / n
    pts.push([-half(z), z])
  }
  return pts
}

/** 台座の円（半径 r）のうち z が zEdge より奥の部分 */
function backSegment(zEdge: number, r: number): XZ[] {
  const a0 = Math.acos(-zEdge / r)
  const pts: XZ[] = []
  const n = 18
  for (let i = 0; i <= n; i++) {
    const a = -a0 + ((2 * a0) * i) / n
    pts.push([Math.sin(a) * r, -Math.cos(a) * r])
  }
  return pts
}

/** 正面から見た輪郭 points（[x, y]）を、奥行き depth の板にする。板は at を中心に Z の前後へ半分ずつ */
function plate(kit: Kit, points: readonly XZ[], depth: number, at: Vec3, color: string, finish?: Finish): void {
  kit.at({ at }, () => kit.extrude({ points, h: depth, rot: [-90, 0, 0], at: [0, 0, depth / 2], color, finish }))
}

/** とがったアーチの上の線（右の立ち上がり → 頂 → 左の立ち上がり）。幅 w、立ち上がりの高さ s、頂の高さ top */
function archCurve(w: number, s: number, top: number): XZ[] {
  // 2つの円弧で作る。中心は反対側へ c だけずらす
  const half = w / 2
  const rise = top - s
  // 半径 R、中心 x=-c：R - c = half、R² - c² = rise² → R + c = rise² / half
  const sum = (rise * rise) / half
  const R = (half + sum) / 2
  const c = R - half
  const a1 = Math.acos(Math.min(1, c / R))
  const pts: XZ[] = []
  const n = 7
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

/** アーチの形を塗りつぶした輪郭（くぼみの板） */
function archShape(w: number, s: number, top: number): XZ[] {
  return [[w / 2, 0], ...archCurve(w, s, top), [-w / 2, 0]]
}

/** 四角い枠からアーチの形を抜いた輪郭（下が開いた門の形） */
function archFrame(W: number, H: number, w: number, s: number, top: number): XZ[] {
  return [[-W / 2, 0], [-W / 2, H], [W / 2, H], [W / 2, 0], [w / 2, 0], ...archCurve(w, s, top), [-w / 2, 0]]
}

/** 下が開いた細い四角の帯（幅 W・高さ H・帯の太さ t） */
function uFrame(W: number, H: number, t: number): XZ[] {
  return [
    [-W / 2, 0],
    [-W / 2, H],
    [W / 2, H],
    [W / 2, 0],
    [W / 2 - t, 0],
    [W / 2 - t, H - t],
    [-W / 2 + t, H - t],
    [-W / 2 + t, 0],
  ]
}

/** 墓廟の面 face（0=正面 1=右 2=奥 3=左）の大きなアーチの枠（ピーシュターク）と奥のくぼみ */
function pishtaq(kit: Kit, face: 0 | 1 | 2 | 3): void {
  kit.at({ at: [0, PLINTH_TOP, PZ], rotY: face * 90 }, () =>
    kit.part(() => {
      const W = 0.9
      const H = ROOF - PLINTH_TOP + 0.14
      plate(kit, archFrame(W, H, 0.6, 0.6, 0.93), 0.06, [0, 0, HALF + 0.025], MARBLE)
      // アーチを四角く囲む細い帯（象嵌の縁取り）
      plate(kit, uFrame(0.76, 1.03, 0.035), 0.01, [0, 0, HALF + 0.059], TRIM)
      plate(kit, archShape(0.6, 0.6, 0.93), 0.01, [0, 0, HALF + 0.004], SHADE)
      // 奥の扉
      kit.box({ w: 0.22, h: 0.32, d: 0.012, at: [0, 0, HALF + 0.01], color: DOOR })
    }),
  )
}

/** 大きなアーチの左右と、角を落とした面の、上下2段の小さなアーチのくぼみ */
function sideNiches(kit: Kit, face: 0 | 1 | 2 | 3): void {
  kit.at({ at: [0, PLINTH_TOP, PZ], rotY: face * 90 }, () => {
    for (const x of [-0.6, 0.6]) {
      for (const y of [0.08, 0.52]) plate(kit, archShape(0.2, 0.24, 0.36), 0.012, [x, y, HALF + 0.006], SHADE)
    }
  })
  // 角を落とした面（この面の右どなり）
  kit.at({ at: [0, PLINTH_TOP, PZ], rotY: face * 90 + 45 }, () => {
    const d = (HALF - CH / 2) * Math.SQRT2
    for (const y of [0.08, 0.52]) plate(kit, archShape(0.26, 0.24, 0.38), 0.012, [0, y, d + 0.006], SHADE)
  })
}

/** 墓廟の角とアーチの枠の上に立つ細い小塔（グルダスタ） */
function pinnacles(kit: Kit): void {
  const spots: XZ[] = []
  for (const [sx, sz] of CORNERS) {
    spots.push([sx * HALF, sz * (HALF - CH)], [sx * (HALF - CH), sz * HALF])
  }
  for (const [x, z] of spots) {
    kit.cylinder({ r: 0.028, h: 0.2, at: [x, ROOF - 0.05, PZ + z], seg: 8, color: MARBLE })
    kit.cone({ r: 0.04, h: 0.08, at: [x, ROOF + 0.15, PZ + z], seg: 8, color: MARBLE })
  }
  for (const face of [0, 1, 2, 3] as const) {
    kit.at({ at: [0, PLINTH_TOP, PZ], rotY: face * 90 }, () => {
      for (const x of [-0.45, 0.45]) {
        kit.cylinder({ r: 0.024, h: 0.14, at: [x, ROOF - PLINTH_TOP + 0.1, HALF + 0.03], seg: 8, color: MARBLE })
        kit.cone({ r: 0.034, h: 0.07, at: [x, ROOF - PLINTH_TOP + 0.24, HALF + 0.03], seg: 8, color: MARBLE })
      }
    })
  }
}

/** ドームの輪郭の半径（高さの割合 t） */
function onionR(t: number): number {
  for (let i = 1; i < ONION.length; i++) {
    const [t1, r1] = ONION[i] as readonly [number, number]
    const [t0, r0] = ONION[i - 1] as readonly [number, number]
    if (t <= t1) return r0 + ((r1 - r0) * (t - t0)) / (t1 - t0)
  }
  return 0.02
}

/**
 * ドームの帯（高さの割合 from〜to）。上の帯は継ぎ目の少し下から始めて、ほんの少し外へ出す
 * （高さで分けた回転体の継ぎ目に、下の帯のふたの色や陰の輪が線で出ないようにする。富士山で確かめた方法）
 */
function domeBand(kit: Kit, from: number, to: number): void {
  const upper = from > 0
  const out = upper ? 0.004 : 0
  const t0 = upper ? from - 0.03 : 0
  const pts: XZ[] = [[0, t0 * DOME_H]]
  const n = upper ? 12 : 6
  // 角の点を2つ置いて、底のふたと横の面の陰を混ぜない
  pts.push([onionR(t0) + out, t0 * DOME_H])
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((to - t0) * i) / n
    pts.push([onionR(t) + out, t * DOME_H])
  }
  const top = pts[pts.length - 1] as XZ
  if (!upper) pts.push([top[0], top[1]])
  pts.push([0, top[1]])
  kit.lathe({ points: pts, seg: 28, at: [0, DRUM_TOP, PZ], color: MARBLE, finish: 'satin' })
}

/** 頂の金の飾り（つぼみ・玉・柱・三日月） */
function finial(kit: Kit, at: Vec3): void {
  kit.at({ at }, () =>
    kit.part(() => {
      const gold = { color: GOLD, finish: 'gold' as const }
      kit.lathe({ points: [[0, 0], [0.06, 0.015], [0.07, 0.05], [0.04, 0.08], [0, 0.09]], seg: 12, ...gold })
      kit.cylinder({ r: 0.016, h: 0.32, at: [0, 0.08, 0], seg: 8, ...gold })
      for (const y of [0.13, 0.2, 0.26]) kit.sphere({ r: 0.032, at: [0, y, 0], seg: 8, ...gold })
      kit.torus({ r: 0.035, tube: 0.009, arc: 220, at: [0, 0.38, 0], rot: [0, 0, 160], seg: 10, ...gold })
    }),
  )
}

/** 小塔（チャトリ）：八角の台・8本の細い柱・ひさし・小さな玉ねぎ形の屋根・頂の飾り。at は台の底 */
function chattri(kit: Kit, at: Vec3, r: number, colH: number): void {
  kit.at({ at }, () =>
    kit.part(() => {
      kit.cylinder({ r: r * 1.05, h: 0.05, seg: 8, rotY: 22.5, color: MARBLE })
      kit.ring(8, r * 0.78, (_i, x, z) => kit.cylinder({ r: r * 0.08, h: colH, at: [x, 0.05, z], seg: 6, color: MARBLE }))
      kit.cylinder({ r: r * 1.12, h: r * 0.22, at: [0, 0.05 + colH, 0], seg: 8, rotY: 22.5, color: MARBLE })
      const y0 = 0.05 + colH + r * 0.22
      kit.lathe({
        points: [
          [0, 0],
          [r * 0.82, 0],
          [r * 0.95, r * 0.25],
          [r * 0.92, r * 0.55],
          [r * 0.7, r * 0.95],
          [r * 0.35, r * 1.3],
          [r * 0.1, r * 1.48],
          [0, r * 1.52],
        ],
        seg: 14,
        at: [0, y0, 0],
        color: MARBLE,
        finish: 'satin',
      })
      kit.cylinder({ r: r * 0.08, h: r * 0.45, at: [0, y0 + r * 1.45, 0], seg: 6, color: GOLD, finish: 'gold' })
    }),
  )
}

/** 尖塔の高さの区切り（基壇の上面から） */
const M1 = PLINTH_TOP + 0.55
const M2 = M1 + 0.05 + 0.48
const M3 = M2 + 0.05 + 0.4

/** 尖塔の根もと（台と、1つ目のバルコニーまで） */
function minaretBase(kit: Kit, x: number, z: number): void {
  kit.part(() => {
    kit.cylinder({ r: 0.2, h: 0.05, at: [x, PLINTH_TOP, z], seg: 8, rotY: 22.5, color: MARBLE })
    kit.cylinder({ r: 0.13, rTop: 0.122, h: 0.5, at: [x, PLINTH_TOP + 0.05, z], seg: 12, color: MARBLE })
    balcony(kit, x, M1, z, 0.122)
  })
}

/** 尖塔の中ほど（2つ目のバルコニーまで） */
function minaretMiddle(kit: Kit, x: number, z: number): void {
  kit.part(() => {
    kit.cylinder({ r: 0.116, rTop: 0.11, h: 0.48, at: [x, M1 + 0.05, z], seg: 12, color: MARBLE })
    balcony(kit, x, M2, z, 0.11)
  })
}

/** 尖塔の上（3つ目のバルコニーと、てっぺんの小塔） */
function minaretTop(kit: Kit, x: number, z: number): void {
  kit.part(() => {
    kit.cylinder({ r: 0.104, rTop: 0.098, h: 0.4, at: [x, M2 + 0.05, z], seg: 12, color: MARBLE })
    balcony(kit, x, M3, z, 0.098)
  })
  chattri(kit, [x, M3 + 0.05, z], 0.11, 0.13)
}

/** 基壇の四つの側面に並ぶ、浅いアーチのくぼみの列 */
function plinthArcade(kit: Kit): void {
  for (const face of [0, 1, 2, 3] as const) {
    kit.at({ at: [0, TERRACE_H, PZ], rotY: face * 90 }, () => {
      for (let i = 0; i < 11; i++) {
        const x = -PLINTH_HALF + 0.22 + (i * (PLINTH_HALF * 2 - 0.44)) / 10
        if (face === 0 && Math.abs(x) < 0.5) continue
        plate(kit, archShape(0.14, 0.08, 0.17), 0.01, [x, 0.04, PLINTH_HALF + 0.004], SHADE)
      }
    })
  }
}

/** 尖塔のバルコニー（下すぼまりの持ち送りと、手すりの輪） */
function balcony(kit: Kit, x: number, y: number, z: number, r: number): void {
  kit.cylinder({ r: r + 0.05, rTop: r + 0.055, h: 0.02, at: [x, y + 0.02, z], seg: 12, color: MARBLE })
  kit.cylinder({ r: r + 0.05, rTop: r, h: 0.02, at: [x, y, z], seg: 12, color: TRIM })
  kit.cylinder({ r: r + 0.055, h: 0.025, at: [x, y + 0.04, z], seg: 12, color: TRIM })
}

/** 赤砂岩のモスク（左 side=-1）と迎賓館（右 side=1）。墓廟の方を向く大きなアーチと、白い3つのドーム */
function sideHall(kit: Kit, side: -1 | 1): void {
  const x = side * 3.25
  kit.part(() => {
    kit.at({ at: [x, TERRACE_H, PZ], rotY: side > 0 ? -90 : 90 }, () => {
      // 長さ1.7・奥行0.6の建物。正面（墓廟の側）がこの座標の +Z
      kit.box({ w: 1.7, h: 0.38, d: 0.6, color: SANDSTONE })
      kit.box({ w: 1.76, h: 0.04, d: 0.66, at: [0, 0.38, 0], color: SANDSTONE_TOP })
      plate(kit, archFrame(0.46, 0.5, 0.28, 0.22, 0.38), 0.04, [0, 0, 0.32], SANDSTONE_TOP)
      plate(kit, archShape(0.28, 0.22, 0.38), 0.01, [0, 0, 0.305], '#6E3520')
      for (const s of [-0.55, -0.3, 0.3, 0.55]) plate(kit, archShape(0.16, 0.14, 0.24), 0.01, [s, 0.04, 0.305], '#7A3B24')
      // 白い大理石のドーム3つ
      for (const [s, r] of [
        [-0.52, 0.15],
        [0, 0.2],
        [0.52, 0.15],
      ] as const) {
        kit.cylinder({ r: r * 0.9, h: 0.06, at: [s, 0.42, -0.02], seg: 14, color: SANDSTONE_TOP })
        kit.lathe({
          points: [
            [0, 0],
            [r * 0.9, 0],
            [r, r * 0.3],
            [r * 0.9, r * 0.75],
            [r * 0.55, r * 1.15],
            [r * 0.15, r * 1.42],
            [0, r * 1.48],
          ],
          seg: 14,
          at: [s, 0.48, -0.02],
          color: MARBLE,
          finish: 'satin',
        })
        kit.cylinder({ r: 0.012, h: 0.09, at: [s, 0.48 + r * 1.44, -0.02], seg: 6, color: GOLD, finish: 'gold' })
      }
      // 四隅の小塔
      for (const [sx, sz] of CORNERS) {
        kit.cylinder({ r: 0.06, h: 0.5, at: [sx * 0.85, 0, sz * 0.3], seg: 8, color: SANDSTONE_TOP })
        kit.sphere({ r: 0.06, squash: 1.1, at: [sx * 0.85, 0.5, sz * 0.3], seg: 8, color: MARBLE })
      }
    })
  })
}
