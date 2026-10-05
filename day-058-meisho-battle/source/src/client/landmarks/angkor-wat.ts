import { COLORS, type Kit, type XZ } from './kit'

const STONE = '#9B9079'
const DARK = '#605F50'
const Z = -0.55
const TOWERS = [[-1.04, Z - 0.78], [1.04, Z - 0.78], [-1.04, Z + 0.78], [1.04, Z + 0.78], [0, Z]] as const

export function build(kit: Kit): void {
  kit.ground(COLORS.lawn)
  kit.stage(1)
  kit.part(() => {
    kit.water({ points: rect(-3.15, Z, 0.65, 4.1), color: COLORS.pond })
    kit.water({ points: rect(3.15, Z, 0.65, 4.1), color: COLORS.pond })
    kit.water({ points: rect(0, -3.02, 5.6, 0.6), color: COLORS.pond })
    kit.water({ points: rect(0, 2.25, 5.8, 0.65), color: COLORS.pond })
    kit.box({ w: 0.78, h: 0.07, d: 3.2, at: [0, 0, 2.9], color: STONE })
  }, { appear: 'grow' })
  kit.box({ w: 4.9, h: 0.16, d: 4.2, at: [0, 0, Z], color: STONE })
  for (const x of [-2.22, 2.22]) kit.box({ w: 0.32, h: 0.52, d: 3.84, at: [x, 0.16, Z], color: STONE })
  for (const z of [Z - 1.8, Z + 1.8]) kit.box({ w: 4.42, h: 0.52, d: 0.32, at: [0, 0.16, z], color: STONE })
  kit.box({ w: 3.25, h: 0.38, d: 2.75, at: [0, 0.16, Z], color: STONE })
  kit.box({ w: 2.66, h: 0.42, d: 2.12, at: [0, 0.54, Z], color: STONE })
  for (const [x, z] of TOWERS) kit.box({ w: 0.63, h: 0.65, d: 0.63, at: [x, 0.96, z], color: STONE })

  kit.stage(2)
  for (const x of [-2.22, 2.22]) kit.gableRoof({ w: 3.82, d: 0.38, h: 0.24, overhang: 0.07, rotY: 90, at: [x, 0.68, Z], color: DARK })
  for (const z of [Z - 1.8, Z + 1.8]) kit.gableRoof({ w: 4.42, d: 0.38, h: 0.24, overhang: 0.07, at: [0, 0.68, z], color: DARK })
  for (const z of [Z - 1.13, Z + 1.13]) kit.gableRoof({ w: 2.62, d: 0.32, h: 0.22, overhang: 0.04, at: [0, 0.96, z], color: STONE })
  for (const [i, [x, z]] of TOWERS.entries()) {
    const center = i === 4
    kit.frustum({ w: center ? 0.77 : 0.66, d: center ? 0.77 : 0.66, topW: 0.58, topD: 0.58, h: center ? 0.8 : 0.48, at: [x, 1.61, z], color: STONE })
  }
  kit.stairs({ w: 0.76, d: 1.02, h: 0.79, steps: 9, at: [0, 0.17, Z + 1.58], color: STONE })
  kit.part(() => {
    for (const x of [-1.7, -1.32, -0.94, -0.56, 0.56, 0.94, 1.32, 1.7]) {
      kit.box({ w: 0.09, h: 0.38, d: 0.13, at: [x, 0.3, Z + 2.0], color: DARK })
    }
  })

  kit.stage(3)
  for (const [i, [x, z]] of TOWERS.entries()) {
    lotus(kit, x, z, i === 4 ? 2.4 : 2.08, i === 4 ? 1.33 : 1.0, i === 4 ? 0.47 : 0.38)
  }
  // The five towers are a quincunx, not a single straight row.
  for (const x of [-1.7, 0, 1.7]) {
    kit.part(() => {
      kit.box({ w: 0.38, h: 0.74, d: 0.42, at: [x, 0.16, Z + 1.87], color: STONE })
      kit.arch({ w: 0.25, h: 0.54, d: 0.09, thick: 0.055, at: [x, 0.16, Z + 2.1], color: DARK })
      kit.gableRoof({ w: 0.46, d: 0.5, h: 0.35, overhang: 0.02, at: [x, 0.9, Z + 1.87], color: STONE })
    })
  }
  for (const x of [-0.42, 0.42]) kit.beam({ from: [x, 0.13, 1.42], to: [x, 0.13, 4.2], size: 0.06, color: STONE })

  kit.stage(4)
  for (const x of [-3.68, 3.68]) {
    for (const z of [-1.85, -0.8, 0.4, 1.55]) kit.tree({ kind: 'palm', h: kit.range(0.5, 0.76), at: [x, 0, z] })
  }
  for (const x of [-1.65, 1.65]) kit.water({ points: rect(x, 3.35, 1.45, 0.65), color: COLORS.pond })
  for (const z of [2.0, 2.75, 3.35, 3.95]) kit.person({ at: [kit.range(-0.23, 0.23), 0.07, z], rotY: 180 })
  for (const x of [-1.6, 1.6]) kit.person({ at: [x, 0.16, Z + 1.55] })
}

function lotus(kit: Kit, x: number, z: number, y: number, h: number, r: number): void {
  kit.part(() => {
    kit.lathe({ points: [[0, 0], [r, 0], [r, 0.12 * h], [r * 0.88, 0.14 * h], [r * 0.94, 0.28 * h], [r * 0.78, 0.3 * h], [r * 0.83, 0.46 * h], [r * 0.65, 0.49 * h], [r * 0.67, 0.64 * h], [r * 0.43, 0.79 * h], [r * 0.22, 0.92 * h], [0, h]], at: [x, y, z], seg: 16, color: STONE })
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4
      kit.beam({ from: [x + Math.sin(a) * r * 0.84, y + h * 0.12, z + Math.cos(a) * r * 0.84], to: [x + Math.sin(a) * r * 0.17, y + h * 0.93, z + Math.cos(a) * r * 0.17], size: 0.048, color: DARK })
    }
  })
}

function rect(x: number, z: number, w: number, d: number): XZ[] {
  return [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2]]
}
