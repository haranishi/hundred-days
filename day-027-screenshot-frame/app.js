import { BACKGROUNDS, findBackground } from './lib/backgrounds.js';
import { draw } from './lib/draw.js';
import { filename } from './lib/filename.js';
import { ASPECTS, computeLayout } from './lib/layout.js';
import { load, save } from './lib/store.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const canvas = $('preview');
const ctx = canvas.getContext('2d');
const MAX_BYTES = 40 * 1024 * 1024;
let storage = null;
try { storage = window.localStorage; } catch { /* 保存不可でも加工を続ける */ }
const loaded = load(storage);
let settings = loaded.state;
let canSave = loaded.canSave;
let image = null;
let sourceName = '';
let layout = null;
let renderFrame = 0;
let landingTimer = 0;
let fallbackUrl = null;

function setState(state) { app.dataset.state = state; }
function say(message = '') { $('message').textContent = message; }
function storageState() { $('storage-error').hidden = canSave; }

function persist() {
  if (!canSave) return;
  if (!save(storage, settings).saved) {
    canSave = false;
    storageState();
  }
}

/* 画像があるときは実際の出力（長辺4096pxへ縮めた後）の値、無いときは幅1200pxとして計算した値 */
function updateValueLabels() {
  if (image && layout) {
    $('padding-value').textContent = `${layout.pad}px`;
    $('radius-value').textContent = `${layout.radius}px`;
    $('shadow-value').textContent = `${layout.shadow.blur}px`;
    return;
  }
  const width = 1200;
  $('padding-value').textContent = `${Math.round(width * .25 * settings.padding / 100)}px`;
  $('radius-value').textContent = `${Math.round(width * .06 * settings.radius / 100)}px`;
  $('shadow-value').textContent = `${Math.round(width * .08 * settings.shadow / 100)}px`;
}

function updateSelection() {
  document.querySelectorAll('[data-bg]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.bg === settings.bg));
  });
  document.querySelectorAll('[data-aspect]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.aspect === settings.aspect));
  });
  $('padding').value = settings.padding;
  $('radius').value = settings.radius;
  $('shadow').value = settings.shadow;
  $('frame').checked = settings.frame;
  updateValueLabels();
}

function render() {
  renderFrame = 0;
  if (!image) {
    updateValueLabels();
    return;
  }
  layout = computeLayout({
    imgW: image.width,
    imgH: image.height,
    padding: settings.padding,
    radius: settings.radius,
    shadow: settings.shadow,
    aspect: settings.aspect,
    frame: settings.frame
  });
  updateValueLabels();
  canvas.width = layout.width;
  canvas.height = layout.height;
  const background = findBackground(settings.bg);
  if (background.type === 'transparent') canvas.dataset.transparent = 'true';
  else delete canvas.dataset.transparent;
  draw(ctx, layout, image, background, settings.frame);
  $('output-size').textContent = `出力 ${layout.width} × ${layout.height} px`;
  $('size-note').hidden = layout.scale === 1;
  canvas.setAttribute('aria-label', `額縁を付けた画像 ${layout.width} × ${layout.height} ピクセル`);
}

function scheduleRender() {
  if (!renderFrame) renderFrame = requestAnimationFrame(render);
}

function makeControls() {
  const swatches = BACKGROUNDS.map((background) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.dataset.bg = background.id;
    button.setAttribute('aria-label', background.name);
    button.title = background.name;
    button.setAttribute('aria-pressed', 'false');
    if (background.type === 'transparent') button.dataset.transparent = 'true';
    else button.style.setProperty('--swatch', background.type === 'gradient' ? `linear-gradient(135deg, ${background.colors.join(', ')})` : background.colors[0]);
    button.addEventListener('click', () => changeSetting('bg', background.id));
    return button;
  });
  $('backgrounds').replaceChildren(...swatches);

  const aspects = ASPECTS.map((aspect) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.dataset.aspect = aspect;
    button.textContent = aspect === 'auto' ? '自動' : aspect;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => changeSetting('aspect', aspect));
    return button;
  });
  $('aspects').replaceChildren(...aspects);
}

function changeSetting(name, value) {
  settings = { ...settings, [name]: value };
  updateSelection();
  persist();
  scheduleRender();
}

function decodeFallback(file) {
  return new Promise((resolve, reject) => {
    const node = new Image();
    fallbackUrl = URL.createObjectURL(file);
    node.onload = () => resolve(node);
    node.onerror = () => {
      URL.revokeObjectURL(fallbackUrl);
      fallbackUrl = null;
      reject(new Error('decode'));
    };
    node.src = fallbackUrl;
  });
}

async function decode(file) {
  if ('createImageBitmap' in window) return createImageBitmap(file);
  return decodeFallback(file);
}

function cleanImage() {
  if (image && typeof image.close === 'function') image.close();
  image = null;
  layout = null;
  if (fallbackUrl) {
    URL.revokeObjectURL(fallbackUrl);
    fallbackUrl = null;
  }
}

function showError(message) {
  if (image) {
    setState('ready');
    say(message);
    return;
  }
  cleanImage();
  $('error-body').textContent = message;
  setState('error');
  $('error-again').focus();
}

