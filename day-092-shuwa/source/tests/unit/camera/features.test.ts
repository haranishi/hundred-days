import { describe, expect, it } from 'vitest';
import { landmarks } from '../../../src/hand';
import { features, fingerState, FINGERS, THRESHOLDS, worldToScene } from '../../../src/camera/features';
import { forward, noise, open, rotate, world } from './fixtures';
import type { FingerState, Vec3 } from '../../../src/hand/types';

describe('21点からの特徴', () => {
  it.each([
    ['extended', 'extended', 0, 3], ['bentMcp', 'bent', 88, 0],
    ['hooked', 'bent', 0, 92], ['half', 'bent', 35, 45], ['curled', 'curled', 86, 98],
  ] as const)('%sを%sとして分ける（既存骨格の角度）', (state, expected, mcp, pip) => {
    const shape = { ...open, fingers: Object.fromEntries(FINGERS.map(f => [f, state])) as Record<typeof FINGERS[number], FingerState> };
    const ps = landmarks(shape, forward);
    const f = features(ps)!;
    expect(f).not.toBeNull();
    for (const finger of FINGERS) {
      expect(f.fingers[finger].state).toBe(expected);
      // spread/中指の付け根の1.7度の傾きを含めても表の角度との差は25度以内。
      expect(Math.abs(f.fingers[finger].mcp - mcp)).toBeLessThan(25);
      expect(f.fingers[finger].pip).toBeCloseTo(pip, 5);
      for (const axis of [0, 1, 2] as const) {
        const rotated = features(rotate(ps, axis, 10))!;
        expect(rotated.fingers[finger].mcp).toBeCloseTo(f.fingers[finger].mcp, 6);
        expect(rotated.fingers[finger].pip).toBeCloseTo(f.fingers[finger].pip, 4);
      }
    }
  });

  it('3段階の境界を定数で持つ', () => {
    expect(fingerState(THRESHOLDS.extendedMcp, THRESHOLDS.extendedPip)).toBe('extended');
    expect(fingerState(THRESHOLDS.extendedMcp + 0.1, 0)).toBe('bent');
    expect(fingerState(0, THRESHOLDS.extendedPip + 0.1)).toBe('bent');
    expect(fingerState(THRESHOLDS.curledMcp, THRESHOLDS.curledPip)).toBe('curled');
    expect(fingerState(THRESHOLDS.curledMcp - 0.1, 98)).toBe('bent');
  });

  it('親指の曲げ・指先との距離・手のひらの面の前後を計算する', () => {
    const ps = landmarks(open, forward), f = features(ps)!;
    expect(f.thumb.extended).toBe(true);
    expect(f.thumb.flex).toBeCloseTo(0, 5);
    for (const [j, finger] of FINGERS.entries()) {
      expect(f.thumb.distances[finger]).toBeCloseTo(Math.hypot(...ps[4]!.map((v, k) => v - ps[8 + 4 * j]![k]!)), 6);
    }
    expect(f.thumb.depth).toBeCloseTo(ps[4]![2], 6);
    expect(f.thumb.front).toBe(true);
    const behind = ps.map((p, i): Vec3 => i >= 1 && i <= 4 ? [p[0], p[1], -p[2]] : [...p]);
    expect(features(behind)!.thumb.front).toBe(false);
  });

  it('6方向との角度・外向きの法線を返す', () => {
    const f = features(landmarks(open, forward))!;
    expect(f.palm).toEqual([0, -0, 1]);
    expect(f.palmAngles).toEqual({ toViewer: 0, toSigner: 180, up: 90, down: 90, viewerLeft: 90, viewerRight: 90 });
    expect(f.pointingAngles.up).toBeLessThan(2);
    expect(f.pointingAngles.down).toBeGreaterThan(178);
  });

  it('大きさと原点が変わっても特徴は変わらない', () => {
    const ps = landmarks(open, forward);
    const changed = ps.map((p): Vec3 => [p[0] * 0.08 + 0.2, p[1] * 0.08 - 0.1, p[2] * 0.08 + 0.5]);
    const a = features(ps)!, b = features(changed)!;
    for (const finger of FINGERS) {
      expect(b.thumb.distances[finger]).toBeCloseTo(a.thumb.distances[finger], 7);
      expect(b.fingers[finger].mcp).toBeCloseTo(a.fingers[finger].mcp, 7);
    }
  });

  it('左手は設定のX反転だけで同じ特徴になる', () => {
    const right = features(landmarks(open, forward, 'right'))!;
    const left = features(landmarks(open, forward, 'left'), 'left')!;
    expect(left).toEqual(right);
    // handednessを使わず、左手設定を与えなければ腹の向きが逆になる。
    expect(features(landmarks(open, forward, 'left'))!.palmAngles.toSigner).toBe(0);
  });

  it('無効・重なった点・短すぎる骨を成功の特徴にしない', () => {
    expect(features([])).toBeNull();
    expect(features(Array.from({ length: 21 }, (): Vec3 => [0, 0, 0]))).toBeNull();
    const ps = landmarks(open, forward);
    ps[8] = [NaN, 0, 0]; expect(features(ps)).toBeNull();
    ps[8] = [...ps[7]!]; expect(features(ps)).toBeNull();
    expect(features(noise(landmarks(open, forward), 1))).not.toBeNull();
  });
});

describe('MediaPipe→場の座標（表示の鏡写しとは独立）', () => {
  it.each(['right', 'left'] as const)('%s: 原点と長さをそろえ、Y/Zのみ反転する', hand => {
    const ps = landmarks(open, forward, hand), input = world(ps);
    const original = structuredClone(input);
    const converted = worldToScene(input);
    expect(input).toEqual(original);
    for (let i = 0; i < 21; i++) for (let j = 0; j < 3; j++) expect(converted[i]![j]).toBeCloseTo(ps[i]![j]!, 8);
    expect(features(converted, hand)!.palmAngles.toViewer).toBe(0);
  });
  it('Xを反転せず、既存バッファと点の配列を再利用する', () => {
    const ps = landmarks(open, forward), buffer: Vec3[] = Array.from({ length: 21 }, () => [0, 0, 0]);
    const point = buffer[4];
    expect(worldToScene(world(ps), buffer)).toBe(buffer);
    expect(buffer[4]).toBe(point);
    expect(buffer[4]![0]).toBeCloseTo(ps[4]![0]);
    expect(worldToScene([])).toEqual([]);
    expect(worldToScene(Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })))).toEqual([]);
  });
});
