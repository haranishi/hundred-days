import test from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES, getSpecies } from '../../lib/species/index.js';
import { SPECIES_META } from '../../lib/species/meta.js';
import { validateSpecies } from '../../lib/contract.js';
import { createAnatomy } from '../../lib/anatomy.js';

test('アジの登録値は既存の表示情報を引き継ぎ、形と色の契約を満たします', () => {
  const sp = getSpecies('aji');
  assert.equal(sp, SPECIES.aji);
  assert.deepEqual(validateSpecies(sp), []);
  for (const [key, value] of Object.entries(SPECIES_META.aji)) assert.deepEqual(sp[key], value);
  assert.equal(getSpecies('未登録'), null);
  assert.equal(getSpecies('__proto__'), null);
  const a = createAnatomy(sp);
  assert.equal(a.SL, 21 / 1.16);
  assert.equal(a.TL, 21);
  assert.equal(a.cavityEnd, 0.49);
  assert.equal(a.vent, 0.5);
  assert.ok(Math.abs(a.spineRadius(0.4) - a.SL * 0.251 * 0.06 / 2) < 1e-12);
  assert.deepEqual(sp.vertebrae, {pre:10, caudal:14});
  assert.equal(sp.scutes.count, 71);
  assert.equal(sp.look.flesh, 'pink');
});
