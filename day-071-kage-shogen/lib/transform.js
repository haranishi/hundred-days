// 世界座標（壁の面・cm・y上向き）と表示領域（px・y下向き）の変換。描画・ポインター・E2Eが同じ関数を使う。
import { VIEW } from './config.js';

export function createTransform(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new RangeError('size must be positive');
  const worldWidth = VIEW.maxX - VIEW.minX;
  const worldHeight = VIEW.maxY - VIEW.minY;
  const scale = Math.min(width / worldWidth, height / worldHeight);
  const offsetX = (width - worldWidth * scale) / 2;
  const offsetY = (height - worldHeight * scale) / 2;
  return {
    width,
    height,
    scale,
    offsetX,
    offsetY,
    toScreen: (x, y) => ({ x: offsetX + (x - VIEW.minX) * scale, y: offsetY + (VIEW.maxY - y) * scale }),
    toWorld: (px, py) => ({ x: VIEW.minX + (px - offsetX) / scale, y: VIEW.maxY - (py - offsetY) / scale }),
  };
}
