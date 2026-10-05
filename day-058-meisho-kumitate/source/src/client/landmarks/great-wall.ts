// 万里の長城：山の尾根を上り下りする灰色の煉瓦の城壁と、一定の間隔で立つ四角い望楼（八達嶺のような眺め）。
// 壁は左手前の台座の端から尾根づたいに奥のいちばん高い峰へ上り、右手前の峰へ下りて台座の端へ抜ける（両端は先へ続いて見える）。
// 白いうちは「山並み」→「尾根を走る細長い壁」まで（マチュピチュの段々や紫禁城の城壁と迷う）。
// 段階3の望楼と凸凹の胸壁で決まり、色塗りの灰色の煉瓦と緑の山、段階4の紅葉の森と壁を歩く人でほぼ全員が当たる。
import { type Kit, type Vec3, type XZ } from './kit'

const BRICK = '#8E8B84'
const BRICK_DARK = '#7B776F'
const WALK = '#A6A39B'
const ROOF = '#55595E'
const WINDOW = '#3A3631'
const GROUND = '#6E9A52'
const ROAD = '#7E8082'

/** 壁の幅・地面から出る高さ・地面に埋める深さ（斜面の下側で浮かないように） */
const WALL_W = 0.17
const WALL_UP = 0.17
const SINK = 0.1
/** 望楼の幅と、壁の上に出る高さ */
const TOWER_W = 0.38
const TOWER_UP = 0.44

interface Hill {
  x: number
  z: number
  rx: number
  rz: number
  h: number
  color: string
}

const RIDGE = '#5E8A48'
const FAR = '#6F9259'
const FOOT = '#7DA35E'

/** 山並み。尾根の峰（壁が通る）・峰の間の鞍部・奥の山・手前のふもと */
const HILLS: readonly Hill[] = [
  // 尾根の峰
  { x: -2.7, z: 0.2, rx: 1.45, rz: 1.1, h: 1.3, color: RIDGE },
  { x: -0.9, z: -0.9, rx: 1.45, rz: 1.25, h: 1.9, color: RIDGE },
  { x: 0.9, z: -1.5, rx: 1.6, rz: 1.45, h: 2.3, color: RIDGE },
  { x: 2.5, z: 0.4, rx: 1.3, rz: 1.15, h: 1.5, color: RIDGE },
  { x: 3.62, z: 1.88, rx: 0.64, rz: 0.64, h: 0.95, color: RIDGE },
  { x: -3.85, z: 0.95, rx: 0.9, rz: 0.8, h: 0.8, color: RIDGE },
  // 鞍部（峰と峰の間を、深い谷にしないで尾根につなぐ）
  { x: -1.8, z: -0.3, rx: 1.0, rz: 0.8, h: 1.0, color: RIDGE },
  { x: 0.0, z: -1.15, rx: 0.9, rz: 0.8, h: 1.45, color: RIDGE },
  { x: 1.8, z: -0.55, rx: 0.9, rz: 0.8, h: 1.3, color: RIDGE },
  { x: 3.2, z: 1.2, rx: 0.8, rz: 0.7, h: 0.85, color: RIDGE },
  // 奥の山並み
  { x: -2.1, z: -2.75, rx: 1.5, rz: 1.15, h: 1.15, color: FAR },
  { x: 0.9, z: -3.45, rx: 1.9, rz: 1.1, h: 1.35, color: FAR },
  { x: 3.0, z: -2.3, rx: 1.0, rz: 1.0, h: 1.05, color: FAR },
  { x: -3.5, z: -1.55, rx: 1.0, rz: 1.0, h: 0.8, color: FAR },
  // 手前のふもとの丘
  { x: -1.5, z: 2.45, rx: 1.0, rz: 0.7, h: 0.35, color: FOOT },
  { x: 1.2, z: 2.1, rx: 1.0, rz: 0.8, h: 0.45, color: FOOT },
  { x: -0.15, z: 1.55, rx: 0.8, rz: 0.6, h: 0.3, color: FOOT },
]

