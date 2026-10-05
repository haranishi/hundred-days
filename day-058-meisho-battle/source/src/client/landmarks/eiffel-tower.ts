// エッフェル塔：地面で大きく開く4本の脚が上でまとまる茶色の鉄の格子塔。脚の間のアーチ、展望台は3段。
// 正面（+Z）がシャン・ド・マルス公園と並木、奥（-Z）がセーヌ川とイエナ橋。左右にパリの石の街並み。
// 白いうちは「4本脚の格子の鉄塔」まで（東京タワーと迷う）。脚の間のアーチと3段の展望台（段階3）、
// 色塗りの茶色（縞なし）、川と並木と石の街並み（段階4）で決まる。昼の姿だけを作り、照明は作らない（research/rights.md）。
import { COLORS, type Finish, type Kit, type Vec3, type XZ } from './kit'

/** 塗装は下から上へ少しずつ明るくなる3つの茶色 */
const BROWN_LOW = '#654F3C'
const BROWN_MID = '#755E48'
const BROWN_TOP = '#867058'
const PIER = '#B9AE98'
const GRAVEL = '#D9CCB0'
const RIVER = '#4A7F9A'
const CREAM = '#E6DAC2'
const MANSARD = '#5D6873'

type Table = readonly (readonly [number, number])[]

/** 高さ y での塔の外側の半幅（脚の外の角）。地面で大きく開き、上ほど細い */
const OUTER: Table = [
  [0, 1.2],
  [0.25, 1.04],
  [0.5, 0.9],
  [0.75, 0.78],
  [1.0, 0.68],
  [1.5, 0.52],
  [2.02, 0.39],
  [2.5, 0.33],
  [3.0, 0.285],
  [3.5, 0.245],
  [4.0, 0.21],
  [4.5, 0.18],
  [4.8, 0.165],
]

/** 高さ y での脚1本の太さ（第2展望台より上は4本がまとまって1本の塔になる） */
const LEG_W: Table = [
  [0, 0.46],
  [0.5, 0.38],
  [1.0, 0.31],
  [1.5, 0.25],
  [2.02, 0.2],
]

/** 展望台の高さ（高さの約0.17・0.35・0.84） */
const DECK1 = 0.97
const DECK2 = 2.0
const DECK3 = 4.8

/** 脚の4つの向き（上から見た角） */
const CORNERS: readonly XZ[] = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
]

export function build(kit: Kit): void {
  kit.ground(COLORS.lawn)

  // ---- 段階1：地面の形と、脚の下半分（白） ----
  kit.stage(1)
  kit.order(-1)
  ground(kit)
  kit.order(0)
  // 脚の足もとの石の台
  for (const [sx, sz] of CORNERS) {
    const c = 1.2 - 0.23
    kit.box({ w: 0.56, h: 0.07, d: 0.56, at: [sx * c, 0, sz * c], color: PIER })
  }
  for (const corner of CORNERS) {
    leg(kit, corner, [0, 0.5], { post: 0.06, member: 0.024, color: BROWN_LOW, bottom: true })
    leg(kit, corner, [0.5, DECK1 + 0.03], { post: 0.05, member: 0.021, color: BROWN_LOW })
  }

  // ---- 段階2：形の特徴＝上へ細くなる格子の塔（白）。展望台はまだ出さない ----
  kit.stage(2)
  for (const corner of CORNERS) {
    leg(kit, corner, [DECK1 + 0.03, 1.5], { post: 0.044, member: 0.019, color: BROWN_MID })
    leg(kit, corner, [1.5, DECK2 + 0.02], { post: 0.04, member: 0.017, color: BROWN_MID })
  }
  const shaft: readonly (readonly [number, number, string])[] = [
    [DECK2 + 0.02, 2.6, BROWN_MID],
    [2.6, 3.2, BROWN_MID],
    [3.2, 3.8, BROWN_TOP],
    [3.8, 4.3, BROWN_TOP],
    [4.3, DECK3, BROWN_TOP],
  ]
  shaft.forEach(([y0, y1, color], i) => {
    kit.part(() =>
      frame(kit, [square(y0), square(y1)], { post: 0.034 - i * 0.002, member: 0.014 - i * 0.0008, bays: 2, color, bottom: i === 0 }),
    )
  })

  // ---- 段階3：決め手の細部（白）＝脚の間のアーチ、3段の展望台、てっぺんの塔屋とアンテナ ----
  kit.stage(3)
  for (let k = 0; k < 4; k++) kit.at({ rotY: 90 * k }, () => arch(kit))
  deckRing(kit, DECK1, 0.13, 0.78, 0.26, BROWN_LOW)
  deckRing(kit, DECK2, 0.09, 0.47, 0.16, BROWN_MID)
  top(kit)

  // ---- 段階4：周りの景色（色つき）＝並木・石の街並み・イエナ橋・川の遊覧船・車・人 ----
  kit.stage(4)
  scenery(kit)
}

