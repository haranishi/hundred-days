// Day 048 の紹介動画（34秒・1080×1920・30fps・BGM付き）を作る。連番PNG → ffmpeg。import しただけでは何も書き出さない。
//   PLAYWRIGHT=<playwright の index.js> node tools/promo/render-promo.mjs [--preview] [--out <mp4>]
// このアプリには手動の時計が無いので、動きの出どころを3つとも動画の秒に縛って撮る。
//   JS のタイマー（考える顔・押した答えの光・霧の知らせ）→ page.clock を止め、1コマずつ runFor で進める
//   CSS の動き（霧の回転・まぼろしのぼかし・札の出方）→ 毎コマ getAnimations() を止め、初めて現れた秒からの経過に置く
//   操作（答える・当たり・教える）→ 下の時刻表の絶対時刻に行う。動きの完了は待たない
// アプリは新しい質問の直後350ms（開始直後は400ms）の答えを受け流すので、押すたびに受け付けられたかを確かめる。
// まぼろしと浮かび上がる絵は画像なので、毎コマ読み込みと展開を待ってから撮る
import { execFileSync, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BAR_SECONDS, CAPTIONS, DEFAULT_FPS, DURATION_SECONDS, END_START, REVEAL_AT, STORYBOARD } from './timeline.mjs';
import { writeMusic } from './promo-audio.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '../..');
const VIEW = { width: 540, height: 960 };
const FPS = DEFAULT_FPS;
const CLOCK_START = Date.parse('2026-09-23T20:00:00+09:00'); // 記憶に残る日付を毎回同じにする

// 撮る占い。種 20260996 でたこ焼きを正直に答えると、10問目で最初の推測が当たる。
// 1コマ目（2問答えたあと）から水晶玉に映る料理はたこ焼きのままで、読みも下がらない（4%→6→11→16→43→59→87→94%→推測で100%）。
// 推理のエンジンを直すと同じ種でも流れが変わる。そのときは下見と1コマ目の検査が止めるので、選び直す
export const DISH = 'takoyaki';
export const SEED = 20260996;
const PRE_ANSWERS = 2;
// 教える場面は一覧に無い料理。似た肉じゃがのつもりで正直に答え、推測は「ちがう」にする。
// いまのエンジンは推測できる料理が残らないと途中で参りましたを言うので、肉じゃが・角煮の2回を外したあと22問目で参りましたになる
export const TAUGHT_NAME = 'ばあちゃんの煮しめ';
const PROXY_DISH = 'nikujaga';

// 操作の時刻（秒）。答えは小節の頭（BGMの拍）に置き、最後の答えを鐘の REVEAL_AT にそろえる
const sceneStart = id => STORYBOARD.find(scene => scene.id === id).start;
export const ANSWER_TIMES = Array.from({ length: REVEAL_AT / BAR_SECONDS }, (_, i) => (i + 1) * BAR_SECONDS);
export const WIN_AT = sceneStart('S4');
export const TEACH_AT = sceneStart('S5');
export const TYPE_TIMES = [...TAUGHT_NAME].map((_, i) => TEACH_AT + (i + 1) * .2); // 1文字ずつ、2秒以内に打ち終える
export const SUBMIT_AT = TEACH_AT + 2.4;
export const frameOf = seconds => Math.round(seconds * FPS);

export function expectedState(frame) {
  if (frame < frameOf(REVEAL_AT)) return 'asking';
  if (frame < frameOf(WIN_AT)) return 'guessing';
  if (frame < frameOf(TEACH_AT)) return 'won';
  if (frame < frameOf(SUBMIT_AT)) return 'teaching';
  return 'taught';
}

