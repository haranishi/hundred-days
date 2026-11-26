// Day100「kamoku」宣伝動画の撮影と書き出し。
// Playwright は撮影関数の中でだけ読む（CI は依存を入れる前に単体試験を走らせる）。
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from './timeline.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PROMO = fileURLToPath(new URL('./', import.meta.url));
// 出力はリポジトリの外に置く。場所は --out-dir か PROMO_OUT で指定し、無ければ一時フォルダ
const DEFAULT_OUT = process.env.PROMO_OUT || join(tmpdir(), 'day100-kamoku-promo');
const PUBLIC_PREFIX = '/100days';
const STAGE_URL = 'https://rairakku.com/100days/day-100-kamoku/__promo__/stage.html';
const APP_URL = 'https://rairakku.com/100days/day-100-kamoku/';
// 一覧画像の時刻の文字に使う書体（SIL OFL）。別の場所にあるときは PROMO_FONT で指定する
const FONT = process.env.PROMO_FONT || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
const STAGE_FILES = new Set(['stage.html', 'stage.css', 'stage.js']);

const optOf = (argv, name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  if (index >= 0) {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`--${name} に値がありません`);
    return value;
  }
  const prefixed = argv.find((arg) => arg.startsWith(`--${name}=`));
  return prefixed ? prefixed.slice(name.length + 3) : fallback;
};

export function parseCliArgs(argv) {
  const flag = (name) => argv.includes(`--${name}`);
  const framesArg = optOf(argv, 'frames', '');
  let rangeFrom = 0;
  let rangeTo = T.TOTAL_FRAMES - 1;
  if (framesArg) {
    const match = /^(\d+)-(\d+)$/.exec(framesArg.trim());
    if (!match) throw new Error(`--frames は a-b 形式で指定してください: ${framesArg}`);
    rangeFrom = Number(match[1]);
    rangeTo = Number(match[2]);
    if (rangeFrom > rangeTo || rangeTo >= T.TOTAL_FRAMES) {
      throw new Error(`--frames の範囲が不正です（0..${T.TOTAL_FRAMES - 1}）: ${framesArg}`);
    }
  }
  const mux = (optOf(argv, 'mux', 'a,b') || '').split(',').map((item) => item.trim()).filter(Boolean);
  for (const variant of mux) {
    if (variant !== 'a' && variant !== 'b') throw new Error(`--mux は a または b を指定してください: ${variant}`);
  }
  const audio = optOf(argv, 'audio-dir', '');
  return {
    outDir: resolve(optOf(argv, 'out-dir', DEFAULT_OUT)),
    audioDir: audio ? resolve(audio) : '',
    mux,
    partial: Boolean(framesArg),
    rangeFrom,
    rangeTo,
    noEncode: flag('no-encode'),
    encodeOnly: flag('encode-only'),
    selftest: flag('selftest'),
  };
}

