import { describe, expect, it } from 'vitest';
import { landmarks } from '../../../src/hand';
import type { Dir, HandshapeSpec, Orientation, Vec3 } from '../../../src/hand/types';
import { angleBetween, cross, normalize, sub } from '../../../src/hand/core/math';
import { dirVector } from '../../../src/hand/core/orient';
import { SAMPLES } from '../../../src/hand/dev/samples';

const DEG = 180 / Math.PI;
const NAMED: Dir[] = ['toViewer', 'toSigner', 'up', 'down', 'viewerLeft', 'viewerRight'];

/** 21点から読み取った向き: 指先＝手首→中指の付け根、手のひら＝(人差し指の付け根−手首)×(小指の付け根−手首) */
function measured(p: Vec3[], left = false): { fingers: Vec3; palm: Vec3 } {
  const a = sub(p[5]!, p[0]!), b = sub(p[17]!, p[0]!);
  // 左手は鏡写しなので、同じ順の外積は手のひらと逆を向く
  return { fingers: normalize(p[9]!), palm: normalize(left ? cross(b, a) : cross(a, b)) };
}

const shapes: Array<[string, HandshapeSpec]> = [
  ['平らな手', { fingers: { index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended' }, thumb: 'alongside' }],
  ...SAMPLES.map((s) => [s.label, s.spec.hands.dominant.keyframes[0]!.shape!] as [string, HandshapeSpec]),
];

const orientations: Orientation[] = [];
for (const palm of NAMED) for (const fingers of NAMED) {
  if (Math.abs(dirVector(palm).reduce((s, v, i) => s + v * dirVector(fingers)[i]!, 0)) < 1e-9) orientations.push({ palm, fingers });
}
// 斜めの指定（直交していない2つも含む）
orientations.push(
  { palm: [0, 0.3, 1], fingers: [0, 1, -0.3] },
  { palm: [1, 0, 1], fingers: [0, 1, 0] },
  { palm: [0.2, -0.1, 1], fingers: [0.15, 1, 0.1] },
  // 直交から14°ずれた指定: 2つの方向を7°ずつ開いて直交させる
  { palm: [0, 0.25, 1], fingers: [0, 1, 0] },
);

describe('向き（手のひら・指先）が指定から10度以内', () => {
  it('6方向の組み合わせ24通りと斜め4通りを、全部の試作の形で', () => {
    expect(orientations).toHaveLength(28);
    for (const [label, shape] of shapes) {
      for (const o of orientations) {
        const m = measured(landmarks(shape, o));
        const f = angleBetween(m.fingers, dirVector(o.fingers)) * DEG;
        const pl = angleBetween(m.palm, dirVector(o.palm)) * DEG;
        expect(f, `${label} ${JSON.stringify(o)} 指先`).toBeLessThanOrEqual(10);
        expect(pl, `${label} ${JSON.stringify(o)} 手のひら`).toBeLessThanOrEqual(10);
      }
    }
  });

  it('左手は、右手の向きを X で反転した向きになる', () => {
    const mirror = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];
    for (const o of orientations) {
      const m = measured(landmarks(shapes[0]![1], o, 'left'), true);
      expect(angleBetween(m.fingers, mirror(dirVector(o.fingers))) * DEG).toBeLessThanOrEqual(10);
      expect(angleBetween(m.palm, mirror(dirVector(o.palm))) * DEG).toBeLessThanOrEqual(10);
    }
  });

  it('お（手のひらを相手から見て右）の手のひらは +X、ほかの試作は相手（+Z）を向く', () => {
    for (const s of SAMPLES) {
      const k = s.spec.hands.dominant.keyframes[0]!;
      const m = measured(landmarks(k.shape!, k.orient!));
      const want: Vec3 = s.id === 'o' ? [1, 0, 0] : [0, 0, 1];
      expect(angleBetween(m.palm, want) * DEG, s.label).toBeLessThanOrEqual(10);
      expect(angleBetween(m.fingers, [0, 1, 0]) * DEG, s.label).toBeLessThanOrEqual(10);
    }
  });
});
