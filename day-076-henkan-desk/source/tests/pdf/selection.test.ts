import { describe, expect, it } from 'vitest';
import { parsePages, parseOrder } from '../../src/features/pdf/selection';
describe('PDF page selections', () => {
  it('keeps explicit range order with one-based input', () => expect(parsePages('3,1-2', 4)).toEqual([2,0,1]));
  it('selects all pages for an empty range', () => expect(parsePages('', 3)).toEqual([0,1,2]));
  it.each(['0','5','3-1','1,1','1-3,3','NaN','1e2','1,','-1'])('rejects invalid range %s', value => expect(() => parsePages(value,4)).toThrow());
  it('supports Japanese commas', () => expect(parsePages('1、3', 3)).toEqual([0,2]));
  it('reverses all pages', () => expect(parseOrder('reverse',3)).toEqual([2,1,0]));
  it('rejects a missing page when reordering', () => expect(() => parseOrder('3,1',3)).toThrow());
});
