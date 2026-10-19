// 紹介画像（og.png・1200×630）を、ゲームの描画器（lib/view.js）とシステムフォントだけで作る。
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const server = spawn(process.execPath, [fileURLToPath(new URL('./serve.mjs', import.meta.url))], {
  env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;
try {
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Preview startup timed out')), 10000);
    server.stdout.on('data', (chunk) => {
      const match = chunk.toString().match(/http:\/\/[^\s]+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
    server.once('error', reject);
    server.once('exit', (code) => { if (code) reject(new Error(`Preview exited: ${code}`)); });
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(url);
  const png = await page.evaluate(async () => {
    const { CASES, stageOf } = await import('./lib/cases.js');
    const { solutionArrangement } = await import('./lib/score.js');
    const { createWallRenderer, createSketchRenderer } = await import('./lib/view.js');
    const W = 1200;
    const H = 630;
    const serif = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
    const sans = 'system-ui, -apple-system, "Hiragino Sans", sans-serif';
    const image = document.createElement('canvas');
    image.width = W;
    image.height = H;
    const ctx = image.getContext('2d');
    const text = (value, size, x, y, { weight = 700, color = '#f1ecff', family = sans, spacing = '0px', align = 'left' } = {}) => {
      ctx.font = `${weight} ${size}px ${family}`;
      ctx.fillStyle = color;
      ctx.letterSpacing = spacing;
      ctx.textAlign = align;
      ctx.fillText(value, x, y);
      ctx.letterSpacing = '0px';
    };
    const box = (x, y, w, h, radius, fill, stroke) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radius);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
    };
    // 画面と同じ描画器で、夜5の「傘の人」を再現した壁を描く。
    const draw = (make, width, height, render) => {
      const canvas = document.createElement('canvas');
      Object.assign(canvas.style, { position: 'fixed', left: '-10000px', top: '0', width: `${width}px`, height: `${height}px` });
      document.body.append(canvas);
      const renderer = make(canvas);
      renderer.resize();
      render(renderer);
      return canvas;
    };
    const caseDef = CASES.find((item) => item.id === 'umbrella');
    const stage = stageOf(caseDef);
    const wall = draw(createWallRenderer, 560, 388, (r) => r.render({ stage, arrangement: solutionArrangement(stage), selected: null, guideOn: false, flash: 0 }));
    const sketch = draw(createSketchRenderer, 210, 158, (r) => r.render(stage));

    ctx.fillStyle = '#12102a';
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(860, 0, 10, 860, 0, 760);
    glow.addColorStop(0, '#34307f');
    glow.addColorStop(1, 'rgba(52, 48, 127, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    text('KAGE-SHŌGEN', 22, 68, 96, { color: '#ffb84d', spacing: '5px' });
    text('影証言', 168, 60, 258, { family: serif });
    text('灯りの高さで、', 46, 68, 346, { family: serif, weight: 700 });
    text('証言の嘘を暴く。', 46, 68, 404, { family: serif, weight: 700 });
    text('停電の夜、壁に映った人影は本物か。', 25, 68, 466, { weight: 500, color: '#b9b2d8' });
    let x = 68;
    for (const label of ['5つの夜', '影絵×推理', '約10分']) {
      ctx.font = `700 22px ${sans}`;
      const width = ctx.measureText(label).width + 40;
      box(x, 506, width, 46, 23, 'rgba(255, 184, 77, 0.14)', '#ffb84d');
      text(label, 22, x + 20, 538, { color: '#ffb84d' });
      x += width + 14;
    }

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 16;
    box(612, 52, 560, 388, 22, '#12102a');
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(612, 52, 560, 388, 22);
    ctx.clip();
    ctx.drawImage(wall, 612, 52, 560, 388);
    ctx.restore();
    box(612, 52, 560, 388, 22, null, '#3b3573');

    // 目撃者のスケッチ（壁の左下に重ねる）。
    ctx.save();
    ctx.translate(672, 420);
    ctx.rotate(-0.07);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    box(-14, -14, 238, 214, 10, '#efe6cf');
    ctx.restore();
    ctx.save();
    ctx.translate(672, 420);
    ctx.rotate(-0.07);
    ctx.drawImage(sketch, 0, 0, 210, 158);
    text('証言のスケッチ', 18, 105, 184, { color: '#6b4f2a', align: 'center' });
    ctx.restore();

    // 朱の印。
    ctx.save();
    ctx.translate(1072, 392);
    ctx.rotate(-0.16);
    ctx.fillStyle = 'rgba(239, 230, 207, 0.94)';
    ctx.beginPath();
    ctx.roundRect(-82, -40, 164, 80, 12);
    ctx.fill();
    ctx.strokeStyle = '#d6402f';
    ctx.lineWidth = 5;
    ctx.strokeRect(-76, -34, 152, 68);
    ctx.lineWidth = 2;
    ctx.strokeRect(-68, -26, 136, 52);
    text('再現', 50, 0, 18, { family: serif, color: '#d6402f', spacing: '8px', align: 'center' });
    ctx.restore();

    return image.toDataURL('image/png').split(',')[1];
  });
  await writeFile(new URL('../og.png', import.meta.url), Buffer.from(png, 'base64'));
  console.log('Created day-071-kage-shogen/og.png (1200×630) from the game renderers.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
