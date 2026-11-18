/**
 * 入口。3Dの舞台（#stage）・HUD（#hud）・画面（#screens）をつなぎ、アプリを起こす。
 */
import { App } from './app';
import { installDebug } from './debug';

function start(): void {
  const stage = document.getElementById('stage');
  const hud = document.getElementById('hud');
  const screens = document.getElementById('screens');
  if (!stage || !hud || !screens) throw new Error('#stage・#hud・#screens が見つかりません');
  const app = new App(stage, hud, screens);
  installDebug(app);
  app.boot().catch((err: unknown) => {
    console.error(err);
    app.screens.showError('3Dの準備に失敗しました。ブラウザを新しくするか、別のブラウザでお試しください', () => location.reload());
  });
}

start();
