import { test } from '@playwright/test';
import assert from 'node:assert/strict';
import { CEIL_PAD } from '../../day-049-patanyan/lib/game.js';

/* Day 049 ぱたにゃん。単独で作っていたときの E2E（node:test）を、判定はそのままにこのリポジトリの形へ移した。
   ゲームの時間は ?test=1 で出る window.__patanyan から手で進める（setManual・advance）。
   ブラウザの日付は 2026-09-24 に固定する。?course=20260924 の「きょうのコース 9/24」を確かめるため */

const DIR = 'day-049-patanyan';
const ORIGIN = `http://127.0.0.1:${Number(process.env.PLAYWRIGHT_PORT || 4173)}`;
const BASE = `${ORIGIN}/${DIR}/`;
const SITE = `https://hundred-days.pages.dev/${DIR}/`;
const TEST_NOW = '2026-09-24T12:00:00+09:00';

const note = (description) => test.info().annotations.push({ type: 'diagnostic', description });
const isExternal = (url) => /^https?:\/\//.test(url) && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url);

// ページを開き、コンソールエラーと localhost 以外への通信を数え始める
async function openPage(browser, query = '', { viewport = { width: 390, height: 844 }, reducedMotion, scale = 1 } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale, reducedMotion });
  await context.clock.setFixedTime(new Date(TEST_NOW));
  const page = await context.newPage();
  const problems = { console: [], external: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') problems.console.push(m.text());
  });
  page.on('pageerror', (e) => problems.console.push(String(e)));
  page.on('request', (r) => {
    if (isExternal(r.url())) problems.external.push(r.url());
  });
  await page.goto(`${BASE}${query}`);
  await page.waitForFunction(() => document.body.dataset.boot === 'ready');
  return { context, page, problems };
}

// 自動操縦。ページの中で1刻みずつ進め、次のすき間の中心より少し下を割ったら羽ばたく
async function autopilot(page, { poles = 10, maxSeconds = 60 } = {}) {
  return page.evaluate(
    ({ poles, maxSeconds }) => {
      const h = window.__patanyan;
      const dt = 1 / 120;
      let s = h.state();
      for (let i = 0; i < maxSeconds * 120; i += 1) {
        const g = s.game;
        if (s.screen === 'title') h.flap();
        else if (s.screen === 'flying') {
          const next = g.poles.find((p) => p.x + p.w + g.cat.r > g.cat.x);
          const target = next ? next.center + next.gap * 0.18 : 210;
          if (g.cat.y > target && g.cat.vy >= 0) h.flap();
        } else break;
        s = h.advance(dt);
        if (s.game.score >= poles) break;
      }
      return s;
    },
    { poles, maxSeconds },
  );
}

// 何もしないで落として結果画面まで進める
async function crashToResult(page) {
  return page.evaluate(() => {
    const h = window.__patanyan;
    let s = h.state();
    if (s.screen === 'title') s = h.flap();
    for (let i = 0; i < 120 * 6 && s.screen !== 'result'; i += 1) s = h.advance(1 / 120);
    for (let i = 0; i < 120 && !s.ready; i += 1) s = h.advance(1 / 120);
    return s;
  });
}

// シェアの注意書きを見た目の行ごとに切って返す。1文字ずつ Range で位置を測る
// （行末の1〜2文字だけが次の行に落ちる「い。」問題を見つけるため）
async function noteLines(page) {
  return page.evaluate(() => {
    const el = document.querySelector('#share-note');
    const lines = [];
    let mid = null;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      for (let i = 0; i < n.length; i += 1) {
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + 1);
        const rect = r.getClientRects()[0];
        if (!rect) continue;
        const m = rect.top + rect.height / 2;
        if (mid === null || Math.abs(m - mid) > 5) {
          lines.push('');
          mid = m;
        }
        lines[lines.length - 1] += n.data[i];
      }
    }
    return lines;
  });
}

