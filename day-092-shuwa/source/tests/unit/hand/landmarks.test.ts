import { describe, expect, it } from 'vitest';
import { landmarks } from '../../../src/hand';
import type { HandshapeSpec, Orientation, Vec3 } from '../../../src/hand/types';
import { DIM, FINGERS } from '../../../src/hand/core/skeleton';
import { SAMPLES } from '../../../src/hand/dev/samples';

const flat: HandshapeSpec = {
  fingers: { index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended' },
  thumb: 'extendedOut',
};
const FACE: Orientation = { palm: 'toViewer', fingers: 'up' };
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const shapesOf = () => SAMPLES.map((s) => ({ label: s.label, shape: s.spec.hands.dominant.keyframes[0]!.shape!, orient: s.spec.hands.dominant.keyframes[0]!.orient ?? FACE }));

describe('21点の並び（MediaPipe と同じ）', () => {
  it('21点で、0 番の手首が原点', () => {
    const p = landmarks(flat, FACE);
    expect(p).toHaveLength(21);
    expect(p[0]).toEqual([0, 0, 0]);
  });

  it('手首から中指の付け根（9 番）までが手のひらの長さ＝1', () => {
    for (const { shape, orient } of shapesOf()) {
      const p = landmarks(shape, orient);
      expect(dist(p[0]!, p[9]!)).toBeCloseTo(1, 6);
    }
  });

  it('各指の4点が付け根→指先の順で、隣どうしの距離が骨の長さに一致する（1〜4 親指、5〜8 人差し指 … 17〜20 小指）', () => {
    for (const { label, shape, orient } of shapesOf()) {
      const p = landmarks(shape, orient);
      const thumb = [1, 2, 3, 4].map((i) => p[i]!);
      DIM.thumbLen.forEach((len, k) => expect(dist(thumb[k]!, thumb[k + 1]!), `${label} 親指 ${k}`).toBeCloseTo(len, 6));
      FINGERS.forEach((f, fi) => {
        const base = 5 + fi * 4;
        const pts = [0, 1, 2, 3].map((k) => p[base + k]!);
        // 付け根（MCP）は手首からの決まった位置
        expect(dist(pts[0]!, p[0]!), `${label} ${f} の付け根`).toBeCloseTo(Math.hypot(...DIM.mcp[f]), 6);
        DIM.len[f].forEach((len, k) => expect(dist(pts[k]!, pts[k + 1]!), `${label} ${f} ${k}`).toBeCloseTo(len, 6));
      });
    }
  });

  it('右手・手のひらを相手へ・指先を上: 親指の側（人差し指の付け根）が相手から見て右（+X）、小指が左', () => {
    const p = landmarks(flat, FACE);
    expect(p[5]![0]).toBeGreaterThan(p[9]![0]);
    expect(p[9]![0]).toBeGreaterThan(p[13]![0]);
    expect(p[13]![0]).toBeGreaterThan(p[17]![0]);
    expect(p[4]![0]).toBeGreaterThan(p[5]![0]); // 横へ開いた親指の先はさらに右
    expect(p[12]![1]).toBeGreaterThan(p[9]![1]); // 指先は上
  });

  it('伸ばした指の先は付け根より遠く、握った指の先は付け根の近くへ戻る', () => {
    const fist: HandshapeSpec = { fingers: { index: 'curled', middle: 'curled', ring: 'curled', pinky: 'curled' }, thumb: 'acrossFront' };
    const open = landmarks(flat, FACE), closed = landmarks(fist, FACE);
    for (const tip of [8, 12, 16, 20]) {
      expect(dist(open[tip]!, open[0]!)).toBeGreaterThan(1.5);
      expect(dist(closed[tip]!, closed[0]!)).toBeLessThan(1.1);
    }
  });
});

describe('左手', () => {
  it('左手は右手の結果を場の X で反転したもの（全部の形・向き）', () => {
    const orients: Orientation[] = [
      FACE,
      { palm: 'viewerRight', fingers: 'up' },
      { palm: 'down', fingers: 'toViewer' },
      { palm: [0.3, -0.2, 1], fingers: [0.1, 1, 0.2] },
    ];
    for (const { shape } of shapesOf()) {
      for (const o of orients) {
        const r = landmarks(shape, o, 'right');
        const l = landmarks(shape, o, 'left');
        l.forEach((q, i) => {
          expect(q[0]).toBeCloseTo(-r[i]![0], 12);
          expect(q[1]).toBeCloseTo(r[i]![1], 12);
          expect(q[2]).toBeCloseTo(r[i]![2], 12);
        });
      }
    }
  });

  it('左手・手のひらを相手へ: 親指の側が相手から見て左（−X）', () => {
    const p = landmarks(flat, FACE, 'left');
    expect(p[5]![0]).toBeLessThan(p[17]![0]);
  });
});
