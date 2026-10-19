/* Day 71『影証言』のプロモ動画（縦 1080×1920・30fps・約33秒・音あり）を作る。
   実際のゲームを Playwright の Chromium で開き、指（CDP のタッチ）で遊んだ画面をそのまま撮る。モデル・盤面・得点は注入しない。
   足すのは、字幕・指の印・終了カードの重ね物だけ（overlay.mjs）。絵コンテ・操作の時刻・字幕は timeline.mjs。

   実行（リポジトリのルートで）:
     node day-071-kage-shogen/tools/promo/render-promo.mjs
   指定:
     --reuse-video   録画をやり直さず、前回の output/_silent.mp4 と output/measured.json で音だけ付け直す
     --video-only    録画と書き出しだけ（音なし）。画の確認用
     --keep-work     撮ったコマ（作業場）を残す
     --base=<URL>    すでに動いている配信を使う（既定は tools/serve.mjs を空いている番号で起こし、終わったら止める）
   環境変数: PROMO_FONT（Zen Kaku Gothic New Bold）・PROMO_FONT_BLACK（同 Black）・PROMO_WORK（撮ったコマを置く場所。その中の _work だけを使い、毎回空にする。1〜2GB）

   流れ：場面ごとにページを開き直し（夜1・夜3・夜5）、実際のタップで再現室へ入り、時刻表どおりに指を動かす。
   撮影は Page.captureScreenshot を連続で呼ぶ（JPEG 品質95・約25ms間隔・1080×1920）。各コマの時刻から 30fps のコマ列を作り直して H.264 にし、
   書き出した動画から画面の出来事（判子・近さの言葉・画面の切り替わり）のコマを測って効果音をそこへ置き、音（promo-audio.mjs）を付けて、検査する（audit.mjs）。 */
import { chromium } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { CASES, stageOf } from '../../lib/cases.js';
import { hitTest, propScreenRect } from '../../lib/hit.js';
import { createTransform } from '../../lib/transform.js';
import {
  CAPTIONS, DURATION_SECONDS, END_ANIM, END_CARD, FPS, SCALE, SECTIONS, STORAGE_KEY, TAKES, VIEW,
  captionPlain, captionSwitchAt, checkTexts, deriveCues, parseCaption, pathEnd, pathStart, pathValue, progressFor, simulate,
} from './timeline.mjs';
import { CAPTION_BOX, PLATE_BOUND, SAFE, installOverlay } from './overlay.mjs';
import { FULL, auditMaster, contactSheet, extractFrame, firstChange, spectrogram, stampLanding, stampLandingDelay } from './audit.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = fileURLToPath(new URL('../../', import.meta.url));
const output = join(here, 'output');
const flags = new Map(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const at = a.indexOf('='); return at < 0 ? [a.slice(2), true] : [a.slice(2, at), a.slice(at + 1)]; }));
const work = join(process.env.PROMO_WORK || output, '_work');     // 毎回まるごと消すので、指定された場所そのものでなく、中の _work だけを使う
const fontBold = process.env.PROMO_FONT || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
const fontBlack = process.env.PROMO_FONT_BLACK || join(dirname(fontBold), 'ZenKakuGothicNew-Black.ttf');
const MASTER = join(output, 'Day071_kage_shogen_promo.mp4');
const SILENT = join(output, '_silent.mp4');
const FRAME_LAG = 3;         // 撮影を頼んでから、実際に画を取るまでの目安（ms）
const MAX_ATTEMPTS = 3;
const STALL_MS = 70;         // 撮影の間隔がこれ以上あいたら、止まった（2コマ以上の欠け）と見なす
const SLOW_MS = 33;          // 撮影の間隔の中央値がこれを超えたら撮り直す（30fps に足りない。通常は約25ms）
const JPEG_QUALITY = 95;

const nowMs = () => performance.timeOrigin + performance.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function sleepUntil(ms) {
  const wait = ms - nowMs();
  if (wait > 3) await sleep(wait - 2);
  while (nowMs() < ms) { /* 最後の2msは待ち受けて、時刻のずれを小さくする */ }
}
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28, ...opts });
const r3 = (x) => Math.round(x * 1000) / 1000;

function preflight() {
  for (const tool of ['ffmpeg', 'ffprobe']) run('which', [tool]);
  for (const font of [fontBold, fontBlack]) if (!existsSync(font)) throw new Error(`字幕の書体が見つかりません: ${font}（PROMO_FONT・PROMO_FONT_BLACK で場所を指定できます）`);
  const problems = checkTexts();
  if (problems.length) throw new Error(`画面に出す文字の検査で止まりました:\n${problems.join('\n')}`);
}

