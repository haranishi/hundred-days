// Day083「カー360」のプロモーション動画（縦型 1080×1920・30fps・32秒）を、公開版のアプリを実際に操作して1コマずつ撮って作る。
// 3Dの走行は実時間の録画だと描画が間に合わずガクガクになるので、ページの時計（requestAnimationFrame・performance.now・Date.now）を
// 止めて、1/30秒ずつ進めては撮る。字幕・帯・タップの輪・終わりのカードは、別に撮った透明のコマを ffmpeg で重ねる。
//
// 使い方（リポジトリのルートで。アプリの公開版ビルドは、隣の car-360-public/dist-public/ を読むだけで、変えない）：
//   node day-083-car360/tools/promo/render-promo.mjs --frames-dir <作業用の場所>
//   --only hook,showroom,drive,finger,overlay   撮り直す場面だけ（場面の id S0〜S6 でも可）。ほかは前に撮ったコマを使う
//   --compose-only                               撮らずに、重ねと書き出しだけ
//   --audio <ファイル>                            BGM を付けた版も書き出す（長さは32秒に固定）
//   --app-dir <car-360-public の場所>            既定は、このリポジトリの隣の car-360-public
//   --hook-theme night|sunset・--hook-dir <名前>・--hook-lift <ガンマ,彩度|0>  出だしの別案を撮り比べる口（--no-compose で撮るだけ）
//   --hook-pick <コマ>                            出だし（S0）に使う、橋の走行の候補の何コマ目から使うか
import { chromium } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { guardPointerLock } from './pointerlock-guard.mjs';
import { BEAT, DURATION_SECONDS, END_CARD, SHOWROOM_CARS, STORYBOARD, TAPS, bar } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const output = join(here, 'output');
const FPS = 30, TOTAL = Math.round(DURATION_SECONDS * FPS);
const VIEW = { width: 540, height: 960 }, DPR = 2;
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const flag = name => process.argv.includes(name);
const appDir = resolve(arg('--app-dir', join(root, '..', 'car-360-public')));
const framesDir = resolve(arg('--frames-dir', join(output, 'frames')));
const audio = arg('--audio');
const font = process.env.PROMO_FONT || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
const port = Number(arg('--port', 4562));
const frameAt = seconds => Math.round(seconds * FPS);

// 撮る単位（テイク）と、最終の動画の何コマ目に置くか。S0 は橋の走行の候補を長めに撮り、いちばん気持ちいい区間を切り出す。
const TAKES = {
  hook: { scenes: ['S0'], from: 0, to: frameAt(bar(2)), candidates: 240 },
  showroom: { scenes: ['S1', 'S2', 'S3'], from: frameAt(bar(2)), to: frameAt(bar(7)) },
  drive: { scenes: ['S4a', 'S4b'], from: frameAt(bar(7)), to: frameAt(bar(12)) },
  finger: { scenes: ['S5'], from: frameAt(bar(12)), to: frameAt(bar(14)) },
};
// 候補のうち、主塔をくぐる約2秒前・157km/h から使う（速度の数字が上がりながら塔をくぐる。画を見て決めた）
const HOOK_PICK = Number(arg('--hook-pick', 48));
// 出だしの時間帯と、合成のときに S0 だけ掛ける持ち上げ（ガンマ,彩度。0 で掛けない）。2案を撮り比べて決めた（README）
// 夜＋持ち上げ（ガンマ1.22・彩度1.1）と夕暮れを1秒ごとに並べ、夕暮れにした：空と路面が明るく赤い車が際立つ。夜は持ち上げても青黒く沈む
const HOOK_THEME = arg('--hook-theme', 'sunset'), HOOK_DIR = arg('--hook-dir', 'hook');
const HOOK_LIFT = (arg('--hook-lift', '0') || '0').split(',').map(Number);
const RUNUP_FRAMES = 90;
// 指で運転（S5）の場所：PA へ戻るカーブの入口（街並み・大黒 PA の標識・高架が見えてくる）。夕暮れ。
// 直線の終わり（5,131m まで）まではアクセル（キー）で速度を乗せ、カーブはハンドルを指で切って曲がる
const FINGER = { theme: 'sunset', cruiseUntil: 4900, from: 5118, kmh: 100 };
// 夜のショット（24.0〜25.6秒）：車が暗く沈むので、合成のとき、車の周りだけをふんわり持ち上げる（街灯の光が当たったように）。
// 画面全体にガンマを掛けると、路面と空まで車以上に明るくなって霞み、夜に見えない（ガンマ1.3で試して、霞んで夜に見えなかった）。
// 追従視点では車は画面の同じ所にあるので、そこに柔らかい楕円の窓を掛ける。車は約2倍、路面は約1.2倍、空は変わらない（README）
const NIGHT_LIFT = { gamma: 1.5, saturation: 1.15, center: [540, 1165], radius: [330, 300], falloff: 1.6 };
// 出だしの2ショット目。場所はコースを試し撮りして選んだ（README）
const HOOK2 = { dir: 'hook2', theme: 'day', cruiseUntil: 4785, from: 4975, frames: frameAt(bar(2)) - frameAt(bar(1)) };
// 走行（S4）のショット：場所ごとのモンタージュ。lap は周回（コース 1周 ≒5.8km）。撮らずにシミュレーションを先へ進めて移る
//   PA 出発（夕暮れ）→ 高架へのランプ・合流の標識（夕暮れ）→ 港・大黒ふ頭の標識（昼）→ 橋へのカーブと標識（夕暮れ）→ 湾岸の直線・橋の標識（夜）
const DRIVE_SHOTS = [
  { at: bar(7), theme: 'sunset', place: 'PA 出発' },
  { at: bar(7) + 5 * BEAT, theme: 'sunset', place: '高架へのランプ', from: 640, keys: 120 },
  { at: bar(9.5), theme: 'day', place: '港・大黒ふ頭', from: 4030, cruise: true },
  { at: bar(9.5) + 4 * BEAT, theme: 'sunset', place: '橋へのカーブ', from: 2345, lap: 1, cruise: true },
  { at: bar(9.5) + 7 * BEAT, theme: 'night', place: '湾岸の直線', from: 1105, lap: 2, cruise: true },
];   // 走行は、アクセルを踏んでから約3秒は撮らずに進め、速度の乗った所から撮る
const only = (arg('--only', '') || '').split(',').filter(Boolean)
  .map(id => Object.keys(TAKES).find(take => take === id || TAKES[take].scenes.includes(id)) ?? (['S6', 'overlay'].includes(id) ? 'overlay' : id));
