import { it, expect } from 'vitest'
import { buildModel, REACH_LIMIT } from '../../src/client/landmarks/kit'
import { build as kobe } from '../../src/client/landmarks/kobe-port-tower'
import { build as tsutenkaku } from '../../src/client/landmarks/tsutenkaku'
import { build as naruto } from '../../src/client/landmarks/naruto-whirlpools'
import { build as nachi } from '../../src/client/landmarks/nachi-falls'
import { build as aogashima } from '../../src/client/landmarks/aogashima'
import { build as megane } from '../../src/client/landmarks/megane-bridge'
for (const [id, build] of Object.entries({kobe,tsutenkaku,naruto,nachi,aogashima,megane})) it(id, () => {
 const m=buildModel(id,build)
 console.log(id, {parts:m.parts.length,triangles:m.triangles,height:m.height,reach:Math.max(...m.parts.map(p=>p.reach)),warnings:m.warnings})
 expect(m.warnings).toEqual([])
 expect(m.parts.length).toBeLessThanOrEqual(350)
 expect(m.triangles).toBeLessThanOrEqual(60000)
 expect(m.height).toBeLessThanOrEqual(6.5)
 expect([...new Set(m.parts.map(p=>p.stage))].sort()).toEqual([1,2,3,4])
 for(const p of m.parts) {expect(p.reach).toBeLessThanOrEqual(REACH_LIMIT);expect(p.minY).toBeGreaterThanOrEqual(-0.12)}
 m.parts.forEach(p=>p.geometry.dispose())
})
