import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* Day 059 口さんまい。口パクの判定・音声・録画の細部は day-059-kuchi-sanmai/source の vitest が見る。
   ここでは公開ページとして、本番と同じ CSP と Permissions-Policy の下で、開くとすぐスタジオが出ること（同意画面なし）、
   外への通信が無いこと、見本で再生と録画ができること、注意書き・規約・ライセンス表示が読めることを確かめる。

   手元の配信サーバー（scripts/serve-dist.mjs）はヘッダーを付けないので、dist/_headers の値をそのまま当てる。
   マイクは Chromium の偽のマイク（同梱のテスト音を流す）で試す。 */

const DIR = 'day-059-kuchi-sanmai';
const repo = (path) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const APP_NAME = readFileSync(repo(`${DIR}/source/src/appName.ts`), 'utf8').match(/export const APP_NAME = '([^']+)'/)[1];

const headers = readFileSync(repo('dist/_headers'), 'utf8');
const ruleOf = (path) => headers.split(`\n${path}\n`)[1].split('\n\n')[0].split('\n').map((line) => line.trim());
const valueOf = (rule, name) => rule.find((line) => line.startsWith(`${name}: `)).slice(name.length + 2);
const dayRule = ruleOf(`/${DIR}/*`);
const CSP = valueOf(dayRule, 'Content-Security-Policy');
const DAY_PERMISSIONS = valueOf(dayRule, 'Permissions-Policy');
const SITE_PERMISSIONS = valueOf(ruleOf('/*'), 'Permissions-Policy');