function land() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  clearTimeout(landingTimer);
  canvas.classList.remove('is-landing');
  void canvas.offsetWidth;
  canvas.classList.add('is-landing');
  landingTimer = setTimeout(() => canvas.classList.remove('is-landing'), 600);
}

export async function loadFile(file, displayName = '') {
  say();
  if (!file) return;
  if (file.size > MAX_BYTES) {
    showError('40MBまでの画像に対応しています');
    return;
  }
  setState('loading');
  let decoded;
  try {
    decoded = await decode(file);
  } catch {
    showError(file.type && !file.type.startsWith('image/')
      ? '画像ファイルを選んでください（PNG・JPEG・WebP・GIF・BMP）'
      : 'この画像は読み込めませんでした');
    return;
  }
  if (!decoded.width || !decoded.height) {
    if (typeof decoded.close === 'function') decoded.close();
    showError('この画像は読み込めませんでした');
    return;
  }
  cleanImage();
  image = decoded;
  sourceName = (displayName || file.name || '画像').slice(0, 80);
  $('source-info').textContent = `元画像 ${image.width} × ${image.height} · ${sourceName}`;
  try {
    render();
  } catch {
    cleanImage();
    showError('この環境では画像を加工できません');
    return;
  }
  setState('ready');
  land();
  canvas.focus();
}

function reset() {
  cleanImage();
  clearTimeout(landingTimer);
  canvas.classList.remove('is-landing');
  canvas.width = 1;
  canvas.height = 1;
  $('file').value = '';
  $('source-info').textContent = '';
  $('error-body').textContent = '';
  say();
  updateValueLabels();
  setState('empty');
  $('pick').focus();
}

function canvasBlob() {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

$('pick').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', (event) => {
  loadFile(event.target.files[0]);
  event.target.value = '';
});
$('again').addEventListener('click', reset);
$('error-again').addEventListener('click', reset);

$('sample').addEventListener('click', async () => {
  say();
  try {
    const response = await fetch('./sample/sample.webp');
    if (!response.ok) throw new Error('sample');
    const blob = await response.blob();
    await loadFile(new File([blob], 'sample.webp', { type: blob.type || 'image/webp' }), 'サンプル');
  } catch {
    showError('この画像は読み込めませんでした');
  }
});

/* テキスト入力欄への貼り付けだけ横取りしない。スライダー等にフォーカスがあっても画像は受け取る */
const TEXT_FIELD = 'input:not([type=range]):not([type=checkbox]):not([type=file]), textarea, [contenteditable]';
document.addEventListener('paste', (event) => {
  if (document.activeElement?.closest(TEXT_FIELD)) return;
  const files = [...(event.clipboardData?.files ?? [])];
  const item = [...(event.clipboardData?.items ?? [])].find((entry) => entry.type.startsWith('image/'));
  const file = files.find((entry) => entry.type.startsWith('image/')) ?? item?.getAsFile();
  if (!file) say('クリップボードに画像がありません');
  else loadFile(file);
});

document.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (Array.from(event.dataTransfer?.types ?? []).includes('Files')) $('stage').dataset.over = 'true';
});
document.addEventListener('dragleave', (event) => {
  if (!event.relatedTarget) delete $('stage').dataset.over;
});
document.addEventListener('drop', (event) => {
  event.preventDefault();
  delete $('stage').dataset.over;
  const files = [...(event.dataTransfer?.files ?? [])];
  if (!files.length) return;
  loadFile(files[0]);
  if (files.length > 1) say('1枚だけ使います');
});

$('paste-button').addEventListener('click', async () => {
  if (!navigator.clipboard?.read) {
    say('この環境ではボタンから貼れません。⌘V / Ctrl+V で貼ってください');
    return;
  }
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((value) => value.startsWith('image/'));
      if (type) {
        const blob = await item.getType(type);
        await loadFile(new File([blob], 'clipboard.png', { type }));
        return;
      }
    }
    say('クリップボードに画像がありません');
  } catch {
    say('この環境ではボタンから貼れません。⌘V / Ctrl+V で貼ってください');
  }
});

/* iOS Safari などではCanvasの面積上限を超えると toBlob が null を返す */
const EXPORT_FAILED = 'この画像は書き出せませんでした。比率や余白を小さくしてください';

$('download').addEventListener('click', async () => {
  const blob = await canvasBlob();
  if (!blob) {
    say(EXPORT_FAILED);
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename();
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  say('保存しました');
});

$('copy').addEventListener('click', async () => {
  let empty = false;
  try {
    if (!navigator.clipboard?.write || !window.ClipboardItem) throw new Error('unsupported');
    /* Safariはユーザー操作の有効期限が短いので、BlobはPromiseのまま渡す */
    const blob = canvasBlob().then((result) => {
      if (result) return result;
      empty = true;
      throw new Error('empty');
    });
    blob.catch(() => {});
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    say('コピーしました。そのまま貼り付けられます');
  } catch {
    say(empty ? EXPORT_FAILED : 'この環境ではコピーできません。PNGで保存してください');
  }
});

for (const name of ['padding', 'radius', 'shadow']) {
  $(name).addEventListener('input', (event) => changeSetting(name, Number(event.target.value)));
}
$('frame').addEventListener('change', (event) => changeSetting('frame', event.target.checked));

makeControls();
updateSelection();
storageState();
