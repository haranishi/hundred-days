// 画面の採点用に、決まった画面（題字・滑走・技の表示・区切り・記録・地図・一時停止・景色を見る）を、幅ごとに撮る。
// node tools/shots/ui-capture.mjs --out DIR [--url http://127.0.0.1:5185/]
// 固めた版（vite build → vite preview）へ向けて使う。進み具合は毎回消してから撮る（同じ絵になるように）。
// a〜c の場面は、課題を達成した状態を見せるための撮り足し：進み具合を決まった値で入れてから開き、駅のそばへ移してから着く
// （1 周目の採点で、★が 1 つも付いていない場面しか渡せず、「状態が分からない」と採点された）。
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { GPU_ARGS, ready } from './common.mjs';

const { values } = parseArgs({ options: { url: { type: 'string', default: 'http://127.0.0.1:5185/' }, out: { type: 'string' } } });
if (!values.out) { console.error('--out DIR を指定してください'); process.exit(1); }
await mkdir(values.out, { recursive: true });
const url = new URL(values.url); url.searchParams.set('debug', '1');
const SIZES = [['pc', 1440, 900, false], ['phone', 390, 844, true], ['wide', 844, 390, true]];
// 達成の場面で入れる進み具合：やさしい 3 地点を何本か滑り、標高差の合計が 3,400 m（難しさ 4 の 1 つめだけ開く）
const SEED = { totals: { runs: 9, time: 1260, descent: 3400, distance: 14800, air: 38, score: 5200, crashes: 6 },
  drops: { 'first-snow': { runs: 4, best: 1240, stars: [true, true, false] }, 'east-piste': { runs: 2, best: 0, stars: [true, false, true] }, 'jump-valley': { runs: 3, best: 2310, stars: [true, true, false] } },
  discovered: [], lastDrop: 'jump-valley' };
