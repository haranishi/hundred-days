import {test,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {makeShape} from '../../tools/worldgen/lib/shape.js';
import {erodeTerrain} from '../../tools/worldgen/lib/erosion.js';
import {rawStats} from '../../tools/worldgen/lib/stats.js';
const hash=a=>createHash('sha256').update(new Uint8Array(a.buffer)).digest('hex');
test('stream power erosion and repose smoothing are deterministic, pure, and alter drainage',()=>{
  const c={grid:128,cell:48,size:6144},a=makeShape(c,'rain'),original=hash(a),b=erodeTerrain(a,c,'rain',{iterations:8}),other=erodeTerrain(a,c,'rain',{iterations:8});
  expect(hash(a)).toBe(original);expect(hash(b)).toBe(hash(other));expect(hash(b)).not.toBe(original);
  const before=rawStats(a,c),after=rawStats(b,c);
  expect(after.channelSamples).not.toBe(before.channelSamples);
  expect(after.mean).not.toBe(before.mean);
  expect(Math.abs(after.mean-before.mean)).toBeLessThan(20);
});
