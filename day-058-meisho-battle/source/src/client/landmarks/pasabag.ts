// A stylized Paşabağ branching rock, not a surveyed copy of the official photograph.
import { BufferAttribute, BufferGeometry, LatheGeometry, Vector2 } from 'three'
import { COLORS, type Kit } from './kit'

type Point = readonly [number, number, number]
const HEADS = [
  [-0.72, 3.16, 0.13, 0.36],
  [0.04, 2.92, -0.59, 0.33],
  [0.72, 3.38, 0.12, 0.37],
] as const
const smoothMin = (a: number, b: number, k: number): number => {
  const t = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k))
  return b * (1 - t) + a * t - k * t * (1 - t)
}

/** Negative inside. Broad foot and three narrower necks belong to one rock volume. */
function rockField(x: number, y: number, z: number): number {
  const t = Math.max(0, Math.min(1, y / 2.36)), a = Math.atan2(x, z)
  const grooves = 0.095 * Math.max(0, Math.cos(7 * a + 0.28 * y)) ** 4 + 0.03 * Math.sin(13 * a + 0.7 * y)
  const radius = 1.34 - 0.52 * t - 0.06 * t * t
  let field = Math.max(Math.hypot((x - 0.035 * y) / 1.04, z / 0.8) - radius + grooves, -y - 0.035, y - 2.36)
  for (const [hx, top, hz, r] of HEADS) {
    const u = Math.max(0, Math.min(1, (y - 1.48) / (top - 1.48)))
    const cx = hx * (0.57 + 0.43 * u), cz = hz * (0.62 + 0.38 * u)
    const theta = Math.atan2(x - cx, z - cz)
    const neck = r + 0.16 * (1 - u) - 0.05 * u * (1 - u)
    const erosion = 0.026 * Math.cos(5 * theta + y * 0.8) + 0.014 * Math.cos(9 * theta - y)
    const branch = Math.max(Math.hypot(x - cx, (z - cz) / 0.88) - neck + erosion, 1.45 - y, y - top)
    field = smoothMin(field, branch, 0.14)
  }
  return field
}

