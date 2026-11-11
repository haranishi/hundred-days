// node tools/shots/capture.mjs [URL] [--webgl|--webkit] [--out DIR] [--scenes FILE.mjs]
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { options, session, begin, VIEWPORTS, fail } from './common.mjs';
import defaults from './scenes.mjs';
try {
  const config = options();
  const scenes = config.scenes ? (await import(pathToFileURL(resolve(config.scenes)).href)).default : defaults;
  if (!Array.isArray(scenes) || !scenes.length) throw Error('場面の一覧が必要です');
  for (const scene of scenes) {
    if (!/^[a-z0-9-]+$/.test(scene.name) || !scene.steps?.length) throw Error('場面の名前と操作の列が必要です');
    if (!['first', 'third', undefined].includes(scene.camera)) throw Error('視点の種類が違います');
    for (const step of scene.steps) if (!Number.isFinite(step.seconds) || step.seconds < 0 || step.seconds > 600) throw Error('場面の時間は0〜600秒にしてください');
  }
  await mkdir(config.out, { recursive: true });
  const results = [];
  for (const viewport of VIEWPORTS) {
    for (const scene of scenes) {
      const result = await session(config, viewport, async ({ page }) => {
        await begin(page);
        await page.evaluate(spawn => window.__ginrei.teleport(spawn), scene.spawn);
        if (scene.camera === 'first') await page.locator('[data-control="camera"]').click();
        for (const step of scene.steps) await page.evaluate(({ input, seconds }) => {
          window.__ginrei.setInput(input); window.__ginrei.advance(seconds);
        }, step);
        const name = `${scene.name}-${config.mode}-${viewport.width}x${viewport.height}`;
        await page.screenshot({ path: join(config.out, `${name}.png`) });
        return page.evaluate(name => ({ name, info: window.__ginrei.info, state: window.__ginrei.state() }), name);
      });
      results.push(result);
    }
  }
  await writeFile(join(config.out, `capture-${config.mode}.json`), JSON.stringify(results, null, 2));
  console.log(`撮影完了: ${results.length}枚 ${config.out}`);
} catch (error) { fail(error); }
