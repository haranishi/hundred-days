import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, stateAt, timeFor, durationFor, SPEEDS } from '../lib/timing.js';

const order = (lengths, cells) =>
  lengths.map((length, i) => ({
    cellIndex: cells ? cells[i] : 0,
    indexInChar: i,
    stroke: { length },
  }));

test('durationFor: 長い画ほど長いが、比例はしない', () => {
  const base = 500;
  assert.ok(durationFor(100, base) > durationFor(25, base));
  assert.ok(durationFor(100, base) < durationFor(25, base) * 4);
});

test('durationFor: 極端に短い画・長い画は上下で止める', () => {
  const base = 500;
  assert.equal(durationFor(0, base), Math.round(base * 0.55));
  assert.equal(durationFor(100000, base), Math.round(base * 1.7));
});

test('buildTimeline: 画は重ならず、順番どおりに並ぶ', () => {
  const { items, total } = buildTimeline(order([50, 50, 50]), 'normal');
  assert.equal(items.length, 3);
  for (let i = 1; i < items.length; i++) {
    assert.ok(items[i].start >= items[i - 1].start + items[i - 1].duration, `${i}画目`);
  }
  assert.equal(total, items[2].start + items[2].duration);
});

test('buildTimeline: 字の変わり目は間が長い', () => {
  const { items } = buildTimeline(order([50, 50, 50], [0, 0, 1]), 'normal');
  const sameChar = items[1].start - (items[0].start + items[0].duration);
  const nextChar = items[2].start - (items[1].start + items[1].duration);
  assert.equal(sameChar, SPEEDS.normal.gap);
  assert.equal(nextChar, SPEEDS.normal.cellGap);
});

test('buildTimeline: ゆっくりのほうが長くかかる', () => {
  const slow = buildTimeline(order([50, 50]), 'slow').total;
  const fast = buildTimeline(order([50, 50]), 'fast').total;
  assert.ok(slow > fast * 2);
});

test('buildTimeline: 画が無いときは総時間0', () => {
  const timeline = buildTimeline([], 'normal');
  assert.equal(timeline.total, 0);
  assert.deepEqual(stateAt(timeline, 0), { index: -1, progress: 0, written: 0, done: true });
});

test('stateAt: 画の途中では進み具合が0と1の間になる', () => {
  const timeline = buildTimeline(order([50, 50]), 'normal');
  const mid = stateAt(timeline, timeline.items[0].duration / 2);
  assert.equal(mid.index, 0);
  assert.ok(mid.progress > 0.4 && mid.progress < 0.6);
  assert.equal(mid.written, 0);
});

test('stateAt: 画と画のあいだは前の画が書き終わった状態', () => {
  const timeline = buildTimeline(order([50, 50]), 'normal');
  const between = stateAt(timeline, timeline.items[0].duration + 10);
  assert.equal(between.index, 0);
  assert.equal(between.progress, 1);
  assert.equal(between.written, 1);
});

test('stateAt: 終わりを過ぎたら全部書き終わり', () => {
  const timeline = buildTimeline(order([50, 50]), 'normal');
  const end = stateAt(timeline, timeline.total + 5000);
  assert.equal(end.done, true);
  assert.equal(end.written, 2);
  assert.equal(end.progress, 1);
});

test('timeFor: 速さを変えても同じ画の同じ位置に戻る', () => {
  const before = buildTimeline(order([50, 80, 30]), 'fast');
  const snapshot = stateAt(before, before.items[1].start + before.items[1].duration * 0.5);
  const after = buildTimeline(order([50, 80, 30]), 'slow');
  const moved = stateAt(after, timeFor(after, snapshot.index, snapshot.progress));
  assert.equal(moved.index, snapshot.index);
  assert.ok(Math.abs(moved.progress - snapshot.progress) < 0.02);
});