const poll = (page, fn, arg) => page.waitForFunction(fn, arg, { polling: 16, timeout: 8000 });

async function toShare(page, poles) {
  await page.evaluate(() => window.__patanyan.setManual(true));
  await autopilot(page, { poles });
  const s = await crashToResult(page);
  await page.click('#result [data-action="share"]');
  await page.waitForSelector('#share-dialog[data-ready="true"]');
  return s;
}

test.describe('Day 049 ぱたにゃん：起動と入力', () => {
  test('開いて2秒以内に1回目の羽ばたき・転送量200KB以下・コンソールエラー0・外部通信0', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    const external = [];
    // 応答の本文を非同期に読むと数え漏れる。読み込み完了時の実測サイズ（本文＋ヘッダ）を足す
    const sizes = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('request', (r) => {
      if (isExternal(r.url())) external.push(r.url());
    });
    page.on('requestfinished', (req) => {
      sizes.push(req.sizes().then((z) => z.responseBodySize + z.responseHeadersSize, () => 0));
    });
    await page.goto(`${BASE}?test=1`);
    await page.waitForFunction(() => document.body.dataset.boot === 'ready');
    await page.mouse.click(30, 790);
    await page.waitForFunction(() => window.__patanyan.state().game.flaps >= 1);
    // ナビゲーション開始からの経過（ページの中の時計）。起動は1秒以内、1回目の羽ばたきは2秒以内
    const t = await page.evaluate(() => ({ boot: window.__patanyan.state().bootMs, flap: performance.now() }));
    note(`操作できるまで ${Math.round(t.boot)}ms・1回目の羽ばたき ${Math.round(t.flap)}ms`);
    assert.ok(t.boot < 1000, `操作できるまで ${Math.round(t.boot)}ms`);
    assert.ok(t.flap < 2000, `1回目の羽ばたきまで ${Math.round(t.flap)}ms`);
    assert.equal((await page.evaluate(() => window.__patanyan.state())).screen, 'flying');
    await page.waitForTimeout(1500);
    const bytes = (await Promise.all(sizes)).reduce((a, b) => a + b, 0);
    note(`転送量 ${bytes} バイト（${sizes.length}件）`);
    assert.ok(bytes > 0 && bytes <= 200 * 1024, `転送量 ${bytes} バイト`);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    await context.close();
  });

  test('OGP（title・description・image）と canonical が Day 049 の公開URLを指す', async ({ browser }) => {
    const { page, context } = await openPage(browser);
    const meta = await page.evaluate(() => ({
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
      title: document.querySelector('meta[property="og:title"]')?.content,
      desc: document.querySelector('meta[property="og:description"]')?.content,
      image: document.querySelector('meta[property="og:image"]')?.content,
      url: document.querySelector('meta[property="og:url"]')?.content,
      card: document.querySelector('meta[name="twitter:card"]')?.content,
      lang: document.documentElement.lang,
    }));
    assert.equal(meta.canonical, SITE);
    assert.equal(meta.url, meta.canonical);
    assert.ok(meta.title && meta.desc);
    assert.equal(meta.image, `${SITE}assets/og.png`);
    assert.equal(meta.card, 'summary_large_image');
    assert.equal(meta.lang, 'ja');
    const og = await page.request.get(`${BASE}assets/og.png`);
    assert.equal(og.status(), 200);
    const buf = await og.body();
    assert.equal(buf.readUInt32BE(16), 1200);
    assert.equal(buf.readUInt32BE(20), 630);
    await context.close();
  });

  test('Space で飛べて、ページは動かない', async ({ browser }) => {
    const { page, context } = await openPage(browser, '?test=1');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__patanyan.state().game.flaps >= 1);
    const s = await page.evaluate(() => ({ y: window.scrollY, top: document.scrollingElement.scrollTop, flaps: window.__patanyan.state().game.flaps }));
    assert.equal(s.y, 0);
    assert.equal(s.top, 0);
    assert.ok(s.flaps >= 1);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('KeyW');
    await page.waitForFunction(() => window.__patanyan.state().game.flaps >= 3);
    await context.close();
  });

  test('入力のあった次の描画で、もう上向きの速さになっている', async ({ browser }) => {
    const { page, context } = await openPage(browser, '?test=1');
    const results = [];
    // 毎回飛び立った直後の空中で測る。天井に張り付くと速さが0に押さえられて測れない
    for (let i = 0; i < 5; i += 1) {
      await page.reload();
      await page.waitForFunction(() => document.body.dataset.boot === 'ready');
      await page.keyboard.press('Space');
      await page.waitForFunction(() => {
        const c = window.__patanyan.state().game.cat;
        return c.vy > 60 && c.y > 120;
      });
      await page.evaluate(() => {
        window.__lat = null;
        const before = window.__patanyan.state().game.flaps;
        window.addEventListener(
          'keydown',
          () => {
            const t0 = performance.now();
            requestAnimationFrame(() => {
              const g = window.__patanyan.state().game;
              window.__lat = { vy: g.cat.vy, flaps: g.flaps - before, ms: performance.now() - t0 };
            });
          },
          { once: true, capture: true },
        );
      });
      await page.keyboard.press('Space');
      await page.waitForFunction(() => window.__lat);
      results.push(await page.evaluate(() => window.__lat));
    }
    for (const r of results) {
      assert.equal(r.flaps, 1, `次の描画までに羽ばたきが反映されていない: ${JSON.stringify(r)}`);
      assert.ok(r.vy < 0, `次の描画でまだ落ちている: ${JSON.stringify(r)}`);
    }
    await context.close();
  });

  test('100回の入力で100回羽ばたく（タップ・クリック・キーを混ぜる）', async ({ browser }) => {
    test.setTimeout(40_000);
    const { page, context } = await openPage(browser, '?test=1');
    await page.evaluate(() => window.__patanyan.setManual(true));
    const keys = ['Space', 'ArrowUp', 'KeyW'];
    for (let i = 0; i < 100; i += 1) {
      if (i % 2 === 0) await page.mouse.click(60 + (i % 5) * 50, 500 + (i % 7) * 30);
      else await page.keyboard.press(keys[i % 3]);
      await page.evaluate(() => window.__patanyan.advance(1 / 120));
    }
    const s = await page.evaluate(() => window.__patanyan.state());
    assert.equal(s.screen, 'flying');
    assert.equal(s.game.flaps, 100);
    await context.close();
  });

  test('ミュートは画面の隅で切り替わり、読み込み直しても残る', async ({ browser }) => {
    const { page, context } = await openPage(browser);
    await page.click('#sound');
    assert.equal(await page.textContent('#sound'), '音：なし');
    const box = await page.locator('#sound').boundingBox();
    assert.ok(box.x + box.width > 390 - 60 && box.y < 60, '隅にない');
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.boot === 'ready');
    assert.equal(await page.textContent('#sound'), '音：なし');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('patanyan.v1')).muted);
    assert.equal(stored, true);
    await page.click('#sound');
    assert.equal(await page.textContent('#sound'), '音：あり');
    await context.close();
  });

  test('動きを減らす設定では「タップでスタート」が脈打たない', async ({ browser }) => {
    const { page, context } = await openPage(browser, '', { reducedMotion: 'reduce' });
    const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.title__start')).animationName);
    assert.equal(anim, 'none');
    await context.close();
  });
});

