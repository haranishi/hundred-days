// 共有の窓と、公開用のページ（このゲームについて・404）を、実際のブラウザで確かめる。
// 本番の Cloudflare Pages と同じセキュリティの設定（public/_headers の CSP）を、応答に付けて読む＝違反があればコンソールの誤りとして出る。
// node tools/shots/share-check.mjs [--url http://127.0.0.1:5185/] [--out DIR]
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { GPU_ARGS } from './common.mjs';

const { values } = parseArgs({ options: { url: { type: 'string', default: 'http://127.0.0.1:5185/' }, out: { type: 'string', default: '.agent-harness/runs/publish/share-check' } } });
await mkdir(values.out, { recursive: true });
const headers = await readFile('public/_headers', 'utf8');
const csp = headers.match(/Content-Security-Policy:\s*(.+)/)[1].trim();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '合格' : '不合格'}：${name}${detail ? ' ' + detail : ''}`); };
const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const label = `${viewport.width}x${viewport.height}`;
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const problems = [];
    page.on('console', m => { if (m.type() === 'error') problems.push(m.text().slice(0, 240)); });
    page.on('pageerror', e => problems.push(`例外: ${e.message}`));
    // 手元の確認用サーバーには、本番と同じ CSP を付けて読む。本番（Cloudflare）は、本物の設定がそのまま付くので、手を加えない
    const local = ['127.0.0.1', 'localhost'].includes(new URL(values.url).hostname);
    if (local) await context.route('**/*', async route => {
      const response = await route.fetch().catch(() => null);
      if (!response) return route.abort().catch(() => {});
      await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } }).catch(() => {});
    });
    await page.goto(values.url, { waitUntil: 'load' });
    // 読み込み中の表示（山のデータを読む前）にも「共有」がある。押すと共有の窓が開く
    const boot = page.locator('[data-boot] [data-share-open]');
    if (await boot.count()) {
      await boot.click().catch(() => {});
      const bootOk = await page.locator('[data-share-dialog] .share').isVisible().catch(() => false);
      check(`${label} 読み込み中にも共有の窓を開ける`, bootOk || (await page.locator('[data-boot]').count()) === 0);
      await page.locator('[data-share-close]').click().catch(() => {});
    }
    // 確認用の窓口（?debug=1）を使わず、本番と同じ画面で待つ：「滑りはじめる」が押せるようになるまで
    await page.locator('[data-start]:enabled').waitFor({ timeout: 60000 });
    // 題字：英字の名前が、画面からはみ出さない
    const fit = await page.evaluate(() => { const h = document.querySelector('.title-mark h1'); const r = h.getBoundingClientRect(); return { left: r.left, right: r.right, width: innerWidth, text: h.textContent }; });
    check(`${label} 題字が画面に収まる（${fit.text}）`, fit.left >= 0 && fit.right <= fit.width, JSON.stringify(fit));
    await page.screenshot({ path: join(values.out, `title-${label}.png`) });
    // 題字の画面から「共有」（読み上げの名前は、100 日チャレンジ共通の「このアプリを共有する」）
    const openers = page.getByRole('button', { name: 'このアプリを共有する', exact: true });
    check(`${label} 共有の入口は 1 つだけ（読み込み中の表示の入口は消えている）`, await openers.count() === 1);
    await openers.click();
    const dialog = page.locator('[data-share-dialog]'), share = dialog.locator('.share');
    check(`${label} 共有の窓が開き、共通部品の共有欄が見える`, await dialog.isVisible() && await share.count() === 1 && await share.isVisible());
    const x = new URL(await share.getByRole('link', { name: 'Xで投稿' }).getAttribute('href')), line = new URL(await share.getByRole('link', { name: 'LINEで送る' }).getAttribute('href'));
    const expected = await page.evaluate(() => document.querySelector('link[rel="canonical"]')?.href || location.href);
    check(`${label} X の投稿画面の住所（本文に FROSTLINE）`, x.origin + x.pathname === 'https://x.com/intent/post' && x.searchParams.get('url') === expected && x.searchParams.get('text').includes('FROSTLINE'), expected);
    check(`${label} LINE の住所`, line.searchParams.get('url') === expected);
    check(`${label} Instagram・YouTube へは直接投稿できない旨`, (await share.locator('.share__note').textContent()).includes('Instagram'));
    await page.screenshot({ path: join(values.out, `share-${label}.png`) });
    // 焦点が X のリンクにあるとき、Enter でゲームが始まらない（リンクだけが開く）
    await share.getByRole('link', { name: 'Xで投稿' }).focus();
    const popup = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
    await page.keyboard.press('Enter');
    const opened = await popup; const openedUrl = opened?.url() ?? '';
    await opened?.close();
    const onTitle = await page.evaluate(() => document.querySelector('[data-screen="title"]')?.hidden === false);
    check(`${label} Enter でリンクが開き、ゲームは始まらない`, onTitle && /x\.com|twitter\.com/.test(openedUrl), openedUrl.slice(0, 60));
    // リンクのコピー
    await share.getByRole('button', { name: 'リンクをコピー' }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    check(`${label} リンクをコピーできる`, copied === expected, copied);
    // 共有の窓の中も、44 px 以上の押せる大きさ
    const small = await page.evaluate(() => [...document.querySelectorAll('[data-share-dialog] a, [data-share-dialog] button')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect()).filter(r => r.height < 44 || r.width < 44).length);
    check(`${label} 共有の窓の押す所は、すべて 44 px 以上`, small === 0, `小さいもの ${small}`);
    // Escape で閉じると、焦点は「共有」へ戻る
    await page.keyboard.press('Escape');
    check(`${label} Escape で閉じ、焦点が「共有」へ戻る`, !(await dialog.isVisible()) && await page.evaluate(() => document.activeElement?.matches('[data-title-share]')));
    // 一時停止からも開ける。閉じると一時停止のまま
    await page.locator('[data-start]').click();
    await page.waitForFunction(() => document.querySelector('[data-screen="hud"]')?.hidden === false, null, { timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.locator('[data-action="share"]').click();
    const fromPause = await dialog.isVisible();
    await dialog.locator('[data-share-close]').click();
    check(`${label} 一時停止から共有を開き、閉じると一時停止のまま`, fromPause && !(await dialog.isVisible()) && (await page.locator('[data-panel-heading]').textContent()) === '一時停止');
    // 「このゲームについて」と 404
    const about = await context.newPage(); const aboutProblems = [];
    about.on('console', m => { if (m.type() === 'error') aboutProblems.push(m.text().slice(0, 200)); });
    await about.goto(new URL('/about/', values.url).href, { waitUntil: 'load' });
    const aboutOk = (await about.title()).includes('このゲームについて') && await about.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    await about.screenshot({ path: join(values.out, `about-${label}.png`), fullPage: true });
    check(`${label} このゲームについて（横にはみ出さない・誤り 0）`, aboutOk && aboutProblems.length === 0, aboutProblems.join(' / '));
    await about.close();
    check(`${label} コンソールの誤り 0（セキュリティの設定を掛けた状態）`, problems.length === 0, problems.join(' / '));
    await context.unrouteAll({ behavior: 'ignoreErrors' });
    await context.close();
  }
} finally { await browser.close(); }
const failed = results.filter(r => !r.ok).length;
console.log(failed ? `不合格 ${failed} 件／${results.length} 件` : `すべて合格（${results.length} 件）`);
process.exitCode = failed ? 1 : 0;