test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${repo(`${DIR}/sample/demo-tone.wav`)}`,
    ],
  },
});

async function open(page, permissions = DAY_PERMISSIONS) {
  const errors = [];
  const outside = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  // CSPに止められた読み込みは例外にならないことがあるので、違反の知らせそのものを集める
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  // 手元の配信サーバー以外への通信は、すべて止めて記録する
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1:')) return route.fallback();
    outside.push(url);
    return route.abort();
  });
  await page.route(`**/${DIR}/`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': CSP, 'permissions-policy': permissions },
    });
  });
  await page.goto(`/${DIR}/`);
  await expect(page.getByRole('heading', { name: '声にあわせて、動きだす。' })).toBeVisible();
  return { errors, outside };
}

async function expectClean(page, { errors, outside }) {
  expect(errors, 'コンソールのエラー・例外').toEqual([]);
  expect(outside, '外への通信').toEqual([]);
  expect(await page.evaluate(() => window.__cspViolations), 'CSP違反').toEqual([]);
}

async function loadSample(page) {
  await page.getByTestId('load-sample').click();
  await expect(page.getByText('サンプルを読み込みました。')).toBeVisible();
  for (const slot of ['mouthClosed', 'mouthSmall', 'mouthOpen', 'blink']) {
    await expect(page.getByTestId(`slot-${slot}`)).toHaveAttribute('data-loaded', 'true');
  }
  await expect(page.getByTestId('audio-play')).toBeEnabled();
}

test('開くとすぐスタジオが出る（同意画面は無い）。帯と共有の窓があり、端末に何も残さない', async ({ page }) => {
  const seen = await open(page);
  await expect(page.getByTestId('preview-canvas')).toBeVisible();
  await expect(page.getByTestId('load-sample')).toBeEnabled();
  await expect(page.getByTestId('consent-gate')).toHaveCount(0);
  await expect(page.getByText('同意してスタジオを開く')).toHaveCount(0);
  await expect(page.locator('.brand-name')).toContainText(APP_NAME);
  expect(await page.title()).toBe(APP_NAME);

  await expect(page.getByRole('link', { name: '100 DAYS / 059' })).toHaveAttribute('href', '../');
  await page.getByRole('button', { name: 'このアプリを共有する', exact: true }).click();
  const dialog = page.locator('#share-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.share')).toHaveCount(1);
  await expect(dialog.getByRole('link', { name: 'Xで投稿' })).toBeVisible();
  expect(await dialog.evaluate((node) => node.scrollWidth - node.clientWidth), '共有の窓の中身が横にはみ出している').toBeLessThanOrEqual(0);
  await dialog.getByRole('button', { name: '閉じる' }).click();
  await expect(dialog).toBeHidden();

  // 同意の保存も含めて、端末には何も書かない
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
  await expectClean(page, seen);
});

test('注意書きが、画像を選ぶ欄と、音声・マイクの欄にいつも出ている', async ({ page }) => {
  const seen = await open(page);
  const imagePanel = page.locator('section.panel', { has: page.getByRole('heading', { name: 'キャラクター素材' }) });
  await expect(imagePanel.getByTestId('rights-notice-image')).toContainText('SNSなどへの投稿には許可が要ることがあります');

  const audioPanel = page.locator('section.panel', { has: page.getByRole('heading', { name: '音声と口パク' }) });
  const voice = audioPanel.getByTestId('rights-notice-voice');
  await expect(voice).toContainText('本人や権利者の許可なく使わないでください');
  await expect(voice).toContainText('実在の人物が言っていないこと');
  // マイクに切り替えても注意は残り、場所の注意が足される（切り替えるだけではマイクは開かない）
  await audioPanel.getByTestId('audio-mode-mic').click();
  await expect(audioPanel.getByTestId('mic-start')).toBeVisible();
  await expect(voice).toBeVisible();
  await expect(audioPanel.getByTestId('mic-place-notice')).toHaveText('周りの人の声が入らない場所で使ってください。');

  // 背景に画像を選ぶ欄にも、同じ注意を出す
  await page.getByTestId('bg-image').click();
  await expect(page.getByTestId('rights-notice-background')).toContainText('作者や権利者が決めた利用条件');
  await expectClean(page, seen);
});

test('「サンプルで試す」で見本の4枚とテスト音が入り、再生すると口が3つの形に動く', async ({ page }) => {
  test.setTimeout(60_000);
  const seen = await open(page);
  await loadSample(page);
  await expect(page.locator('[data-testid^="slot-"] img')).toHaveCount(4);
  await expect(page.locator('.audio-file-name')).toHaveText('動作確認用テスト音.wav');

  await page.evaluate(() => {
    window.__mouths = new Set();
    window.__watch = setInterval(() => {
      const frame = window.__lipSyncDebug?.getFrame();
      if (frame) window.__mouths.add(frame.mouth);
    }, 20);
  });
  await page.getByTestId('audio-play').click();
  await page.waitForFunction(() => window.__mouths.size === 3, null, { timeout: 16_000 });
  await page.getByTestId('audio-pause').click();
  expect(await page.evaluate(() => {
    clearInterval(window.__watch);
    return [...window.__mouths].sort();
  })).toEqual(['closed', 'open', 'small']);
  // 選んだ音声は blob: のURLで鳴らす（このDayの media-src に blob: が無いと、ここで止まる）
  expect(await page.evaluate(() => document.querySelector('audio')?.src.startsWith('blob:'))).toBe(true);
  await expectClean(page, seen);
});

test('録画の通し：見本の音声の最初から録って自動で止まり、blob: のプレビューと保存のリンクが出る', async ({ page }) => {
  test.setTimeout(90_000);
  const seen = await open(page);
  await loadSample(page);
  await page.getByTestId('preset-square').click();
  await page.getByTestId('bg-green').click();
  await expect(page.getByTestId('record-autoplay')).toBeChecked();
  await page.getByTestId('record-start').click();
  await expect(page.getByTestId('record-stop')).toBeVisible();
  await expect(page.getByTestId('download-video')).toBeVisible({ timeout: 40_000 });

  const preview = page.getByTestId('record-preview');
  await page.waitForFunction(() => {
    const video = document.querySelector('[data-testid="record-preview"]');
    return video && video.readyState >= 1 && video.videoWidth > 0 && Number.isFinite(video.duration);
  });
  const video = await preview.evaluate((node) => ({ src: node.src, width: node.videoWidth, height: node.videoHeight, duration: node.duration }));
  expect(video.src.startsWith('blob:')).toBe(true);
  expect([video.width, video.height]).toEqual([1080, 1080]);
  expect(video.duration).toBeGreaterThan(12);
  expect(video.duration).toBeLessThan(19);
  await expect(page.getByTestId('download-video')).toHaveAttribute('download', /^character-animation-\d{8}-\d{6}\.(?:mp4|webm)$/);
  await expectClean(page, seen);
});

test('ライセンス表示のリンクは公開フォルダの中を指して200で開け、認証版の表示は配っていない', async ({ page }) => {
  const seen = await open(page);
  const href = await page.getByTestId('third-party-notices').getAttribute('href');
  expect(href).toBe('./legal/THIRD_PARTY_NOTICES.txt');
  const { pathname } = new URL(href, page.url());
  expect(pathname).toBe(`/${DIR}/legal/THIRD_PARTY_NOTICES.txt`);
  const notices = await page.request.get(pathname);
  expect(notices.status()).toBe(200);
  const text = await notices.text();
  expect(text.split('\n')[0]).toBe(`${APP_NAME} — Third-Party Software Notices`);
  expect(text).toMatch(/^- react \S+ \(MIT\)$/m);
  expect((await page.request.get(`/${DIR}/legal/SERVER_THIRD_PARTY_NOTICES.txt`)).status()).toBe(404);
  expect((await page.request.get(`/${DIR}/sample/README.md`)).status()).toBe(200);
  await expectClean(page, seen);
});

test('規約・プライバシー・Cookieの説明を画面の下のリンクから読めて、スタジオに戻れる', async ({ page }) => {
  const seen = await open(page);
  const footer = page.locator('.legal-footer');
  await expect(footer).toContainText('運営：100 DAYS / 100 APPS（haranishi）');
  await footer.getByRole('link', { name: '利用規約' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '利用規約' })).toBeVisible();
  expect(await page.title()).toBe(`利用規約 | ${APP_NAME}`);
  const operator = page.getByTestId('legal-operator');
  await expect(operator).toContainText('100 DAYS / 100 APPS（haranishi）');
  await expect(operator.getByRole('link', { name: 'X @haranishi_ikki' })).toHaveAttribute('href', 'https://x.com/haranishi_ikki');
  await expect(operator.getByRole('link', { name: 'GitHub の Issue' })).toHaveAttribute('href', 'https://github.com/haranishi/hundred-days/issues');

  await page.locator('.legal-page .legal-links').getByRole('link', { name: 'プライバシーポリシー' }).click();
  const doc = page.getByTestId('legal-document');
  await expect(page.getByRole('heading', { level: 1, name: 'プライバシーポリシー' })).toBeVisible();
  await expect(doc.getByRole('link', { name: /100 DAYS \/ 100 APPS のプライバシーポリシー/ })).toHaveAttribute('href', 'https://hundred-days.pages.dev/privacy.html');
  await expect(doc).toContainText('このアプリのページにアクセス解析はありません');
  await expect(doc).not.toContainText('ローカル版');

  await page.locator('.legal-page .legal-links').getByRole('link', { name: 'Cookie・端末保存' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cookie・端末保存の説明' })).toBeVisible();
  await page.getByTestId('legal-back').click();
  await expect(page.getByRole('heading', { name: '声にあわせて、動きだす。' })).toBeVisible();
  expect(await page.title()).toBe(APP_NAME);
  await expectClean(page, seen);
});

test('390px 幅でも横にはみ出さず、帯のリンクとボタンは44px以上', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const seen = await open(page);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  for (const selector of ['[data-action="day-index"]', '[data-action="share-app"]']) {
    const box = await page.locator(selector).boundingBox();
    expect(box.height, selector).toBeGreaterThanOrEqual(44);
    expect(box.width, selector).toBeGreaterThanOrEqual(44);
  }
  // 見本を入れて、背景の画像の欄と注意書きを開いても、規約の画面でも、はみ出さない
  await loadSample(page);
  await page.getByTestId('bg-image').click();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.locator('.legal-footer').getByRole('link', { name: 'プライバシーポリシー' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'プライバシーポリシー' })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await expectClean(page, seen);
});

/* UI採点1周目（スクショだけの採点で12/20）の直しを固定する。H1・H2・M1〜M4・M8〜M10 */
test('スマホ幅：見本を入れたら「▶ 再生してみる」で、プレビューが画面に入ってから鳴る。プレビューの再生操作は音声の欄と同じ状態', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const seen = await open(page);
  const sample = page.getByTestId('load-sample');
  // 素材がそろうまでは「サンプルで試す」が塗りの主役。スマホでも「外へ送らない」を補足の下に出す
  await expect(sample).toHaveClass(/is-primary/);
  await expect(page.locator('.sample-privacy')).toBeVisible();
  await expect(page.locator('.sample-privacy')).toHaveText('素材は端末の外に送られません');
  await loadSample(page);
  await expect(sample).not.toHaveClass(/is-primary/);

  const tryIt = page.getByRole('button', { name: '再生してみる' });
  await expect(tryIt).toBeVisible();
  await tryIt.click();
  await expect(page.getByTestId('preview-canvas')).toBeInViewport({ ratio: 0.9 });
  await expect(page.getByTestId('preview-pause')).toBeVisible();
  await expect(page.getByTestId('audio-pause')).toHaveCount(1);
  await expect(page.getByTestId('status-mouth')).not.toContainText('closed');
  await page.getByTestId('preview-pause').click();
  await expect(page.getByTestId('preview-play')).toBeVisible();
  await expect(page.getByTestId('audio-play')).toHaveCount(1);
  await expect(page.locator('.audio-transport-preview .audio-time')).toHaveText(/^\d:\d{2} \/ 0:14$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await expectClean(page, seen);
});

test('表記と選択の印をそろえ、「ご注意」は全文のまま補足文の大きさ・色で、音声の欄では末尾に置く', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const seen = await open(page);
  // PC では「サンプルで試す」を説明文の直下・左寄せに置く（見出しと左端がそろう）
  const left = async (locator) => (await locator.boundingBox()).x;
  expect(Math.abs((await left(page.getByTestId('load-sample'))) - (await left(page.locator('#studio-title'))))).toBeLessThanOrEqual(2);
  await expect(page.locator('.sample-privacy')).toBeHidden();
  await loadSample(page);

  // カードの見出しに、ステップ表示と食い違う番号を付けない
  await expect(page.getByText('01 / CHARACTER')).toHaveCount(0);
  await expect(page.getByText('02 / AUDIO')).toHaveCount(0);
  // 口の状態・まばたき・レベル・大きさ・時間・倍率の書き方
  await expect(page.getByTestId('status-mouth').locator('strong')).toHaveText('とじ');
  await expect(page.getByTestId('status-blink').locator('strong')).toHaveText('ひらいている');
  await expect(page.getByTestId('status-level')).toContainText('入力レベル');
  await expect(page.getByTestId('status-level').locator('strong')).toHaveText('0.00');
  await expect(page.locator('.preview-caption .mono')).toHaveText('1,080 × 1,920 px');
  await expect(page.locator('.canvas-size-hint')).toHaveText('1,080 × 1,920 px');
  await expect(page.getByRole('timer', { name: '録画時間' })).toHaveText('0:00');
  await expect(page.locator('output', { hasText: '×' })).toHaveText(['3.00×', '1.00×']);
  // 選んでいるものには、色のほかに ✓ が付く
  await expect(page.getByTestId('preset-shorts')).toContainText('✓');
  await expect(page.getByTestId('preset-youtube')).not.toContainText('✓');
  await expect(page.getByTestId('audio-mode-file')).toContainText('✓');
  await expect(page.getByTestId('audio-mode-mic')).not.toContainText('✓');

  // 「ご注意」は全文をいつも出し、本文は補足文と同じ大きさ・色。音声の欄では口パクの調整より後ろ
  const notice = page.getByTestId('rights-notice-voice');
  await expect(notice).toContainText('提供元の規約で公開が制限されていることがあります。');
  const style = (locator) => locator.evaluate((node) => [getComputedStyle(node).fontSize, getComputedStyle(node).color]);
  expect(await style(notice)).toEqual(await style(page.locator('.asset-intro')));
  expect((await notice.boundingBox()).y).toBeGreaterThan((await page.getByTestId('threshold-open').boundingBox()).y);
  // 日本語の折り返し：行頭禁則は strict、決まった文は文節の区切り（<wbr>）と keep-all
  expect(await page.evaluate(() => getComputedStyle(document.body).lineBreak)).toBe('strict');
  expect(await page.locator('#studio-title wbr').count()).toBeGreaterThan(0);
  expect(await notice.locator('.jp-phrase').evaluate((node) => getComputedStyle(node).wordBreak)).toBe('keep-all');
  await expectClean(page, seen);
});

test('マイク：このDayのヘッダーなら「マイクを開始」で入力が始まり、サイト全体のヘッダーのままなら止まる', async ({ page, context }) => {
  test.setTimeout(60_000);
  expect(DAY_PERMISSIONS).toContain('microphone=(self)');
  expect(SITE_PERMISSIONS).toContain('microphone=()');

  const seen = await open(page);
  await page.getByTestId('audio-mode-mic').click();
  await page.getByTestId('mic-start').click();
  await expect(page.getByTestId('mic-stop')).toHaveText('マイクを停止');
  await page.waitForFunction(() => (window.__lipSyncDebug?.getFrame()?.level ?? 0) > 0.02, null, { timeout: 10_000 });
  await page.getByTestId('mic-stop').click();
  await expect(page.getByTestId('mic-start')).toBeVisible();
  await expectClean(page, seen);

  // サイト全体の値（microphone=()）が当たったページでは、許可済みでもブラウザがマイクを渡さない
  const blocked = await context.newPage();
  const blockedSeen = await open(blocked, SITE_PERMISSIONS);
  await blocked.getByTestId('audio-mode-mic').click();
  await blocked.getByTestId('mic-start').click();
  await expect(blocked.getByRole('alert')).toContainText('マイクの使用が許可されませんでした');
  await expect(blocked.getByTestId('mic-stop')).toHaveCount(0);
  // 方針で止めたときのブラウザの警告はコンソールに出ることがあるので、ここでは例外と通信だけを見る
  expect(blockedSeen.outside).toEqual([]);
  expect(blockedSeen.errors.filter((message) => !/permissions policy|NotAllowedError|Permission denied/i.test(message))).toEqual([]);
});