/** Fixed-grid marching tetrahedra; closed sampling box lies wholly outside the rock. */
function branchingRock(): BufferGeometry {
  const nx = 24, ny = 32, nz = 20
  const min: Point = [-1.62, -0.1, -1.34], max: Point = [1.62, 3.55, 1.34]
  const points: Point[] = [], values: number[] = []
  const at = (x: number, y: number, z: number) => (y * (nz + 1) + z) * (nx + 1) + x
  for (let y = 0; y <= ny; y++) for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) {
    const p: Point = [min[0] + (max[0] - min[0]) * x / nx, min[1] + (max[1] - min[1]) * y / ny, min[2] + (max[2] - min[2]) * z / nz]
    points.push(p)
    const value = rockField(...p)
    // Keep intersections away from exact lattice vertices to avoid pole-like sliver faces.
    values.push(value >= 0 ? Math.max(0.002, value) : Math.min(-0.002, value))
  }
  const positions: number[] = [], indices: number[] = [], edgeVertices = new Map<string, number>()
  const crossing = (a: number, b: number): number => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    const cached = edgeVertices.get(key)
    if (cached !== undefined) return cached
    const pa = points[a]!, pb = points[b]!, va = values[a]!, vb = values[b]!
    const t = va / (va - vb), index = positions.length / 3
    positions.push(pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t)
    edgeVertices.set(key, index)
    return index
  }
  const triangle = (a: number, b: number, c: number, direction: Point): void => {
    const ax = positions[a * 3]!, ay = positions[a * 3 + 1]!, az = positions[a * 3 + 2]!
    const ux = positions[b * 3]! - ax, uy = positions[b * 3 + 1]! - ay, uz = positions[b * 3 + 2]! - az
    const vx = positions[c * 3]! - ax, vy = positions[c * 3 + 1]! - ay, vz = positions[c * 3 + 2]! - az
    const normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]
    const outward = normal[0]! * direction[0] + normal[1]! * direction[1] + normal[2]! * direction[2]
    indices.push(a, outward >= 0 ? b : c, outward >= 0 ? c : b)
  }
  // Consistent face diagonals for every adjacent cube (body diagonal 0–6).
  const tetrahedra = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]] as const
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const cube = [at(x,y,z),at(x+1,y,z),at(x+1,y,z+1),at(x,y,z+1),at(x,y+1,z),at(x+1,y+1,z),at(x+1,y+1,z+1),at(x,y+1,z+1)]
    for (const tet of tetrahedra) {
      const ids = tet.map(i => cube[i]!), inside = ids.filter(i => values[i]! < 0), outside = ids.filter(i => values[i]! >= 0)
      if (!inside.length || !outside.length) continue
      const delta = (axis: number): number => outside.reduce((sum,i)=>sum+points[i]![axis]!,0)/outside.length-inside.reduce((sum,i)=>sum+points[i]![axis]!,0)/inside.length
      const direction: Point = [delta(0),delta(1),delta(2)]
      if (inside.length === 1) triangle(crossing(inside[0]!,outside[0]!),crossing(inside[0]!,outside[1]!),crossing(inside[0]!,outside[2]!),direction)
      else if (inside.length === 3) triangle(crossing(outside[0]!,inside[0]!),crossing(outside[0]!,inside[1]!),crossing(outside[0]!,inside[2]!),direction)
      else if (inside.length === 2) {
        const a=crossing(inside[0]!,outside[0]!),b=crossing(inside[0]!,outside[1]!),c=crossing(inside[1]!,outside[0]!),d=crossing(inside[1]!,outside[1]!)
        triangle(a,b,c,direction);triangle(b,d,c,direction)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position',new BufferAttribute(new Float32Array(positions),3));geometry.setIndex(indices)
  // Flat facets reveal erosion instead of smoothing the rock into a chess piece.
  const flat = geometry.toNonIndexed();geometry.dispose();flat.computeVertexNormals()
  return flat
}

function cap(kit: Kit, x: number, y: number, z: number, r: number, seed: number): void {
  const geometry = new LatheGeometry([[0,-0.045],[r*0.88,-0.045],[r,0.035],[r*0.87,0.16],[r*0.6,0.28],[r*0.23,0.42],[0,0.49]].map(([radius,h])=>new Vector2(radius!,h!)),11)
  const p=geometry.getAttribute('position')
  for(let i=0;i<p.count;i++){
    const px=p.getX(i),py=p.getY(i),pz=p.getZ(i),a=Math.atan2(px,pz)
    const wobble=1+0.09*Math.sin(3*a+seed)+0.07*Math.cos(2*a-seed)
    p.setXYZ(i,px*wobble+0.09*Math.max(0,py),py+0.024*Math.sin(4*a+seed)*Math.hypot(px,pz)/r,pz*wobble*0.88)
  }
  const flat=geometry.toNonIndexed();geometry.dispose();flat.computeVertexNormals()
  kit.mesh({geometry:flat,at:[x,y,z],color:'#927558'})
}

function solitary(kit: Kit, x: number, z: number, h: number, r: number, seed: number): void {
  const geometry=new LatheGeometry([[0,-0.025],[r,-0.025],[r*0.88,h*.22],[r*.62,h*.5],[r*.42,h*.83],[r*.36,h],[0,h]].map(([radius,y])=>new Vector2(radius!,y!)),13)
  const p=geometry.getAttribute('position')
  for(let i=0;i<p.count;i++){
    const px=p.getX(i),y=p.getY(i),pz=p.getZ(i),a=Math.atan2(px,pz)
    const wobble=1+0.12*Math.sin(5*a+seed)+0.06*Math.cos(9*a+0.7*y)
    p.setXYZ(i,px*wobble+0.1*y/h,y,pz*wobble)
  }
  const flat=geometry.toNonIndexed();geometry.dispose();flat.computeVertexNormals()
  kit.mesh({geometry:flat,at:[x,0,z],color:'#D1B891'})
  cap(kit,x+0.1,h,z,r*.57,seed)
}

export function build(kit: Kit): void {
  kit.ground(COLORS.sand)
  kit.stage(1)
  kit.part(()=>{
    kit.lathe({points:[[0,0],[2.2,0],[2.2,.015],[1.7,.08],[.8,.17],[0,.19]],scale:[1.42,1,.76],seg:20,at:[0,0,-.45],color:'#D8C39F'})
    kit.lathe({points:[[0,0],[1.1,0],[1.1,.015],[.7,.1],[0,.15]],seg:16,at:[-1.9,0,1.15],color:'#D8C39F'})
  })
  kit.stage(2);kit.order(-1)
  kit.part(()=>{
    // Single closed branched rock geometry comes first in this part for regression inspection.
    kit.mesh({geometry:branchingRock(),at:[0,0,-.45],color:'#D1B891'})
    for(const [x,y,z,r] of HEADS)cap(kit,x,y,z-.45,r*1.43,y)
    solitary(kit,-2.2,.95,2.09,.58,3.8)
    solitary(kit,2.27,.75,2.42,.6,4.6)
  })
  kit.order(0);kit.stage(3)
  kit.part(()=>{
    for(const [x,z,r] of [[-1.12,1.5,.26],[1.1,1.38,.3],[-2.7,-1.55,.29]] as const)kit.sphere({r,squash:.52,at:[x,.02,z],color:'#CAB08A',seg:8})
  })
  kit.stage(4)
  kit.part(()=>{
    for(const [x,z] of [[-2.65,1.6],[2.7,1.48],[-2.65,-2.35]] as const)kit.sphere({r:.13,squash:.6,seg:8,at:[x,0,z],color:'#8A9161'})
    kit.person({at:[-.8,0,2.02],h:.14});kit.person({at:[-.52,0,2.13],h:.12})
  })
}
