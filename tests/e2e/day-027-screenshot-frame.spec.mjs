import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const APP = '/day-027-screenshot-frame/';
const consoleErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  consoleErrors.set(page, errors);
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(consoleErrors.get(page), 'コンソールエラーが発生した').toEqual([]);
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, body])));
  return Buffer.concat([length, name, body, checksum]);
}

function png(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = width * 4 + 1;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    pixels[y * stride] = 0;
    pixels.fill(y % 2 ? 0x6c : 0xd7, y * stride + 1, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const PNG_800 = png(800, 500);
const put = (page, buffer = PNG_800, name = 'screen.png') =>
  page.setInputFiles('#file', { name, mimeType: 'image/png', buffer });

async function open(page) {
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'empty');
}

async function putReady(page, buffer = PNG_800, name = 'screen.png') {
  await put(page, buffer, name);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
}

const activeId = (page) => page.evaluate(() => document.activeElement?.id ?? '');

async function pasteImage(page) {
  await page.evaluate(async () => {
    const source = document.createElement('canvas');
    source.width = 800;
    source.height = 500;
    const blob = await new Promise((resolve) => source.toBlob(resolve, 'image/png'));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'pasted.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }));
  });
}

test.describe('Day 027 スクショに額縁を', () => {
  test('最初は空で3つの入口とプライバシーが見える', async ({ page }) => {
    await open(page);
    await expect(page.locator('#dropzone')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'スクショをここに置いてください' })).toBeVisible();
    await expect(page.locator('#pick')).toHaveText('画像を選ぶ');
    await expect(page.locator('#paste-button')).toHaveText('クリップボードから貼る');
    await expect(page.locator('#sample')).toHaveText('サンプルで試す');
    await expect(page.locator('.privacy')).toContainText('画像は端末の外に出ません');
  });

  test('サンプルでreadyになり1440×990を表示する', async ({ page }) => {
    await open(page);
    await page.locator('#sample').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('#output-size')).toHaveText('出力 1440 × 990 px');
    await expect(page.locator('#source-info')).toHaveText('元画像 1200 × 750 · サンプル');
  });

  test('800×500 PNGを選び960×660 PNGとして保存する', async ({ page }) => {
    await open(page);
    await putReady(page);
    await expect(page.locator('#output-size')).toHaveText('出力 960 × 660 px');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
    expect(download.suggestedFilename()).toMatch(/^framed-\d{8}-\d{4}\.png$/);
    const saved = await readFile(await download.path());
    expect([saved.readUInt32BE(16), saved.readUInt32BE(20)]).toEqual([960, 660]);
    await expect(page.locator('#message')).toHaveText('保存しました');
  });

  test('1:1で960×960、枠ありの自動で960×689', async ({ page }) => {
    await open(page);
    await putReady(page);
    await page.locator('[data-aspect="1:1"]').click();
    await expect(page.locator('#output-size')).toHaveText('出力 960 × 960 px');
    await page.locator('[data-aspect="auto"]').click();
    await page.locator('#frame').check();
    await expect(page.locator('#output-size')).toHaveText('出力 960 × 689 px');
  });

  test('documentへの貼り付けで画像を読み込む', async ({ page }) => {
    await open(page);
    await pasteImage(page);
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('#output-size')).toHaveText('出力 960 × 660 px');
  });

  test('スライダーにフォーカスがあっても貼り付けで画像を読み込む', async ({ page }) => {
    await open(page);
    await page.locator('#padding').focus();
    expect(await activeId(page)).toBe('padding');
    await pasteImage(page);
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('#output-size')).toHaveText('出力 960 × 660 px');
  });

  test('documentへのドロップで画像を読み込む', async ({ page }) => {
    await open(page);
    await page.evaluate(async () => {
      const source = document.createElement('canvas');
      source.width = 800;
      source.height = 500;
      const blob = await new Promise((resolve) => source.toBlob(resolve, 'image/png'));
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], 'dropped.png', { type: 'image/png' }));
      document.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    });
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('#output-size')).toHaveText('出力 960 × 660 px');
  });

  test('画像でないファイルは理由を出してエラーになる', async ({ page }) => {
    await open(page);
    await page.setInputFiles('#file', { name: 'memo.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'error');
    await expect(page.locator('#error-body')).toHaveText('画像ファイルを選んでください（PNG・JPEG・WebP・GIF・BMP）');
  });

  test('画像表示中の不正なファイルは前の画像を残して理由を表示する', async ({ page }) => {
    await open(page);
    await putReady(page);
    await page.setInputFiles('#file', { name: 'memo.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('#output-size')).toHaveText('出力 960 × 660 px');
    await expect(page.locator('#message')).toHaveText('画像ファイルを選んでください（PNG・JPEG・WebP・GIF・BMP）');
  });

  test('6000×3000は長辺4096pxに縮めて注記する', async ({ page }) => {
    test.slow();
    await open(page);
    await putReady(page, png(6000, 3000), 'large.png');
    await expect(page.locator('#output-size')).toHaveText('出力 4096 × 2389 px');
    await expect(page.locator('#size-note')).toHaveText('元画像が大きいので、長辺を4096pxに縮めて書き出します');
    await expect(page.locator('#size-note')).toBeVisible();
    await expect(page.locator('#padding-value')).toHaveText('341px');
  });

  test('roundRect非対応のブラウザでも角丸を描いてreadyになる', async ({ page }) => {
    await page.addInitScript(() => { delete CanvasRenderingContext2D.prototype.roundRect; });
    await open(page);
    expect(await page.evaluate(() => typeof CanvasRenderingContext2D.prototype.roundRect)).toBe('undefined');
    await page.locator('#sample').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('#output-size')).toHaveText('出力 1440 × 990 px');
    // 角丸が描けていれば、カードの左上の角（余白120pxの位置）は白いカードではなく背景のまま
    const corner = await page.evaluate(() => [...document.getElementById('preview').getContext('2d').getImageData(120, 120, 1, 1).data]);
    expect(corner.slice(0, 3)).not.toEqual([255, 255, 255]);
  });

  test('toBlobがnullを返すときは保存もコピーも理由を出す', async ({ page }) => {
    await page.addInitScript(() => { HTMLCanvasElement.prototype.toBlob = function (callback) { callback(null); }; });
    await open(page);
    await page.locator('#sample').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
    await page.locator('#download').click();
    await expect(page.locator('#message')).toHaveText('この画像は書き出せませんでした。比率や余白を小さくしてください');
    await page.evaluate(() => { document.getElementById('message').textContent = ''; });
    await page.locator('#copy').click();
    await expect(page.locator('#message')).toHaveText('この画像は書き出せませんでした。比率や余白を小さくしてください');
  });

  test('状態が切り替わるとフォーカスが次の操作へ移る', async ({ page }) => {
    await open(page);
    await page.locator('#sample').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
    expect(await activeId(page)).toBe('preview');
    await page.locator('#again').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'empty');
    expect(await activeId(page)).toBe('pick');
    await page.setInputFiles('#file', { name: 'memo.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'error');
    expect(await activeId(page)).toBe('error-again');
  });

  test('背景と比率は再読込後も残るが画像は残らない', async ({ page }) => {
    await open(page);
    await putReady(page);
    await page.locator('[data-bg="forest"]').click();
    await page.locator('[data-aspect="4:5"]').click();
    await page.reload();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'empty');
    await expect(page.locator('[data-bg="forest"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-aspect="4:5"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('余白スライダーで出力寸法が変わる', async ({ page }) => {
    await open(page);
    await putReady(page);
    await page.locator('#padding').fill('60');
    await expect(page.locator('#padding-value')).toHaveText('120px');
    await expect(page.locator('#output-size')).toHaveText('出力 1040 × 740 px');
  });

  test('画像コピーは成功か案内のメッセージを返す', async ({ page }) => {
    await open(page);
    await putReady(page);
    await page.locator('#copy').click();
    await expect(page.locator('#message')).toHaveText(/^(コピーしました。そのまま貼り付けられます|この環境ではコピーできません。PNGで保存してください)$/);
  });

  test('localStorage不可でも加工と保存が動く', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    });
    await open(page);
    await expect(page.locator('#storage-error')).toBeVisible();
    await putReady(page);
    await page.locator('[data-bg="ocean"]').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
    expect([...(await readFile(await download.path())).subarray(1, 4)]).toEqual([80, 78, 71]);
  });

  test('reduced motionでは着地クラスを付けない', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.locator('#sample').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('#preview')).not.toHaveClass(/is-landing/);
  });

  for (const width of [320, 390, 1280]) {
    test(`${width}px幅で横スクロールがない`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
    });
  }

  test('1200×750でステージ・保存・背景が同じ画面に入る', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 750 });
    await open(page);
    await page.locator('#sample').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
    for (const selector of ['#preview', '#download', '#backgrounds']) {
      const box = await page.locator(selector).boundingBox();
      expect(box).not.toBeNull();
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(750);
    }
  });

  test('表示中の操作領域は44px以上', async ({ page }) => {
    await open(page);
    const boxes = await page.locator('button, input[type="range"], .check-control').evaluateAll((nodes) =>
      nodes.filter((node) => node.offsetParent !== null).map((node) => ({ name: node.id || node.getAttribute('aria-label') || node.textContent.trim(), width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }))
    );
    for (const box of boxes) {
      expect(box.width, `${box.name} の幅`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${box.name} の高さ`).toBeGreaterThanOrEqual(44);
    }
  });

  test('操作後の通信は同梱サンプルだけ', async ({ page }) => {
    const requests = [];
    const sockets = [];
    page.on('request', (request) => requests.push(request.url()));
    page.on('websocket', (socket) => sockets.push(socket.url()));
    await open(page);
    requests.length = 0;
    await page.locator('#sample').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatch(/\/sample\/sample\.webp$/);
    expect(sockets).toEqual([]);
  });
});
