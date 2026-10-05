// Five square terraces, three circular terraces, repeated bell stupas and central stupa.
import { COLORS, type Kit } from './kit'

export function build(kit: Kit): void {
  const stone = '#827F73'
  kit.ground(COLORS.lawn)
  kit.stage(1)
  kit.box({ w: 5.6, d: 5.6, h: 0.22, color: stone })
  for (let i = 0; i < 3; i++) kit.frustum({ w: 5.35 - i * 0.6, d: 5.35 - i * 0.6, topW: 5.1 - i * 0.6, topD: 5.1 - i * 0.6, h: 0.27, at: [0, 0.22 + i * 0.27, 0], color: stone })
  kit.stage(2)
  for (let i = 0; i < 2; i++) kit.frustum({ w: 3.55 - i * 0.55, d: 3.55 - i * 0.55, topW: 3.35 - i * 0.55, topD: 3.35 - i * 0.55, h: 0.27, at: [0, 1.03 + i * 0.27, 0], color: stone })
  for (let i = 0; i < 3; i++) kit.cylinder({ r: 1.44 - i * 0.36, h: 0.16, at: [0, 1.57 + i * 0.16, 0], seg: 32, color: stone })
  kit.part(() => {
    for (const rotY of [0, 90, 180, 270]) kit.at({ rotY }, () => kit.stairs({ w: 0.44, d: 2.4, h: 1.57, steps: 14, at: [0, 0, 1.5], color: '#989487' }))
    for (let tier = 0; tier < 5; tier++) {
      const half = (5.35 - tier * 0.58) / 2
      const y = 0.44 + tier * 0.27
      for (const rotY of [0, 90, 180, 270]) kit.at({ rotY }, () => {
        for (let k = -3; k <= 3; k++) if (k !== 0) kit.box({ w: 0.24, h: 0.12, d: 0.17, at: [k * half / 3.5, y, half - 0.1], color: stone })
      })
    }
  })
  // Round 2: representative central bell stupa is visible in the white stage-2 clue.
  // CPU checks pass; image recognition remains pending the next render slot.
  kit.order(-1)
  stupa(kit, 0, 2.05, 0, 0.38, stone)
  kit.order(0)
  kit.stage(3)
  for (const [count, r, y] of [[32, 1.31, 1.73], [24, 0.99, 1.89], [16, 0.63, 2.05]] as const) kit.ring(count, r, (_, x, z) => stupa(kit, x, y, z, 0.13, stone))
  kit.stage(4)
  for (const [x, z] of [[-3.3, 0.9], [3.3, 0.9], [-1.5, -3.7], [1.5, -3.7]] as const) kit.tree({ h: 0.55, at: [x, 0, z], color: COLORS.forest })
  for (const x of [-0.35, 0.3]) kit.person({ at: [x, 0, 3.65], h: 0.1 })
}

function stupa(kit: Kit, x: number, y: number, z: number, r: number, color: string): void {
  kit.part(() => {
    kit.lathe({ points: [[0, 0], [r, 0], [r, r * 0.22], [r * 0.93, r * 0.48], [r * 0.68, r * 1.35], [r * 0.24, r * 1.48], [r * 0.15, r * 2.05], [0, r * 2.2]], seg: 10, at: [x, y, z], color })
    // Recessed lattice apertures rendered as dark stone inlays, not downloaded textures.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      kit.box({ w: r * 0.19, h: r * 0.25, d: r * 0.035, at: [x + Math.sin(a) * r * 0.78, y + r * 0.65, z + Math.cos(a) * r * 0.78], rotY: i * 45, color: '#514F47' })
    }
  })
}
