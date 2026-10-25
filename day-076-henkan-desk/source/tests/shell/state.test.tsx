// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useConversion } from '../../src/app/useConversion';
import type { Artifact, RunContext, SourceFile } from '../../src/shared/contracts';
const sources: SourceFile[] = [{ id: 'a', file: new File(['a'], 'a.png') }, { id: 'b', file: new File(['b'], 'b.png') }];
const artifact: Artifact = { id: 'a', blob: new Blob(['a']), filename: 'a.png', mime: 'image/png', size: 1 };
describe('run lifecycle', () => {
  it('preserves a success when another file fails', async () => {
    const { result } = renderHook(() => useConversion(sources));
    act(() => result.current.startRun(async context => { context.emit({ type: 'result', id: 'a', artifact }); context.emit({ type: 'state', id: 'a', state: 'succeeded' }); context.emit({ type: 'error', id: 'b', error: { code: 'INVALID_FILE', message: 'broken', retryable: false } }); context.emit({ type: 'state', id: 'b', state: 'failed' }); }));
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.rows.a.artifact).toBe(artifact); expect(result.current.rows.b.state).toBe('failed');
  });
  it('ignores late results after cancellation and keeps completed files', async () => {
    const { result } = renderHook(() => useConversion(sources)); let context: RunContext | undefined; let finish: (() => void) | undefined;
    act(() => result.current.startRun(value => { context = value; value.emit({ type: 'result', id: 'a', artifact }); value.emit({ type: 'state', id: 'a', state: 'succeeded' }); return new Promise<void>(resolve => { finish = resolve; }); }));
    await waitFor(() => expect(context).toBeDefined()); act(() => result.current.cancel());
    act(() => { context!.emit({ type: 'result', id: 'b', artifact: { ...artifact, id: 'b' } }); context!.emit({ type: 'state', id: 'b', state: 'succeeded' }); finish!(); });
    expect(result.current.rows.a.artifact).toBe(artifact); expect(result.current.rows.b.state).toBe('cancelled'); expect(result.current.rows.b.artifact).toBeUndefined();
  });
  it('releases previous results before a new run', async () => {
    const { result } = renderHook(() => useConversion(sources));
    act(() => result.current.startRun(async context => { context.emit({ type: 'result', id: 'a', artifact }); context.emit({ type: 'state', id: 'a', state: 'succeeded' }); }));
    await waitFor(() => expect(result.current.busy).toBe(false));
    act(() => result.current.startRun(async () => {})); expect(result.current.rows.a.artifact).toBeUndefined();
    await waitFor(() => expect(result.current.busy).toBe(false));
  });
});
