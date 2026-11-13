import { describe, expect, it } from 'vitest';
import type { ContactPoint, FingerName, HandshapeSpec } from '../../../src/hand/types';
import { CONTACT_TOLERANCE, LIMITS, poseWithinLimits, solveHandshape } from '../../../src/hand/core/shapes';
import { contactGap, skeleton } from '../../../src/hand/core/skeleton';
import { SAMPLES } from '../../../src/hand/dev/samples';

const half = (thumb: HandshapeSpec['thumb']): HandshapeSpec => ({
  fingers: { index: 'half', middle: 'half', ring: 'half', pinky: 'half' },
  thumb,
});

describe('接触（touch / contacts）', () => {
  it('試作の形の接触は、指先の隙間が 0.02 以下（深いめり込みもない）', () => {
    const withContacts = SAMPLES.filter((s) => {
      const sh = s.spec.hands.dominant.keyframes[0]!.shape!;
      return typeof sh.thumb === 'object' || (sh.contacts?.length ?? 0) > 0;
    });
    expect(withContacts.map((s) => s.label).sort()).toEqual(['お', 'か', 'が', 'き', 'め'].sort());
    for (const s of withContacts) {
      const r = solveHandshape(s.spec.hands.dominant.keyframes[0]!.shape!);
      expect(r.contacts.length, s.label).toBeGreaterThan(0);
      for (const c of r.contacts) {
        expect(c.gap, `${s.label} ${c.a}–${c.b}`).toBeLessThanOrEqual(CONTACT_TOLERANCE);
        expect(c.gap, `${s.label} ${c.a}–${c.b}`).toBeGreaterThan(-0.03);
      }
    }
  });

  it('親指の先を、4本の指先それぞれに接触させられる', () => {
    for (const f of ['index', 'middle', 'ring', 'pinky'] as FingerName[]) {
      const p: ContactPoint = `${f}.tip`;
      const r = solveHandshape(half({ touch: p }));
      expect(contactGap(skeleton(r.pose), 'thumb.tip', p), p).toBeLessThanOrEqual(CONTACT_TOLERANCE);
    }
  });

  it('親指の先を、人差し指・中指の第1・第2関節に接触させられる', () => {
    for (const p of ['index.dip', 'index.pip', 'middle.dip', 'middle.pip'] as ContactPoint[]) {
      const r = solveHandshape(half({ touch: p }));
      expect(contactGap(skeleton(r.pose), 'thumb.tip', p), p).toBeLessThanOrEqual(CONTACT_TOLERANCE);
    }
  });

  it('contacts で指どうし（親指以外）も接触させられる', () => {
    const r = solveHandshape({
      fingers: { index: 'half', middle: 'half', ring: 'curled', pinky: 'curled' },
      thumb: 'acrossFront',
      contacts: [['index.tip', 'middle.tip']],
    });
    expect(r.contacts[0]!.gap).toBeLessThanOrEqual(CONTACT_TOLERANCE);
  });
});

describe('逆運動学は可動域を守る', () => {
  it('試作の形と、親指でいろいろな点に触れる形のすべてで、関節角度が可動域の中にある', () => {
    const shapes: HandshapeSpec[] = SAMPLES.map((s) => s.spec.hands.dominant.keyframes[0]!.shape!);
    for (const f of ['index', 'middle', 'ring', 'pinky'] as FingerName[]) {
      for (const j of ['tip', 'dip', 'pip', 'mcp'] as const) shapes.push(half({ touch: `${f}.${j}` }));
    }
    for (const sh of shapes) expect(poseWithinLimits(solveHandshape(sh).pose), JSON.stringify(sh)).toBe(true);
  });

  it('届かない接触でも可動域を超えず、離れていることを警告する', () => {
    // 伸ばした小指の付け根の甲の側は、親指では届かない
    const r = solveHandshape({
      fingers: { index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended' },
      thumb: { touch: 'pinky.tip' },
      adjust: { pinky: { mcp: -20, pip: 0, dip: 0 } },
    });
    expect(poseWithinLimits(r.pose)).toBe(true);
    expect(r.warnings.some((w) => w.includes('接触できませんでした'))).toBe(true);
  });

  it('adjust が可動域を超えたら丸めて、警告を出す', () => {
    const r = solveHandshape({
      fingers: { index: 'curled', middle: 'curled', ring: 'curled', pinky: 'curled' },
      thumb: 'alongside',
      adjust: { index: { pip: 150 }, thumb: { ip: -60 } },
    });
    expect(r.pose.index.pip).toBe(LIMITS.finger.pip[1]);
    expect(r.pose.thumb.ip).toBeGreaterThanOrEqual(LIMITS.thumb.ip[0]);
    expect(r.warnings.filter((w) => w.includes('丸めました'))).toHaveLength(2);
  });

  it('adjust で指定した関節は、接触の逆運動学でも動かさない', () => {
    const r = solveHandshape({
      fingers: { index: 'half', middle: 'extended', ring: 'extended', pinky: 'extended' },
      thumb: { touch: 'index.tip' },
      adjust: { thumb: { cmcFlex: -10 }, index: { mcp: 50 } },
    });
    expect(r.pose.thumb.cmcFlex).toBe(-10);
    expect(r.pose.index.mcp).toBe(50);
  });
});
