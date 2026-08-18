import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSegments, segmentBody } from '../../apps/day-011-photo-metadata/lib/jpeg.js';
import {
  app0Jfif,
  app1BrokenExif,
  app1Exif,
  app1Xmp,
  app13Iptc,
  app2Icc,
  buildJpeg,
  comment,
  concat,
  toDms
} from '../../apps/day-011-photo-metadata/tests/fixtures/jpeg-builder.mjs';

/* このDayは meta.json が draft なので dist/ に入らない（build が公開前のDayを除くため）。
   一覧ページに出さないまま実物を検査したいので、アプリのフォルダだけを配る小さなサーバーを立てる。
   公開に切り替えたら、baseURL の /day-011-photo-metadata/ をそのまま使える。 */

const appDir = fileURLToPath(new URL('../../apps/day-011-photo-metadata/', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg'
};

let server;
let origin;

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    try {
      let path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const body = await readFile(join(appDir, path));
      response.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise((done) => server.close(done));
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);

const jpegWith = (options) => Buffer.from(buildJpeg([app0Jfif(), app1Exif(options), app2Icc()]));

const RIGHTS = [
  { tag: 0x8298, value: '(C) 2026 SAMPLE PHOTOGRAPHER' },
  { tag: 0x013b, value: 'SAMPLE PHOTOGRAPHER' }
];

const sampleBytes = () => readFile(join(appDir, 'sample', 'sample.jpg'));

/** ページを開いて、外へ出た通信を記録し始める。 */
async function open(page) {
  const requests = [];
  const sockets = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await page.goto(`${origin}/`);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'empty');
  return { requests, sockets };
}

const put = (page, buffer, name = 'photo.jpg') =>
  page.setInputFiles('#file', { name, mimeType: 'image/jpeg', buffer });

const stateLog = (page) => page.locator('#app').evaluate((node) => node.dataset.stateLog.split(','));

