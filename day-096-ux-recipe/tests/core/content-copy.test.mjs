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

test('部品の説明は迷いや取り違えの可能性を伝え、来た人の行動を言い切らない', () => {
  for (const type of ['steps', 'team', 'form']) {
    assert.match(BLOCK_INFO[type].mistake, /迷いやすくなります。$/u, type);
  }
  assert.match(BLOCK_INFO.limited.mistake, /実際の空きと取り違えられやすくなります。$/u);
  for (const [type, info] of Object.entries(BLOCK_INFO)) {
    for (const text of Object.values(info)) {
      assert.doesNotMatch(text, /迷います|取り違えます|誰でも|だれでも|すべて|必ず/u, type);
    }
    assert.doesNotMatch(info.mistake, /見えません|伝わりません|わからなくなります|見比べられません|見当がつきません|抱えたまま移動します/u, type);
  }
});

test('全15項目の理由・補足に未確認の言い切りがなく、出典がある項目だけにリンクがある', () => {
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
        assert.ok(['確認済み', '一部確認', '独自の整理'].includes(entry.confidence));
        // 独自の基準に別の話題の資料を添えると、資料が基準を支えているように見えてしまう。
        if (entry.confidence === '独自の整理') assert.equal(entry.url, undefined, item.id);
        else {
          assert.match(entry.url, /^https:\/\//u);
          assert.equal(new URL(entry.url).protocol, 'https:');
        }
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
  for (const [id, confidence] of [
    ['hero-first', '一部確認'], ['action-reachable-again', '一部確認'], ['faq-before-last-action', '一部確認'],
    ['no-adjacent-same', '独自の整理'], ['not-too-long', '独自の整理'],
  ]) {
    assert.deepEqual(new Set(items.find(i => i.id === id).sources.map(s => s.confidence)), new Set([confidence]), id);
  }
  assert.match(items.find(i => i.id === 'no-adjacent-same').note, /同じ形式を続けるのが向く場面/u);
  for (const [id, threshold] of [['hero-title-short', '28字'], ['form-short', '4項目'], ['not-too-long', '12部品']]) {
    const item = items.find(i => i.id === id);
    assert.ok(item.note.includes(threshold));
    assert.doesNotMatch(item.why + item.title, /[0-9０-９]/u);
  }
});
