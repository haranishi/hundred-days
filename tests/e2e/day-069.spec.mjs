import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { EXAMPLE, TAX_WALLS, AGE_BANDS, HEALTH, META, NOTES, SOURCES } from '../../day-069-nenshu-kabe/lib/rules-2026.js';

// 下書き。実行時はメイン担当が一時的に published にして index:sync → build する。
// serve-dist.mjs はヘッダーを付けないため、ビルドが生成したCSPを応答に当てる。
const DIR = 'day-069-nenshu-kabe';
const PATH = `/${DIR}/`;
const KEY = 'day069-nenshu-kabe:v1';
const PUBLIC_URL = `https://rairakku.com/100days${PATH}`;
const headers = existsSync('dist/_headers') ? readFileSync('dist/_headers', 'utf8') : '';
const policy = (headers.split(`\n/${DIR}/*\n`)[1] ?? '').split('\n')[0].trim().replace('Content-Security-Policy: ', '');
const yen = (value) => `${value.toLocaleString('ja-JP')}円`;
const wall = (page, id) => page.locator(`[data-wall="${id}"]`);
const selfThreshold = TAX_WALLS.find(({ id }) => id === 'self-income-tax').threshold;
const yearLabel = `${META.year}年の制度で計算${META.label.slice(META.label.indexOf('（')).replace('。', '・')}`;

test.beforeAll(() => {
  expect(existsSync(`dist/${DIR}/index.html`), `dist に ${DIR} がありません。確認中だけ meta.json を published にし、npm run index:sync → npm run build を実行してください。終了後は draft に戻します。`).toBe(true);
  expect(policy, `dist/_headers に ${DIR} のCSPがありません。確認用の公開状態で再ビルドしてください。`).toContain("script-src 'self'");
  // 入力を外へ送れないことを、ブラウザの決まりでも固定する（接続先は自分のオリジンだけ）
  const connect = policy.split(';').map((part) => part.trim()).filter((part) => part.startsWith('connect-src'));
  expect(connect, 'Day069 の connect-src').toEqual(["connect-src 'self'"]);
});

const runs = new WeakMap();

async function open(page, { date = '2026-10-17T03:00:00Z' } = {}) {
  const seen = { errors: [], outside: [], violations: [] };
  runs.set(page, seen);
  await page.clock.install({ time: new Date(date) });
  page.on('pageerror', (error) => seen.errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') seen.errors.push(message.text()); });
  await page.exposeFunction('__reportDay069Violation', (message) => seen.violations.push(message));
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      const message = `${event.violatedDirective} ${event.blockedURI}`;
      window.__cspViolations.push(message);
      window.__reportDay069Violation(message);
    });
  });
  const origin = new URL(test.info().project.use.baseURL).origin;
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === origin) return route.fallback();
    seen.outside.push(route.request().url());
    return route.abort();
  });
  await page.route(`**${PATH}`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
  });
  await page.goto(PATH);
  await ready(page);
  return seen;
}

async function ready(page) {
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#share .share')).toHaveCount(1);
}

test.afterEach(async ({ page }) => {
  const seen = runs.get(page);
  if (!seen || page.isClosed()) return;
  expect(seen.errors, 'コンソールのエラー・例外').toEqual([]);
  expect(seen.outside, '同一オリジン以外への要求').toEqual([]);
  expect(seen.violations, 'すべての再読み込みを含むCSP違反').toEqual([]);
  expect(await page.evaluate(() => window.__cspViolations), '現在のページのCSP違反').toEqual([]);
  expect(await page.locator('body').innerText()).not.toMatch(/\bnull\b|\bundefined\b|\bNaN\b|\[object /);
});

async function enterOwn(page, inputs = EXAMPLE) {
  await page.getByRole('button', { name: '自分の数字を入れる', exact: true }).click();
  await page.locator('#age-band').selectOption(inputs.ageBand);
  await page.locator('#student').setChecked(inputs.student);
  for (const [id, value] of Object.entries({
    'paid-so-far': inputs.paidSoFar, 'hourly-wage': inputs.hourlyWage,
    'remaining-paydays': inputs.remainingPaydays, 'hours-per-payday': inputs.hoursPerPayday,
  })) await page.locator(`#${id}`).fill(value === null ? '' : String(value));
  await expect(page.locator('#invalid-result')).toBeHidden();
}

const stored = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const timelineOrder = (page) => page.locator('#wall-timeline > li').evaluateAll((items) => items.map((item) => item.dataset.wall ?? item.dataset.marker));

test('例で開く。結果・注意書き・12目盛りがあり、エラー・CSP違反・外部通信は0件', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { name: '年収の壁時計', level: 1 })).toBeVisible();
  await expect(page.locator('#example-banner')).toBeVisible();
  await expect(page.locator('#result-title')).toContainText('例');
  await expect(page.locator('#result-mode')).toHaveText('架空の例');
  await expect(page.locator('#nearest-main')).toHaveText('あと約75時間');
  await expect(page.locator('#nearest-money')).toContainText(yen(90_000));
  await expect(page.locator('#clock-ticks line')).toHaveCount(12);
  await expect(page.locator('#result-disclaimer')).toHaveText(NOTES.disclaimer);
  await expect(page.locator('#year-label .year-line')).toHaveText([yearLabel, `確認日：${META.checkedOnLabel}`]);
  await expect(page.locator('#year-banner')).toBeHidden();
  await expect(wall(page, 'resident-flat')).toContainText('△ 予定だと越える');
  await expect(wall(page, 'resident-flat')).toContainText('2回目の給料日で越える見込み（予定どおりなら146,000円超過）');
  await expect(wall(page, 'resident-flat').locator('[data-range="low"]')).toContainText('1回目の給料日で越える見込み（予定どおりなら216,000円超過）');
  // 結果カード：名前の下に用語の言い換えと「◯円を超えると」。範囲の壁は2段の状態欄で、時計が数えている段（112万円）が先
  await expect(page.locator('#nearest-name')).toHaveText('本人に住民税の均等割がかかり始める');
  await expect(page.locator('#nearest-gloss')).toHaveText('均等割＝所得にかかわらない定額の部分');
  await expect(page.locator('#nearest-threshold')).toHaveText('112万〜119万円を超えると（市区町村で違う）');
  await expect(page.locator('#nearest-status .wall-status')).toHaveText([
    '△ 基準112万円の市区町村：1回目の給料日で越える見込み（予定どおりなら216,000円超過）',
    '△ 基準119万円の市区町村：2回目の給料日で越える見込み（予定どおりなら146,000円超過）',
  ]);
  await expect(page.locator('#clock-ratio')).toHaveText('支払い済み 103万円 ／ 基準 112万円');
  await expect(page.locator('#nearest-live')).toHaveText(`いちばん近い壁まであと${yen(90_000)}`);
});