test.describe('Day 011 この写真、まだ場所を覚えている', () => {
  test('最初は空の状態で、写真の置き場所と「送っていない」ことが見えている', async ({ page }) => {
    await open(page);
    await expect(page.locator('#drop')).toBeVisible();
    await expect(page.locator('.panel--empty .privacy')).toContainText('どこにも送られていません');
    await expect(page.locator('.panel--result')).toBeHidden();
  });

  test('サンプルは読込中を経由して結果になり、座標とシリアル番号が出る', async ({ page }) => {
    await open(page);
    await page.locator('#sample').click();

    await expect(page.locator('#app')).toHaveAttribute('data-state', 'result');
    expect(await stateLog(page)).toContain('loading');

    // いちばん困るものが先頭。場所が言葉のラベルで示されている
    await expect(page.locator('#verdict')).toHaveText('撮った場所が残っています');
    await expect(page.locator('.group').first().locator('.badge')).toHaveText('場所');
    await expect(page.locator('.group[data-level="place"]')).toContainText('35.681236, 139.767125');

    // このアプリの見せ場：本体のシリアル番号と、その意味
    const person = page.locator('.group[data-level="person"]');
    await expect(person).toContainText('SN-0000000011');
    await expect(person).toContainText('SAMPLE OWNER');
    await expect(person).toContainText('同じカメラで撮った他の写真と結びつけられます');

    // 撮影の設定は畳んでおく
    const settings = page.locator('details.group[data-level="settings"]');
    await expect(settings).toHaveJSProperty('open', false);
    await settings.locator('summary').click();
    await expect(settings).toContainText('Sample Camera 100');

    // 結果の画面にも「送っていない」を出す
    await expect(page.locator('.panel--result .privacy')).toContainText('どこにも送られていません');
    await expect(page.locator('#sample-note')).toContainText('架空の位置');
  });

  test('切り落としたはずの表札が、本体の写真と並べたサムネイルにだけ残っている', async ({ page }) => {
    await open(page);
    await page.locator('#sample').click();

    /* 見比べる相手（本体の写真）を一緒に出していないと、このカードが何なのか分からない。
       どちらの画像かはラベルで言う（並び順は画面幅で入れ替わるので、位置に頼らない）。 */
    const compare = page.locator('#compare');
    await expect(compare).toBeVisible();
    await expect(compare.locator('#main-shot .shot__label')).toHaveText('いま見えている写真');
    await expect(compare.locator('#thumb .shot__label')).toHaveText('埋め込まれたサムネイル');

    const thumb = page.locator('#thumb');
    await expect(thumb.locator('img')).toHaveAttribute('src', /^blob:/);
    await expect(page.locator('#main-image')).toHaveAttribute('src', /^blob:/);

    // 描画が終わってから測る（読み込み前は naturalWidth が0になる）
    await expect
      .poll(() => page.locator('#thumb-image').evaluate((node) => [node.naturalWidth, node.naturalHeight]))
      .toEqual([320, 240]);
    await expect
      .poll(() => page.locator('#main-image').evaluate((node) => [node.naturalWidth, node.naturalHeight]))
      .toEqual([960, 540]);

    // 断定しない言い方であること。ただし同じ文を画面で2回言わない
    await expect(compare.locator('.compare__note')).toContainText('残っていることがあります');
    const shown = await page.locator('.panel--result').innerText();
    expect(shown.split('本体の写真と見比べてください').length - 1, '同じ説明が二重に出ている').toBe(1);
  });

  test('同じ場所以外へは1本も通信しない', async ({ page }) => {
    const { requests, sockets } = await open(page);
    await page.locator('#sample').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'result');
    await put(page, jpegWith({ gps: [{ tag: 0x0001, value: 'N' }, { tag: 0x0002, type: 5, value: toDms(35.68) }] }));
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'result');

    const external = requests.filter((url) => /^https?:/i.test(url) && !url.startsWith(origin));
    expect(external, `外へ出た通信: ${external.join(', ')}`).toEqual([]);
    expect(sockets).toEqual([]);
    // 読んだのは自分のファイルだけ
    expect(requests.some((url) => url.endsWith('/sample/sample.jpg'))).toBe(true);
  });

  test('通信を切ったままでも、自分の写真を調べて保存できる', async ({ page, context }) => {
    // 画面に「通信を切ったままでも動きます」と書いてある。書いた以上は機械で確かめる。
    await open(page);
    await context.setOffline(true);

    await put(page, jpegWith({ ifd0: RIGHTS }));
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'result');
    await expect(page.locator('#rights')).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
    const saved = await readFile(await download.path());
    expect(saved.includes(Buffer.from('Exif\0\0', 'latin1'))).toBe(false);

    await context.setOffline(false);
  });

  test('PNGは「調べられません」。「情報はありません」とは言わない', async ({ page }) => {
    await open(page);
    await page.setInputFiles('#file', { name: 'photo.png', mimeType: 'image/png', buffer: PNG });

    await expect(page.locator('#app')).toHaveAttribute('data-state', 'unsupported');
    const panel = page.locator('.panel--unsupported');
    await expect(panel).toContainText('このツールでは調べられません');
    await expect(panel).toContainText('情報が入っていないという意味ではありません');

    const shown = await page.locator('#app').innerText();
    expect(shown).not.toContain('情報はありません');
    expect(shown).not.toContain('メタデータは見つかりませんでした');
  });

  test('拡張子を .jpg に変えても、中身で判定する', async ({ page }) => {
    await open(page);
    await page.setInputFiles('#file', { name: 'camera.jpg', mimeType: 'image/jpeg', buffer: PNG });
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'unsupported');
  });

  test('壊れたJPEGはエラー、0バイトと複数枚は受け取れないと言う', async ({ page }) => {
    await open(page);

    // JPEGとして始まるが、長さがファイルの外を指している
    await put(page, Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x7f, 0xff, 0x41, 0x42]));
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'error');
    await expect(page.locator('.panel--error')).toContainText('読めませんでした');

    await page.locator('.panel--error [data-again]').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'empty');

    await put(page, Buffer.alloc(0), 'empty.jpg');
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'invalid');
    await expect(page.locator('#invalid-body')).toContainText('0バイト');

    // 2枚まとめて落としたとき
    await page.evaluate(() => {
      const transfer = new DataTransfer();
      for (const name of ['a.jpg', 'b.jpg']) {
        transfer.items.add(new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: 'image/jpeg' }));
      }
      document.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    });
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'invalid');
    await expect(page.locator('#invalid-body')).toContainText('1枚だけ');
  });

  test('Exifが無いJPEGは「見つかりませんでした」（調べられないとは別の答え）', async ({ page }) => {
    await open(page);
    await put(page, Buffer.from(buildJpeg([app0Jfif(), app2Icc()])));

    await expect(page.locator('#app')).toHaveAttribute('data-state', 'result');
    await expect(page.locator('#verdict')).toContainText('見つかりませんでした');
    await expect(page.locator('.group')).toHaveCount(0);
    await expect(page.locator('#containers')).toContainText('ICCプロファイル（残す）');
  });

  test('権利表示は「本人につながるもの」と別の枠で出す（消したい情報と残したい情報を混ぜない）', async ({ page }) => {
    await open(page);
    await put(page, jpegWith({ ifd0: RIGHTS, exif: [{ tag: 0xa431, value: 'SN-0000000011' }] }));

    const rights = page.locator('.group[data-level="rights"]');
    await expect(rights.locator('.badge')).toHaveText('権利表示');
    await expect(rights).toContainText('(C) 2026 SAMPLE PHOTOGRAPHER');
    await expect(rights).toContainText('SAMPLE PHOTOGRAPHER');
    // シリアル番号（消したい情報）と同じ束にしない
    await expect(page.locator('.group[data-level="person"]')).not.toContainText('SAMPLE PHOTOGRAPHER');
  });

  test('警告は除去ボタンの真上に出たままで、閉じるボタンを持たない', async ({ page }) => {
    await open(page);
    await put(page, jpegWith({ ifd0: RIGHTS }));

    const warn = page.locator('#rights');
    await expect(warn).toBeVisible();
    await expect(warn).toContainText('あなたが撮った写真なら、消しても問題ありません');
    await expect(warn).toContainText('他の人が撮った写真では、消す前に撮影者に確認してください');
    await expect(warn.locator('button, [aria-label*="閉じる"]')).toHaveCount(1, 'コピー以外のボタンを置かない');

    // 除去ボタンの直前にあること
    const above = await page.evaluate(() => {
      const spot = document.querySelector('#rights').compareDocumentPosition(document.querySelector('#download'));
      return Boolean(spot & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(above).toBe(true);

    // 保存したあとも出たまま（一度きりの通知にしない）
    await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
    await expect(warn).toBeVisible();
  });

  test('検出した権利表示の値を出し、控えられるようにコピーできる', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'クリップボードの許可はChromiumでだけ与えられる');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page);
    await put(page, jpegWith({ ifd0: RIGHTS }));

    const warn = page.locator('#rights');
    await expect(warn.locator('li')).toHaveText([
      '著作権表示：(C) 2026 SAMPLE PHOTOGRAPHER',
      '撮影者：SAMPLE PHOTOGRAPHER'
    ]);
    await expect(warn).toContainText('消す前に、この値を控えておけます');

    await warn.getByRole('button', { name: 'この値をコピー' }).click();
    await expect(page.locator('#rights-copied')).toHaveText('コピーしました');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      '著作権表示：(C) 2026 SAMPLE PHOTOGRAPHER\n撮影者：SAMPLE PHOTOGRAPHER'
    );
  });

  test('利用条件や権利者の連絡先がXMPにあると、強い警告になる', async ({ page }) => {
    await open(page);
    await put(
      page,
      Buffer.from(
        buildJpeg([
          app0Jfif(),
          app1Xmp('<rdf:RDF><xmpRights:UsageTerms>Editorial use only</xmpRights:UsageTerms><dc:creator>SAMPLE</dc:creator></rdf:RDF>'),
          app2Icc()
        ])
      )
    );

    const warn = page.locator('#rights');
    await expect(warn).toBeVisible();
    await expect(page.locator('#rights-strong')).toBeVisible();
    await expect(warn).toContainText('ストックフォトや、仕事で受け取った写真の可能性があります');
    // Exifには何も無いので、値の一覧とコピーは出さない
    await expect(page.locator('#rights-list')).toBeHidden();

    const rights = page.locator('.group[data-level="rights"]');
    await expect(rights).toContainText('利用条件（xmpRights:UsageTerms）');
    await expect(rights).toContainText('値は読んでいません');
  });

  test('IPTCは中身を読んでいないことを隠さずに、区画があることだけ伝える', async ({ page }) => {
    await open(page);
    await put(page, Buffer.from(buildJpeg([app0Jfif(), app13Iptc('iptc'), app2Icc()])));

    await expect(page.locator('#rights')).toBeVisible();
    await expect(page.locator('#rights-iptc')).toContainText('このアプリは中身を読んでいませんが');
    await expect(page.locator('.group[data-level="rights"]')).toContainText('あり（中身は読んでいません）');
  });

  test('権利表示が無ければ警告は出さない', async ({ page }) => {
    await open(page);
    await put(page, jpegWith({ ifd0: [{ tag: 0x010f, value: 'SAMPLE OPTICS' }] }));
    await expect(page.locator('#rights')).toBeHidden();
  });

  test('入口に、想定した使い方が書いてある', async ({ page }) => {
    await open(page);
    const intended = page.locator('.drop__intended');
    await expect(intended).toBeVisible();
    await expect(intended).toContainText('あなたが権利を持っている写真に使ってください');
    await expect(intended).toContainText('想定した使い方ではありません');
  });

  test('消して保存したファイルに Exif は入らず、SOS以降が元と一致する', async ({ page }) => {
    const original = await sampleBytes();
    await open(page);
    await page.locator('#sample').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'result');

    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
    expect(download.suggestedFilename()).toBe('sample-cleaned.jpg');
    const saved = await readFile(await download.path());

    // Exifの署名がファイルのどこにも残っていない
    expect(saved.includes(Buffer.from('Exif\0\0', 'latin1'))).toBe(false);

    const before = readSegments(new Uint8Array(original));
    const after = readSegments(new Uint8Array(saved));
    expect(after.segments.map((one) => one.kind)).not.toContain('exif');
    // 色に使うICCは残す
    expect(after.segments.map((one) => one.kind)).toContain('icc');
    // 画素は1バイトも変えない
    expect(Buffer.compare(saved.subarray(after.scanStart), original.subarray(before.scanStart))).toBe(0);
    expect(saved.length).toBeLessThan(original.length);

    await expect(page.locator('#saved')).toContainText('もう一度ここに置く');
  });

  test('保存すると、書き出したファイルを読み直した結果が項目ごとに出る', async ({ page }) => {
    await open(page);
    await page.locator('#sample').click();
    await expect(page.locator('#verify')).toBeHidden();

    await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);

    const verify = page.locator('#verify');
    await expect(verify).toBeVisible();
    await expect(verify.locator('.verify__label')).toHaveText([
      'Exif',
      'XMP',
      'IPTC',
      'MPF',
      'コメント',
      'ICCプロファイル',
      '向きの情報',
      '画素のデータ'
    ]);
    await expect(verify.locator('.verify__row[data-ok="false"]')).toHaveCount(0);

    const row = (label) => verify.locator('.verify__row', { has: page.getByText(label, { exact: true }) });
    await expect(row('Exif').locator('.verify__value')).toHaveText('なし');
    await expect(row('コメント').locator('.verify__value')).toHaveText('なし');
    // 「残しています」は消し忘れではなく、そう決めて残しているものだと読めること
    await expect(row('ICCプロファイル').locator('.verify__value')).toHaveText('残しています（色が変わらないように）');
    await expect(row('ICCプロファイル')).toHaveAttribute('data-kept', 'true');
    await expect(row('画素のデータ').locator('.verify__value')).toContainText('1バイトも変えていません');
  });

  test('向きを残したときは、検算でもそう言う', async ({ page }) => {
    await open(page);
    await put(page, jpegWith({ ifd0: [{ tag: 0x010f, value: 'SAMPLE OPTICS' }, { tag: 0x0112, type: 3, value: 6 }] }));
    await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);

    const verify = page.locator('#verify');
    const row = (label) => verify.locator('.verify__row', { has: page.getByText(label, { exact: true }) });
    await expect(row('Exif').locator('.verify__value')).toHaveText('向きの情報だけの32バイトに作り直しました');
    await expect(row('向きの情報').locator('.verify__value')).toContainText('残しています');
    await expect(verify.locator('.verify__row[data-ok="false"]')).toHaveCount(0);
  });

  test('Exifが壊れていても、区画ごと取り除いて保存できる', async ({ page }) => {
    await open(page);
    await put(page, Buffer.from(buildJpeg([app0Jfif(), app1BrokenExif(), app2Icc()])));

    // 読めないことと、入っていないことを混ぜない
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'result');
    await expect(page.locator('#verdict')).toHaveText('メタデータの中身は読み取れませんでした');
    await expect(page.locator('#verdict-file')).toContainText('区画ごと取り除けます');
    await expect(page.locator('#verdict')).not.toContainText('見つかりませんでした');

    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
    const saved = await readFile(await download.path());
    expect(readSegments(new Uint8Array(saved)).segments.map((one) => one.kind)).toEqual(['jfif', 'icc']);
    await expect(page.locator('#verify .verify__row[data-ok="false"]')).toHaveCount(0);
  });

  test('保証しないことが、結果の画面の中で読める位置にある', async ({ page }) => {
    await open(page);
    await page.locator('#sample').click();

    /* 誤解すると実害が出る2点は、保存ボタンより上に短く出す。
       残りの全文は同じ画面の下に置く（読める状態は変えず、押す前に読む量だけ減らす）。 */
    const limits = page.locator('.panel--result .limits');
    await expect(limits).toBeVisible();
    await expect(limits).toContainText('完全に消せることを保証するものではありません');
    await expect(limits).toContainText('「見つかりませんでした」は、情報が入っていないという意味ではありません');

    const more = page.locator('#limits-more');
    await expect(more).toBeVisible();
    await expect(more).toContainText('XMP や IPTC という別の場所に同じ撮影者名・著作権表示が入っていることがあります');
    await expect(more).toContainText('写り込んだ表札やナンバープレートは、メタデータを消しても消えません');
    await expect(more).toContainText('写真に写り込んだものまで無いという意味ではありません');
    await expect(more).toContainText('他の人の著作物から権利表示を取り除く目的では使わないでください');

    // 要点は保存ボタンより前（＝押す前）に読める位置にあること
    const order = await page.evaluate(() => {
      const after = (from, to) =>
        Boolean(document.querySelector(from).compareDocumentPosition(document.querySelector(to)) & Node.DOCUMENT_POSITION_FOLLOWING);
      return { limits: after('.limits', '#download'), warn: after('#rights', '#download') };
    });
    expect(order).toEqual({ limits: true, warn: true });
  });

  test('消して保存は、何が入っていたかを読んだ先にある（結果画面の並びを固定する）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await page.locator('#sample').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'result');
    await expect(page.locator('#download')).toBeVisible();

    /* このアプリの目的は「自分の写真に何が入っていたかを確かめてから消す」こと。
       検出内容（#groups）とサムネイルの見比べ（#compare）を読まないまま保存できる並びにしない。
       ⚠️ その結果として保存ボタンの位置は下がる。深さは不具合ではないので、上へ戻さないこと。
       法務由来の2点（追記2 G-2 の .limits ／ 追記3 K-3 の #rights）は保存ボタンより上のまま。 */
    const wanted = ['.verdict', '#groups', '#compare', '#others', '#containers', '.limits', '#rights', '#download', '#limits-more'];
    const order = await page.evaluate((selectors) => {
      const before = (from, to) =>
        Boolean(document.querySelector(from).compareDocumentPosition(document.querySelector(to)) & Node.DOCUMENT_POSITION_FOLLOWING);
      return selectors.slice(0, -1).map((selector, at) => before(selector, selectors[at + 1]));
    }, wanted);
    for (const [at, ok] of order.entries()) expect(ok, `${wanted[at]} が ${wanted[at + 1]} より後ろにある`).toBe(true);

    /* 結果カードの並びをそのまま固定する。上の順序チェックだけだと、
       「保存ボタンの前に説明の壁を積む」変更（詳細を上へ移すなど）が素通りしてしまう。
       実測（390px幅・サンプル写真）：保存ボタンはページ上端から2,769px＝全長4,048pxの68%地点、判定カードからは2,527px下。
       中身を読んでから押す並びなので、この深さは意図どおり。 */
    const children = await page.evaluate(() =>
      [...document.querySelector('.panel--result').children].map((node) => node.id || node.className)
    );
    expect(children).toEqual([
      'verdict',
      'sample-note',
      'groups',
      'compare',
      'others',
      'containers',
      'limits',
      'rights',
      'actions',
      'limits-more',
      'privacy'
    ]);
    expect(await page.locator('.actions #download').count()).toBe(1);
  });

  test('不具合の報告先が画面から辿れる', async ({ page }) => {
    await open(page);
    const link = page.locator('.foot').getByRole('link', { name: 'このリポジトリ' });
    await expect(link).toHaveAttribute('href', 'https://github.com/haranishi/hundred-days');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('XMPとIPTCとコメントも一緒に消える', async ({ page }) => {
    const file = Buffer.from(
      buildJpeg([app0Jfif(), app1Xmp('<x>author</x>'), app1Exif({ ifd0: [{ tag: 0x010f, value: 'SAMPLE OPTICS' }] }), app13Iptc('iptc'), app2Icc(), comment('メモ')])
    );
    await open(page);
    await put(page, file);
    await expect(page.locator('#containers')).toContainText('XMP（消す）');

    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
    const saved = await readFile(await download.path());
    const kinds = readSegments(new Uint8Array(saved)).segments.map((one) => one.kind);
    expect(kinds).toEqual(['jfif', 'icc']);
  });

  test('縦写真は向きだけ残し、チェックを入れると向きも消える', async ({ page }) => {
    const file = jpegWith({ ifd0: [{ tag: 0x010f, value: 'SAMPLE OPTICS' }, { tag: 0x0112, type: 3, value: 6 }] });
    await open(page);
    await put(page, file);

    await expect(page.locator('#orientation-note')).toContainText('横倒しに表示される');
    const check = page.locator('#drop-orientation');
    await expect(check).not.toBeChecked();

    const [kept] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
    const withOrientation = await readFile(await kept.path());
    const rebuilt = readSegments(new Uint8Array(withOrientation));
    const exif = rebuilt.segments.find((one) => one.kind === 'exif');
    expect(exif, '向き1件だけのExifが入る').toBeTruthy();
    expect(exif.end - exif.start).toBe(36);
    expect(segmentBody(new Uint8Array(withOrientation), exif).length).toBe(32);

    await check.check();
    const [removed] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
    const without = await readFile(await removed.path());
    expect(readSegments(new Uint8Array(without)).segments.map((one) => one.kind)).not.toContain('exif');
  });

  test('向きが1の写真には、向きのチェックを出さない（押しても何も起きない箱を置かない）', async ({ page }) => {
    await open(page);
    await page.locator('#sample').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'result');
    await expect(page.locator('#drop-orientation')).toBeHidden();
  });

  test('名前を出していないタグは件数だけ出す', async ({ page }) => {
    await open(page);
    await put(
      page,
      jpegWith({
        ifd0: [
          { tag: 0x010f, value: 'SAMPLE OPTICS' },
          { tag: 0x011a, type: 5, value: { n: 72, d: 1 } },
          { tag: 0x011b, type: 5, value: { n: 72, d: 1 } }
        ]
      })
    );
    await expect(page.locator('#others')).toContainText('ほかに2件');
  });

  test('別の写真を試すと空に戻り、前の結果が残らない', async ({ page }) => {
    await open(page);
    await page.locator('#sample').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'result');
    await page.locator('#again').click();

    await expect(page.locator('#app')).toHaveAttribute('data-state', 'empty');
    expect(await stateLog(page)).toEqual(['empty', 'loading', 'result', 'empty']);
    await expect(page.locator('#thumb-image')).not.toHaveAttribute('src', /blob:/);
    await expect(page.locator('#verify')).toBeHidden();
  });

  test('どの画面幅でも押せる大きさで、横にはみ出さない', async ({ page }) => {
    await open(page);
    await page.locator('#sample').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'result');

    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const heights = await page
        .locator('.button, .check')
        .evaluateAll((nodes) =>
          nodes.filter((node) => node.offsetParent !== null).map((node) => Math.round(node.getBoundingClientRect().height))
        );
      expect(heights.length).toBeGreaterThan(1);
      for (const height of heights) expect(height, `${width}px`).toBeGreaterThanOrEqual(44);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${width}px で横にはみ出している`).toBeLessThanOrEqual(1);
    }
  });

  test('畳んである行は、文字ではなく行そのものを押せる（44px以上）', async ({ page }) => {
    await open(page);
    await page.locator('#sample').click();

    const head = page.locator('details.group[data-level="settings"] > summary.group__head');
    // 描画が終わる前に測ると、遅い環境でだけ落ちるテストになる
    await expect(head).toBeVisible();

    const settings = page.locator('details.group[data-level="settings"]');
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      // 画面の外にある要素を座標で押しても当たらない。位置は毎回測り直す
      await head.scrollIntoViewIfNeeded();
      const box = await head.boundingBox();
      expect(Math.round(box.height), `${width}px で「開く」の行が押しにくい`).toBeGreaterThanOrEqual(44);

      // 「開く」の文字だけでなく、行の左端（バッジのあたり）を押しても開くこと
      await page.mouse.click(box.x + 24, box.y + box.height / 2);
      await expect(settings).toHaveJSProperty('open', true);
      const opened = await head.boundingBox();
      await page.mouse.click(opened.x + 24, opened.y + opened.height / 2);
      await expect(settings).toHaveJSProperty('open', false);
    }
  });

  test('座標は「検索すれば分かる」と書いてあるので、コピーもできる', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'クリップボードの許可はChromiumでだけ与えられる');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page);
    await page.locator('#sample').click();

    const place = page.locator('.group[data-level="place"]');
    await place.getByRole('button', { name: '緯度・経度をコピー' }).click();
    await expect(place.locator('.row__said')).toHaveText('コピーしました');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('35.681236, 139.767125');
  });

  test('いちばん目立たない文字でも、コントラストがAAを満たす', async ({ page }) => {
    await open(page);
    await page.locator('#sample').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'result');

    const selectors = [
      '.row__note',
      '.verdict__file',
      '.verify__note',
      '.warn__hint',
      '.limits p',
      '.limits-more p',
      '.shot figcaption',
      // 共通シェアの注記。opacity で薄めると色の指定だけ見ても分からないので、混ざった後の色で測る
      '.share__note'
    ];
    for (const selector of selectors) {
      const ratio = await page.locator(selector).first().evaluate((node) => {
        // color-mix() の結果は color(srgb 0〜1) で返るので、rgb() と同じ読み方をしない
        const parse = (value) => {
          const scale = value.startsWith('color(') ? 255 : 1;
          return value.match(/[\d.]+/g).slice(0, 3).map((one) => Number(one) * scale);
        };
        const channel = (value) => {
          const scaled = value / 255;
          return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
        };
        const luminance = (rgb) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);

        /* 背景を持ついちばん近い先祖まで遡りながら、その間にかかっている opacity を掛け合わせる。
           薄めた文字は、背景と混ざった色で目に入る（色の指定そのままでは見えていない）。 */
        let alpha = Number(getComputedStyle(node).opacity);
        let behind = node.parentElement;
        while (behind && getComputedStyle(behind).backgroundColor === 'rgba(0, 0, 0, 0)') {
          alpha *= Number(getComputedStyle(behind).opacity);
          behind = behind.parentElement;
        }
        const back = parse(getComputedStyle(behind).backgroundColor);
        const front = parse(getComputedStyle(node).color).map((value, index) => alpha * value + (1 - alpha) * back[index]);

        const text = luminance(front);
        const paper = luminance(back);
        return (Math.max(text, paper) + 0.05) / (Math.min(text, paper) + 0.05);
      });
      expect(ratio, selector).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('消せる範囲を保証しないことと、写り込みは消えないことを画面に書いてある', async ({ page }) => {
    await open(page);
    const facts = page.locator('.facts');
    await expect(facts).toContainText('完全に消せることを保証するものではありません');
    await expect(facts).toContainText('XMP や IPTC という別の場所に同じ撮影者名・著作権表示が入っていることがあります');
    await expect(facts).toContainText('写り込んだ表札やナンバープレートは、メタデータを消しても消えません');
    await expect(facts).toContainText('ICC プロファイルは残します');
    // 全部免責の書き方をしていない（何を保証しないかを具体的に書く）
    await expect(page.locator('#app')).not.toContainText('一切の責任');
  });

  test('侵害を促す表現と、法的評価の断定を書かない', async ({ page }) => {
    await open(page);
    await page.locator('#sample').click();
    await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);

    const shown = await page.locator('body').innerText();
    for (const banned of ['自由に使え', '透かし', '適法', '違法ではありません', '責任を負いません']) {
      expect(shown, `書いてはいけない表現: ${banned}`).not.toContain(banned);
    }
  });

  test('同じ注意書きを、1画面で2回読ませない（上は要点・下は詳細）', async ({ page }) => {
    await open(page);
    await page.locator('#sample').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'result');

    const shown = await page.locator('.panel--result').innerText();
    for (const line of [
      '完全に消せることを保証するものではありません',
      '「見つかりませんでした」は、情報が入っていないという意味ではありません'
    ]) {
      expect(shown.split(line).length - 1, `同じ文が2回出ている: ${line}`).toBe(1);
    }
    // 下は「何を消すのか」という中身を足す側であること（要点の言い直しにしない）
    await expect(page.locator('#limits-more')).toContainText('Exif・XMP・IPTC・MPF・コメント の5種類の区画');
  });

  test('保存ボタンは警告の箱の外にあり、間が空いていて、幅いっぱいに出る', async ({ page }) => {
    await open(page);
    await put(page, jpegWith({ ifd0: RIGHTS }));
    await expect(page.locator('#rights')).toBeVisible();

    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const measured = await page.evaluate(() => {
        const warn = document.querySelector('#rights');
        const button = document.querySelector('#download');
        const card = button.closest('.actions');
        const style = getComputedStyle(card);
        const inner =
          card.getBoundingClientRect().width -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight) -
          parseFloat(style.borderLeftWidth) -
          parseFloat(style.borderRightWidth);
        return {
          inside: warn.contains(button),
          gap: Math.round(button.getBoundingClientRect().top - warn.getBoundingClientRect().bottom),
          spare: Math.round(inner - button.getBoundingClientRect().width)
        };
      });
      // 警告の箱の中にあると「この警告に対するボタン」に見える
      expect(measured.inside, `${width}px`).toBe(false);
      expect(measured.gap, `${width}px で警告と保存ボタンが近すぎる`).toBeGreaterThanOrEqual(24);
      expect(measured.spare, `${width}px で保存ボタンが幅いっぱいでない`).toBeLessThanOrEqual(1);
    }
  });

  test('左の帯は全カードで同じ太さ、分類カードはバッジと同じ色', async ({ page }) => {
    await open(page);
    await page.locator('#sample').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'result');

    const measured = await page.evaluate(() => {
      const cards = [
        '.verdict',
        '.note--sample',
        '.limits',
        '#rights',
        '.actions',
        '.group',
        '.compare',
        '.limits-more',
        '.panel--result > .privacy'
      ];
      return {
        bars: cards.map((selector) => {
          const node = document.querySelector(selector);
          return { selector, width: node ? getComputedStyle(node).borderLeftWidth : null };
        }),
        groups: [...document.querySelectorAll('.group')].map((node) => ({
          level: node.dataset.level,
          bar: getComputedStyle(node).borderLeftColor,
          badge: getComputedStyle(node.querySelector('.badge')).backgroundColor
        }))
      };
    });

    for (const { selector, width } of measured.bars) expect(width, selector).toBe('4px');
    expect(measured.groups.length).toBeGreaterThanOrEqual(3);
    for (const { level, bar, badge } of measured.groups) expect(bar, `${level} の帯とバッジの色が違う`).toBe(badge);
  });

  test('広い画面でも、本文がカードの右端まで届く', async ({ page }) => {
    await open(page);
    await page.locator('#sample').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'result');

    await page.setViewportSize({ width: 1440, height: 900 });
    const wide = await page.evaluate(() => {
      const innerOf = (node) => {
        const style = getComputedStyle(node);
        return (
          node.getBoundingClientRect().width -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight) -
          parseFloat(style.borderLeftWidth) -
          parseFloat(style.borderRightWidth)
        );
      };
      const slack = [...document.querySelectorAll('.limits p, .limits-more p, .compare__note, .row__note')]
        .filter((node) => node.offsetParent !== null)
        .map((node) => Math.round(innerOf(node.parentElement) - node.getBoundingClientRect().width));
      return { slack, measure: Math.round(innerOf(document.querySelector('.limits'))) };
    });

    expect(wide.slack.length).toBeGreaterThan(2);
    // 段落側に max-width を持たせない（カードの右にだけ空白が残る状態を作らない）
    for (const spare of wide.slack) expect(spare, `カードの右に ${spare}px 空いている`).toBeLessThanOrEqual(2);
    // そのカード自体が読みやすい行長であること（日本語で35文字前後）
    expect(wide.measure).toBeGreaterThan(430);
    expect(wide.measure).toBeLessThan(600);

    // タブレット幅で端から端まで詰まって見えない
    await page.setViewportSize({ width: 768, height: 900 });
    const margin = await page.evaluate(() => Math.round(document.querySelector('.verdict').getBoundingClientRect().left));
    expect(margin, '768pxの左右の余白が狭い').toBeGreaterThanOrEqual(32);
  });

  test('本体とサムネイルは、狭い画面でも並べて出す（見比べられる位置に置く）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await page.locator('#sample').click();
    await expect(page.locator('#compare')).toBeVisible();

    // 大きさの表示（例「8.4KB」）が入っていないと、位置がそろって見えるだけで意味が無い
    await expect(page.locator('#main-caption')).not.toBeEmpty();
    await expect(page.locator('#thumb-caption')).not.toBeEmpty();

    const placed = await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect();
      const main = box('#main-shot');
      const thumb = box('#thumb');
      const mainImage = box('#main-image');
      const thumbImage = box('#thumb-image');
      const mainLabel = box('#main-shot .shot__label');
      const thumbLabel = box('#thumb .shot__label');
      const mainSub = box('#main-caption');
      const thumbSub = box('#thumb-caption');
      return {
        sideBySide: thumb.left >= main.right - 1,
        rowGap: Math.round(Math.abs(thumb.top - main.top)),
        // ラベルの行数が左右で違っても、画像の上端と下端はそろっていること
        imageGap: Math.round(Math.abs(thumbImage.top - mainImage.top)),
        imageBottomGap: Math.round(Math.abs(thumbImage.bottom - mainImage.bottom)),
        // 表札は左右で同じ行数（＝同じ高さ）に固定する
        labelTopGap: Math.round(Math.abs(thumbLabel.top - mainLabel.top)),
        labelHeightGap: Math.round(Math.abs(thumbLabel.height - mainLabel.height)),
        // 表札が折り返した側だけ大きさの表示が下がらないこと
        subTopGap: Math.round(Math.abs(thumbSub.top - mainSub.top))
      };
    });
    expect(placed.sideBySide, '縦に積むと、2枚の距離が開いて見比べられない').toBe(true);
    expect(placed.rowGap).toBeLessThanOrEqual(2);
    expect(placed.imageGap, '2枚の画像の上端がそろっていない').toBeLessThanOrEqual(2);
    expect(placed.imageBottomGap, '2枚の画像の下端がそろっていない').toBeLessThanOrEqual(2);
    expect(placed.labelTopGap, '表札の上端がそろっていない').toBeLessThanOrEqual(2);
    expect(placed.labelHeightGap, '表札の行数が左右で違う').toBeLessThanOrEqual(2);
    expect(placed.subTopGap, '大きさの表示が片側だけ下にずれている').toBeLessThanOrEqual(2);
  });

  test('控える値は途中で折り返さず、狭い画面でも枠から出ない', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await put(page, jpegWith({ ifd0: RIGHTS }));

    const value = page.locator('#rights-list .warn__value').first();
    const measured = await value.evaluate((node) => ({
      wrap: getComputedStyle(node).whiteSpace,
      spill: Math.max(0, node.scrollWidth - node.clientWidth)
    }));
    expect(measured.wrap).toBe('nowrap');
    expect(measured.spill, '値が枠に収まっていない').toBe(0);
    await expect(value).toHaveText('(C) 2026 SAMPLE PHOTOGRAPHER');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('画面のいちばん下からも、別の写真を試せる', async ({ page }) => {
    await open(page);
    const again = page.locator('.foot__again button');
    await expect(again).toBeHidden();

    await page.locator('#sample').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'result');
    await expect(again).toBeVisible();

    // 一覧へ戻るリンクより手前（限界の説明を読み終えた位置）にあること
    const before = await page.evaluate(() =>
      Boolean(
        document
          .querySelector('.foot__again')
          .compareDocumentPosition(document.querySelector('.foot__nav')) & Node.DOCUMENT_POSITION_FOLLOWING
      )
    );
    expect(before).toBe(true);

    await again.click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'empty');
    await expect(again).toBeHidden();
    // 空に戻ったとき、画面の下のほうに取り残されない
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('共通シェアのボタンは、枠で押せるものだと分かる（地色に対して3:1以上）', async ({ page }) => {
    await open(page);

    /* 枠は currentColor から作った半透明なので、指定値だけ読んでも見え方は分からない。
       地色に混ぜてから測る（文字側で opacity を見ていなかったのと同じ穴を、枠でも作らない）。 */
    const measured = await page.locator('.share__button').evaluateAll((nodes) => {
      const parse = (value) => {
        const numbers = (value.match(/[\d.]+/g) ?? []).map(Number);
        /* color-mix() の計算結果は Chromium では color(srgb 0.93 0.94 0.96 / 0.75) の形で返り、
           各成分が0〜1になる。rgb() と同じ読み方をすると、どんな色もほぼ黒として測ってしまう。 */
        const scale = value.startsWith('color(') ? 255 : 1;
        return { rgb: numbers.slice(0, 3).map((one) => one * scale), alpha: numbers.length > 3 ? numbers[3] : 1 };
      };
      const channel = (value) => {
        const scaled = value / 255;
        return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (rgb) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
      const ratio = (one, other) => (Math.max(one, other) + 0.05) / (Math.min(one, other) + 0.05);

      /* 背景を持ついちばん近い先祖まで遡る。グラデーションで塗っているアプリ（Day009）は
         backgroundColor が透明のままなので、そこで止めると「白の上」として測ってしまう。
         その場合は色の停止点を全部拾い、いちばん条件の悪いところで判定する。 */
      const groundsOf = (node) => {
        let behind = node.parentElement;
        while (behind) {
          const style = getComputedStyle(behind);
          const back = parse(style.backgroundColor);
          if (back.alpha > 0) return [back.rgb];
          if (style.backgroundImage !== 'none') {
            const stops = style.backgroundImage.match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g);
            if (stops?.length) return stops.map((one) => parse(one).rgb);
          }
          behind = behind.parentElement;
        }
        return [[255, 255, 255]];
      };

      /* 見るのは「枠と地色」。枠と面の比は見ない——塗りのあるボタン（--primary）は
         面そのものが地色との境目になるので、そこまで求めると塗りを濃くできなくなる。 */
      return nodes.map((node) => {
        const edge = parse(getComputedStyle(node).borderTopColor);
        const scores = groundsOf(node).map((ground) => {
          const border = edge.rgb.map((value, index) => edge.alpha * value + (1 - edge.alpha) * ground[index]);
          return ratio(luminance(border), luminance(ground));
        });
        return { name: node.textContent.trim(), ratio: Math.min(...scores) };
      });
    });

    expect(measured.length).toBeGreaterThanOrEqual(3);
    for (const { name, ratio } of measured) expect(ratio, `${name} の枠と地色`).toBeGreaterThanOrEqual(3);
  });

  test('シェアの4点が据え付けられている', async ({ page }) => {
    await open(page);
    const share = page.locator('.share');
    await expect(share).toHaveCount(1);
    await expect(share.getByRole('link', { name: 'Xで投稿' })).toBeVisible();
    await expect(share.getByRole('link', { name: 'LINEで送る' })).toBeVisible();
    await expect(share.getByRole('button', { name: 'リンクをコピー' })).toBeVisible();
    await expect(share.locator('.share__note')).toContainText('Instagram');
  });
});
