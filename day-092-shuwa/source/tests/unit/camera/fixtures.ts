import type { SignItem } from '../../../src/content/types';
import { landmarks } from '../../../src/hand';
import type { HandshapeSpec, Handedness, Orientation, Vec3 } from '../../../src/hand/types';
import type { WorldPoint } from '../../../src/camera/features';

export const open: HandshapeSpec = {
  fingers: { index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended' }, thumb: 'extendedOut',
};
export const forward: Orientation = { palm: 'toViewer', fingers: 'up' };
export function item(id: string, shape: HandshapeSpec = open, orient: Orientation = forward): SignItem {
  return {
    id, kind: 'kana', label: id, sign: { hands: { dominant: { keyframes: [{ t: 0, shape, orient }] } } },
    describe: { viewer: '', self: '' }, sources: [], confidence: 'high', dynamic: false,
  };
}
export function points(i: SignItem, hand: Handedness = 'right'): Vec3[] {
  const frame = i.sign.hands.dominant.keyframes[0]!;
  return landmarks(frame.shape!, frame.orient!, hand);
}
export function noise(ps: readonly Vec3[], seed: number): Vec3[] {
  let state = seed;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) | 0; return (state >>> 0) / 4294967296; };
  // 各座標で、手のひらの長さ1の±2%。手首にも同じ幅を加える。
  return ps.map(p => p.map(v => v + (random() * 2 - 1) * 0.02) as Vec3);
}
export function rotate(ps: readonly Vec3[], axis: 0 | 1 | 2, degree: number): Vec3[] {
  const a = degree * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return ps.map(p => {
    const q: Vec3 = [...p], i = (axis + 1) % 3, j = (axis + 2) % 3;
    q[i] = p[i]! * c - p[j]! * s; q[j] = p[i]! * s + p[j]! * c;
    return q;
  });
}
export function world(ps: readonly Vec3[]): WorldPoint[] {
  return ps.map(p => ({ x: p[0] * 0.09 + 0.1, y: -p[1] * 0.09 + 0.2, z: -p[2] * 0.09 - 0.3 }));
}
