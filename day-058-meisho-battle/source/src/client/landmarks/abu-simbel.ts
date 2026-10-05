import { COLORS, type Kit } from './kit'

const SAND = '#C49363'
const ROCK = '#B6885D'
const DARK = '#715442'
const Z = -0.15

export function build(kit: Kit): void {
  kit.ground('#DDC299')
  kit.stage(1)
  kit.mound({ r: 3.7, rx: 4.0, rz: 2.3, h: 2.72, at: [0, 0, -1.35], color: ROCK })
  // Cliff facade, built around an actual gap rather than painting a door on it.
  kit.part(() => {
    for (const x of [-1.96, 1.96]) kit.frustum({ w: 3.28, d: 1.0, h: 2.82, topW: 2.85, topD: 0.7, at: [x, 0, Z - 0.25], color: SAND })
    kit.box({ w: 0.8, h: 1.38, d: 0.78, at: [0, 1.44, Z - 0.25], color: SAND })
    kit.box({ w: 0.57, h: 1.31, d: 0.045, at: [0, 0, Z + 0.255], color: DARK })
  })
  kit.box({ w: 6.35, h: 0.12, d: 1.85, at: [0, 0, Z + 0.95], color: SAND })
  for (const x of [-2.65, -1.15, 1.15, 2.65]) statueBase(kit, x)

  kit.stage(2)
  for (const x of [-2.65, -1.15, 1.15, 2.65]) {
    if (x === -1.15) continue
    kit.part(() => {
      kit.box({ w: 0.67, h: 0.9, d: 0.53, at: [x, 0.9, Z + 0.56], color: SAND })
      for (const side of [-1, 1]) kit.beam({ from: [x + side * 0.33, 1.64, Z + 0.73], to: [x + side * 0.34, 0.93, Z + 1.03], size: 0.13, color: SAND })
      kit.cylinder({ r: 0.13, h: 0.15, at: [x, 1.8, Z + 0.64], seg: 8, color: SAND })
    })
  }
  kit.part(() => {
    kit.box({ w: 6.88, h: 0.16, d: 1.14, at: [0, 2.78, Z - 0.13], color: '#D0A277' })
    for (const x of [-0.42, 0.42]) kit.box({ w: 0.09, h: 1.37, d: 0.1, at: [x, 0.13, Z + 0.3], color: '#D1A578' })
  })

  kit.stage(3)
  for (const x of [-2.65, -1.15, 1.15, 2.65]) {
    // The second colossus retains only its legs; its fallen head lies in front.
    if (x === -1.15) continue
    kit.part(() => {
      kit.box({ w: 0.4, h: 0.37, d: 0.42, at: [x, 1.95, Z + 0.63], color: SAND })
      for (const side of [-1, 1]) kit.box({ w: 0.1, h: 0.5, d: 0.27, at: [x + side * 0.23, 1.91, Z + 0.64], color: '#BF8D5F' })
      kit.box({ w: 0.11, h: 0.14, d: 0.07, at: [x, 2.08, Z + 0.88], color: SAND })
      kit.cylinder({ r: 0.16, rTop: 0.1, h: 0.28, at: [x, 2.3, Z + 0.63], seg: 10, color: SAND })
    })
  }
  kit.part(() => {
    kit.box({ w: 0.44, h: 0.28, d: 0.45, at: [-0.99, 0.13, Z + 1.38], rotY: 24, color: SAND })
    kit.cylinder({ r: 0.15, h: 0.23, at: [-1.07, 0.13, Z + 1.69], rot: [0, 0, 70], seg: 10, color: SAND })
    for (let i = 0; i < 15; i++) {
      const x = -3.1 + i * 0.44
      kit.cylinder({ r: 0.045, h: 0.1, at: [x, 2.94, Z + 0.05], seg: 6, color: SAND })
      kit.sphere({ r: 0.048, seg: 6, at: [x, 3.04, Z + 0.04], color: SAND })
    }
  })
  kit.stage(4)
  kit.box({ w: 2.8, h: 0.02, d: 1.5, at: [0, 0, 2.5], color: '#CDAA7F' })
  for (const [x, z] of [[-1.6, 2.05], [-0.7, 2.7], [0.1, 2.2], [0.8, 2.9], [1.7, 2.4], [0.3, 3.5]] as const) kit.person({ at: [x, 0.02, z], h: 0.1 })
  for (const x of [-3.65, 3.65]) kit.tree({ kind: 'palm', h: 0.56, at: [x, 0, 2.1], color: COLORS.forest })
}

function statueBase(kit: Kit, x: number): void {
  kit.part(() => {
    kit.box({ w: 0.94, h: 0.15, d: 0.95, at: [x, 0.12, Z + 0.76], color: SAND })
    kit.box({ w: 0.72, h: 0.63, d: 0.63, at: [x, 0.27, Z + 0.52], color: SAND })
    for (const side of [-1, 1]) {
      kit.box({ w: 0.23, h: 0.7, d: 0.29, at: [x + side * 0.2, 0.27, Z + 0.95], color: SAND })
      kit.box({ w: 0.24, h: 0.13, d: 0.35, at: [x + side * 0.2, 0.25, Z + 1.08], color: SAND })
    }
  })
}
