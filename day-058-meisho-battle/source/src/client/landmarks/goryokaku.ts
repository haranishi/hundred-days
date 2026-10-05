// 五稜郭：5つの角が突き出した星形の西洋式の城。星形の石垣と土塁を、同じ形の堀が囲む。中は広い芝生で、中央に箱館奉行所。
// 正面（+Z）が南。正面の2つの角の間に表の門があり、その前の堀に三角の島（半月堡）。高い天守はなく、星形が主役。
// 白いうちは段階1〜2で「堀に囲まれた丸みのある台と、土塁・門・御殿」まで（大阪城などの堀のある城跡と迷う）。
// 段階3で5つの角と、角ごとに折れ曲がる堀の線、半月堡が出て星形が読め、ここで決まる。
// 既定の角度（斜め上35度）でも星形が読めるよう、全体を低く平らに広げ、堀のまわりの土地を持ち上げて堀を深く見せる。
// 南隣の展望塔（五稜郭タワー）は、新しい建物で権利を確かめていないので作らない。
import { type Kit, type Vec3, type XZ } from './kit'

const STONE = '#8F8A80'
const TURF = '#7FA35A'
const RAMPART = '#86AA60'
const MOAT = '#3C6E8F'
const TOWN = '#C9C3B6'
const PATH = '#D8CDB4'
const ROOF = '#5A5C60'
const WALL = '#EDE8DC'
const WOOD = '#7A5A3E'

/** 星形の大きさ：角の先、肩（角の付け根の折れ目）、袖（肩から内へ入った点）の半径と角度 */
const R_TIP = 3.3
const R_SHOULDER = 2.25
const A_SHOULDER = 22
const R_FLANK = 2.0
const A_FLANK = 25
/** 本体の石垣の高さ、まわりの土地の高さ */
const FORT_H = 0.3
const TOWN_H = 0.2
/** 角の向き（0 が正面 +Z）。正面の2つの角の間（0度）に表の門がある */
const TIPS = [36, 108, 180, 252, 324] as const
/** 堀の外のふち：角の先と、角の間の谷の半径 */
const MOAT_TIP = 4.08
const MOAT_VALLEY = 2.46

export function build(kit: Kit): void {
  kit.ground(TOWN)

  // ---- 段階1：堀の水、まわりの円い土地、真ん中の五角形の台（白）。星形はまだ見せない ----
  kit.stage(1)
  kit.order(-1)
  kit.water({ r: 4.6, h: 0.03, color: MOAT })
  kit.order(0)
  // 真ん中の台を先に（同じ順番の組の中では中心に近いものが先に出る）、まわりの円い土地はそのあと
  kit.part(() => fortSlab(kit, core()))
  kit.appear('grow')
  for (let i = 0; i < 5; i++) kit.extrude({ points: townRing(i), h: TOWN_H, color: TOWN })
  kit.appear('drop')

  // ---- 段階2：形の特徴＝台のふちの土塁、表の門、奉行所（白）。まだ「堀に囲まれた城跡と御殿」まで ----
  kit.stage(2)
  for (const t of TIPS) curtainBank(kit, t)
  gate(kit)
  office(kit)

  // ---- 段階3：決め手（白）＝5つの角（稜堡）と角の土塁、角ごとに折れ曲がる堀の外のふち、半月堡と橋。ここで星形が出る ----
  kit.stage(3)
  for (const t of TIPS) {
    kit.part(() => {
      fortSlab(kit, bastion(t))
      faceBanks(kit, t)
    })
  }
  kit.appear('grow')
  for (let i = 0; i < 5; i++) kit.extrude({ points: townSector(i), h: TOWN_H, color: TOWN })
  kit.appear('drop')
  ravelin(kit)
  bridges(kit)

  // ---- 段階4：周りの景色（色つき）＝土塁の桜と松、中の木と道、堀の外の街並みと道路、車、人 ----
  kit.stage(4)
  scenery(kit)
}

// ===== 星形の輪郭 =====

function polar(r: number, deg: number): XZ {
  const a = (deg * Math.PI) / 180
  return [Math.sin(a) * r, Math.cos(a) * r]
}

/** 真ん中の台：角の付け根（袖の点）を結んだ十角形 */
function core(): XZ[] {
  const pts: XZ[] = []
  for (const t of TIPS) {
    pts.push(polar(R_FLANK, t - A_FLANK))
    pts.push(polar(R_FLANK, t + A_FLANK))
  }
  return pts
}

