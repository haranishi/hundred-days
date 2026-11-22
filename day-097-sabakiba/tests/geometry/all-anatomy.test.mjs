import test from 'node:test';
import assert from 'node:assert/strict';
import { ANCHOR_NAMES, CURVE_INFO, SPECIES_IDS, validateSpecies } from '../../lib/contract.js';
import { createAnatomy } from '../../lib/anatomy.js';
import { SPECIES, getSpecies } from '../../lib/species/index.js';
import { SPECIES_META } from '../../lib/species/meta.js';

const patterns = ['opercleSpot', 'flankSpots', 'wavyStripes', 'lateralBand', 'blueSpots', 'flatSpots', 'sandyMottle', 'bellyStripes'];
const backwards = new Set(['scaleSweep', 'scuteRow', 'bellySlit', 'skinPeel']);
const near = (x, y, tolerance = 1e-7) => assert.ok(Math.abs(x - y) <= tolerance, `${x} ≠ ${y}`);

test('8種が表示データ・解剖の寸法・体色の契約を満たします', () => {
  assert.deepEqual(Object.keys(SPECIES).sort(), [...SPECIES_IDS].sort());
  for (const [i, id] of SPECIES_IDS.entries()) {
    const sp = getSpecies(id);
    assert.deepEqual(validateSpecies(sp), []);
    for (const [key, value] of Object.entries(SPECIES_META[id])) assert.deepEqual(sp[key], value);
    assert.deepEqual(sp.look.patterns, [patterns[i]]);
    assert.ok(sp.look.scale.size > 0 && sp.look.scale.gloss >= 0 && sp.look.scale.gloss <= 1);
    assert.ok(sp.cavityEnd > 0 && sp.vent > 0 && sp.vertebraDia > 0);
  }
  assert.equal(SPECIES.iwashi.scutes.count, 32);
  assert.equal(SPECIES.iwashi.pinbones.count, 0);
  const finlets = Object.values(SPECIES).filter(sp => sp.fins.finlets.dorsal || sp.fins.finlets.anal);
  assert.deepEqual(finlets.map(sp => [sp.id, sp.fins.finlets.dorsal, sp.fins.finlets.anal]),
    [['saba', 5, 5], ['sanma', 5, 5], ['katsuo', 8, 7]]);
  assert.deepEqual(Object.keys(SPECIES).filter(id => SPECIES[id].scutes), ['aji', 'iwashi']);
  assert.deepEqual(Object.keys(SPECIES).filter(id => !SPECIES[id].swimBladder).sort(), ['hirame', 'katsuo', 'sanma']);
});

function checkAnatomy(sp, segments) {
  const a = createAnatomy(sp, {segments}), shape = sp.shape;
  near(a.SL * shape.TL_over_SL, a.TL);
  near(a.point('tailTip')[0], a.TL);
  near(a.point('peduncle')[0], a.SL);
  near(a.point('eye')[0] / a.SL, shape.eyePos / 100);
  const depth = [], width = [];
  for (let i = 0; i <= 1000; i++) {
    const p = a.profile(i / 1000);
    depth.push((p.top + p.bottom) / a.SL);
    width.push(2 * p.half / a.SL);
  }
  near(Math.max(...depth), shape.maxDepth / 100, 1e-5);
  near(Math.max(...width), shape.maxWidth / 100, 1e-5);
  near(depth.indexOf(Math.max(...depth)) / 1000, shape.maxDepthPos / 100, 0.03);
  for (const outline of [depth, width]) {
    const peak = outline.indexOf(Math.max(...outline));
    assert.ok(outline.every((v, i) => !i || (v - outline[i-1]) * (i <= peak ? 1 : -1) >= -1e-10));
  }
  for (const name of ANCHOR_NAMES) assert.ok(a.inside(a.point(name)), name);
  for (const [name, info] of Object.entries(CURVE_INFO)) {
    for (const side of info.sides ? ['L', 'R'] : [null]) {
      const {points, onSurface} = a.curve(name, side);
      assert.equal(onSurface, !info.inner);
      let length = 0;
      for (const [i, p] of points.entries()) {
        assert.ok(a.inside(p), name);
        if (i) length += Math.hypot(...p.map((x, k) => x - points[i-1][k]));
        if (side) assert.ok(p[2] * (side === 'L' ? 1 : -1) >= -1e-8, name);
        const pr = a.profile(p[0] / a.SL), h = p[1] - pr.axisY, n = h < 0 ? pr.nBottom : pr.nTop;
        const level = (Math.abs(h) / (h < 0 ? pr.bottom : pr.top)) ** n + (Math.abs(p[2]) / pr.half) ** n;
        if (onSurface) near(level, 1);
        else assert.ok(level < 1, name);
      }
      assert.equal(points.length, Math.max(32, segments));
      assert.ok(length > 0.1, name);
      const first = points[0], last = points.at(-1);
      if (name === 'headCut' || name === 'tailCut') assert.ok(first[1] > last[1], name);
      else assert.ok((last[0] - first[0]) * (backwards.has(name) ? -1 : 1) > 0, name);
    }
  }
  for (let i = -10; i <= 10; i++) {
    const ray = a.caudalRay(i / 10);
    for (const u of [0, 0.5, 1]) assert.ok(a.inside(ray.root.map((x, j) => x + u * (ray.tip[j] - x))));
  }
}

