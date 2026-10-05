import { expect, it } from 'vitest'
import { Vector3, type BufferGeometry } from 'three'
import { buildLandmark, preloadLandmark } from '../../src/client/landmarks'
import { buildSchedule } from '../../src/client/render/assembly'

// Sum the area of vertical triangles sharing a plane. A single giant flat
// outer wall made the previous Iguazu terrain read as an artificial reservoir.
export function largestVerticalPlaneArea(geometry: BufferGeometry): number {
  const pos=geometry.getAttribute('position'),index=geometry.index
  const planes=new Map<string,number>(),a=new Vector3(),b=new Vector3(),c=new Vector3()
  const count=index?.count??pos.count
  for(let i=0;i<count;i+=3){
    a.fromBufferAttribute(pos,index?.getX(i)??i)
    b.fromBufferAttribute(pos,index?.getX(i+1)??i+1)
    c.fromBufferAttribute(pos,index?.getX(i+2)??i+2)
    const normal=b.clone().sub(a).cross(c.clone().sub(a)),area=normal.length()/2
    if(area<1e-9)continue
    normal.normalize()
    if(Math.abs(normal.y)>.35)continue
    const dominant=Math.abs(normal.x)>Math.abs(normal.z)?normal.x:normal.z
    if(dominant<0)normal.negate()
    const key=[normal.x,normal.y,normal.z,normal.dot(a)].map(n=>Math.round(n*100)).join(',')
    planes.set(key,(planes.get(key)??0)+area)
  }
  return Math.max(0,...planes.values())
}

it('Nachi shows its foreground pagoda and tall fall together before 55%',async()=>{
  await preloadLandmark('nachi-falls')
  const model=buildLandmark('nachi-falls')!
  try{
    const schedule=buildSchedule(model.parts)
    const clues=model.parts.flatMap((part,index)=>{
      if(part.stage!==2||part.order>=0)return []
      const p=part.geometry.getAttribute('position')
      let foregroundUpperRoof=false,tallFall=false
      for(let i=0;i<p.count;i++){
        if(p.getX(i)<-.8&&p.getY(i)>2.45)foregroundUpperRoof=true
        if(p.getX(i)>.2&&p.getY(i)>3.5)tallFall=true
      }
      return foregroundUpperRoof&&tallFall?[index]:[]
    })
    expect(clues.length,'early water alone lost the three-storey pagoda clue').toBeGreaterThan(0)
    for(const index of clues)expect(schedule.parts[index]!.end).toBeLessThanOrEqual(.55)
  }finally{for(const part of model.parts)part.geometry.dispose()}
})

it('Iguazu terrain avoids the previous giant coplanar vertical outer wall',async()=>{
  await preloadLandmark('iguazu-falls')
  const model=buildLandmark('iguazu-falls')!
  try{
    const rock=model.parts.filter(part=>part.stage===1)
    expect(rock.length).toBeGreaterThan(0)
    const largest=Math.max(...rock.map(part=>largestVerticalPlaneArea(part.geometry)))
    expect(largest,'the old reservoir-like outer plane measured 13.94 square model units').toBeLessThan(8)
  }finally{for(const part of model.parts)part.geometry.dispose()}
})

it('prepares real same-scope and mixed waterfall choices for the next render slot',async()=>{
  const { generateChoices }=await import('../../src/shared/choices')
  const { getLandmark }=await import('../../src/shared/landmarks')
  const { createRng }=await import('../../src/shared/rng')
  const rows=[]
  for(const id of ['nachi-falls','iguazu-falls']){
    const counterpart=id==='nachi-falls'?'iguazu-falls':'nachi-falls'
    for(const scope of [getLandmark(id)!.scope,'all' as const]){
      let chosen:ReturnType<typeof generateChoices>|undefined,seed=''
      for(let attempt=0;attempt<100;attempt++){
        seed=scope==='all'?`waterfall-${id}-all-round6-${attempt}`:`review-${id}-${scope}`
        const choices=generateChoices(createRng(seed),id,scope)
        if(scope!=='all'||choices.choiceIds.includes(counterpart)){chosen=choices;break}
      }
      expect(chosen,`${id}: mixed scope cannot offer the other modeled waterfall`).toBeDefined()
      expect(new Set(chosen!.choiceIds).size).toBe(4)
      expect(chosen!.choiceIds[chosen!.correctIndex]).toBe(id)
      if(scope!=='all')expect(chosen!.choiceIds).not.toContain(counterpart)
      rows.push({id,scope,seed,...chosen,names:chosen!.choiceIds.map(choice=>getLandmark(choice)!.name),
        portrait:`/review.html?id=${id}&scope=${scope}&seed=${seed}&p=0.55`,
        complete:`/review.html?id=${id}&scope=${scope}&seed=${seed}&p=1`,
        fixtureSelection:scope==='all'?'first actual generated seed containing both modeled waterfalls':'same seed as Round5',
        scores:{shape:null,choices:null,color:null,confusion:null,mobile:null},status:'awaiting-render-slot'})
    }
  }
  if(process.env.WRITE_WATERFALL_REVIEW==='1'){
    const {writeFileSync}=await import('node:fs')
    writeFileSync('evidence/round6-review-manifest.json',JSON.stringify(rows,null,2)+'\n')
  }
})
