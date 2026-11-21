/** 表示と同じ色・構図で PNG を得る。再描画と toBlob の呼び出しを同じタスクで行う。 */
export async function captureFrame({ renderer, scene, camera }) {
  const canvas = renderer.domElement;
  if (!canvas.width || !canvas.height || typeof canvas.toBlob !== 'function') {
    throw new Error('この端末では画像を書き出せません。');
  }
  const previous = renderer.getRenderTarget();
  const face = renderer.getActiveCubeFace(), level = renderer.getActiveMipmapLevel();
  try {
    if (previous) renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    // ブラウザは呼び出し時の画素を複製してから非同期で符号化する。
    // 通常の描画用コンテキストに撮影用バッファを残す必要はない。
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('画像を書き出せませんでした。')), 'image/png');
    });
  } finally {
    if (previous) renderer.setRenderTarget(previous, face, level);
  }
}