/** 角（稜堡）1つ：袖→肩→先→肩→袖 の矢じりの形。底の辺は真ん中の台の辺と重なる */
function bastion(t: number): XZ[] {
  return [
    polar(R_FLANK, t - A_FLANK),
    polar(R_SHOULDER, t - A_SHOULDER),
    polar(R_TIP, t),
    polar(R_SHOULDER, t + A_SHOULDER),
    polar(R_FLANK, t + A_FLANK),
  ]
}

/** 石垣の台：側面は石の灰色、上面は芝生 */
function fortSlab(kit: Kit, pts: readonly XZ[]): void {
  kit.extrude({ points: pts, h: FORT_H, color: STONE })
  kit.extrude({ points: shrink(pts, 0.035), h: 0.012, at: [0, FORT_H, 0], color: TURF })
}

/** 中心へ向けて少し縮めた輪郭（上面の芝生を石垣のふちから少し内へ） */
function shrink(pts: readonly XZ[], d: number): XZ[] {
  return pts.map(([x, z]) => {
    const r = Math.hypot(x, z)
    const k = r > 0 ? (r - d) / r : 1
    return [x * k, z * k] as XZ
  })
}

/** 堀の外のふち（上から見た線）。正面の谷だけは、半月堡のまわりの堀へ張り出す */
function moatEdge(i: number): XZ[] {
  const t0 = TIPS[i] as number
  const valley = t0 + 36
  const pts: XZ[] = [polar(MOAT_TIP, t0)]
  if (valley % 360 === 0) {
    // 正面（0度）の谷：半月堡のまわりの堀へ張り出す（左の角から右の角へ）
    pts.push([-0.815, 2.75], [0, 4.12], [0.815, 2.75])
  } else {
    pts.push(polar(MOAT_VALLEY, valley))
  }
  pts.push(polar(MOAT_TIP, t0 + 72))
  return pts
}

/** 堀の外の土地のうち、外まわりの円い帯（角 i から次の角まで）。星形の手がかりにならない */
function townRing(i: number): XZ[] {
  const t0 = TIPS[i] as number
  const pts: XZ[] = []
  const n = 12
  for (let k = 0; k <= n; k++) pts.push(polar(MOAT_TIP, t0 + (72 * k) / n))
  for (let k = n; k >= 0; k--) pts.push(polar(4.9, t0 + (72 * k) / n))
  return pts
}

/** 堀の外の土地のうち、円い帯と星形の堀のふちの間（角 i から次の角まで）。ここで星形が出る */
function townSector(i: number): XZ[] {
  const t0 = TIPS[i] as number
  const back: XZ[] = []
  const n = 12
  for (let k = n - 1; k >= 1; k--) back.push(polar(MOAT_TIP + 0.01, t0 + (72 * k) / n))
  return [...moatEdge(i), ...back]
}

/** 角の2つの面に沿った土塁（角の台と同じ部品にする） */
function faceBanks(kit: Kit, t: number): void {
  const tip = polar(R_TIP - 0.12, t)
  bank(kit, tip, polar(R_SHOULDER - 0.06, t - A_SHOULDER + 1.5))
  bank(kit, tip, polar(R_SHOULDER - 0.06, t + A_SHOULDER - 1.5))
}

/** 幕（角 t から隣の角までの間の、真ん中の台のふち）に沿った土塁 */
function curtainBank(kit: Kit, t: number): void {
  kit.part(() => bank(kit, polar(R_FLANK - 0.06, t + A_FLANK), polar(R_FLANK - 0.06, t + 72 - A_FLANK)))
}

/** 2点の間の、内側に寄せた土手（台の上に盛る細長い台形） */
function bank(kit: Kit, a: XZ, b: XZ): void {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len = Math.hypot(dx, dz)
  // 内向きの法線（中心へ向く側）
  let nx = -dz / len
  let nz = dx / len
  const mx = (a[0] + b[0]) / 2
  const mz = (a[1] + b[1]) / 2
  if (nx * -mx + nz * -mz < 0) {
    nx = -nx
    nz = -nz
  }
  const w = 0.3
  const inset = 0.04
  const p = (q: XZ, s: number): XZ => [q[0] + nx * s, q[1] + nz * s]
  kit.extrude({ points: [p(a, inset), p(b, inset), p(b, inset + w), p(a, inset + w)], h: 0.09, at: [0, FORT_H, 0], color: RAMPART })
}

// ===== 半月堡・橋・奉行所 =====

/** 表の門の前の堀に浮かぶ三角の島（半月堡） */
function ravelin(kit: Kit): void {
  const pts: XZ[] = [
    [-0.55, 2.42],
    [0, 3.35],
    [0.55, 2.42],
  ]
  kit.part(() => {
    kit.extrude({ points: pts, h: 0.26, color: STONE })
    kit.extrude({ points: shrinkAround(pts, [0, 2.72], 0.05), h: 0.012, at: [0, 0.26, 0], color: TURF })
    kit.extrude({ points: shrinkAround(pts, [0, 2.72], 0.07).map(([x, z]): XZ => [x * 0.8, 2.72 + (z - 2.72) * 0.8]), h: 0.07, at: [0, 0.26, 0], color: RAMPART })
  })
}

