// Create an original OG image from the game's own live Canvas and system fonts.
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
  await page.addInitScript(() => { Math.random = () => .7; });
  await page.clock.install({ time: new Date('2026-10-18T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-18T12:00:01Z'));
  await page.goto(url);
  await page.locator('#start').click();
  await page.clock.runFor(3900);
  await page.locator('#pause').click();
  const png = await page.evaluate(() => {
    const image = document.createElement('canvas');
    image.width = 1200; image.height = 630;
    const ctx = image.getContext('2d');
    const font = 'system-ui, -apple-system, sans-serif';
    const text = (value, size, x, y, weight = 700, color = '#183d34') => {
      ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.fillText(value, x, y);
    };
    const box = (x, y, w, h, radius, color) => {
      ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fillStyle = color; ctx.fill();
    };
    ctx.fillStyle = '#f6f1e7'; ctx.fillRect(0, 0, 1200, 630);
    box(0, 0, 20, 630, 0, '#184e42');
    text('FLIP COURT', 19, 64, 75);
    text('フリップコート', 66, 60, 179);
    text('60秒の陣取りラリー', 35, 64, 242);
    const steps = [['返す', 128], ['塗る', 128], ['挟んで反転', 218]];
    let x = 64;
    for (let i = 0; i < steps.length; i += 1) {
      const [label, width] = steps[i];
      box(x, 300, width, 64, 16, i === 2 ? '#184e42' : '#e2e8d9');
      text(label, 25, x + 23, 343, 750, i === 2 ? '#fff8e7' : '#183d34');
      x += width + 32;
      if (i < 2) text('→', 22, x - 28, 342);
    }
    text('一打で、コートを塗り替えろ。', 30, 64, 430);
    text('丸は自分。菱形はCPU。', 23, 64, 476, 500);
    box(64, 531, 246, 45, 22, '#184e42');
    text('1人でCPUと対戦', 20, 88, 561, 700, '#fff8e7');
    text('6 × 6  /  60 SEC', 18, 340, 560, 650);
    ctx.save(); ctx.shadowColor = '#183d3433'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 12;
    box(728, 38, 432, 550, 24, '#184e42'); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.roundRect(728, 38, 432, 550, 24); ctx.clip();
    ctx.drawImage(document.getElementById('court'), 728, 38, 432, 550); ctx.restore();
    return image.toDataURL('image/png').split(',')[1];
  });
  await writeFile(new URL('../og.png', import.meta.url), Buffer.from(png, 'base64'));
  console.log('Created day-070-flip-court/og.png (1200×630) from the live game Canvas.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
