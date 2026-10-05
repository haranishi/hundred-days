// コロッセオ：楕円形の円形闘技場。外壁は4層（下の3層がアーチの列、いちばん上は小窓の壁）で、外周の約半分が欠けている。
// 長い軸は X 方向。いつもの角度の奥（右奥）に残った高い外壁、手前は欠けていて内側の低い輪と、段になった客席、
// 床をはがした闘技場の地下の壁が見える。手前左にコンスタンティヌスの凱旋門、まわりに石畳と道路、カサマツ。
// 白いうちは「楕円の段々の輪」と「アーチの無い輪の壁」まで（競技場一般と迷う）。
// 講評r1（7点・境目）：0.55 でアーチの列が出て決まっていた → 段階2は客席を囲む楕円の輪の壁だけにし、
// アーチの列（内の輪・外壁）と欠けた外壁・4層目の壁・控え壁・地下の壁はすべて段階3へ（旧：アーチの層は段階2）。
import { type Kit, type Vec3, type XZ } from './kit'

const TRAVERTINE = '#D8C9A8'
const INNER = '#C4B393'
const SEATS = '#B5A487'
const BRICK = '#B07A5A'
const HYPO = '#A8977A'
const DECK = '#9A7A55'
const PLAZA = '#BDB6A8'
const ROAD = '#8A8A8A'
const GRASS = '#7C9E52'
const WINDOW = '#6E6150'

/** 外壁（外の輪）の楕円の半径と、内の輪・闘技場の楕円 */
const RX = 3.55
const RZ = 2.95
const RX2 = 3.12
const RZ2 = 2.52
const RXA = 1.75
const RZA = 1.08

/** 層の高さ（下から3層のアーチ、4層目の壁）。全体の高さは長い軸の約4分の1 */
const STORY = 0.44
const BAND = 0.025
const ATTIC = 0.48

/** 外壁が残っている範囲（楕円の角度 t、0 が正面 +Z、90 が右 +X）。いつもの角度の奥が残る */
const KEEP_FROM = 62
const KEEP_TO = 232

/** 外の輪のアーチの数（全周） */
const OUTER_BAYS = 44
const INNER_BAYS = 38

interface Bay {
  /** 弦の中点 */
  x: number
  z: number
  /** 弦の長さ */
  w: number
  /** 外向きにする Y 軸まわりの回転（度） */
  rotY: number
  /** 中点の楕円の角度（度） */
  t: number
}

export function build(kit: Kit): void {
  kit.ground(PLAZA)
  const outer = bays(RX, RZ, OUTER_BAYS)
  const inner = bays(RX2, RZ2, INNER_BAYS)
  const kept = outer.filter((b) => inKeep(b.t))

  // ---- 段階1：石畳と道路と芝生、楕円の基壇、段になった客席の輪（白） ----
  kit.stage(1)
  kit.order(-1)
  roads(kit)
  kit.order(0)
  platform(kit)
  cavea(kit)

  // ---- 段階2：形の特徴＝客席を囲む楕円の輪の壁（全周・アーチなし）（白）。競技場一般と迷う形 ----
  kit.stage(2)
  ringWall(kit)

  // ---- 段階3：決め手の細部（白）＝輪の壁のアーチの列（全周2層）、奥に残った外壁のアーチ3層と4層目の小窓の壁、
  //      欠けた端の控え壁、闘技場の地下の壁と復元した床 ----
  kit.stage(3)
  for (let s = 0; s < 2; s++) chunked(inner, 4, (group) => kit.part(() => group.forEach((b) => arcadeBay(kit, b, s, 0.14, INNER, false))))
  for (let s = 0; s < 3; s++) {
    chunked(kept, 3, (group) =>
      kit.part(() =>
        group.forEach((b) => {
          if (storiesAt(b.t) > s) arcadeBay(kit, b, s, 0.17, TRAVERTINE, true)
        }),
      ),
    )
  }
  corridorFloors(kit, kept)
  chunked(kept, 3, (group) =>
    kit.part(() =>
      group.forEach((b) => {
        if (storiesAt(b.t) >= 4) attic(kit, b)
      }),
    ),
  )
  buttress(kit, KEEP_FROM, 1)
  buttress(kit, KEEP_TO, -1)
  hypogeum(kit)

  // ---- 段階4：周りの景色（色つき）＝凱旋門、カサマツ、車、人 ----
  kit.stage(4)
  scenery(kit)
}

// ===== 楕円の上の並び =====

