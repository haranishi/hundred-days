// 伏見稲荷大社の千本鳥居：稲荷山のふもとの朱の社殿（楼門・外拝殿・本殿）から、朱の鳥居がすき間なく並んだ
// トンネルが山を登っていく。途中で2列に分かれて並んで進み（千本鳥居）、また1本になって山の上へ。
// 正面（+Z）が参道の入口、奥（-Z）が稲荷山。白いうちは「山のふもとの社殿と大きな鳥居」まで（厳島神社や平安神宮と迷う）。
// 段階3で同じ大きさの鳥居が何十も途切れずに山を登り、2列に分かれる形が出て決まる。狐の像も段階3。
// 鳥居の朱は厳島神社の模型と同じ朱（COLORS.vermilion）。小さな鳥居を作る道具は kit にないので、このファイルの中で作る。
import { COLORS, type Kit, type Vec3, type XZ } from './kit'

const SHU = COLORS.vermilion
const BLACK = '#262321'
const BARK = '#5B4636'
const WALL = '#F4F0E6'
const STEP = '#A89A80'
const GRAVEL = '#D3C8B2'
const FOREST = '#2F5233'

/** 稲荷山と左右の丘 [x, z, 横の半径, 奥の半径, 高さ] */
const HILLS: readonly (readonly [number, number, number, number, number])[] = [
  [0.2, -2.3, 3.5, 2.3, 1.9],
  [-3.2, -0.7, 1.35, 1.6, 0.85],
  [3.25, -0.1, 1.2, 1.55, 0.7],
]

/** 鳥居の道（中心線）。本殿の裏から登り始め、2列に分かれ、また1本になって山の上へ */
const START: readonly XZ[] = [
  [0.35, 0.78],
  [0.35, 0.3],
]
const SPLIT_FROM = 0.18
const SPLIT_TO = -0.95
const SPLIT_X: readonly number[] = [0.15, 0.55]
const UPPER: readonly XZ[] = [
  [0.35, -1.12],
  [-0.55, -1.5],
  [-1.3, -2.1],
  [-0.75, -2.72],
  [0.25, -2.78],
  [0.95, -3.3],
]

export function build(kit: Kit): void {
  kit.ground('#9DAE78')

  // ---- 段階1：稲荷山と丘、参道、社殿の土台と壁（白） ----
  kit.stage(1)
  kit.order(-1)
  for (const [x, z, rx, rz, h] of HILLS) kit.mound({ r: Math.max(rx, rz), rx, rz, h, at: [x, 0, z], color: FOREST })
  kit.appear('grow')
  kit.box({ w: 0.46, h: 0.02, d: 2.3, at: [0, 0, 3.6], color: GRAVEL })
  kit.box({ w: 1.9, h: 0.02, d: 2.5, at: [0, 0, 1.6], color: GRAVEL })
  kit.extrude({ points: clipStrip(3.9, 4.24), h: 0.02, color: '#8C8A86' })
  kit.appear('drop')
  kit.order(0)
  shrineBodies(kit)

  // ---- 段階2：形の特徴＝社殿の屋根、入口の大きな鳥居、山を登る石段の道（白） ----
  kit.stage(2)
  shrineRoofs(kit)
  kit.at({ at: [0, 0, 3.75] }, () => bigTorii(kit, 1))
  steps(kit)

  // ---- 段階3：決め手の細部（白）＝すき間なく並んで山を登る鳥居のトンネル、2列に分かれる千本鳥居、狐の像 ----
  kit.stage(3)
  tunnel(kit)
  fox(kit, [-0.5, 0, 2.98], 25)
  fox(kit, [0.5, 0, 2.98], -25)

  // ---- 段階4：周りの景色（色つき）＝山の森、山の上のお塚と小さな鳥居、門前の町並み、人 ----
  kit.stage(4)
  scenery(kit)
}

// ===== 鳥居 =====