// ===== 塔 =====

function lerpTable(table: Table, y: number): number {
  for (let i = 1; i < table.length; i++) {
    const [y1, v1] = table[i] as readonly [number, number]
    const [y0, v0] = table[i - 1] as readonly [number, number]
    if (y <= y1) return v0 + ((v1 - v0) * (y - y0)) / (y1 - y0)
  }
  return (table[table.length - 1] as readonly [number, number])[1]
}

/** 高さ y での塔全体の4つの角（上から見て反時計回り） */
function square(y: number): Vec3[] {
  const h = lerpTable(OUTER, y)
  return CORNERS.map(([sx, sz]): Vec3 => [sx * h, y, sz * h])
}

/** 高さ y での脚1本の4つの角。外の角は塔の輪郭に沿い、内の角は脚の太さだけ中心へ寄る */
function legRing(corner: XZ, y: number): Vec3[] {
  const [sx, sz] = corner
  const o = lerpTable(OUTER, y)
  const i = o - lerpTable(LEG_W, y)
  return [
    [sx * o, y, sz * o],
    [sx * i, y, sz * o],
    [sx * i, y, sz * i],
    [sx * o, y, sz * i],
  ]
}

interface FrameOpts {
  post: number
  member: number
  color: string
  bays?: number
  bottom?: boolean
  finish?: Finish
}

/** 脚1本の y0〜y1 の区間を、1つの部品の格子にする */
function leg(kit: Kit, corner: XZ, [y0, y1]: readonly [number, number], o: FrameOpts): void {
  kit.part(() => frame(kit, [legRing(corner, y0), legRing(corner, y1)], o))
}

function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** 4つの角の輪を下から順につなぎ、角の柱・X字の筋かい・横材の格子にする */
function frame(kit: Kit, rings: readonly (readonly Vec3[])[], o: FrameOpts): void {
  const look = { color: o.color, finish: o.finish ?? ('satin' as const) }
  const bays = o.bays ?? 1
  for (let k = 0; k + 1 < rings.length; k++) {
    const a = rings[k] as readonly Vec3[]
    const b = rings[k + 1] as readonly Vec3[]
    for (let c = 0; c < 4; c++) {
      const c2 = (c + 1) % 4
      const a0 = a[c] as Vec3
      const a1 = a[c2] as Vec3
      const b0 = b[c] as Vec3
      const b1 = b[c2] as Vec3
      kit.beam({ from: a0, to: b0, size: o.post, ...look })
      for (let s = 0; s < bays; s++) {
        const p0 = mix(a0, b0, s / bays)
        const p1 = mix(a0, b0, (s + 1) / bays)
        const q0 = mix(a1, b1, s / bays)
        const q1 = mix(a1, b1, (s + 1) / bays)
        kit.beam({ from: p0, to: q1, size: o.member, ...look })
        kit.beam({ from: q0, to: p1, size: o.member, ...look })
        kit.beam({ from: p1, to: q1, size: o.member * 1.3, ...look })
      }
      if (k === 0 && o.bottom) kit.beam({ from: a0, to: a1, size: o.member * 1.3, ...look })
    }
  }
}

