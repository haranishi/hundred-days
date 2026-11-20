import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* UXレシピ（Day096）。状態・診断・符号・描画の正しさは day-096-ux-recipe/tests の単体試験が持つ。
   ここでは、実ブラウザで「目的を選ぶ→組み上がる→触る→診断が変わる→共有・書き出し・保存ができる」と、
   スマホの指・キーボード・本番CSPの下で動くことを確かめる。画面の名前（ボタン名など）は interfaces-app.md の契約。
   開発サーバーで流すときは DAY096_BASE=/ を付ける（tools/playwright.dev.config.mjs）。 */

const base = process.env.DAY096_BASE ?? '/day-096-ux-recipe/';
const GOALS = ['予約してもらう', '買ってもらう', '問い合わせてもらう', '登録してもらう', '応募してもらう', '参加してもらう', '来店してもらう', '応援してもらう'];
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function open(page, query = 'fresh=1', path = '') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective}: ${e.blockedURI}`));
  });
  await page.goto(`${base}?debug=1&tips=0${query ? `&${query}` : ''}${path}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  return errors;
}

/** 目的を選ぶ。作業中の状態があるときは、確認ダイアログ（目的を変えますか？）で「目的を変える」を押す。 */
async function pickGoal(page, label) {
  await page.getByRole('button', { name: new RegExp(label) }).first().click();
  const confirm = page.locator('#dlg-goal-change').getByRole('button', { name: '目的を変える' });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
}
const outlineRows = (page) => page.locator('#slot-outline li.ed-row');
const getState = (page) => page.evaluate(() => window.__uxr.getState());
const types = async (page) => (await getState(page)).blocks.map((b) => b.type);
const heroTitle = async (page) => (await getState(page)).blocks.find((b) => b.type === 'hero').props.title;
const tab = (page, name) => page.getByRole('tab', { name, exact: true }).click();

async function startEditor(page, goal = '予約してもらう', query = 'fresh=1') {
  const errors = await open(page, query);
  await pickGoal(page, goal);
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'editor');
  return errors;
}

test.describe('入口と共通部品', () => {
  test('起動して、8つの目的が並び、エラーも本番CSPの違反もない', async ({ page }) => {
    const errors = await open(page);
    await expect(page.locator('#app')).toHaveAttribute('data-screen', 'goal');
    for (const label of GOALS) await expect(page.getByRole('button', { name: new RegExp(label) }).first()).toBeVisible();
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('「このアプリを共有する」から共通のシェア欄が開く（二重に据え付けていない）', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'このアプリを共有する', exact: true }).click();
    const share = page.locator('.share');
    await expect(share).toHaveCount(1);
    await expect(share).toBeVisible();
    await expect(share.getByRole('link', { name: 'Xで投稿' })).toHaveAttribute('href', /https:\/\/x\.com\/intent\/post\?/);
    await expect(share.getByRole('button', { name: 'リンクをコピー' })).toBeVisible();
  });
});