const wanted = take => !flag('--compose-only') && (!only.length || only.includes(take));

const SWATCHES = ['レッド', 'オレンジ'];      // ボディカラーのタップの順に押す色（TAPS の swatch の順）
const DRIVE_CAR = SHOWROOM_CARS.at(-1).key;  // ショールームの最後の車で、そのまま走る
const sleep = ms => new Promise(done => setTimeout(done, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---- ページの時計を止める（ページを開く前に入れる）。__promoFreeze で止め、__promoStep(ms) で進める。 ----
const CLOCK = `(() => {
  const realNow = performance.now.bind(performance), realRAF = requestAnimationFrame.bind(window), realDate = Date.now;
  let virt = null, queue = [], id = 1e6;
  const offset = realDate() - realNow();
  performance.now = () => virt ?? realNow();
  Date.now = () => virt === null ? realDate() : Math.round(offset + virt);
  window.requestAnimationFrame = cb => { if (virt === null) return realRAF(t => cb(virt ?? t)); queue.push(cb); return ++id; };
  window.__promoFreeze = () => { if (virt === null) virt = realNow(); return virt; };
  window.__promoStep = ms => { virt += ms; const q = queue; queue = []; for (const cb of q) cb(virt); return q.length; };
})();`;

// ---- 撮影の補助（ページの中）：描画の解像度、ショールームのカメラ、走行の値の読み出し。 ----
const HELPERS = () => {
  window.__promoRatio = () => {
    const r = window.__car.renderer;
    if (r.getPixelRatio() !== 2) { r.setPixelRatio(2); r.setSize(innerWidth, innerHeight, false); }
  };
  // いまのカメラの位置を基準（球面座標）にして、そこからの回転・高さ・距離の倍率で置く。時刻の関数で決めるので撮り直しても同じ絵になる。
  window.__promoBase = () => {
    const c = window.__car.camera, t = window.__car.controls.target, off = c.position.clone().sub(t), r = off.length();
    window.__base = { t: t.clone(), r, az: Math.atan2(off.x, off.z), pol: Math.acos(off.y / r) };
  };
  window.__promoCam = (dAz, dPol, scale) => {
    const b = window.__base, c = window.__car.camera, az = b.az + dAz, pol = Math.min(Math.max(b.pol + dPol, 0.2), 1.5), r = b.r * scale;
    c.position.set(b.t.x + r * Math.sin(pol) * Math.sin(az), b.t.y + r * Math.cos(pol), b.t.z + r * Math.sin(pol) * Math.cos(az));
    c.lookAt(b.t); window.__car.controls.update(); document.dispatchEvent(new Event('input'));
  };
  window.__promoState = () => {
    const s = window.__car.driveExperience?.state;
    return s && { speed: s.speed, distance: s.distance, lateral: s.lateral, headingError: s.headingError, gain: s.vehicle.steeringGain, wheelbase: s.vehicle.wheelbase, cruise: s.cruise, elapsed: s.elapsed };
  };
  window.__promoRect = selector => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; };
};

// ---- 走行の自動操縦（アプリのコースの形から、ハンドルの切れ角を出す P 制御）。 ----
const { sampleRoute } = await import(pathToFileURL(join(appDir, 'src/drive-state.mjs')).href);
function pilot(s, lane = 0) {
  const v = Math.max(1, s.speed), ahead = sampleRoute(s.distance + v * 0.35);
  const maxSteer = s.gain / (1 + (v / 12) ** 2);
  const angle = Math.atan(s.wheelbase * ahead.curvature) - 0.012 * (s.lateral - lane) - 0.5 * s.headingError;
  return Math.max(-1, Math.min(1, angle / maxSteer));
}

// ---- アプリの配信（公開版と同じヘッダー・404）とブラウザ。 ----
const stats = { blocked: [], warnings: [], driverNotes: 0, frames: {} };
function startServer() {
  const server = spawn(process.execPath, ['scripts/serve_public.mjs'], { cwd: appDir, env: { ...process.env, CAR_PUBLIC_PORT: String(port) }, stdio: 'ignore' });
  return server;
}
const base = `http://127.0.0.1:${port}`;
const launch = () => chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function openApp(browser, take) {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR, hasTouch: true, isMobile: true, locale: 'ja-JP', reducedMotion: 'no-preference' });
  await guardPointerLock(context);
  await context.addInitScript(CLOCK);
  await context.route('**/*', route => {
    const url = route.request().url();
    if (new URL(url).origin === base) return route.continue();
    stats.blocked.push(url); return route.abort();
  });
  const page = await context.newPage();
  page.on('console', message => {
    if (!['warning', 'error'].includes(message.type())) return;
    // 画面を撮るたびに、GPU の読み出しで描画が待ったという、ブラウザの描画系の性能の知らせ（アプリの警告ではない）
    if (/GL Driver Message .*GPU stall due to ReadPixels/.test(message.text())) { stats.driverNotes++; return; }
    stats.warnings.push(`${take}: ${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', error => stats.warnings.push(`${take}: pageerror: ${error.message}`));
  await page.goto(`${base}/`);
  const version = /POLICY_VERSION = '([^']+)'/.exec(readFileSync(join(appDir, 'public-site/consent.js'), 'utf8'))[1];
  await page.evaluate(v => localStorage.setItem('car360-public-consent', JSON.stringify({ version: v, at: new Date().toISOString() })), version);
  await page.goto(`${base}/drive/`);
  await page.waitForFunction(() => window.__car && document.querySelector('#btn-city') && !document.querySelector('#btn-city').disabled, null, { timeout: 90000 });
  await page.evaluate(HELPERS);
  await page.evaluate(() => { window.__promoRatio(); window.__promoFreeze(); });
  await settle(page);
  return { context, page };
}
const settle = (page, n = 2) => page.evaluate(n => { for (let i = 0; i < n; i++) window.__promoStep(0); window.__promoRatio(); }, n);
const step = (page, n = 1) => page.evaluate(n => { for (let i = 0; i < n; i++) { window.__promoRatio(); window.__promoStep(1000 / 30); } }, n);
const click = (page, selector) => page.evaluate(s => { const el = document.querySelector(s); if (!el) throw new Error(`見つからない: ${s}`); el.click(); }, selector);
const rect = (page, selector) => page.evaluate(s => window.__promoRect(s), selector);
async function waitFor(page, fn, arg, label, timeout = 90000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await page.evaluate(fn, arg)) return; await page.evaluate(() => window.__promoStep(0)); await sleep(120); }
  throw new Error(`待ちきれない: ${label}`);
}
const carReady = (page, key) => waitFor(page, k => window.__car.app.preset === k && window.__car.app.car?.userData?.spec === window.__car.PRESETS[k] && !document.getElementById('btn-city').disabled, key, `車 ${key}`);
const driveReady = page => waitFor(page, () => window.__car.driveExperience?.active && window.__car.driveExperience?.world?.materials?.assets?.loaded === 6, null, '走行画面');

function takeDir(take, clean) {
  const dir = join(framesDir, take);
  if (clean) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}
async function shoot(page, dir, index) {
  await page.screenshot({ path: join(dir, `f${String(index).padStart(5, '0')}.png`), type: 'png', timeout: 120000 });
}
const ease = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const lerp = (a, b, u) => a + (b - a) * u;

// ---- ショールーム（S1〜S3）と、そのまま走行（S4）。同じページで続けて撮る（車・色を引き継ぐため）。 ----
async function shootShowroomAndDrive(browser) {
  const { context, page } = await openApp(browser, 'showroom');
  const events = { taps: [], fingers: [], hud: [] };
  try {
    if (wanted('showroom')) {
      const dir = takeDir('showroom', true), { from, to } = TAKES.showroom;
      const swatchTaps = TAPS.filter(tap => tap.kind === 'swatch');
      const tapAt = Object.fromEntries(TAPS.map(tap => [frameAt(tap.at), tap]));
      // 場面ごとのカメラ。基準からの回転（rad）・高さ・距離の倍率。車が替わった瞬間は少し引いていて、すっと寄る（切り替えの気持ちよさ）。
      // 寄った状態から始めると、縦長の画面では車の端が切れる（1回目の撮影で確認）。
      let segment = { from: bar(2), az: [-0.3, 0.15], pol: 0.03, kick: 0.14 };
      const camAt = t => {
        const u = (t - segment.from) / (segment.to - segment.from), kick = 1 + segment.kick * Math.exp(-(t - segment.from) / 0.3);
        return [lerp(segment.az[0], segment.az[1], u), segment.pol + (segment.dPol ?? 0) * ease(u), (segment.scale ? lerp(segment.scale[0], segment.scale[1], u ** 2.2) : 1) * kick];
      };
      segment.to = bar(3) + 0.05;
      await page.evaluate(() => window.__promoBase());
      for (let g = from; g < to; g++) {
        const t = g / FPS, tap = tapAt[g];
        if (g === frameAt(bar(5))) {        // S2：ドアと色。詳細を開き、ドアの見える斜め前へ
          await page.evaluate(() => { document.getElementById('viewer-tools').open = true; });
          await settle(page);
          await page.evaluate(() => { window.__car.fitToScreen(); window.__promoBase(); });
          segment = { from: bar(5), to: bar(6), az: [-0.62, -0.42], pol: 0.02, scale: [1.42, 1.32], kick: 0.08 };
        }
        if (g === frameAt(bar(6))) {        // S3：走り出す。詳細を閉じ、ドアを閉め、低い位置から車へ迫る
          await page.evaluate(() => { document.getElementById('viewer-tools').open = false; if (window.__car.app.doorsOpen) window.__car.toggleDoors(); });
          await settle(page);
          await page.evaluate(() => { window.__car.fitToScreen(); window.__promoBase(); });
          segment = { from: bar(6), to: bar(7), az: [0.3, -0.1], pol: 0.0, dPol: 0.14, scale: [0.95, 0.62], kick: 0 };
        }
        if (tap) {
          const target = tap.kind === 'chip' ? `[data-preset="${tap.target}"]` : tap.kind === 'doors' ? '#btn-doors'
            : tap.kind === 'swatch' ? `#colors [aria-label="${SWATCHES[swatchTaps.indexOf(tap)]}"]` : tap.kind === 'drive' ? '#btn-city' : null;
          if (target) {
            const at = await rect(page, target);
            events.taps.push({ frame: g, kind: tap.kind, x: at.x, y: at.y, w: at.w, h: at.h });
            // 「ドライブを始める」は、この場面では輪だけ（押すと読み込みが始まるので、走行のテイクの頭で本当に押す）
            if (tap.kind !== 'drive') await click(page, target);
            if (tap.kind === 'chip') {
              await carReady(page, tap.target);
              await settle(page);
              await page.evaluate(() => { window.__car.fitToScreen(); window.__promoBase(); });
              const next = SHOWROOM_CARS.find(car => car.key === tap.target);
              segment = { from: t, to: next.end, az: [-0.3, 0.15], pol: 0.03, kick: 0.16 };
            }
          }
        }
        await page.evaluate(([az, pol, scale]) => window.__promoCam(az, pol, scale), camAt(t));
        await step(page);
        await shoot(page, dir, g - from);
        if ((g - from) % 60 === 0) log('showroom', g - from, '/', to - from);
      }
      stats.frames.showroom = to - from;
      writeFileSync(join(dir, 'events.json'), JSON.stringify(events, null, 1));
    } else {
      // 走行だけ撮り直すときも、同じ車・色で始める（ショールームの操作を、撮らずに同じ順で行う）
      await click(page, `[data-preset="${DRIVE_CAR}"]`); await carReady(page, DRIVE_CAR);
      for (const name of SWATCHES) await click(page, `#colors [aria-label="${name}"]`);
    }

    if (wanted('drive')) {
      const dir = takeDir('drive', true), { from, to } = TAKES.drive, driveEvents = { taps: [], fingers: [], hud: [] };
      await click(page, '#btn-city');                 // 実際に「ドライブを始める」を押す
      await driveReady(page);
      await settle(page);
      await click(page, '#drive-guide-close');
      await click(page, '#drive-detail-toggle');      // 地図と詳しいメーターを出す
      await click(page, '[data-drive-camera="chase"]');
      await step(page, 24);                            // 視点の切り替えが落ち着くまで（車は止まったまま）
      // ボンネット視点は使わない（画面の下3分の1が塞がり、車の後ろ姿が見えなくなる）。
      // ショットの頭で、撮らずに次の場所まで進め（クルーズかキーのアクセル）、時間帯を切り替える
      const ROUTE = 5807.96;   // コース1周の長さ（drive-state.mjs の ROUTE_LENGTH と同じ）
      const cuts = Object.fromEntries(DRIVE_SHOTS.slice(1).map(shot => [frameAt(shot.at), async () => {
        await steer.release();
        const until = (shot.lap ?? 0) * ROUTE + shot.from;
        if (shot.cruise) {
          await page.keyboard.up('KeyW');
          if (!(await page.evaluate(() => window.__promoState())).cruise) await click(page, '#drive-cruise');
          await fastForward(page, until, { cruise: true });
        } else {
          await fastForward(page, until, { targetKmh: shot.keys });
          await page.keyboard.down('KeyW');   // ショットの間は踏み続ける
        }
        await click(page, `[data-drive-theme="${shot.theme}"]`);
        await click(page, '#drive-guide-close');
      }]));
      // 走り出しは、アクセルを踏んでから撮らずに約3秒進め、速度の乗った所から撮る（ドロップの頭で 0km/h だと山にならない）
      await page.keyboard.down('KeyW');
      await step(page, RUNUP_FRAMES);
      const steer = await wheelSteer(context, page), start = await page.evaluate(() => window.__promoState());
      // PA 出発のショットで、左の車線へゆるく移る（壁に寄らない範囲）
      const laneAt = t => lerp(0, -3.4, ease((t - (bar(7) + 1.0)) / 1.4));
      const shotOf = g => DRIVE_SHOTS.findLast(shot => g >= frameAt(shot.at)), perShot = new Map();
      for (let g = from; g < to; g++) {
        if (cuts[g]) await cuts[g]();
        if (shotOf(g) === DRIVE_SHOTS[0]) await steer.to(laneAt(g / FPS));
        await step(page);
        await shoot(page, dir, g - from);
        const s = await page.evaluate(() => window.__promoState());
        driveEvents.hud.push({ frame: g, kmh: Math.round(s.speed * 3.6), distance: Math.round(s.distance) });
        if (!perShot.has(shotOf(g))) perShot.set(shotOf(g), []); perShot.get(shotOf(g)).push(s);
        if ((g - from) % 60 === 0) log('drive', g - from, '/', to - from, `${Math.round(s.speed * 3.6)}km/h`, `${Math.round(s.distance)}m`);
      }
      await page.keyboard.up('KeyW'); await steer.release();
      const end = driveEvents.hud.at(-1);
      stats.drive = { firstKmh: driveEvents.hud[0].kmh, lastKmh: end.kmh, start: Math.round(start.distance),
        shots: DRIVE_SHOTS.map(shot => ({ place: shot.place, ...shotStats(perShot.get(shot), shot.theme) })) };
      log('drive', JSON.stringify(stats.drive));
      stats.frames.drive = to - from;
      writeFileSync(join(dir, 'events.json'), JSON.stringify(driveEvents, null, 1));
    }
  } finally { await context.close(); }
}

