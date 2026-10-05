// 鳳凰堂の中堂・左右の翼廊・尾廊を、阿字池の向こうから眺める。
import { COLORS, type Kit, type Vec3, type XZ } from './kit'

const RED = '#AF4933'
const ROOF = '#686C72'
const Z = -0.9
const POND: readonly XZ[] = [[-3.8, 0.3], [-2.85, -0.1], [-1.8, 0.1], [0, 0.08], [1.8, 0.1], [2.85, -0.1], [3.8, 0.3], [3.75, 1.65], [2.7, 2.85], [1.2, 3.55], [-1.2, 3.55], [-2.7, 2.85], [-3.75, 1.65]]

export function build(kit: Kit): void {
  kit.ground(COLORS.lawn)
  kit.stage(1)
  kit.water({ points: POND, color: '#488F83' })
  kit.box({ w: 7.0, h: 0.08, d: 1.2, at: [0, 0, Z], color: COLORS.gravel })
  kit.box({ w: 1.7, h: 0.12, d: 1.55, at: [0, 0.08, Z], color: COLORS.stone })
  kit.box({ w: 1.45, h: 0.8, d: 1.15, at: [0, 0.2, Z], color: '#D8C3A2' })
  kit.box({ w: 0.7, h: 0.3, d: 1.55, at: [0, 0.2, -2.1], color: '#D8C3A2' })

  kit.stage(2)
  kit.curvedRoof({ w: 1.45, d: 1.15, h: 0.22, style: 'skirt', top: { w: 1.1, d: 0.88 }, at: [0, 1.0, Z], overhang: 0.2, upturn: 0.1, color: ROOF })
  kit.box({ w: 1.1, h: 0.32, d: 0.88, at: [0, 1.17, Z], color: '#D8C3A2' })
  kit.curvedRoof({ w: 1.1, d: 0.88, h: 0.48, at: [0, 1.49, Z], overhang: 0.3, upturn: 0.12, color: ROOF, gableColor: RED })
  kit.gableRoof({ w: 1.55, d: 0.7, h: 0.28, rotY: 90, at: [0, 0.5, -2.1], color: ROOF })
  for (const s of [-1, 1]) {
    kit.part(() => {
      kit.box({ w: 2.35, h: 0.07, d: 0.6, at: [s * 1.78, 0.13, Z], color: RED })
      for (let i = 0; i < 7; i++) {
        const x = s * (0.68 + i * 0.37)
        for (const dz of [-0.24, 0.24]) kit.cylinder({ r: 0.04, h: 0.49, seg: 8, at: [x, 0.2, Z + dz], color: RED })
      }
      kit.box({ w: 2.35, h: 0.065, d: 0.6, at: [s * 1.78, 0.69, Z], color: RED })
    })
    kit.gableRoof({ w: 2.35, d: 0.6, h: 0.22, at: [s * 1.78, 0.755, Z], overhang: 0.13, color: ROOF })
    kit.box({ w: 0.78, h: 0.5, d: 0.85, at: [s * 2.97, 0.2, Z + 0.14], color: '#D8C3A2' })
  }

  kit.stage(3)
  for (const s of [-1, 1]) {
    // 翼廊の両端に重なる小屋根と、屋根の二羽の鳳凰。
    kit.curvedRoof({ w: 0.78, d: 0.85, h: 0.14, style: 'skirt', top: { w: 0.5, d: 0.54 }, at: [s * 2.97, 0.7, Z + 0.14], overhang: 0.15, color: ROOF })
    kit.box({ w: 0.5, h: 0.3, d: 0.54, at: [s * 2.97, 0.8, Z + 0.14], color: RED })
    kit.curvedRoof({ w: 0.5, d: 0.54, h: 0.3, at: [s * 2.97, 1.1, Z + 0.14], style: 'hogyo', overhang: 0.18, upturn: 0.09, color: ROOF })
    phoenix(kit, [s * 0.46, 1.97, Z], s)
  }
  kit.part(() => {
    for (const x of [-0.65, -0.33, 0, 0.33, 0.65]) kit.cylinder({ r: 0.045, h: 0.79, seg: 8, at: [x, 0.2, Z + 0.6], color: RED })
    kit.box({ w: 0.33, h: 0.66, d: 0.035, at: [0, 0.24, Z + 0.61], color: '#453F36' })
    for (const x of [-0.53, 0.53]) kit.box({ w: 0.18, h: 0.5, d: 0.035, at: [x, 0.28, Z + 0.61], color: '#453F36' })
    kit.box({ w: 1.58, h: 0.045, d: 0.045, at: [0, 0.87, Z + 0.64], color: RED })
    kit.box({ w: 1.28, h: 0.04, d: 0.04, at: [0, 1.42, Z + 0.5], color: RED })
  })

  kit.stage(4)
  for (const [x, z, h] of [[-3.8, -1.65, 0.85], [3.7, -1.7, 0.9], [-2.6, -2.75, 0.7], [2.7, -2.7, 0.75], [0.7, -3.5, 0.75], [-0.65, -3.6, 0.65]] as const) {
    kit.tree({ kind: 'pine', h, at: [x, 0, z], rotY: kit.range(0, 360) })
  }
  for (let i = 0; i < 8; i++) {
    const x = -1.6 + i * 0.45
    const z = Math.sqrt(4.1 ** 2 - x * x)
    kit.person({ at: [x, 0, z], rotY: 180 })
  }
  for (const [x, z] of [[-3.85, 1.7], [3.8, 1.75], [-2.55, 3.12], [2.6, 3.05]] as const) kit.sphere({ r: 0.13, squash: 0.6, seg: 8, at: [x, 0, z], color: COLORS.rock })
}

function phoenix(kit: Kit, at: Vec3, direction: number): void {
  kit.at({ at }, () => kit.part(() => {
    const look = { color: COLORS.gold, finish: 'gold' as const }
    kit.cylinder({ r: 0.025, h: 0.09, seg: 8, ...look })
    kit.sphere({ r: 0.06, squash: 0.8, scale: [1, 1, 1.5], at: [0, 0.08, 0], seg: 8, ...look })
    kit.beam({ from: [0, 0.13, 0], to: [direction * 0.08, 0.26, 0], size: 0.035, ...look })
    for (const s of [-1, 1]) kit.beam({ from: [0, 0.13, 0], to: [0, 0.26, s * 0.18], size: 0.025, width: 0.09, ...look })
    kit.beam({ from: [0, 0.1, 0], to: [-direction * 0.17, 0.22, 0], size: 0.025, width: 0.07, ...look })
  }))
}
