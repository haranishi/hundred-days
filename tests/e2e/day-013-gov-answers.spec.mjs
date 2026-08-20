import { expect, test } from '@playwright/test';
import { GOVERNMENT, MIXED, envelope } from '../../apps/day-013-gov-answers/tests/fixtures/speech.mjs';

/* 上流（国会会議録API）には繋がない。件数だけ聞く1回目と本体を返す2回目を page.route で作る。
   本物は中身も件数も日々変わるので、そのままでは何も固定できない。 */
const API = '**/api/speech*';
const PAGE = '/day-013-gov-answers/';

const serve = async (page, records, { total = records.length, status = 200 } = {}) => {
  await page.route(API, (route) => {
    if (status !== 200) return route.fulfill({ status, body: 'error' });
    const asked = Number(new URL(route.request().url()).searchParams.get('maximumRecords'));
    const body = asked === 1 ? envelope([], total) : envelope(records, total);
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
};

const search = async (page, word = '特定外来生物', from = '2010', to = '2026') => {
  await page.fill('#q', word);
  await page.fill('#from', from);
  await page.fill('#to', to);
  await page.click('#go');
};

test('開いた直後は使い方の案内が出ていて、結果は隠れている', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('#status h2')).toHaveText('テーマを入れて「調べる」を押してください');
  await expect(page.locator('#results')).toBeHidden();
});

test('政府の答弁だけが残り、議員の質問と民間の参考人は落ちる', async ({ page }) => {
  await serve(page, MIXED);
  await page.goto(PAGE);
  await search(page);
  await expect(page.locator('#cards .card')).toHaveCount(GOVERNMENT.length);
  await expect(page.locator('#cards')).toContainText('環境大臣');
  // 役職欄が埋まっていても民間の参考人は政府ではない
  await expect(page.locator('#cards')).not.toContainText('ニッセイ基礎研究所');
  await expect(page.locator('#cards')).not.toContainText('日本自然保護協会');
  await expect(page.locator('#cards')).not.toContainText('田島一成');
});

test('答弁が無い年も棒が並び、空白期間が見える', async ({ page }) => {
  await serve(page, MIXED);
  await page.goto(PAGE);
  await search(page);
  // 2013〜2022 の10年ぶん。間の答弁ゼロの年も0として並ぶ
  await expect(page.locator('.bar')).toHaveCount(10);
  await expect(page.locator('.bar').first()).toHaveAttribute('aria-label', '2013年 2件');
});

test('副大臣も所管を引けて省庁別に数えられる', async ({ page }) => {
  await serve(page, MIXED);
  await page.goto(PAGE);
  await search(page);
  const env = page.locator('.ministry', { hasText: '環境省' });
  await expect(env.locator('.n')).toHaveText('3'); // 大臣・局長・副大臣
  await expect(page.locator('.ministry', { hasText: '農林水産省' }).locator('.n')).toHaveText('1');
});

test('省庁のバーは件数に比例して長さが変わる', async ({ page }) => {
  await serve(page, MIXED);
  await page.goto(PAGE);
  await search(page);
  await expect(page.locator('.ministry')).toHaveCount(2); // evaluateAllは自動待機しないので先に待つ
  const widths = await page.locator('.ministry .fill').evaluateAll(
    (els) => els.map((el) => el.getBoundingClientRect().width));
  expect(widths[0]).toBeGreaterThan(widths[1]); // 全部同じ長さだと情報がゼロになる
  expect(widths[1]).toBeGreaterThan(0);
});

test('年の棒を押すとその年だけに絞られ、もう一度押すと戻る', async ({ page }) => {
  await serve(page, MIXED);
  await page.goto(PAGE);
  await search(page);
  const y2013 = page.locator('.bar', { hasText: '2013' }).first();
  await y2013.click();
  await expect(y2013).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#cards .card')).toHaveCount(2);
  await expect(page.locator('#filter-note')).toHaveText('2013年で絞り込み中');
  await y2013.click();
  await expect(page.locator('#cards .card')).toHaveCount(GOVERNMENT.length);
  await expect(page.locator('#filter-note')).toHaveText('');
});

test('古い順と新しい順が入れ替わる', async ({ page }) => {
  await serve(page, MIXED);
  await page.goto(PAGE);
  await search(page);
  const dates = () => page.locator('#cards .card .meta').allTextContents();
  await page.click('#sort-old');
  const asc = await dates();
  await page.click('#sort-new');
  const desc = await dates();
  expect(asc[0]).toContain('2013-04-10');
  expect(desc[0]).toContain('2022-06-02');
  expect(desc.at(-1)).toBe(asc[0]);
});

test('各答弁に原文リンクと引用コピーがある', async ({ page }) => {
  await serve(page, MIXED);
  await page.goto(PAGE);
  await search(page);
  const first = page.locator('#cards .card').first();
  // 全文は持たず本家へ送る（発言の著作権は発言者にある）
  await expect(first.getByRole('link', { name: '原文を読む' }))
    .toHaveAttribute('href', /kokkai\.ndl\.go\.jp/);
  await expect(first.getByRole('button', { name: '引用をコピー' })).toBeVisible();
});

test('1件も無いときは言葉を変えるよう促す', async ({ page }) => {
  await serve(page, [], { total: 0 });
  await page.goto(PAGE);
  await search(page, 'ぬるぽがぽぬる');
  await expect(page.locator('#status h2')).toHaveText('見つかりませんでした');
  await expect(page.locator('#results')).toBeHidden();
});

test('件数が上限を超えるときは取得せず絞り込みを促す', async ({ page }) => {
  let calls = 0;
  await page.route(API, (route) => {
    calls += 1;
    route.fulfill({ status: 200, contentType: 'application/json',
                    body: JSON.stringify(envelope([], 780312)) });
  });
  await page.goto(PAGE);
  await search(page, '予算');
  await expect(page.locator('#status h2')).toHaveText('件数が多すぎます');
  expect(calls).toBe(1); // 件数を聞く1回だけ。本文は取りに行かない
});

test('政府の答弁が1件も無いときはそう言う', async ({ page }) => {
  await serve(page, MIXED.filter((r) => !r.speakerPosition));
  await page.goto(PAGE);
  await search(page);
  await expect(page.locator('#status h2')).toHaveText('政府の答弁はありませんでした');
});

test('通信に失敗したらエラーとして知らせる', async ({ page }) => {
  await serve(page, [], { status: 503 });
  await page.goto(PAGE);
  await search(page);
  await expect(page.locator('#status')).toHaveAttribute('data-kind', 'error');
  await expect(page.locator('#status h2')).toHaveText('読み込みに失敗しました');
});

test('開始年が終了年より後なら通信せずにその場で止める', async ({ page }) => {
  let calls = 0;
  await page.route(API, (route) => { calls += 1; route.fulfill({ status: 200, body: '{}' }); });
  await page.goto(PAGE);
  // 1947〜2026の外を入れるとブラウザ側の検証が先に止めるので、範囲内で前後を逆にする
  await search(page, '予算', '2020', '2015');
  await expect(page.locator('#status h2')).toHaveText('年の指定を確認してください');
  expect(calls).toBe(0);
});
