// 金閣寺（鹿苑寺の舎利殿）：鏡湖池の北岸に建つ3層の楼閣。2・3層が金色、反り屋根、てっぺんに鳳凰。
// 正面（+Z）が南＝池ごしに見るいつもの角度。白いうちは「3層の和風の建物」で、金色と池で決まる。
import { COLORS, type Kit, type XZ } from './kit'

const GOLD = COLORS.gold
const SHINGLE = '#5A4A3C'
const DARK = '#3A2D22'
const FIRST = '#E4D9C3'

/** 楼閣の中心（池の北岸） */
const CX = 0.2
const CZ = -1.55

/** 階の高さ。屋根は薄く、軒の出は控えめにして、金色の壁が上から見えるようにする */
const F1 = 0.08 // 1層の床
const F2 = 0.6 // 2層の床（1層の屋根の付け根）
const F3 = 1.32 // 3層の床（2層の屋根の付け根）
const F4 = 1.98 // 屋根の付け根
const TOP = 2.48 // 屋根のてっぺん

/** 鏡湖池の形（上から見た輪郭） */
const POND: readonly XZ[] = [
  [-4.0, 0.6],
  [-3.6, -0.3],
  [-2.6, -0.75],
  [-1.6, -0.6],
  [-0.9, -0.5],
  [0.0, -0.45],
  [1.2, -0.5],
  [2.2, -0.85],
  [3.3, -0.6],
  [4.0, 0.3],
  [4.1, 1.4],
  [3.6, 2.5],
  [2.6, 3.15],
  [1.2, 3.55],
  [-0.4, 3.65],
  [-1.9, 3.35],
  [-3.1, 2.7],
  [-3.9, 1.7],
]

/** 裏山と左右の丘 [x, z, 横の半径, 奥の半径, 高さ]。台座からはみ出さない大きさにする */
const HILLS: readonly (readonly [number, number, number, number, number])[] = [
  [0.3, -3.5, 2.6, 1.1, 0.8],
  [-2.9, -2.1, 1.1, 1.1, 0.5],
  [2.9, -2.2, 1.05, 1.05, 0.45],
]

