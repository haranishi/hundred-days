// 公開用のスクリーンショット（1200×750）を撮る。使い方:
//   node day-096-ux-recipe/tools/take-screenshot.mjs --goal buy --select "ヒーロー" --out <PNGのパス>
// 目的を選び、指定の部品を選んだ編集画面を撮る。PNG → webp は cwebp で変換する（README の手順）。
import { launch } from './eval-helper.mjs';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { GOAL_LABEL, GOALS } from '../lib/contract.js';

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const goal = opt('goal', 'buy');
if (!GOALS.includes(goal)) throw new Error(`知らない目的です: ${goal}`);
const out = resolve(opt('out', './screenshot.png'));
const tab = opt('tab', '');
mkdirSync(dirname(out), { recursive: true });

const s = await launch({ device: 'pc', query: 'fresh=1&tips=0', out: dirname(out) });
await s.page.setViewportSize({ width: 1200, height: 750 });
await s.page.getByRole('button', { name: new RegExp(GOAL_LABEL[goal]) }).first().click();
await s.page.waitForSelector('#slot-outline li.ed-row', { timeout: 10_000 });
const select = opt('select', '');
if (select) await s.page.locator('#slot-outline li.ed-row').filter({ hasText: select }).first().click();
if (tab) await s.page.getByRole('tab', { name: tab }).first().click().catch(() => {});
await s.page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 5_000 }).catch(() => {});
await s.page.waitForTimeout(2000); // 自動保存の表示（「保存中…」）が落ち着くまで待つ
await s.page.screenshot({ path: out });
console.log(out);
if (s.errors.length) console.log(`コンソールのエラー: ${s.errors.join(' | ')}`);
await s.close();
