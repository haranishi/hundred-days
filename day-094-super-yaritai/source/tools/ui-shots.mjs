// 画面の撮影と点検。
// - vite の開発サーバーをこのスクリプトの中で 5341 番に起こし、最後に止める（Bash の & で起こさない）
// - screens-preview.html の各画面を 390・768・1440px の縦横で撮る → shots/ui/<幅>/<画面>.png（UI_OUT で変えられる）
// - 点検：横にはみ出さない・タップの的が48px以上・コンソールのエラー0件・外への通信0件
// - 操作の点検：ボタンが正しい引数で呼ばれる・あいことばの整え方・一時停止の確認・シェアのURL など
// - 音の点検：全部の効果音とBGMを OfflineAudioContext で書き出し、鳴るか・割れないかを測る（WAV も残す）
// 画面ロック中は Chromium が起動しないので、既定は WebKit（SY_BROWSER=chromium で切り替え）。
// 使い方：node tools/ui-shots.mjs [--only=title,howto] [--vp=p390,d1440] [--no-audio] [--no-full]

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '@playwright/test';
import { createServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, process.env.UI_OUT || 'shots/ui');
const PORT = Number(process.env.UI_PORT || 5341);
const BASE = `http://127.0.0.1:${PORT}`;
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']));
const browserType = process.env.SY_BROWSER === 'chromium' ? chromium : webkit;

const SCREENS = [
  'title',
  'title-3d',
  'toast',
  'howto',
  'solo',
  'friends',
  'friends-invited',
  'matchmaking',
  'matchmaking-timeout',
  'matchmaking-error',
  'lobby-host',
  'lobby-guest',
  'lobby-alone',
  'connecting',
  'error',
  'pause',
  'pause-live',
  'results-win',
  'results-lose',
  'results-tie',
  'results-zero',
];
const VIEWPORTS = [
  { id: 'p390', width: 390, height: 844, touch: true },
  { id: 'l390', width: 844, height: 390, touch: true },
  { id: 'p768', width: 768, height: 1024, touch: true },
  { id: 'l768', width: 1024, height: 768, touch: true },
  { id: 'd1440', width: 1440, height: 900, touch: false },
];

// WebKit（Safari）は Tab でボタンやリンクへ移らない設定が既定。Option+Tab ならすべてを順に回る
const TAB = browserType.name() === 'webkit' ? 'Alt+Tab' : 'Tab';

const only = args.get('only')?.split(',');
const vpOnly = args.get('vp')?.split(',');
const screens = only ? SCREENS.filter((s) => only.includes(s)) : SCREENS;
const viewports = vpOnly ? VIEWPORTS.filter((v) => vpOnly.includes(v.id)) : VIEWPORTS;

const report = { browser: browserType.name(), startedAt: new Date().toISOString(), layout: [], interactions: [], audio: null, failures: [] };
const fail = (what) => {
  report.failures.push(what);
  console.error('  ✗', what);
};

/** ページを開いて、エラーと外への通信を集める */
async function open(context, query) {
  const page = await context.newPage();
  const errors = [];
  const external = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
    external.push(u.href);
    return route.abort();
  });
  await page.goto(`${BASE}/screens-preview.html${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__UI__, null, { timeout: 30_000 });
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 10_000 });
  return { page, errors, external };
}

/** 横のはみ出しと、タップの的の大きさを測る */
async function measure(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const describe = (el) => {
      const cls = typeof el.className === 'string' ? el.className.split(' ')[0] : el.tagName;
      return `${el.tagName.toLowerCase()}.${cls}${el.dataset?.a ? `[${el.dataset.a}]` : ''}「${(el.textContent || '').trim().slice(0, 14)}」`;
    };
    const layer = document.querySelector('#screens .sy-layer');
    const overflowX = Math.max(document.documentElement.scrollWidth, layer ? layer.scrollWidth : 0) - vw;
    const offenders = [];
    for (const el of document.querySelectorAll('#screens *')) {
      if (el.closest('.sy-sr')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 1.5 || r.left < -1.5) offenders.push(`${describe(el)} ${Math.round(r.left)}..${Math.round(r.right)}`);
    }
    const small = [];
    const targets = document.querySelectorAll(
      '#screens .sy-btn, #screens a[href], #screens input:not(.sy-char-input):not(.sy-seg-input), #screens .sy-char-box, #screens .sy-seg-box',
    );
    for (const el of targets) {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if ((r.width === 0 && r.height === 0) || st.display === 'none' || st.visibility === 'hidden') continue;
      if (r.width < 47.5 || r.height < 47.5) small.push(`${describe(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    // 文字のコントラスト（WCAG AA：ふつうの字 4.5:1、大きい字 3:1。押せないボタンは除く）。
    // 地の色は、上の要素へたどって最初に見つかる塗りの色。ふち取りのある字（題字・点数）は、ふちの色を地とみなす
    const parse = (s) => {
      const m = /rgba?\(([^)]+)\)/.exec(s || '');
      if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(',').map((x) => parseFloat(x));
      return { r, g, b, a };
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
    const bgOf = (el) => {
      const stack = [];
      for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c.a > 0) stack.push(c);
        if (c && c.a >= 0.99) break;
      }
      let bg = { r: 255, g: 248, b: 236, a: 1 };
      for (let i = stack.length - 1; i >= 0; i--) bg = over(stack[i], bg);
      return bg;
    };
    const lowContrast = [];
    const seen = new Set();
    const walker = document.createTreeWalker(document.getElementById('screens'), NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || seen.has(el) || !n.textContent.trim()) continue;
      seen.add(el);
      if (el.closest('.sy-sr, [aria-disabled="true"], [hidden], option')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const st = getComputedStyle(el);
      if (st.visibility === 'hidden') continue;
      let alpha = 1;
      for (let e = el; e && e.nodeType === 1; e = e.parentElement) alpha *= parseFloat(getComputedStyle(e).opacity || '1');
      const shadow = st.textShadow && st.textShadow !== 'none' ? parse(st.textShadow) : null;
      const bg = shadow && shadow.a > 0.9 ? shadow : bgOf(el);
      const fg0 = parse(st.color);
      if (!fg0) continue;
      const fg = over({ ...fg0, a: fg0.a * alpha }, bg);
      const L1 = lum(fg);
      const L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(st.fontSize);
      const weight = parseInt(st.fontWeight, 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      if (ratio < (large ? 3 : 4.5) - 0.01) lowContrast.push(`${describe(el)} ${ratio.toFixed(2)}:1（${size}px）`);
    }
    const scrollH = layer ? layer.scrollHeight : 0;
    return { overflowX, offenders: offenders.slice(0, 8), small, lowContrast, scrollH, viewH: window.innerHeight };
  });
}

