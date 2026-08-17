import { expect, test } from '@playwright/test';
import {
  SAMPLE,
  SAMPLE_JA,
  SAMPLE_JA_TITLES,
  SAMPLE_WORLD,
  manyJa,
  toSse,
} from '../../apps/day-010-wikipedia-live/tests/fixtures/stream.mjs';
import { COORDS } from '../../apps/day-010-wikipedia-live/tests/fixtures/coordinates.mjs';

/* 上流には一切つながない。編集のストリームも座標APIも、同梱の固定データを page.route で流し込む。
   本物は毎秒13件前後・中身も毎回違うので、そのままでは何も固定できない。 */
const STREAM = '**/v2/stream/recentchange*';
const COORD_API = '**/w/api.php*';
const PAGE = '/day-010-wikipedia-live/';

const serveStream = async (page, bodies, status = 200) => {
  const served = { count: 0 };
  await page.route(STREAM, (route) => {
    const body = bodies[Math.min(served.count, bodies.length - 1)];
    served.count += 1;
    route.fulfill({
      status,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      },
      body,
    });
  });
  return served;
};

/** 座標APIの替え玉。聞かれた記事名のうち、固定表に載っているものだけ座標を返す。 */
const serveCoordinates = async (page, table = COORDS) => {
  const asked = { requests: 0, titles: [] };
  await page.route(COORD_API, (route) => {
    const titles = new URL(route.request().url()).searchParams.get('titles').split('|');
    asked.requests += 1;
    asked.titles.push(...titles);
    const pages = titles.map((title) =>
      table[title]
        ? { title, coordinates: [{ lat: table[title][1], lon: table[title][0], globe: 'earth' }] }
        : { title },
    );
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({ batchcomplete: true, query: { pages } }),
    });
  });
  return asked;
};

const open = async (page, bodies, { status, coords = COORDS } = {}) => {
  const served = await serveStream(page, bodies, status);
  const asked = await serveCoordinates(page, coords);
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__day010?.stats.countries > 0);
  return { served, asked };
};

const stats = (page) => page.evaluate(() => window.__day010.stats);

/** 地図の中身を色で数える。陸＝青みのある面、ピン＝アンバー、日本語版＝アクア */
const pixels = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('#map');
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let land = 0;
    let pin = 0;
    let ja = 0;
    for (let index = 0; index < data.length; index += 4) {
      const [red, green, blue, alpha] = [data[index], data[index + 1], data[index + 2], data[index + 3]];
      if (alpha < 24) continue;
      if (red > 180 && green > 120 && green < 210 && blue < 150) pin += 1;
      else if (green > 150 && green - red > 60 && blue > 120) ja += 1;
      else if (blue > 40 && blue - red > 12) land += 1;
    }
    return { land, pin, ja };
  });

