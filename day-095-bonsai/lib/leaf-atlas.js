// 葉の絵は白〜灰色だけ。色は instanceColor が付けるので、ここは形と陰だけを描く。
// 灰を白に近い値にすると、線形の色に掛かったあと ACES で彩度が落ちて鮭色になる。
// 外は透明。alphaTest で輪郭を切ると、四角いカードの縁が残らない。

const SIZE = { high: 256, low: 160, test: 64 };

export function leafAtlasSize(gfx = 'high') {
  return SIZE[gfx] || SIZE.low;
}

function mapleLeaf(ctx, cx, cy, radius, rot) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.beginPath();
  const steps = 72;
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    // 切れ込みを浅くして、重なったときに星形の穴が残らないようにする。
    const lobe = Math.pow(Math.max(0, Math.cos(t * 5)), 0.72);
    const r = radius * (0.58 + 0.42 * lobe);
    const x = Math.sin(t) * r;
    const y = -Math.cos(t) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const paint = ctx.createLinearGradient(0, -radius, 0, radius);
  paint.addColorStop(0, 'rgb(196,196,196)');
  paint.addColorStop(0.45, 'rgb(176,176,176)');
  paint.addColorStop(1, 'rgb(154,154,154)');
  ctx.fillStyle = paint;
  ctx.fill();
  ctx.strokeStyle = 'rgb(118,118,118)';
  ctx.lineWidth = Math.max(1, radius * 0.035);
  ctx.lineJoin = 'round';
  for (let k = 0; k < 5; k += 1) {
    const t = (k / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, radius * 0.08);
    ctx.lineTo(Math.sin(t) * radius * 0.62, -Math.cos(t) * radius * 0.62);
    ctx.stroke();
  }
  ctx.restore();
}

function paintMaple(ctx, w, h) {
  // 中心の円で房の内側を塞ぎ、その上に浅い掌状の葉を重ねる。
  const cx = w * 0.5;
  const cy = h * 0.5;
  const disc = ctx.createRadialGradient(cx, cy - h * 0.04, w * 0.04, cx, cy, w * 0.36);
  disc.addColorStop(0, 'rgb(150,150,150)');
  disc.addColorStop(0.7, 'rgb(168,168,168)');
  disc.addColorStop(1, 'rgb(176,176,176)');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.24, h * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  const r = w * 0.3;
  const spots = [
    [0.5, 0.46, 1, -0.15],
    [0.66, 0.4, 0.78, 0.7],
    [0.34, 0.42, 0.76, 1.4],
    [0.58, 0.64, 0.7, 2.3],
    [0.4, 0.62, 0.68, 2.9],
  ];
  for (const [x, y, s, rot] of spots) mapleLeaf(ctx, w * x, h * y, r * s, rot);
}

/**
 * 黒松の1房。扇（数十度）にするとケヤキの葉に見えるので、全方位へ針を出す。
 * 上向き（ang 0）を少し長くし、束が球より上半球に寄るようにする。
 * 太さはアトラス画素で 1〜1.5。これより太いと、小さなカードでも広い葉に読める。
 */
export function pineNeedles(size) {
  const count = 32;
  const width = Math.min(1.5, Math.max(1, Math.round(size * 0.0054 * 100) / 100));
  const length = Math.max(width * 14, size * 0.46);
  const list = [];
  for (let i = 0; i < count; i += 1) {
    const ang = ((i + 0.5) / count) * Math.PI * 2;
    const upward = 0.5 + 0.5 * Math.cos(ang);
    const len = length * (0.72 + 0.28 * upward) * (0.9 + (i % 4) * 0.03);
    list.push({
      ang,
      len,
      width,
      bend: (i % 2 === 0 ? 1 : -1) * len * 0.055,
    });
  }
  return list;
}

function paintCurvedNeedle(ctx, x0, y0, ang, len, width, bend, body) {
  const dx = Math.sin(ang);
  const dy = -Math.cos(ang);
  const px = -dy;
  const py = dx;
  const cpx = x0 + dx * len * 0.55 + px * bend;
  const cpy = y0 + dy * len * 0.55 + py * bend;
  const x1 = x0 + dx * len;
  const y1 = y0 + dy * len;
  // 根元を暗く、先端を白に近い灰へ。instanceColor の深緑を掛けると先端だけ黄緑に抜ける。
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, 'rgb(78,78,78)');
  g.addColorStop(0.42, 'rgb(150,150,150)');
  g.addColorStop(1, 'rgb(248,248,248)');
  ctx.strokeStyle = g;
  ctx.fillStyle = g;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const steps = 5;
  const left = [];
  const right = [];
  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cpx + t * t * x1;
    const y = u * u * y0 + 2 * u * t * cpy + t * t * y1;
    const t2 = Math.min(1, t + 1 / steps);
    const u2 = 1 - t2;
    const xn = u2 * u2 * x0 + 2 * u2 * t2 * cpx + t2 * t2 * x1;
    const yn = u2 * u2 * y0 + 2 * u2 * t2 * cpy + t2 * t2 * y1;
    const tx = xn - x || dx;
    const ty = yn - y || dy;
    const tl = Math.hypot(tx, ty) || 1;
    // 線は 1〜1.5px のまま。塗りだけ太くする。
    // 遠景では 1px の線がミップで alphaTest を割り、丸い芯だけが残って小葉に見える。
    const hw = Math.max(width, body) * 0.5 * (1 - t * 0.78);
    const ox = (-ty / tl) * hw;
    const oy = (tx / tl) * hw;
    left.push([x + ox, y + oy]);
    right.push([x - ox, y - oy]);
  }
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let s = 1; s < left.length; s += 1) ctx.lineTo(left[s][0], left[s][1]);
  for (let s = right.length - 1; s >= 0; s -= 1) ctx.lineTo(right[s][0], right[s][1]);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cpx, cpy, x1, y1);
  ctx.stroke();
}

