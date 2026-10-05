// 宣伝動画の素材を撮る。公開物（dist）を配り、実際のゲームを操作しながら録画し、出来事の時刻を記録する。
//   npm run build && node day-058-meisho-kumitate/tools/promo/record-game.mjs
// 出力：tools/promo/cache/solo.webm・duo.webm・events.json（cache/ は Git に入れない）
//
// - 画面のあるブラウザで撮る（画面なしのブラウザの録画は、Macで左上4分の1しか写らないことがあった）
// - 時刻は録画の始まり（ページを作った瞬間）からのミリ秒。字幕と効果音はこの時刻に合わせて置く
// - 種24番は「ひとりで・見習い・日本」の1問目が金閣寺、2問目が富士山。ガイドさんは1問目を進み具合0.93で押す
//   （probe-seeds.mjs で確かめた）。こちらは色が付き、景色が出始めた0.84で押す
// - ふたりで（世界）は種1番で、1問目がギザのピラミッド。宣伝の主役にしないと決めた名所（マチュピチュ・
//   チチェン・イッツァなど）が出た回は撮り直す
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const cache = fileURLToPath(new URL('./cache/', import.meta.url));
const port = 4192;
const base = `http://127.0.0.1:${port}/day-058-meisho-kumitate/`;
const SOLO_SEED = Number(process.env.SOLO_SEED || 24);
const DUO_SEED = Number(process.env.DUO_SEED || 1);
const BUZZ_AT = 0.84;
// 宣伝の主役にしない名所（許可や配慮を求める方針がある）。撮影の中で出たら止める
const NOT_IN_PROMO = ['machu-picchu', 'chichen-itza', 'heian-jingu', 'byodoin', 'nachi-falls', 'forbidden-city', 'borobudur', 'sagrada-familia', 'temple-of-heaven', 'blue-mosque', 'pasabag', 'gonbad-e-qabus', 'abu-simbel', 'angkor-wat', 'colosseum', 'parthenon', 'neuschwanstein', 'kobe-port-tower', 'eiffel-tower'];
const solo_ids = {};
const duo_ids = {};

mkdirSync(cache, { recursive: true });
const server = spawn('node', ['scripts/serve-dist.mjs'], { cwd: repo, env: { ...process.env, PLAYWRIGHT_PORT: String(port) }, stdio: 'ignore' });

const waitFor = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout, polling: 30 });

async function record(browser, name, script) {
  const dir = join(cache, `raw-${name}`);
  rmSync(dir, { recursive: true, force: true });
  const context = await browser.newContext({
    viewport: { width: 540, height: 960 },
    deviceScaleFactor: 2,
    recordVideo: { dir, size: { width: 1080, height: 1920 } },
  });
  await context.addInitScript(() => {
    // 進み具合は state() の値だと出来事のときにしか変わらない。押せる時間の経過から、いまの値を計算する（BUILD_MS=15000）
    window.__liveProgress = () => {
      const hook = window.__MMB__;
      const s = hook?.state();
      const q = s?.question;
      if (!q) return 0;
      if (s.phase === 'reveal' || s.phase === 'finished') return 1;
      if (!['building', 'lastcall', 'answering'].includes(s.phase)) return 0;
      const running = q.openResumedAt === null ? 0 : Math.max(0, hook.now() - q.openResumedAt);
      return Math.min(1, (q.openElapsedMs + running) / 15000);
    };
  });
  const page = await context.newPage();
  const t0 = Date.now();
  const events = {};
  const mark = (key) => { events[key] = Date.now() - t0; };
  const samples = [];
  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      const s = await page.evaluate(() => {
        const hook = window.__MMB__;
        if (!hook) return null;
        const st = hook.state();
        return { phase: st.phase, q: st.questionIndex, id: st.question?.landmarkId ?? null, buzzer: st.question?.buzzerId ?? null, p: Math.round(window.__liveProgress() * 1000) / 1000, scores: st.players.map((x) => x.score) };
      }).catch(() => null);
      if (s) samples.push({ t: Date.now() - t0, ...s });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  })();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await script(page, mark);
  sampling = false;
  await sampler;
  events.samples = samples;
  await context.close();
  const [file] = readdirSync(dir).filter((f) => f.endsWith('.webm'));
  renameSync(join(dir, file), join(cache, `${name}.webm`));
  rmSync(dir, { recursive: true, force: true });
  if (errors.length) throw new Error(`${name} でページのエラー: ${errors.join(' / ')}`);
  return events;
}