function pointAt(rx: number, rz: number, tDeg: number): XZ {
  const t = (tDeg * Math.PI) / 180
  return [rx * Math.sin(t), rz * Math.cos(t)]
}

/** 楕円の全周を、弧の長さが等しい n 区画に分ける */
function bays(rx: number, rz: number, n: number): Bay[] {
  const steps = 1440
  const len: number[] = [0]
  let prev = pointAt(rx, rz, 0)
  for (let i = 1; i <= steps; i++) {
    const p = pointAt(rx, rz, (360 * i) / steps)
    len.push((len[i - 1] ?? 0) + Math.hypot(p[0] - prev[0], p[1] - prev[1]))
    prev = p
  }
  const total = len[steps] ?? 1
  const tAtLength = (s: number): number => {
    let k = 0
    while (k < steps && (len[k + 1] ?? total) < s) k++
    const a = len[k] ?? 0
    const b = len[k + 1] ?? total
    return ((k + (b > a ? (s - a) / (b - a) : 0)) * 360) / steps
  }
  const out: Bay[] = []
  for (let i = 0; i < n; i++) {
    const t0 = tAtLength((total * i) / n)
    const t1 = tAtLength((total * (i + 1)) / n)
    const p0 = pointAt(rx, rz, t0)
    const p1 = pointAt(rx, rz, t1)
    const cx = (p0[0] + p1[0]) / 2
    const cz = (p0[1] + p1[1]) / 2
    const dx = p1[0] - p0[0]
    const dz = p1[1] - p0[1]
    let rotY = (Math.atan2(-dz, dx) * 180) / Math.PI
    // 板の +Z（正面）が外を向くように
    const fx = Math.sin((rotY * Math.PI) / 180)
    const fz = Math.cos((rotY * Math.PI) / 180)
    if (fx * cx + fz * cz < 0) rotY += 180
    out.push({ x: cx, z: cz, w: Math.hypot(dx, dz), rotY, t: (t0 + t1) / 2 })
  }
  return out
}

function inKeep(t: number): boolean {
  return t >= KEEP_FROM && t <= KEEP_TO
}

/** 外壁の残っている層の数。両端は段々に低くなる（欠けた端） */
function storiesAt(t: number): number {
  const edge = Math.min(t - KEEP_FROM, KEEP_TO - t)
  if (edge < 4) return 2
  if (edge < 8) return 3
  return 4
}

/** 配列を k 個ずつの組に分けて fn に渡す（1つの組＝1つの部品） */
function chunked<T>(items: readonly T[], k: number, fn: (group: T[]) => void): void {
  for (let i = 0; i < items.length; i += k) fn(items.slice(i, i + k))
}

/** 楕円の区画 b の中の座標で作る（+Z が外向き） */
function onBay(kit: Kit, b: Bay, fn: () => void): void {
  kit.at({ at: [b.x, 0, b.z], rotY: b.rotY }, fn)
}

// ===== 闘技場の本体 =====

/** アーチの1区画（層 s）。外壁には柱の浮き彫りと層の境の帯を付ける */
function arcadeBay(kit: Kit, b: Bay, s: number, d: number, color: string, columns: boolean): void {
  onBay(kit, b, () => {
    const y = s * (STORY + BAND)
    kit.arch({ w: b.w + 0.006, h: STORY, d, thick: 0.07, at: [0, y, 0], seg: 6, color })
    kit.box({ w: b.w + 0.012, h: BAND, d: d + 0.04, at: [0, y + STORY, 0], color })
    if (columns) kit.box({ w: 0.045, h: STORY, d: 0.035, at: [b.w / 2, y, d / 2 + 0.012], color })
  })
}

/** 4層目：小窓のある閉じた壁と、てっぺんの軒 */
function attic(kit: Kit, b: Bay): void {
  onBay(kit, b, () => {
    const y = 3 * (STORY + BAND)
    kit.box({ w: b.w + 0.006, h: ATTIC, d: 0.17, at: [0, y, 0], color: TRAVERTINE })
    kit.box({ w: 0.045, h: ATTIC, d: 0.035, at: [b.w / 2, y, 0.1], color: TRAVERTINE })
    if (Math.round(b.t) % 2 === 0) kit.box({ w: 0.1, h: 0.13, d: 0.02, at: [0, y + 0.2, 0.086], color: WINDOW })
    kit.box({ w: b.w + 0.012, h: 0.05, d: 0.23, at: [0, y + ATTIC, 0], color: TRAVERTINE })
  })
}