/** 中身を全部見せる（スクロールの外まで撮る） */
async function expandForFullShot(page) {
  await page.evaluate(() => {
    const layer = document.querySelector('#screens .sy-layer');
    if (!layer) return;
    const h = layer.scrollHeight;
    document.documentElement.style.height = 'auto';
    document.body.style.height = 'auto';
    document.body.style.minHeight = `${h}px`;
    layer.style.position = 'absolute';
    layer.style.height = `${h}px`;
    layer.style.overflow = 'visible';
    // 下に貼りつける列は、全体を撮るときは最後に置く（貼りつけたままだと途中に写る）
    for (const bar of document.querySelectorAll('.sy-bottom-bar')) bar.style.position = 'static';
  });
}

async function shootLayouts(browser) {
  for (const vp of viewports) {
    await mkdir(resolve(OUT, vp.id), { recursive: true });
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      hasTouch: vp.touch,
      reducedMotion: 'reduce',
      locale: 'ja-JP',
    });
    for (const name of screens) {
      const { page, errors, external } = await open(context, `?screen=${name}`);
      await page.waitForSelector('#screens [data-screen]', { timeout: 10_000 });
      await page.waitForTimeout(150);
      const m = await measure(page);
      await page.screenshot({ path: resolve(OUT, vp.id, `${name}.png`) });
      let full = null;
      if (!args.has('no-full') && (vp.id === 'p390' || vp.id === 'd1440' || vp.id === 'l390') && m.scrollH > m.viewH + 4) {
        await expandForFullShot(page);
        await page.waitForTimeout(80);
        full = resolve(OUT, vp.id, `${name}--full.png`);
        await page.screenshot({ path: full, fullPage: true });
      }
      const row = { vp: vp.id, screen: name, ...m, errors, external, full: !!full };
      report.layout.push(row);
      const tag = `${vp.id}/${name}`;
      if (m.overflowX > 0.5) fail(`${tag}: 横にはみ出し ${m.overflowX}px ${m.offenders.join(' / ')}`);
      else if (m.offenders.length) fail(`${tag}: 画面の外にはみ出す要素 ${m.offenders.join(' / ')}`);
      if (m.small.length) fail(`${tag}: タップの的が48px未満 ${m.small.join(' / ')}`);
      // 3Dの店を後ろに敷いた画面（title-3d）は、地が絵なので色の計算から外す
      if (m.lowContrast.length && name !== 'title-3d') fail(`${tag}: 文字のコントラストが足りない ${m.lowContrast.join(' / ')}`);
      if (errors.length) fail(`${tag}: コンソールのエラー ${errors.join(' / ')}`);
      if (external.length) fail(`${tag}: 外への通信 ${external.join(' / ')}`);
      await page.close();
    }
    await context.close();
    console.log(`  ${vp.id}: ${screens.length}画面を撮影`);
  }
}

