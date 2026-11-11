// コマの間隔の測定：出発地点ごとに、実時間で数秒滑らせて、コマの間隔（中央値・95%点・最大）と描いた三角形の数を出す。
// node tools/shots/perf-check.mjs [URL] [--webgl|--webkit] [--out DIR]
// 注意：画面なしのブラウザでの値。実機の値ではないので、段どうし・変更の前後の比較に使う。
import { options, session, fail } from './common.mjs';
try {
  const config = options();
  const drops = ['first-snow', 'forest-trail', 'east-piste', 'upper-bowl', 'summit']; // 谷と湖のマップの出発地点（森の中・開けた斜面・山頂）
  const rows = await session(config, { width: 1440, height: 900 }, async ({ page }) => {
    await page.locator('[data-start]').click();
    await page.waitForFunction(() => document.querySelector('[data-screen="hud"]')?.hidden === false, null, { timeout: 10000 });
    const out = [];
    for (const drop of drops) {
      await page.evaluate((name) => window.__ginrei.teleport(name), drop);
      const row = await page.evaluate(() => new Promise((done) => {
        const times = [];
        let last = performance.now();
        const t0 = last;
        let tris = 0, objects = 0;
        window.__ginrei.setInput({ steer: 0.35 });
        function tick(now) {
          times.push(now - last); last = now;
          const st = window.__ginreiDev.view.stats;
          tris = Math.max(tris, st.triangles || 0); objects = Math.max(objects, st.objects || 0);
          // 左右へ振りながら滑る
          window.__ginrei.setInput({ steer: Math.sin((now - t0) / 700) * 0.6 });
          if (now - t0 < 5000) requestAnimationFrame(tick);
          else {
            const ms = times.slice(20).sort((a, b) => a - b);
            const at = (p) => Number(ms[Math.min(ms.length - 1, Math.floor(ms.length * p))].toFixed(1));
            done({ frames: ms.length, p50: at(0.5), p95: at(0.95), max: at(1), triangles: tris, objects, kmh: Math.round(window.__ginrei.state().speed * 3.6), mode: window.__ginrei.state().mode });
          }
        }
        requestAnimationFrame(tick);
      }));
      out.push({ drop, ...row });
    }
    return out;
  });
  for (const row of rows) console.log(JSON.stringify(row));
} catch (error) { fail(error); }
