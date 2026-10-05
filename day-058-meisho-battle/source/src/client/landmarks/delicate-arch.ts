// Independent natural sandstone arch, not a bridge: one closed continuous weathered mesh.
// Source dimensions refer to the opening; this miniature intentionally exaggerates its relief.
// Production: authored geometry only, no NPS photos/assets. CPU checked; render review pending.
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { type Kit, type Vec3 } from './kit'

export function build(kit: Kit): void {
  const sandstone = '#C0784E'
  kit.ground('#C8976A')
  kit.stage(1)
  kit.mesh({ geometry: bedrock(), color: '#B9845D' })
  kit.stage(2)
  kit.order(-1)
  kit.mesh({ geometry: naturalArch(), color: sandstone })
  kit.order(0)
  kit.stage(3)
  for (const [x, z, r] of [[-1.55, 0.2, 0.19], [1.61, 0.17, 0.15], [-2.13, -0.7, 0.22]] as const) kit.sphere({ r, squash: 0.35, at: [x, 0.18 + x * 0.035, z], color: sandstone, seg: 7 })
  kit.stage(4)
  kit.person({ at: [-1.8, 0, 2.45], h: 0.1 })
  kit.person({ at: [-1.45, 0, 2.63], h: 0.1 })
  for (const [x, z] of [[-3.2, 1], [2.85, 1.9], [0.6, -3.1]] as const) kit.tree({ h: 0.18, at: [x, 0, z], color: '#82905F' })
}

function naturalArch(): BufferGeometry {
  // Unequal legs, a displaced crown and a thin curved lintel create one big negative space.
  const path: readonly Vec3[] = [
    // Extend the whole left foot into the inclined bedrock; its tilted cap must
    // remain below the rock surface even at the high edge, not hover above it.
    [-1.48, 0.02, 0.48], [-1.39, 0.76, 0.34], [-1.32, 1.36, 0.29],
    [-1.19, 1.97, 0.28], [-1.02, 2.55, 0.25], [-0.73, 3.03, 0.23],
    [-0.25, 3.37, 0.22], [0.28, 3.54, 0.22], [0.8, 3.4, 0.23],
    [1.18, 3.03, 0.25], [1.33, 2.49, 0.27], [1.42, 1.82, 0.28],
    [1.51, 1.09, 0.29], [1.64, 0.26, 0.39],
  ]
  const vertices: number[] = []
  const indices: number[] = []
  const ring = 12
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!
    const prev = path[Math.max(0, i - 1)]!
    const next = path[Math.min(path.length - 1, i + 1)]!
    const dx = next[0] - prev[0], dy = next[1] - prev[1]
    const len = Math.hypot(dx, dy)
    const nx = -dy / len, ny = dx / len
    for (let j = 0; j < ring; j++) {
      const a = j * Math.PI * 2 / ring
      const wear = 1 + 0.065 * Math.sin(i * 2.7 + j * 1.6) + 0.035 * Math.cos(j * 4 + i)
      const radius = p[2] * wear
      vertices.push(p[0] + nx * Math.cos(a) * radius, p[1] + ny * Math.cos(a) * radius, Math.sin(a) * radius * 0.83 + 0.065 * Math.sin(i * 0.9))
    }
  }
  for (let i = 0; i < path.length - 1; i++) for (let j = 0; j < ring; j++) {
    const a = i * ring + j, b = i * ring + (j + 1) % ring, c = (i + 1) * ring + j, d = (i + 1) * ring + (j + 1) % ring
    indices.push(a, b, c, b, d, c)
  }
  const lower = vertices.length / 3
  vertices.push(path[0]![0], path[0]![1], 0)
  const upper = vertices.length / 3
  vertices.push(path.at(-1)![0], path.at(-1)![1], 0.065 * Math.sin((path.length - 1) * 0.9))
  for (let j = 0; j < ring; j++) {
    indices.push(lower, (j + 1) % ring, j)
    const a = (path.length - 1) * ring
    indices.push(upper, a + j, a + (j + 1) % ring)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function bedrock(): BufferGeometry {
  const vertices: number[] = [], indices: number[] = [], n = 18
  for (let i = 0; i < n; i++) {
    const a = i * Math.PI * 2 / n
    const r = 1 + 0.07 * Math.sin(i * 2.4)
    const x = Math.cos(a) * 3.35 * r, z = Math.sin(a) * 1.88 * r
    vertices.push(x, 0, z, x, 0.18 + x * 0.035, z)
  }
  const top = vertices.length / 3; vertices.push(0, 0.18, 0)
  const bottom = vertices.length / 3; vertices.push(0, 0, 0)
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = ((i + 1) % n) * 2
    indices.push(a, a + 1, b, b, a + 1, b + 1, top, b + 1, a + 1, bottom, a, b)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  const flat = geometry.toNonIndexed(); geometry.dispose(); flat.computeVertexNormals(); return flat
}
