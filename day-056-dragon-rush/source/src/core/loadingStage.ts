// 表示の描画を待つ間も、モデルの失敗を直ちに受け取る。
export async function waitForLoadingStage(ready: Promise<void>, paint: () => void | Promise<void>): Promise<void> {
  await Promise.all([ready, Promise.resolve().then(paint)]);
}
