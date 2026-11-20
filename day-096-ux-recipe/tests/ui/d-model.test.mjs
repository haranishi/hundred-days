import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_SCHEMA, BLOCK_TYPES, DEVICES, GOALS, MAX_SLOTS, exportFileName, getPath, resolveField } from '../../lib/contract.js';
import { viewUrl } from '../../lib/codec.js';
import { pngDimensions } from '../../lib/png-export.js';
import { suggestionsFor } from '../../lib/recipes.js';
import { diagnosisModel } from '../../lib/ui-diagnosis.js';
import { counter, formModel, listControls } from '../../lib/ui-form-model.js';
import { shareLinks } from '../../lib/ui-share.js';
import { slotListModel } from '../../lib/ui-slots.js';
import { MINIMAL, block, emptyProps, maxProps } from '../fixtures/states.js';

test('全種類の最小・最大の入力欄がスキーマの順に並び、入れ子も同じパスで編集できる', () => {
  assert.deepEqual(formModel(null, 'reserve'), []);
  for (const type of BLOCK_TYPES) {
    for (const makeProps of [emptyProps, maxProps]) {
      const sample = block('b1', type, 0, makeProps(type));
      function check(fields, schema) {
        assert.deepEqual(fields.map((field) => field.label), schema.map((field) => field.label));
        for (const field of fields) {
          const def = resolveField(type, field.path);
          assert.equal(field.kind, def.kind);
          assert.equal(field.max, def.max);
          assert.equal(field.role, def.role);
          assert.deepEqual(field.value, getPath(sample.props, field.path));
          if (def.kind === 'list') {
            assert.equal(field.min, def.min);
            assert.equal(field.items.length, field.value.length);
            field.items.forEach((row) => check(row, def.item));
          }
        }
      }
      check(formModel(sample, 'reserve'), BLOCK_SCHEMA[type].fields);
    }
  }
});

test('候補は目的と部品の項目ごとに引き、繰り返しの同名項目には混ぜない', () => {
  for (const goal of GOALS) {
    for (const [type, key] of [['hero', 'title'], ['hero', 'cta'], ['cta', 'button'], ['form', 'submit']]) {
      const field = formModel(block('b1', type, 0), goal).find((entry) => entry.path[0] === key);
      assert.deepEqual(field.suggestions, suggestionsFor(goal, type, key));
    }
  }
  const field = formModel(block('b1', 'benefits', 0), 'reserve')[1].items[0][0];
  assert.deepEqual(field.path, ['items', 0, 'title']);
  assert.deepEqual(field.suggestions, []);
});

test('絵文字も1文字として数え、上限ちょうどと超過を区別する', () => {
  assert.deepEqual(counter('🌷あ', 2), { count: 2, max: 2, over: false });
  assert.equal(counter('🌷あ。', 2).over, true);
  assert.equal(counter(null, 24).count, 0);
});

test('0件・上下限・先頭末尾で、使える一覧操作だけを返す', () => {
  assert.deepEqual(listControls(0, 0, 3, 0), { canAdd: true, canRemove: false, canMoveUp: false, canMoveDown: false });
  assert.deepEqual(listControls(2, 2, 3, 0), { canAdd: true, canRemove: false, canMoveUp: false, canMoveDown: true });
  assert.deepEqual(listControls(3, 2, 3, 2), { canAdd: false, canRemove: true, canMoveUp: true, canMoveDown: false });
  assert.deepEqual(listControls(3, 2, 3, 1), { canAdd: false, canRemove: true, canMoveUp: true, canMoveDown: true });
  assert.equal(listControls(3, 2, 3, 3).canMoveUp, false);
});

test('診断は未達だけを優先度順に並べ、達成済みの項目と根拠を保持する', () => {
  const source = { label: '根拠', url: 'https://example.com/guide', confidence: '一部確認' };
  const items = [
    { id: 'a', ok: true, level: 'must' },
    { id: 'b', ok: false, level: 'tip', note: 'このアプリの目安です。', sources: [source] },
    { id: 'c', ok: false, level: 'must' }, { id: 'd', ok: false, level: 'should' },
  ];
  const model = diagnosisModel({ score: 75, items });
  assert.equal(model.angle, 270);
  assert.deepEqual(model.groups.map((group) => group.label), ['必須', 'おすすめ', 'ヒント']);
  assert.deepEqual(model.groups.flatMap((group) => group.items), [items[2], items[3], items[1]]);
  assert.deepEqual(model.done, [items[0]]);
  assert.match(model.comment, /必須/);
  assert.equal(diagnosisModel({ score: 100, items: [items[0]] }).angle, 360);
  assert.deepEqual(diagnosisModel(null).groups, []);
  assert.equal(diagnosisModel(null).angle, 0);
});

