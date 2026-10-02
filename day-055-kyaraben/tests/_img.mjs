// 単体テスト用の合成画像。ブラウザを使わず、Uint8ClampedArray に丸・四角・線を直接描く
export function makeImage(w, h, color = [255, 255, 255, 255]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(color.length === 4 ? color : [...color, 255], i * 4);
  return { width: w, height: h, data };
}
const put = (img, x, y, color) => {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  img.data.set(color.length === 4 ? color : [...color, 255], (y * img.width + x) * 4);
};
export function fillCircle(img, cx, cy, r, color) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) put(img, x, y, color);
}
export function fillRect(img, x0, y0, x1, y1, color) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(img, x, y, color);
}
export function drawLine(img, x0, y0, x1, y1, width, color) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = Math.floor(Math.min(y0, y1) - width); y <= Math.max(y0, y1) + width; y++) {
    for (let x = Math.floor(Math.min(x0, x1) - width); x <= Math.max(x0, x1) + width; x++) {
      const t = Math.max(0, Math.min(1, ((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / len2));
      if (Math.hypot(x + 0.5 - x0 - t * dx, y + 0.5 - y0 - t * dy) <= width / 2) put(img, x, y, color);
    }
  }
}
export const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];

// ミント色の地に、黒い輪郭の白い顔・黒い目と口・ピンクのほっぺ・オレンジの鼻・黄色いリボン
export function catFace() {
  const img = makeImage(240, 200, hex('#E3F4EC'));
  fillCircle(img, 120, 105, 80, hex('#1A1A1A'));
  fillCircle(img, 120, 105, 74, hex('#FFFFFF'));
  fillCircle(img, 95, 95, 7, hex('#1A1A1A'));
  fillCircle(img, 145, 95, 7, hex('#1A1A1A'));
  fillCircle(img, 80, 125, 9, hex('#F48FB1'));
  fillCircle(img, 160, 125, 9, hex('#F48FB1'));
  fillCircle(img, 120, 115, 5, hex('#FF9A2E'));
  drawLine(img, 106, 136, 134, 136, 3, hex('#1A1A1A'));
  fillRect(img, 150, 18, 190, 42, hex('#FFD83D'));
  return img;
}

// 白い紙に黄色いひよこ（オレンジのくちばし・黒い目・ピンクのほっぺ）
export function chick() {
  const img = makeImage(200, 160);
  fillCircle(img, 100, 90, 50, hex('#FFD83D'));
  fillRect(img, 142, 80, 160, 92, hex('#FF9A2E'));
  fillCircle(img, 118, 75, 5, hex('#141414'));
  fillCircle(img, 110, 100, 7, hex('#F48FB1'));
  return img;
}
