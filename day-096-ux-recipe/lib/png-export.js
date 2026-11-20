import { DEVICES } from './contract.js';
import { PAGE_CSS } from './page-css.js';
import { renderPage } from './render.js';

const SVG = 'http://www.w3.org/2000/svg';

export function pngDimensions(width, height, scale = 2) {
  if (![width, height, scale].every((n) => Number.isFinite(n) && n > 0)) return null;
  const cssWidth = Math.ceil(width);
  const cssHeight = Math.ceil(height);
  const pixelWidth = Math.ceil(cssWidth * scale);
  const pixelHeight = Math.ceil(cssHeight * scale);
  if (![cssWidth, cssHeight, pixelWidth, pixelHeight].every(Number.isSafeInteger)) return null;
  return { width: cssWidth, height: cssHeight, pixelWidth, pixelHeight };
}

// SVGは等倍（CSSの大きさ）で作り、キャンバス側で拡大して描く。viewBox で拡大すると、WebKit は foreignObject を
// 左上の4分の1にしか描かない（2026-11-20 に実測）。等倍で作って scale() で拡大すれば、WebKit・Chromium とも全面に描ける。
async function rasterize(content, size, probe = false) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('width', size.width);
  svg.setAttribute('height', size.height);
  const foreign = document.createElementNS(SVG, 'foreignObject');
  foreign.setAttribute('width', size.width);
  foreign.setAttribute('height', size.height);
  foreign.append(content);
  svg.append(foreign);
  const image = new Image();
  const loaded = new Promise((resolve, reject) => {
    image.addEventListener('load', resolve, { once: true });
    image.addEventListener('error', reject, { once: true });
  });
  // Blob URL の SVG は、一部のブラウザで foreignObject を描くと画素を読み出せない。
  const xml = new XMLSerializer().serializeToString(svg);
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  await loaded;
  const canvas = document.createElement('canvas');
  canvas.width = size.pixelWidth;
  canvas.height = size.pixelHeight;
  try {
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.scale(size.pixelWidth / size.width, size.pixelHeight / size.height);
    context.drawImage(image, 0, 0, size.width, size.height);
    if (probe) {
      // 試し描きは全面が赤。左上と右下の両方が赤でなければ、拡大が正しく効かない環境として使わない。
      for (const [x, y] of [[1, 1], [size.pixelWidth - 2, size.pixelHeight - 2]]) {
        const [red, green, blue, alpha] = context.getImageData(x, y, 1, 1).data;
        if (red !== 255 || green !== 0 || blue !== 0 || alpha !== 255) return null;
      }
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob?.type === 'image/png' && blob.size > 0 ? blob : null;
  } finally {
    canvas.width = canvas.height = 0;
  }
}

let capability;
async function probe() {
  if (typeof document === 'undefined') return false;
  const tile = document.createElement('div');
  tile.style.cssText = 'width:4px;height:4px;background:rgb(255,0,0)';
  return Boolean(await rasterize(tile, pngDimensions(4, 4, 2), true));
}

export function canExportPng() {
  // API があっても白紙や読み出し禁止になる環境があるため、同時に開いても実描画は一度だけ試す。
  capability ??= probe().catch(() => false);
  return capability;
}

export async function exportPng(state, options = {}) {
  let host;
  try {
    const { width = DEVICES[0].width, scale = 2 } = options;
    if (!pngDimensions(width, 1, scale) || !await canExportPng()) return null;
    const style = document.createElement('style');
    style.textContent = PAGE_CSS;
    // 描画担当がエスケープした書き出し用 DOM を XMLSerializer で XHTML に変換する。
    const page = new DOMParser().parseFromString(renderPage(state, { mode: 'export' }), 'text/html');
    const content = document.createElement('div');
    content.lang = 'ja';
    content.append(style, document.importNode(page.body.firstElementChild, true));
    host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.inert = true;
    host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;';
    host.style.width = Math.ceil(width) + 'px';
    // 隔離すると編集中の同名 id・アプリの CSS・入力欄のフォーカスに影響しない。
    host.attachShadow({ mode: 'closed' }).append(content);
    document.body.append(host);
    const height = Math.max(content.scrollHeight, content.getBoundingClientRect().height);
    const size = pngDimensions(width, height, scale);
    if (!size) return null;
    return await rasterize(content, size);
  } catch {
    return null;
  } finally {
    host?.remove();
  }
}
