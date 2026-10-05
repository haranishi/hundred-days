// 宣伝動画に使う回を選ぶための下調べ。種ごとに「ひとりで・見習い・日本」の1問目と2問目の名所と、
// ガイドさんが1問目で押す進み具合を、こちらが押さずに8倍速で見る。撮影はしない。
//   node tools/promo/probe-seeds.mjs 1 40   （先に npm run build。サイトは scripts/serve-dist.mjs で配る）
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const [from = 1, to = 30] = process.argv.slice(2).map(Number);
const port = 4191;
const base = `http://127.0.0.1:${port}`;
const server = spawn('node', ['scripts/serve-dist.mjs'], { cwd: repo, env: { ...process.env, PLAYWRIGHT_PORT: String(port) }, stdio: 'ignore' });

try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const browser = await chromium.launch();
  if (process.env.MODE === 'duo') {
    // ふたりで・世界：1問目の名所だけを見る（コンピューターはいない）
    for (let seed = from; seed <= to; seed++) {
      const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
      await page.goto(`${base}/day-058-meisho-kumitate/?seed=${seed}&test=1&speed=8&gfx=test`);
      await page.locator('[data-action="duo"]').click();
      await page.getByRole('radio', { name: '世界', exact: true }).check({ force: true });
      await page.getByRole('button', { name: 'はじめる' }).click();
      await page.waitForFunction(() => window.__MMB__?.phase() === 'building', null, { timeout: 30000 });
      console.log(JSON.stringify({ seed, first: await page.evaluate(() => window.__MMB__.state().question.landmarkId) }));
      await page.close();
    }
    await browser.close();
    process.exit(0);
  }
  for (let seed = from; seed <= to; seed++) {
    const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
    await page.goto(`${base}/day-058-meisho-kumitate/?seed=${seed}&test=1&speed=8&gfx=test`);
    await page.locator('[data-action="solo"]').click();
    await page.getByRole('radio', { name: /見習いガイド/ }).check({ force: true });
    await page.getByRole('radio', { name: '日本', exact: true }).check({ force: true });
    await page.getByRole('button', { name: 'はじめる' }).click();
    await page.waitForFunction(() => window.__MMB__?.phase() === 'building', null, { timeout: 30000 });
    const first = await page.evaluate(() => window.__MMB__.state().question.landmarkId);
    // こちらは押さない。ガイドさんが押した瞬間の進み具合を読む
    const guide = await page.evaluate(() => new Promise((resolve) => {
      const tick = () => {
        const q = window.__MMB__?.state().question;
        if (q?.buzzerId) return resolve({ who: q.buzzerId, progress: Math.round(q.progress * 100) / 100 });
        if (window.__MMB__?.phase() === 'reveal') return resolve({ who: null, progress: null });
        requestAnimationFrame(tick);
      };
      tick();
    }));
    await page.waitForFunction((id) => {
      const q = window.__MMB__?.state().question;
      return window.__MMB__?.phase() === 'building' && q && q.landmarkId !== id;
    }, first, { timeout: 60000 }).catch(() => {});
    const second = await page.evaluate(() => window.__MMB__?.state().question?.landmarkId ?? '');
    console.log(JSON.stringify({ seed, first, guide, second }));
    await page.close();
  }
  await browser.close();
} finally {
  server.kill();
}
