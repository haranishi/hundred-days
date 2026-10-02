import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../lib/segment.js';
import { buildPlan } from '../lib/plan.js';
import { renderTemplates, printHtml } from '../lib/template.js';
import { catFace } from './_img.mjs';

const analysis = analyze(catFace());
const plan = buildPlan(analysis, { box: 'adult' });
const templates = renderTemplates(plan, analysis);

test('型紙の widthMm・heightMm はキャラの実寸と同じ', () => {
  for (const t of templates) {
    assert.equal(t.widthMm, plan.charMm.w);
    assert.equal(t.heightMm, plan.charMm.h);
  }
});

test('SVG は mm 指定で、1単位が1mm。どの枠にも10mmの確認枠と「1cm」がある', () => {
  for (const t of templates) {
    const [, w, h, vw, vh] = t.svg.match(/width="([\d.]+)mm" height="([\d.]+)mm" viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    assert.equal(w, vw);
    assert.equal(h, vh);
    assert.ok(Number(w) > plan.charMm.w);
    assert.match(t.svg, /data-check="1cm" x="[\d.]+" y="[\d.]+" width="10" height="10"/);
    assert.match(t.svg, />1cm</);
  }
});

test('1枚目がご飯の形で、土台以外の食材ごとに1枚ずつ', () => {
  assert.equal(templates[0].key, 'base');
  assert.equal(templates.length, 1 + plan.groups.length);
  assert.deepEqual(templates.slice(1).map((t) => t.key), plan.groups.map((g) => g.food));
  const html = printHtml(plan, templates);
  assert.equal(html.match(/<svg /g).length, templates.length);
  assert.match(html, /前の晩/);
});
