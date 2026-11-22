// 8種の「本物の解剖 × 手順」の統合試験。親の担当。手順が実際の体の線・点で最後まで通ることを確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES_IDS, ALL_PIECE_IDS } from '../../lib/contract.js';
import { getSpecies } from '../../lib/species/index.js';
import { getProcedure } from '../../lib/procedures/index.js';
import { createAnatomy } from '../../lib/anatomy.js';
import { createProcedure, stateAt, stepCount } from '../../lib/timeline.js';

const finite = (v, path = '') => {
  if (typeof v === 'number') assert.ok(Number.isFinite(v), `有限でない値 ${path}`);
  else if (Array.isArray(v)) v.forEach((x, i) => finite(x, `${path}[${i}]`));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) finite(x, `${path}.${k}`);
};

for (const id of SPECIES_IDS) {
  test(`${id}: 本物の解剖で全手順・全時点の状態が有限で、同じ引数なら同じ結果になる`, () => {
    const species = getSpecies(id), raw = getProcedure(id);
    assert.ok(species && raw, `${id} の魚と手順が登録されている`);
    const anatomy = createAnatomy(species, { segments: 28 });
    const proc = createProcedure(raw, anatomy);
    assert.ok(stepCount(proc) >= 10 && stepCount(proc) <= 16, `${id} の手順数 ${stepCount(proc)}`);
    for (let i = 0; i < stepCount(proc); i++) {
      for (const u of [0, 0.2, 0.5, 0.8, 1]) {
        const a = stateAt(proc, i, u), b = stateAt(proc, i, u);
        finite(a, `${id}#${i}@${u}`);
        assert.deepEqual(a, b);
        if (a.knife) assert.ok(a.knife.pos.every(Number.isFinite) && a.knife.quat.every(Number.isFinite), `${id}#${i}@${u} の包丁`);
      }
    }
  });

  test(`${id}: 手順が使う部品が、実際に作れる部品の中にある`, () => {
    const raw = getProcedure(id);
    const used = new Set(raw.steps.flatMap((s) => (s.moves || []).map((m) => m.piece)));
    for (const piece of used) assert.ok(ALL_PIECE_IDS.includes(piece), `${id}: ${piece}`);
  });
}
