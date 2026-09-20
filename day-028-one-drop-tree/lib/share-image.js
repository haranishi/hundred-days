import { drawScene } from './draw.js';

export const EXPORT_SIZE = 1080;

export function renderShareImage(canvas, plant, wilt, { label, date, url }) {
  canvas.width = EXPORT_SIZE;
  canvas.height = EXPORT_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fbf7ef';
  ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
  ctx.save();
  ctx.translate(54, 12);
  drawScene(ctx, { plant, size: 972, wilt, progress: 1, newborn: null, clear: false });
  ctx.restore();
  ctx.fillStyle = '#2b2a28';
  ctx.font = '700 42px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, 64, 1020);
  const labelWidth = ctx.measureText(label).width;
  ctx.fillStyle = '#706b62';
  ctx.font = '500 25px system-ui, sans-serif';
  ctx.fillText(date, 64 + labelWidth + 22, 1020);
  ctx.fillStyle = '#2b2a28';
  ctx.font = '500 24px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('ひとしずくの木', 1016, 984);
  ctx.fillStyle = '#706b62';
  ctx.font = '500 19px system-ui, sans-serif';
  ctx.fillText(url, 1016, 1020);
  return canvas;
}

export function imageFilename(dateString) {
  return `one-drop-tree-${dateString.replaceAll('-', '')}.png`;
}
