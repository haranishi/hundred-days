import { expect, it } from 'vitest'
import { buildLandmark, preloadLandmark } from '../../src/client/landmarks'
import { buildSchedule } from '../../src/client/render/assembly'

it('reviewed missing early clues now finish by 55% instead of waiting for reveal',async()=>{
  for(const id of ['amanohashidate','delicate-arch','iguazu-falls','nachi-falls','aogashima','naruto-whirlpools','petra','borobudur','gonbad-e-qabus']){
    await preloadLandmark(id)
    const model=buildLandmark(id)!
    try{
      const early=model.parts.map((part,index)=>({part,index})).filter(({part})=>part.stage===2&&part.order<0)
      expect(early.length,`${id}: requires an early identifying component`).toBeGreaterThan(0)
      const schedule=buildSchedule(model.parts)
      for(const {index} of early)expect(schedule.parts[index]!.end,`${id}: clue still arrives too late`).toBeLessThanOrEqual(.55)
    }finally{for(const part of model.parts)part.geometry.dispose()}
  }
})