/** 操作の点検（390px の縦）。check(条件, 説明) で記録する */
async function interactions(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'ja-JP', reducedMotion: 'reduce' });
  const results = [];
  const check = (ok, what) => {
    results.push({ ok: !!ok, what });
    if (!ok) fail(`操作: ${what}`);
  };
  const calls = (page) => page.evaluate(() => window.__UI__.calls);
  const lastCall = async (page) => (await calls(page)).at(-1) ?? [];
  const allErrors = [];

  const run = async (name, fn, query = `?screen=${name}`) => {
    const { page, errors, external } = await open(context, query);
    try {
      await fn(page);
    } catch (e) {
      check(false, `${name}: 例外 ${e.message.split('\n')[0]}`);
    }
    if (errors.length) allErrors.push(...errors.map((x) => `${name}: ${x}`));
    if (external.length) check(false, `${name}: 外への通信 ${external.join(' ')}`);
    await page.close();
  };

  await run('title', async (page) => {
    for (const label of ['ひとりで遊ぶ', '友だちと対戦', 'だれかと対戦', 'あそびかた']) {
      // 名前はボタンの文字だけ（説明の1行は aria-describedby）。ゲームの芯の E2E が exact で探せるように
      check((await page.getByRole('button', { name: label, exact: true }).count()) === 1, `タイトル：「${label}」のボタンがある（名前が一致）`);
    }
    check(
      (await page.getByRole('button', { name: '友だちと対戦', exact: true }).getAttribute('aria-describedby')) === 'sy-sub-friends',
      'タイトル：対戦の説明は aria-describedby',
    );
    check((await page.getByRole('heading', { name: 'スーパーやりたい放題' }).count()) === 1, 'タイトル：題字が見出し');
    check(await page.getByText('2分間で、').isVisible(), 'タイトル：一言がある');
    check(await page.getByText('3D素材：Kenney（CC0）').isVisible(), 'タイトル：素材の表記');
    // 開いたときは見出しに焦点（指の人に枠を見せない）。Tab で「ひとりで遊ぶ」→「友だちと対戦」
    check((await page.evaluate(() => document.activeElement?.tagName)) === 'H1', 'タイトル：開いたときの焦点は見出し');
    await page.keyboard.press(TAB);
    check((await page.evaluate(() => document.activeElement?.getAttribute('data-a'))) === 'solo', 'タイトル：Tab で「ひとりで遊ぶ」');
    await page.keyboard.press(TAB);
    check((await page.evaluate(() => document.activeElement?.getAttribute('data-a'))) === 'friends', 'タイトル：Tab で次のボタンへ');
    await page.screenshot({ path: resolve(OUT, 'p390', 'title--focus.png') });
    // キーボードで操作しているときに、ほかの画面からタイトルへ来たら、最初のボタンへ焦点を置く
    await page.evaluate(() => window.__UI__.show('howto'));
    await page.evaluate(() => window.__UI__.show('title'));
    check((await page.evaluate(() => document.activeElement?.getAttribute('data-a'))) === 'solo', 'タイトル：キーボードの人には最初から「ひとりで遊ぶ」に焦点');
    const mute = page.locator('[data-a=mute]');
    const before = await mute.getAttribute('aria-pressed');
    await mute.click();
    check((await mute.getAttribute('aria-pressed')) !== before, `消音：押すと切り替わる（${before}→${await mute.getAttribute('aria-pressed')}）`);
    check((await lastCall(page))[0] === 'onToggleMute', '消音：onToggleMute が呼ばれる');
    await mute.click();
    // ゲームの芯は消音を押すとタイトルを描き直す。キーボードの人の焦点が消音のボタンに残るか
    await mute.focus();
    await page.evaluate(() => window.__UI__.show('title'));
    check((await page.evaluate(() => document.activeElement?.getAttribute('data-a'))) === 'mute', 'タイトル：描き直しても焦点は消音のボタンのまま');
    await page.locator('[data-a=solo]').click();
    check((await lastCall(page))[0] === 'onSolo', 'タイトル：ひとりで → onSolo');
    await page.locator('[data-a=howto]').click();
    check((await lastCall(page))[0] === 'onHowTo', 'タイトル：あそびかた → onHowTo');
    await page.keyboard.press('Enter');
  });

  await run('howto', async (page) => {
    const n = await page.locator('.sy-deed').count();
    check(n === 10, `あそびかた：やっちゃダメ10個（${n}）`);
    check(await page.getByText('店の注意書きの').isVisible(), 'あそびかた：「店の注意書きの逆」の一言');
    check((await page.getByText('ひみつが2つ').count()) === 1, 'あそびかた：ひみつの説明');
    check((await page.locator('kbd', { hasText: 'Shift' }).count()) >= 1, 'あそびかた：PCの操作');
    await page.keyboard.press('Escape');
    check((await lastCall(page))[0] === 'onBack', 'あそびかた：Esc でもどる');
    await page.locator('[data-a=back]').click();
    check((await lastCall(page))[0] === 'onBack', 'あそびかた：もどる → onBack');
  });

  await run('solo', async (page) => {
    check((await page.locator('.sy-char').count()) === 6, 'ひとりで：キャラ6体');
    for (const label of ['やさしい', 'ふつう', '本気']) {
      check((await page.getByRole('button', { name: label, exact: true }).count()) === 1, `ひとりで：「${label}」のボタン（名前が一致）`);
    }
    check((await page.locator('.sy-char img').count()) === 6, 'ひとりで：6体とも顔の画像');
    await page.locator('[data-a=normal]').click();
    const c1 = await lastCall(page);
    check(c1[0] === 'onStart' && c1[1] === 'normal' && c1[2] === 'ch/character-female-b', `ひとりで：ふつう → onStart(normal, female-b) ${JSON.stringify(c1)}`);
    await page.getByRole('radio', { name: 'ケンタ' }).check({ force: true });
    await page.locator('[data-a=hard]').click();
    const c2 = await lastCall(page);
    check(c2[1] === 'hard' && c2[2] === 'ch/character-male-f', `ひとりで：キャラを変えて本気 ${JSON.stringify(c2)}`);
    await page.reload();
    await page.waitForFunction(() => !!window.__UI__);
    check(await page.getByRole('radio', { name: 'ケンタ' }).isChecked(), 'ひとりで：選んだキャラを覚えている');
    check((await page.locator('[data-a=hard]').getAttribute('data-last')) === 'true', 'ひとりで：前回の強さに印');
    // 矢印キーでキャラを選べる
    await page.getByRole('radio', { name: 'ケンタ' }).focus();
    await page.keyboard.press('ArrowRight');
    check(await page.getByRole('radio', { name: 'ユイ' }).isChecked(), 'ひとりで：矢印キーでキャラを選べる');
  });

  await run('friends', async (page) => {
    const code = page.locator('#sy-code');
    await code.fill('k7 qm');
    check((await code.inputValue()) === 'K7QM', `友だち：あいことばを大文字・4文字に整える（${await code.inputValue()}）`);
    const name = page.locator('#sy-name');
    await name.fill('あいうえおかきくけこ');
    check((await name.inputValue()) === 'あいうえおかきく', `友だち：名前は8文字まで（${await name.inputValue()}）`);
    await page.locator('[data-a=join]').click();
    const c = await lastCall(page);
    check(c[0] === 'onJoin' && c[1] === 'K7QM' && c[2] === 'あいうえおかきく', `友だち：入る → onJoin ${JSON.stringify(c)}`);
    await code.fill('k0');
    check(await page.locator('.sy-hint.is-error').isVisible(), '友だち：0 や O を打つと知らせる');
    await page.locator('.sy-room-card').last().scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(OUT, 'p390', 'friends--code-error.png') });
    check((await page.locator('[data-a=join]').getAttribute('aria-disabled')) === 'true', '友だち：そろうまで「入る」は押せない');
    const before = (await calls(page)).length;
    // aria-disabled のボタンは Playwright が押さないので、わざと force で押す
    await page.locator('[data-a=join]').click({ force: true });
    check((await calls(page)).length === before, '友だち：そろっていない「入る」は呼ばない');
    await name.fill('');
    await page.locator('[data-a=create]').click();
    const c2 = await lastCall(page);
    // ひとりでの点検で選んだキャラを覚えているので、いま選ばれているキャラの名前と比べる
    const picked = await page.locator('.sy-char-input:checked').getAttribute('aria-label');
    check(c2[0] === 'onCreate' && c2[1] === picked, `友だち：名前が空ならキャラの名前（${picked}）で作る ${JSON.stringify(c2)}`);
    await page.reload();
    await page.waitForFunction(() => !!window.__UI__);
    check((await page.locator('#sy-name').inputValue()) === '', '友だち：空にした名前を覚える');
  });

  await run('friends-invited', async (page) => {
    check((await page.locator('#sy-code').inputValue()) === 'K7QM', '招待：presetCode が入力済み（小文字でも大文字に）');
    await page.keyboard.press(TAB);
    check((await page.evaluate(() => document.activeElement?.id)) === 'sy-name', '招待：見出しの次は名前の欄');
    check((await page.locator('#sy-name').inputValue()) === 'はなこ', '招待：savedName が入っている');
    const order = await page.locator('.sy-rooms .sy-h2').allTextContents();
    check(order[0]?.includes('K7QM'), `招待：入るほうが先 ${JSON.stringify(order)}`);
  });

  await run('matchmaking', async (page) => {
    check((await page.locator('.sy-ring-num').textContent()) === '14', 'だれかと：残り秒');
    await page.evaluate(() => window.__UI__.handles.matchmaking.setState('searching', 9));
    check((await page.locator('.sy-ring-num').textContent()) === '9', 'だれかと：setState で秒が変わる');
    await page.evaluate(() => window.__UI__.handles.matchmaking.setState('timeout'));
    check(await page.locator('[data-a=cpu]').isVisible(), 'だれかと：見つからなければ「CPUと遊ぶ」');
    await page.locator('[data-a=cpu]').click();
    check((await lastCall(page))[0] === 'onPlayCpu', 'だれかと：CPUと遊ぶ → onPlayCpu');
    await page.locator('[data-a=cancel]').click();
    check((await lastCall(page))[0] === 'onCancel', 'だれかと：もどる → onCancel');
  });

  await run('lobby-host', async (page) => {
    check((await page.locator('.sy-code-tile').allTextContents()).join('') === 'K7QM', '待合室：あいことばを大きく');
    check((await page.locator('.sy-member:not(.is-empty)').count()) === 2, '待合室：顔ぶれ2人');
    check((await page.locator('.sy-member.is-empty').textContent()) === 'あと2人 入れます', '待合室：空きは1行にまとめる');
    const startBox = await page.locator('[data-a=start]').boundingBox();
    check(startBox && startBox.y + startBox.height <= 844, `待合室：「はじめる」はスクロールしなくても見える（下端 ${startBox && Math.round(startBox.y + startBox.height)}）`);
    const x = await page.locator('[data-share=x]').getAttribute('href');
    const text = new URL(x).searchParams.get('text');
    const url = new URL(x).searchParams.get('url');
    check(text === 'スーパーやりたい放題で勝負しよう！あいことば K7QM', `待合室：招待の文 ${text}`);
    check(url === 'https://day94.rairakku.com/?room=K7QM', `待合室：招待のURL ${url}`);
    check((await page.locator('[data-share=line]').getAttribute('href'))?.includes(encodeURIComponent('?room=K7QM')), '待合室：LINE にも招待のURL');
    check(await page.getByText('Instagram・YouTubeへは').isVisible(), '待合室：Instagram・YouTube の1行');
    await page.locator('label[for=sy-dur-180]').click();
    check(JSON.stringify(await lastCall(page)) === '["onDuration",180]', '待合室：3分を選ぶ → onDuration(180)');
    await page.locator('[data-a=start]').click();
    check((await lastCall(page))[0] === 'onStart', '待合室：はじめる → onStart');
    await page.evaluate(() => {
      const ui = window.__UI__;
      const m = ui.lobby('guest');
      ui.handles.lobby.update({ ...m, isHost: true, canStart: true, duration: 90, players: m.players.map((p) => ({ ...p, isYou: p.slot === 0 })) });
    });
    check((await page.locator('.sy-member:not(.is-empty)').count()) === 3, '待合室：update で顔ぶれが増える');
    check(await page.locator('#sy-dur-90').isChecked(), '待合室：update で試合の長さが変わる');
    check((await page.locator('.sy-tag--away').count()) === 1, '待合室：切れた人に「つなぎ直し中」');
    await page.locator('[data-a=leave]').click();
    check((await lastCall(page))[0] === 'onLeave', '待合室：ぬける → onLeave');
  });

  await run('lobby-alone', async (page) => {
    check((await page.locator('[data-a=start]').getAttribute('aria-disabled')) === 'true', '待合室（1人）：はじめるは押せない');
    const before = (await calls(page)).length;
    await page.locator('[data-a=start]').click({ force: true });
    check((await calls(page)).length === before, '待合室（1人）：押しても onStart は呼ばない');
  });

  await run('lobby-guest', async (page) => {
    check((await page.locator('[data-a=start]').count()) === 0, '待合室（参加者）：はじめるが無い');
    check(await page.getByText('がはじめるのを待っています').isVisible(), '待合室（参加者）：主を待つ表示');
    await page.evaluate(() => {
      const ui = window.__UI__;
      ui.handles.lobby.update({ ...ui.lobby('host') });
    });
    check((await page.locator('[data-a=start]').count()) === 1, '待合室：主になったら「はじめる」が出る');
  });

  await run('pause', async (page) => {
    check((await page.evaluate(() => document.activeElement?.getAttribute('data-a'))) === 'resume', '一時停止：焦点は「つづける」');
    await page.locator('[data-a=quit]').click();
    check(await page.locator('[data-a=quit-yes]').isVisible(), '一時停止：やめる → 確認が出る');
    await page.screenshot({ path: resolve(OUT, 'p390', 'pause--confirm.png') });
    check(!(await calls(page)).some((c) => c[0] === 'onQuit'), '一時停止：確認の前に onQuit を呼ばない');
    await page.keyboard.press('Escape');
    check(await page.locator('[data-a=resume]').isVisible(), '一時停止：確認中の Esc は確認を閉じる');
    await page.keyboard.press('Escape');
    check((await lastCall(page))[0] === 'onResume', '一時停止：Esc でつづける');
    await page.locator('[data-a=quit]').click();
    await page.locator('[data-a=quit-yes]').click();
    check((await lastCall(page))[0] === 'onQuit', '一時停止：確認してやめる → onQuit');
  });

  await run('pause-live', async (page) => {
    check(await page.getByText('試合は止まりません').isVisible(), '一時停止（ネット対戦）：試合は止まらないと書く');
    check((await page.locator('[data-a=resume]').textContent())?.includes('試合にもどる'), '一時停止（ネット対戦）：「試合にもどる」');
    await page.locator('[data-a=quit]').click();
    check(await page.getByText('この試合にはもどれません').isVisible(), '一時停止（ネット対戦）：ぬける前に確かめる');
    await page.locator('[data-a=quit-yes]').click();
    check((await lastCall(page))[0] === 'onQuit', '一時停止（ネット対戦）：ぬける → onQuit');
  });

  await run('connecting', async (page) => {
    check(await page.getByText('部屋につないでいます…').isVisible(), '接続中：文が出る');
    await page.keyboard.press('Escape');
    check((await lastCall(page))[0] === 'onCancel', '接続中：Esc でやめる');
  });

  await run('error', async (page) => {
    check(await page.getByText('部屋が見つかりませんでした').isVisible(), 'エラー：理由が出る');
    check((await page.evaluate(() => document.activeElement?.getAttribute('data-a'))) === 'back', 'エラー：焦点は「もどる」');
    await page.keyboard.press('Enter');
    check((await lastCall(page))[0] === 'onBack', 'エラー：もどる → onBack');
  });

  await run('results-win', async (page) => {
    check((await page.locator('[data-testid=results] li').count()) === 2, '結果：順位に2人');
    check((await page.locator('.sy-results-headline').textContent()) === 'あなたの勝ち！', '結果：勝者を大きく');
    check(await page.locator('.sy-hero .sy-badge-complete').isVisible(), '結果：完全制覇のバッジ');
    check((await page.locator('.sy-stamp.is-done').count()) === 10, '結果：ハンコ10個');
    check((await page.locator('.sy-secret.is-done').count()) === 1, '結果：ひみつ1つ');
    check((await page.locator('.sy-bd tr[data-kind=sweep] th').textContent()) === '棚の商品をなぎ払う', '結果：内訳を MISDEEDS の名前で');
    check(await page.getByText('42').first().isVisible(), '結果：店の被害率');
    const x = await page.locator('[data-share=x]').getAttribute('href');
    const text = new URL(x).searchParams.get('text');
    check(text === 'スーパーやりたい放題で荒らし度12,550点！称号『伝説の迷惑客』 #スーパーやりたい放題', `結果：シェアの文 ${text}`);
    check((await page.locator('.sy-bd tr[data-extra]').count()) === 2, '結果：extras（完全制覇・ひみつ）の行を内訳に出す');
    check((await page.locator('.sy-bd tr.sy-bd-bonus:not([data-extra])').count()) === 0, '結果：内訳＋extras＝点なら「そのほか」の行は出さない');
    check(new URL(x).searchParams.get('url') === 'https://day94.rairakku.com/', '結果：シェアのURLは公開先');
    const hasShare = await page.evaluate(() => typeof navigator.share === 'function');
    check((await page.locator('[data-share=native]').count()) === (hasShare ? 1 : 0), `結果：共有シートの有無でボタンを出し分ける（この端末：${hasShare ? 'あり' : 'なし'}）`);
    await page.locator('[data-share=copy]').click();
    await page.waitForTimeout(200);
    const said = await page.locator('.sy-share-said').textContent();
    const fallback = await page.locator('.sy-share-fallback').isVisible();
    check(said === 'コピーしました' || fallback, `結果：リンクをコピー（${said}${fallback ? '・手で写す欄' : ''}）`);
    await page.locator('[data-a=rematch]').click();
    check((await lastCall(page))[0] === 'onRematch', '結果：もう一回 → onRematch');
    const bar = await page.locator('.sy-results-bar').boundingBox();
    check(bar && bar.y + bar.height <= 844 + 1, `結果：もう一回はスクロールしなくても見える（下端 ${bar && Math.round(bar.y + bar.height)}）`);
  });

  await run(
    'results-win (共有あり)',
    async (page) => {
      check((await page.locator('[data-share=native]').count()) === 1, '結果：共有シートがある端末では「共有」を出す');
      check(await page.getByText('『共有』か『リンクをコピー』').isVisible(), '結果：Instagram・YouTube の1行（共有あり）');
    },
    '?screen=results-win&native=1',
  );

  await run('results-lose', async (page) => {
    check((await page.locator('[data-a=rematch]').count()) === 0, '結果（参加者）：もう一回は出さない');
    check(await page.getByText('部屋の主が「もう一回」を押すのを待っています').isVisible(), '結果（参加者）：主を待つ表示');
    check((await page.locator('[data-testid=results] li').count()) === 4, '結果：4人の順位');
    check((await page.locator('.sy-results-me').textContent())?.startsWith('あなたは3位'), '結果：負けたときは自分の順位を添える');
    await page.locator('[data-a=title]').click();
    check((await lastCall(page))[0] === 'onTitle', '結果：タイトルへ → onTitle');
  });

  await run('results-tie', async (page) => {
    check((await page.locator('.sy-results-headline').textContent()) === 'ひきわけ！', '結果：同点はひきわけ');
    check((await page.locator('.sy-hero-person').count()) === 2, '結果：ひきわけは2人とも大きく');
  });

  await run('hidden', async (page) => {
    check((await page.evaluate(() => document.getElementById('screens')?.dataset.screen)) === undefined, 'hide()：画面を外し data-screen を消す');
    check(await page.getByText('試合中のトースト').isVisible(), 'トースト：試合中でも出る');
  });

  // 動きあり：点数の数え上げが最後の値で止まる
  const motion = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP' });
  {
    const { page, errors } = await open(motion, '?screen=results-win');
    await page.waitForTimeout(1600);
    check((await page.locator('.sy-hero-score-num').textContent()) === '12,550', '結果：数え上げは最後の値で止まる');
    await page.screenshot({ path: resolve(OUT, 'p390', 'results-win--motion.png') });
    allErrors.push(...errors);
    await page.close();
  }
  await motion.close();

  // 本物の AudioContext：操作のあとに鳴らしても、エラーにならない
  {
    const { page, errors } = await open(context, '?screen=title');
    await page.locator('.sy-tagline').click();
    const state = await page.evaluate(async () => {
      const a = window.__UI__.audio;
      a.unlock();
      a.startBgm('game');
      a.setBgmIntensity(1);
      for (let i = 0; i < 50; i++) a.play('knock', { volume: 0.8, pan: (i % 3) - 1 });
      a.play('crash');
      a.play('combo-up');
      a.play('combo-up');
      a.setLoop('cart', 0.8);
      a.setLoop('freezer', 0.5);
      await new Promise((r) => setTimeout(r, 400));
      a.setBgmIntensity(2);
      a.setMuted(true);
      a.play('bell');
      a.setMuted(false);
      a.setLoop('cart', 0);
      a.startBgm('title');
      await new Promise((r) => setTimeout(r, 300));
      a.stopBgm();
      return { muted: a.muted };
    });
    check(state.muted === false, '音：消音を切り替えられる');
    check(errors.length === 0, `音：鳴らしてもエラーなし ${errors.join(' / ')}`);
    await page.close();
  }

  check(allErrors.length === 0, `操作の点検中のコンソールのエラー0件 ${allErrors.join(' / ')}`);
  await context.close();
  report.interactions = results;
  console.log(`  操作の点検：${results.filter((r) => r.ok).length}/${results.length} 件 OK`);
}