// ---- 走行をコマを撮らずに先へ進める（描画を止めて計算だけ）。クルーズ（アプリの補助）か、キーのアクセルで。 ----
async function fastForward(page, untilDistance, { cruise = false, targetKmh = 0 } = {}) {
  await page.evaluate(() => { const r = window.__car.renderer; r.__render = r.render; r.render = () => {}; });
  let held = false;
  for (let i = 0; i < 40000; i++) {
    const s = await page.evaluate(() => window.__promoState());
    if (s.distance >= untilDistance) break;
    if (!cruise) {
      const want = s.speed * 3.6 < targetKmh;
      if (want !== held) { held = want; await (want ? page.keyboard.down('KeyW') : page.keyboard.up('KeyW')); }
    }
    await page.evaluate(n => { for (let k = 0; k < n; k++) window.__promoStep(1000 / 30); }, untilDistance - s.distance > 60 ? 8 : 1);
  }
  await page.evaluate(() => { const r = window.__car.renderer; r.render = r.__render; });
  return held;
}
async function holdSpeed(page, held, kmh) {
  const s = await page.evaluate(() => window.__promoState());
  const want = s.speed * 3.6 < kmh;
  if (want !== held) await (want ? page.keyboard.down('KeyW') : page.keyboard.up('KeyW'));
  return want;
}

