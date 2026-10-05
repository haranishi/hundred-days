// ギザのピラミッド：砂漠に斜めに並ぶ3つの四角すい（クフ王・カフラー王・メンカウラー王）と、手前のスフィンクス。
// 正面（+Z）が東＝スフィンクスの向き、右（+X）が北。いつもの写真のように、スフィンクスの後ろにカフラー王、右にクフ王。
// 講評r1（不合格6点）：0.55 で小さなとがったピラミッドが並んで決まり、斜面も一枚板だった
// → 石積みの段を1段ずつ積む。段階1〜2は頂上の無い四角い段々の台形で止める（チチェン・イッツァなどと迷う形）。
//   とがった頂上は段階3、スフィンクスは段階3の終わり、王妃の小さなピラミッド・参道・神殿の跡は段階4（旧：段階2・3）。
import { COLORS, type Kit, type Vec3 } from './kit'

const STONE = '#C99E62'
const CASING = '#F0E3C6'
const SPHINX = '#BC8A52'
const SAND = '#ECCF9C'
// 講評r1：砂丘が明るい平らな斑に見えた → 地面に近い色にして（#F2DCB0→#EDD3A2）、高さで陰を出す
const DUNE = '#EDD3A2'

interface Pyramid {
  x: number
  z: number
  base: number
  h: number
  /** 石積みの段の数（いちばん上の段がとがった頂上） */
  courses: number
  /** 台地の高さ */
  y?: number
  /** てっぺんの色（カフラー王は化粧石が残って明るい） */
  cap?: string
}

const KHUFU: Pyramid = { x: 2.0, z: -0.35, base: 2.4, h: 1.53, courses: 14 }
const KHAFRE: Pyramid = { x: -0.65, z: -1.45, base: 2.25, h: 1.45, courses: 14, y: 0.08, cap: CASING }
const MENKAURE: Pyramid = { x: -2.8, z: -2.55, base: 1.15, h: 0.72, courses: 8 }
const BIG3 = [KHUFU, KHAFRE, MENKAURE]

/** 段の上に残す平らな縁（段の水平の奥行きに対する割合）。斜面に細い横段の筋が出る */
const LEDGE = 0.4
/** 段階1・2で積む高さの割合の上限。これより上の段（頂上）は段階3 */
const STAGE1_TOP = 0.45
const STAGE2_TOP = 0.8

