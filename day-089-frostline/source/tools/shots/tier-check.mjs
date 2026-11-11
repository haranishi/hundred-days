// 画質の段の切り替えの検査：滑走中に 高→低→中→高 と切り替え、誤りが出ないこと・段ごとに絵が出ることを確かめる。
// node tools/shots/tier-check.mjs [URL] [--webgl|--webkit] [--out DIR]
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { options, session, begin, fail } from './common.mjs';
try {
  const config = options();
  await mkdir(config.out, { recursive: true });
  const result = await session(config, { width: 1280, height: 720 }, async ({ page }) => {
    await begin(page);
    await page.evaluate(() => window.__ginrei.teleport('east-piste'));
    const rows = [];
    for (const name of ['low', 'mid', 'high', 'low', 'high']) {
      const t0 = Date.now();
      // 設定の画面と同じ道（view.setTier）で切り替える
      await page.evaluate((n) => window.__ginreiDev.view.setTier(n), name);
      const ms = Date.now() - t0;
      await page.evaluate(() => { window.__ginrei.setInput({ steer: 0.4 }); for (let i = 0; i < 30; i++) window.__ginrei.advance(1 / 60); });
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      await page.screenshot({ path: join(config.out, `tier-${rows.length}-${name}.png`) });
      const info = await page.evaluate(() => ({ tier: window.__ginreiDev.view.context.tier.name, objects: window.__ginreiDev.view.stats.objects, triangles: window.__ginreiDev.view.stats.triangles, kmh: Math.round(window.__ginrei.state().speed * 3.6) }));
      if (info.tier !== name) throw Error(`段が切り替わっていません: 頼んだ ${name} / いま ${info.tier}`);
      rows.push({ name, ms, ...info });
    }
    return rows;
  });
  for (const row of result) console.log(JSON.stringify(row));
  console.log('画質の段の切り替え: 合格');
} catch (error) { fail(error); }
