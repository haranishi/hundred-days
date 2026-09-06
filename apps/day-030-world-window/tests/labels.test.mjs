import test from 'node:test';
import assert from 'node:assert/strict';
import { continentLabel, operatorLabel } from '../lib/labels.js';

test('labels: 大陸名を日本語にし、知らない値はそのまま返す', () => {
  assert.equal(continentLabel('Asia'), 'アジア');
  assert.equal(continentLabel('North America'), '北アメリカ');
  assert.equal(continentLabel('South America'), '南アメリカ');
  assert.equal(continentLabel('Seven seas (open ocean)'), '海洋');
  assert.equal(continentLabel('Antarctica'), '南極');
  assert.equal(continentLabel('Middle-earth'), 'Middle-earth');
  assert.equal(continentLabel(null), '');
});

test('labels: 運営者に入ったURLはホスト名だけにする', () => {
  assert.equal(operatorLabel('https://www.example.test/cams/list?id=1'), 'example.test');
  assert.equal(operatorLabel('HTTP://Example.TEST/a'), 'example.test');
  // URLでなければ手を加えない（会社名・部署名はそのまま読ませる）
  assert.equal(operatorLabel('秋田観光局'), '秋田観光局');
  assert.equal(operatorLabel('example.test'), 'example.test');
  assert.equal(operatorLabel(null), null);
});
