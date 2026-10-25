import { describe, expect, it } from 'vitest';
import type { Artifact, ConversionEvent, SourceFile } from '../../src/shared/contracts';
import { runImageBatch, type ImageWorkerPort } from '../../src/features/images/convert';
import { DEFAULT_IMAGE_OPTIONS } from '../../src/features/images/options';
import type { ImageWorkerRequest, ImageWorkerResponse } from '../../src/features/images/worker-contract';
import { LIMITS } from '../../src/shared/limits';

class FakeWorker implements ImageWorkerPort {
  onmessage: ((event: MessageEvent<ImageWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  terminated = false;
  constructor(readonly run: (worker: FakeWorker, request: ImageWorkerRequest) => void) {}
  postMessage(message: ImageWorkerRequest): void { queueMicrotask(() => this.run(this, message)); }
  terminate(): void { this.terminated = true; }
  respond(request: ImageWorkerRequest, result: Omit<Artifact, 'id'>): void {
    this.onmessage?.({ data: { runId: request.runId, id: request.source.id, type: 'result', artifact: { ...result, id: request.source.id } } } as MessageEvent<ImageWorkerResponse>);
  }
}
function source(id: string, size = 1): SourceFile { return { id, file: new File([new Uint8Array(size)], `${id}.png`, { type: 'image/png' }) }; }
function artifact(size = 4): Omit<Artifact, 'id'> { return { blob: new Blob(['test'], { type: 'image/png' }), filename: 'image.png', mime: 'image/png', width: 1, height: 1, size }; }
function states(events: ConversionEvent[], id: string): string[] { return events.filter(e => e.id === id && e.type === 'state').map(e => e.type === 'state' ? e.state : ''); }

describe('image batch controller', () => {
  it('emits each result before its single terminal state and releases the Worker', async () => {
    const events: ConversionEvent[] = [];
    const worker = new FakeWorker((worker, request) => worker.respond(request, artifact()));
    await runImageBatch([source('a'), source('b')], DEFAULT_IMAGE_OPTIONS, { signal: new AbortController().signal, emit: event => events.push(event) }, () => worker);
    expect(states(events, 'a')).toEqual(['queued', 'succeeded']);
    expect(events.filter(e => e.id === 'a').map(e => e.type)).toEqual(['state', 'result', 'state']);
    expect(states(events, 'b')).toEqual(['queued', 'succeeded']);
    expect(worker.terminated).toBe(true);
  });
  it('keeps successful results while cancelling active and pending rows', async () => {
    const events: ConversionEvent[] = [];
    const abort = new AbortController();
    const worker = new FakeWorker((worker, request) => {
      if (request.source.id === 'a') worker.respond(request, artifact());
      else { abort.abort(); worker.respond(request, artifact()); }
    });
    await runImageBatch([source('a'), source('b'), source('c')], DEFAULT_IMAGE_OPTIONS, { signal: abort.signal, emit: event => events.push(event) }, () => worker);
    expect(states(events, 'a')).toEqual(['queued', 'succeeded']);
    expect(states(events, 'b')).toEqual(['queued', 'cancelled']);
    expect(states(events, 'c')).toEqual(['queued', 'cancelled']);
    expect(events.filter(e => e.type === 'result')).toHaveLength(1);
    expect(events.filter(e => e.type === 'error')).toHaveLength(0);
    expect(worker.terminated).toBe(true);
  });
  it('replaces a crashed Worker and continues with the next source', async () => {
    const events: ConversionEvent[] = [];
    const crashed = new FakeWorker(worker => worker.onerror?.({ preventDefault: () => {} } as ErrorEvent));
    const healthy = new FakeWorker((worker, request) => worker.respond(request, artifact()));
    let created = 0;
    await runImageBatch([source('a'), source('b')], DEFAULT_IMAGE_OPTIONS, { signal: new AbortController().signal, emit: event => events.push(event) }, () => created++ ? healthy : crashed);
    expect(states(events, 'a')).toEqual(['queued', 'failed']);
    expect(states(events, 'b')).toEqual(['queued', 'succeeded']);
    expect(crashed.terminated).toBe(true);
    expect(healthy.terminated).toBe(true);
  });
  it('rejects batch capacity before creating a Worker', async () => {
    const events: ConversionEvent[] = [];
    let created = 0;
    await runImageBatch(Array.from({ length: 11 }, (_, i) => source(String(i))), DEFAULT_IMAGE_OPTIONS, { signal: new AbortController().signal, emit: event => events.push(event) }, () => { created++; throw new Error(); });
    expect(created).toBe(0);
    expect(events.filter(e => e.type === 'error')).toHaveLength(11);
    expect(events.every(e => e.type !== 'result')).toBe(true);
  });
  it('does not emit a result that would exceed the run result budget', async () => {
    const events: ConversionEvent[] = [];
    const worker = new FakeWorker((worker, request) => worker.respond(request, artifact(LIMITS.imageOutputBytes)));
    await runImageBatch([source('a'), source('b'), source('c')], DEFAULT_IMAGE_OPTIONS, { signal: new AbortController().signal, emit: event => events.push(event) }, () => worker);
    expect(events.filter(e => e.type === 'result')).toHaveLength(2);
    expect(states(events, 'c')).toEqual(['queued', 'failed']);
  });
  it('cancels an already aborted request without creating a Worker', async () => {
    const events: ConversionEvent[] = [];
    const abort = new AbortController(); abort.abort();
    await runImageBatch([source('a')], DEFAULT_IMAGE_OPTIONS, { signal: abort.signal, emit: event => events.push(event) }, () => { throw new Error('must not create'); });
    expect(states(events, 'a')).toEqual(['cancelled']);
  });
});
