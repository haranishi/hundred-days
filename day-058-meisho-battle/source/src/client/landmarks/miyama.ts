// 美山北村：山裾の段に散らばる、厚い寄棟の茅葺き。合掌造りの急な三角屋根にはしない。
import { COLORS, type Kit } from './kit'

const HOUSES = [
  [-2.4, -1.35, 1.12, 0.78, 0.25, 5], [-0.5, -1.65, 1.25, 0.86, 0.34, -5], [1.5, -1.4, 1.12, 0.78, 0.25, 8],
  [-2.05, 0.1, 1.23, 0.85, 0.13, -10], [0.05, -0.05, 1.22, 0.84, 0.15, 3], [2.15, 0.15, 1.16, 0.81, 0.1, -5],
  [-1.75, 1.7, 1.22, 0.83, 0.02, 2], [0.25, 1.6, 1.32, 0.87, 0.02, -8], [2.15, 1.9, 1.07, 0.78, 0.02, 9],
] as const
const THATCH = ['#8E7855', '#AA9270', '#796548'] as const
const WALL = '#C7B99A'
const WOOD = '#60442F'

export function build(kit: Kit): void {
  kit.ground('#87A75F')
  kit.stage(1)
  kit.mound({ r: 2.8, rx: 2.8, rz: 1.12, h: 1.02, at: [0, 0, -3.35], color: '#416746' })
  kit.mound({ r: 1.1, rx: 0.82, rz: 1.6, h: 0.65, at: [3.7, 0, -1.1], color: '#416746' })
  kit.box({ w: 5.9, h: 0.02, d: 0.3, at: [0, 0, 2.8], color: '#AFA283' })
  kit.box({ w: 0.23, h: 0.025, d: 4.5, at: [0.92, 0, 0.1], rotY: -7, color: '#AFA283' })
  for (const [x, z, w, d, y, turn] of HOUSES) kit.at({ at: [x, y, z], rotY: turn }, () => {
    kit.box({ w: w + 0.14, h: y + 0.03, d: d + 0.14, at: [0, -y, 0], color: '#A99A7D' })
    kit.box({ w, h: 0.33, d, at: [0, 0.03, 0], color: WALL })
  })
  for (const x of [-2.25, -0.9, 0.45, 1.8]) kit.box({ w: 1.08, h: 0.025, d: 0.72, at: [x, 0, 3.57], color: '#84A65A' })

  kit.stage(2)
  for (const [x, z, w, d, y, turn] of HOUSES) kit.hipRoof({ w, d, h: 0.43, ridge: w * 0.2, overhang: 0.035, at: [x, y + 0.36, z], rotY: turn, color: WOOD })

  kit.stage(3)
  HOUSES.forEach(([x, z, w, d, y, turn], i) => kit.at({ at: [x, y, z], rotY: turn }, () => kit.part(() => {
    // 低い幅広の屋根と厚い軒。美山の家を白川郷の急勾配・多層の妻窓と区別する。
    kit.box({ w: w + 0.26, h: 0.1, d: d + 0.26, at: [0, 0.34, 0], color: THATCH[i % 3] })
    kit.hipRoof({ w: w + 0.24, d: d + 0.24, h: 0.48, ridge: w * 0.22, overhang: 0, at: [0, 0.44, 0], color: THATCH[i % 3] })
    kit.box({ w: w * 0.53, h: 0.07, d: 0.13, at: [0, 0.9, 0], color: WOOD })
    for (const a of [-0.19, 0, 0.19]) {
      kit.beam({ from: [a, 0.91, -0.11], to: [a, 1.04, 0.11], size: 0.025, color: WOOD })
      kit.beam({ from: [a, 0.91, 0.11], to: [a, 1.04, -0.11], size: 0.025, color: WOOD })
    }
    kit.box({ w: w * 0.22, h: 0.26, d: 0.025, at: [-w * 0.18, 0.05, d / 2 + 0.015], color: WOOD })
    kit.box({ w: w * 0.28, h: 0.17, d: 0.027, at: [w * 0.19, 0.13, d / 2 + 0.015], color: '#E7DFCA' })
  })))

  kit.stage(4)
  for (let i = 0; i < 15; i++) {
    const x = -2.8 + i * 0.4
    const z = -3.16 + kit.range(-0.15, 0.15)
    kit.tree({ kind: 'cone', h: kit.range(0.48, 0.74), at: [x, Math.max(0, kit.groundAt(x, z) - 0.035), z], color: '#345B39' })
  }
  for (const [x, z] of [[-3.2, 0.7], [3.35, 1.3], [-2.9, 2.6], [2.75, -2.35]] as const) kit.tree({ kind: 'round', h: 0.55, at: [x, kit.groundAt(x, z), z] })
  // 美山の入口の丸い郵便ポスト（文字は入れない）。
  kit.part(() => {
    kit.cylinder({ r: 0.06, h: 0.15, seg: 8, at: [-0.15, 0, 2.72], color: '#BA3D2F' })
    kit.cylinder({ r: 0.075, h: 0.11, seg: 10, at: [-0.15, 0.15, 2.72], color: '#BA3D2F' })
    kit.sphere({ r: 0.074, squash: 0.35, seg: 8, at: [-0.15, 0.26, 2.72], color: '#BA3D2F' })
  })
  for (const [x, z] of [[0.45, 2.75], [1.15, 1.1], [0.9, -0.85], [-1.35, 2.85]] as const) kit.person({ at: [x, 0.025, z] })
}