/**
 * 段階2の輪の壁：内の輪の位置に、アーチの無い平らな壁を全周に立てる（8つの部品に分けて順に積む）。
 * 段階3のアーチの列は、この壁に外から重なる。壁の外の面はアーチの表の面より 0.1 奥で、アーチの穴の奥に見える。
 * アーチの裏の面は壁の厚みの中に埋まる。面がちらつかないよう、壁の上の面はアーチの帯の上より 0.012 低くする
 */
function ringWall(kit: Kit): void {
  const n = 48
  const h = 2 * (STORY + BAND) - 0.012
  for (let c = 0; c < 8; c++) {
    kit.part(() => {
      for (let i = c * 6; i < (c + 1) * 6; i++) {
        const t0 = (360 * i) / n
        const t1 = (360 * (i + 1)) / n
        kit.extrude({ points: quad(RX2 - 0.03, RZ2 - 0.03, RX2 - 0.1, RZ2 - 0.1, t0, t1), h, color: INNER })
      }
    })
  }
}

/** 外壁と内の輪の間の通路の床（残った側だけ、各層の高さに） */
function corridorFloors(kit: Kit, kept: readonly Bay[]): void {
  kit.part(() => {
    for (const b of kept) {
      const levels = storiesAt(b.t) - 1
      for (let s = 1; s <= Math.min(2, levels); s++) {
        const y = s * (STORY + BAND) - 0.02
        const t0 = b.t - 180 / OUTER_BAYS
        const t1 = b.t + 180 / OUTER_BAYS
        kit.extrude({ points: quad(RX - 0.05, RZ - 0.05, RX2, RZ2, t0, t1), h: 0.03, at: [0, y, 0], color: INNER })
      }
    }
  })
}

/** 2つの楕円の間の、角度 t0〜t1 の四角形（上から見た輪郭） */
function quad(rxO: number, rzO: number, rxI: number, rzI: number, t0: number, t1: number): XZ[] {
  return [pointAt(rxI, rzI, t0), pointAt(rxO, rzO, t0), pointAt(rxO, rzO, t1), pointAt(rxI, rzI, t1)]
}

/** 楕円の基壇（外壁のまわりの2段） */
function platform(kit: Kit): void {
  kit.part(() => {
    const n = 48
    for (let i = 0; i < n; i++) {
      const t0 = (360 * i) / n
      const t1 = (360 * (i + 1)) / n
      kit.extrude({ points: quad(RX + 0.32, RZ + 0.32, RX - 0.3, RZ - 0.3, t0, t1), h: 0.03, color: TRAVERTINE })
      kit.extrude({ points: quad(RX + 0.16, RZ + 0.16, RX - 0.3, RZ - 0.3, t0, t1), h: 0.06, color: TRAVERTINE })
    }
  })
}

/** 段になった客席（闘技場のふちから内の輪へ上がる5段）。手前の欠けた側は上の段がところどころ崩れている */
function cavea(kit: Kit): void {
  const tiers = 5
  const n = 40
  for (let k = 0; k < tiers; k++) {
    const u0 = k / tiers
    const u1 = (k + 1) / tiers
    const h = 0.24 + ((0.88 - 0.24) * (k + 1)) / tiers
    const rx0 = RXA + (RX2 - 0.07 - RXA) * u0
    const rz0 = RZA + (RZ2 - 0.07 - RZA) * u0
    const rx1 = RXA + (RX2 - 0.07 - RXA) * u1
    const rz1 = RZA + (RZ2 - 0.07 - RZA) * u1
    kit.part(() => {
      for (let i = 0; i < n; i++) {
        const t0 = (360 * i) / n
        const t1 = (360 * (i + 1)) / n
        const mid = (t0 + t1) / 2
        // 欠けた側の上の2段は、ところどころ低く崩す
        const broken = !inKeep(mid) && k >= 3 && kit.chance(0.45)
        kit.extrude({ points: quad(rx1, rz1, rx0, rz0, t0, t1), h: broken ? h - 0.16 : h, color: k % 2 === 0 ? SEATS : INNER })
      }
    })
  }
  // 客席の下の放射状の壁（崩れた側で、段の上に突き出す）
  kit.part(() => {
    for (let i = 0; i < 40; i += 2) {
      const t = (360 * i) / 40
      if (inKeep(t)) continue
      const a = pointAt(RXA + (RX2 - RXA) * 0.45, RZA + (RZ2 - RZA) * 0.45, t)
      const b = pointAt(RX2 - 0.1, RZ2 - 0.1, t)
      kit.beam({ from: [a[0], 0.5, a[1]], to: [b[0], 0.86, b[1]], size: 0.05, width: 0.05, color: SEATS })
    }
  })
}

