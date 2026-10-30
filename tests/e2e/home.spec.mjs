import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { effectiveStatus } from '../../scripts/lib/day-status.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const apps = readdirSync(root).filter((dir) => /^day-\d{3}-/.test(dir))
  .map((dir) => ({ ...JSON.parse(readFileSync(`${root}${dir}/meta.json`, 'utf8')), dir }))
  .filter((app) => effectiveStatus(app, app.dir) !== 'draft')
  .sort((a, b) => b.day - a.day);
const released = apps.filter((app) => effectiveStatus(app, app.dir) === 'published' || app.externalUrl);
const latest = released[0];
const pad = (day) => String(day).padStart(3, '0');
const latestUrl = effectiveStatus(latest, latest.dir) === 'published' ? `./${latest.dir}/` : latest.externalUrl;
const visibleCards = (page) => page.locator('article.card:not([hidden])');
const normalize = (value) => value.normalize('NFKC').toLowerCase()
  .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
const aliases = { game: 'げーむ', puzzle: 'ぱずる', security: 'せきゅりてぃ', image: '画像', music: '音楽' };
const keyOf = (value) => {
  const key = normalize(value).replace(/[^\p{L}\p{N}]/gu, '');
  return aliases[key] || key;
};

// 試験の通信で本番の計測（GA4）を汚さない。イベントを見る試験だけが、その中でこの遮断を上書きする
test.beforeEach(async ({ page }) => {
  await page.route(/googletagmanager\.com|google-analytics\.com|analytics\.google\.com/, (route) => route.abort());
});

