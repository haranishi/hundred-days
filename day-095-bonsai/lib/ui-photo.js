export function connectPhoto(dialog, byId) {
  const image = byId('photo-image');
  const save = byId('photo-save');
  const share = byId('photo-share');
  const status = byId('photo-status');
  const actions = byId('photo-actions');
  let source = null;
  let file = null;
  let generation = 0;

  function message(text) {
    status.hidden = !text;
    status.textContent = text;
  }

  function release() {
    generation += 1;
    if (source) URL.revokeObjectURL(source);
    source = file = null;
    image.hidden = share.hidden = actions.hidden = true;
    image.removeAttribute('src');
    save.removeAttribute('href');
    message('');
  }

  async function prepare(capture, { name, date, day }) {
    release();
    const current = generation;
    message('写真を用意しています。');
    try {
      const blob = await capture();
      if (current !== generation || !dialog.open) return;
      if (!(blob instanceof Blob) || !blob.size) throw new Error('写真が空です');
      source = URL.createObjectURL(blob);
      const extension = ({ 'image/jpeg': 'jpg', 'image/webp': 'webp' })[blob.type] ?? 'png';
      const filename = `bonsai-${day}.${extension}`;
      image.alt = `${name}の盆栽の写真。${date}`;
      image.src = save.href = source;
      save.download = filename;
      image.hidden = actions.hidden = false;
      message('');
      if (navigator.share && navigator.canShare && typeof File === 'function') {
        try {
          const candidate = new File([blob], filename, { type: blob.type || 'image/png' });
          if (navigator.canShare({ files: [candidate] })) {
            file = candidate;
            share.hidden = false;
          }
        } catch {
          // 共有先が画像に対応しない場合も、保存へのリンクは使えるようにする。
        }
      }
    } catch {
      if (current === generation && dialog.open) message('写真を作れませんでした。閉じてから、もう一度お試しください。');
    }
  }

  share.addEventListener('click', async () => {
    if (!file) return;
    const current = generation;
    try {
      await navigator.share({ files: [file], title: '盆栽日和' });
    } catch (error) {
      if (current === generation && dialog.open && error?.name !== 'AbortError') message('写真を共有できませんでした。写真を保存できます。');
    }
  });
  dialog.addEventListener('close', () => { if (!dialog.open) release(); });

  return prepare;
}
