import test from 'node:test';
import assert from 'node:assert/strict';
import { noticeText, readParams, writeParams } from '../lib/url.js';

const CODES = Array.from({ length: 47 }, (_, index) => String(index + 1).padStart(2, '0'));

test('readParams: 正しい値はそのまま読む', () => {
  assert.deepEqual(readParams('?m=sento&pref=13&bath=n123', CODES), { metric: 'sento', pref: '13', bath: 'n123', notices: [] });
  assert.deepEqual(readParams('', CODES), { metric: 'sources', pref: null, bath: null, notices: [] });
  assert.deepEqual(readParams('?m=flow&other=1', CODES), { metric: 'flow', pref: null, bath: null, notices: [] });
});

test('readParams: 変な値は捨てて、何を捨てたかを返す', () => {
  assert.deepEqual(readParams('?pref=99', CODES), { metric: 'sources', pref: null, bath: null, notices: ['pref'] });
  assert.deepEqual(readParams('?pref=5', CODES).notices, ['pref']);
  assert.deepEqual(readParams('?pref=', CODES).notices, ['pref']);
  assert.deepEqual(readParams('?m=onsen', CODES), { metric: 'sources', pref: null, bath: null, notices: ['metric'] });
  assert.deepEqual(readParams('?pref=05&bath=<script>', CODES), { metric: 'sources', pref: '05', bath: null, notices: ['bath'] });
  assert.deepEqual(readParams('?m=x&pref=00&bath=zz', CODES).notices, ['metric', 'pref', 'bath']);
});

test('writeParams: 既定の指標は書かない。bath は県とセットのときだけ', () => {
  assert.equal(writeParams({ metric: 'sources' }), '');
  assert.equal(writeParams({ metric: 'sento' }), '?m=sento');
  assert.equal(writeParams({ metric: 'sources', pref: '05' }), '?pref=05');
  assert.equal(writeParams({ metric: 'areas', pref: '05', bath: 'w457377725' }), '?m=areas&pref=05&bath=w457377725');
  assert.equal(writeParams({ metric: 'sources', bath: 'n1' }), '');
});

test('readParams と writeParams は往復で同じになる', () => {
  for (const state of [{ metric: 'sento', pref: '13', bath: 'n1' }, { metric: 'sources', pref: '47', bath: null }, { metric: 'flow', pref: null, bath: null }]) {
    const read = readParams(writeParams(state), CODES);
    assert.deepEqual({ metric: read.metric, pref: read.pref, bath: read.bath }, state);
  }
});

test('noticeText: 捨てた値の知らせ', () => {
  assert.equal(noticeText('pref'), '指定された県が見つからないので全国を表示しています');
  assert.equal(noticeText('metric'), '指定された指標が見つからないので源泉の数を表示しています');
  assert.equal(noticeText('bath', '秋田県'), '指定されたお風呂が見つからないので秋田県を表示しています');
  assert.equal(noticeText('bath'), '指定されたお風呂が見つからないので全国を表示しています');
  assert.equal(noticeText('x'), '');
});
