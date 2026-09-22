import { PALETTE, HERO } from './sprites/hero.js';
import { PROPS } from './sprites/props.js';
const forms = ['chibi', 'namahage', 'arakioni'];
export function drawSprite(ctx, sprite, x, y, frame = 'idle', flip = false) {
  const rows = sprite.frames[frame] ?? sprite.frames.idle;
  for (let yy = 0; yy < sprite.h; yy++) {
    for (let xx = 0; xx < sprite.w; xx++) {
      const color = parseInt(rows[yy][xx], 36);
      if (!color) {
        continue;
      }
      ctx.fillStyle = PALETTE[color];
      ctx.fillRect(
        Math.round(x) + (flip ? sprite.w - 1 - xx : xx),
        Math.round(y) + yy,
        1,
        1,
      );
    }
  }
}
// 遠景。ワールドごとに、山・杉林・吹雪の尾根・里の家並みを描き分ける。
const SKY = ['', '#111827', '#16282a', '#243349', '#1d1b2e'];
const FAR = ['', '#1b2740', '#172c2c', '#2e3f56', '#2a2440'];
const NEAR = ['', '#27354f', '#1e3a34', '#3b4e66', '#3a3054'];

// 尾根。1画素ずつ高さを決めて塗るので、斜面も四角いまま（拡大しても滑らかにならない）。
function ridge(ctx, camera, { color, parallax, period, peak, base, offset = 0 }) {
  ctx.fillStyle = color;
  for (let x = 0; x < 320; x++) {
    const world = x + camera * parallax + offset;
    const t = ((world % period) + period) % period;
    const half = period / 2;
    const climb = t < half ? t / half : (period - t) / half;
    const top = Math.round(base - climb * peak);
    ctx.fillRect(x, top, 1, 192 - top);
  }
}

// 杉。下へ行くほど広がる三角を等間隔に並べる。
function cedars(ctx, camera, { color, parallax, period, height, base }) {
  ctx.fillStyle = color;
  const shift = (camera * parallax) % period;
  for (let i = -1; i <= 320 / period + 1; i++) {
    const x = Math.round(i * period - shift);
    for (let row = 0; row < height; row++) {
      const half = Math.round(((row + 1) / height) * period * 0.34);
      ctx.fillRect(x - half, base - height + row, half * 2 + 1, 1);
    }
    ctx.fillRect(x - 1, base, 3, 8);
  }
}

// 里の家。窓に灯りが入る。
function houses(ctx, camera, { parallax, period, base }) {
  const shift = (camera * parallax) % period;
  for (let i = -1; i <= 320 / period + 1; i++) {
    const x = Math.round(i * period - shift);
    const tall = 26 + ((i % 3) + 3) % 3 * 8;
    ctx.fillStyle = '#241f36';
    ctx.fillRect(x, base - tall, 34, tall);
    ctx.fillStyle = '#2f2a45';
    for (let row = 0; row < 3; row++) {
      ctx.fillRect(x - 2 - row * 2, base - tall - 3 + row, 38 + row * 4, 1);
    }
    ctx.fillStyle = '#8a6a3a';
    for (let w = 0; w < 3; w++) {
      if ((i + w) % 4 === 0) continue;
      ctx.fillRect(x + 5 + w * 10, base - tall + 8, 5, 5);
    }
  }
}

// 星。位置は番号から決まるので、どの端末でも同じ夜空になる。
function stars(ctx, camera) {
  ctx.fillStyle = '#e9f3f5';
  for (let i = 0; i < 26; i++) {
    const x = Math.round((i * 97 - camera * 0.08) % 320 + 320) % 320;
    ctx.fillRect(x, 8 + ((i * 53) % 60), 1, 1);
  }
}

function moon(ctx, x, y, r) {
  ctx.fillStyle = '#f4f1e4';
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.round(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(x - half, y + dy, half * 2 + 1, 1);
  }
  ctx.fillStyle = '#d9d6c6';
  ctx.fillRect(x - 2, y - 1, 2, 2);
  ctx.fillRect(x + 1, y + 2, 2, 2);
}

