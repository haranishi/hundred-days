// Day66 実ブラウザ撮影スクリプト。画面の状態ごとに、幅を変えて撮る（見た目の採点に使う）。
// 使い方: node capture.mjs <outDir> [port] [--widths=390,320] [--motion] [--webkit]
//   <port> の静的サーバー（tools/static-server.mjs など）が、リポジトリの根を配信していること。
//   既定は「動きを減らす」設定で撮る（アニメの途中を撮らないため）。--motion を付けると通常の動き。
//   手はキーボードで押す（面データ levels.json の「見本の解」「罠」を使う）。撮影と同時に、横はみ出し・小さい押せる物・13px 未満の文字・盤と操作の位置も測って capture-report.txt に書く。
//   A3（文字の組み方）：撮るたびに、見えている段落ごとに「最後の行が4文字以下」「保護語（lib/wrap.js）の途中の改行」を数える。0件でなければ NG として書く。
import { chromium, webkit } from '@playwright/test';
import { homedir } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROTECTED_WORDS, PROTECTED_PATTERNS } from '../../../day-066-hakokage-kaito/lib/wrap.js';
import { loadLevel, initialState, act } from '../../../day-066-hakokage-kaito/lib/sim.js';

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const port = args.find((a) => /^\d+$/.test(a)) || '4570';
const withMotion = args.includes('--motion');
// --webkit：Safari と同じ描画エンジンで撮る。Playwright が要る版と入っている版が違うときは、WEBKIT_PATH（pw_run.sh のある所）で指す。
const useWebkit = args.includes('--webkit');
const widthsArg = args.find((a) => a.startsWith('--widths='));
const onlyWidths = widthsArg ? widthsArg.slice(9).split(',').map(Number) : null;
if (!outDir) { console.error('usage: node capture.mjs <outDir> [port] [--widths=390,320] [--motion]'); process.exit(1); }
const BASE = `http://127.0.0.1:${port}/day-066-hakokage-kaito/`;
mkdirSync(outDir, { recursive: true });

const LEVELS = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'levels.json'), 'utf8'));
const KEY = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight', '.': 'Space' };
// 見つかる手順（03_gates.md の E2E 5番と同じ）
const CAUGHT = { l1: [1, 'DD'], l4: [4, 'RDD'], l5: [5, 'RURDDD'], l7: [7, 'UUURRURDDDULLLDDR'] };

// 全8面ぶんの「見つかる」最短手順と「詰み」手順を sim で探す（文字の組み方の検査で、全面の結果の文を実際に出すため）
function shortestCaught(no) {
  const lv = loadLevel(LEVELS[no - 1]);
  const start = initialState(lv);
  let frontier = [{ moves: '', state: start }];
  const seen = new Set([JSON.stringify([start.player, start.boxes, start.guards])]);
  for (let depth = 0; depth < 14; depth++) {
    const next = [];
    for (const f of frontier) {
      for (const a of ['U', 'R', 'D', 'L', '.']) {
        const r = act(lv, f.state, a);
        if (!r.valid) continue;
        if (r.state.status === 'caught') return f.moves + a;
        const key = JSON.stringify([r.state.player, r.state.boxes, r.state.guards]);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ moves: f.moves + a, state: r.state });
      }
    }
    frontier = next;
  }
  return null;
}
const CAUGHT_ALL = Object.fromEntries(LEVELS.map((L) => [L.no, shortestCaught(L.no)]));

const SIZES = [
  { w: 390, h: 844, touch: true },
  { w: 375, h: 667, touch: true },
  { w: 320, h: 568, touch: true },
  { w: 844, h: 390, touch: true },
  { w: 768, h: 1024, touch: false },
  { w: 1440, h: 900, touch: false },
  { w: 720, h: 450, touch: false }, // 1440×900 を200%に拡大したときの見え方
];

const browser = useWebkit
  ? await webkit.launch({ executablePath: join(process.env.WEBKIT_PATH || join(homedir(), 'Library/Caches/ms-playwright/webkit-2359'), 'pw_run.sh') })
  : await chromium.launch({ headless: true });
const report = [];

