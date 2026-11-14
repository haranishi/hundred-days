/* 共有の窓の開け閉め。読み込み中の画面の入口と、アプリの画面の入口（data-share-open）の両方から開ける。
   CSP でインラインの script が使えないので、別ファイルの通常スクリプトにしてある。 */
(function () {
  function dialog() { return document.querySelector('[data-share-dialog]'); }
  document.addEventListener('click', function (event) {
    var target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    var d = dialog();
    if (!d) return;
    if (target.closest('[data-share-open]')) {
      if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    } else if (target.closest('[data-share-close]') || target === d) {
      if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
    }
  });
})();
