// 唐招提寺金堂：一重の大きな寄棟屋根と、正面七間を区切る吹き放ちの円柱。
import { COLORS, type Kit } from './kit'

const WOOD = '#745039'
const TILE = '#67665D'
const CZ = -0.75

export function build(kit: Kit): void {
  kit.ground(COLORS.moss)
  kit.stage(1)
  kit.box({ w: 6.05, h: 0.22, d: 3.05, at: [0, 0, CZ], color: '#C3B5A0' })
  kit.box({ w: 5.35, h: 1.3, d: 1.62, at: [0, 0.22, CZ - 0.31], color: '#AD8F70' })
  kit.box({ w: 2.05, h: 0.025, d: 3.65, at: [0, 0, 2.02], color: COLORS.gravel })
  kit.stairs({ w: 2.7, h: 0.22, d: 0.5, at: [0, 0, CZ + 1.77], steps: 3, color: '#C3B5A0' })

  kit.stage(2)
  kit.part(() => {
    kit.box({ w: 5.65, h: 0.15, d: 2.45, at: [0, 1.52, CZ], color: WOOD })
    for (const x of [-2.6, 2.6]) kit.cylinder({ r: 0.13, h: 1.3, seg: 10, at: [x, 0.22, CZ + 1.06], color: WOOD })
  })
  kit.curvedRoof({ w: 5.65, d: 2.45, h: 1.02, style: 'yosemune', overhang: 0.45, upturn: 0.06, curve: 1.23, thick: 0.09, at: [0, 1.67, CZ], color: TILE })

  kit.stage(3)
  kit.order(-1)
  kit.part(() => {
    // 八本の円柱で七間。東大寺の二重の大屋根とは違い、柱列を決め手にする。
    for (const x of [-1.98, -1.28, -0.52, 0.52, 1.28, 1.98]) {
      kit.lathe({ points: [[0, 0], [0.12, 0], [0.145, 0.52], [0.11, 1.3], [0, 1.3]], seg: 10, at: [x, 0.22, CZ + 1.06], color: WOOD })
    }
    for (const x of [-2.6, -1.98, -1.28, -0.52, 0.52, 1.28, 1.98, 2.6]) {
      for (let t = 0; t < 3; t++) kit.box({ w: 0.31 + t * 0.08, h: 0.045, d: 0.3 + t * 0.1, at: [x, 1.4 + t * 0.08, CZ + 1.09], color: WOOD })
    }
    kit.box({ w: 5.5, h: 0.05, d: 0.09, at: [0, 0.28, CZ + 1.18], color: WOOD })
    for (const x of [-1.9, -0.75, 0.75, 1.9]) {
      kit.box({ w: 0.77, h: 0.82, d: 0.026, at: [x, 0.4, CZ + 0.52], color: '#493728' })
      for (let j = 0; j < 7; j++) kit.box({ w: 0.028, h: 0.75, d: 0.035, at: [x - 0.3 + j * 0.1, 0.44, CZ + 0.545], color: WOOD })
    }
  })
  kit.order(0)
  kit.part(() => {
    kit.box({ w: 3.98, h: 0.12, d: 0.2, at: [0, 2.69, CZ], color: TILE })
    for (const s of [-1, 1]) {
      // 鴟尾は灰色の瓦製。金色の東大寺の鴟尾とは区別する。
      kit.extrude({ points: [[0, 0], [0.33, 0], [0.34, 0.12], [0.14, 0.52], [0.04, 0.53], [-0.08, 0.14]], h: 0.1, rot: [-90, 0, 0], rotY: s > 0 ? 0 : 180, at: [s * 1.83, 2.77, CZ + 0.05], color: TILE })
    }
  })

  kit.stage(4)
  for (const [x, z] of [[-3.5, -1.8], [3.55, -1.85], [-3.6, 0.45], [3.5, 0.6], [-2.85, 2.9], [2.9, 2.65]] as const) {
    kit.tree({ kind: 'pine', h: kit.range(0.55, 0.85), at: [x, 0, z], rotY: kit.range(0, 360) })
  }
  for (const [x, z] of [[-0.5, 1.5], [0.6, 1.8], [-0.2, 2.9], [0.65, 3.4], [-1.1, 2.3]] as const) kit.person({ at: [x, 0.025, z], rotY: 180 })
}
