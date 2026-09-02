const TAU = Math.PI * 2;

function randomFactory(seed = 0x0262026) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

function litPath(ctx, radius, illum, waxing) {
  const q = 2 * Math.max(0, Math.min(1, illum)) - 1;
  const rx = Math.max(0.0001, Math.abs(q) * radius);
  ctx.beginPath();
  ctx.moveTo(0, -radius);
  if (waxing) {
    ctx.arc(0, 0, radius, -Math.PI / 2, Math.PI / 2, false);
    if (q < 0) ctx.ellipse(0, 0, rx, radius, 0, Math.PI / 2, -Math.PI / 2, true);
    else ctx.ellipse(0, 0, rx, radius, 0, Math.PI / 2, Math.PI * 1.5, false);
  } else {
    ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI * 1.5, true);
    if (q > 0) ctx.ellipse(0, 0, rx, radius, 0, Math.PI / 2, -Math.PI / 2, true);
    else ctx.ellipse(0, 0, rx, radius, 0, Math.PI / 2, Math.PI * 1.5, false);
  }
  ctx.closePath();
}

function drawMoonSeas(ctx, radius) {
  const ownerDocument = ctx.canvas?.ownerDocument;
  if (!ownerDocument) return;
  const diameter = Math.max(1, Math.ceil(radius * 2));
  const layer = ownerDocument.createElement('canvas');
  layer.width = diameter;
  layer.height = diameter;
  const layerCtx = layer.getContext('2d');
  const random = randomFactory();
  const seaCount = 8;

  layerCtx.translate(diameter / 2, diameter / 2);
  layerCtx.fillStyle = '#5c5b4c';
  // 縁を溶かして「貼り付けた楕円」に見えないようにする（filter 非対応でも描画は続く）
  layerCtx.filter = `blur(${Math.max(1, radius * .045).toFixed(1)}px)`;
  for (let index = 0; index < seaCount; index += 1) {
    // Keep the broad maria away from the center and distribute them around the disk.
    const angle = (index / seaCount) * TAU + (random() - .5) * .55;
    const distance = radius * (.28 + random() * .42);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const rx = radius * (.18 + random() * .3);
    const ry = rx * (.5 + random() * .3);
    layerCtx.beginPath();
    layerCtx.ellipse(x, y, rx, ry, random() * TAU, 0, TAU);
    layerCtx.fill();
  }

  ctx.save();
  ctx.globalAlpha = .085;
  ctx.drawImage(layer, -diameter / 2, -diameter / 2);
  ctx.restore();
}

function moonTexture(ctx, radius, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const base = ctx.createRadialGradient(-radius * .28, -radius * .3, radius * .05, 0, 0, radius);
  base.addColorStop(0, '#fffdf0');
  base.addColorStop(.68, '#f2e6c6');
  base.addColorStop(1, '#c9b98f');
  ctx.fillStyle = base;
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.fill();

  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.clip();
  drawMoonSeas(ctx, radius);
  ctx.restore();
  ctx.restore();
}

function drawFeatheredLitTexture(ctx, width, height, radius, centerX, centerY, illum, waxing) {
  const ownerDocument = ctx.canvas?.ownerDocument;
  if (!ownerDocument) {
    ctx.save();
    litPath(ctx, radius, illum, waxing);
    ctx.clip();
    moonTexture(ctx, radius);
    ctx.restore();
    return;
  }

  const layer = ownerDocument.createElement('canvas');
  layer.width = Math.max(1, Math.round(width));
  layer.height = Math.max(1, Math.round(height));
  const layerCtx = layer.getContext('2d');
  layerCtx.translate(centerX, centerY);
  moonTexture(layerCtx, radius);

  layerCtx.globalCompositeOperation = 'destination-in';
  layerCtx.filter = `blur(${Math.max(.8, radius * .04).toFixed(2)}px)`;
  layerCtx.fillStyle = '#fff';
  litPath(layerCtx, radius, illum, waxing);
  layerCtx.fill();
  layerCtx.filter = 'none';

  ctx.drawImage(layer, -centerX, -centerY, width, height);
}

/** 同じ関数を主役の月と48pxの帳スタンプに使う。width/heightはCSS上の論理px。 */
export function drawMoon(ctx, width, heightOrOptions, maybeOptions) {
  const height = typeof heightOrOptions === 'number' ? heightOrOptions : width;
  const { illum, waxing, glow = true } = maybeOptions ?? heightOrOptions;
  const compact = width <= 64 && height <= 64;
  const rectangular = width !== height;
  const scale = Math.min(width, height);
  const random = randomFactory(0x510026);
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, compact ? '#111b34' : '#081126');
  sky.addColorStop(1, compact ? '#0b1327' : '#142548');
  ctx.fillStyle = sky;
  if (compact) {
    ctx.beginPath(); ctx.arc(width / 2, height / 2, scale / 2, 0, TAU); ctx.fill();
  } else ctx.fillRect(0, 0, width, height);

  if (!compact) {
    for (let index = 0; index < 72; index += 1) {
      const x = random() * width;
      const y = random() * height;
      const radius = .35 + random() * 1.05;
      ctx.globalAlpha = .25 + random() * .65;
      ctx.fillStyle = index % 7 === 0 ? '#ffeab3' : '#f7f5e9';
      ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const radius = scale * (compact || rectangular ? .39 : .315);
  const centerX = width / 2;
  const centerY = rectangular ? height / 2 : height * (compact ? .5 : .47);
  ctx.translate(centerX, centerY);

  if (glow) {
    const halo = ctx.createRadialGradient(0, 0, radius * .72, 0, 0, radius * 1.65);
    halo.addColorStop(0, 'rgba(255, 238, 187, .22)');
    halo.addColorStop(1, 'rgba(255, 238, 187, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, radius * 1.65, 0, TAU); ctx.fill();
  }

  // An opaque foundation keeps background stars from showing through the moon.
  ctx.fillStyle = 'rgb(56, 64, 82)';
  ctx.strokeStyle = 'rgba(190, 205, 235, .18)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.fill(); ctx.stroke();

  // Texture lives only on the illuminated side. The blurred mask softens the
  // terminator without adding the bright rim that made the disk look doubled.
  drawFeatheredLitTexture(ctx, width, height, radius, centerX, centerY, illum, waxing);
  ctx.restore();
}

export function prepareCanvas(canvas, width, height = width, dpr = Math.min(window.devicePixelRatio || 1, 2)) {
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
