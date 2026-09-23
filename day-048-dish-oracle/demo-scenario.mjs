// デモの振り付け。たこ焼きを思い浮かべた人が正直に答え、水晶玉のまぼろしが次第にはっきりして、当たるまで（約15秒）。
// record-demo はページを file:// で開くが、ES モジュールは file:// では読めないので、小さなHTTPサーバーを立てて開き直す。
// 録画の頭（file:// の画面と読み込み）は書き出し時に切る前提。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp' };
const DISH = 'takoyaki';
const FIRST_SEED = 20260923;

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
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  server.unref();
  return (base = `http://127.0.0.1:${server.address().port}/`);
}

// 正直に答える人（単体テストの players.mjs と同じ区切り）
function honest(p) {
  if (p >= 0.8) return 'yes';
  if (p >= 0.6) return 'probably';
  if (p > 0.4) return 'unknown';
  if (p > 0.2) return 'probablyNot';
  return 'no';
}

// 見栄えのよい種を選ぶ：最初の推測でたこ焼きに当たり、9〜12問で終わり、最後の4問以上はまぼろしがたこ焼きのまま濃くなっていく。
// データを直すと同じ種でも流れが変わるので、固定の数字にせず、いまのエンジンで毎回選び直す（1つ2ms程度）
export async function pickSeed() {
  const { buildModel, newGame, nextStep, answer, probabilityOf } = await import(pathToFileURL(resolve(root, 'lib/oracle.js')).href);
  const model = buildModel();
  for (let seed = FIRST_SEED; seed < FIRST_SEED + 2000; seed++) {
    let game = newGame(seed);
    let steady = 0;
    for (let turn = 0; turn < 30; turn++) {
      const step = nextStep(model, game);
      steady = step.ranked[0].id === DISH ? steady + 1 : 0;
      if (step.type !== 'ask') {
        const count = game.answers.length;
        if (step.type === 'guess' && step.id === DISH && count >= 9 && count <= 12 && steady >= 5) return seed;
        break;
      }
      game = answer(game, step.q, honest(probabilityOf(model, DISH, step.q)));
    }
  }
  throw new Error('振り付けに使える種が見つかりません');
}

async function open(page) {
  await page.goto(`${await serve()}?seed=${await pickSeed()}`, { waitUntil: 'load' });
  await page.waitForSelector('html[data-ready="true"]');
}

// 画面と同じモデルで答えを決め、実際のボタンを押す。
// 画面は新しい質問が出た直後の答えを受け流す（二度押し対策・350ms）ので、受け付けるようになるまで待ってから押す
async function answerHonestly(page) {
  await page.waitForFunction(() => window.__day048.snapshot().accepting);
  const id = await page.evaluate(async dish => {
    const { probabilityOf } = await import('./lib/oracle.js');
    const p = probabilityOf(window.__day048.model(), dish, window.__day048.snapshot().q);
    if (p >= 0.8) return 'yes';
    if (p >= 0.6) return 'probably';
    if (p > 0.4) return 'unknown';
    if (p > 0.2) return 'probablyNot';
    return 'no';
  }, DISH);
  await page.locator(`#answers button[data-answer="${id}"]`).click();
  // 押したボタンの上にマウスが残ると、次の質問でも同じ答えが選ばれて見える。押した答えは画面側が一瞬光らせる
  await page.mouse.move(4, 4);
}

const state = page => page.evaluate(() => window.__day048.snapshot().state);

export default async function demo(page, h) {
  await open(page);
  await h.pause(300); // 頭（file:// の画面と読み込み）は書き出しで切る。すぐ動き出すようにして、切った1コマ目を動きの途中にする
  await page.locator('#start').click();
  await h.pause(1000); // 舞台が低くなり、最初の質問が出る
  for (let turn = 0; turn < 30 && (await state(page)) === 'asking'; turn++) {
    await answerHonestly(page);
    await h.pause(780);
  }
  // 推測：ぼかしが取れて、まぼろしがはっきり映るまで見せる
  await h.pause(1900);
  if ((await state(page)) === 'guessing') await page.locator('#guess-yes').click();
  await h.pause(3400); // 決め手と結果の共有行まで見せる
}

export const shotScroll = 0;
// 一覧用のスクショは推測の瞬間（水晶玉にたこ焼きがはっきり映り、「当たり！」「ちがう」を待っているところ）
export async function shotSetup(page) {
  await open(page);
  await page.locator('#start').click();
  for (let turn = 0; turn < 30 && (await state(page)) === 'asking'; turn++) await answerHonestly(page);
  await page.waitForTimeout(1600);
}