// 画面のハンドルを指（タッチ）で押さえたまま、コースの形に合わせて左右に動かす。lane は道の中心からの横の位置（m、右が＋）。
async function wheelSteer(context, page) {
  const cdp = await context.newCDPSession(page);
  const wheel = await rect(page, '#drive-wheel'), travel = wheel.w * 0.75;
  let down = false;
  const send = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: wheel.y, id: 7, radiusX: 9, radiusY: 9, force: 1 }] });
  return {
    async to(lane) { const s = await page.evaluate(() => window.__promoState()); await send(down ? 'touchMove' : 'touchStart', wheel.x + pilot(s, lane) * travel); down = true; },
    async release() { if (down) await send('touchEnd'); down = false; },
  };
}
const shotStats = (states, theme) => ({ theme, distance: [Math.round(states[0].distance), Math.round(states.at(-1).distance)],
  kmh: [Math.round(states[0].speed * 3.6), Math.round(states.at(-1).speed * 3.6)], maxLateral: +Math.max(...states.map(s => Math.abs(s.lateral))).toFixed(2),
  maxCurvature: curvature(states[0].distance, states.at(-1).distance) });
// 撮る範囲のコースの曲がり（曲率の最大）を記録する（直線なら 0）
const curvature = (d0, d1) => { let max = 0; for (let d = d0; d <= d1; d += 2) max = Math.max(max, Math.abs(sampleRoute(d).curvature)); return max; };

