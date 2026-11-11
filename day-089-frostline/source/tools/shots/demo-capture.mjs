// 100 日チャレンジの一覧に載せる、デモ動画（無音・約 16 秒）と、カードの画像・リンクの見出し画像を撮る。
// 物理を 1/30 秒ずつ手で進めて、1 コマずつ撮る（画面なしのブラウザの速さに左右されず、毎回同じ動画になる）。
// node tools/shots/demo-capture.mjs --out DIR [--url http://127.0.0.1:5185/]
import { mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { GPU_ARGS, ready } from './common.mjs';

const { values } = parseArgs({ options: { url: { type: 'string', default: 'http://127.0.0.1:5185/' }, out: { type: 'string' } } });
if (!values.out) throw Error('--out DIR を指定してください');
const FPS = 30, out = values.out;
await mkdir(out, { recursive: true });
// 1 コマ目から動いている（題字の札から始めない）。前半：スノーボードで台を越えて回る→着地して切る。後半：スキーで大きく切る
const alternate = (t, period, amount) => (Math.sin(t * Math.PI / period) >= 0 ? amount : -amount);
const SEGMENTS = [
  { id: 'a-board', gear: 'board', spawn: 'jump-valley', skip: 3.4, seconds: 10,
    // 構えたまま台を越え、踏み切りの直前から舵を 1.05 秒：テールをつかんで 360°、きれいに着地（物理だけで確かめた値）
    input: t => ({ jump: t > 5.0 && t < 8.6, steer: t > 6.0 && t < 7.05 ? 1 : t > 8.6 ? alternate(t - 8.6, 1.0, 0.8) : 0 }) },
  { id: 'b-ski', gear: 'ski', spawn: 'first-snow', skip: 2.5, seconds: 6, input: t => ({ steer: alternate(t, 1.2, 0.9) }) },
];
const STILLS = [
  // 一覧のカード（1200×750）：台を越えて回っているところ
  { file: 'screenshot.png', gear: 'board', spawn: 'jump-valley', at: 6.75, size: { width: 1200, height: 750 }, input: SEGMENTS[0].input },
];

async function open(browser, gear, size) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  // 操作の案内は出さない（設定の hints）。道具は、撮る場面ごと
  await context.addInitScript(([g]) => localStorage.setItem('ginrei.settings.v1', JSON.stringify({ hints: false, gear: g })), [gear]);
  const page = await context.newPage();
  const problems = [];
  page.on('console', m => { if (m.type() === 'error') problems.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => problems.push(e.message));
  const url = new URL(values.url); url.searchParams.set('debug', '1');
  await page.goto(url.href, { waitUntil: 'load' });
  await ready(page);
  await page.locator('[data-start]').click();
  await page.evaluate(() => window.__ginrei.setManual(true));
  // 画面のボタン（視点・地図・一時停止）は写さない。速さの表示と、技の名前は残す
  await page.addStyleTag({ content: '.controls { visibility: hidden !important; }' });
  return { context, page, problems };
}
async function run(page, spawn, input, from, to, shoot) {
  await page.evaluate(s => window.__ginrei.teleport(s), spawn);
  let t = 0;
  // 撮り始めまでは、物理だけを進める
  await page.evaluate(([steps]) => { for (const [i, dt] of steps) { window.__ginrei.setInput(i); window.__ginrei.advance(dt); } },
    [Array.from({ length: Math.round(from * FPS) }, (_, k) => [input(k / FPS), 1 / FPS])]);
  t = Math.round(from * FPS) / FPS;
  for (let k = 0; t < to - 1e-9; k++) {
    await page.evaluate(([i, dt]) => new Promise(done => { window.__ginrei.setInput(i); window.__ginrei.advance(dt); requestAnimationFrame(() => requestAnimationFrame(done)); }), [input(t), 1 / FPS]);
    t += 1 / FPS;
    await shoot(k, t);
  }
}

const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
const problems = [];
try {
  const clips = [];
  for (const seg of SEGMENTS) {
    const dir = join(out, seg.id); await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
    const { context, page, problems: p } = await open(browser, seg.gear, { width: 960, height: 600 });
    const landings = [];
    await run(page, seg.spawn, seg.input, seg.skip, seg.skip + seg.seconds, async k => {
      await page.screenshot({ path: join(dir, `${String(k).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
      for (const e of await page.evaluate(() => window.__ginrei.events())) if (e.type === 'land' && (e.air ?? 0) > .3) landings.push(`${(k / FPS).toFixed(2)} 秒：滞空 ${e.air.toFixed(2)}・回転 ${e.spinDeg}°・${e.quality}`);
    });
    if (landings.length) console.log(`着地（${seg.id}）：${landings.join(' ／ ')}`);
    problems.push(...p); await context.close();
    const clip = join(out, `${seg.id}.mp4`);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(dir, '%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '27', '-preset', 'slow', clip]);
    clips.push(clip); console.log(`撮った：${seg.id}（${seg.seconds} 秒）`);
  }
  // つなぐ（切り替えは、そのまま切る）。音は入れない
  const list = join(out, 'clips.txt');
  execFileSync('sh', ['-c', `printf "file '%s'\\n" ${clips.map(c => `'${c.replace(out + '/', '')}'`).join(' ')} > '${list}'`]);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', '-an', join(out, 'demo.mp4')]);
  for (const still of STILLS) {
    const { context, page, problems: p } = await open(browser, still.gear, still.size);
    await run(page, still.spawn, still.input, Math.max(0, still.at - 1 / FPS), still.at, () => page.screenshot({ path: join(out, still.file) }));
    problems.push(...p); await context.close();
  }
  // リンクを貼ったときの見出し画像（1200×630）：題字の画面。下の操作のまとまりは写さない
  {
    const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => localStorage.setItem('ginrei.settings.v1', JSON.stringify({ hints: false, gear: 'board' })));
    const page = await context.newPage();
    await page.goto(values.url, { waitUntil: 'load' });
    await page.locator('[data-start]:enabled').waitFor({ timeout: 60000 });
    // 小さく表示されても読めるよう、名前の下の一行を大きくする（題字の画面のままの 16 px では、X のカードで読めなかった）
    await page.addStyleTag({ content: '.title-bottom { visibility: hidden !important; } .title-mark { padding-top: 56px !important; } .title-mark p { font-size: 30px !important; letter-spacing: .12em; margin-top: 6px; }' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(out, 'og.png') });
    await context.close();
  }
} finally { await browser.close(); }
console.log(problems.length ? `コンソールの誤り：\n${problems.join('\n')}` : '問題なし');