for (const s of SIZES.filter((x) => !onlyWidths || onlyWidths.includes(x.w))) {
  const ctx = await browser.newContext({
    viewport: { width: s.w, height: s.h }, hasTouch: s.touch, isMobile: s.touch, deviceScaleFactor: 1,
    reducedMotion: withMotion ? 'no-preference' : 'reduce',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console:' + m.text()); });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });

  const tag = `${s.w}x${s.h}`;
  const gap = withMotion ? 230 : 70;
  const typoStats = { screens: 0, paragraphs: 0, shortLast: 0, splitWords: 0 };
  // A3：見えている段落ごとに、最後の行が4文字以下・保護語の途中の改行を数える（1文字ずつ位置を測って、行に分ける）
  const typo = async (name) => {
    const r = await page.evaluate(({ words, patterns }) => {
      const SKIP = 'script, style, noscript, .sr-only, .sprite, svg';
      const blockOf = (el) => { let x = el; while (x && ['inline', 'contents'].includes(getComputedStyle(x).display)) x = x.parentElement; return x; };
      const blocks = new Map();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!n.textContent.trim() || !el || el.closest(SKIP) || el.closest('.boardtext:not(:focus-within)')) continue;
        if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || el.closest('dialog:not([open])')) continue;
        const b = blockOf(el);
        if (!blocks.has(b)) blocks.set(b, []);
        blocks.get(b).push(n);
      }
      const res = { paragraphs: 0, shortLast: [], split: [] };
      for (const [block, nodes] of blocks) {
        const chars = [];
        for (const node of nodes) {
          const range = document.createRange();
          for (let i = 0; i < node.textContent.length; i++) {
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            const rect = [...range.getClientRects()].find((q) => q.width > 0 && q.height > 0);
            if (rect) chars.push({ ch: node.textContent[i], rect });
          }
        }
        if (!chars.length) continue;
        res.paragraphs += 1;
        const lines = [];
        let center = null;
        for (const c of chars) {
          const cy = (c.rect.top + c.rect.bottom) / 2;
          if (center === null || Math.abs(cy - center) > Math.max(4, c.rect.height * 0.6)) { lines.push([]); center = cy; }
          lines[lines.length - 1].push(c);
        }
        const lineOf = [];
        lines.forEach((l, li) => l.forEach(() => lineOf.push(li)));
        const full = chars.map((c) => c.ch).join('');
        const label = `${block.id ? '#' + block.id : block.tagName.toLowerCase() + (block.className && typeof block.className === 'string' ? '.' + block.className.split(' ')[0] : '')}`;
        const last = lines.length ? lines[lines.length - 1].map((c) => c.ch).join('').replace(/\s/g, '') : '';
        if (lines.length >= 2 && last.length <= 4) res.shortLast.push(`${label}「${last}」（${lines.length}行）`);
        const spans = [];
        for (const w of words) for (let at = full.indexOf(w); at >= 0; at = full.indexOf(w, at + 1)) spans.push([at, at + w.length]);
        for (const p of patterns) for (const m of full.matchAll(new RegExp(p.source, p.flags))) spans.push([m.index, m.index + m[0].length]);
        for (const [a, b] of spans) if (new Set(lineOf.slice(a, b)).size > 1) res.split.push(`${label}「${full.slice(a, b)}」`);
      }
      return res;
    }, { words: [...PROTECTED_WORDS], patterns: PROTECTED_PATTERNS.map((p) => ({ source: p.source, flags: p.flags })) });
    typoStats.screens += 1;
    typoStats.paragraphs += r.paragraphs;
    typoStats.shortLast += r.shortLast.length;
    typoStats.splitWords += r.split.length;
    if (r.shortLast.length || r.split.length) report.push(`${tag} ${name} A3 NG: ${[...r.shortLast.map((x) => `最後の行が4文字以下 ${x}`), ...r.split.map((x) => `保護語の途中で改行 ${x}`)].join(' / ')}`);
  };
  const shot = async (name, full = false) => {
    await page.waitForTimeout(withMotion ? 400 : 200);
    await page.screenshot({ path: `${outDir}/${tag}-${name}.png`, fullPage: full });
    if (!full) await typo(name);
  };
  const step = async (label, fn) => { try { await fn(); } catch (e) { report.push(`${tag} ${label}: 失敗 ${String(e.message).split('\n')[0]}`); } };
  const go = async (n) => { await page.goto(`${BASE}?level=${n}`); await page.waitForSelector('html[data-ready="true"]'); };
  const play = async (seq) => {
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    for (const ch of seq) { await page.keyboard.press(KEY[ch]); await page.waitForTimeout(gap); }
  };
  const status = () => page.evaluate(() => document.querySelector('#app')?.getAttribute('data-status'));
  const waitStatus = (v) => page.waitForFunction((x) => document.querySelector('#app')?.getAttribute('data-status') === x, v, { timeout: 5000 });
  const measure = async (name) => {
    const m = await page.evaluate(() => {
      const open = (el) => !el.closest('[hidden]') && !(el.closest('dialog') && !el.closest('dialog').open);
      const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && open(el); };
      const small = [...document.querySelectorAll('button, a[href], summary, [role=button], [role=switch]')].filter(vis).map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.id || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 12), w: Math.round(r.width), h: Math.round(r.height) };
      }).filter((t) => t.w > 2 && (t.w < 44 || t.h < 44));
      const smallText = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!n.textContent.trim() || !el || el.closest('svg') || !vis(el)) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 13) smallText.push(`${el.id || el.tagName.toLowerCase()}:${fs}px:${n.textContent.trim().slice(0, 8)}`);
      }
      const box = (sel) => { const e = document.querySelector(sel); if (!e || !vis(e)) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), Math.round(r.left), Math.round(r.right)]; };
      return {
        layout: document.documentElement.dataset.layout, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        small, smallText: smallText.slice(0, 6), board: box('#board'), controls: box('#controls'), vh: innerHeight,
      };
    });
    const bad = [];
    if (m.overflowX > 0) bad.push(`横はみ出し ${m.overflowX}px`);
    if (m.small.length) bad.push(`44px未満の押せる物 ${JSON.stringify(m.small.slice(0, 4))}`);
    if (m.smallText.length) bad.push(`13px未満の文字 ${m.smallText.join(' ')}`);
    if (m.board && m.board[1] > m.vh) bad.push(`盤が画面の下にはみ出す(下端${m.board[1]}>高さ${m.vh})`);
    if (m.controls && m.controls[1] > m.vh) bad.push(`操作が画面の下にはみ出す(下端${m.controls[1]}>高さ${m.vh})`);
    if (m.board && m.controls && !(m.board[3] <= m.controls[2] || m.controls[3] <= m.board[2] || m.board[1] <= m.controls[0] || m.controls[1] <= m.board[0])) bad.push(`盤と操作が重なる(盤${JSON.stringify(m.board)}・操作${JSON.stringify(m.controls)})`);
    report.push(`${tag} ${name} [${m.layout}] 盤${JSON.stringify(m.board)} 操作${JSON.stringify(m.controls)} ${bad.length ? 'NG: ' + bad.join(' / ') : 'OK'}`);
  };

  // 面1：最初・あそびかた・影ができる・宝・成功
  await step('00', async () => { await go(1); await shot('00-l1-start'); await shot('00-l1-start-full', true); await measure('面1 最初'); });
  await step('01 howto', async () => { await page.locator('#btn-howto').click(); await shot('01-howto'); await page.keyboard.press('Escape'); });
  await step('02 shadow', async () => { await go(1); await play('LLD'); await shot('02-l1-shadow'); await measure('面1 影ができた'); });
  await step('03 treasure', async () => { await play('RRDD'); await shot('03-l1-treasure'); });
  await step('04 clear', async () => { await play('UUR'); await waitStatus('escaped'); await shot('04-l1-clear'); await shot('04-l1-clear-full', true); await measure('面1 成功'); });
  // 失敗の4種類と、お手本
  await step('05 caught walked-in', async () => {
    await go(1); await play(CAUGHT.l1[1]); await waitStatus('caught');
    await shot('05-l1-caught-walkedin'); await shot('05-l1-caught-walkedin-full', true); await measure('面1 見つかった');
  });
  await step('06 demo', async () => {
    await page.locator('#btn-caught-undo').click(); await play('DD'); await waitStatus('caught');
    await shot('06-l1-demo-offer');
    await page.locator('#btn-caught-demo').click(); await page.waitForTimeout(1300); await shot('07-l1-demo-playing');
    await page.locator('#btn-demo-stop').click();
  });
  await step('08 dead', async () => { await go(3); await play('RRRRDD'); await waitStatus('dead'); await shot('08-l3-dead'); await measure('面3 詰み'); });
  await step('09 rotate', async () => { await go(4); await play(CAUGHT.l4[1]); await waitStatus('caught'); await shot('09-l4-caught-rotate'); });
  await step('10 turn', async () => { await go(5); await play(CAUGHT.l5[1]); await waitStatus('caught'); await shot('10-l5-caught-turn'); });
  await step('11 box', async () => { await go(7); await shot('11-l7-start'); await measure('面7 最初'); await play(CAUGHT.l7[1]); await waitStatus('caught'); await shot('12-l7-caught-turnbox'); });
  // 面8：最初・途中
  await step('13 l8', async () => { await go(8); await shot('13-l8-start'); await measure('面8 最初'); await play(LEVELS[7].solution.slice(0, 13)); await shot('14-l8-mid'); });
  // 全面を見本の解で解いて、星と最後の表示を見る
  await step('15 all clear', async () => {
    for (const lv of LEVELS) {
      await go(lv.no); await play(lv.solution); await waitStatus('escaped');
      if (lv.no === 8) { await shot('15-l8-clear-all'); await shot('15-l8-clear-all-full', true); await measure('面8 成功'); }
    }
  });
  await step('16 levels', async () => { await go(1); await page.locator('#btn-levels').click(); await shot('16-levels'); await page.keyboard.press('Escape'); });
  await step('17 share', async () => { await page.locator('#btn-share').click(); await shot('17-share'); await page.keyboard.press('Escape'); });
  // 各面の最初の画面で、盤と操作が収まるか（8面ぶんを測る）。あわせて、全8面の最初・見つかった・成功の文字の組み方（A3）
  await step('18 all starts', async () => { for (const lv of LEVELS) { await go(lv.no); await measure(`面${lv.no} 最初`); await typo(`面${lv.no} 最初`); } });
  await step('18b all caught', async () => {
    for (const lv of LEVELS) {
      const seq = CAUGHT_ALL[lv.no];
      if (!seq) continue;
      await go(lv.no); await play(seq); await waitStatus('caught'); await page.waitForTimeout(withMotion ? 400 : 150); await typo(`面${lv.no} 見つかった`);
      if (lv.no <= 2) await shot(`18-l${lv.no}-caught`);
    }
  });
  await step('18c all clear texts', async () => {
    for (const lv of LEVELS) { await go(lv.no); await play(lv.solution); await waitStatus('escaped'); await page.waitForTimeout(withMotion ? 400 : 150); await typo(`面${lv.no} 成功`); }
  });
  // フォーカスの輪、盤を文で読む、ヒント
  await step('19 focus', async () => {
    await go(2); for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    await shot('19-focus-a'); for (let i = 0; i < 6; i++) await page.keyboard.press('Tab'); await shot('19-focus-b');
  });
  await step('20 board text', async () => { await go(2); await page.locator('#board-text summary').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(200); await shot('20-board-text'); });
  await step('21 hint', async () => {
    await go(2);
    if (await page.locator('#btn-hint').isVisible()) { await page.locator('#btn-hint').click(); await shot('21-hint'); }
  });

  report.push(`${tag} A3 合計: ${typoStats.screens}画面・段落${typoStats.paragraphs}個・最後の行が4文字以下 ${typoStats.shortLast}件・保護語の途中の改行 ${typoStats.splitWords}件`);
  const csp = await page.evaluate(() => window.__csp || []).catch(() => []);
  if (csp.length) report.push(`${tag} CSP違反: ${csp.slice(0, 3).join(' | ')}`);
  if (errors.length) report.push(`${tag} コンソールのエラー: ${errors.slice(0, 5).join(' | ')}`);
  await ctx.close();
}
await browser.close();
writeFileSync(`${outDir}/capture-report.txt`, report.join('\n') + '\n');
console.log(report.join('\n') || '（記録なし）');
