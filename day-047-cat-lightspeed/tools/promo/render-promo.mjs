// Day 047 の紹介動画（34秒・1080×1920・30fps・BGM付き）を作る。連番PNG → ffmpeg。import しただけでは何も書き出さない。
//   PLAYWRIGHT=<playwright の index.js> node tools/promo/render-promo.mjs [--preview] [--out <mp4>] [--variant a|b]
// ゲームの手動の時計（setManual/advance）で、最大推力の走りを1回だけ 1/30 秒ずつ通しで進める。
// 場面ごとに「映すゲーム内の時刻の窓」（GAME_FROM）だけを撮り、窓の外は撮らずに進める（止まらず・巻き戻さない）。
// 窓は snapshot() の実測で選んだ。撮った全コマの状態から、各場面に字幕の出来事が写ったかを確かめる。
// CSS の動き（追い越しの一言の出入りなど）は差し込む CSS で止める。実時間で動くものを残すと、機械の混み具合で画がずれる
import { execFileSync, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CAPTIONS, DEFAULT_FPS, DURATION_SECONDS, END_START, STORYBOARD } from './timeline.mjs';
import { writeMusic } from './promo-audio.mjs';
import { voicePlan } from '../../lib/audio-state.js';
import { LIGHT_SPEED } from '../../lib/milestones.js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '../..');
const VIEW = { width: 540, height: 960 };
const FPS = DEFAULT_FPS;

// 各場面で映すゲーム内の時刻（秒）。最大推力の1回の走りの中の窓で、1/30秒の倍数にしてある。
// 実測（最大推力）：新幹線は10.43〜12.83秒に見えて12.03秒に抜く／旅客機は13.13〜15.53秒に見えて14.73秒に抜き、15.0秒に空／
// 宇宙ステーションは20.63〜23.03秒・22.22秒に抜く／太陽系は25.0秒から、環のある惑星が右から左へ／光速の90%が37.02秒・99%が40秒・99.9%が43.02秒／完走49.0秒
// S0 は「ニャー」が動画の0.3秒に出る 3.13秒から（的を弾きながら 7〜44km/h）。S1 は街に入った9.0秒から、次の旅客機が見える前の13.0秒まで。
// S1→S2・S3→S4・S5→S6 は通しでつながる。S7 は完走（49.0秒）の結果画面から。直前の走りを入れると、同じ「光速の 99.999%」の表示が
// 走りの中（γ 184.6、小数3桁の丸め）と結果（223.6）で違う数字のまま並んだ
export const GAME_FROM = Object.freeze({ S0: 94 / 30, S1: 9, S2: 13, S3: 21, S4: 25, S5: 36, S6: 40, S7: 49 });
// 場面ごとに見せる「追い越した」の一言（アプリの実表示のうち、字幕の出来事に当たるものだけ。ほかは隠す）と、下の注記
const SHOW = {
  S0: { toast: '追い越した' }, S1: { toast: '新幹線|街へ' }, S2: { toast: '旅客機|空へ' },
  S3: { toast: 'ISS', note: '真空' }, S4: { toast: '太陽系へ' }, S5: {}, S6: {}, S7: {}
};
export const frameOf = seconds => Math.round(seconds * FPS);

// 撮影用の見た目。アプリのソースは変えず、iframe に差し込む。
// 見出し・速報（フィクション）・操作説明・ページ移動帯・音のボタンと、結果画面の操作・共有・ベスト（日付入り）を隠す。
// 追い越しの一言・鳴き声・二つの時計・下の注記は、スマホで読める大きさに上げる。結果の写真は主役なので大きくする
export const GAME_CSS = `html,body{background:#0d171b!important;overflow:hidden!important;scrollbar-width:none}
body>footer,.masthead,.bulletin,#hold-hint,#page-strip,#mute{display:none!important}
#app{width:100%!important;margin:0!important;padding-bottom:0!important}
.instrument{margin-top:0!important;border-radius:0!important;border-left:0!important;border-right:0!important}
.scene-shell{border-left:0!important;border-right:0!important}.scene-bottom{right:0!important}
*,*::before,*::after{transition:none!important;animation:none!important}
#toast{top:16px;font-size:17px;padding:8px 16px}#meow{font-size:19px}#sound-note{font-size:14px}
#relativity{transform:scale(1.2);transform-origin:0 0}
#result-photo{height:220px}.result h2{font-size:30px}.result .final-dilation{font-size:16px}
#best,#retry,.result-share,#copy-status,.result-detail{display:none!important}`;