// ---- 出だし（S0）：夕暮れの橋を、追従視点で速く（時間帯は --hook-theme）。候補を長めに撮って、あとで切り出す。 ----
async function shootHook(browser) {
  const { context, page } = await openApp(browser, 'hook');
  try {
    const dir = takeDir(HOOK_DIR, true);
    await click(page, `#colors [aria-label="${SWATCHES[0]}"]`);
    await click(page, '#btn-city'); await driveReady(page); await settle(page);
    await click(page, '#drive-detail-toggle');
    await click(page, `[data-drive-theme="${HOOK_THEME}"]`);
    await click(page, '[data-drive-camera="chase"]');
    await click(page, '#drive-cruise');                       // 橋の手前までは、アプリのクルーズで走る（撮らない）
    await fastForward(page, 2606, { cruise: true });
    let held = await fastForward(page, 2700, { targetKmh: 165 });   // 橋の直線でアクセル（キー）を踏み、速度を出しておく
    await click(page, '#drive-guide-close');
    await step(page, 2);
    const steer = await wheelSteer(context, page), d0 = (await page.evaluate(() => window.__promoState())).distance;
    for (let i = 0; i < TAKES.hook.candidates; i++) {
      held = await holdSpeed(page, held, 165);
      // 使う区間（HOOK_PICK から4.27秒）の中ほどで、右の車線へゆるく移る（横の動きを足す）
      await steer.to(lerp(0, 3.4, ease((i - HOOK_PICK - 20) / 50)));
      await step(page);
      await shoot(page, dir, i);
      if (i % 60 === 0) { const s = await page.evaluate(() => window.__promoState()); log('hook', i, `${Math.round(s.speed * 3.6)}km/h`, `${Math.round(s.distance)}m`); }
    }
    await steer.release();
    const d1 = (await page.evaluate(() => window.__promoState())).distance;
    stats.hook = { theme: HOOK_THEME, dir: HOOK_DIR, distance: [Math.round(d0), Math.round(d1)], maxCurvature: curvature(d0, d1) };
    // 出だしの2ショット目（2.133秒から）：別の場所・別の時間帯。橋を渡りきった先の直線（街並みが見える所）を、昼に速く。
    // カーブはアプリのクルーズで抜け（撮らない）、直線に入ってからアクセル（キー）で速度を上げる
    const dir2 = takeDir(HOOK2.dir, true);
    if (held) await page.keyboard.up('KeyW');
    await click(page, '#drive-cruise');
    await fastForward(page, HOOK2.cruiseUntil, { cruise: true });
    held = await fastForward(page, HOOK2.from, { targetKmh: 165 });
    await click(page, `[data-drive-theme="${HOOK2.theme}"]`);
    await click(page, '#drive-guide-close');
    const shot = [];
    for (let i = 0; i < HOOK2.frames; i++) {
      held = await holdSpeed(page, held, 165);
      await step(page);
      await shoot(page, dir2, i);
      shot.push(await page.evaluate(() => window.__promoState()));
    }
    stats.hook2 = shotStats(shot, HOOK2.theme);
    log('hook2', JSON.stringify(stats.hook2));
    stats.frames.hook = TAKES.hook.candidates;
  } finally { await context.close(); }
}

// ---- 指で運転（S5）：画面のハンドルとアクセルを、指（タッチ）で操作する。カーブで実際にハンドルを切る。 ----
async function shootFinger(browser) {
  const { context, page } = await openApp(browser, 'finger');
  try {
    const dir = takeDir('finger', true), { from, to } = TAKES.finger, events = { taps: [], fingers: [], hud: [] };
    await click(page, `[data-preset="${DRIVE_CAR}"]`); await carReady(page, DRIVE_CAR);
    await click(page, `#colors [aria-label="${SWATCHES.at(-1)}"]`);
    await click(page, '#btn-city'); await driveReady(page); await settle(page);
    await click(page, '[data-drive-camera="chase"]');
    await click(page, `[data-drive-theme="${FINGER.theme}"]`);
    await click(page, '#drive-cruise');
    await fastForward(page, FINGER.cruiseUntil, { cruise: true });
    await click(page, '#drive-cruise');                       // 手動へ（ここからはアクセルを自分で）
    let held = await fastForward(page, FINGER.from, { targetKmh: FINGER.kmh });
    if (held) await page.keyboard.up('KeyW');
    await click(page, '#drive-guide-close');
    const cdp = await context.newCDPSession(page);
    const wheel = await rect(page, '#drive-wheel'), pedal = await rect(page, '[data-drive-input="throttle"]');
    const travel = wheel.w * 0.75;                            // アプリの湾岸コースの、ハンドルの振れ幅（drive-experience.js と同じ）
    const tapWheel = TAPS.find(tap => tap.kind === 'wheel'), tapPedal = TAPS.find(tap => tap.kind === 'pedal');
    const touches = new Map();
    const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, p]) => ({ x: p.x, y: p.y, id, radiusX: 9, radiusY: 9, force: 1 })) });
    for (let g = from; g < to; g++) {
      const t = g / FPS;
      if (g === frameAt(tapWheel.at)) { touches.set(1, { x: wheel.x, y: wheel.y }); await send('touchStart', [...touches]); events.taps.push({ frame: g, kind: 'wheel', x: wheel.x, y: wheel.y }); }
      if (g === frameAt(tapPedal.at)) { touches.set(2, { x: pedal.x, y: pedal.y }); await send('touchStart', [...touches]); events.taps.push({ frame: g, kind: 'pedal', x: pedal.x, y: pedal.y }); }
      if (touches.has(1)) {
        const s = await page.evaluate(() => window.__promoState());
        // 右の車線へ移ってから、カーブを曲がる（ハンドルの動きを見せる）
        const lane = lerp(0, 3.4, ease((t - (tapWheel.at + 0.25)) / 1.1));
        touches.set(1, { x: wheel.x + pilot(s, lane) * travel, y: wheel.y });
        await send('touchMove', [...touches]);
      }
      await step(page);
      await shoot(page, dir, g - from);
      const s = await page.evaluate(() => window.__promoState());
      events.fingers.push({ frame: g, points: [...touches.values()].map(p => ({ x: p.x, y: p.y })) });
      events.hud.push({ frame: g, kmh: Math.round(s.speed * 3.6), distance: Math.round(s.distance), lateral: +s.lateral.toFixed(2) });
      if ((g - from) % 30 === 0) log('finger', g - from, `${Math.round(s.speed * 3.6)}km/h`, `${Math.round(s.distance)}m`, `lat ${s.lateral.toFixed(2)}`);
    }
    await send('touchEnd', []);
    stats.frames.finger = to - from;
    writeFileSync(join(dir, 'events.json'), JSON.stringify(events, null, 1));
  } finally { await context.close(); }
}

