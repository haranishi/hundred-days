#!/usr/bin/env node
/* 画面 → 本物のAPI（workerd）→ 判定 → 表示 を、実在の無害なサイトで一度通す。E2Eは通信を偽物に差し替えるので、
   「実際にサーバーが返した観測を、画面が壊れずに描けるか」はここで見る。配信しない（tools/はビルドに入らない）。

   使い方（先に `npm run build` と `wrangler pages dev dist --port 8799` を済ませる）：
     node day-074-link-dokumi/tools/smoke-real.mjs --base http://127.0.0.1:8799 [--shots <dir>] [--only example,github]
   試験先は example.com・github.com・httpforever.com・badssl.com など、単発のGETで迷惑にならないもの。
   診断は1分12回の制限があるので、各ケースの間に間隔を空ける。 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const base = opt('--base', 'http://127.0.0.1:8799').replace(/\/$/, '');
const shots = opt('--shots', '');
const only = opt('--only', '').split(',').filter(Boolean);
const pause = Number(opt('--pause', '6000'));
if (shots) mkdirSync(shots, { recursive: true });

const CASES = [
  { id: 'example', input: 'https://example.com/', phase: 'result', note: '最小の正規サイト。HSTSなどが無い' },
  { id: 'github', input: 'https://github.com/', phase: 'result', note: '守りの厚い大手サイト' },
  { id: 'http-only', input: 'http://httpforever.com/', phase: 'result', note: 'HTTPS非対応の試験サイト' },
  { id: 'message', input: 'お荷物をお届けにあがりましたが不在でした。確認はこちら https://example.com/ 以上', phase: 'result', note: '本文ごと貼る' },
  { id: 'tls-fail', input: 'https://expired.badssl.com/', phase: 'result|failed', note: '期限切れの証明書（診断は成立しない側）' },
  { id: 'ip', input: 'http://127.0.0.1/login', phase: 'result', note: '通信しない入力（数字のアドレス）' },
  { id: 'userinfo', input: 'https://amazon.co.jp@example.com/', phase: 'result', note: '通信しない入力（@の偽装）' }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const browser = await chromium.launch();
const results = [];
let first = true;
for (const item of CASES) {
  if (only.length && !only.includes(item.id)) continue;
  if (!first) await sleep(pause);
  first = false;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP' });
  const page = await context.newPage();
  const problems = [];
  const calls = [];
  page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) problems.push(`${message.type()}: ${message.text()}`); });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('request', (request) => { const url = new URL(request.url()); if (url.origin !== new URL(base).origin) problems.push(`外部への通信: ${url.origin}`); else if (url.pathname.startsWith('/api/')) calls.push(url.pathname + url.search); });
  const started = Date.now();
  await page.goto(`${base}/day-074-link-dokumi/`);
  await page.locator('#url-input').fill(item.input);
  await page.locator('#check-button').click();
  // 一度きりのリンクの確認が出たら続行を押す。通常の入力では出ない。
  const oneTime = page.locator('#one-time-continue');
  const wanted = new RegExp(`^(${item.phase})$`);
  const deadline = Date.now() + 40000;
  let phase = '';
  while (Date.now() < deadline) {
    phase = await page.locator('#app').getAttribute('data-phase');
    if (wanted.test(phase)) break;
    if (await oneTime.isVisible().catch(() => false)) await oneTime.click();
    await sleep(250);
  }
  const text = async (selector) => (await page.locator(selector).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  const row = {
    id: item.id, note: item.note, phase, ok: wanted.test(phase), seconds: +((Date.now() - started) / 1000).toFixed(1), calls,
    word: await text('#verdict-word'), headline: await text('#verdict-headline'), host: await text('#verdict-host'),
    ownerGrade: await text('#owner-grade'), ownerScore: await text('#owner-score'),
    visitorFindings: await page.locator('#visitor-findings > *').count(), ownerFindings: await page.locator('#owner-findings > *').count(),
    reasons: await text('#verdict-reasons'), fetchLine: await text('#verdict-fetch'), problems
  };
  if (shots) await page.screenshot({ path: join(shots, `${item.id}.png`), fullPage: true });
  results.push(row);
  await context.close();
}
await browser.close();

let failed = 0;
for (const row of results) {
  const bad = !row.ok || row.problems.length > 0;
  if (bad) failed++;
  console.log(`${bad ? 'NG' : 'OK'} ${row.id} [${row.phase}] ${row.seconds}s 訪問者「${row.word}」運営者${row.ownerGrade || '-'}(${row.ownerScore || '-'}) 所見${row.visitorFindings}/${row.ownerFindings} ${row.headline}`);
  if (row.reasons) console.log(`    理由: ${row.reasons.slice(0, 160)}`);
  if (row.fetchLine) console.log(`    通信: ${row.fetchLine.slice(0, 160)}`);
  console.log(`    API: ${row.calls.join(' , ') || '(呼んでいない)'}`);
  for (const problem of row.problems) console.log(`    ! ${problem}`);
}
console.log(failed ? `\n${failed}件が期待と違う` : '\n全ケース、画面は壊れず本物のAPIの結果を描けた');
process.exit(failed ? 1 : 0);
