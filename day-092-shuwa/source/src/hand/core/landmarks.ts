import type { Handedness, HandshapeSpec, Orientation, Vec3 } from '../types';
import { mulMV } from './math';
import { orientationMatrix } from './orient';
import { solveHandshape } from './shapes';
import { skeleton, skeletonLandmarks } from './skeleton';

/**
 * 形の21点（場の座標・手首が原点・向きを適用済み）。並びは MediaPipe Hand Landmarker と同じ。
 * 左手は、右手の結果を場の X で反転したもの（利き手が左の人は、右利きのデータを鏡に映した形で表す）。
 */
export function computeLandmarks(shape: HandshapeSpec, orient: Orientation, dominant: Handedness = 'right'): Vec3[] {
  const R = orientationMatrix(orient);
  return skeletonLandmarks(skeleton(solveHandshape(shape).pose)).map((p) => {
    const q = mulMV(R, p);
    return dominant === 'left' ? [0 - q[0], q[1], q[2]] : q;
  });
}