test('自分の数字へ切り替えると例を消して最初の欄へ移る。給料日は10月なら3回', async ({ page }) => {
  await open(page);
  await page.locator('#use-own').click();
  await expect(page.locator('#age-band')).toBeFocused();
  await expect(page.locator('#age-band')).toHaveValue('');
  for (const id of ['paid-so-far', 'hourly-wage', 'hours-per-payday']) await expect(page.locator(`#${id}`)).toHaveValue('');
  await expect(page.locator('#student')).not.toBeChecked();
  await expect(page.locator('#remaining-paydays')).toHaveValue('3');
  await expect(page.locator('#example-banner')).toBeVisible();
  await expect(page.locator('#banner-title')).toHaveText('あなたの数字で計算しています');
  await expect(page.locator('#banner-note')).toHaveText('入力を変えると、結果はすぐ変わります。');
  await expect(page.locator('#example-banner #use-example')).toBeVisible();
  await expect(page.locator('#input-title #use-example')).toHaveCount(0);
  await expect(page.locator('#invalid-result')).toHaveText('「年齢区分」を直すと表示します');
  await page.locator('#use-example').click();
  await expect(page.locator('#result-title')).toContainText('例');
});

test('例の表示中に欄を変えても例のまま。保存は押せず、端末に何も保存しない', async ({ page }) => {
  await open(page);
  await page.locator('#hourly-wage').fill('1300');
  await expect(page.locator('#banner-title')).toHaveText('例の数字を変えて試しています');
  await expect(page.locator('#use-own')).toBeVisible();
  await expect(page.locator('#use-example')).toBeHidden();
  await expect(page.locator('#result-mode')).toHaveText('例（一部変更）');
  await expect(page.locator('#result-title')).toContainText('例');
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'example');
  await expect(page.locator('#save-inputs')).toBeDisabled();
  await expect(page.locator('#save-inputs')).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.length), '例を変えて試しても保存しない').toBe(0);
  // 例と同じ値に戻すと「一部変更」は外れる
  await page.locator('#hourly-wage').fill(String(EXAMPLE.hourlyWage));
  await expect(page.locator('#result-mode')).toHaveText('架空の例');
  await expect(page.locator('#banner-title')).toHaveText('まずは、架空の例で。');
  // 自分の数字へ移るのは「自分の数字を入れる」を押したときだけ
  await page.locator('#use-own').click();
  await expect(page.locator('#result-mode')).toHaveText('あなたの入力');
  await expect(page.locator('#save-inputs')).toBeEnabled();
});

test('入力で同期更新し、基準ちょうどと1円多い額の表示を区別する', async ({ page }) => {
  await open(page);
  await enterOwn(page, { ...EXAMPLE, remainingPaydays: 0, paidSoFar: selfThreshold });
  await expect(wall(page, 'self-income-tax')).toHaveAttribute('data-status', 'clear');
  await expect(wall(page, 'self-income-tax')).toContainText('あと0円');
  await page.locator('#paid-so-far').fill(String(selfThreshold + 1));
  // input イベントの同じタスク内で描画を終える。タイマーの完了を待たない。
  expect(await wall(page, 'self-income-tax').getAttribute('data-status')).toBe('crossed');
  await expect(wall(page, 'self-income-tax')).toContainText('すでに越えています（1円超過）');
  await expect(page.locator('#inputs button[type="submit"]')).toHaveCount(0);
});

test('基準ちょうどの額では、いまここ・予定どおりならの印を壁の手前に置き、1円多いと後ろに置く', async ({ page }) => {
  await open(page);
  await enterOwn(page, { ageBand: 'a23p', student: false, paidSoFar: selfThreshold, hourlyWage: 1_200, remainingPaydays: 0, hoursPerPayday: 80 });
  let order = await timelineOrder(page);
  expect(order.slice(order.indexOf('paid'), order.indexOf('paid') + 3)).toEqual(['paid', 'projected', 'self-income-tax']);
  await expect(wall(page, 'self-income-tax')).toHaveAttribute('data-status', 'clear');
  await page.locator('#paid-so-far').fill(String(selfThreshold + 1));
  order = await timelineOrder(page);
  expect(order.slice(order.indexOf('self-income-tax'), order.indexOf('self-income-tax') + 3)).toEqual(['self-income-tax', 'paid', 'projected']);
});

test('年齢4区分と学生の切り替えで、壁と健康保険の基準が変わる', async ({ page }) => {
  await open(page);
  for (const { id } of AGE_BANDS) {
    await page.locator('#age-band').selectOption(id);
    await expect(wall(page, 'resident-minor')).toHaveCount(id === 'u18' ? 1 : 0);
    await expect(wall(page, 'parent-income-tax-full')).toHaveCount(id === 'a19_22' ? 1 : 0);
    if (id === 'a19_22') await expect(page.locator('#parent-section')).toBeVisible();
    else await expect(page.locator('#parent-section')).toBeHidden();
    await expect(page.locator('#health-result')).toContainText(HEALTH.bands[id === 'a19_22' ? 'a19_22' : 'general'].annualLabel);
  }
  await page.locator('#age-band').selectOption('a19_22');
  await page.locator('#student').uncheck();
  await expect(wall(page, 'resident-income-student')).toHaveCount(0);
  await expect(wall(page, 'work-student-limit')).toHaveCount(0);
  await expect(wall(page, 'resident-flat').getByRole('heading', { level: 3 })).toHaveText('本人に住民税がかかり始める');
});

test('不正な値は欄の理由とaria-invalid、結果の器の文に置き換わる。修正で戻る', async ({ page }) => {
  await open(page);
  await page.locator('#hourly-wage').fill('0');
  await expect(page.locator('#hourlyWage-error')).toContainText('1円以上');
  await expect(page.locator('#hourly-wage')).toHaveAttribute('aria-invalid', 'true');
  expect(await page.locator('#hourlyWage-error').evaluate((element) => ({ radius: getComputedStyle(element).borderRadius, gap: getComputedStyle(element).marginTop }))).toEqual({ radius: '6px', gap: '6px' });
  for (const id of ['invalid-result', 'walls-invalid', 'health-invalid']) await expect(page.locator(`#${id}`)).toHaveText('「時給」を直すと表示します');
  for (const id of ['clock-result', 'wall-timeline', 'health-result']) await expect(page.locator(`#${id}`)).toBeHidden();
  await expect(page.locator('#result-disclaimer')).toBeVisible();
  await page.locator('#invalid-result').click();
  await expect(page.locator('#hourly-wage')).toBeFocused();
  await page.locator('#hourly-wage').fill(String(EXAMPLE.hourlyWage));
  await expect(page.locator('#hourly-wage')).toHaveAttribute('aria-invalid', 'false');
  await expect(page.locator('#clock-result')).toBeVisible();
});

