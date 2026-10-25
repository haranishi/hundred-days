import type { ConvertImages, ConversionError, ImageOptions, RunContext, SourceFile } from '../../shared/contracts';
import { ConversionFailure } from '../../shared/errors';
import { LIMITS } from '../../shared/limits';
import { validateOptions } from './options';
import { toImageError } from './errors';
import type { ImageWorkerRequest, ImageWorkerResponse } from './worker-contract';

export type ImageWorkerPort = Pick<Worker, 'postMessage' | 'terminate'> & {
  onmessage: ((event: MessageEvent<ImageWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
};
export type ImageWorkerFactory = () => ImageWorkerPort;
const defaultFactory: ImageWorkerFactory = () => new Worker(new URL('./image.worker.ts', import.meta.url), { type: 'module' });

export async function runImageBatch(sources: readonly SourceFile[], options: ImageOptions, context: RunContext, factory: ImageWorkerFactory = defaultFactory): Promise<void> {
  const files = [...sources];
  const terminal = new Set<string>();
  let worker: ImageWorkerPort | undefined;
  let interruptCurrent: (() => void) | undefined;
  let retainedBytes = 0;
  const runId = crypto.randomUUID();
  function failed(id: string, error: ConversionError): void {
    if (terminal.has(id) || context.signal.aborted) return;
    terminal.add(id);
    context.emit({ type: 'error', id, error });
    context.emit({ type: 'state', id, state: 'failed' });
  }
  function cancelled(): void {
    worker?.terminate(); worker = undefined;
    for (const { id } of files) if (!terminal.has(id)) { terminal.add(id); context.emit({ type: 'state', id, state: 'cancelled' }); }
    interruptCurrent?.();
  }
  if (context.signal.aborted) { cancelled(); return; }
  try {
    validateOptions(options);
    if (files.length > LIMITS.imageCount || files.reduce((sum, source) => sum + source.file.size, 0) > LIMITS.imageBatchBytes) {
      throw new ConversionFailure('LIMIT_EXCEEDED', '画像は10件、合計30MiB以内で選んでください。');
    }
  } catch (cause) {
    for (const { id } of files) failed(id, toImageError(cause));
    return;
  }
  const snapshot = structuredClone(options);
  for (const { id } of files) context.emit({ type: 'state', id, state: 'queued' });
  context.signal.addEventListener('abort', cancelled, { once: true });
  if (context.signal.aborted) cancelled();
  try {
    for (const source of files) {
      if (context.signal.aborted) break;
      try { worker ??= factory(); }
      catch {
        failed(source.id, { code: 'UNSUPPORTED', retryable: true, message: '画像変換を開始できませんでした。ブラウザを更新して再試行してください。' });
        continue;
      }
      const activeWorker = worker;
      await new Promise<void>(resolve => {
        let settled = false;
        const finish = (): void => { if (settled) return; settled = true; interruptCurrent = undefined; resolve(); };
        interruptCurrent = finish;
        activeWorker.onmessage = event => {
          const response = event.data;
          if (settled || response.runId !== runId || response.id !== source.id || context.signal.aborted) return;
          if (response.type === 'state') { context.emit({ type: 'state', id: source.id, state: response.state }); return; }
          if (response.type === 'error') { failed(source.id, response.error); finish(); return; }
          const artifact = response.artifact;
          if (artifact.size > LIMITS.imageOutputBytes || retainedBytes + artifact.size > LIMITS.imageResultsBytes) {
            failed(source.id, { code: 'LIMIT_EXCEEDED', retryable: false, message: '保持できる出力容量を超えています。枚数か画像サイズを減らしてください。' });
          } else {
            retainedBytes += artifact.size;
            terminal.add(source.id);
            context.emit({ type: 'result', id: source.id, artifact });
            context.emit({ type: 'state', id: source.id, state: 'succeeded' });
          }
          finish();
        };
        const crashed = (): void => {
          if (settled || context.signal.aborted) return;
          activeWorker.terminate(); worker = undefined;
          failed(source.id, { code: 'MEMORY_LIMIT', retryable: true, message: '画像処理を続けられませんでした。画像を小さくして再試行してください。' });
          finish();
        };
        activeWorker.onerror = event => { event.preventDefault?.(); crashed(); };
        activeWorker.onmessageerror = crashed;
        const request: ImageWorkerRequest = { type: 'convert', runId, source, options: snapshot };
        try { activeWorker.postMessage(request); }
        catch { crashed(); }
      });
    }
  } finally {
    context.signal.removeEventListener('abort', cancelled);
    worker?.terminate();
    worker = undefined;
  }
}
export const convertImages: ConvertImages = (sources, options, context) => runImageBatch(sources, options, context);