// ---- 重ねるもの（帯・字幕・注記・進行バー・閃光・タップの輪・終わりのカード）を、透明のコマで撮る。 ----
async function shootOverlay(browser) {
  const dir = takeDir('overlay', true);
  const events = ['showroom', 'drive', 'finger'].flatMap(take => {
    const file = join(framesDir, take, 'events.json');
    return existsSync(file) ? [JSON.parse(readFileSync(file, 'utf8'))] : [];
  });
  const taps = events.flatMap(e => e.taps), fingers = Object.fromEntries(events.flatMap(e => e.fingers).map(f => [f.frame, f.points]));
  const endBackground = join(framesDir, 'finger', `f${String(TAKES.finger.to - TAKES.finger.from - 1).padStart(5, '0')}.png`);
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR });
  const page = await context.newPage();
  await page.route('**/*', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: overlayHtml() });
    if (path === '/font.ttf') return route.fulfill({ contentType: 'font/ttf', body: readFileSync(font) });
    if (path === '/end.png') return route.fulfill({ contentType: 'image/png', body: readFileSync(endBackground) });
    stats.blocked.push(route.request().url()); return route.abort();
  });
  await page.goto('http://promo.local/');
  await page.evaluate(async () => { await document.fonts.load('700 30px Promo'); await document.fonts.ready; await new Promise(done => { const img = document.querySelector('.end-bg'); img.complete ? done() : img.onload = done; }); });
  await page.evaluate(data => window.__setup(data), { storyboard: STORYBOARD, taps, fingers, end: END_CARD, flashes: FLASHES, total: TOTAL, fps: FPS });
  for (let f = 0; f < TOTAL; f++) {
    await page.evaluate(f => window.__frame(f), f);
    await page.screenshot({ path: join(dir, `o${String(f).padStart(5, '0')}.png`), omitBackground: true });
  }
  stats.frames.overlay = TOTAL;
  await context.close();
}

// 閃光（場面の切り替えの気持ちよさ）：[秒, 強さ, 前に立ち上がる秒]
const FLASHES = [
  [bar(1), 0.3, 0], [bar(7) + 5 * BEAT, 0.3, 0],   // 出だしと走行の、場所の切り替え
  [bar(2), 0.35, 0], [bar(3) + 0.05, 0.5, 0], [bar(4) + 0.05, 0.5, 0], [bar(5), 0.22, 0], [bar(6), 0.22, 0],
  [bar(7), 0.95, 0.12], [bar(9.5), 0.4, 0], [bar(9.5) + 4 * BEAT, 0.35, 0], [bar(9.5) + 7 * BEAT, 0.35, 0], [bar(12), 0.3, 0], [bar(14), 0.45, 0],
];

