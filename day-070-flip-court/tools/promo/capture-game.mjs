// Film the unmodified app with native pointer input; read only pixels and DOM.
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export async function openGame() {
  const server = spawn(process.execPath, [fileURLToPath(new URL('../serve.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Preview startup timed out')), 10000);
      server.stdout.on('data', chunk => {
        const match = chunk.toString().match(/http:\/\/[^\s]+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      server.once('error', reject);
      server.once('exit', code => { if (code) reject(new Error(`Preview exited ${code}`)); });
    });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 600, height: 1100 }, deviceScaleFactor: 2, locale: 'ja-JP' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => { Math.random = () => .7; });
    await page.clock.install({ time: new Date('2026-10-19T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-19T00:00:01Z'));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('#start').click();
    while (await page.locator('#app').getAttribute('data-phase') === 'countdown') await page.clock.runFor(16);
    const rect = await page.locator('#court').boundingBox();
    const bounds = await page.evaluate(() => {
      const scoreboard = document.querySelector('.scoreboard').getBoundingClientRect();
      const feedback = document.querySelector('#feedback').getBoundingClientRect();
      const court = document.querySelector('#court').getBoundingClientRect();
      return {
        clip: { x: Math.floor(court.x - 4), y: Math.floor(scoreboard.y), width: Math.ceil(court.width + 8), height: Math.ceil(feedback.bottom - scoreboard.y + 4) },
        court: { x: court.x, y: court.y, width: court.width, height: court.height },
        scoreboard: { x: scoreboard.x, y: scoreboard.y, width: scoreboard.width, height: scoreboard.height },
        feedback: { x: feedback.x, y: feedback.y, width: feedback.width, height: feedback.height },
      };
    });
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * 704 / 760);
    await page.mouse.down();
    let sourceMs = 0, inputs = 1, lastFeedback = '', lastBall = null, returns = 0;
    const events = [];
    async function advance(ms, offset = 0) {
      const state = await observe(page);
      if (state.phase === 'paused') {
        await page.mouse.up();
        await page.locator('#resume').click();
        await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * 704 / 760);
        await page.mouse.down();
      }
      if (state.ball && state.ball.y > 390 && state.phase === 'playing') {
        const x = Math.max(56, Math.min(544, state.ball.x - offset));
        await page.mouse.move(rect.x + x / 600 * rect.width, rect.y + 704 / 760 * rect.height);
        inputs++;
      }
      await page.clock.runFor(ms);
      sourceMs += ms;
      const next = await observe(page);
      if (next.feedback !== lastFeedback) {
        lastFeedback = next.feedback;
        events.push({ sourceMs: Math.round(sourceMs), ...next });
      }
      if (lastBall && next.ball && lastBall.y > 640 && next.ball.y < lastBall.y - 1 && lastBall.y > (lastBall.previousY ?? 0)) returns++;
      if (next.ball) lastBall = { ...next.ball, previousY: lastBall?.y ?? next.ball.y };
      return next;
    }
    return { page, bounds, events, errors, advance, state: () => observe(page),
      shot: () => page.screenshot({ clip: bounds.clip, type: 'jpeg', quality: 95 }),
      stats: () => ({ sourceMs, inputs, returns, seed: Math.floor(.7 * 0x100000000), errors }),
      close: async () => { await browser.close(); server.kill('SIGTERM'); },
    };
  } catch (error) {
    await browser?.close(); server.kill('SIGTERM'); throw error;
  }
}

async function observe(page) {
  return page.evaluate(() => {
    const text = id => document.getElementById(id)?.textContent;
    const canvas = document.getElementById('court');
    const sample = document.createElement('canvas'); sample.width = 300; sample.height = 380;
    const context = sample.getContext('2d'); context.drawImage(canvas, 0, 0, 300, 380);
    const p = context.getImageData(0, 0, 300, 380).data;
    const seen = new Uint8Array(300 * 380);
    const white = i => p[i * 4] > 245 && p[i * 4 + 1] > 235 && p[i * 4 + 2] > 210;
    let ball = null;
    for (let i = 0; i < seen.length; i++) {
      if (seen[i] || !white(i)) continue;
      const queue = [i]; seen[i] = 1;
      let n = 0, sx = 0, sy = 0, x0 = 300, x1 = 0, y0 = 380, y1 = 0;
      for (let head = 0; head < queue.length; head++) {
        const at = queue[head], x = at % 300, y = Math.floor(at / 300);
        n++; sx += x; sy += y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        for (const next of [at - 1, at + 1, at - 300, at + 300]) {
          if (next >= 0 && next < seen.length && !seen[next] && white(next) && Math.abs(next % 300 - x) <= 1) { seen[next] = 1; queue.push(next); }
        }
      }
      const w = (x1 - x0 + 1) * 2, h = (y1 - y0 + 1) * 2;
      if (w >= 8 && w < 25 && h >= 8 && h < 25 && n > 8 && (!ball || n > ball.n)) ball = { x: sx / n * 2, y: sy / n * 2, n };
    }
    return { phase: document.getElementById('app').dataset.phase, timer: Number(text('timer')), player: Number(text('player-score')), cpu: Number(text('cpu-score')), feedback: text('feedback'), result: text('result-title'), resultPlayer: Number(text('result-player')), resultCpu: Number(text('result-cpu')), ball };
  });
}
