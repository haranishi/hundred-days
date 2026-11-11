import { test, expect } from 'vitest';
import { constantsFor, validateMeta, cellToWorld, worldToCell } from '../../src/world/format.js';
test('cell centers and constants share the documented coordinates', () => {
  const c = constantsFor(false);
  expect(c.grid).toBe(2048); expect(c.cell).toBe(2);
  expect(cellToWorld(0,c)).toBe(-2047);
  expect(worldToCell(cellToWorld(1024,c),c)).toBe(1024);
  expect(constantsFor(true).cell).toBe(8);
});
test('invalid metadata always explains how to regenerate', () => {
  for (const meta of [{}, {version:2}, null, {version:1,size:6144,grid:512}]) {
    expect(() => validateMeta(meta)).toThrow(/npm run worldgen/);
  }
});
