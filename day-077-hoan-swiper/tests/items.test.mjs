import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTION_META, CATEGORIES, ITEMS, filterItems, getItemById, getXrayTelemetry } from '../lib/items.js';

test('36品目の手荷物データが定義され、IDが一意であること', () => {
  assert.equal(ITEMS.length, 36);
  const ids = new Set(ITEMS.map((item) => item.id));
  assert.equal(ids.size, 36);
});

test('全品目が必須フィールドと有効なカテゴリ・仕分け先を持つこと', () => {
  const validCategories = new Set(CATEGORIES.filter((c) => c.id !== 'all').map((c) => c.id));
  const validActions = new Set(Object.keys(ACTION_META));

  for (const item of ITEMS) {
    assert.ok(item.id && typeof item.id === 'string');
    assert.ok(item.name && typeof item.name === 'string');
    assert.ok(item.spec && typeof item.spec === 'string');
    assert.ok(validCategories.has(item.category), `Invalid category on ${item.id}: ${item.category}`);
    assert.ok(Array.isArray(item.allowed) && item.allowed.length >= 1, `Empty allowed on ${item.id}`);
    for (const act of item.allowed) {
      assert.ok(validActions.has(act), `Invalid action ${act} on ${item.id}`);
    }
    if (item.allowed.includes('prohibited')) {
      assert.equal(item.allowed.length, 1, `Prohibited item ${item.id} must not allow other actions`);
    }
    assert.ok(item.ruleBadge && item.ruleBadge.length > 0);
    assert.ok(item.shortReason && item.shortReason.length >= 15);
    assert.ok(item.detailRule && item.detailRule.length >= 25);
    assert.ok(item.icon && typeof item.icon === 'string');
    const xray = getXrayTelemetry(item);
    assert.ok(xray && ['cyan', 'amber', 'crimson'].includes(xray.scanColor), `Invalid xray scanColor on ${item.id}`);
    assert.ok(xray.materialTag && xray.materialTag.length >= 4);
    assert.ok(xray.inspectPoint && xray.inspectPoint.length >= 8);
  }
});

test('4つのルール区分（機内のみ・預けのみ・不可・両方OK）がすべてバランスよく含まれること', () => {
  const carryOnly = ITEMS.filter((i) => i.allowed.length === 1 && i.allowed[0] === 'carry_on');
  const checkedOnly = ITEMS.filter((i) => i.allowed.length === 1 && i.allowed[0] === 'checked');
  const prohibited = ITEMS.filter((i) => i.allowed.length === 1 && i.allowed[0] === 'prohibited');
  const bothOk = ITEMS.filter((i) => i.allowed.includes('carry_on') && i.allowed.includes('checked'));

  assert.equal(carryOnly.length, 10);
  assert.equal(checkedOnly.length, 10);
  assert.equal(prohibited.length, 10);
  assert.equal(bothOk.length, 6);
});

test('getItemById と filterItems が正しく絞り込みを行うこと', () => {
  const battery = getItemById('powerbank-10000');
  assert.ok(battery);
  assert.equal(battery.name, 'モバイルバッテリー');
  assert.equal(getItemById('non-existent'), null);

  const batteryCategory = filterItems({ category: 'battery' });
  assert.ok(batteryCategory.length >= 6);
  assert.ok(batteryCategory.every((i) => i.category === 'battery'));

  const searchHairIron = filterItems({ category: 'all', query: 'ヘアアイロン' });
  assert.equal(searchHairIron.length, 3); // 抜取電池、固定電池不可、コンセント式

  const searchEmpty = filterItems({ category: 'blade', query: '存在しないキーワードxyz' });
  assert.equal(searchEmpty.length, 0);
});
