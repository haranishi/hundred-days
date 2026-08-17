import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* 上流のGTFS-RTには一切つながない。実データは深夜0台・日中25台前後と変動するので、
   同梱の固定データ（apps/day-009-akita-bus-3d/tests/fixtures/）を page.route で流し込む。 */
const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../../apps/day-009-akita-bus-3d/tests/fixtures/${name}`, import.meta.url), 'utf8'));

const RUNNING = fixture('vehicles-running.json');
const EMPTY = fixture('vehicles-empty.json');
const OFFHOURS = fixture('vehicles-offhours.json');
const API = '**/api/day-009/vehicles';
const PAGE = '/day-009-akita-bus-3d/';

/* 走行中に数えるかどうかは時刻表で決まる（運行時間外に届いた位置は数えない）ので、
   時計を止めずに開くと、テストを走らせた時刻しだいで台数が変わる。必ず時刻を固定して開く。
   日曜17:01＝両事業者とも運行中で、vehicles-running.json の送信時刻とも揃えてある。 */
const SERVICE_HOURS = new Date('2026-08-16T17:01:20+09:00');

const serveVehicles = (page, payload, status = 200) =>
  page.route(API, (route) =>
    route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) }));

const openAt = async (page, when, payload, status = 200) => {
  await page.clock.setFixedTime(when);
  await serveVehicles(page, payload, status);
  await page.goto(PAGE);
};

// キャンバスの中身を色で数える。バス＝アンバー、路線＝青みのある線
const countPixels = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('#scene');
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let bus = 0;
    let route = 0;
    for (let index = 0; index < data.length; index += 4) {
      const [red, green, blue] = [data[index], data[index + 1], data[index + 2]];
      if (red > 170 && green > 100 && green < 215 && blue < 120) bus += 1;
      else if (blue >= 70 && blue - red >= 25) route += 1;
    }
    return { bus, route };
  });

test.describe('Day 009 akita bus 3d', () => {
  test('Given running vehicles, when the map loads, then buses are drawn and counted', async ({ page }) => {
    await openAt(page, SERVICE_HOURS, RUNNING);

    await expect(page.locator('#running-count')).toHaveText('25');
    await expect(page.locator('#status-title')).toHaveText('25台が走行中です');
    await expect(page.locator('#status-body')).toContainText('秋田中央交通 18台');
    await expect(page.locator('.bus-item')).toHaveCount(25);
    await expect(page.locator('#bus-empty')).toBeHidden();
    await expect(page.locator('#bus-count')).toHaveText('25台');
    // 運行時間内なので1台も除外しない。除外の注記は両方とも出さない
    await expect(page.locator('#stale-note')).toBeHidden();
    await expect(page.locator('#offhours-note')).toBeHidden();

    const pixels = await countPixels(page);
    expect(pixels.bus).toBeGreaterThan(200);
    expect(pixels.route).toBeGreaterThan(2000);

    // 「正直に見せること」と帰属は常時見えている
    await expect(page.locator('footer')).toContainText('18事業者のうち');
    await expect(page.locator('footer')).toContainText('2事業者だけ');
    await expect(page.locator('footer')).toContainText('秋田県バス協会 公共交通オープンデータ');
    await expect(page.locator('#network-summary')).toContainText('路線 618本');
    await expect(page.locator('#freshness')).toContainText('最終更新');
  });

  test('Given a drawn bus, when it is selected from the list, then its details appear', async ({ page }) => {
    await openAt(page, SERVICE_HOURS, RUNNING);

    const first = page.locator('.bus-item').first();
    await expect(first).toContainText('秋田中央交通');
    await first.click();

    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#bus-detail')).toBeVisible();
    await expect(page.locator('#detail-operator')).toHaveText('秋田中央交通');
    await expect(page.locator('#detail-id')).not.toHaveText('—');
    await expect(page.locator('#detail-speed')).toContainText('km/h');
    await expect(page.locator('#detail-age')).toContainText('前');
    // 詳細は一覧の下に積まず、状態カードと差し替える（右レールの高さを変えないため）
    await expect(page.locator('#status-panel')).toBeHidden();

    await page.locator('#detail-close').click();
    await expect(page.locator('#bus-detail')).toBeHidden();
    await expect(page.locator('#status-panel')).toBeVisible();
  });

  test('Given a wide screen, when a bus is selected, then the right rail keeps its height and card spacing', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openAt(page, SERVICE_HOURS, RUNNING);
    // 一覧が出そろう前に測ると、レールの高さが地図側の最低高さのままになる
    await expect(page.locator('.bus-item')).toHaveCount(25);

    // カードの下端から次のカードの上端までの間隔。8pxの等間隔から外れていないか
    const railMetrics = () =>
      page.evaluate(() => {
        const panel = document.querySelector('.panel').getBoundingClientRect();
        const top = document.querySelector('.rail-top').getBoundingClientRect();
        const next = document.querySelector('.bus-panel').getBoundingClientRect();
        const card = document.querySelector('.rail-top > *:not([hidden])').getBoundingClientRect();
        return { height: panel.height, gap: next.top - top.bottom, slack: top.height - card.height };
      });

    const running = await railMetrics();
    expect(Math.abs(running.gap - 8)).toBeLessThan(1);
    // 見えているカードが枠を埋めていないと、その差がそのままカード間の余白になる
    expect(running.slack).toBeLessThan(1);

    await page.locator('.bus-item').first().click();
    const selected = await railMetrics();
    expect(Math.abs(selected.height - running.height)).toBeLessThan(1);
    expect(Math.abs(selected.gap - 8)).toBeLessThan(1);
    expect(selected.slack).toBeLessThan(1);
  });

  test('Given any screen, when tap targets are measured, then buttons share one minimum height', async ({ page }) => {
    await openAt(page, SERVICE_HOURS, RUNNING);
    // 「すべて見る」は台数が届いてから出る。待たずに測ると、応答が少し遅いサーバーでは
    // 3個しか数えられずに落ちる（静的サーバーが速いので手元では見えなかった）
    await expect(page.locator('#bus-list-toggle')).toBeVisible();

    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const heights = await page
        .locator('.ghost-button, .link-button')
        .evaluateAll((nodes) => nodes.filter((node) => node.offsetParent !== null)
          .map((node) => Math.round(node.getBoundingClientRect().height)));
      expect(heights.length).toBeGreaterThan(3);
      for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
    }
  });

  test('Given more buses than fit, when the list is shown, then it is cut on whole rows and can be expanded', async ({ page }) => {
    await openAt(page, SERVICE_HOURS, RUNNING);

    // 4行ぶんちょうどで切る。行の途中で文字が切れると故障に見える
    await expect(page.locator('#bus-list-note')).toHaveText('25台中 4台を表示');
    const rows = await page.locator('.bus-item').first().evaluate((node) => node.getBoundingClientRect().height);
    const list = await page.locator('#bus-list').evaluate((node) => node.getBoundingClientRect().height);
    expect(Math.abs(list - (rows * 4 + 6 * 3))).toBeLessThan(1);

    const stageHeight = () => page.locator('.stage').evaluate((node) => node.getBoundingClientRect().height);
    const collapsed = await stageHeight();

    await page.getByRole('button', { name: 'すべて見る' }).click();
    await expect(page.locator('#bus-list')).toHaveAttribute('data-expanded', 'true');
    await expect(page.locator('#bus-list-note')).toContainText('25台すべて');

    // 開いて閉じたら元の高さに戻る。キャンバスを流れの中に置くと、伸びた地図が縮まなくなる
    await page.getByRole('button', { name: '4台だけ表示' }).click();
    await expect(page.locator('#bus-list')).toHaveAttribute('data-expanded', 'false');
    await expect.poll(async () => Math.abs((await stageHeight()) - collapsed) < 1).toBe(true);
  });

  test('Given the quietest label, when its contrast is measured, then it still clears AA', async ({ page }) => {
    await openAt(page, SERVICE_HOURS, RUNNING);

    // 「停車中」は一覧でいちばん薄い文字。半透明のままだと背景と混ざって4.5:1を割る
    const ratio = await page.locator('.bus-item__speed--idle').first().evaluate((node) => {
      const parse = (value) => value.match(/[\d.]+/g).slice(0, 3).map(Number);
      const channel = (value) => {
        const scaled = value / 255;
        return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (rgb) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
      const text = luminance(parse(getComputedStyle(node).color));
      const behind = luminance(parse(getComputedStyle(node.closest('.bus-item')).backgroundColor));
      return (Math.max(text, behind) + 0.05) / (Math.min(text, behind) + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('Given the map, when it is drawn, then place names and a scale bar orient the viewer', async ({ page }) => {
    await openAt(page, SERVICE_HOURS, RUNNING);

    // 県境は形状データを持っていないので描かない。代わりに地名とスケールで場所を示す
    await expect(page.getByRole('button', { name: '秋田市周辺にズーム' })).toBeVisible();
    await expect(page.getByRole('button', { name: '県全体に戻す' })).toBeVisible();
    // 画面でいちばん目立つ車体を先頭に、線3種と「密集○台」のバッジ・破線の円まで凡例に載せる
    await expect(page.locator('.legend li')).toHaveCount(6);
    await expect(page.locator('.legend li').first()).toContainText('オレンジの立体');
    await expect(page.locator('.map-key')).toContainText('密集');
    // マウスが主の画面（primary pointer = fine）でだけホイールを案内する
    await expect(page.locator('.map-key__hint')).toHaveText('ドラッグで回転・ホイールで拡大。バスを選ぶと詳細が出ます。');
  });

  test('Given a touch device, when the map key is read, then it never promises a mouse wheel', async ({ browser, baseURL }) => {
    // スマホにマウスホイールは無い。実装済みの操作（1本指=回転／2本指=ピンチ）だけを案内する
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await context.newPage();
    await openAt(page, SERVICE_HOURS, RUNNING);

    await expect(page.locator('.map-key__hint')).toHaveText('指1本で回転・2本でピンチ拡大。バスを選ぶと詳細が出ます。');
    await expect(page.locator('.map-key__hint')).not.toContainText('ホイール');
    await context.close();
  });

  test('Given no running vehicles at night, when the map loads, then the network stays visible', async ({ page }) => {
    // 日曜の深夜2時に固定。時刻表上も運行時間外なので「次に動き出す時刻」を出す
    await openAt(page, new Date('2026-08-16T02:30:00+09:00'), EMPTY);

    await expect(page.locator('#status-title')).toHaveText('いま走っているバスはいません');
    await expect(page.locator('#status-body')).toContainText('障害ではありません');
    await expect(page.locator('#status-service')).toContainText('時刻表上も運行時間外');
    await expect(page.locator('#status-service')).toContainText('次に動き出すのは');
    await expect(page.locator('#running-count')).toHaveText('0');
    await expect(page.locator('#bus-empty')).toBeVisible();
    await expect(page.locator('.bus-item')).toHaveCount(0);
    // 0台でもバッジは消さない（数字が消えると読み込み中に見える）
    await expect(page.locator('#bus-count')).toHaveText('0台');
    // 古い位置を捨てた台数も出す。届いた車両は0台なので、運行時間外による除外はまだ無い
    await expect(page.locator('#stale-note')).toHaveText('位置が10分以上古いバス1台は数に入れていません');
    await expect(page.locator('#offhours-note')).toBeHidden();
    // 次の始発を主役のカードに格上げして、待つ画面として成立させる
    // 日曜の2:30なので、同じ日の日祝ダイヤ初便（6:15）が次の始発になる
    await expect(page.locator('#next-service')).toBeVisible();
    await expect(page.locator('#next-service-time')).toHaveText('6:15');

    const pixels = await countPixels(page);
    expect(pixels.bus).toBe(0);
    expect(pixels.route).toBeGreaterThan(2000);
  });

  test('Given a vehicle still reporting after the last bus, when the map loads, then it is not counted', async ({ page }) => {
    /* 2026-08-17未明の本番データ。秋田市の終バスは20:02なのに、車両1007が座標を1mmも変えないまま
       送信時刻だけ3秒前に書き換えて送り続けている。中継APIの「10分以上古い位置」では止まらない */
    await openAt(page, new Date('2026-08-17T00:44:34+09:00'), OFFHOURS);

    await expect(page.locator('#running-count')).toHaveText('0');
    await expect(page.locator('.bus-item')).toHaveCount(0);
    await expect(page.locator('#bus-empty')).toBeVisible();

    // 0台の画面は3段そのまま出る（0台 → 障害ではない → 次の始発）
    await expect(page.locator('#status-title')).toHaveText('いま走っているバスはいません');
    await expect(page.locator('#status-body')).toContainText('障害ではありません');
    await expect(page.locator('#status-service')).toContainText('時刻表上も運行時間外');
    await expect(page.locator('#next-service')).toBeVisible();
    await expect(page.locator('#next-service-time')).toHaveText('5:40');

    // 除外は理由ごとに行を分ける。どちらの理由で何台落としたのかが読み取れること
    await expect(page.locator('#offhours-note')).toHaveText('運行時間外に位置を送り続けている車両1台は数に入れていません');
    await expect(page.locator('#stale-note')).toHaveText('位置が10分以上古いバス1台は数に入れていません');

    // 数から外した車両は地図にも描かない（0台と書きながら絵にバスが残ると食い違う）
    const pixels = await countPixels(page);
    expect(pixels.bus).toBe(0);
    expect(pixels.route).toBeGreaterThan(2000);
  });

  test('Given no vehicles during service hours, when the map loads, then it says the feed is silent', async ({ page }) => {
    // 平日の昼12時半に固定。時刻表上は走っているはずなので、0台は事業者側の異常
    await openAt(page, new Date('2026-08-17T12:30:00+09:00'), EMPTY);

    await expect(page.locator('#status-service')).toContainText('時刻表上');
    await expect(page.locator('#status-service')).toContainText('位置を送信している車両がありません');
    await expect(page.locator('#status-service')).not.toContainText('運行時間外');
    // 運行時間内の0台は「待てば来る」話ではないので、始発カードは出さない
    await expect(page.locator('#next-service')).toBeHidden();
  });

  test('Given the relay fails, when the map loads, then an error and a retry countdown appear', async ({ page }) => {
    const failure = { error: '2事業者のどちらからも位置を取得できませんでした', vehicles: [], sources: [] };
    await openAt(page, SERVICE_HOURS, failure, 500);

    await expect(page.locator('#status-panel')).toHaveAttribute('data-state', 'error');
    await expect(page.locator('#status-title')).toHaveText('バスの位置を取得できませんでした');
    await expect(page.locator('#retry-note')).toContainText('次の再試行まで');
    await expect(page.getByRole('button', { name: 'いますぐ再試行' })).toBeVisible();
    await expect(page.locator('#running-count')).toHaveText('—');

    // 取得に失敗しても路線網は消さない
    const pixels = await countPixels(page);
    expect(pixels.route).toBeGreaterThan(2000);
  });

  test('Given one operator fails, when the map loads, then the other operator is still shown', async ({ page }) => {
    await openAt(page, SERVICE_HOURS, {
      ...RUNNING,
      vehicles: RUNNING.vehicles.filter((vehicle) => vehicle.op === 'chuo'),
      sources: [
        { op: 'chuo', ok: true, error: null, feedTs: 1786867260, staleDropped: 0, count: 18 },
        { op: 'akitacity', ok: false, error: 'HTTP 500', feedTs: null, staleDropped: 0, count: 0 },
      ],
    });

    await expect(page.locator('#status-panel')).toHaveAttribute('data-state', 'partial');
    await expect(page.locator('#status-title')).toHaveText('一部の事業者の位置を取得できていません');
    await expect(page.locator('#status-body')).toContainText('秋田市');
    await expect(page.locator('#running-count')).toHaveText('18');
    await expect(page.locator('.bus-item')).toHaveCount(18);
  });

  test('Given the keyboard alone, when arrow keys are pressed, then the camera turns', async ({ page }) => {
    await openAt(page, SERVICE_HOURS, RUNNING);

    // 自動回転を止めてから測る（勝手に回っていると変化量が読めない）
    await page.getByRole('button', { name: '自動回転' }).click();
    const scene = page.locator('#scene');
    await scene.focus();
    const before = await page.evaluate(() => ({ ...window.__day009.stats }));

    await scene.press('ArrowRight');
    await scene.press('ArrowUp');
    await scene.press('+');
    await expect
      .poll(async () => {
        const after = await page.evaluate(() => ({ ...window.__day009.stats }));
        return after.yaw !== before.yaw && after.pitch !== before.pitch && after.distance < before.distance;
      })
      .toBe(true);

    // Rキーで初期アングルに戻る（自動回転で進んだぶんがあるので1度の幅で見る）
    await scene.press('r');
    await expect
      .poll(async () => {
        const yaw = await page.evaluate(() => window.__day009.stats.yaw);
        return Math.abs(yaw - before.yaw) < 1;
      })
      .toBe(true);
  });
});

test('Given the portfolio, when Day 009 assets are inspected, then the app and its data are published', async ({ page, request }) => {
  await page.goto('/');
  const card = page.locator('.card[data-title="秋田バスライブ"]');
  await expect(card).toBeVisible();
  await expect(card.getByRole('link', { name: 'アプリを開く' })).toHaveAttribute('href', './day-009-akita-bus-3d/');

  const data = await request.get('/day-009-akita-bus-3d/data/network.json');
  expect(data.ok()).toBe(true);
  const network = await data.json();
  expect(network.license).toBe('CC BY 4.0');
  expect(network.lines.length).toBeGreaterThan(100);
  expect(network.operators.filter((operator) => operator.live).length).toBe(2);
});
