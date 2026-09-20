/* Safari 16.4未満・Chrome 99未満・Firefox 112未満には roundRect が無い。
   無ければ arcTo で同じ角丸矩形をなぞる。 */
function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function paintBackground(ctx, width, height, background) {
  ctx.clearRect(0, 0, width, height);
  if (background.type === 'transparent') return;
  if (background.type === 'solid') {
    ctx.fillStyle = background.colors[0];
  } else {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, background.colors[0]);
    gradient.addColorStop(1, background.colors[1]);
    ctx.fillStyle = gradient;
  }
  ctx.fillRect(0, 0, width, height);
}

export function draw(ctx, layout, image, background, frame) {
  const { width, height, card, radius, shadow } = layout;
  paintBackground(ctx, width, height, background);

  ctx.save();
  ctx.shadowColor = `rgba(0,0,0,${shadow.alpha})`;
  ctx.shadowBlur = shadow.blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = shadow.offsetY;
  ctx.fillStyle = '#ffffff';
  roundedRect(ctx, card.x, card.y, card.w, card.h, radius);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, card.x, card.y, card.w, card.h, radius);
  ctx.clip();
  if (frame && layout.bar > 0) {
    ctx.fillStyle = '#e9e9ee';
    ctx.fillRect(card.x, card.y, card.w, layout.bar);
    ctx.fillStyle = '#c9c9d1';
    const dotRadius = Math.max(1, image.width * 0.0075 * layout.scale);
    for (const factor of [0.022, 0.044, 0.066]) {
      ctx.beginPath();
      ctx.arc(card.x + image.width * factor * layout.scale, card.y + layout.bar / 2, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.drawImage(image, layout.image.x, layout.image.y, layout.image.w, layout.image.h);
  ctx.restore();
}