/** 小さな鳥居（明神鳥居）1基。足もとの中心が原点、正面は +Z（道の進む向き） */
function smallTorii(kit: Kit, s: number): void {
  const h = 0.25 * s
  const half = 0.085 * s
  for (const x of [-half, half]) {
    kit.cylinder({ r: 0.014 * s, h: h + 0.03, at: [x, -0.03, 0], seg: 6, color: SHU })
    kit.cylinder({ r: 0.017 * s, h: 0.05 * s, at: [x, -0.03, 0], seg: 6, color: BLACK })
  }
  kit.box({ w: 0.22 * s, h: 0.016 * s, d: 0.02 * s, at: [0, h * 0.74, 0], color: SHU })
  kit.box({ w: 0.24 * s, h: 0.018 * s, d: 0.03 * s, at: [0, h * 0.93, 0], color: SHU })
  kit.box({ w: 0.29 * s, h: 0.024 * s, d: 0.036 * s, at: [0, h, 0], color: SHU })
  kit.box({ w: 0.3 * s, h: 0.008 * s, d: 0.04 * s, at: [0, h + 0.024 * s, 0], color: BLACK })
}

/** 入口の大きな鳥居（両端の反り上がる笠木） */
function bigTorii(kit: Kit, s: number): void {
  kit.part(() => {
    const h = 0.62 * s
    for (const x of [-0.26 * s, 0.26 * s]) {
      kit.cylinder({ r: 0.04 * s, rTop: 0.034 * s, h, at: [x, 0, 0], seg: 10, color: SHU })
      kit.cylinder({ r: 0.05 * s, h: 0.07 * s, at: [x, 0, 0], seg: 10, color: BLACK })
    }
    kit.box({ w: 0.66 * s, h: 0.04 * s, d: 0.04 * s, at: [0, h * 0.74, 0], color: SHU })
    kit.box({ w: 0.68 * s, h: 0.035 * s, d: 0.06 * s, at: [0, h * 0.92, 0], color: SHU })
    plate(kit, curvedBeam(0.4 * s, 0.05 * s, 0.05 * s, 0.03 * s), 0.08 * s, [0, h * 0.98, 0], SHU)
    plate(kit, curvedBeam(0.42 * s, 0.018 * s, 0.05 * s, 0.035 * s), 0.09 * s, [0, h * 0.98 + 0.05 * s, 0], BLACK)
    kit.box({ w: 0.06 * s, h: 0.1 * s, d: 0.04 * s, at: [0, h * 0.77, 0], color: SHU })
  })
}

/** 正面から見た輪郭 points（[x, y]）を、奥行き depth の板にする。板は at を中心に Z の前後へ半分ずつ */
function plate(kit: Kit, points: readonly XZ[], depth: number, at: Vec3, color: string): void {
  kit.at({ at }, () => kit.extrude({ points, h: depth, rot: [-90, 0, 0], at: [0, 0, depth / 2], color }))
}

/** 両端が反り上がる横木の輪郭（正面から見た形） */
function curvedBeam(half: number, thick: number, lift: number, spread: number): XZ[] {
  const n = 12
  const bottom: XZ[] = []
  const top: XZ[] = []
  for (let i = 0; i <= n; i++) {
    const u = -1 + (2 * i) / n
    bottom.push([u * half, lift * Math.abs(u) ** 2.4])
    const ut = u * (half + spread)
    top.push([ut, thick + lift * Math.min(1.2, Math.abs(ut) / half) ** 2.4])
  }
  return [...bottom, ...top.reverse()]
}

/** 鳥居を置く点：線 pts の上に、間隔 gap ごとに [x, z, 向き(度)] */
function along(pts: readonly XZ[], gap: number, skipStart = 0): [number, number, number][] {
  const out: [number, number, number][] = []
  let carry = skipStart
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as XZ
    const b = pts[i + 1] as XZ
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const len = Math.hypot(dx, dz)
    const rot = (Math.atan2(dx, dz) * 180) / Math.PI
    let s = carry
    while (s <= len) {
      out.push([a[0] + (dx * s) / len, a[1] + (dz * s) / len, rot])
      s += gap
    }
    carry = s - len
  }
  return out
}

/** 鳥居のトンネル：下から順に、4基ずつ1つの部品にして並べる */
function tunnel(kit: Kit): void {
  const spots: [number, number, number][] = [
    ...along(START, 0.075),
    ...SPLIT_X.flatMap((x) => along([[x, SPLIT_FROM], [x, SPLIT_TO]], 0.072)),
    ...along([[0.35, SPLIT_TO - 0.08], ...UPPER], 0.08, 0.04),
  ]
  for (let i = 0; i < spots.length; i += 4) {
    const group = spots.slice(i, i + 4)
    kit.part(() => {
      for (const [x, z, rot] of group) {
        kit.at({ at: [x, kit.groundAt(x, z), z], rotY: rot }, () => smallTorii(kit, 1))
      }
    })
  }
}