// won と teaching は札が舞台の下へはみ出す。決め手（教える欄）が見える位置まで iframe 内を送る。
// 教えた瞬間はアプリが先頭へ一気に戻すので舞台が1コマで跳ねる。0.5秒かけて戻す
const ease = k => (k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const clamp01 = k => Math.min(1, Math.max(0, k));
export function scrollAt(t, targets) {
  if (t >= WIN_AT && t < TEACH_AT) return Math.round(targets.won * ease(clamp01(t - (WIN_AT + 1)))); // 当たりの1秒後から1秒かけて送る
  if (t >= TEACH_AT && t < SUBMIT_AT) return targets.teach;
  if (t >= SUBMIT_AT) return Math.round(targets.teach * (1 - ease(clamp01((t - SUBMIT_AT) / .5))));
  return 0;
}

export function captionLines(t, questions) {
  return (CAPTIONS.find(c => t >= c.start && t < c.end)?.lines ?? []).map(line => line.replaceAll('{questions}', String(questions)));
}

// 撮影用の見た目。アプリのソースは変えず、iframe に差し込む。
// 見出し・足もと（共通の共有欄）・キーボードの手引きと、筋に関わらない操作（ひとつ戻る・最初から・もう一度占う・
// 結果の共有・教えずに終える）を隠し、舞台と札を大きくする。これらは下の縁のぼかしに半分だけ覗いて散らかって見えた。
// 質問中の窓（--ask）は水晶玉を寄りで大きく、推測からの全景（--big）は札と「当たり！」が iframe に収まる大きさ。
// 「読み ◯%」・差の札・読みの軌跡は、スマホの画面では字が小さすぎたので大きくする。
// 教える欄の候補は1文字目の「ば」でだけ8品並び、2文字目で消える。0.2秒だけ札が跳ねて見えるので隠す。
// 教えた後の札は字を少し小さくして、「覚えました。／次は…読めます。」の2行に収める。
// 下に余白を足すのは、札の下端が縁のぼかしより上に来るところまでスクロールできるようにするため
export const GAME_CSS = `html,body{background:transparent!important;scrollbar-width:none}
body::before,body>header,body>footer,.key-hint,.aux,#finale,#teach-skip,#candidates,#candidates-label,.ring-hint{display:none!important}
#taught-title{font-size:26px}
main{padding-bottom:300px}
:root{--big:560px;--ask:360px}
.stage{margin-inline:-16px}
.counter{font-size:16px}.trail{flex:0 1 180px;height:30px}
.reading__label{padding:0 12px;font-size:17px;line-height:28px}.reading__delta{padding:0 10px;font-size:16px;line-height:28px}
.question{font-size:28px}.question__lead{font-size:15px}
.answers{grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.answer{gap:6px;min-height:58px;padding-inline:4px;font-size:17px;white-space:nowrap}
.guess__lead,.guess__tail{font-size:18px}.guess__name{font-size:50px}
.result-count{font-size:17px}.deciders li{font-size:16px}
.teach label{font-size:15px}.teach input{font-size:20px}`;

// iframe の中に置く道具（ページ内で実行する）
export function installHelpers() {
  const born = new WeakMap();
  const motion = (t, settle) => {
    // 全部の動きを止め、初めて現れた秒からの経過に置く。無限の霧もこれで動画の秒どおりに回る。
    // settle は撮影の外の準備用で、有限の動きを終わりまで進める
    for (const animation of document.getAnimations()) {
      const end = animation.effect?.getComputedTiming().endTime ?? 0;
      if (!born.has(animation)) born.set(animation, settle && Number.isFinite(end) ? -Infinity : t);
      animation.pause();
      animation.currentTime = Math.min((t - born.get(animation)) * 1000, end);
    }
  };
  window.__promoShot = {
    motion,
    // スクロールと動きを動画の秒に合わせ、画像が描ける状態になるまで待つ（読み込み途中の空の玉を撮らない）
    async frame(t, y) {
      if (Math.round(scrollY) !== y) scrollTo(0, y);
      motion(t, false);
      await Promise.all([...document.images].map(img => (img.complete ? img.decode().catch(() => {}) : new Promise(done => {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      }))));
      return { ...window.__day048.snapshot(), scrolled: Math.round(scrollY) };
    },
    // 正直に答える人（単体テストの players.mjs と同じ区切り）。画面と同じモデルで決め、実際のボタンを押す。
    // 受け流された（受付前に押した）かどうかを、問数が増えたかで返す
    async answer(dish) {
      const { probabilityOf } = await import('./lib/oracle.js');
      const before = window.__day048.snapshot();
      const p = probabilityOf(window.__day048.model(), dish, before.q);
      const id = p >= .8 ? 'yes' : p >= .6 ? 'probably' : p > .4 ? 'unknown' : p > .2 ? 'probablyNot' : 'no';
      document.querySelector(`#answers [data-answer="${id}"]`).click();
      return { id, accepted: window.__day048.snapshot().count === before.count + 1 };
    },
    // 水晶玉にいま映っているまぼろし（画像の src・読み込めたか・濃さ）
    vision() {
      const layer = document.querySelector('.vision__layer.is-on');
      const img = layer?.querySelector('img.art__img');
      return { mode: document.querySelector('.vision').dataset.mode, src: img?.getAttribute('src') ?? null,
        loaded: Boolean(img?.complete && img.naturalWidth > 0), opacity: layer ? Number(getComputedStyle(layer).opacity) : 0 };
    },
    type(char) {
      const input = document.querySelector('#teach-input');
      input.focus({ preventScroll: true });
      input.value += char;
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: char }));
    },
    click(selector) { document.querySelector(selector).click(); },
    // 要素の下端（余白込み）が iframe の下の縁のぼかしより上に来るスクロール量
    reach(selector, margin) {
      const box = document.querySelector(selector).getBoundingClientRect();
      return Math.max(0, Math.ceil(box.bottom + scrollY + margin - innerHeight));
    },
    text: selector => document.querySelector(selector)?.textContent ?? '',
  };
}

