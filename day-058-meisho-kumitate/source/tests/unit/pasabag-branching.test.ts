import { expect, it } from 'vitest'
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { build } from '../../src/client/landmarks/pasabag'
import { buildModel } from '../../src/client/landmarks/kit'
import { buildSchedule } from '../../src/client/render/assembly'

it('Paşabağ has a grounded closed connected positive-volume three-headed rock before 55%', () => {
  const model=buildModel('pasabag',build),again=buildModel('pasabag',build)
  const material=new MeshBasicMaterial({side:DoubleSide})
  try {
    expect(model.warnings).toEqual([])
    expect(model.parts.length).toBeLessThanOrEqual(150)
    expect(model.triangles).toBeLessThanOrEqual(18000)
    expect(model.height).toBeLessThanOrEqual(6.5)
    expect(new Set(model.parts.map(p=>p.stage))).toEqual(new Set([1,2,3,4]))
    model.parts.forEach((part,i)=>{
      expect(part.reach).toBeLessThanOrEqual(4.96);expect(part.minY).toBeGreaterThanOrEqual(-.12)
      for(const name of ['position','normal'])expect(Array.from(part.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true)
      expect(Array.from(part.geometry.getAttribute('position').array)).toEqual(Array.from(again.parts[i]!.geometry.getAttribute('position').array))
    })
    const clueIndex=model.parts.findIndex(p=>p.stage===2&&p.order<0),clue=model.parts[clueIndex]!
    expect(buildSchedule(model.parts).parts[clueIndex]!.end).toBeLessThanOrEqual(.55)
    const p=clue.geometry.getAttribute('position'),color=clue.geometry.getAttribute('aTrue')
    // First authored mesh is the branching rock. Its sandstone color ends at the first cap.
    let count=0
    while(count<p.count&&Math.abs(color.getX(count)-color.getX(0))+Math.abs(color.getY(count)-color.getY(0))+Math.abs(color.getZ(count)-color.getZ(0))<1e-5)count++
    expect(count%3).toBe(0);expect(count).toBeGreaterThan(3000)
    const root=clue.geometry.clone();root.setDrawRange(0,count)
    const edges=new Map<string,{count:number,balance:number}>(),graph=new Map<string,Set<string>>()
    const key=(i:number)=>[p.getX(i),p.getY(i),p.getZ(i)].map(n=>Math.round(n*1e5)).join(',')
    const a=new Vector3(),b=new Vector3(),c=new Vector3();let volume=0
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity
    for(let i=0;i<count;i+=3){
      a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2)
      expect(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq(),'non-degenerate tetrahedron triangle').toBeGreaterThan(1e-18)
      volume+=a.dot(b.clone().cross(c))/6
      const keys=[key(i),key(i+1),key(i+2)]
      for(let n=0;n<3;n++){
        const u=keys[n]!,v=keys[(n+1)%3]!,edge=[u,v].sort().join('|'),record=edges.get(edge)??{count:0,balance:0}
        record.count++;record.balance+=u<v?1:-1;edges.set(edge,record)
        if(!graph.has(u))graph.set(u,new Set());graph.get(u)!.add(v)
        if(!graph.has(v))graph.set(v,new Set());graph.get(v)!.add(u)
      }
    }
    for(let i=0;i<count;i++){
      minX=Math.min(minX,p.getX(i));maxX=Math.max(maxX,p.getX(i));minY=Math.min(minY,p.getY(i));maxY=Math.max(maxY,p.getY(i));minZ=Math.min(minZ,p.getZ(i));maxZ=Math.max(maxZ,p.getZ(i))
    }
    expect([...edges.values()].every(e=>e.count===2&&e.balance===0),'closed outward-wound manifold edges').toBe(true)
    expect(volume).toBeGreaterThan(1)
    const visited=new Set<string>(),todo=[graph.keys().next().value!]
    while(todo.length){const vertex=todo.pop()!;if(visited.has(vertex))continue;visited.add(vertex);for(const neighbor of graph.get(vertex)!)if(!visited.has(neighbor))todo.push(neighbor)}
    expect(visited.size,'all three necks belong to one connected rock').toBe(graph.size)
    // The sampling box extends beyond the natural surface: no clipping at sides or top.
    expect(minX).toBeGreaterThan(-1.61);expect(maxX).toBeLessThan(1.61)
    expect(minZ).toBeGreaterThan(-1.78);expect(maxZ).toBeLessThan(.88);expect(maxY).toBeLessThan(3.54)
    expect(minY).toBeLessThan(0);expect(minY).toBeGreaterThan(-.08)
    const mesh=new Mesh(root,material),hit=(x:number,y:number,z:number)=>new Raycaster(new Vector3(x,y,z),new Vector3(0,-1,0)).intersectObject(mesh)[0]
    for(const [x,z] of [[-.68,-.32],[.04,-1.04],[.68,-.33]] as const){const top=hit(x,3.5,z);expect(top,'each upper neck is solid below its cap').toBeDefined();expect(top!.point.y).toBeGreaterThan(2.85)}
    const soil=hit(0,1,-.45);expect(soil,'one broad connected root supports the necks').toBeDefined()
    // Empty fork gap above the broad root distinguishes branching necks from a solid cone.
    const fork=hit(0,3.5,-.32);expect(fork).toBeDefined();expect(fork!.point.y).toBeLessThan(2.5)
    root.dispose()
  } finally {material.dispose();for(const m of [model,again])for(const p of m.parts)p.geometry.dispose()}
})
