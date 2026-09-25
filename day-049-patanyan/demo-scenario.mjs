// デモの振り付け。タイトル→タップで飛び立ち、爪とぎポールのすき間をくぐって魚を集め、羽ばたきをやめてぶつかり、
// ずっこけて結果カードが出るまで（約18秒）。ゲームは実時間のまま動かし、羽ばたく時だけ ?test=1 のつまみ（flap）を押す。
// record-demo はページを file:// で開くが、ES モジュールは file:// では読めないので、小さなHTTPサーバーを立てて開き直す
// （Day 048 と同じ）。録画の頭（file:// の画面と読み込み）は書き出し時に切る前提。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp' };
// くぐる本数。多いほど長い動画になる（1本あたり約1.4秒）。尺の目安15〜20秒に収めるため7本
const POLES = Number(process.env.DEMO_POLES) || 7;

let base;
async function serve() {
  if (base) return base;
  const server = createServer(async (request, response) => {
    try {
      let path = decodeURIComponent(new URL(request.url, 'http://local').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = resolve(root, `.${path}`);
      if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }).end(body);
    } catch {
      if (!response.headersSent) response.writeHead(404);
      response.end();
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  server.unref();
  return (base = `http://127.0.0.1:${server.address().port}/`);
}

async function open(page, query) {
  await page.goto(`${await serve()}${query}`);
  await page.waitForFunction(() => document.body.dataset.boot === 'ready');
}

export default async function (page, h) {
  await open(page, '?test=1');
  await h.pause(1600); // タイトルと、待機中の猫
  // 実時間の自動操縦。次のすき間に魚が残っていれば魚の高さを、無ければ中心より少し下を割ったら羽ばたく。
  // 決めた本数をくぐったら、すき間より上を飛び続けて上のポールにぶつかる（星が出て、ずっこける場面を見せる）
  await page.evaluate((poles) => new Promise((done) => {
    const pilot = window.__patanyan;
    pilot.flap();
    const step = () => {
      const s = pilot.state();
      if (s.screen === 'result') { done(); return; }
      if (s.screen === 'flying') {
        const g = s.game;
        const next = g.poles.find((p) => p.x + p.w + g.cat.r > g.cat.x);
        let target = 210;
        if (next && g.score >= poles) target = next.top - 30;
        else if (next && next.fish && !next.fish.taken) target = next.fish.y + 12;
        else if (next) target = next.center + next.gap * 0.18;
        if (g.cat.y > target && g.cat.vy >= 0) pilot.flap();
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), POLES);
  await h.pause(2400); // 結果カード
}

// 一覧のスクショ（1200×750）は、飛んでいる途中を止めて撮る。時間は手で進める
export const shotScroll = 0;
export async function shotSetup(page) {
  await open(page, '?test=1&seed=424242');
  await page.evaluate(() => {
    const pilot = window.__patanyan;
    pilot.setManual(true);
    pilot.setMode('any');
    let s = pilot.state();
    for (let i = 0; i < 120 * 30; i += 1) {
      const g = s.game;
      if (s.screen === 'title') pilot.flap();
      else if (s.screen === 'flying') {
        const next = g.poles.find((p) => p.x + p.w + g.cat.r > g.cat.x);
        const target = next ? next.center + next.gap * 0.18 : 210;
        if (g.cat.y > target && g.cat.vy >= 0) pilot.flap();
      } else break;
      s = pilot.advance(1 / 120);
      // 4本くぐり、次のすき間の手前で羽ばたいた直後の姿で止める
      if (s.game.score >= 4 && s.game.cat.vy < -150) break;
    }
  });
  await page.waitForTimeout(300);
}
