import { it, expect } from 'vitest';
import { scoreTrick, GRAB_NAMES } from '../../src/play/tricks.js';
it('つかみの技の名前は、道具ごとに言い分ける。点は同じ', () => {
  const event = { spin: Math.PI * 2, flip: 0, grab: 1, grabTime: 1, air: 1.4, quality: 'clean' };
  const board = scoreTrick(event), ski = scoreTrick(event, 'ski');
  expect(board.name).toBe('インディ 360'); expect(ski.name).toBe('セーフティ 360'); expect(ski.score).toBe(board.score);
  expect(scoreTrick(event, 'unknown').name).toBe(board.name);
  for (const gear of ['board', 'ski']) expect(GRAB_NAMES[gear]).toHaveLength(4);
});
