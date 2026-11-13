import { describe, expect, it, vi } from 'vitest';
import { blockMediapipeTelemetry, isTelemetryUrl } from '../../../src/camera/no-telemetry';

describe('MediaPipe の利用状況の送信を止める', () => {
  it('記録用の住所だけを止め、ほかの通信はそのまま通す', async () => {
    const calls: string[] = [];
    const target = { fetch: vi.fn(async (input: RequestInfo | URL) => { calls.push(String(input)); return new Response('ok', { status: 200 }); }) as unknown as typeof fetch };
    blockMediapipeTelemetry(target);
    const blocked = await target.fetch('https://odml.pa.googleapis.com/v1/log', { method: 'POST' });
    expect(blocked.status).toBe(204);
    const passed = await target.fetch('./mediapipe/hand_landmarker.task');
    expect(passed.status).toBe(200);
    expect(calls).toEqual(['./mediapipe/hand_landmarker.task']);
  });
  it('住所の判定', () => {
    expect(isTelemetryUrl('https://odml.pa.googleapis.com/v1/log')).toBe(true);
    expect(isTelemetryUrl('https://storage.googleapis.com/mediapipe-models/x.task')).toBe(false);
    expect(isTelemetryUrl('./mediapipe/wasm/vision_wasm_internal.wasm')).toBe(false);
  });
});