/** 鳥居の下の石段の道（山の斜面に沿う細い帯） */
function steps(kit: Kit): void {
  const lines: XZ[][] = [
    [...START],
    [
      [SPLIT_X[0] ?? 0.15, SPLIT_FROM],
      [SPLIT_X[0] ?? 0.15, SPLIT_TO],
    ],
    [
      [SPLIT_X[1] ?? 0.55, SPLIT_FROM],
      [SPLIT_X[1] ?? 0.55, SPLIT_TO],
    ],
    [[0.35, SPLIT_TO - 0.08], ...UPPER],
  ]
  kit.part(() => {
    for (const line of lines) {
      const pts = along(line, 0.25)
      const last = line[line.length - 1] as XZ
      pts.push([last[0], last[1], 0])
      for (let i = 0; i + 1 < pts.length; i++) {
        const [x0, z0] = pts[i] as [number, number, number]
        const [x1, z1] = pts[i + 1] as [number, number, number]
        kit.beam({ from: [x0, kit.groundAt(x0, z0) + 0.005, z0], to: [x1, kit.groundAt(x1, z1) + 0.005, z1], size: 0.025, width: 0.2, color: STEP })
      }
    }
    // 分かれ道とまた合う所の踊り場
    for (const [x, z] of [
      [0.35, SPLIT_FROM + 0.05],
      [0.35, SPLIT_TO - 0.1],
    ] as const) {
      kit.box({ w: 0.62, h: 0.03, d: 0.26, at: [x, kit.groundAt(x, z) - 0.01, z], color: STEP })
    }
  })
}

// ===== 社殿 =====

/** 楼門・外拝殿・本殿の土台と壁・柱（白いうちは「社殿」まで） */
function shrineBodies(kit: Kit): void {
  // 楼門（2階建ての門）
  kit.part(() => {
    kit.box({ w: 0.9, h: 0.06, d: 0.42, at: [0, 0, 2.75], color: '#B9B2A4' })
    kit.box({ w: 0.78, h: 0.24, d: 0.3, at: [0, 0.06, 2.75], color: SHU })
    kit.box({ w: 0.2, h: 0.2, d: 0.32, at: [0, 0.06, 2.75], color: '#3E2F28' })
    kit.box({ w: 0.66, h: 0.16, d: 0.24, at: [0, 0.38, 2.75], color: SHU })
  })
  // 外拝殿（柱だけの開いた建物）
  kit.part(() => {
    kit.box({ w: 0.86, h: 0.05, d: 0.5, at: [0, 0, 2.0], color: '#B9B2A4' })
    for (const x of [-0.36, -0.12, 0.12, 0.36]) {
      for (const z of [1.8, 2.2]) kit.cylinder({ r: 0.022, h: 0.2, at: [x, 0.05, z], seg: 6, color: SHU })
    }
  })
  // 本殿（白い壁に朱の柱）
  kit.part(() => {
    kit.box({ w: 1.1, h: 0.06, d: 0.62, at: [0, 0, 1.2], color: '#B9B2A4' })
    kit.box({ w: 1.0, h: 0.22, d: 0.46, at: [0, 0.06, 1.2], color: WALL })
    for (const x of [-0.48, -0.24, 0, 0.24, 0.48]) kit.box({ w: 0.035, h: 0.22, d: 0.035, at: [x, 0.06, 1.44], color: SHU })
    kit.box({ w: 1.02, h: 0.035, d: 0.48, at: [0, 0.25, 1.2], color: SHU })
  })
}

