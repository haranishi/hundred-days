// Al-Khazneh: six lower columns, split upper pediment and a curved central tholos.
// Round 3: continuous fractured cliff with a recessed carved face, no stacked wall pillars.
// Production note: source changed after round-2 images; CPU validation only, capture pending.
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { type Kit, type Vec3 } from './kit'

export function build(kit: Kit): void {
  const rock = '#B97A60'
  const carved = '#D79779'
  kit.ground('#CF9D7A')
  kit.stage(1)
  kit.mesh({ geometry: cliffGeometry(), color: rock })
  kit.box({ w: 3.35, d: 1.05, h: 0.17, at: [0, 0, 0.05], color: carved })
  kit.stage(2)
  kit.order(-1)
  // Both storeys form one architectural clue. At p=.55 the shrine no longer floats
  // above an empty wall while the six-column lower portico waits for its turn.
  kit.part(() => {
    kit.box({ w: 0.67, h: 1.2, d: 0.028, at: [0, 0.17, -0.575], color: '#533A32' })
    for (const x of [-1.4, -0.95, -0.48, 0.48, 0.95, 1.4]) column(kit, x, 0.17, 1.52, 0.08, carved)
    kit.box({ w: 3.35, h: 0.17, d: 0.7, at: [0, 1.69, -0.04], color: carved })
    kit.gableRoof({ w: 3.3, d: 0.69, h: 0.55, overhang: 0, at: [0, 1.86, -0.04], color: carved })
    const centerZ = -0.15
    kit.cylinder({ r: 0.52, h: 0.1, at: [0, 2.44, centerZ], seg: 24, color: carved })
    // A cylindrical stone core and a curved colonnade, rather than three columns
    // in a straight line under a round cap. Five visible supports trace its arc.
    kit.cylinder({ r: 0.34, h: 0.9, at: [0, 2.54, centerZ], seg: 24, color: '#BD8066' })
    for (const degree of [-80, -40, 0, 40, 80]) {
      const a = degree * Math.PI / 180
      column(kit, Math.sin(a) * 0.45, 2.54, 0.9, centerZ + Math.cos(a) * 0.45, carved)
    }
    kit.cylinder({ r: 0.54, h: 0.15, at: [0, 3.44, centerZ], seg: 24, color: carved })
    kit.lathe({ points: [[0, 0], [0.54, 0], [0.51, 0.07], [0.32, 0.31], [0.07, 0.49], [0, 0.49]], at: [0, 3.59, centerZ], seg: 24, color: carved })
    for (const side of [-1, 1]) {
      for (const x of [side * 0.94, side * 1.4]) column(kit, x, 2.48, 0.96, 0.03, carved)
      kit.box({ w: 0.75, h: 0.13, d: 0.57, at: [side * 1.18, 3.44, -0.1], color: carved })
      kit.beam({ from: [side * 1.56, 3.57, 0.1], to: [side * 0.84, 3.98, 0.1], size: 0.13, color: carved })
    }
  })
  kit.order(0)
  kit.stage(3)
  kit.part(() => {
    kit.lathe({ points: [[0, 0], [0.13, 0], [0.17, 0.18], [0.1, 0.28], [0, 0.32]], at: [0, 4.08, -0.15], color: carved, seg: 12 })
    // Recessed rectangular niches in the carved upper wings; no copied sculpture.
    for (const x of [-1.18, 1.18]) {
      kit.box({ w: 0.22, h: 0.58, d: 0.025, at: [x, 2.64, -0.58], color: '#865640' })
    }
    for (const x of [-1.4, -0.95, -0.48, 0.48, 0.95, 1.4]) kit.cylinder({ r: 0.115, h: 0.065, at: [x, 0.17, 0.08], seg: 10, color: carved })
  })
  kit.stage(4)
  for (const [x, z] of [[-1.2, 1.7], [-0.6, 2.3], [0.2, 1.9], [1.25, 2.45]] as const) kit.person({ at: [x, 0, z], h: 0.11 })
  kit.camel({ at: [-2.1, 0, 2.25], rotY: -25 })
}

function column(kit: Kit, x: number, y: number, h: number, z: number, color: string): void {
  kit.cylinder({ r: 0.095, rTop: 0.078, h: h - 0.12, at: [x, y, z], color, seg: 12 })
  kit.box({ w: 0.23, d: 0.21, h: 0.12, at: [x, y + h - 0.12, z], color })
}

// Authored closed low-poly rock: a triangulated front surface, matching rear,
// and border faces. Heights/depths vary along the whole cliff; the smooth region
// in the middle is a cut recess in that surface, rather than a separate panel.
function cliffGeometry(): BufferGeometry {
  const xs = [-3.32, -2.95, -2.53, -2.1, -1.74, -1.52, -0.9, 0, 0.9, 1.52, 1.78, 2.18, 2.64, 3.04, 3.35]
  const heights = [3.25, 4.08, 4.84, 4.47, 4.91, 4.62, 4.73, 4.61, 4.79, 4.58, 4.96, 5.13, 4.6, 4.35, 3.64]
  const levels = [0, 0.17, 0.36, 0.58, 0.78, 0.92, 1]
  const front: Vec3[][] = []
  const back: Vec3[][] = []
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i] as number
    const height = heights[i] as number
    const f: Vec3[] = []
    const b: Vec3[] = []
    for (const t of levels) {
      const y = t * height
      const cut = Math.abs(x) <= 1.52 && y < 4.35
      const nx = x + (Math.abs(x) > 1.6 ? 0.11 * Math.sin(i * 1.9 + t * 5) * Math.sin(Math.PI * t) : 0)
      const depth = cut ? -0.6 : 0.1 + 0.42 * Math.sin(i * 2.23 + t * 3.4) + 0.14 * Math.cos(t * 9 + i)
      f.push([nx, y, depth])
      b.push([nx, y, -1.65 - 0.1 * Math.sin(i)])
    }
    front.push(f)
    back.push(b)
  }
  const positions: number[] = []
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => {
    positions.push(...a, ...b, ...c, ...a, ...c, ...d)
  }
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < levels.length - 1; j++) {
    quad(front[i]![j]!, front[i + 1]![j]!, front[i + 1]![j + 1]!, front[i]![j + 1]!)
    quad(back[i]![j]!, back[i]![j + 1]!, back[i + 1]![j + 1]!, back[i + 1]![j]!)
  }
  const top = levels.length - 1
  for (let i = 0; i < xs.length - 1; i++) {
    quad(front[i]![0]!, back[i]![0]!, back[i + 1]![0]!, front[i + 1]![0]!)
    quad(front[i]![top]!, front[i + 1]![top]!, back[i + 1]![top]!, back[i]![top]!)
  }
  for (const i of [0, xs.length - 1]) for (let j = 0; j < levels.length - 1; j++) {
    if (i === 0) quad(front[i]![j]!, front[i]![j + 1]!, back[i]![j + 1]!, back[i]![j]!)
    else quad(front[i]![j]!, back[i]![j]!, back[i]![j + 1]!, front[i]![j + 1]!)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}
