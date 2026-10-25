import type { ConversionError, ErrorCode } from './contracts';
export class ConversionFailure extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  constructor(code: ErrorCode, message: string, retryable = false) { super(message); this.name = 'ConversionFailure'; this.code = code; this.retryable = retryable; }
}
export function toConversionError(value: unknown): ConversionError {
  if (value instanceof ConversionFailure) return { code: value.code, message: value.message, retryable: value.retryable };
  return { code: 'INTERNAL', message: '処理を完了できませんでした。ファイルを選び直してください。', retryable: true };
}
