// Compressed central span: two superimposed arcades and a water channel, no road deck.
import { COLORS, type Kit } from './kit'

export function build(kit: Kit): void {
  const granite = '#A99E86'
  kit.ground(COLORS.pavement)
  kit.stage(1)
  for (let i = 0; i <= 9; i++) kit.box({ w: 0.32, h: 1.65, d: 0.47, at: [-3.55 + i * 0.79, 0, 0], color: granite })
  kit.stage(2)
  for (let i = 0; i < 9; i++) kit.arch({ w: 0.79, h: 1.18, d: 0.43, thick: 0.13, at: [-3.155 + i * 0.79, 0.76, 0], color: granite, seg: 10 })
  kit.box({ w: 7.43, h: 0.13, d: 0.47, at: [0, 1.93, 0], color: granite })
  kit.stage(3)
  for (let i = 0; i < 9; i++) kit.arch({ w: 0.79, h: 1.27, d: 0.36, thick: 0.105, at: [-3.155 + i * 0.79, 2.06, 0], color: granite, seg: 10 })
  kit.part(() => {
    kit.box({ w: 7.43, h: 0.09, d: 0.45, at: [0, 3.33, 0], color: granite })
    for (const z of [-0.2, 0.2]) kit.box({ w: 7.43, h: 0.18, d: 0.08, at: [0, 3.42, z], color: granite })
    kit.box({ w: 0.38, h: 0.32, d: 0.08, at: [0, 2.75, 0.23], color: '#8E8068' })
  })
  kit.stage(4)
  kit.box({ w: 6.5, h: 0.025, d: 1.15, at: [0, 0, 1.5], color: '#C0B49B' })
  for (const x of [-2.6, -1.2, 0.3, 1.9, 2.8]) kit.person({ at: [x, 0.025, 1.4], h: 0.11 })
  for (const [x, z] of [[-2.8, -2], [0, -2.4], [2.8, -2]] as const) kit.part(() => {
    kit.box({ w: 0.9, h: 0.55, d: 0.75, at: [x, 0, z], color: COLORS.plaster })
    kit.gableRoof({ w: 0.9, d: 0.75, h: 0.25, at: [x, 0.55, z], color: COLORS.brick, overhang: 0.035 })
  })
}
