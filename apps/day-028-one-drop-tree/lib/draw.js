const COLORS = {
  paper: '#fbf7ef', pot: '#c9714f', potDark: '#a8563c', soil: '#5b4635', seed: '#8a6745',
  bark: '#5a412c', trunk: '#7a5a3c', tip: '#5d8a3a', newBranch: '#6f9d4a',
  leaf: '#4f9a4a', leafDeep: '#3a7440', newLeaf: '#8fcf6a', wilt: '#a08a3c',
  flower: '#f2a5b6', flowerCore: '#f7d774', water: '#5aa7d8'
};

const channels = (hex) => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
const RGB = Object.fromEntries(Object.entries(COLORS).map(([name, hex]) => [name, channels(hex)]));
const blend = (from, to, amount) => from.map((value, index) => value + (to[index] - value) * amount);
const css = (color) => `rgb(${color.map((value) => Math.round(value)).join(' ')})`;
const clamp01 = (value) => Math.min(1, Math.max(0, value));

function pot(ctx, size) {
  ctx.save();
  ctx.fillStyle = COLORS.pot;
  ctx.beginPath();
  ctx.moveTo(size * 0.37, size * 0.81);
  ctx.lineTo(size * 0.63, size * 0.81);
  ctx.lineTo(size * 0.59, size * 0.94);
  ctx.quadraticCurveTo(size * 0.5, size * 0.97, size * 0.41, size * 0.94);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.potDark;
  ctx.fillRect(size * 0.355, size * 0.795, size * 0.29, size * 0.045);
  ctx.fillStyle = COLORS.soil;
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.798, size * 0.118, size * 0.021, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function seed(ctx, size) {
  ctx.save();
  ctx.fillStyle = COLORS.seed;
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.79, size * 0.026, size * 0.017, -0.25, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function point(segment, t) {
  return { x: segment.x1 + (segment.x2 - segment.x1) * t, y: segment.y1 + (segment.y2 - segment.y1) * t };
}

/* 根元から先へ細くなる枝。継ぎ目は両端の円で埋めるので親子の太さがつながって見える。 */
function limb(ctx, x1, y1, x2, y2, r1, r2) {
  const normal = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
  const nx = Math.cos(normal);
  const ny = Math.sin(normal);
  ctx.beginPath();
  ctx.moveTo(x1 + nx * r1, y1 + ny * r1);
  ctx.lineTo(x2 + nx * r2, y2 + ny * r2);
  ctx.lineTo(x2 - nx * r2, y2 - ny * r2);
  ctx.lineTo(x1 - nx * r1, y1 - ny * r1);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x1, y1, r1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x2, y2, r2, 0, Math.PI * 2);
  ctx.fill();
}

/* 太いほど樹皮の茶、細いほど新芽の緑。 */
function branchColor(segment, newborn) {
  if (segment.born === newborn) return RGB.newBranch;
  const wood = blend(RGB.bark, RGB.trunk, clamp01((0.030 - segment.width) / 0.017));
  return blend(wood, RGB.tip, clamp01((0.0135 - segment.width) / 0.0075));
}

function branches(ctx, plant, size, progress, newborn) {
  const tipWidth = new Array(plant.segments.length).fill(0);
  for (const segment of plant.segments) {
    if (segment.parent !== null) tipWidth[segment.parent] = Math.max(tipWidth[segment.parent], segment.width);
  }
  for (const segment of plant.segments) {
    const amount = segment.born === newborn ? progress : 1;
    if (amount <= 0) continue;
    const end = point(segment, amount);
    const thin = tipWidth[segment.id] || segment.width * 0.62;
    const r1 = Math.max(0.7, segment.width * size * 0.5);
    const r2 = Math.max(0.6, (segment.width + (thin - segment.width) * amount) * size * 0.5);
    ctx.fillStyle = css(branchColor(segment, newborn));
    limb(ctx, segment.x1 * size, segment.y1 * size, end.x * size, end.y * size, r1, r2);
  }
}

function leafColor(leaf, newborn, wilt) {
  if (leaf.born === newborn) return RGB.newLeaf;
  const green = blend(RGB.leaf, RGB.leafDeep, leaf.tone * 0.55);
  return blend(green, RGB.wilt, wilt * 0.85);
}

function leaves(ctx, plant, size, wilt, progress, newborn) {
  /* 苗のころの葉（双葉と幹の下の方）は、木が育つと役目を終えて小さくなる。 */
  const grown = clamp01((plant.steps - 16) / 20);
  const cotyledon = 1 - grown * 0.8;
  const lower = 1 - grown * 0.72;
  const droop = wilt * 0.7;
  for (const leaf of plant.leaves) {
    const amount = leaf.born === newborn ? progress : 1;
    if (amount <= 0) continue;
    const segment = plant.segments[leaf.segment];
    const anchor = point(segment, leaf.t);
    const stem = Math.atan2(segment.y2 - segment.y1, segment.x2 - segment.x1);
    let angle = stem + leaf.angle;
    if (droop > 0) {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      angle = Math.atan2(dy + (1 - dy) * droop, dx + (dx * 0.45 - dx) * droop);
    }
    const scale = leaf.born === 1 ? cotyledon : (leaf.born <= 13 ? lower : 1);
    const length = leaf.size * size * amount * scale * (1 - wilt * 0.08);
    if (length < 0.4) continue;
    const color = leafColor(leaf, newborn, wilt);
    ctx.save();
    if (scale < 1) ctx.globalAlpha = Math.max(0, 1 - grown * 0.95);
    ctx.translate(anchor.x * size, anchor.y * size);
    ctx.rotate(angle);
    ctx.fillStyle = css(color);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(length * 0.28, -length * 0.42, length * 0.84, -length * 0.28, length * 1.3, 0);
    ctx.bezierCurveTo(length * 0.84, length * 0.28, length * 0.28, length * 0.42, 0, 0);
    ctx.fill();
    if (length > 6) {
      ctx.strokeStyle = css(blend(color, RGB.leafDeep, 0.5));
      ctx.lineWidth = Math.max(0.6, length * 0.05);
      ctx.beginPath();
      ctx.moveTo(length * 0.06, 0);
      ctx.quadraticCurveTo(length * 0.62, -length * 0.035, length * 1.16, 0);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function flowers(ctx, plant, size, wilt, progress, newborn) {
  for (const flower of plant.flowers) {
    const amount = flower.born === newborn ? progress : 1;
    if (amount <= 0) continue;
    const segment = plant.segments[flower.segment];
    const spot = point(segment, 0.94);
    const radius = flower.size * size * amount;
    ctx.save();
    ctx.globalAlpha = 1 - wilt * 0.45;
    ctx.translate(spot.x * size, spot.y * size);
    ctx.rotate(flower.id * 1.13);
    ctx.fillStyle = COLORS.flower;
    for (let petal = 0; petal < 5; petal += 1) {
      ctx.save();
      ctx.rotate(petal * Math.PI * 2 / 5);
      ctx.beginPath();
      ctx.ellipse(radius * 0.7, 0, radius * 0.72, radius * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = COLORS.flowerCore;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function drawScene(ctx, { plant, size, wilt = 0, progress = 1, newborn = null, clear = true }) {
  if (clear) ctx.clearRect(0, 0, size, size);
  pot(ctx, size);
  if (!plant.steps) {
    seed(ctx, size);
    return;
  }
  branches(ctx, plant, size, progress, newborn);
  leaves(ctx, plant, size, wilt, progress, newborn);
  flowers(ctx, plant, size, wilt, progress, newborn);
}

export function drawDrop(ctx, size, t) {
  const y = (0.05 + 0.725 * t) * size;
  const radius = size * 0.024;
  /* 着地の直前でつぶれる。落ちてきたことが目で分かるように。 */
  const squash = t > 0.86 ? (t - 0.86) / 0.14 : 0;
  const wide = radius * (1 + squash * 0.45);
  const tall = radius * (1 - squash * 0.5);
  ctx.save();
  ctx.translate(size * 0.5, y);
  ctx.fillStyle = COLORS.water;
  ctx.beginPath();
  ctx.moveTo(0, -tall * 1.55);
  ctx.bezierCurveTo(-wide, -tall * 0.3, -wide, tall, 0, tall);
  ctx.bezierCurveTo(wide, tall, wide, -tall * 0.3, 0, -tall * 1.55);
  ctx.fill();
  ctx.restore();
}

export function drawRipple(ctx, size, t) {
  ctx.save();
  ctx.strokeStyle = COLORS.water;
  ctx.lineCap = 'round';
  for (let ring = 0; ring < 2; ring += 1) {
    /* 外側の輪が先に広がり、内側の輪が追いかける。土の面からはみ出さない。 */
    const spread = Math.max(0, Math.min(1, t - ring * 0.28));
    const radius = size * (0.024 + spread * 0.094);
    ctx.globalAlpha = Math.max(0, (1 - t) * (ring ? 0.55 : 0.95));
    ctx.lineWidth = Math.max(1.5, size * 0.009 * (1 - t * 0.45));
    ctx.beginPath();
    ctx.ellipse(size * 0.5, size * 0.795, radius, radius * 0.26, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