/** 効果音とBGMを書き出して測る */
async function audioCheck(browser) {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const { page, errors } = await open(context, '?screen=title');
  const res = await page.evaluate(async () => {
    const ui = window.__UI__;
    let extra = null;
    if (typeof ui.renderLoop !== 'function' || typeof ui.renderMix !== 'function') {
      try {
        extra = await import('/src/client/audio/offline.ts');
      } catch {
        extra = null;
      }
    }
    let limits = null;
    try {
      limits = await import('/src/client/audio/limiter.ts');
    } catch {
      limits = null;
    }
    const renderLoopFn = typeof ui.renderLoop === 'function' ? ui.renderLoop : extra?.renderLoop;
    const renderMixFn = typeof ui.renderMix === 'function' ? ui.renderMix : extra?.renderMix;

    const out = { sfx: {}, sfx44k: {}, crowd: {}, songs: {}, songs44k: {}, loops: {}, mix: {}, wav: {} };
    for (const n of ui.SFX_NAMES) out.sfx[n] = (await ui.renderSfx(n, 1)).stats;
    for (const n of ['bell', 'can', 'crash', 'dash', 'button', 'score']) out.sfx44k[n] = (await ui.renderSfx(n, 1, 44100)).stats;
    for (const n of ['knock', 'can', 'pin', 'score', 'bell']) {
      const r = await ui.renderSfx(n, 40);
      const limit = limits?.VOICE_LIMITS?.[n] ?? limits?.DEFAULT_LIMIT ?? null;
      out.crowd[n] = { ...r.stats, played: r.played, limit };
    }
    for (const [k, i, sec] of [
      ['title', 0, 9],
      ['game', 0, 8],
      ['game', 1, 8],
      ['game', 2, 8],
    ]) {
      const r = await ui.renderSong(k, i, sec);
      out.songs[`${k}-${i}`] = r.stats;
      out.wav[`bgm-${k}-${i}`] = ui.wavBase64(r.buffer);
    }
    out.songs44k['game-2'] = (await ui.renderSong('game', 2, 4, 44100)).stats;
    if (typeof renderLoopFn === 'function') {
      out.loops.cart = (await renderLoopFn('cart', 0.8, 2, 22050)).stats;
      out.loops.freezer = (await renderLoopFn('freezer', 0.6, 2, 22050)).stats;
      out.loops.cart44k = (await renderLoopFn('cart', 0.8, 2, 44100)).stats;
      out.loops.freezer44k = (await renderLoopFn('freezer', 0.6, 2, 44100)).stats;
    }
    if (typeof renderMixFn === 'function') {
      const m22 = await renderMixFn({ rate: 22050 });
      out.mix.mix22k = { ...m22.stats, played: m22.played };
      const m44 = await renderMixFn({ rate: 44100 });
      out.mix.mix44k = { ...m44.stats, played: m44.played };
      out.wav['mix-44k'] = ui.wavBase64(m44.buffer);
    }
    out.wav['sfx-all'] = ui.wavBase64(await ui.renderSfxReel(ui.SFX_NAMES));
    return out;
  });
  await mkdir(resolve(OUT, 'audio'), { recursive: true });
  for (const [name, b64] of Object.entries(res.wav)) await writeFile(resolve(OUT, 'audio', `${name}.wav`), Buffer.from(b64, 'base64'));
  delete res.wav;
  const finite = (s) => Number.isFinite(s.peak) && Number.isFinite(s.rms);
  for (const [n, s] of [...Object.entries(res.sfx), ...Object.entries(res.sfx44k)]) {
    if (!finite(s)) fail(`音: ${n} の計測値が不正 (${s.peak}, ${s.rms})`);
    if (!(s.peak >= 0.04)) fail(`音: ${n} が小さすぎる（最大 ${s.peak.toFixed(3)}）`);
    if (!(s.peak < 0.9)) fail(`音: ${n} が割れに近い（最大 ${s.peak.toFixed(3)}）`);
    if (!(s.rms > 0.003)) fail(`音: ${n} のRMSが小さすぎる（RMS ${s.rms.toFixed(4)}）`);
  }
  for (const [n, s] of Object.entries(res.crowd)) {
    if (!finite(s)) fail(`音: crowd ${n} の計測値が不正`);
    if (!(s.played > 0)) fail(`音: ${n} を40回鳴らしたのに 0 回再生`);
    if (s.limit != null && !(s.played <= s.limit)) fail(`音: ${n} の同時再生数 ${s.played} が上限 ${s.limit} を超えた`);
    if (!(s.peak < 0.92)) fail(`音: ${n} を40回同時に鳴らすと割れに近い（最大 ${s.peak.toFixed(3)}）`);
    if (!(s.rms > 0.003)) fail(`音: crowd ${n} のRMSが小さすぎる（RMS ${s.rms.toFixed(4)}）`);
  }
  for (const [n, s] of [...Object.entries(res.songs), ...Object.entries(res.songs44k)]) {
    if (!finite(s)) fail(`音: BGM ${n} の計測値が不正`);
    if (!(s.peak < 0.85)) fail(`音: BGM ${n} が割れに近い（最大 ${s.peak.toFixed(3)}）`);
    if (!(s.rms > 0.01)) fail(`音: BGM ${n} が小さすぎる（RMS ${s.rms.toFixed(4)}）`);
  }
  if (!(res.songs['game-0'].rms >= 0.018)) fail(`音: BGM game-0 の存在感が弱い（RMS ${res.songs['game-0'].rms.toFixed(4)}）`);
  if (!(res.songs['game-1'].rms > res.songs['game-0'].rms)) fail('音: 強さ1で低音とリズムが足されていない（RMS が増えない）');
  for (const [n, s] of Object.entries(res.loops)) {
    if (!finite(s)) fail(`音: loop ${n} の計測値が不正`);
    if (!(s.peak >= 0.04 && s.peak < 0.9)) fail(`音: loop ${n} のピーク範囲外（最大 ${s.peak.toFixed(3)}）`);
    if (!(s.rms > 0.003)) fail(`音: loop ${n} のRMSが小さすぎる（RMS ${s.rms.toFixed(4)}）`);
  }
  for (const [n, s] of Object.entries(res.mix)) {
    if (!finite(s)) fail(`音: mix ${n} の計測値が不正`);
    if (!(s.played > 0)) fail(`音: mix ${n} で効果音が鳴っていない`);
    if (!(s.peak >= 0.04 && s.peak < 0.95)) fail(`音: mix ${n} のピーク範囲外（最大 ${s.peak.toFixed(3)}）`);
    if (!(s.rms > 0.003)) fail(`音: mix ${n} のRMSが小さすぎる（RMS ${s.rms.toFixed(4)}）`);
  }
  if (errors.length) fail(`音: エラー ${errors.join(' / ')}`);
  report.audio = res;
  await context.close();
  console.log(`  音：効果音${Object.keys(res.sfx).length}種・BGM4本・ループ・同時ミックスを書き出し`);
}

