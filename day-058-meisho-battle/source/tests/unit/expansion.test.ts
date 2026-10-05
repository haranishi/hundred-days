import { describe, expect, it } from 'vitest'
import { EXPANSION_DESIGN, EXPANSION_FACTS } from '../../src/shared/expansion-catalog'
import { generateChoices } from '../../src/shared/choices'
import { createRng } from '../../src/shared/rng'
import { MODELED_LANDMARK_IDS } from '../../src/shared/landmarks'
describe('expansion admission', () => {
  it('every admitted model has dated sources, facts and distinctive distractors', () => {
    for (const row of EXPANSION_DESIGN) {
      expect(MODELED_LANDMARK_IDS).toContain(row.id)
      const fact = EXPANSION_FACTS[row.id]!
      expect(fact.factSources.length).toBeGreaterThan(0)
      for (const source of fact.factSources) expect(source.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect([...fact.fact].length).toBeLessThanOrEqual(40)
      for (let seed=0; seed<40; seed++) {
        const choice=generateChoices(createRng(seed),row.id,row.scope)
        expect(new Set(choice.choiceIds).size).toBe(4)
        expect(choice.choiceIds[choice.correctIndex]).toBe(row.id)
      }
    }
  })
})
