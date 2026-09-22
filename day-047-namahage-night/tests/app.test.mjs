import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY } from '../lib/store.js';
import { loadApp } from './helpers.mjs';

test('操作窓口は状態を観測し、全解放を保存して各面を開始できる', () => {
  const { api, stored } = loadApp();
  assert.equal(api.mode(), 'title');
  api.unlockAll();
  assert.equal(JSON.parse(stored.get(KEY)).unlockedWorld, 4);
  api.begin('4-5');
  assert.equal(api.mode(), 'playing');
  const snapshot = api.snapshot();
  assert.equal(snapshot.id, '4-5');
  assert.equal(snapshot.stage, 0);
  assert.equal(snapshot.lives, 3);
  assert.equal(snapshot.mochi, 0);
  assert.equal(snapshot.rice, 0);
  assert.equal(snapshot.status, 'playing');
  assert.equal(snapshot.seconds, 0);
  snapshot.x = -999;
  assert.notEqual(api.snapshot().x, -999);
});

test('自動入力は実キーを上書きし、空入力で停止、nullで実キーに戻る', () => {
  const { api, handlers, frame } = loadApp();
  api.begin('1-1');
  handlers.get('keydown')({ code: 'ArrowLeft', preventDefault() {} });
  const next = { right: true };
  api.setInput(next);
  next.right = false;
  frame(1000);
  frame(1300);
  const moved = api.snapshot();
  assert.ok(moved.x > 16);
  assert.equal(moved.seconds, 0.3);
  api.setInput({});
  frame(1500);
  const stopped = api.snapshot().x;
  frame(1700);
  assert.equal(api.snapshot().x, stopped);
  api.setInput(null);
  frame(1900);
  assert.ok(api.snapshot().x < stopped);
});
