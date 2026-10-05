import { COLORS, type Kit } from './kit'

const STONE = '#C5B893'
const SHADE = '#938D76'
const STEP = 0.265
const Z = -0.15

export function build(kit: Kit): void {
  kit.ground('#89A862')
  kit.stage(1)
  kit.box({ w: 5.35, d: 5.35, h: 0.09, at: [0, 0, Z], color: STONE })
  for (let i = 0; i < 4; i++) tier(kit, i)
  kit.stage(2)
  for (let i = 4; i < 8; i++) tier(kit, i)
  // Four broad stairways run through all nine terraces.
  for (const angle of [0, 90, 180, 270]) {
    kit.at({ at: [0, 0, Z], rotY: angle }, () => {
      kit.stairs({ w: 0.69, d: 2.0, h: 2.385, steps: 24, at: [0, 0.09, 1.55], color: '#B9AE8E' })
      for (const x of [-0.44, 0.44]) kit.beam({ from: [x, 0.12, 2.61], to: [x, 2.52, 0.52], size: 0.095, color: STONE })
    })
  }
  kit.stage(3)
  tier(kit, 8)
  kit.part(() => {
    const y = 0.09 + STEP * 9
    kit.box({ w: 1.13, d: 1.13, h: 0.53, at: [0, y, Z], color: STONE })
    kit.box({ w: 1.28, d: 1.28, h: 0.1, at: [0, y + 0.53, Z], color: STONE })
    for (const angle of [0, 90, 180, 270]) kit.at({ at: [0, y, Z], rotY: angle }, () => {
      kit.box({ w: 0.38, h: 0.43, d: 0.018, at: [0, 0.02, 0.573], color: '#524F42' })
      for (const x of [-0.24, 0.24]) kit.cylinder({ r: 0.048, h: 0.44, at: [x, 0.01, 0.594], seg: 8, color: STONE })
    })
  })
  for (const x of [-0.45, 0.45]) {
    kit.part(() => {
      kit.box({ w: 0.24, h: 0.12, d: 0.34, at: [x, 0.09, Z + 2.62], color: STONE })
      kit.sphere({ r: 0.13, squash: 0.7, at: [x, 0.15, Z + 2.72], scale: [0.7, 1, 1.25], seg: 8, color: STONE })
      kit.box({ w: 0.16, h: 0.018, d: 0.12, at: [x, 0.195, Z + 2.85], color: SHADE })
    })
  }
  kit.stage(4)
  // A low group of columns beside the main pyramid, not another pyramid.
  kit.part(() => {
    for (const x of [3.0, 3.35, 3.7]) {
      for (const z of [-1.1, -0.6, -0.1, 0.4]) kit.cylinder({ r: 0.075, h: kit.range(0.34, 0.48), at: [x, 0, z], seg: 8, color: SHADE })
    }
  })
  kit.scatter({ count: 16, rMin: 3.5, rMax: 4.45, gap: 0.45, ok: (x, z) => z < -1.3 || x < -2.8 }, (_i, x, z) => {
    kit.tree({ kind: 'round', h: kit.range(0.45, 0.75), at: [x, 0, z], color: COLORS.forest })
  })
  for (const [x, z] of [[-1.5, 3.2], [-0.6, 3.5], [0.4, 3.1], [1.1, 3.45], [2.2, 2.75], [-2.6, 1.6]] as const) kit.person({ at: [x, 0, z] })
}

function tier(kit: Kit, i: number): void {
  const w = 5.04 - i * 0.45
  kit.part(() => {
    kit.frustum({ w, d: w, topW: w - 0.14, topD: w - 0.14, h: STEP, at: [0, 0.09 + i * STEP, Z], color: STONE })
    kit.box({ w: w - 0.1, d: w - 0.1, h: 0.04, at: [0, 0.09 + (i + 1) * STEP - 0.04, Z], color: '#D0C6A9' })
  })
}