test.describe('Day 049 ぱたにゃん：遊ぶ・結果・再挑戦', () => {
  test('自動操縦で10本以上くぐれる（シード固定・きょうのコースの両方）', async ({ browser }) => {
    test.setTimeout(60_000);
    const { page, context, problems } = await openPage(browser, '?test=1&seed=424242');
    await page.evaluate(() => {
      window.__patanyan.setManual(true);
      window.__patanyan.setMode('any');
    });
    let s = await autopilot(page, { poles: 12 });
    assert.equal(s.game.phase, 'flying');
    assert.ok(s.game.score >= 10, `${s.game.score}本`);
    note(`いつでもモード（シード424242）で ${s.game.score}本`);
    await page.goto(`${BASE}?test=1&course=20260924`);
    await page.waitForFunction(() => document.body.dataset.boot === 'ready');
    await page.evaluate(() => window.__patanyan.setManual(true));
    s = await autopilot(page, { poles: 12 });
    assert.ok(s.game.score >= 10, `きょうのコースで ${s.game.score}本`);
    assert.equal(s.courseKey, 20260924);
    assert.deepEqual(problems.console, []);
    await context.close();
  });

  test('シードが同じなら同じコース', async ({ browser }) => {
    const { page, context } = await openPage(browser, '?test=1&course=20260924');
    const a = await page.evaluate(() => window.__patanyan.state().game.poles.map((p) => [p.x, p.center]));
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.boot === 'ready');
    const b = await page.evaluate(() => window.__patanyan.state().game.poles.map((p) => [p.x, p.center]));
    assert.deepEqual(a, b);
    await context.close();
  });

  test('衝突すると結果画面：点数・ベスト・スタンプ・魚・次の猫、シェアとねこは再挑戦にならない', async ({ browser }) => {
    test.setTimeout(40_000);
    const { page, context } = await openPage(browser, '?test=1&course=20260924');
    await page.evaluate(() => window.__patanyan.setManual(true));
    await autopilot(page, { poles: 3 });
    const s = await crashToResult(page);
    assert.equal(s.screen, 'result');
    assert.equal(s.lastRun.score, 3);
    assert.equal(await page.getAttribute('#result-digits', 'aria-label'), '3本');
    assert.match(await page.textContent('#result-mode'), /きょうのコース 9\/24/);
    assert.match(await page.textContent('#result-best'), /このコースのベスト 3本/);
    assert.equal(await page.isVisible('#result-new'), true);
    assert.match(await page.getAttribute('#result-stamps', 'aria-label'), /10本 まだ/);
    assert.match(await page.textContent('#result-fish'), /今回の魚 🐟\d+　合計 \d+匹/);
    assert.match(await page.textContent('#result-next'), /次の猫（ハチワレ）まで あと\d+匹/);
    assert.match(await page.textContent('#live'), /3本くぐりました/);
    for (const sel of ['#retry', '#result [data-action="share"]', '#result [data-action="cats"]']) assert.ok(await page.isVisible(sel), sel);
    const retry = await page.locator('#retry').boundingBox();
    const vh = page.viewportSize().height;
    assert.ok(retry.y >= vh / 2, `もう一回が下半分にない: y=${retry.y}`);
    await page.click('#result [data-action="share"]');
    await page.waitForSelector('#share-dialog[data-ready="true"]');
    assert.equal((await page.evaluate(() => window.__patanyan.state())).screen, 'result');
    await page.mouse.click(20, 20);
    await page.keyboard.press('Space');
    assert.equal((await page.evaluate(() => window.__patanyan.state())).screen, 'result', 'シェアを開いたまま再挑戦になった');
    await page.keyboard.press('Escape');
    await page.click('#result [data-action="cats"]');
    assert.equal(await page.isVisible('#cats-dialog'), true);
    assert.equal((await page.evaluate(() => window.__patanyan.state())).screen, 'result');
    await page.click('#cats-dialog [data-action="close"]');
    assert.equal(await page.isVisible('#result'), true);
    await context.close();
  });

  test('再挑戦は2タップ・3秒以内。0.5秒の間は押しても何も起きない', async ({ browser }) => {
    test.setTimeout(40_000);
    const { page, context } = await openPage(browser, '?test=1');
    await page.mouse.click(30, 790);
    await poll(page, () => window.__patanyan.state().screen === 'crashing');
    const t0 = Date.now();
    await poll(page, () => window.__patanyan.state().screen === 'result');
    await page.mouse.click(30, 790);
    assert.equal((await page.evaluate(() => window.__patanyan.state())).screen, 'result', '0.5秒以内のタップで再挑戦になった');
    await page.waitForSelector('#result[data-ready="true"]');
    let taps = 0;
    await page.mouse.click(30, 790);
    taps += 1;
    await poll(page, () => window.__patanyan.state().screen === 'title');
    await page.mouse.click(30, 790);
    taps += 1;
    await poll(page, () => window.__patanyan.state().screen === 'flying' && window.__patanyan.state().game.flaps >= 1);
    const elapsed = Date.now() - t0;
    note(`墜落から次の飛行まで ${elapsed}ms（2タップ）`);
    assert.equal(taps, 2);
    assert.ok(elapsed <= 3000, `墜落から次の飛行まで ${elapsed}ms`);
    await context.close();
  });

  test('Space だけでも再挑戦できる', async ({ browser }) => {
    const { page, context } = await openPage(browser, '?test=1');
    await page.keyboard.press('Space');
    await poll(page, () => window.__patanyan.state().screen === 'result');
    await page.waitForSelector('#result[data-ready="true"]');
    await page.keyboard.press('Space');
    await poll(page, () => window.__patanyan.state().screen === 'title');
    await page.keyboard.press('Space');
    await poll(page, () => window.__patanyan.state().screen === 'flying');
    await context.close();
  });

  test('タブが隠れたら止まり、戻ると「タップで再開」、タップ後1秒の猶予で続きから', async ({ browser }) => {
    const { page, context } = await openPage(browser, '?test=1');
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    let s = await page.evaluate(() => window.__patanyan.hide());
    assert.equal(s.paused, true);
    const y0 = s.game.cat.y;
    await page.waitForTimeout(400);
    s = await page.evaluate(() => window.__patanyan.show());
    assert.equal(s.game.cat.y, y0, '止まっている間に動いた');
    assert.equal(await page.isVisible('#pause-tap'), true);
    await page.mouse.click(150, 600);
    assert.equal(await page.isVisible('#pause-ready'), true);
    await page.waitForTimeout(500);
    s = await page.evaluate(() => window.__patanyan.state());
    assert.equal(s.paused, true, '猶予の1秒より前に動き出した');
    await poll(page, () => !window.__patanyan.state().paused);
    assert.equal(await page.isVisible('#pause'), false);
    await context.close();
  });

  test('縦長スマホ：猫は画面の上端（耳の先が残る位置）まで飛べ、画面の大きさが変わると天井も合わせる', async ({ browser }) => {
    test.setTimeout(60_000);
    const { page, context, problems } = await openPage(browser, '?test=1', { viewport: { width: 390, height: 844 } });
    const s = await page.evaluate(() => {
      const h = window.__patanyan;
      h.setManual(true);
      h.flap();
      let st = h.advance(1 / 120);
      let minY = Infinity;
      for (let i = 0; i < 170 && st.game.phase === 'flying'; i += 1) {
        if (st.game.cat.vy >= -250) h.flap();
        st = h.advance(1 / 120);
        minY = Math.min(minY, st.game.cat.y);
      }
      return { st, minY };
    });
    const L = s.st.layout;
    assert.equal(s.st.game.phase, 'flying', '天井に当たっても終わらない');
    assert.equal(s.st.game.skyTop, L.skyTop);
    assert.ok(L.ceilingY > 100, `この画面では帯の上に ${L.ceilingY} の空がある`);
    const fromTop = L.playY + (L.ceilingY + s.minY) * L.scale;
    assert.ok(Math.abs(fromTop - CEIL_PAD * L.scale) < 0.01, `猫の中心は画面の上端から ${fromTop}px（耳の先が画面に残る位置）`);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForFunction(() => window.__patanyan.state().layout.playH === 720);
    const t = await page.evaluate(() => window.__patanyan.state());
    assert.equal(t.game.skyTop, t.layout.skyTop, '画面の大きさが変わったら天井も合わせる');
    assert.ok(t.layout.skyTop > L.skyTop, '低い画面では天井も低い');
    assert.deepEqual(problems.console, []);
    assert.deepEqual(problems.external, []);
    await context.close();
  });
});