const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
const problems = [];
try {
  for (const [label, w, h, touch] of SIZES) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    await context.addInitScript(() => { try { localStorage.removeItem('ginrei.progress.v1'); } catch { /* 保存が使えなくても撮る */ } });
    const page = await context.newPage();
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`${label}: ${m.type()}: ${m.text().slice(0, 300)}`); });
    page.on('pageerror', (e) => problems.push(`${label}: 例外: ${e.message}`));
    await page.goto(url.href, { waitUntil: 'load', timeout: 30000 });
    await ready(page);
    const shot = async (name) => { await page.waitForTimeout(300); await page.screenshot({ path: join(values.out, `${label}-${name}.png`) }); };
    const click = async (selector) => { await page.locator(selector).filter({ visible: true }).first().click({ timeout: 5000 }); };
    const run = async (seconds, input = {}) => page.evaluate(([sec, i]) => { window.__ginrei.setInput(i); for (let t = 0; t < sec - 1e-9; t += 1 / 60) window.__ginrei.advance(Math.min(1 / 60, sec - t)); }, [seconds, input]);
    const step = async (name, fn) => { try { await fn(); await shot(name); } catch (e) { problems.push(`${label}: ${name} を撮れません: ${String(e.message).slice(0, 160)}`); } };
    await step('1-title', async () => {});
    await step('2-map', async () => { await click('[data-screen="title"] [data-action="map"]'); });
    await step('3-map-locked', async () => { await page.locator('.map-pin', { hasText: '鍵' }).first().click({ timeout: 5000 }); });
    await step('4-ride', async () => {
      // 最初の地点を選ぶ：地図の印を押す（狭い画面では、名前の一覧の代わりに送りのボタンになるので、一覧の先頭は使わない）
      await page.locator('.map-pin').first().click({ timeout: 5000 }); await click('[data-action="map-start"]');
      await page.evaluate(() => window.__ginrei.setManual(true)); await run(2.5);
    });
    await step('5-trick', async () => {
      // 構えて離し、空中でジャンプボタン＋舵 → 着地の直後の「技の名前と点」
      await run(0.8, { jump: true }); await run(0.14); await run(0.42, { jump: true, steer: 1 });
      for (let i = 0; i < 40; i++) { await run(0.05); if (await page.evaluate(() => /点/.test(document.querySelector('[data-message]')?.textContent || ''))) break; }
    });
    await step('6-stopped', async () => { await run(9, { brake: 1 }); });
    await step('7-summary', async () => { await click('[data-action="finish"]'); });
    await step('8-pause', async () => { await click('[data-screen="summary"] [data-action="again"]'); await run(1); await click('[data-control="pause"]'); });
    await step('9-vista', async () => { await click('[data-screen="pause"] [data-action="vista"]'); await page.evaluate(() => window.__ginrei.setManual(false)); await page.waitForTimeout(2500); });
    console.log(label, JSON.stringify(await page.evaluate(() => ({ stage: window.__ginrei.play?.()?.stage, message: document.querySelector('[data-message]')?.textContent }))));
    await context.close();

    // ── 課題を達成した状態（進み具合を入れてから開く）
    const seeded = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    await seeded.addInitScript((value) => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ginrei.progress.v1', value); sessionStorage.setItem('seeded', '1'); } } catch { /* 保存が使えなければ、空のまま撮る */ } }, JSON.stringify(SEED));
    const page2 = await seeded.newPage();
    page2.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`${label}（達成）: ${m.type()}: ${m.text().slice(0, 300)}`); });
    page2.on('pageerror', (e) => problems.push(`${label}（達成）: 例外: ${e.message}`));
    await page2.goto(url.href, { waitUntil: 'load', timeout: 30000 });
    await ready(page2);
    const shot2 = async (name) => { await page2.waitForTimeout(300); await page2.screenshot({ path: join(values.out, `${label}-${name}.png`) }); };
    const step2 = async (name, fn) => { try { await fn(); await shot2(name); } catch (e) { problems.push(`${label}: ${name} を撮れません: ${String(e.message).slice(0, 160)}`); } };
    await step2('a-map-progress', async () => { await page2.locator('[data-screen="title"] [data-action="map"]').click({ timeout: 5000 }); });
    await step2('b-map-locked', async () => { await page2.locator('.map-pin', { hasText: '鍵' }).first().click({ timeout: 5000 }); });
    await step2('c-summary-fresh', async () => {
      // まだ滑りきっていない地点を選んで滑り出し、駅のそばへ移して着く（駅に着くと、記録の画面が開く）
      const target = await page2.evaluate(() => { const m = window.__ginrei.play().map; const d = m.drops.find(v => !v.locked && !v.goals[0].earned && (v.level ?? 1) <= 2) ?? m.drops.find(v => !v.locked); const s = m.stations.find(v => v.id === d.finish) ?? m.stations[0]; return { d, s }; });
      await page2.locator(`.map-pin[data-drop="${target.d.id}"]`).click({ timeout: 5000 });
      await page2.locator('[data-action="map-start"]').filter({ visible: true }).first().click({ timeout: 5000 });
      await page2.evaluate(() => window.__ginrei.setManual(true));
      await page2.evaluate(({ d, s }) => {
        const g = window.__ginrei, away = (x, z) => Math.hypot(x - s.x, z - s.z);
        // 駅のまわり 16 方向・70 m 先を調べ、「駅より少しだけ高い所」（＝ゆるく駅へ下る側）から順に試す。急な側から入ると、飛んで転ぶ
        const ring = [];
        for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, x = s.x + Math.sin(a) * 70, z = s.z - Math.cos(a) * 70; g.teleport({ ...d, x, z }); ring.push({ x, z, y: g.state().pos.y }); }
        const base = (g.teleport({ ...d, x: s.x, z: s.z + 20 }), g.state().pos.y);
        const order = [...ring.filter(p => p.y >= base + 1.5).sort((a, b) => a.y - b.y), ...ring.filter(p => p.y < base + 1.5).sort((a, b) => b.y - a.y)].slice(0, 5);
        let arrived = false;
        for (const from of order) {
          // 駅へ向けて滑り出す（向きは、北を 0 として時計回り）。駅の円へ入ったら制動する
          g.teleport({ ...d, x: from.x, z: from.z, heading: Math.atan2(s.x - from.x, -(s.z - from.z)), speed: 12 });
          for (let i = 0; i < 60 * 12 && !arrived; i++) { const p = g.state().pos; g.setInput(away(p.x, p.z) < 24 ? { brake: 1 } : {}); g.advance(1 / 60); arrived = g.play().stage === 'summary'; }
          if (arrived) break;
        }
        // 届かなかったら（地形で曲がったとき）、駅のすぐそばへ移して着く
        if (!arrived) { g.teleport({ ...d, x: s.x + 6, z: s.z - 14 }); g.setInput({ brake: 1 }); for (let i = 0; i < 240 && g.play().stage !== 'summary'; i++) g.advance(1 / 60); }
      }, target);
      await page2.waitForFunction(() => window.__ginrei.play().stage === 'summary', null, { timeout: 5000 });
    });
    await seeded.close();
  }
} finally { await browser.close(); }
if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; } else console.log('問題なし');
