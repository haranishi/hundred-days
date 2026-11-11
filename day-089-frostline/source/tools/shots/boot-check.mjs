// node tools/shots/boot-check.mjs [URL] [--webgl|--webkit]
import { options, session, begin, fail } from './common.mjs';
try {
  const config = options();
  const result = await session(config, { width: 1440, height: 900 }, async ({ page }) => {
    await begin(page); await page.evaluate(() => window.__ginrei.advance(1));
    await page.waitForTimeout(200);
    return page.evaluate(() => ({ info: window.__ginrei.info, state: window.__ginrei.state() }));
  });
  console.log(JSON.stringify({ ok: true, mode: config.mode, ...result }));
} catch (error) { fail(error); }