test.describe('Day 049 ぱたにゃん：シェアとねこえらび', () => {
  test('シェア：結果カード画像（1080×1350）・X・LINE・リンクのコピー・InstagramとYouTubeの一行', async ({ browser }) => {
    test.setTimeout(60_000);
    const { page, context, problems } = await openPage(browser, '?test=1&course=20260924');
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
    const s = await toShare(page, 5);
    const size = await page.evaluate(async () => {
      const img = document.querySelector('#share-preview');
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    });
    assert.deepEqual(size, [1080, 1350]);
    const text = `ぱたにゃん｜${s.lastRun.label} で${s.lastRun.score}本くぐった${s.lastRun.fish ? `🐟×${s.lastRun.fish}` : ''} #ぱたにゃん`;
    const x = new URL(await page.getAttribute('#share-x', 'href'));
    assert.equal(x.origin + x.pathname, 'https://x.com/intent/post');
    assert.equal(x.searchParams.get('text'), text);
    assert.equal(x.searchParams.get('url'), `${SITE}?course=20260924`);
    const line = new URL(await page.getAttribute('#share-line', 'href'));
    assert.equal(line.searchParams.get('url'), `${SITE}?course=20260924`);
    const canFiles = await page.evaluate(() => {
      const f = new File([new Blob(['x'], { type: 'image/png' })], 'a.png', { type: 'image/png' });
      try {
        return !!(navigator.canShare && navigator.canShare({ files: [f] }));
      } catch {
        return false;
      }
    });
    assert.equal(await page.isVisible('#share-files'), canFiles);
    assert.equal(await page.isVisible('#share-save'), !canFiles);
    if (!canFiles) assert.match(await page.getAttribute('#share-save', 'download'), /^patanyan-20260924-\d+\.png$/);
    assert.match(await page.textContent('#share-note'), /Instagram.*YouTube/);
    await page.click('#share-copy');
    await page.waitForFunction(() => document.querySelector('#share-said').textContent.length > 0);
    assert.match(await page.textContent('#share-said'), /コピーしました/);
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(copied, `${SITE}?course=20260924`);
    assert.deepEqual(problems.external, [], 'シェア欄を開いただけで外へ通信した');
    assert.deepEqual(problems.console, []);
    await context.close();
  });

  test('クリップボードAPIが使えなくても、textarea と execCommand でコピーできる', async ({ browser }) => {
    test.setTimeout(60_000);
    const { page, context } = await openPage(browser, '?test=1&course=20260924');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true });
      const orig = document.execCommand.bind(document);
      window.__copied = null;
      document.execCommand = (cmd) => {
        if (cmd === 'copy') {
          window.__copied = document.activeElement && document.activeElement.value;
          return true;
        }
        return orig(cmd);
      };
    });
    await toShare(page, 2);
    await page.click('#share-copy');
    await page.waitForFunction(() => document.querySelector('#share-said').textContent.length > 0);
    assert.match(await page.textContent('#share-said'), /コピーしました/);
    assert.equal(await page.evaluate(() => window.__copied), `${SITE}?course=20260924`);
    await context.close();
  });

  test('いつでもモードの共有文と、入口のURL', async ({ browser }) => {
    test.setTimeout(60_000);
    const { page, context } = await openPage(browser, '?test=1&seed=99');
    await page.evaluate(() => window.__patanyan.setMode('any'));
    const s = await toShare(page, 2);
    const x = new URL(await page.getAttribute('#share-x', 'href'));
    assert.match(x.searchParams.get('text'), /^ぱたにゃん｜いつでもモードで\d+本くぐった/);
    assert.equal(x.searchParams.get('url'), SITE);
    assert.equal(s.mode, 'any');
    await context.close();
  });

  test('ねこえらび：魚で解放した猫を選ぶと次回も残る。未解放は影絵で「🐟あと◯匹」', async ({ browser }) => {
    const { page, context } = await openPage(browser, '?test=1');
    await page.evaluate(() => window.__patanyan.giveFish(9));
    await page.click('#title [data-action="cats"]');
    const tiles = await page.$$eval('.cat-tile', (els) => els.map((e) => [e.dataset.cat, e.getAttribute('aria-disabled'), e.textContent]));
    assert.equal(tiles.length, 6);
    assert.deepEqual(tiles.map((t) => t[1]), ['false', 'false', 'false', 'true', 'true', 'true']);
    assert.match(tiles[3][2], /🐟あと6匹/);
    // aria-disabled のボタンは Playwright が押さないので、押せてしまわないかは force で確かめる
    await page.click('.cat-tile[data-cat="mike"]', { force: true });
    assert.equal(await page.getAttribute('.cat-tile[data-cat="mike"]', 'aria-pressed'), 'false', '未解放の猫を選べてしまう');
    await page.click('.cat-tile[data-cat="kuro"]');
    assert.equal(await page.getAttribute('.cat-tile[data-cat="kuro"]', 'aria-pressed'), 'true');
    await page.click('#cats-dialog [data-action="close"]');
    assert.equal(await page.textContent('#title-cat'), 'ねこ：黒');
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.boot === 'ready');
    assert.equal(await page.textContent('#title-cat'), 'ねこ：黒');
    await context.close();
  });

  test('タイトルの「共有」で100日チャレンジ共通の共有欄が開き、開いている間は飛ばず、閉じると「共有」へ戻る', async ({ browser }) => {
    const { page, context, problems } = await openPage(browser, '?test=1');
    assert.equal(await page.getAttribute('.title__nav a', 'href'), '../');
    await page.getByRole('button', { name: 'このアプリを共有する', exact: true }).click();
    const dialog = page.locator('#app-share-dialog');
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await dialog.locator('.share').count(), 1, '共通の共有欄がダイアログの中にない');
    assert.equal((await page.evaluate(() => window.__patanyan.state())).panel, 'app-share');
    const focused = await page.evaluate(() => document.activeElement.closest('#app-share-dialog') !== null);
    assert.ok(focused, '開いたときにフォーカスがダイアログの中へ移っていない');
    await page.mouse.click(20, 400);
    await page.keyboard.press('Space');
    const s = await page.evaluate(() => window.__patanyan.state());
    assert.equal(s.screen, 'title', '共有欄を開いたまま飛び始めた');
    assert.equal(s.game.flaps, 0);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    const back = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    assert.equal(back, 'このアプリを共有する');
    assert.deepEqual(problems.console, []);
    assert.deepEqual(problems.external, []);
    await context.close();
  });
});

