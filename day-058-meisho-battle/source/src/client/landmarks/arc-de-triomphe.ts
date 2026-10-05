// エトワール凱旋門：単一の大アーチ、分厚い四角い上部、放射状の通り。
import { COLORS, type Kit } from './kit'

const STONE = '#D5C6AD'
const CARVE = '#BBA98C'

export function build(kit: Kit): void {
  kit.ground('#94AC71')
  kit.stage(1)
  kit.cylinder({ r: 2.72, h: 0.025, seg: 48, color: '#CBBFA9' })
  for (let n = 0; n < 12; n++) {
    const a = n * Math.PI / 6
    kit.box({ w: 0.42, h: 0.02, d: 2.34, at: [Math.sin(a) * 3.36, 0, Math.cos(a) * 3.36], rotY: n * 30, color: COLORS.road })
  }
  kit.box({ w: 3.7, h: 0.13, d: 1.83, color: STONE })
  for (const x of [-1.25, 1.25]) kit.box({ w: 0.83, h: 1.63, d: 1.34, at: [x, 0.13, 0], color: STONE })

  kit.stage(2)
  kit.arch({ w: 3.33, h: 3.16, d: 1.34, thick: 0.84, seg: 16, at: [0, 0.13, 0], color: STONE })
  kit.box({ w: 3.33, h: 0.58, d: 1.34, at: [0, 3.29, 0], color: STONE })

  kit.stage(3)
  kit.part(() => {
    for (const y of [1.71, 3.22, 3.81]) kit.box({ w: 3.49, h: 0.075, d: 1.48, at: [0, y, 0], color: STONE })
    kit.box({ w: 3.25, h: 0.075, d: 1.28, at: [0, 3.89, 0], color: CARVE })
    // 浮彫りは独自の単純な幾何。碑文・文字は入れない。
    for (const s of [-1, 1]) for (const x of [-1.25, 1.25]) {
      kit.box({ w: 0.54, h: 0.87, d: 0.055, at: [x, 0.48, s * 0.705], color: CARVE })
      for (const dx of [-0.16, 0, 0.16]) {
        kit.cylinder({ r: 0.05, h: 0.32, seg: 6, at: [x + dx, 0.56, s * 0.74], color: STONE })
        kit.sphere({ r: 0.062, seg: 6, at: [x + dx, 0.88, s * 0.75], color: STONE })
      }
      kit.sphere({ r: 0.095, squash: 0.85, scale: [1, 1, 0.4], seg: 8, at: [x, 1.03, s * 0.76], color: STONE })
    }
    for (const s of [-1, 1]) for (let n = 0; n < 14; n++) kit.box({ w: 0.12, h: 0.2, d: 0.025, at: [-1.44 + n * 0.22, 3.42, s * 0.687], color: CARVE })
    // アーチの内部を空けたまま残す小さな記念の床。
    kit.box({ w: 0.36, h: 0.023, d: 0.45, at: [0, 0.14, 0.1], color: '#817B70' })
  })

  kit.stage(4)
  for (let n = 0; n < 12; n++) {
    const a = (n + 0.5) * Math.PI / 6
    kit.tree({ kind: 'round', h: 0.55, at: [Math.sin(a) * 3.73, 0, Math.cos(a) * 3.73], color: '#5E864A' })
  }
  for (const [x, z] of [[-1.8, 1.22], [1.6, 1.35], [-0.4, 1.56], [0.4, 1.7], [1.9, -0.9], [-1.9, -1.03]]) kit.person({ at: [x!, 0.025, z!] })
  for (let n = 0; n < 5; n++) {
    const a = n * Math.PI * 2 / 5
    kit.car({ at: [Math.sin(a) * 3.7, 0.025, Math.cos(a) * 3.7], rotY: n * 72, len: 0.25 })
  }
}
