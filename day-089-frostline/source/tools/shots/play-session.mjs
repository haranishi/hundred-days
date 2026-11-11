// 採点役が「1手ずつ遊ぶ」ための窓口。ブラウザを1つ開いたままにして、手元だけで聞く小さな HTTP の口で操作と時間送りを受ける。
// 毎回ページを開き直さないので、1手が約1秒で返る。座標や速さの書き換えは受け付けない（プレイヤーと同じ操作と、出発地点への移動だけ）。
//
// 起動: node tools/shots/play-session.mjs --out DIR [--port 5184] [--w 1024 --h 640] [--url URL] [--webgl|--webkit] [--q low|mid|high] [--idle 600]
// 使い方（別の端末から curl で）:
//   /start?spawn=first-snow            開始のボタンを押し、出発地点へ移る（spawn は名前。省略すると最初の地点）
//   /step?seconds=0.5&steer=0.6&brake=0&tuck=0&jump=0&every=0.25
//                                      入力を置いて時間を送り、最後に1枚（every を付けるとその間隔でも）撮る。状態と出来事を返す
//   /key?code=KeyC                     鍵を1回押す（KeyC=視点, KeyR=出発地点へ戻る, KeyE=安全な所へ戻る, Escape=一時停止）
//   /tap?control=camera                画面のボタンを押す（指の操作の確認用）
//   /click?action=next                 開いている画面のボタンを押す（data-action・data-control・data-drop の値。selector=CSS でも指定できる）
//   /state                             いまの状態だけ返す
//   /quit                              ブラウザを閉じて終わる
// 何も来ないまま --idle 秒たつと、自分で閉じて終わる（開きっぱなしのブラウザを残さない）。
import http from 'node:http';
import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, webkit } from 'playwright';
import { GPU_ARGS, ready } from './common.mjs';

const { values } = parseArgs({ options: {
  url: { type: 'string', default: 'http://127.0.0.1:5183/' }, out: { type: 'string' }, port: { type: 'string', default: '5184' },
  w: { type: 'string', default: '1024' }, h: { type: 'string', default: '640' }, idle: { type: 'string', default: '600' },
  webgl: { type: 'boolean', default: false }, webkit: { type: 'boolean', default: false }, q: { type: 'string' }, touch: { type: 'boolean', default: false },
} });
if (!values.out) { console.error('--out DIR を指定してください'); process.exit(1); }
await mkdir(values.out, { recursive: true });
const url = new URL(values.url);
url.searchParams.set('debug', '1');
if (values.webgl) url.searchParams.set('webgl', '1');
if (values.q) url.searchParams.set('q', values.q);

const browser = await (values.webkit ? webkit : chromium).launch({ headless: true, ...(values.webkit ? {} : { args: GPU_ARGS }) });
const context = await browser.newContext({ viewport: { width: Number(values.w), height: Number(values.h) }, deviceScaleFactor: 1, hasTouch: values.touch, isMobile: values.touch });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const problems = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`${m.type()}: ${m.text().slice(0, 400)}`); });
page.on('pageerror', (e) => problems.push(`例外: ${e.message}`));
await page.goto(url.href, { waitUntil: 'load', timeout: 30000 });
await ready(page);
await page.evaluate(() => window.__ginrei.setManual(true));

let shot = 0;
let simTime = 0;
let closing = false;
let lastUse = Date.now();
const logFile = join(values.out, 'session-log.jsonl');