function ffmpeg(args) {
  const homebrew = '/opt/homebrew/bin/ffmpeg';
  const binary = process.env.FFMPEG || (existsSync(homebrew) ? homebrew : 'ffmpeg');
  const result = spawnSync(binary, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('ffmpeg が失敗しました');
}

function killChild(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  child.kill('SIGTERM');
}

function startServer() {
  const child = spawn(process.execPath, ['scripts/serve-dist.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PLAYWRIGHT_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const origin = new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('配信用サーバーが起動しません')), 15000);
    child.stdout.on('data', (chunk) => {
      const found = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (found) {
        clearTimeout(timer);
        ok(found[0]);
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      fail(new Error('配信用サーバーが終了しました: ' + code));
    });
  });
  return { child, origin };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function appears(locator, scene, step, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await locator.count().catch(() => 0)) {
      const first = locator.first();
      if (await first.isVisible().catch(() => false)) return first;
    }
    await wait(40);
  }
  throw new Error(`${scene} / ${step}: 見つからない`);
}

function sceneAt(frame) {
  const t = frame / T.FPS;
  return T.STORYBOARD.find((scene) => t >= scene.start - 1e-9 && t < scene.end - 1e-9)?.name || '締め';
}

function clampCam(tx, ty, scale) {
  const minX = Math.min(0, T.STAGE.width - T.APP_VIEW.width * scale);
  const minY = Math.min(0, T.STAGE.height - T.APP_VIEW.height * scale);
  return {
    tx: Math.min(0, Math.max(minX, tx)),
    ty: Math.min(0, Math.max(minY, ty)),
    scale,
  };
}

// カメラはアプリの窓の中の変換。常に全幅（拡大率 540/415、窓の高さ＝iframe の高さ）。
// ぼかした背景の区間だけ、窓の中央からゆっくり寄る。
export function cameraAt(frame) {
  const t = frame / T.FPS;
  const back = T.backdropAt(t);
  if (back.blur > 0.05 || back.scrim > 0.05) {
    const scale = T.APP_SCALE * (1 + 0.14 * Math.max(0, Math.min(1, back.zoom)));
    return {
      tx: (T.WINDOW.w - T.APP_VIEW.width * scale) / 2,
      ty: (T.WINDOW.h - T.APP_VIEW.height * scale) / 2,
      scale,
    };
  }
  return { tx: 0, ty: 0, scale: T.APP_SCALE };
}

// 窓の中で、rect（アプリの座標）を中央に大きく見せる。CSV の場面で使う。
function zoomTo(rect, scale) {
  const tx = Math.min(0, Math.max(T.WINDOW.w - T.APP_VIEW.width * scale, T.WINDOW.w / 2 - (rect.x + rect.w / 2) * scale));
  const ty = Math.min(0, Math.max(T.WINDOW.h - T.APP_VIEW.height * scale, T.WINDOW.h * 0.45 - (rect.y + rect.h / 2) * scale));
  return { tx, ty, scale };
}

const fmtYen = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString('en-US')}円`;

function endView(t) {
  if (t < T.END_CARD.start) return null;
  // 段階で出す（出そろってからの静止を2.5秒以内にする）。
  const riseAt = { brand: 27, pills: 27.5, cta: 28.0, url: 28.6, series: 29.2, disclaimer: 29.7 };
  return {
    float: Math.sin((t - 27) * 2.2) * 4,
    blocks: Object.entries(riseAt).map(([id, start]) => {
      const p = Math.max(0, Math.min(1, (t - start) / 0.2));
      const ease = 1 - (1 - p) ** 3;
      return { id, on: t + 1e-9 >= start, dy: Math.round((1 - ease) * 14) };
    }),
  };
}

function calloutView(t, live) {
  const slot = T.calloutSlot(t);
  if (!slot) return null;
  const rise = (age) => Math.round((1 - Math.min(1, Math.max(0, age) / 0.3)) * 24);
  if (slot.kind === 'pending') {
    if (!live.pending) return null;
    return { ...slot, label: '未確認', value: `${live.pending}件`, rows: null, dy: rise(t), orange: true };
  }
  if (slot.kind === 'count') {
    if (!live.oneAfter) return null;
    const two = t >= T.frameTime(T.BEATS.confirmTwo) && live.twoAfter;
    return { ...slot, label: '未確認', value: `${live.pending}件 → ${two ? live.twoAfter : live.oneAfter}件`, rows: null, dy: rise(t - T.frameTime(two ? T.BEATS.confirmTwo : T.BEATS.confirmOne)) };
  }
  if (slot.kind === 'final') {
    if (live.batchAfter === null) return null;
    return { ...slot, label: '未確認', value: `${live.pending}件 → ${live.batchAfter}件`, rows: null, dy: rise(t - T.frameTime(T.BEATS.confirmBatch)) };
  }
  if (!live.salesAfter || !live.profitAfter) return null;
  return {
    ...slot,
    label: '9月の数字',
    value: '',
    dy: rise(t - 18),
    shownRows: t < 18.3 ? 1 : t < 18.7 ? 2 : 3,
    rows: [
      { name: '売上', value: `${live.salesBefore} → ${live.salesAfter}` },
      { name: '利益', value: `${live.profitBefore} → ${live.profitAfter}` },
      // 画面の2つの値の差。増えた分を緑で目立たせる。
      { name: '利益の増えた分', value: fmtYen(yen(live.profitAfter) - yen(live.profitBefore)), up: true },
    ],
  };
}

function previewView(t, live) {
  if (t < T.PREVIEW_SLOT.from || t >= T.PREVIEW_SLOT.to || !live.previewRows?.length) return null;
  live.previewSince ??= t;
  const age = t - live.previewSince;
  return {
    rows: live.previewRows || [],
    stamp: live.savedNo && t >= T.frameTime(T.BEATS.save) ? `保存しました ${live.savedNo}` : '',
    dy: Math.round((1 - Math.min(1, age / 0.3)) * 8),
  };
}

const KPI_READ = () => {
  const kpis = [...document.querySelectorAll('.kpi')].map((node) => ({
    label: (node.querySelector('.kpi-label')?.innerText || '').replace(/\s+/g, ''),
    value: (node.querySelector('.kpi-value')?.innerText || '').trim(),
  }));
  const month = (word) => kpis.find((item) => item.label.includes(word) && /\d+月/.test(item.label))?.value || null;
  return { sales: month('売上'), profit: month('利益'), labels: kpis.map((item) => item.label) };
};

const yen = (text) => Number(String(text || '').replace(/[^\d-]/g, '')) || 0;

// 行の取引先から、それらしい科目を選ぶ（入らなければ消耗品費）。
const ACCOUNT_FOR = [
  [/交通/, '旅費', '旅費交通費'],
  [/書店/, '新聞', '新聞図書費'],
];

async function capture(opts) {
  const { chromium } = await import('@playwright/test');
  const server = startServer();
  let browser;
  const warnings = [];
  const blocked = new Set();
  const live = {
    pending: null,
    oneAfter: null,
    batchBefore: null,
    batchAfter: null,
    batchN: null,
    filled: 0,
    salesBefore: null,
    profitBefore: null,
    salesAfter: null,
    profitAfter: null,
    previewRows: [],
    savedNo: '',
    row: null,
    scroll0: 0,
    brand: null,
    accounts: {},
  };
  const extents = [];
  const onStop = () => killChild(server.child);
  process.once('SIGINT', onStop);
  process.once('SIGTERM', onStop);
  try {
    const origin = await server.origin;
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: T.STAGE.width, height: T.STAGE.height },
      deviceScaleFactor: T.STAGE.dpr,
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      colorScheme: 'light',
      hasTouch: true,
      reducedMotion: 'reduce',
      bypassCSP: true,
      serviceWorkers: 'block',
    });
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'rairakku.com') {
        if (blocked.size < 8) blocked.add(url.hostname);
        await route.abort();
        return;
      }
      if (!url.pathname.startsWith(`${PUBLIC_PREFIX}/`)) {
        await route.abort();
        return;
      }
      const rel = url.pathname.slice(PUBLIC_PREFIX.length);
      if (rel.startsWith('/day-100-kamoku/__promo__/')) {
        const name = rel.slice('/day-100-kamoku/__promo__/'.length);
        if (!STAGE_FILES.has(name)) {
          await route.abort();
          return;
        }
        const type = name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'text/html';
        await route.fulfill({ status: 200, contentType: `${type}; charset=utf-8`, body: readFileSync(join(PROMO, name)) });
        return;
      }
      const response = await fetch(origin + rel + url.search);
      const headers = {};
      const contentType = response.headers.get('content-type');
      if (contentType) headers['content-type'] = contentType;
      await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => warnings.push('pageerror: ' + error.message));
    await page.goto(STAGE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.evaluate((cfg) => window.stage.init(cfg), {
      appUrl: APP_URL,
      end: {
        pills: T.END_CARD.pills,
        cta: T.END_CARD.cta,
        urlLines: T.END_BLOCKS.find((block) => block.id === 'url').lines,
        series: T.END_CARD.series,
        disclaimerLines: T.END_BLOCKS.find((block) => block.id === 'disclaimer').lines,
      },
    });
    let frame;
    const bootDeadline = Date.now() + 25000;
    while (Date.now() < bootDeadline) {
      frame = page.frame({ name: 'app' });
      if (frame && await frame.locator('main h1').filter({ hasText: 'ホーム' }).isVisible().catch(() => false)) break;
      frame = null;
      await wait(100);
    }
    if (!frame) throw new Error('ホーム / 起動: ホームが見つからない');
    await page.clock.install({ time: new Date('2026-09-30T09:00:00+09:00') });
    await page.clock.pauseAt(new Date('2026-09-30T09:00:00+09:00'));
    await frame.addStyleTag({
      content: `*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
        html { scroll-behavior: auto !important; scrollbar-width: none !important; }`,
    });
    const home = await frame.evaluate(() => {
      const figures = document.querySelector('.next-figures')?.innerText || '';
      return { pending: (figures.match(/(\d+)\s*件/) || [])[1] || null };
    });
    const kpi0 = await frame.evaluate(KPI_READ);
    live.pending = home.pending;
    live.salesBefore = kpi0.sales;
    live.profitBefore = kpi0.profit;
    if (!live.pending) warnings.push('ホームの未確認件数を読めなかったので、大きな数字札を出さない');
    if (!live.salesBefore || !live.profitBefore) warnings.push('ホームの9月の売上か利益を読めなかった: ' + kpi0.labels.join(','));

    // ロゴは小さいまま拡大するとぼけるので、3倍で撮る。台の色は上の帯の色に合わせる。
    try {
      // 最初の apply の前なので、空の字幕の帯や数字札が左上に出ている。撮る間はステージの飾りを全部隠す。
      const OVERLAYS = '#top-shade, #fx, #ff, #cap, #cap-tag, #cap-note, #calm-card, #endcard';
      await page.evaluate((sel) => document.querySelectorAll(sel).forEach((node) => { node.style.visibility = 'hidden'; }), OVERLAYS);
      // 画面の .brand をそのまま、アプリを3倍に拡大した状態でステージから撮る（写しを作ると、まわりの飾りが崩れた）。
      const bg = await frame.evaluate(() => getComputedStyle(document.querySelector('.topbar')).backgroundColor);
      const rect = await frame.locator('.topbar .brand').first().evaluate((node) => {
        const b = node.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      });
      const k = 3;
      const pad = 6;
      await page.evaluate(([r, scale, p]) => {
        document.querySelector('#win').style.borderRadius = '0';
        document.querySelector('#app').style.transform = `translate(${p - r.x * scale}px, ${p - r.y * scale}px) scale(${scale})`;
      }, [rect, k, pad]);
      // マウスはロゴから離しておく（指が乗った見た目にしない）。
      await page.mouse.move(T.STAGE.width - 2, T.STAGE.height - 2);
      await wait(300);
      const shot = await page.screenshot({ clip: { x: 0, y: T.WINDOW.y, width: Math.ceil(rect.w * k + 2 * pad), height: Math.ceil(rect.h * k + 2 * pad) } });
      await page.evaluate((sel) => document.querySelectorAll(sel).forEach((node) => { node.style.visibility = ''; }), OVERLAYS);
      await page.evaluate(() => { document.querySelector('#win').style.borderRadius = ''; });
      live.brand = { src: 'data:image/png;base64,' + shot.toString('base64'), bg };
    } catch (error) {
      warnings.push('ロゴ（.brand）を撮れなかった: ' + error.message);
    }

    const readCount = () => frame.evaluate(() => {
      const text = document.querySelector('.inbox-tools')?.innerText || document.querySelector('main')?.innerText || '';
      const found = (text.match(/未確認\s*(\d+)\s*件/) || [])[1];
      if (found) return found;
      return document.querySelectorAll('tr.inbox-row').length ? null : '0';
    });
    const firstEmpty = async () => {
      const index = await frame.evaluate(() => [...document.querySelectorAll('tr.inbox-row')].findIndex((row) => {
        const box = row.querySelector('[role="combobox"]');
        return box && !(box.value || '').trim();
      }));
      return index < 0 ? null : frame.locator('tr.inbox-row').nth(index);
    };
    // 窓の中で、上に貼りつく見出しの下から、下の確定の帯・案内の手前までに入れる。
    const reveal = async (locator, offset = 40) => {
      const handle = await locator.elementHandle();
      if (!handle) return;
      await frame.evaluate(([node, off]) => {
        const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0;
        const rect = node.getBoundingClientRect();
        if (rect.top < top + 4 || rect.bottom > window.innerHeight - 190) window.scrollBy(0, rect.top - top - off);
      }, [handle, offset]);
    };
    const scrollUnder = (selector, gap = 8) => frame.evaluate(([sel, g]) => {
      const node = document.querySelector(sel);
      const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0;
      if (node) window.scrollBy(0, node.getBoundingClientRect().top - top - g);
    }, [selector, gap]);
    const fieldUnder = (locator) => locator.evaluate((node) => {
      const field = node.closest('.field') || node.parentElement?.parentElement || node;
      const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0;
      window.scrollBy(0, field.getBoundingClientRect().top - top - 8);
    });
    const dismissToast = async () => {
      const button = frame.locator('#toasts button').last();
      if (await button.count() && await button.isVisible().catch(() => false)) await button.evaluate((node) => node.click()).catch(() => {});
    };
    const clickNav = async (name) => {
      const link = frame.getByRole('navigation', { name: 'よく使う画面' }).getByRole('link', { name });
      // 拡大したステージ越しのクリックは、隣の項目に当たることがある。下の案内は要素そのものを押す。
      if (await link.count()) {
        await link.first().evaluate((node) => node.click());
        return;
      }
      await frame.locator('.bottomnav').getByRole('link', { name }).or(frame.locator('.bottomnav').getByRole('button', { name })).first().evaluate((node) => node.click());
    };
    // 画面（wasm-bindgen）は、外した部品の requestAnimationFrame を取り消さないことがある。
    // 実ブラウザではその呼び出しの例外は捨てられるだけなので、偽の時計でも記録して先へ進む。
    const tick = async (ms) => {
      try {
        await page.clock.runFor(ms);
      } catch (error) {
        if (!/closure invoked recursively or after being dropped/.test(String(error.message))) throw error;
        warnings.push('画面の外した部品のタイマーが例外（実ブラウザでは無害）');
      }
    };
    let debt = 0;
    const burst = async (ms) => {
      await tick(ms);
      debt += ms;
    };
    // 科目の欄に query を打って候補を確定する。expect が入らなければ消耗品費にする。
    const pickAccount = async (box, query, expect, scene) => {
      await box.evaluate((node) => { node.focus(); node.select?.(); });
      await box.click();
      await page.keyboard.press('Meta+A').catch(() => {});
      await page.keyboard.insertText(query);
      await burst(150);
      await page.keyboard.press('Enter');
      await burst(40);
      let value = await box.inputValue().catch(() => '');
      if (!value.includes(expect)) {
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await burst(40);
        value = await box.inputValue().catch(() => '');
      }
      if (!value.includes(expect) && expect !== '消耗品費') return pickAccount(box, '消耗', '消耗品費', scene);
      if (!value.includes(expect)) throw new Error(`${scene} / 科目: ${expect} が入らない（${value || '空'}）`);
      live.accounts[value] = (live.accounts[value] || 0) + 1;
      return value;
    };
    const accountFor = async (row) => {
      const text = await row.innerText().catch(() => '');
      const hit = ACCOUNT_FOR.find(([re]) => re.test(text));
      return hit ? [hit[1], hit[2]] : ['消耗', '消耗品費'];
    };
    // アプリの仕訳のプレビューを読む。表が出ていれば表（税の内訳つき）、無ければ1行の要約（幅の狭い画面の既定）。
    const readPreview = () => frame.evaluate(() => {
      const table = [...document.querySelectorAll('.pv-table tbody tr')].map((tr) => {
        const num = tr.querySelector('td.num');
        const sub = num?.querySelector('.sub')?.textContent.trim() || '';
        const amount = (num?.textContent || '').replace(sub, '').trim();
        return {
          side: tr.querySelector('.pv-side')?.textContent.trim() || '',
          account: tr.querySelector('.pv-account')?.textContent.trim() || '',
          amount: amount ? `${amount}円` : '',
          sub,
        };
      }).filter((row) => row.side && (row.account || row.amount));
      if (table.length) return table;
      return [...document.querySelectorAll('.pv-summary .pv-sum-side')].map((side) => {
        const amount = side.querySelector('.num')?.textContent.trim() || '';
        return {
          side: side.querySelector('.pv-sum-label')?.textContent.trim() || '',
          account: side.querySelector('.pv-sum-name')?.textContent.trim() || '',
          amount: amount ? `${amount}円` : '',
          sub: '',
        };
      }).filter((row) => row.side && (row.account || row.amount));
    });

    const clearBands = () => frame.evaluate(() => {
      const bands = document.getElementById('banners');
      if (!bands) return;
      const bar = document.querySelector('.topbar');
      const need = Math.ceil(bands.getBoundingClientRect().bottom + window.scrollY - (bar ? bar.getBoundingClientRect().bottom : 0));
      const most = document.documentElement.scrollHeight - window.innerHeight;
      if (window.scrollY < need) window.scrollTo(0, Math.min(need, most));
    });
    const framesDir = join(opts.outDir, opts.partial ? `preview-${opts.rangeFrom}-${opts.rangeTo}` : 'frames');
    mkdirSync(framesDir, { recursive: true });
    const finger = { x: 270, y: 700, alpha: 0, press: false };
    const boxOf = async (locator) => {
      if (!locator || !(await locator.count().catch(() => 0))) return null;
      return locator.first().boundingBox().catch(() => null);
    };
    const dialogConfirm = () => frame.getByRole('dialog').getByRole('button', { name: '確定する', exact: true });
    const entryForm = () => frame.locator('form.entry-form');

    for (let f = 0; f <= opts.rangeTo; f++) {
      const t = f / T.FPS;
      const scene = sceneAt(f);
      if (f === T.BEATS.openInbox) {
        await clickNav('未確認');
        await appears(frame.locator('tr.inbox-row').first(), scene, '未確認の行');
        await scrollUnder('.inbox-tools');
      } else if (f === T.BEATS.scrollFrom) {
        live.scroll0 = await frame.evaluate(() => window.scrollY);
      } else if (f > T.BEATS.scrollFrom && f <= T.BEATS.scrollTo) {
        const p = (f - T.BEATS.scrollFrom) / (T.BEATS.scrollTo - T.BEATS.scrollFrom);
        const ease = p * p * (3 - 2 * p);
        await frame.evaluate((y) => window.scrollTo(0, y), live.scroll0 + 360 * ease);
      } else if (f === T.BEATS.focusAccount) {
        await frame.evaluate((y) => window.scrollTo(0, y), live.scroll0);
        live.row = await firstEmpty();
        if (!live.row) throw new Error(`${scene} / 科目: 空の行がない`);
        const box = live.row.locator('[role="combobox"]').first();
        await reveal(box);
        await box.click();
        await page.keyboard.insertText('消耗');
        await burst(150);
      } else if (f === T.BEATS.typeAccount) {
        await page.keyboard.press('Enter');
        await burst(40);
        const box = live.row.locator('[role="combobox"]').first();
        if (!(await box.inputValue()).includes('消耗')) await pickAccount(box, '消耗', '消耗品費', scene);
      } else if (f === T.BEATS.checkOne) {
        const check = live.row.locator('input.cand-check');
        await reveal(check);
        await check.check();
      } else if (f === T.BEATS.askOne) {
        const button = await appears(frame.locator('button.inbox-confirm'), scene, '確定する');
        await button.click();
      } else if (f === T.BEATS.confirmOne) {
        const button = await appears(dialogConfirm(), scene, '確定ダイアログ');
        await button.click();
        await burst(80);
        for (let i = 0; i < 12 && (await readCount()) === live.pending; i++) await burst(50);
        live.oneAfter = await readCount();
        if (!live.oneAfter) warnings.push('1件確定のあと、未確認の件数を読めなかった');
        await dismissToast();
        live.scroll0 = await frame.evaluate(() => window.scrollY);
      } else if (f === T.BEATS.focusTwo) {
        live.row = await firstEmpty();
        if (!live.row) throw new Error(`${scene} / 2行目: 空の行がない`);
        const box = live.row.locator('[role="combobox"]').first();
        await reveal(box);
        live.twoQuery = await accountFor(live.row);
        await box.click();
        await page.keyboard.insertText(live.twoQuery[0]);
        await burst(150);
      } else if (f === T.BEATS.typeTwo) {
        await page.keyboard.press('Enter');
        await burst(40);
        const box = live.row.locator('[role="combobox"]').first();
        if (!(await box.inputValue()).includes(live.twoQuery[1])) await pickAccount(box, live.twoQuery[0], live.twoQuery[1], scene);
      } else if (f === T.BEATS.checkTwo) {
        const check = live.row.locator('input.cand-check');
        await reveal(check);
        await check.check();
      } else if (f === T.BEATS.askTwo) {
        const button = await appears(frame.locator('button.inbox-confirm'), scene, '確定する');
        await button.click();
      } else if (f === T.BEATS.confirmTwo) {
        const button = await appears(dialogConfirm(), scene, '確定ダイアログ');
        await button.click();
        await burst(80);
        for (let i = 0; i < 12 && (await readCount()) === live.oneAfter; i++) await burst(50);
        live.twoAfter = await readCount();
        await dismissToast();
      } else if (f >= T.BEATS.fillStart && f < T.BEATS.selectAll) {
        // 早送り: 2コマに1行、残りの行に科目を入れる。時計は遅らせない（借りは返さない）。
        if ((f - T.BEATS.fillStart) % T.BEATS.fillStep === 0) {
          await dismissToast();
          const row = await firstEmpty();
          if (row) {
            const box = row.locator('[role="combobox"]').first();
            await reveal(box, 60);
            const [query, expect] = await accountFor(row);
            await pickAccount(box, query, expect, 'まとめて');
            live.filled += 1;
          }
          debt = 0;
        }
      } else if (f === T.BEATS.selectAll) {
        debt = 0;
        const left = await firstEmpty();
        if (left) warnings.push('早送りの区間で、科目を入れきれなかった行がある');
        await dismissToast();
        await page.keyboard.press('Escape').catch(() => {});
        const all = frame.locator('input.cand-all-check');
        await reveal(all);
        await all.check();
        await burst(40);
        const countText = await frame.locator('.cand-all-count').innerText().catch(() => '');
        live.batchN = Number((countText.match(/(\d+)/) || [])[1] || 0);
        if (!live.batchN) throw new Error('まとめて / 科目のある行をすべて選ぶ: 0件');
        live.batchBefore = await readCount();
      } else if (f === T.BEATS.askBatch) {
        const button = await appears(frame.locator('button.inbox-confirm'), 'まとめて', '確定する');
        await button.click();
      } else if (f === T.BEATS.confirmBatch) {
        const button = await appears(dialogConfirm(), 'まとめて', '確定ダイアログ');
        await button.click();
        await burst(80);
        for (let i = 0; i < 12 && (await readCount()) === live.batchBefore; i++) await burst(50);
        live.batchAfter = await readCount();
        if (live.batchAfter === live.batchBefore) warnings.push('まとめて確定のあと件数が変わらない');
        await dismissToast();
      } else if (f === T.BEATS.openEntry) {
        await clickNav('登録');
        await appears(entryForm(), '仕訳', '登録');
        await scrollUnder('form.entry-form');
      } else if (f === T.BEATS.pickIncome) {
        await entryForm().locator('input[type=radio][value=income]').evaluate((node) => node.click());
        await burst(40);
        if (!(await entryForm().locator('input[type=radio][value=income]').isChecked())) throw new Error('仕訳 / 種別: 収入にならない');
      } else if (f === T.BEATS.focusEntryAccount) {
        const box = entryForm().getByRole('combobox', { name: /科目/ });
        await fieldUnder(box);
        await box.click();
      } else if (f === T.BEATS.typeEntryAccount) {
        await page.keyboard.insertText(T.ENTRY.account);
        await burst(120);
      } else if (f === T.BEATS.enterEntryAccount) {
        const box = entryForm().getByRole('combobox', { name: /科目/ });
        await page.keyboard.press('Enter');
        await burst(40);
        if (!(await box.inputValue()).includes(T.ENTRY.accountName)) await pickAccount(box, T.ENTRY.account, T.ENTRY.accountName, '仕訳');
      } else if (f === T.BEATS.focusWallet) {
        // 既定の「現金」を選んだ状態にして打ち替える。
        const wallet = entryForm().getByRole('combobox', { name: /口座/ });
        await wallet.click();
        await wallet.evaluate((node) => node.select());
      } else if (f === T.BEATS.typeWallet) {
        await page.keyboard.insertText(T.ENTRY.wallet);
        await burst(120);
      } else if (f === T.BEATS.enterWallet) {
        const wallet = entryForm().getByRole('combobox', { name: /口座/ });
        await page.keyboard.press('Enter');
        await burst(40);
        if (!(await wallet.inputValue()).includes(T.ENTRY.walletName)) {
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('Enter');
          await burst(40);
        }
        const value = await wallet.inputValue();
        if (!value.includes(T.ENTRY.walletName)) warnings.push('入金先の口座が普通預金にならない: ' + value);
        await page.keyboard.press('Tab').catch(() => {});
      } else if (f === T.BEATS.focusAmount) {
        // 科目と口座を決めてから金額を打つ。打つたびにプレビューの金額が変わる。
        const amount = entryForm().getByLabel('金額');
        await fieldUnder(amount);
        await amount.click();
      } else if (f >= T.BEATS.typeAmount && f < T.BEATS.typeAmount + T.BEATS.amountStep * T.ENTRY.amount.length && (f - T.BEATS.typeAmount) % T.BEATS.amountStep === 0) {
        await page.keyboard.insertText(T.ENTRY.amount[(f - T.BEATS.typeAmount) / T.BEATS.amountStep]);
      } else if (f === T.BEATS.save) {
        if (live.previewDoneFrame === undefined) warnings.push('保存の前に、プレビューに普通預金と売上高が出そろわなかった');

        await frame.getByRole('button', { name: /保存して続ける/ }).click();
        await burst(100);
      } else if (f === T.BEATS.openHome) {
        if (!live.savedNo) warnings.push('保存のトーストから番号を読めなかった');
        await dismissToast();
        await clickNav('ホーム');
        await appears(frame.locator('main h1').filter({ hasText: 'ホーム' }), '利益', 'ホーム');
        const kpi = await frame.evaluate(KPI_READ);
        live.salesAfter = kpi.sales;
        live.profitAfter = kpi.profit;
        if (!live.salesAfter || !live.profitAfter) warnings.push('戻ったホームで9月の売上か利益を読めなかった');
        if (yen(live.profitAfter) <= yen(live.profitBefore)) warnings.push(`利益が増えていない ${live.profitBefore} → ${live.profitAfter}`);
      } else if (f === T.BEATS.openReports) {
        // 帳票は下の案内の「メニュー」から開く。開けなければハッシュで開き、記録する。
        try {
          const menu = frame.locator('.bottomnav').getByRole('link', { name: 'メニュー' }).or(frame.locator('.bottomnav').getByRole('button', { name: 'メニュー' }));
          await menu.first().evaluate((node) => node.click());
          await burst(40);
          await frame.locator('.menu-drawer, nav').getByRole('link', { name: '帳票' }).first().evaluate((node) => node.click(), null, { timeout: 1500 });
        } catch {
          warnings.push('帳票はメニューから開けなかったので #/reports を開いた');
          await frame.evaluate(() => { location.hash = '#/reports'; });
        }
        await burst(60);
        await appears(frame.locator('[role="tab"]').first(), '帳票', '帳票');
        await scrollUnder('[role="tablist"]');
      } else if (f === T.BEATS.openPL) {
        await frame.getByRole('tab', { name: '損益計算書' }).first().evaluate((node) => node.click());
        await burst(40);
        await scrollUnder('[role="tablist"]');
      } else if (f === T.BEATS.openBS) {
        await frame.getByRole('tab', { name: '貸借対照表' }).first().evaluate((node) => node.click());
        await burst(40);
        await scrollUnder('[role="tablist"]');
      } else if (f === T.BEATS.showCsv) {
        const csv = frame.getByRole('link', { name: 'CSVで書き出す' });
        if (!(await csv.count())) warnings.push('「CSVで書き出す」が見つからない');
        else await reveal(csv.first(), 120);
      }

      // 保存するまでは毎コマ、アプリのプレビューの表を読む。保存のあとは、保存した内容のまま止める。
      if (f >= T.BEATS.focusAmount && f < T.BEATS.save) {
        try {
          // 口座を打ち直している間は要約が消える。空になったときは、直前に画面に出ていた仕訳のまま見せる。
          const rows = await readPreview();
          if (rows.length) live.previewRows = rows;
          if (live.previewDoneFrame === undefined && rows.some((row) => row.account.includes(T.ENTRY.walletName)) && rows.some((row) => row.account.includes(T.ENTRY.accountName)) && rows.every((row) => row.amount.replace(/[^\d]/g, '') === T.ENTRY.amount)) {
            live.previewDoneFrame = f;
          }
        } catch (error) {
          warnings.push('プレビューを読めなかった: ' + error.message.split('\n')[0]);
        }
      }
      if (f > T.BEATS.save && f < T.BEATS.openHome && !live.savedNo) {
        const toast = await frame.locator('#toasts').innerText().catch(() => '');
        live.savedNo = (toast.match(/No\.\s*\d+/) || [''])[0];
      }

      let camera = cameraAt(f);
      // 21–24秒: 「CSVで書き出す」の段を、22.2秒から大きく見せる（ゆっくり寄り続ける）。
      if (f >= T.BEATS.showCsv && f < T.BEATS.calm) {
        live.csvRect ??= await frame.getByRole('link', { name: 'CSVで書き出す' }).first().evaluate((node) => {
          const own = node.getBoundingClientRect();
          return { x: own.x - 60, y: own.y - 30, w: own.width + 80, h: own.height + 60 };
        }).catch(() => null);
        if (live.csvRect) {
          const p = Math.min(1, (f - T.BEATS.showCsv) / 9);
          const ease = 1 - (1 - p) ** 3;
          const goal = 2.2 + 0.15 * ((f - T.BEATS.showCsv) / (T.BEATS.calm - T.BEATS.showCsv));
          camera = zoomTo(live.csvRect, T.APP_SCALE + (goal - T.APP_SCALE) * ease);
        }
      }
      const back = T.backdropAt(t);
      // 上の帯（お試し版・100日）を、上に貼りつく見出しの裏まで送る。字幕の裏に帯の切れ端を映さない。
      if (back.blur < 0.05) await clearBands();

      const upcoming = [
        [T.BEATS.focusAccount, async () => live.row?.locator('[role="combobox"]').first() ?? (await firstEmpty())?.locator('[role="combobox"]').first()],
        [T.BEATS.checkOne, async () => live.row?.locator('input.cand-check')],
        [T.BEATS.askOne, async () => frame.locator('button.inbox-confirm')],
        [T.BEATS.confirmOne, async () => dialogConfirm()],
        [T.BEATS.focusTwo, async () => (await firstEmpty())?.locator('[role="combobox"]').first()],
        [T.BEATS.checkTwo, async () => live.row?.locator('input.cand-check')],
        [T.BEATS.askTwo, async () => frame.locator('button.inbox-confirm')],
        [T.BEATS.confirmTwo, async () => dialogConfirm()],
        [T.BEATS.selectAll, async () => frame.locator('input.cand-all-check')],
        [T.BEATS.askBatch, async () => frame.locator('button.inbox-confirm')],
        [T.BEATS.confirmBatch, async () => dialogConfirm()],
        [T.BEATS.pickIncome, async () => entryForm().locator('label:has(input[value=income])')],
        [T.BEATS.save, async () => frame.getByRole('button', { name: /保存して続ける/ })],
        [T.BEATS.csvRing, async () => frame.getByRole('link', { name: 'CSVで書き出す' })],
      ].find(([frameNo]) => frameNo >= f && frameNo - f <= 10);
      if (upcoming && t < 24 && back.blur < 0.05) {
        const box = await boxOf(await upcoming[1]());
        if (box) {
          const near = finger.alpha < 0.05 ? 1 : 0.5;
          finger.x += (box.x + box.width / 2 - finger.x) * near;
          finger.y += (box.y + box.height / 2 - finger.y) * near;
          finger.alpha = Math.min(0.95, finger.alpha + 0.2);
          finger.press = f === upcoming[0];
        } else finger.alpha = 0;
      } else {
        // 押したあとの窓は閉じるので、指の輪はその場に残さない。
        finger.alpha = 0;
        finger.press = false;
      }

      const caption = T.captionAt(t);
      await page.evaluate((state) => window.stage.apply(state), {
        camera,
        blur: back.blur,
        scrim: back.scrim,
        shade: 0,
        caption: caption && {
          lines: caption.lines,
          size: caption.size,
          top: caption.top,
          tag: caption.tag || '',
          tagSize: caption.tagSize || 20,
          tagTop: caption.tagTop,
          tagLeft: caption.tagLeft,
          card: Boolean(caption.card),
          note: caption.note || '',
          noteSize: caption.noteSize || 16,
        },
        // ぼかした背景の上の札は、ゆっくり上下に揺らす（止まった絵にしない）。
        float: t < 27 ? Math.sin(t * 2.4) * 4 : 0,
        callout: calloutView(t, live),
        preview: previewView(t, live),
        ff: t >= T.FF_SLOT.from && t < T.FF_SLOT.to,
        finger: finger.alpha > 0.04 ? finger : null,
        brand: live.brand,
        end: endView(t),
      });

      if (f >= opts.rangeFrom) {
        const file = join(framesDir, String(f).padStart(4, '0') + '.jpg');
        await page.screenshot({ path: file, type: 'jpeg', quality: 84, animations: 'disabled' });
        if (f === 0 && !opts.partial) {
          await page.screenshot({ path: join(opts.outDir, 'first-frame.png'), type: 'png', animations: 'disabled' });
        }
        if (f % 15 === 0) {
          const boxes = await page.evaluate(() => window.stage.measureText());
          for (const box of boxes) {
            const bad = box.left < T.STAGE.safeX.min - 1.5 || box.right > T.STAGE.safeX.max + 1.5
              || box.top < T.STAGE.safeY.min - 1.5 || box.bottom > T.STAGE.safeY.max + 1.5;
            extents.push({ frame: f, ...box, outside: bad });
            if (bad) warnings.push(`安全域の外 ${box.name} @${(f / T.FPS).toFixed(2)}s`);
          }
        }
      }
      if (f % 30 === 0) console.log(`frame ${f}/${opts.rangeTo} ${(t).toFixed(2)}s`);
      if (f < opts.rangeTo) {
        const step = Math.round((f + 1) * 1000 / T.FPS) - Math.round(f * 1000 / T.FPS);
        const run = Math.max(0, step - debt);
        debt = Math.max(0, debt - step);
        if (run) await tick(run);
      }
    }

    const { row, brand, ...reads } = live;
    const report = {
      day: 100,
      frames: opts.partial ? `${opts.rangeFrom}-${opts.rangeTo}` : T.TOTAL_FRAMES,
      reads,
      warnings: [...new Set(warnings)],
      blockedHosts: [...blocked],
      textExtents: extents.filter((item) => item.outside).slice(0, 40),
      cues: T.CUES,
    };
    if (!opts.partial) writeFileSync(join(opts.outDir, 'capture-report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('撮影完了', report.warnings.length ? report.warnings.join(' / ') : '警告なし');
    console.log(JSON.stringify(reads));
    return report;
  } finally {
    process.off('SIGINT', onStop);
    process.off('SIGTERM', onStop);
    if (browser) await browser.close().catch(() => {});
    killChild(server.child);
  }
}

function contactSheet(outDir) {
  const tiles = join(outDir, 'sheet-tiles');
  mkdirSync(tiles, { recursive: true });
  let index = 0;
  for (let t = 0; t < T.DURATION_SECONDS - 1e-9; t += 0.75) {
    const frame = Math.round(t * T.FPS);
    const src = join(outDir, 'frames', String(frame).padStart(4, '0') + '.jpg');
    const text = (Math.round(t * 100) / 100).toFixed(2);
    ffmpeg([
      '-v', 'error', '-y', '-i', src,
      '-vf', `scale=180:320:force_original_aspect_ratio=decrease,pad=180:320:(ow-iw)/2:(oh-ih)/2:color=0x102033,drawtext=fontfile=${FONT}:text=${text}:x=8:y=h-34:fontsize=18:fontcolor=white:box=1:boxcolor=0x102033@0.7:boxborderw=4`,
      join(tiles, String(index).padStart(2, '0') + '.jpg'),
    ]);
    index += 1;
  }
  ffmpeg([
    '-v', 'error', '-y', '-framerate', '1', '-i', join(tiles, '%02d.jpg'),
    '-vf', 'tile=6x8:padding=6:margin=6:color=0x102033',
    '-frames:v', '1', '-q:v', '3', join(outDir, 'contact-sheet.jpg'),
  ]);
}

function encode(opts) {
  const silent = join(opts.outDir, 'promo_silent.mp4');
  ffmpeg([
    '-v', 'error', '-y', '-framerate', '30', '-i', join(opts.outDir, 'frames', '%04d.jpg'),
    '-vf', 'scale=iw:ih:in_range=pc:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an', silent,
  ]);
  const audioDir = opts.audioDir || opts.outDir;
  for (const variant of opts.mux) {
    const wav = join(audioDir, `bgm_${variant}.wav`);
    if (!existsSync(wav)) throw new Error('音源がありません: ' + wav);
    ffmpeg([
      '-v', 'error', '-y', '-i', silent, '-i', wav,
      '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest',
      join(opts.outDir, `promo_${variant}.mp4`),
    ]);
  }
  contactSheet(opts.outDir);
}

function runSelftest() {
  const result = T.selftestStoryboard();
  if (!result.ok) {
    console.error(result.errors.join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(`selftest ok: ${result.totalFrames} frames / captions ${result.captions}`);
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  if (opts.selftest) {
    runSelftest();
    return;
  }
  mkdirSync(opts.outDir, { recursive: true });
  if (!opts.encodeOnly) await capture(opts);
  if (!opts.noEncode && !opts.partial) encode(opts);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