function shrinkAround(pts: readonly XZ[], c: XZ, d: number): XZ[] {
  return pts.map(([x, z]) => {
    const dx = x - c[0]
    const dz = z - c[1]
    const r = Math.hypot(dx, dz)
    const k = r > 0 ? (r - d) / r : 1
    return [c[0] + dx * k, c[1] + dz * k] as XZ
  })
}

/** 堀の外から半月堡へ（一の橋）、半月堡から表の門へ（二の橋）。木の橋に欄干 */
function bridges(kit: Kit): void {
  kit.part(() => {
    bridge(kit, [-1.2, 3.22], [-0.33, 2.78], TOWN_H, 0.27)
    bridge(kit, [0, 2.45], [0, 1.9], 0.27, FORT_H)
  })
}

/** 表の門（正面の幕の石垣の上に建つ小さな門） */
function gate(kit: Kit): void {
  kit.part(() => {
    kit.box({ w: 0.36, h: 0.16, d: 0.12, at: [0, FORT_H, 1.84], color: WALL })
    kit.box({ w: 0.14, h: 0.12, d: 0.13, at: [0, FORT_H, 1.84], color: '#3E3A36' })
    kit.curvedRoof({ w: 0.36, d: 0.12, h: 0.09, at: [0, FORT_H + 0.16, 1.84], style: 'irimoya', overhang: 0.05, upturn: 0.02, color: ROOF })
  })
}

function bridge(kit: Kit, from: XZ, to: XZ, y0: number, y1: number): void {
  const a: Vec3 = [from[0], y0, from[1]]
  const b: Vec3 = [to[0], y1, to[1]]
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const len = Math.hypot(dx, dz)
  // 橋の向きに直角な横向き（欄干をずらす向き）
  const side = (s: number): [Vec3, Vec3] => {
    const ox = (dz / len) * s
    const oz = (-dx / len) * s
    return [
      [a[0] + ox, a[1] + 0.06, a[2] + oz],
      [b[0] + ox, b[1] + 0.06, b[2] + oz],
    ]
  }
  kit.beam({ from: a, to: b, size: 0.035, width: 0.17, color: WOOD })
  for (const s of [-0.08, 0.08]) {
    const [p, q] = side(s)
    kit.beam({ from: p, to: q, size: 0.018, color: WOOD })
  }
  // 橋脚
  for (let k = 1; k < 3; k++) {
    const u = k / 3
    const x = from[0] + dx * u
    const z = from[1] + dz * u
    const y = y0 + (y1 - y0) * u
    kit.box({ w: 0.04, h: y, d: 0.04, at: [x, 0, z], color: WOOD })
  }
}

/** 箱館奉行所：横に長い白壁の平屋に、灰色の入母屋屋根。屋根の真ん中に太鼓櫓 */
function office(kit: Kit): void {
  const y = FORT_H
  kit.part(() => {
    kit.box({ w: 1.15, h: 0.03, d: 0.55, at: [0, y, -0.25], color: '#B9B2A4' })
    kit.box({ w: 1.05, h: 0.16, d: 0.45, at: [0, y + 0.03, -0.25], color: WALL })
    for (const x of [-0.45, -0.25, -0.05, 0.15, 0.35]) kit.box({ w: 0.12, h: 0.09, d: 0.02, at: [x + 0.05, y + 0.06, -0.02], color: '#5A4A3A' })
  })
  kit.curvedRoof({ w: 1.05, d: 0.45, h: 0.24, at: [0, y + 0.19, -0.25], style: 'irimoya', overhang: 0.08, upturn: 0.03, color: ROOF })
  // 玄関の唐破風のような張り出し
  kit.part(() => {
    kit.box({ w: 0.22, h: 0.14, d: 0.14, at: [0, y + 0.03, 0.02], color: WALL })
    kit.curvedRoof({ w: 0.22, d: 0.16, h: 0.1, at: [0, y + 0.17, 0.03], rotY: 90, style: 'irimoya', overhang: 0.04, upturn: 0.02, color: ROOF })
  })
  // 太鼓櫓
  kit.part(() => {
    kit.box({ w: 0.12, h: 0.12, d: 0.12, at: [0, y + 0.4, -0.25], color: WALL })
    kit.curvedRoof({ w: 0.12, d: 0.12, h: 0.08, at: [0, y + 0.52, -0.25], style: 'hogyo', overhang: 0.04, upturn: 0.02, color: ROOF })
  })
}