/** 外壁の欠けた端を支える控え壁（煉瓦）。dir は残った側から外へ向かう向き（-1 か 1） */
function buttress(kit: Kit, t: number, dir: number): void {
  const edge = t - dir * 1.5
  const p = pointAt(RX + 0.02, RZ + 0.02, edge)
  const ang = (Math.atan2(p[0] / (RX * RX), p[1] / (RZ * RZ)) * 180) / Math.PI
  kit.part(() =>
    kit.at({ at: [p[0], 0, p[1]], rotY: ang }, () => {
      for (let k = 0; k < 4; k++) {
        const h = 0.84 - k * 0.2
        kit.box({ w: 0.2, h, d: 0.28, at: [-dir * (0.12 + k * 0.17), 0, -0.05], color: BRICK })
      }
    }),
  )
}

/** 闘技場：床をはがした地下の壁の迷路と、東の端の復元した床 */
function hypogeum(kit: Kit): void {
  kit.part(() => {
    const h = 0.14
    for (const z of [-0.88, -0.65, -0.4, -0.12, 0.12, 0.4, 0.65, 0.88]) {
      const half = RXA * Math.sqrt(Math.max(0, 1 - (z / RZA) ** 2)) - 0.06
      if (half < 0.1) continue
      kit.box({ w: half * 2, h, d: 0.04, at: [0, 0, z], color: HYPO })
    }
    for (const x of [-1.35, -0.95, -0.5, 0.5, 0.95]) {
      const half = RZA * Math.sqrt(Math.max(0, 1 - (x / RXA) ** 2)) - 0.06
      kit.box({ w: 0.04, h, d: half * 2, at: [x, 0, 0], color: HYPO })
    }
  })
  // 復元した床（東の端）
  const pts: XZ[] = []
  for (let i = 0; i <= 12; i++) {
    const t = 50 + (80 * i) / 12
    pts.push(pointAt(RXA - 0.02, RZA - 0.02, t))
  }
  pts.push([1.15, pointAt(RXA, RZA, 130)[1]])
  pts.push([1.15, pointAt(RXA, RZA, 50)[1]])
  kit.extrude({ points: pts, h: 0.03, at: [0, 0.14, 0], color: DECK })
}

// ===== まわり =====

/** 石畳のまわりの道路（白いうちは平らな帯） */
function roads(kit: Kit): void {
  kit.appear('grow')
  kit.extrude({ points: clipStrip(-4.25, -3.75), h: 0.02, color: ROAD })
  strip(kit, [3.3, -3.2], [4.4, 1.1], 0.42, ROAD)
  // 芝生（南のパラティーノの丘のふもとと、北の公園）
  for (const [t0, t1] of LAWNS) kit.extrude({ points: lawnPatch(t0, t1), h: 0.015, color: GRASS })
  kit.appear('drop')
}

/** 芝生の範囲（楕円の角度 t0〜t1）。基壇の外から台座のふちの手前まで */
const LAWNS: readonly (readonly [number, number])[] = [
  [22, 68],
  [198, 252],
  [262, 296],
]

function lawnPatch(t0: number, t1: number): XZ[] {
  const inner: XZ[] = []
  const outer: XZ[] = []
  const n = 10
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n
    const [x, z] = pointAt(RX + 0.48, RZ + 0.48, t)
    inner.push([x, z])
    const r = 4.55
    const a = Math.atan2(x, z)
    const ox = Math.sin(a) * r
    const oz = Math.max(-3.62, Math.cos(a) * r)
    outer.push([ox, oz])
  }
  return [...inner, ...outer.reverse()]
}

/** 台座の円に収まる横長の帯（z0〜z1） */
function clipStrip(z0: number, z1: number): XZ[] {
  const r = 4.9
  const half = (z: number) => Math.sqrt(Math.max(0, r * r - z * z))
  return [
    [-half(z1), z1],
    [-half(z0), z0],
    [half(z0), z0],
    [half(z1), z1],
  ]
}

function strip(kit: Kit, from: XZ, to: XZ, width: number, color: string): void {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const len = Math.hypot(dx, dz)
  const rotY = (Math.atan2(dx, dz) * 180) / Math.PI
  kit.box({ w: width, h: 0.02, d: len, at: [(from[0] + to[0]) / 2, 0, (from[1] + to[1]) / 2], rotY, color })
}

