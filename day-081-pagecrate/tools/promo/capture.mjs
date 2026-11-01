// 本番のデモ専用サイト（実サイトの取得は停止中）を、スマホ幅の実画面のまま1コマずつ撮る。
// 画面は1回の訪問を続けて撮り、操作・スクロール・状態の変化をコマ番号つきで output/capture-events.json に残す。
// 外へ出る通信は本番のオリジン以外すべて止め、止めた先も記録する。
//   npm run capture   （PROMO_BASE で撮る先、PROMO_FONT で書体、CHROME_PATH で Chrome を指定できる）
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { CAPTURE_FRAMES, CLIPS, FPS, VIEWPORT } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'output');
const footage = join(out, 'public', 'footage');
const base = new URL(process.env.PROMO_BASE || 'https://day81.rairakku.com/');
const origin = base.origin;
const chrome = process.env.CHROME_PATH || join('/', 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome');
// 書体：Zen Kaku Gothic New（SIL OFL 1.1）。アプリは書体を同梱せず端末の書体で描くので、撮影ではOFLの書体に差し替える
const fontBold = process.env.PROMO_FONT || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
const fontDir = dirname(fontBold);
const FONT_FILES = { regular: 'ZenKakuGothicNew-Regular.ttf', medium: 'ZenKakuGothicNew-Medium.ttf', bold: 'ZenKakuGothicNew-Bold.ttf', black: 'ZenKakuGothicNew-Black.ttf' };
const fontPath = (key) => key === 'bold' ? fontBold : join(fontDir, FONT_FILES[key]);
for (const key of Object.keys(FONT_FILES)) if (!existsSync(fontPath(key))) throw Error(`書体がありません: ${fontPath(key)}（PROMO_FONT で Bold の場所を指定）`);
if (!existsSync(chrome)) throw Error('CHROME_PATH にインストール済みの Google Chrome を指定してください');

/** 公開サイトが停止中の構成で動いていることの確かめ（PageCrate の e2e と同じ文） */
const PAUSE_NOTE = '実サイトの取得は、いまお休み中です。デモなら、自作の素材で同じ流れを試せます。';
/** 停止中には画面に出てはいけない文（いま取得できるように読める文） */
const NOT_WHILE_PAUSED = ['ログイン不要の公開ページを1ページずつ取得します。', '使い方を試したいときは、サンプル素材で体験できます。', 'デモで試してみる', '実際のページは、URLを入れて取得できます。'];
const FONT_CSS = `@font-face{font-family:PromoUI;src:url(/__promo-font/regular) format("truetype");font-weight:100 450}
@font-face{font-family:PromoUI;src:url(/__promo-font/medium) format("truetype");font-weight:451 599}
@font-face{font-family:PromoUI;src:url(/__promo-font/bold) format("truetype");font-weight:600 799}
@font-face{font-family:PromoUI;src:url(/__promo-font/black) format("truetype");font-weight:800 1000}
html,body,body *{font-family:PromoUI,sans-serif!important}
*{-webkit-tap-highlight-color:transparent!important}`;
// ↑ 2行目：スマホ版 Chrome が触れた所に重ねる青い影（4コマほど素材の画像が青く見えた）を消す。触れた位置は映像側の印で示す

const external = new Set();
const pageErrors = [];
const events = [];
const scanBodies = [];
const clipOf = (frame) => [...CLIPS].reverse().find((clip) => frame >= clip.from).id;
const log = (frame, type, detail = {}) => {
  events.push({ frame, seconds: Number((frame / FPS).toFixed(3)), clip: clipOf(frame), type, ...detail });
};

await rm(footage, { recursive: true, force: true });
await mkdir(footage, { recursive: true });
await mkdir(join(out, 'public'), { recursive: true });
const fontBytes = Object.fromEntries(await Promise.all(Object.keys(FONT_FILES).map(async (key) => [key, await readFile(fontPath(key))])));

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const startedAt = Date.now();
try {
  const context = await browser.newContext({
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height }, deviceScaleFactor: VIEWPORT.scale, isMobile: true, hasTouch: true,
    locale: 'ja-JP', timezoneId: 'Asia/Tokyo', colorScheme: 'light', acceptDownloads: true,
  });
  // 本番のオリジン以外へは出さない。書体だけは同じオリジンの架空のパスで、手元のファイルを返す（実際には送信しない）
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname.startsWith('/__promo-font/')) {
      const key = url.pathname.split('/').pop();
      return fontBytes[key] ? route.fulfill({ status: 200, contentType: 'font/ttf', body: fontBytes[key] }) : route.abort();
    }
    if (url.origin === origin || url.protocol === 'blob:' || url.protocol === 'data:') return route.continue();
    external.add(url.origin);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/scan') scanBodies.push(request.postData()); });

  const openApp = async () => {
    await page.goto(new URL('app', base).href);
    await page.addStyleTag({ content: FONT_CSS });
    await page.evaluate(() => document.fonts.ready);
    const demo = page.locator('.entry-panel .pause-note').getByRole('button', { name: 'デモを試す', exact: true });
    await demo.waitFor();
    const loaded = await page.evaluate(async () => {
      await Promise.all(['400', '700'].map((weight) => document.fonts.load(`${weight} 16px PromoUI`, '素材')));
      return [...document.fonts].filter((face) => face.family === 'PromoUI' && face.status === 'loaded').map((face) => face.weight);
    });
    assert.ok(loaded.length >= 2, `撮影用の書体が読み込まれていない: ${loaded}`);
    assert.equal((await page.locator('#pause-note').textContent())?.trim(), PAUSE_NOTE, '公開サイトが停止中の構成でない');
    return demo;
  };
  const screenText = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  const checkPaused = async (scene) => {
    const text = await screenText();
    assert.deepEqual(NOT_WHILE_PAUSED.filter((words) => text.includes(words)), [], `${scene}: 取得できるように読める文が出ている`);
    assert.equal((await context.cookies()).length, 0, `${scene}: Cookie がある`);
  };

  // 1) 撮らない準備：初めての訪問で出るプライバシーポリシーの確認を、画面の操作で済ませる（確認は端末の中だけに残る）
  let demo = await openApp();
  await demo.click();
  const gate = page.getByRole('dialog', { name: '使う前に、プライバシーポリシーをお読みください' });
  await gate.waitFor();
  await gate.getByRole('checkbox', { name: 'プライバシーポリシーを読みました' }).check();
  await gate.getByRole('button', { name: '進む', exact: true }).click();
  await page.locator('.asset-card').first().waitFor();
  await checkPaused('準備の一覧');

  // 2) 撮る訪問：開き直すと確認は済んでいるので、「デモを試す」からすぐ一覧になる
  demo = await openApp();
  await checkPaused('停止中の案内');
  const at = (selector, index = 0) => page.evaluate(([css, n]) => {
    const element = document.querySelectorAll(css)[n];
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { top: box.top + window.scrollY, left: box.left, width: box.width, height: box.height };
  }, [selector, index]);
  const cardIndex = (name) => page.evaluate((title) => [...document.querySelectorAll('.asset-card')].findIndex((card) => card.querySelector('h3')?.textContent === title), name);
  const scrollY = () => page.evaluate(() => window.scrollY);
  const setScroll = (y) => page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
  await setScroll(300);

  // 画面の状態（1コマごとに読む）。変化したコマを出来事として残す
  const probe = () => page.evaluate(() => {
    const cards = [...document.querySelectorAll('.asset-card')];
    return {
      cards: cards.length,
      shown: document.querySelector('.gallery-topline p')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      selected: document.querySelector('.selection-count')?.textContent ?? null,
      bar: document.querySelector('.selection-bar .selection-summary p')?.textContent?.trim() ?? null,
      zipping: Boolean(document.querySelector('.download-button .spinner')),
      previews: cards.filter((card) => card.querySelector('.preview-image.is-loaded')).map((card) => {
        const box = card.querySelector('.preview-frame').getBoundingClientRect();
        return { name: card.querySelector('h3')?.textContent, top: Math.round(box.top), bottom: Math.round(box.bottom) };
      }),
    };
  });

  // 指で触れる操作。座標は撮影画像（2倍）のピクセルで残し、映像の「触れた印」と効果音に使う。
  // 押した直後に画面が組み変わる（一覧が出ると上の図が消えて詰まる）ので、押した要素の位置を続く22コマ追い、印をそこへ付ける
  const trackers = [];
  async function tap(frame, type, locator, detail = {}) {
    const box = await locator.boundingBox();
    assert.ok(box && box.y >= 0 && box.y + box.height <= VIEWPORT.height, `${type}: 押す先が画面の中にない`);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.touchscreen.tap(x, y);
    log(frame, type, { x: Math.round(x * VIEWPORT.scale), y: Math.round(y * VIEWPORT.scale), ...detail, track: [] });
    trackers.push({ event: events.at(-1), locator, until: frame + 22 });
  }
  async function follow(frame) {
    for (const tracker of trackers.filter((item) => frame <= item.until)) {
      const box = await tracker.locator.boundingBox();
      if (box) tracker.event.track.push([frame, Math.round((box.x + box.width / 2) * VIEWPORT.scale), Math.round((box.y + box.height / 2) * VIEWPORT.scale)]);
    }
  }
  const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
  const easeOut = (t) => 1 - (1 - t) ** 3;
  /** スクロールの区間：from〜until のコマで、始まった時点の位置から to() の位置へ動かす */
  const scrolls = [
    { from: 0, until: 6, to: async () => 340, ease: easeOut, label: 'settle' },
    { from: 16, until: 84, to: async () => (await at('.filter-toolbar')).top - 12, ease: easeInOut, label: 'to-list', needs: (s) => s.cards > 0 },
    { from: 292, until: 320, to: async () => (await at('.asset-card', await cardIndex('coastal-study.svg'))).top - 150, ease: easeInOut, label: 'to-coastal' },
    { from: 342, until: 372, to: async () => (await at('.asset-card', await cardIndex('object-study.svg'))).top - 150, ease: easeInOut, label: 'to-object' },
    { from: 400, until: 430, to: async () => (await at('.asset-card', await cardIndex('motion-study.webm'))).top - 150, ease: easeInOut, label: 'to-motion' },
    { from: 540, until: 586, to: async () => (await at('.status-band')).top - 20, ease: easeInOut, label: 'to-band' },
    { from: 656, until: 800, to: async () => (await at('.pause-note')).top - 24, ease: easeInOut, label: 'to-entry' },
  ];
  const search = page.locator('.filter-search input');
  const selection = (name) => page.locator('.asset-card').filter({ has: page.getByRole('heading', { name, exact: true }) }).locator('.selection-indicator');
  const actions = {
    6: () => tap(6, 'press-demo', demo, { label: 'デモを試す' }),
    120: () => tap(120, 'filter-tap', page.getByRole('button', { name: /^動画\s*1$/ }), { label: '動画' }),
    160: () => tap(160, 'filter-tap', page.getByRole('button', { name: /^すべて\s*7$/ }), { label: 'すべて' }),
    194: () => tap(194, 'search-tap', search, { label: '素材名・取得元で検索' }),
    326: () => tap(326, 'select', selection('coastal-study.svg'), { label: 'coastal-study.svg' }),
    436: () => tap(436, 'select', selection('motion-study.webm'), { label: 'motion-study.webm' }),
    498: () => tap(498, 'save', page.locator('.download-button'), { label: 'ZIPで保存' }),
  };
  [...'study'].forEach((key, index) => {
    const frame = 200 + index * 3;
    actions[frame] = async () => { await page.keyboard.type(key); log(frame, 'type', { key }); };
  });

  let download = null;
  page.on('download', (item) => { download = item; });
  const seenPreviews = new Set();
  let previous = await probe();
  let active = null;
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  for (let frame = 0; frame < CAPTURE_FRAMES; frame += 1) {
    if (actions[frame]) await actions[frame]();
    const plan = scrolls.find((segment) => frame >= segment.from && frame <= segment.until);
    if (plan && active?.plan !== plan && frame < plan.until && (!plan.needs || plan.needs(previous))) {
      active = { plan, start: frame, fromY: await scrollY(), toY: Math.max(0, Math.round(await plan.to())) };
      log(frame, 'scroll', { label: plan.label, fromY: active.fromY, toY: active.toY, until: plan.until });
    }
    if (active && frame <= active.plan.until) {
      const t = (frame - active.start + 1) / (active.plan.until - active.start + 1);
      await setScroll(active.fromY + (active.toY - active.fromY) * active.plan.ease(Math.min(1, t)));
    }
    await page.clock.runFor(1000 / FPS);
    await page.screenshot({ path: join(footage, `${String(frame).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
    await follow(frame);
    const now = await probe();
    if (!previous.cards && now.cards) log(frame, 'list-shown', { cards: now.cards });
    if (now.shown !== previous.shown && now.shown && previous.cards) log(frame, 'list-updated', { shown: now.shown });
    if (now.selected !== previous.selected && now.selected) log(frame, 'selected-count', { count: Number(now.selected) });
    if (now.zipping && !previous.zipping) log(frame, 'zip-progress');
    if (/\d+\/\d+点をZIPに保存/.test(now.bar ?? '') && !/\d+\/\d+点をZIPに保存/.test(previous.bar ?? '')) log(frame, 'done', { bar: now.bar.match(/\d+\/\d+点をZIPに保存/)[0] });
    for (const preview of now.previews) {
      if (seenPreviews.has(preview.name) || preview.bottom <= 0 || preview.top >= VIEWPORT.height) continue;
      seenPreviews.add(preview.name);
      log(frame, 'preview-shown', { label: preview.name });
    }
    previous = now;
    if (frame % 60 === 0) console.log(`撮影 ${frame}/${CAPTURE_FRAMES}`);
  }
  await checkPaused('撮影の最後');

  // ZIPの中の記録：取得日時（createdAt）と出典（ドメインだけ）が入っていること
  assert.ok(download, 'ZIPのダウンロードが始まっていない');
  assert.equal(download.suggestedFilename(), 'pagecrate-demo.zip');
  const zipPath = join(out, 'capture-download.zip');
  await download.saveAs(zipPath);
  const manifest = JSON.parse(execFileSync('unzip', ['-p', zipPath, 'manifest.json'], { encoding: 'utf8' }));
  const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).trim().split('\n');
  await rm(zipPath);
  assert.equal(manifest.saved, 2);
  assert.equal(manifest.demo, true);
  assert.ok(!Number.isNaN(Date.parse(manifest.createdAt)), 'ZIPの記録に取得日時がない');
  assert.deepEqual(manifest.files.map((file) => file.mime).sort(), ['image/svg+xml', 'video/webm']);
  assert.ok(manifest.files.every((file) => /^https:\/\/[^/]+\/?$/.test(file.source)), '出典がドメインだけになっていない');

  const types = events.map((event) => event.type);
  for (const type of ['press-demo', 'list-shown', 'filter-tap', 'type', 'preview-shown', 'select', 'save', 'zip-progress', 'done']) assert.ok(types.includes(type), `出来事が記録されていない: ${type}`);
  // 絞り込み：動画だけ（1点）→ すべて（7点）→ 名前「study」（入力の途中で4点、最後に3点）
  const updates = events.filter((event) => event.type === 'list-updated' && event.frame < CLIPS[2].from).map((event) => event.shown.match(/^\d+ \/ \d+点を表示/)[0]);
  assert.deepEqual([updates[0], updates[1], updates.at(-1)], ['1 / 7点を表示', '7 / 7点を表示', '3 / 7点を表示'], `絞り込みの結果: ${updates.join(' → ')}`);
  const storage = await page.evaluate(() => ({ local: Object.keys(localStorage), session: sessionStorage.length }));
  assert.deepEqual(storage, { local: ['pagecrate.policy'], session: 0 }, '端末に残るのはポリシーの確認だけのはず');
  assert.deepEqual([...external], [], '本番のオリジン以外へ出ようとした');
  assert.deepEqual(pageErrors, [], 'ページのエラー');
  assert.ok(scanBodies.every((body) => body === JSON.stringify({ demo: true })), 'デモ以外の取得を送った');

  await writeFile(join(out, 'capture-events.json'), `${JSON.stringify({
    source: `${origin}/app（デモ専用の公開サイト・実サイトの取得は停止中）`,
    capturedAt: new Date(startedAt).toISOString().slice(0, 10),
    fps: FPS, frames: CAPTURE_FRAMES, viewport: VIEWPORT, footage: 'output/public/footage/0000.jpg〜',
    font: 'Zen Kaku Gothic New（SIL OFL 1.1）を同じオリジンの架空のパスで読み込み、画面の文字をこの書体で描いた。レイアウト・文言・動きはそのまま',
    pointer: 'タップの印は映像側（promo.jsx）で描く。画面には要素を足していない。ブラウザが触れた所に重ねる青い影だけはCSSで消した',
    events,
    checks: {
      pauseNote: PAUSE_NOTE, notWhilePaused: 'none on screen', cookies: 0, storage, externalRequests: [...external], pageErrors,
      scanRequests: scanBodies, policyCheckedInSetup: true,
      zip: { file: 'pagecrate-demo.zip', entries, saved: manifest.saved, requested: manifest.requested, demo: manifest.demo, hasCreatedAt: true, sources: [...new Set(manifest.files.map((file) => file.source))], mimes: manifest.files.map((file) => file.mime).sort() },
    },
    seconds: Math.round((Date.now() - startedAt) / 1000),
  }, null, 2)}\n`);
  console.log(`撮影完了: ${CAPTURE_FRAMES}コマ / 出来事 ${events.length}件 / ${Math.round((Date.now() - startedAt) / 1000)}秒`);
  await context.close();
} finally {
  await browser.close();
}