test('共有文と投稿先の引数から、元の共有リンクを1文字も変えずに取り出せる', async () => {
  const encoded = await viewUrl(MINIMAL, 'https://example.com/100days/recipe/');
  assert.match(encoded, /#v=.+/);
  for (const url of [encoded, 'https://example.com/日本語/?a=1&b=2#v=1.a+b%25_']) {
    const model = shareLinks(url, 'buy', 84);
    assert.equal(model.url, url);
    assert.equal(model.text, 'UXレシピで「買ってもらう」のページを組み立てました（UX診断 84点）');
    const x = new URL(model.xUrl);
    const line = new URL(model.lineUrl);
    assert.equal(x.origin + x.pathname, 'https://x.com/intent/post');
    assert.equal(x.searchParams.get('text'), model.text);
    assert.equal(x.searchParams.get('url'), url);
    assert.equal(line.origin + line.pathname, 'https://social-plugins.line.me/lineit/share');
    assert.equal(line.searchParams.get('url'), url);
    assert.equal(line.hash, '');
  }
  assert.equal(shareLinks('x'.repeat(3000), 'support', 0).tooLong, false);
  assert.equal(shareLinks('x'.repeat(3001), 'support', 0).tooLong, true);
  assert.equal(shareLinks('x'.repeat(2201), 'support', 0).tooLong, false, '普通のページの長さ（約2200字）では知らせない');
});

test('書き出す幅に対して全ページの高さを切り上げ、ファイル名は目的で決まる', () => {
  for (const { width } of DEVICES) {
    assert.deepEqual(pngDimensions(width, 1000.2, 2), { width, height: 1001, pixelWidth: width * 2, pixelHeight: 2002 });
  }
  assert.equal(pngDimensions(390, 0), null);
  assert.equal(pngDimensions(-1, 20), null);
  assert.equal(pngDimensions(390, Infinity), null);
  assert.equal(pngDimensions(390, 20, 0), null);
  for (const ext of ['png', 'html']) assert.equal(exportFileName('event', ext), 'ux-recipe-event.' + ext);
});

test('保存一覧を新しい順に表示し、日時・部品数・6件の境界を区別する', () => {
  const list = [
    { id: 'old', goal: 'apply', savedAt: 100000, name: '前の案', blocks: 0 },
    { id: 'bad', goal: 'reserve', savedAt: null, name: '', blocks: 2 },
    { id: 'new', goal: 'buy', savedAt: '2026-05-01T10:30:00Z', name: '<買い物>', blocks: 8 },
  ];
  const model = slotListModel(list);
  assert.deepEqual(model.rows.map((row) => row.id), ['new', 'old', 'bad']);
  assert.equal(list[0].id, 'old');
  assert.equal(model.rows[0].goal, '買ってもらう');
  assert.equal(model.rows[0].name, '<買い物>');
  assert.equal(model.rows[0].blocks, '部品8個');
  assert.match(model.rows[0].date, /2026/);
  assert.equal(model.rows[0].iso, '2026-05-01T10:30:00.000Z');
  assert.equal(model.rows.at(-1).date, '日時不明');
  assert.equal(slotListModel([]).count, '0/6');
  assert.equal(model.full, false);
  assert.equal(slotListModel(Array(MAX_SLOTS).fill(list[0])).full, true);
});

test('保存できる日時が西暦1万年をまたいでも新しい順で表示する', () => {
  const slots = [10_000, 9_999, 2_026].map((year) => ({
    id: String(year), name: '案', goal: 'buy', blocks: 1, savedAt: Date.UTC(year, 0, 1),
  }));
  assert.deepEqual(slotListModel(slots).rows.map(row => row.id), ['10000', '9999', '2026']);
});
