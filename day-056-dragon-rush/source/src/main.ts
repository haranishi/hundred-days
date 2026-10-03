// OWNER: core
// 入口。URL の引数でモード（遊び・撮影・コマ撮り・計測）を選ぶ。
import { App } from './app';
import { parseSettings } from './core/settings';
import './harness/globals';
import { runPerf } from './harness/perfRunner';
import { nextFrame, runFilm, runShot } from './harness/shotRunner';
import { runPlay } from './play';

async function boot(): Promise<void> {
  const settings = parseSettings(window.location.search);
  const container = document.getElementById('app');
  if (!container) throw new Error('#app が無い');
  const app = new App(container, settings);
  window.__app = app;
  await app.init();
  app.renderFrame(0);
  await nextFrame();
  window.__firstFrameMs = performance.now();
  window.__appReady = true;

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
      await runPlay(app);
  }
}

boot().catch((err: unknown) => {
  const message = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  window.__appError = message;
  console.error('boot failed:', message);
});
