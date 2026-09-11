import test from 'node:test';
import assert from 'node:assert/strict';
import { PAPER, BODY, SOLO, blocks, photoBox, columnsIn, fitSize, fitHeadline } from '../lib/layout.js';

test('blocks: 本数が増えるほど右の記事が大きい', () => {
  for (const count of [2, 3]) {
    const list = blocks(count);
    assert.equal(list.length, count);
    for (let i = 1; i < count; i += 1) assert.ok(list[i].width < list[i - 1].width, `${count}本目`);
  }
});

test('blocks: 右端と左端は紙面の余白に収まる', () => {
  for (const count of [1, 2, 3]) {
    const list = blocks(count);
    assert.equal(list[0].right, PAPER.width - PAPER.margin);
    assert.equal(list.at(-1).left, PAPER.margin);
  }
});

test('blocks: 右から左へ並ぶ', () => {
  const [first, second] = blocks(2);
  assert.ok(second.right < first.left);
});

test('photoBox: ブロックの左下に接地する', () => {
  const block = blocks(1)[0];
  const box = photoBox(block, 200);
  assert.equal(box.left, block.left);
  assert.equal(box.bottom, block.bottom);
  assert.ok(box.top < box.bottom);
});

test('photoBox: 置き場所が狭ければ写真をあきらめる', () => {
  const block = blocks(3)[2];
  assert.equal(photoBox(block, 200), null);
});

test('columnsIn: 右から左へ、写真の手前で止まる', () => {
  const block = blocks(1)[0];
  const box = photoBox(block, 200);
  const columns = columnsIn({ right: 900, left: block.left, top: block.top, bottom: block.bottom, lineGap: 44, size: 27, avoid: box });
  assert.ok(columns[0].x > columns.at(-1).x);
  const overlapping = columns.filter((c) => c.x <= box.right && c.x >= box.left);
  assert.ok(overlapping.length > 0);
  for (const column of overlapping) assert.ok(column.top + column.height <= box.top);
});

test('columnsIn: 写真が無ければ全部が同じ高さ', () => {
  const columns = columnsIn({ right: 900, left: 100, top: 200, bottom: 1000, lineGap: 44, size: 27 });
  assert.ok(columns.every((column) => column.height === 800));
});

test('fitSize: 短い本文は大きく、長い本文は小さく組む', () => {
  const region = { right: 900, left: 100, top: 200, bottom: 1300 };
  assert.ok(fitSize(40, region) > fitSize(600, region));
});

test('fitSize: 入り切らない量でも下限で止まる', () => {
  assert.equal(fitSize(100000, { right: 900, left: 100, top: 200, bottom: 1300 }, { min: 22, max: 52 }), 22);
});

test('fitHeadline: 字数が増えるほど小さくなる', () => {
  const short = fitHeadline(6, 620, 3);
  const long = fitHeadline(20, 620, 3);
  assert.ok(short.size >= long.size);
  assert.ok(long.lines >= 1 && long.lines <= 3);
});

test('fitHeadline: 上限と下限を守る', () => {
  assert.equal(fitHeadline(1, 620, 3, { min: 44, max: 108 }).size, 108);
  assert.equal(fitHeadline(200, 620, 3, { min: 44, max: 108 }).size, 44);
});

test('SOLO: 本文の帯と写真の帯が重ならない', () => {
  assert.ok(SOLO.text.bottom < SOLO.caption);
  assert.ok(SOLO.caption < SOLO.photo.top);
  assert.equal(SOLO.photo.bottom, BODY.bottom);
});