for (const sp of Object.values(SPECIES)) {
  for (const [quality, segments] of [['light', 28], ['standard', 44], ['high', 64]]) {
    test(`${sp.name}・${quality}の全長、最大断面、目印、左右のカーブが体の輪郭と一致します`,
      () => checkAnatomy(sp, segments));
  }
}

test('サンマの細さと下あご、タイの額、キスの小さい下向きの口を区別できます', () => {
  const round = Object.values(SPECIES).filter(sp => sp.family === 'round');
  assert.equal(Math.max(...round.map(sp => sp.shape.maxDepth)), SPECIES.tai.shape.maxDepth);
  assert.equal(Math.min(...Object.values(SPECIES).map(sp => sp.shape.maxDepth)), SPECIES.sanma.shape.maxDepth);
  const sanma = createAnatomy(SPECIES.sanma), atLip = sanma.point('mouth')[0] / sanma.SL;
  assert.ok(atLip > 0.02);
  const jaw = sanma.profile(atLip), forehead = sanma.profile(3 * atLip);
  assert.ok(jaw.top < jaw.bottom / 2 && jaw.half < forehead.half / 2);
  const tai = createAnatomy(SPECIES.tai), saba = createAnatomy(SPECIES.saba);
  assert.ok(tai.surface(0.08, Math.PI / 2).n[0] < saba.surface(0.08, Math.PI / 2).n[0]);
  assert.equal(saba.point('mouth')[1], 0);
  assert.ok(createAnatomy(SPECIES.kisu).point('mouth')[1] < 0);
  assert.ok(SPECIES.kisu.shape.mouthLength < SPECIES.saba.shape.mouthLength);
});

test('ヒラメは幅が体高の4分の1未満で、左右の側線が胸ビレの上で弧を描きます', () => {
  const sp = SPECIES.hirame, a = createAnatomy(sp);
  const maxWidth = Math.max(...Array.from({length: 501}, (_, i) => a.profile(i / 500).half * 2));
  const pr = a.profile(sp.shape.maxDepthPos / 100);
  assert.ok(maxWidth / (pr.top + pr.bottom) < 0.25);
  for (const side of ['L', 'R']) {
    const heights = a.curve('lateralLine', side).points.map(([x, y]) => [x / a.SL, y / a.profile(x / a.SL).top]);
    const peak = heights.reduce((a, b) => a[1] > b[1] ? a : b);
    assert.ok(peak[0] > 0.28 && peak[0] < 0.48 && peak[1] > 0.55);
    assert.ok(heights.filter(([s]) => s >= 0.48).every(([, h]) => Math.abs(h - 0.15) < 1e-7));
  }
  near(a.cavityEnd, 0.28);
  assert.ok(a.cavityEnd - a.head < 0.06);
});