const summary = () => page.evaluate(() => {
  const s = window.__ginrei.state();
  const r = (v, n = 1) => Number(v.toFixed(n));
  return {
    gear: s.gear ?? 'board', mode: s.mode, kmh: r(s.speed * 3.6), pos: [r(s.pos.x), r(s.pos.y), r(s.pos.z)], heading: r(s.heading * 57.2958, 0),
    edgeDeg: r(s.edge * 57.2958), slipDeg: r(s.slip * 57.2958), load: r(s.load, 2), leg: r(s.leg, 2), crouch: r(s.crouch, 2),
    snow: { powder: r(s.snow.powder, 2), packed: r(s.snow.packed, 2), ice: r(s.snow.ice, 2), rock: r(s.snow.rock, 2) },
    air: { time: r(s.air.time, 2), spinDeg: r((s.air.spin || 0) * 57.2958, 0), flipDeg: r((s.air.flip || 0) * 57.2958, 0), grab: s.air.grab || 0, grabTime: r(s.air.grabTime || 0, 2) },
    spray: r(s.tele.spray, 2), switch: s.switch,
    hud: document.querySelector('[data-screen="hud"]')?.innerText?.replace(/\s+/g, ' ').slice(0, 200) ?? '',
    screen: [...document.querySelectorAll('[data-screen]')].filter((e) => !e.hidden).map((e) => e.dataset.screen),
    // 開いている画面（記録・地図・一時停止など）の文字と、押せるボタン。採点役はこれを読んで /click で押す
    panel: [...document.querySelectorAll('[data-screen]')].filter((e) => !e.hidden && e.dataset.screen !== 'hud').map((e) => e.innerText?.replace(/\s+/g, ' ').slice(0, 700)).join(' ｜ '),
    buttons: [...document.querySelectorAll('button')].filter((e) => !e.disabled && e.offsetParent !== null).map((e) => `${e.dataset.action || e.dataset.control || e.dataset.drop || ''}:${e.innerText.replace(/\s+/g, ' ').slice(0, 24)}`).slice(0, 40),
    play: window.__ginrei.play?.()?.status ?? null,
  };
});

async function snap() {
  const file = join(values.out, `s${String(shot++).padStart(3, '0')}.png`);
  // 時間を進めずに同じ絵を描き直してから撮る（理由は play-probe.mjs と同じ）
  await page.evaluate(() => new Promise((done) => {
    window.__ginrei.advance(0);
    requestAnimationFrame(() => { window.__ginrei.advance(0); requestAnimationFrame(() => { window.__ginrei.advance(0); requestAnimationFrame(done); }); });
  }));
  await page.screenshot({ path: file });
  return file;
}

const num = (v, d = 0) => (v === null || v === undefined || v === '' ? d : Number(v));

