import type { ConversionError, ErrorCode } from '../../src/shared/contracts.js';
export class DocumentError extends Error {
  constructor(readonly code: ErrorCode, message: string, readonly retryable = false, readonly statusCode?: number) { super(message); this.name = 'DocumentError'; }
}
export function documentError(error: unknown): DocumentError {
  return error instanceof DocumentError ? error : new DocumentError('INTERNAL', '文書を変換できませんでした。ファイルを選び直してください。', true);
}
export function errorBody(error: DocumentError): ConversionError { return { code: error.code, message: error.message, retryable: error.retryable }; }
export function errorStatus(error: DocumentError): number {
  return error.statusCode ?? ({ UNSUPPORTED: 415, INVALID_FILE: 422, LIMIT_EXCEEDED: 413, PASSWORD_PROTECTED: 422, UNSAFE_DOCUMENT: 422, CONSENT_REQUIRED: 403, BUSY: 429, TIMEOUT: 504, NETWORK: 503, UNAVAILABLE: 503, CANCELLED: 499, INTERNAL: 500, ENCODE_FAILED: 422, MEMORY_LIMIT: 413 } as const)[error.code];
}
export function abortError(signal: AbortSignal): DocumentError {
  return signal.reason instanceof DocumentError ? signal.reason : new DocumentError('CANCELLED', '変換を取り消しました。');
}
export function checkAbort(signal: AbortSignal): void { if (signal.aborted) throw abortError(signal); }
