import { describe, expect, it } from 'vitest';
import { renderThumbnail } from '../../../src/hand';
import type { SignSpec } from '../../../src/hand/types';
import { thumbnailKey } from '../../../src/hand/core/thumb-key';

const spec = (): SignSpec => ({
  hands: {
    dominant: {
      keyframes: [
        {
          t: 0,
          shape: { fingers: { index: 'curled', middle: 'curled', ring: 'curled', pinky: 'curled' }, thumb: 'alongside' },
          orient: { palm: 'toViewer', fingers: 'up' },
          pos: { at: 'neutral' },
        },
      ],
    },
  },
});

/** 同じ内容で、キーの書き順だけを変えたもの */
const reordered = (): SignSpec => ({
  hands: {
    dominant: {
      keyframes: [
        {
          pos: { at: 'neutral' },
          orient: { fingers: 'up', palm: 'toViewer' },
          shape: { thumb: 'alongside', fingers: { pinky: 'curled', ring: 'curled', middle: 'curled', index: 'curled' } },
          t: 0,
        },
      ],
    },
  },
});

describe('小さな画像のキャッシュの鍵', () => {
  it('同じ引数なら同じ鍵（キーの書き順に左右されない）', () => {
    expect(thumbnailKey(spec(), { size: 128 })).toBe(thumbnailKey(reordered(), { size: 128 }));
  });

  it('既定値を省いた呼び方と、既定値を書いた呼び方は同じ鍵', () => {
    expect(thumbnailKey(spec())).toBe(thumbnailKey(spec(), { perspective: 'viewer', dominant: 'right', size: 256, at: 'end' }));
  });

  it('視点・利き手・大きさ・時点・形のどれかが違えば別の鍵', () => {
    const base = thumbnailKey(spec());
    const others = [
      thumbnailKey(spec(), { perspective: 'self' }),
      thumbnailKey(spec(), { dominant: 'left' }),
      thumbnailKey(spec(), { size: 128 }),
      thumbnailKey(spec(), { at: 'start' }),
      thumbnailKey(spec(), { at: 0.5 }),
      thumbnailKey({ ...spec(), body: true }),
    ];
    for (const k of others) expect(k).not.toBe(base);
    expect(new Set(others).size).toBe(others.length);
  });

  it('値が undefined の項目は、書かなかったのと同じ扱い', () => {
    expect(thumbnailKey({ ...spec(), face: undefined })).toBe(thumbnailKey(spec()));
  });

  it('renderThumbnail は同じ引数なら同じ URL を返す（3D が描けない Node でも代わりの画像で）', async () => {
    const [a, b] = await Promise.all([renderThumbnail(spec(), { size: 64 }), renderThumbnail(reordered(), { size: 64 })]);
    expect(a).toBe(b);
    expect(await renderThumbnail(spec(), { size: 64 })).toBe(a);
    expect(a.startsWith('data:image/svg+xml')).toBe(true);
  });
});