/** 手前の谷の畑 [x, z, 幅, 奥行き, 向き(度), 色] */
const FIELDS: readonly (readonly [number, number, number, number, number, string])[] = [
  [2.25, 2.75, 0.9, 0.55, -15, '#B9C46A'],
  [0.25, 3.15, 1.0, 0.5, 8, '#9FBF5A'],
  [-0.3, 2.6, 0.7, 0.5, -20, '#C9B36A'],
  [-3.0, 2.0, 0.7, 0.45, -30, '#A9C266'],
]

/** 道ばたの村の家 [x, z, 向き(度)] */
const HOUSES: readonly (readonly [number, number, number])[] = [
  [1.05, 3.55, -8],
  [1.42, 3.42, 10],
  [1.8, 3.28, -12],
  [1.5, 3.05, 5],
]

/** 壁が通る尾根の道すじ（上から見た点）。この点を通るなめらかな線に沿わせる */
const PATH: readonly XZ[] = [
  [-4.62, 1.42],
  [-3.85, 0.95],
  [-2.7, 0.2],
  [-1.8, -0.3],
  [-0.9, -0.9],
  [0.0, -1.15],
  [0.9, -1.5],
  [1.8, -0.55],
  [2.5, 0.4],
  [3.2, 1.2],
  [3.62, 1.88],
  [4.18, 2.42],
]

/** 望楼を置く道すじの点の番号（PATH の番号）と、屋根の小屋を載せるか */
const TOWERS: readonly (readonly [number, boolean])[] = [
  [2, false],
  [4, true],
  [6, false],
  [8, true],
  [10, false],
]

/** 手前の谷の道路（上から見た点） */
const ROAD_LINE: readonly XZ[] = [
  [-3.95, 2.55],
  [-2.6, 3.35],
  [-1.0, 3.85],
  [0.6, 4.05],
  [2.05, 3.85],
  [2.95, 3.45],
]

interface Sample {
  x: number
  y: number
  z: number
  /** PATH のどの区間か（区間 k は点 k と k+1 の間） */
  span: number
}

