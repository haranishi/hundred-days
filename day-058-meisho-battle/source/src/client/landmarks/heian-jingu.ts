// 大極殿・左右の楼・応天門・大鳥居。朱の柱と緑の瓦、広い白砂の庭。
import { COLORS, type Kit } from './kit'

const RED = COLORS.vermilion
const GREEN = '#66A18B'
const WALL = '#F0E8D7'

export function build(kit: Kit): void {
  kit.ground(COLORS.lawn)
  kit.stage(1)
  kit.box({ w: 5.8, h: 0.025, d: 4.5, at: [0, 0, -0.15], color: COLORS.gravel })
  kit.box({ w: 3.5, h: 0.16, d: 1.1, at: [0, 0.025, -1.8], color: COLORS.stone })
  kit.box({ w: 3.3, h: 0.72, d: 0.92, at: [0, 0.185, -1.8], color: WALL })
  for (const x of [-2.7, 2.7]) {
    kit.box({ w: 0.45, h: 0.42, d: 2.8, at: [x, 0.025, -0.25], color: WALL })
    kit.box({ w: 0.86, h: 0.64, d: 0.86, at: [x, 0.025, -1.7], color: WALL })
  }
  for (const x of [-1.25, 1.25]) kit.box({ w: 1.5, h: 0.4, d: 0.45, at: [x, 0.025, 1.22], color: WALL })

  kit.stage(2)
  kit.curvedRoof({ w: 3.3, d: 0.92, h: 0.5, style: 'yosemune', overhang: 0.24, upturn: 0.08, at: [0, 0.905, -1.8], color: GREEN })
  kit.part(() => {
    for (let i = 0; i < 11; i++) kit.cylinder({ r: 0.045, h: 0.72, seg: 8, at: [-1.52 + i * 0.304, 0.185, -1.3], color: RED })
    kit.box({ w: 3.4, h: 0.065, d: 0.06, at: [0, 0.79, -1.29], color: RED })
    for (const x of [-2.7, 2.7]) {
      for (let i = 0; i < 9; i++) kit.cylinder({ r: 0.032, h: 0.42, seg: 8, at: [x + (x < 0 ? 0.23 : -0.23), 0.025, -1.5 + i * 0.32], color: RED })
      kit.gableRoof({ w: 2.8, d: 0.45, h: 0.2, rotY: 90, at: [x, 0.445, -0.25], overhang: 0.13, color: GREEN })
    }
    for (const x of [-1.25, 1.25]) kit.gableRoof({ w: 1.5, d: 0.45, h: 0.17, at: [x, 0.425, 1.22], overhang: 0.12, color: GREEN })
  })
  kit.stairs({ w: 1.5, d: 0.38, h: 0.16, at: [0, 0.025, -1.03], steps: 3, color: COLORS.stone })

  kit.stage(3)
  for (const x of [-2.7, 2.7]) {
    kit.part(() => {
      kit.curvedRoof({ w: 0.86, d: 0.86, h: 0.2, style: 'skirt', top: { w: 0.55, d: 0.55 }, at: [x, 0.665, -1.7], overhang: 0.22, upturn: 0.09, color: GREEN })
      kit.box({ w: 0.55, h: 0.53, d: 0.55, at: [x, 0.825, -1.7], color: WALL })
      kit.curvedRoof({ w: 0.55, d: 0.55, h: 0.43, style: 'hogyo', at: [x, 1.355, -1.7], overhang: 0.29, upturn: 0.12, color: GREEN })
      for (const dx of [-0.25, 0.25]) for (const dz of [-0.25, 0.25]) kit.cylinder({ r: 0.032, h: 0.52, seg: 8, at: [x + dx, 0.825, -1.7 + dz], color: RED })
      kit.box({ w: 0.21, h: 0.26, d: 0.025, at: [x, 0.96, -1.414], color: '#413C35' })
    })
  }
  kit.part(() => {
    // 二層の応天門の空洞は柱と梁だけで作り、門の向こうも見通せる。
    for (const x of [-0.62, 0.62]) kit.cylinder({ r: 0.075, h: 0.78, seg: 10, at: [x, 0.025, 1.25], color: RED })
    kit.box({ w: 1.55, h: 0.1, d: 0.7, at: [0, 0.805, 1.25], color: RED })
    kit.curvedRoof({ w: 1.55, d: 0.7, h: 0.15, style: 'skirt', top: { w: 1.15, d: 0.46 }, at: [0, 0.905, 1.25], overhang: 0.2, color: GREEN })
    kit.box({ w: 1.15, h: 0.42, d: 0.46, at: [0, 1.015, 1.25], color: WALL })
    kit.curvedRoof({ w: 1.15, d: 0.46, h: 0.34, at: [0, 1.435, 1.25], overhang: 0.27, upturn: 0.09, color: GREEN })
    for (const x of [-0.5, 0, 0.5]) kit.box({ w: 0.045, h: 0.4, d: 0.04, at: [x, 1.015, 1.5], color: RED })
  })
  kit.part(() => {
    const z = 3.7
    for (const x of [-0.86, 0.86]) {
      kit.cylinder({ r: 0.105, rTop: 0.088, h: 1.72, seg: 12, at: [x, 0, z], color: RED })
      kit.cylinder({ r: 0.145, h: 0.08, seg: 12, at: [x, 0, z], color: '#938C7D' })
    }
    kit.box({ w: 2.25, h: 0.16, d: 0.21, at: [0, 1.62, z], color: RED })
    kit.box({ w: 1.99, h: 0.09, d: 0.1, at: [0, 1.29, z], color: RED })
    kit.box({ w: 2.36, h: 0.08, d: 0.27, at: [0, 1.78, z], color: '#423D35' })
    kit.box({ w: 0.15, h: 0.25, d: 0.11, at: [0, 1.37, z], color: RED })
  })

  kit.stage(4)
  for (const [x, z] of [[-3.6, -1.7], [3.6, -1.7], [-3.45, 0.7], [3.4, 0.6], [-2.65, -3.2], [2.65, -3.2], [-1.2, -3.45], [1.2, -3.45]] as const) kit.tree({ kind: 'pine', h: kit.range(0.48, 0.7), at: [x, 0, z], rotY: kit.range(0, 360) })
  kit.scatter({ count: 10, rMax: 2.2, gap: 0.3, ok: (x, z) => Math.abs(x) < 1.9 && z > -0.75 && z < 0.85 }, (_i, x, z) => kit.person({ at: [x, 0.025, z], rotY: kit.range(0, 360) }))
  kit.person({ at: [-0.24, 0, 3.42], rotY: 180 })
  kit.person({ at: [0.3, 0, 3.18], rotY: 180 })
}
