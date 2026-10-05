import { COLORS, type Kit } from './kit'

const STONE = '#AAA593'
const GREEN = '#759A47'

export function build(kit: Kit): void {
  kit.ground('#649048')
  kit.stage(1)
  kit.mound({ r: 3.45, rx: 3.15, rz: 3.75, h: 0.72, color: GREEN })
  // Sharp Huayna Picchu behind a long saddle; the city is not on its summit.
  kit.frustum({ w: 2.85, d: 2.13, topW: 1.35, topD: 0.8, h: 1.35, at: [0.1, 0.42, -2.2], color: '#5D8441' })
  kit.frustum({ w: 4.55, d: 2.2, topW: 4.15, topD: 1.88, h: 0.72, at: [0, 0, 0.15], color: STONE })
  kit.box({ w: 4.16, h: 0.035, d: 1.9, at: [0, 0.72, 0.15], color: GREEN })
  for (let i = 0; i < 7; i++) {
    const w = 4.08 - i * 0.24
    const y = 0.67 - i * 0.085
    const z = 1.32 + i * 0.32
    kit.part(() => {
      kit.box({ w, h: y, d: 0.32, at: [0, 0, z], color: STONE })
      kit.box({ w: w - 0.035, h: 0.035, d: 0.26, at: [0, y, z - 0.025], color: GREEN })
    }, { appear: 'grow' })
  }

  kit.stage(2)
  kit.frustum({ w: 1.25, d: 1.28, topW: 0.12, topD: 0.24, h: 2.4, at: [-1.45, 0.38, -2.05], color: '#638644' })
  kit.frustum({ w: 1.35, d: 1.2, topW: 0.32, topD: 0.2, h: 1.8, at: [1.46, 0.35, -2.5], color: '#75934F' })
  for (const x of [-1.65, -0.9, 0.9, 1.65]) {
    for (const z of [-0.45, 0.22, 0.86]) ruin(kit, x, z, 0.755, 0.56, 0.42, 0.26)
  }
  kit.box({ w: 0.55, h: 0.035, d: 1.68, at: [0, 0.75, 0.1], color: '#9AA661' })
  kit.stairs({ w: 0.24, d: 2.13, h: 0.69, steps: 17, at: [0.46, 0.025, 2.09], color: STONE })
  kit.part(() => {
    for (const x of [-1.9, 1.9]) {
      for (const z of [-0.74, -0.35, 0.05, 0.45, 0.85]) kit.box({ w: 0.075, h: 0.14, d: 0.15, at: [x, 0.75, z], color: '#838A77' })
    }
  })

  kit.stage(3)
  kit.frustum({ w: 1.5, d: 0.92, topW: 0.27, topD: 0.28, h: 2.1, at: [0.08, 1.75, -2.15], rot: [0, 0, -8], color: '#5B7E3F' })
  // A roofless semicircular sun temple and a few recovered steep gables.
  kit.part(() => {
    kit.cylinder({ r: 0.37, h: 0.43, seg: 12, at: [1.2, 0.77, -0.98], color: STONE })
    kit.cylinder({ r: 0.28, h: 0.032, seg: 12, at: [1.2, 1.2, -0.98], color: '#858A72' })
  })
  for (const x of [-1.5, -0.8]) {
    kit.gableRoof({ w: 0.59, d: 0.44, h: 0.3, overhang: 0.04, at: [x, 1.02, 0.87], color: '#A18F68' })
  }
  kit.part(() => {
    kit.box({ w: 0.62, h: 0.16, d: 0.56, at: [-0.43, 0.78, -0.83], color: STONE })
    kit.frustum({ w: 0.26, d: 0.3, h: 0.36, topW: 0.2, topD: 0.2, at: [-0.45, 0.94, -0.84], color: STONE })
    for (let i = 0; i < 6; i++) kit.box({ w: 0.66, h: 0.04, d: 0.12, at: [1.95, 0.56 - i * 0.055, 1.3 + i * 0.22], color: STONE })
  })

  kit.stage(4)
  kit.scatter({ count: 20, rMin: 2.85, rMax: 4.25, gap: 0.45, ok: (x, z) => z < 0.2 && Math.abs(x) > 2.4 }, (_i, x, z) => {
    kit.tree({ kind: 'round', h: kit.range(0.3, 0.55), at: [x, kit.groundAt(x, z) - 0.02, z], color: COLORS.forest })
  })
  for (const z of [-0.42, 0.1, 0.62]) kit.person({ at: [0.18, 0.77, z], h: 0.1 })
  kit.person({ at: [-0.23, 0.77, 0.9], h: 0.1 })
  for (const z of [1.4, 2.2, 2.9]) kit.person({ at: [-1.0, 0.7 - (z - 1.32) * 0.27, z], h: 0.1 })
}

function ruin(kit: Kit, x: number, z: number, y: number, w: number, d: number, h: number): void {
  kit.part(() => {
    kit.box({ w, h, d: 0.065, at: [x, y, z - d / 2], color: STONE })
    for (const side of [-1, 1]) kit.box({ w: 0.065, h: h * 0.85, d, at: [x + side * w / 2, y, z], color: STONE })
    for (const side of [-1, 1]) kit.box({ w: w * 0.25, h: h * 0.9, d: 0.065, at: [x + side * w * 0.375, y, z + d / 2], color: STONE })
  })
}
