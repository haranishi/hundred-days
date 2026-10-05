import { COLORS, type Kit } from './kit'

const STONE = '#B9A88B'
const ROOF = '#68727A'
const CENTER_Z = -0.55

export function build(kit: Kit): void {
  kit.ground('#BBAF96')
  kit.stage(1)
  kit.water({ r: 4.72, color: '#638F9C' })
  kit.mound({ r: 2.66, h: 1.63, at: [0, 0.04, CENTER_Z], color: '#998F7D' })
  kit.frustum({ w: 2.84, d: 2.07, h: 1.08, topW: 2.35, topD: 1.77, at: [0, 0.29, CENTER_Z], color: STONE })
  kit.box({ w: 1.17, h: 0.7, d: 1.37, at: [-0.6, 1.37, CENTER_Z - 0.18], color: STONE })
  kit.box({ w: 0.77, h: 0.67, d: 1.84, at: [0.38, 1.37, CENTER_Z], color: '#CFC5B0' })
  kit.box({ w: 0.95, h: 0.84, d: 0.42, at: [0.69, 0.98, CENTER_Z - 0.8], color: STONE })

  kit.stage(2)
  kit.gableRoof({ w: 1.86, d: 0.8, h: 0.42, rotY: 90, overhang: 0.03, at: [0.38, 2.04, CENTER_Z], color: ROOF })
  kit.hipRoof({ w: 1.18, d: 1.38, h: 0.37, overhang: 0.035, at: [-0.6, 2.07, CENTER_Z - 0.18], color: ROOF })
  const houses: { x: number; z: number; y: number; angle: number; h: number }[] = []
  for (let i = 0; i < 18; i++) {
    const a = -0.25 + i * Math.PI * 2 / 18
    const r = i % 2 === 0 ? 1.75 : 2.15
    const x = Math.sin(a) * r
    const z = CENTER_Z + Math.cos(a) * r
    const y = Math.max(0.12, kit.groundAt(x, z) - 0.085)
    const h = kit.range(0.28, 0.45)
    houses.push({ x, z, y, angle: a * 180 / Math.PI, h })
    kit.box({ w: 0.42, d: 0.46, h, rotY: a * 180 / Math.PI, at: [x, y, z], color: kit.pick(['#CEBCA0', '#B6AB93', '#DBCCB5']) })
  }
  for (const house of houses) kit.gableRoof({ w: 0.44, d: 0.48, h: 0.19, overhang: 0.025, rotY: house.angle, at: [house.x, house.y + house.h, house.z], color: ROOF })
  kit.part(() => {
    for (let i = 0; i < 12; i++) {
      const a0 = (-0.12 + i / 12) * Math.PI
      const a1 = (-0.12 + (i + 1) / 12) * Math.PI
      const p0 = [Math.sin(a0) * 2.6, 0.17, CENTER_Z + Math.cos(a0) * 2.6] as const
      const p1 = [Math.sin(a1) * 2.6, 0.17, CENTER_Z + Math.cos(a1) * 2.6] as const
      kit.beam({ from: p0, to: p1, size: 0.2, width: 0.32, color: STONE })
    }
  })

  kit.stage(3)
  kit.part(() => {
    kit.box({ w: 0.47, d: 0.48, h: 0.65, at: [0.38, 2.06, CENTER_Z - 0.1], color: '#D0C6B0' })
    for (const x of [0.22, 0.54]) kit.arch({ w: 0.11, h: 0.32, d: 0.03, thick: 0.02, at: [x, 2.31, CENTER_Z + 0.152], color: '#716C5B' })
    kit.frustum({ w: 0.5, d: 0.5, h: 0.23, topW: 0.26, topD: 0.26, at: [0.38, 2.71, CENTER_Z - 0.1], color: ROOF })
    kit.cone({ r: 0.15, h: 0.94, seg: 8, at: [0.38, 2.94, CENTER_Z - 0.1], color: ROOF })
    kit.cylinder({ r: 0.02, h: 0.16, seg: 6, at: [0.38, 3.87, CENTER_Z - 0.1], color: COLORS.gold, finish: 'gold' })
  })
  for (const x of [-1.42, -1.13, 1.04, 1.32]) {
    kit.beam({ from: [x, 0.52, CENTER_Z + 0.87], to: [x, 1.39, CENTER_Z + 0.75], size: 0.11, color: STONE })
  }
  for (const a of [0.1, 0.42, 0.8]) {
    kit.part(() => {
      const x = Math.sin(a * Math.PI) * 2.62
      const z = CENTER_Z + Math.cos(a * Math.PI) * 2.62
      kit.cylinder({ r: 0.19, h: 0.43, at: [x, 0.08, z], seg: 10, color: STONE })
      kit.cone({ r: 0.21, h: 0.22, at: [x, 0.51, z], seg: 10, color: ROOF })
    })
  }
  kit.stage(4)
  // A raised modern access walkway reaches the island without becoming a road.
  kit.box({ w: 0.42, h: 0.05, d: 2.08, at: [0.5, 0.055, 3.49], color: '#C1B7A6' })
  for (const z of [2.45, 3.0, 3.55, 4.1]) kit.person({ at: [0.5 + kit.range(-0.1, 0.1), 0.105, z], h: 0.09 })
  for (const [x, z] of [[-0.8, 1.0], [1.5, 0.4], [-1.9, -0.5]] as const) kit.tree({ kind: 'round', h: 0.28, at: [x, kit.groundAt(x, z) - 0.02, z], color: COLORS.moss })
}