test('全角・カンマの入力、時給なし、残り0回、すべて越えた表示と読み上げ', async ({ page }) => {
  await open(page);
  await enterOwn(page);
  await page.locator('#paid-so-far').fill('１，０３０，０００');
  await page.locator('#hourly-wage').fill('');
  await expect(page.locator('#nearest-main')).toHaveText(`あと${yen(90_000)}`);
  await expect(wall(page, 'self-income-tax').locator('.wall-remaining').first()).not.toContainText('時間');
  await page.locator('#remaining-paydays').fill('0');
  await expect(wall(page, 'self-income-tax')).toContainText('残りの給料日が0回');
  await page.locator('#paid-so-far').fill('3000000');
  await expect(page.locator('#nearest-main')).toHaveText('表示している壁はすべて越えています');
  await expect(page.locator('#nearest-live')).toHaveText('表示している壁はすべて越えています');
});

test('現在額と予定額の印は金額の位置に入る。各壁の出典と確認日、親の現在の段がある', async ({ page }) => {
  await open(page);
  const amounts = await page.locator('#wall-timeline > li').evaluateAll((nodes) => nodes.map((item) => Number(item.dataset.amount)));
  expect(amounts).toEqual([...amounts].sort((a, b) => a - b));
  await expect(page.locator('[data-marker="paid"]')).toContainText(yen(EXAMPLE.paidSoFar));
  await expect(page.locator('[data-marker="projected"]')).toContainText(yen(1_336_000));
  expect(await page.locator('[data-marker="projected"]').evaluate((el) => el.previousElementSibling.dataset.wall)).toBe('resident-flat');
  expect(await page.locator('[data-marker="projected"]').evaluate((el) => el.nextElementSibling.dataset.wall)).toBe('parent-dependent');
  for (const details of await page.locator('.wall-card details.wall-source').all()) {
    await details.locator('summary').click();
    await expect(details.locator('summary')).toHaveText('判定の単位・窓口・出典');
    await expect(details.locator('dl')).toContainText('判定の単位');
    await expect(details.locator('dl')).toContainText('確かめる窓口');
    await expect(details.locator('dl')).toContainText('基準額の出し方');
    await expect(details.locator('.source-list')).toContainText(META.checkedOnLabel);
    await expect(details.locator('.source-list > p')).toHaveText(`次の資料をもとに作者が要約・計算しています（確認日：${META.checkedOnLabel}）`);
    await expect(details.locator('.source-list')).toContainText('をもとに作者が要約・計算');
    for (const link of await details.locator('.source-list a').all()) await expect(link).toHaveAttribute('href', /^https:\/\//);
  }
  await expect(page.locator('#parent-table tr[data-current="true"]')).toHaveCount(1);
  await expect(page.locator('#parent-table tr[data-current="true"]')).toHaveClass('deduction-current');
  await expect(page.locator('#parent-table tr[data-current="true"] th .deduction-mark')).toHaveCount(1);
  await expect(page.locator('#parent-table td .deduction-mark')).toHaveCount(0);
  await expect(page.locator('.wall-card > dl')).toHaveCount(0);
});

test('出典は、題名を確かめた資料だけ「」で囲み、確かめられない資料は「」なしの説明で出す', async ({ page }) => {
  await open(page);
  const links = page.locator('#all-sources a');
  for (const [id, source] of Object.entries(SOURCES)) {
    const text = source.exact ? `${source.publisher}「${source.title}」` : `${source.publisher} ${source.title}`;
    await expect(links.filter({ hasText: source.title }), id).toHaveText(text);
    await expect(links.filter({ hasText: source.title }), id).toHaveAttribute('href', source.url);
  }
  expect(Object.values(SOURCES).some(({ exact }) => !exact), '「」なしの資料が1件以上ある').toBe(true);
  await expect(page.locator('#references')).toContainText(`${SOURCES.ntaNencho.publisher} ${SOURCES.ntaNencho.title}`);
  await expect(page.locator('#references')).not.toContainText(`「${SOURCES.ntaNencho.title}」`);
});

test('結果カードの名前と基準額は別の行で、「◯円を超えると」の向きで書く', async ({ page }) => {
  await open(page);
  await enterOwn(page, { ageBand: 'a23p', student: false, paidSoFar: 1_700_000, hourlyWage: 1_200, remainingPaydays: 2, hoursPerPayday: 80 });
  await expect(page.locator('#nearest-name')).toHaveText('本人に所得税がかかり始める');
  await expect(page.locator('#nearest-gloss')).toBeHidden();
  await expect(page.locator('#nearest-threshold')).toHaveText('178万円を超えると');
  await expect(page.locator('#nearest-status .wall-status')).toHaveText(['△ 予定だと越える：1回目の給料日で越える見込み（予定どおりなら112,000円超過）']);
  const text = await page.locator('#result-card').innerText();
  expect(text, '名前と基準額を「·」「・」でつながない').not.toMatch(/[·・] ?\d/);
  expect(text.split('\n').map((line) => line.trim()).filter((line) => /^[·・]/.test(line)), '行頭の「・」').toEqual([]);
  expect(text).not.toMatch(/万円以下$/m);
  // 壁カードの大きな基準額の行も同じ向き
  await expect(wall(page, 'self-income-tax').locator('.wall-threshold')).toContainText('178万円を超えると');
  await expect(wall(page, 'resident-flat').locator('.wall-threshold')).toContainText('112万〜119万円を超えると（市区町村で違う）');
  await expect(page.locator('.walls-section .section-intro').first()).toContainText('1円でも超えると越えます');
});

test('112万〜119万円の壁は小さい順の2行で示し、範囲の中の額の印はカードの中の2行のあいだに出す', async ({ page }) => {
  await open(page);
  const card = wall(page, 'resident-flat');
  const rows = () => card.locator('.range-rows > li').evaluateAll((items) => items.map((item) => item.dataset.range ?? item.dataset.marker));
  // 例（103万円）：112万円の段がいちばん近く、印はカードの外
  expect(await rows()).toEqual(['low', 'high']);
  await expect(card.locator('[data-range="low"] .nearest-tag')).toHaveText('いちばん近い');
  await expect(page.locator('#wall-timeline > [data-marker="paid"]')).toHaveCount(1);
  await enterOwn(page, { ...EXAMPLE, paidSoFar: 1_150_000 });
  // 112万円の段だけ越えたら、結果カードは119万円の段で数え、×の行を△の行のすぐ下に置く
  await expect(page.locator('#nearest-main')).toHaveText(`あと約${Math.floor(40_000 / EXAMPLE.hourlyWage)}時間`);
  await expect(page.locator('#nearest-money')).toContainText(yen(40_000));
  await expect(page.locator('#clock-ratio')).toHaveText('支払い済み 115万円 ／ 基準 119万円');
  await expect(page.locator('#nearest-status .wall-status')).toHaveText([
    '△ 基準119万円の市区町村：1回目の給料日で越える見込み（予定どおりなら266,000円超過）',
    '× 基準112万円の市区町村：越えた（30,000円超過）',
  ]);
  // ×の札は押せる部品の紺の塗りにしない（白地に紺の太枠）
  const crossedLook = await page.locator('#nearest-status .wall-status--crossed').evaluate((element) => ({ background: getComputedStyle(element).backgroundColor, border: getComputedStyle(element).borderTopWidth }));
  const buttonLook = await page.locator('#use-example').evaluate(() => getComputedStyle(document.querySelector('.button-primary')).backgroundColor);
  expect(crossedLook.background).not.toBe(buttonLook);
  expect(crossedLook).toEqual({ background: 'rgb(255, 253, 248)', border: '2px' });
  expect(await rows()).toEqual(['low', 'paid', 'high']);
  await expect(card.locator('[data-range="low"] .range-tier')).toHaveText('基準112万円の市区町村');
  await expect(card.locator('[data-range="high"] .range-tier')).toContainText('基準119万円の市区町村');
  // 結果カードで使っている段（119万円）にだけ「いちばん近い」の印
  await expect(card.locator('.nearest-tag')).toHaveCount(1);
  await expect(card.locator('[data-range="high"] .nearest-tag')).toHaveText('いちばん近い');
  // 外の目盛りに同じ印を重ねて出さない
  await expect(page.locator('#wall-timeline > [data-marker="paid"]')).toHaveCount(0);
  await expect(page.locator('[data-marker="paid"]')).toHaveCount(1);
  // 越えた段は札1つ（「越えた」と「すでに越えています」を重ねない）
  const low = card.locator('[data-range="low"]');
  await expect(low.locator('.wall-status')).toHaveText('× すでに越えています（30,000円超過）');
  await expect(low.locator('.wall-remaining')).toHaveCount(0);
  await expect(low).not.toContainText('越えた');
  // 範囲の両端ちょうどの額：112万円はカードの手前、119万円はカードの中の119万円の行の手前
  await page.locator('#paid-so-far').fill('1120000');
  expect(await rows()).toEqual(['low', 'high']);
  let order = await timelineOrder(page);
  expect(order.slice(order.indexOf('paid'), order.indexOf('paid') + 2)).toEqual(['paid', 'resident-flat']);
  await page.locator('#paid-so-far').fill('1190000');
  expect(await rows()).toEqual(['low', 'paid', 'high']);
  await page.locator('#paid-so-far').fill('1190001');
  order = await timelineOrder(page);
  expect(order.slice(order.indexOf('resident-flat'), order.indexOf('resident-flat') + 2)).toEqual(['resident-flat', 'paid']);
});

test('保存は最初オフで、例の数字は保存せず、保存の操作は無効', async ({ page }) => {
  await open(page);
  await expect(page.locator('#save-inputs')).not.toBeChecked();
  await expect(page.locator('#save-inputs')).toBeDisabled();
  await expect(page.locator('#delete-inputs')).toBeDisabled();
  await expect(page.locator('#delete-inputs')).toBeHidden();
  await expect(page.locator('#save-status')).toContainText('保存オフ');
  expect(await page.locator('#save-status').evaluate((element) => getComputedStyle(element).color), '状態の文は本文の色').toBe('rgb(30, 35, 51)');
  expect(await stored(page)).toBeNull();
  await page.reload();
  await ready(page);
  expect(await stored(page)).toBeNull();
});

test('保存をオンにすると、再読み込みで入力と保存オンを復元する', async ({ page }) => {
  await open(page);
  await enterOwn(page, { ...EXAMPLE, paidSoFar: 987_654 });
  await page.locator('#save-inputs').check();
  await expect(page.locator('#delete-inputs')).toBeVisible();
  await expect(page.locator('#save-status')).toContainText('保存オン');
  expect(JSON.parse(await stored(page)).paidSoFar).toBe(987_654);
  await page.reload();
  await ready(page);
  await expect(page.locator('#paid-so-far')).toHaveValue('987654');
  await expect(page.locator('#save-inputs')).toBeChecked();
  await expect(page.locator('#save-status')).toContainText('復元');
  await expect(page.locator('#example-banner')).toContainText('あなたの数字で計算しています');
});

test('削除で保存内容が消えて例に戻る。例は新しく保存しない', async ({ page }) => {
  await open(page);
  await enterOwn(page);
  await page.locator('#save-inputs').check();
  await page.locator('#delete-inputs').click();
  expect(await stored(page)).toBeNull();
  await expect(page.locator('#example-banner')).toBeVisible();
  await expect(page.locator('#save-inputs')).not.toBeChecked();
  await expect(page.locator('#save-inputs')).toBeDisabled();
  await expect(page.locator('#delete-inputs')).toBeHidden();
  await expect(page.locator('#save-status')).toContainText('保存した入力を削除しました');
});

test('保存オフで保存済み入力を消し、再読み込みでは例に戻る', async ({ page }) => {
  await open(page);
  await enterOwn(page);
  await page.locator('#save-inputs').check();
  await page.locator('#save-inputs').uncheck();
  await expect(page.locator('#delete-inputs')).toBeHidden();
  expect(await stored(page)).toBeNull();
  await expect(page.locator('#paid-so-far')).toHaveValue(String(EXAMPLE.paidSoFar));
  await page.reload();
  await ready(page);
  await expect(page.locator('#example-banner')).toBeVisible();
});

test('保存オンのまま例に戻すと保存した入力が残っていると示し、自分の数字に戻ると保存オンが続いて新しい入力で上書きする', async ({ page }) => {
  await open(page);
  await enterOwn(page, { ...EXAMPLE, paidSoFar: 500_000 });
  await page.locator('#save-inputs').check();
  await page.locator('#use-example').click();
  await expect(page.locator('#paid-so-far')).toHaveValue(String(EXAMPLE.paidSoFar));
  // 表示と端末の中身をそろえる：保存した入力がある間はチェックが付いたまま、押せない
  await expect(page.locator('#save-inputs')).toBeChecked();
  await expect(page.locator('#save-inputs')).toBeDisabled();
  await expect(page.locator('#save-status')).toContainText('この端末に保存した入力が残っています');
  await expect(page.locator('#save-status')).toContainText('保存した入力を削除');
  await expect(page.locator('#delete-inputs')).toBeVisible();
  expect(JSON.parse(await stored(page)).paidSoFar, '戻り道で保存した入力を消さない').toBe(500_000);
  // 例を変えて試しても、保存した入力はそのまま
  await page.locator('#hourly-wage').fill('1300');
  expect(JSON.parse(await stored(page)).paidSoFar).toBe(500_000);
  await page.locator('#use-own').click();
  await expect(page.locator('#save-inputs')).toBeChecked();
  await expect(page.locator('#save-inputs')).toBeEnabled();
  await expect(page.locator('#save-status')).toContainText('入力を直すと保存します');
  expect(JSON.parse(await stored(page)).paidSoFar, '正しい入力になるまでは前の保存のまま').toBe(500_000);
  await page.locator('#age-band').selectOption(EXAMPLE.ageBand);
  await page.locator('#student').setChecked(EXAMPLE.student);
  await page.locator('#paid-so-far').fill('640000');
  await expect(page.locator('#save-inputs')).toBeChecked();
  expect(JSON.parse(await stored(page)).paidSoFar).toBe(640_000);
  await page.reload();
  await ready(page);
  await expect(page.locator('#paid-so-far')).toHaveValue('640000');
  await expect(page.locator('#save-inputs')).toBeChecked();
  await expect(page.locator('#example-banner')).toContainText('あなたの数字で計算しています');
});

test('準備のあとの入力・再計算・保存・削除では、どこへも要求を出さない。目印の数字は要求に入らず、保存オフでは端末に何も残らない', async ({ page, context }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await open(page);
  const beforeOperations = requests.length;
  const marker = 987_654;
  await enterOwn(page, { ...EXAMPLE, paidSoFar: marker, hourlyWage: 1_357 });
  await page.locator('#paid-so-far').fill(String(marker + 1));
  await page.locator('#paid-so-far').fill(String(marker));
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookie: document.cookie })), '保存オフで入力したあと').toEqual({ local: 0, session: 0, cookie: '' });
  expect(await context.cookies()).toEqual([]);
  await page.locator('#save-inputs').check();
  expect(JSON.parse(await stored(page)).paidSoFar).toBe(marker);
  await page.locator('#save-inputs').uncheck();
  expect(await stored(page)).toBeNull();
  await page.locator('#save-inputs').check();
  await page.locator('#delete-inputs').click();
  expect(await stored(page)).toBeNull();
  // 遅れて出る要求も拾うため、少し待ってから数える
  await page.waitForTimeout(300);
  expect(requests.slice(beforeOperations), '準備のあとの要求（オリジンを問わない）').toEqual([]);
  expect(requests.filter((url) => /987(?:,|%2C)?654/i.test(url)), '目印の数字を含む要求').toEqual([]);
});

