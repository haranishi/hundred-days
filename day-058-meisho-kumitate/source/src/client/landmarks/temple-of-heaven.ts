// Representative Hall of Prayer for Good Harvests, not the whole sacrificial complex.
import { COLORS, type Kit } from './kit'

function roof(kit: Kit, r: number, h: number, y: number): void {
  // Closed circular curved eave with upturned lip, narrowing to the next cylindrical tier.
  kit.lathe({ points: [[0, 0], [r * 0.72, 0], [r, 0.045], [r * 1.025, 0.13], [r * 0.89, 0.11], [r * 0.72, h * 0.44], [r * 0.4, h * 0.85], [r * 0.14, h], [0, h]], at: [0, y, 0], seg: 32, color: '#285C90', finish: 'satin' })
}

export function build(kit: Kit): void {
  kit.ground(COLORS.pavement)
  kit.stage(1)
  kit.part(() => {
    for (const [r, y] of [[2.9, 0], [2.5, 0.22], [2.12, 0.44]] as const) kit.cylinder({ r, h: 0.22, at: [0, y, 0], color: '#EEE8DC', seg: 40 })
    kit.stairs({ w: 0.88, d: 1.28, h: 0.66, steps: 9, at: [0, 0, 2.07], color: '#EEE8DC' })
  })
  kit.stage(2)
  kit.order(-1)
  kit.part(() => {
    kit.cylinder({ r: 1.31, h: 1.28, at: [0, 0.66, 0], seg: 32, color: '#B54335' })
    roof(kit, 1.79, 0.75, 1.85)
    kit.cylinder({ r: 1.02, h: 0.57, at: [0, 2.41, 0], seg: 32, color: '#B54335' })
    roof(kit, 1.43, 0.64, 2.91)
    kit.cylinder({ r: 0.71, h: 0.38, at: [0, 3.39, 0], seg: 32, color: '#B54335' })
    roof(kit, 1.03, 0.82, 3.71)
    kit.sphere({ r: 0.09, at: [0, 4.51, 0], color: COLORS.gold, finish: 'gold', seg: 10 })
  })
  kit.order(0)
  kit.stage(3)
  kit.part(() => {
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8, x = Math.sin(a) * 1.32, z = Math.cos(a) * 1.32
      kit.cylinder({ r: 0.044, h: 1.23, at: [x, 0.68, z], color: '#E36549', seg: 8 })
      kit.box({ w: 0.2, h: 0.83, d: 0.035, at: [Math.sin(a + Math.PI / 16) * 1.315, 0.82, Math.cos(a + Math.PI / 16) * 1.315], rotY: (a + Math.PI / 16) * 180 / Math.PI, color: '#5D3931' })
    }
    for (const [r, y] of [[2.78, 0.22], [2.38, 0.44], [2, 0.66]] as const) {
      for (let i = 0; i < 32; i++) {
        const a = i * Math.PI / 16
        if (Math.cos(a) > 0.94) continue // front stair opening
        kit.cylinder({ r: 0.034, h: 0.22, at: [Math.sin(a) * r, y, Math.cos(a) * r], seg: 6, color: COLORS.white })
      }
      kit.torus({ r, tube: 0.025, flat: true, at: [0, y + 0.2, 0], seg: 40, color: COLORS.white })
    }
  })
  kit.stage(4)
  kit.part(() => {
    for (const x of [-3.45, 3.45]) kit.tree({ kind: 'pine', h: 1.0, at: [x, 0, -1.9] })
    kit.person({ at: [0.7, 0, 3.2], h: 0.14 })
    kit.person({ at: [-0.44, 0.22, 2.54], h: 0.13 })
  })
}