test.describe('Day 010 wikipedia live', () => {
  test('Given a burst of edits, when they arrive, then only real edits are counted', async ({ page }) => {
    await open(page, [toSse(SAMPLE)]);

    await expect(page.locator('#world-count')).toHaveText(String(SAMPLE_WORLD));
    await expect(page.locator('#ja-count')).toHaveText(String(SAMPLE_JA));
    await expect(page.locator('.edit')).toHaveCount(SAMPLE_JA);
    await expect(page.locator('.edit__title')).toHaveText(SAMPLE_JA_TITLES);
    await expect(page.locator('.edit[data-title="ノート:秋田県"]')).toHaveCount(0);
    await expect.poll(async () => (await page.locator('#rate').textContent()) !== '—').toBe(true);
  });

  test('Given the world map, when the page loads, then the land is drawn before any edit arrives', async ({ page }) => {
    await open(page, [toSse([])]);

    const measured = await stats(page);
    expect(measured.countries).toBeGreaterThan(150);
    const drawn = await pixels(page);
    expect(drawn.land).toBeGreaterThan(5000);
    expect(drawn.pin).toBe(0);
    // 場所が分かる編集がまだ無いうちは、名指ししない
    await expect(page.locator('#hot-name')).toHaveText('まだ分かりません');
  });

  test('Given articles with coordinates, when they are edited, then pins appear and the busiest country is named', async ({ page }) => {
    const { asked } = await open(page, [toSse(SAMPLE)]);

    // 座標APIは記事本体の編集だけを聞く（ノートや他プロジェクトは聞かない）
    await expect.poll(() => asked.requests, { timeout: 10_000 }).toBeGreaterThan(0);
    await expect.poll(async () => (await stats(page)).pins).toBeGreaterThan(0);

    /* 固定ストリームのうち座標を持つのは 秋田県・図書館（日本）と 駅（フランス）の3件。
       いちばん多い国を名指しする */
    await expect(page.locator('#hot-name')).toHaveText('日本', { timeout: 10_000 });
    await expect(page.locator('#hot-detail')).toHaveText('直近5分で2件（3件中・2か国）');
    await expect(page.locator('#pin-count')).toHaveText('3');

    // 座標を持たない編集は隠さず件数で出す
    await expect(page.locator('#no-place-count')).not.toHaveText('0');

    const drawn = await pixels(page);
    expect(drawn.ja).toBeGreaterThan(20);
    expect(drawn.land).toBeGreaterThan(5000);

    // 聞いた記事名に、ノートや他言語プロジェクトが混ざっていないこと
    expect(asked.titles).toContain('秋田県');
    expect(asked.titles).not.toContain('ノート:秋田県');
    expect(asked.titles).not.toContain('File:Sample.jpg');
  });

  test('Given the window is resized, when pins are already up, then they stay on the same place', async ({ page }) => {
    await open(page, [toSse([])]);

    // 東京とパリに1本ずつ立てて、幅を変えても同じ国の上に居続けるかを見る
    await page.evaluate(() => {
      window.__day010.pin({ lon: 139.77, lat: 35.68, title: '東京駅', wiki: 'jawiki', delta: 400 });
      window.__day010.pin({ lon: 2.35, lat: 48.86, title: 'パリ', wiki: 'frwiki', delta: 400 });
    });
    await expect(page.locator('#hot-name')).toHaveText(/日本|フランス/);

    /* 広がっている波紋を測ると、その時々の大きさで結果がぶれる。
       波紋が消えて点だけになってから、いちばん右にある点の重心を測る */
    const spotAt = () =>
      page.evaluate(() => {
        const canvas = document.querySelector('#map');
        const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        let rightmost = 0;
        for (let i = 0; i < data.length; i += 4) {
          const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
          if (a > 200 && g > 190 && g - r > 80 && b > 150) {
            const index = i / 4;
            rightmost = Math.max(rightmost, (index % canvas.width) / canvas.width);
          }
        }
        // いちばん右の点（東京）だけを、その周辺の画素から重心で出す
        for (let i = 0; i < data.length; i += 4) {
          const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
          if (a > 200 && g > 190 && g - r > 80 && b > 150) {
            const index = i / 4;
            const x = (index % canvas.width) / canvas.width;
            if (rightmost - x > 0.05) continue;
            sumX += x;
            sumY += Math.floor(index / canvas.width) / canvas.height;
            count += 1;
          }
        }
        return count ? { x: sumX / count, y: sumY / count, count } : null;
      });

    // 波紋（日本語版は2.6秒）が消えるのを待ってから測る
    await page.waitForTimeout(3200);
    const wide = await spotAt();
    expect(wide).not.toBeNull();

    await page.setViewportSize({ width: 480, height: 900 });
    await page.waitForTimeout(500);
    const narrow = await spotAt();
    expect(narrow).not.toBeNull();
    // 画面の何割の位置にいるかは、幅を変えても変わらないはず（画面座標で持つとここがずれる）
    expect(Math.abs(narrow.x - wide.x)).toBeLessThan(0.03);
    expect(Math.abs(narrow.y - wide.y)).toBeLessThan(0.05);
  });

  test('Given the coordinate API fails, when edits arrive, then the page keeps working', async ({ page }) => {
    await serveStream(page, [toSse(SAMPLE)]);
    await page.route(COORD_API, (route) => route.fulfill({ status: 500, body: 'boom' }));
    await page.goto(PAGE);
    await page.waitForFunction(() => window.__day010?.stats.countries > 0);

    await expect(page.locator('#world-count')).toHaveText(String(SAMPLE_WORLD));
    await expect(page.locator('.edit')).toHaveCount(SAMPLE_JA);
    await expect(page.locator('#hot-name')).toHaveText('まだ分かりません');
    const drawn = await pixels(page);
    expect(drawn.land).toBeGreaterThan(5000);
  });

  test('Given the stream resends the same events, when it reconnects, then the count does not double', async ({ page }) => {
    const { served } = await open(page, [toSse(SAMPLE), toSse(SAMPLE)]);
    await expect(page.locator('#world-count')).toHaveText(String(SAMPLE_WORLD));

    await expect.poll(() => served.count, { timeout: 10_000 }).toBeGreaterThan(1);
    await expect(page.locator('#world-count')).toHaveText(String(SAMPLE_WORLD));
    await expect(page.locator('.edit')).toHaveCount(SAMPLE_JA);
  });

  test('Given anonymous editors, when their edits are shown, then no name or address reaches the page', async ({ page }) => {
    await open(page, [toSse(SAMPLE)]);
    await expect(page.locator('.edit')).toHaveCount(SAMPLE_JA);

    const html = await page.content();
    for (const secret of ['192.0.2.10', '2001:db8', 'テスト太郎']) {
      expect(html).not.toContain(secret);
    }

    const masked = page.locator('.edit[data-title="駅"]');
    await expect(masked.locator('.edit__comment')).toHaveText('●●● の編集を差し戻し');
    await expect(masked.locator('.badge')).toHaveText(['利用者名を伏せました']);
    await expect(page.locator('.edit[data-title="秋田県"] .badge')).toHaveCount(0);
    await expect(page.locator('.edit[data-title="カレーライス"] .edit__comment')).toHaveText('【概要】 重複を整理');
  });

  test('Given bots and new pages, when they are listed, then badges say so in words', async ({ page }) => {
    await open(page, [toSse(SAMPLE)]);
    await expect(page.locator('.edit[data-title="自動販売機"] .badge')).toHaveText(['ボット']);
    await expect(page.locator('.edit[data-title="テスト記事"] .badge')).toHaveText(['新しい記事']);
  });

  test('Given an article card, when its title is used, then it links to the real article', async ({ page }) => {
    await open(page, [toSse(SAMPLE)]);
    const link = page.locator('.edit[data-title="秋田県"] .edit__title');
    await expect(link).toHaveAttribute('href', /^https:\/\/ja\.wikipedia\.org\/wiki\//);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('Given more edits than fit, when the list grows, then only the newest ten stay', async ({ page }) => {
    await open(page, [toSse(manyJa('many', 14))]);

    await expect(page.locator('#world-count')).toHaveText('14');
    await expect(page.locator('#ja-count')).toHaveText('14', { timeout: 5_000 });
    await expect(page.locator('.edit')).toHaveCount(10);
    await expect(page.locator('.edit__title').first()).toHaveText('記事14');
    await expect(page.locator('.edit__title').last()).toHaveText('記事5');
  });

  test('Given the reader needs to catch up, when paused, then nothing new is counted until resumed', async ({ page }) => {
    const { served } = await open(page, [toSse(SAMPLE), toSse(manyJa('later', 3)), toSse(manyJa('after', 2))]);
    await expect(page.locator('#world-count')).toHaveText(String(SAMPLE_WORLD));

    const pause = page.locator('#pause-toggle');
    await pause.click();
    await expect(pause).toHaveText('再開する');
    await expect(page.locator('#link-state')).toContainText('一時停止中');

    await expect.poll(() => served.count, { timeout: 10_000 }).toBeGreaterThan(1);
    await expect(page.locator('#world-count')).toHaveText(String(SAMPLE_WORLD));

    await page.locator('#pause-toggle').click();
    await expect(page.locator('#world-count')).toHaveText(String(SAMPLE_WORLD + 2), { timeout: 10_000 });
  });

  test('Given the stream is refused, when the page loads, then it says so without losing the map', async ({ page }) => {
    await open(page, [toSse(SAMPLE)], { status: 404 });

    await expect(page.locator('#link-state')).toHaveAttribute('data-state', 'error');
    await expect(page.locator('#world-count')).toHaveText('0');
    await expect(page.locator('#feed-empty')).toBeVisible();
    // つながらなくても地図は消さない
    expect((await pixels(page)).land).toBeGreaterThan(5000);
  });

  test('Given reduced motion is asked for, when edits arrive, then the map stops moving but still marks places', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await open(page, [toSse(SAMPLE)]);

    await expect(page.locator('#world-count')).toHaveText(String(SAMPLE_WORLD));
    await expect.poll(async () => (await stats(page)).pins, { timeout: 10_000 }).toBeGreaterThan(0);

    const measured = await stats(page);
    expect(measured.calm).toBe(true);
    expect(measured.frameId).toBe(0, 'アニメーションのループは回さない');
    expect(measured.ripples).toBe(0, '広がる波紋は出さない');
    // 動きを止めても、場所の情報は残す
    expect(measured.marks).toBeGreaterThan(0);
    await expect(page.locator('#hot-name')).toHaveText('日本');
    await context.close();
  });

  test('Given the sound is off by default, when it is turned on, then the button says what it does', async ({ page }) => {
    await open(page, [toSse(SAMPLE)]);
    const sound = page.getByRole('button', { name: '音を出す' });
    await expect(sound).toHaveAttribute('aria-pressed', 'false');
    await sound.click();
    await expect(page.getByRole('button', { name: '音を消す' })).toHaveAttribute('aria-pressed', 'true');
    expect((await stats(page)).sound).toBe(true);
  });

  test('Given any screen, when tap targets are measured, then buttons share one minimum height', async ({ page }) => {
    await open(page, [toSse(SAMPLE)]);

    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const heights = await page
        .locator('.ghost-button, .foot__nav a')
        .evaluateAll((elements) =>
          elements.filter((node) => node.offsetParent !== null).map((node) => Math.round(node.getBoundingClientRect().height)));
      expect(heights.length).toBeGreaterThan(2);
      for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
    }
  });

  test('Given the quietest text, when its contrast is measured, then it still clears AA', async ({ page }) => {
    await open(page, [toSse(SAMPLE)]);

    for (const selector of ['.edit__comment', '.hot__note']) {
      const ratio = await page.locator(selector).first().evaluate((node) => {
        const parse = (value) => value.match(/[\d.]+/g).slice(0, 3).map(Number);
        const channel = (value) => {
          const scaled = value / 255;
          return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
        };
        const luminance = (rgb) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
        const text = luminance(parse(getComputedStyle(node).color));
        let behind = node.parentElement;
        while (behind && getComputedStyle(behind).backgroundColor === 'rgba(0, 0, 0, 0)') behind = behind.parentElement;
        const back = luminance(parse(getComputedStyle(behind).backgroundColor));
        return (Math.max(text, back) + 0.05) / (Math.min(text, back) + 0.05);
      });
      expect(ratio, selector).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('Given the footer, when it is read, then it says the map is not about people', async ({ page }) => {
    await open(page, [toSse(SAMPLE)]);

    const foot = page.locator('.foot');
    // このアプリの主張。似た先行作（編集者のIPを地図にするもの）と取り違えられないようにする
    await expect(foot).toContainText('編集した人の場所」ではありません');
    await expect(foot).toContainText('記事そのものが持つ座標');
    await expect(foot).toContainText('利用者名は表示しません');
    await expect(foot).toContainText('Natural Earth');
    await expect(foot).toContainText('CC BY-SA 4.0');
    await expect(foot.getByRole('link', { name: 'Listen to Wikipedia' })).toHaveAttribute('href', 'https://listen.hatnote.com/');
  });
});

test('Given the portfolio, when Day 010 is listed, then the card links to the app', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.card[data-title="いま、誰かが書き直している"]');
  await expect(card).toBeVisible();
  await expect(card.getByRole('link', { name: 'アプリを開く' })).toHaveAttribute('href', './day-010-wikipedia-live/');
});
