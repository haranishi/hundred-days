import { describe, expect, it } from 'vitest';
import { waitForLoadingStage } from '../../src/core/loadingStage';

describe('モデルと読み込み画面の準備', () => {
  it('モデルと画面の両方が終わるまで完了しない', async () => {
    let finishModel!: () => void, finishPaint!: () => void, done = false;
    const model = new Promise<void>(resolve => { finishModel = resolve; });
    const paint = new Promise<void>(resolve => { finishPaint = resolve; });
    const result = waitForLoadingStage(model, () => paint).then(() => { done = true; });
    finishModel(); await Promise.resolve(); await Promise.resolve();
    expect(done).toBe(false);
    finishPaint(); await result;
    expect(done).toBe(true);
  });
  it('画面がまだ描けなくても、モデルの即時失敗を取りこぼさない', async () => {
    const error = new Error('503 model');
    await expect(waitForLoadingStage(Promise.reject(error), () => new Promise<void>(() => {}))).rejects.toBe(error);
  }, 1000);
  it('モデルが未完了でも画面処理の失敗を呼び出し側へ返す', async () => {
    const error = new Error('paint failed');
    await expect(waitForLoadingStage(new Promise<void>(() => {}), () => { throw error; })).rejects.toBe(error);
  }, 1000);
});
