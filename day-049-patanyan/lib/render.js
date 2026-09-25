import { WORLD, PHYS } from './physics.js';
import { CRASH } from './game.js';
import { drawCat } from './cat.js';
import { drawNumber } from './digits.js';
import { mulberry32 } from './rng.js';
import { roundRectPath, ellipsePath, circlePath, starPath, lerp, clamp } from './draw.js';

import { skyForScore } from './sky.js';

const SKY_STOPS = [0, 0.42, 0.7, 0.88, 1];

// ゲームの物理時刻で補間すれば、一時停止中も空の変化が止まる。
export function blendSky(from, to, progress) {
  const t = clamp(progress, 0, 1);
  const color = (a, b) => '#' + [1, 3, 5].map((i) => Math.round(lerp(
    parseInt(a.slice(i, i + 2), 16), parseInt(b.slice(i, i + 2), 16), t,
  )).toString(16).padStart(2, '0')).join('');
  return { ...to, colors: to.colors.map((c, i) => color(from.colors[i], c)),
    cloud: color(from.cloud, to.cloud), window: color(from.window, to.window),
    pole: color(from.pole, to.pole), stars: lerp(from.stars, to.stars, t), night: lerp(from.night, to.night, t) };
}

export function drawStars(ctx, box, groundY, sky) {
  if (!sky.stars) return;
  ctx.save();
  ctx.globalAlpha = sky.stars;
  ctx.fillStyle = '#fff4d9';
  const rng = mulberry32(79);
  for (let i = 0; i < 65; i += 1) {
    const x = box.left + rng() * (box.right - box.left);
    const y = box.top + rng() * Math.max(0, groundY - 100 - box.top);
    const r = 0.6 + rng() * 0.7;
    ctx.beginPath();
    circlePath(ctx, x, y, r);
    ctx.fill();
  }
  ctx.restore();
}

// クッションはパステル5色。緑は使わない（危険/安全の色分けに見えないように）
const CUSHIONS = [
  ['#f7b8c8', '#c47790'],
  ['#c9b8ee', '#8a74c0'],
  ['#b6d9f3', '#6a9ac0'],
  ['#f9caa2', '#c48b58'],
  ['#f2e39c', '#b19c4c'],
];

function makeHouses(seed, tile, minW, maxW, minH, maxH) {
  const rng = mulberry32(seed);
  const list = [];
  let x = 0;
  while (x < tile - minW) {
    const w = minW + rng() * (maxW - minW);
    const h = minH + rng() * (maxH - minH);
    list.push({ x, w, h, roof: 10 + rng() * 9, lit: [rng() < 0.55, rng() < 0.4, rng() < 0.5], hip: rng() < 0.4 });
    x += w + 3 + rng() * 10;
  }
  return list;
}

const TOWN = {
  far: { tile: 640, color: '#a4749f', ridge: '#8f6390', houses: makeHouses(7, 640, 40, 78, 26, 52), base: 8 },
  near: { tile: 700, color: '#5c456f', ridge: '#4b3860', houses: makeHouses(11, 700, 44, 84, 18, 40), base: 2 },
};

export function drawSky(ctx, box, groundY, sky = skyForScore(0)) {
  const g = ctx.createLinearGradient(0, Math.min(box.top, groundY - 560), 0, groundY);
  sky.colors.forEach((c, i) => g.addColorStop(SKY_STOPS[i], c));
  ctx.fillStyle = g;
  ctx.fillRect(box.left - 1, box.top - 1, box.right - box.left + 2, box.bottom - box.top + 2);
}

export function drawSun(ctx, x, y, r) {
  const glow = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 3.2);
  glow.addColorStop(0, 'rgba(255,236,190,0.55)');
  glow.addColorStop(1, 'rgba(255,236,190,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - r * 3.3, y - r * 3.3, r * 6.6, r * 6.6);
  ctx.fillStyle = '#fff0c8';
  ctx.beginPath();
  circlePath(ctx, x, y, r);
  ctx.fill();
}