function shrineRoofs(kit: Kit): void {
  kit.curvedRoof({ w: 0.78, d: 0.3, h: 0.12, at: [0, 0.3, 2.75], style: 'skirt', top: { w: 0.66, d: 0.24 }, overhang: 0.12, upturn: 0.04, thick: 0.03, color: BARK })
  kit.curvedRoof({ w: 0.66, d: 0.24, h: 0.24, at: [0, 0.54, 2.75], style: 'irimoya', overhang: 0.13, upturn: 0.05, color: BARK })
  kit.curvedRoof({ w: 0.86, d: 0.46, h: 0.2, at: [0, 0.25, 2.0], style: 'irimoya', overhang: 0.09, upturn: 0.04, color: BARK })
  // 本殿の屋根は前へ長く流れる（流造）。前を少し低く、長く
  kit.part(() => {
    kit.curvedRoof({ w: 1.0, d: 0.46, h: 0.26, at: [0, 0.28, 1.2], style: 'irimoya', overhang: 0.12, upturn: 0.05, color: BARK })
    kit.beam({ from: [0, 0.27, 1.62], to: [0, 0.4, 1.38], size: 0.03, width: 1.18, color: BARK })
  })
}

/** 狐の像（台座の上に座る、細い体と立った耳、上へ巻く尾） */
function fox(kit: Kit, at: Vec3, rotY: number): void {
  kit.part(() =>
    kit.at({ at, rotY }, () => {
      const stone = { color: '#B4AEA2' }
      const body = { color: '#E9E4DA' }
      kit.box({ w: 0.12, h: 0.12, d: 0.12, ...stone })
      kit.box({ w: 0.14, h: 0.025, d: 0.14, at: [0, 0.12, 0], ...stone })
      kit.beam({ from: [0, 0.145, -0.02], to: [0, 0.24, 0.015], size: 0.05, width: 0.045, ...body })
      kit.box({ w: 0.04, h: 0.04, d: 0.06, at: [0, 0.235, 0.03], ...body })
      kit.cone({ r: 0.012, h: 0.035, at: [-0.013, 0.27, 0.025], seg: 4, ...body })
      kit.cone({ r: 0.012, h: 0.035, at: [0.013, 0.27, 0.025], seg: 4, ...body })
      kit.beam({ from: [0, 0.15, -0.04], to: [0, 0.25, -0.06], size: 0.025, width: 0.03, ...body })
      kit.box({ w: 0.02, h: 0.012, d: 0.02, at: [0, 0.205, 0.05], color: SHU })
    }),
  )
}

// ===== 景色 =====

/** 台座の円に収まる横長の帯（z0〜z1） */
function clipStrip(z0: number, z1: number): XZ[] {
  const r = 4.9
  const half = (z: number) => Math.sqrt(Math.max(0, r * r - z * z))
  return [
    [-half(z0), z0],
    [-half(z1), z1],
    [half(z1), z1],
    [half(z0), z0],
  ]
}

/** いつもの角度でカメラのある向き（上から見て、中心から左手前） */
const CAMERA_DIR: XZ = [-0.574, 0.819]

/** 点 (x, z) が鳥居の道よりカメラの側にあるか（そこの高い木は鳥居を隠す） */
function cameraSide(x: number, z: number): boolean {
  const [qx, qz] = nearestOnPath(x, z)
  return (x - qx) * CAMERA_DIR[0] + (z - qz) * CAMERA_DIR[1] > 0
}

/** 点 (x, z) から鳥居の道までのいちばん近い距離 */
function distToPath(x: number, z: number): number {
  const [qx, qz] = nearestOnPath(x, z)
  return Math.hypot(x - qx, z - qz)
}

/** 鳥居の道の上で、点 (x, z) にいちばん近い点 */
function nearestOnPath(x: number, z: number): XZ {
  const lines: XZ[][] = [
    [...START],
    [
      [SPLIT_X[0] ?? 0.15, SPLIT_FROM],
      [SPLIT_X[0] ?? 0.15, SPLIT_TO],
    ],
    [
      [SPLIT_X[1] ?? 0.55, SPLIT_FROM],
      [SPLIT_X[1] ?? 0.55, SPLIT_TO],
    ],
    [[0.35, SPLIT_TO - 0.08], ...UPPER],
  ]
  let best = Infinity
  let near: XZ = [x, z]
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, az] = line[i] as XZ
      const [bx, bz] = line[i + 1] as XZ
      const dx = bx - ax
      const dz = bz - az
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
      const px = ax + dx * t
      const pz = az + dz * t
      const d = Math.hypot(x - px, z - pz)
      if (d < best) {
        best = d
        near = [px, pz]
      }
    }
  }
  return near
}

