import type { ConversionError } from '../../shared/contracts';
import { ConversionFailure, toConversionError } from '../../shared/errors';
export { ConversionFailure as ImageProcessingError } from '../../shared/errors';

export function toImageError(cause: unknown): ConversionError {
  if (cause instanceof ConversionFailure) return toConversionError(cause);
  return { code: 'ENCODE_FAILED', retryable: true, message: '画像を書き出せませんでした。形式かサイズを変更して再試行してください。' };
}
