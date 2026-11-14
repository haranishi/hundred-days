import { describe, expect, it } from 'vitest';
import { mirrorText } from '../../src/content/mirror';

describe('利き手に合わせた説明', () => {
  it('左手では左右の方向・手・指を一度に交換する', () => {
    expect(mirrorText('右手の親指を左へ、左手を右側に置く。', 'left')).toBe('左手の親指を右へ、右手を左側に置く。');
  });
  it('左右という熟語・方向以外の語を保つ', () => {
    expect(mirrorText('左右に動かす。上下はそのまま。', 'left')).toBe('左右に動かす。上下はそのまま。');
  });
  it('右手は元の文、二度反転すると元の文になる', () => {
    const text = '右の指を左へ。左右を見比べる。';
    expect(mirrorText(text, 'right')).toBe(text);
    expect(mirrorText(mirrorText(text, 'left'), 'left')).toBe(text);
  });
});