/** 正面（+Z）の脚の間のアーチ。塔の面の傾きに合わせて奥へ倒す */
function arch(kit: Kit): void {
  const ys = 0.3
  const zs = lerpTable(OUTER, ys) - 0.04
  const zTop = lerpTable(OUTER, 0.88) - 0.04
  const tilt = (Math.atan2(zs - zTop, 0.88 - ys) * 180) / Math.PI
  const pts: XZ[] = []
  const n = 16
  const rOut = 0.67
  const rIn = 0.54
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * i) / n
    pts.push([Math.cos(a) * rOut, Math.sin(a) * rOut * 0.95])
  }
  for (let i = n; i >= 0; i--) {
    const a = (Math.PI * i) / n
    pts.push([Math.cos(a) * rIn, Math.sin(a) * rIn * 0.95])
  }
  kit.at({ at: [0, ys, zs], rot: [-tilt, 0, 0] }, () => plate(kit, pts, 0.07, BROWN_LOW))
}

/** 正面から見た輪郭 points（[x, y]）を、奥行き depth の板にする（板の中心は z=0） */
function plate(kit: Kit, points: readonly XZ[], depth: number, color: string): void {
  kit.extrude({ points, h: depth, rot: [-90, 0, 0], at: [0, 0, depth / 2], color, finish: 'satin' })
}

/** 展望台：中が空いた四角い輪の床（外の半幅 outer、帯の幅 band）と、外まわりの手すり */
function deckRing(kit: Kit, y: number, h: number, outer: number, band: number, color: string): void {
  kit.part(() => {
    const c = outer - band / 2
    const look = { color, finish: 'satin' as const }
    kit.box({ w: outer * 2, h, d: band, at: [0, y, c], ...look })
    kit.box({ w: outer * 2, h, d: band, at: [0, y, -c], ...look })
    kit.box({ w: band, h, d: outer * 2 - band * 2, at: [c, y, 0], ...look })
    kit.box({ w: band, h, d: outer * 2 - band * 2, at: [-c, y, 0], ...look })
    // 手すり（外のふち）
    const r = outer - 0.012
    const t = 0.02
    kit.box({ w: outer * 2, h: 0.04, d: t, at: [0, y + h, r], ...look })
    kit.box({ w: outer * 2, h: 0.04, d: t, at: [0, y + h, -r], ...look })
    kit.box({ w: t, h: 0.04, d: outer * 2, at: [r, y + h, 0], ...look })
    kit.box({ w: t, h: 0.04, d: outer * 2, at: [-r, y + h, 0], ...look })
  })
}

/** 第3展望台の箱、その上の細い塔屋、アンテナ */
function top(kit: Kit): void {
  kit.part(() => {
    const look = { color: BROWN_TOP, finish: 'satin' as const }
    kit.box({ w: 0.38, h: 0.13, d: 0.38, at: [0, DECK3, 0], ...look })
    kit.box({ w: 0.46, h: 0.03, d: 0.46, at: [0, DECK3 + 0.13, 0], ...look })
    frame(kit, [squareAt(DECK3 + 0.16, 0.11), squareAt(DECK3 + 0.42, 0.075)], { post: 0.022, member: 0.01, color: BROWN_TOP, bottom: true })
    kit.box({ w: 0.17, h: 0.06, d: 0.17, at: [0, DECK3 + 0.42, 0], ...look })
    kit.sphere({ r: 0.07, squash: 0.6, at: [0, DECK3 + 0.47, 0], seg: 10, ...look })
  })
  kit.part(() => {
    const y = DECK3 + 0.53
    kit.cylinder({ r: 0.026, rTop: 0.016, h: 0.42, at: [0, y, 0], seg: 8, color: '#8C8C88', finish: 'metal' })
    kit.cylinder({ r: 0.04, h: 0.04, at: [0, y + 0.12, 0], seg: 8, color: '#9A9A96', finish: 'metal' })
    kit.cylinder({ r: 0.034, h: 0.035, at: [0, y + 0.26, 0], seg: 8, color: '#9A9A96', finish: 'metal' })
  })
}

function squareAt(y: number, h: number): Vec3[] {
  return CORNERS.map(([sx, sz]): Vec3 => [sx * h, y, sz * h])
}

// ===== 地面と景色 =====

