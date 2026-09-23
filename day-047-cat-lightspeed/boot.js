export function failure(message) {
  document.getElementById('app').dataset.state='error';
  for(const id of ['loading-screen','start-screen','result-screen'])document.getElementById(id).hidden=true;
  document.getElementById('fatal-screen').hidden=false;document.getElementById('fatal-message').textContent=message;
}
document.getElementById('reload-page').addEventListener('click',()=>location.reload());
import('./app3d.js').catch(()=>failure('3D描画を開始できませんでした。WebGL対応とブラウザのハードウェアアクセラレーションを確認し、もう一度お試しください。'));