test('保存の失敗文は操作ごとに合わせる（読み込みの失敗にサイトデータの案内を付けない）', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
  });
  await open(page);
  await expect(page.locator('#save-status')).toContainText('読み込めませんでした');
  await expect(page.locator('#save-status')).not.toContainText('サイトデータ');
});

for (const failure of ['setItem', 'removeItem', 'localStorage']) {
  test(`${failure}が例外を投げても失敗を表示し、計算は続く`, async ({ page }) => {
    await page.addInitScript((which) => {
      if (which === 'localStorage') Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
      else Storage.prototype[which] = () => { throw new DOMException('blocked', 'QuotaExceededError'); };
    }, failure);
    await open(page);
    await enterOwn(page);
    // チェックは端末の中身に合わせて戻ることがあるので、押したあとの状態を個別に確かめる
    await page.locator('#save-inputs').click();
    if (failure === 'removeItem') {
      await expect(page.locator('#save-inputs')).toBeChecked();
      await page.locator('#save-inputs').click();
      // 消せなかった入力が残っているので、保存オンのまま示す
      await expect(page.locator('#save-inputs')).toBeChecked();
      await expect(page.locator('#save-status')).toContainText('削除できませんでした');
      await expect(page.locator('#save-status')).toContainText('サイトデータから削除できます');
    } else {
      await expect(page.locator('#save-inputs')).not.toBeChecked();
      await expect(page.locator('#save-status')).toContainText('保存できませんでした');
      await expect(page.locator('#save-status')).not.toContainText('サイトデータ');
    }
    await page.locator('#paid-so-far').fill(String(selfThreshold + 1));
    await expect(wall(page, 'self-income-tax')).toHaveAttribute('data-status', 'crossed');
    await expect(page.locator('#clock-result')).toBeVisible();
  });
}

