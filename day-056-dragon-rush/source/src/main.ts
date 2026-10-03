// OWNER: core
// 入口。URL の引数でモード（遊び・撮影・コマ撮り・計測）を選ぶ。
import { App } from './app';
import { parseSettings } from './core/settings';
import './harness/globals';
import { runPerf } from './harness/perfRunner';
import { nextFrame, runFilm, runShot } from './harness/shotRunner';
import { runPlay } from './play';
import { isTouchDevice } from './mobile/input';
import { getLoadingScreen, loadingPaint } from '../../loading.mjs';

async function boot(): Promise<void> {
  const loading = getLoadingScreen();
  const task = loading.snapshot.id || loading.begin({ title: '街と怪獣を準備しています',
    steps: ['ゲーム', '街', '怪獣', '描画', '操作'], detail: 'ゲーム本体を読み込んでいます…' });
  if (loading.snapshot.status === 'error') return;
  const settings = parseSettings(window.location.search);
  if (settings.mode === 'play' && isTouchDevice()) {
    settings.quality = 'low';
    document.body.classList.add('dr-mobile');
  }
  const container = document.getElementById('app');
  if (!container) throw new Error('#app が無い');
  loading.step(task, 1, '夕暮れの街を組み立てています…');
  await loadingPaint();
  const app = new App(container, settings);
  window.__app = app;
  await app.init(async (phase, name) => {
    loading.step(task, phase === 'model' ? 2 : 3,
      phase === 'model' ? `${name}のモデルを読み込んでいます…` : '街と怪獣の描画を準備しています…');
    await loadingPaint();
  });
  app.renderFrame(0);
  await nextFrame();
  window.__firstFrameMs = performance.now();
  window.__appReady = true;
  if (settings.mode !== 'play') loading.finish(task);

  switch (settings.mode) {
    case 'shot':
      await runShot(app, settings.shotName ?? 'overview');
      break;
    case 'film':
      await runFilm(app, settings.shotName ?? 'overview', settings.filmFrames, settings.externalDrive);
      break;
    case 'perf':
      await runPerf(app, settings.perfSeconds);
      break;
    default:
      loading.step(task, 4, '技・音・操作を準備しています…');
      await loadingPaint();
      await runPlay(app);
      await nextFrame();
      loading.finish(task);
  }
}

boot().catch((err: unknown) => {
  const message = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  window.__appError = message;
  const loading = getLoadingScreen();
  loading.fail(loading.snapshot.id, '街や怪獣の準備に失敗しました。通信状況とWebGL2対応を確認し、再読み込みしてください。');
  console.error('boot failed:', message);
});