// iframe の中で1コマぶん進める（ページ内で実行する）。steps 回 advance(1/30秒) し、一言と注記を場面に合わせて出し分け、状態を返す
export function stepGame({ steps, toast, note }) {
  const g = window.__day047;
  for (let i = 0; i < steps && g.state() === 'playing'; i++) g.advance(1000 / 30);
  const box = document.getElementById('toast'); const foot = document.getElementById('sound-note');
  const toastText = box.className.includes('show') ? box.textContent : '';
  const toastShown = Boolean(toastText && toast && new RegExp(toast).test(toastText));
  box.style.visibility = toastShown ? '' : 'hidden';
  const noteShown = Boolean(foot.textContent && note && new RegExp(note).test(foot.textContent));
  foot.style.visibility = noteShown ? '' : 'hidden';
  const s = g.snapshot(); const rel = document.getElementById('relativity');
  const photo = document.getElementById('result-photo');
  let lit = 0;
  if (g.state() === 'result') { const d = photo.getContext('2d').getImageData(0, 0, photo.width, photo.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 450) lit++; }
  return { state: g.state(), elapsed: s.elapsed, speed: s.speed, world: s.world, earth: s.earthSeconds, u: s.input.u, flying: s.impacts.flying,
    visible: s.render.impact?.visibleTargets ?? 0, hits: s.impacts.total, rival: s.render.rival?.id ?? null, light: s.experience.light.phase,
    landmarks: s.experience.landmarks, cat: { x: s.catScreen.x, y: s.catScreen.y, w: s.catScreen.w, h: s.catScreen.h },
    toast: toastShown ? toastText : '', note: noteShown ? foot.textContent : '', meow: document.getElementById('meow').textContent,
    relativity: !rel.hidden, catClock: document.getElementById('cat-clock').textContent, earthClock: document.getElementById('earth-clock').textContent,
    resultShown: !document.getElementById('result-screen').hidden, photoLit: lit };
}

export function parseArgs(args) {
  let preview = false, out = join(here, 'promo.mp4'), variant = 'a';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--preview') preview = true;
    else if (args[i] === '--out' && args[i + 1] && !args[i + 1].startsWith('--')) out = resolve(args[++i]);
    else if (args[i] === '--variant' && /^[ab]$/.test(args[i + 1] ?? '')) variant = args[++i];
    else throw new Error('使い方: node tools/promo/render-promo.mjs [--preview] [--out <mp4>] [--variant a|b]');
  }
  if (extname(out) !== '.mp4') throw new Error('--out は .mp4 を指定してください');
  return { preview, out, variant };
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

// 字幕の切り替わり（4・8…28秒）とエンド画面（30秒）の8回
export function verifySwitches(switches, tolerance = .4) {
  const expected = [...CAPTIONS.slice(1).map(c => c.start), END_START];
  if (switches.length !== expected.length || expected.some((t, i) => Math.abs(t - switches[i]) > tolerance)) {
    throw new Error(`字幕検査不合格: 予定 ${expected.join(', ')} / 検出 ${switches.join(', ')}（秒）。出力を確認してください`);
  }
}

export function readLoudness(log) {
  const summary = log.slice(log.lastIndexOf('Summary:'));
  return { lufs: Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]), truePeak: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1]) };
}

/**
 * 撮った全コマの状態から、各場面に字幕の出来事が写ったかを確かめる。失敗の文言を返す（空なら合格）
 * @param {Array<{scene:string}>} records 1コマごとの状態（stepGame の戻り値＋scene）
 * @param {Array<{type:string,id:string,elapsed:number}>} events 走り全体の進行イベント
 */
