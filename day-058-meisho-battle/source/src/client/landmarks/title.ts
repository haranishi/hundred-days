// タイトル画面の飾りの島：海に浮かぶ小さな島、木、小舟、「？」の形の立て札（文字は入れない）。
// 名所ではないので当てる手がかりは要らない。完成形（showComplete）で見せる前提で、色は明るくする。
import { COLORS, type Kit } from './kit'

/** 立て札の「？」の色（画面の差し色のからし） */
const SIGN = '#F2B544'
const POST = '#8A5E3C'

export function build(kit: Kit): void {
  kit.ground('#3F92C6')

  // ---- 段階1：海と島 ----
  kit.stage(1)
  kit.water({ r: 4.86, h: 0.04, color: COLORS.sea })
  kit.mound({ r: 3.0, rx: 3.0, rz: 2.4, h: 0.4, at: [0.1, 0, -0.3], color: COLORS.sand })
  kit.mound({ r: 2.3, rx: 2.3, rz: 1.75, h: 0.78, at: [0.2, 0, -0.5], color: COLORS.lawn })
  kit.mound({ r: 0.5, h: 0.2, at: [-3.3, 0, 2.4], color: COLORS.sand })

  // ---- 段階2：岩と桟橋 ----
  kit.stage(2)
  for (const [x, z, r] of [
    [3.45, 1.0, 0.2],
    [3.7, 0.55, 0.13],
    [-3.15, -1.45, 0.18],
    [-0.6, 2.75, 0.12],
  ] as const) {
    kit.sphere({ r, squash: 0.6, at: [x, 0, z], seg: 8, color: COLORS.rock })
  }
  kit.part(() => {
    kit.box({ w: 0.4, h: 0.05, d: 1.2, at: [1.6, 0.12, 2.45], color: COLORS.wood })
    for (const [x, z] of [
      [1.44, 2.95],
      [1.76, 2.95],
      [1.44, 2.35],
      [1.76, 2.35],
    ] as const) {
      kit.cylinder({ r: 0.03, h: 0.18, at: [x, 0, z], seg: 6, color: COLORS.darkWood })
    }
  })

  // ---- 段階3：「？」の立て札（丘のてっぺん。遠くからも読めるよう大きめ） ----
  kit.stage(3)
  const on = (x: number, z: number): [number, number, number] => [x, Math.max(0, kit.groundAt(x, z) - 0.03), z]
  kit.at({ scale: 1.9 }, () => questionSign(kit, scaleBack(on(0.25, -0.45), 1.9)))

  // ---- 段階4：木・小舟・人 ----
  kit.stage(4)
  kit.tree({ kind: 'palm', h: 1.3, at: on(-1.25, -0.25), rotY: 20 })
  kit.tree({ kind: 'palm', h: 1.1, at: on(-0.75, -1.35), rotY: 200 })
  kit.tree({ kind: 'round', h: 1.0, at: on(1.45, -1.0), color: '#6FAF4E' })
  kit.tree({ kind: 'round', h: 0.75, at: on(1.0, -1.75), color: '#5C9E46' })
  kit.tree({ kind: 'round', h: 0.6, at: on(1.85, -0.3), color: '#7AB85A' })
  kit.tree({ kind: 'palm', h: 0.75, at: on(-3.3, 2.4), rotY: 90 })
  kit.boat({ kind: 'row', at: [2.95, 0.04, 2.6], rotY: 35, len: 0.75, color: '#E2483D' })
  kit.boat({ kind: 'row', at: [-2.75, 0.04, -2.65], rotY: -60, len: 0.65, color: '#1E9A8A' })
  kit.person({ at: [1.6, 0.17, 2.75], rotY: 180, color: '#4B5BD7' })
  kit.person({ at: on(0.9, 0.55), rotY: 160, color: '#E2483D' })
}

/** 拡大した座標の中に置くとき、置き場所を拡大の前の値へ戻す */
function scaleBack(p: readonly [number, number, number], s: number): [number, number, number] {
  return [p[0] / s, p[1] / s, p[2] / s]
}

/** 「？」の形の立て札。柱の上に、点・縦の棒・かぎの形を順に積む。正面は +Z */
function questionSign(kit: Kit, at: readonly [number, number, number]): void {
  const sign = { color: SIGN, finish: 'satin' as const }
  kit.at({ at }, () =>
    kit.part(() => {
      // 柱は「？」の後ろを通って、かぎの中ほどまで立つ
      kit.box({ w: 0.06, h: 0.86, d: 0.06, at: [0, 0, -0.08], color: POST })
      // 点
      kit.sphere({ r: 0.065, at: [0, 0.28, 0], seg: 10, ...sign })
      // 縦の棒
      kit.box({ w: 0.1, h: 0.16, d: 0.1, at: [0, 0.47, 0], ...sign })
      // かぎ（円の下から右回りに上を通って左へ。輪の中心を回転の中心にするため、中心から下へずらして置く）
      const r = 0.17
      const tube = 0.05
      kit.at({ at: [0, 0.63 + r, 0], rot: [0, 0, -90] }, () =>
        kit.torus({ r, tube, arc: 285, seg: 22, at: [0, -(r + tube), 0], ...sign }),
      )
    }),
  )
}
