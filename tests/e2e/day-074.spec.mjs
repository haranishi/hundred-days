import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { LIMITS } from '../../day-074-link-dokumi/lib/contract.js';
import { parseInput } from '../../day-074-link-dokumi/lib/url-input.js';
import { analyzeLexical } from '../../day-074-link-dokumi/lib/lexical.js';
import { evaluate } from '../../day-074-link-dokumi/lib/rules.js';
import { SAMPLES } from '../../day-074-link-dokumi/lib/samples.js';
import { BANNED_PHRASES } from '../../day-074-link-dokumi/lib/messages.js';

/* Day74 リンクの毒見の画面。通信（/api/day-074/trace・around）は page.route で差し替え、手書きの観測データを流す。
   期待値は判定側の関数（evaluate）から作る。判定の点や文面が変わっても、画面が「判定の結果をそのまま正しく出すか」を見続けるため。 */

const root = fileURLToPath(new URL('../../', import.meta.url));
const appDir = join(root, 'day-074-link-dokumi');
const base = '/day-074-link-dokumi/';
// 「@」の左にドメインを置くすり替えの例。続けて書くと、公開前チェックがメールアドレスと読むので分けて書く
const USERINFO_TRICK = 'https://amazon.co.jp' + '@' + 'evil-login.com/';
const fixture = (name) => JSON.parse(readFileSync(join(appDir, 'tests', 'fixtures', name), 'utf8'));
const judge = (raw, trace = null, around = null, includeQuery = false, failure = null) => {
  const parsed = parseInput(raw, { includeQuery });
  return evaluate({ parsed, lexical: analyzeLexical(parsed), trace, around, now: Date.now(), failure });
};
// 画面は「見つからなかったことは、安全の保証ではありません」を判定の一文から外し、見出しの下に1回だけ出す
const withoutCaveat = (summary) => String(summary ?? '').replace(/見つからなかったことは、?安全の保証ではありません。?/g, '').trim();
// こちら側（このアプリ・通信）の都合で調べられなかったときの書き出し
const LOCAL_LEAD = 'このアプリ（または通信）の問題で調べられませんでした。相手のサイトの問題とは限りません。';
// 見出しのすぐ下の注意書き：兆候が見当たらないとき／調べきれなかったとき
const CAVEAT = { ok: '見つからなかったことは、安全の保証ではありません。', unknown: '調べきれていないので、安全かどうかは分かりません。' };
/** コピーした文を、クリップボードの代わりに受け取る（どのブラウザでも試せるように） */
async function captureClipboard(page) {
  await page.addInitScript(() => {
    window.__copied = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.__copied.push(text); }, readText: async () => '' } });
  });
}

/** /api/ への呼び出しを捕まえて、観測データを返す。
    gate を渡すと、その Promise が解けるまで trace を返さない。next を渡すと、2回目以降の trace はそれを返す */
async function mockApi(page, {
  trace = fixture('trace-clean.json'), around = fixture('around-clean.json'), status = 200, headers = {}, gate = null,
  next = null, aroundStatus = 200, aroundHeaders = {}
} = {}) {
  const calls = { trace: [], around: [], other: [] };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/day-074/trace') {
      calls.trace.push(url);
      if (gate) await gate;
      const reply = calls.trace.length > 1 && next ? next : { trace, status, headers };
      if (reply.trace === 'abort') return route.abort('failed');
      const body = typeof reply.trace === 'string' ? reply.trace : JSON.stringify(reply.trace);
      return route.fulfill({ status: reply.status ?? 200, headers: { 'content-type': 'application/json; charset=utf-8', ...(reply.headers ?? {}) }, body });
    }
    if (url.pathname === '/api/day-074/around') {
      calls.around.push(url);
      const body = JSON.stringify(aroundStatus === 200 ? around : { error: 'rate_limited' });
      return route.fulfill({ status: aroundStatus, headers: { 'content-type': 'application/json; charset=utf-8', ...aroundHeaders }, body });
    }
    calls.other.push(url);
    return route.fulfill({ status: 404, body: '' });
  });
  return calls;
}

async function open(page) {
  await page.goto(base);
  // 初回はモジュールの読み込みが遅いことがある（WebKitで実測）。初期化の終わりの印を長めに待つ
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 15000 });
  await expect(page.locator('.sample-chip')).toHaveCount(3);
}
async function check(page, text) {
  await page.locator('#url-input').fill(text);
  await page.locator('#check-button').click();
}
async function waitPhase(page, phase) {
  await expect(page.locator('#app')).toHaveAttribute('data-phase', phase);
}
const pageText = (page) => page.evaluate(() => `${document.body.innerText}\n${document.body.textContent}`);
function expectNoBanned(text, where) {
  for (const phrase of BANNED_PHRASES) expect(text.includes(phrase), `${where}：「${phrase}」が出ている`).toBe(false);
}
const copyButtons = (page) => page.locator('[data-action="copy-report"], [data-action="copy-summary"]');

