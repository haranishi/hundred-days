import { COLORS, type Kit, type XZ } from './kit'

const RED = '#AC563E'
const WHITE = '#ECE3CE'
const Z = -0.58
const KIOSKS = [[-1.04, -1.04], [1.04, -1.04], [-1.04, 1.04], [1.04, 1.04], [-1.32, 0], [1.32, 0], [0, -1.32], [0, 1.32]] as const

export function build(kit: Kit): void {
  kit.ground('#7FA055')
  kit.stage(1)
  kit.part(() => {
    kit.box({ w: 0.5, h: 0.025, d: 4.5, at: [0, 0, 2.2], color: '#D4BA90' })
    kit.box({ w: 6.4, h: 0.025, d: 0.5, at: [0, 0, 2.33], color: '#D4BA90' })
    kit.box({ w: 0.13, h: 0.033, d: 3.82, at: [0, 0, 2.46], color: COLORS.pond, finish: 'water' })
    kit.box({ w: 6.1, h: 0.033, d: 0.13, at: [0, 0, 2.33], color: COLORS.pond, finish: 'water' })
  }, { appear: 'grow' })
  kit.box({ w: 4.65, h: 0.27, d: 4.05, at: [0, 0, Z], color: '#C69A70' })
  kit.extrude({ points: octagon(1.44, 0.36), h: 1.12, at: [0, 0.27, Z], color: RED })
  kit.extrude({ points: octagon(1.49, 0.36), h: 0.06, at: [0, 1.36, Z], color: WHITE })
  kit.cylinder({ r: 0.67, h: 0.23, at: [0, 1.42, Z], seg: 16, color: WHITE })

  kit.stage(2)
  // No free-standing minarets: broad red facades distinguish it from the Taj.
  for (const angle of [0, 90, 180, 270]) kit.at({ at: [0, 0.27, Z], rotY: angle }, () => {
    kit.part(() => {
      kit.box({ w: 0.75, h: 0.95, d: 0.03, at: [0, 0.05, 1.455], color: '#6B4734' })
      kit.arch({ w: 0.96, h: 1.08, d: 0.055, thick: 0.075, at: [0, 0, 1.475], color: WHITE })
      for (const x of [-0.86, 0.86]) {
        kit.arch({ w: 0.34, h: 0.37, d: 0.06, thick: 0.045, at: [x, 0.08, 1.47], color: WHITE })
        kit.arch({ w: 0.34, h: 0.34, d: 0.06, thick: 0.045, at: [x, 0.65, 1.47], color: WHITE })
      }
      kit.box({ w: 2.04, h: 0.035, d: 0.04, at: [0, 0.53, 1.475], color: WHITE })
    })
  })
  for (const [x, z] of KIOSKS) {
    kit.part(() => {
      kit.cylinder({ r: 0.17, h: 0.045, at: [x, 1.42, Z + z], seg: 8, color: WHITE })
      for (const [dx, dz] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]] as const) kit.cylinder({ r: 0.025, h: 0.27, at: [x + dx, 1.46, Z + z + dz], seg: 6, color: RED })
    })
  }
  kit.stairs({ w: 0.82, d: 0.3, h: 0.27, steps: 4, at: [0, 0, Z + 2.17], color: WHITE })

  kit.stage(3)
  dome(kit, 0, Z, 1.65, 0.79, 0.9)
  kit.cylinder({ r: 0.022, h: 0.19, at: [0, 2.54, Z], seg: 6, color: COLORS.gold, finish: 'gold' })
  for (const [x, z] of KIOSKS) dome(kit, x, Z + z, 1.73, 0.19, 0.21)
  kit.part(() => {
    for (const x of [-1.98, -1.62, -1.26, -0.9, 0.9, 1.26, 1.62, 1.98]) kit.arch({ w: 0.23, h: 0.2, d: 0.04, thick: 0.032, at: [x, 0.035, Z + 2.04], color: '#8D6848' })
  })

  kit.stage(4)
  for (const x of [-0.55, 0.55]) {
    for (const z of [1.7, 2.0, 2.8, 3.3, 3.8]) kit.tree({ kind: 'cone', h: kit.range(0.32, 0.44), scale: [0.65, 1, 0.65], at: [x, 0, z], color: COLORS.pine })
  }
  for (const x of [-2.6, -1.9, -1.15, 1.15, 1.9, 2.6]) {
    for (const z of [1.86, 2.8]) kit.tree({ kind: 'round', h: 0.3, at: [x, 0, z], color: COLORS.moss })
  }
  for (const z of [1.5, 2.1, 2.8, 3.5]) kit.person({ at: [0.24, 0.025, z], h: 0.1 })
  kit.person({ at: [-1.85, 0.27, 0.92], h: 0.1 })
}

function octagon(r: number, cut: number): XZ[] {
  return [[r - cut, r], [-r + cut, r], [-r, r - cut], [-r, -r + cut], [-r + cut, -r], [r - cut, -r], [r, -r + cut], [r, r - cut]]
}

function dome(kit: Kit, x: number, z: number, y: number, r: number, h: number): void {
  kit.lathe({ points: [[0, 0], [r, 0], [r * 1.01, h * 0.12], [r * 0.96, h * 0.38], [r * 0.82, h * 0.62], [r * 0.58, h * 0.82], [r * 0.25, h * 0.96], [0, h]], seg: 16, at: [x, y, z], color: WHITE })
}