function overlayHtml() {
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><style>
  @font-face { font-family: Promo; src: url(/font.ttf); font-weight: 700; }
  :root { --ink: #f4f7fb; --accent: #dcebb3; --navy: #0b1020; }
  html, body { margin: 0; width: 540px; height: 960px; overflow: hidden; background: transparent; font-family: Promo, sans-serif; color: var(--ink); }
  .top { position: absolute; left: 0; right: 0; top: 0; height: 62px; background: var(--navy); border-bottom: 1px solid #dcebb32e; display: flex; align-items: center; justify-content: space-between; padding: 0 18px; box-sizing: border-box; }
  .brand { display: flex; align-items: center; gap: 10px; font-size: 22px; letter-spacing: .06em; }
  .brand i { width: 22px; height: 22px; border: 2.5px solid var(--accent); border-radius: 50%; box-sizing: border-box; position: relative; }
  .brand i::after { content: ''; position: absolute; right: -4px; top: 6px; border: 4px solid transparent; border-top-color: var(--accent); transform: rotate(-35deg); }
  .day { font-size: 11px; letter-spacing: .18em; color: var(--accent); border: 1px solid #dcebb380; padding: 7px 11px; border-radius: 20px; }
  .cap { position: absolute; left: 14px; right: 14px; text-align: center; }
  .cap span { display: inline-block; font-size: 33px; line-height: 1.22; font-weight: 700; letter-spacing: .03em; padding: 3px 14px 6px; margin: 3px 0; border-radius: 8px;
    background: rgba(9, 13, 25, .74); text-shadow: 0 2px 10px rgba(0,0,0,.6); }
  .cap span:last-child { color: var(--accent); }
  .foot { position: absolute; left: 0; right: 0; bottom: 0; height: 18px; background: linear-gradient(#0b102000, #0b1020d9 45%); font-size: 9.5px; line-height: 1; color: #cbd5e1; text-align: center; padding-top: 4px; box-sizing: border-box; letter-spacing: .01em; }
  .bar { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--accent); }
  .flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
  /* 黄緑のボタン（ドライブを始める）の上でも見えるよう、白い輪＋紺のふち */
  .tap { position: absolute; width: 64px; height: 64px; margin: -32px; border-radius: 50%; border: 3.5px solid #fff; background: rgba(255,255,255,.28); box-shadow: 0 0 0 3px rgba(11,16,32,.7), 0 0 18px rgba(11,16,32,.5); box-sizing: border-box; opacity: 0; }
  .finger { position: absolute; width: 76px; height: 76px; margin: -38px; border-radius: 50%; background: rgba(255,255,255,.38); border: 2.5px solid rgba(255,255,255,.95); box-shadow: 0 0 0 7px rgba(220,235,179,.28), 0 4px 18px rgba(0,0,0,.35); box-sizing: border-box; display: none; }
  .end { position: absolute; inset: 0; display: none; overflow: hidden; background: var(--navy); }
  .end-bg { position: absolute; inset: -40px; width: calc(100% + 80px); height: calc(100% + 80px); object-fit: cover; filter: blur(16px) brightness(.42) saturate(1.1); }
  .end-shade { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 40%, #0b102055, #0b1020e6 75%); }
  .end-body { position: absolute; left: 0; right: 0; top: 190px; text-align: center; }
  .end-body > * { opacity: 0; }
  .end .pill { display: inline-block; font-size: 13px; letter-spacing: .2em; color: var(--accent); border: 1px solid #dcebb390; padding: 8px 15px; border-radius: 30px; }
  .end h1 { font-size: 74px; letter-spacing: .06em; margin: 26px 0 10px; font-weight: 700; color: #fff; text-shadow: 0 6px 30px rgba(0,0,0,.5); }
  .end .sub { font-size: 25px; margin: 0 0 34px; color: #e2e8f0; }
  .end .badges { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; padding: 0 20px; }
  .end .badges b { font-size: 17px; font-weight: 700; padding: 10px 16px; border-radius: 30px; border: 1.5px solid #ffffff70; background: #0b102099; }
  .end .badges b:first-child { background: var(--accent); color: #0b1020; border-color: var(--accent); }
  .end .url { margin: 44px auto 0; display: inline-block; font-size: 27px; letter-spacing: .02em; color: #0b1020; background: #f4f7fb; padding: 14px 26px; border-radius: 14px; }
  .end .note { position: absolute; left: 30px; right: 30px; bottom: 34px; font-size: 11px; line-height: 1.7; color: #94a3b8; text-align: center; opacity: 0; }
  </style>
  <div class="top"><div class="brand"><i></i><span class="brand-name"></span></div><div class="day"></div></div>
  <div class="cap"></div>
  <div class="taps"></div>
  <div class="fingers"></div>
  <div class="foot">車の3Dモデルは第三者の作品（CC BY 4.0）。メーカーとは無関係です。</div>
  <div class="bar"></div>
  <div class="end"><img class="end-bg" src="/end.png" alt=""><div class="end-shade"></div>
    <div class="end-body"><div class="pill end-day"></div><h1 class="end-title"></h1><p class="sub end-sub"></p><div class="badges end-badges"></div><div><span class="url end-url"></span></div></div>
    <p class="note end-note"></p></div>
  <div class="flash"></div>
  <script>
  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), easeOut = u => 1 - (1 - clamp(u, 0, 1)) ** 3;
  let D, current = null;
  // 字幕の高さ：ショールーム（S1〜S3）は車と操作パネルの間、走行は車の下（ハンドル・ペダルの上）
  // S2 は詳細パネルが開いてパネルの上端が上がるので、3Dの表示面の上側の空き地（上の帯と車の間）へ置く
  const CAPTION_BOTTOM = { S1: 424, S2: 780, S3: 424 }, DRIVE_BOTTOM = 172;
  window.__setup = data => {
    D = data;
    $('.brand-name').textContent = data.end.title; $('.day').textContent = data.end.day;
    $('.end-day').textContent = data.end.day; $('.end-title').textContent = data.end.title; $('.end-sub').textContent = data.end.sub;
    $('.end-badges').replaceChildren(...data.end.badges.map(text => Object.assign(document.createElement('b'), { textContent: text })));
    $('.end-url').textContent = data.end.url + ' ↗'; $('.end-note').textContent = data.end.note;
    $('.taps').replaceChildren(...data.taps.map(tap => { const el = document.createElement('div'); el.className = 'tap'; el.style.left = tap.x + 'px'; el.style.top = tap.y + 'px'; return el; }));
  };
  window.__frame = f => {
    const t = f / D.fps, scene = D.storyboard.findLast(s => t >= s.start - 1e-6) ?? D.storyboard[0];
    $('.bar').style.width = (100 * (f + 1) / D.total) + '%';
    if (current !== scene.id) {
      current = scene.id;
      $('.cap').replaceChildren(...scene.lines.map(text => Object.assign(document.createElement('span'), { textContent: text })).flatMap((el, i, all) => i < all.length - 1 ? [el, document.createElement('br')] : [el]));
      $('.cap').style.bottom = (CAPTION_BOTTOM[scene.id] ?? DRIVE_BOTTOM) + 'px';
    }
    const age = t - scene.start + (scene.id === 'S0' ? 0.3 : 0);   // S0 は1コマ目から字幕が見えている（Xの1コマ目の画像）
    [...$('.cap').querySelectorAll('span')].forEach((el, i) => { const u = easeOut((age - i * 0.08) / 0.22); el.style.opacity = u; el.style.transform = 'translateY(' + ((1 - u) * 22) + 'px)'; });
    let flash = 0;
    for (const [at, strength, lead] of D.flashes) {
      const dt = t - at;
      if (dt >= 0) flash = Math.max(flash, strength * Math.exp(-dt / 0.16));
      else if (lead && dt > -lead) flash = Math.max(flash, strength * (1 + dt / lead) ** 2);
    }
    $('.flash').style.opacity = flash;
    [...$('.taps').children].forEach((el, i) => { const dt = (f - D.taps[i].frame) / D.fps; const on = dt >= -0.07 && dt < 0.55; const u = clamp((dt + 0.07) / 0.6, 0, 1);
      el.style.opacity = on ? (dt < 0 ? 0.6 : 1 - u ** 1.5) : 0; el.style.transform = 'scale(' + (dt < 0 ? 0.55 : 0.6 + u * 0.9) + ')'; });
    const pts = D.fingers[f] || [];
    $('.fingers').replaceChildren(...pts.map(p => { const el = document.createElement('div'); el.className = 'finger'; el.style.display = 'block'; el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; return el; }));
    const endAt = D.storyboard.find(s => s.id === 'S6').start, end = t >= endAt - 1e-6;
    $('.end').style.display = end ? 'block' : 'none';
    for (const el of [$('.top'), $('.cap'), $('.foot')]) el.style.visibility = end ? 'hidden' : 'visible';
    if (end) {
      const e = t - endAt;
      [...$('.end-body').children].forEach((el, i) => { const u = easeOut((e - i * 0.09) / 0.32); el.style.opacity = u; el.style.transform = 'translateY(' + ((1 - u) * 26) + 'px)'; });
      $('.end-note').style.opacity = easeOut((e - 0.5) / 0.4);
      $('.end-bg').style.transform = 'scale(' + (1.04 + e * 0.02) + ')';
    }
  };
  </script></html>`;
}

// ---- つなぐ：撮ったコマを最終の順に並べ、重ねて書き出す。 ----
function compose() {
  const seq = join(framesDir, 'seq');
  rmSync(seq, { recursive: true, force: true }); mkdirSync(seq, { recursive: true });
  const source = g => {
    if (g < frameAt(bar(1))) return join(framesDir, HOOK_DIR, `f${String(HOOK_PICK + g).padStart(5, '0')}.png`);
    if (g < TAKES.hook.to) return join(framesDir, HOOK2.dir, `f${String(g - frameAt(bar(1))).padStart(5, '0')}.png`);
    for (const take of ['showroom', 'drive', 'finger']) if (g >= TAKES[take].from && g < TAKES[take].to) return join(framesDir, take, `f${String(g - TAKES[take].from).padStart(5, '0')}.png`);
    return join(framesDir, 'finger', `f${String(TAKES.finger.to - TAKES.finger.from - 1).padStart(5, '0')}.png`);   // S6 の下地（上に終わりのカードが乗る）
  };
  for (let g = 0; g < TOTAL; g++) {
    const file = source(g);
    if (!existsSync(file)) throw new Error(`コマがありません: ${file}（先にそのテイクを撮る）`);
    symlinkSync(file, join(seq, `r${String(g).padStart(5, '0')}.png`));
  }
  mkdirSync(output, { recursive: true });
  // 夜の持ち上げの窓：車の周りの柔らかい楕円（中心が白・縁へなだらかに黒）。ffmpeg の geq で作る（外部の画像は使わない）
  const { gamma, saturation, center: [cx, cy], radius: [rx, ry], falloff } = NIGHT_LIFT;
  const nightMask = join(framesDir, 'night-mask.png'), nightFrom = bar(9.5) + 7 * BEAT, nightTo = bar(12);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
    `color=c=black:s=1080x1920,format=gray,geq=lum='255*exp(-pow(pow((X-${cx})/${rx},2)+pow((Y-${cy})/${ry},2),${falloff}))'`, '-frames:v', '1', nightMask]);
  const encode = (out, withAudio) => execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'warning', '-y',
    '-framerate', String(FPS), '-i', join(seq, 'r%05d.png'),
    '-framerate', String(FPS), '-i', join(framesDir, 'overlay', 'o%05d.png'),
    '-loop', '1', '-framerate', String(FPS), '-t', String(DURATION_SECONDS), '-i', nightMask,
    ...(withAudio ? ['-i', audio] : []),
    '-filter_complex', `[0:v]scale=1080:1920:flags=lanczos,setsar=1${HOOK_LIFT[0] ? `,eq=gamma=${HOOK_LIFT[0]}:saturation=${HOOK_LIFT[1]}:enable='lt(t,${bar(2)})'` : ''},split=2[base][raw];[raw]eq=gamma=${gamma}:saturation=${saturation}[lift];[2:v]format=gray[mk];[lift][mk]alphamerge[la];[base][la]overlay=0:0:format=auto:enable='between(t,${nightFrom},${nightTo})'[b];[b][1:v]overlay=0:0:format=auto,format=yuv420p[v]`,
    '-map', '[v]', ...(withAudio ? ['-map', '3:a:0', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-af', `apad=whole_dur=${DURATION_SECONDS}`] : []),
    '-t', String(DURATION_SECONDS), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-map_metadata', '-1', out,
  ], { stdio: 'inherit' });
  const silent = join(output, 'Day083_car360_promo_silent.mp4');
  encode(silent, false);
  const outputs = [silent];
  if (audio) { const voiced = join(output, 'Day083_car360_promo.mp4'); encode(voiced, true); outputs.push(voiced); }
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', silent, '-frames:v', '1', '-map_metadata', '-1', join(output, 'first-frame.png')]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', silent, '-vf', 'fps=1,scale=270:480,tile=8x4:padding=6:color=0x0b1020', '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', join(output, 'contact-sheet.jpg')]);
  for (const file of outputs) {
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
    const v = probe.streams.find(s => s.codec_type === 'video'), a = probe.streams.find(s => s.codec_type === 'audio');
    const ok = v.width === 1080 && v.height === 1920 && v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && v.r_frame_rate === '30/1'
      && Math.abs(Number(probe.format.duration) - DURATION_SECONDS) <= 0.05 && (file === silent ? !a : a?.codec_name === 'aac');
    log(ok ? '検査OK' : '検査NG', file.slice(output.length + 1), `${v.width}x${v.height}`, v.codec_name, v.pix_fmt, v.r_frame_rate, `${Number(probe.format.duration).toFixed(3)}s`, a ? a.codec_name : '音なし');
    if (!ok) throw new Error(`出力が仕様と違います: ${file}`);
  }
}

// ---- 実行 ----
mkdirSync(framesDir, { recursive: true });
const started = Date.now();
const needApp = ['hook', 'showroom', 'drive', 'finger'].some(wanted);
const server = needApp ? startServer() : null;
const browsers = [];
try {
  if (needApp) for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/index.html`)).ok) break; } catch { /* 起動待ち */ } await sleep(200); }
  const lanes = [];
  if (wanted('showroom') || wanted('drive')) lanes.push(launch().then(b => { browsers.push(b); return shootShowroomAndDrive(b); }));
  if (wanted('hook') || wanted('finger')) lanes.push(launch().then(async b => { browsers.push(b); if (wanted('hook')) await shootHook(b); if (wanted('finger')) await shootFinger(b); }));
  await Promise.all(lanes);
  if (!flag('--no-compose')) {   // --no-compose：撮るだけ（出だしの別案を撮り比べるときなど）
    if (!flag('--compose-only') && (!only.length || only.includes('overlay') || needApp)) { const b = await launch(); browsers.push(b); await shootOverlay(b); }
    compose();
  }
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  server?.kill();
}
const size = dir => readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => sum + (e.isDirectory() ? size(join(dir, e.name)) : e.isFile() ? statSync(join(dir, e.name)).size : 0), 0);
const report = { seconds: DURATION_SECONDS, fps: FPS, width: 1080, height: 1920, capture: `CSS ${VIEW.width}×${VIEW.height}・DPR ${DPR}・描画の解像度 2`, hookPick: HOOK_PICK, hookTheme: HOOK_THEME, hookLift: HOOK_LIFT, hook: stats.hook, hook2: stats.hook2, drive: stats.drive,
  framesShot: stats.frames, minutes: +((Date.now() - started) / 60000).toFixed(1), blockedRequests: stats.blocked.length, blocked: stats.blocked.slice(0, 20),
  consoleWarnings: stats.warnings, gpuReadbackNotes: stats.driverNotes, framesBytes: size(framesDir) };
writeFileSync(join(framesDir, 'capture-report.json'), JSON.stringify(report, null, 2) + '\n');
log('完了', JSON.stringify({ ...report, blocked: undefined }));
