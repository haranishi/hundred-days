// Simplified skyline: two groups of four tapering bell towers plus six central towers.
// Does not claim the complete basilica is finished; facade sculptures/text are omitted.
import { COLORS, type Kit } from './kit'

const SAND = '#C3AF89'

export function build(kit: Kit): void {
  kit.ground(COLORS.pavement)
  kit.stage(1)
  kit.box({ w: 3.3, d: 4.6, h: 0.13, color: SAND })
  kit.box({ w: 2.45, d: 3.65, h: 1.25, at: [0, 0.13, -0.05], color: SAND })
  kit.box({ w: 3.18, d: 0.84, h: 1.5, at: [0, 0.13, 1.68], color: SAND })
  kit.stage(2)
  for (const z of [-1.65, 1.65]) for (let i = 0; i < 4; i++) {
    const x = -1.13 + i * 0.755
    const h = (i === 1 || i === 2) ? 3.95 : 3.5
    tower(kit, x, z, h)
  }
  kit.part(() => {
    kit.gableRoof({ w: 2.4, d: 3.65, h: 0.55, at: [0, 1.38, -0.05], rotY: 90, color: '#A99A7F' })
    for (const x of [-1.3, 1.3]) for (let i = 0; i < 5; i++) kit.frustum({ w: 0.2, d: 0.25, topW: 0.1, topD: 0.18, h: 1.75, at: [x, 0.13, -1.22 + i * 0.63], color: SAND })
  })
  kit.stage(3)
  kit.part(() => {
    for (const [x, z] of [[-0.66, -0.36], [0.66, -0.36], [-0.66, 0.5], [0.66, 0.5]] as const) {
      kit.cylinder({ r: 0.25, rTop: 0.09, h: 2.32, at: [x, 1.92, z], color: SAND, seg: 8 })
      kit.sphere({ r: 0.12, at: [x, 4.24, z], color: '#E0C57A', seg: 8 })
    }
    kit.cylinder({ r: 0.37, rTop: 0.11, h: 3.43, at: [0, 1.92, 0.12], color: SAND, seg: 12 })
    kit.beam({ from: [0, 5.35, 0.12], to: [0, 5.96, 0.12], size: 0.12, color: COLORS.white })
    kit.beam({ from: [-0.23, 5.74, 0.12], to: [0.23, 5.74, 0.12], size: 0.12, color: COLORS.white })
    kit.cylinder({ r: 0.31, rTop: 0.1, h: 2.58, at: [0, 1.92, -1.12], color: SAND, seg: 10 })
    kit.sphere({ r: 0.18, at: [0, 4.5, -1.12], color: '#D8E4DA', seg: 8 })
    for (const x of [-0.75, 0, 0.75]) kit.arch({ w: 0.63, h: 0.98, d: 0.06, thick: 0.1, at: [x, 0.13, 2.12], color: '#A39272' })
  })
  kit.stage(4)
  for (const [x, z] of [[-2.5, -1.9], [2.5, -1.9], [-2.55, 1.85], [2.55, 1.85]] as const) kit.tree({ h: 0.62, at: [x, 0, z] })
  for (const x of [-1.2, -0.55, 0.25, 0.9]) kit.person({ at: [x, 0, 2.9], h: 0.11 })
}

function tower(kit: Kit, x: number, z: number, h: number): void {
  kit.part(() => {
    kit.cylinder({ r: 0.24, rTop: 0.105, h: h - 0.13, at: [x, 0.13, z], color: SAND, seg: 12 })
    kit.lathe({ points: [[0, 0], [0.11, 0], [0.17, 0.14], [0.15, 0.32], [0, 0.44]], at: [x, h, z], color: '#D6B671', seg: 10 })
    for (let row = 0; row < 9; row++) {
      const y = 1.1 + row * 0.27
      for (const dx of [-0.08, 0.08]) kit.box({ w: 0.055, h: 0.16, d: 0.025, at: [x + dx, y, z + 0.19 - row * 0.008], color: '#786C55' })
    }
  })
}
