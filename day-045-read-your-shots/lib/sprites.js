const files = { bg: 'bg.webp', player: 'player.png', a: 'enemy-a.png', b: 'enemy-b.png', c: 'enemy-c.png' };
export function fallback(ctx, type, x, y, w, h) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = type === 'player' ? '#8cffe0' : type === 'c' ? '#ffd78d' : type === 'b' ? '#c8a7ff' : '#ff9e87';
  ctx.beginPath();
  if (type === 'player') { ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(0, h / 4); ctx.lineTo(-w / 2, h / 2); }
  else { ctx.moveTo(-w / 2, -h / 4); ctx.lineTo(-w / 4, -h / 2); ctx.lineTo(w / 3, -h / 2); ctx.lineTo(w / 2, h / 4); ctx.lineTo(0, h / 2); ctx.lineTo(-w / 2, h / 4); }
  ctx.closePath(); ctx.fill(); ctx.fillStyle = '#18273e'; ctx.fillRect(-w / 5, -3, w * 0.4, 6); ctx.restore();
}
export async function loadSprites() {
  const images = {};
  await Promise.all(Object.entries(files).map(async ([key, file]) => {
    let url;
    try {
      const response = await fetch(new URL(`../assets/${file}`, import.meta.url), { signal: AbortSignal.timeout(3000) });
      if (!response.ok) return;
      url = URL.createObjectURL(await response.blob());
      const img = new Image(); img.src = url; await img.decode(); images[key] = img;
    } catch { /* 欠損・破損は図形に切り替える */ }
    finally { if (url) URL.revokeObjectURL(url); }
  }));
  return { fallback: Object.keys(images).length < 5, background: images.bg,
    draw(ctx, type, x, y, w, h) {
      const img = images[type];
      if (!img) return fallback(ctx, type, x, y, w, h);
      const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
      ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
    }
  };
}
