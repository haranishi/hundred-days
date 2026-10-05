// Red hyperboloid lattice, cylindrical observation crown, harbor setting. No branding.
import { COLORS, type Kit, type Vec3 } from './kit'
export function build(kit: Kit): void {
  kit.ground(COLORS.pavement)
  kit.stage(1)
  kit.water({ points: [[-4, 1.7], [4, 1.7], [3, 3.5], [-3, 3.5]], color: COLORS.sea })
  kit.cylinder({ r: 1.15, h: 0.38, color: COLORS.white, seg: 16 })
  kit.cylinder({ r: 0.23, h: 4.15, at: [0, 0.38, 0], color: COLORS.white, seg: 12 })
  // Straight crossed steel tubes form the distinctive waist, not a solid cone.
  for (let band = 0; band < 4; band++) {
    kit.stage(band < 2 ? 1 : 2)
    const t0 = band / 4, t1 = (band + 1) / 4
    kit.part(() => {
      for (let i = 0; i < 16; i++) for (const s of [-1, 1]) {
        const a = i * Math.PI / 8, b = a + s * 1.65
        const point = (t: number): Vec3 => [1.05 * ((1-t)*Math.cos(a)+t*Math.cos(b)), 0.38 + 3.95*t, 1.05*((1-t)*Math.sin(a)+t*Math.sin(b))]
        kit.beam({ from: point(t0), to: point(t1), size: 0.052, color: '#D93435', finish: 'satin' })
      }
    })
  }
  kit.stage(3)
  for (let i=0; i<5; i++) kit.part(() => {
    kit.cylinder({ r: 1.02, h: 0.08, at: [0,4.3+i*0.21,0], seg: 16, color: '#D93435' })
    kit.cylinder({ r: 0.97, h: 0.14, at: [0,4.38+i*0.21,0], seg: 16, color: COLORS.glass, finish: 'gloss' })
  })
  kit.cylinder({ r: 1.06, h: 0.08, at: [0,5.35,0], color: '#D93435', seg: 16 })
  kit.cylinder({ r: 0.93, h: 0.15, at: [0,5.43,0], color: COLORS.glass, seg: 16 })
  kit.stage(4)
  kit.boat({ kind: 'ship', at: [2.35,0.03,2.6], rotY: 90 })
  for (const x of [-2.3,-1.5,1.6]) kit.person({ at: [x,0,0.7] })
  for (const x of [-2.3,2.5]) kit.tree({ h: 0.65, at: [x,0,-1.4] })
}
