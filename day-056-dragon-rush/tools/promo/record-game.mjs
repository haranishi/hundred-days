import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cache = join(here, 'cache');
const gameUrl = process.env.GAME_URL || 'http://127.0.0.1:5301/';
const pwRoot = resolve(process.env.PLAYWRIGHT_ROOT || join(here, '../../..'));
const require = createRequire(join(pwRoot, 'package.json'));
const { chromium } = require('playwright');
const args = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const viewport = { width: 1280, height: 960 };

// All controls use the game's existing autoplay input path. No damage, score,
// rage, creature position, visual effect or camera is overwritten for filming.
const specs = [
  { id: 'kurenai', from: 5, seconds: 14 },
  { id: 'raiyoku', from: 4.2, seconds: 12 },
  { id: 'homuratsuno', from: 38, seconds: 13 },
];

await mkdir(cache, { recursive: true });
const browser = await chromium.launch({ headless: true, args });
try {
  for (const spec of specs) {
    if (process.argv[2] && process.argv[2] !== spec.id) continue;
    const out = join(cache, spec.id);
    await mkdir(out, { recursive: true });
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.clock.install();
    await page.goto(`${gameUrl}?playtest=basic&speed=1&hud=0&q=high&creature=${spec.id}`);
    await page.waitForFunction(() => window.__state?.phase === 'playing' || window.__appError, null, { timeout: 180000 });
    const error = await page.evaluate(() => window.__appError);
    if (error) throw new Error(error);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    let t = await page.evaluate(() => window.__state.t);
    while (t < spec.from - 1.2) {
      await page.clock.runFor(100);
      t = await page.evaluate(() => window.__state.t);
    }
    while (t < spec.from) {
      await page.clock.runFor(1000 / 60);
      t = await page.evaluate(() => window.__state.t);
    }
    const frames = spec.seconds * 30;
    const states = [];
    for (let i = 0; i < frames; i++) {
      await page.clock.runFor(1000 / 30);
      await page.screenshot({ path: join(out, `${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 91 });
      if (i % 15 === 0) states.push(await page.evaluate(() => window.__state));
      if (i % 60 === 0) console.log(`${spec.id}: ${i}/${frames}`);
    }
    const gpu = await page.evaluate(() => window.__app?.gpu ?? null);
    await writeFile(join(out, 'record.json'), JSON.stringify({ spec, viewport, fps: 30, gpu, errors, states }, null, 2));
    if (errors.length) throw new Error(`${spec.id}: ${errors.length} console/page errors`);
    console.log(`${spec.id}: done, ${frames} frames, GPU=${gpu}`);
    await context.close();
  }
} finally {
  await browser.close();
}
