// Representative drainage landscape, not a surveyed placement of the nineteen mills.
import { COLORS, type Kit } from './kit'

function mill(kit: Kit, x: number, z: number, size: number, thatched: boolean, angle: number): void {
  kit.cylinder({ r: 0.59 * size, h: 0.15, at: [x, 0, z], color: COLORS.grass, seg: 16 })
  kit.at({ at: [x, 0.15, z], scale: size }, () => {
    kit.cylinder({ r: 0.48, rTop: 0.28, h: 1.42, seg: thatched ? 8 : 16, color: thatched ? '#A38B65' : '#96765F' })
    kit.lathe({ points: [[0, 0], [0.38, 0], [0.43, 0.12], [0.34, 0.36], [0.16, 0.48], [0, 0.5]], seg: 12, at: [0, 1.4, 0], color: '#574D3D' })
    kit.beam({ from: [0, 1.53, 0.2], to: [0, 1.53, 0.52], size: 0.09, color: COLORS.darkWood })
    kit.sphere({ r: 0.085, at: [0, 1.445, 0.47], seg: 8, color: COLORS.darkWood })
    for (let i = 0; i < 4; i++) {
      const a = (angle + i * 90) * Math.PI / 180
      const radial = (r: number, side = 0): readonly [number, number, number] => [Math.sin(a) * r + Math.cos(a) * side, 1.53 + Math.cos(a) * r - Math.sin(a) * side, 0.47]
      kit.beam({ from: radial(0.05), to: radial(1.13), size: 0.045, color: COLORS.darkWood })
      // Closed beam lattice and narrow canvas panel distinguish working sails from a solid propeller.
      kit.beam({ from: radial(0.38, 0.19), to: radial(1.12, 0.19), size: 0.025, color: COLORS.wood })
      for (let j = 0; j < 5; j++) kit.beam({ from: radial(0.4 + j * 0.17), to: radial(0.4 + j * 0.17, 0.19), size: 0.022, color: COLORS.wood })
      kit.beam({ from: radial(0.43, 0.1), to: radial(1.1, 0.1), size: 0.025, width: 0.13, color: '#DBCDB0' })
    }
  })
}

export function build(kit: Kit): void {
  kit.ground(COLORS.lawn)
  kit.stage(1)
  kit.part(() => {
    kit.box({ w: 1.15, d: 7.7, h: 0.065, at: [0, 0.015, 0], color: COLORS.pond, finish: 'water' })
    for (const x of [-0.82, 0.82]) kit.box({ w: 0.48, d: 7.65, h: 0.15, at: [x, 0, 0], color: COLORS.grass })
  })
  kit.stage(2)
  kit.order(-1)
  // All sails and mill bodies arrive together before p=.55.
  kit.part(() => {
    mill(kit, -1.6, 1.85, 1, false, 42)
    mill(kit, 1.6, 0.25, 0.92, true, 25)
    mill(kit, -1.6, -1.5, 0.85, false, 55)
    mill(kit, 1.6, -2.7, 0.74, true, 35)
  })
  kit.order(0)
  kit.stage(3)
  kit.part(() => {
    for (const [x, z, size] of [[-1.6, 1.85, 1], [1.6, 0.25, 0.92], [-1.6, -1.5, 0.85], [1.6, -2.7, 0.74]] as const) {
      kit.box({ w: 0.15 * size, h: 0.3 * size, d: 0.018, at: [x, 0.15, z + 0.43 * size], color: COLORS.darkWood })
      kit.box({ w: 0.12 * size, h: 0.15 * size, d: 0.02, at: [x, 0.82 * size, z + 0.37 * size], color: COLORS.white })
    }
  })
  kit.stage(4)
  kit.part(() => {
    for (const z of [-3, -2, -1, 0, 1, 2, 3]) {
      for (const x of [-0.56, 0.56]) kit.cylinder({ r: 0.025, h: 0.24, at: [x, 0.08, z], color: '#759452', seg: 6 })
    }
    kit.person({ at: [-0.86, 0.15, 2.75], h: 0.14 })
    kit.person({ at: [0.86, 0.15, -0.3], h: 0.13 })
  })
}