for (const width of [390, 768, 1440]) {
  test.describe(`一覧 ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
    });

    test('題名・実値の進捗・マップ・プレビュー・最新への入口とDOMの約束', async ({ page }) => {
      await expect(page.locator('h1')).toHaveText('100 DAYS / 100 APPS');
      await expect(page.locator('h1')).toBeInViewport();
      await expect(page.locator('.cta[data-day]')).toBeInViewport();
      await expect(page.locator('.matrix')).toBeInViewport();
      await expect(page.locator('.progress__now')).toHaveText(String(released.length));
      await expect(page.locator('.cta[data-day]')).toHaveAttribute('href', latestUrl);
      await expect(page.locator('.cta[data-day]')).toHaveAccessibleName(/最新のアプリを開く/);
      await expect(page.locator('.matrix > li')).toHaveCount(Math.ceil(Math.max(100, apps[0].day) / 10) * 10);
      await expect(page.locator('.matrix a.cell')).toHaveCount(released.length);
      await expect(page.locator('.cell[tabindex="0"]')).toHaveCount(1);
      await expect(page.locator('.cell[tabindex="0"]')).toHaveAttribute('data-day', pad(latest.day));
      expect(await page.locator('.preview__title').textContent()).toBe(latest.title);
      await expect(page.locator('.preview .go')).toHaveAttribute('href', latestUrl);
      if (width >= 720 && latest.screenshot) await expect(page.locator('.preview__img')).toBeVisible();
      if (width >= 1100) await expect(page.locator('.preview')).toBeInViewport();
      if (width === 390) await expect(page.locator('.preview__img')).toBeHidden();
      await expect(page.locator('article.card')).toHaveCount(apps.length);
      await expect(page.locator('.card').first()).toHaveAttribute('data-day', pad(apps[0].day));
      const broken = await page.locator('.card').evaluateAll((cards) => cards.filter((card) =>
        card.querySelectorAll('img').length > 1 || card.querySelectorAll('a.btn.btn--primary').length > 1 ||
        card.querySelectorAll('.badge').length > 1 || !card.id || !card.hasAttribute('data-search')).length);
      expect(broken).toBe(0);
      await expect(page.locator('.flag')).toHaveCount(1);
      await expect(page.locator(`#day-${pad(latest.day)} .flag`)).toHaveText('LATEST');
      expect(await page.locator('.thumb').evaluateAll((thumbs) => thumbs.filter((thumb) => thumb.querySelector('.card__day, .flag, .badge')).length)).toBe(0);
      expect(await page.locator('a.btn').evaluateAll((nodes) => nodes.every((node) => node.closest('.card')))).toBe(true);
      const ids = await page.locator('[id]').evaluateAll((nodes) => nodes.map((node) => node.id));
      expect(new Set(ids).size).toBe(ids.length);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://rairakku.com/100days/');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test('題名を保った副題・切り抜かない画像・統一したタグ・画像なしの案内', async ({ page }) => {
      const titles = await page.locator('.card__title').evaluateAll((nodes) => nodes.map((node) => node.textContent));
      expect(titles).toEqual(apps.map((app) => app.title));
      await expect(page.locator('.card__sub')).toHaveCount(apps.filter((app) => app.title.includes(' — ')).length);
      expect(await page.locator('.thumb__img, .preview__img').evaluateAll((nodes) =>
        nodes.every((node) => getComputedStyle(node).objectFit === 'contain'))).toBe(true);
      const quickLabels = await page.locator('.chips .chip').allTextContents();
      expect(quickLabels.includes('ゲーム') && quickLabels.includes('game')).toBe(false);
      expect(await page.locator('.chips .chip[data-key="げーむ"]').count()).toBeLessThanOrEqual(1);
      const gameKey = keyOf('ゲーム');
      const gameLabels = apps.flatMap((app) => (app.tags || []).filter((tag, index, tags) =>
        keyOf(tag) === gameKey && tags.findIndex((other) => keyOf(other) === gameKey) === index));
      const frequencies = new Map();
      // ビルドの元データ順（Dayの若い順）と、同数時の綴りの選び方も合わせる。
      gameLabels.reverse().forEach((label) => frequencies.set(label, (frequencies.get(label) || 0) + 1));
      const majority = [...frequencies].sort((a, b) => b[1] - a[1])[0]?.[0];
      const tagRows = await page.locator('.card__tags').evaluateAll((rows) =>
        rows.map((row) => [...row.children].map((node) => node.textContent.slice(1))));
      tagRows.forEach((tags) => expect(new Set(tags.map(keyOf)).size).toBe(tags.length));
      const displayedGameTags = await page.locator('.card .tag').allTextContents();
      for (const label of displayedGameTags.filter((tag) => keyOf(tag.slice(1)) === gameKey)) {
        expect(label).toBe(`#${majority}`);
      }
      for (const app of apps.filter((app) => !app.screenshot)) {
        const card = page.locator(`#day-${pad(app.day)}`);
        await expect(card.locator('img')).toHaveCount(0);
        await expect(card.locator('.thumb__missing')).toHaveText('スクリーンショットなし');
      }
      // Xの入口は、ヒーローの下と、一覧の末尾（ルール欄）の2か所
      for (const scope of ['.hero', '.about']) {
        await expect(page.locator(`${scope} a.follow`)).toHaveText('Xでフォロー → @haranishi_ikki');
        await expect(page.locator(`${scope} a.follow`)).toHaveAttribute('href', 'https://x.com/haranishi_ikki');
      }
      await expect(page.locator('.pill').first()).toHaveAccessibleName('Xでフォロー @haranishi_ikki');
      const subtitleApp = released.find((app) => app.title.includes(' — '));
      await page.locator(`.cell[data-day="${pad(subtitleApp.day)}"]`).focus();
      const [main, ...rest] = subtitleApp.title.split(' — ');
      expect(await page.locator('.preview__title').textContent()).toBe(subtitleApp.title);
      await expect(page.locator('.preview__sub')).toHaveText(rest.join(' — '));
      await expect(page.locator('.go > span[aria-hidden="true"]')).toHaveText('→');
      if (width === 390) {
        await expect(page.locator('.preview__sub')).toBeHidden();
        expect(await page.locator('.preview__title').innerText()).toBe(main);
        await expect(page.locator('.preview__title')).toHaveCSS('text-overflow', 'clip');
      }
    });

    test('マップはホバー・矢印・Home/Endで選べ、隠れたカードへの移動は条件を解除する', async ({ page }) => {
      const cells = page.locator('.matrix a.cell');
      const first = cells.first();
      const second = cells.nth(1);
      const firstDay = await first.getAttribute('data-day');
      const firstTitle = await first.getAttribute('data-title');
      await first.hover();
      expect(await page.locator('.preview__title').textContent()).toBe(firstTitle);
      await expect(page.locator('.go > span[aria-hidden="true"]')).toHaveText('→');
      await expect(page.locator('.go > span')).toHaveCount(2);
      await first.focus();
      await page.keyboard.press('ArrowRight');
      await expect(second).toBeFocused();
      expect(await page.locator('.preview__title').textContent()).toBe(await second.getAttribute('data-title'));
      await page.keyboard.press('End');
      await expect(cells.last()).toBeFocused();
      await page.keyboard.press('Home');
      await expect(first).toBeFocused();
      const below = cells.filter({ has: page.locator('span', { hasText: String(Number(firstDay) + 10).padStart(3, '0') }) });
      if (await below.count()) {
        await page.keyboard.press('ArrowDown');
        await expect(below).toBeFocused();
        await page.keyboard.press('ArrowUp');
        await expect(first).toBeFocused();
      }
      await expect(page.locator('.cell[tabindex="0"]')).toHaveCount(1);
      await page.locator('#search').fill('一致しない検索語-xyz');
      await expect(visibleCards(page)).toHaveCount(0);
      await first.click();
      await expect(page).toHaveURL(new RegExp(`#day-${firstDay}$`));
      await expect(page.locator(`#day-${firstDay}`)).toBeVisible();
      await expect(page.locator(`#day-${firstDay}`)).toBeFocused();
      await expect(page.locator('#search')).toHaveValue('');
      await expect(visibleCards(page)).toHaveCount(apps.length);
    });

    test('検索は全角・Day番号・かなに対応し、0件から戻れて並び順も変わる', async ({ page }) => {
      const search = page.getByRole('searchbox', { name: 'アプリを探す（題名・タグ・Day番号）' });
      const sample = apps.find((app) => app.day === 34) || latest;
      for (const query of [String(sample.day), pad(sample.day), `Day${sample.day}`,
        `Ｄａｙ${String(sample.day).replace(/\d/g, (digit) => String.fromCharCode(digit.charCodeAt(0) + 0xfee0))}`]) {
        await search.fill(query);
        await expect(page.locator(`#day-${pad(sample.day)}`)).not.toHaveAttribute('hidden', '');
      }
      await search.fill('7');
      await expect(visibleCards(page)).toHaveCount(1);
      await expect(page.locator('#day-007')).not.toHaveAttribute('hidden', '');
      const kana = apps.find((app) => /[ァ-ヶ]/.test(app.title));
      if (kana) {
        await search.fill(normalize(kana.title));
        await expect(page.locator(`#day-${pad(kana.day)}`)).not.toHaveAttribute('hidden', '');
      }
      await search.fill('一致しない検索語-xyz');
      await expect(visibleCards(page)).toHaveCount(0);
      await expect(page.locator('#empty')).toContainText('条件に合うアプリがありません。');
      await expect(page.locator('#empty-reason')).toContainText('一致しない検索語-xyz');
      await page.getByRole('button', { name: '条件をクリア' }).click();
      await expect(visibleCards(page)).toHaveCount(apps.length);
      await expect(search).toBeFocused();
      await search.fill('clear me');
      await page.keyboard.press('Escape');
      await expect(search).toHaveValue('');
      await search.blur();
      await page.keyboard.press('/');
      await expect(search).toBeFocused();
      await page.getByRole('combobox', { name: '並べ替え' }).selectOption('old');
      await expect(page.locator('.card').first()).toHaveAttribute('data-day', pad(apps.at(-1).day));
      await page.getByRole('combobox', { name: '並べ替え' }).selectOption('new');
      await expect(page.locator('.card').first()).toHaveAttribute('data-day', pad(apps[0].day));
    });

    test('クイックタグは12個以内・40%以下で、全タグの統合・検索とのAND・閉じる操作が働く', async ({ page }) => {
      const counts = new Map();
      apps.forEach((app) => new Set((app.tags || []).map(keyOf)).forEach((key) => counts.set(key, (counts.get(key) || 0) + 1)));
      counts.delete('');
      const quick = page.locator('.chips .chip:not([data-key="*"])');
      expect(await quick.count()).toBeLessThanOrEqual(12);
      const keys = await quick.evaluateAll((nodes) => nodes.map((node) => node.dataset.key));
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys.every((key) => counts.get(key) <= apps.length * 0.4)).toBe(true);
      const selected = keys[0];
      await quick.first().click();
      await expect(visibleCards(page)).toHaveCount(counts.get(selected));
      await page.locator('#search').fill('一致しない検索語-xyz');
      await expect(visibleCards(page)).toHaveCount(0);
      await page.locator('#clear').click();
      await page.locator('#tags-open').click();
      await expect(page.locator('#tags-dialog')).toBeVisible();
      await expect(page.locator('#all-tags .chip')).toHaveCount(counts.size + 1);
      const quickLabels = await quick.evaluateAll((nodes) => nodes.map((node) => [node.dataset.key, node.dataset.tag]));
      for (const [chipKey, label] of quickLabels) {
        await expect(page.locator(`#all-tags .chip[data-key="${chipKey}"]`)).toHaveAttribute('data-tag', label);
      }
      const tag = page.locator('#all-tags .chip:not([data-key="*"])').first();
      const key = await tag.getAttribute('data-key');
      await tag.click();
      await expect(page.locator('#tags-dialog')).not.toBeVisible();
      await expect(page.locator('#tags-open')).toBeFocused();
      await expect(visibleCards(page)).toHaveCount(counts.get(key));
      await page.locator('#tags-open').click();
      await page.keyboard.press('Escape');
      await expect(page.locator('#tags-dialog')).not.toBeVisible();
      await expect(page.locator('#tags-open')).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}

