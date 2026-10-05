import { expect, it } from 'vitest'
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3, type BufferGeometry } from 'three'
import { buildSchedule } from '../../src/client/render/assembly'
import { Kit } from '../../src/client/landmarks/kit'
import { build } from '../../src/client/landmarks/sazaedo'
it('sazaedo exterior eaves and entrance canopy are watertight with outward winding and upward top faces',()=>{
  const kit=new Kit('sazaedo'),captured:BufferGeometry[]=[]
  const mesh=kit.mesh.bind(kit)
  kit.mesh=o=>{captured.push(o.geometry.clone());mesh(o)}
  build(kit)
  expect(captured).toHaveLength(4)
  for(const [which,g] of captured.entries()){
    const p=g.getAttribute('position'),idx=g.index!,edges=new Map<string,number>()
    let volume=0
    const a=new Vector3(),b=new Vector3(),c=new Vector3()
    for(let i=0;i<idx.count;i+=3){
      const ia=idx.getX(i),ib=idx.getX(i+1),ic=idx.getX(i+2)
      a.fromBufferAttribute(p,ia);b.fromBufferAttribute(p,ib);c.fromBufferAttribute(p,ic)
      volume+=a.dot(b.clone().cross(c))/6
      for(const [u,v] of [[ia,ib],[ib,ic],[ic,ia]]){const key=u!<v!?`${u}:${v}`:`${v}:${u}`;edges.set(key,(edges.get(key)??0)+1)}
      // Each segment starts with its two top triangles, followed by bottom and side faces.
      if(i<(which===3?32:48)*24&&i%24<6)expect(b.sub(a).cross(c.sub(a)).y).toBeGreaterThan(0)
    }
    expect(volume).toBeGreaterThan(0)
    expect([...edges.values()].every(n=>n===2)).toBe(true)
    for(let i=0;i<p.count;i++)expect(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i))).toBe(true)
    g.dispose()
  }
  kit.finish().parts.forEach(p=>p.geometry.dispose())
})

it('sazaedo essential exterior lands by 55 percent and timber posts rest on foundations',()=>{
  const kit=new Kit('sazaedo'),feet:Array<readonly [number,number,number]>=[]
  const cylinder=kit.cylinder.bind(kit)
  kit.cylinder=o=>{if(o.h>1&&o.r<0.1&&o.at)feet.push(o.at);cylinder(o)}
  build(kit);const model=kit.finish(),material=new MeshBasicMaterial({side:DoubleSide})
  const bases=model.parts.filter(p=>p.stage===1).map(p=>new Mesh(p.geometry,material))
  const ray=new Raycaster(),schedule=buildSchedule(model.parts)
  try {
    expect(feet).toHaveLength(8)
    for(const [x,y,z] of feet){
      ray.set(new Vector3(x,y+0.002,z),new Vector3(0,-1,0))
      const hit=ray.intersectObjects(bases,false)[0]
      expect(hit,'timber post has no supporting foundation').toBeTruthy()
      expect(Math.abs(hit!.point.y-y)).toBeLessThan(0.003)
    }
    expect(model.warnings).toEqual([])
    expect(model.parts.length).toBeLessThanOrEqual(150)
    expect(model.triangles).toBeLessThanOrEqual(18000)
    expect(model.height).toBeLessThanOrEqual(6.5)
    expect([...new Set(model.parts.map(p=>p.stage))]).toEqual([1,2,3,4])
    const essential=model.parts.flatMap((p,i)=>p.stage===2?[i]:[])
    expect(essential).toHaveLength(1)
    expect(model.parts[essential[0]!]!.order).toBeLessThan(0)
    expect(schedule.parts[essential[0]!]!.end).toBeLessThanOrEqual(0.55)
    for(const part of model.parts){
      expect(part.reach).toBeLessThanOrEqual(4.96)
      expect(part.minY).toBeGreaterThanOrEqual(-0.12)
      const p=part.geometry.getAttribute('position')
      for(let i=0;i<p.count;i++)expect([p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite)).toBe(true)
    }
  }finally{model.parts.forEach(p=>p.geometry.dispose());material.dispose()}
})
