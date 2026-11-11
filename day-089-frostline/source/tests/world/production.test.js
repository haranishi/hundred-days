import {test,expect} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import {FILES,validateMeta} from '../../src/world/format.js';
import {sha256} from '../../tools/worldgen/generate.mjs';
const exists=existsSync('public/world/world.json');
(exists?test:test.skip)('delivered v2 binary hashes and map dimensions agree; full 2m physics is verify-valley',()=>{
  const meta=JSON.parse(readFileSync('public/world/world.json'));validateMeta(meta);
  expect(meta.grid).toBe(2048);expect(meta.cell).toBe(2);expect(meta.drops.length).toBe(18);
  for(const file of Object.values(FILES))expect(sha256(readFileSync('public/world/'+file))).toBe(meta.hashes[file]);
  const map=readFileSync('public/world/map.png');expect(map.readUInt32BE(16)).toBe(1024);expect(map.readUInt32BE(20)).toBe(1024);
  // Acceptance must stay visibly false when a measured mandatory condition fails.
  const stats=JSON.parse(readFileSync('.agent-harness/runs/worldgen/i15c/final/stats.json'));
  for(const key of ['placement','summit','piste','lake','foundations','bridgeBanks','surroundings','views','dropRides','stationRoutes','reserved'])expect(typeof stats.checks[key]).toBe('boolean');
  expect(stats.pass).toBe(Object.values(stats.checks).every(Boolean));
});
