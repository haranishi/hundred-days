import assert from 'node:assert/strict';
import test from 'node:test';
import { expiryStatus } from '../lib/expiry.js';

const today = new Date(2026, 7, 29, 15, 30);

test('未入力はnone', () => assert.equal(expiryStatus('', today), 'none'));
test('今日より前はexpired', () => assert.equal(expiryStatus('2026-08-28', today), 'expired'));
test('今日の日付はsoon', () => assert.equal(expiryStatus('2026-08-29', today), 'soon'));
test('30日後はsoon', () => assert.equal(expiryStatus('2026-09-28', today), 'soon'));
test('31日後はok', () => assert.equal(expiryStatus('2026-09-29', today), 'ok'));
test('不正な日付はnone', () => assert.equal(expiryStatus('2026-02-30', today), 'none'));

