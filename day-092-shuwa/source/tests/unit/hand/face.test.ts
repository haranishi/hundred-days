import { describe, expect, it } from 'vitest';
import type { SignSpec } from '../../../src/hand/types';
import { WORDS } from '../../../src/content/words';
import { NOD_SECONDS, faceAt } from '../../../src/hand/core/face';
import { compileSign } from '../../../src/hand/core/timeline';

const word = (id: string): SignSpec => WORDS.find((w) => w.id === id)!.sign;

/** 再生の間を細かく刻んで、うなずきが一番深い時刻と、うなずいている時刻の範囲 */
function nodSpan(spec: SignSpec) {
  const d = compileSign(spec).duration;
  let peak = { t: 0, v: 0 };
  let first = Infinity, last = -Infinity;
  for (let i = 0; i <= 2000; i++) {
    const t = (d * i) / 2000;
    const v = faceAt(spec, t).nod;
    if (v > peak.v) peak = { t, v };
    if (v > 0.01) {
      first = Math.min(first, t);
      last = Math.max(last, t);
    }
  }
  return { peak, first, last, duration: d };
}

describe('顔の時刻（faceAt）', () => {
  it('faceTimeline が無ければ今までどおり: nod は再生の始めに1回うなずき、口と眉はふつう', () => {
    const s: SignSpec = { hands: { dominant: { keyframes: [] } }, face: 'nod' };
    expect(faceAt(s, 0)).toEqual({ shape: 'neutral', nod: 0 });
    expect(faceAt(s, NOD_SECONDS / 2).nod).toBeCloseTo(1, 9);
    expect(faceAt(s, NOD_SECONDS + 0.01).nod).toBe(0);
    expect(faceAt({ ...s, face: 'smile' }, 0.3)).toEqual({ shape: 'smile', nod: 0 });
    expect(faceAt({ ...s, face: 'frown' }, 0.3)).toEqual({ shape: 'frown', nod: 0 });
    expect(faceAt({ ...s, face: undefined }, 0.3)).toEqual({ shape: 'neutral', nod: 0 });
  });

  it('faceTimeline があれば、うなずく時刻はその項目の時刻（face の nod で始めにはうなずかない）', () => {
    const s: SignSpec = { hands: { dominant: { keyframes: [] } }, face: 'nod', faceTimeline: [{ t: 1, face: 'nod' }] };
    expect(faceAt(s, 0.35).nod).toBe(0);
    expect(faceAt(s, 0.99).nod).toBe(0);
    expect(faceAt(s, 1 + NOD_SECONDS / 2).nod).toBeCloseTo(1, 9);
    expect(faceAt(s, 1 + NOD_SECONDS + 0.01).nod).toBe(0);
    expect(faceAt(s, 1.2).shape).toBe('neutral');
  });

  it('表情は項目の時刻から変わり、うなずきの間も口と眉は前のまま', () => {
    const s: SignSpec = {
      hands: { dominant: { keyframes: [] } },
      face: 'smile',
      faceTimeline: [{ t: 1, face: 'frown' }, { t: 0.5, face: 'nod' }],
    };
    expect(faceAt(s, 0.2)).toEqual({ shape: 'smile', nod: 0 });
    expect(faceAt(s, 0.6).shape).toBe('smile');
    expect(faceAt(s, 0.6).nod).toBeGreaterThan(0.3);
    expect(faceAt(s, 1.5)).toEqual({ shape: 'frown', nod: 0 });
  });
});

describe('単語の顔（調査 r2 の nonmanual）', () => {
  // 「お願い」の部分（手を開いて立て、前へ下ろす）: words.ts の Keyframe の時刻
  const ONEGAI = { 'word-yoroshiku': { from: 0.95, lower: [1.05, 1.6] }, 'word-gomennasai': { from: 0.85, lower: [0.95, 1.45] } } as const;

  for (const [id, part] of Object.entries(ONEGAI)) {
    it(`${id}: 一礼は後半の「お願い」で1回。前半ではうなずかず、最後の形では頭がまっすぐ`, () => {
      const s = word(id);
      const n = nodSpan(s);
      expect(n.first, '「お願い」より前にうなずかない').toBeGreaterThanOrEqual(part.from - 1e-9);
      expect(n.peak.v).toBeGreaterThan(0.99);
      // 一番深い時刻は、手を下ろす動きの間
      expect(n.peak.t).toBeGreaterThan(part.lower[0]);
      expect(n.peak.t).toBeLessThan(part.lower[1]);
      expect(faceAt(s, n.duration).nod).toBe(0);
      expect(faceAt(s, 0).shape).toBe('neutral');
    });
  }

  it('嫌いは嫌な顔（眉を寄せ、口をへの字）で、好きは笑顔', () => {
    expect(faceAt(word('word-kirai'), 0.4).shape).toBe('frown');
    expect(faceAt(word('word-suki'), 0.4).shape).toBe('smile');
  });

  it('ほかの語の顔は今までどおり（ありがとう・お疲れさま・大丈夫は始めにうなずく）', () => {
    for (const id of ['word-arigatou', 'word-otsukaresama', 'word-daijoubu']) {
      expect(word(id).faceTimeline, id).toBeUndefined();
      expect(nodSpan(word(id)).first, id).toBeLessThan(0.05);
    }
  });
});