export function build(kit: Kit): void {
  kit.ground(GROUND)

  // ---- 段階1：山並みと手前の谷の道路（白） ----
  kit.stage(1)
  for (const m of HILLS) kit.mound({ r: Math.max(m.rx, m.rz), rx: m.rx, rz: m.rz, h: m.h, at: [m.x, 0, m.z], seg: 24, color: m.color })
  kit.appear('grow')
  kit.part(() => {
    for (let i = 0; i + 1 < ROAD_LINE.length; i++) strip(kit, ROAD_LINE[i] as XZ, ROAD_LINE[i + 1] as XZ, 0.3, ROAD)
    for (const [x, z, w, d, rot, color] of FIELDS) kit.box({ w, h: 0.012, d, at: [x, 0, z], rotY: rot, color })
  })
  kit.appear('drop')

  // 壁の道すじを細かく刻み、各点の地面の高さを取る
  const samples = sampleWall(kit)
  const towerAt = TOWERS.map(([k]) => nearestSample(samples, PATH[k] as XZ))
  // 望楼と望楼の間を1つの区間（部品の組）にする
  const cuts = [0, ...towerAt, samples.length - 1]
  const sections: [number, number][] = []
  for (let i = 0; i + 1 < cuts.length; i++) sections.push([cuts[i] ?? 0, cuts[i + 1] ?? 0])

  // ---- 段階2：形の特徴＝尾根を上り下りする細長い壁（白） ----
  kit.stage(2)
  for (const [a, b] of sections) {
    kit.part(() => {
      for (let i = a; i < b; i++) wallSegment(kit, samples[i] as Sample, samples[i + 1] as Sample)
    })
  }

  // ---- 段階3：決め手の細部（白）＝四角い望楼と、壁の外側の凸凹の胸壁 ----
  kit.stage(3)
  TOWERS.forEach(([, roofed], i) => {
    const k = towerAt[i] ?? 0
    const s = samples[k] as Sample
    const prev = samples[Math.max(0, k - 2)] as Sample
    const next = samples[Math.min(samples.length - 1, k + 2)] as Sample
    watchtower(kit, s, headingDeg(prev, next), roofed)
  })
  for (const [a, b] of sections) {
    kit.part(() => {
      for (let i = a; i < b; i++) battlements(kit, samples[i] as Sample, samples[i + 1] as Sample)
    })
  }

  // ---- 段階4：周りの景色（色つき）＝山の森（紅葉まじり）・壁を歩く人・谷の道路の観光バスと車 ----
  kit.stage(4)
  const nearWall = (x: number, z: number, d: number) => samples.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < d * d)
  const onRoad = (x: number, z: number) => ROAD_LINE.some(([rx, rz]) => (rx - x) ** 2 + (rz - z) ** 2 < 0.5 * 0.5)
  kit.scatter(
    { count: 96, rMax: 4.7, gap: 0.3, ok: (x, z) => !nearWall(x, z, 0.32) && !onRoad(x, z) && kit.groundAt(x, z) > 0.12 },
    (_i, x, z) => {
      const autumn = kit.chance(0.22)
      const y = Math.max(0, kit.groundAt(x, z) - 0.04)
      kit.tree({
        kind: kit.chance(0.4) ? 'cone' : 'round',
        h: kit.range(0.3, 0.44),
        at: [x, y, z],
        color: autumn ? kit.pick(['#D2752F', '#C8532E', '#E0A83A', '#B8452F']) : kit.pick(['#3F6F45', '#4A7C4A', '#365F3D', '#557F44']),
      })
    },
  )
  // 道ばたの村（白い壁と灰色の瓦屋根）
  for (const [x, z, rot] of HOUSES) {
    kit.at({ at: [x, 0, z], rotY: rot }, () =>
      kit.part(() => {
        kit.box({ w: 0.3, h: 0.13, d: 0.2, color: '#E9E4DA' })
        kit.gableRoof({ w: 0.3, d: 0.2, h: 0.09, overhang: 0.035, at: [0, 0.13, 0], color: '#6B6F73' })
      }),
    )
  }
  // 谷の平らな所の木（畑と道と村をよけて）
  const inField = (x: number, z: number) => FIELDS.some(([fx, fz, w, d]) => Math.abs(x - fx) < w / 2 + 0.15 && Math.abs(z - fz) < d / 2 + 0.15)
  const nearHouse = (x: number, z: number) => HOUSES.some(([hx, hz]) => (hx - x) ** 2 + (hz - z) ** 2 < 0.3 * 0.3)
  kit.scatter(
    { count: 16, rMin: 1.2, rMax: 4.55, gap: 0.34, ok: (x, z) => z > 1.0 && kit.groundAt(x, z) < 0.05 && !onRoad(x, z) && !inField(x, z) && !nearHouse(x, z) },
    (_i, x, z) => kit.tree({ kind: 'round', h: kit.range(0.34, 0.46), at: [x, 0, z], color: kit.pick(['#4F8A45', '#5C9A4C', '#47803F', '#D2752F']) }),
  )
  // 谷の木（道路ぞい）
  for (const [x, z] of [
    [-3.4, 3.25],
    [-2.0, 3.85],
    [-0.3, 4.4],
    [1.3, 4.35],
    [-1.6, 3.2],
    [2.6, 3.95],
  ] as const) {
    kit.tree({ kind: 'round', h: kit.range(0.36, 0.46), at: [x, 0, z], color: kit.pick(['#4F8A45', '#5C9A4C', '#C8532E']) })
  }
  // 壁の上を歩く人
  for (const k of [6, 9, 14, 21, 27, 33, 40, 47, 55, 62, 70, 78, 86, 93]) {
    const s = samples[Math.min(samples.length - 2, k)] as Sample
    const n = samples[Math.min(samples.length - 1, k + 1)] as Sample
    const top = WALL_UP + 0.012 + slopeLift(s, n)
    kit.person({ at: [s.x, s.y + top - 0.01, s.z], rotY: headingDeg(s, n) + (kit.chance(0.5) ? 90 : -90) })
  }
  // 谷の道路の観光バスと車
  bus(kit, [-2.05, 0.02, 3.55], -62, '#F2F0EA')
  bus(kit, [0.15, 0.02, 4.0], -84, '#E6B53A')
  kit.car({ at: [-3.2, 0.02, 2.95], rotY: -58 })
  kit.car({ at: [-1.05, 0.02, 3.85], rotY: 110 })
  kit.car({ at: [1.35, 0.02, 3.98], rotY: -100 })
  kit.car({ at: [2.55, 0.02, 3.62], rotY: 62 })
  // 道路ぞいの観光客
  for (const [x, z] of [
    [-2.5, 3.0],
    [-2.35, 2.95],
    [-0.7, 3.5],
  ] as const) {
    kit.person({ at: [x, 0.02, z], rotY: kit.range(-60, 60) })
  }
}

