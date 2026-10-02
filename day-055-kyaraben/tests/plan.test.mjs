import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../lib/segment.js';
import { buildPlan } from '../lib/plan.js';
import { catFace } from './_img.mjs';

const face = analyze(catFace(), { difficulty: 'normal' });
const layerOf = (a, family) => a.layers.find((l) => l.family === family);
const names = (plan) => plan.allergens.map((a) => a.name);

test('ねこの顔は、白が土台（ご飯）になり、黒・ピンク・オレンジ・黄がパーツになる', () => {
  const plan = buildPlan(face, { box: 'school' });
  assert.equal(plan.base.food, 'rice');
  assert.deepEqual(plan.groups.map((g) => g.food).sort(), ['cheddar', 'ham', 'nori', 'usuyaki']);
  assert.ok(plan.charMm.w <= 120.01 && plan.charMm.h <= 82.51);
  assert.ok(plan.steps.night.length >= 2 && plan.steps.morning.length >= 3);
});

test('大きい弁当箱ほどご飯が多い', () => {
  const g = ['kid', 'school', 'adult'].map((box) => buildPlan(face, { box }).riceTotalG);
  assert.ok(g[0] < g[1] && g[1] < g[2], `${g}`);
});

test('かんたんは、こだわりよりパーツが少ないか同じ', () => {
  const easy = buildPlan(analyze(catFace(), { difficulty: 'easy' }), { difficulty: 'easy' });
  const hard = buildPlan(analyze(catFace(), { difficulty: 'hard' }), { difficulty: 'hard' });
  assert.ok(easy.partCount <= hard.partCount, `${easy.partCount} / ${hard.partCount}`);
});

test('薄焼き卵で卵が出て、黄色をチーズにすると乳に変わる', () => {
  const yellow = layerOf(face, 'yellow').id;
  const orange = layerOf(face, 'orange').id;
  const pink = layerOf(face, 'pink').id;
  const plain = buildPlan(face, { overrides: { [orange]: 'carrot', [pink]: 'none' } });
  assert.ok(names(plain).includes('卵'));
  assert.ok(!names(plain).includes('乳'));
  const cheese = buildPlan(face, { overrides: { [yellow]: 'cheese', [orange]: 'carrot', [pink]: 'none' } });
  assert.ok(cheese.materials.some((m) => m.food === 'cheese'));
  assert.ok(names(cheese).includes('乳'));
  assert.ok(!cheese.materials.some((m) => m.food === 'usuyaki'));
});

test("'none' にした層は土台に溶ける", () => {
  const pink = layerOf(face, 'pink').id;
  const plan = buildPlan(face, { overrides: { [pink]: 'none' } });
  const layer = plan.layers.find((l) => l.id === pink);
  assert.equal(layer.dissolved, true);
  assert.equal(layer.parts.length, 0);
  assert.ok(!plan.materials.some((m) => m.food === 'ham'));
  assert.ok(!plan.groups.some((g) => g.food === 'ham'));
});

test('朝の手順では、のりがシートのあと・ふたの前に来る', () => {
  const keys = buildPlan(face).steps.morning.map((s) => s.key);
  assert.ok(keys.indexOf('sheets') >= 0 && keys.indexOf('nori') > keys.indexOf('sheets'), keys.join(','));
  assert.deepEqual(keys.slice(-2), ['nori', 'lid']);
});