/** 段階1の地面：塔の下の広場、公園の砂利道、川、川沿いの道、左右の大通り（白いうちは平らな形だけ） */
function ground(kit: Kit): void {
  kit.appear('grow')
  // 塔の下の広場
  kit.box({ w: 3.3, h: 0.02, d: 3.0, at: [0, 0, 0.1], color: GRAVEL })
  // シャン・ド・マルス公園の砂利道（長い2本と横の1本）
  kit.box({ w: 0.3, h: 0.02, d: 3.0, at: [-1.25, 0, 3.1], color: GRAVEL })
  kit.box({ w: 0.3, h: 0.02, d: 3.0, at: [1.25, 0, 3.1], color: GRAVEL })
  kit.box({ w: 2.2, h: 0.02, d: 0.24, at: [0, 0, 3.2], color: GRAVEL })
  // 川沿いの道と、公園の左右の大通り
  kit.extrude({ points: clipStrip(-2.18, -1.86), h: 0.022, color: COLORS.road })
  kit.box({ w: 0.32, h: 0.022, d: 5.6, at: [-2.35, 0, 1.0], color: COLORS.road })
  kit.box({ w: 0.32, h: 0.022, d: 5.6, at: [2.35, 0, 1.0], color: COLORS.road })
  // 対岸（トロカデロ）の池
  kit.box({ w: 0.6, h: 0.02, d: 0.8, at: [0, 0, -4.05], color: COLORS.stone })
  kit.water({ points: clipStrip(-3.3, -2.3), h: 0.03, color: RIVER })
  kit.water({ points: rect(0, -4.05, 0.46, 0.66), h: 0.035, color: RIVER })
  kit.appear('drop')
}

