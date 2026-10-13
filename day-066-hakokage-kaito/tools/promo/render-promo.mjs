/* Day 66『箱影の怪盗』のプロモ動画（縦 1080×1920・30fps・32秒・BGM付き）を作る。
   実際のゲームを Playwright の Chromium で開き、キーで遊んだ画面をそのまま撮る。作り物の画面は足さない。
   足すのは、字幕・押した十字ボタンの輪・終了カードだけ（overlay.mjs）。絵コンテ・操作の時刻・字幕は timeline.mjs。

   実行:
     node day-066-hakokage-kaito/tools/promo/render-promo.mjs
     node day-066-hakokage-kaito/tools/promo/render-promo.mjs --base=http://127.0.0.1:4671/day-066-hakokage-kaito/
   他の指定:
     --variant=a|b|both   音の案（既定 both。A案は Day066_hakokage_kaito_promo.mp4、B案は …_promo_b.mp4）
     --reuse-video        録画をやり直さず、前回の output/_silent.mp4 に音を付け直す（音だけ直すとき）
     --hide-share         成功の欄の「結果を送る」（Xで送る・LINEで送る のボタン）を、録画で見えなくする
     --video-only         録画と書き出しだけ（音なし）。画の確認用
     --keep-work          output/_work（撮ったコマ）を残す

   流れ：場面ごとにページを開き（面1・面5・面8）、準備運動のあと、時刻表どおりにキーを押す。
   撮影は Page.captureScreenshot を連続で呼び（約25ms間隔・PNG・1080×1920）、各コマの時刻を記録する。
   Playwright の録画（recordVideo）は画面を 540×960 で撮り、画質も低い（VP8・約1Mbps）ので使わない。
   録画のあと、コマの時刻から 30fps のコマ列を作り直して H.264 にし、動画から「手を押してから画が動くまで」を測って
   効果音の合図を画に合わせ、音（promo-audio.mjs）を付けて、書き出した動画を検査する（audit.mjs）。 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { CAPTIONS, DURATION_SECONDS, END_ANIM, END_CARD, FPS, KEY_NAME, PAD, SCALE, TAKES, VIEW, checkTexts, deriveCues, eventInfo, parseCaption, simulate } from './timeline.mjs';
import { installOverlay } from './overlay.mjs';
import { auditAll, extractFrames, firstFrameMotion, measureOnsets, syncReport } from './audit.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const output = join(here, 'output');
const work = join(output, '_work');
const flags = new Map(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const at = a.indexOf('='); return at < 0 ? [a.slice(2), true] : [a.slice(2, at), a.slice(at + 1)]; }));
const base = String(flags.get('base') || process.env.PROMO_BASE || 'http://127.0.0.1:4671/day-066-hakokage-kaito/').replace(/\/?$/, '/');
const baseOrigin = new URL(base).origin;
const font = process.env.PROMO_FONT || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
const variants = flags.get('variant') && flags.get('variant') !== 'both' ? [String(flags.get('variant')).toLowerCase()] : ['a', 'b'];
const reuseVideo = flags.has('reuse-video');
const hideShare = flags.has('hide-share');   // 成功の欄の「結果を送る」（他社サービス名のボタン）を、録画では見えなくする
const videoOnly = flags.has('video-only');   // 録画と書き出しだけ（音なし）。画の確認用
const FRAME_LAG = 3;            // 撮影の呼び出しを始めた時刻から、実際に画を取る時刻までの目安（ms）
const MAX_ATTEMPTS = 3;
const CAPTION_LEAD = 0.2;       // 字幕は、画の動きより少し先に入れ替える（読み始めてから動きが来る。入れ替えに約0.22秒かかる）
const STALL_MS = 70;            // 撮影の呼び出しがこれ以上あいたら、止まった（2コマ以上の欠け）と見なす
const SLOW_MS = 40;             // 撮影の間隔の中央値がこれを超えたら、撮り直す（通常は約25ms。面8は盤が大きく、機械が忙しいと約32ms）

const nowMs = () => performance.timeOrigin + performance.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function sleepUntil(ms) {
  const wait = ms - nowMs();
  if (wait > 3) await sleep(wait - 2);
  while (nowMs() < ms) { /* 最後の2msは待ち受けて、時刻のずれを小さくする */ }
}
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28, ...opts });