test('共有するXとLINEの文章・URLは固定で、入力値も見込み額も含まれない', async ({ page }) => {
  await open(page);
  const x = page.getByRole('link', { name: 'Xで投稿', exact: true });
  const line = page.getByRole('link', { name: 'LINEで送る', exact: true });
  const before = [await x.getAttribute('href'), await line.getAttribute('href')];
  await enterOwn(page, { ...EXAMPLE, paidSoFar: 987_654, hourlyWage: 1_357 });
  expect([await x.getAttribute('href'), await line.getAttribute('href')]).toEqual(before);
  const shareText = await page.locator('meta[name="share:text"]').getAttribute('content');
  for (const href of before) {
    const decoded = decodeURIComponent(href);
    expect(decoded).not.toMatch(/987,?654|1,?357|1,?333,?689/);
    expect(decoded).toContain(PUBLIC_URL);
  }
  expect(new URL(before[0]).searchParams.get('text')).toBe(shareText);
  expect(new URL(before[0]).searchParams.get('url')).toBe(PUBLIC_URL);
  expect(new URL(before[1]).searchParams.get('url')).toBe(PUBLIC_URL);
});

const sizes = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }];
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const smallTargets = (page) => page.evaluate(() => [...document.querySelectorAll('a[href], button, input, select, summary')]
  .filter((element) => element.getClientRects().length && element.checkVisibility({ visibilityProperty: true }))
  // 固定バーはビューポートで別に検査する。全体を撮る検査でも固定要素を本文と混同しない。
  .filter((element) => getComputedStyle(element).position !== 'fixed')
  .map((element) => ({ name: element.id || element.textContent.slice(0, 30), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }))
  .filter(({ width, height }) => width < 43.5 || height < 43.5));

