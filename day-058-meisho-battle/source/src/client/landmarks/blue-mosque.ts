import { COLORS, type Kit } from './kit'

const WALL = '#CCBFA5'
const LEAD = '#789195'
const DARK = '#6A6F67'
const Z = -0.85
const MINARETS = [[-2.02, -2.37], [2.02, -2.37], [-2.02, 0.75], [2.02, 0.75], [-2.02, 2.64], [2.02, 2.64]] as const

export function build(kit: Kit): void {
  kit.ground('#A0A77B')
  kit.stage(1)
  kit.box({ w: 4.15, h: 0.11, d: 6.3, at: [0, 0, 0.13], color: '#D6CAB5' })
  kit.box({ w: 3.26, h: 0.62, d: 3.1, at: [0, 0.11, Z], color: WALL })
  kit.box({ w: 1.6, h: 0.75, d: 1.6, at: [0, 0.73, Z], color: WALL })
  kit.cylinder({ r: 0.8, h: 0.36, seg: 16, at: [0, 1.48, Z], color: WALL })
  for (const x of [-1.69, 1.69]) kit.box({ w: 0.27, h: 0.45, d: 2.25, at: [x, 0.11, 1.64], color: WALL })
  kit.box({ w: 3.3, h: 0.45, d: 0.26, at: [0, 0.11, 2.75], color: WALL })
  for (const [x, z] of MINARETS) kit.cylinder({ r: 0.15, rTop: 0.1, h: 1.02, seg: 12, at: [x, 0.11, z], color: WALL })

  kit.stage(2)
  // The central dome cascades through four half-domes and smaller exedrae.
  for (const angle of [0, 90, 180, 270]) kit.at({ at: [0, 0, Z], rotY: angle }, () => {
    kit.cylinder({ r: 0.62, h: 0.4, seg: 12, at: [0, 0.76, 0.82], color: WALL })
    dome(kit, 0, 0.82, 1.16, 0.64, 0.43)
    for (const x of [-0.5, 0.5]) dome(kit, x, 1.25, 0.73, 0.41, 0.28)
  })
  for (const [x, z] of MINARETS) {
    kit.part(() => {
      kit.cylinder({ r: 0.17, h: 0.065, at: [x, 1.12, z], seg: 12, color: WALL })
      kit.cylinder({ r: 0.09, rTop: 0.077, h: 0.87, at: [x, 1.18, z], seg: 12, color: WALL })
      kit.cylinder({ r: 0.15, h: 0.06, at: [x, 1.91, z], seg: 12, color: WALL })
    })
  }
  kit.part(() => {
    for (const x of [-1.28, -0.91, -0.55, 0.55, 0.91, 1.28]) kit.arch({ w: 0.23, h: 0.3, d: 0.04, thick: 0.035, at: [x, 0.37, Z + 1.58], color: DARK })
    for (const x of [-1.51, 1.51]) {
      for (const z of [0.8, 1.25, 1.7, 2.15, 2.55]) kit.arch({ w: 0.34, h: 0.38, d: 0.07, thick: 0.04, at: [x, 0.13, z], rotY: 90, color: WALL })
    }
  })

  kit.stage(3)
  dome(kit, 0, Z, 1.84, 0.84, 0.73)
  for (const [x, z] of MINARETS) {
    kit.part(() => {
      kit.cylinder({ r: 0.075, rTop: 0.06, h: 0.52, at: [x, 2.01, z], seg: 12, color: WALL })
      kit.cylinder({ r: 0.13, h: 0.055, at: [x, 2.47, z], seg: 12, color: WALL })
      kit.cylinder({ r: 0.057, h: 0.21, at: [x, 2.53, z], seg: 10, color: WALL })
      kit.cone({ r: 0.09, h: 0.5, at: [x, 2.74, z], seg: 10, color: LEAD })
    })
  }
  kit.part(() => {
    kit.cylinder({ r: 0.02, h: 0.15, at: [0, 2.57, Z], seg: 6, color: COLORS.gold, finish: 'gold' })
    for (const x of [-1.69, 1.69]) {
      for (const z of [0.85, 1.4, 1.95, 2.5]) dome(kit, x, z, 0.56, 0.24, 0.17)
    }
    for (const x of [-1.1, -0.55, 0, 0.55, 1.1]) dome(kit, x, 2.75, 0.56, 0.24, 0.17)
    kit.cylinder({ r: 0.34, h: 0.055, at: [0, 0.11, 1.63], seg: 8, color: WALL })
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4
      kit.cylinder({ r: 0.026, h: 0.24, at: [Math.sin(a) * 0.24, 0.165, 1.63 + Math.cos(a) * 0.24], seg: 6, color: WALL })
    }
    kit.cone({ r: 0.35, h: 0.19, at: [0, 0.405, 1.63], seg: 8, color: LEAD })
  })
  kit.stage(4)
  for (const x of [-2.85, 2.85]) {
    for (const z of [-1.8, -0.55, 0.9, 2.0]) kit.tree({ kind: 'round', h: kit.range(0.42, 0.65), at: [x, 0, z], color: COLORS.moss })
  }
  for (const [x, z] of [[-0.8, 1.3], [0.7, 1.7], [-0.45, 2.35], [0.3, 2.25], [-0.8, 3.55], [0.6, 3.6]] as const) kit.person({ at: [x, z > 3 ? 0 : 0.11, z], h: 0.1 })
}

function dome(kit: Kit, x: number, z: number, y: number, r: number, h: number): void {
  kit.lathe({ points: [[0, 0], [r, 0], [r * 0.98, h * 0.22], [r * 0.9, h * 0.43], [r * 0.73, h * 0.67], [r * 0.43, h * 0.9], [0, h]], seg: 16, at: [x, y, z], color: LEAD, finish: 'satin' })
}
