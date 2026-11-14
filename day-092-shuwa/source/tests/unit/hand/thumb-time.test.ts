import { describe, expect, it } from 'vitest';
import type { SignSpec, Vec3 } from '../../../src/hand/types';
import { WORDS } from '../../../src/content/words';
import { NUMBERS } from '../../../src/content/numbers';
import { faceAt } from '../../../src/hand/core/face';
import { distance } from '../../../src/hand/core/math';
import { thumbnailKey } from '../../../src/hand/core/thumb-key';
import { firstHold, thumbnailTime } from '../../../src/hand/core/thumb-time';
import { compileSign, handPointsInField, sampleSign } from '../../../src/hand/core/timeline';

const flat = { fingers: { index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended' }, thumb: 'alongside' } as const;
const fist = { fingers: { index: 'curled', middle: 'curled', ring: 'curled', pinky: 'curled' }, thumb: 'acrossFront' } as const;

/** その時刻の両手の21点（左手は鏡写し）と顔の形 */
function frameAt(spec: SignSpec, t: number) {
  const f = sampleSign(compileSign(spec), t);
  return {
    pts: [...handPointsInField(f.dominant, false), ...(f.nonDominant ? handPointsInField(f.nonDominant, true) : [])],
    face: faceAt(spec, t),
  };
}
const maxDist = (a: Vec3[], b: Vec3[]) => (a.length !== b.length ? Infinity : Math.max(...a.map((p, i) => distance(p, b[i]!))));

describe('小さな画像の時点（thumbnailTime）', () => {
  it('最初の止まる区間: どの手も止まっている最初の区間（止まる Keyframe が続く間はつなげる）', () => {
    const spec: SignSpec = {
      body: true,
      hands: {
        dominant: {
          keyframes: [
            { t: 0, shape: flat, orient: { palm: 'toViewer', fingers: 'up' }, pos: [0, 0, 2] },
            { t: 0.4, pos: [0, 1, 2] },
            { t: 0.45 },
            { t: 0.7 },
            { t: 1.0, shape: fist },
          ],
        },
        // 反対の手は 0.5 秒まで動く → 両手が止まるのは 0.5〜0.7
        nonDominant: { keyframes: [{ t: 0, pos: [1, 0, 2] }, { t: 0.5, pos: [1, 0.5, 2] }] },
      },
    };
    const c = compileSign(spec);
    expect(firstHold(c)).toEqual({ t0: 0.5, t1: 0.7 });
    expect(thumbnailTime(spec, c, undefined)).toBeCloseTo(0.6, 12);
    // 時点を書いた時はその時点
    expect(thumbnailTime(spec, c, 'end')).toBe(1.0);
    expect(thumbnailTime(spec, c, 'start')).toBe(0);
    expect(thumbnailTime(spec, c, 0.3)).toBe(0.3);
    // 上半身なしは最後
    expect(thumbnailTime({ ...spec, body: false }, compileSign({ ...spec, body: false }), undefined)).toBe(1.0);
  });

  it('形だけが変わる区間は止まる区間に入れない（形が途中のまま描かれないように）', () => {
    const spec: SignSpec = {
      body: true,
      hands: { dominant: { keyframes: [{ t: 0, shape: flat, pos: [0, 0, 2] }, { t: 0.5, shape: fist }, { t: 0.8 }] } },
    };
    expect(firstHold(compileSign(spec))).toEqual({ t0: 0.5, t1: 0.8 });
  });

  it('単語の時点を省いた画像は、最初の止まる区間の真ん中（おはよう＝朝のこぶし・こんにちは＝額の2本指・こんばんは＝開いた両手）', () => {
    const t = (id: string) => {
      const s = WORDS.find((w) => w.id === id)!.sign;
      return thumbnailTime(s, compileSign(s), undefined);
    };
    expect(t('word-ohayou')).toBeCloseTo(0.075, 9);
    expect(t('word-konnichiwa')).toBeCloseTo(0.525, 9);
    expect(t('word-konbanwa')).toBeCloseTo(0.075, 9);
    // 数字は今までどおり最後の形
    for (const n of NUMBERS) expect(thumbnailTime(n.sign, compileSign(n.sign), undefined)).toBe(compileSign(n.sign).duration);
  });

  it('全単語の、時点を省いた画像の形が、どの2つも同じでない（手の21点がどこかで手のひら半分以上違う）', () => {
    const frames = WORDS.map((w) => ({ id: w.id, ...frameAt(w.sign, thumbnailTime(w.sign, compileSign(w.sign), undefined)) }));
    let closest = { d: Infinity, pair: '' };
    for (let i = 0; i < frames.length; i++) {
      for (let j = i + 1; j < frames.length; j++) {
        const d = maxDist(frames[i]!.pts, frames[j]!.pts);
        if (d < closest.d) closest = { d, pair: `${frames[i]!.id} と ${frames[j]!.id}` };
      }
    }
    expect(closest.d, `いちばん近い組: ${closest.pair}`).toBeGreaterThan(0.5);
    // 直す前（最後の形）では、あいさつで終わる3語が同じになっていた
    const end = (id: string) => {
      const s = WORDS.find((w) => w.id === id)!.sign;
      return frameAt(s, compileSign(s).duration).pts;
    };
    expect(maxDist(end('word-ohayou'), end('word-konnichiwa'))).toBeLessThan(1e-9);
  });

  it('キャッシュの鍵: 上半身つきは「時点の指定なし」と「最後」で別の鍵、手だけの形は同じ鍵', () => {
    const body = WORDS[0]!.sign;
    expect(thumbnailKey(body)).not.toBe(thumbnailKey(body, { at: 'end' }));
    const hand = NUMBERS[1]!.sign;
    expect(thumbnailKey(hand)).toBe(thumbnailKey(hand, { at: 'end' }));
  });
});