export function build(kit: Kit): void {
  kit.ground(COLORS.moss)

  // ---- 段階1：地形と大きな塊（白） ----
  kit.stage(1)
  for (const [x, z, rx, rz, h] of HILLS) kit.mound({ r: Math.max(rx, rz), rx, rz, h, at: [x, 0, z], color: '#5E8C4C' })
  kit.water({ points: POND, color: COLORS.pond })
  // 池の島（葦原島など）
  kit.mound({ r: 0.62, h: 0.2, rx: 0.75, rz: 0.5, at: [1.75, 0, 1.45], color: COLORS.grass })
  kit.mound({ r: 0.38, h: 0.15, at: [-1.45, 0, 1.85], color: COLORS.grass })
  kit.mound({ r: 0.24, h: 0.12, at: [-2.55, 0, 0.85], color: COLORS.grass })
  // 池の手前の参観の道
  kit.extrude({ points: arcStrip(4.05, 4.5, -38, 38), h: 0.02, color: COLORS.gravel })
  // 楼閣の大きな塊：石の基壇と3つの階
  kit.box({ w: 2.6, h: F1, d: 2.05, at: [CX, 0, CZ], color: COLORS.stone })
  kit.box({ w: 2.3, h: F2 - F1, d: 1.8, at: [CX, F1, CZ], color: FIRST })
  kit.box({ w: 1.9, h: F3 - F2, d: 1.45, at: [CX, F2, CZ], color: GOLD, finish: 'gold' })
  kit.box({ w: 1.05, h: F4 - F3, d: 1.05, at: [CX, F3, CZ], color: GOLD, finish: 'gold' })

  // ---- 段階2：形の特徴＝反り屋根の重なり（白） ----
  kit.stage(2)
  kit.curvedRoof({ w: 2.3, d: 1.8, h: 0.13, at: [CX, F2, CZ], style: 'skirt', top: { w: 1.9, d: 1.45 }, overhang: 0.17, upturn: 0.05, thick: 0.04, color: SHINGLE })
  kit.curvedRoof({ w: 1.9, d: 1.45, h: 0.24, at: [CX, F3, CZ], style: 'skirt', top: { w: 1.05, d: 1.05 }, overhang: 0.2, upturn: 0.08, thick: 0.04, color: SHINGLE })
  kit.curvedRoof({ w: 1.05, d: 1.05, h: TOP - F4, at: [CX, F4, CZ], style: 'hogyo', overhang: 0.28, upturn: 0.12, curve: 1.7, thick: 0.045, color: SHINGLE })

  // ---- 段階3：決め手の細部（白）＝鳳凰・高欄・窓・柱・池に張り出す漱清 ----
  kit.stage(3)
  phoenix(kit, [CX, TOP, CZ])
  // 3層の高欄（金）
  railing(kit, CX, F3 + 0.24, CZ, 1.27, 1.27, GOLD)
  // 2層の正面の扉と、3層の花頭窓（暗い色）
  kit.part(() => {
    for (const x of [-0.62, 0, 0.62]) kit.box({ w: 0.38, h: 0.34, d: 0.02, at: [CX + x, F2 + 0.24, CZ + 0.725], color: DARK })
    for (const x of [-0.24, 0.24]) {
      kit.box({ w: 0.2, h: 0.2, d: 0.02, at: [CX + x, F3 + 0.36, CZ + 0.525], color: DARK })
      kit.sphere({ r: 0.1, squash: 0.55, at: [CX + x, F3 + 0.53, CZ + 0.525], seg: 8, color: DARK, scale: [1, 1, 0.12] })
    }
  })
  // 1層の柱と縁
  kit.part(() => {
    for (let i = 0; i <= 5; i++) {
      const x = -1.1 + i * 0.44
      kit.cylinder({ r: 0.035, h: F2 - F1, at: [CX + x, F1, CZ + 0.92], seg: 6, color: DARK })
    }
    kit.box({ w: 2.4, h: 0.04, d: 0.2, at: [CX, 0.1, CZ + 1.0], color: COLORS.wood })
  })
  // 漱清（池へ張り出す小さな建物）
  kit.part(() => {
    const x = CX - 1.45
    const z = CZ + 0.62
    kit.box({ w: 0.6, h: 0.05, d: 0.62, at: [x, 0.03, z], color: COLORS.wood })
    kit.box({ w: 0.46, h: 0.3, d: 0.48, at: [x, 0.08, z], color: FIRST })
    kit.curvedRoof({ w: 0.46, d: 0.48, h: 0.2, at: [x, 0.38, z], style: 'irimoya', overhang: 0.12, upturn: 0.04, color: SHINGLE })
  })

  // ---- 段階4：周りの景色（色つき）＝松・木・石・参観の人 ----
  kit.stage(4)
  kit.tree({ kind: 'pine', h: 0.75, at: [1.6, 0.16, 1.4] })
  kit.tree({ kind: 'pine', h: 0.55, at: [2.05, 0.1, 1.55], rotY: 140 })
  kit.tree({ kind: 'pine', h: 0.5, at: [-1.45, 0.12, 1.85], rotY: 60 })
  kit.tree({ kind: 'pine', h: 0.35, at: [-2.55, 0.1, 0.85], rotY: 200 })
  for (const [x, z, r] of [
    [0.9, 0.5, 0.09],
    [-0.4, 0.9, 0.07],
    [2.7, 0.4, 0.08],
    [-2.0, 2.6, 0.08],
    [0.6, 2.4, 0.06],
  ] as const) {
    kit.sphere({ r, squash: 0.55, at: [x, 0.01, z], seg: 7, color: COLORS.rock })
  }
  // 裏山の木（ところどころ紅葉）
  kit.scatter(
    { count: 24, rMin: 1.9, rMax: 4.55, gap: 0.42, ok: (x, z) => z < -0.9 && !(Math.abs(x - CX) < 1.6 && z > -2.6) },
    (_i, x, z) => {
      const maple = kit.chance(0.18)
      const y = Math.max(0, kit.groundAt(x, z) - 0.04)
      kit.tree({ kind: maple ? 'round' : kit.pick(['round', 'round', 'cone'] as const), h: kit.range(0.5, 0.8), at: [x, y, z], color: maple ? kit.pick(['#C8532E', '#E0892F']) : kit.pick(['#3F6F45', '#4A7C4A', '#365F3D']) })
    },
  )
  // 池の左右の岸の松
  for (const [x, z] of [
    [-3.75, -0.55],
    [3.85, -0.2],
    [-4.1, 2.3],
    [4.2, 1.9],
  ] as const) {
    kit.tree({ kind: 'pine', h: kit.range(0.55, 0.7), at: [x, 0, z], rotY: kit.range(0, 360) })
  }
  // 池の手前で眺める人
  for (let i = 0; i < 7; i++) {
    const a = ((-28 + i * 9.5) * Math.PI) / 180
    kit.person({ at: [Math.sin(a) * 4.27, 0.02, Math.cos(a) * 4.27], rotY: 180 + kit.range(-25, 25) })
  }
}