export function parseArgs(args) {
  let preview = false, out = join(here, 'promo.mp4');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--preview') preview = true;
    else if (args[i] === '--out' && args[i + 1] && !args[i + 1].startsWith('--')) out = resolve(args[++i]);
    else throw new Error('使い方: node tools/promo/render-promo.mjs [--preview] [--out <mp4>]');
  }
  if (extname(out) !== '.mp4') throw new Error('--out は .mp4 を指定してください');
  return { preview, out };
}

export function detectSwitches(raw, size, fps, threshold = 6) {
  const found = [];
  for (let i = 1; i < Math.floor(raw.length / size); i++) {
    let diff = 0;
    for (let j = 0; j < size; j++) diff += Math.abs(raw[i * size + j] - raw[(i - 1) * size + j]);
    if (diff / size > threshold && (!found.length || i / fps - found.at(-1) > .3)) found.push(i / fps);
  }
  return found;
}

export function verifySwitches(switches, tolerance = .4) {
  const expected = [...CAPTIONS.slice(1).map(c => c.start), END_START];
  if (switches.length !== expected.length || expected.some((t, i) => Math.abs(t - switches[i]) > tolerance)) {
    throw new Error(`字幕検査不合格: 予定 ${expected.join(', ')} / 検出 ${switches.join(', ')}（秒）。出力を確認してください`);
  }
}

// ラウドネスは合成段で -17 LUFS・TP -2.4 dBTP に合わせ済み。掛け直さず、AAC にした後の値を測って確かめる
export function readLoudness(log) {
  const summary = log.slice(log.lastIndexOf('Summary:'));
  return { lufs: Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]), truePeak: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1]) };
}