export function build(kit: Kit): void {
  kit.ground(SAND)

  // ---- 段階1：砂丘と、3つの台形の下の段（白） ----
  kit.stage(1)
  // 講評r1：砂丘のふくらみに陰が無かった → 高さを上げる（0.2→0.32 など）
  kit.mound({ r: 1.8, rx: 1.8, rz: 0.8, h: 0.32, at: [-0.8, 0, -3.6], color: DUNE })
  kit.mound({ r: 1.0, h: 0.26, at: [2.4, 0, -2.7], color: DUNE })
  kit.mound({ r: 0.8, h: 0.18, at: [3.5, 0, 1.6], color: DUNE })
  kit.mound({ r: 0.9, h: 0.18, at: [-3.6, 0, 0.6], color: DUNE })
  // カフラー王のピラミッドは少し高い台地に建つ
  kit.frustum({ w: 2.62, topW: 2.4, h: 0.08, at: [KHAFRE.x, 0, KHAFRE.z], color: '#DDBF88' })
  for (const p of BIG3) courses(kit, p, 0, STAGE1_TOP)

  // ---- 段階2：形の特徴＝段々の台形が高くなる。頂上はまだ平ら（白） ----
  kit.stage(2)
  for (const p of BIG3) courses(kit, p, STAGE1_TOP, STAGE2_TOP)

  // ---- 段階3：決め手の細部（白）＝とがった頂上、終わりにスフィンクス ----
  kit.stage(3)
  for (const p of BIG3) courses(kit, p, STAGE2_TOP, 1)
  kit.order(1) // スフィンクスは頂上のあと
  sphinx(kit, [-0.3, 0, 2.15])
  kit.order(0)

  // ---- 段階4：周りの景色（色つき）＝王妃のピラミッド・参道と神殿の跡・ナイルの緑・ヤシ・街のはずれ・道路・らくだ・人 ----
  kit.stage(4)
  // 王妃のピラミッド（小さい）
  for (const z of [-2.65, -2.2, -1.75]) kit.pyramid({ w: 0.3, h: 0.19, at: [-3.7, 0, z], color: STONE })
  for (const x of [1.45, 1.9, 2.35]) kit.pyramid({ w: 0.28, h: 0.18, at: [x, 0, 1.5], color: STONE })
  // 参道と、河岸神殿・葬祭殿の跡
  strip(kit, [-0.95, 1.6], [-0.7, -0.05], 0.13, '#DCC9A2')
  kit.box({ w: 0.36, h: 0.1, d: 0.34, at: [-1.0, 0, 1.85], color: STONE })
  kit.box({ w: 0.55, h: 0.08, d: 0.26, at: [KHAFRE.x, KHAFRE.y ?? 0, KHAFRE.z + KHAFRE.base / 2 + 0.16], color: STONE })
  kit.box({ w: 0.5, h: 0.07, d: 0.24, at: [KHUFU.x, 0, KHUFU.z + KHUFU.base / 2 + 0.15], color: STONE })
  kit.mound({ r: 1.2, rx: 1.2, rz: 0.5, h: 0.03, at: [-2.0, 0, 3.2], color: '#8DB35E' })
  kit.scatter({ count: 7, rMax: 1.0, gap: 0.32, ok: (x, z) => (x / 1.05) ** 2 + (z / 0.42) ** 2 < 1 }, (_i, x, z) =>
    kit.tree({ kind: 'palm', h: kit.range(0.5, 0.72), at: [-2.0 + x, 0.02, 3.2 + z], rotY: kit.range(0, 360) }),
  )
  // 街のはずれの低い建物
  const houses: [number, number, number, number, number, string][] = [
    [1.9, 3.95, 0.42, 0.22, 0.34, '#EFE6D3'],
    [2.6, 3.45, 0.36, 0.32, 0.4, '#E0CFB0'],
    [3.3, 2.8, 0.44, 0.2, 0.3, '#F4EFE6'],
    [1.2, 4.25, 0.34, 0.26, 0.3, '#D9C7A6'],
    [3.75, 2.1, 0.3, 0.24, 0.36, '#EADCC2'],
  ]
  // 砂丘を高くしたので、家・らくだ・人は砂丘の上の高さに置く（少し埋める）
  const on = (x: number, z: number): number => Math.max(0, kit.groundAt(x, z) - 0.02)
  for (const [x, z, w, h, d, color] of houses) {
    const y = on(x, z)
    kit.part(() => {
      kit.box({ w, h, d, at: [x, y, z], color })
      kit.box({ w: w * 0.3, h: 0.04, d: d * 0.3, at: [x + w * 0.2, y + h, z - d * 0.15], color: '#C9B490' })
    })
  }
  // 道路と観光バス・車
  strip(kit, [-0.6, 3.75], [3.2, 2.35], 0.24, COLORS.road)
  kit.car({ at: [0.55, 0.02, 3.33], rotY: 110, len: 0.48, color: '#F2F0EA' })
  kit.car({ at: [1.8, 0.02, 2.87], rotY: -70 })
  kit.car({ at: [2.6, 0.02, 2.58], rotY: 110 })
  // らくだ（人を乗せて）
  for (const [x, z, rot] of [
    [0.75, 2.55, 75],
    [1.1, 2.75, 85],
    [-1.25, 2.75, -20],
    [3.45, 1.3, 160],
  ] as const) {
    kit.camel({ at: [x, on(x, z), z], rotY: rot, rider: true })
  }
  // スフィンクスを眺める人と、クフ王のピラミッドのふもとの人
  for (const [x, z] of [
    [-0.55, 3.0],
    [-0.35, 3.15],
    [-0.1, 3.05],
    [0.15, 3.2],
    [0.3, 2.95],
    [0.85, 1.05],
    [1.05, 0.95],
    [2.95, 1.0],
    [-1.6, 0.4],
    [-1.75, 0.55],
  ] as const) {
    kit.person({ at: [x, on(x, z), z], rotY: kit.range(140, 220) })
  }
}