/* 配信：tools/serve.mjs を空いている番号（PORT=0）で起こす。終わったら止める（Bash の & では起こさない） */
async function startServer() {
  const server = spawn(process.execPath, [join(appDir, 'tools/serve.mjs')], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise((resolve, reject) => {
    let out = ''; let err = '';
    const timer = setTimeout(() => reject(new Error(`配信が起動しません: ${err}`)), 10000);
    server.stdout.on('data', (chunk) => { out += chunk; const m = out.match(/http:\/\/127\.0\.0\.1:\d+\/day-071-kage-shogen\//); if (m) { clearTimeout(timer); resolve(m[0]); } });
    server.stderr.on('data', (chunk) => { err += chunk; });
    server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`配信が止まりました: ${code} ${err}`)); });
  });
  return { url, stop: () => new Promise((resolve) => { if (server.exitCode !== null) return resolve(); server.once('exit', resolve); server.kill('SIGTERM'); }) };
}

/* ---------------------------------------------------------------- 1つの場面（take）を撮る */

function startCapture(cdp, dir) {
  const frames = []; const writes = []; let running = true; let n = 0;
  const scrollY = async () => (await cdp.send('Runtime.evaluate', { expression: 'scrollY', returnByValue: true })).result.value;
  const loop = (async () => {
    while (running) {
      let y0; let y1; let shot; let at;
      try {
        y0 = await scrollY();
        at = nowMs();
        // clip を付ける（付けないと、撮影のあいだタッチの座標が半分に化ける）。clip は文書の座標なので、いまのスクロール量だけずらす
        shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: JPEG_QUALITY, clip: { x: 0, y: y0, width: VIEW.width, height: VIEW.height, scale: 1 }, fromSurface: true, optimizeForSpeed: true });
        y1 = await scrollY();
      } catch (error) {
        if (!running) break;
        throw error;
      }
      const data = Buffer.from(shot.data, 'base64');
      const file = join(dir, `f${String(n).padStart(5, '0')}.jpg`);
      writes.push(writeFile(file, data));
      frames.push({ n, file, t0: at, ok: y0 === y1, scrollY: y0, bytes: data.length, hash: createHash('md5').update(data).digest('hex') });
      n += 1;
    }
  })();
  return { frames, async stop() { running = false; await loop; await Promise.all(writes); } };
}