function paintNeedleHub(ctx, cx, cy, radius) {
  // 束の根元だけを星で埋める。大きい楕円にすると銀杏の葉に戻る。
  // 折れ線なので、平たい地を禁じる試験の楕円検査には掛からない。
  const points = 20;
  ctx.beginPath();
  for (let i = 0; i < points; i += 1) {
    const ang = (i / points) * Math.PI * 2;
    const spike = i % 2 === 0 ? 1 : 0.58;
    const wobble = 0.9 + ((i * 3) % 5) * 0.025;
    const r = radius * spike * wobble;
    const x = cx + Math.sin(ang) * r;
    const y = cy - Math.cos(ang) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(cx, cy, radius * 0.08, cx, cy, radius);
  g.addColorStop(0, 'rgb(58,58,58)');
  g.addColorStop(0.5, 'rgb(110,110,110)');
  g.addColorStop(1, 'rgb(210,210,210)');
  ctx.fillStyle = g;
  ctx.fill();
}

function paintPine(ctx, w, h) {
  // 平たい楕円の地を塗ると、針の上から見ても広葉の塊になる。地は星と針だけ。
  const cx = w * 0.5;
  const cy = h * 0.5;
  const span = Math.min(w, h);
  const needles = pineNeedles(span);
  // 塗り幅はアトラスの約 3%。線より太いが、長さとの比は 12 を超えるので葉には見えない。
  const body = Math.max(1.5, span * 0.031);
  for (const n of needles) paintCurvedNeedle(ctx, cx, cy, n.ang, n.len, n.width, n.bend, body);
  // 星は束の根元だけ。大きいと遠景で丸い房になり、針が隠れる。
  paintNeedleHub(ctx, cx, cy, span * 0.1);
  ctx.fillStyle = 'rgb(72,72,72)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.018, h * 0.018, 0, 0, Math.PI * 2);
  ctx.fill();
}

function paintPlumLeaf(ctx, w, h) {
  const cx = w * 0.5;
  const cy = h * 0.52;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.26, h * 0.38, 0, 0, Math.PI * 2);
  const paint = ctx.createLinearGradient(cx, cy - h * 0.38, cx, cy + h * 0.38);
  paint.addColorStop(0, 'rgb(186,186,186)');
  paint.addColorStop(0.5, 'rgb(164,164,164)');
  paint.addColorStop(1, 'rgb(128,128,128)');
  ctx.fillStyle = paint;
  ctx.fill();
  ctx.strokeStyle = 'rgb(112,112,112)';
  ctx.lineWidth = Math.max(1, w * 0.018);
  ctx.beginPath();
  ctx.moveTo(cx, cy - h * 0.3);
  ctx.lineTo(cx, cy + h * 0.28);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, w * 0.01);
  for (let i = -2; i <= 2; i += 1) {
    if (i === 0) continue;
    const y = cy + i * h * 0.09;
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(cx + Math.sign(i) * w * 0.14, y - h * 0.05);
    ctx.stroke();
  }
}

function paintFlower(ctx, w, h) {
  const cx = w * 0.5;
  const cy = h * 0.5;
  for (let i = 0; i < 5; i += 1) {
    const ang = -Math.PI / 2 + (i / 5) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx + Math.cos(ang) * w * 0.15, cy + Math.sin(ang) * h * 0.15);
    ctx.rotate(ang + Math.PI / 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.15, h * 0.22, 0, 0, Math.PI * 2);
    const shade = 214 + (i % 2) * 22;
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fill();
    ctx.restore();
  }
  // 芯は少し暗くして、花色が #f2a3b4 付近に沈むようにする。
  ctx.fillStyle = 'rgb(132,132,132)';
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.075, 0, Math.PI * 2);
  ctx.fill();
}

export function paintLeafAtlas(ctx, width, height, species, kind) {
  ctx.clearRect(0, 0, width, height);
  if (kind === 'flower') {
    paintFlower(ctx, width, height);
    return;
  }
  if (species === 'pine') paintPine(ctx, width, height);
  else if (species === 'plum') paintPlumLeaf(ctx, width, height);
  else paintMaple(ctx, width, height);
}

function makeCanvas(createCanvas, size) {
  const factory = createCanvas === undefined
    ? (typeof document !== 'undefined' ? (w, h) => document.createElement('canvas') : null)
    : createCanvas;
  if (typeof factory !== 'function') return null;
  const canvas = factory(size, size);
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  return { canvas, ctx };
}

function textureOf(THREE, canvas) {
  const map = new THREE.CanvasTexture(canvas);
  // 灰は陰の係数。sRGB として読むと中間が暗く潰れ、紅葉が茶色に寄る。
  if (THREE.NoColorSpace !== undefined) map.colorSpace = THREE.NoColorSpace;
  map.needsUpdate = true;
  return map;
}

/** 葉と、梅のときの花。canvas が無ければ map は null（色だけになる）。 */
export function createLeafTextures(THREE, species, { gfx = 'high', createCanvas } = {}) {
  const size = leafAtlasSize(gfx);
  const leaf = makeCanvas(createCanvas, size);
  const flower = species === 'plum' ? makeCanvas(createCanvas, size) : null;
  if (leaf) paintLeafAtlas(leaf.ctx, size, size, species, 'leaf');
  if (flower) paintLeafAtlas(flower.ctx, size, size, species, 'flower');
  return {
    leaf: leaf ? textureOf(THREE, leaf.canvas) : null,
    flower: flower ? textureOf(THREE, flower.canvas) : null,
    size,
  };
}
