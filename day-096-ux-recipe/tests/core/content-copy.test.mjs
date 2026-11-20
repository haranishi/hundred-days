import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_TYPES, GOALS, STAGES, STAGE_NOTE, countChars } from '../../lib/contract.js';
import { BLOCK_INFO, makeBlock } from '../../lib/blocks.js';
import { buildFromRecipe } from '../../lib/recipes.js';
import { diagnose } from '../../lib/rules.js';
import { MINIMAL, STRESS } from '../fixtures/states.js';

const forbidden = /\d\s*(?:%|倍|割|秒)|世界初|他にない|必ず|確実|違法|法律|絶対/u;
const singleSentence = /^[^。！？!?]+。$/u;
const guide = 'このアプリの目安です（調査で決まった基準ではありません）。';

test('19種の役割・置き場所・迷いやすい点は、それぞれ60字以内の一文', () => {
  assert.deepEqual(Object.keys(BLOCK_INFO).sort(), [...BLOCK_TYPES].sort());
  for (const type of BLOCK_TYPES) {
    const info = BLOCK_INFO[type];
    assert.deepEqual(Object.keys(info).sort(), ['mistake', 'place', 'role']);
    for (const text of Object.values(info)) {
      assert.ok(countChars(text) <= 60, text);
      assert.match(text, singleSentence);
      assert.doesNotMatch(text.normalize('NFKC'), forbidden);
    }
  }
});

test('理由・補足に未確認の言い切りがなく、全15項目から確度つきの出典をたどれる', () => {
  const full = { ...MINIMAL, blocks: Array.from({ length: 18 }, (_, i) => makeBlock('reserve', 'hero', `b${i + 1}`)) };
  const twelve = buildFromRecipe('buy');
  twelve.blocks = ['hero', 'benefits', 'compare', 'voices', 'menu', 'guarantee', 'proof', 'story', 'team', 'steps', 'cta', 'footer']
    .map((type, i) => makeBlock('buy', type, `b${i + 1}`));
  const cases = [...GOALS.map(buildFromRecipe), MINIMAL, STRESS, full, twelve, { ...MINIMAL, blocks: [] }];
  const ids = new Set();
  for (const state of cases) {
    for (const item of diagnose(state).items) {
      ids.add(item.id);
      assert.match(item.title, /がある$/u);
      assert.match(item.why, singleSentence);
      for (const text of [item.why, item.note ?? '']) assert.doesNotMatch(text.normalize('NFKC'), forbidden);
      assert.ok(item.sources.length > 0, item.id);
      for (const entry of item.sources) {
        assert.ok(entry.label.trim(), item.id);
        assert.match(entry.url, /^https:\/\//u);
        assert.equal(new URL(entry.url).protocol, 'https:');
        assert.ok(['確認済み', '一部確認', '独自の整理'].includes(entry.confidence));
      }
      if (['hero-title-short', 'form-short', 'not-too-long'].includes(item.id)) assert.ok(item.note.includes(guide), item.id);
      if (item.id === 'flow-complete') {
        assert.match(item.note, /このアプリ独自の整理/u);
        assert.ok(item.sources.some(entry => entry.confidence === '独自の整理'));
      }
    }
  }
  assert.equal(ids.size, 15);
  for (const [present, block] of [['notice', MINIMAL.blocks[0]], ['relief', MINIMAL.blocks[1]]]) {
    const missing = diagnose({ ...MINIMAL, blocks: [block] }).items.find(item => item.id === 'flow-complete');
    for (const stage of STAGES) assert.equal(missing.note.includes(STAGE_NOTE[stage]), stage !== present, stage);
  }
});

test('調査の確度を配置の一般論に広げず、数値の目安は補足で示す', () => {
  const items = diagnose(buildFromRecipe('reserve')).items;
  for (const id of ['hero-first', 'action-reachable-again', 'faq-before-last-action', 'no-adjacent-same', 'not-too-long']) {
    assert.ok(items.find(i => i.id === id).sources.every(s => s.confidence === '一部確認'), id);
  }
  for (const [id, threshold] of [['hero-title-short', '28字'], ['form-short', '4項目'], ['not-too-long', '12部品']]) {
    const item = items.find(i => i.id === id);
    assert.ok(item.note.includes(threshold));
    assert.doesNotMatch(item.why + item.title, /[0-9０-９]/u);
  }
});