for (const [label, init] of [['Do Not Track', () => Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true })], ['Global Privacy Control', () => Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true })]]) {
  test(`${label} のブラウザでは、計測を読み込まず、gtag も作らない`, async ({ page }) => {
    const requests = [];
    page.on('request', (request) => { if (/googletagmanager\.com|google-analytics\.com|analytics\.google\.com/.test(request.url())) requests.push(request.url()); });
    await page.addInitScript(init);
    await page.goto('/');
    await page.waitForTimeout(500);
    expect(requests).toEqual([]);
    expect(await page.evaluate(() => typeof window.gtag)).toBe('undefined');
    expect(await page.evaluate(() => window.dataLayer ? window.dataLayer.length : 0)).toBe(0);
  });
}

test('通常のブラウザでは、計測の読み込みを始める（gtag が作られ、タグを足す）', async ({ page }) => {
  const requests = [];
  await page.route(/googletagmanager\.com|google-analytics\.com|analytics\.google\.com/, (route) => { requests.push(route.request().url()); return route.abort(); });
  await page.goto('/');
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests[0]).toContain('googletagmanager.com/gtag/js?id=G-');
  expect(await page.evaluate(() => typeof window.gtag)).toBe('function');
});

test('既存の5イベントは同じ名前と値を送り、CTAとプレビューもDayの値を送る', async ({ page }) => {
  await page.route('https://www.googletagmanager.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto('/');
  await page.evaluate(() => {
    window.__events = [];
    window.gtag = (...args) => { if (args[0] === 'event') window.__events.push(args.slice(1)); };
    document.addEventListener('click', (event) => {
      if (event.target.closest('a')) event.preventDefault();
    }, true);
  });
  const events = () => page.evaluate(() => window.__events);
  const latestParams = { day: pad(latest.day), app_title: latest.title };
  await page.locator('.cta[data-day]').click();
  await expect.poll(events).toContainEqual(['app_open', latestParams]);
  await page.evaluate(() => { window.__events = []; });
  await page.locator('.preview .go').click();
  await expect.poll(events).toContainEqual(['app_open', latestParams]);

  const demo = page.locator('.thumb__play').first();
  const demoCard = demo.locator('xpath=ancestor::article');
  const demoParams = { day: await demoCard.getAttribute('data-day'), app_title: await demoCard.getAttribute('data-title') };
  await expect(demo).toHaveAccessibleName(new RegExp(`Day ${demoParams.day}.*再生`));
  const demoSrc = await demo.getAttribute('data-demo');
  await demo.click();
  await expect(page.locator('#player')).toBeVisible();
  await expect(page.locator('#player-video')).toHaveAttribute('src', demoSrc);
  await expect.poll(events).toContainEqual(['demo_play', demoParams]);
  await page.locator('#player-close').click();
  await expect(page.locator('#player')).not.toBeVisible();
  await expect(page.locator('#player-video')).not.toHaveAttribute('src');
  await expect(demo).toBeFocused();

  const memo = page.locator('.memo').first();
  const memoCard = memo.locator('xpath=ancestor::article');
  const memoParams = { day: await memoCard.getAttribute('data-day'), app_title: await memoCard.getAttribute('data-title') };
  await memo.locator('summary').click();
  await expect(memo).toHaveAttribute('open', '');
  await expect.poll(events).toContainEqual(['memo_open', memoParams]);
  const open = page.locator('.card a.btn--primary').first();
  const openCard = open.locator('xpath=ancestor::article');
  const openParams = { day: await openCard.getAttribute('data-day'), app_title: await openCard.getAttribute('data-title') };
  await open.click();
  await expect.poll(events).toContainEqual(['app_open', openParams]);
  const chip = page.locator('.chips .chip:not([data-key="*"])').first();
  const tagName = await chip.getAttribute('data-tag');
  await chip.click();
  await expect.poll(events).toContainEqual(['tag_filter', { tag_name: tagName }]);
  await page.locator('.pill').first().click();
  await expect.poll(events).toContainEqual(['profile_click', { link_name: 'x' }]);
  await page.evaluate(() => { window.__events = []; });
  await page.locator('.hero a.follow').click();
  await expect.poll(events).toEqual([['profile_click', { link_name: 'x' }]]);
  expect((await events()).every(([name]) => ['app_open', 'demo_play', 'tag_filter', 'profile_click', 'memo_open'].includes(name))).toBe(true);
});

test('動きを減らす設定ではセル・カードのアニメーションと滑らかなスクロールを止める', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.card.reveal')).toHaveCount(0);
  const motion = await page.locator('.cell--latest').evaluate((cell) => ({
    cell: getComputedStyle(cell.parentElement).animationName,
    ping: getComputedStyle(cell, '::after').animationName,
    scroll: getComputedStyle(document.documentElement).scrollBehavior
  }));
  expect(motion).toEqual({ cell: 'none', ping: 'none', scroll: 'auto' });
});

