// 開発中の手早い確認用：1つの画面幅で、出発地点と操作の列を指定して滑らせ、区切りごとに撮る。
// node tools/shots/play-probe.mjs --spawn first-snow --steps "3:;1.2:steer=0.8;0.8:brake=1" --out DIR [--name N] [--camera first] [--w 1440 --h 900] [--webgl|--webkit] [--q low]
// 区切りは「秒数:入力」。入力は steer / brake / tuck / jump を「,」で並べる（例 "1.5:steer=-1,tuck=1"）。
// spawn は出発地点の名前か "x,z,heading[,speed]"。
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { session, begin, fail } from './common.mjs';

try {
  const { values } = parseArgs({ options: {
    url: { type: 'string', default: 'http://127.0.0.1:5183/' }, spawn: { type: 'string', default: 'first-snow' },
    steps: { type: 'string', default: '2:' }, out: { type: 'string', default: '.agent-harness/runs/play-dev' },
    name: { type: 'string', default: 'probe' }, camera: { type: 'string', default: 'third' },
    w: { type: 'string', default: '1440' }, h: { type: 'string', default: '900' },
    webgl: { type: 'boolean', default: false }, webkit: { type: 'boolean', default: false }, q: { type: 'string' },
    look: { type: 'string' }, every: { type: 'string' }, quiet: { type: 'boolean', default: false }, orbit: { type: 'string' }, raw: { type: 'boolean', default: false },
  } });
  const url = new URL(values.url);
  url.searchParams.set('debug', '1');
  if (values.webgl) url.searchParams.set('webgl', '1');
  if (values.q) url.searchParams.set('q', values.q);
  const config = { url: url.href, webkit: values.webkit };
  const viewport = { width: Number(values.w), height: Number(values.h) };
  const parts = values.spawn.split(',');
  const spawn = parts.length >= 3 ? { x: Number(parts[0]), z: Number(parts[1]), heading: Number(parts[2]), speed: Number(parts[3] || 0) } : values.spawn;
  const steps = values.steps.split(';').map((text) => {
    const [seconds, rest = ''] = text.split(':');
    const input = {};
    for (const pair of rest.split(',').filter(Boolean)) {
      const [key, value = '1'] = pair.split('=');
      input[key] = key === 'jump' ? value !== '0' : Number(value);
    }
    return { seconds: Number(seconds), input };
  });
  await mkdir(values.out, { recursive: true });
  const every = values.every ? Number(values.every) : 0;
  const log = await session(config, viewport, async ({ page }) => {
    await begin(page);
    await page.evaluate((s) => window.__ginrei.teleport(s), spawn);
    if (values.camera === 'first') await page.locator('[data-control="camera"]').click();
    if (values.orbit) {
      // 「距離,方位,仰角[,視野[,注視の上げ下げ]]」を「/」で並べると、撮るたびに全部の向きから撮る
      const list = values.orbit.split('/').map((t) => { const [dist, az, el, fov, lift] = t.split(',').map(Number); return { dist, az, el, fov: fov || 40, lift: lift || 0 }; });
      await page.evaluate((o) => { window.__orbits = o; }, list);
    }
    const rows = [];
    let shot = 0;
    const snap = async (label) => {
      const file = join(values.out, `${values.name}-${String(shot++).padStart(2, '0')}.png`);
      if (values.orbit) {
        const count = await page.evaluate(() => window.__orbits.length);
        for (let k = 0; k < count; k++) {
          // 時間を進めずに描き直す（向きだけ変える）
          // 画面へ出るのは次の表示の時なので、描いてから2コマ待つ
          await page.evaluate((i) => new Promise((done) => {
            window.__ginreiDev.feedback.setOrbit(window.__orbits[i]); window.__ginrei.advance(0);
            requestAnimationFrame(() => { window.__ginrei.advance(0); requestAnimationFrame(() => done()); });
          }), k);
          await page.screenshot({ path: file.replace('.png', `-o${k}.png`) });
        }
        await page.evaluate(() => window.__ginreiDev.feedback.setOrbit(null));
      } else if (values.raw) {
        // --raw：描き直さずに、動いている最中のコマをそのまま撮る。動きのぼかしのように「動いているコマでしか出ない絵」を見るため。
        // 最後のコマか1つ前のコマかは決まらないので、前後の比較には使わない
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        await page.screenshot({ path: file });
      } else {
        // 撮影が拾うのは、最後に描いたコマとは限らない（1つ前のコマのことがある）。時間を進めずに同じ絵を描き直してから撮れば、
        // どちらを拾っても同じ絵になる。待つだけでは直らなかった（同じ操作の2回の撮影で、画面全体が1コマぶんずれた）
        await page.evaluate(() => new Promise((done) => {
          window.__ginrei.advance(0);
          requestAnimationFrame(() => { window.__ginrei.advance(0); requestAnimationFrame(() => { window.__ginrei.advance(0); requestAnimationFrame(done); }); });
        }));
        await page.screenshot({ path: file });
      }
      const state = await page.evaluate(() => {
        const s = window.__ginrei.state();
        return { mode: s.mode, speed: +(s.speed * 3.6).toFixed(1), pos: [+s.pos.x.toFixed(1), +s.pos.y.toFixed(1), +s.pos.z.toFixed(1)],
          edge: +(s.edge * 57.3).toFixed(1), slip: +(s.slip * 57.3).toFixed(1), spray: +s.tele.spray.toFixed(2), powder: +s.snow.powder.toFixed(2) };
      });
      rows.push({ label, file, ...state });
    };
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      await page.evaluate((input) => window.__ginrei.setInput(input), step.input);
      if (every > 0) {
        for (let t = 0; t < step.seconds - 1e-9; t += every) {
          await page.evaluate((sec) => window.__ginrei.advance(sec), Math.min(every, step.seconds - t));
          await snap(`step${i}+${(t + every).toFixed(2)}`);
        }
      } else {
        // 物理は細かく刻んで送る（1回の送りで何秒も進めると、描画の側の追従が1コマで飛ぶ）
        for (let t = 0; t < step.seconds - 1e-9; t += 1 / 60) await page.evaluate((sec) => window.__ginrei.advance(sec), Math.min(1 / 60, step.seconds - t));
        await snap(`step${i}`);
      }
    }
    const events = await page.evaluate(() => window.__ginrei.events?.() ?? []);
    const info = await page.evaluate(() => window.__ginrei.info);
    return { info, rows, lastEvents: events };
  });
  await writeFile(join(values.out, `${values.name}.json`), JSON.stringify(log, null, 2));
  if (!values.quiet) for (const row of log.rows) console.log(JSON.stringify(row));
  console.log(JSON.stringify(log.info));
} catch (error) { fail(error); }