/** なめらかな線（カトマル・ロム曲線）で道すじを刻み、各点に地面の高さを付ける */
function sampleWall(kit: Kit): Sample[] {
  const out: Sample[] = []
  const P = (i: number): XZ => PATH[Math.max(0, Math.min(PATH.length - 1, i))] as XZ
  for (let k = 0; k + 1 < PATH.length; k++) {
    const p0 = P(k - 1)
    const p1 = P(k)
    const p2 = P(k + 1)
    const p3 = P(k + 2)
    const n = Math.max(3, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.13))
    for (let i = 0; i < n; i++) {
      const t = i / n
      const x = catmull(p0[0], p1[0], p2[0], p3[0], t)
      const z = catmull(p0[1], p1[1], p2[1], p3[1], t)
      out.push({ x, y: kit.groundAt(x, z), z, span: k })
    }
  }
  const last = PATH[PATH.length - 1] as XZ
  out.push({ x: last[0], y: kit.groundAt(last[0], last[1]), z: last[1], span: PATH.length - 2 })
  return out
}

function catmull(a: number, b: number, c: number, d: number, t: number): number {
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t)
}

function nearestSample(samples: readonly Sample[], p: XZ): number {
  let best = 0
  let bestD = Infinity
  samples.forEach((s, i) => {
    const d = (s.x - p[0]) ** 2 + (s.z - p[1]) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/** a から b への向き（rotY の度。座標の +X がこの向きになる） */
function headingDeg(a: Sample, b: Sample): number {
  return (Math.atan2(-(b.z - a.z), b.x - a.x) * 180) / Math.PI
}

/** 傾いた壁の上面が、水平な上面よりどれだけ高くなるか（斜めに切った分） */
function slopeLift(a: Sample, b: Sample): number {
  const L = Math.hypot(b.x - a.x, b.z - a.z)
  const phi = Math.atan2(b.y - a.y, L)
  return (SINK + WALL_UP) / Math.cos(phi) - (SINK + WALL_UP)
}

/** 2つの刻みの間の壁。尾根の傾きに合わせて傾けた箱と、通路の面 */
function wallSegment(kit: Kit, a: Sample, b: Sample): void {
  const L = Math.hypot(b.x - a.x, b.z - a.z)
  const len = Math.hypot(L, b.y - a.y)
  const slope = (Math.atan2(b.y - a.y, L) * 180) / Math.PI
  kit.at({ at: [(a.x + b.x) / 2, (a.y + b.y) / 2 - SINK, (a.z + b.z) / 2], rotY: headingDeg(a, b) }, () =>
    kit.at({ rot: [0, 0, slope] }, () => {
      kit.box({ w: len + 0.05, h: SINK + WALL_UP, d: WALL_W, color: BRICK })
      kit.box({ w: len + 0.05, h: 0.012, d: WALL_W - 0.05, at: [0, SINK + WALL_UP, 0], color: WALK })
    }),
  )
}

/** 壁の外側（手前）の凸凹の胸壁と、内側の低い手すり（望楼の中に入る分は望楼に隠れる） */
function battlements(kit: Kit, a: Sample, b: Sample): void {
  const L = Math.hypot(b.x - a.x, b.z - a.z)
  const phi = Math.atan2(b.y - a.y, L)
  const slope = (phi * 180) / Math.PI
  const H = SINK + WALL_UP
  kit.at({ at: [(a.x + b.x) / 2, (a.y + b.y) / 2 - SINK, (a.z + b.z) / 2], rotY: headingDeg(a, b) }, () => {
    const n = Math.max(1, Math.round(L / 0.075))
    for (let i = 0; i < n; i++) {
      const u = -L / 2 + (L * (i + 0.5)) / n
      const y = u * Math.tan(phi) + H / Math.cos(phi)
      kit.box({ w: 0.034, h: 0.05, d: 0.03, at: [u, y - 0.004, WALL_W / 2 - 0.015], color: BRICK })
    }
    kit.at({ rot: [0, 0, slope] }, () => kit.box({ w: L / Math.cos(phi) + 0.04, h: 0.026, d: 0.022, at: [0, H, -WALL_W / 2 + 0.011], color: BRICK }))
  })
}

/** 四角い望楼。s は道すじの点（地面の高さ）、heading は壁の向き。roofed で屋根の小屋を載せる */
function watchtower(kit: Kit, s: Sample, heading: number, roofed: boolean): void {
  const base = 0.16
  const H = base + TOWER_UP
  kit.at({ at: [s.x, s.y - base, s.z], rotY: heading }, () =>
    kit.part(() => {
      kit.box({ w: TOWER_W + 0.03, h: base + 0.08, d: TOWER_W + 0.03, color: BRICK_DARK })
      kit.box({ w: TOWER_W, h: H, d: TOWER_W, color: BRICK })
      // 上の床の張り出しと、四方の凸凹の胸壁
      kit.box({ w: TOWER_W + 0.03, h: 0.025, d: TOWER_W + 0.03, at: [0, H, 0], color: BRICK_DARK })
      for (let f = 0; f < 4; f++) {
        kit.at({ rotY: f * 90 }, () => {
          for (let i = 0; i < 4; i++) {
            const u = -TOWER_W / 2 + 0.03 + (i * (TOWER_W - 0.06)) / 3
            kit.box({ w: 0.04, h: 0.055, d: 0.03, at: [u, H + 0.025, TOWER_W / 2], color: BRICK })
          }
          // アーチの窓（2つ）
          for (const u of [-0.08, 0.08]) {
            plate(kit, roundArch(0.06, 0.05), 0.012, [u, base + 0.17, TOWER_W / 2 + 0.004], WINDOW)
          }
        })
      }
      if (roofed) {
        kit.box({ w: TOWER_W * 0.62, h: 0.1, d: TOWER_W * 0.5, at: [0, H + 0.025, 0], color: BRICK })
        kit.hipRoof({ w: TOWER_W * 0.62, d: TOWER_W * 0.5, h: 0.1, overhang: 0.04, at: [0, H + 0.125, 0], color: ROOF })
      }
    }),
  )
}

/** 半円のアーチの形（幅 w、立ち上がりの高さ s） */
function roundArch(w: number, s: number): XZ[] {
  const pts: XZ[] = [[w / 2, 0]]
  const n = 6
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * i) / n
    pts.push([(Math.cos(a) * w) / 2, s + (Math.sin(a) * w) / 2])
  }
  pts.push([-w / 2, 0])
  return pts
}

/** 正面から見た輪郭 points（[x, y]）を、奥行き depth の板にする。板は at を中心に Z の前後へ半分ずつ */
function plate(kit: Kit, points: readonly XZ[], depth: number, at: Vec3, color: string): void {
  kit.at({ at }, () => kit.extrude({ points, h: depth, rot: [-90, 0, 0], at: [0, 0, depth / 2], color }))
}

/** 地面に置く細長い帯（道）。from から to まで */
function strip(kit: Kit, from: XZ, to: XZ, width: number, color: string): void {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const len = Math.hypot(dx, dz)
  const rotY = (Math.atan2(dx, dz) * 180) / Math.PI
  kit.box({ w: width, h: 0.02, d: len + width * 0.5, at: [(from[0] + to[0]) / 2, 0, (from[1] + to[1]) / 2], rotY, color })
}

/** 観光バス（前は +Z を rotY で回した向き）。at は地面の点 */
function bus(kit: Kit, at: Vec3, rotY: number, color: string): void {
  kit.at({ at, rotY }, () =>
    kit.part(() => {
      kit.box({ w: 0.13, h: 0.03, d: 0.4, color: '#2E2F33' })
      kit.box({ w: 0.14, h: 0.12, d: 0.44, at: [0, 0.02, 0], color, finish: 'gloss' })
      kit.box({ w: 0.145, h: 0.04, d: 0.38, at: [0, 0.08, -0.01], color: '#34404E', finish: 'gloss' })
    }),
  )
}