// ===== まわり =====

function scenery(kit: Kit): void {
  // 中の道（表の門から奉行所へ、奉行所のまわり）
  kit.part(() => {
    kit.box({ w: 0.24, h: 0.012, d: 1.65, at: [0, FORT_H + 0.012, 0.95], color: PATH })
    kit.box({ w: 1.6, h: 0.012, d: 0.85, at: [0, FORT_H + 0.012, -0.25], color: PATH })
  })
  // 土塁の上の木（桜と松）と、中の木
  for (const t of TIPS) {
    const pts: XZ[] = []
    const tip = polar(R_TIP - 0.45, t)
    const sl = polar(R_SHOULDER - 0.2, t - A_SHOULDER + 3)
    const sr = polar(R_SHOULDER - 0.2, t + A_SHOULDER - 3)
    for (const u of [0.25, 0.6, 0.95]) {
      pts.push([tip[0] + (sl[0] - tip[0]) * u, tip[1] + (sl[1] - tip[1]) * u])
      pts.push([tip[0] + (sr[0] - tip[0]) * u, tip[1] + (sr[1] - tip[1]) * u])
    }
    pts.push(polar(R_FLANK - 0.3, t + 36))
    for (const [x, z] of pts) {
      const sakura = kit.chance(0.4)
      kit.tree({
        kind: sakura ? 'sakura' : kit.pick(['round', 'pine'] as const),
        h: kit.range(0.36, 0.46),
        at: [x, FORT_H + 0.08, z],
        rotY: kit.range(0, 360),
        color: sakura ? undefined : '#3E6B3A',
      })
    }
  }
  for (const [x, z] of [
    [-1.0, 0.55],
    [1.0, 0.6],
    [-1.25, -0.95],
    [1.2, -1.0],
    [0.45, -1.25],
    [-0.5, -1.3],
  ] as const) {
    kit.tree({ kind: 'round', h: kit.range(0.36, 0.44), at: [x, FORT_H, z], color: '#4A7C42' })
  }
  // 堀の外の街並み（低い家とビル）
  for (let i = 0; i < 5; i++) {
    const valley = (TIPS[i] as number) + 36
    if (valley % 360 === 0) continue
    for (const [r, da, w, d, h] of [
      [3.35, -12, 0.42, 0.34, 0.22],
      [3.45, 10, 0.5, 0.36, 0.34],
      [4.15, -20, 0.4, 0.38, 0.28],
      [4.2, 0, 0.46, 0.4, 0.46],
      [4.15, 20, 0.4, 0.34, 0.26],
    ] as const) {
      const [x, z] = polar(r, valley + da)
      house(kit, x, z, w, d, h, valley + da)
    }
  }
  // 堀の外の道路の車と、公園の人
  for (const [r, a] of [
    [3.0, 72],
    [2.95, 144],
    [3.0, 216],
    [2.95, 288],
  ] as const) {
    const [x, z] = polar(r, a)
    kit.car({ at: [x, TOWN_H, z], rotY: a + 90 })
  }
  for (const [x, z, y] of [
    [0.15, 1.3, FORT_H + 0.02],
    [-0.12, 1.0, FORT_H + 0.02],
    [0.3, 0.3, FORT_H + 0.02],
    [-0.45, 0.35, FORT_H + 0.02],
    [-1.35, 3.45, TOWN_H],
    [-1.6, 3.6, TOWN_H],
    [0.05, 2.95, 0.26],
    [-0.75, 2.98, 0.24],
  ] as const) {
    kit.person({ at: [x, y, z], rotY: kit.range(0, 360) })
  }
}

/** 堀の外の建物（箱に陸屋根か低い屋根） */
function house(kit: Kit, x: number, z: number, w: number, d: number, h: number, faceDeg: number): void {
  kit.part(() =>
    kit.at({ at: [x, TOWN_H, z], rotY: faceDeg }, () => {
      kit.box({ w, h, d, color: h > 0.4 ? '#D7D9DC' : '#E9E3D6', finish: 'satin' })
      if (h > 0.4) {
        for (let f = 0; f < 3; f++) kit.box({ w: w + 0.01, h: 0.04, d: d + 0.01, at: [0, 0.1 + f * 0.12, 0], color: '#5C6B7A' })
      } else {
        kit.gableRoof({ w, d, h: 0.12, at: [0, h, 0], overhang: 0.03, color: kit.pick(['#6B4E3D', '#4F5A66', '#7A3E34']) })
      }
    }),
  )
}
