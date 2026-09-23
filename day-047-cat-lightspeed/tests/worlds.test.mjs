import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldAt,bulletinAt } from '../lib/worlds.js';
for(const [v,before,after] of [[100,'farm','city'],[1000,'city','sky'],[10000,'sky','orbit'],[100000,'orbit','solar'],[1000000,'solar','interstellar']])test(`世界の境界${v}`,()=>{assert.equal(worldAt(v-.001).id,before);assert.equal(worldAt(v).id,after);assert.equal(worldAt(v+.001).id,after);});
test('停止は牧場、終端は星間、速報が変わる',()=>{assert.equal(worldAt(0).id,'farm');assert.equal(worldAt(1e9).id,'interstellar');assert.match(bulletinAt(692000),/最速/);assert.match(bulletinAt(1e9),/宇宙/);});