function scenery(kit: Kit): void {
  constantine(kit, [-2.95, 0, 3.05])
  // カサマツ（まっすぐな幹に平たい傘の形の葉）。芝生の上と道路ぞい
  for (const [x, z, h] of [
    [-4.2, -1.6, 0.85],
    [-3.55, -2.65, 0.95],
    [-2.55, -3.25, 0.8],
    [-3.1, -2.05, 0.7],
    [-4.35, -0.55, 0.75],
    [-4.3, 0.55, 0.8],
    [3.95, -2.15, 0.9],
    [4.1, 1.75, 0.8],
    [3.55, 2.75, 0.85],
    [2.75, 3.25, 0.7],
    [1.5, 3.85, 0.75],
    [2.3, 3.75, 0.8],
  ] as const) {
    stonePine(kit, [x, 0, z], h)
  }
  // 車（奥の道路と右の道路）
  for (const [x, z, r] of [
    [-2.2, -4.12, 90],
    [-0.6, -3.88, -90],
    [1.3, -4.12, 90],
    [3.76, -1.4, 14],
    [4.17, 0.2, 194],
  ] as const) {
    kit.car({ at: [x, 0.02, z], rotY: r })
  }
  // 人：広場、凱旋門のまわり、闘技場の復元した床と客席の上
  for (const [x, z] of [
    [-1.6, 3.4],
    [-1.2, 3.65],
    [-0.5, 3.35],
    [0.3, 3.55],
    [1.0, 3.3],
    [-2.2, 3.9],
    [-3.6, 2.2],
    [-4.0, 0.6],
    [2.9, 2.4],
    [-1.0, -3.45],
    [0.6, -3.35],
    [-2.6, 3.7],
    [-0.9, 3.95],
    [0.8, 3.75],
    [-3.3, 1.5],
    [3.7, -0.4],
    [-1.8, -3.5],
  ] as const) {
    kit.person({ at: [x, 0.02, z], rotY: kit.range(0, 360) })
  }
  for (const [x, z] of [
    [1.35, 0.1],
    [1.5, -0.3],
    [1.25, 0.45],
  ] as const) {
    kit.person({ at: [x, 0.17, z], rotY: kit.range(0, 360) })
  }
}

/** コンスタンティヌスの凱旋門：真ん中の大きなアーチと左右の小さなアーチ、上の屋階 */
function constantine(kit: Kit, at: Vec3): void {
  kit.part(() =>
    kit.at({ at, rotY: 8 }, () => {
      const c = { color: '#E2D8C3' }
      kit.arch({ w: 0.44, h: 0.56, d: 0.3, thick: 0.08, seg: 8, ...c })
      kit.arch({ w: 0.28, h: 0.56, d: 0.3, thick: 0.06, at: [-0.36, 0, 0], seg: 6, ...c })
      kit.arch({ w: 0.28, h: 0.56, d: 0.3, thick: 0.06, at: [0.36, 0, 0], seg: 6, ...c })
      kit.box({ w: 1.0, h: 0.05, d: 0.34, at: [0, 0.56, 0], ...c })
      kit.box({ w: 0.98, h: 0.24, d: 0.3, at: [0, 0.61, 0], ...c })
      kit.box({ w: 1.02, h: 0.035, d: 0.33, at: [0, 0.85, 0], ...c })
      // 正面の4本の柱
      for (const x of [-0.46, -0.215, 0.215, 0.46]) {
        kit.cylinder({ r: 0.028, h: 0.52, at: [x, 0.02, 0.17], seg: 8, color: '#D9CDB6' })
      }
    }),
  )
}

/** カサマツ */
function stonePine(kit: Kit, at: Vec3, h: number): void {
  kit.part(
    () =>
      kit.at({ at }, () => {
        kit.cylinder({ r: 0.035 * h, rTop: 0.025 * h, h: 0.78 * h, seg: 6, color: '#7A5E45' })
        kit.sphere({ r: 0.36 * h, squash: 0.32, at: [0, 0.7 * h, 0], seg: 10, color: '#3F6B3A' })
        kit.sphere({ r: 0.24 * h, squash: 0.36, at: [0.08 * h, 0.8 * h, 0.03 * h], seg: 9, color: '#477540' })
      }),
    { appear: 'grow' },
  )
}
