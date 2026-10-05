import { expect, it } from 'vitest'
import { buildLandmark, preloadLandmark } from '../../src/client/landmarks'
import { buildSchedule } from '../../src/client/render/assembly'
import { generateChoices } from '../../src/shared/choices'
import { createRng } from '../../src/shared/rng'
import { getLandmark } from '../../src/shared/landmarks'

const ids = ['sazaedo','daisen-kofun','tojinbo','kinderdijk','pasabag','temple-of-heaven']
it('next six require finite bounded geometry and an early identifying component', async () => {
  const report = []
  for (const id of ids) {
    await preloadLandmark(id)
    const model = buildLandmark(id)!
    expect(model, id).toBeTruthy()
    try {
      let triangles = 0, height = 0, reach = 0
      for (const part of model.parts) {
        const p = part.geometry.getAttribute('position')
        triangles += (part.geometry.index?.count ?? p.count) / 3
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
          expect([x,y,z].every(Number.isFinite), `${id}: nonfinite vertex`).toBe(true)
          height = Math.max(height, y); reach = Math.max(reach, Math.hypot(x,z))
        }
      }
      expect(model.parts.length, id).toBeLessThanOrEqual(150)
      expect(triangles, id).toBeLessThanOrEqual(18000)
      expect(height, id).toBeLessThanOrEqual(6.5)
      expect(reach, id).toBeLessThanOrEqual(4.96)
      const schedule = buildSchedule(model.parts)
      const clues = model.parts.flatMap((part,index) => part.stage === 2 && part.order < 0 ? [index] : [])
      expect(clues.length, `${id}: missing early clue`).toBeGreaterThan(0)
      const latestEarlyEnd = Math.max(...clues.map(index => schedule.parts[index]!.end))
      expect(latestEarlyEnd, id).toBeLessThanOrEqual(.55)
      for (const scope of [getLandmark(id)!.scope, 'all' as const]) {
        for (let attempt=0; attempt<40; attempt++) {
          const choice = generateChoices(createRng(`round8-${id}-${scope}-${attempt}`),id,scope)
          expect(new Set(choice.choiceIds).size).toBe(4)
          expect(choice.choiceIds[choice.correctIndex]).toBe(id)
          if (scope!=='all') for (const option of choice.choiceIds) expect(getLandmark(option)!.scope).toBe(scope)
        }
      }
      report.push({id,parts:model.parts.length,triangles,height,reach,latestEarlyEnd,visualStatus:'awaiting-render-slot'})
    } finally { for (const part of model.parts) part.geometry.dispose() }
  }
  if (process.env.WRITE_NEXT_SIX === '1') {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(process.env.NEXT_SIX_REPORT ?? 'evidence/round8-six-budgets.json', JSON.stringify(report,null,2)+'\n')
  }
})