// 字幕の札の中だけを切り出してコマ差分を取る。元の30fpsのまま測る（20fpsに間引くと、切り替えが一律0.1秒遅れて測れた）
function checkVideo(out, rect) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', out, '-vf',
    `crop=iw*${rect.w}:ih*${rect.h}:iw*${rect.x}:ih*${rect.y},scale=96:12,format=gray`,
    '-f', 'rawvideo', '-'], { maxBuffer: 16 * 1024 * 1024 });
  const switches = detectSwitches(raw, 96 * 12, FPS).map(t => Number(t.toFixed(3)));
  verifySwitches(switches);
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', out], { encoding: 'utf8' }));
  const video = info.streams.find(s => s.codec_type === 'video');
  if (video?.width !== 1080 || video?.height !== 1920 || !info.streams.some(s => s.codec_type === 'audio')
    || Math.abs(Number(info.format.duration) - DURATION_SECONDS) > .15) throw new Error('動画の寸法・音声・尺を確認してください');
  const loud = readLoudness(spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', out, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr);
  if (!(Math.abs(loud.lufs + 17) <= .5 && loud.truePeak <= -1.5)) throw new Error(`音量が範囲外です: ${loud.lufs} LUFS / 真のピーク ${loud.truePeak} dBTP`);
  console.log(`字幕検査: ${switches.length}回 / ${switches.join(', ')}秒`);
  console.log(`動画: ${video.width}×${video.height} / ${Number(info.format.duration).toFixed(2)}秒 / 音声 ${loud.lufs} LUFS・真のピーク ${loud.truePeak} dBTP`);
}

async function serve() {
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp' };
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = resolve(appDir, `.${path}`);
      if (!file.startsWith(appDir + sep)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  return { server, base: `http://127.0.0.1:${server.address().port}/` };
}

// 配信元以外への通信を断ち、ページのエラーと一緒に数える
async function guard(context, page, origin, log) {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    log.blocked.push(url.host); return route.abort();
  });
  page.on('pageerror', error => log.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') log.errors.push(message.text()); });
}