export function drawClouds(ctx, box, groundY, offset, sky = skyForScore(0)) {
  const tile = 760;
  const clouds = [
    [70, -332, 1],
    [340, -268, 0.8],
    [560, -392, 1.15],
  ];
  ctx.fillStyle = `${sky.cloud}6b`;
  const start = Math.floor((box.left + offset) / tile) - 1;
  for (let k = start; k * tile - offset < box.right + 80; k += 1) {
    for (const [cx, cy, s] of clouds) {
      const x = k * tile + cx - offset;
      const y = groundY + cy;
      if (x < box.left - 90 || x > box.right + 90) continue;
      ctx.beginPath();
      ellipsePath(ctx, x, y, 34 * s, 8 * s);
      ellipsePath(ctx, x - 12 * s, y - 6 * s, 14 * s, 8 * s);
      ellipsePath(ctx, x + 10 * s, y - 8 * s, 17 * s, 10 * s);
      ctx.fill();
    }
  }
}

function housePath(ctx, x, top, w, roofH, bottom, hip) {
  const eave = top + roofH;
  ctx.moveTo(x + 2, bottom);
  ctx.lineTo(x + 2, eave);
  ctx.lineTo(x - 5, eave);
  // 瓦屋根の反り：軒先で少し持ち上がる二次曲線
  ctx.quadraticCurveTo(x + w * 0.16, eave - roofH * 0.25, x + w * (hip ? 0.3 : 0.2), top);
  ctx.lineTo(x + w * (hip ? 0.7 : 0.8), top);
  ctx.quadraticCurveTo(x + w * 0.84, eave - roofH * 0.25, x + w + 5, eave);
  ctx.lineTo(x + w - 2, eave);
  ctx.lineTo(x + w - 2, bottom);
  ctx.closePath();
}

export function drawTown(ctx, box, groundY, offset, layer, sky = skyForScore(0)) {
  const L = TOWN[layer];
  const bottom = groundY + 10;
  const start = Math.floor((box.left + offset) / L.tile) - 1;
  for (let k = start; k * L.tile - offset < box.right + 20; k += 1) {
    for (const h of L.houses) {
      const x = k * L.tile + h.x - offset;
      if (x > box.right + 10 || x + h.w < box.left - 10) continue;
      const top = groundY - L.base - h.h - h.roof;
      ctx.beginPath();
      housePath(ctx, x, top, h.w, h.roof, bottom, h.hip);
      ctx.fillStyle = L.color;
      ctx.fill();
      // 棟の両端を少し上げて、瓦屋根の町だと遠目でもわかるようにする
      ctx.fillStyle = L.ridge;
      ctx.fillRect(x + h.w * (h.hip ? 0.3 : 0.2) - 2, top - 2.5, h.w * (h.hip ? 0.4 : 0.6) + 4, 3);
      if (layer === 'near') {
        ctx.fillStyle = sky.window;
        const wy = top + h.roof + 6;
        h.lit.forEach((on, i) => {
          if (!on) return;
          const wx = x + 8 + i * ((h.w - 22) / 2);
          if (wy + 7 < groundY) ctx.fillRect(wx, wy, 6, 7);
        });
      }
    }
  }
}

