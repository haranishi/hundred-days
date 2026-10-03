import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoadingState } from '../loading.mjs';

const config = { title: '準備', steps: ['モデル', '描画', '操作'] };
test('読み込みは実段階だけ進み、完了通知で閉じる', () => {
  const state = createLoadingState(), id = state.begin(config);
  assert.equal(state.snapshot.step, 0);
  assert.equal(state.step(id, 1, '描画準備'), true);
  assert.equal(state.snapshot.detail, '描画準備');
  assert.equal(state.snapshot.status, 'loading');
  assert.equal(state.finish(id), true);
  assert.equal(state.snapshot.step, 3);
  assert.equal(state.snapshot.status, 'done');
});
test('古い読み込みからの段階・成功・失敗を無視する', () => {
  const state = createLoadingState(), old = state.begin(config), id = state.begin(config);
  assert.notEqual(old, id);
  assert.equal(state.step(old, 2, '古い'), false);
  assert.equal(state.finish(old), false);
  assert.equal(state.fail(old, '古い'), false);
  assert.equal(state.snapshot.status, 'loading');
  assert.equal(state.snapshot.step, 0);
});
test('失敗した読み込みを遅い成功通知で隠さない', () => {
  const state = createLoadingState(), id = state.begin(config);
  assert.equal(state.fail(id, '通信失敗'), true);
  assert.equal(state.finish(id), false);
  assert.equal(state.step(id, 2, '遅い'), false);
  assert.equal(state.snapshot.status, 'error');
  assert.equal(state.snapshot.error, '通信失敗');
});
test('完了後の遅い失敗を無視する', () => {
  const state = createLoadingState(), id = state.begin(config);
  state.finish(id);
  assert.equal(state.fail(id, '遅い'), false);
  assert.equal(state.snapshot.status, 'done');
});
test('段階は逆戻りせず、無効な数値を受け付けない', () => {
  const state = createLoadingState(), id = state.begin(config);
  assert.equal(state.step(id, 1, '描画'), true);
  assert.equal(state.step(id, 0, '古い'), false);
  assert.equal(state.step(id, NaN, '無効'), false);
  assert.equal(state.step(id, Infinity, '無効'), false);
  assert.equal(state.snapshot.step, 1);
  assert.equal(state.step(id, 99, '操作'), true);
  assert.equal(state.snapshot.step, 2);
  assert.equal(state.snapshot.status, 'loading');
});
test('失敗後に新しい読み込みを開始でき、段階の配列を外から変えられない', () => {
  const state = createLoadingState(), steps = [...config.steps];
  const id = state.begin({ ...config, steps });
  steps.push('追加'); state.snapshot.steps.push('追加');
  assert.equal(state.snapshot.steps.length, 3);
  state.fail(id, '失敗');
  state.begin(config);
  assert.equal(state.snapshot.error, '');
  assert.equal(state.snapshot.status, 'loading');
});
test('段階がない読み込みは開始しない', () => {
  const state = createLoadingState();
  assert.throws(() => state.begin({ ...config, steps: [] }));
  assert.equal(state.snapshot.status, 'idle');
});