export function checkScenes(records, events) {
  const problems = [];
  const of = id => records.filter(r => r.scene === id);
  const span = id => { const s = STORYBOARD.find(x => x.id === id); return [GAME_FROM[id], GAME_FROM[id] + s.end - s.start]; };
  const within = (id, type, key) => { const [from, to] = span(id); const e = events.find(x => x.type === type && x.id === String(key)); return Boolean(e && e.elapsed >= from - 1e-6 && e.elapsed < to - 1e-6); };
  const count = (list, fn) => list.filter(fn).length;
  const mark = (r, id) => r.landmarks.find(l => l.id === id)?.rect;
  const need = (ok, text) => { if (!ok) problems.push(text); };

  const s0 = of('S0'), s1 = of('S1'), s2 = of('S2'), s3 = of('S3'), s4 = of('S4'), s5 = of('S5'), s6 = of('S6'), s7 = of('S7');
  need(s0.every(r => r.world === 'farm') && s0.at(-1).speed > s0[0].speed && s0.at(-1).hits - s0[0].hits >= 3, 'S0：牧場で加速しながら的を弾いていない');
  need(s1.every(r => r.world === 'city') && within('S1', 'milestone', 8) && count(s1, r => r.rival === 'shinkansen') >= 30 && s1.some(r => r.toast.includes('新幹線')), 'S1：街で新幹線を追い越していない');
  need(within('S2', 'milestone', 11) && within('S2', 'world', 'sky') && count(s2, r => r.rival === 'airliner') >= 30 && count(s2, r => r.world === 'sky') >= 45 && s2.some(r => r.toast.includes('旅客機')), 'S2：旅客機を抜いて空へ出ていない');
  need(s3.every(r => r.world === 'orbit' && mark(r, 'earth') && mark(r, 'earth').y + mark(r, 'earth').h / 2 > .5 && mark(r, 'earth').w >= .7), 'S3：画面下に地球の弧がない');
  need(within('S3', 'milestone', 15) && count(s3, r => r.rival === 'station') >= 30 && s3.some(r => r.note.includes('真空')), 'S3：地球を回る速さ（宇宙ステーション）を追い越していない');
  const planet = s4.map(r => mark(r, 'ringedPlanet'));
  need(s4.every(r => r.world === 'solar') && planet.every(Boolean) && planet[0].x - planet.at(-1).x >= .15 && s4.every(r => mark(r, 'sun')), 'S4：環のある惑星が右から左へ通り過ぎていない');
  const glowAt = s5.findIndex(r => r.light === 'glow');
  need(within('S5', 'light', 'glow') && glowAt >= 15 && s5.slice(0, glowAt).every(r => r.light === 'coat' && !r.relativity) && s5.slice(glowAt).every(r => r.light === 'glow' && r.relativity), 'S5：光速の90%で光りだしていない');
  // 40.0秒ちょうどの光速比は浮動小数で 0.98999999999999948（画面は「99.0%」）なので、わずかな誤差を許す
  need(s6.every(r => r.speed / LIGHT_SPEED >= .99 - 1e-9 && r.relativity) &&(s6.at(-1).earth - s6.at(-1).elapsed) - (s6[0].earth - s6[0].elapsed) >= 30, 'S6：99%台で二つの時計がずれていない');
  need(count(s7, r => r.state === 'result' && r.resultShown && r.photoLit >= 300) >= 30, 'S7：光の猫の写真（結果）が1秒以上写っていない');
  return problems;
}

// 1コマ目：走っている画面（プレイ中・最大推力・牧場で動いている・弾く的が見えるか飛んでいる・猫が画面内）
export function checkFirstFrame(r) {
  const c = r.cat;
  const ok = r.state === 'playing' && r.world === 'farm' && r.u === 1 && r.speed > 1 && (r.flying >= 1 || r.visible >= 3)
    && c.x - c.w / 2 > 0 && c.x + c.w / 2 < 1 && c.y - c.h / 2 > 0 && c.y + c.h / 2 < 1;
  if (!ok) throw new Error(`1コマ目が走っている画面ではありません: ${JSON.stringify({ state: r.state, world: r.world, u: r.u, speed: r.speed, flying: r.flying, visible: r.visible, cat: c })}`);
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
  console.log(`動画: ${video.width}×${video.height} / ${Number(info.format.duration).toFixed(3)}秒 / 音声 ${loud.lufs} LUFS・真のピーク ${loud.truePeak} dBTP`);
  return { switches, loud };
}