// 地面は瓦屋根。丸瓦の縦筋と段を描き、飛ぶ速さで流す
export function drawRoof(ctx, box, groundY, dist) {
  const left = box.left - 2;
  const width = box.right - box.left + 4;
  ctx.fillStyle = '#4f5873';
  ctx.fillRect(left, groundY, width, box.bottom - groundY + 2);
  const period = 13;
  const off = ((dist % period) + period) % period;
  const rowH = 15;
  for (let r = 0, y = groundY + 9; y < box.bottom + rowH; r += 1, y += rowH) {
    const shift = r % 2 ? period / 2 : 0;
    ctx.fillStyle = '#65708d';
    ctx.beginPath();
    for (let x = Math.floor((left + off) / period) * period - off - period + shift; x < box.right + period; x += period) {
      roundRectPath(ctx, x, y, 7, rowH - 1, 3.5);
    }
    ctx.fill();
    ctx.fillStyle = '#3e4660';
    ctx.fillRect(left, y + rowH - 2, width, 2);
  }
  ctx.fillStyle = '#383e56';
  ctx.fillRect(left, groundY, width, 9);
  ctx.fillStyle = '#6f7a98';
  ctx.fillRect(left, groundY + 1, width, 2);
}

function drawPoleBody(ctx, x, y1, y2, w, sky) {
  if (y2 <= y1) return;
  ctx.fillStyle = sky.pole;
  ctx.fillRect(x, y1, w, y2 - y1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y1, w, y2 - y1);
  ctx.clip();
  // 麻縄の斜めの巻き目。ポール自身の座標で描くので、ポールと一緒に流れる
  const start = y1 - w - ((y1 - w) % 6);
  ctx.beginPath();
  for (let y = start; y < y2 + 6; y += 6) {
    ctx.moveTo(x - 1, y);
    ctx.lineTo(x + w + 1, y + w * 0.42);
  }
  ctx.strokeStyle = '#ccb084';
  ctx.lineWidth = 2.3;
  ctx.stroke();
  ctx.beginPath();
  for (let y = start + 3; y < y2 + 6; y += 6) {
    ctx.moveTo(x - 1, y);
    ctx.lineTo(x + w + 1, y + w * 0.42);
  }
  ctx.strokeStyle = 'rgba(255,248,232,0.7)';
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(x + w * 0.14, y1, w * 0.16, y2 - y1);
  ctx.fillStyle = 'rgba(100,66,34,0.18)';
  ctx.fillRect(x + w * 0.78, y1, w * 0.22, y2 - y1);
  ctx.restore();
  ctx.strokeStyle = '#8d6b46';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y1, w, y2 - y1);
}

function drawCushion(ctx, x, y, w, colors) {
  const [fill, edge] = colors;
  ctx.beginPath();
  roundRectPath(ctx, x - 3, y, w + 6, 13, 6);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = edge;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  roundRectPath(ctx, x + 4, y + 2.5, w - 8, 3, 1.5);
  ctx.fill();
  ctx.fillStyle = edge;
  ctx.beginPath();
  circlePath(ctx, x + w / 2, y + 8, 1.6);
  ctx.fill();
}

export function drawPole(ctx, pole, sx, ceilingY, groundY, viewTop, sky = skyForScore(0)) {
  const w = pole.w;
  const top = ceilingY + pole.top;
  const bottom = ceilingY + pole.bottom;
  const colors = CUSHIONS[(pole.n - 1) % CUSHIONS.length];
  drawPoleBody(ctx, sx, viewTop - 4, top - 13, w, sky);
  drawCushion(ctx, sx, top - 13, w, colors);
  drawPoleBody(ctx, sx, bottom + 13, groundY + 2, w, sky);
  drawCushion(ctx, sx, bottom, w, colors);
}