function preflight() {
  for (const tool of ['ffmpeg', 'ffprobe']) run('which', [tool]);
  if (!existsSync(font)) throw new Error(`字幕の書体が見つかりません: ${font}（PROMO_FONT で場所を指定できます）`);
  const problems = checkTexts();
  if (problems.length) throw new Error(`画面に出す文字の検査で止まりました:\n${problems.join('\n')}`);
}

/* ---------------------------------------------------------------- 1つの場面（take）を撮る */

function startCapture(cdp, dir) {
  const frames = [];
  const writes = [];
  let running = true;
  let n = 0;
  const loop = (async () => {
    while (running) {
      const t0 = nowMs();
      let shot;
      try {
        shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: VIEW.width, height: VIEW.height, scale: 1 }, fromSurface: true, optimizeForSpeed: true });
      } catch (error) {
        if (!running) break;
        throw error;
      }
      const t1 = nowMs();
      const file = join(dir, `f${String(n).padStart(5, '0')}.png`);
      writes.push(writeFile(file, Buffer.from(shot.data, 'base64')));
      frames.push({ n, file, t0, t1 });
      n += 1;
    }
  })();
  return { frames, async stop() { running = false; await loop; await Promise.all(writes); } };
}

async function recordTake(browser, take, attempt) {
  const dir = join(work, `take-${take.id}-${attempt}`);       // 試行ごとの置き場（あとで前の試行のほうが良いと分かっても、コマが残る）
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: VIEW, locale: 'ja-JP', hasTouch: true });   // 倍率は、撮影用のセッションで 2 に固定する
  const errors = [];
  const blocked = new Set();
  let capture = null;
  try {
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/__promo-font') return route.fulfill({ status: 200, contentType: 'font/ttf', body: readFileSync(font) });
      if (url.origin === baseOrigin) return route.continue();
      blocked.add(url.host);
      return route.abort();
    });
    await page.goto(`${base}?level=${take.level}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('html[data-ready="true"]');
    if (!(await page.title()).includes('箱影の怪盗')) throw new Error(`Day 66 のページではありません: ${base}`);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: VIEW.width, height: VIEW.height, deviceScaleFactor: SCALE, mobile: false });
    await installOverlay(page, { endCard: END_CARD, endAnim: END_ANIM, hideShare });
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    if (dpr !== SCALE) throw new Error(`倍率が ${SCALE} になっていません（${dpr}）`);

    const rows = simulate(take);
    const capsHere = CAPTIONS.filter((c) => c.start >= take.start && c.start < take.end);
    const first = capsHere.find((c) => c.start <= take.start);
    if (first) await page.evaluate(([parts, pos]) => window.promo.caption(parts, pos, true), [parseCaption(first.text), first.pos]);

    capture = startCapture(cdp, dir);
    // 準備運動：最初の1手を押して戻す。初回の動きだけが遅い（約140ms止まる）ので、本番の前に済ませる
    const warmKey = take.events.find((e) => e.key).key;
    await page.keyboard.press(KEY_NAME[warmKey]); await sleep(450);
    await page.keyboard.press('z'); await sleep(550);

    // 時刻表（take の頭を 0 とした秒）
    const tasks = [];
    const checks = [];
    const actual = [];
    const task = (at, name, fn) => tasks.push({ at: at - take.start, name, fn });     // 時刻表は take の頭を 0 とした秒
    const local = (at) => at - take.start;
    for (const row of rows) {
      const { event } = row;
      if (event.key) {
        task(event.at, `key ${event.key}`, async () => {
          page.evaluate(([sel, quick]) => window.promo.press(sel, false, quick), [PAD[event.key], row.state.status !== 'play']).catch(() => {});   // 見つかった・成功の欄に替わる手は、輪を短く
          const t = nowMs();
          await page.keyboard.press(KEY_NAME[event.key]);
          actual.push({ index: row.index, at: local(event.at), actualMs: t });
        });
      } else if (event.tap) {
        let box = null;
        task(event.at - 0.35, 'measure', async () => { box = await page.locator(event.tap).boundingBox(); if (!box) throw new Error(`押す所が見つかりません: ${event.tap}`); });
        task(event.at - 0.03, 'ring', () => page.evaluate(([sel]) => window.promo.press(sel, true, true), [event.tap]));
        task(event.at, `tap ${event.label}`, async () => {
          const t = nowMs();
          await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
          actual.push({ index: row.index, at: local(event.at), actualMs: t });
        });
        if (event.label === 'levels') task(event.at + 0.15, 'bump', () => page.evaluate(() => window.promo.bump()));
      }
      if (!event.pre) {
        /* 歩数・状態・宝の持ち物は、キーを押した瞬間に画面の属性へ入る。次の手（最短 0.25 秒後）が来る前に読む。
           見つかった・成功の欄の文字は、動きの終わり（約 0.19 秒後）に出るので、あとの手が空く所で読む */
        const read = () => page.evaluate(() => {
          const app = document.getElementById('app');
          const text = (id) => (document.getElementById(id).hidden ? '' : document.getElementById(id).innerText.replace(/\s+/g, ' '));
          return { status: app.dataset.status, steps: app.dataset.steps, treasure: app.dataset.treasure, level: app.dataset.level,
            dialog: document.getElementById('level-dialog').open, caught: text('panel-caught'), clear: text('panel-clear') };
        });
        const want = { status: row.state.status, steps: String(row.state.steps), treasure: row.state.treasure ? '1' : '0', level: `L${take.level}` };
        const verdict = (got) => got.status === want.status && got.steps === want.steps && got.treasure === want.treasure && got.level === want.level;
        task(event.at + (event.tap ? 0.3 : 0.07), 'check', async () => {
          const got = await read();
          checks.push({ at: event.at, label: event.label ?? event.key, ok: verdict(got) && (event.label !== 'levels' || got.dialog), want, got });
        });
        if (event.tap || row.state.status !== 'play') {
          task(event.at + 0.5, 'panel', async () => {
            const got = await read();
            const ok = row.state.status === 'caught' ? got.caught !== '' : row.state.status === 'escaped' ? got.clear !== '' : true;
            checks.push({ at: event.at, label: `${event.label ?? event.key}・欄`, ok, want, got });
          });
        }
      }
    }
    for (const cap of capsHere.filter((c) => c.start > take.start)) {
      task(cap.start - (cap.lead ?? CAPTION_LEAD), 'caption', () => page.evaluate(([parts, pos]) => window.promo.caption(parts, pos, false), [parseCaption(cap.text), cap.pos]));
    }
    if (take.endCardAt != null) task(take.endCardAt, 'end card', () => page.evaluate(() => window.promo.showEnd()));
    tasks.sort((a, b) => a.at - b.at);

    const lead = Math.max(0, -Math.min(...tasks.map((t) => t.at))) + 0.9;
    const origin = nowMs() + lead * 1000;
    for (const t of tasks) { await sleepUntil(origin + t.at * 1000); await t.fn(); }
    await sleepUntil(origin + (take.end - take.start + 0.35) * 1000);
    await capture.stop();
    const sizes = await page.evaluate(() => window.promo.sizes);

    const span = capture.frames.filter((f) => f.t0 >= origin - 60 && f.t0 <= origin + (take.end - take.start) * 1000 + 60);
    const gaps = span.slice(1).map((f, i) => f.t0 - span[i].t0);
    /* 箱を押す手は、アプリが詰みの有無を探すので、動き出しが約 40〜80ms 遅れる（面8）。これは撮り直しても同じなので、想定内として数えない */
    const pushes = eventInfo(take).filter((e) => e.push).map((e) => e.at - take.start);
    const stalls = span.slice(1).map((f, i) => ({ at: (span[i].t0 - origin) / 1000, ms: f.t0 - span[i].t0 })).filter((g) => g.ms > STALL_MS)
      .map((g) => ({ ...g, expected: pushes.some((p) => g.at >= p - 0.06 && g.at <= p + 0.45) }));
    const bad = checks.filter((c) => !c.ok);
    if (errors.length) throw new Error(`ブラウザのエラー: ${errors.join(' | ')}`);
    if (bad.length) throw new Error(`実画面が想定とずれています（面${take.level}）: ${JSON.stringify(bad)}`);
    return { take, dir, origin, frames: capture.frames, actual, checks, stalls, maxGap: Math.max(0, ...gaps), medianGap: [...gaps].sort((a, b) => a - b)[gaps.length >> 1], blocked: [...blocked], captionSizes: sizes, attempt };
  } finally {
    if (capture) await capture.stop().catch(() => {});      // 途中で失敗しても、撮影の繰り返しを止めてから閉じる
    await context.close();
  }
}

async function recordAll() {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const browser = await chromium.launch();
  const done = {};
  try {
    for (const take of TAKES) {
      let best = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const rec = await recordTake(browser, take, attempt);
        const odd = rec.stalls.filter((s) => !s.expected);
        const slow = rec.medianGap > SLOW_MS;      // 機械が忙しく、撮影の間隔そのものが開いたとき
        const lost = odd.reduce((sum, s) => sum + s.ms, 0) + (slow ? (rec.medianGap - 25) * 200 : 0);
        console.log(`take ${take.id}（面${take.level}）試行${attempt}: ${rec.frames.length}コマ・間隔の中央値 ${rec.medianGap.toFixed(0)}ms${slow ? '（遅い）' : ''}・最大 ${rec.maxGap.toFixed(0)}ms・止まり ${rec.stalls.length}回（想定外 ${odd.length}）${rec.stalls.length ? `: ${rec.stalls.map((s) => `${s.at.toFixed(2)}s:${s.ms.toFixed(0)}ms${s.expected ? '(押す手)' : ''}`).join(' ')}` : ''}`);
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
    const take = TAKES.find((t) => time >= t.start && time < t.end) ?? TAKES[TAKES.length - 1];
    const rec = recs[take.id];
    const wanted = rec.origin + (time - take.start) * 1000;
    let lo = 0; let hi = rec.frames.length - 1; let idx = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (rec.frames[mid].t0 + FRAME_LAG <= wanted) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
    symlinkSync(rec.frames[idx].file, join(seq, `${String(k).padStart(5, '0')}.png`));
    picked.push({ k, take: take.id, n: idx, lateMs: wanted - (rec.frames[idx].t0 + FRAME_LAG) });
  }
  const silent = join(output, '_silent.mp4');
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(seq, '%05d.png'),
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', '-map_metadata', '-1', silent]);
  return { silent, picked };
}

/* ---------------------------------------------------------------- 音（A案・B案）を作って、動画に付ける */

function makeAudio(variant, cuesPath) {
  const wav = join(output, `bgm_${variant}.wav`);
  const mp3 = join(output, `bgm_${variant}.mp3`);
  const out = run(process.execPath, [join(here, 'promo-audio.mjs'), '--variant', variant, '--out', wav, '--mp3', mp3, '--cues', cuesPath], { encoding: 'utf8' });
  process.stdout.write(out);
  return { wav, mp3 };
}

function mux(silent, wav, file) {
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', silent, '-i', wav, '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-t', String(DURATION_SECONDS), '-movflags', '+faststart', '-map_metadata', '-1', file]);
}

/* ---------------------------------------------------------------- 本体 */

preflight();
mkdirSync(output, { recursive: true });
const reachable = await fetch(base).then((r) => r.ok).catch(() => false);
if (!reachable && !reuseVideo) throw new Error(`アプリに届きません: ${base}（--base で配信元を指定できます）`);

let recs = null;
let video = join(output, '_silent.mp4');
let picked = [];
if (reuseVideo) {
  if (!existsSync(video)) throw new Error('output/_silent.mp4 がありません（--reuse-video は録画済みのときだけ）');
} else {
  recs = await recordAll();
  ({ silent: video, picked } = assemble(recs));
}

/* 音の合図を、画に出た時刻に合わせる：手を押した時刻（実測）から動画の画面が最初に変わる時刻を測り、効果音をそこへ置く。
   測った値は output/onsets.json に残し、--reuse-video のときに読み直す */
const onsetsFile = join(output, 'onsets.json');
let keyTimes = [];
let onsets = {};
let settles = {};
if (recs) {
  for (const take of TAKES) {
    const rec = recs[take.id];
    for (const a of rec.actual) {
      const event = take.events[a.index];
      keyTimes.push({ key: `${take.id}:${a.index}`, take: take.id, index: a.index, actual: take.start + (a.actualMs - rec.origin) / 1000, region: event.tap ? 'full' : 'board', pre: !!event.pre });
    }
  }
  const measurable = keyTimes.filter((k) => !k.pre && k.actual >= 0.05);
  onsets = measureOnsets(video, measurable.map((k) => ({ key: k.key, from: k.actual, region: k.region })));
  for (const k of keyTimes) k.onset = onsets[k.key] ?? null;
  // 見つかった・成功は、動きの終わりに結果の欄が出る（約0.19秒後。機械が忙しいと遅れる）。その欄が出た時刻を測る
  const finals = [];
  for (const take of TAKES) {
    for (const row of simulate(take)) {
      if (row.event.pre || !(row.state.status === 'caught' || row.state.status === 'escaped') || !row.event.key) continue;
      const k = keyTimes.find((x) => x.key === `${take.id}:${row.index}`);
      if (k) finals.push({ key: k.key, from: Math.max(0.03, (k.onset ?? k.actual) + 0.08), region: 'panel' });
    }
  }
  settles = measureOnsets(video, finals, { within: 0.4 });
  writeFileSync(onsetsFile, JSON.stringify({ keyTimes, onsets, settles }, null, 1) + '\n');
} else if (existsSync(onsetsFile)) {
  ({ keyTimes, onsets, settles = {} } = JSON.parse(readFileSync(onsetsFile, 'utf8')));
}
const present = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
const cues = deriveCues({ onsets: present(onsets), settles: present(settles) });
if (videoOnly) {
  console.log('確認用のコマ:', extractFrames(video, join(output, 'frames')).join(' '));
  console.log('1コマ目の動き:', JSON.stringify(firstFrameMotion(video)));
  console.log('手→画の遅れ・欄の合図:', JSON.stringify(syncReport(video, cues, keyTimes)));
  if (recs) writeFileSync(join(output, 'take-info.json'), JSON.stringify(Object.fromEntries(Object.entries(recs).map(([id, r]) => [id, { maxGap: r.maxGap, medianGap: r.medianGap, stalls: r.stalls, sizes: r.captionSizes, checks: r.checks.map((c) => ({ at: c.at, label: c.label, ok: c.ok, got: c.got })), jitter: r.actual.map((a) => Math.round(a.actualMs - (r.origin + a.at * 1000))) }])), null, 1));
  if (!flags.has('keep-work')) rmSync(work, { recursive: true, force: true });
  process.exit(0);
}
const cuesPath = join(output, 'cues.json');
writeFileSync(cuesPath, JSON.stringify(cues, null, 1) + '\n');
const files = [];
for (const variant of variants) {
  const { wav, mp3 } = makeAudio(variant, cuesPath);
  const file = join(output, variant === 'a' ? 'Day066_hakokage_kaito_promo.mp4' : `Day066_hakokage_kaito_promo_${variant}.mp4`);
  mux(video, wav, file);
  files.push({ variant, file, wav, mp3 });
  console.log(`書き出し: output/${file.split('/').pop()}`);
}

const report = await auditAll({ output, silent: video, files, cues, recs, picked, keyTimes, captions: CAPTIONS });
const reportFile = join(output, 'capture-checks.json');
if (!recs && existsSync(reportFile)) {      // 録画を使い回したときは、前回の撮影の記録（場面ごとの止まり・画面の照合）を引き継ぐ
  const before = JSON.parse(readFileSync(reportFile, 'utf8'));
  report.takes ??= before.takes; report.resampleLateMs ??= before.resampleLateMs;
}
writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
if (!flags.has('keep-work')) rmSync(work, { recursive: true, force: true });
console.log('完了。確認用のコマは output/frames/、数値は output/capture-checks.json。');
