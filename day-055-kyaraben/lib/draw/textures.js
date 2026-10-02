// 食材の模様。写真には寄せず、「ご飯の粒」「のりの繊維」「卵のむら」が分かる程度の小さな柄を、種つきの乱数で描く
// （同じ食材はいつも同じ柄になり、再計算のたびに絵がちらつかない）
import { mulberry32, hashString } from '../rng.js';
import { mixHex } from '../color.js';

const STYLE = {
  nori: 'fiber',
  usuyaki: 'mottle',
  cheese: 'smooth',
  cheddar: 'smooth',
  ham: 'speck',
  wiener: 'speck',
  cucumber: 'speck',
  kanikama: 'stripe',
  carrot: 'stripe',
  hanpen: 'bubble',
};
const SPRINKLE = { goma_rice: '#3A3634', okaka_rice: '#6B4428', aonori_rice: '#3E7A2E', yukari_rice: '#6E3F74', denbu_rice: '#E77F9A' };
const TILE_MM = 8;
const cache = new Map();

function makeTile(foodId, color, size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const k = size / TILE_MM;
  const rnd = mulberry32(hashString(foodId));
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  // 端で切れた柄が継ぎ目に見えないよう、上下左右にずらして同じものを描く
  const wrap = (draw) => {
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        g.save();
        g.translate(dx, dy);
        draw();
        g.restore();
      }
    }
  };
  const dot = (x, y, r, fill, alpha) => wrap(() => {
    g.globalAlpha = alpha;
    g.fillStyle = fill;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  });
  const style = STYLE[foodId] ?? (foodId.endsWith('rice') ? 'grain' : 'smooth');
  if (style === 'grain') {
    // 色つきご飯は粒を目立たせすぎると柄に見えるので、白いご飯より明暗の差を小さくする
    const plain = foodId === 'rice';
    const light = mixHex(color, '#FFFFFF', plain ? 0.6 : 0.26);
    const edge = mixHex(color, '#6B5436', plain ? 0.35 : 0.18);
    for (let i = 0; i < 24; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const a = rnd() * Math.PI;
      const rx = (0.9 + rnd() * 0.3) * k;
      const ry = (0.48 + rnd() * 0.12) * k;
      wrap(() => {
        g.beginPath();
        g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2);
        g.globalAlpha = 0.9;
        g.fillStyle = light;
        g.fill();
        g.globalAlpha = 0.28;
        g.lineWidth = Math.max(0.6, 0.14 * k);
        g.strokeStyle = edge;
        g.stroke();
      });
    }
    const sprinkle = SPRINKLE[foodId];
    if (sprinkle) for (let i = 0; i < 14; i++) dot(rnd() * size, rnd() * size, (0.2 + rnd() * 0.18) * k, sprinkle, 0.75);
  } else if (style === 'fiber') {
    const fiber = mixHex(color, '#5E7358', 0.45);
    for (let i = 0; i < 30; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const len = (0.8 + rnd() * 1.6) * k;
      const a = (rnd() - 0.5) * 0.9;
      wrap(() => {
        g.globalAlpha = 0.45;
        g.strokeStyle = fiber;
        g.lineWidth = Math.max(0.5, 0.12 * k);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        g.stroke();
      });
    }
  } else if (style === 'mottle') {
    for (let i = 0; i < 7; i++) dot(rnd() * size, rnd() * size, (0.9 + rnd() * 1.2) * k, mixHex(color, '#E09A1E', 0.45), 0.16);
    for (let i = 0; i < 6; i++) dot(rnd() * size, rnd() * size, (0.5 + rnd() * 0.8) * k, mixHex(color, '#FFFFFF', 0.5), 0.2);
  } else if (style === 'speck') {
    const tone = foodId === 'wiener' ? mixHex(color, '#5A2012', 0.4) : mixHex(color, '#FFFFFF', 0.55);
    for (let i = 0; i < 16; i++) dot(rnd() * size, rnd() * size, (0.18 + rnd() * 0.25) * k, tone, 0.6);
  } else if (style === 'stripe') {
    const tone = mixHex(color, '#FFFFFF', 0.45);
    for (let i = 0; i < 8; i++) {
      const y = rnd() * size;
      const tilt = (rnd() - 0.5) * k;
      wrap(() => {
        g.globalAlpha = 0.35;
        g.strokeStyle = tone;
        g.lineWidth = Math.max(0.5, 0.16 * k);
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(size, y + tilt);
        g.stroke();
      });
    }
  } else if (style === 'bubble') {
    for (let i = 0; i < 12; i++) dot(rnd() * size, rnd() * size, (0.15 + rnd() * 0.3) * k, '#8C8574', 0.12);
  } else {
    for (let i = 0; i < 5; i++) dot(rnd() * size, rnd() * size, (0.8 + rnd()) * k, mixHex(color, '#FFFFFF', 0.5), 0.14);
  }
  return c;
}

// pxPerMm は描く先の canvas の「1mmあたりの画素数」。模様の大きさを実物の大きさにそろえる
export function foodPattern(ctx, foodId, color, pxPerMm) {
  const size = Math.max(12, Math.round(TILE_MM * pxPerMm));
  const key = `${foodId}|${color}|${size}`;
  if (!cache.has(key)) cache.set(key, makeTile(foodId, color, size));
  return ctx.createPattern(cache.get(key), 'repeat');
}