for (const size of sizes) {
  test(`${size.width}×${size.height}で横にはみ出さず、操作対象は44px以上`, async ({ page }) => {
    await page.setViewportSize(size);
    await open(page);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    expect(await smallTargets(page)).toEqual([]);
    if (size.width < 1024) {
      const inputFonts = await page.locator('#inputs input[type="text"], #inputs select').evaluateAll((elements) => elements.map((element) => parseFloat(getComputedStyle(element).fontSize)));
      expect(inputFonts.every((size) => size >= 16), 'スマホの入力文字は16px以上').toBe(true);
    }
    // カードの内側の余白は1つの値（スマホ18px・PC24px）
    const pads = await page.locator('.input-panel, .clock-panel, .content-panel, .sub-panel, .wall-card').evaluateAll((elements) => [...new Set(elements.map((element) => getComputedStyle(element).paddingLeft))]);
    expect(pads).toEqual([size.width >= 1024 ? '24px' : '18px']);
    await wall(page, 'resident-flat').locator('details.wall-source > summary').click();
    await page.locator('.about-panel summary').last().click();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    expect(await smallTargets(page)).toEqual([]);
    await enterOwn(page, { ...EXAMPLE, hourlyWage: null });
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    expect(await smallTargets(page)).toEqual([]);
    await page.locator('#paid-so-far').fill('1150000');
    expect(await overflow(page), '範囲の中に印がある場合').toBeLessThanOrEqual(1);
    await page.locator('#paid-so-far').fill('0');
    await page.locator('#hourly-wage').fill('1');
    expect(await overflow(page), '時間の桁数が多い場合').toBeLessThanOrEqual(1);
    // 全ページ合成画像を使わず、固定バー自身の寸法を測る。
    await page.locator('#hours-per-payday').evaluate((element) => element.scrollIntoView({ behavior: 'auto', block: 'start' }));
    const jump = page.locator('#result-jump');
    if (size.width < 1024) {
      await expect(jump).toBeVisible();
      const target = await jump.boundingBox();
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
      expect(await jump.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
    } else await expect(jump).toBeHidden();
    const position = await page.locator('.input-panel').evaluate((element) => getComputedStyle(element).position);
    expect(position).toBe(size.width >= 1024 ? 'sticky' : 'static');
  });
}

test('キーボードだけで入力・結果の出典・保存・削除・共有まで移動できる', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Tab'); // ホームへのリンク
  await page.keyboard.press('Tab'); // 自分の数字を入れる
  await expect(page.locator('#use-own')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#age-band')).toBeFocused();
  // 矢印キーは環境で動きが違う（macOSでは閉じた選択欄でメニューが開く）ので、先頭の文字で選ぶ
  await page.keyboard.type('19');
  await expect(page.locator('#age-band')).toHaveValue('a19_22');
  await page.keyboard.press('Tab');
  await expect(page.locator('#student')).toBeFocused();
  await page.keyboard.press('Space');
  for (const [id, value] of [['paid-so-far', EXAMPLE.paidSoFar], ['hourly-wage', EXAMPLE.hourlyWage], ['remaining-paydays', EXAMPLE.remainingPaydays], ['hours-per-payday', EXAMPLE.hoursPerPayday]]) {
    await page.keyboard.press('Tab');
    await expect(page.locator(`#${id}`)).toBeFocused();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(String(value));
  }
  await expect(page.locator('#clock-result')).toBeVisible();
  // 入力の詳しい説明、壁の出典を通り、健康保険の後の保存欄まで進む。
  let reachedInputRules = false;
  let reachedSourceBeforeSave = false;
  let reachedSave = false;
  for (let step = 0; step < 100 && !reachedSave; step += 1) {
    await page.keyboard.press('Tab');
    const active = await page.evaluate(() => ({ id: document.activeElement.id, tag: document.activeElement.tagName, text: document.activeElement.textContent }));
    if (active.tag === 'SUMMARY') {
      if (active.text === '入力の決まり（詳しく）') reachedInputRules = true;
      if (active.text === '判定の単位・窓口・出典') reachedSourceBeforeSave = true;
      await page.keyboard.press('Enter');
    }
    if (active.id === 'save-inputs') reachedSave = true;
  }
  expect(reachedInputRules).toBe(true);
  expect(reachedSourceBeforeSave).toBe(true);
  expect(reachedSave).toBe(true);
  await page.keyboard.press('Space');
  expect(await stored(page)).not.toBeNull();
  await page.keyboard.press('Tab');
  await expect(page.locator('#delete-inputs')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('#use-own')).toBeFocused();
  let reachedSource = false;
  let reachedShare = false;
  for (let step = 0; step < 120 && !reachedShare; step += 1) {
    await page.keyboard.press('Tab');
    const active = await page.evaluate(() => ({ tag: document.activeElement.tagName, text: document.activeElement.textContent }));
    if (active.tag === 'SUMMARY') {
      await page.keyboard.press('Enter');
      if (active.text === '判定の単位・窓口・出典') reachedSource = true;
    }
    if (active.tag === 'A' && active.text === 'Xで投稿') reachedShare = true;
  }
  expect(reachedSource).toBe(true);
  expect(reachedShare).toBe(true);
  const outline = await page.evaluate(() => ({ style: getComputedStyle(document.activeElement).outlineStyle, width: parseFloat(getComputedStyle(document.activeElement).outlineWidth) }));
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThanOrEqual(2);
});

test.describe('2027年の帯（端末の日付を日本時間で判定）', () => {
  test.use({ timezoneId: 'Asia/Tokyo' });

  test('2027年1月1日以降は結果より上に未対応の帯が出る', async ({ page }) => {
    await open(page, { date: '2027-01-01T03:00:00Z' });
    await expect(page.locator('#year-banner')).toBeVisible();
    await expect(page.locator('#year-banner')).toContainText('2027年分には対応していません');
    expect(await page.evaluate(() => document.getElementById('year-banner').getBoundingClientRect().top < document.getElementById('result-title').getBoundingClientRect().top)).toBe(true);
    await expect(page.locator('#year-label')).toContainText(yearLabel);
  });

  test('日本時間の2026年12月31日の終わりまでは帯を出さず、2027年1月1日0時から出す', async ({ page }) => {
    await open(page, { date: '2026-12-31T14:59:59Z' });
    await expect(page.locator('#year-banner')).toBeHidden();
    await page.clock.setSystemTime(new Date('2026-12-31T15:00:00Z'));
    await page.reload();
    await ready(page);
    await expect(page.locator('#year-banner')).toBeVisible();
  });
});

for (const reducedMotion of ['reduce', 'no-preference']) {
  test(`弧の動き：動きを減らす設定が${reducedMotion === 'reduce' ? 'あると止まる' : '無ければある（対照）'}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await open(page);
    await page.locator('#paid-so-far').fill('1000000');
    const motion = await page.locator('#clock-arc').evaluate((element) => ({ transition: getComputedStyle(element).transitionDuration, animation: getComputedStyle(element).animationName, active: element.getAnimations().length }));
    if (reducedMotion === 'reduce') expect(motion).toEqual({ transition: '0s', animation: 'none', active: 0 });
    else expect(motion.transition).toBe('0.25s');
  });
}

test('CPUを遅くしても入力から結果まで進み、保存失敗で計算が止まらない', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('blocked', 'QuotaExceededError'); };
  });
  try {
    await open(page);
    await enterOwn(page);
    await page.locator('#save-inputs').click();
    await expect(page.locator('#save-status')).toContainText('保存できませんでした');
    await expect(page.locator('#save-inputs')).not.toBeChecked();
    await page.locator('#paid-so-far').fill(String(selfThreshold + 1));
    await expect(wall(page, 'self-income-tax')).toHaveAttribute('data-status', 'crossed');
    await expect(page.locator('#clock-result')).toBeVisible();
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.detach();
  }
});

for (const width of [320, 390]) {
  test(`スマホ${width}pxは結果が入力よりDOM上でも先。自分の数字でも帯の高さを保つ`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page);
    expect(await page.locator('#result-card').evaluate((result) => Boolean(result.compareDocumentPosition(document.querySelector('.input-panel')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    expect(await page.locator('.calculator-layout').evaluate((layout) => [...layout.children].map((element) => element.getAttribute('aria-labelledby'))))
      .toEqual(['result-title', 'input-title', 'walls-title', 'health-title', 'storage-title']);
    const bannerHeight = await page.locator('#example-banner').evaluate((element) => element.getBoundingClientRect().height);
    await page.locator('#hourly-wage').fill('1300');
    await expect(page.locator('#banner-title')).toHaveText('例の数字を変えて試しています');
    expect(await page.locator('#example-banner').evaluate((element) => element.getBoundingClientRect().height), '例を変えて試すとき').toBeCloseTo(bannerHeight, 0);
    await page.locator('#use-own').click();
    await expect(page.locator('#example-banner')).toContainText('あなたの数字で計算しています');
    expect(await page.locator('#use-example').evaluate((element) => element.closest('section').id)).toBe('example-banner');
    expect(await page.locator('#example-banner').evaluate((element) => element.getBoundingClientRect().height)).toBeCloseTo(bannerHeight, 0);
  });
}

test('スマホの入力中は固定バーに概算を出し、押すと結果へ戻ってバーが隠れる。誤りのあいだは直す欄へ移る', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const jump = page.locator('#result-jump');
  const result = page.locator('#result-card');
  const paid = page.locator('#paid-so-far');
  await expect(result).toBeInViewport();
  await expect(jump).toBeHidden();
  await paid.evaluate((element) => element.scrollIntoView({ behavior: 'auto', block: 'start' }));
  await paid.focus();
  await expect(paid).toBeFocused();
  await expect(jump).toBeVisible();
  await expect(jump).toHaveText('結果を見る ↑（いちばん近い壁まで あと約75時間・概算）');
  expect(await jump.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
  await jump.click();
  await expect(result).toBeInViewport();
  await expect(result).toBeFocused();
  await expect(jump).toBeHidden();

  await page.locator('#hourly-wage').fill('');
  await page.locator('#hourly-wage').evaluate((element) => element.scrollIntoView({ behavior: 'auto', block: 'start' }));
  await expect(jump).toBeVisible();
  await expect(jump).toHaveText(`結果を見る ↑（いちばん近い壁まで あと${yen(90_000)}・概算）`);
  // 誤りのあいだは、最初の誤りの欄の名前を出し、押すとその欄へ移ってフォーカスが入る
  await paid.fill('数字');
  await page.locator('#hours-per-payday').evaluate((element) => element.scrollIntoView({ behavior: 'auto', block: 'start' }));
  await page.locator('#hours-per-payday').focus();
  await expect(jump).toHaveText('「今年、支払い済みの給料」を直すと結果が出ます');
  await expect(jump).toHaveAttribute('aria-controls', 'paid-so-far');
  await jump.click();
  await expect(paid).toBeFocused();
  await expect(paid).toBeInViewport();
  // 直すと、結果へ戻る役に戻る
  await paid.fill(String(EXAMPLE.paidSoFar));
  await expect(jump).toHaveText(`結果を見る ↑（いちばん近い壁まで あと${yen(90_000)}・概算）`);
  await jump.click();
  await expect(result).toBeInViewport();
  await expect(jump).toBeHidden();
  await expect(page.locator('#result-disclaimer')).toBeVisible();
  await page.locator('.health-panel').evaluate((element) => element.scrollIntoView({ behavior: 'auto', block: 'start' }));
  await expect(jump).toBeHidden();
});

for (const width of [1024, 1440]) {
  test(`PC${width}pxでは入力欄が900pxの高さに収まり、内側スクロールがない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    const panel = await page.locator('.input-panel').evaluate((element) => ({
      height: element.getBoundingClientRect().height, viewport: innerHeight,
      scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
      overflow: getComputedStyle(element).overflowY,
      left: element.getBoundingClientRect().left,
    }));
    expect(panel.height).toBeLessThanOrEqual(panel.viewport);
    expect(panel.scrollHeight).toBe(panel.clientHeight);
    expect(panel.overflow).toBe('visible');
    expect(await page.locator('#result-card').evaluate((element) => element.getBoundingClientRect().left)).toBeGreaterThan(panel.left);
    await expect(page.locator('#result-jump')).toBeHidden();
  });
}