/** 台座の円に収まる横長の帯（z0〜z1、x は円の内側いっぱい） */
function clipStrip(z0: number, z1: number): XZ[] {
  const r = 4.9
  const half = (z: number) => Math.sqrt(Math.max(0, r * r - z * z))
  const zFar = Math.abs(z0) > Math.abs(z1) ? z0 : z1
  const zNear = zFar === z0 ? z1 : z0
  const xFar = half(zFar)
  const xNear = half(zNear)
  return [
    [-xNear, zNear],
    [-xFar, zFar],
    [xFar, zFar],
    [xNear, zNear],
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

function scenery(kit: Kit): void {
  // シャン・ド・マルス公園の並木（左右に2列ずつ）
  for (const x of [-1.95, -1.6, 1.6, 1.95]) {
    for (let k = 0; k < 6; k++) {
      const z = 1.85 + k * 0.48
      if (Math.hypot(x, z) > 4.55) continue
      kit.tree({ kind: 'round', h: kit.range(0.46, 0.56), at: [x, 0, z], color: kit.pick(['#5E8F45', '#6A9A4B', '#557F40']) })
    }
  }
  // 塔のまわりの庭の木
  for (const [x, z] of [
    [-1.85, -1.2],
    [-2.0, -0.4],
    [1.85, -1.25],
    [2.0, -0.45],
    [-1.75, 0.9],
    [1.8, 0.95],
  ] as const) {
    kit.tree({ kind: 'round', h: kit.range(0.5, 0.62), at: [x, 0, z], color: '#557F40' })
  }
  // 対岸の木
  for (const [x, z] of [
    [-1.3, -3.75],
    [-0.75, -4.4],
    [1.3, -3.75],
    [0.75, -4.4],
    [-2.2, -3.6],
    [2.2, -3.6],
  ] as const) {
    kit.tree({ kind: 'round', h: kit.range(0.42, 0.52), at: [x, 0, z], color: '#5E8F45' })
  }
  // パリの石の街並み（クリーム色の壁と灰青のマンサード屋根）
  const blocks: readonly (readonly [number, number, number, number, number])[] = [
    [3.25, -1.0, 0.85, 0.9, 0.4],
    [3.35, 0.25, 0.9, 1.1, 0.42],
    [3.2, 1.6, 0.85, 1.0, 0.4],
    [2.95, 2.85, 0.7, 0.9, 0.38],
    [4.25, -0.35, 0.5, 1.1, 0.37],
    [4.15, 1.0, 0.5, 1.0, 0.37],
    [-3.25, -1.0, 0.85, 0.9, 0.42],
    [-3.35, 0.25, 0.9, 1.1, 0.4],
    [-3.2, 1.6, 0.85, 1.0, 0.4],
    [-2.95, 2.85, 0.7, 0.9, 0.38],
    [-4.25, -0.35, 0.5, 1.1, 0.37],
    [-4.15, 1.0, 0.5, 1.0, 0.37],
  ]
  for (const [x, z, w, d, h] of blocks) building(kit, x, z, w, d, h)
  // イエナ橋（石のアーチ橋）
  kit.part(() => {
    const stone = { color: '#CFC5B1' }
    kit.box({ w: 0.55, h: 0.05, d: 1.5, at: [0, 0.1, -2.75], ...stone })
    for (const z of [-2.45, -2.75, -3.05]) kit.box({ w: 0.5, h: 0.11, d: 0.09, at: [0, 0, z], ...stone })
    kit.box({ w: 0.04, h: 0.04, d: 1.5, at: [-0.255, 0.15, -2.75], ...stone })
    kit.box({ w: 0.04, h: 0.04, d: 1.5, at: [0.255, 0.15, -2.75], ...stone })
  })
  // 川の遊覧船
  kit.boat({ kind: 'ship', at: [-2.1, 0.03, -2.8], rotY: 90, len: 0.85 })
  kit.boat({ kind: 'ship', at: [2.3, 0.03, -2.72], rotY: -90, len: 0.75 })
  // 車（川沿いの道と左右の大通り）
  for (const [x, z, r] of [
    [-3.2, -2.1, 90],
    [-0.9, -1.94, -90],
    [1.4, -2.1, 90],
    [3.3, -1.94, -90],
    [-2.42, 0.6, 0],
    [-2.28, 2.3, 180],
    [2.28, -0.4, 180],
    [2.42, 1.9, 0],
  ] as const) {
    kit.car({ at: [x, 0.022, z], rotY: r })
  }
  // 人：塔の下の広場、公園の芝生と道、橋の上
  for (const [x, z] of [
    [-0.3, 0.2],
    [0.25, -0.1],
    [0.05, 0.55],
    [-0.55, -0.45],
    [0.6, 0.4],
    [-0.15, 1.3],
    [0.45, 1.45],
    [-1.2, 2.2],
    [-1.3, 2.9],
    [1.2, 2.5],
    [1.28, 3.6],
    [-0.4, 2.7],
    [0.5, 3.05],
    [0.1, 3.9],
    [-0.08, -2.4],
    [0.1, -3.0],
  ] as const) {
    kit.person({ at: [x, 0.02, z], rotY: kit.range(0, 360) })
  }
}

/** パリの集合住宅：クリーム色の石の壁に縦長の窓が並び、1階は店、上に石の軒と灰青のマンサード屋根 */
function building(kit: Kit, x: number, z: number, w: number, d: number, h: number): void {
  kit.part(() => {
    kit.box({ w, h, d, at: [x, 0, z], color: CREAM, finish: 'satin' })
    kit.box({ w: w + 0.012, h: 0.06, d: d + 0.012, at: [x, 0.015, z], color: '#8C8176' })
    // 4つの面に、縦長の窓を3段
    const win = { color: '#6F6A64' }
    for (const [len, along, side] of [
      [w, 'x', d / 2],
      [w, 'x', -d / 2],
      [d, 'z', w / 2],
      [d, 'z', -w / 2],
    ] as const) {
      const n = Math.max(2, Math.floor(len / 0.13))
      for (let i = 0; i < n; i++) {
        const u = -len / 2 + (len * (i + 0.5)) / n
        for (let f = 0; f < 3; f++) {
          const y = 0.11 + f * ((h - 0.15) / 3)
          if (along === 'x') kit.box({ w: 0.045, h: 0.06, d: 0.012, at: [x + u, y, z + side], ...win })
          else kit.box({ w: 0.012, h: 0.06, d: 0.045, at: [x + side, y, z + u], ...win })
        }
      }
    }
    // 石の軒（コーニス）とマンサード屋根、煙突
    kit.box({ w: w + 0.04, h: 0.022, d: d + 0.04, at: [x, h - 0.022, z], color: '#F0E7D6' })
    kit.frustum({ w: w + 0.02, d: d + 0.02, h: 0.12, topW: w - 0.14, topD: d - 0.14, at: [x, h, z], color: MANSARD })
    for (const s of [-0.3, 0.3]) kit.box({ w: 0.045, h: 0.06, d: 0.045, at: [x + w * s, h + 0.12, z + d * 0.2], color: '#B59E86' })
  })
}
