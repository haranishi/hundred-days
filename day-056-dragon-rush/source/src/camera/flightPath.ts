// OWNER: camera
// 性能計測用の固定の飛行経路。時刻から位置と注視点が決まる（同じ時刻なら必ず同じ絵）。
import { CatmullRomCurve3, Vector3 } from 'three';
import { PERF } from '../config/perf';

export class FlightPath {
  private readonly curve = new CatmullRomCurve3(
    PERF.path.map(([x, y, z]) => new Vector3(x, y, z)),
    true,
    'centripetal',
  );

  /** t 秒のときのカメラ位置と注視点。 */
  at(t: number, position: Vector3, target: Vector3): void {
    const u = (((t / PERF.loopSeconds) % 1) + 1) % 1;
    this.curve.getPointAt(u, position);
    this.curve.getPointAt((u + PERF.lookAhead) % 1, target);
    target.y -= 12;
  }
}
