/**
 * hand-model の公開窓口。learning-app と camera-check はここから import する（中の実装を直接 import しない）。
 * three.js を使う描画部分は、HandView と renderThumbnail が初めて使われた時に動的 import で読み込む。
 * landmarks() は three.js に依存しない計算だけで動く（同期・軽い）。
 */
import type { Handedness, HandshapeSpec, Orientation, SignSpec, ThumbnailOptions, Vec3 } from './types';
import { computeLandmarks } from './core/landmarks';
import { thumbnailKey } from './core/thumb-key';
import { loadRuntime } from './view';

export type * from './types';
export { HandView } from './view';

const cache = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();

function fallbackThumbnail(size: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><rect width="100" height="100" rx="16" fill="#EEF0FB"/><text x="50" y="58" font-size="18" text-anchor="middle" fill="#4C5FD5">手</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * 選択肢・一覧用の小さな画像の URL。同じ引数なら同じ URL を返す（一度作った画像は作り直さない）。
 * 同時に呼ばれても、共有の描画器で1枚ずつ順に描く。3D が描けない環境では代わりの画像を返す。
 */
export function renderThumbnail(spec: SignSpec, opts: ThumbnailOptions = {}): Promise<string> {
  const key = thumbnailKey(spec, opts);
  const hit = cache.get(key);
  if (hit) return hit;
  const job = queue.then(async () => {
    let url: string | null = null;
    try {
      const rt = await loadRuntime();
      url = await rt.renderThumbnailImage(spec, opts);
    } catch {
      url = null;
    }
    if (url) return url;
    // 描けなかった時は代わりの画像を返し、次に呼ばれた時に描き直せるよう記憶から外す
    cache.delete(key);
    return fallbackThumbnail(Math.round(opts.size ?? 256));
  });
  queue = job.catch(() => undefined);
  cache.set(key, job);
  return job;
}

/** 形の21点の関節位置（場の座標・手首が原点・向きを適用済み）。並びは MediaPipe Hand Landmarker と同じ */
export function landmarks(shape: HandshapeSpec, orient: Orientation, dominant: Handedness = 'right'): Vec3[] {
  return computeLandmarks(shape, orient, dominant);
}
