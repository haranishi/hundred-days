const landing = document.querySelector('#landing');
const app = document.querySelector('#app');
const start = document.querySelector('#start');
const status = document.querySelector('#load-status');
const share = document.querySelector('#share-dialog');
const links = document.querySelector('#game-links');
const touchOnly = matchMedia('(pointer: coarse)').matches;
let loaded = false;

if (touchOnly) {
  start.disabled = true;
  start.textContent = 'PCのキーボードとマウスで遊べます';
  start.style.cursor = 'default';
}

document.querySelectorAll('[data-share]').forEach(button => {
  button.addEventListener('click', () => {
    document.exitPointerLock?.();
    share.showModal();
  });
});
document.querySelector('#share-close').addEventListener('click', () => share.close());
document.querySelector('#back').addEventListener('click', () => location.reload());

start.addEventListener('click', async () => {
  if (loaded || touchOnly) return;
  start.disabled = true;
  status.textContent = '街と怪獣を読み込んでいます…';
  try {
    const response = await fetch('game/entry.json');
    if (!response.ok) throw new Error('ゲームの読み込みに失敗しました');
    const { module } = await response.json();
    if (!/^assets\/index-[A-Za-z0-9_-]+\.js$/.test(module)) throw new Error('ゲームの配信ファイルを確認できません');
    // 元エンジンはページのBASE_URLで素材を読むため、game/基準の絶対URLを渡す。
    window.__dragonPublicBase = new URL('game/', location.href).href;
    app.hidden = false;
    landing.hidden = true;
    links.hidden = false;
    document.body.classList.add('playing');
    await import(new URL(`game/${module}`, location.href).href);
    const deadline = performance.now() + 120_000;
    while (!window.__appReady) {
      if (window.__appError) throw new Error('描画の起動に失敗しました。WebGL2対応のPCブラウザをお試しください。');
      if (performance.now() > deadline) throw new Error('読み込みが時間内に終わりませんでした。通信環境を確認して再読み込みしてください。');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    loaded = true;
    links.setAttribute('aria-label', 'Escで一時停止してから入口や共有を選べます');
  } catch (error) {
    app.hidden = true;
    landing.hidden = false;
    links.hidden = true;
    document.body.classList.remove('playing');
    status.textContent = `${error.message} ページを再読み込みして再試行できます。`;
    start.textContent = '再読み込みして試す';
    start.disabled = false;
    start.onclick = () => location.reload();
  }
});