// 下見：記憶の空な別の文脈で、同じ種の占いを当たりまで進める。字幕の問数はこの won の画面から取り、本番の won とも突き合わせる
async function rehearse(browser, origin, gameURL, log) {
  const context = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  try {
    const page = await context.newPage();
    await guard(context, page, origin, log);
    await page.goto(gameURL);
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    await page.evaluate(installHelpers);
    await page.evaluate(() => window.__promoShot.click('#start'));
    // 下見は実時間で進むので、受付が始まるまで待ってから押す
    const accepting = () => page.waitForFunction(() => window.__day048.snapshot().accepting);
    let snap;
    for (let turn = 0; turn < 30; turn++) {
      snap = await page.evaluate(() => window.__day048.snapshot());
      if (snap.state !== 'asking') break;
      if (snap.count === PRE_ANSWERS && snap.reading.id !== DISH) {
        throw new Error(`種 ${SEED}: ${PRE_ANSWERS}問答えた時点の水晶玉が ${snap.reading.id} です（1コマ目に ${DISH} が映りません）。料理と種を選び直してください`);
      }
      await accepting();
      await page.evaluate(dish => window.__promoShot.answer(dish), DISH);
    }
    const want = PRE_ANSWERS + ANSWER_TIMES.length;
    if (snap.state !== 'guessing' || snap.guess !== DISH || snap.suggest || snap.count !== want) {
      throw new Error(`種 ${SEED} の ${DISH} が${want}問目の推測で当たりません（${snap.state}・${snap.count}問・推測 ${snap.guess}）。料理と種を選び直してください`);
    }
    await accepting();
    await page.evaluate(() => window.__promoShot.click('#guess-yes'));
    const wonCount = await page.evaluate(() => window.__promoShot.text('#won-count'));
    const reasons = await page.evaluate(() => document.querySelectorAll('#decider-list li').length);
    const questions = Number(/(\d+)問/.exec(wonCount)?.[1]);
    if (!questions || reasons !== 3) throw new Error(`下見の won の画面が想定と違います: 「${wonCount}」・決め手${reasons}つ`);
    return { questions, wonCount };
  } finally {
    await context.close();
  }
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) { console.log('PLAYWRIGHT=<playwright の index.js> node tools/promo/render-promo.mjs [--preview] [--out <mp4>]'); return; }
  const { preview, out } = parseArgs(args);
  for (const command of ['ffmpeg', 'ffprobe']) execFileSync(command, ['-version'], { stdio: 'ignore' });
  const spec = process.env.PLAYWRIGHT || 'playwright';
  const mod = await import(spec.startsWith('.') || spec.startsWith('/') ? pathToFileURL(resolve(spec)).href : spec);
  const chromium = mod.chromium ?? mod.default?.chromium;
  if (!chromium) throw new Error('Playwright chromium がありません');

  const work = mkdtempSync(join(tmpdir(), 'day048-promo-'));
  const log = { errors: [], blocked: [] };
  let browser, server;
  try {
    const served = await serve(); server = served.server;
    const origin = new URL(served.base).origin;
    const promoURL = new URL('tools/promo/promo.html', served.base).href;
    const gameURL = new URL(`index.html?seed=${SEED}`, served.base).href;
    browser = await chromium.launch();
    const { questions, wonCount } = await rehearse(browser, origin, gameURL, log);
    for (const c of CAPTIONS) {
      const lines = captionLines(c.start, questions);
      if (lines.length !== 1 || [...lines[0]].length > 16) throw new Error(`字幕は1行16字以内: ${lines.join('／')}`);
    }

    const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: preview ? 1 : 2, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', reducedMotion: 'no-preference' });
    const page = await context.newPage();
    await guard(context, page, origin, log);
    // 時計は止めたまま読み込ませ、以後は runFor だけで進める（iframe の中のタイマー・Date・performance.now も同じ時計）
    await page.clock.install({ time: CLOCK_START });
    await page.clock.pauseAt(CLOCK_START + 1000);
    await page.goto(promoURL);
    await page.waitForFunction(() => Boolean(window.__promo));
    await page.evaluate(url => window.__promo.load(url), gameURL);
    await page.waitForFunction(() => document.querySelector('iframe').contentDocument?.documentElement?.dataset.ready === 'true');
    const game = page.frames().find(frame => frame.url() === gameURL);
    if (!game) throw new Error('アプリの iframe がありません');
    await game.addStyleTag({ content: GAME_CSS });
    await game.evaluate(installHelpers);
    await game.evaluate(() => document.fonts.ready);
    await page.evaluate(() => document.fonts.ready);
    const shot = (fn, arg) => game.evaluate(fn, arg);
    const snapshot = () => shot(() => window.__day048.snapshot());

    // 答えて、受け流されていないことを確かめる。撮影の外では、受付が始まるまで時計を100msずつ進めてから押す
    const answerAs = async (dish, where) => {
      const done = await shot(name => window.__promoShot.answer(name), dish);
      if (!done.accepted) throw new Error(`${where}の答えが受け流されました（受付の前に押しています）`);
    };
    const whenAccepting = async () => {
      for (let i = 0; i < 20 && !(await snapshot()).accepting; i++) await page.clock.runFor(100);
    };

    // 撮影の外で2問答え、3問目から撮る。有限の動きは終わらせ、霧などの無限の動きは0秒から回す
    await shot(() => window.__promoShot.click('#start'));
    for (let i = 0; i < PRE_ANSWERS; i++) {
      await whenAccepting();
      await answerAs(DISH, `撮影前の${i + 1}問目`);
    }
    await page.clock.runFor(2000);
    await shot(() => window.__promoShot.motion(0, true));

    const dishInfo = await shot(id => window.__day048.model().items.find(item => item.id === id), DISH);
    const answerFrames = new Set(ANSWER_TIMES.map(frameOf));
    const typeFrames = new Map(TYPE_TIMES.map((t, i) => [frameOf(t), [...TAUGHT_NAME][i]]));
    const targets = { won: 0, teach: 0 };
    let clockMs = 0, rect, story = '';
    for (let frame = 0; frame < DURATION_SECONDS * FPS; frame++) {
      const t = frame / FPS;
      // 1) 時計を動画の秒まで進める。予約済みのタイマーはこの中で時刻どおりに発火する
      const ms = Math.round(t * 1000);
      if (ms > clockMs) { await page.clock.runFor(ms - clockMs); clockMs = ms; }
      // 2) この秒の操作
      if (answerFrames.has(frame)) await answerAs(DISH, `${t.toFixed(2)}秒`);
      if (frame === frameOf(WIN_AT)) {
        if (!(await snapshot()).accepting) throw new Error(`${WIN_AT}秒の「当たり！」が受付の前です`);
        await shot(() => window.__promoShot.click('#guess-yes'));
        const shown = await shot(() => window.__promoShot.text('#won-count'));
        if (shown !== wonCount) throw new Error(`won の画面「${shown}」が下見「${wonCount}」と違います（字幕の問数が画面とずれます）`);
        targets.won = await shot(() => window.__promoShot.reach('#won-memory', 40));
      }
      if (frame === frameOf(TEACH_AT)) ({ scroll: targets.teach, story } = await prepareTeaching(page, shot, snapshot, answerAs));
      if (typeFrames.has(frame)) await shot(char => window.__promoShot.type(char), typeFrames.get(frame));
      if (frame === frameOf(SUBMIT_AT)) await shot(() => window.__promoShot.click('#teach-new'));
      // 3) スクロールと CSS の動きを動画の秒に合わせ、画面の状態が時刻表どおりか確かめる
      const y = scrollAt(t, targets);
      const snap = await shot(([seconds, top]) => window.__promoShot.frame(seconds, top), [t, y]);
      if (snap.state !== expectedState(frame)) throw new Error(`${t.toFixed(2)}秒の画面が ${snap.state} です（予定 ${expectedState(frame)}）`);
      // 文書が短いと scrollTo は黙って手前で止まる（札が縁のぼかしに沈む）ので、届いたかを確かめる
      if (Math.abs(snap.scrolled - y) > 1) throw new Error(`${t.toFixed(2)}秒: iframe を ${y}px まで送れません（${snap.scrolled}px）`);
      await page.evaluate(([seconds, count]) => window.__promo.render(seconds, { questions: count }), [t, questions]);
      if (frame === 0) {
        const vision = await shot(() => window.__promoShot.vision());
        if (snap.count !== PRE_ANSWERS || snap.reading.id !== DISH || vision.mode !== 'haze' || vision.src !== `assets/dishes/${DISH}.webp`
          || !vision.loaded || vision.opacity < .2) {
          throw new Error(`1コマ目が「まぼろしの見える質問画面」ではありません: ${JSON.stringify({ snap, vision })}`);
        }
        rect = await page.locator('#caption-lines').evaluate(el => {
          const r = el.getBoundingClientRect(), box = el.parentElement.getBoundingClientRect();
          const inside = b => b.left >= innerWidth * .1 && b.right <= innerWidth * .9 && b.top >= innerHeight * .1 && b.bottom <= innerHeight * .9;
          if (!inside(r) || !inside(box) || el.scrollWidth > r.width) throw new Error('字幕がセーフエリアを超えています');
          return { x: r.x / innerWidth, y: r.y / innerHeight, w: r.width / innerWidth, h: r.height / innerHeight };
        });
      }
      if (frame === frameOf(REVEAL_AT) && (snap.guess !== DISH || snap.reading.value !== 1 || await shot(() => window.__promoShot.text('#guess-name')) !== dishInfo.name)) {
        throw new Error(`${REVEAL_AT}秒の推測が ${DISH}（読み100%）ではありません`);
      }
      if (frame === frameOf(WIN_AT + 2)) {
        const box = await shot(() => { const r = document.querySelector('#deciders').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight }; });
        if (box.top < 0 || box.bottom > box.h - 24) throw new Error(`決め手が iframe に収まっていません: ${JSON.stringify(box)}`);
      }
      if (frame === frameOf(SUBMIT_AT) && !(await shot(() => window.__promoShot.text('#taught-title'))).includes(TAUGHT_NAME)) {
        throw new Error('教えた料理の名前が画面に出ていません');
      }
      await page.screenshot({ path: join(work, `${String(frame).padStart(5, '0')}.png`), type: 'png' });
      if (frame % 150 === 0) console.log(`撮影 ${t}/${DURATION_SECONDS}秒`);
    }
    if (log.errors.length || log.blocked.length) throw new Error(`描画エラー ${log.errors.join('; ')} / 外部通信 ${log.blocked.length}件`);
    await browser.close(); browser = null;

    const wav = join(work, 'promo-audio.wav');
    const music = writeMusic(wav, { variant: 'a' });
    mkdirSync(dirname(out), { recursive: true });
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPS), '-i', join(work, '%05d.png'), '-i', wav,
      '-vf', 'scale=1080:1920:flags=lanczos,format=yuv420p', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264',
      '-preset', preview ? 'fast' : 'slow', '-crf', preview ? '26' : '20', '-c:a', 'aac', '-b:a', '192k',
      '-t', String(DURATION_SECONDS), '-map_metadata', '-1', '-movflags', '+faststart', out], { stdio: 'inherit' });
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', out, '-frames:v', '1', join(here, 'promo-first-frame.png')]);
    // 2秒おき（0〜32秒）の17コマを並べた確認用の一覧
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', out, '-vf', `select='not(mod(n\\,${2 * FPS}))',scale=270:480,tile=6x3:padding=6:margin=6:color=0x0f0b24`,
      '-frames:v', '1', '-q:v', '3', join(here, 'preview-contact.jpg')]);
    console.log(`BGM（A案）: ${music.lufs.toFixed(2)} LUFS / 真のピーク ${music.truePeakDb.toFixed(2)} dBTP`);
    checkVideo(out, rect);
    console.log(`料理 ${dishInfo.name}（種 ${SEED}）/ ${wonCount} / 教える場面: ${story} / 出力 ${out}`);
    console.log('1コマ目は promo-first-frame.png、2秒おきの一覧は preview-contact.jpg。目視と聴取で確かめること。');
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
    rmSync(work, { recursive: true, force: true });
  }
}

