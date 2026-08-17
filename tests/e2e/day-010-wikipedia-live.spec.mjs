import { expect, test } from '@playwright/test';
import {
  SAMPLE,
  SAMPLE_JA,
  SAMPLE_JA_TITLES,
  SAMPLE_WORLD,
  manyJa,
  toSse,
} from '../../apps/day-010-wikipedia-live/tests/fixtures/stream.mjs';

/* 上流のEventStreamsには一切つながない。本物は毎秒30件前後・中身も毎回違うので、
   同梱の固定ストリーム（apps/day-010-wikipedia-live/tests/fixtures/）を page.route で流し込む。 */
const STREAM = '**/v2/stream/recentchange*';
const PAGE = '/day-010-wikipedia-live/';

/**
 * 接続のたびに違う本文を返せるようにする。EventSourceは本文を読み切ると再接続するので、
 * 1回目・2回目…と配列の順に配る（足りなくなったら最後の本文を配り続ける）。
 */
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

const open = async (page, bodies, status) => {
  const served = await serveStream(page, bodies, status);
  await page.goto(PAGE);
  return served;
};

const stats = (page) => page.evaluate(() => window.__day010.stats);

test.describe('Day 010 wikipedia live', () => {
  test('Given a burst of edits, when they arrive, then only real edits are counted', async ({ page }) => {
    await open(page, [toSse(SAMPLE)]);

    // カテゴリ操作は数えない。他言語とノートは世界の数にだけ入る
    await expect(page.locator('#world-count')).toHaveText(String(SAMPLE_WORLD));
    await expect(page.locator('#ja-count')).toHaveText(String(SAMPLE_JA));
    await expect(page.locator('.edit')).toHaveCount(SAMPLE_JA);
    await expect(page.locator('#feed-empty')).toBeHidden();

    // 新しいものが上。日本語版の記事本体だけで、ノートは混ざらない
    await expect(page.locator('.edit__title')).toHaveText(SAMPLE_JA_TITLES);
    await expect(page.locator('.edit[data-title="ノート:秋田県"]')).toHaveCount(0);

    // 増減は符号と色で分ける（赤緑は使わない）
    const akita = page.locator('.edit[data-title="秋田県"] .edit__delta');
    await expect(akita).toHaveText('+210バイト');
    await expect(akita).toHaveAttribute('data-dir', 'up');
    const curry = page.locator('.edit[data-title="カレーライス"] .edit__delta');
    await expect(curry).toHaveText('−320バイト');
    await expect(curry).toHaveAttribute('data-dir', 'down');

    // 毎秒レートは測れる長さが貯まってから出す
    await expect.poll(async () => (await page.locator('#rate').textContent()) !== '—').toBe(true);
  });

  test('Given the stream resends the same events, when it reconnects, then the count does not double', async ({ page }) => {
    // 1回目と2回目でまったく同じ本文を配る。再接続で再生されても数字は増えないこと
    const served = await open(page, [toSse(SAMPLE), toSse(SAMPLE)]);
    await expect(page.locator('#world-count')).toHaveText(String(SAMPLE_WORLD));

    await expect.poll(() => served.count, { timeout: 10_000 }).toBeGreaterThan(1);
    await expect(page.locator('#world-count')).toHaveText(String(SAMPLE_WORLD));
    await expect(page.locator('#ja-count')).toHaveText(String(SAMPLE_JA));
    await expect(page.locator('.edit')).toHaveCount(SAMPLE_JA);
  });

  test('Given anonymous editors, when their edits are shown, then no name or address reaches the page', async ({ page }) => {
    await open(page, [toSse(SAMPLE)]);
    await expect(page.locator('.edit')).toHaveCount(SAMPLE_JA);

    // ストリームは匿名編集者のIPを user でそのまま流してくる。画面にもDOMにも出さない
    const html = await page.content();
    for (const secret of ['192.0.2.10', '2001:db8', 'テスト太郎']) {
      expect(html).not.toContain(secret);
    }

    // 要約に混ざった利用者名は伏せ字にし、伏せたことを明示する
    const masked = page.locator('.edit[data-title="駅"]');
    await expect(masked.locator('.edit__comment')).toHaveText('●●● の編集を差し戻し');
    await expect(masked.locator('.badge')).toHaveText(['利用者名を伏せました']);

    // 伏せる必要がなかった編集にバッジは付かない
    await expect(page.locator('.edit[data-title="秋田県"] .badge')).toHaveCount(0);
    // 節名は読める形に直す
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
    // 数は14まで数えるが、読ませるのは新しい10件だけ
    await expect(page.locator('.edit')).toHaveCount(10);
    await expect(page.locator('.edit__title').first()).toHaveText('記事14');
    await expect(page.locator('.edit__title').last()).toHaveText('記事5');
    await expect(page.locator('#feed-note')).toContainText('一時停止');
  });

  test('Given the reader needs to catch up, when paused, then nothing new is counted until resumed', async ({ page }) => {
    const served = await open(page, [toSse(SAMPLE), toSse(manyJa('later', 3)), toSse(manyJa('after', 2))]);
    await expect(page.locator('#world-count')).toHaveText(String(SAMPLE_WORLD));

    // 押すとラベルが「再開する」に変わるので、名前ではなくIDで掴む
    const pause = page.locator('#pause-toggle');
    await expect(pause).toHaveText('一時停止');
    await pause.click();
    await expect(pause).toHaveText('再開する');
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#link-state')).toContainText('一時停止中');

    // 2本目の本文が届いても、止めている間は数えない
    await expect.poll(() => served.count, { timeout: 10_000 }).toBeGreaterThan(1);
    await expect(page.locator('#world-count')).toHaveText(String(SAMPLE_WORLD));
    await expect(page.locator('.edit')).toHaveCount(SAMPLE_JA);

    // 再開したら次の本文から数え直す
    await page.getByRole('button', { name: '再開する' }).click();
    await expect(page.locator('#world-count')).toHaveText(String(SAMPLE_WORLD + 2), { timeout: 10_000 });
  });

  test('Given the stream is refused, when the page loads, then it says so without losing the numbers', async ({ page }) => {
    await open(page, [toSse(SAMPLE)], 404);

    await expect(page.locator('#link-state')).toHaveAttribute('data-state', 'error');
    await expect(page.locator('#link-state')).toContainText('つながりません');
    // つながらなくても画面は壊さない。0件のままで待ちの案内を出す
    await expect(page.locator('#world-count')).toHaveText('0');
    await expect(page.locator('#feed-empty')).toBeVisible();
    await expect(page.locator('#rate')).toHaveText('—');
  });

  test('Given the water, when edits land, then Japanese drops are drawn in their own colour', async ({ page }) => {
    await open(page, [toSse(SAMPLE)]);

    // キャンバスの中身を色で数える。日本語＝アクア、その他＝スレート
    const pixels = () =>
      page.evaluate(() => {
        const canvas = document.querySelector('#water');
        const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        let ja = 0;
        let other = 0;
        for (let index = 0; index < data.length; index += 4) {
          const [red, green, blue, alpha] = [data[index], data[index + 1], data[index + 2], data[index + 3]];
          if (alpha < 24) continue;
          if (green > 150 && green - red > 60 && blue > 120) ja += 1;
          else if (blue > 110 && blue - red > 20 && green < 170) other += 1;
        }
        return { ja, other };
      });

    await expect.poll(async () => (await pixels()).ja, { timeout: 8_000 }).toBeGreaterThan(80);
    await expect.poll(async () => (await pixels()).other).toBeGreaterThan(80);
  });

  test('Given reduced motion is asked for, when edits arrive, then nothing falls', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await open(page, [toSse(SAMPLE)]);

    await expect(page.locator('#world-count')).toHaveText(String(SAMPLE_WORLD));
    const measured = await stats(page);
    expect(measured.calm).toBe(true);
    // 粒は1つも作らず、アニメーションのループも回さない
    expect(measured.drops).toBe(0);
    expect(measured.frameId).toBe(0);
    // 動きを止めても、読む側の情報は減らさない
    await expect(page.locator('.edit')).toHaveCount(SAMPLE_JA);
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

    // 編集要約は画面でいちばん薄い文字。カードの背景と4.5:1を保てているか
    const ratio = await page.locator('.edit__comment').first().evaluate((node) => {
      const parse = (value) => value.match(/[\d.]+/g).slice(0, 3).map(Number);
      const channel = (value) => {
        const scaled = value / 255;
        return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (rgb) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
      const text = luminance(parse(getComputedStyle(node).color));
      const behind = luminance(parse(getComputedStyle(node.closest('.edit')).backgroundColor));
      return (Math.max(text, behind) + 0.05) / (Math.min(text, behind) + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('Given the footer, when it is read, then the sources and the omissions are stated', async ({ page }) => {
    await open(page, [toSse(SAMPLE)]);

    const foot = page.locator('.foot');
    await expect(foot).toContainText('Wikimedia EventStreams');
    await expect(foot).toContainText('CC BY-SA 4.0');
    await expect(foot).toContainText('利用者名は表示しません');
    await expect(foot).toContainText('IPアドレス');
    await expect(foot).toContainText('カテゴリ追加やログ操作は数えません');
    // 先行作があることを隠さない
    await expect(foot.getByRole('link', { name: 'Listen to Wikipedia' })).toHaveAttribute('href', 'https://listen.hatnote.com/');
  });
});

test('Given the portfolio, when Day 010 is listed, then the card links to the app', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.card[data-title="いま、誰かが書き直している"]');
  await expect(card).toBeVisible();
  await expect(card.getByRole('link', { name: 'アプリを開く' })).toHaveAttribute('href', './day-010-wikipedia-live/');
});
