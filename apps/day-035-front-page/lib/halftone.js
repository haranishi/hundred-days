/* 写真を新聞の網点にする。45度に傾けた格子の上で、暗いところほど大きな点を打つ。
   ImageData を受けて点の一覧を返すだけなので、描画とは切り離してテストできる。 */

export const DEFAULT_CELL = 4;

/* 目の感じ方に合わせた明るさ（0=黒 1=白） */
export function luminanceAt(image, x, y) {
  const px = Math.min(image.width - 1, Math.max(0, Math.round(x)));
  const py = Math.min(image.height - 1, Math.max(0, Math.round(y)));
  const i = (py * image.width + px) * 4;
  const { data } = image;
  return (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
}

/* セルの中を何点か拾って平均する。1点だけ見ると点のむらが出る */
function cellLuminance(image, x, y, cell) {
  const offsets = [[0, 0], [-cell / 3, -cell / 3], [cell / 3, -cell / 3], [-cell / 3, cell / 3], [cell / 3, cell / 3]];
  let sum = 0;
  for (const [dx, dy] of offsets) sum += luminanceAt(image, x + dx, y + dy);
  return sum / offsets.length;
}

export function halftoneDots(image, { cell = DEFAULT_CELL, angle = Math.PI / 4, gain = 1.32 } = {}) {
  const { width, height } = image;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const half = Math.hypot(width, height) / 2;
  const cx = width / 2;
  const cy = height / 2;
  const dots = [];
  for (let u = -half; u <= half; u += cell) {
    for (let v = -half; v <= half; v += cell) {
      const x = cx + u * cos - v * sin;
      const y = cy + u * sin + v * cos;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const lum = cellLuminance(image, x, y, cell);
      const r = (cell / 2) * Math.sqrt(Math.max(0, 1 - lum)) * gain;
      if (r > 0.34) dots.push({ x, y, r: Math.min(r, cell * 0.74) });
    }
  }
  return dots;
}

/* 画像を枠いっぱいに切り出すときの倍率と位置（cover） */
export function coverRect(source, box) {
  const scale = Math.max(box.width / source.width, box.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}
