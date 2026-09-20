const failure = message => {
  document.getElementById('loading-screen').hidden = true;
  document.getElementById('fatal-screen').hidden = false;
  document.getElementById('fatal-message').textContent = message;
};
document.getElementById('reload-page').addEventListener('click', () => location.reload());
import('./app3d.js').catch(() => failure('3D描画を開始できませんでした。ブラウザのハードウェアアクセラレーションやWebGL対応を確認して、もう一度お試しください。'));