export function drawFish(ctx, x, y, s = 1, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.globalAlpha = alpha;
  const halo = ctx.createRadialGradient(0, 0, 3, 0, 0, 13);
  halo.addColorStop(0, 'rgba(255,255,255,0.5)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(-13, -13, 26, 26);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.lineTo(-12, -5.2);
  ctx.quadraticCurveTo(-10, 0, -12, 5.2);
  ctx.closePath();
  ctx.fillStyle = '#58a3dc';
  ctx.fill();
  ctx.strokeStyle = '#1f4a73';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.beginPath();
  ellipsePath(ctx, 0, 0, 8.5, 5.6);
  ctx.fillStyle = '#80c4f2';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#e8f5fd';
  ctx.beginPath();
  ellipsePath(ctx, 1, 3.4, 7, 3);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ellipsePath(ctx, 0, 0, 8.5, 5.6);
  ctx.stroke();
  ctx.fillStyle = '#1b2d44';
  ctx.beginPath();
  circlePath(ctx, 4.4, -1.3, 1.35);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  circlePath(ctx, 4.8, -1.7, 0.5);
  ctx.fill();
  ctx.restore();
}

// 判定の円より顔が大きいので、ポールの星は接点からさらに離し、接点への線を猫の後ろに描く
export const BURST = Object.freeze({ r: 7.5, off: 7.5, fade: 0.3 });
const BURST_INK = '#5b2f45';

// はじけの大きさと濃さ。0.25秒の停止中はずっと見え、その後0.3秒で消える（null＝描かない）。
// 動きを減らす設定では、大きさも濃さも変えずに静止で出す
export function burstLook(age, reduced) {
  if (!(age >= 0) || age >= CRASH.freeze + BURST.fade) return null;
  if (reduced) return { s: 1, alpha: 1 };
  const pop = age < 0.05 ? 0.45 + (age / 0.05) * 0.7 : age < 0.1 ? 1.15 - ((age - 0.05) / 0.05) * 0.15 : 1;
  const out = age < CRASH.freeze ? 0 : (age - CRASH.freeze) / BURST.fade;
  return { s: pop * (1 + out * 0.25), alpha: 1 - out };
}

// 小さくはじける瞬間も顔に戻らないよう、ポール側の余白は拡縮しない
export function burstCenter(hit, x, y, s = 1) {
  const nx = Number.isFinite(hit.nx) ? hit.nx : 1;
  const ny = Number.isFinite(hit.ny) ? hit.ny : 0;
  const offset = BURST.off * s + (hit.kind === 'pole' ? 8 : 0);
  return { x: x + nx * offset, y: y + ny * offset, ang: Math.atan2(ny, nx) };
}

function drawHitBurst(ctx, hit, x, y, age, reduced, layer) {
  const look = burstLook(age, reduced);
  if (!look) return;
  const r = BURST.r * look.s;
  const c = burstCenter(hit, x, y, look.s);
  ctx.save();
  ctx.globalAlpha = look.alpha;
  if (layer === 'back') {
    // 接点近くの光と線だけを残し、離れたクッションを衝突箇所に見せない
    if (hit.kind === 'pole') {
      ctx.beginPath();
      circlePath(ctx, x, y, 12);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(c.x, c.y);
      ctx.strokeStyle = BURST_INK;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = '#fff6c4';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    const glow = ctx.createRadialGradient(c.x, c.y, 1, c.x, c.y, r * 1.9);
    glow.addColorStop(0, 'rgba(255,248,214,0.9)');
    glow.addColorStop(1, 'rgba(255,248,214,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(c.x - r * 2, c.y - r * 2, r * 4, r * 4);
    ctx.restore();
    return;
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // 火花3本：外向きと、その左右72°（星の角と角のあいだ）。濃い下地に明るい線を重ね、空でもポールでも見えるようにする
  for (const da of [0, -0.4 * Math.PI, 0.4 * Math.PI]) {
    const ux = Math.cos(c.ang + da);
    const uy = Math.sin(c.ang + da);
    ctx.beginPath();
    ctx.moveTo(c.x + ux * r * 1.3, c.y + uy * r * 1.3);
    ctx.lineTo(c.x + ux * r * 1.95, c.y + uy * r * 1.95);
    ctx.strokeStyle = BURST_INK;
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.strokeStyle = '#ffe07a';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.beginPath();
  starPath(ctx, c.x, c.y, r, c.ang - Math.PI / 2, 0.45);
  ctx.fillStyle = '#fff6c4';
  ctx.fill();
  ctx.strokeStyle = BURST_INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

// 猫の姿勢はゲームの状態と描画時刻から決める。ゲーム側は物理だけを持ち、見た目の都合を持ち込まない
export function catPose(g, rt, a) {
  const c = g.cat;
  const y = lerp(c.prevY, c.y, a);
  const x = lerp(c.prevX, c.x, a);
  const pose = { x, y, pose: 'fly', face: 'normal', paw: 0, tail: 0, angle: 0, sx: 1, sy: 1, t: rt, stars: false, puff: false };
  if (g.phase === 'ready') {
    pose.paw = 0.3 + 0.3 * Math.sin(rt * 6.2);
    pose.tail = Math.sin(rt * 2.6) * 0.25;
    pose.face = rt % 3.4 < 0.13 ? 'blink' : 'normal';
    return pose;
  }
  if (g.phase === 'flying') {
    const age = Math.max(0, rt - c.lastFlapT);
    const flapU = age < 0.14 ? 1 - age / 0.14 : 0;
    const fallU = clamp((c.vy - 180) / 420, 0, 0.6);
    pose.paw = Math.max(flapU, fallU);
    const s = 0.17 * Math.sin(age * 26 - 0.5) * Math.exp(-age * 9);
    pose.sy = 1 + s;
    pose.sx = 1 - s * 0.8;
    pose.angle = c.vy < 0 ? Math.max(-0.3, (c.vy / 420) * 0.3) : Math.min(0.45, (c.vy / PHYS.maxFall) * 0.45);
    pose.tail = Math.sin(rt * 7) * 0.16 + clamp(-c.vy / 600, -1, 1) * 0.35;
    return pose;
  }
  if (g.phase === 'crashing') {
    const since = rt - g.crashT;
    if (since < CRASH.freeze) {
      pose.face = 'surprised';
      pose.paw = 1;
      pose.sx = 1.07;
      pose.sy = 0.93;
      pose.angle = clamp(c.vy / 1400, -0.25, 0.3);
      return pose;
    }
    if (!g.bounced) {
      pose.face = 'dizzy';
      pose.angle = lerp(c.prevSpin, c.spin, a);
      pose.paw = 0.5 + 0.5 * Math.sin(rt * 22);
      pose.tail = Math.sin(rt * 14) * 0.4;
      pose.stars = true;
      return pose;
    }
    pose.pose = 'sit';
    pose.face = 'dizzy';
    pose.stars = true;
    pose.sy = 0.92;
    pose.sx = 1.06;
    return pose;
  }
  const since = rt - g.landedT;
  pose.pose = 'sit';
  pose.face = since < 0.7 ? 'dizzy' : 'grumpy';
  pose.stars = since < 0.7;
  pose.puff = since >= 0.7;
  const q = 0.1 * Math.exp(-since * 10);
  pose.sy = 1 - q;
  pose.sx = 1 + q;
  pose.tail = Math.sin(rt * 2.2) * 0.22;
  return pose;
}

/**
 * L: computeLayout の結果、g: ゲーム、o: { rt(描画するゲーム時刻), a(補間), appTime, reduced, pattern, hud }
 */
export function drawScene(ctx, L, g, o) {
  const a = o.a ?? 1;
  const dist = lerp(g.prevDist, g.dist, a);
  const box = L.view;
  const flow = o.reduced ? 0 : dist;
  const drift = o.reduced ? 0 : o.appTime * 4;
  const targetSky = skyForScore(g.score);
  const sky = o.reduced ? targetSky : blendSky(o.skyFrom ?? targetSky, targetSky, (o.rt - (o.skySince ?? 0)) / 1.5);
  drawSky(ctx, box, L.groundY, sky);
  drawStars(ctx, box, L.groundY, sky);
  drawSun(ctx, 208, L.groundY - 110, 24);
  drawClouds(ctx, box, L.groundY, drift * 0.7 + flow * 0.06, sky);
  drawTown(ctx, box, L.groundY, drift + flow * 0.18, 'far', sky);
  drawTown(ctx, box, L.groundY, drift * 1.8 + flow * 0.42, 'near', sky);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, box.top - 2, WORLD.width, box.bottom - box.top + 4);
  ctx.clip();
  const hit = g.hit;
  for (const p of g.course.poles) {
    const sx = p.x - dist;
    if (sx > WORLD.width + 4) break;
    if (sx + p.w < -8) continue;
    drawPole(ctx, p, sx, L.ceilingY, L.groundY, box.top, sky);
  }
  ctx.restore();

  drawRoof(ctx, box, L.groundY, dist);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, box.top - 2, WORLD.width, box.bottom - box.top + 4);
  ctx.clip();
  for (const p of g.course.poles) {
    if (!p.fish) continue;
    const sx = p.fish.x - dist;
    if (sx > WORLD.width + 16) break;
    if (sx < -16) continue;
    const bob = o.reduced ? 0 : Math.sin(o.appTime * 3 + p.n) * 1.6;
    if (!p.fish.taken) drawFish(ctx, sx, L.ceilingY + p.fish.y + bob, 1);
    else if (p.fish.takenAt !== undefined && o.rt - p.fish.takenAt < 0.3) {
      const k = (o.rt - p.fish.takenAt) / 0.3;
      drawFish(ctx, sx, L.ceilingY + p.fish.y - k * 14, 1 + k * 0.6, 1 - k);
    }
  }
  const pose = catPose(g, o.rt, a);
  if (g.phase === 'ready') pose.y -= L.titleLift;
  if (hit) drawHitBurst(ctx, hit, hit.x - dist, L.ceilingY + hit.y, o.rt - hit.t, o.reduced, 'back');
  // 顔が判定円からはみ出す上下の縁でも、両目と口を星の手前に残す
  if (hit?.kind === 'pole') drawHitBurst(ctx, hit, hit.x - dist, L.ceilingY + hit.y, o.rt - hit.t, o.reduced, 'front');
  ctx.save();
  // 黒猫の輪郭も夜空から見分けられるよう、明るい縁の光を足す。
  ctx.shadowColor = '#fff0cf';
  ctx.shadowBlur = 4 * sky.night;
  drawCat(ctx, { ...pose, y: L.ceilingY + pose.y, pattern: o.pattern });
  ctx.restore();
  if (hit && hit.kind !== 'pole') drawHitBurst(ctx, hit, hit.x - dist, L.ceilingY + hit.y, o.rt - hit.t, o.reduced, 'front');
  ctx.restore();

  // 横長の画面：遊び場の外を少し沈めて、どこが遊び場かを見せる
  if (box.left < -0.5) {
    ctx.fillStyle = 'rgba(28,20,52,0.34)';
    ctx.fillRect(box.left - 1, box.top - 1, -box.left + 1, box.bottom - box.top + 2);
    ctx.fillRect(WORLD.width, box.top - 1, box.right - WORLD.width + 1, box.bottom - box.top + 2);
    ctx.fillStyle = 'rgba(255,240,220,0.35)';
    ctx.fillRect(-1, box.top, 1, box.bottom - box.top);
    ctx.fillRect(WORLD.width, box.top, 1, box.bottom - box.top);
  }

  if (o.hud) {
    const top = box.top + 20;
    drawNumber(ctx, g.score, WORLD.width / 2, top, 46);
    if (g.phase === 'flying' && o.rt >= o.goalAt && o.rt - o.goalAt < 0.8) {
      ctx.save();
      ctx.font = '800 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#382640';
      ctx.fillStyle = '#fff6df';
      ctx.strokeText('目標達成！', WORLD.width / 2, top + 72);
      ctx.fillText('目標達成！', WORLD.width / 2, top + 72);
      ctx.restore();
    }
    drawFish(ctx, 17, top + 9, 0.85);
    drawNumber(ctx, g.fish, 30, top + 1, 17, { align: 'left' });
  }
}
