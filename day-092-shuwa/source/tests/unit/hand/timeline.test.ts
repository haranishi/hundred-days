import { describe, expect, it } from 'vitest';
import type { HandshapeSpec, SignSpec, Vec3 } from '../../../src/hand/types';
import { angleBetween, colY, colZ, distance, mulMV } from '../../../src/hand/core/math';
import { REST_POSE, solveHandshape } from '../../../src/hand/core/shapes';
import { PALM_CENTER, pointOf, skeleton } from '../../../src/hand/core/skeleton';
import { compileSign, ease, formationOf, sampleSign } from '../../../src/hand/core/timeline';
import { resolvePosition } from '../../../src/hand/core/body';
import { SAMPLES } from '../../../src/hand/dev/samples';

const DEG = 180 / Math.PI;
const fist: HandshapeSpec = { fingers: { index: 'curled', middle: 'curled', ring: 'curled', pinky: 'curled' }, thumb: 'acrossFront' };
const open: HandshapeSpec = { fingers: { index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended' }, thumb: 'extendedOut' };

const moving: SignSpec = {
  hands: {
    dominant: {
      keyframes: [
        { t: 0, shape: open, orient: { palm: 'toViewer', fingers: 'up' }, pos: { at: 'neutral' } },
        { t: 1, shape: fist, orient: { palm: 'down', fingers: 'toViewer' }, pos: { at: 'neutral', offset: [-1, 0, 0] }, ease: 'linear' },
        { t: 2, pos: { at: 'neutral', offset: [-1, -1, 0] }, ease: 'linear' },
      ],
    },
  },
};

describe('再生の補間', () => {
  it('最初と最後の Keyframe の形・向き・位置をそのまま通る（最後の形で止まる）', () => {
    const c = compileSign(moving);
    expect(c.duration).toBe(2);
    const f0 = sampleSign(c, 0);
    expect(f0.dominant.pose).toEqual(solveHandshape(open).pose);
    expect(angleBetween(colZ(f0.dominant.rot), [0, 0, 1])).toBeLessThan(1e-9);
    const end = sampleSign(c, 99);
    expect(end.dominant.pose).toEqual(solveHandshape(fist).pose);
    expect(angleBetween(colZ(end.dominant.rot), [0, -1, 0])).toBeLessThan(1e-9);
    const anchor = (f: ReturnType<typeof sampleSign>) => {
      const p = mulMV(f.dominant.rot, PALM_CENTER);
      return [f.dominant.wrist[0] + p[0], f.dominant.wrist[1] + p[1], f.dominant.wrist[2] + p[2]] as Vec3;
    };
    expect(distance(anchor(end), resolvePosition({ at: 'neutral', offset: [-1, -1, 0] }))).toBeLessThan(1e-9);
    expect(distance(anchor(sampleSign(c, 1)), resolvePosition({ at: 'neutral', offset: [-1, 0, 0] }))).toBeLessThan(1e-9);
  });

  it('関節角度は線形、回転は球面線形（中間で回転角のちょうど半分）', () => {
    const c = compileSign(moving);
    const mid = sampleSign(c, 0.5);
    const a = solveHandshape(open).pose, b = solveHandshape(fist).pose;
    expect(mid.dominant.pose.index.mcp).toBeCloseTo((a.index.mcp + b.index.mcp) / 2, 9);
    // 手のひら +Z → −Y、指先 +Y → +Z は X 軸まわりの 90° 回転。中間は 45°
    expect(angleBetween(colY(mid.dominant.rot), [0, 1, 0]) * DEG).toBeCloseTo(45, 6);
    expect(angleBetween(colZ(mid.dominant.rot), [0, 0, 1]) * DEG).toBeCloseTo(45, 6);
  });

  it('ease の始点と終点', () => {
    for (const k of ['linear', 'inOut', 'out'] as const) {
      expect(ease(k, 0)).toBe(0);
      expect(ease(k, 1)).toBe(1);
    }
    expect(ease('inOut', 0.5)).toBeCloseTo(0.5, 12);
  });

  it('動きのない形は isStatic で、「もう一度」は力を抜いた手から形を作る動きになる', () => {
    const c = compileSign(SAMPLES.find((s) => s.id === 'a')!.spec);
    expect(c.isStatic).toBe(true);
    const f = formationOf(c);
    expect(f.isStatic).toBe(false);
    expect(sampleSign(f, 0).dominant.pose).toEqual(REST_POSE);
    expect(sampleSign(f, f.duration).dominant.pose).toEqual(sampleSign(c, 0).dominant.pose);
  });
});

describe('空中に字を書く（trace）', () => {
  const no = SAMPLES.find((s) => s.id === 'no')!;
  it('指定の指先が、軌跡の最初の点から最後の点までなぞる', () => {
    const c = compileSign(no.spec);
    const tr = c.trace!;
    const tipAt = (t: number) => {
      const f = sampleSign(c, t);
      const p = mulMV(f.dominant.rot, pointOf(skeleton(f.dominant.pose), tr.tip));
      return [f.dominant.wrist[0] + p[0], f.dominant.wrist[1] + p[1], f.dominant.wrist[2] + p[2]] as Vec3;
    };
    expect(distance(tipAt(tr.tStart), tr.path[0]!)).toBeLessThan(1e-9);
    expect(distance(tipAt(tr.tEnd), tr.path[tr.path.length - 1]!)).toBeLessThan(1e-9);
    expect(sampleSign(c, tr.tStart).trace!.progress).toBe(0);
    expect(sampleSign(c, tr.tEnd).trace!.progress).toBe(1);
  });

  it('の は相手から見て左上→右下へ書く（表す人の右上→左下）', () => {
    const c = compileSign(no.spec);
    const first = c.trace!.path[0]!, last = c.trace!.path[c.trace!.path.length - 1]!;
    expect(last[0]).toBeGreaterThan(first[0]);
    expect(last[1]).toBeLessThan(first[1]);
  });

  it("relativeTo: 'tipStart' の点は、動き出す時点の指先からのずれ", () => {
    const c = compileSign(no.spec);
    const k = no.spec.hands.dominant.keyframes[0]!;
    const st = sampleSign(compileSign({ hands: { dominant: { keyframes: [k] } } }), 0).dominant;
    const p = mulMV(st.rot, pointOf(skeleton(st.pose), 'index.tip'));
    const tip0: Vec3 = [st.wrist[0] + p[0], st.wrist[1] + p[1], st.wrist[2] + p[2]];
    expect(distance(c.trace!.path[0]!, tip0)).toBeLessThan(1e-9);
  });
});

describe('が（濁音）', () => {
  it('か の形のまま、手全体が相手から見て左（−X）へ動く', () => {
    const ga = SAMPLES.find((s) => s.id === 'ga')!;
    const c = compileSign(ga.spec);
    const a = sampleSign(c, 0), b = sampleSign(c, c.duration);
    expect(b.dominant.wrist[0]).toBeLessThan(a.dominant.wrist[0] - 0.8);
    expect(b.dominant.pose).toEqual(a.dominant.pose);
  });
});