async function recordTake(browser, base, take, attempt) {
  const caseDef = CASES.find((c) => c.id === take.caseId);
  const stage = stageOf(caseDef);
  const rows = simulate(take);
  const dir = join(work, `take-${take.id}-${attempt}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE, hasTouch: true, locale: 'ja-JP', bypassCSP: true });
  // 夜3・夜5を開くための進行（ページを開く前に入れる）。星は画面に映さない
  if (take.cleared.length) await context.addInitScript(([key, value]) => { try { localStorage.setItem(key, value); } catch { /* 保存できなくても撮れない */ } }, [STORAGE_KEY, JSON.stringify(progressFor(take.cleared))]);
  // 画面の切り替わりを、ページの時計で記録する（属性を聞くだけ）
  await context.addInitScript(() => {
    window.__promoPhases = [];
    document.addEventListener('DOMContentLoaded', () => {
      const app = document.getElementById('app');
      new MutationObserver(() => window.__promoPhases.push({ phase: app.dataset.phase, at: performance.timeOrigin + performance.now() })).observe(app, { attributes: true, attributeFilter: ['data-phase'] });
    });
  });
  const errors = []; const blocked = new Set();
  let capture = null;
  try {
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    const origin0 = new URL(base).origin;
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/__promo-font-bold') return route.fulfill({ status: 200, contentType: 'font/ttf', body: readFileSync(fontBold) });
      if (url.pathname === '/__promo-font-black') return route.fulfill({ status: 200, contentType: 'font/ttf', body: readFileSync(fontBlack) });
      if (url.origin === origin0) return route.continue();
      blocked.add(url.host);
      return route.abort();
    });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('#case-list [data-case-id]').length === 5);
    if (!(await page.title()).includes('影証言')) throw new Error(`Day 71 のページではありません: ${base}`);
    const cap = await context.newCDPSession(page);     // 撮影
    const inp = await context.newCDPSession(page);     // 入力（撮影の命令の後ろに並ばないよう、別にする）
    await cap.send('Emulation.setDeviceMetricsOverride', { width: VIEW.width, height: VIEW.height, deviceScaleFactor: SCALE, mobile: false });
    await installOverlay(page, { endCard: END_CARD, endAnim: END_ANIM });
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    if (dpr !== SCALE) throw new Error(`倍率が ${SCALE} になっていません（${dpr}）`);
    const touch = (type, x, y) => inp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 11, radiusY: 11, force: 1 }] });
    const tapAt = async (x, y) => { await touch('touchStart', x, y); await sleep(60); await touch('touchEnd', x, y); };
    const centerOf = async (selector) => {
      const b = await page.locator(selector).boundingBox();
      if (!b) throw new Error(`押す所が見つかりません: ${selector}`);
      const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      if (c.x < 0 || c.y < 0 || c.x > VIEW.width || c.y > VIEW.height) throw new Error(`押す所が画面の外です: ${selector} ${JSON.stringify(c)}`);
      return c;
    };
    const phaseIs = (p) => page.waitForFunction((want) => document.getElementById('app').dataset.phase === want, p, { timeout: 5000 });

    // 夜を開く（実際のタップ。動画に映る前の準備）
    { const c = await centerOf(`[data-case-id="${take.caseId}"]`); await tapAt(c.x, c.y); await phaseIs('briefing'); }
    await sleep(300);
    { const c = await centerOf('#start-case'); await tapAt(c.x, c.y); await phaseIs('stage'); }
    await sleep(500);
    const wallBox = await page.locator('#wall').boundingBox();
    const transform = createTransform(wallBox.width, wallBox.height);
    const rectOf = (selector) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }, selector);
    const layout = { wall: await rectOf('#wall'), band: await rectOf('#band-text'), readouts: await rectOf('.readouts'), note: await rectOf('#note-text'), controls: await rectOf('.controls') };
    // 準備運動：壁の何もない所を一度押す（アプリは何もしない）。初回のタッチの遅れを本番の前に済ませる
    const arrangement = { ly: stage.lamp.start, xs: Object.fromEntries(stage.props.map((p) => [p.id, p.x.start])) };
    const empty = [[2, 176], [236, 176], [2, 4], [236, 4]].map(([x, y]) => transform.toScreen(x, y)).find((p) => hitTest(transform, stage, arrangement, p.x, p.y) === null);
    if (!empty) throw new Error('準備運動で押す、壁の何もない所が見つかりません');
    await tapAt(wallBox.x + empty.x, wallBox.y + empty.y);
    await sleep(500);

    const capsHere = CAPTIONS.filter((c) => c.start >= take.start && c.start < take.end);
    const first = capsHere.find((c) => c.start === take.start);
    if (first) await page.evaluate(([parts, pos, text]) => window.promo.caption(parts, pos, true, text), [parseCaption(first.text), first.pos, captionPlain(first.text)]);
    await sleep(200);

    const read = () => page.evaluate(() => {
      const $ = (s) => document.querySelector(s);
      const text = (s) => ($(s)?.textContent ?? '').replace(/[\t\n\r ]+/g, ' ').trim();
      const stamp = $('#stamp'); const style = stamp ? getComputedStyle(stamp) : null;
      return {
        phase: $('#app').dataset.phase, case: $('#app').dataset.case, lamp: $('#lamp-readout').dataset.ly,
        item: $('#item-readout').hidden ? '' : text('#item-readout'), band: text('#band-text'), note: text('#note-text'),
        reading: text('#reading-text'), stampShown: !!stamp && !$('#solved-panel').hidden && style.display !== 'none', stampOpacity: style ? Number(style.opacity) : null,
        suspects: [...document.querySelectorAll('#suspect-list .suspect')].map((c) => ({ id: c.dataset.suspectId, excluded: c.classList.contains('is-excluded'), wrong: c.classList.contains('is-wrong') })),
        verdictTitle: text('#verdict-title'), verdictText: text('#verdict-text'), verdictStars: text('#verdict-stars'), scrollY: Math.round(scrollY),
      };
    });

    capture = startCapture(cap, dir);
    await sleep(300);

    const tasks = []; const checks = []; const actual = []; const drags = []; const rects = {};
    const local = (at) => at - take.start;
    const task = (at, name, fn) => tasks.push({ at: local(at), name, fn });
    let origin = 0;
    const videoTime = (ms) => take.start + (ms - origin) / 1000;
    const check = (at, label, want, verdict) => task(at, `check ${label}`, async () => {
      const got = await read();
      checks.push({ at: r3(at), label, ok: verdict(got), want, got });
    });

    for (const row of rows) {
      const event = take.events[row.index];
      if (row.kind === 'drag') {
        const id = row.id;
        const prop = stage.props.find((p) => p.id === id);
        task(pathStart(event.path), `drag ${id}`, async () => {
          // 指を置く所：いまの配置での、その物の画面の位置。アプリと同じ当たり判定で、狙った物がつかめるか確かめる
          const point = id === 'lamp' ? transform.toScreen(stage.lamp.x, arrangement.ly) : (() => { const r = propScreenRect(transform, prop, arrangement.xs[id]); return { x: r.cx, y: r.cy }; })();
          const hit = hitTest(transform, stage, arrangement, point.x, point.y);
          if (hit !== id) throw new Error(`${take.id}: ${id} をつかむ所で、${hit} がつかまる`);
          const sx = wallBox.x + point.x; const sy = wallBox.y + point.y; const v0 = event.path[0][1];
          const at = (v, t) => {
            const wobble = 0.8 * Math.sin(t * 7.3) + 0.45 * Math.sin(t * 12.7 + 1);     // 手のわずかな揺れ（アプリが使わない向き）
            return id === 'lamp' ? [sx + wobble, sy - (v - v0) * transform.scale] : [sx + (v - v0) * transform.scale, sy + wobble];
          };
          const started = nowMs();
          await touch('touchStart', sx, sy);
          const end = pathEnd(event.path);
          let moves = 0;
          for (;;) {
            const t = videoTime(nowMs());
            if (t >= end - 0.012) break;
            await touch('touchMove', ...at(pathValue(event.path, t), t));
            moves += 1;
            await sleep(11);
          }
          const vEnd = event.path[event.path.length - 1][1];
          await touch('touchMove', ...at(vEnd, end));
          await sleepUntil(origin + local(end) * 1000);
          const released = nowMs();
          await touch('touchEnd', ...at(vEnd, end));
          drags.push({ index: row.index, id, startedMs: started, releasedMs: released, moves, startPoint: { x: r3(sx), y: r3(sy) } });
          if (id === 'lamp') arrangement.ly = vEnd; else arrangement.xs[id] = vEnd;
          if (row.solve) { arrangement.ly = stage.lamp.solution; for (const p of stage.props) if (!p.decoy) arrangement.xs[p.id] = p.x.solution; }
        });
        check(row.release + 0.08, `${row.label}を離した`, row.want, (got) => got.phase === 'stage' && got.lamp === String(row.want.lamp) && got.item === row.want.item && got.band === row.want.band && got.note === caseDef.coach);
        if (row.solve) {
          check(row.solve.solvedAt + 0.5, '再現（成功の画面）', row.solve, (got) => got.phase === 'solved' && got.reading === row.solve.reading && got.lamp === String(row.solve.lamp) && got.stampShown && got.stampOpacity === 1);
          task(row.solve.solvedAt + 0.5, 'rect stamp', async () => { rects[`${row.index}:stamp`] = await rectOf('#stamp'); rects[`${row.index}:scroll`] = (await read()).scrollY; });
        }
      } else if (row.kind === 'tap') {
        let point = null;
        task(row.at - 0.3, `measure ${row.label}`, async () => { point = await centerOf(row.selector); });
        task(row.at, `tap ${row.label}`, async () => { const t = nowMs(); await tapAt(point.x, point.y); actual.push({ index: row.index, label: row.label, actualMs: t, point }); });
        if (row.want.phase === 'deduction') check(row.at + 0.35, row.label, row.want, (got) => got.phase === 'deduction' && got.suspects.length === 3);
        if (row.want.excluded) {
          check(row.at + 0.35, row.label, row.want, (got) => got.phase === 'deduction' && row.want.excluded.every((id) => got.suspects.find((s) => s.id === id)?.excluded));
          task(row.at - 0.3, 'rect card', async () => { rects[`${row.index}:card`] = await rectOf(row.selector.replace(/ \.exclude$/, '')); });
        }
        if (row.want.phase === 'verdict') {
          check(row.at + 0.6, row.label, { title: row.want.title, text: row.want.text }, (got) => got.phase === 'verdict' && got.verdictTitle === row.want.title && got.verdictText === row.want.text);
          task(row.at + 0.6, 'rect verdict stamp', async () => { rects[`${row.index}:stamp`] = await rectOf('#verdict-panel .stamp'); });
        }
      }
    }
    for (const c of capsHere.filter((c) => c.start > take.start)) {
      const args = [c.text == null ? null : parseCaption(c.text), c.pos ?? null, captionPlain(c.text)];
      // 画面ごと替わる字幕（after）は、その画面に切り替わった瞬間に出す。それ以外は、画の動きより lead 秒先に切り替える
      if (c.after) task(captionSwitchAt(c), `caption ${args[2]}`, () => page.evaluate(([phase, parts, pos, text]) => window.promo.captionOnPhase(phase, parts, pos, text), [c.after, ...args]));
      else task(captionSwitchAt(c), `caption ${args[2]}`, () => page.evaluate(([parts, pos, text]) => window.promo.caption(parts, pos, false, text), args));
    }
    if (take.endCardAt != null) task(take.endCardAt, 'end card', () => page.evaluate(() => window.promo.showEnd()));
    tasks.sort((a, b) => a.at - b.at);

    // 時刻表（take の頭を 0 とした秒）。ドラッグは待たずに走らせ（指を動かしながら字幕や照合が進む）、最後にまとめて待つ
    const lead = Math.max(0, -Math.min(0, ...tasks.map((t) => t.at))) + 0.6;
    origin = nowMs() + lead * 1000;
    const running = [];
    for (const t of tasks) {
      await sleepUntil(origin + t.at * 1000);
      const p = t.fn();
      if (t.name.startsWith('drag ')) running.push(p); else await p;
    }
    await Promise.all(running);
    await sleepUntil(origin + (take.end - take.start + 0.35) * 1000);
    await capture.stop();
    const captionLog = await page.evaluate(() => window.promo.log);
    const endRects = take.endCardAt != null ? await page.evaluate(() => window.promo.endRects()) : [];
    const phases = (await page.evaluate(() => window.__promoPhases)).map((p) => ({ phase: p.phase, at: r3(videoTime(p.at)) }));

    const span = capture.frames.filter((f) => f.t0 >= origin - 60 && f.t0 <= origin + (take.end - take.start) * 1000 + 60);
    const gaps = span.slice(1).map((f, i) => f.t0 - span[i].t0);
    const phaseTimes = phases.map((p) => p.at - take.start);
    // 想定内の遅れ：画面が切り替わる所（描き直し）と、成功の「光る」演出の間（アプリが壁を影のぼかしつきで毎コマ描き直すので、約13コマ/秒になる）
    const flashes = rows.filter((r) => r.solve).map((r) => [r.solve.flashAt - 0.1 - take.start, r.solve.solvedAt + 0.4 - take.start]);
    const stalls = span.slice(1).map((f, i) => ({ at: r3((span[i].t0 - origin) / 1000), ms: Math.round(f.t0 - span[i].t0) })).filter((g) => g.ms > STALL_MS)
      .map((g) => ({ ...g, expected: phaseTimes.some((p) => g.at >= p - 0.15 && g.at <= p + 0.35) || flashes.some(([a, b]) => g.at >= a && g.at <= b), during: flashes.some(([a, b]) => g.at >= a && g.at <= b) ? 'flash' : undefined }));
    // 画面ごと替わる字幕は、その画面になってから出ていること（古い画面の上に出ていないこと）
    for (const c of capsHere.filter((x) => x.after && x.text != null)) {
      const shown = captionLog.find((l) => l.text === captionPlain(c.text));
      checks.push({ at: c.start, label: `字幕「${captionPlain(c.text)}」の画面`, ok: shown?.phase === c.after, want: { phase: c.after }, got: { phase: shown?.phase ?? null } });
    }
    const bad = checks.filter((c) => !c.ok);
    if (errors.length) throw new Error(`ブラウザのエラー: ${errors.join(' | ')}`);
    if (bad.length) throw new Error(`実画面が想定とずれています（場面${take.id}）: ${JSON.stringify(bad, null, 1)}`);
    return {
      take, dir, origin, frames: capture.frames, actual, drags: drags.map((d) => ({ ...d, start: r3(videoTime(d.startedMs)), release: r3(videoTime(d.releasedMs)) })),
      checks, stalls, phases, captionLog: captionLog.map((c) => ({ ...c, at: r3(videoTime(c.at)) })), endRects,
      rects, layout, wallBox, scale: transform.scale, invalidFrames: capture.frames.filter((f) => !f.ok).length,
      maxGap: Math.max(0, ...gaps), medianGap: [...gaps].sort((a, b) => a - b)[gaps.length >> 1], blocked: [...blocked], attempt,
    };
  } finally {
    if (capture) await capture.stop().catch(() => {});
    await context.close();
  }
}

async function recordAll(base) {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const browser = await chromium.launch();
  const done = {};
  try {
    for (const take of TAKES) {
      let best = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const rec = await recordTake(browser, base, take, attempt);
        const odd = rec.stalls.filter((s) => !s.expected);
        const slow = rec.medianGap > SLOW_MS;
        const lost = odd.reduce((sum, s) => sum + s.ms, 0) + (slow ? (rec.medianGap - 25) * 300 : 0);
        console.log(`take ${take.id}（${take.caseId}）試行${attempt}: ${rec.frames.length}コマ（${(rec.frames.reduce((s, f) => s + f.bytes, 0) / 1e6).toFixed(0)}MB）・間隔の中央値 ${rec.medianGap.toFixed(0)}ms${slow ? '（遅い）' : ''}・最大 ${rec.maxGap.toFixed(0)}ms・止まり ${rec.stalls.length}回（想定外 ${odd.length}）・スクロール中で捨てたコマ ${rec.invalidFrames}${rec.stalls.length ? `: ${rec.stalls.map((s) => `${s.at.toFixed(2)}s:${s.ms}ms${s.expected ? '(切替)' : ''}`).join(' ')}` : ''}`);
        if (!best || lost < best.lost) best = { rec, lost };
        if (!odd.length && !slow) break;
      }
      done[take.id] = best.rec;
    }
  } finally {
    await browser.close();
  }
  return done;
}

/* ---------------------------------------------------------------- コマ列 → H.264 */

function assemble(recs) {
  const seq = join(work, 'seq');
  rmSync(seq, { recursive: true, force: true });
  mkdirSync(seq, { recursive: true });
  const total = Math.round(DURATION_SECONDS * FPS);
  const picked = [];
  for (let k = 0; k < total; k += 1) {
    const time = k / FPS;
    const take = TAKES.find((t) => time >= t.start - 1e-9 && time < t.end - 1e-9) ?? TAKES[TAKES.length - 1];
    const rec = recs[take.id];
    const usable = rec.usable ??= rec.frames.filter((f) => f.ok);
    const wanted = rec.origin + (time - take.start) * 1000;
    let lo = 0; let hi = usable.length - 1; let idx = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (usable[mid].t0 + FRAME_LAG <= wanted) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
    symlinkSync(usable[idx].file, join(seq, `${String(k).padStart(5, '0')}.jpg`));
    picked.push({ k, take: take.id, n: usable[idx].n, hash: usable[idx].hash, lateMs: Math.round(wanted - (usable[idx].t0 + FRAME_LAG)) });
  }
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(seq, '%05d.jpg'),
    '-vf', 'scale=in_color_matrix=bt601:in_range=full:out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', '-map_metadata', '-1', '-metadata', 'encoder=', SILENT]);
  // 同じ絵が続く長さ（撮ったコマの中身が同じ）。意図した保持（止めて見せる所）は 1.2 秒以内にする
  const holds = []; let runStart = 0;
  for (let k = 1; k <= picked.length; k += 1) {
    if (k === picked.length || picked[k].hash !== picked[k - 1].hash) { if (k - runStart > 1) holds.push({ from: r3(runStart / FPS), seconds: r3((k - runStart) / FPS) }); runStart = k; }
  }
  return { picked, holds };
}

/* ---------------------------------------------------------------- 画面の出来事を、書き出した動画から測る */

/* 画から測った判子のコマが、CSS から計算した着く時刻（ページで画面が切り替わった時刻＋約0.118秒）と1コマより大きくずれたら止める */
function crossCheckStamp(key, landed, phaseAt) {
  const expected = phaseAt + stampLandingDelay();
  const gap = landed.at - expected;
  if (Math.abs(gap) > 1 / FPS + 0.005) throw new Error(`${key}: 判子のコマ ${landed.at.toFixed(3)}秒が、CSS から見込んだ ${expected.toFixed(3)}秒と ${gap.toFixed(3)}秒ずれる`);
  return { expected: r3(expected), gapSeconds: r3(gap) };
}

function measureAll(video, recs) {
  const measured = { bands: {}, solved: {}, stamps: {}, taps: {}, stampRects: {}, onsets: {} };
  for (const take of TAKES) {
    const rec = recs[take.id];
    const rows = simulate(take);
    for (const row of rows) {
      const key = `${take.id}:${row.index}`;
      if (row.kind === 'drag') {
        const drag = rec.drags.find((d) => d.index === row.index);
        const lag = drag ? drag.release - row.release : 0;     // 予定と実際の離した時刻の差（通常は数ms）
        row.bands.forEach((b, i) => {
          if (b.at < take.start) return;
          const at = firstChange(video, rec.layout.band, b.at + lag - 0.12, { within: 0.4, minPixels: 4 });
          if (at != null) measured.bands[`${key}:${i}`] = at;
        });
        if (row.solve) {
          const shown = firstChange(video, FULL, (drag?.release ?? row.release) + 1.15, { within: 0.6, minPixels: 3000 });
          if (shown == null) throw new Error(`${key}: 成功の画面が出たコマが見つかりません`);
          measured.solved[key] = shown;
          const rect = rec.rects[`${row.index}:stamp`];
          const landed = stampLanding(video, rect, shown);
          if (landed.at == null) throw new Error(`${key}: 判子が押されたコマが見つかりません`);
          measured.stamps[key] = landed.at;
          const phaseAt = rec.phases.find((p) => p.phase === 'solved' && p.at > take.start)?.at;
          measured.stampRects[key] = { rect, onset: shown, word: '再現', ...landed, ...crossCheckStamp(key, landed, phaseAt) };
        }
      } else if (row.kind === 'tap') {
        const tap = rec.actual.find((a) => a.index === row.index);
        const at = take.start + (tap.actualMs - rec.origin) / 1000;
        const region = row.want.excluded ? rec.rects[`${row.index}:card`] : FULL;
        const shown = firstChange(video, region, at + 0.02, { within: 0.4, minPixels: row.want.excluded ? 40 : 3000 });
        measured.taps[key] = shown;
        measured.onsets[key] = { tappedAt: r3(at), shown };
        if (row.want.phase === 'verdict') {
          const rect = rec.rects[`${row.index}:stamp`];
          const landed = stampLanding(video, rect, shown);
          if (landed.at == null) throw new Error(`${key}: 「解決」の判子のコマが見つかりません`);
          measured.stamps[key] = landed.at;
          const phaseAt = rec.phases.find((p) => p.phase === 'verdict')?.at;
          measured.stampRects[key] = { rect, onset: shown, word: '解決', ...landed, ...crossCheckStamp(key, landed, phaseAt) };
        }
      }
    }
  }
  return measured;
}

/* ---------------------------------------------------------------- 本体 */

preflight();
mkdirSync(output, { recursive: true });
const reuse = flags.has('reuse-video');
let server = null;
let recs = null; let picked = []; let holds = []; let measured;
const measuredFile = join(output, 'measured.json');
const checksFile = join(output, 'capture-checks.json');
try {
  if (reuse) {
    if (!existsSync(SILENT) || !existsSync(measuredFile)) throw new Error('output/_silent.mp4 と output/measured.json がありません（--reuse-video は録画済みのときだけ）');
    measured = JSON.parse(readFileSync(measuredFile, 'utf8'));
  } else {
    let base = flags.get('base') ? String(flags.get('base')).replace(/\/?$/, '/') : null;
    if (!base) { server = await startServer(); base = server.url; }
    const reachable = await fetch(base).then((r) => r.ok).catch(() => false);
    if (!reachable) throw new Error(`アプリに届きません: ${base}`);
    recs = await recordAll(base);
    ({ picked, holds } = assemble(recs));
    measured = measureAll(SILENT, recs);
    writeFileSync(measuredFile, JSON.stringify(measured, null, 1) + '\n');
  }
} finally {
  if (server) await server.stop();
}

const cues = deriveCues(measured);
const cuesPath = join(output, 'cues.json');
writeFileSync(cuesPath, JSON.stringify(cues, null, 1) + '\n');
if (recs) {
  const report = {
    takes: Object.fromEntries(Object.entries(recs).map(([id, r]) => [id, {
      caseId: r.take.caseId, cleared: r.take.cleared, attempt: r.attempt, frames: r.frames.length, frameMegabytes: Math.round(r.frames.reduce((s, f) => s + f.bytes, 0) / 1e5) / 10, droppedWhileScrolling: r.invalidFrames,
      medianGapMs: Math.round(r.medianGap), maxGapMs: Math.round(r.maxGap), stalls: r.stalls, blockedHosts: r.blocked,
      phases: r.phases, drags: r.drags, taps: r.actual.map((a) => ({ label: a.label, at: r3(r.take.start + (a.actualMs - r.origin) / 1000), point: a.point })),
      screenChecks: r.checks.map((c) => ({ at: c.at, label: c.label, ok: c.ok, want: c.want, got: c.got })),
      captions: r.captionLog.map((c) => ({ text: c.text, at: c.at, phase: c.phase, pos: c.pos, fontPx: c.size, box: c.box, textRect: c.textRect, fits: c.fits })), endCard: r.endRects,
      wallBox: r.wallBox, scale: r.scale, layout: r.layout,
    }])),
    resample: { lateMsMax: Math.max(...picked.map((p) => p.lateMs)), lateMsMean: Math.round(picked.reduce((s, p) => s + p.lateMs, 0) / picked.length), holds, longestHoldSeconds: Math.max(0, ...holds.map((h) => h.seconds)) },
    measured, cues: cues.filter((c) => c.kind !== 'lamp'), lampCues: cues.filter((c) => c.kind === 'lamp').length,
  };
  writeFileSync(checksFile, JSON.stringify(report, null, 2) + '\n');
}
if (flags.has('video-only')) {
  console.log('音なしで書き出しました: output/_silent.mp4');
  if (!flags.has('keep-work')) rmSync(work, { recursive: true, force: true });
  process.exit(0);
}

const wav = join(output, 'promo-audio.wav');
process.stdout.write(run(process.execPath, [join(here, 'promo-audio.mjs'), '--out', wav, '--cues', cuesPath], { encoding: 'utf8' }));
run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', SILENT, '-i', wav, '-map', '0:v:0', '-map', '1:a:0',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-t', String(DURATION_SECONDS),
  '-movflags', '+faststart', '-map_metadata', '-1', '-metadata', 'encoder=', '-fflags', '+bitexact', MASTER]);
console.log('書き出し: output/Day071_kage_shogen_promo.mp4');

extractFrame(MASTER, 0, join(output, 'firstframe.png'));
extractFrame(MASTER, SECTIONS.end.start + 2.4, join(output, 'endcard.png'));
contactSheet(MASTER, join(output, 'contactsheet.jpg'), fontBold);
spectrogram(MASTER, join(output, 'spectrogram.png'));

const checks = existsSync(checksFile) ? JSON.parse(readFileSync(checksFile, 'utf8')) : null;
const captionLog = checks ? Object.values(checks.takes).flatMap((t) => t.captions) : [];
const endRects = checks ? Object.values(checks.takes).flatMap((t) => t.endCard ?? []) : [];
const stampList = Object.entries(measured.stampRects).map(([key, s]) => ({ key, word: s.word, rect: s.rect, onset: s.onset, cueAt: cues.find((c) => c.kind === 'stamp' && Math.abs(c.at - s.at) < 0.02)?.at ?? s.at }));
const qa = auditMaster({ file: MASTER, captionLog, endRects, safe: SAFE, plateBound: PLATE_BOUND, stamps: stampList, firstCaption: captionPlain(CAPTIONS.find((c) => c.start === 0).text), expectedSeconds: DURATION_SECONDS });
qa.captionBoxes = CAPTION_BOX;
// 字幕の切り替え：古い字が消え始める時刻（予定）と、新しい字が出始めた時刻（実際）。画面ごと替わる字幕は、その画面の最初の描画で出る
qa.captionTiming = CAPTIONS.filter((c) => c.text != null && !TAKES.some((t) => t.start === c.start)).map((c) => {
  const log = captionLog.find((l) => l.text === captionPlain(c.text));
  return { text: captionPlain(c.text), start: c.start, switchStartsAt: r3(captionSwitchAt(c)), newTextAt: log?.at ?? null, phase: log?.phase ?? null, onScreenChange: c.after ?? null };
});
writeFileSync(join(output, 'qa.json'), JSON.stringify(qa, null, 2) + '\n');
if (!flags.has('keep-work')) rmSync(work, { recursive: true, force: true });
console.log(`検査: ${qa.result}`, JSON.stringify(qa.checks));
if (qa.result !== 'PASS') process.exitCode = 1;
