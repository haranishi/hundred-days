import test from 'node:test';
import assert from 'node:assert/strict';
import {GUIDE_STORAGE_KEY, readGuideSeen, rememberGuide} from '../lib/guide.js';

function memory(entries = []) {
  const values = new Map(entries);
  return {values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
}

test('new, missing, and unknown guide records do not skip the first guide', () => {
  for (const value of [null, '', '0', 'true', '{}', 'seen', '2']) {
    assert.equal(readGuideSeen({getItem: () => value}), false);
  }
  assert.equal(readGuideSeen(undefined), false);
});

test('a completed guide is remembered under its own versioned key', () => {
  const storage = memory();
  assert.equal(rememberGuide(storage), true);
  assert.equal(storage.values.get('amegumo-sokoban.guide.v1'), '1');
  assert.equal(readGuideSeen(storage), true);
  assert.equal(GUIDE_STORAGE_KEY, 'amegumo-sokoban.guide.v1');
});

test('saving the guide leaves every existing progress record intact', () => {
  const progress = JSON.stringify({'first-rain': 9, 'two-clouds': 22});
  const storage = memory([['amegumo-sokoban.v1', progress], ['other-game', 'keep']]);
  rememberGuide(storage);
  assert.equal(storage.values.get('amegumo-sokoban.v1'), progress);
  assert.equal(storage.values.get('other-game'), 'keep');
  assert.equal(storage.values.size, 3);
});

test('a denied read shows the guide and a denied write never interrupts closing', () => {
  const blocked = {getItem() {throw Error('denied');}, setItem() {throw Error('full');}};
  assert.equal(readGuideSeen(blocked), false);
  assert.equal(rememberGuide(blocked), false);
  assert.equal(rememberGuide(undefined), false);
});