/** 円弧の帯（中心からの距離 r0〜r1、角度 a0〜a1 度。0度が正面 +Z） */
function arcStrip(r0: number, r1: number, a0: number, a1: number): XZ[] {
  const outer: XZ[] = []
  const inner: XZ[] = []
  const n = 12
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180
    outer.push([Math.sin(a) * r1, Math.cos(a) * r1])
    inner.push([Math.sin(a) * r0, Math.cos(a) * r0])
  }
  return [...outer, ...inner.reverse()]
}

/** 屋根のてっぺんの鳳凰（金） */
function phoenix(kit: Kit, at: readonly [number, number, number]): void {
  kit.at({ at }, () =>
    kit.part(() => {
      const gold = { color: GOLD, finish: 'gold' as const }
      kit.cylinder({ r: 0.035, rTop: 0.025, h: 0.08, seg: 8, ...gold })
      kit.box({ w: 0.05, h: 0.06, d: 0.13, at: [0, 0.08, 0], ...gold })
      kit.beam({ from: [0, 0.12, 0.05], to: [0, 0.2, 0.09], size: 0.03, ...gold })
      kit.beam({ from: [0, 0.11, -0.03], to: [0, 0.2, -0.12], size: 0.025, width: 0.06, ...gold })
      kit.beam({ from: [0.02, 0.12, 0], to: [0.14, 0.2, -0.02], size: 0.015, width: 0.07, ...gold })
      kit.beam({ from: [-0.02, 0.12, 0], to: [-0.14, 0.2, -0.02], size: 0.015, width: 0.07, ...gold })
    }),
  )
}

/** 高欄（四角い手すり） */
function railing(kit: Kit, x: number, y: number, z: number, w: number, d: number, color: string): void {
  kit.part(() => {
    const t = 0.025
    const h = 0.09
    kit.box({ w, h: t, d: t, at: [x, y + h, z + d / 2], color, finish: 'gold' })
    kit.box({ w, h: t, d: t, at: [x, y + h, z - d / 2], color, finish: 'gold' })
    kit.box({ w: t, h: t, d, at: [x + w / 2, y + h, z], color, finish: 'gold' })
    kit.box({ w: t, h: t, d, at: [x - w / 2, y + h, z], color, finish: 'gold' })
    for (let i = 0; i <= 4; i++) {
      const s = -0.5 + i / 4
      kit.box({ w: t, h, d: t, at: [x + s * w, y, z + d / 2], color, finish: 'gold' })
      kit.box({ w: t, h, d: t, at: [x + s * w, y, z - d / 2], color, finish: 'gold' })
      kit.box({ w: t, h, d: t, at: [x + w / 2, y, z + s * d], color, finish: 'gold' })
      kit.box({ w: t, h, d: t, at: [x - w / 2, y, z + s * d], color, finish: 'gold' })
    }
  })
}
