// Day100の「共有」ボタンで、共有の窓を開く。配信先の CSP は inline script を許さないので、ファイルに分けている。
(() => {
  const opener = document.getElementById('d100-share-open');
  const dialog = document.getElementById('d100-share-dialog');
  if (!opener || !dialog) return;
  opener.addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
  });
  // 窓の外（背景）を押したら閉じる
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    const outside = event.clientX < box.left || event.clientX > box.right
      || event.clientY < box.top || event.clientY > box.bottom;
    if (outside) dialog.close();
  });
  // 窓を開いている間のキー入力を、後ろの会計の画面のショートカットに渡さない（Escは窓を閉じる動きのまま）
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') event.stopPropagation();
  });
})();
