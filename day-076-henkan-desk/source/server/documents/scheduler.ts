import { randomUUID } from 'node:crypto';
import { LIMITS } from '../../src/shared/limits.js';
import { abortError, checkAbort, DocumentError } from './errors.js';
export interface Lease { id: string; signal: AbortSignal; deadline: number; abort(reason?: DocumentError): void; run<T>(operation: () => Promise<T>): Promise<T>; release(): void; }
interface Queued { id: string; signal: AbortSignal; start: () => void; reject: (reason: unknown) => void; }
export class DocumentScheduler {
  private readonly reservations = new Map<string, AbortController>();
  private readonly queue: Queued[] = [];
  private active: string | undefined;
  private closed = false;
  constructor(private readonly timeoutMs: number = LIMITS.documentTimeoutMs) {}
  reserve(): Lease {
    if (this.closed) throw new DocumentError('UNAVAILABLE', '文書変換を準備しています。しばらくして再試行してください。', true);
    if (this.reservations.size >= LIMITS.documentQueue + 1) throw new DocumentError('BUSY', '変換が混み合っています。5秒ほど待って再試行してください。', true);
    const id = randomUUID(), controller = new AbortController(), deadline = Date.now() + this.timeoutMs;
    this.reservations.set(id, controller);
    const timer = setTimeout(() => controller.abort(new DocumentError('TIMEOUT', '制限時間を超えました。文書を小さくして再試行してください。', true)), this.timeoutMs);
    timer.unref();
    let released = false, started = false;
    const release = () => { if (released) return; released = true; clearTimeout(timer); this.reservations.delete(id); };
    return { id, signal: controller.signal, deadline, abort: reason => controller.abort(reason || new DocumentError('CANCELLED', '変換を取り消しました。')), release,
      run: <T>(operation: () => Promise<T>) => {
        if (started) return Promise.reject(new DocumentError('INTERNAL', '同じ処理は再実行できません。'));
        started = true;
        return new Promise<T>((resolve, reject) => {
          const onAbort = () => { const index = this.queue.findIndex(item => item.id === id); if (index >= 0) { this.queue.splice(index, 1); reject(abortError(controller.signal)); } };
          controller.signal.addEventListener('abort', onAbort, { once: true });
          this.queue.push({ id, signal: controller.signal, reject, start: () => {
            controller.signal.removeEventListener('abort', onAbort); this.active = id;
            Promise.resolve().then(() => { checkAbort(controller.signal); return operation(); }).then(resolve, reject).finally(() => { this.active = undefined; this.pump(); });
          } });
          if (controller.signal.aborted) onAbort(); else this.pump();
        });
      } };
  }
  private pump(): void { if (this.active || this.closed) return; const item = this.queue.shift(); if (!item) return; if (item.signal.aborted) { item.reject(abortError(item.signal)); this.pump(); } else item.start(); }
  close(): void { this.closed = true; const reason = new DocumentError('UNAVAILABLE', '文書変換を停止しています。再試行してください。', true); for (const controller of this.reservations.values()) controller.abort(reason); while (this.queue.length) this.queue.shift()?.reject(reason); }
  get count(): number { return this.reservations.size; }
}