test('PCで表示の高さが低いと入力欄は追従せず、最後の欄までスクロールで届く。高さ900pxでは追従する', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await open(page);
  const low = await page.locator('.input-panel').evaluate((panel) => {
    window.scrollTo(0, panel.getBoundingClientRect().bottom + window.scrollY - window.innerHeight + 16);
    return {
      position: getComputedStyle(panel).position, overflow: getComputedStyle(panel).overflowY, viewport: window.innerHeight,
      panelBottom: panel.getBoundingClientRect().bottom, lastBottom: document.getElementById('hours-per-payday').getBoundingClientRect().bottom,
    };
  });
  expect(low.position).toBe('static');
  expect(low.overflow).toBe('visible');
  expect(low.panelBottom).toBeLessThanOrEqual(low.viewport);
  expect(low.lastBottom).toBeLessThanOrEqual(low.viewport);
  await expect(page.locator('#hours-per-payday')).toBeInViewport();
  await expect(page.locator('#input-rules > summary')).toBeInViewport();
  await page.setViewportSize({ width: 1440, height: 900 });
  const tall = await page.locator('.input-panel').evaluate((panel) => ({ position: getComputedStyle(panel).position, height: panel.getBoundingClientRect().height, top: parseFloat(getComputedStyle(panel).top), viewport: window.innerHeight }));
  expect(tall.position).toBe('sticky');
  expect(tall.height + tall.top).toBeLessThanOrEqual(tall.viewport);
});

test('PCで入力の誤りが増えて入力欄が表示の高さを超えたら追従をやめ、直すと追従に戻る', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await enterOwn(page);
  const state = () => page.locator('.input-panel').evaluate((panel) => ({
    position: getComputedStyle(panel).position, fits: panel.offsetHeight + 40 <= window.innerHeight,
  }));
  expect(await state()).toEqual({ position: 'sticky', fits: true });
  // 誤りを2つ出すと入力欄が伸びる（入力欄の高さで判定するので、伸びて収まらなければ追従しない）
  await page.locator('#paid-so-far').fill('12万');
  await page.locator('#hours-per-payday').fill('8,5');
  const broken = await state();
  expect(broken.position).toBe(broken.fits ? 'sticky' : 'static');
  await page.locator('#paid-so-far').fill(String(EXAMPLE.paidSoFar));
  await page.locator('#hours-per-payday').fill(String(EXAMPLE.hoursPerPayday));
  expect(await state()).toEqual({ position: 'sticky', fits: true });
});