test.describe('JavaScriptなし', () => {
  test.use({ javaScriptEnabled: false });
  for (const width of [390, 768, 1440]) {
    test(`全カード・最新のリンク・マップ・ルールを読める ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.locator('.tools')).toBeHidden();
      await expect(page.locator('.card')).toHaveCount(apps.length);
      await expect(page.locator('.cta[data-day]')).toHaveAttribute('href', latestUrl);
      await expect(page.locator('.rules > li')).toHaveCount(5);
      await expect(page.locator('.phases > li')).toHaveCount(6);
      const first = page.locator('.matrix a.cell').first();
      const day = await first.getAttribute('data-day');
      await first.click();
      await expect(page).toHaveURL(new RegExp(`#day-${day}$`));
      await expect(page.locator(`#day-${day}`)).toBeVisible();
    });
  }
});


for (const width of [390, 1440]) {
  test(`検索へ戻るボタンは帯を通過したスマホだけに出る ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const button = page.locator('#to-tools');
    await expect(button).toBeHidden();
    // evaluateのスクロールは即時にして、Observerによる表示変更を待つ。
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    if (width === 1440) {
      await expect(button).toBeHidden();
    } else {
      await expect(button).toBeVisible();
      await expect(button).toHaveAccessibleName('↑ 検索・絞り込み');
      await button.click();
      await expect.poll(() => page.locator('.tools').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return rect.top >= -2 && rect.top < innerHeight;
      })).toBe(true);
      await expect(button).toBeHidden();
      await expect(page.locator('#search')).not.toBeFocused();
    }
  });
}

test('1440pxでは各セクションが120・528・936の3列にそろう', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const lefts = async (selector) => page.locator(selector).evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().left));
  const aligned = (actual, expected) => {
    expect(actual).toHaveLength(expected.length);
    actual.forEach((left, index) => expect(Math.abs(left - expected[index])).toBeLessThanOrEqual(2));
  };
  aligned(await lefts('.stat'), [120, 528, 936]);
  aligned((await lefts('.card')).slice(0, 3), [120, 528, 936]);
  aligned(await lefts('.hero__copy, .console'), [120, 936]);
  aligned(await lefts('.about__head, .rules'), [120, 528]);
  aligned(await lefts('.phase__range'), Array(6).fill(120));
  aligned(await lefts('.phase__body'), Array(6).fill(528));
});

for (const width of [1100, 1279]) {
  test(`コンソールのマスは正方形で24px以上 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const size = await page.locator('.matrix li').first().boundingBox();
    expect(size.width).toBeGreaterThanOrEqual(24);
    expect(Math.abs(size.width - size.height)).toBeLessThanOrEqual(1);
  });
}