test.describe('組み立てと編集', () => {
  test('目的を選ぶと、ページが組み上がり、診断が出る（全8目的で90点前後以上・5段階が揃う）', async ({ page }) => {
    const errors = await open(page);
    for (const [i, label] of GOALS.entries()) {
      if (i > 0) { await page.getByRole('button', { name: '目的を選び直す' }).click(); }
      await pickGoal(page, label);
      await expect(page.locator('#app')).toHaveAttribute('data-screen', 'editor');
      const t = await types(page);
      expect(t[0], `${label}: 先頭は hero`).toBe('hero');
      expect(t.length, `${label}: 部品の数`).toBeGreaterThanOrEqual(7);
      const d = await page.evaluate(() => window.__uxr.diagnose());
      expect(d.score, `${label}: 診断の点`).toBeGreaterThanOrEqual(85);
      expect(d.stages.every((s) => s.ok), `${label}: 5段階が揃う`).toBe(true);
      await expect(page.locator('#slot-preview .uxr-block').first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('プレビューの文字をタップすると入力欄に移り、打つとプレビューが変わる。打鍵は1回で元に戻る', async ({ page }) => {
    await startEditor(page);
    const before = await heroTitle(page);
    await page.locator('#slot-preview .uxr-hero [data-path="title"]').click();
    const input = page.getByLabel('キャッチコピー', { exact: true });
    await expect(input).toBeFocused();
    await input.fill('');
    await page.keyboard.type('新しい見出しです');
    await expect(page.locator('#slot-preview .uxr-hero [data-path="title"]')).toHaveText('新しい見出しです');
    await page.getByRole('button', { name: '元に戻す' }).click();
    expect(await heroTitle(page)).toBe(before);
    await page.getByRole('button', { name: 'やり直す' }).click();
    expect(await heroTitle(page)).toBe('新しい見出しです');
  });

  test('並べ替え: ▲▼ボタン・キーボード・つまみのドラッグ（マウス）', async ({ page }) => {
    await startEditor(page);
    const rows = outlineRows(page);
    const first = await types(page);
    await rows.nth(1).getByRole('button', { name: '下へ移動' }).click();
    const afterDown = await types(page);
    expect(afterDown[1]).toBe(first[2]);
    expect(afterDown[2]).toBe(first[1]);
    await rows.nth(2).getByRole('button', { name: '上へ移動' }).click();
    expect(await types(page)).toEqual(first);
    const handle = rows.nth(1).getByRole('button', { name: '並べ替えのつまみ' });
    await handle.focus();
    await page.keyboard.press('Alt+ArrowDown');
    expect((await types(page))[2]).toBe(first[1]);
    await page.keyboard.press('Alt+ArrowUp');
    const box = await rows.nth(1).getByRole('button', { name: '並べ替えのつまみ' }).boundingBox();
    const target = await rows.nth(3).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, target.y + target.height / 2 + 6, { steps: 12 });
    await page.mouse.up();
    expect((await types(page))[3]).toBe(first[1]);
  });

  test('部品を足す・複製・削除（削除は元に戻せる）', async ({ page }) => {
    await startEditor(page);
    const n = (await types(page)).length;
    await page.getByRole('button', { name: '部品を足す' }).first().click();
    await page.locator('#dlg-palette').getByRole('button', { name: /よくある質問/ }).first().click();
    expect((await types(page)).length).toBe(n + 1);
    const rows = outlineRows(page);
    await rows.first().getByRole('button', { name: '複製' }).click();
    expect((await types(page)).length).toBe(n + 2);
    await rows.first().getByRole('button', { name: '削除' }).click();
    expect((await types(page)).length).toBe(n + 1);
    await page.locator('#toasts').getByRole('button', { name: '元に戻す' }).click();
    expect((await types(page)).length).toBe(n + 2);
  });

  test('診断: ヒーローを消すと点が下がり、「なおす」で戻る。期限・残り枠は「本当の数字」を確認するまで残る', async ({ page }) => {
    await startEditor(page);
    const full = await page.evaluate(() => window.__uxr.diagnose().score);
    const id = (await getState(page)).blocks.find((b) => b.type === 'hero').id;
    await page.evaluate((x) => window.__uxr.dispatch({ type: 'removeBlock', id: x }), id);
    const low = await page.evaluate(() => window.__uxr.diagnose().score);
    expect(low).toBeLessThan(full);
    await tab(page, '診断');
    await page.getByRole('button', { name: 'なおす' }).first().click();
    expect((await types(page))[0]).toBe('hero');
    expect(await page.evaluate(() => window.__uxr.diagnose().score)).toBeGreaterThanOrEqual(low);
    await page.getByRole('button', { name: '目的を選び直す' }).click();
    await pickGoal(page, '参加してもらう');
    const limited = (await getState(page)).blocks.find((b) => b.type === 'limited');
    expect(limited?.props.real).toBe(false);
    const items = await page.evaluate(() => window.__uxr.diagnose().items);
    expect(items.find((i) => i.id === 'honest-limited')?.ok).toBe(false);
  });

  test('見た目: テーマと強調色とサイトの名前が、プレビューに反映される', async ({ page }) => {
    await startEditor(page);
    await tab(page, '見た目');
    await page.getByRole('radio', { name: /テーマ: きりっと/ }).check();
    await expect(page.locator('#slot-preview .uxr-page')).toHaveAttribute('data-theme', 'crisp');
    await page.getByRole('radio', { name: /強調色: あい/ }).check();
    await expect(page.locator('#slot-preview .uxr-page')).toHaveAttribute('data-accent', '1');
    await page.getByLabel('サイトの名前').fill('テスト食堂');
    await expect(page.locator('#slot-preview .uxr-brand')).toHaveText('テスト食堂');
  });
});

test.describe('共有・書き出し・保存', () => {
  test('共有リンク（#v=）を開くと「見るだけ」の画面になり、「もとに作る」で編集できる。壊れたリンクは理由を出す', async ({ page, browser }) => {
    await startEditor(page);
    await tab(page, '見た目');
    await page.getByLabel('サイトの名前').fill('共有テスト');
    await page.getByRole('button', { name: '共有・書き出し' }).click();
    const link = await page.locator('#dlg-share input[readonly]').first().inputValue();
    expect(link).toContain('#v=');
    const other = await (await browser.newContext()).newPage();
    await other.goto(link);
    await expect(other.locator('#app')).toHaveAttribute('data-screen', 'viewer', { timeout: 20_000 });
    await expect(other.locator('.uxr-page')).toBeVisible();
    await other.getByRole('button', { name: /このレシピをもとに作る/ }).click();
    await expect(other.locator('#app')).toHaveAttribute('data-screen', 'editor');
    const broken = await (await browser.newContext()).newPage();
    await broken.goto(`${base}#v=zzzz`);
    await expect(broken.locator('#app')).toHaveAttribute('data-screen', 'goal', { timeout: 20_000 });
    await expect(broken.locator('#toasts')).toContainText('読み取れ');
  });

  test('HTMLの書き出し: 1ファイル・スクリプトなし・ページの見た目のCSSつき', async ({ page }) => {
    await startEditor(page);
    await page.getByRole('button', { name: '共有・書き出し' }).click();
    await page.locator('#dlg-share').getByRole('tab', { name: '書き出し' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'HTMLをダウンロード' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^ux-recipe-reserve\.html$/);
    const html = readFileSync(await download.path(), 'utf8');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('.uxr-page');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\//);
  });

  test('保存: 再読み込みで続きから・名前をつけた保存を開いて戻せる', async ({ page }) => {
    await startEditor(page);
    const id = (await getState(page)).blocks[0].id;
    await page.evaluate((x) => window.__uxr.dispatch({ type: 'setProp', id: x, path: ['title'], value: '保存の確認' }), id);
    await page.waitForTimeout(700);
    await page.goto(`${base}?debug=1&tips=0`);
    await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#app')).toHaveAttribute('data-screen', 'editor');
    expect(await heroTitle(page)).toBe('保存の確認');
    await page.getByRole('button', { name: '保存・開く' }).click();
    await page.locator('#dlg-slots').getByRole('textbox').fill('確認用');
    await page.locator('#dlg-slots').getByRole('button', { name: '保存する' }).click();
    await expect(page.locator('#dlg-slots')).toContainText('確認用');
  });
});

test.describe('操作性（スマホ・キーボード・動きを減らす）', () => {
  test.use(phone);

  test('スマホ幅: 横にはみ出さず、プレビューと編集パネルが同時に見え、押せる所が44px以上', async ({ page }) => {
    await startEditor(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const preview = await page.locator('#slot-preview').boundingBox();
    const panel = await page.locator('#slot-panel').boundingBox();
    expect(preview.height).toBeGreaterThan(200);
    expect(panel.height).toBeGreaterThan(120);
    expect(preview.y + preview.height).toBeLessThanOrEqual(panel.y + 4);
    const small = await page.evaluate(() => [...document.querySelectorAll('#app button, #app [role="tab"], #app [role="radio"], #app input[type="radio"], #app input[type="checkbox"]')]
      .filter((e) => e.offsetParent !== null && !e.closest('.uxr-page'))
      .map((e) => { const box = (e.matches('input') ? e.closest('label') ?? e : e).getBoundingClientRect(); return { name: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 20), w: Math.round(box.width), h: Math.round(box.height) }; })
      .filter((e) => e.w > 0 && Math.min(e.w, e.h) < 43));
    expect(small, `44px未満の操作部: ${JSON.stringify(small)}`).toEqual([]);
    await page.locator('#slot-preview .uxr-hero').first().tap();
    await expect(page.getByLabel('キャッチコピー', { exact: true })).toBeVisible();
  });
});

test.describe('キーボードとアクセシビリティ', () => {
  test('Ctrl+Z／Shift+Ctrl+Z・Esc でダイアログが閉じ、フォーカスが戻る', async ({ page }) => {
    await startEditor(page);
    const id = (await getState(page)).blocks[0].id;
    await page.evaluate((x) => window.__uxr.dispatch({ type: 'setProp', id: x, path: ['title'], value: '変えた' }), id);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ControlOrMeta+z');
    expect(await heroTitle(page)).not.toBe('変えた');
    await page.keyboard.press('Shift+ControlOrMeta+z');
    expect(await heroTitle(page)).toBe('変えた');
    const opener = page.getByRole('button', { name: '共有・書き出し' });
    await opener.click();
    await expect(page.locator('#dlg-share')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#dlg-share')).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('すべてのボタン・入力欄に名前がある。動きを減らす設定で、動いているアニメーションが残らない', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await startEditor(page);
    const unnamed = await page.evaluate(() => [...document.querySelectorAll('#app button, #app input, #app textarea, #app select')]
      .filter((e) => e.offsetParent !== null && !e.closest('.uxr-page'))
      .filter((e) => !(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.labels?.length || (e.textContent || '').trim() || e.getAttribute('title')))
      .map((e) => e.outerHTML.slice(0, 80)));
    expect(unnamed).toEqual([]);
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
  });
});
