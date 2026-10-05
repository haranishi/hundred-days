import { expect, it } from 'vitest'
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { buildLandmark, preloadLandmark } from '../../src/client/landmarks'
import { REACH_LIMIT } from '../../src/client/landmarks/kit'

const budgets = [
  ['amanohashidate',160,14000,2.5],
  ['delicate-arch',80,10000,5.8],
  ['iguazu-falls',180,18000,4.5],
] as const
for (const [id,parts,triangles,height] of budgets) it(`${id} stays within its mobile geometry budget`,async()=>{
  await preloadLandmark(id)
  const model=buildLandmark(id)!
  try {
    expect(model.warnings).toEqual([])
    expect(model.parts.length).toBeLessThanOrEqual(parts)
    expect(model.triangles).toBeLessThanOrEqual(triangles)
    expect(model.height).toBeLessThanOrEqual(height)
    expect(model.parts.every(part=>part.reach<=REACH_LIMIT&&part.minY>=-0.12)).toBe(true)
  } finally {for(const part of model.parts)part.geometry.dispose()}
})

it('the natural arch leaves a through-opening while both unequal legs remain solid',async()=>{
  await preloadLandmark('delicate-arch')
  const model=buildLandmark('delicate-arch')!
  const material=new MeshBasicMaterial({side:DoubleSide})
  try {
    const arch=model.parts.find(part=>part.stage===2&&part.order<0)!
    const mesh=new Mesh(arch.geometry,material)
    const through=(x:number,y:number)=>new Raycaster(new Vector3(x,y,4),new Vector3(0,0,-1)).intersectObject(mesh).length
    expect(through(0,1.8)).toBe(0)
    expect(through(-1.25,1.8)).toBeGreaterThan(0)
    expect(through(1.42,1.8)).toBeGreaterThan(0)
    expect(through(0.28,3.54)).toBeGreaterThan(0)
  } finally {material.dispose();for(const part of model.parts)part.geometry.dispose()}
})

it('the entire left arch foot intersects the actual inclined bedrock surface',async()=>{
  await preloadLandmark('delicate-arch')
  const model=buildLandmark('delicate-arch')!
  const material=new MeshBasicMaterial({side:DoubleSide})
  try {
    const bedrock=new Mesh(model.parts.find(part=>part.stage===1)!.geometry,material)
    bedrock.updateMatrixWorld()
    const arch=model.parts.find(part=>part.stage===2&&part.order<0)!.geometry
    const positions=arch.getAttribute('position')
    // The first cross-section is the closed left foot. Test its whole perimeter
    // against ray hits on the bedrock mesh, including the tilted cap's high edge.
    for(let i=0;i<12;i++) {
      const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i)
      const hit=new Raycaster(new Vector3(x,6,z),new Vector3(0,-1,0)).intersectObject(bedrock)[0]
      expect(hit,`left foot perimeter ${i} lacks supporting rock`).toBeDefined()
      expect(y-hit!.point.y,`left foot perimeter ${i} floats above rock`).toBeLessThanOrEqual(0)
      expect(hit!.point.y-y).toBeLessThan(0.25)
    }
  } finally {material.dispose();for(const part of model.parts)part.geometry.dispose()}
})