try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const browser = await chromium.launch({ headless: false, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });

  const solo = await record(browser, 'solo', async (page, mark) => {
    await page.goto(`${base}?seed=${SOLO_SEED}&test=1`);
    await page.getByRole('heading', { name: '名所くみたて早押し' }).waitFor();
    mark('title');
    await page.waitForTimeout(2600);
    await page.locator('[data-action="solo"]').click();
    await page.getByRole('radio', { name: /見習いガイド/ }).check({ force: true });
    await page.getByRole('radio', { name: '日本', exact: true }).check({ force: true });
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'はじめる' }).click();
    mark('start');
    await waitFor(page, () => window.__MMB__?.phase() === 'building');
    mark('building1');
    const first = await page.evaluate(() => window.__MMB__.state().question.landmarkId);
    if (NOT_IN_PROMO.includes(first)) throw new Error(`1問目が ${first}。種を変える`);
    await waitFor(page, (at) => window.__MMB__.state().question?.buzzerId === 'guide' || window.__liveProgress() >= at, BUZZ_AT);
    if (await page.evaluate(() => window.__MMB__.state().question?.buzzerId === 'guide')) {
      mark('guideBuzz');
      await waitFor(page, () => ['building', 'lastcall'].includes(window.__MMB__.phase()) && window.__MMB__.state().question?.buzzerId === null);
      mark('guideWrong');
      await page.waitForTimeout(500);
    }
    await page.locator('.buzzer[data-player="you"]').click();
    mark('buzz1');
    await waitFor(page, () => window.__MMB__?.phase() === 'answering');
    if ((await page.evaluate(() => window.__MMB__.state().question.buzzerId)) !== 'you') throw new Error('ガイドさんに先に押された');
    mark('choices1');
    await page.waitForTimeout(1300);
    const index = await page.evaluate(() => window.__MMB__.correctIndex());
    await page.locator(`.answer .choice[data-index="${index}"]`).click();
    mark('answer1');
    await page.locator('.reveal').waitFor();
    mark('reveal1');
    await page.waitForTimeout(3600);
    const next = page.locator('.reveal-next');
    if (await next.isVisible()) await next.click();
    await waitFor(page, (id) => window.__MMB__?.phase() === 'building' && window.__MMB__.state().question?.landmarkId !== id, first);
    mark('building2');
    const second = await page.evaluate(() => window.__MMB__.state().question.landmarkId);
    if (NOT_IN_PROMO.includes(second)) throw new Error(`2問目が ${second}。種を変える`);
    // 2問目は、白い模型の形が見えてくるところまで撮る（宣伝で「68名所」と出す場面に使う）
    await page.waitForTimeout(8800);
    mark('end');
    Object.assign(solo_ids, { first, second });
  });

  const duo = await record(browser, 'duo', async (page, mark) => {
    await page.goto(`${base}?seed=${DUO_SEED}&test=1`);
    await page.getByRole('heading', { name: '名所くみたて早押し' }).waitFor();
    mark('title');
    await page.locator('[data-action="duo"]').click();
    await page.getByRole('radio', { name: '世界', exact: true }).check({ force: true });
    await page.getByRole('button', { name: 'はじめる' }).click();
    mark('start');
    await waitFor(page, () => window.__MMB__?.phase() === 'building');
    mark('building');
    const first = await page.evaluate(() => window.__MMB__.state().question.landmarkId);
    if (NOT_IN_PROMO.includes(first)) throw new Error(`ふたりでの1問目が ${first}。種を変える`);
    // 1P が F で押して外す（−200点・締め出し）→ 2P が J で押して当てる。まちがいの減点と、相手のチャンスを見せる
    await waitFor(page, () => window.__liveProgress() >= 0.7);
    await page.keyboard.press('f');
    mark('p1Buzz');
    await waitFor(page, () => window.__MMB__.phase() === 'answering');
    await page.waitForTimeout(1000);
    const correct = await page.evaluate(() => window.__MMB__.correctIndex());
    await page.keyboard.press(String(((correct + 1) % 4) + 1));
    mark('p1Wrong');
    await waitFor(page, () => ['building', 'lastcall'].includes(window.__MMB__.phase()));
    await page.waitForTimeout(900);
    await page.keyboard.press('j');
    mark('p2Buzz');
    await waitFor(page, () => window.__MMB__.phase() === 'answering');
    await page.waitForTimeout(900);
    await page.keyboard.press(String(correct + 1));
    mark('p2Answer');
    await waitFor(page, () => window.__MMB__.phase() === 'reveal');
    mark('p2Reveal');
    await page.waitForTimeout(2200);
    mark('end');
    Object.assign(duo_ids, { first });
  });

  await browser.close();
  writeFileSync(join(cache, 'events.json'), `${JSON.stringify({ solo, duo, ids: { solo: solo_ids, duo: duo_ids } }, null, 2)}\n`);
  console.log(JSON.stringify({ solo, duo, ids: { solo: solo_ids, duo: duo_ids } }));
} finally {
  server.kill();
}
