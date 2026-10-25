import { readFile } from 'node:fs/promises';
import { LIMITS } from '../../src/shared/limits.js';
import { abortError, checkAbort, DocumentError } from './errors.js';
import type { OfficeKind } from './formats.js';
export type EngineState = 'ready' | 'running' | 'recovering';
export interface EngineJob { kind?: OfficeKind; id: string; inputPath: string; deadline: number; signal: AbortSignal; }
export interface DocumentEngine { health(): Promise<EngineState>; convert(job: EngineJob): Promise<Buffer>; }
export async function readLimitedBody(response: Response, limit: number, signal: AbortSignal): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new DocumentError('LIMIT_EXCEEDED', '出力PDFが20MiBを超えます。文書を小さくしてください。'); }
  const reader = response.body?.getReader(); if (!reader) throw new DocumentError('INVALID_FILE', '変換結果を受け取れませんでした。');
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { checkAbort(signal); const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) throw new DocumentError('LIMIT_EXCEEDED', '出力PDFが20MiBを超えます。文書を小さくしてください。'); chunks.push(value); } }
  catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}
export class EngineClient implements DocumentEngine {
  constructor(private readonly baseUrl: string) {}
  async health(): Promise<EngineState> {
    try { const response = await fetch(`${this.baseUrl}/internal/v1/health`, { signal: AbortSignal.timeout(1500) }); const data = await response.json() as { state?: unknown }; return response.ok && (data.state === 'ready' || data.state === 'running') ? data.state : 'recovering'; } catch { return 'recovering'; }
  }
  private async waitReady(): Promise<void> {
    const until = Date.now() + 7000;
    while (Date.now() < until) { if (await this.health() === 'ready') return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new DocumentError('UNAVAILABLE', '変換サービスを復旧しています。しばらくして再試行してください。', true);
  }
  async convert(job: EngineJob): Promise<Buffer> {
    checkAbort(job.signal);
    const remaining = job.deadline - Date.now();
    if (remaining <= 0) throw new DocumentError('TIMEOUT', '制限時間を超えました。', true);
    const timeout = AbortSignal.timeout(Math.min(remaining, LIMITS.engineTimeoutMs));
    const signal = AbortSignal.any([job.signal, timeout]);
    try {
      if (await this.health() !== 'ready') await this.waitReady();
      checkAbort(signal);
      const input = await readFile(job.inputPath);
      const response = await fetch(`${this.baseUrl}/internal/v1/convert`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-job-id': job.id, 'x-document-kind': job.kind || 'docx', 'x-deadline-ms': String(Math.min(job.deadline, Date.now() + LIMITS.engineTimeoutMs)) }, body: new Uint8Array(input), signal });
      if (!response.ok) { await response.body?.cancel(); const code = response.status === 504 ? 'TIMEOUT' : response.status === 422 ? 'INVALID_FILE' : 'UNAVAILABLE'; throw new DocumentError(code, code === 'INVALID_FILE' ? '文書をPDFに変換できませんでした。Officeで保存し直してください。' : '変換サービスで処理を完了できませんでした。再試行してください。', code !== 'INVALID_FILE'); }
      if (!response.headers.get('content-type')?.startsWith('application/pdf')) throw new DocumentError('INVALID_FILE', '変換結果がPDFではありません。');
      const pdf = await readLimitedBody(response, LIMITS.pdfBytes, signal);
      if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new DocumentError('INVALID_FILE', '変換結果が正しいPDFではありません。');
      checkAbort(signal); return pdf;
    } catch (error) {
      try { const response = await fetch(`${this.baseUrl}/internal/v1/jobs/${job.id}`, { method: 'DELETE', signal: AbortSignal.timeout(5000) }); await response.body?.cancel(); await this.waitReady(); } catch { throw new DocumentError('UNAVAILABLE', '停止処理を確認しています。しばらくして再試行してください。', true); }
      if (job.signal.aborted) throw abortError(job.signal);
      if (timeout.aborted) throw new DocumentError('TIMEOUT', '変換に時間がかかりました。文書を小さくして再試行してください。', true);
      if (error instanceof DocumentError) throw error;
      throw new DocumentError('UNAVAILABLE', '文書変換に接続できません。しばらくして再試行してください。', true);
    }
  }
}
