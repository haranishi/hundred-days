import assert from 'node:assert/strict';
import test from 'node:test';
import { filename } from '../lib/filename.js';

test('端末時刻をframed-YYYYMMDD-HHMM.pngにする', () => {
  const date = new Date(2026, 8, 3, 7, 5);
  assert.equal(filename(date), 'framed-20260903-0705.png');
});
test('ファイル名は常に指定書式', () => assert.match(filename(new Date()), /^framed-\d{8}-\d{4}\.png$/));