// 同じ行のカードは、見出し・サムネ・題名・説明・タグ・ボタンの段がそろう（題名の行数が違っても動かない）
for (const [width, columns] of [[1440, 3], [768, 2]]) {
  test(`同じ行のカードは各段の上端がそろう ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const rows = await page.locator('article.card').evaluateAll((cards, cols) => {
      const top = (card, selector) => { const node = card.querySelector(selector); return node ? Math.round(node.getBoundingClientRect().top) : null; };
      return cards.slice(0, cols * 4).map((card) => ({
        row: Math.round(card.getBoundingClientRect().top),
        head: top(card, '.card__head'), thumb: top(card, '.thumb'), title: top(card, '.card__title'),
        desc: top(card, '.card__desc'), button: top(card, '.card__actions')
      }));
    }, columns);
    for (let i = 0; i < rows.length; i += columns) {
      const group = rows.slice(i, i + columns);
      for (const key of ['row', 'head', 'thumb', 'title', 'desc', 'button']) {
        const values = group.map((card) => card[key]).filter((value) => value !== null);
        expect(Math.max(...values) - Math.min(...values), `${i / columns + 1}行目の ${key}`).toBeLessThanOrEqual(1);
      }
    }
  });
}

test('マップのプレビューは、題名が1行でも2行でも高さが変わらない', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const height = () => page.locator('.console').evaluate((node) => Math.round(node.getBoundingClientRect().height));
  const first = await height();
  const cells = page.locator('.matrix a.cell');
  const count = await cells.count();
  const lengths = new Set();
  for (let i = 0; i < count; i += 6) {
    await cells.nth(i).hover();
    await expect(page.locator('.preview__title')).toHaveText(await cells.nth(i).getAttribute('data-title'));
    lengths.add(await page.locator('.preview__title').evaluate((node) => Math.round(node.getBoundingClientRect().height)));
    expect(await height()).toBe(first);
  }
  expect(lengths.size, '題名が2行のDayと1行のDayの両方を見た').toBeGreaterThanOrEqual(1);
});

test('PCの追従する検索の帯は不透明で、画面の上端に付く', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const tools = page.locator('.tools');
  await tools.scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollTo({ top: document.querySelector('.tools').getBoundingClientRect().top + scrollY + 900, behavior: 'instant' }));
  await expect.poll(() => tools.evaluate((node) => Math.round(node.getBoundingClientRect().top))).toBe(0);
  const style = await tools.evaluate((node) => ({ background: getComputedStyle(node).backgroundColor, height: Math.round(node.getBoundingClientRect().height), position: getComputedStyle(node).position }));
  expect(style.position).toBe('sticky');
  expect(style.background).toMatch(/^rgb\(/); // 透けない（rgba にならない）
  expect(style.height).toBeLessThanOrEqual(125);
});

// WebKit（Safari・iPhone）は、長いスムーズスクロールの最中に、通り過ぎるカードの遷移（出現・ホバー）が
// 一斉に始まると、スクロールを途中で打ち切る（実測：約7,000pxの移動で約1割が目標の手前で止まる）。
// CIはChromiumだけで、その失敗は起きない。そこで原因の側、「動いている間にカードの遷移が走らない」ことを見張る。
test('マスから遠いカードへ動いている間は、カードの遷移が走らず、止まったあとは元に戻る', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const far = released[Math.min(30, released.length - 1)];
  await page.locator(`.matrix a.cell[data-day="${pad(far.day)}"]`).click();
  const seen = await page.evaluate(() => new Promise((resolve) => {
    const cardTransitions = () => document.getAnimations()
      .filter((animation) => animation instanceof CSSTransition && animation.effect?.target?.closest?.('.card')).length;
    const start = performance.now();
    let last = scrollY;
    let moving = 0;
    let most = 0;
    const tick = () => {
      // 止まったあとに始まるホバーの遷移は数えない。スクロールが動いているフレームだけを見る
      if (Math.abs(scrollY - last) > 1) {
        moving += 1;
        most = Math.max(most, cardTransitions());
      }
      last = scrollY;
      if (performance.now() - start < 1800) requestAnimationFrame(tick);
      else resolve({ moving, most });
    };
    tick();
  }));
  expect(seen.moving, '動いているフレームを十分に見た').toBeGreaterThanOrEqual(5);
  expect(seen.most, '動いている間に走ったカードの遷移の数').toBe(0);
  await expect(page.locator(`#day-${pad(far.day)}`)).toBeInViewport();
  // 止めっぱなしにしない：動き終えたら、遷移は元に戻る
  await expect.poll(() => page.locator('.card').first().evaluate((node) => getComputedStyle(node).transitionDuration)).not.toBe('0s');
});
