import { expect, test } from '@playwright/test';

/* 上流（speed.cloudflare.com）には繋がない。実回線の速度は日によって何倍も振れるので、
   本物を使うと「何Mbpsだったか」を固定できず、テストが天気になる。
   応答を返す速さだけをこちらで決めて、画面の出し分けと診断の表示を見る。
   速度の計算と診断の分岐そのものは apps/day-016-line-suspect/tests/ のユニットテスト側。 */

const PAGE = '/day-016-line-suspect/';

/**
 * @param slowDownMs 下り本体の応答を遅らせる量。大きいほど「下りが遅い回線」になる。
 *                   往復時間の測定（bytes=0）は遅らせない＝遅延の測定を汚さない。
 */
const serve = async (page, { slowDownMs = 0, fail = false } = {}) => {
  await page.route('**/speed.cloudflare.com/**', async (route) => {
    if (fail) return route.abort('failed');
    const url = new URL(route.request().url());
    if (url.pathname === '/__up') {
      return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
    }
    const bytes = Number(url.searchParams.get('bytes') ?? 0);
    if (bytes > 0 && slowDownMs) await new Promise((done) => setTimeout(done, slowDownMs));
    return route.fulfill({
      status: 200,
      body: Buffer.alloc(bytes),
      headers: {
        'access-control-allow-origin': '*',
        // 本物が返しているとおりに公開しないと、別オリジンのJSからは読めない（実際にここで詰まった）
        'access-control-expose-headers': 'cf-meta-ip',
        'cf-meta-ip': '2400:4053:0:0:0:0:0:1'
      }
    });
  });
};

const open = async (page, options) => {
  await serve(page, options);
  await page.goto(PAGE);
  await expect(page.locator('#state-empty')).toBeVisible();
};

const measure = async (page) => {
  await page.click('#start');
  await expect(page.locator('#result')).toBeVisible({ timeout: 25_000 });
};

test('開いた直後は説明と通信量の告知が出ていて、結果はまだ無い', async ({ page }) => {
  await open(page);
  await expect(page.locator('#cost-amount')).toHaveText('最大50MB');
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#history')).toBeHidden();
});

test('節約モードにすると、使う通信量の表示が変わる', async ({ page }) => {
  await open(page);
  await page.check('#eco');
  await expect(page.locator('#cost-amount')).toHaveText('最大6MB');
  await page.uncheck('#eco');
  await expect(page.locator('#cost-amount')).toHaveText('最大50MB');
});

test('測定中は今どの段階かが出て、終わると結果に切り替わる', async ({ page }) => {
  await open(page, { slowDownMs: 300 });
  await page.click('#start');
  await expect(page.locator('#state-running')).toBeVisible();
  await expect(page.locator('#phase')).not.toHaveText('');
  await expect(page.locator('#result')).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('#state-empty')).toBeVisible();
});

test('結果には診断と数値の両方が出て、診断のほうが先に来る', async ({ page }) => {
  await open(page);
  await measure(page);
  await expect(page.locator('#verdict li')).not.toHaveCount(0);
  await expect(page.locator('#dl')).not.toHaveText('—');
  await expect(page.locator('#ul')).not.toHaveText('—');
  await expect(page.locator('#li')).not.toHaveText('—');
  // 診断のかたまりが数値のかたまりより上にあること
  const verdictBox = await page.locator('#verdict').boundingBox();
  const numberBox = await page.locator('.numbers').boundingBox();
  expect(verdictBox.y).toBeLessThan(numberBox.y);
});

test('1回めは「1回では判断できません」と出す（時間帯の判定はしない）', async ({ page }) => {
  await open(page);
  await measure(page);
  await expect(page.locator('#verdict li[data-id="DX-7"]')).toBeVisible();
  for (const id of ['DX-4', 'DX-5', 'DX-6']) {
    await expect(page.locator(`#verdict li[data-id="${id}"]`)).toHaveCount(0);
  }
});