async function handle(path, q) {
  if (path === '/start') {
    const hud = await page.evaluate(() => document.querySelector('[data-screen="hud"]')?.hidden === false);
    if (!hud) {
      await page.locator('[data-start]').click();
      await page.waitForFunction(() => document.querySelector('[data-screen="hud"]')?.hidden === false, null, { timeout: 10000 });
    }
    const spawn = q.get('spawn');
    if (spawn) await page.evaluate((name) => window.__ginrei.teleport(name), spawn);
    // feature=<仕掛けの id>：その仕掛けの「やり直しの戻り先」（ゲームが、仕掛けを通った直後のやり直しで戻す所）から始める。
    // ゲームの中の機能と同じ場所・同じ初速。山の中から、仕掛けを 1 つずつ確かめるための近道
    const feature = q.get('feature');
    if (feature) {
      const found = await page.evaluate((id) => {
        const map = window.__ginrei.play().map, f = map.features.find(v => v.id === id);
        if (!f?.approach) return null;
        const a = f.approach, drop = map.drops.find(d => !d.locked) ?? map.drops[0];
        // 出発地点の課題と記録は、開いている地点のものを使う（仕掛けには、課題が無い）
        window.__ginrei.teleport({ ...drop, x: a.x, z: a.z, heading: a.heading ?? f.heading, speed: a.speed ?? 0 });
        return { id: f.id, kind: f.kind, name: f.name, approach: a };
      }, feature);
      if (!found) return { error: `仕掛けが見つかりません：${feature}（/state の features を見てください）` };
    }
    await page.evaluate(() => { window.__ginrei.setInput({}); window.__ginrei.advance(0); });
    return { file: await snap(), state: await summary() };
  }
  if (path === '/step') {
    const seconds = Math.min(10, Math.max(0, num(q.get('seconds'), 0.5)));
    const input = { steer: Math.max(-1, Math.min(1, num(q.get('steer')))), brake: Math.max(0, Math.min(1, num(q.get('brake')))), tuck: Math.max(0, Math.min(1, num(q.get('tuck')))), jump: q.get('jump') === '1' };
    const every = num(q.get('every'), 0);
    const files = [];
    const events = [];
    let left = seconds;
    await page.evaluate((i) => window.__ginrei.setInput(i), input);
    while (left > 1e-9) {
      const chunk = every > 0 ? Math.min(every, left) : left;
      // 物理と描画は 1/60 秒ずつ送る（1回で何秒も送ると、描画の追従が1コマで飛ぶ）
      const got = await page.evaluate((sec) => {
        const seen = [];
        for (let t = 0; t < sec - 1e-9; t += 1 / 60) {
          window.__ginrei.advance(Math.min(1 / 60, sec - t));
          for (const e of window.__ginrei.events?.() ?? []) {
            const row = { type: e.type, speed: Number((e.speed * 3.6).toFixed(0)), efh: Number((e.efh || 0).toFixed(2)), quality: e.quality || undefined, reason: e.reason || undefined, cause: e.cause || undefined, obstacle: e.obstacleType || undefined };
            // 着地には、回った量・つかみ・滞空・落差も付ける（技の確認用）
            if (e.type === 'land') Object.assign(row, { spinDeg: Math.round((e.spin || 0) * 57.2958), flipDeg: Math.round((e.flip || 0) * 57.2958), grab: e.grab || 0, air: Number((e.air || 0).toFixed(2)), drop: Number((e.drop || 0).toFixed(1)), pop: !!e.pop });
            seen.push(row);
          }
        }
        return seen;
      }, chunk);
      events.push(...got);
      left -= chunk;
      simTime += chunk;
      files.push(await snap());
    }
    return { files, simTime: Number(simTime.toFixed(2)), input, events, state: await summary() };
  }
  if (path === '/key') {
    await page.keyboard.press(q.get('code') || 'KeyC');
    await page.evaluate(() => window.__ginrei.advance(0));
    return { file: await snap(), state: await summary() };
  }
  if (path === '/click') {
    // 画面のボタンを、目印（data-action・data-control・data-drop の値）か CSS の指定で押す
    const name = q.get('action') || q.get('name');
    const selector = q.get('selector') || `[data-action="${name}"], [data-control="${name}"], [data-drop="${name}"]`;
    const target = page.locator(selector).filter({ visible: true }).first();
    await target.click({ timeout: 4000 });
    await page.evaluate(() => window.__ginrei.advance(0));
    return { file: await snap(), state: await summary() };
  }
  if (path === '/tap') {
    await page.locator(`[data-control="${q.get('control')}"]`).first().click();
    await page.evaluate(() => window.__ginrei.advance(0));
    return { file: await snap(), state: await summary() };
  }
  // 状態と、山の地図の中身（出発地点・駅・仕掛け）。地図の画面を開かなくても、行き先を選べるように
  if (path === '/state') return { state: await summary(), ...(await page.evaluate(() => {
    const map = window.__ginrei.play().map, r = (v) => Math.round(v);
    return {
      drops: map.drops.map(d => ({ id: d.id, name: d.name, level: d.level, kind: d.kind, locked: d.locked, about: d.about, pos: [r(d.x), r(d.z)], goals: d.goals.map(g => `${g.earned ? '★' : '☆'}${g.label}`) })),
      stations: map.stations.map(s => ({ id: s.id, name: s.name, pos: [r(s.x), r(s.z)] })),
      features: map.features.map(f => ({ id: f.id, kind: f.kind, size: f.size, name: f.name, pos: [r(f.x), r(f.z)], speed: f.speed, air: f.air, drop: f.drop ?? f.height })),
    };
  })) };
  if (path === '/quit') { closing = true; return { bye: true }; }
  return { error: '知らない命令です', usage: '/start?spawn=地点 または ?feature=仕掛け /step /key /tap /click /state /quit' };
}

let busy = Promise.resolve();
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  lastUse = Date.now();
  // 命令は1つずつ順番に処理する
  busy = busy.then(async () => {
    let body;
    try {
      body = await handle(u.pathname, u.searchParams);
      const errors = await page.evaluate(() => window.__ginrei.errors.slice()).catch(() => []);
      if (problems.length || errors.length) body.problems = [...problems.splice(0), ...errors];
    } catch (error) { body = { error: String(error?.message || error).slice(0, 600) }; }
    await appendFile(logFile, `${JSON.stringify({ at: new Date().toISOString(), path: u.pathname + u.search, ...body })}\n`).catch(() => {});
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(`${JSON.stringify(body)}\n`);
    if (closing) await shutdown();
  });
});

async function shutdown() {
  clearInterval(watch);
  server.close();
  await browser.close().catch(() => {});
  process.exit(0);
}
const watch = setInterval(() => { if (Date.now() - lastUse > Number(values.idle) * 1000) shutdown(); }, 5000);
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
server.listen(Number(values.port), '127.0.0.1', () => console.log(`play-session 準備完了 http://127.0.0.1:${values.port}  出力 ${values.out}`));
