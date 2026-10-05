// ストーンヘンジ：平らな草原に、横石をのせた立石の輪（サーセン・サークル）と、内側の大きな門形の組石5組の馬蹄形。
// 今の姿（崩れた輪）にする：北東（正面 +Z）側は横石が続き、南西（奥）は石が抜け、倒れた石が横たわる。
// 輪の外に低い土手の輪（北東に入口）、入口の外にヒール・ストーン。まわりの見学の小道を人が歩き、外では羊が草をはむ。
// 白いうちは「輪に並ぶ縦長の石」→「横石のかかった輪と、内側の大きな柱」まで（コロッセオの輪やパルテノン神殿の柱、モアイの列と迷う）。
// 段階3の門形の組石の横石・小さな青い石の輪・ヒール・ストーンで決まり、色塗りの灰色の石と草原、段階4の人と羊でほぼ全員が当たる。
import { type Kit, type Vec3 } from './kit'

const GRASS = '#7FAF5A'
// 日差しが暖かい色なので、少し青みのある灰色にしないと茶色く見える
const STONES = ['#9FA3A2', '#A7AAA6', '#979C9B', '#A2A7A2', '#ABACA6'] as const
const BLUESTONE = '#8A929C'
const BANK = '#76A552'
const DITCH = '#5F8C45'
const PATH = '#C9BC9C'

/** 外の輪（サーセン・サークル）の半径と、立石の大きさ */
const RING_R = 2.25
const UP_W = 0.3
const UP_D = 0.18
const UP_H = 0.74
/** 30本のうち、いま立っている石・倒れている石・横石のかかっている所（石 i と i+1 の上） */
const STANDING = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 14, 16, 21, 23, 27, 28, 29] as const
const FALLEN = [9, 15, 22] as const
const LINTELS = [27, 28, 29, 0, 1, 2, 6, 10] as const

interface Trilithon {
  /** 正面 +Z から右回りの角度（度） */
  a: number
  r: number
  h: number
  /** complete＝横石まで残る、one＝柱が1本だけ立つ（ほかは倒れている） */
  state: 'complete' | 'one'
}

/** 門形の組石5組（馬蹄形。開いた側が正面 +Z＝北東） */
const TRILITHONS: readonly Trilithon[] = [
  { a: 64, r: 1.43, h: 1.03, state: 'complete' },
  { a: -64, r: 1.43, h: 1.03, state: 'complete' },
  { a: 122, r: 1.32, h: 1.12, state: 'complete' },
  { a: -122, r: 1.32, h: 1.12, state: 'one' },
  { a: 180, r: 1.21, h: 1.3, state: 'one' },
]

