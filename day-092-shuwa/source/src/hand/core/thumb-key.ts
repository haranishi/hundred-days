import type { SignSpec, ThumbnailOptions } from '../types';
import { stableStringify } from './stable';
import { defaultThumbnailAt } from './thumb-time';

/**
 * 小さな画像のキャッシュの鍵。既定値を埋めてから、キーの順に左右されない形で文字列にする。
 * 時点の既定は形によって違う（上半身つきは最初の止まる区間の真ん中・ほかは最後）ので、既定の名前で埋める
 */
export function thumbnailKey(spec: SignSpec, opts: ThumbnailOptions = {}): string {
  return stableStringify([spec, opts.perspective ?? 'viewer', opts.dominant ?? 'right', Math.round(opts.size ?? 256), opts.at ?? defaultThumbnailAt(spec)]);
}