// 教える場面の準備（撮影の外）。もう一度占い、推測は「ちがう」にして参りましたの画面にする。
// 霧の知らせ（1.4秒）と受け流しの間は時計を進めて飛ばす。終わったら有限の動きを済ませ、入力欄が見える位置と流れを返す
async function prepareTeaching(page, shot, snapshot, answerAs) {
  await shot(() => window.__promoShot.click('#again'));
  const guesses = [];
  for (let step = 0; step < 200; step++) {
    const now = await snapshot();
    if (now.state === 'teaching') break;
    if (now.busy || !now.accepting) await page.clock.runFor(200);
    else if (now.state === 'asking') await answerAs(PROXY_DISH, '教える場面の準備');
    else if (now.state === 'guessing') {
      guesses.push(now.guess);
      await shot(() => window.__promoShot.click('#guess-no'));
    } else throw new Error(`教える場面の準備で想定外の画面になりました: ${now.state}`);
  }
  await page.clock.runFor(2000);
  const now = await snapshot();
  if (now.state !== 'teaching') throw new Error(`参りましたの画面に進めませんでした: ${JSON.stringify(now)}`);
  const scroll = await shot(t => {
    document.querySelector('#teach-input').focus({ preventScroll: true });
    window.__promoShot.motion(t, true);
    return window.__promoShot.reach('#teach-new', 40);
  }, TEACH_AT);
  return { scroll, story: `推測 ${guesses.join('・') || 'なし'} を外し、${now.count}問目で参りました` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
