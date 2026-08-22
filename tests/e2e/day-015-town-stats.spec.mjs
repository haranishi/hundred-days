import { expect, test } from '@playwright/test';

/* データは同梱JSONなので上流モックは不要。エラー状態のテストだけ towns.json を止めて作る。
   価値判断語の不在チェックは炎上ガード（REQUIREMENTS.mdの禁止語）をE2Eで固定するもの。 */
const PAGE = '/day-015-town-stats/';

test('開いた直後は例の秋田市カードが動いていて、比較はまだ出ない', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('#status')).toContainText('例として秋田市を表示しています');
  await expect(page.locator('#card-main .card__title')).toHaveText('秋田市');
  await expect(page.locator('#compare')).toBeHidden();
  await expect(page).toHaveTitle('あなたの街のステータス');
});

test('検索から秋田市を選ぶとステータスカードが出る', async ({ page }) => {
  await page.goto(PAGE);
  await page.fill('#search-input', '秋田市');
  await page.locator('#search-results li', { hasText: '秋田市' }).first().click();
  const card = page.locator('#card-main');
  await expect(card).toBeVisible();
  await expect(card.locator('.card__title')).toHaveText('秋田市');
  await expect(card.locator('.card__vintage')).toContainText('2020年10月1日');
  // 順位は必ず方向つき文言（「多い方から◯位」）で出る。
  // 総人口の母数は1,740＝人口が「-」の双葉町は順位からも母数からも外れる設計
  await expect(card.locator('.stat__rank').first()).toContainText('多い方から');
  await expect(card.locator('.stat__rank').first()).toContainText('位 / 1,740');
  await expect(card.locator('.stat').nth(2).locator('.stat__rank')).toContainText('広い方から');
  await expect(card.locator('.stat').nth(2).locator('.stat__rank')).toContainText('位 / 1,741');
  await expect(page).toHaveTitle(/秋田市のステータス/);
});

test('よく見られる街のチップからも選べる', async ({ page }) => {
  await page.goto(PAGE);
  await page.locator('#quick-picks .chip', { hasText: '新宿区' }).click();
  await expect(page.locator('#card-main .card__title')).toHaveText('新宿区');
  await expect(page.locator('#status')).toBeHidden();
  await expect(page).toHaveURL(/c=13104/);
  // 一覧セレクトにも選択が映る
  await expect(page.locator('#pref-select')).toHaveValue('東京都');
  await expect(page.locator('#town-select')).toHaveValue('13104');
});

test('都道府県→市区町村の一覧からも選べる', async ({ page }) => {
  await page.goto(PAGE);
  await page.selectOption('#pref-select', '北海道');
  await expect(page.locator('#town-select')).toBeEnabled();
  await page.selectOption('#town-select', { label: '札幌市' });
  await expect(page.locator('#card-main .card__title')).toHaveText('札幌市');
});

test('見つからない検索と記号だけの入力は、0件の案内になる', async ({ page }) => {
  await page.goto(PAGE);
  await page.fill('#search-input', '存在しない市');
  await expect(page.locator('#search-results')).toContainText('見つかりません');
  await page.fill('#search-input', '!!??');
  await expect(page.locator('#search-results')).toContainText('見つかりません');
});

test('データが読めないときはエラーの説明と再読み込みボタンが出て、復帰できる', async ({ page }) => {
  await page.route('**/day-015-town-stats/data/towns.json', (route) => route.abort());
  await page.goto(PAGE);
  await expect(page.locator('#status')).toContainText('データを読み込めませんでした');
  await page.unroute('**/day-015-town-stats/data/towns.json');
  await page.locator('#reload-btn').click();
  await expect(page.locator('#status')).toContainText('例として秋田市を表示しています');
  await page.fill('#search-input', '仙台市');
  await page.locator('#search-results li', { hasText: '仙台市' }).first().click();
  await expect(page.locator('#card-main .card__title')).toHaveText('仙台市');
});

test('べつの街とくらべると2枚並び、やめると1枚に戻る', async ({ page }) => {
  await page.goto(`${PAGE}?c=05201`);
  await expect(page.locator('#card-main .card__title')).toHaveText('秋田市');
  await page.selectOption('#vs-pref', '神奈川県');
  await page.selectOption('#vs-town', { label: '横浜市' });
  await expect(page.locator('#card-vs')).toBeVisible();
  await expect(page.locator('#card-vs .card__title')).toHaveText('横浜市');
  await expect(page.locator('#cards')).toHaveClass(/has-vs/);
  await page.locator('#vs-clear').click();
  await expect(page.locator('#card-vs')).toBeHidden();
});

test('URLのc/vsから状態を復元でき、不正なコードは無視する', async ({ page }) => {
  await page.goto(`${PAGE}?c=05201&vs=13104`);
  await expect(page.locator('#card-main .card__title')).toHaveText('秋田市');
  await expect(page.locator('#card-vs .card__title')).toHaveText('新宿区');
  await page.goto(`${PAGE}?c=99999`);
  await expect(page.locator('#status')).toContainText('例として秋田市を表示しています');
});

test('順位ヒートマップの地図が出て、指標チップで凡例が切り替わる', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('#map-section')).toBeVisible();
  // 既定は平均年齢
  await expect(page.locator('#map-metrics .chip[data-metric="ageAvg"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#legend-caption')).toContainText('平均年齢が高い方');
  // 総人口へ切り替え
  await page.locator('#map-metrics .chip[data-metric="pop"]').click();
  await expect(page.locator('#map-metrics .chip[data-metric="pop"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#legend-caption')).toContainText('総人口が多い方');
  // 地図はキャンバスに実際に描かれている（真っ白ではない）
  const painted = await page.evaluate(() => {
    const canvas = document.getElementById('map');
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let filled = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) filled += 1;
    return filled;
  });
  expect(painted).toBeGreaterThan(1000);
});

test('地図の点を押すと、その街のカードが出る', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('#map-section')).toBeVisible();
  await page.locator('#map').scrollIntoViewIfNeeded();   // 画面外の座標はクリックできない
  const at = await page.evaluate(() => window.__day015Project('05201'));
  expect(at).not.toBeNull();
  await page.mouse.click(at[0], at[1]);
  await expect(page.locator('#card-main .card__title')).toHaveText('秋田市');
  await expect(page).toHaveURL(/c=05201/);
});

test('出典と非公式の断りが常設されている', async ({ page }) => {
  await page.goto(PAGE);
  const foot = page.locator('footer');
  await expect(foot).toContainText('令和2年国勢調査');
  await expect(foot).toContainText('国土地理院');
  await expect(foot).toContainText('加工して作成');
  await expect(foot).toContainText('国の公式サービスではありません');
});

test('価値判断語・煽り語を画面に出さない（規約・炎上ガードの固定）', async ({ page }) => {
  await page.goto(`${PAGE}?c=05201&vs=13104`);
  await expect(page.locator('#card-main')).toBeVisible();
  const text = await page.locator('body').innerText();
  for (const banned of ['ワースト', '住みやす', '住みにく', 'やばい', '偏差値', '総合スコア']) {
    expect(text).not.toContain(banned);
  }
});