test.describe('Day74 リンクの毒見', () => {
  test('初期画面：題名・入力欄・見本3つ・注意書き。6つの幅で横にはみ出さない。768px以上で見本のURLは1行', async ({ page }) => {
    await open(page);
    await expect(page.locator('h1')).toHaveText('リンクの毒見');
    const input = page.locator('#url-input');
    await expect(input).toBeVisible();
    for (const [name, value] of [['autocapitalize', 'off'], ['autocomplete', 'off'], ['spellcheck', 'false'], ['inputmode', 'url']]) {
      await expect(input).toHaveAttribute(name, value);
    }
    await expect(page.locator('label[for="url-input"]')).toHaveText('調べたいリンク');
    const cautions = page.locator('.cautions');
    await expect(cautions).toContainText('一度しか使えないリンク');
    await expect(cautions).toContainText('診断のためにこのサイトのサーバーへ送られます');
    await expect(cautions).toContainText('「?」から後ろ');
    await expect(cautions.locator('a[href="#samples"]')).toHaveText('見本');
    for (const sample of SAMPLES) {
      const chip = page.locator(`.sample-chip[data-sample="${sample.id}"]`);
      await expect(chip).toContainText(sample.url);
      // 押せる印。点線の枠は見本の印
      await expect(chip.locator('.sample-chip__go')).toContainText('この見本で試す');
      expect(await chip.evaluate((node) => getComputedStyle(node).borderTopStyle)).toBe('dashed');
      // 「この見本で試す」は、ほかの補助ボタンと同じ角丸の四角で、高さ44px以上（錠剤形は札だけ）
      const go = await chip.locator('.sample-chip__go').evaluate((node) => ({ height: node.getBoundingClientRect().height, radius: parseFloat(getComputedStyle(node).borderTopLeftRadius) }));
      expect(go.height).toBeGreaterThanOrEqual(44);
      expect(go.radius).toBeLessThanOrEqual(14);
    }
    // 「短縮URL」「（security.txt）を調べます。」は途中で折らない
    await expect(page.locator('#primer .nb')).toHaveText(['短縮URL']);
    await expect(page.locator('section[aria-labelledby="how"] ul').first().locator('.nb')).toHaveText(['短縮URL', '連絡先の公開（security.txt）を調べます。']);

    // 画面の数字は LIMITS から作る。「1回だけ取得」「保存しません」とは書かない
    await expect(page.locator('#privacy-cache')).toHaveText(`診断の履歴は残しません。同じ相手サイトへ短時間に何度もアクセスしないよう、結果を最大${LIMITS.CACHE_TTL_S / 60}分だけ一時的に置きます。`);
    for (const node of await page.locator('[data-limit="MAX_REDIRECTS"]').all()) await expect(node).toHaveText(String(LIMITS.MAX_REDIRECTS));
    await expect(page.locator('[data-limit="BODY_CAP_BYTES"]')).toHaveText(String(LIMITS.BODY_CAP_BYTES / 1024));
    await expect(page.locator('[data-limit="RATE_PER_MINUTE"]')).toHaveText(String(LIMITS.RATE_PER_MINUTE));
    const text = await pageText(page);
    expect(text).not.toContain('保存しません');
    expect(text).not.toContain('1回だけ取得');
    for (const id of ['how', 'fetcher', 'privacy']) await expect(page.locator(`h2#${id}`)).toBeAttached();
    // 凡例は「4つの段階」と、調べきれなかったときの「不明」（記号は5つ）
    await expect(page.locator('#axes')).toContainText('なりすましの兆候の強さを、4つの段階（調べきれなかったときは「不明」）で示します。');
    await expect(page.locator('#level-legend li')).toHaveCount(5);
    // 下の3つはページ内の目次（タブではない）
    await expect(page.locator('.docs__toc a')).toHaveCount(3);
    expect(await page.locator('.docs__nav [role="tab"]').count()).toBe(0);
    await expect(page.locator('#live')).toHaveAttribute('aria-live', 'polite');

    for (const width of [320, 390, 768, 1040, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px で横にはみ出す`).toBe(width);
      if (width >= 768) {
        const lines = await page.locator('.sample-chip__url').evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight))));
        expect(lines, `${width}px で見本のURLが折れている`).toEqual([1, 1, 1]);
      }
    }
  });

  test('待機画面の並び：広い画面は「入力｜見本と3つのこと」の下に2つの見方を同じ列で並べ、列の比率は結果と同じ', async ({ page }) => {
    const box = (selector) => page.locator(selector).first().evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top + window.scrollY), bottom: Math.round(rect.bottom + window.scrollY), width: Math.round(rect.width) };
    });
    for (const width of [1040, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      const [main, side, axes] = [await box('.intake__main'), await box('.intake__side'), await box('#axes')];
      // 上の段の左右の下端の差が大きすぎない（以前は一方の列の横に約490pxの空白ができた）。フォントで行数が変わり、
      // CIのLinuxでは1040pxで160pxになるので、基準は240px。2つの見方は上の段の下で、両方の列にまたがる
      expect(Math.abs(main.bottom - side.bottom), `${width}px：左右の列の下端の差`).toBeLessThanOrEqual(240);
      expect(axes.top).toBeGreaterThanOrEqual(Math.max(main.bottom, side.bottom));
      const cards = await page.locator('#axes .axis-card').evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().left)));
      expect(cards, `${width}px：2つの見方が列にそろっていない`).toEqual([main.left, side.left]);
      // 結果の画面も同じ列の比率
      await page.locator('.sample-chip[data-sample="clean"]').click();
      await waitPhase(page, 'result');
      const [left, right] = [await box('#verdict'), await box('.result__main')];
      expect(Math.abs(left.width - main.width), `${width}px：左の列の幅が待機と結果で違う`).toBeLessThanOrEqual(1);
      expect(Math.abs(right.width - side.width), `${width}px：右の列の幅が待機と結果で違う`).toBeLessThanOrEqual(1);
    }
    // 凡例：広いカードでは4つを1行、狭いカードでは2×2。「不明」は区切り線の下
    const rows = async () => page.locator('#level-legend li').evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)));
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    let tops = await rows();
    expect(new Set(tops.slice(0, 4)).size).toBe(1);
    expect(tops[4]).toBeGreaterThan(tops[0]);
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    tops = await rows();
    expect([tops[0] === tops[1], tops[2] === tops[3], tops[2] > tops[0], tops[4] > tops[2]]).toEqual([true, true, true, true]);
  });

  test('狭い画面（320px・360px）の結果でも横にはみ出さない。段階の物差しは4つとも枠の中に収まる', async ({ page }) => {
    await mockApi(page, { trace: { error: 'rate_limited' }, status: 429, headers: { 'Retry-After': '30' } });
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 800 });
      for (const sample of SAMPLES) {
        await open(page);
        await page.locator(`.sample-chip[data-sample="${sample.id}"]`).click();
        await waitPhase(page, 'result');
        for (const tab of ['#tab-visitor', '#tab-owner']) {
          await page.locator(tab).click();
          expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px・見本 ${sample.id}・${tab}`).toBe(width);
        }
        const spill = await page.locator('.meter__step').evaluateAll((steps) => steps.map((step) => step.scrollWidth - step.clientWidth));
        expect(spill, `${width}px・見本 ${sample.id}：物差しの文字が枠からはみ出す`).toEqual([0, 0, 0, 0]);
      }
      await open(page);
      await check(page, 'https://plain-site.jp/');
      await waitPhase(page, 'failed');
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px・回数の上限`).toBe(width);
    }
  });

  test('見本3つ：通信せずに、判定の段階・守りの点数・主な所見・行き先が出る', async ({ page }) => {
    const calls = await mockApi(page);
    for (const sample of SAMPLES) {
      const expected = judge(sample.url, sample.trace, sample.around);
      await open(page);
      await page.locator(`.sample-chip[data-sample="${sample.id}"]`).click();
      await waitPhase(page, 'result');
      await expect(page.locator('#verdict')).toHaveAttribute('data-level', expected.visitor.level);
      await expect(page.locator('#verdict-headline')).toHaveText(expected.visitor.headline);
      await expect(page.locator('#verdict-headline')).toBeFocused();
      await expect(page.locator('#verdict-summary')).toHaveText(withoutCaveat(expected.visitor.summary));
      await expect(page.locator('#sample-banner')).toBeVisible();
      // どのタブを開いていても見本だと分かるよう、帯の中にも点線の「見本」札
      await expect(page.locator('#verdict-sample')).toBeVisible();
      expect(await page.locator('#verdict-sample').evaluate((node) => getComputedStyle(node).borderTopStyle)).toBe('dashed');
      if (expected.target.registrable !== (expected.target.hostUnicode || expected.target.host)) {
        await expect(page.locator('.verdict__host-hint')).toContainText('色を付けた太字の部分が、このアドレスの持ち主の名前です。');
      }
      // 時刻の行は「（日本時間）の時点で」を1かたまりにする（「の時点で」を行頭に置かない）
      await expect(page.locator('#verdict-time .nb').filter({ hasText: '日本時間' })).toHaveText('（日本時間）の時点で');
      await expect(page.locator('#verdict-actions li')).toHaveCount(Math.min(3, expected.visitor.actions.length));
      await expect(page.locator('#owner-score')).toHaveText(expected.owner.score === null ? '—' : String(expected.owner.score));
      await expect(page.locator('#owner-grade')).toHaveText(expected.owner.grade ?? '—');
      for (const finding of expected.findings) await expect(page.locator(`.finding[data-id="${finding.id}"]`)).toHaveCount(1);
      const finalHost = expected.target.chain.at(-1).host;
      await expect(page.locator('#path li[data-hop]').last()).toContainText(finalHost);
      await expect(page.locator('#limits li')).toHaveCount(expected.limits.length);
      // 見出しのすぐ下の注意書きは、兆候が見当たらないときと不明のときだけ（兆候が見つかっている段階には出さない）
      await expect(page.locator('#verdict-caveat')).toBeVisible({ visible: ['ok', 'unknown'].includes(expected.visitor.level) });
      if (CAVEAT[expected.visitor.level]) await expect(page.locator('#verdict-caveat')).toHaveText(CAVEAT[expected.visitor.level]);
      // 「段階」は訪問者向けの言葉。運営者向けは「守りの評価」
      await expect(page.locator('#verdict-word')).toHaveText(/^段階：/);
      if (expected.owner.grade) await expect(page.locator('#tab-owner-badge')).toHaveText(`守りの評価 ${expected.owner.grade}（${expected.owner.score}点）`);
      // 見本の意味：なりすまし風は近づかない、整ったサイトは見つからない・A、古いサイトは注意以上・F
      if (sample.id === 'lookalike') {
        expect(expected.visitor.level).toBe('danger');
        await expect(page.locator('.finding[data-id="V-BRAND-SUBDOMAIN"]')).toHaveAttribute('data-status', 'bad');
        // 点の向き：訪問者向けは「兆候 +9」。数字の意味を一覧の頭で1行だけ言う
        const points = expected.findings.find((f) => f.id === 'V-BRAND-SUBDOMAIN').points;
        await expect(page.locator('.finding[data-id="V-BRAND-SUBDOMAIN"] .finding__points')).toHaveText(`兆候 +${points}`);
        await expect(page.locator('#visitor-findings .group[data-status="bad"] .group__note')).toHaveText('数字は兆候の強さです。合計で段階を決めます。');
        // 「残り◯件を表示」は、すぐ上のカードとくっつけない
        const more = page.locator('#visitor-findings .group__more');
        if (await more.count()) {
          const gap = await more.evaluate((button) => button.getBoundingClientRect().top - button.parentElement.querySelector('.group__list').getBoundingClientRect().bottom);
          expect(gap).toBeGreaterThanOrEqual(8);
        }
      }
      if (sample.id === 'clean') {
        expect(expected.visitor.level).toBe('ok');
        await expect(page.locator('#owner-grade')).toHaveText('A');
        // 段階名とタブの言葉をそろえる（接続失敗の「名前が見つからない」と同じ語は使わない）
        await expect(page.locator('#verdict-word')).toHaveText('段階：見当たらない');
        await expect(page.locator('#tab-visitor-badge')).toHaveText('見当たらない');
      }
      if (sample.id === 'legacy') {
        expect(['warn', 'danger']).toContain(expected.visitor.level);
        await expect(page.locator('#owner-grade')).toHaveText('F');
        await page.locator('#tab-owner').click();
        await expect(page.locator('#panel-owner')).toBeVisible();
        await expect(page.locator('#panel-owner > :first-child')).toContainText('危険なサイトという意味ではありません');
        await expect(page.locator('#owner-fixes li')).toHaveCount(expected.owner.topFixes.length);
        // 点の向き：一覧は「減点 40」、先に直すものは「直すと +40点」。同じ項目を「+」と「−」の両方で書かない
        const fix = expected.owner.topFixes[0];
        await expect(page.locator('#owner-fixes li').first()).toContainText(`直すと +${fix.gain}点`);
        const card = page.locator(`#panel-owner .finding[data-id="${fix.id}"]`);
        await expect(card.locator('.finding__points')).toHaveText(`減点 ${expected.findings.find((f) => f.id === fix.id).points}`);
        expect(await page.locator('#panel-owner').textContent()).not.toMatch(/[−-]\d+点/);
        // 評価の目安：A〜F の5つのマス。マスの途中では折らない（1マスは1行）
        const bands = await page.locator('#owner-scale .score__band').evaluateAll((nodes) => nodes.map((node) => ({
          text: node.textContent, lines: Math.round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight))
        })));
        expect(bands.map((band) => band.text.trim().charAt(0))).toEqual(['A', 'B', 'C', 'D', 'F']);
        for (const band of bands) expect(band.lines, band.text).toBe(1);
        // 見えた値には、形から分かる小見出しを付ける（失敗の種類は言葉を先に、元の値も残す）
        const https = expected.findings.find((f) => f.id === 'O-NO-HTTPS');
        if (https?.evidence.includes('connect_failed')) {
          const evidence = page.locator('#panel-owner .finding[data-id="O-NO-HTTPS"]');
          await evidence.locator('summary').click();
          await expect(evidence.locator('.evidence li').filter({ hasText: 'connect_failed' })).toContainText('結果');
          await expect(evidence.locator('.evidence li').filter({ hasText: 'connect_failed' })).toContainText('つながらない（connect_failed）');
        }
      }
    }
    expect(calls.trace.length + calls.around.length + calls.other.length, '見本で通信した').toBe(0);
  });

  test('実際の流れ：見た目の結果が先に出て、trace→around→結果。「?」以降は既定で送らず、選ぶと送る', async ({ page }) => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const calls = await mockApi(page, { gate });
    await open(page);
    await check(page, 'https://www.well-kept.jp/menu?ref=sms#top');
    await waitPhase(page, 'checking');
    // trace を返す前に、アドレスの見た目の結果と送ったアドレスが出ている。焦点は「調べています」へ
    await expect(page.locator('#checking-title')).toBeFocused();
    await expect(page.locator('#checking #cancel-button')).toBeVisible();
    await expect(page.locator('#early-list li').first()).toBeVisible();
    await expect(page.locator('#progress li[data-step="read"]')).toHaveAttribute('data-state', 'done');
    expect(await page.locator('#progress li[data-step="read"] .progress__icon').evaluate((node) => getComputedStyle(node).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    await expect(page.locator('#progress li[data-step="connect"]')).toHaveAttribute('data-state', 'running');
    await expect(page.locator('#checking-href')).toHaveText('https://www.well-kept.jp/menu');
    await expect(page.locator('#checking-href .host__reg')).toHaveText('well-kept.jp');
    await expect(page.locator('#checking-notes')).toContainText('「?」から後ろは送っていません');
    expect(calls.around).toHaveLength(0);
    release();
    await waitPhase(page, 'result');
    expect(calls.trace).toHaveLength(1);
    expect(calls.trace[0].searchParams.get('url')).toBe('https://www.well-kept.jp/menu');
    expect(calls.trace[0].href).not.toContain('ref%3Dsms');
    expect(calls.around).toHaveLength(1);
    const final = fixture('trace-clean.json').final;
    expect(calls.around[0].searchParams.get('host')).toBe(final.host);
    expect(calls.around[0].searchParams.get('scheme')).toBe(final.scheme);
    const expected = judge('https://www.well-kept.jp/menu?ref=sms#top', fixture('trace-clean.json'), fixture('around-clean.json'));
    await expect(page.locator('#verdict')).toHaveAttribute('data-level', expected.visitor.level);
    await expect(page.locator('#verdict-sample')).toBeHidden();
    await expect(page.locator('#target-chip')).toContainText('「?」から後ろは送っていません');
    for (const step of ['read', 'connect', 'page', 'around', 'summary']) {
      await expect(page.locator(`#progress li[data-step="${step}"]`)).toHaveAttribute('data-state', 'done');
    }

    // 「別のリンクを調べる」は欄を空にして焦点を渡す（前のリンクの後ろに貼ってしまわないように）
    await page.locator('#again').click();
    await waitPhase(page, 'idle');
    await expect(page.locator('#url-input')).toBeFocused();
    await expect(page.locator('#url-input')).toHaveValue('');
    // チェックを入れると「?」以降も送る（「#」以降は送らない）
    await page.locator('#url-input').fill('https://www.well-kept.jp/menu?ref=sms#top');
    await page.locator('#settings summary').click();
    await page.locator('#include-query').check();
    await page.locator('#check-button').click();
    await waitPhase(page, 'result');
    expect(calls.trace).toHaveLength(2);
    expect(calls.trace[1].searchParams.get('url')).toBe('https://www.well-kept.jp/menu?ref=sms');
  });

  test('メッセージごと貼ると、最初のリンクだけを送り、ほかの件数を出す', async ({ page }) => {
    const calls = await mockApi(page, { trace: fixture('trace-shortener.json'), around: fixture('around-shortener.json') });
    await open(page);
    const message = '【お知らせ】お荷物をお預かりしています。https://bit.ly/3xYzAb から確認してください。詳しくは https://two.example.com/ と https://three.jp/ へ';
    await page.locator('#url-input').fill(message);
    await expect(page.locator('#input-preview')).toContainText('ほかにリンクが2件');
    await page.locator('#check-button').click();
    await waitPhase(page, 'result');
    expect(calls.trace).toHaveLength(1);
    expect(calls.trace[0].searchParams.get('url')).toBe('https://bit.ly/3xYzAb');
    await expect(page.locator('#target-chip')).toContainText('ほかにリンクが2件');
    // 転送の経路：短縮URL → 行き先。ドメインが変わる所に印が付く
    await expect(page.locator('#path li[data-hop]')).toHaveCount(2);
    await expect(page.locator('#path li[data-hop="1"]')).toContainText('ここでドメインが変わります');
    await expect(page.locator('#path li[data-hop="1"]')).toContainText('www.news-site.example');
  });

  test('一度きりらしいリンク：送る部分に手がかりがあるときだけ、選ぶまで通信しない', async ({ page }) => {
    const calls = await mockApi(page);
    await open(page);
    const notice = page.locator('#one-time-notice');

    // 手がかりが「?」の中の語だけで、「?」から後ろを送らない既定なら、使い切らないので確かめずに調べる
    await check(page, 'https://shop.mail-notice.jp/reset?token=abc123');
    await waitPhase(page, 'result');
    await expect(notice).toBeHidden();
    expect(calls.trace).toHaveLength(1);
    expect(calls.trace[0].searchParams.get('url')).toBe('https://shop.mail-notice.jp/reset');

    // パスに手がかりがあるときは確かめる
    await open(page);
    await check(page, 'https://shop.mail-notice.jp/reset/AbCdEf0123456789xyz');
    await expect(notice).toBeVisible();
    await expect(page.locator('#one-time-title')).toBeFocused();
    await expect(page.locator('#one-time-clues')).toContainText('reset');
    await expect(page.locator('#one-time-href')).toHaveText('https://shop.mail-notice.jp/reset/AbCdEf0123456789xyz');
    await page.waitForTimeout(300);
    expect(calls.trace).toHaveLength(1);
    await page.locator('#one-time-cancel').click();
    await expect(notice).toBeHidden();
    await waitPhase(page, 'idle');
    expect(calls.trace).toHaveLength(1);
    await page.locator('#check-button').click();
    await expect(notice).toBeVisible();
    expect(calls.trace).toHaveLength(1);
    await page.locator('#one-time-continue').click();
    await waitPhase(page, 'result');
    expect(calls.trace).toHaveLength(2);

    // 「?」から後ろも送る設定なら、「?」の中の語でも確かめる
    await open(page);
    await page.locator('#settings summary').click();
    await page.locator('#include-query').check();
    await check(page, 'https://shop.mail-notice.jp/reset?token=abc123');
    await expect(notice).toBeVisible();
    await expect(page.locator('#one-time-clues')).toContainText('token');
    await expect(page.locator('#one-time-href')).toHaveText('https://shop.mail-notice.jp/reset?token=abc123');
    expect(calls.trace).toHaveLength(2);
  });

  test('つなぎに行かない形（@・数字のアドレス）は通信せず、理由を書く', async ({ page }) => {
    const calls = await mockApi(page);
    for (const raw of [USERINFO_TRICK, 'http://192.168.0.1/admin']) {
      const expected = judge(raw);
      await open(page);
      await check(page, raw);
      await waitPhase(page, 'result');
      await expect(page.locator('#verdict')).toHaveAttribute('data-level', expected.visitor.level);
      await expect(page.locator('#verdict-fetch')).toBeVisible();
      await expect(page.locator('#verdict-fetch')).toContainText('つなぎに行きません');
      await expect(page.locator('#verdict-fetch')).not.toContainText('アドレスの見た目だけで判断しています');
      await expect(page.locator('#verdict-summary')).toHaveText(expected.visitor.summary);
      await expect(page.locator('#path .hop__status').first()).toHaveText('つなぎに行っていません');
      await expect(page.locator('#external-list li')).toHaveCount(0);
    }
    expect(calls.trace.length + calls.around.length).toBe(0);
  });

  const FAILURE_CASES = [
    { name: '429（回数の上限）', status: 429, headers: { 'Retry-After': '42' }, trace: { error: 'rate_limited' }, kind: 'rate', local: 'rate_limited', short: '回数の上限', lead: 'このアプリの回数の上限に達しました。相手のサイトの問題ではありません。' },
    { name: '500', status: 500, trace: { error: 'internal_error' }, kind: 'server', local: 'server_error', short: 'サーバーの問題', lead: LOCAL_LEAD },
    { name: 'ネットワークの失敗', trace: 'abort', kind: 'network', local: 'network', short: '通信できず', lead: LOCAL_LEAD },
    { name: '名前が引けない', fixture: 'trace-dns-failed.json', kind: 'dns_failed', text: '詐欺のサイトは短い期間で消えることがあります' },
    { name: '暗号化の失敗', fixture: 'trace-tls-failed.json', kind: 'tls_failed', text: '暗号化の失敗' },
    { name: '公開されていない宛先', fixture: 'trace-blocked-target.json', kind: 'blocked_target', text: '公開されていない宛先' },
    { name: 'ボット対策で断られた', fixture: 'trace-challenge.json', kind: 'blocked_by_challenge', text: '取得を断られた', refused: true }
  ];
  for (const failure of FAILURE_CASES) {
    test(`失敗：${failure.name}でも、見た目の結果を残して理由と次の行動を出す`, async ({ page }) => {
      const trace = failure.fixture ? fixture(failure.fixture) : failure.trace;
      const calls = await mockApi(page, { trace, status: failure.status ?? 200, headers: failure.headers ?? {} });
      const raw = 'https://plain-site.jp/';
      const expected = judge(raw, failure.fixture ? trace : null, failure.refused ? fixture('around-clean.json') : null, false, failure.local ?? null);
      await open(page);
      await check(page, raw);
      await waitPhase(page, 'failed');
      await expect(page.locator('#verdict')).toHaveAttribute('data-level', expected.visitor.level);
      await expect(page.locator('#verdict-headline')).toHaveText(expected.visitor.headline);
      await expect(page.locator('#verdict-headline')).toBeFocused();
      const box = page.locator('#verdict-fetch');
      await expect(box).toBeVisible();
      await expect(box).toHaveAttribute('data-kind', failure.kind);
      // 点線の枠は見本だけの印。失敗の説明は実線の箱
      expect(await box.evaluate((node) => getComputedStyle(node).borderTopStyle)).toBe('solid');
      // 見出しのすぐ下は「調べきれていないので、安全かどうかは分かりません。」
      if (expected.visitor.level === 'unknown') await expect(page.locator('#verdict-caveat')).toHaveText(CAVEAT.unknown);
      if (failure.local) {
        // こちら側の都合：原因を先に書く（「つながりませんでした」と言わない）。判定側の一文・行動（1件）・所見も、こちら側の言い方
        await expect(page.locator('#verdict-fetch-title')).toHaveText(failure.lead);
        await expect(box).not.toContainText('つながりませんでした');
        await expect(box).not.toContainText('アドレスの見た目だけで判断');
        expect(expected.visitor.actions).toHaveLength(1);
        await expect(page.locator('#verdict-actions li')).toHaveText(expected.visitor.actions);
        await expect(page.locator('#verdict-summary')).toHaveText(expected.visitor.summary);
        expect(expected.visitor.summary).toContain('このアプリ側の都合');
        await expect(page.locator('.finding[data-id="V-UNREACHABLE"] .finding__title')).toHaveText(expected.findings.find((f) => f.id === 'V-UNREACHABLE').title);
        await expect(page.locator('#verdict-fetch-next')).toBeHidden();
        for (const button of await copyButtons(page).all()) await expect(button).toBeHidden();
        await expect(page.locator('#consult')).toBeHidden();
        await expect(page.locator('#live')).toContainText(failure.lead);
        // 「たどった経路」も、相手のサイトにつながらなかったようには書かない
        await expect(page.locator('#path .hop__status').first()).toHaveText(`調べていません（${failure.short}）`);
        await expect(page.locator('.route')).not.toContainText('つながりませんでした');
      } else {
        await expect(box).toContainText(failure.text);
        await expect(box).toContainText('アドレスの見た目から分かったことは、このまま下に残しています');
        await expect(page.locator('#copy-report')).toBeVisible();
      }
      await expect(page.locator('#progress li[data-step="connect"]')).toHaveAttribute('data-state', 'failed');
      await expect(page.locator('#limits li').first()).toBeVisible();
      await expect(page.locator('#retry')).toBeVisible();
      if (failure.kind === 'rate') {
        await expect(page.locator('#retry')).toBeDisabled();
        await expect(page.locator('#retry')).toContainText('あと');
        await expect(box).toContainText(`1分あたり約${LIMITS.RATE_PER_MINUTE}回`);
      }
      if (expected.visitor.level === 'unknown') await expect(page.locator('#verdict-meter')).toBeHidden();
      // つながらなかったときのタブの要約は「兆候なし」にしない
      await expect(page.locator('#tab-visitor-badge')).toContainText('見た目だけ確認');
      if (failure.refused) {
        // 断られたあとは、名前と登録日だけを問い合わせる（相手のサイトへの追加のアクセスはしない）
        expect(calls.around).toHaveLength(1);
        expect(calls.around[0].searchParams.get('site')).toBe('0');
      } else expect(calls.around, 'つながらないのに周りの情報を取りに行った').toHaveLength(0);
    });
  }

  test('回数の上限：「もう一度調べる」は残り秒数を数え、0になると押せて、同じ入力でやり直す', async ({ page }) => {
    const calls = await mockApi(page, { trace: { error: 'rate_limited' }, status: 429, headers: { 'Retry-After': '3' }, next: { trace: fixture('trace-clean.json') } });
    await open(page);
    await check(page, 'https://www.well-kept.jp/menu');
    await waitPhase(page, 'failed');
    const retry = page.locator('#retry');
    await expect(retry).toBeDisabled();
    await expect(retry).toHaveText(/^もう一度調べる（あと[123]秒）$/);
    await expect(page.locator('#retry-wait')).toHaveText('時間になると押せます。');
    // 数が減っていく
    const first = Number((await retry.textContent()).match(/あと(\d+)秒/)[1]);
    await expect.poll(async () => Number(((await retry.textContent()).match(/あと(\d+)秒/) ?? [0, 0])[1]), { timeout: 2500 }).toBeLessThan(first);
    await expect(retry).toBeEnabled({ timeout: 6000 });
    await expect(retry).toHaveText('もう一度調べる');
    await expect(page.locator('#live')).toContainText('もう一度調べられます');
    expect(calls.trace).toHaveLength(1);
    await retry.click();
    await waitPhase(page, 'result');
    expect(calls.trace).toHaveLength(2);
    expect(calls.trace[1].searchParams.get('url')).toBe(calls.trace[0].searchParams.get('url'));
    // やり直して相手につながったので、コピーと行動は元に戻る
    await expect(page.locator('#copy-report')).toBeVisible();
    await expect(page.locator('#retry-row')).toBeHidden();
  });

  test('相談先：行動の「相談先を見る ↓」で相談先へ移る。相談先は行動のすぐ下で経路より上。電話は tel: のリンク', async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    const startUrl = page.url();
    await page.locator('.sample-chip[data-sample="lookalike"]').click();
    await waitPhase(page, 'result');
    const jump = page.locator('#verdict-actions a.jump-link');
    await expect(jump).toHaveCount(1);
    await expect(jump).toContainText('相談先を見る');
    await expect(jump).toHaveAttribute('href', '#consult-title');
    await expect(page.locator('#actions-consult')).toBeHidden();
    const top = (selector) => page.locator(selector).evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
    // 狭い画面：行動 → 相談先 → 物差しと調べた相手 → 経路
    expect(await top('.actions')).toBeLessThan(await top('#consult'));
    expect(await top('#consult')).toBeLessThan(await top('#verdict-detail'));
    expect(await top('#consult')).toBeLessThan(await top('.route'));
    // 1画面目に、判定の見出しと最初の行動が入る
    await page.evaluate(() => document.getElementById('result').scrollIntoView({ block: 'start' }));
    await expect(page.locator('#verdict-headline')).toBeInViewport();
    await expect(page.locator('#verdict-actions li').first()).toBeInViewport();

    await jump.click();
    await expect(page.locator('#consult-title')).toBeFocused();
    await expect(page.locator('#consult-title')).toBeInViewport();
    expect(page.url(), 'ページ内の移動でURLが変わった').toBe(startUrl);

    // 電話番号は押せる tel: のリンク（#9110 は %23 にする）。同じ文言のリンクは、読み上げで窓口名が分かる
    const tels = await page.locator('#consult-list a[href^="tel:"]').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
    expect(tels).toEqual(expect.arrayContaining(['tel:%239110', 'tel:188', 'tel:0359787509']));
    for (const href of tels) expect(href).toMatch(/^tel:(%23)?[0-9]+$/);
    const names = await page.locator('#consult-list a[target="_blank"]').evaluateAll((links) => links.map((a) => a.textContent));
    expect(new Set(names).size, '外部のページを開くリンクの読み上げが同じになっている').toBe(names.length);
    // どのカードも「公式ページ」→「電話」の順で、狭い画面では同じ幅で縦に積む。内側の余白は16px以上
    const cardLayout = () => page.locator('#consult-list .link-card').evaluateAll((cards) => cards.map((card) => {
      const links = [...card.querySelectorAll('.link-card__link')].map((link) => {
        const rect = link.getBoundingClientRect();
        return { tel: link.getAttribute('href').startsWith('tel:'), left: Math.round(rect.left - card.getBoundingClientRect().left), top: Math.round(rect.top), width: Math.round(rect.width) };
      });
      return { padding: parseFloat(getComputedStyle(card).paddingLeft), links };
    }));
    for (const card of await cardLayout()) {
      expect(card.padding).toBeGreaterThanOrEqual(16);
      expect(card.links[0].tel, '公式ページが先').toBe(false);
      if (card.links.length === 2) {
        expect(card.links[1].left).toBe(card.links[0].left);
        expect(card.links[1].width).toBe(card.links[0].width);
        expect(card.links[1].top).toBeGreaterThan(card.links[0].top);
      }
    }

    // 広い画面：左の列で、行動 → 相談先 → 経路。カードが広ければ「公式ページ｜電話」を同じ幅の2列で、どのカードも同じ並べ方
    await page.setViewportSize({ width: 1440, height: 900 });
    const wide = await cardLayout();
    for (const card of wide) {
      expect(card.links[0].left).toBe(wide[0].links[0].left);
      if (card.links.length === 2) {
        expect(card.links[1].top).toBe(card.links[0].top);
        expect(Math.abs(card.links[1].width - card.links[0].width)).toBeLessThanOrEqual(1);
      }
    }
    expect(await top('.actions')).toBeLessThan(await top('#consult'));
    expect(await top('#consult')).toBeLessThan(await top('.route'));
    const left = (selector) => page.locator(selector).evaluate((node) => node.getBoundingClientRect().left);
    expect(await left('#consult')).toBe(await left('#verdict'));
    expect(await left('.result__main')).toBeGreaterThan(await left('#consult'));
  });

  test('診断先に断られたとき（403・429・cf-mitigated・ボット対策）は around に site=0 を付ける。ふだんは付けない', async ({ page }) => {
    const clean = fixture('trace-clean.json');
    const cases = [
      { name: 'ふつう', trace: clean, site: null },
      { name: '403', trace: { ...clean, final: { ...clean.final, status: 403 } }, site: '0' },
      { name: '429', trace: { ...clean, final: { ...clean.final, status: 429 } }, site: '0' },
      { name: 'cf-mitigated', trace: { ...clean, final: { ...clean.final, headers: { ...clean.final.headers, 'cf-mitigated': 'challenge' } } }, site: '0' },
      { name: 'ボット対策', trace: fixture('trace-challenge.json'), site: '0' }
    ];
    for (const one of cases) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      const calls = await mockApi(page, { trace: one.trace });
      await open(page);
      await check(page, 'https://www.well-kept.jp/');
      await waitPhase(page, one.trace.ok ? 'result' : 'failed');
      expect(calls.around, `${one.name}：周りの情報を問い合わせていない`).toHaveLength(1);
      expect(calls.around[0].searchParams.get('site'), one.name).toBe(one.site);
      expect(calls.around[0].searchParams.get('host'), one.name).toBe(one.trace.ok ? one.trace.final.host : one.trace.error.host);
      if (one.site) await expect(page.locator('#progress li[data-step="around"] .progress__detail')).toContainText('名前と登録日だけ');
    }
    // 「サイト運営者の方へ」の約束と動きが一致している
    await expect(page.locator('section[aria-labelledby="fetcher"]')).toContainText('あなたのサイトへの追加のアクセス（http:// 側・security.txt）は省きます');
  });

  test('文節の折り返しの代わり：auto-phrase に対応しない環境では、文節の切れ目に <wbr> を差し、文字は変えない', async ({ page }) => {
    // Chromium は auto-phrase に対応しているので、対応していないふりをさせる（WebKit はもともと非対応）
    await page.addInitScript(() => {
      const original = CSS.supports.bind(CSS);
      CSS.supports = (...args) => (args.length === 2 && args[0] === 'word-break' && args[1] === 'auto-phrase') || (args.length === 1 && String(args[0]).includes('auto-phrase')) ? false : original(...args);
    });
    await mockApi(page);
    await open(page);
    await expect(page.locator('html')).toHaveClass(/phrase-fallback/);
    const lede = page.locator('.masthead__lede');
    expect(await lede.locator('wbr').count()).toBeGreaterThan(3);
    await expect(lede).toHaveText('知らない相手から届いたリンクを、開く前に調べます。アドレスの見た目、たどり着く先、サイトの守りの設定を、実際に見えた値を添えて、ふだんの言葉で返します。');
    // 折らないかたまり（.nb）・入力欄には差さない
    expect(await page.locator('.nb wbr').count()).toBe(0);
    expect(await page.evaluate(() => getComputedStyle(document.body).wordBreak)).toBe('keep-all');

    // 描画のたびに作る文にも差す。URLと持ち主の名前には差さない
    const sample = SAMPLES.find((one) => one.id === 'lookalike');
    const expected = judge(sample.url, sample.trace, sample.around);
    await page.locator('.sample-chip[data-sample="lookalike"]').click();
    await waitPhase(page, 'result');
    await expect.poll(() => page.locator('#verdict-summary wbr').count()).toBeGreaterThan(0);
    await expect(page.locator('#verdict-summary')).toHaveText(withoutCaveat(expected.visitor.summary));
    await expect.poll(() => page.locator('#verdict-reasons li wbr').count()).toBeGreaterThan(0);
    await expect(page.locator('#verdict-reasons li')).toHaveText(expected.visitor.reasons);
    expect(await page.locator('.host__reg wbr, .host__label wbr, .url__part wbr').count()).toBe(0);
    await expect(page.locator('#verdict-host .host__reg')).toHaveText(expected.target.registrable);
  });

  test('戻る：結果から戻ると、入力の画面に前のURLが入っている。URLは変えず、やり直しで履歴を積み増さない', async ({ page }) => {
    const calls = await mockApi(page, { trace: { error: 'rate_limited' }, status: 429, headers: { 'Retry-After': '1' }, next: { trace: fixture('trace-clean.json') } });
    await open(page);
    const startUrl = page.url();
    const startLength = await page.evaluate(() => history.length);
    await check(page, 'https://www.well-kept.jp/menu');
    await waitPhase(page, 'failed');
    expect(page.url()).toBe(startUrl);
    expect(await page.evaluate(() => history.length)).toBe(startLength + 1);
    // 失敗の画面でやり直しても、履歴は1つのまま（積み増さない）
    await expect(page.locator('#retry')).toBeEnabled({ timeout: 5000 });
    await page.locator('#retry').click();
    await waitPhase(page, 'result');
    expect(calls.trace).toHaveLength(2);
    expect(await page.evaluate(() => history.length)).toBe(startLength + 1);
    // ブラウザの「戻る」で入力の画面へ。前のURLが入っている
    await page.evaluate(() => history.back());
    await waitPhase(page, 'idle');
    await expect(page.locator('#url-input')).toHaveValue('https://www.well-kept.jp/menu');
    await expect(page.locator('#url-input')).toBeFocused();
    // 全部選んだ状態：貼り付けや入力で、前のリンクの後ろに足されず置き換わる
    expect(await page.locator('#url-input').evaluate((node) => [node.selectionStart, node.selectionEnd])).toEqual([0, 'https://www.well-kept.jp/menu'.length]);
    await expect(page.locator('#result')).toBeHidden();
    expect(page.url()).toBe(startUrl);
    // もう一度調べても、履歴は増えない（戻った先から積み直す）
    await page.locator('#check-button').click();
    await waitPhase(page, 'result');
    expect(await page.evaluate(() => history.length)).toBe(startLength + 1);
    // 「別のリンクを調べる」も同じ戻り方。ただし欄は空にする
    await page.locator('#again').click();
    await waitPhase(page, 'idle');
    expect(await page.evaluate(() => history.state)).toBeNull();
    await expect(page.locator('#url-input')).toHaveValue('');
    await expect(page.locator('#url-input')).toBeFocused();
  });

  test('一部しか取れない：周りの情報が回数の上限で取れないときは、守りの点数は暫定と出し、残り秒数つきの「もう一度調べる」を出す', async ({ page }) => {
    await mockApi(page, { aroundStatus: 429, aroundHeaders: { 'Retry-After': '30' } });
    await open(page);
    await check(page, 'https://www.well-kept.jp/');
    await waitPhase(page, 'result');
    const box = page.locator('#verdict-fetch');
    await expect(box).toHaveAttribute('data-kind', 'partial');
    await expect(page.locator('#verdict-fetch-title')).toHaveText('周辺の情報を取得できなかったので、守りの点数は暫定です。');
    await expect(box).toContainText(`1分あたり約${LIMITS.RATE_PER_MINUTE}回`);
    await expect(page.locator('#retry')).toBeDisabled();
    await expect(page.locator('#retry')).toContainText('あと');
    await expect(page.locator('#progress li[data-step="around"]')).toHaveAttribute('data-state', 'failed');
    await expect(page.locator('#live')).toContainText('守りの点数は暫定です');
    // 相手のサイトにはつながっているので、コピーは出す
    await expect(page.locator('#copy-report')).toBeVisible();
    // 守りの点数は暫定：タブの名前と、大きな数字の横の札
    const expected = judge('https://www.well-kept.jp/', fixture('trace-clean.json'), null);
    expect(expected.owner.provisional).toBe(true);
    await expect(page.locator('#tab-owner-badge')).toHaveText(`守りの評価 ${expected.owner.grade}（${expected.owner.score}点・暫定）`);
    await page.locator('#tab-owner').click();
    await expect(page.locator('#owner-provisional')).toBeVisible();
    await expect(page.locator('#owner-provisional')).toHaveText('暫定');
  });

  test('使い回した結果：trace.cached のときだけ、時刻の行に「同じリンクの◯分以内の結果を使っています」と添える', async ({ page }) => {
    const note = `（同じリンクの${LIMITS.CACHE_TTL_S / 60}分以内の結果を使っています）`;
    await mockApi(page, { trace: { ...fixture('trace-clean.json'), cached: true } });
    await open(page);
    await check(page, 'https://www.well-kept.jp/');
    await waitPhase(page, 'result');
    await expect(page.locator('#verdict-time')).toContainText(note);
    await expect(page.locator('#verdict-time')).toContainText('（日本時間）の時点で見えたことです。');
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await mockApi(page);
    await open(page);
    await check(page, 'https://www.well-kept.jp/');
    await waitPhase(page, 'result');
    await expect(page.locator('#verdict-time')).not.toContainText('分以内の結果');
  });

  test('記号の意味：丸に i は段階「気になる」だけ。中立の知らせと手順の完了は、段階の記号と別の形', async ({ page }) => {
    // 丸に i（data-shape="info"）は、「気になる」の色の札の中か、段階が「気になる」の帯の中だけ
    const infoOutsideNote = () => page.evaluate(() => [...document.querySelectorAll('svg[data-shape="info"]')].filter((svg) => {
      const holder = svg.parentElement;
      if (holder.classList.contains('lv-note')) return false;
      return !(holder.id === 'verdict-icon' && document.getElementById('verdict').dataset.level === 'note');
    }).length);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await mockApi(page, { gate });
    await open(page);
    expect(await infoOutsideNote(), '待機画面').toBe(0);
    await check(page, 'https://www.well-kept.jp/');
    await waitPhase(page, 'checking');
    // 途中の知らせ（見た目で目立つ点なし）は四角にメモ線。手順の「完了」は塗りのないチェック
    await expect(page.locator('#early-list svg[data-shape="memo"]')).toHaveCount(1);
    expect(await infoOutsideNote(), '調べている途中').toBe(0);
    const done = await page.locator('#progress li[data-state="done"] .progress__icon').first().evaluate((node) => ({ back: getComputedStyle(node).backgroundColor, border: getComputedStyle(node).borderTopColor }));
    expect(done.back).toBe('rgba(0, 0, 0, 0)');
    expect(done.border).toBe('rgba(0, 0, 0, 0)');
    release();
    await waitPhase(page, 'result');
    // 運営者向けの「参考」も四角にメモ線
    await page.locator('#tab-owner').click();
    const infos = page.locator('#panel-owner .finding[data-status="info"]');
    if (await infos.count()) await expect(infos.first().locator('svg')).toHaveAttribute('data-shape', 'memo');
    expect(await infoOutsideNote(), '結果').toBe(0);
    for (const sample of SAMPLES) {
      await open(page);
      await page.locator(`.sample-chip[data-sample="${sample.id}"]`).click();
      await waitPhase(page, 'result');
      expect(await infoOutsideNote(), `見本 ${sample.id}`).toBe(0);
    }
  });

  test('ドメインの途中で折らない：調べるリンク・送ったアドレス・一度きりの確認で、持ち主の名前を1かたまりにする', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await mockApi(page, { gate: new Promise(() => {}) });
    await open(page);
    const raw = 'https://www.parcel-notice-center.jp/verify/AbCdEf0123456789xyz?id=8841';
    const registrable = parseInput(raw).registrable;
    // メッセージごと貼ったときの「調べるリンク」
    await page.locator('#url-input').fill(`【お知らせ】お荷物をお預かりしています。${raw} から確認してください`);
    await expect(page.locator('#input-preview .host__reg')).toHaveText(registrable);
    // 一度きりの確認の「このまま調べると送るアドレス」
    await page.locator('#check-button').click();
    await expect(page.locator('#one-time-notice')).toBeVisible();
    await expect(page.locator('#one-time-href .host__reg')).toHaveText(registrable);
    await expect(page.locator('#one-time-title .nb')).toHaveText('一度きりのリンク');
    // 調べている途中の「送ったアドレス」
    await page.locator('#one-time-continue').click();
    await waitPhase(page, 'checking');
    await expect(page.locator('#checking-href .host__reg')).toHaveText(registrable);
    // 持ち主の名前は1つの箱（途中で行が分かれない）。手前の名前は「.」の後ろでだけ折れる
    for (const where of ['#input-preview', '#checking-href']) {
      const rects = await page.locator(`${where} .host__reg`).evaluate((node) => node.getClientRects().length);
      expect(rects, `${where} の持ち主の名前が割れている`).toBe(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    // 「@」の左に文字があるアドレスは、元の文字を変えずに区切るだけ（持ち主の名前の色分けで、すり替えを隠さない）
    await open(page);
    await page.locator('#url-input').fill(`確認 ${USERINFO_TRICK}`);
    await expect(page.locator('#input-preview')).toContainText(USERINFO_TRICK);
    await expect(page.locator('#input-preview .host__reg')).toHaveCount(0);
  });

  test('写しの文：見本の結果をコピーすると、先頭に「見本」と入る。本物の診断には入らない', async ({ page }) => {
    await captureClipboard(page);
    await mockApi(page);
    await open(page);
    await page.locator('.sample-chip[data-sample="lookalike"]').click();
    await waitPhase(page, 'result');
    await page.locator('#copy-report').click();
    await page.locator('#copy-summary').click();
    await expect.poll(() => page.evaluate(() => window.__copied.length)).toBe(2);
    for (const text of await page.evaluate(() => window.__copied)) expect(text.startsWith('【見本】')).toBe(true);
    await open(page);
    await check(page, 'https://www.well-kept.jp/');
    await waitPhase(page, 'result');
    await page.locator('#copy-summary').click();
    await expect.poll(() => page.evaluate(() => window.__copied.length)).toBe(1);
    const [summary] = await page.evaluate(() => window.__copied);
    expect(summary).not.toContain('【見本】');
    expect(summary).toContain('リンクの毒見で調べた結果');
  });

  test('長すぎるリンクは調べず、開かずに確かめる道を言う', async ({ page }) => {
    const calls = await mockApi(page);
    await open(page);
    await check(page, `https://example.com/${'a'.repeat(LIMITS.MAX_URL_LENGTH + 50)}`);
    await expect(page.locator('#input-error')).toHaveText('このリンクは長すぎて調べられません。開かずに、公式のアプリや窓口から確かめてください。');
    await expect(page.locator('#url-input')).toBeFocused();
    await waitPhase(page, 'idle');
    expect(calls.trace).toHaveLength(0);
  });

  test('敵対的な値：スクリプトは動かず、要素は生えず、文字としてそのまま出る', async ({ page }) => {
    await page.addInitScript(() => {
      window.__pwned = 0;
      window.alert = () => { window.__pwned += 1; };
    });
    await mockApi(page, { trace: fixture('trace-hostile.json'), around: fixture('around-unavailable.json') });
    await open(page);
    await check(page, 'https://hostile-test.jp/');
    await waitPhase(page, 'result');
    await page.locator('#observed summary').click();
    await page.locator('#tab-owner').click();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__pwned)).toBe(0);
    const counts = await page.evaluate(() => ({
      img: document.querySelectorAll('img').length,
      scripts: document.body.querySelectorAll('script').length,
      handlers: document.querySelectorAll('[onerror],[onload],[onclick]').length,
      // リンクは http(s)・ページ内・同じサイト・数字だけの電話番号だけ
      badLinks: [...document.querySelectorAll('a[href]')].filter((a) => !/^(https?:|#|\/|tel:(%23)?[0-9]+$)/.test(a.getAttribute('href'))).length,
      bold: document.querySelectorAll('#result b').length
    }));
    expect(counts).toEqual({ img: 0, scripts: 0, handlers: 0, badLinks: 0, bold: 0 });
    const observed = await page.locator('#observed-body').textContent();
    const hostile = fixture('trace-hostile.json');
    expect(observed).toContain(hostile.html.title);
    expect(observed).toContain(hostile.html.h1);
    expect(observed).toContain(hostile.final.headers.server);
    expect(observed).toContain(hostile.html.forms[0].action);
    // 文字の向きを変える文字は、生のまま出さず ⟦U+202E⟧ の形で見せる
    const rlo = String.fromCodePoint(0x202e);
    expect(hostile.html.textSample).toContain(rlo);
    expect(observed).toContain('⟦U+202E⟧');
    expect(await page.evaluate(() => document.body.textContent)).not.toContain(rlo);
  });

  test('禁止語は、どの状態の画面にも出ない', async ({ page }) => {
    expect(BANNED_PHRASES.length).toBeGreaterThanOrEqual(6);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await mockApi(page, { gate });
    await open(page);
    expectNoBanned(await pageText(page), '初期画面');
    await check(page, 'https://shop.mail-notice.jp/verify/AbCdEf0123456789xyz');
    await expect(page.locator('#one-time-notice')).toBeVisible();
    expectNoBanned(await pageText(page), '一度きりの確認');
    await page.locator('#one-time-continue').click();
    await waitPhase(page, 'checking');
    expectNoBanned(await pageText(page), '調べている途中');
    release();
    await waitPhase(page, 'result');
    expectNoBanned(await pageText(page), '結果');
    for (const sample of SAMPLES) {
      await open(page);
      await page.locator(`.sample-chip[data-sample="${sample.id}"]`).click();
      await waitPhase(page, 'result');
      await page.locator('#tab-owner').click();
      expectNoBanned(await pageText(page), `見本 ${sample.id}`);
    }
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await mockApi(page, { trace: fixture('trace-dns-failed.json') });
    await open(page);
    await check(page, 'https://plain-site.jp/');
    await waitPhase(page, 'failed');
    expectNoBanned(await pageText(page), 'つながらない');
    await open(page);
    await check(page, USERINFO_TRICK);
    await waitPhase(page, 'result');
    expectNoBanned(await pageText(page), 'つなぎに行かない');
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await mockApi(page, { trace: { error: 'rate_limited' }, status: 429, headers: { 'Retry-After': '30' } });
    await open(page);
    await check(page, 'https://plain-site.jp/');
    await waitPhase(page, 'failed');
    expectNoBanned(await pageText(page), '回数の上限');
  });

  test('何も保存せず、外のホストへは1件も接続しない。URLも書き換えない', async ({ page }) => {
    const outside = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol !== 'data:') outside.push(request.url());
    });
    await mockApi(page);
    await open(page);
    const startUrl = page.url();
    await page.locator('.sample-chip[data-sample="lookalike"]').click();
    await waitPhase(page, 'result');
    expect(page.url()).toBe(startUrl);
    await open(page);
    await check(page, 'https://www.well-kept.jp/');
    await waitPhase(page, 'result');
    expect(page.url()).toBe(startUrl);
    const stored = await page.evaluate(async () => ({
      local: localStorage.length,
      session: sessionStorage.length,
      cookie: document.cookie,
      databases: indexedDB.databases ? (await indexedDB.databases()).length : 0
    }));
    expect(stored).toEqual({ local: 0, session: 0, cookie: '', databases: 0 });
    expect(outside).toEqual([]);
    // 外部の診断サービスは、押したときに別タブで開くリンクだけ
    for (const link of await page.locator('#external-list a').all()) {
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(await link.getAttribute('href')).toMatch(/^https:\/\//);
      expect(await link.getAttribute('href')).not.toContain('%3F');
    }
  });

  test('キーボードだけで使える：Tab順・Enter・タブの矢印・開閉・コピー', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'クリップボードの許可は Chromium でだけ与えられる');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await mockApi(page);
    await open(page);
    const order = [];
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => {
        const node = document.activeElement;
        if (node.tagName === 'A') return `link${node.getAttribute('href')}`;
        return node.id || node.dataset.sample || node.closest('details')?.id || node.tagName;
      }));
    }
    expect(order).toEqual(['paste-button', 'url-input', 'check-button', 'link#samples', 'settings', 'lookalike', 'clean', 'legacy']);

    await page.locator('#url-input').focus();
    await page.keyboard.type('https://www.well-kept.jp/');
    await page.keyboard.press('Shift+Enter');
    expect(await page.locator('#url-input').inputValue()).toContain('\n');
    await waitPhase(page, 'idle');
    await page.keyboard.press('Enter');
    await waitPhase(page, 'result');
    await expect(page.locator('#verdict-headline')).toBeFocused();

    // 軸の切り替え：矢印・Home・End
    await page.locator('#tab-visitor').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-owner')).toBeFocused();
    await expect(page.locator('#tab-owner')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#panel-owner')).toBeVisible();
    await expect(page.locator('#panel-visitor')).toBeHidden();
    await page.keyboard.press('Home');
    await expect(page.locator('#tab-visitor')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(page.locator('#tab-owner')).toHaveAttribute('aria-selected', 'true');

    // 所見の開閉
    const finding = page.locator('#panel-owner .finding').first();
    await finding.locator('summary').focus();
    await page.keyboard.press('Enter');
    expect(await finding.evaluate((node) => node.open)).toBe(true);
    await page.keyboard.press('Enter');
    expect(await finding.evaluate((node) => node.open)).toBe(false);

    // 点数の付け方へ移り、「結果に戻る」で帯へ戻る
    await page.locator('#owner-how').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#how-scoring')).toBeFocused();
    expect(await page.locator('#how-catalog').evaluate((node) => node.open)).toBe(false);
    await expect(page.locator('#how-back a')).toBeVisible();
    await expect(page.locator('#how-back-end a')).toBeVisible();
    const before = await page.locator('#how-back').evaluate((node) => node.compareDocumentPosition(document.getElementById('how-catalog')) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before, '「結果に戻る」が一覧の前にない').toBeTruthy();
    await page.locator('#how-back a').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#verdict-headline')).toBeFocused();

    // コピーの中身に、調べた相手と「見ていないこと」が入る
    await page.locator('#copy-report').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#copy-report')).toHaveText('コピーしました');
    const report = await page.evaluate(() => navigator.clipboard.readText());
    expect(report).toContain('https://www.well-kept.jp/');
    expect(report).toContain('見ていないこと');
    await page.locator('#copy-summary').focus();
    await page.keyboard.press('Enter');
    const summary = await page.evaluate(() => navigator.clipboard.readText());
    expect(summary).toContain(await page.locator('#verdict-headline').textContent());
  });

  test('待ちが長いと、画面が止まっていないことと、結果は最後に出ることを知らせる', async ({ page }) => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await mockApi(page, { gate });
    await open(page);
    await check(page, 'https://slow-site.jp/');
    await waitPhase(page, 'checking');
    await expect(page.locator('#slow-note')).toBeHidden();
    const connect = page.locator('#progress li[data-step="connect"] .progress__detail');
    await expect(connect).toContainText('もう少しかかっています。相手のサイトの応答が遅いようです', { timeout: 9000 });
    const note = page.locator('#slow-note');
    await expect(note).toBeVisible();
    await expect(note).toContainText('画面は止まっていません');
    await expect(note).toContainText(`最大で約${LIMITS.TRACE_TIMEOUT_MS / 1000}秒`);
    await expect(note).toContainText(`最大で約${LIMITS.AROUND_TIMEOUT_MS / 1000}秒`);
    await expect(note).toContainText('途中で結果だけを先に出す仕組みはありません');
    await expect(page.locator('#live')).toContainText('もう少しかかっています');
    release();
    await waitPhase(page, 'result');
  });

  test('動きを減らす設定では、針が動かない', async ({ page }) => {
    await mockApi(page, { gate: new Promise(() => {}) });
    await open(page);
    await check(page, 'https://www.well-kept.jp/');
    await waitPhase(page, 'checking');
    expect(await page.locator('#checking .needle').evaluate((node) => getComputedStyle(node).animationName)).toBe('dip');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => page.locator('#checking .needle').evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  test('ダウンロードの応答は、守りの点数を「採点の対象外」と理由つきで出す', async ({ page }) => {
    await mockApi(page, { trace: fixture('trace-apk.json'), around: fixture('around-unavailable.json') });
    const expected = judge('https://dl.parcel-update.jp/track.apk', fixture('trace-apk.json'), fixture('around-unavailable.json'));
    await open(page);
    await check(page, 'https://dl.parcel-update.jp/track.apk');
    await waitPhase(page, 'result');
    await expect(page.locator('#verdict')).toHaveAttribute('data-level', expected.visitor.level);
    await page.locator('#tab-owner').click();
    expect(expected.owner.score).toBeNull();
    await expect(page.locator('#owner-unscored')).toBeVisible();
    await expect(page.locator('#owner-unscored')).toContainText('採点の対象外');
    await expect(page.locator('#tab-owner-badge')).toHaveText('採点なし');
  });

  test('本番のCSPのもとで、違反なく動く', async ({ page, context }) => {
    const headers = readFileSync(join(root, 'dist', '_headers'), 'utf8').split('\n');
    const at = headers.indexOf('/day-074-link-dokumi/*');
    expect(at, 'dist/_headers に Day74 の指定が無い（npm run build を先に）').toBeGreaterThanOrEqual(0);
    const csp = headers.slice(at + 1).find((line) => line.trim().startsWith('Content-Security-Policy:')).replace(/^\s*Content-Security-Policy:\s*/, '');
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self';");
    await context.route('**/day-074-link-dokumi/**', async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
    });
    await page.addInitScript(() => {
      window.__violations = [];
      document.addEventListener('securitypolicyviolation', (event) => window.__violations.push(`${event.violatedDirective} ${event.blockedURI}`));
    });
    await mockApi(page);
    await open(page);
    await page.locator('.sample-chip[data-sample="legacy"]').click();
    await waitPhase(page, 'result');
    await page.locator('#tab-owner').click();
    await page.locator('#panel-owner .finding summary').first().click();
    await open(page);
    await check(page, 'https://www.well-kept.jp/');
    await waitPhase(page, 'result');
    expect(await page.evaluate(() => window.__violations)).toEqual([]);
  });

  test('色の比：本文と小さな灰色の文字は4.5:1以上、入力欄とボタンの枠は3:1以上（段階ごとの帯も）', async ({ page }) => {
    const measure = (items) => page.evaluate((list) => {
      const parse = (value) => {
        const numbers = (value.match(/[\d.]+/g) ?? []).map(Number);
        const scale = value.startsWith('color(') ? 255 : 1;
        return { rgb: numbers.slice(0, 3).map((n) => n * scale), alpha: numbers.length > 3 ? numbers[3] : 1 };
      };
      const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
      const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
      const ground = (node, self) => {
        let at = self ? node : node.parentElement;
        while (at) {
          const back = parse(getComputedStyle(at).backgroundColor);
          if (back.alpha > 0) return back.rgb;
          at = at.parentElement;
        }
        return [255, 255, 255];
      };
      return list.map(({ selector, kind, optional }) => {
        const node = document.querySelector(selector);
        if (!node) return { selector, ratio: optional ? 'skip' : null };
        const style = getComputedStyle(node);
        const fore = parse(kind === 'border' ? style.borderTopColor : kind === 'border-left' ? style.borderLeftColor : style.color);
        const back = ground(node, kind === 'text');
        const mixed = fore.rgb.map((value, index) => fore.alpha * value + (1 - fore.alpha) * back[index]);
        return { selector, ratio: Math.round(ratio(mixed, back) * 100) / 100, size: parseFloat(style.fontSize) };
      });
    }, items);
    const verify = (results, min, minSize = 0) => {
      for (const { selector, ratio, size } of results) {
        if (ratio === 'skip') continue;
        expect(ratio, `${selector} が見つからない`).not.toBeNull();
        expect(ratio, `${selector} の比 ${ratio}`).toBeGreaterThanOrEqual(min);
        if (minSize) expect(size, `${selector} の文字が小さい（${size}px）`).toBeGreaterThanOrEqual(minSize);
      }
    };
    await open(page);
    verify(await measure([
      { selector: '.masthead__lede', kind: 'text' }, { selector: '.intake__help', kind: 'text' }, { selector: '.intake__keys', kind: 'text' },
      { selector: '.caution span', kind: 'text' }, { selector: '.samples__note', kind: 'text' }, { selector: '.sample-chip__note', kind: 'text' },
      { selector: '.sample-chip__url', kind: 'text' }, { selector: '.sample-chip__go', kind: 'text' }, { selector: '.settings__summary', kind: 'text' },
      { selector: '.doc li', kind: 'text' }, { selector: '.docs__nav-title', kind: 'text' }
    ]), 4.5);
    // 小さな灰色の文字は13px以上
    verify(await measure([{ selector: '.sample-chip__note', kind: 'text' }, { selector: '.sample-chip__url', kind: 'text' }, { selector: '.intake__keys', kind: 'text' }]), 4.5, 13);
    verify(await measure([
      { selector: '#url-input', kind: 'border' }, { selector: '#paste-button', kind: 'border' }, { selector: '.sample-chip', kind: 'border' },
      { selector: '.sample-chip__go', kind: 'border' }
    ]), 3);
    for (const sample of SAMPLES) {
      await open(page);
      await page.locator(`.sample-chip[data-sample="${sample.id}"]`).click();
      await waitPhase(page, 'result');
      await page.waitForTimeout(2400);
      verify(await measure([
        { selector: '.verdict__word', kind: 'text' }, { selector: '#verdict-headline', kind: 'text' }, { selector: '#verdict-summary', kind: 'text' },
        { selector: '#verdict-caveat', kind: 'text', optional: true }, { selector: '#verdict-reasons li', kind: 'text', optional: true },
        { selector: '.hop__role', kind: 'text' }, { selector: '.limits__list li', kind: 'text' }, { selector: '.after__note', kind: 'text' },
        { selector: '#verdict-time', kind: 'text' }, { selector: '.tab__badge', kind: 'text' }
      ]), 4.5);
      // 小さな灰色の文字（訪問者向けの判定・主な理由・調べた相手・物差しの言葉・重大度・選ばれていない側の札）は 4.5:1 以上かつ13px以上
      verify(await measure([
        { selector: '.verdict__axis', kind: 'text' }, { selector: '.mini-title', kind: 'text', optional: true }, { selector: '.verdict__host-label', kind: 'text' },
        { selector: '.verdict__host-hint', kind: 'text', optional: true }, { selector: '#verdict-host .host__reg', kind: 'text' },
        { selector: '.meter__step:not([aria-current]) .meter__word', kind: 'text' }, { selector: '.meter__step[aria-current] .meter__word', kind: 'text' },
        { selector: '.finding__meta', kind: 'text' }, { selector: '#tab-owner .tab__sub', kind: 'text' }, { selector: '#tab-visitor .tab__sub', kind: 'text' },
        { selector: '.group__note', kind: 'text', optional: true }, { selector: '#owner-scale .score__band', kind: 'text' }, { selector: '#verdict-sample', kind: 'text' },
        { selector: '#level-legend li', kind: 'text', optional: true }
      ]), 4.5, 13);
      verify(await measure([{ selector: '#verdict', kind: 'border-left' }, { selector: '#copy-report', kind: 'border' }, { selector: '.finding', kind: 'border-left' }]), 3);
    }
    // 調べている途中（段階の文字）と、つながらなかったとき（「不明」の帯）
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await mockApi(page, { trace: fixture('trace-dns-failed.json'), gate });
    await open(page);
    await check(page, 'plain-site.jp/page?a=1');
    await waitPhase(page, 'checking');
    verify(await measure([
      { selector: '#progress li[data-state="done"] .progress__state', kind: 'text' }, { selector: '#progress li[data-state="running"] .progress__state', kind: 'text' },
      { selector: '#progress li[data-state="waiting"] .progress__state', kind: 'text' }, { selector: '.progress__detail', kind: 'text' },
      { selector: '#checking-notes li', kind: 'text' }, { selector: '#early-list li span:last-child', kind: 'text' }, { selector: '.checking__target .tag', kind: 'text' }
    ]), 4.5, 13);
    release();
    await waitPhase(page, 'failed');
    verify(await measure([
      { selector: '.verdict__word', kind: 'text' }, { selector: '.verdict__fetch-title', kind: 'text' }, { selector: '.verdict__fetch-next', kind: 'text' },
      { selector: '#verdict-caveat', kind: 'text' }
    ]), 4.5);
    verify(await measure([{ selector: '#verdict', kind: 'border-left' }, { selector: '#retry', kind: 'border' }]), 3);
    // 回数の上限：数えている間の「もう一度調べる」と、その横の小さな文字
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await mockApi(page, { trace: { error: 'rate_limited' }, status: 429, headers: { 'Retry-After': '30' } });
    await open(page);
    await check(page, 'https://plain-site.jp/');
    await waitPhase(page, 'failed');
    verify(await measure([{ selector: '#retry', kind: 'text' }, { selector: '#retry-wait', kind: 'text' }, { selector: '.verdict__fetch-body', kind: 'text' }]), 4.5, 13);
  });

  test('画面のコードは、HTMLとして文字列を差し込む書き方と保存の仕組みを使わない', () => {
    const source = readFileSync(join(appDir, 'app.js'), 'utf8');
    for (const banned of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie']) {
      expect(source.includes(banned), `app.js に ${banned} がある`).toBe(false);
    }
    // 履歴は「戻る」のために1つ積むだけ。URLは変えない（3つ目の引数を渡さない）。URLの書き換えもしない
    const historyCalls = source.match(/history\.(?:pushState|replaceState)\([^)]*\)/g) ?? [];
    expect(historyCalls.length).toBeGreaterThan(0);
    for (const call of historyCalls) expect(call).toMatch(/^history\.(?:pushState|replaceState)\(\{ dokumi: 'result' \}, ''\)$/);
    expect(source).not.toMatch(/location\.(?:hash|search|href|pathname)\s*=(?!=)/);
    expect(source).not.toMatch(/location\.(?:assign|replace)\(/);
    // 接続先の定数に見える書き方（横断のCSP検査が接続先と読む）をしない
    expect(source).not.toMatch(/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*[`'"]https:\/\//);
    // 同じサイトのAPIにしか fetch しない
    for (const [, target] of source.matchAll(/fetch\(\s*([^,)]+)/g)) expect(target.trim()).toBe('path');
    expect(source.match(/\/api\/day-074\/(?:trace|around)\?/g)).toHaveLength(2);
  });
});