function scenery(kit: Kit): void {
  // 山の森：鳥居の道と社殿のまわりをあける。いつもの角度で道より手前（カメラ側）になる木は、
  // 道から離して低くし、鳥居のトンネルを隠さないようにする
  kit.scatter(
    {
      count: 120,
      rMin: 0.5,
      rMax: 4.75,
      gap: 0.25,
      ok: (x, z) => {
        if (kit.groundAt(x, z) < 0.06 || (Math.abs(x) < 1.0 && z > 0.6)) return false
        const d = distToPath(x, z)
        return cameraSide(x, z) ? d > 0.5 : d > 0.26
      },
    },
    (_i, x, z) => {
      const y = kit.groundAt(x, z) - 0.04
      const low = cameraSide(x, z)
      kit.tree({
        kind: kit.pick(['cone', 'cone', 'round'] as const),
        h: low ? kit.range(0.28, 0.4) : kit.range(0.4, 0.6),
        at: [x, y, z],
        color: kit.pick(['#2F5233', '#3A6340', '#2A4A2E', '#46703F']),
      })
    },
  )
  // 山の上のお塚：石の小山と、奉納された小さな鳥居の群れ
  const top: XZ = [1.15, -3.55]
  kit.part(() => {
    const y = kit.groundAt(top[0], top[1])
    kit.box({ w: 0.42, h: 0.05, d: 0.3, at: [top[0], y - 0.02, top[1]], color: '#8F8A80' })
    kit.box({ w: 0.2, h: 0.12, d: 0.14, at: [top[0], y + 0.03, top[1] - 0.05], color: SHU })
    kit.curvedRoof({ w: 0.2, d: 0.14, h: 0.08, at: [top[0], y + 0.15, top[1] - 0.05], style: 'irimoya', overhang: 0.05, upturn: 0.02, color: BARK })
  })
  kit.part(() => {
    for (const [dx, dz, r] of [
      [-0.28, 0.12, 20],
      [-0.2, 0.22, 35],
      [0.25, 0.15, -30],
      [0.3, 0.02, -50],
      [-0.33, -0.05, 60],
    ] as const) {
      const x = top[0] + dx
      const z = top[1] + dz
      kit.at({ at: [x, kit.groundAt(x, z), z], rotY: r }, () => smallTorii(kit, 0.5))
    }
  })
  // 門前の町並み（参道の両側の低い店）と、前の道路の車
  for (const [x, z, w, d] of [
    [-1.0, 3.4, 0.6, 0.45],
    [-1.7, 3.35, 0.55, 0.5],
    [1.0, 3.4, 0.6, 0.45],
    [1.7, 3.3, 0.55, 0.5],
    [-2.5, 3.0, 0.6, 0.5],
    [2.5, 2.9, 0.6, 0.5],
    [-1.35, 2.55, 0.5, 0.42],
    [1.35, 2.5, 0.5, 0.42],
  ] as const) {
    kit.part(() => {
      kit.box({ w, h: 0.2, d, at: [x, 0, z], color: '#E8E1D2' })
      kit.box({ w: w + 0.01, h: 0.05, d: d + 0.01, at: [x, 0.07, z], color: '#5E4A3A' })
      kit.gableRoof({ w, d, h: 0.12, at: [x, 0.2, z], overhang: 0.04, color: '#4F5560' })
    })
  }
  for (const [x, r] of [
    [-1.85, 90],
    [-0.8, -90],
    [0.85, 90],
    [1.75, -90],
  ] as const) {
    kit.car({ at: [x, 0.02, 4.07 + (r > 0 ? 0.07 : -0.07)], rotY: r })
  }
  // 人：参道、社殿の前、鳥居のトンネルの中
  for (const [x, z] of [
    [0.05, 4.0],
    [-0.1, 3.3],
    [0.12, 2.35],
    [-0.25, 1.65],
    [0.3, 1.7],
    [0.6, 2.1],
    [-0.55, 2.3],
  ] as const) {
    kit.person({ at: [x, 0.02, z], rotY: kit.range(0, 360) })
  }
  for (const [x, z] of [
    [0.15, -0.3],
    [0.55, -0.6],
    [-0.2, -1.36],
    [-1.0, -1.82],
    [-0.4, -2.74],
  ] as const) {
    kit.person({ at: [x, kit.groundAt(x, z), z], rotY: kit.range(0, 360) })
  }
}
