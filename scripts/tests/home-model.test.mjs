import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { fold, tagKey, splitTitle, TAG_ALIASES, tagCatalog, quickTags, buildMatrix, phaseOf, PHASES, RULES } from '../lib/home-model.mjs';

test('fold は全角・半角・大小・カナを同じ検索文字列へ畳み、単独でも動く', () => {
  for (const input of ['Ｄａｙ３４ カタカナ', 'Day34 ｶﾀｶﾅ', 'day34 かたかな']) {
    assert.equal(fold(input), 'day34 かたかな');
  }
  assert.equal(fold('ガラス　ＡＰＰ'), 'がらす app');
  assert.equal(fold(null), '');
  const standalone = runInNewContext(`(${fold.toString()})`);
  assert.equal(standalone('ＷＥＢ ｶﾞﾗｽ'), 'web がらす');
});

test('タグは記号と空白を無視して統合し、同じDayでは重複して数えない', () => {
  assert.equal(tagKey('3D'), tagKey('３ｄ'));
  assert.equal(tagKey('Web Audio'), tagKey('web-audio'));
  assert.deepEqual(tagCatalog([{ tags: ['Web Audio', 'web-audio'] }, { tags: ['WEB AUDIO'] }]),
    [{ key: 'webaudio', label: 'Web Audio', count: 2 }]);
});

test('表記が割れたタグは、いちばん多く使われた綴りで見せる', () => {
  const apps = [{ tags: ['Canvas'] }, { tags: ['canvas'] }, { tags: ['canvas', 'CANVAS'] }, { tags: ['3d'] }, { tags: ['3D'] }];
  assert.deepEqual(tagCatalog(apps).map(({ key, label, count }) => [key, label, count]), [['canvas', 'canvas', 3], ['3d', '3d', 2]]);
});

test('quickTags は占有率40%ちょうどを含め、超えるタグを除き、上位12個までにする', () => {
  const apps = Array.from({ length: 5 }, (_, i) => ({ tags: [
    'vanilla-js', ...(i < 2 ? ['Web Audio'] : []), ...(i === 0 ? ['web-audio'] : []),
    ...Array.from({ length: 15 }, (_, n) => i === 0 ? `tag-${n}` : '').filter(Boolean)
  ] }));
  const tags = quickTags(apps);
  assert.equal(tags.length, 12);
  assert.equal(tags[0].key, 'webaudio');
  assert.equal(tags[0].count, 2);
  assert.ok(!tags.some((tag) => tag.key === 'vanillajs'));
  assert.deepEqual(quickTags([]), []);
});

test('マップは100以上の10の倍数で、欠番・記録のみ・外部公開を区別する', () => {
  const matrix = buildMatrix([
    { day: 1, published: true }, { day: 3, published: false },
    { day: 4, externalUrl: 'https://example.com' }, { day: 103, published: true }
  ]);
  assert.equal(matrix.length, 110);
  assert.equal(matrix[0].state, 'released');
  assert.equal(matrix[1].state, 'future');
  assert.equal(matrix[2].state, 'record');
  assert.equal(matrix[3].state, 'released');
  assert.equal(matrix[102].day, 103);
  assert.equal(buildMatrix([]).length, 100);
  assert.equal(buildMatrix([{ day: 100, published: true }]).length, 100);
});

test('段階の境界と範囲外を区別し、ルール5項目・解禁6段階を持つ', () => {
  PHASES.forEach((phase, i) => {
    assert.equal(phaseOf(phase.from), i);
    assert.equal(phaseOf(phase.to), i);
  });
  assert.equal(phaseOf(0), -1);
  assert.equal(phaseOf(101), -1);
  assert.equal(RULES.length, 5);
  assert.equal(PHASES.length, 6);
});


test('splitTitle は最初の空白付きダッシュだけで分け、単独でも動く', () => {
  for (const split of [splitTitle, runInNewContext(`(${splitTitle.toString()})`)]) {
    // 別コンテキストのオブジェクトも値で比較する。
    for (const [input, expected] of [
      ['保安検査スワイパー — その荷物、機内？', { main: '保安検査スワイパー', sub: 'その荷物、機内？' }],
      ['題名', { main: '題名', sub: '' }],
      ['主題 — 副題 — 続き', { main: '主題', sub: '副題 — 続き' }],
      ['題名—副題', { main: '題名—副題', sub: '' }],
      [' — 副題', { main: '', sub: '副題' }],
      ['主題 — ', { main: '主題', sub: '' }],
      ['', { main: '', sub: '' }]
    ]) assert.deepEqual(JSON.parse(JSON.stringify(split(input))), expected);
  }
});

test('英語の別名を正規キーに統合し、件数をDayごとに合算して多数派の綴りを使う', () => {
  for (const [alias, label] of [
    ['game', 'ゲーム'], ['puzzle', 'パズル'], ['security', 'セキュリティ'], ['image', '画像'], ['music', '音楽']
  ]) {
    assert.equal(tagKey(alias), tagKey(label));
    assert.equal(TAG_ALIASES[alias], tagKey(label));
  }
  assert.equal(tagKey('ＧＡＭＥ'), tagKey('ゲーム'));
  const apps = [{ tags: ['game'] }, { tags: ['ゲーム'] }, { tags: ['ゲーム', 'game'] }];
  assert.deepEqual(tagCatalog(apps), [{ key: tagKey('ゲーム'), label: 'ゲーム', count: 3 }]);
  assert.deepEqual(tagCatalog([{ tags: ['game'] }, { tags: ['game'] }, { tags: ['ゲーム'] }]),
    [{ key: tagKey('ゲーム'), label: 'game', count: 3 }]);
  const quickApps = [...apps, ...Array.from({ length: 7 }, () => ({ tags: [] }))];
  assert.deepEqual(quickTags(quickApps), [{ key: tagKey('ゲーム'), label: 'ゲーム', count: 3 }]);
});

test('画面への埋め込みは別名表・fold・tagKeyの順で同じキーを返す', () => {
  const embedded = runInNewContext(`const TAG_ALIASES = ${JSON.stringify(TAG_ALIASES)};
${fold.toString()}
${tagKey.toString()}
tagKey`);
  for (const tag of ['ＧＡＭＥ', 'ゲーム', 'puzzle', 'セキュリティ', 'Web Audio', 'web-audio', '３Ｄ', 'music']) {
    assert.equal(embedded(tag), tagKey(tag));
  }
});