test('下りだけが遅ければ「宅内の機器は原因になれない」と言い切る', async ({ page }) => {
  // 下りの本体だけを1.2秒遅らせる＝上りは速いまま。上り≫下りの回線を作る
  await open(page, { slowDownMs: 1200 });
  await measure(page);
  const dx1 = page.locator('#verdict li[data-id="DX-1"]');
  await expect(dx1).toBeVisible();
  await expect(dx1).toContainText('宅内の機器より外側');
  // いちばん重い指摘が先頭に出る
  await expect(page.locator('#verdict li').first()).toHaveAttribute('data-id', 'DX-1');
});

test('IPv6で繋がっていればそう出る（アドレスそのものは画面に出さない）', async ({ page }) => {
  await open(page);
  await measure(page);
  await expect(page.locator('#conn')).toHaveText('IPv6で接続しています。');
  await expect(page.locator('body')).not.toContainText('2400:4053');
});

test('通信が失敗したら、途中の数字を出さずにエラーにする', async ({ page }) => {
  await open(page, { fail: true });
  await page.click('#start');
  await expect(page.locator('#state-error')).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('#error-reason')).toContainText('通信に失敗');
  await expect(page.locator('#result')).toBeHidden();
});

test('測ると履歴が貯まり、3時間ごとの表に出る', async ({ page }) => {
  await open(page);
  await measure(page);
  await expect(page.locator('#history')).toBeVisible();
  await expect(page.locator('#history-body tr')).toHaveCount(1);
  await expect(page.locator('#history-count')).toContainText('1 回ぶん');
});

test('採点した結果がそのまま履歴に残る（画面だけ採点して保存し忘れない）', async ({ page }) => {
  await open(page);
  await measure(page);
  const shown = (await page.locator('#grade').textContent()).trim();
  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('day016.history.v1')).items.at(-1));
  expect(shown).not.toBe('—');
  expect(stored.grade, '履歴のグレードが画面と食い違っている').toBe(shown);
  expect(stored.dl).toBeGreaterThan(0);
  // 保存するのは決めた項目だけ。IPや地名が紛れ込んでいないこと
  expect(Object.keys(stored).sort()).toEqual(['dl', 'eco', 'grade', 'jit', 'ld', 'li', 'lu', 't', 'ul', 'v6']);
});

test('履歴の全消しは2回押させる', async ({ page }) => {
  await open(page);
  await measure(page);
  await page.click('#history-clear');
  await expect(page.locator('#history-clear')).toHaveText('もう一度押すと消えます');
  await expect(page.locator('#history-body tr')).toHaveCount(1); // 1回目では消えない
  await page.click('#history-clear');
  await expect(page.locator('#history-body tr')).toHaveCount(0);
  await expect(page.locator('#history-clear')).toHaveText('履歴を全部消す');
});

test('保存された履歴が壊れていたら、黙って捨てずに知らせる', async ({ page }) => {
  await serve(page);
  await page.goto(PAGE);
  await page.evaluate(() => window.localStorage.setItem('day016.history.v1', '{こわれている'));
  await page.reload();
  await expect(page.locator('#history-broken')).toBeVisible();
  await page.click('#history-reset');
  await expect(page.locator('#history-broken')).toBeHidden();
});

test('知らない版番号の履歴も、読み替えずに知らせる', async ({ page }) => {
  await serve(page);
  await page.goto(PAGE);
  await page.evaluate(() => {
    window.localStorage.setItem('day016.history.v1', JSON.stringify({ v: 99, items: [{ t: 1, dl: 1 }] }));
  });
  await page.reload();
  await expect(page.locator('#history-broken')).toBeVisible();
});

test('オフラインなら測定ボタンを押させない', async ({ page, context }) => {
  await open(page);
  await context.setOffline(true);
  await expect(page.locator('#offline')).toBeVisible();
  await expect(page.locator('#start')).toBeDisabled();
  await context.setOffline(false);
  await expect(page.locator('#start')).toBeEnabled();
});

test('測定結果はこの端末にしか残らないと明記されている', async ({ page }) => {
  await open(page);
  await expect(page.locator('.site-foot')).toContainText('どこにも送信されません');
  await expect(page.locator('.site-foot')).toContainText('電波強度');
});