// 中間の幅を飛ばすと欠けを見逃す（Day047 の教訓）ので、8通りを全部見る
const SIZES = [[360, 640], [390, 844], [430, 932], [540, 960], [768, 1024], [1024, 768], [1280, 720], [844, 390]];

async function audit(page, where) {
  return page.evaluate((where) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bad = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > vw || document.body.scrollWidth > vw) bad.push(`${where}: 横スクロール ${doc.scrollWidth}>${vw}`);
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      return !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden';
    };
    let count = 0;
    for (const el of document.querySelectorAll('button, a[href], a.btn')) {
      if (!visible(el)) continue;
      if (el.closest('[inert]')) continue;
      count += 1;
      const r = el.getBoundingClientRect();
      const name = (el.textContent || el.id).trim().slice(0, 12);
      if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) bad.push(`${where}: 「${name}」が画面の外 ${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`);
      if (Math.round(r.width) < 44 || Math.round(r.height) < 44) bad.push(`${where}: 「${name}」が44px未満 ${r.width.toFixed(1)}x${r.height.toFixed(1)}`);
    }
    // overflow で切れて見えなくなった中身（Day047 は数字が欠けても気づかなかった）
    for (const el of document.querySelectorAll('.result__card, .dialog__panel')) {
      if (!visible(el)) continue;
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) bad.push(`${where}: ${el.className} の中身が切れている ${el.scrollHeight}>${el.clientHeight}`);
    }
    return { bad, count };
  }, where);
}