/**
 * ピラミッドの石積みの段のうち、上の端の高さの割合が from より上・to 以下の段を、1段ずつ別の部品として積む。
 * 各段の上には細い平らな縁を残す（次の段を内側へずらす）ので、斜面に横段の筋が出る。いちばん上の段はとがった頂上。
 * 段の下の端は元の四角すいの斜面にそろえるので、積み上がった形は元の四角すいと同じ大きさになる
 */
function courses(kit: Kit, p: Pyramid, from: number, to: number): void {
  const n = p.courses
  const dh = p.h / n
  const ledge = LEDGE * (p.base / 2 / n)
  for (let k = 0; k < n; k++) {
    const top = (k + 1) / n
    if (top <= from + 1e-6 || top > to + 1e-6) continue
    const at: Vec3 = [p.x, (p.y ?? 0) + k * dh, p.z]
    const w0 = p.base * (1 - k / n)
    // 頂上の段（段階3）は、カフラー王なら化粧石の明るい色。化粧石の段は平らに積む（縁を残さない）
    const capped = p.cap !== undefined && top > STAGE2_TOP + 1e-6
    const color = capped ? (p.cap ?? STONE) : STONE
    if (k === n - 1) kit.pyramid({ w: w0, h: dh, at, color })
    else kit.frustum({ w: w0, topW: p.base * (1 - top) + (capped ? 0 : 2 * ledge), h: dh, at, color })
  }
}

/** 地面に置く細長い帯（道や参道）。from から to まで */
function strip(kit: Kit, from: readonly [number, number], to: readonly [number, number], width: number, color: string): void {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const len = Math.hypot(dx, dz)
  const rotY = (Math.atan2(dx, dz) * 180) / Math.PI
  kit.box({ w: width, h: 0.02, d: len, at: [(from[0] + to[0]) / 2, 0, (from[1] + to[1]) / 2], rotY, color })
}

/** スフィンクス（前は +Z）。伏せたライオンの体、前に伸びた前足、頭巾をかぶった人の頭 */
function sphinx(kit: Kit, at: Vec3): void {
  const c = { color: SPHINX }
  // 実物の比率のままだと小さすぎて読めないので、1.3倍に大きくする
  kit.at({ at, scale: 1.3 }, () => {
    kit.part(() => {
      kit.box({ w: 0.3, h: 0.17, d: 0.64, at: [0, 0, -0.14], ...c })
      kit.box({ w: 0.34, h: 0.21, d: 0.22, at: [0, 0, -0.38], ...c })
      kit.box({ w: 0.085, h: 0.055, d: 0.38, at: [-0.095, 0, 0.36], ...c })
      kit.box({ w: 0.085, h: 0.055, d: 0.38, at: [0.095, 0, 0.36], ...c })
      kit.box({ w: 0.24, h: 0.13, d: 0.15, at: [0, 0.1, 0.12], ...c })
      kit.frustum({ w: 0.27, d: 0.17, topW: 0.17, topD: 0.15, h: 0.17, at: [0, 0.2, 0.12], ...c })
      kit.box({ w: 0.13, h: 0.13, d: 0.06, at: [0, 0.22, 0.21], ...c })
    })
    // 掘り下げた囲いの縁（低い壁）
    kit.part(() => {
      const wall = { color: '#D8BF8E' }
      kit.box({ w: 0.62, h: 0.05, d: 0.05, at: [0, 0, -0.62], ...wall })
      kit.box({ w: 0.05, h: 0.05, d: 1.15, at: [-0.31, 0, -0.06], ...wall })
      kit.box({ w: 0.05, h: 0.05, d: 1.15, at: [0.31, 0, -0.06], ...wall })
    })
  })
}
