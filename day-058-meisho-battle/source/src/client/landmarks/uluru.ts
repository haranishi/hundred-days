// Round 2: one continuous deformed lathe mesh, no stacked horizontal slabs.
// Public overall silhouette only; sacred caves, rock art and climbing are not represented.
// Production note: CPU geometry validated; identification awaits the next image review.
import { LatheGeometry, Vector2 } from 'three'
import { type Kit } from './kit'

export function build(kit: Kit): void {
  const sandstone = '#B75E3B'
  kit.ground('#C78958')
  kit.stage(1)
  kit.mound({ r: 3.45, rx: 3.45, rz: 1.9, h: 0.045, color: '#B9794F' })
  kit.stage(2)
  // A closed mesh from base to inclined crown. Radial fluting deforms the surface,
  // so the grooves and shoulder are part of the rock instead of separate beams.
  kit.mesh({ geometry: rockGeometry(), color: sandstone })
  kit.stage(3)
  // Small weathered boulders at the foot; no horizontal bands on the main rock.
  for (const [x, z, r] of [[-2.75, 0.87, 0.15], [2.76, 0.64, 0.12], [-1.92, 1.49, 0.1]] as const) {
    kit.sphere({ r, squash: 0.6, at: [x, 0, z], seg: 7, color: sandstone })
  }
  kit.stage(4)
  for (const [x, z] of [[-3.65, 1.1], [3.5, 1.4], [-1.8, 3.15], [1.7, 3.3], [0.4, -3.4], [-2.2, -2.8]] as const) kit.tree({ h: 0.22, at: [x, 0, z], color: '#8B9852' })
  kit.person({ at: [0.4, 0, 2.7], h: 0.1 })
  kit.person({ at: [0.75, 0, 2.65], h: 0.1 })
}

function rockGeometry(): LatheGeometry {
  const profile = [[0, 0], [1, 0], [1.015, 0.14], [1.005, 0.52], [0.98, 0.97], [0.94, 1.36], [0.87, 1.62], [0.72, 1.75], [0.44, 1.79], [0, 1.82]] as const
  const geometry = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 64)
  geometry.scale(3.12, 1, 1.57)
  const pos = geometry.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const a = Math.atan2(z / 1.57, x / 3.12)
    const radial = Math.hypot(x / 3.12, z / 1.57)
    const outline = 1 + 0.046 * Math.sin(3 * a + 0.7) + 0.024 * Math.cos(7 * a)
    const flute = 1 - 0.033 * Math.pow(0.5 + 0.5 * Math.cos(24 * a + 0.8), 5) * Math.min(1, y * 5)
    const nx = x * outline * flute
    const nz = z * outline * flute + 0.065 * Math.sin(a * 2) * radial
    const ny = y * (1 + 0.08 * x / 3.12 + 0.032 * Math.sin(a * 3) * radial)
    pos.setXYZ(i, nx, ny, nz)
  }
  geometry.computeVertexNormals()
  return geometry
}
