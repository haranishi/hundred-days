// ブランデンブルク門：前後二列・六本ずつの柱と五つの通路、四頭立ての戦車。
import { COLORS, type Kit } from './kit'

const SANDSTONE = '#D9C6A3'
const DETAIL = '#B8A687'
const BRONZE = '#537E69'
const COLUMNS = [-2.12, -1.36, -0.54, 0.54, 1.36, 2.12] as const

export function build(kit: Kit): void {
  kit.ground(COLORS.pavement)
  kit.stage(1)
  kit.box({ w: 7.43, h: 0.055, d: 2.1, color: '#C0B69F' })
  for (const s of [-1, 1]) kit.box({ w: 1.18, h: 1.2, d: 1.45, at: [s * 3.07, 0.055, 0], color: SANDSTONE })
  for (const x of COLUMNS) for (const z of [-0.42, 0.42]) kit.cylinder({ r: 0.16, h: 0.9, seg: 12, at: [x, 0.055, z], color: SANDSTONE })

  kit.stage(2)
  for (const x of COLUMNS) for (const z of [-0.42, 0.42]) kit.part(() => {
    kit.cylinder({ r: 0.153, rTop: 0.13, h: 1.12, seg: 12, at: [x, 0.95, z], color: SANDSTONE })
    kit.box({ w: 0.4, h: 0.11, d: 0.4, at: [x, 2.07, z], color: SANDSTONE })
  })
  kit.box({ w: 4.73, h: 0.48, d: 1.22, at: [0, 2.18, 0], color: SANDSTONE })
  for (const s of [-1, 1]) kit.part(() => {
    kit.box({ w: 1.32, h: 0.14, d: 1.59, at: [s * 3.07, 1.26, 0], color: SANDSTONE })
    kit.hipRoof({ w: 1.22, d: 1.49, h: 0.19, overhang: 0, at: [s * 3.07, 1.4, 0], color: DETAIL })
  })

  kit.stage(3)
  kit.order(-1)
  quadriga(kit)
  kit.order(0)
  kit.part(() => {
    kit.box({ w: 4.9, h: 0.105, d: 1.38, at: [0, 2.66, 0], color: SANDSTONE })
    kit.box({ w: 2.25, h: 0.22, d: 1.04, at: [0, 2.77, 0], color: SANDSTONE })
    for (const z of [-0.626, 0.626]) for (let j = 0; j < 13; j++) kit.box({ w: 0.085, h: 0.25, d: 0.028, at: [-2.1 + j * 0.35, 2.3, z], color: DETAIL })
    for (const x of COLUMNS) for (const z of [-0.42, 0.42]) kit.cylinder({ r: 0.184, h: 0.045, seg: 12, at: [x, 0.055, z], color: DETAIL })
  })

  kit.stage(4)
  for (const x of [-3.6, -2.8, 2.8, 3.6]) kit.tree({ kind: 'round', h: 0.6, at: [x, 0, -2.4], color: '#54804A' })
  for (const [x, z] of [[-2.4, 1.6], [-1.2, 2.3], [0.4, 1.6], [1.65, 2.1], [2.9, 1.8], [-0.6, 3.1], [0.8, 3.3], [-1.4, -1.5]] as const) kit.person({ at: [x, 0, z], rotY: kit.range(0, 360) })
  for (const s of [-1, 1]) kit.box({ w: 1.45, h: 0.025, d: 0.92, at: [s * 2.55, 0, 2.82], color: '#85A56D' })
}

function quadriga(kit: Kit): void {
  kit.at({ at: [0, 2.99, 0] }, () => kit.part(() => {
    kit.box({ w: 0.82, h: 0.04, d: 0.86, color: BRONZE, finish: 'metal' })
    // 独自の抽象化した馬四頭。現代の作品や画像のデータは使用しない。
    for (const x of [-0.3, -0.1, 0.1, 0.3]) {
      kit.box({ w: 0.105, h: 0.125, d: 0.31, at: [x, 0.16, 0.1], color: BRONZE, finish: 'metal' })
      for (const z of [-0.01, 0.2]) for (const dx of [-0.034, 0.034]) kit.beam({ from: [x + dx, 0.04, z], to: [x + dx, 0.19, z + 0.045], size: 0.026, color: BRONZE, finish: 'metal' })
      kit.beam({ from: [x, 0.24, 0.22], to: [x, 0.39, 0.28], size: 0.07, color: BRONZE, finish: 'metal' })
      kit.box({ w: 0.078, h: 0.07, d: 0.12, at: [x, 0.36, 0.29], color: BRONZE, finish: 'metal' })
    }
    kit.box({ w: 0.24, h: 0.13, d: 0.2, at: [0, 0.09, -0.3], color: BRONZE, finish: 'metal' })
    for (const x of [-0.17, 0.17]) kit.torus({ r: 0.07, tube: 0.018, seg: 8, rotY: 90, at: [x, 0.045, -0.29], color: BRONZE, finish: 'metal' })
    kit.cylinder({ r: 0.04, h: 0.28, seg: 6, at: [0, 0.2, -0.32], color: BRONZE, finish: 'metal' })
    kit.sphere({ r: 0.047, seg: 6, at: [0, 0.48, -0.32], color: BRONZE, finish: 'metal' })
    kit.beam({ from: [0.07, 0.38, -0.31], to: [0.1, 0.81, -0.31], size: 0.026, color: BRONZE, finish: 'metal' })
    kit.beam({ from: [0.1, 0.78, -0.31], to: [-0.11, 0.9, -0.31], size: 0.035, width: 0.08, color: BRONZE, finish: 'metal' })
    kit.beam({ from: [0.1, 0.78, -0.31], to: [0.31, 0.9, -0.31], size: 0.035, width: 0.08, color: BRONZE, finish: 'metal' })
  }))
}