async function overlaps(page, selA, selB) {
  return page.evaluate(
    ([a, b]) => {
      const ra = document.querySelector(a).getBoundingClientRect();
      const rb = document.querySelector(b).getBoundingClientRect();
      return !(ra.right <= rb.left || rb.right <= ra.left || ra.bottom <= rb.top || rb.bottom <= ra.top);
    },
    [selA, selB],
  );
}

test('Day 049 ぱたにゃん：8つの画面幅で横スクロールなし・ボタンは画面内で44px以上（タイトル・共有・結果・シェア・ねこえらび）', async ({ browser }) => {
  test.setTimeout(180_000);
  const problems = [];
  for (const [width, height] of SIZES) {
    const tag = `${width}x${height}`;
    const { page, context } = await openPage(browser, '?test=1&course=20260924', { viewport: { width, height } });
    let r = await audit(page, `${tag} タイトル`);
    problems.push(...r.bad);
    assert.ok(r.count >= 6, `${tag} タイトルのボタンが足りない`);
    if (await overlaps(page, '.title__top', '.title__bottom')) problems.push(`${tag} タイトルの上下が重なる`);
    if (await overlaps(page, '.title__nav', '#sound')) problems.push(`${tag} 左上の「100日・共有」と右上の音ボタンが重なる`);
    if (await overlaps(page, '.title__nav', '#logo')) problems.push(`${tag} 左上の「100日・共有」がロゴに重なる`);
    await page.getByRole('button', { name: 'このアプリを共有する', exact: true }).click();
    r = await audit(page, `${tag} 共有`);
    problems.push(...r.bad);
    await page.keyboard.press('Escape');
    // 結果カードが一番混む場面：NEW・スタンプ・魚の合計・猫が仲間になった行が全部出る
    await page.evaluate(() => window.__patanyan.setManual(true));
    await autopilot(page, { poles: 11 });
    const s = await crashToResult(page);
    if (!s.lastRun.unlockedNow.length || !s.lastRun.isNewBest) problems.push(`${tag} 一番混む結果にならなかった`);
    r = await audit(page, `${tag} 結果`);
    problems.push(...r.bad);
    if (await overlaps(page, '.result__card', '.result__actions')) problems.push(`${tag} 結果のカードとボタンが重なる`);
    if (await overlaps(page, '#sound', '.result__card')) problems.push(`${tag} 音ボタンが結果のカードに重なる`);
    const retry = await page.locator('#retry').boundingBox();
    if (retry.y + retry.height / 2 < height / 2) problems.push(`${tag} もう一回が下半分にない`);
    await page.click('#result [data-action="share"]');
    await page.waitForSelector('#share-dialog[data-ready="true"]');
    r = await audit(page, `${tag} シェア`);
    problems.push(...r.bad);
    const lines = await noteLines(page);
    if (lines[lines.length - 1].length < 3) problems.push(`${tag} シェアの注意書きの最後の行が「${lines[lines.length - 1]}」だけ`);
    await page.keyboard.press('Escape');
    await page.click('#result [data-action="cats"]');
    r = await audit(page, `${tag} ねこえらび`);
    problems.push(...r.bad);
    await context.close();
  }
  assert.deepEqual(problems, []);
});