test('スマホの結果のエラーから、最初の誤りの欄へ移ってフォーカスする', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.locator('#hourly-wage').fill('0');
  await page.locator('#paid-so-far').fill('-1');
  await expect(page.locator('#invalid-result')).toHaveText('「今年、支払い済みの給料」を直すと表示します');
  await expect(page.locator('#paid-reading')).toBeHidden();
  await page.locator('#invalid-result').click();
  await expect(page.locator('#paid-so-far')).toBeFocused();
  await expect(page.locator('#paid-so-far')).toBeInViewport();
  expect(await page.locator('#paid-so-far').evaluate((element) => getComputedStyle(element).scrollMarginTop)).toBe('100px');
  await expect(page.locator('#result-disclaimer')).toHaveText(NOTES.disclaimer);
});

test('スマホでも金額と以下・未満、時間、年齢、確認日、切ると読みにくい言い回しをnowrapのspanにまとめる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await wall(page, 'resident-flat').locator('details.wall-source > summary').click();
  const tokens = await page.locator('span.nw').evaluateAll((elements) => elements.map((element) => ({ text: element.textContent, whiteSpace: getComputedStyle(element).whiteSpace })));
  for (const text of ['119万円以下', '112万〜119万円を超えると', '（市区町村で違う）', '約75時間', '月12万5千円未満', META.checkedOnLabel, '確認日', '令和8年4月', '19〜22歳', '1回目', '63万円',
    '216,000円超過', '1〜12月', 'このブラウザ', 'その給料は', '引かれた分は', '2027年の分', '週20時間以上', '2か所目']) {
    expect(tokens.some((token) => token.text.includes(text) && token.whiteSpace === 'nowrap'), text).toBe(true);
  }
  await page.locator('#paid-so-far').fill('1010000');
  // 「あと 約」は数字の上の行、数字と単位は改行しない1つのまとまり
  await expect(page.locator('#nearest-main > .nearest-lead')).toHaveText('あと約');
  await expect(page.locator('#nearest-main > .nw')).toHaveText('91時間');
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test('万円の読みは四捨五入せず正しい金額だけに添え、0円と親の現在の段を表示する。前年の比較は比べるための名前のリスト', async ({ page }) => {
  await open(page);
  await page.locator('#paid-so-far').fill('1150000');
  await expect(page.locator('#paid-reading')).toHaveText('＝115万円');
  await expect(page.locator('#paid-reading')).not.toHaveAttribute('aria-live', /.+/);
  // 基準の1円上と1円下を同じ読みにしない
  await page.locator('#paid-so-far').fill('1190001');
  await expect(page.locator('#paid-reading')).toHaveText('＝119万1円');
  await page.locator('#paid-so-far').fill('1189999');
  await expect(page.locator('#paid-reading')).toHaveText('＝118万9,999円');
  await page.locator('#paid-so-far').fill('0');
  await expect(page.locator('#paid-reading')).toHaveText('＝0円');
  await page.locator('#paid-so-far').fill('不正');
  await expect(page.locator('#paid-reading')).toBeHidden();
  await page.locator('#paid-so-far').fill('3000000');
  await expect(page.locator('#parent-note')).toContainText('所得税の控除 0円・住民税の控除 0円');
  await expect(page.locator('#parent-table tr[data-current="true"] td')).toHaveText(['0円', '0円']);
  await expect(page.locator('#parent-table tr[data-current="true"] .deduction-mark')).toHaveCount(1);
  const bounds = page.locator('#parent-table tbody tr').nth(1).locator('th > .deduction-bound');
  await expect(bounds).toHaveText(['136万円超〜', '159万円以下']);
  await expect(page.locator('#changes-list table')).toHaveCount(0);
  const changes = TAX_WALLS.filter(({ prev2025 }) => prev2025 !== null);
  await expect(page.locator('#changes-list ul > li')).toHaveCount(changes.length + 1);
  await expect(page.locator('#changes-list .change-name')).toHaveText([...changes.map(({ changeLabel }) => changeLabel), HEALTH.bands.a19_22.changeLabel]);
  await expect(page.locator('#changes-list ul > li').first()).toContainText('2025年 110万円以下 → 2026年 119万円以下');
  await expect(page.locator('#changes-list ul > li').last()).toContainText('2025年 130万円未満 → 2026年 150万円未満');
  await expect(page.locator('#changes-list')).not.toContainText('2026年 年');
  // 健康保険の19〜22歳の注記は健康保険の欄にあり、変化の欄には重ねない
  await expect(page.locator('#changes-list')).not.toContainText(HEALTH.bands.a19_22.note);
});

test('健康保険は1回分と月の目安の差を同じ枠で「→」の前から2行に示し、超過しても認定の判定はしない', async ({ page }) => {
  await open(page);
  await enterOwn(page, { ...EXAMPLE, hourlyWage: 1150, hoursPerPayday: 90 });
  await expect(page.locator('.health-diff')).toHaveText('給料日1回分 103,500円 → 月の目安まで 21,499円');
  await expect(page.locator('.health-diff > span')).toHaveText(['給料日1回分 103,500円', '→ 月の目安まで 21,499円']);
  expect(await page.locator('.health-diff-to').evaluate((element) => getComputedStyle(element).display)).toBe('block');
  const styles = await page.locator('#health-result').evaluate((element) => ['.health-limit', '.health-diff'].map((selector) => {
    const style = getComputedStyle(element.querySelector(selector));
    return { fontSize: style.fontSize, padding: style.padding, background: style.backgroundColor };
  }));
  expect(styles[0]).toEqual(styles[1]);
  await page.locator('#hourly-wage').fill('1300');
  await page.locator('#hours-per-payday').fill('100');
  await expect(page.locator('.health-diff')).toHaveText(`給料日1回分 130,000円 → 月の目安を ${yen(130_000 - HEALTH.bands.a19_22.monthlyMax)} 上回る見込み`);
  await expect(page.locator('#health-result')).toContainText('この比較だけでは、扶養の認定は確かめられません。');
});

test('4桁の時間（あと約1,120時間）でも、数字が文字盤の目盛りの内側に収まる', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await open(page);
  await enterOwn(page, { ...EXAMPLE, paidSoFar: 0, hourlyWage: 1_000, remainingPaydays: 3, hoursPerPayday: 80 });
  await expect(page.locator('#nearest-main')).toHaveText('あと約1,120時間');
  const fit = await page.evaluate(() => {
    const svg = document.querySelector('#clock').getBoundingClientRect();
    const main = document.querySelector('#nearest-main .nw').getBoundingClientRect();
    const inner = svg.width / 2 * (117 / 160); // 太い目盛りの内側の半径（viewBox 320 の 117）
    const center = svg.left + svg.width / 2;
    return { left: main.left - (center - inner), right: (center + inner) - main.right };
  });
  expect(fit.left, '左の目盛りとの隙間').toBeGreaterThan(0);
  expect(fit.right, '右の目盛りとの隙間').toBeGreaterThan(0);
});