/** 縮小した一覧（目で確かめる用） */
async function contactSheets(browser) {
  const { readFile } = await import('node:fs/promises');
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  for (const vp of viewports) {
    const cellW = vp.width >= vp.height ? 330 : 180;
    const cells = [];
    for (const name of screens) {
      const b64 = (await readFile(resolve(OUT, vp.id, `${name}.png`))).toString('base64');
      cells.push(`<figure><img src="data:image/png;base64,${b64}" width="${cellW}"><figcaption>${name}</figcaption></figure>`);
    }
    const cols = Math.max(1, Math.floor(1360 / (cellW + 12)));
    await page.setContent(
      `<style>body{margin:8px;font:12px system-ui;background:#888}main{display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:12px}figure{margin:0;background:#fff}img{display:block;height:auto}figcaption{padding:2px 4px}</style><main>${cells.join('')}</main>`,
    );
    await page.waitForTimeout(200);
    await page.screenshot({ path: resolve(OUT, `contact-${vp.id}.png`), fullPage: true });
  }
  await context.close();
}

const server = await createServer({
  root: ROOT,
  configFile: resolve(ROOT, 'vite.config.ts'),
  server: { port: PORT, strictPort: true, host: '127.0.0.1' },
  logLevel: 'warn',
});
let browser = null;
try {
  await server.listen();
  console.log(`vite: ${BASE}（${browserType.name()}）`);
  browser = await browserType.launch();
  await mkdir(OUT, { recursive: true });
  await shootLayouts(browser);
  if (!args.has('no-interact')) await interactions(browser);
  if (!args.has('no-audio')) await audioCheck(browser);
  if (!args.has('no-sheet')) await contactSheets(browser);
} catch (e) {
  fail(`止まった：${e.stack || e}`);
} finally {
  await browser?.close().catch(() => {});
  await server.close().catch(() => {});
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(report.failures.length === 0 ? '✓ 点検はすべて通った' : `✗ ${report.failures.length}件の指摘`);
  process.exitCode = report.failures.length === 0 ? 0 : 1;
}
