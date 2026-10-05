// 奥の大社造本殿と、手前の神楽殿。大注連縄を本殿へ誤って取り付けない。
import { COLORS, type Kit } from './kit'

const WOOD = '#785338'
const BARK = '#5C4632'
const STRAW = '#D8B56D'
const HX = 0.65
const HZ = -1.8

export function build(kit: Kit): void {
  kit.ground(COLORS.gravel)
  kit.stage(1)
  kit.box({ w: 3.5, h: 0.09, d: 1.95, at: [-0.2, 0, 0.55], color: COLORS.stone })
  kit.box({ w: 3.1, h: 0.86, d: 1.45, at: [-0.2, 0.09, 0.55], color: '#DDCBA9' })
  kit.box({ w: 1.8, h: 0.3, d: 1.9, at: [HX, 0, HZ], color: COLORS.stone })
  kit.box({ w: 1.5, h: 1.15, d: 1.55, at: [HX, 0.42, HZ], color: WOOD })
  kit.box({ w: 0.7, h: 0.025, d: 2.0, at: [-0.2, 0, 2.45], color: '#B5AB97' })

  kit.stage(2)
  kit.gableRoof({ w: 1.55, d: 1.5, h: 0.8, rotY: 90, at: [HX, 1.57, HZ], overhang: 0.3, color: BARK })
  kit.curvedRoof({ w: 3.1, d: 1.45, h: 0.72, at: [-0.2, 0.95, 0.55], style: 'irimoya', overhang: 0.28, upturn: 0.1, color: BARK, gableColor: WOOD })
  kit.stairs({ w: 0.55, d: 0.7, h: 0.42, steps: 6, at: [HX, 0, HZ + 1.05], color: WOOD })
  kit.part(() => {
    for (const x of [-1.65, -1.1, 0.7, 1.25]) kit.cylinder({ r: 0.065, h: 0.85, seg: 10, at: [x, 0.09, 1.3], color: WOOD })
    kit.box({ w: 2.7, h: 0.73, d: 0.04, at: [-0.2, 0.13, 1.29], color: '#4C4033' })
    kit.box({ w: 3.4, h: 0.05, d: 0.32, at: [-0.2, 0.09, 1.4], color: WOOD })
    for (const dx of [-0.62, 0.62]) for (const dz of [-0.65, 0.65]) kit.cylinder({ r: 0.11, h: 0.43, seg: 10, at: [HX + dx, 0, HZ + dz], color: WOOD })
  })

  kit.stage(3)
  kit.part(() => {
    // 千木は本殿の切妻両端にあり、鰹木は棟と直角に渡る。
    for (const dz of [-0.92, 0.92]) {
      kit.beam({ from: [HX - 0.43, 2.13, HZ + dz], to: [HX + 0.34, 2.75, HZ + dz], size: 0.09, color: WOOD })
      kit.beam({ from: [HX + 0.43, 2.13, HZ + dz], to: [HX - 0.34, 2.75, HZ + dz], size: 0.09, color: WOOD })
    }
    for (let i = 0; i < 6; i++) kit.beam({ from: [HX - 0.26, 2.41, HZ - 0.63 + i * 0.25], to: [HX + 0.26, 2.41, HZ - 0.63 + i * 0.25], size: 0.11, color: WOOD })
  })
  kit.part(() => {
    // 太い横縄と三つの垂れ。わずかな輪の凹凸で藁のねじれを読ませる。
    kit.cylinder({ r: 0.14, h: 2.35, seg: 12, at: [-1.375, 0.95, 1.49], rot: [0, 0, -90], color: STRAW })
    for (let i = 0; i < 16; i++) kit.torus({ r: 0.14, tube: 0.022, seg: 10, at: [-1.32 + i * 0.148, 0.788, 1.49], rotY: 90, color: '#CBA258' })
    for (const x of [-0.98, -0.2, 0.58]) {
      kit.cone({ r: 0.16, h: 0.46, seg: 12, at: [x, 0.98, 1.5], rot: [180, 0, 0], color: STRAW })
      kit.box({ w: 0.08, h: 0.13, d: 0.024, at: [x + 0.22, 0.62, 1.53], rot: [0, 0, 12], color: COLORS.white })
    }
    kit.curvedRoof({ w: 1.1, d: 0.26, h: 0.3, at: [-0.2, 1.12, 1.39], overhang: 0.14, upturn: 0.06, color: BARK, gableColor: WOOD })
  })
  kit.part(() => {
    for (const dx of [-1.2, 1.2]) {
      kit.box({ w: 0.04, h: 0.27, d: 2.4, at: [HX + dx, 0, HZ], color: WOOD })
      kit.box({ w: 0.07, h: 0.035, d: 2.4, at: [HX + dx, 0.27, HZ], color: BARK })
    }
  })

  kit.stage(4)
  for (const [x, z] of [[-3.15, -0.65], [-3.25, 1.3], [3.25, -0.7], [3.3, 1.1], [-1.5, -3.4], [2.5, -3.05], [0.0, -3.8]] as const) kit.tree({ kind: 'pine', h: kit.range(0.65, 0.95), at: [x, 0, z], rotY: kit.range(0, 360) })
  for (let i = 0; i < 6; i++) kit.person({ at: [-0.7 + i * 0.23, 0.025, 2.05 + kit.range(0, 0.75)], rotY: 180 })
  for (const x of [-2.25, 1.85]) {
    kit.part(() => {
      kit.box({ w: 0.22, h: 0.1, d: 0.22, at: [x, 0, 2.35], color: COLORS.stone })
      kit.cylinder({ r: 0.055, h: 0.4, seg: 8, at: [x, 0.1, 2.35], color: COLORS.stone })
      kit.box({ w: 0.19, h: 0.15, d: 0.19, at: [x, 0.5, 2.35], color: COLORS.stone })
      kit.pyramid({ w: 0.3, h: 0.13, at: [x, 0.65, 2.35], color: COLORS.stone })
    })
  }
}
