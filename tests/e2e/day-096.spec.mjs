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
/** 動き（アニメーション・遷移）が終わって、レイアウトが落ち着くまで待つ。寸法を測る前に使う（負荷が高いと途中の値を測って偶発的に落ちる）。 */
async function settle(page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 8000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
const outlineRows = (page) => page.locator('#slot-outline li.ed-row');
/** 構成の行の操作（上へ移動・複製など）は、ホバー・フォーカス・選択のある行にだけ見える。行へ寄せてから押す。 */
/** 行の操作（▲▼・複製・削除）は、選択中の行にだけ出る。先に選んでから押す。 */
async function rowAction(row, name) {
  const selected = await row.evaluate((el) => el.classList.contains('is-selected'));
  if (!selected) await row.locator('.ed-pick').click();
  const button = row.getByRole('button', { name, exact: true });
  await expect(button).toBeVisible();
  await button.click();
}
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
    await rowAction(rows.nth(1), '下へ移動');
    const afterDown = await types(page);
    expect(afterDown[1]).toBe(first[2]);
    expect(afterDown[2]).toBe(first[1]);
    await rowAction(rows.nth(2), '上へ移動');
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
    await rowAction(rows.first(), '複製');
    expect((await types(page)).length).toBe(n + 2);
    await rowAction(rows.first(), '削除');
    expect((await types(page)).length).toBe(n + 1);
    await page.locator('#toasts').getByRole('button', { name: '元に戻す' }).click();
    expect((await types(page)).length).toBe(n + 2);
  });

  test('複製した直後の複製の行を、そのまま削除できる（押している間に行が動かない・マウスを動かしても跳ねない）', async ({ page }) => {
    await startEditor(page);
    const rows = outlineRows(page);
    const n = (await types(page)).length;
    await rowAction(rows.nth(4), '複製');
    expect((await types(page)).length).toBe(n + 1);
    // 複製の行（選択中）の削除を、先にホバーせず、普通のクリックで押す。
    const selectedRow = page.locator('#slot-outline li.ed-row.is-selected');
    await expect(selectedRow).toHaveCount(1);
    await selectedRow.getByRole('button', { name: '削除', exact: true }).click();
    expect((await types(page)).length).toBe(n);
    // 行の位置が、マウスを動かしただけでは変わらない（ホバー・フォーカスで高さを変えない）。
    const tops = () => rows.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    const before = await tops();
    for (const i of [0, 3, 6, 2]) await rows.nth(i).hover();
    await rows.nth(1).locator('.ed-pick').focus();
    expect(await tops()).toEqual(before);
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

  test('診断: 期限・残り枠の確認の印は、アプリが勝手に付けない。「この部品を見る」から本人が付ける', async ({ page }) => {
    await startEditor(page, '参加してもらう');
    await tab(page, '診断');
    const card = page.locator('article.cs-rule').filter({ hasText: '期限や人数の表示すべてに確認の印がある' });
    await expect(card.getByRole('button', { name: 'なおす' })).toHaveCount(0);
    await card.getByRole('button', { name: 'この部品を見る' }).click();
    const real = page.getByRole('checkbox', { name: '本当の数字です' });
    await expect(real).toBeFocused();
    const limitedReal = async () => (await getState(page)).blocks.find((b) => b.type === 'limited').props.real;
    expect(await limitedReal()).toBe(false);
    await page.keyboard.press('Space');
    expect(await limitedReal()).toBe(true);
    const item = await page.evaluate(() => window.__uxr.diagnose().items.find((i) => i.id === 'honest-limited'));
    expect(item.ok).toBe(true);
  });

  test('診断: 見出しが空だと「先頭に用件を伝える見出し」が✗になる。部品が0個なら0点で案内が出る', async ({ page }) => {
    await startEditor(page);
    const heroId = (await getState(page)).blocks.find((b) => b.type === 'hero').id;
    await page.evaluate((id) => window.__uxr.dispatch({ type: 'setProp', id, path: ['title'], value: '' }), heroId);
    const first = await page.evaluate(() => window.__uxr.diagnose().items.find((i) => i.id === 'hero-first'));
    expect(first.ok).toBe(false);
    for (const id of (await getState(page)).blocks.map((b) => b.id)) {
      await page.evaluate((x) => window.__uxr.dispatch({ type: 'removeBlock', id: x }), id);
    }
    await tab(page, '診断');
    await expect(page.locator('#panel-diagnosis')).toContainText('部品がありません');
    expect(await page.evaluate(() => window.__uxr.diagnose().score)).toBe(0);
  });

  test('見た目: サイトの名前を変えると、文章に残る見本の店名をまとめて置き換えられる（1回の元に戻す）', async ({ page }) => {
    await startEditor(page);
    const sampleName = (await getState(page)).site.name;
    const uses = async () => JSON.stringify((await getState(page)).blocks).split(sampleName).length - 1;
    expect(await uses()).toBeGreaterThan(0);
    await tab(page, '見た目');
    await page.getByLabel('サイトの名前').fill('テスト食堂');
    await expect(page.locator('#panel-look')).toContainText(sampleName);
    await page.locator('#panel-look').getByRole('button', { name: /置き換える/ }).click();
    expect(await uses()).toBe(0);
    await page.locator('#slot-topbar').getByRole('button', { name: '元に戻す' }).click();
    expect(await uses()).toBeGreaterThan(0);
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

  test('画像（PNG）の書き出し: 2倍の大きさで、ページの全面が描かれる（WebKitは viewBox で拡大すると左上にしか描かれない）', async ({ page }) => {
    await startEditor(page, '買ってもらう');
    await page.getByRole('button', { name: '共有・書き出し' }).click();
    await page.locator('#dlg-share').getByRole('tab', { name: '書き出し' }).click();
    const png = page.getByRole('button', { name: /画像で保存/ });
    await png.first().waitFor({ timeout: 5000 }).catch(() => {}); // 書き出せるかの判定は非同期
    test.skip(!(await png.count()), 'この環境では画像の書き出しが出ない（出さない判定）');
    const [download] = await Promise.all([page.waitForEvent('download'), png.first().click()]);
    const base64 = readFileSync(await download.path()).toString('base64');
    const m = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const bg = [d[0], d[1], d[2]];
      let first = -1; let last = -1; let rightHalf = 0;
      for (let y = 0; y < c.height; y += 2) {
        let hit = false;
        for (let x = 0; x < c.width; x += 4) {
          const i = (y * c.width + x) * 4;
          if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 30) { hit = true; if (x > c.width / 2) rightHalf += 1; }
        }
        if (hit) { if (first < 0) first = y; last = y; }
      }
      return { w: img.width, h: img.height, first, last, rightHalf };
    }, base64);
    expect(m.w).toBe(780);
    expect(m.first, '上端から描かれる').toBeLessThan(120);
    expect(m.last, '下端まで描かれる').toBeGreaterThan(m.h * 0.97);
    expect(m.rightHalf, '右半分にも描かれる').toBeGreaterThan(50);
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

  test('保存: 保存した枠を消しても、通知の「元に戻す」で戻せる', async ({ page }) => {
    await startEditor(page);
    await page.getByRole('button', { name: '保存・開く' }).click();
    const dialog = page.locator('#dlg-slots');
    await dialog.getByRole('textbox').fill('消す確認');
    await dialog.getByRole('button', { name: '保存する' }).click();
    const rows = dialog.locator('li.cs-slot-row');
    await expect(rows).toHaveCount(1);
    await rows.first().getByRole('button', { name: '消す' }).click();
    await expect(rows).toHaveCount(0); // 通知の文にも名前が出るので、一覧の行で数える
    await page.locator('#toasts').getByRole('button', { name: '元に戻す' }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('消す確認');
  });
});

test.describe('操作性（スマホ・キーボード・動きを減らす）', () => {
  test.use(phone);

  test('スマホ幅: 横にはみ出さず、パネルを畳んだ状態でプレビューが大きく見え、タブで開くと編集できる。押せる所が44px以上', async ({ page }) => {
    await startEditor(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const collapsed = await page.locator('#slot-preview').boundingBox();
    expect(collapsed.height, '畳んだ状態のプレビューの高さ').toBeGreaterThan(600);
    await tab(page, '編集');
    await expect.poll(async () => (await page.locator('#slot-panel').boundingBox()).height, { message: '開く動きが始まるまで待つ' }).toBeGreaterThan(100);
    await settle(page);
    const preview = await page.locator('#slot-preview').boundingBox();
    const panel = await page.locator('#slot-panel').boundingBox();
    expect(panel.height, '開いたパネルの高さ').toBeGreaterThan(220);
    expect(preview.height, 'パネルを開いてもプレビューが見える').toBeGreaterThan(200);
    expect(preview.y + preview.height).toBeLessThanOrEqual(panel.y + 12); // パネルの角丸の分だけ重なってよい
    const small = await page.evaluate(() => [...document.querySelectorAll('#app button, #app [role="tab"], #app [role="radio"], #app input[type="radio"], #app input[type="checkbox"]')]
      .filter((e) => e.offsetParent !== null && !e.closest('.uxr-page'))
      .map((e) => { const box = (e.matches('input') ? e.closest('label') ?? e : e).getBoundingClientRect(); return { name: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 20), w: Math.round(box.width), h: Math.round(box.height) }; })
      .filter((e) => e.w > 0 && Math.min(e.w, e.h) < 43));
    expect(small, `44px未満の操作部: ${JSON.stringify(small)}`).toEqual([]);
    await tab(page, '編集'); // 開いているタブをもう一度押すと畳む
    await settle(page);
    await expect.poll(async () => (await page.locator('#slot-preview').boundingBox()).height).toBeGreaterThan(600);
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