async function serve() {
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.md': 'text/markdown; charset=utf-8' };
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
    if (url.origin === origin || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    log.blocked.push(url.host); return route.abort();
  });
  page.on('pageerror', error => log.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') log.errors.push(message.text()); });
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) { console.log('PLAYWRIGHT=<playwright の index.js> node tools/promo/render-promo.mjs [--preview] [--out <mp4>] [--variant a|b]'); return; }
  const { preview, out, variant } = parseArgs(args);
  for (const c of CAPTIONS) if (c.lines.length !== 1 || [...c.lines[0]].length > 16) throw new Error(`字幕は1行16字以内: ${c.lines.join('／')}`);
  for (const command of ['ffmpeg', 'ffprobe']) execFileSync(command, ['-version'], { stdio: 'ignore' });
  const spec = process.env.PLAYWRIGHT || 'playwright';
  const mod = await import(spec.startsWith('.') || spec.startsWith('/') ? pathToFileURL(resolve(spec)).href : spec);
  const chromium = mod.chromium ?? mod.default?.chromium;
  if (!chromium) throw new Error('Playwright chromium がありません');

  const work = mkdtempSync(join(tmpdir(), 'day047-promo-'));
  const log = { errors: [], blocked: [] };
  let browser, server;
  try {
    const served = await serve(); server = served.server;
    const origin = new URL(served.base).origin;
    const promoURL = new URL('tools/promo/promo.html', served.base).href;
    const gameURL = new URL('index.html', served.base).href;
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: preview ? 1 : 2, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', reducedMotion: 'no-preference' });
    const page = await context.newPage();
    await guard(context, page, origin, log);
    await page.goto(promoURL);
    await page.waitForFunction(() => Boolean(window.__promo));
    await page.evaluate(url => window.__promo.load(url), gameURL);
    await page.waitForFunction(() => document.querySelector('iframe').contentWindow?.__day047?.state?.() === 'ready', null, { timeout: 60_000 });
    const game = page.frames().find(frame => frame.url() === gameURL);
    if (!game) throw new Error('アプリの iframe がありません');
    await game.addStyleTag({ content: GAME_CSS });
    await game.evaluate(() => document.fonts.ready);
    await page.evaluate(() => document.fonts.ready);
    // 鳴き声の録音を読み終えてから走り直す。長さが読み込みの前後で変わると、口の開く時刻（「ニャー」）がずれる
    await game.evaluate(() => { window.__day047.setManual(true); window.__day047.start(); });
    await game.waitForFunction(() => window.__day047.snapshot().sound.loaded === 3, null, { timeout: 60_000 });
    await game.evaluate(() => { const g = window.__day047; g.setManual(true); g.start(); g.inputSample({ time: g.snapshot().elapsed, held: true }); });

    const records = [];
    let gameFrame = 0, rect, photo = false;
    for (let frame = 0; frame < DURATION_SECONDS * FPS; frame++) {
      const t = frame / FPS;
      const scene = STORYBOARD.find(s => t >= s.start && t < s.end);
      if (GAME_FROM[scene.id] !== undefined) {
        // この場面で映すゲーム内のコマまで 1/30 秒ずつ進める（窓の外のコマは撮らない）
        const target = frameOf(GAME_FROM[scene.id]) + frame - frameOf(scene.start);
        if (target < gameFrame) throw new Error(`${scene.id} の窓（${GAME_FROM[scene.id]}秒〜）が前の場面より前にあります。窓は時刻順に並べてください`);
        const state = await game.evaluate(stepGame, { steps: target - gameFrame, ...SHOW[scene.id] });
        gameFrame = target;
        records.push({ ...state, scene: scene.id, t });
        if (state.state === 'result' && !photo) {
          photo = true;
          await page.evaluate(src => window.__promo.photo(src), await game.evaluate(() => document.getElementById('result-photo').toDataURL('image/png')));
        }
      }
      await page.evaluate(seconds => window.__promo.render(seconds), t);
      if (frame === 0) {
        checkFirstFrame(records[0]);
        rect = await page.locator('#caption-lines').evaluate(el => {
          const r = el.getBoundingClientRect(), box = el.parentElement.getBoundingClientRect();
          const inside = b => b.left >= innerWidth * .1 && b.right <= innerWidth * .9 && b.top >= innerHeight * .1 && b.bottom <= innerHeight * .9;
          if (!inside(r) || !inside(box) || el.scrollWidth > r.width) throw new Error('字幕がセーフエリアを超えています');
          return { x: r.x / innerWidth, y: r.y / innerHeight, w: r.width / innerWidth, h: r.height / innerHeight };
        });
      }
      if (frame === frameOf(END_START)) {
        // エンド画面の文字が上下左右10%の内側に収まり、切れていないこと
        await page.evaluate(() => {
          for (const el of document.querySelectorAll('#end h1, #end .end__day, #end .end__url, #end .end__credit, #end-photo')) {
            const r = el.getBoundingClientRect();
            const cut = el.id !== 'end-photo' && el.scrollWidth > el.clientWidth + 1;   // 文字だけ切れを見る（写真の光は外へはみ出す飾り）
            if (r.left < innerWidth * .1 - .5 || r.right > innerWidth * .9 + .5 || r.top < innerHeight * .1 || r.bottom > innerHeight * .9 || cut) {
              throw new Error(`エンド画面の「${el.textContent.trim().slice(0, 12) || el.id}」がセーフエリアを超えています`);
            }
          }
          if (!document.querySelector('#end-photo').naturalWidth) throw new Error('エンド画面に光の猫の写真がありません');
        });
      }
      await page.screenshot({ path: join(work, `${String(frame).padStart(5, '0')}.png`), type: 'png' });
      if (frame % 150 === 0) console.log(`撮影 ${t}/${DURATION_SECONDS}秒`);
    }
    const events = await game.evaluate(() => window.__day047.snapshot().experience.events);
    const problems = checkScenes(records, events);
    if (problems.length) throw new Error(`場面の検査不合格: ${problems.join(' / ')}`);
    if (log.errors.length || log.blocked.length) throw new Error(`描画エラー ${log.errors.join('; ')} / 外部通信 ${log.blocked.length}件`);
    await browser.close(); browser = null;

    // 音：BGM に、1コマ目近くの「ニャー」（アプリと同じ録音・同じ再生速度）と、結果の場面のひと鳴きを小さく重ねる
    const wav = join(work, 'promo-audio.wav');
    const music = writeMusic(wav, { variant });
    const firstMeow = records.find(r => r.scene === 'S0' && r.meow === 'ニャー');
    const result = records.find(r => r.state === 'result');
    const plan = voicePlan(firstMeow.speed);
    const meows = [
      { file: `meow-${'abc'[plan.sample]}.mp3`, at: firstMeow.t, rate: plan.playbackRate, gainDb: -10 },
      { file: 'meow-b.mp3', at: result.t + .6, rate: 1, gainDb: -6 }   // 結果の場面の頭のクラッシュが減ってから
    ];
    mkdirSync(dirname(out), { recursive: true });
    const inputs = meows.flatMap(m => ['-i', join(appDir, 'assets/sounds', m.file)]);
    const chains = meows.map((m, i) => `[${i + 2}:a]asetrate=48000*${m.rate.toFixed(4)},aresample=48000,pan=stereo|c0=c0|c1=c0,volume=${m.gainDb}dB,adelay=${Math.round(m.at * 1000)}:all=1[m${i}]`);
    const mix = `${chains.join(';')};[1:a]${meows.map((_, i) => `[m${i}]`).join('')}amix=inputs=${meows.length + 1}:normalize=0:duration=first[a]`;
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPS), '-i', join(work, '%05d.png'), '-i', wav, ...inputs,
      '-filter_complex', mix, '-vf', 'scale=1080:1920:flags=lanczos,format=yuv420p', '-map', '0:v:0', '-map', '[a]', '-c:v', 'libx264',
      '-preset', preview ? 'fast' : 'slow', '-crf', preview ? '26' : '20', '-c:a', 'aac', '-b:a', '192k',
      '-t', String(DURATION_SECONDS), '-map_metadata', '-1', '-movflags', '+faststart', out], { stdio: 'inherit' });
    // 1コマ目と確認用の一覧は mp4 と同じフォルダに書く（--out で試し描きを外へ出したとき、本番の分を上書きしない）
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', out, '-frames:v', '1', join(dirname(out), 'promo-first-frame.png')]);
    // 一覧：上3段が2秒おき（0〜32秒）、下3段が奇数秒（1〜33秒）
    const pick = seconds => `select='${seconds.map(s => `eq(n\\,${s * FPS})`).join('+')}',scale=270:480,tile=6x3:padding=6:margin=6:color=0x0d171b`;
    const even = Array.from({ length: 17 }, (_, i) => i * 2), odd = Array.from({ length: 17 }, (_, i) => i * 2 + 1);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', out, '-i', out, '-filter_complex', `[0:v]${pick(even)}[a];[1:v]${pick(odd)}[b];[a][b]vstack`,
      '-frames:v', '1', '-q:v', '3', join(dirname(out), 'preview-contact.jpg')]);
    console.log(`BGM（${variant}案）: ${music.lufs.toFixed(2)} LUFS / 真のピーク ${music.truePeakDb.toFixed(2)} dBTP`);
    console.log(`鳴き声: ${meows.map(m => `${m.file} ${m.at.toFixed(2)}秒（速度${m.rate.toFixed(3)}倍・${m.gainDb}dB）`).join(' / ')}`);
    const checked = checkVideo(out, rect);
    console.log(`窓: ${Object.entries(GAME_FROM).map(([id, s]) => `${id} ${s.toFixed(2)}秒〜`).join(' / ')}`);
    console.log(`出力 ${out}。同じフォルダの promo-first-frame.png（1コマ目）と preview-contact.jpg（一覧）を目視し、音を聴いて確かめること。`);
    return { records, events, music, checked, meows };
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
