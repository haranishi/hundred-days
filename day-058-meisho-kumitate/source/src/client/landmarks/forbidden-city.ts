import { COLORS, type Kit } from './kit'

const RED = '#A94532'
const TILE = '#D9AB43'
const WHITE = '#E4DFD1'
const COURT = '#C8BCAF'

export function build(kit: Kit): void {
  kit.ground(COURT)
  kit.stage(1)
  kit.box({ w: 6.0, h: 0.05, d: 6.4, color: COURT })
  kit.box({ w: 4.15, h: 0.1, d: 2.08, at: [0, 0.05, -0.23], color: WHITE })
  kit.box({ w: 3.88, h: 0.1, d: 1.91, at: [0, 0.15, -0.23], color: WHITE })
  kit.box({ w: 3.57, h: 0.1, d: 1.73, at: [0, 0.25, -0.23], color: WHITE })
  kit.box({ w: 3.0, h: 0.58, d: 1.34, at: [0, 0.35, -0.23], color: RED })
  for (const [z, w, d] of [[-1.92, 1.55, 0.84], [-3.0, 2.42, 0.82]] as const) {
    kit.box({ w: w + 0.35, h: 0.16, d: d + 0.28, at: [0, 0.05, z], color: WHITE })
    kit.box({ w, h: 0.42, d, at: [0, 0.21, z], color: RED })
  }
  for (const x of [-2.62, 2.62]) kit.box({ w: 0.44, h: 0.38, d: 5.0, at: [x, 0.05, -0.42], color: RED })
  kit.part(() => {
    kit.box({ w: 3.86, h: 0.46, d: 0.67, at: [0, 0.05, 2.42], color: RED })
    for (const x of [-2.05, 2.05]) kit.box({ w: 0.56, h: 0.42, d: 1.64, at: [x, 0.05, 1.94], color: RED })
  })

  kit.stage(2)
  kit.curvedRoof({ w: 3.05, d: 1.38, h: 0.27, style: 'skirt', top: { w: 2.32, d: 0.78 }, overhang: 0.18, at: [0, 0.93, -0.23], color: TILE, upturn: 0.1 })
  kit.box({ w: 2.32, h: 0.28, d: 0.78, at: [0, 0.97, -0.23], color: RED })
  for (const [z, w, d] of [[-1.92, 1.55, 0.84], [-3.0, 2.42, 0.82]] as const) {
    kit.curvedRoof({ w, d, h: 0.34, style: 'yosemune', overhang: 0.13, at: [0, 0.63, z], color: TILE, upturn: 0.1 })
  }
  for (const x of [-2.62, 2.62]) kit.gableRoof({ w: 5.05, d: 0.5, h: 0.23, at: [x, 0.43, -0.42], rotY: 90, overhang: 0.08, color: TILE })
  kit.curvedRoof({ w: 3.92, d: 0.78, h: 0.28, style: 'yosemune', overhang: 0.1, at: [0, 0.51, 2.42], color: TILE })
  for (const x of [-2.05, 2.05]) kit.gableRoof({ w: 1.7, d: 0.64, h: 0.23, at: [x, 0.47, 1.94], rotY: 90, overhang: 0.06, color: TILE })
  kit.part(() => {
    for (const x of [-1.25, -0.92, -0.58, -0.24, 0.24, 0.58, 0.92, 1.25]) {
      kit.cylinder({ r: 0.043, h: 0.58, at: [x, 0.35, 0.47], seg: 8, color: RED })
      kit.box({ w: 0.16, h: 0.33, d: 0.022, at: [x, 0.39, 0.457], color: '#52452D' })
    }
  })
  kit.stairs({ w: 1.15, d: 0.55, h: 0.3, steps: 5, at: [0, 0.05, 0.89], color: WHITE })

  kit.stage(3)
  kit.curvedRoof({ w: 2.36, d: 0.88, h: 0.52, style: 'yosemune', overhang: 0.18, at: [0, 1.25, -0.23], color: TILE, upturn: 0.15, ridge: 0.66 })
  kit.part(() => {
    kit.beam({ from: [-0.76, 1.78, -0.23], to: [0.76, 1.78, -0.23], size: 0.06, color: TILE })
    for (const x of [-0.76, 0.76]) kit.cone({ r: 0.075, h: 0.19, at: [x, 1.77, -0.23], seg: 8, color: COLORS.gold })
    for (const x of [-1.66, -1.3, -0.94, 0.94, 1.3, 1.66]) kit.box({ w: 0.06, h: 0.16, d: 0.06, at: [x, 0.35, 0.52], color: WHITE })
    kit.box({ w: 3.38, h: 0.055, d: 0.045, at: [0, 0.49, 0.53], color: WHITE })
  })
  for (const x of [-1.6, 1.6]) {
    kit.box({ w: 0.47, h: 0.4, d: 0.5, at: [x, 0.59, 2.42], color: RED })
    kit.curvedRoof({ w: 0.57, d: 0.59, h: 0.31, style: 'hogyo', overhang: 0.08, at: [x, 0.99, 2.42], color: TILE })
  }
  for (const x of [-0.68, 0, 0.68]) kit.arch({ w: 0.35, h: 0.45, d: 0.065, thick: 0.065, at: [x, 0.05, 2.79], color: '#65442F' })
  kit.part(() => {
    kit.box({ w: 0.32, h: 0.035, d: 2.03, at: [0, 0.05, 1.62], color: WHITE })
    for (const x of [-1.47, -0.7, 0, 0.7, 1.47]) kit.arch({ w: 0.4, h: 0.13, d: 0.3, thick: 0.055, at: [x, 0.07, 1.35], color: WHITE })
  })

  kit.stage(4)
  for (const x of [-3.34, 3.34]) {
    for (const z of [-1.5, -0.2, 1.3]) kit.tree({ kind: 'pine', h: kit.range(0.35, 0.55), at: [x, 0, z] })
  }
  for (const [x, z] of [[-1.1, 1.65], [-0.45, 1.91], [0.45, 1.7], [1.07, 1.85], [-0.62, 3.1], [0.4, 3.1], [-1.5, -1.2], [1.5, -1.2]] as const) kit.person({ at: [x, 0.05, z], h: 0.09 })
}
