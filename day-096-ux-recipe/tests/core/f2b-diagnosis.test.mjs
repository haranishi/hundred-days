import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_SCHEMA, GOALS, countChars, resolveField } from '../../lib/contract.js';
import { buildStandaloneHtml } from '../../lib/export-html.js';
import { buildFromRecipe } from '../../lib/recipes.js';
import * as rules from '../../lib/rules.js';
import { MINIMAL, block } from '../fixtures/states.js';

test('先頭の見出しが空欄か空白だけなら、該当部品と書き込む欄を知らせる', () => {
  const label = BLOCK_SCHEMA.hero.label;
  const titleLabel = resolveField('hero', ['title']).label;
  for (const title of ['', ' 　', '　相談会の予約　']) {
    const state = { ...MINIMAL, blocks: [block('first', 'hero', 0, { title })] };
    const item = rules.diagnose(state).items.find(i => i.id === 'hero-first');
    const html = buildStandaloneHtml(state);
    const heading = html.match(/<h1\b[^>]*>([^<]*)<\/h1>/u);
    if (title === '') assert.equal(heading, null);
    assert.equal(item.ok, Boolean(title.trim()));
    assert.equal(item.ok, Boolean(heading?.[1].trim()));
    if (!item.ok) {
      assert.equal(item.blockId, 'first');
      assert.ok(item.note.includes(`${label}の「${titleLabel}」が空です。`));
      assert.equal(item.fix, undefined);
    }
  }
});

test('部品をすべて外すと採点項目も見本も0件で、5段階すべてが未達になる', () => {
  const state = { ...MINIMAL, blocks: [] };
  const stages = rules.stageCoverage(state);
  assert.equal(stages.length, 5);
  assert.ok(stages.every(stage => !stage.ok && stage.count === 0));
  assert.deepEqual(rules.diagnose(state), {
    score: 0, passed: 0, total: 0, items: [], stages, empty: true, samples: { count: 0, blockIds: [] },
  });
  assert.ok(!rules.diagnose(MINIMAL).empty);
});

test('目的の見本と一致する文章を、行や欄がいくつあっても部品ごとにページ順で数える', () => {
  const buy = buildFromRecipe('buy');
  const question = buy.blocks.find(b => b.type === 'faq').props.items[0];
  const blocks = [
    block('second', 'faq', 0, { items: [question, question] }),
    block('custom', 'story', 0, { text: '私の質問：' + question.q }),
    block('first', 'hero', 1, { lead: question.a }),
  ];
  const state = { ...buy, blocks };
  const report = rules.diagnose(state);
  assert.deepEqual(report.samples, { count: 2, blockIds: ['second', 'first'] });
  const hint = report.items.find(item => item.id === 'replace-samples');
  assert.equal(hint.ok, false);
  assert.equal(hint.blockId, 'second');
  const other = rules.diagnose({ ...state, goal: 'reserve' });
  assert.deepEqual(other.samples, { count: 0, blockIds: [] });
  assert.equal(other.items.find(item => item.id === 'replace-samples').ok, true);
  for (const goal of GOALS) {
    const sample = buildFromRecipe(goal);
    assert.deepEqual(rules.diagnose(sample).samples, { count: sample.blocks.length, blockIds: sample.blocks.map(b => b.id) });
  }
});

test('全診断の出典につく3種類の印に、それぞれ40字以内の説明がある', () => {
  const keys = ['確認済み', '一部確認', '独自の整理'];
  assert.deepEqual(Object.keys(rules.CONFIDENCE_NOTE).sort(), [...keys].sort());
  for (const key of keys) {
    const note = rules.CONFIDENCE_NOTE[key];
    assert.ok(note.trim() && countChars(note) <= 40, key);
    assert.match(note, /出典/u);
  }
  const seen = new Set();
  for (const goal of GOALS) {
    for (const item of rules.diagnose(buildFromRecipe(goal)).items) {
      seen.add(item.id);
      for (const entry of item.sources) assert.ok(Object.hasOwn(rules.CONFIDENCE_NOTE, entry.confidence), item.id);
    }
  }
  assert.equal(seen.size, 15);
});
