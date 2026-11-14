import { describe, expect, it } from 'vitest';
import { ITEMS, getItem } from '../../src/content';

describe('土台', () => {
  it('仮の項目が引ける', () => {
    expect(ITEMS.length).toBeGreaterThan(0);
    expect(getItem('kana-a')?.label).toBe('あ');
  });
});