function drawBackdrop(ctx, s, camera) {
  const sky = s.level.sky;
  ctx.fillStyle = SKY[sky];
  ctx.fillRect(0, 0, 320, 192);
  if (sky !== 3) {
    stars(ctx, camera);
    moon(ctx, 268, 30, 7);
  }
  if (sky === 1) {
    ridge(ctx, camera, { color: FAR[1], parallax: 0.12, period: 190, peak: 78, base: 176 });
    ridge(ctx, camera, { color: NEAR[1], parallax: 0.3, period: 120, peak: 54, base: 182, offset: 60 });
  } else if (sky === 2) {
    ridge(ctx, camera, { color: FAR[2], parallax: 0.12, period: 220, peak: 60, base: 176 });
    cedars(ctx, camera, { color: NEAR[2], parallax: 0.34, period: 46, height: 62, base: 170 });
  } else if (sky === 3) {
    ridge(ctx, camera, { color: FAR[3], parallax: 0.1, period: 150, peak: 70, base: 178 });
    ridge(ctx, camera, { color: NEAR[3], parallax: 0.26, period: 96, peak: 44, base: 184, offset: 40 });
    // 吹雪。横に流れる雪。
    ctx.fillStyle = '#e9f3f5';
    for (let i = 0; i < 80; i++) {
      const x = Math.round((i * 137 - s.tick * 2.1) % 336 + 336) % 336 - 8;
      const y = Math.round((i * 83 + s.tick * 0.9) % 192);
      ctx.fillRect(x, y, 2, 1);
    }
  } else {
    ridge(ctx, camera, { color: FAR[4], parallax: 0.1, period: 200, peak: 52, base: 174 });
    houses(ctx, camera, { parallax: 0.32, period: 58, base: 176 });
  }
}

// 面幅に合わせてカメラを動かし、背景から順に描く。
export function render(ctx, state) {
  ctx.imageSmoothingEnabled = false;
  const s = state,
    p = s.player,
    camera = Math.max(
      0,
      Math.min(s.level.rows[0].length * 16 - 320, p.x - 110),
    );
  drawBackdrop(ctx, s, camera);
  s.level.rows.forEach((row, y) =>
    [...row].forEach((t, x) => {
      const name = { '#': 'snow', '~': 'ice', '=': 'platform' }[t];
      if (name && x * 16 - camera > -16 && x * 16 - camera < 320) {
        drawSprite(ctx, PROPS[name], x * 16 - camera, y * 16);
      }
    }),
  );
  for (const e of s.entities) {
    if (!e.alive) {
      continue;
    }
    const name = {
      C: 'crow',
      D: 'dog',
      o: 'mochi',
      '*': 'rice',
      '^': 'icicle',
      G: 'door',
      M: 'platform',
    }[e.type];
    drawSprite(
      ctx,
      PROPS[name],
      e.x - camera,
      e.drawY ?? e.y,
      e.type === 'C' || e.type === 'D'
        ? Math.floor(s.tick / 16) % 2
          ? 'walk1'
          : 'walk2'
        : 'idle',
    );
    if (e.type === 'M') {
      drawSprite(ctx, PROPS.platform, e.x + 16 - camera, e.y);
    }
  }
  const frame =
    s.status === 'dying' || p.invincible > 0
      ? 'hurt'
      : !p.grounded
        ? 'jump'
        : Math.abs(p.vx) > 5
          ? Math.floor(s.tick / 12) % 2
            ? 'walk1'
            : 'walk2'
          : 'idle';
  if (p.invincible === 0 || Math.floor(s.tick / 8) % 2 === 0) {
    drawSprite(
      ctx,
      HERO[forms[s.stage]],
      p.x - camera,
      p.y,
      frame,
      p.facing < 0,
    );
  }
  if (s.status === 'dying') {
    ctx.fillStyle = '#1a1220dc';
    ctx.fillRect(40, 64, 240, 48);
    ctx.fillStyle = '#f7e8c3';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ひと息ついて、もう一度。', 160, 92);
  }
}
