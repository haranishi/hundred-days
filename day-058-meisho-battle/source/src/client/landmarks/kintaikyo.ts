// 全五径間。中央三径間は大きなアーチ、両端二径間は低い桁橋。
import { COLORS, type Kit, type Vec3, type XZ } from './kit'

const WOOD = '#B68A58'
const DARK = '#87613B'
const SPAN = 1.5
const POND: readonly XZ[] = [[-3.45, -2.9], [-2.3, -3.65], [1.7, -3.65], [3.4, -2.85], [3.4, 2.9], [2.0, 3.6], [-2.2, 3.6], [-3.45, 2.8]]

function curve(x: number, t: number, arch: boolean, z: number, offset = 0): Vec3 {
  return [x + (t - 0.5) * SPAN, 0.55 + Math.sin(Math.PI * t) * (arch ? 0.68 : 0.23) + offset, z]
}

export function build(kit: Kit): void {
  kit.ground(COLORS.grass)
  kit.stage(1)
  kit.water({ points: POND, color: '#398AA4' })
  for (const x of [-2.25, -0.75, 0.75, 2.25]) {
    kit.frustum({ w: 0.43, d: 1.05, h: 0.54, topW: 0.3, topD: 0.68, at: [x, 0, 0], color: '#9B9787' })
  }
  for (const x of [-4.02, 4.02]) kit.box({ w: 0.95, h: 0.12, d: 2.8, at: [x, 0, 0], color: COLORS.gravel })

  kit.stage(2)
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * SPAN
    const arch = i > 0 && i < 4
    kit.part(() => {
      for (const z of [-0.23, 0.23]) {
        for (let j = 0; j < 12; j++) kit.beam({ from: curve(x, j / 12, arch, z, -0.07), to: curve(x, (j + 1) / 12, arch, z, -0.07), size: 0.09, color: DARK })
      }
      for (let j = 0; j <= 6; j++) {
        const t = j / 6
        const p = curve(x, t, arch, 0, -0.06)
        kit.beam({ from: [p[0], p[1], -0.28], to: [p[0], p[1], 0.28], size: 0.055, color: DARK })
      }
    })
  }

  kit.stage(3)
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * SPAN
    const arch = i > 0 && i < 4
    kit.part(() => {
      for (let j = 0; j < 16; j++) {
        const p = curve(x, (j + 0.5) / 16, arch, 0)
        // アーチ上の階段状の床。前後の薄い横線が木組みを際立たせる。
        kit.box({ w: SPAN / 16 + 0.005, h: 0.045, d: 0.65, at: p, color: WOOD })
      }
      for (const z of [-0.31, 0.31]) {
        for (let j = 0; j <= 8; j++) {
          const p = curve(x, j / 8, arch, z, 0.03)
          kit.box({ w: 0.025, h: 0.2, d: 0.025, at: p, color: WOOD })
          if (j < 8) kit.beam({ from: curve(x, j / 8, arch, z, 0.23), to: curve(x, (j + 1) / 8, arch, z, 0.23), size: 0.025, color: WOOD })
        }
      }
    })
  }
  kit.part(() => {
    for (const x of [-3.75, 3.75]) kit.stairs({ w: 0.63, d: 0.38, h: 0.42, steps: 5, at: [x, 0.12, 0], rotY: x < 0 ? 90 : -90, color: WOOD })
  })

  kit.stage(4)
  for (const [x, z] of [[-4.05, -1.7], [-4.05, 1.7], [4.05, -1.7], [4.05, 1.7], [-3.7, -2.8], [3.7, 2.8]] as const) kit.tree({ kind: 'sakura', h: kit.range(0.48, 0.65), at: [x, 0, z], rotY: kit.range(0, 360) })
  kit.boat({ at: [0.4, 0.035, 2.25], rotY: 60, kind: 'row' })
  for (const [i, t] of [[1, 0.4], [2, 0.65], [3, 0.6]] as const) {
    const p = curve((i - 2) * SPAN, t, true, 0.03, 0.045)
    kit.person({ at: p, rotY: 90 })
  }
  for (const x of [-4.0, 4.0]) for (const z of [-0.8, 0.85]) kit.person({ at: [x, 0.12, z], rotY: x < 0 ? 90 : 270 })
}