export function build(kit: Kit): void {
  kit.ground(GRASS)

  // ---- 段階1：土手の輪と外の溝・見学の小道（白）、外の輪の立石が地面から立ち上がる ----
  kit.stage(1)
  kit.order(-1)
  kit.part(
    () => {
      // 北東（+Z）に入口の切れ目がある土手と、その外の溝
      kit.torus({ r: 3.9, tube: 0.22, arc: 336, flat: true, seg: 48, rotY: 282, scale: [1, 0.18, 1], color: BANK })
      kit.torus({ r: 4.3, tube: 0.15, arc: 336, flat: true, seg: 48, rotY: 282, scale: [1, 0.05, 1], color: DITCH })
      // 見学の小道（輪のまわり）
      kit.torus({ r: 3.12, tube: 0.11, flat: true, seg: 48, scale: [1, 0.06, 1], color: PATH })
    },
    { appear: 'grow' },
  )
  kit.order(0)
  kit.appear('grow')
  for (const i of STANDING) upright(kit, i)
  kit.appear('drop')

  // ---- 段階2：形の特徴＝外の輪の横石と、内側の大きな組石の柱（白） ----
  kit.stage(2)
  for (const i of LINTELS) lintel(kit, i)
  kit.appear('grow')
  for (const t of TRILITHONS) trilithonPosts(kit, t)
  kit.appear('drop')

  // ---- 段階3：決め手の細部（白）＝組石の横石・小さな青い石の輪と馬蹄形・倒れた石・祭壇石・ヒール・ストーン ----
  kit.stage(3)
  for (const t of TRILITHONS) trilithonTop(kit, t)
  for (const i of FALLEN) fallenUpright(kit, i)
  bluestones(kit)
  // 祭壇石（中央の奥に横たわる平たい石）と、入口の倒れた石（スローター・ストーン）
  kit.box({ w: 0.54, h: 0.08, d: 0.15, at: [0.08, 0, -0.47], rotY: 12, color: '#A89D8C' })
  kit.box({ w: 0.2, h: 0.07, d: 0.5, at: [-0.12, 0, 3.55], rotY: 8, color: stone(3) })
  // ヒール・ストーン（入口の外。少し輪の方へ傾く）と、見張りの石（ステーション・ストーン）2つ
  kit.frustum({ w: 0.3, d: 0.24, topW: 0.2, topD: 0.17, h: 0.58, at: [0.32, 0, 4.35], rot: [-8, 0, 4], color: '#857F72' })
  for (const [x, z] of [
    [2.95, 1.75],
    [-3.0, -1.65],
  ] as const) {
    kit.frustum({ w: 0.12, d: 0.1, topW: 0.09, topD: 0.08, h: 0.22, at: [x, 0, z], color: stone(1) })
  }

  // ---- 段階4：周りの景色（色つき）＝見学の小道を歩く人・外の草原の羊 ----
  kit.stage(4)
  for (let k = 0; k < 16; k++) {
    const a = ((k * 360) / 16 + kit.range(-6, 6)) * (Math.PI / 180)
    const r = 3.12 + kit.range(-0.05, 0.05)
    kit.person({ at: [Math.sin(a) * r, 0.01, Math.cos(a) * r], rotY: (a * 180) / Math.PI + (kit.chance(0.5) ? 90 : -90) })
  }
  // 羊（土手の外の草原）
  kit.scatter({ count: 18, rMin: 4.5, rMax: 4.78, gap: 0.24, ok: (x, z) => !(z > 3.8 && Math.abs(x) < 1.2) }, (_i, x, z) => {
    sheep(kit, [x, 0, z], kit.range(0, 360))
  })
}

/** 石の色（番号で少しずつ変える） */
function stone(i: number): string {
  return STONES[((i % STONES.length) + STONES.length) % STONES.length] as string
}

/** 外の輪の石 i の角度（度。正面 +Z から右回り） */
function ringAngle(i: number): number {
  return i * 12
}

/** 角度 a（度）・半径 r の地面の点 */
function polar(a: number, r: number): Vec3 {
  const t = (a * Math.PI) / 180
  return [Math.sin(t) * r, 0, Math.cos(t) * r]
}

/** 外の輪の立石。幅を輪に沿わせ、少しずつ大きさと傾きを変える */
function upright(kit: Kit, i: number): void {
  const a = ringAngle(i)
  const h = UP_H * kit.range(0.94, 1.04)
  kit.at({ at: polar(a, RING_R), rotY: a + kit.range(-4, 4) }, () =>
    kit.part(() => {
      kit.frustum({ w: UP_W * kit.range(0.92, 1.06), d: UP_D, topW: UP_W * 0.84, topD: UP_D * 0.86, h, rot: [kit.range(-2, 2), 0, kit.range(-2, 2)], color: stone(i) })
    }),
  )
}

/** 外の輪の横石（石 i と i+1 の上に、輪に沿って渡す） */
function lintel(kit: Kit, i: number): void {
  const a = ringAngle(i) + 6
  const chord = 2 * RING_R * Math.sin((6 * Math.PI) / 180)
  kit.at({ at: polar(a, RING_R), rotY: a }, () =>
    kit.part(() => {
      kit.box({ w: chord + 0.22, h: 0.11, d: 0.16, at: [0, UP_H - 0.01, 0], rot: [0, 0, kit.range(-1.5, 1.5)], color: stone(i + 2) })
    }),
  )
}

/** 倒れた外の輪の石（輪の外へ倒れて横たわる） */
function fallenUpright(kit: Kit, i: number): void {
  const a = ringAngle(i) + kit.range(-5, 5)
  kit.at({ at: polar(a, RING_R + 0.42), rotY: a + kit.range(-15, 15) }, () =>
    kit.part(() => {
      kit.box({ w: UP_W * 0.95, h: UP_D * 0.9, d: UP_H * 0.9, color: stone(i + 1) })
    }),
  )
}

