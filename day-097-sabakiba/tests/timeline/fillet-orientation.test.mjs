// 手順の「置き方」に「皮を下」「皮を上」と書いてあるとき、見えている片身の皮が、本当にその向きになっているかを調べる。
// 片身は動かした手順の姿勢に固定されるので（pose-lock）、手順データの回転指定が、その固定後の向きに合っていないと、
// 文と絵が食い違う（アジの腹骨の手順で、片方の身だけ皮が上を向いたまま、など）。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.js';
import { createFishDisplay } from '../../lib/scene-fish.js';
import { buildFishModel } from '../../lib/pieces.js';
import { getSpecies } from '../../lib/species/index.js';
import { getProcedure } from '../../lib/procedures/index.js';
import { stateAt } from '../../lib/timeline.js';
import { SPECIES_IDS } from '../../lib/contract.js';

const FILLETS = ['R.dorsal', 'L.dorsal', 'R.ventral', 'L.ventral'];

/** 置き方の文から、皮の向きの宣言を取り出す。宣言がなければ null。 */
export function skinClaim(place) {
  if (/皮(?:を|が)下/u.test(place)) return 'down';
  if (/皮(?:を|が)上/u.test(place)) return 'up';
  return null;
}

test('skinClaim は「皮を下」「皮が下」「皮を上」を拾い、ほかは拾わない', () => {
  assert.equal(skinClaim('皮を下にし、腹の縁を手前に置きます。'), 'down');
  assert.equal(skinClaim('四枚の身を皮が下になるよう並べます。'), 'down');
  assert.equal(skinClaim('皮を上にし、頭の切り口を{L}にそろえます。'), 'up');
  assert.equal(skinClaim('開いた身を上に、頭側を{R}に置きます。'), null);
  assert.equal(skinClaim('黒い面を上に、頭側を{L}、腹を手前に置きます。'), null);
});

for (const id of SPECIES_IDS) {
  test(`${id}: 「皮を下／上」と書いた手順で、見えている片身の皮がそのとおりに向く`, t => {
    const raw = getProcedure(id);
    const display = createFishDisplay(buildFishModel(getSpecies(id), { quality: 'light' }), raw);
    t.after(() => display.dispose());
    const normal = new THREE.Vector3();
    const problems = [];
    raw.steps.forEach((step, index) => {
      const claim = skinClaim(step.place);
      if (!claim) return;
      for (const u of [0.55, 1]) {
        const state = stateAt(display.proc, index, u);
        display.apply(state, step, false, null);
        display.group.updateMatrixWorld(true);
        for (const piece of FILLETS) {
          const own = state.pieces[piece];
          if (!own || own.visible === false || own.opacity <= 0 || !display.model.pieces[piece]) continue;
          // 片身の皮の外向きは、右の身が局所の -z、左の身が +z（魚の左体側が +z）。
          normal.set(0, 0, piece.startsWith('R.') ? -1 : 1).transformDirection(display.pose.matrixFor(piece));
          const up = normal.y > 0.35, down = normal.y < -0.35;
          if (claim === 'down' ? !down : !up) {
            problems.push(`手順${index + 1}(${step.id}) u=${u} ${piece}: 文は「皮を${claim === 'down' ? '下' : '上'}」だが、皮の向きの上向き成分=${normal.y.toFixed(2)}`);
          }
        }
      }
    });
    assert.deepEqual(problems, []);
  });
}
