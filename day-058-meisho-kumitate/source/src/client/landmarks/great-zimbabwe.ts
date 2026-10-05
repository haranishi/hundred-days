// Great Enclosure: elliptical dry-stone wall, narrow inner passage and solid conical tower.
import { COLORS, type Kit } from './kit'

function wall(kit: Kit, start: number, end: number, rx: number, rz: number, y: number, h: number, color: string): void {
  kit.part(() => {
    const steps = Math.ceil((end - start) / 7)
    for (let i = 0; i < steps; i++) {
      const a = (start + ((end - start) * (i + 0.5)) / steps) * Math.PI / 180
      const span = ((end - start) / steps) * Math.PI / 180
      const tangent = Math.atan2(rz * Math.sin(a), rx * Math.cos(a)) * 180 / Math.PI
      kit.box({ w: Math.hypot(rx * Math.cos(a), rz * Math.sin(a)) * span + 0.035, d: 0.28, h, at: [Math.sin(a) * rx, y, Math.cos(a) * rz], rotY: tangent, color })
    }
  })
}

export function build(kit: Kit): void {
  const granite = '#B1A58E'
  kit.ground('#AEAD78')
  kit.stage(1)
  wall(kit, 10, 350, 3.15, 2.32, 0, 0.72, granite)
  kit.cylinder({ r: 0.6, rTop: 0.53, h: 0.8, at: [1.43, 0, -0.85], color: granite, seg: 20 })
  kit.stage(2)
  wall(kit, 10, 350, 3.15, 2.32, 0.72, 0.82, granite)
  wall(kit, 74, 255, 2.61, 1.75, 0, 1.08, granite)
  kit.cylinder({ r: 0.53, rTop: 0.42, h: 0.72, at: [1.43, 0.8, -0.85], color: granite, seg: 20 })
  kit.stage(3)
  kit.cylinder({ r: 0.42, rTop: 0.26, h: 0.73, at: [1.43, 1.52, -0.85], color: granite, seg: 20 })
  kit.part(() => {
    // Granite courses and chevrons on the tall outer wall.
    for (let i = 0; i < 22; i++) {
      const a = (80 + i * 8) * Math.PI / 180
      const x = Math.sin(a) * 3.3
      const z = Math.cos(a) * 2.43
      const tangent = Math.atan2(2.32 * Math.sin(a), 3.15 * Math.cos(a)) * 180 / Math.PI
      kit.at({ at: [x, 1.23, z], rotY: tangent }, () => {
        kit.beam({ from: [-0.1, 0.1, 0], to: [0, 0, 0], size: 0.035, color: '#817761' })
        kit.beam({ from: [0, 0, 0], to: [0.1, 0.1, 0], size: 0.035, color: '#817761' })
      })
    }
    for (const [x, z] of [[-0.75, -0.55], [-1.25, 0.3], [0.25, 0.7]] as const) {
      kit.cylinder({ r: 0.43, h: 0.14, at: [x, 0, z], color: '#B38C63', seg: 12 })
    }
  })
  kit.stage(4)
  for (const [x, z] of [[-3.6, -1.8], [3.5, -1.8], [-2.4, 3.15]] as const) kit.tree({ h: 0.7, at: [x, 0, z], color: '#7F8C4C' })
  for (const x of [-0.2, 0.2]) kit.person({ at: [x, 0, 2.8], h: 0.1 })
}