/** 組石の2本の柱。one のときは1本だけ（もう1本は倒れて横たわる。段階3で置く） */
function trilithonPosts(kit: Kit, t: Trilithon): void {
  kit.at({ at: polar(t.a, t.r), rotY: t.a }, () => {
    for (const s of t.state === 'one' ? [-1] : [-1, 1]) {
      kit.part(() => {
        const lean: Vec3 = t.state === 'one' ? [-6, 0, s * 3] : [kit.range(-1.5, 1.5), 0, kit.range(-1.5, 1.5)]
        kit.frustum({ w: 0.24, d: 0.21, topW: 0.2, topD: 0.18, h: t.h, at: [s * 0.15, 0, 0], rot: lean, color: stone(Math.round(t.a / 10) + s) })
      })
    }
  })
}

/** 組石の横石（complete）、または倒れた柱と落ちた横石（one） */
function trilithonTop(kit: Kit, t: Trilithon): void {
  kit.at({ at: polar(t.a, t.r), rotY: t.a }, () =>
    kit.part(() => {
      if (t.state === 'complete') {
        kit.box({ w: 0.66, h: 0.14, d: 0.2, at: [0, t.h - 0.01, 0], color: stone(Math.round(t.a / 10) + 2) })
      } else {
        // 倒れた柱（内側へ横たわる）と、割れて落ちた横石
        kit.box({ w: 0.24, h: 0.19, d: t.h * 0.95, at: [0.22, 0, -t.h * 0.45], rotY: 12, color: stone(Math.round(t.a / 10) + 1) })
        kit.box({ w: 0.58, h: 0.13, d: 0.19, at: [-0.05, 0, -0.42], rotY: -25, color: stone(Math.round(t.a / 10) + 3) })
      }
    }),
  )
}

/** 小さな青い石：外の輪の内側の輪と、組石の内側の馬蹄形（抜けや傾きをまぜる） */
function bluestones(kit: Kit): void {
  // 内側の輪（半径1.82）。石の多くは抜けていて、残りも高さがまちまち
  for (let g = 0; g < 4; g++) {
    kit.part(() => {
      for (let k = 0; k < 9; k++) {
        const i = g * 9 + k
        if (kit.chance(0.42)) continue
        const a = i * 10 + kit.range(-3, 3)
        const h = kit.range(0.12, 0.34)
        const [x, , z] = polar(a, 1.82)
        kit.frustum({ w: 0.11, d: 0.09, topW: 0.085, topD: 0.07, h: h * 1.1, at: [x, 0, z], rotY: a, rot: [kit.range(-6, 6), 0, kit.range(-6, 6)], color: BLUESTONE })
      }
    })
  }
  // 組石の内側の馬蹄形（開いた側が正面）
  kit.part(() => {
    for (let k = 0; k < 11; k++) {
      const a = 55 + (k * 250) / 10
      if (k === 3 || k === 8) continue
      const [x, , z] = polar(a, 0.83 + Math.abs(Math.cos((a * Math.PI) / 180)) * 0.09)
      kit.frustum({ w: 0.1, d: 0.08, topW: 0.075, topD: 0.06, h: kit.range(0.34, 0.47), at: [x, 0, z], rotY: a, color: BLUESTONE })
    }
  })
}

/** 羊（白い体と黒い顔と脚）。前は +Z */
function sheep(kit: Kit, at: Vec3, rotY: number): void {
  kit.part(() =>
    kit.at({ at, rotY }, () => {
      for (const [x, z] of [
        [-0.016, -0.026],
        [0.016, -0.026],
        [-0.016, 0.026],
        [0.016, 0.026],
      ] as const) {
        kit.box({ w: 0.01, h: 0.03, d: 0.01, at: [x, 0, z], color: '#2A2724' })
      }
      kit.sphere({ r: 0.04, squash: 0.62, at: [0, 0.024, 0], seg: 8, color: '#F1EEE6', scale: [0.9, 1, 1.25] })
      kit.box({ w: 0.024, h: 0.026, d: 0.03, at: [0, 0.04, 0.052], rot: [25, 0, 0], color: '#2A2724' })
    }),
  )
}
