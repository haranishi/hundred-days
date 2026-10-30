import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { LEVELS } from '../../day-066-hakokage-kaito/lib/levels-data.js';
import { loadLevel, initialState, act, scene, replay, WAIT } from '../../day-066-hakokage-kaito/lib/sim.js';
import { PROTECTED_WORDS, PROTECTED_PATTERNS } from '../../day-066-hakokage-kaito/lib/wrap.js';

/* Day 066 箱影の怪盗。ルール・面データ・文は day-066-hakokage-kaito/tests の単体テストが見る。
   ここでは公開ページとして、本番と同じCSPの下で開けること、全8面で「画面に見えている光・予告・影＝ルールの計算」であること、
   面1をタップだけ・キーボードだけでクリアできること、見つかった理由の文と二重の枠、詰みとお手本、画面幅ごとのはみ出しと押せる大きさ、
   押す間隔を振っても結果が同じこと（連打・動きの途中の「戻す」）、動きを減らす設定、面の帯と保存、共有、キーとフォーカス、読み上げの名前を確かめる。
   修正1周目（体験評価の指摘）：Space は待つ（マウスで押したボタンが残っていても。Tab で当てたボタンだけ、そのボタンの1手）、文字のキーを止めたときのキー案内、
   見張り・警備員にぶつかった一言、お手本の札が盤の外・お手本の1手700ms・終わりの一言、窓を Esc で閉じたときの焦点、窓の中の文字が右で切れないこと、
   ヒントが画面幅ごとに収まること、wide の幅700〜900で右の列が狭くても崩れないこと。

   手元の配信（scripts/serve-dist.mjs）はヘッダーを付けないので、dist/_headers の CSP をそのまま当てる。
   status が draft の間は dist に入らない（検査のときだけ published にして build する）。
   CPU_SLOW=5 や 10 を付けると、ページの CPU を遅くして全部を流す（押すタイミングが関わる試験の安定を見る）。 */

const DIR = 'day-066-hakokage-kaito';
const PATH = `/${DIR}/`;
const PUBLIC_URL = `https://rairakku.com/100days/${DIR}/`;
const STORAGE = 'hakokageKaito.v1';
const headers = readFileSync('dist/_headers', 'utf8');
const policy = (headers.split(`\n/${DIR}/*\n`)[1] ?? '').split('\n')[0].trim().replace('Content-Security-Policy: ', '');
const SLOW = Number(process.env.CPU_SLOW || 1);
const LONG = (ms) => ms * SLOW; // 重い試験の制限時間

test.beforeAll(() => {
  expect(policy, `dist/_headers に ${DIR} が無い（meta.json を published にして npm run build したか）`).toContain("script-src 'self'");
});

// CPU を遅くした実行では、全部の試験の制限時間を同じ倍率で延ばす
test.beforeEach(({}, info) => {
  if (SLOW > 1) info.setTimeout(info.timeout * SLOW);
});

const DEMO_MS = 700; // お手本の1手（app.js の DEMO_STEP_MS）。400msでは速くて目で追えなかった（体験評価）
const DEMO_END = 'お手本はここまで。最初から自分でやってみよう';
const BTN = { U: '#btn-up', R: '#btn-right', D: '#btn-down', L: '#btn-left', '.': '#btn-wait' };
const KEY = { U: 'ArrowUp', R: 'ArrowRight', D: 'ArrowDown', L: 'ArrowLeft', '.': 'Space' };
const level = (no) => loadLevel(LEVELS[no - 1]);

async function open(page, query = '') {
  const errors = [];
  const outside = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  // CSPに止められた読み込みは例外にならないことがあるので、違反の知らせそのものを集める
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  // 手元の配信サーバー以外への通信は、すべて止めて記録する
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1:')) return route.fallback();
    outside.push(url);
    return route.abort();
  });
  await page.route((url) => url.pathname === PATH, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
  });
  if (SLOW > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW });
  }
  await page.goto(`${PATH}${query}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  return { errors, outside };
}

async function expectClean(page, seen) {
  expect(seen.errors, 'コンソールのエラー・例外').toEqual([]);
  expect(seen.outside, '外への通信').toEqual([]);
  expect(await page.evaluate(() => window.__cspViolations), 'CSP違反').toEqual([]);
  // 画面に出ている文字に、値の入れ忘れ（null・undefined・NaN・[object …]）が混ざっていない
  const shown = await page.evaluate(() => document.body.innerText);
  expect(shown.match(/\bnull\b|\bundefined\b|\bNaN\b|\[object /g), '画面に値の入れ忘れの文字が出ている').toBeNull();
}

// 手を進める。1手ごとにボタンを押す（動きの途中でも次の手が入る＝連打と同じ）
async function tap(page, moves) {
  for (const m of moves) await page.locator(BTN[m]).click();
}

const app = (page) => page.locator('#app');
const steps = (page, n) => expect(app(page)).toHaveAttribute('data-steps', String(n));
const status = (page, s) => expect(app(page)).toHaveAttribute('data-status', s);
// 動きが終わるまで（data-moving が外れるまで）待つ。動きの終わりには盤を描き直すので、そのあとの位置・光を読む
const settled = (page) => expect(app(page)).not.toHaveAttribute('data-moving', '1');

async function readBoard(page) {
  return page.evaluate(() => {
    const set = (attr) => [...document.querySelectorAll(`.cell[data-${attr}]`)].map((c) => `${c.dataset.x},${c.dataset.y}`).sort();
    const at = (sel) => [...document.querySelectorAll(sel)].map((e) => `${e.dataset.x},${e.dataset.y}`);
    return {
      lit: set('lit'), next: set('next'), shadow: set('shadow'),
      player: at('.player')[0], boxes: at('.box'), guards: at('.guard'),
      facing: [...document.querySelectorAll('.guard')].map((g) => g.dataset.facing),
      nextAction: [...document.querySelectorAll('.guard')].map((g) => g.dataset.nextAction ?? ''),
    };
  });
}

function expectedBoard(lv, state) {
  const sc = scene(lv, state);
  const keys = (cells) => [...new Set(cells.map((c) => c.join()))].sort();
  return {
    lit: [...sc.lit].sort(),
    next: keys((sc.preview ? sc.preview.beams : []).flatMap((b) => b.cells)),
    shadow: keys(sc.shadows.map((s) => s.cell)),
    player: state.player.join(),
    boxes: state.boxes.map((b) => b.join()),
    guards: sc.guards.map((g) => g.at.join()),
    facing: sc.guards.map((g) => g.facing),
    nextAction: sc.guards.map((_, i) => (sc.preview ? sc.preview.moves[i].action : '')),
  };
}

// 同じ試験群を、動きを減らす設定（描き直しが同期で終わる）と通常の動き（150msの動き＋タイマー）の両方で流す。
// 注意：test.use({ reducedMotion }) は効かない（matchMedia が false のまま）ので、contextOptions に入れる
for (const motion of ['reduce', 'no-preference']) {
  test.describe(`${motion === 'reduce' ? '動きを減らす設定' : '通常の動き'}：1手ごとの描き直し・結果の欄・お手本・保存・共有`, () => {
  test.use({ contextOptions: { reducedMotion: motion } });

  test('本番と同じCSPで開き、エラー・CSP違反・外への通信が0件。画面の型・盤・面の帯が出ている', async ({ page }) => {
    const seen = await open(page);
    await expect(page.getByRole('heading', { name: '箱影の怪盗', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: '100 DAYS / 066' })).toHaveAttribute('href', '../');
    await expect(page.locator('html')).toHaveAttribute('data-layout', /^(tall|compact|tiny|short|wide)$/);
    await expect(app(page)).toHaveAttribute('data-level', 'L1');
    await status(page, 'play');
    await expect(page.locator('#level-title')).toHaveText('面1 はじめの影');
    await expect(page.locator('#board')).toHaveAttribute('role', 'img');
    await expect(page.locator('#board')).toHaveAttribute('aria-label', '面1の盤。横6・縦4マス。あなたは左から5・上から1。宝はまだ');
    await expect(page.locator('#board .cell')).toHaveCount(24);
    await expect(page.locator('#steps')).toHaveText('0');
    await expect(page.locator('#par')).toHaveText('10');
    await expect(page.locator('#treasure-state')).toHaveText('まだ');
    await expect(page.locator('.exit')).toHaveAttribute('data-open', '0');
    await expect(page.locator('.treasure')).toHaveAttribute('data-taken', '0');
    // 盤の中の図形は読み上げに出さない
    expect(await page.locator('#board .layer').evaluateAll((nodes) => nodes.every((n) => n.getAttribute('aria-hidden') === 'true'))).toBe(true);
    await expectClean(page, seen);
  });

  test('見えている光＝判定：全8面で、最初と見本の解の各手のあとに、光・次の1手で光るマス・影・怪盗・箱・警備員が sim の計算と一致する', async ({ page }) => {
    test.setTimeout(LONG(180_000)); // 全8面の全手（計 190手あまり）を突き合わせる
    const seen = await open(page);
    for (const L of LEVELS) {
      const lv = level(L.no);
      await page.goto(`${PATH}?level=${L.no}`);
      await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
      await expect(app(page)).toHaveAttribute('data-level', L.id);
      let state = initialState(lv);
      expect(await readBoard(page), `面${L.no} 最初`).toEqual(expectedBoard(lv, state));
      for (let i = 0; i < L.solution.length; i++) {
        const a = L.solution[i];
        await page.locator(BTN[a]).click();
        state = act(lv, state, a).state;
        const finishing = i === L.solution.length - 1;
        if (finishing) await status(page, 'escaped');
        else await steps(page, i + 1);
        await settled(page);
        const board = await readBoard(page);
        const want = expectedBoard(lv, state);
        if (finishing) {
          // 成功のあとは予告を出さない。光と影は最後の状態のもの
          expect(board.lit, `面${L.no} 成功の光`).toEqual(want.lit);
          expect(board.next, `面${L.no} 成功のあと予告は出ない`).toEqual([]);
          expect(board.shadow, `面${L.no} 成功の影`).toEqual(want.shadow);
        } else {
          expect(board, `面${L.no} ${i + 1}手目 ${L.solution.slice(0, i + 1)}`).toEqual(want);
        }
      }
      await expect(page.locator('#clear-stars')).toHaveAttribute('data-stars', '3');
    }
    await expectClean(page, seen);
  });

  test('面1をタップだけで：見本の解 → 成功の欄・★3・手数10。再読み込みで面2が開き、面の一覧の面1に★3と記録', async ({ page }) => {
    const seen = await open(page);
    await expect(page.locator('#panel-clear')).toBeHidden();
    await tap(page, LEVELS[0].solution);
    await expect(page.locator('#panel-clear')).toBeVisible();
    await expect(page.locator('#controls')).toBeHidden();
    await expect(page.locator('#status')).toBeHidden();
    await status(page, 'escaped');
    await steps(page, 10);
    await expect(page.locator('#clear-stars')).toHaveAttribute('data-stars', '3');
    await expect(page.locator('#clear-stars-text')).toHaveText('星3つ');
    await expect(page.locator('#clear-steps')).toHaveText('10手（最少 10手）');
    await expect(page.locator('#clear-note')).toHaveText('最少手数で脱出！');
    await expect(page.locator('#clear-title-text')).toHaveText('脱出成功！');
    await expect(page.locator('#btn-next')).toHaveText('次の面へ');
    await expect(page.locator('#btn-next')).toBeFocused();
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).levels.L1, STORAGE)).toEqual({ stars: 3, best: 10 });
    await expectClean(page, seen);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    // まだ星のない最初の面から始まる
    await expect(page.locator('#level-title')).toHaveText('面2 交わる光');
    await page.locator('#btn-levels').click();
    const row = page.locator('.level-row[data-level="L1"]');
    await expect(row).toHaveAttribute('aria-label', '面1 はじめの影。星3つ。記録10手');
    await expect(row).toContainText('記録 10手');
    await expect(row.locator('svg.stars')).toHaveAttribute('aria-label', '星3つ中3つ');
    await expect(page.locator('.level-row[data-level="L2"]')).toHaveAttribute('aria-label', '面2 交わる光。まだ');
    await expect(page.locator('.level-row[aria-current="true"]')).toHaveAttribute('data-level', 'L2');
  });

  test('成功の欄の「次の面へ」で面2へ。もう一度遊ぶで同じ面を最初から（記録は残る）。面8の成功では「面をえらぶ」と全8面クリア', async ({ page }) => {
    const seen = await open(page);
    await tap(page, LEVELS[0].solution);
    await expect(page.locator('#btn-next')).toBeVisible();
    await page.locator('#btn-again').click();
    await status(page, 'play');
    await steps(page, 0);
    await expect(page.locator('#panel-clear')).toBeHidden();
    await expect(page.locator('#btn-wait')).toBeFocused();
    await tap(page, LEVELS[0].solution);
    await page.locator('#btn-next').click();
    await expect(page.locator('#level-title')).toHaveText('面2 交わる光');
    await expect(page.locator('#btn-wait')).toBeFocused();
    await steps(page, 0);
    // 面8：ほかの7面に星を付けてから面8を解くと、全8面クリア。次の面が無いので「面をえらぶ」
    await page.evaluate(({ key, ids }) => {
      localStorage.setItem(key, JSON.stringify({ muted: false, letterKeys: true, levels: Object.fromEntries(ids.map((id) => [id, { stars: 3, best: 10 }])) }));
    }, { key: STORAGE, ids: LEVELS.slice(0, 7).map((L) => L.id) });
    await page.goto(`${PATH}?level=8`);
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await tap(page, LEVELS[7].solution);
    await expect(page.locator('#panel-clear')).toBeVisible();
    await expect(page.locator('#btn-next')).toHaveText('面をえらぶ');
    await expect(page.locator('#clear-note')).toContainText('最少手数で脱出！');
    // 見出しは「全8面クリア！」（「脱出成功！」と重ねない）。星の合計も出す
    await expect(page.locator('#clear-title-text')).toHaveText('全8面クリア！');
    await expect(page.locator('#clear-note')).toContainText('星 24/24');
    await expect(page.locator('#panel-clear')).toHaveAttribute('data-all', '1');
    await page.locator('#btn-next').click();
    await expect(page.locator('#level-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#level-dialog')).toBeHidden();
    await expect(page.locator('#btn-next')).toBeFocused();
    await expectClean(page, seen);
  });

  test('面1をキーボードだけで：矢印とWASDで見本の解 → 成功。Space で待つ・Z で戻す・R で最初へ（取り消せる）・Esc で窓が閉じる', async ({ page }) => {
    const seen = await open(page);
    const keys = ['ArrowLeft', 'a', 'ArrowDown', 'ArrowRight', 'd', 's', 'ArrowDown', 'w', 'ArrowUp', 'ArrowRight']; // LLDRRDDUUR
    for (const k of keys) await page.keyboard.press(k);
    await expect(page.locator('#panel-clear')).toBeVisible();
    await steps(page, 10);
    await expect(page.locator('#clear-stars')).toHaveAttribute('data-stars', '3');
    // 成功のあとは R で「もう一度遊ぶ」（Enter は主ボタンにフォーカスがあるので次の面へ）
    await page.keyboard.press('r');
    await status(page, 'play');
    await steps(page, 0);
    await page.goto(`${PATH}?level=1`);
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');

    await page.keyboard.press('Space');
    await steps(page, 1);
    await expect(page.locator('#live')).toHaveText('待った。1手目');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await steps(page, 3);
    await page.keyboard.press('z');
    await steps(page, 2);
    await page.keyboard.press('Backspace');
    await steps(page, 1);
    await page.keyboard.press('ArrowLeft');
    await steps(page, 2);
    await page.keyboard.press('r');
    await steps(page, 0);
    await expect(page.locator('#toast')).toHaveText('最初に戻した。「ひとつ戻す」で取り消せる');
    await expect(page.locator('#live')).toHaveText('最初に戻した。「ひとつ戻す」で取り消せる');
    await expect(page.locator('#btn-restart')).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('z'); // 最初へ を取り消す
    await steps(page, 2);
    await expect(page.locator('#btn-restart')).toHaveAttribute('aria-disabled', 'false');
    // 窓が開いている間は盤を動かさない。Esc で閉じる
    await page.locator('#btn-howto').click();
    await expect(page.locator('#howto-dialog')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await steps(page, 2);
    await page.keyboard.press('Escape');
    await expect(page.locator('#howto-dialog')).toBeHidden();
    await expect(page.locator('#btn-howto')).toBeFocused();
    await expectClean(page, seen);
  });

  // 手順は面と組で固定（手数は単体テストでも確かめてある）
  const REASONS = [
    { no: 1, moves: 'DD', step: 2, source: '見張り', text: '2手目、見張りの光の中へ入ってしまった。', beam: 5 },
    { no: 1, moves: 'LLDD', step: 4, source: '見張り', text: '4手目、光を止めていた箱をどかしたので、見張りの光が届いた。', beam: 5 },
    { no: 5, moves: 'RURDDD', step: 6, source: '警備員', text: '6手目、警備員が道の端で向きを変えて、光が届いた。', beam: 5 },
    // 面7の guard-turn-box：作業記録の 03_gates.md の手順（UUURURDUDDDULLDD）は、10手目の箱を押す手で詰みになり、画面は「もう出られない」を出して先へ進めない。詰みを通らない手順に置き換えた
    { no: 7, moves: 'UUURRURDDDULLLDDR', step: 17, source: '警備員', text: '17手目、警備員が箱の前で引き返して、光が届いた。', beam: 2 },
    { no: 4, moves: 'RDD', step: 3, source: '見張り', text: '3手目、見張りが向きを変えて、光が届いた。', beam: 3 },
  ];
  for (const r of REASONS) {
    test(`見つかった理由：面${r.no} ${r.moves}（${r.step}手目）の文と二重の枠。ひとつ戻すで1手減って play に戻る`, async ({ page }) => {
      const seen = await open(page, `?level=${r.no}`);
      await tap(page, r.moves);
      await expect(page.locator('#panel-caught')).toBeVisible();
      await status(page, 'caught');
      await steps(page, r.step);
      await expect(page.locator('#caught-title-text')).toHaveText('見つかった！');
      await expect(page.locator('#caught-text')).toContainText(r.text);
      await expect(page.locator('#caught-text')).toContainText('太い二重の枠が、その光の通り道。');
      await expect(page.locator('#live')).toContainText(r.text);
      await expect(page.locator('.caught-beam')).toHaveCount(r.beam);
      await expect(page.locator('.caught-mark')).toHaveCount(1);
      await expect(page.locator('#controls')).toBeHidden();
      await expect(page.locator('#btn-caught-undo')).toBeFocused();
      // 原因の光源に印が付く
      await expect(page.locator('.is-cause')).toHaveCount(1);
      // 見つかった後は予告を出さない・動けない
      expect(await page.locator('.cell[data-next]').count()).toBe(0);
      await page.keyboard.press('ArrowUp');
      await steps(page, r.step);
      await page.locator('#btn-caught-undo').click();
      await status(page, 'play');
      await steps(page, r.step - 1);
      await expect(page.locator('#panel-caught')).toBeHidden();
      await expect(page.locator('#controls')).toBeVisible();
      await expect(page.locator('.caught-beam')).toHaveCount(0);
      await expect(page.locator('#btn-undo')).toBeFocused();
      // 戻した状態は sim の再生と一致する
      const lv = level(r.no);
      const back = replay(lv, r.moves.slice(0, -1)).state;
      expect(await readBoard(page)).toEqual(expectedBoard(lv, back));
      await expectClean(page, seen);
    });
  }

  test('光源の呼び名：面2の2つの見張りは「見張り1」「見張り2」。盤の番号札と文が同じ', async ({ page }) => {
    // 面2で、見張り1・見張り2のそれぞれに見つかる短い手順を、sim で探す
    const lv = level(2);
    const find = (index) => {
      let frontier = [{ moves: '', state: initialState(lv) }];
      for (let depth = 0; depth < 6; depth++) {
        const next = [];
        for (const f of frontier) {
          for (const a of ['U', 'R', 'D', 'L', WAIT]) {
            const r = act(lv, f.state, a);
            if (!r.valid) continue;
            if (r.state.status === 'caught' && r.state.caught.source.index === index) return { moves: f.moves + a, step: r.state.steps };
            if (r.state.status === 'play') next.push({ moves: f.moves + a, state: r.state });
          }
        }
        frontier = next;
      }
      return null;
    };
    for (const index of [0, 1]) {
      const found = find(index);
      expect(found, `面2で見張り${index + 1}に見つかる手順`).not.toBeNull();
      const seen = await open(page, '?level=2');
      await tap(page, found.moves);
      await expect(page.locator('#panel-caught')).toBeVisible();
      await expect(page.locator('#caught-text')).toContainText(`${found.step}手目、`);
      await expect(page.locator('#caught-text')).toContainText(`見張り${index + 1}`);
      // 盤の番号札は「1」「2」
      await expect(page.locator('.badge-text')).toHaveText(['1', '2']);
      await expectClean(page, seen);
    }
  });

  test('Space＝待つ：マウスで押したボタンに焦点が残っていても待つ（そのボタンをもう一度押さない）。「最初へ」の直後も、見つかった欄の「ひとつ戻す」の直後も', async ({ page, browserName }) => {
    const seen = await open(page, '?level=1');
    // Chromium はクリックしたボタンに焦点が残る（これが事故の元）。WebKit（Safari）は焦点が当たらないので、前提の確認だけ省く
    const stillFocused = async (id) => { if (browserName !== 'webkit') await expect(page.locator(id)).toBeFocused(); };
    const x = () => page.locator('.player').getAttribute('data-x');
    // ① マウスで「左へ」→ Space：手数が1増え、怪盗は動かない（直す前は、焦点の残った「左へ」がもう一度押されて、もう1マス動いた）
    await page.locator('#btn-left').click();
    await steps(page, 1);
    await settled(page);
    expect(await x()).toBe('3');
    await stillFocused('#btn-left'); // マウスで押したボタンに焦点が残っている
    await page.keyboard.press('Space');
    await steps(page, 2);
    await settled(page);
    expect(await x(), 'Space は待つ。焦点の残った「左へ」を押さない').toBe('3');
    await page.keyboard.press('Space');
    await steps(page, 3);
    await settled(page);
    expect(await x()).toBe('3');
    await expect(page.locator('#live')).toHaveText('待った。3手目');

    // ② マウスで「最初へ」→ 取り消しの知らせが出ている間に Space：最初に戻らず（直す前は、焦点の残った「最初へ」が押された）、1手待つ。動いたあとの Space でも、最初に戻らない
    await page.locator('#btn-restart').click();
    await steps(page, 0);
    await expect(page.locator('#toast')).toHaveText('最初に戻した。「ひとつ戻す」で取り消せる');
    await stillFocused('#btn-restart');
    await page.keyboard.press('Space');
    await steps(page, 1);
    expect(await x()).toBe('4');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await steps(page, 3);
    await page.keyboard.press('Space');
    await steps(page, 4); // 最初へ戻って 0 にならない
    await stillFocused('#btn-restart');
    expect(await x()).toBe('2');

    // ③ 見つかった欄の「ひとつ戻す」をマウスで押した直後に Space：取り消しが重ならず、1手待つ
    await page.goto(`${PATH}?level=1`);
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await tap(page, 'DD');
    await expect(page.locator('#panel-caught')).toBeVisible();
    await page.locator('#btn-caught-undo').click();
    await status(page, 'play');
    await steps(page, 1);
    await expect(page.locator('#btn-undo')).toBeFocused(); // アプリが「戻す」へ焦点を動かした
    await page.keyboard.press('Space');
    await steps(page, 2);
    await status(page, 'play');
    await expect(page.locator('#live')).toHaveText('待った。2手目');
    await expectClean(page, seen);
  });

  test('Space＝待つ：キーボードの Tab で焦点を当てたボタンだけは、今までどおり、そのボタンの1手（待たない）。マウスで別のボタンを押せば、また待つ', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright の WebKit は、Tab でボタンに焦点を当てない（Safari の既定の設定と同じ）');
    const seen = await open(page, '?level=1');
    const x = () => page.locator('.player').getAttribute('data-x');
    let reached = false;
    for (let i = 0; i < 30 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = (await page.evaluate(() => document.activeElement.id)) === 'btn-left';
    }
    expect(reached, 'Tab で #btn-left に着く').toBe(true);
    await page.keyboard.press('Space');
    await steps(page, 1);
    await settled(page);
    expect(await x(), 'Tab で焦点を当てたボタンは、Space でそのボタンの1手').toBe('3');
    await page.keyboard.press('Space');
    await steps(page, 2);
    await settled(page);
    expect(await x()).toBe('2');
    await page.locator('#btn-right').click(); // マウスで別のボタンを押した：焦点はそちらへ。もう Tab で当てた焦点ではない
    await steps(page, 3);
    await settled(page);
    expect(await x()).toBe('3');
    await page.keyboard.press('Space');
    await steps(page, 4);
    await settled(page);
    expect(await x(), 'マウスで押したあとの Space は待つ').toBe('3');
    await expectClean(page, seen);
  });

  test('Space で待った手で見つかっても、離した Space が見つかった欄の「ひとつ戻す」を押さない（Firefox は keyup でボタンを押す）', async ({ page }) => {
    const seen = await open(page, '?level=4');
    await tap(page, 'DD'); // 面4：ここで待つと、見張りが向きを変えて光が届く（作業記録の探索で確認）
    await steps(page, 2);
    await settled(page);
    await page.keyboard.down('Space');
    await expect(page.locator('#panel-caught')).toBeVisible();
    await expect(page.locator('#btn-caught-undo')).toBeFocused(); // 押している間に焦点が移った
    await page.keyboard.up('Space');
    await page.waitForTimeout(300);
    await expect(page.locator('#panel-caught'), '離した Space が「ひとつ戻す」を押していない').toBeVisible();
    await status(page, 'caught');
    await steps(page, 3);
    await expectClean(page, seen);
  });

  test('文字のキーを止めると、キーの案内（盤の横とあそびかた）も、効くキーだけの文に変わる。戻すと元の文', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 }); // 盤の横の案内（#keyhelp）は wide で見える
    const seen = await open(page, '?level=1');
    const ON = '矢印かWASDで移動・スペースで待つ・Zでひとつ戻す・Rで最初へ';
    const OFF = '矢印で移動・スペースで待つ・Backspaceでひとつ戻す';
    await expect(page.locator('#keyhelp')).toBeVisible();
    await expect(page.locator('#keyhelp')).toHaveText(ON);
    await page.locator('#btn-howto').click();
    await expect(page.locator('#howto-keys')).toHaveText(ON);
    await expect(page.locator('#btn-undo')).toHaveAttribute('aria-keyshortcuts', 'Z Backspace');
    await page.locator('#opt-letter-keys').click();
    await expect(page.locator('#opt-letter-keys')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#keyhelp')).toHaveText(OFF);
    await expect(page.locator('#howto-keys')).toHaveText(OFF);
    // 読み上げ用のキーの案内（aria-keyshortcuts）も、効かない文字のキーを外す
    await expect(page.locator('#btn-undo')).toHaveAttribute('aria-keyshortcuts', 'Backspace');
    await expect(page.locator('#btn-up')).toHaveAttribute('aria-keyshortcuts', 'ArrowUp');
    await expect(page.locator('#btn-wait')).toHaveAttribute('aria-keyshortcuts', 'Space');
    expect(await page.locator('#btn-restart').getAttribute('aria-keyshortcuts')).toBeNull();
    await page.locator('#btn-howto-close').click();
    // 案内どおりのキーが効き、案内に無いキー（R・A）は効かない
    await page.keyboard.press('ArrowLeft');
    await steps(page, 1);
    await page.keyboard.press('r');
    await page.keyboard.press('a');
    await steps(page, 1);
    await page.keyboard.press('Backspace');
    await steps(page, 0);
    // 再読み込みしても、保存された設定どおりの案内になる
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#keyhelp')).toHaveText(OFF);
    await page.locator('#btn-howto').click();
    await expect(page.locator('#howto-keys')).toHaveText(OFF);
    await page.locator('#opt-letter-keys').click();
    await expect(page.locator('#keyhelp')).toHaveText(ON);
    await expect(page.locator('#howto-keys')).toHaveText(ON);
    await expect(page.locator('#btn-undo')).toHaveAttribute('aria-keyshortcuts', 'Z Backspace');
    await expect(page.locator('#btn-restart')).toHaveAttribute('aria-keyshortcuts', 'R');
    await expectClean(page, seen);
  });

  test('動けない一言：見張りのマスへは「見張りがいて通れない」、警備員（巡回）のマスへは「警備員がいて通れない」。手数は増えない', async ({ page }) => {
    const seen = await open(page, '?level=1');
    await tap(page, 'LLLLD'); // 面1の見張りは左から1・上から3。上から近づく（光は右向きなので、その真上は安全）
    await steps(page, 5);
    await page.locator('#btn-down').click();
    await expect(page.locator('#toast')).toHaveText('見張りがいて通れない');
    await expect(page.locator('#live')).toHaveText('見張りがいて通れない');
    await steps(page, 5);
    await status(page, 'play');
    // 面5の警備員は、巡回の道（下の通路）を行き来する。道の右端に着いたところへ、上から踏み込む
    await page.goto(`${PATH}?level=5`);
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await tap(page, 'RRD');
    await steps(page, 3);
    await page.locator('#btn-down').click();
    await expect(page.locator('#toast')).toHaveText('警備員がいて通れない');
    await expect(page.locator('#live')).toHaveText('警備員がいて通れない');
    await steps(page, 3);
    await expectClean(page, seen);
  });

  test('お手本の札は盤の外：盤の上に重なる見える部品が無く、出口のマスが隠れない（面5。直す前は、左上の札が出口に重なった）', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-13T09:00:00Z') });
    const seen = await open(page, '?level=5');
    // 同じ面で2回失敗（面5：RURDDD で警備員に見つかる）すると、お手本が出る
    for (let i = 0; i < 2; i++) {
      await tap(page, 'RURDDD');
      await expect(page.locator('#panel-caught')).toBeVisible();
      if (i === 0) await page.locator('#btn-caught-restart').click();
    }
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 1000);
    await page.locator('#btn-caught-demo').click();
    await status(page, 'demo');
    const covering = () => page.evaluate(() => {
      const board = document.querySelector('#board').getBoundingClientRect();
      const out = [];
      for (const e of document.querySelectorAll('body *')) {
        if (e.closest('#board, .sprite, .sr-only, .boardtext, script, style') || e.contains(document.querySelector('#board'))) continue;
        if (e.classList.contains('toast')) continue; // 一言は、盤の上に数秒だけ重ねる作り（札とは別）
        const cs = getComputedStyle(e);
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0 || e.closest('[hidden]')) continue;
        const r = e.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const overlap = Math.min(r.right, board.right) - Math.max(r.left, board.left) > 1 && Math.min(r.bottom, board.bottom) - Math.max(r.top, board.top) > 1;
        if (overlap) out.push(`${e.tagName}${e.id ? `#${e.id}` : ''}${e.className ? `.${String(e.className).split(' ')[0]}` : ''}`);
      }
      return out;
    });
    expect(await covering(), 'お手本の始め').toEqual([]);
    await expect(page.locator('#demo-progress')).toBeVisible();
    // 最後の1手（出口へ入る）の前後も、出口のマスの上に重なるものが無い
    await page.clock.runFor(DEMO_MS * 24 + 10);
    await expect(page.locator('#demo-progress')).toHaveText('お手本 24/25手');
    expect(await covering(), 'お手本の最後の1手の前').toEqual([]);
    await page.clock.runFor(DEMO_MS);
    await expect(page.locator('#demo-progress')).toHaveText('お手本 25/25手');
    expect(await covering(), 'お手本の最後の1手').toEqual([]);
    await expectClean(page, seen);
  });

  test('窓を Esc で閉じたとき、焦点がどこにも無ければ（Safari はクリックでボタンに焦点を当てない）、開いたボタンへ戻す。別の場所に焦点があるときは奪わない', async ({ page }) => {
    const seen = await open(page, '?level=1');
    for (const [openBtn, dialog] of [['#btn-howto', '#howto-dialog'], ['#btn-levels', '#level-dialog'], ['#btn-share', '#share-dialog']]) {
      // ボタンに焦点を当てずに開く（Safari のクリックと同じ）。開く前は、どこにも焦点が無い状態にする（標準の戻し先が無い）
      await page.evaluate(() => document.activeElement?.blur());
      await page.evaluate((sel) => document.querySelector(sel).click(), openBtn);
      await expect(page.locator(dialog)).toBeVisible();
      expect(await page.evaluate((sel) => document.activeElement === document.querySelector(sel), openBtn), '開く前は、ボタンに焦点が無い').toBe(false);
      await page.keyboard.press('Escape');
      await expect(page.locator(dialog)).toBeHidden();
      await expect(page.locator(openBtn), `${dialog} を Esc で閉じたあと`).toBeFocused();
    }
    // 閉じた直後に、焦点を別の場所へ動かしたあとは、奪い返さない（閉じたあとの非同期の close イベントが、開いたボタンへ戻してしまう不具合の再発を防ぐ）
    await page.evaluate(() => document.querySelector('#btn-howto').click());
    await expect(page.locator('#howto-dialog')).toBeVisible();
    await page.evaluate(() => {
      document.querySelector('#howto-dialog').close();
      document.querySelector('#btn-wait').focus();
    });
    await expect(page.locator('#btn-wait')).toBeFocused();
    await page.waitForTimeout(200);
    await expect(page.locator('#btn-wait'), '閉じたあとの close イベントで焦点を奪い返さない').toBeFocused();
    // 面の一覧から面を選んだときも同じ（選ぶと焦点は「待つ」へ移る）
    await page.evaluate(() => document.querySelector('#btn-levels').click());
    await page.locator('.level-row[data-level="L3"]').click();
    await expect(page.locator('#level-title')).toHaveText('面3 レーザーの線');
    await page.waitForTimeout(200);
    await expect(page.locator('#btn-wait')).toBeFocused();
    await expectClean(page, seen);
  });

  test('詰みとお手本：面3 RRRRDD で詰みの欄 → 戻して同じ罠をもう一度で「お手本を見る」が出る → 再生の間は操作できず、終わると最初の状態に戻る。星は保存されない', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-13T09:00:00Z') });
    const seen = await open(page, '?level=3');
    await tap(page, 'RRRRD');
    await steps(page, 5);
    await status(page, 'play');
    await tap(page, 'D'); // 箱を真下のレーザーへ落とす＝詰み
    await expect(page.locator('#panel-dead')).toBeVisible();
    await status(page, 'dead');
    await expect(page.locator('#dead-title-text')).toHaveText('もう出られない');
    await expect(page.locator('#dead-text')).toContainText('この箱の位置では、宝を持って出口まで行けない。押す前に戻そう。');
    await expect(page.locator('#btn-dead-undo')).toBeFocused();
    await expect(page.locator('#btn-dead-demo')).toBeHidden(); // 1回目の失敗ではお手本を出さない
    await expect(page.locator('.dead-veil')).toHaveCount(1);
    await expect(page.locator('.dead-ring')).toHaveCount(1);
    expect(await page.locator('.cell[data-next]').count()).toBe(0);
    await page.keyboard.press('ArrowLeft'); // 詰みの間は動かない
    await steps(page, 6);
    await page.locator('#btn-dead-undo').click();
    await status(page, 'play');
    await steps(page, 5);
    await expect(page.locator('#btn-undo')).toBeFocused();
    await tap(page, 'D'); // 同じ罠をもう一度（2回目の失敗）
    await expect(page.locator('#panel-dead')).toBeVisible();
    await expect(page.locator('#app')).toHaveAttribute('data-fails', '2');
    await expect(page.locator('#btn-dead-demo')).toBeVisible();
    // 時計を止めて、お手本の1手 DEMO_MS（700ms）を進める
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 1000);
    await page.locator('#btn-dead-demo').click();
    await status(page, 'demo');
    await steps(page, 0);
    await expect(page.locator('#demo-badge'), '盤の上の札は無い（面5で出口を隠した）').toHaveCount(0);
    await expect(page.locator('#status-demo')).toBeVisible();
    await expect(page.locator('#demo-progress')).toBeVisible(); // 札は状態の行に出る
    await expect(page.locator('#demo-progress')).toHaveText('お手本 0/19手');
    await expect(page.locator('#btn-demo-stop')).toBeVisible();
    for (const id of ['#btn-up', '#btn-right', '#btn-down', '#btn-left', '#btn-wait', '#btn-undo', '#btn-restart']) {
      await expect(page.locator(id)).toHaveAttribute('aria-disabled', 'true');
    }
    await page.keyboard.press('ArrowRight'); // お手本の間は、Esc以外のキーを受けない
    await steps(page, 0);
    await page.clock.runFor(DEMO_MS * 3 + 10);
    await expect(page.locator('#demo-progress')).toHaveText('お手本 3/19手');
    await steps(page, 3);
    // 予告は出したまま（お手本の間も、次の1手の光は読める）
    expect(await page.locator('.cell[data-next]').count()).toBeGreaterThanOrEqual(0);
    await page.clock.runFor(DEMO_MS * 16 + 10);
    await expect(page.locator('#demo-progress')).toHaveText('お手本 19/19手');
    await expect(page.locator('#panel-clear')).toBeHidden(); // お手本で出口に着いても、成功の欄は出ない
    await page.clock.runFor(DEMO_MS + 300);
    await status(page, 'play');
    await steps(page, 0);
    await expect(page.locator('#status-demo')).toBeHidden();
    await expect(page.locator('#live')).toHaveText(DEMO_END);
    // 終わりの文は、読み上げ（#live）に加えて、見える一言（#toast）としても数秒出る。#toast は aria-hidden なので二重には読まれない
    await expect(page.locator('#toast')).toHaveText(DEMO_END);
    await expect(page.locator('#toast')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#toast')).toHaveClass(/is-on/);
    await page.clock.runFor(1700); // 通常の一言（1.6秒）なら、もう消えている長さ
    await expect(page.locator('#toast'), '数秒は残る').toHaveText(DEMO_END);
    await page.clock.runFor(1800); // 合計 3.5秒：3.2秒＋消える0.2秒を過ぎた
    await expect(page.locator('#toast')).toHaveText('');
    await expect(page.locator('#btn-wait')).toBeFocused();
    // 星も記録も付かない
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE)).toBeNull();
    await expect(page.locator('#btn-levels')).toHaveAttribute('aria-label', '面3/8 レーザーの線（まだ）。面をえらぶ');
    // 状態の行にも「お手本」が出る（2回失敗したあと）
    await expect(page.locator('#btn-demo')).toBeVisible();
    expect(await readBoard(page)).toEqual(expectedBoard(level(3), initialState(level(3))));

    // 再生の途中で「とめる」を押した場合も、最初の状態に戻る
    await page.locator('#btn-demo').click();
    await status(page, 'demo');
    await page.clock.runFor(DEMO_MS * 4 + 10);
    await steps(page, 4);
    await page.locator('#btn-demo-stop').click();
    await status(page, 'play');
    await steps(page, 0);
    await page.locator('#btn-demo').click();
    await status(page, 'demo');
    await page.clock.runFor(DEMO_MS * 2 + 10);
    await page.keyboard.press('Escape'); // Esc でもとまる
    await status(page, 'play');
    await steps(page, 0);
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE)).toBeNull();
    await expectClean(page, seen);
  });

  test('面の帯：面1で「前の面」・面8で「次の面」が無効。?level=5 で面5、?level=9 や x は無視。壊れた保存データでも開く。音の切替が再読み込み後も残る', async ({ page }) => {
    const seen = await open(page);
    await expect(page.locator('#btn-prev')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#btn-next-level')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.locator('#btn-prev')).toHaveAttribute('aria-label', '前の面');
    await expect(page.locator('#btn-next-level')).toHaveAttribute('aria-label', '次の面');
    await page.locator('#btn-prev').click({ force: true }); // 無効（aria-disabled）：押しても何も起きない
    await expect(page.locator('#level-title')).toHaveText('面1 はじめの影');
    await page.locator('#btn-next-level').click();
    await expect(page.locator('#level-title')).toHaveText('面2 交わる光');
    await expect(page.locator('#btn-wait')).toBeFocused();
    await expect(page.locator('#hint')).toHaveText('光が2本ある。1つの箱で、2本ともさえぎれる場所はないか。');

    await page.goto(`${PATH}?level=5`);
    await expect(page.locator('#level-title')).toHaveText('面5 引き返す警備員');
    await expect(page.locator('#btn-levels')).toContainText('面5/8');
    for (const q of ['?level=9', '?level=x', '?level=0', '?level=', '?level=1.5', '?level=%E9%9D%A2']) {
      await page.goto(`${PATH}${q}`);
      await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
      await expect(page.locator('#level-title'), q).toHaveText('面1 はじめの影');
    }
    await page.goto(`${PATH}?level=8`);
    await expect(page.locator('#btn-next-level')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#btn-prev')).toHaveAttribute('aria-disabled', 'false');

    // 壊れた保存データ・知らない面ID・型違いでも、既定値で遊べる
    for (const bad of ['{', 'null', '[1,2]', '{"levels":{"L1":"x","L99":{"stars":3,"best":9}},"muted":"yes"}', '"文字"']) {
      await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: STORAGE, value: bad });
      await page.goto(PATH);
      await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
      await expect(page.locator('#level-title'), bad).toHaveText('面1 はじめの影');
      await tap(page, 'DD');
      await expect(page.locator('#panel-caught')).toBeVisible();
    }
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE);

    // 音の切替は保存され、再読み込み後も残る
    await page.goto(PATH);
    await expect(page.locator('#btn-sound')).toHaveAttribute('data-muted', '0');
    await expect(page.locator('#btn-sound')).toHaveAttribute('aria-label', '音を消す');
    await page.locator('#btn-sound').click();
    await expect(page.locator('#btn-sound')).toHaveAttribute('data-muted', '1');
    await expect(page.locator('#btn-sound')).toHaveAttribute('aria-label', '音を出す');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#btn-sound')).toHaveAttribute('data-muted', '1');
    await expect(page.locator('#btn-sound')).toHaveAttribute('aria-label', '音を出す');
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).muted, STORAGE)).toBe(true);
    await expectClean(page, seen);
  });

  test('保存が使えない端末（localStorage が例外）でも、記録なしで最後まで遊べる', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('使えない'); } });
    });
    const seen = await open(page);
    await tap(page, LEVELS[0].solution);
    await expect(page.locator('#panel-clear')).toBeVisible();
    await page.locator('#btn-sound').click();
    await expect(page.locator('#btn-sound')).toHaveAttribute('data-muted', '1');
    expect(seen.errors).toEqual([]);
  });

  test('共有：帯の「このアプリを共有する」で #share-dialog と .share。成功の欄の「Xで投稿」に、結果の共有文とURLが入る', async ({ page }) => {
    const seen = await open(page);
    const opener = page.getByRole('button', { name: 'このアプリを共有する', exact: true });
    await opener.click();
    await expect(page.locator('#share-dialog')).toBeVisible();
    await expect(page.locator('#share-dialog .share')).toHaveCount(1);
    await expect(page.locator('#share-dialog .share').getByRole('link', { name: 'Xで投稿' })).toBeVisible();
    await expect(page.locator('#result-share #share, #panel-clear #share, #howto-dialog #share')).toHaveCount(0);
    await page.locator('#btn-share-close').click();
    await expect(page.locator('#share-dialog')).toBeHidden();
    await expect(opener).toBeFocused();

    await tap(page, LEVELS[0].solution);
    await expect(page.locator('#panel-clear')).toBeVisible();
    const x = page.locator('#share-x');
    const href = decodeURIComponent(await x.getAttribute('href'));
    expect(href).toContain('https://x.com/intent/post?text=');
    expect(href).toContain('箱影の怪盗 Day66｜面1「はじめの影」★3 10手で脱出 #100日チャレンジ #個人開発');
    // 共有するURLは canonical（build が公開URLを入れる）。無ければ今のURL
    expect(href).toMatch(/url=(https:\/\/hundred-days\.pages\.dev|http:\/\/127\.0\.0\.1:\d+)\/day-066-hakokage-kaito\//);
    await expect(x).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(x).toHaveAttribute('target', '_blank');
    const line = decodeURIComponent(await page.locator('#share-line').getAttribute('href'));
    expect(line).toContain('https://social-plugins.line.me/lineit/share?url=');
    await expect(page.locator('#share-copy')).toBeVisible();
    await expect(page.locator('#share-native')).toBeHidden(); // 共有シートの無いブラウザでは出さない
    await expectClean(page, seen);
  });

  test('結果の共有：リンクをコピーで「コピーしました」。共有シートがある端末では「ほかのアプリで送る」が出て navigator.share に結果の文を渡す', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(() => {
      window.__shared = [];
      navigator.share = async (data) => { window.__shared.push(data); };
    });
    const seen = await open(page);
    await tap(page, LEVELS[0].solution);
    await expect(page.locator('#panel-clear')).toBeVisible();
    await page.locator('#share-copy').click();
    // 「コピーしました」は、ボタンの文字の差し替え（数秒）で知らせる。空けておく欄は作らない。読み上げは #live
    await expect(page.locator('#share-copy')).toHaveText('コピーしました');
    await expect(page.locator('#live')).toHaveText('コピーしました');
    await expect(page.locator('#toast')).toHaveText('コピーしました');
    await expect(page.locator('#share-copy')).toHaveText('リンクをコピー', { timeout: 6000 }); // 数秒で元の文字へ
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/\/day-066-hakokage-kaito\/$/);
    await expect(page.locator('#share-native')).toBeVisible();
    await page.locator('#share-native').click();
    await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
    const sent = await page.evaluate(() => window.__shared[0]);
    expect(sent.text).toBe('箱影の怪盗 Day66｜面1「はじめの影」★3 10手で脱出 #100日チャレンジ #個人開発');
    expect(sent.url).toMatch(/\/day-066-hakokage-kaito\/$/);
    await expectClean(page, seen);
  });

  test('動きを減らす設定：クリック直後に怪盗が最終の位置にいる。点滅・揺れ・きらめきの動きが無い', async ({ page }) => {
    test.skip(motion !== 'reduce', '動きを減らす設定のときだけ');
    const seen = await open(page);
    await page.locator('#btn-left').click();
    // 待たずに読む（動きの途中の位置ではなく、終わりの位置にいる）
    expect(await page.evaluate(() => document.querySelector('.player').dataset.x)).toBe('3');
    expect(await page.evaluate(() => document.querySelector('#app').dataset.moving ?? '')).toBe('');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.player')).transitionDuration)).toMatch(/^0s(, 0s)*$/);
    await page.locator('#btn-down').click();
    await page.locator('#btn-down').click(); // 光の中へ入って見つかる
    await expect(page.locator('#panel-caught')).toBeVisible();
    // 点滅の部品（アニメーション）が無い
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.caught-beam')).animationName)).toBe('none');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.is-cause')).animationName)).toBe('none');
    // 無効な手（盤の端）の揺れも出ない。一言だけ
    await page.locator('#btn-caught-undo').click();
    await page.locator('#btn-caught-undo').waitFor({ state: 'hidden' });
    await page.locator('#btn-up').click();
    await page.locator('#btn-up').click();
    await page.locator('#btn-up').click(); // 面1の (3,1) から上へ：(3,0)、そして盤の端で止まる
    await expect(page.locator('#toast')).toHaveText('ここから先へは進めない');
    expect(await page.evaluate(() => document.getAnimations().length), '動いているアニメーション').toBe(0);
    // 宝を取る手のきらめきも出ない
    await page.goto(`${PATH}?level=1`);
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await tap(page, 'LLDRRDD');
    await expect(page.locator('.treasure')).toHaveAttribute('data-taken', '1');
    expect(await page.evaluate(() => document.querySelectorAll('.treasure.is-taking').length)).toBe(0);
    await expectClean(page, seen);
  });
  });
}

test('動きの途中の入力：見本の解を、1手ごとの間隔 0・20・60・120・200ms で押しても、結果は同じ成功・同じ手数（面1・面5・面8）', async ({ page }) => {
  test.setTimeout(LONG(240_000)); // 間隔を空けて押すだけで、計 100秒ちかくかかる（面8は29手×5通り）
  const seen = await open(page);
  for (const no of [1, 5, 8]) {
    const L = LEVELS[no - 1];
    for (const gap of [0, 20, 60, 120, 200]) {
      await page.goto(`${PATH}?level=${no}`);
      await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
      // ページの中のタイマーで押す（Playwright の操作を挟むと、動きの途中に当たらない）
      await page.evaluate(async ({ moves, gap: ms, btn }) => {
        for (const m of moves) {
          document.querySelector(btn[m]).click();
          if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
        }
      }, { moves: [...L.solution], gap, btn: BTN });
      await status(page, 'escaped');
      await steps(page, L.par);
      await expect(page.locator('#panel-clear'), `面${no} 間隔${gap}ms`).toBeVisible();
      await expect(page.locator('#clear-stars')).toHaveAttribute('data-stars', '3');
      await settled(page);
      const lv = level(no);
      const end = replay(lv, L.solution).state;
      const board = await readBoard(page);
      expect(board.boxes, `面${no} 間隔${gap}ms 箱の位置`).toEqual(expectedBoard(lv, end).boxes);
      expect(board.guards, `面${no} 間隔${gap}ms 警備員の位置`).toEqual(expectedBoard(lv, end).guards);
    }
  }
  await expectClean(page, seen);
});

test('動きの途中の「戻す」：押した直後に戻しても、戻ったあとの状態が #app[data-steps] と盤の位置で一致する', async ({ page }) => {
  const seen = await open(page, '?level=1');
  const lv = level(1);
  // 手を進めて、動きの途中（ページの中で同じ瞬間に）戻す。3手進めて1つ戻す、を繰り返す
  await page.evaluate(() => {
    document.querySelector('#btn-left').click();
    document.querySelector('#btn-left').click();
    document.querySelector('#btn-down').click();
    document.querySelector('#btn-undo').click(); // 3手目の動きの途中で戻す
  });
  await steps(page, 2);
  await settled(page);
  let state = replay(lv, 'LL').state;
  expect(await readBoard(page)).toEqual(expectedBoard(lv, state));
  // 押した直後（動きの途中）に「最初へ」「戻す」
  await page.evaluate(() => {
    document.querySelector('#btn-right').click();
    document.querySelector('#btn-restart').click();
    document.querySelector('#btn-undo').click(); // 最初への取り消し（1手戻った状態）
  });
  await settled(page);
  state = replay(lv, 'LLR').state;
  await steps(page, 3);
  expect(await readBoard(page)).toEqual(expectedBoard(lv, state));
  // 怪盗の見た目の位置が、データの位置のマスの中にある
  const where = await page.evaluate(() => {
    const board = document.querySelector('#board').getBoundingClientRect();
    const cols = Number(document.querySelector('#board').dataset.cols);
    const cell = board.width / cols;
    const p = document.querySelector('.player');
    const r = p.getBoundingClientRect();
    return { cx: Math.floor(((r.left + r.right) / 2 - board.left) / cell), cy: Math.floor(((r.top + r.bottom) / 2 - board.top) / cell), x: Number(p.dataset.x), y: Number(p.dataset.y) };
  });
  expect([where.cx, where.cy]).toEqual([where.x, where.y]);
  await expectClean(page, seen);
});

test('通常の動き：怪盗・箱が動き、動きの終わりに光・影・予告を一度で描き直す。動きの間は予告の矢印を消す', async ({ page }) => {
  const seen = await open(page, '?level=5');
  // 面5：巡回の警備員には「進む」予告の矢印がある。動きの間（ページの中の同じ瞬間）は盤が動き中の印を持つ
  await expect(page.locator('.guard-next')).toHaveCount(1);
  expect(await page.locator('.guard').getAttribute('data-next-action')).toBe('move');
  const during = await page.evaluate(() => {
    document.querySelector('#btn-right').click();
    return { moving: document.querySelector('#app').dataset.moving, cls: document.querySelector('#board').classList.contains('is-moving'), x: document.querySelector('.player').dataset.x };
  });
  expect(during.moving).toBe('1');
  expect(during.cls).toBe(true);
  expect(during.x, '動きの途中は、描き直す前の位置のまま').toBe('0');
  await settled(page);
  expect(await page.locator('#board.is-moving').count()).toBe(0);
  await expect(page.locator('.player')).toHaveAttribute('data-x', '1');
  await expect(page.locator('.guard-next')).toHaveCount(1);
  // 動いている間の長さ（--dur-move＝150ms）が transition の設定に入っている
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.player')).transitionDuration)).toContain('0.15s');
  // 宝を取る：扉が開く
  await page.goto(`${PATH}?level=1`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await tap(page, 'LLDRRDD');
  await settled(page);
  await expect(page.locator('#app')).toHaveAttribute('data-treasure', '1');
  await expect(page.locator('.exit')).toHaveAttribute('data-open', '1');
  await expect(page.locator('.treasure')).toHaveAttribute('data-taken', '1');
  await expect(page.locator('#live')).toContainText('宝を取った。出口が開いた');
  await expect(page.locator('#treasure-state')).toHaveText('持っている');
  expect(replay(level(1), 'LLDRRDD').state.treasure).toBe(true);
  await expectClean(page, seen);
});

test('出口は宝を取るまで閉じた扉：宝なしで出口へ向かうと「出口は、宝を取ると開く」（手数は増えない）', async ({ page }) => {
  const seen = await open(page, '?level=1');
  // 面1：怪盗 (4,0)、出口 (5,1)。右へ → (5,0)、下へ → 出口（閉じている）
  await tap(page, 'R');
  await steps(page, 1);
  await page.locator('#btn-down').click();
  await expect(page.locator('#toast')).toHaveText('出口は、宝を取ると開く');
  await expect(page.locator('#live')).toHaveText('出口は、宝を取ると開く');
  await steps(page, 1);
  await expect(page.locator('#toast')).toHaveAttribute('aria-hidden', 'true');
  // 盤の端
  await page.locator('#btn-right').click();
  await expect(page.locator('#toast')).toHaveText('ここから先へは進めない');
  await steps(page, 1);
  await expectClean(page, seen);
});

// 画面幅ごとの検査
const SIZES = [
  { width: 390, height: 844, layout: 'tall' },
  { width: 375, height: 667, layout: 'compact' },
  { width: 320, height: 568, layout: 'tiny' },
  { width: 844, height: 390, layout: 'short' },
  { width: 1440, height: 900, layout: 'wide' },
];

// 文字の組み方（capture.mjs の A3 と同じ数え方）：見えている段落ごとに、最後の行が4文字以下になっていないか、保護語（lib/wrap.js）の途中で改行していないかを探す。
// 1文字ずつ位置を測って行に分ける。問題の説明の一覧を返す（空なら0件）
async function typoProblems(page) {
  return page.evaluate(({ words, patterns }) => {
    const SKIP = 'script, style, noscript, .sr-only, .sprite, svg';
    const blockOf = (el) => { let x = el; while (x && ['inline', 'contents'].includes(getComputedStyle(x).display)) x = x.parentElement; return x; };
    const blocks = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!n.textContent.trim() || !el || el.closest(SKIP) || el.closest('.boardtext:not(:focus-within)')) continue;
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || el.closest('dialog:not([open])')) continue;
      const b = blockOf(el);
      if (!blocks.has(b)) blocks.set(b, []);
      blocks.get(b).push(n);
    }
    const out = [];
    for (const [block, nodes] of blocks) {
      const chars = [];
      for (const node of nodes) {
        const range = document.createRange();
        for (let i = 0; i < node.textContent.length; i++) {
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const rect = [...range.getClientRects()].find((q) => q.width > 0 && q.height > 0);
          if (rect) chars.push({ ch: node.textContent[i], rect });
        }
      }
      if (!chars.length) continue;
      const lines = [];
      let center = null;
      for (const c of chars) {
        const cy = (c.rect.top + c.rect.bottom) / 2;
        if (center === null || Math.abs(cy - center) > Math.max(4, c.rect.height * 0.6)) { lines.push([]); center = cy; }
        lines[lines.length - 1].push(c);
      }
      const lineOf = [];
      lines.forEach((l, li) => l.forEach(() => lineOf.push(li)));
      const full = chars.map((c) => c.ch).join('');
      const label = block.id ? `#${block.id}` : `${block.tagName.toLowerCase()}${typeof block.className === 'string' && block.className ? `.${block.className.split(' ')[0]}` : ''}`;
      const last = lines[lines.length - 1].map((c) => c.ch).join('').replace(/\s/g, '');
      if (lines.length >= 2 && last.length <= 4) out.push(`${label} の最後の行が「${last}」（${lines.length}行）`);
      const spans = [];
      for (const w of words) for (let at = full.indexOf(w); at >= 0; at = full.indexOf(w, at + 1)) spans.push([at, at + w.length]);
      for (const p of patterns) for (const m of full.matchAll(new RegExp(p.source, p.flags))) spans.push([m.index, m.index + m[0].length]);
      for (const [a, b] of spans) if (new Set(lineOf.slice(a, b)).size > 1) out.push(`${label} で「${full.slice(a, b)}」の途中で改行`);
    }
    return out;
  }, { words: [...PROTECTED_WORDS], patterns: PROTECTED_PATTERNS.map((p) => ({ source: p.source, flags: p.flags })) });
}

// 見えている押せるものの大きさ（44px 未満）と、小さい文字（13px 未満）と、横のはみ出しを返す
async function auditScreen(page) {
  return page.evaluate(() => {
    const visible = (e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]') && !e.closest('.boardtext');
    };
    const small = [];
    for (const e of document.querySelectorAll('button, a[href], [role="switch"], summary')) {
      if (!visible(e)) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) small.push(`${e.id || e.className || e.tagName} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    const tiny = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const e = n.parentElement;
      if (!e || e.closest('script, style, noscript, .sr-only, .sprite') || !visible(e)) continue;
      const svg = e.closest('svg');
      let px = parseFloat(getComputedStyle(e).fontSize);
      if (svg && svg.viewBox?.baseVal?.width) px *= svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      if (px < 12.95) tiny.push(`${n.textContent.trim().slice(0, 12)} ${px.toFixed(2)}px`);
    }
    return { small, tiny, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
}

// 窓の中の全部の文字の右端が、窓の内側の右端を超えていないか。超えた文字（先頭の十数字）の一覧を返す。
// 共通の共有欄の説明文が、word-break: keep-all のせいで折り返せず、窓の右で切れた（Chromium・WebKit とも）
async function dialogTextOverflow(page, selector) {
  return page.evaluate((sel) => {
    const dialog = document.querySelector(sel);
    const cs = getComputedStyle(dialog);
    const innerRight = dialog.getBoundingClientRect().right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
    const bad = [];
    const walker = document.createTreeWalker(dialog, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim() || n.parentElement?.closest('script, style')) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width > 0 && r.right > innerRight + 0.5) {
          bad.push(`${n.textContent.trim().slice(0, 14)} 右端${Math.round(r.right)} > 窓の内側${Math.round(innerRight)}`);
          break;
        }
      }
    }
    const body = dialog.querySelector('.dialog__body');
    if (body && body.scrollWidth > body.clientWidth + 1) bad.push(`本文が横にスクロールする ${body.scrollWidth} > ${body.clientWidth}`);
    return bad;
  }, selector);
}

test.describe('動きを減らす設定で、画面幅ごとの検査', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  for (const size of SIZES) {
    test(`${size.width}×${size.height}（${size.layout}）：型・横にはみ出さない・押せるものは44px以上・13px未満の文字なし。全8面で盤と操作が最初の画面に収まって重ならない`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      const seen = await open(page);
      await expect(page.locator('html')).toHaveAttribute('data-layout', size.layout);
      for (const L of LEVELS) {
        await page.goto(`${PATH}?level=${L.no}`);
        await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
        const audit = await auditScreen(page);
        expect(audit.overflow, `面${L.no} 横のはみ出し`).toBeLessThanOrEqual(0);
        expect(audit.small, `面${L.no} 44px未満の押せるもの`).toEqual([]);
        expect(audit.tiny, `面${L.no} 13px未満の文字`).toEqual([]);
        const m = await page.evaluate(() => {
          const r = (s) => document.querySelector(s).getBoundingClientRect();
          const board = r('#board');
          const controls = r('#controls');
          const cols = Number(document.querySelector('#board').dataset.cols);
          return { boardTop: board.top, boardBottom: board.bottom, boardRight: board.right, boardLeft: board.left, cell: board.width / cols, controlsTop: controls.top, controlsBottom: controls.bottom, controlsLeft: controls.left, controlsRight: controls.right, innerH: innerHeight, innerW: innerWidth };
        });
        expect(m.cell, `面${L.no} マスの大きさ`).toBeGreaterThanOrEqual(35.5);
        // JS が html に入れる --cell は、盤の実寸（列数で割ったマスの幅）と同じ
        const declared = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell')));
        expect(Math.abs(declared - m.cell), `面${L.no} --cell と実寸の差`).toBeLessThan(1);
        expect(m.boardLeft, `面${L.no} 盤の左`).toBeGreaterThanOrEqual(0);
        expect(m.boardRight, `面${L.no} 盤の右`).toBeLessThanOrEqual(m.innerW + 0.5);
        expect(m.boardBottom, `面${L.no} 盤の下が画面の中`).toBeLessThanOrEqual(m.innerH);
        expect(m.controlsBottom, `面${L.no} 操作の下が画面の中`).toBeLessThanOrEqual(m.innerH);
        if (size.layout === 'short' || size.layout === 'wide') {
          // 2列：盤と操作は横に並ぶ（重ならない）
          expect(m.controlsLeft, `面${L.no} 操作は盤の右`).toBeGreaterThanOrEqual(m.boardRight - 0.5);
        } else {
          expect(m.boardBottom, `面${L.no} 盤は操作の上`).toBeLessThanOrEqual(m.controlsTop);
        }
      }
      // 見つかった直後の「ひとつ戻す」と、成功の「次の面へ」が、スクロールせずに見える
      const inView = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }, sel);
      await page.goto(`${PATH}?level=1`);
      await tap(page, 'DD');
      await expect(page.locator('#panel-caught')).toBeVisible();
      expect(await inView('#btn-caught-undo'), '見つかった直後の「ひとつ戻す」が画面の中').toBe(true);
      expect(await inView('#btn-caught-restart')).toBe(true);
      const audit2 = await auditScreen(page);
      expect(audit2.small, '見つかった欄の押せるもの').toEqual([]);
      expect(audit2.tiny, '見つかった欄の文字').toEqual([]);
      expect(audit2.overflow).toBeLessThanOrEqual(0);
      for (const no of [1, 8]) {
        await page.goto(`${PATH}?level=${no}`);
        await tap(page, LEVELS[no - 1].solution);
        await expect(page.locator('#panel-clear')).toBeVisible();
        expect(await inView('#btn-next'), `面${no} 成功の「次の面へ」が画面の中`).toBe(true);
        const audit3 = await auditScreen(page);
        expect(audit3.small, `面${no} 成功の欄の押せるもの`).toEqual([]);
        expect(audit3.tiny, `面${no} 成功の欄の文字`).toEqual([]);
        expect(audit3.overflow).toBeLessThanOrEqual(0);
      }
      // 詰みの欄
      await page.goto(`${PATH}?level=3`);
      await tap(page, 'RRRRDD');
      await expect(page.locator('#panel-dead')).toBeVisible();
      expect(await inView('#btn-dead-undo'), '詰みの「ひとつ戻す」が画面の中').toBe(true);
      // 窓（あそびかた・面の一覧・共有）
      for (const [open_, dialog, close] of [['#btn-howto', '#howto-dialog', '#btn-howto-close'], ['#btn-levels', '#level-dialog', '#btn-levels-close'], ['#btn-share', '#share-dialog', '#btn-share-close']]) {
        await page.goto(`${PATH}?level=1`);
        await page.locator(open_).click();
        await expect(page.locator(dialog)).toBeVisible();
        const a = await auditScreen(page);
        expect(a.small, `${dialog} の押せるもの`).toEqual([]);
        expect(a.overflow).toBeLessThanOrEqual(0);
        expect(await inView(close), `${dialog} の「とじる」が画面の中`).toBe(true);
        expect(await dialogTextOverflow(page, dialog), `${dialog} の文字が窓の右で切れている`).toEqual([]);
        await page.locator(close).click();
      }
      await expectClean(page, seen);
    });
  }

  test('面の名前とヒントは省略せず（…にせず）収まる：どの画面幅でも面の帯の名前が切れていない', async ({ page }) => {
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.width, height: size.height });
      const seen = await open(page);
      for (const L of LEVELS) {
        await page.goto(`${PATH}?level=${L.no}`);
        await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
        const fit = await page.evaluate(() => {
          const name = document.querySelector('#level-name');
          const now = document.querySelector('#btn-levels');
          const r = name.getBoundingClientRect();
          const lines = Math.round(r.height / parseFloat(getComputedStyle(name).lineHeight));
          return { clipped: name.scrollWidth > name.clientWidth + 1 || now.scrollWidth > now.clientWidth + 1, lines, overflowText: getComputedStyle(name).textOverflow };
        });
        expect(fit.clipped, `${size.width}×${size.height} 面${L.no} の名前が切れている`).toBe(false);
        expect(fit.lines, `${size.width}×${size.height} 面${L.no} の名前は1行`).toBe(1);
        expect(fit.overflowText).not.toBe('ellipsis');
      }
      expect(seen.errors).toEqual([]);
    }
  });

  test('ヒントは省略せず収まる：全8面×5つの画面幅で、切れず（…にならず）、3行以内で、画面の中に出る。compact・tiny は切替で開く', async ({ page }) => {
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.width, height: size.height });
      const seen = await open(page);
      for (const L of LEVELS) {
        await page.goto(`${PATH}?level=${L.no}`);
        await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
        const hintBtn = page.locator('#btn-hint');
        if ((await hintBtn.isVisible()) && (await hintBtn.getAttribute('aria-expanded')) === 'false') await hintBtn.click(); // 面1の初回は、はじめから開いている
        await expect(page.locator('#hint')).toHaveText(L.hint);
        const fit = await page.evaluate(() => {
          const hint = document.querySelector('#hint');
          const cs = getComputedStyle(hint);
          const r = hint.getBoundingClientRect();
          const content = hint.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
          return {
            lines: Math.round(content / parseFloat(cs.lineHeight)),
            clipped: hint.scrollWidth > hint.clientWidth + 1 || hint.scrollHeight > hint.clientHeight + 1,
            ellipsis: cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none',
            inside: r.left >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight,
          };
        });
        const label = `${size.width}×${size.height} 面${L.no}`;
        expect(fit.clipped, `${label} のヒントが切れている`).toBe(false);
        expect(fit.ellipsis, `${label} のヒントを…で省略している`).toBe(false);
        expect(fit.lines, `${label} のヒントの行数`).toBeLessThanOrEqual(3);
        expect(fit.inside, `${label} のヒントが画面の中`).toBe(true);
      }
      expect(seen.errors).toEqual([]);
    }
  });

  test('広い画面（wide）の幅700〜900：右の列が狭くても、横にはみ出さず、面の帯の前・名前・次が崩れない。全8面', async ({ page }) => {
    test.setTimeout(LONG(120_000));
    const seen = await open(page);
    for (const [width, height] of [[700, 800], [768, 1024], [820, 1180], [900, 900]]) {
      await page.setViewportSize({ width, height });
      for (const L of LEVELS) {
        await page.goto(`${PATH}?level=${L.no}`);
        await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
        const m = await page.evaluate(() => {
          const box = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
          const name = document.querySelector('#level-name');
          return {
            layout: document.documentElement.dataset.layout,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            innerW: innerWidth,
            board: box('#board'), controls: box('#controls'), prev: box('#btn-prev'), now: box('#btn-levels'), next: box('#btn-next-level'),
            cols: Number(document.querySelector('#board').dataset.cols),
            nameClipped: name.scrollWidth > name.clientWidth + 1 || document.querySelector('#btn-levels').scrollWidth > document.querySelector('#btn-levels').clientWidth + 1,
            nameLines: Math.round(name.getBoundingClientRect().height / parseFloat(getComputedStyle(name).lineHeight)),
          };
        });
        const label = `${width}×${height} 面${L.no}`;
        expect(m.layout, label).toBe('wide');
        expect(m.overflow, `${label} 横のはみ出し`).toBeLessThanOrEqual(0);
        expect(m.controls.right, `${label} 操作が画面の中`).toBeLessThanOrEqual(m.innerW + 0.5);
        expect(m.board.right, `${label} 盤は操作の左`).toBeLessThanOrEqual(m.controls.left + 0.5);
        expect(m.board.width / m.cols, `${label} マスの大きさ`).toBeGreaterThanOrEqual(35.5);
        for (const part of ['prev', 'now', 'next']) {
          expect(m[part].width, `${label} ${part} の幅`).toBeGreaterThanOrEqual(43.5);
          expect(m[part].height, `${label} ${part} の高さ`).toBeGreaterThanOrEqual(43.5);
        }
        // 前と次は同じ行。名前は、その間（3つが1行）か、その上の行（名前を上、前と次を下に並べる形）。次が左下に落ちない
        expect(Math.abs(m.prev.top - m.next.top), `${label} 前と次が同じ行`).toBeLessThan(2);
        const between = m.now.left >= m.prev.right - 0.5 && m.now.right <= m.next.left + 0.5 && Math.abs((m.now.top + m.now.bottom) / 2 - (m.prev.top + m.prev.bottom) / 2) < 8;
        const above = m.now.bottom <= m.prev.top + 0.5 && m.now.left <= m.prev.left + 0.5 && m.now.right >= m.next.right - 0.5;
        expect(between || above, `${label} 名前の位置（前${Math.round(m.prev.left)}〜${Math.round(m.prev.right)}・名前${Math.round(m.now.left)}〜${Math.round(m.now.right)}・次${Math.round(m.next.left)}〜${Math.round(m.next.right)}）`).toBe(true);
        expect(m.nameClipped, `${label} 名前が切れている`).toBe(false);
        expect(m.nameLines, `${label} 名前は1行`).toBe(1);
      }
    }
    expect(seen.errors).toEqual([]);
  });

  test('ヒント：tall・short・wide では面の帯の下に常に出る。compact・tiny では切替で状態の行に差し替わる（盤の外。盤・操作の大きさと位置は変わらない）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const seen = await open(page);
    await expect(page.locator('#hint')).toBeVisible();
    await expect(page.locator('#btn-hint')).toBeHidden();
    await expect(page.locator('#btn-hint-close')).toBeHidden();
    for (const size of [{ width: 375, height: 667 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(size);
      // 面2から始める（面1の初回だけは、開いて始まる）。ヒントは閉じている
      await page.goto(`${PATH}?level=2`);
      await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
      await expect(page.locator('#hint')).toBeHidden();
      await expect(page.locator('#btn-hint')).toBeVisible();
      await expect(page.locator('#btn-hint')).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#btn-hint')).toHaveAttribute('aria-controls', 'hint');
      const boxes = async () => ({ board: await page.locator('#board').boundingBox(), controls: await page.locator('#controls').boundingBox(), status: await page.locator('#status').boundingBox() });
      const before = await boxes();
      await page.locator('#btn-hint').click();
      await expect(page.locator('#btn-hint')).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#hint')).toBeVisible();
      await expect(page.locator('#hint')).toHaveText('光が2本ある。1つの箱で、2本ともさえぎれる場所はないか。');
      await expect(page.locator('#btn-hint-close')).toBeVisible();
      // 盤の外：状態の行と同じ場所に出る。盤・操作・状態の行の大きさと位置は、開いても閉じても同じ
      expect(await boxes(), `${size.width}×${size.height} ヒントを開いても動かない`).toEqual(before);
      const hint = await page.locator('#hint').boundingBox();
      expect(hint.y, 'ヒントは盤の下').toBeGreaterThanOrEqual(before.board.y + before.board.height - 0.5);
      expect(hint.y + hint.height, 'ヒントは状態の行の中').toBeLessThanOrEqual(before.status.y + before.status.height + 1);
      await expect(page.locator('#status-main')).toBeHidden(); // 同じ場所の「手数・最少・宝」は隠れる（見えない文字が重ならない）
      // 閉じるボタン：閉じると状態の行へ戻る。焦点は、開いたボタンへ
      await page.locator('#btn-hint-close').click();
      await expect(page.locator('#hint')).toBeHidden();
      await expect(page.locator('#status-main')).toBeVisible();
      await expect(page.locator('#btn-hint')).toHaveAttribute('aria-expanded', 'false');
      expect(await boxes()).toEqual(before);
      // 手を動かすと自動で閉じる（待つ・動く）
      await page.locator('#btn-hint').click();
      await expect(page.locator('#hint')).toBeVisible();
      await page.keyboard.press('Space');
      await expect(page.locator('#hint')).toBeHidden();
      // Esc でも閉じる
      await page.locator('#btn-hint').click();
      await expect(page.locator('#hint')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#hint')).toBeHidden();
      // 面を変えると自動で閉じる
      await page.locator('#btn-hint').click();
      await expect(page.locator('#hint')).toBeVisible();
      await page.locator('#btn-next-level').click();
      await expect(page.locator('#level-title')).toHaveText('面3 レーザーの線');
      await expect(page.locator('#hint')).toBeHidden();
    }
    for (const size of [{ width: 844, height: 390 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(size);
      await expect(page.locator('#hint')).toBeVisible();
      await expect(page.locator('#btn-hint')).toBeHidden();
    }
    await expectClean(page, seen);
  });

  test('面1の初回だけ、ヒントを開いて始める（compact・tiny）：保存が無い面1は開いている。面2以降・星のある面1は閉じている', async ({ page }) => {
    for (const size of [{ width: 375, height: 667 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(size);
      const seen = await open(page);
      await expect(page.locator('#btn-hint')).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#hint')).toBeVisible();
      await expect(page.locator('#hint')).toHaveText('光に入ると見つかる。箱を光の中へ押すと、その先に影ができる。');
      await page.goto(`${PATH}?level=3`);
      await expect(page.locator('#hint')).toBeHidden();
      await page.evaluate(({ key }) => localStorage.setItem(key, JSON.stringify({ muted: false, letterKeys: true, levels: { L1: { stars: 3, best: 10 } } })), { key: STORAGE });
      await page.goto(`${PATH}?level=1`);
      await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
      await expect(page.locator('#hint')).toBeHidden();
      await page.evaluate((key) => localStorage.removeItem(key), STORAGE);
      expect(seen.errors).toEqual([]);
    }
  });

  test('画面の回転・幅の変化：型とマスを計算し直し、動きの途中なら終わりの位置へ飛ばす。状態は変わらない', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const seen = await open(page, '?level=5');
    await tap(page, 'RUR');
    await steps(page, 3);
    const before = await readBoard(page);
    for (const size of [{ width: 844, height: 390 }, { width: 320, height: 568 }, { width: 1440, height: 900 }, { width: 375, height: 667 }]) {
      await page.setViewportSize(size);
      await expect(page.locator('html')).toHaveAttribute('data-layout', SIZES.find((s) => s.width === size.width).layout);
      await steps(page, 3);
      expect(await readBoard(page)).toEqual(before);
      const audit = await auditScreen(page);
      expect(audit.overflow).toBeLessThanOrEqual(0);
      const m = await page.evaluate(() => ({ b: document.querySelector('#board').getBoundingClientRect().bottom, c: document.querySelector('#controls').getBoundingClientRect().bottom, h: innerHeight }));
      expect(m.c).toBeLessThanOrEqual(m.h);
    }
    await expectClean(page, seen);
  });
});

test('キーとフォーカス：見つかった直後は「ひとつ戻す」、戻したあとは「戻す」。Space はボタンに乗っているとき1手だけ。文字のキーの切替は保存され、止めても矢印・Space・Backspace は効く', async ({ page }) => {
  const seen = await open(page, '?level=1');
  await page.locator('#btn-wait').focus();
  await page.keyboard.press('Space');
  await steps(page, 1); // ちょうど1手（二重に動かない）
  await settled(page);
  await page.keyboard.press('Space');
  await steps(page, 2);
  await page.keyboard.press('Enter'); // フォーカスがボタンなので、Enter もボタンの動作（待つ）1回だけ
  await steps(page, 3);
  await settled(page);
  await page.locator('#btn-restart').click();
  await steps(page, 0);
  // 見つかる
  await tap(page, 'DD');
  await expect(page.locator('#btn-caught-undo')).toBeFocused();
  await page.keyboard.press('z');
  await status(page, 'play');
  await expect(page.locator('#btn-undo')).toBeFocused();
  await tap(page, 'D');
  await expect(page.locator('#panel-caught')).toBeVisible();
  await page.keyboard.press('r'); // 見つかった：R＝最初へ
  await status(page, 'play');
  await steps(page, 0);
  await expect(page.locator('#btn-restart')).toBeFocused();

  // 文字のキーの切替
  await page.locator('#btn-howto').click();
  const sw = page.locator('#opt-letter-keys');
  await expect(sw).toHaveAttribute('role', 'switch');
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  expect((await sw.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await page.locator('#btn-howto-close').click();
  await expect(page.locator('#btn-howto')).toBeFocused();
  await page.locator('#btn-wait').focus();
  await page.locator('#btn-wait').blur();
  await page.keyboard.press('a'); // 止めたので W・A・S・D は動かさない
  await page.keyboard.press('w');
  await steps(page, 0);
  await page.keyboard.press('ArrowLeft'); // 矢印は効く
  await steps(page, 1);
  await page.keyboard.press('Backspace'); // Backspace は効く
  await steps(page, 0);
  await page.keyboard.press('ArrowLeft');
  await steps(page, 1);
  await page.keyboard.press('r'); // R は止まっている
  await steps(page, 1);
  await page.keyboard.press('z'); // Z も
  await steps(page, 1);
  await page.keyboard.press('Space'); // Space は効く
  await steps(page, 2);
  // 再読み込み後も外れたまま
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).letterKeys, STORAGE)).toBe(false);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('d');
  await steps(page, 0);
  await page.locator('#btn-howto').click();
  await expect(page.locator('#opt-letter-keys')).toHaveAttribute('aria-checked', 'false');
  await page.locator('#opt-letter-keys').press('Space'); // キーボードでも切り替えられる
  await expect(page.locator('#opt-letter-keys')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('d');
  await steps(page, 1);
  await expectClean(page, seen);
});

test('Tab の順＝見た目の順：帯 → 題字の行 → 面の帯 → 盤を文で読む → 操作 → フッター（390×844）。tiny では あそびかた・音 が帯に移り、順も帯の中になる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const seen = await open(page, '?level=1');
  const order = async (n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      await page.keyboard.press('Tab');
      out.push(await page.evaluate(() => document.activeElement.id || document.activeElement.getAttribute('href') || document.activeElement.tagName));
    }
    return out;
  };
  expect(await order(16)).toEqual([
    '../', 'btn-share', 'btn-howto', 'btn-sound', 'btn-prev', 'btn-levels', 'btn-next-level',
    'SUMMARY', 'btn-undo', 'btn-up', 'btn-restart', 'btn-left', 'btn-wait', 'btn-right', 'btn-down', '../privacy.html',
  ]);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`${PATH}?level=1`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  expect(await order(9)).toEqual(['../', 'btn-howto', 'btn-sound', 'btn-share', 'btn-prev', 'btn-levels', 'btn-next-level', 'btn-hint', 'SUMMARY']);
  // 盤を文で読む：キーボードで届いたときだけ見える。開くと光っているマス・次の1手で光るマス・影のマスを文で読める
  await page.keyboard.press('Enter');
  const lines = await page.locator('#board-lines li').allTextContents();
  expect(lines[0]).toBe('あなた：左から5・上から1');
  expect(lines.some((l) => l.startsWith('光っているマス：左から2・上から3'))).toBe(true);
  expect(lines.some((l) => l.startsWith('次の1手で光るマス：'))).toBe(true);
  expect(lines.some((l) => l === '影のマス：なし')).toBe(true);
  // 開いている間は、矢印で盤を動かさない（文のスクロールに使える）。Esc で閉じ、閉じたあとは矢印で動く
  await expect(page.locator('#board-text')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await steps(page, 0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#board-text')).not.toHaveAttribute('open', '');
  await expect(page.locator('#board-text > summary')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await steps(page, 1);
  await expectClean(page, seen);
});

test('名前：見えている全ボタン・リンクで、読み上げの名前が見える文字を含む（2.5.3）。一言は aria-hidden で、同じ文が #live にも出る', async ({ page }) => {
  const seen = await open(page, '?level=3');
  const check = async () => {
    const bad = await page.evaluate(() => {
      const norm = (s) => s.replace(/\s+/g, '');
      const out = [];
      for (const e of document.querySelectorAll('button, a[href], [role="switch"]')) {
        const r = e.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1 || e.closest('[hidden]') || e.closest('.boardtext')) continue;
        const label = e.getAttribute('aria-label');
        const text = e.innerText.split('\n').map((t) => t.trim()).filter(Boolean);
        if (!label && !text.length) out.push(`${e.id || e.className}：名前が無い`);
        if (label && text.length) for (const t of text) if (!norm(label).includes(norm(t))) out.push(`${e.id || e.className}：名前「${label}」に見える文字「${t}」が無い`);
      }
      return out;
    });
    expect(bad).toEqual([]);
  };
  await check();
  // 具体例（名前で探せる）
  for (const name of ['上へ', '右へ', '下へ', '左へ', 'その場で待つ', 'ひとつ戻す', '最初へ戻す', '音を消す', 'あそびかた', 'このアプリを共有する', '前の面', '次の面']) {
    await expect(page.getByRole('button', { name, exact: true }), name).toBeVisible();
  }
  await expect(page.getByRole('button', { name: '面3/8 レーザーの線（まだ）。面をえらぶ', exact: true })).toBeVisible();
  // 見つかった欄・窓
  await page.goto(`${PATH}?level=1`);
  await tap(page, 'DD');
  await expect(page.locator('#panel-caught')).toBeVisible();
  await check();
  await expect(page.getByRole('button', { name: '最初へ戻す', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '見つかった！' })).toBeVisible();
  await page.locator('#btn-caught-undo').click();
  await page.locator('#btn-howto').click();
  await check();
  await page.locator('#btn-howto-close').click();
  await page.locator('#btn-levels').click();
  await check();
  await page.locator('#btn-levels-close').click();
  // 一言は読み上げに出さない（#live だけ）
  await page.locator('#btn-up').click();
  await page.locator('#btn-up').click();
  await expect(page.locator('#toast')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#toast')).toHaveAttribute('role', 'status');
  await expect(page.locator('#live')).toHaveAttribute('aria-live', 'polite');
  const toastText = await page.locator('#toast').textContent();
  await expect(page.locator('#live')).toHaveText(toastText);
  // 星の絵には読み上げの名前が付く
  await page.locator('#btn-levels').click();
  const names = await page.locator('.level-row svg.stars').evaluateAll((n) => n.map((s) => s.getAttribute('aria-label')));
  expect(names).toEqual(Array(8).fill('星3つ中0つ'));
  expect(await page.locator('.level-row svg.stars').evaluateAll((n) => n.every((s) => s.getAttribute('role') === 'img'))).toBe(true);
  await page.keyboard.press('Escape');
  // 見つかった光の点滅は、1秒に3回を超えない（アニメーションの設定値を読む）
  await page.goto(`${PATH}?level=1`);
  await tap(page, 'DD');
  await expect(page.locator('#panel-caught')).toBeVisible();
  const flash = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.caught-beam'));
    const sec = (v) => (v.endsWith('ms') ? parseFloat(v) / 1000 : parseFloat(v));
    return { duration: sec(cs.animationDuration), count: cs.animationIterationCount, name: cs.animationName };
  });
  expect(flash.name).toBe('hk-flash');
  expect(flash.count).toBe('2');
  expect(1 / flash.duration, '1秒あたりの点滅の回数').toBeLessThanOrEqual(3);
  expect(flash.duration * Number(flash.count), '点滅の合計').toBeCloseTo(1, 1);
  await expectClean(page, seen);
});

test('窓：あそびかた・面の一覧・共有は <dialog>。開くとフォーカスが窓の中、閉じると開いたボタンに戻る。面の一覧の行を選ぶと面が変わる', async ({ page }) => {
  const seen = await open(page);
  for (const [openBtn, dialog, closeBtn] of [['#btn-howto', '#howto-dialog', '#btn-howto-close'], ['#btn-levels', '#level-dialog', '#btn-levels-close'], ['#btn-share', '#share-dialog', '#btn-share-close']]) {
    await page.locator(openBtn).click();
    await expect(page.locator(dialog)).toBeVisible();
    expect(await page.evaluate((d) => document.querySelector(d).tagName, dialog)).toBe('DIALOG');
    expect(await page.evaluate((d) => document.querySelector(d).contains(document.activeElement), dialog)).toBe(true);
    await page.locator(closeBtn).click();
    await expect(page.locator(dialog)).toBeHidden();
    await expect(page.locator(openBtn)).toBeFocused();
    // Esc でも、窓の外側（背景）を押しても閉じる
    await page.locator(openBtn).click();
    await page.keyboard.press('Escape');
    await expect(page.locator(dialog)).toBeHidden();
    await expect(page.locator(openBtn)).toBeFocused();
    await page.locator(openBtn).click();
    await page.mouse.click(2, 2);
    await expect(page.locator(dialog)).toBeHidden();
  }
  await expect(page.locator('#howto-title')).toHaveText('あそびかた');
  await expect(page.locator('#level-dialog-title')).toHaveText('面をえらぶ');
  await page.locator('#btn-howto').click();
  await expect(page.locator('.howto li')).toHaveCount(3);
  await expect(page.locator('.howto li').nth(0)).toHaveText('白い覆面があなた。見張りと警備員の光、レーザーが自分のマスに当たると見つかる。いま光っているマス（縞）に入ると、光が動く前に、その場で見つかる。点線の枠は、次の1手で光るマス。');
  await expect(page.locator('.howto li').nth(1)).toHaveText('箱で光をさえぎると、後ろに影ができる。影の中なら見つからない。箱をどかすと、光は戻る。箱は押せるが、引けない。');
  await expect(page.locator('.howto li').nth(2)).toHaveText('宝を取ると出口が開く。警備員は道を行き来し、箱があると引き返す。見張りはその場で向きを変える。');
  await expect(page.locator('.howto__keys')).toHaveText('矢印かWASDで移動・スペースで待つ・Zでひとつ戻す・Rで最初へ');
  await expect(page.locator('#opt-letter-keys')).toContainText('文字のキー（WASD・Z・R）を使う');
  await page.locator('#btn-howto-close').click();
  await page.locator('#btn-levels').click();
  await expect(page.locator('.level-row')).toHaveCount(8);
  await page.locator('.level-row[data-level="L6"]').click();
  await expect(page.locator('#level-dialog')).toBeHidden();
  await expect(page.locator('#level-title')).toHaveText('面6 通り道をふさがない');
  await expect(page.locator('#btn-wait')).toBeFocused();
  await expectClean(page, seen);
});

test('フッターと目印：登録なしの説明・プライバシー・一覧へのリンク。header・main・nav・footer。h1→見えない h2→欄の h2', async ({ page }) => {
  const seen = await open(page);
  await expect(page.locator('footer')).toContainText('登録なし。進み具合と設定は、この端末の中だけに保存し、自動では送りません。共有を押したときだけ、説明か結果（面・星・手数）とURLが共有先へ渡ります。');
  await expect(page.locator('footer').getByRole('link', { name: 'プライバシー' })).toHaveAttribute('href', '../privacy.html');
  await expect(page.locator('footer').getByRole('link', { name: '100日チャレンジの一覧' })).toHaveAttribute('href', '../');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.locator('header#band')).toHaveCount(1);
  await expect(page.locator('main#app')).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: '面をえらぶ' })).toHaveCount(1);
  await expect(page.locator('#level-title')).toHaveJSProperty('tagName', 'H2');
  await expect(page.locator('#hint')).toHaveText('光に入ると見つかる。箱を光の中へ押すと、その先に影ができる。');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0e1320');
  await expect(page.locator('head meta[name="description"]')).toHaveAttribute('content', '押せる箱で見張りと警備員の光、レーザーをさえぎり、影を通って宝を盗み出す、1手ずつ進む忍び込みパズル。全8面。登録なし。');
  // 公開URL・OGP・canonical（build が入れる）
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', PUBLIC_URL);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', '箱影の怪盗');
  await expectClean(page, seen);
});

// ---------------------------------------------------------------- 修正2周目：見た目の評価（11/20点）の指摘
test.describe('修正2周目：文字の組み方・小さい画面・押せない状態・見た目の整え', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  const SOLVED = (ids) => Object.fromEntries(ids.map((id) => [id, { stars: 3, best: 10 }]));
  const seed = (page, levels) => page.evaluate(({ key, levels: l }) => localStorage.setItem(key, JSON.stringify({ muted: false, letterKeys: true, levels: l })), { key: STORAGE, levels });
  const viewportBox = (page, sel) => page.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vw: innerWidth, vh: innerHeight }; }, sel);

  test('A1 共有の窓：見出しとボタンは、ほかの窓・成功の欄と同じ大きさと太さ。成功の欄は「Xで投稿」。端末の共有ボタンがあっても全文が窓に収まる', async ({ page }) => {
    await page.addInitScript(() => { navigator.share = async () => {}; }); // WebKit と同じ：端末の共有ボタン（共有…）が出て、説明文が長くなる
    const seen = await open(page);
    const font = (sel) => page.locator(sel).first().evaluate((e) => { const c = getComputedStyle(e); return `${c.fontSize}/${c.fontWeight}`; });
    await page.locator('#btn-share').click();
    await expect(page.locator('#share-dialog .share__button--primary')).toBeVisible();
    expect(await font('#share-dialog .share__label'), '見出しは、ほかの窓の見出しと同じ').toBe(await font('#howto-title'));
    expect(await font('#howto-title')).toBe('17px/800');
    const buttons = await page.locator('#share-dialog .share__button').evaluateAll((els) => els.map((e) => { const c = getComputedStyle(e); return `${c.fontSize}/${c.fontWeight}`; }));
    expect(new Set(buttons), '窓の中のボタンは、成功の欄のボタンと同じ').toEqual(new Set([await font('#btn-next')]));
    expect(await font('#btn-next')).toBe('16px/700');
    await expect(page.locator('#share-x')).toHaveText('Xで投稿');
    await expect(page.locator('#share-dialog .share').getByRole('link', { name: 'Xで投稿' })).toBeVisible();
    // 部品の説明文に、アプリ側で折り返しの区切りを入れる（文字は同じ）。「直／接」「リ／ンク」と語の途中で割れない
    await expect(page.locator('.share__note')).toHaveText('InstagramとYouTubeはWebから直接投稿できない仕組みなので、「共有…」かコピーしたリンクから貼ってください。');
    expect(await page.locator('.share__note wbr').count(), '説明文に折り返しの区切りがある').toBeGreaterThan(3);
    await expect(page.locator('.share__note .nb')).toHaveText(['Instagram', 'YouTube', 'Web', '直接投稿', '共有…', 'コピー', 'リンク']);
    await page.locator('#btn-share-close').click();
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.locator('#btn-share').click();
      await expect(page.locator('#share-dialog')).toBeVisible();
      expect(await dialogTextOverflow(page, '#share-dialog'), `${size.width}×${size.height} 共有の窓の文字が右で切れている`).toEqual([]);
      expect(await typoProblems(page), `${size.width}×${size.height} 共有の窓（共有ボタンあり）の文字の組み方`).toEqual([]);
      await page.locator('#btn-share-close').click();
    }
    await expectClean(page, seen);
  });

  test('A2・A3 文字の組み方：全面の最初・見つかった・詰み・成功・窓で、最後の行が4文字以下の段落と保護語の途中の改行が0件（5つの幅）', async ({ page }) => {
    test.setTimeout(LONG(300_000));
    const seen = await open(page);
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.width, height: size.height });
      const check = async (label) => expect(await typoProblems(page), `${size.width}×${size.height} ${label}`).toEqual([]);
      const go = async (no) => { await page.goto(`${PATH}?level=${no}`); await expect(page.locator('html')).toHaveAttribute('data-ready', 'true'); };
      for (const L of LEVELS) { await go(L.no); await check(`面${L.no} 最初`); }
      await go(1); await tap(page, 'DD'); await expect(page.locator('#panel-caught')).toBeVisible(); await check('面1 見つかった');
      await go(4); await tap(page, 'RDD'); await expect(page.locator('#panel-caught')).toBeVisible(); await check('面4 見つかった');
      await go(5); await tap(page, 'RURDDD'); await expect(page.locator('#panel-caught')).toBeVisible(); await check('面5 見つかった');
      await go(7); await tap(page, 'UUURRURDDDULLLDDR'); await expect(page.locator('#panel-caught')).toBeVisible(); await check('面7 見つかった');
      await go(3); await tap(page, 'RRRRDD'); await expect(page.locator('#panel-dead')).toBeVisible(); await check('面3 詰み');
      await go(1); await tap(page, LEVELS[0].solution); await expect(page.locator('#panel-clear')).toBeVisible(); await check('面1 成功');
      await go(8); await tap(page, LEVELS[7].solution); await expect(page.locator('#panel-clear')).toBeVisible(); await check('面8 成功（盤が大きく、右の列が狭い）');
      await go(1);
      for (const [open_, dialog] of [['#btn-howto', '#howto-dialog'], ['#btn-levels', '#level-dialog'], ['#btn-share', '#share-dialog']]) {
        await page.locator(open_).click();
        await expect(page.locator(dialog)).toBeVisible();
        await check(dialog);
        if (dialog === '#share-dialog') {
          const hasShare = await page.evaluate(() => typeof navigator.share === 'function'); // WebKit には端末の共有がある（説明文が2種類）
          await expect(page.locator('.share__note')).toHaveText(hasShare
            ? 'InstagramとYouTubeはWebから直接投稿できない仕組みなので、「共有…」かコピーしたリンクから貼ってください。'
            : 'InstagramとYouTubeはWebから直接投稿できない仕組みなので、リンクをコピーして貼ってください。');
          expect(await page.locator('.share__note wbr').count(), '説明文に区切りがある').toBeGreaterThan(3);
        }
        await page.keyboard.press('Escape');
      }
    }
    expect(seen.errors).toEqual([]);
  });

  test('A2 面の一覧：幅290でも「面6 通り道をふさがない」が1行（番号と名前が別の行に分かれない）。名前は行の幅いっぱいに使う', async ({ page }) => {
    await page.setViewportSize({ width: 290, height: 600 });
    const seen = await open(page);
    await page.locator('#btn-levels').click();
    await expect(page.locator('#level-dialog')).toBeVisible();
    expect(await typoProblems(page)).toEqual([]);
    const rows = await page.locator('.level-row__name').evaluateAll((els) => els.map((e) => ({ text: e.textContent, lines: Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)) })));
    for (const r of rows) expect(r.lines, `${r.text} は1行`).toBe(1);
    await expectClean(page, seen);
  });

  test('B1 320×568（tiny）：題字「箱影の怪盗」が帯の左に見える。帯は1行・横にはみ出さない。「100 DAYS / 066」は読み上げに全部残る', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const seen = await open(page);
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'tiny');
    await expect(page.getByRole('heading', { name: '箱影の怪盗', level: 1 })).toBeVisible();
    const m = await page.evaluate(() => {
      const r = (q) => { const b = document.querySelector(q).getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
      const title = document.querySelector('#app-title');
      return { band: r('#band'), title: r('#app-title'), home: r('.band__home'), share: r('#btn-share'), size: parseFloat(getComputedStyle(title).fontSize), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(m.title.width, '題字に幅がある（隠していない）').toBeGreaterThan(40);
    expect(m.size).toBeGreaterThanOrEqual(13);
    expect(m.title.left).toBeGreaterThanOrEqual(m.home.right - 0.5);
    expect(m.title.right).toBeLessThanOrEqual(m.share.left + 0.5);
    expect(m.band.height, '帯は1行').toBeLessThanOrEqual(56);
    expect(m.overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole('link', { name: '100 DAYS / 066' })).toHaveAttribute('href', '../');
    expect((await page.locator('.band__home').boundingBox()).width, '「066」だけでも押せる広さ').toBeGreaterThanOrEqual(43.5);
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.getByRole('heading', { name: '箱影の怪盗', level: 1 })).toBeVisible();
    await expectClean(page, seen);
  });

  test('B2 ヒントのボタンは、「次の面」の三角と別の形（電球の絵）。375では「ヒント」の文字つき、320では絵だけで44px', async ({ page }) => {
    const seen = await open(page);
    for (const [width, height, withText] of [[375, 667, true], [320, 568, false]]) {
      await page.setViewportSize({ width, height });
      await expect(page.locator('#btn-hint')).toBeVisible();
      expect(await page.locator('#btn-hint use').getAttribute('href')).toBe('#ic-hint');
      expect(await page.locator('#btn-next-level use').getAttribute('href')).toBe('#ic-next');
      expect(await page.locator('use[href="#ic-next"]').count(), '右向きの三角の絵は「次の面」だけ').toBe(1);
      if (withText) await expect(page.locator('.levelbar__hint-text')).toBeVisible();
      else await expect(page.locator('.levelbar__hint-text')).toBeHidden();
      const box = await page.locator('#btn-hint').boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(43.5);
      expect(box.height).toBeGreaterThanOrEqual(43.5);
      await expect(page.locator('#btn-hint')).toHaveAttribute('aria-label', 'ヒント');
    }
    await expectClean(page, seen);
  });

  test('B4 一言（最初に戻した・ぶつかった）は盤に重ならない：どの画面の型でも、ヒントの行か状態の行に出て、駒・出口・宝を隠さない', async ({ page }) => {
    const seen = await open(page);
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(`${PATH}?level=2`);
      await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
      await page.keyboard.press('ArrowUp'); // 面2の怪盗は左端にいる。上へ動くと、見張りの光に入らない
      await steps(page, 1);
      await page.locator('#btn-restart').click();
      await expect(page.locator('#toast')).toHaveText('最初に戻した。「ひとつ戻す」で取り消せる');
      await expect(page.locator('#toast')).toHaveClass(/is-on/);
      const m = await page.evaluate(() => {
        const r = (q) => { const b = document.querySelector(q).getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; };
        return { toast: r('#toast'), board: r('#board'), line: r('#hintline'), inStatus: Boolean(document.querySelector('#status #hintline')), inLevelwrap: Boolean(document.querySelector('#levelwrap #hintline')) };
      });
      const label = `${size.width}×${size.height}（${size.layout}）`;
      const overlap = Math.min(m.toast.right, m.board.right) - Math.max(m.toast.left, m.board.left) > 1 && Math.min(m.toast.bottom, m.board.bottom) - Math.max(m.toast.top, m.board.top) > 1;
      expect(overlap, `${label} 一言が盤に重なる`).toBe(false);
      expect(m.line.top, `${label} 一言の行は、行の外に伸びない`).toBeLessThanOrEqual(m.toast.top + 1);
      expect(size.layout === 'compact' || size.layout === 'tiny' ? m.inStatus : m.inLevelwrap, `${label} 置き場所`).toBe(true);
      await expect(page.locator('#toast')).toHaveAttribute('aria-hidden', 'true');
      await expect(page.locator('#live')).toHaveText('最初に戻した。「ひとつ戻す」で取り消せる');
    }
    await expectClean(page, seen);
  });

  test('お手本（compact・tiny）：状態の行の「とめる」を実際に押せる（ヒントと一言の行が上に重なって、押せなくならない）', async ({ page }) => {
    const seen = await open(page);
    for (const size of [{ width: 375, height: 667 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(size);
      await page.goto(`${PATH}?level=1`);
      await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
      await tap(page, 'DD');
      await expect(page.locator('#panel-caught')).toBeVisible();
      await page.locator('#btn-caught-restart').click();
      await tap(page, 'DD'); // 同じ面で2回目の失敗：「お手本を見る」が出る
      await expect(page.locator('#btn-caught-demo')).toBeVisible();
      await page.locator('#btn-caught-demo').click();
      await status(page, 'demo');
      await expect(page.locator('#hint')).toBeHidden(); // お手本の間は、ヒントを閉じておく
      await page.locator('#btn-demo-stop').click({ timeout: 5000 }); // 重なった行に押しを奪われると、ここで止まる
      await status(page, 'play');
      await steps(page, 0);
    }
    await expectClean(page, seen);
  });

  test('B5 全面クリア：見出しは「全8面クリア！」で「脱出成功！」と重ねない。星と手数は1行、星の合計を出す。320×568 で主ボタンが画面に収まる。ふつうの成功は「脱出成功！」', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const seen = await open(page);
    await seed(page, SOLVED(LEVELS.slice(0, 7).map((L) => L.id)));
    await page.goto(`${PATH}?level=8`);
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await tap(page, LEVELS[7].solution);
    await expect(page.locator('#panel-clear')).toBeVisible();
    await expect(page.locator('#clear-title-text')).toHaveText('全8面クリア！');
    await expect(page.locator('#panel-clear')).not.toContainText('脱出成功');
    await expect(page.locator('#clear-note')).toContainText('星 24/24');
    await expect(page.locator('#live')).toContainText('全8面クリア！');
    const row = await page.evaluate(() => ['#clear-stars', '#clear-stars-text', '#clear-steps'].map((q) => { const b = document.querySelector(q).getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; }));
    const mid = (b) => (b.top + b.bottom) / 2;
    expect(Math.max(...row.map(mid)) - Math.min(...row.map(mid)), '星・「星3つ」・手数は1行').toBeLessThan(6);
    const next = await viewportBox(page, '#btn-next');
    expect(next.bottom, '主ボタンが画面の中（下端）').toBeLessThanOrEqual(next.vh);
    expect(next.top).toBeGreaterThanOrEqual(0);
    // ふつうの成功は「脱出成功！」のまま（星の合計は出さない）
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE);
    await page.goto(`${PATH}?level=1`);
    await tap(page, LEVELS[0].solution);
    await expect(page.locator('#clear-title-text')).toHaveText('脱出成功！');
    await expect(page.locator('#clear-note')).not.toContainText('星 ');
    await expect(page.locator('#panel-clear')).toHaveAttribute('data-all', '0');
    await expectClean(page, seen);
  });

  test('C1 押せない見た目の「戻す」「最初へ」：初回も面を切り替えたあとも、disabled を使わず Tab が止まる。焦点の輪は不透明度に引きずられない', async ({ page }) => {
    const seen = await open(page);
    const probe = async () => page.evaluate(() => ['#btn-undo', '#btn-restart'].map((q) => {
      const e = document.querySelector(q);
      e.focus();
      const c = getComputedStyle(e);
      return { q, disabled: e.hasAttribute('disabled'), aria: e.getAttribute('aria-disabled'), tabindex: e.tabIndex, focused: document.activeElement === e, opacity: c.opacity, outline: `${c.outlineWidth} ${c.outlineStyle} ${c.outlineColor}` };
    }));
    for (const when of ['初回', '面を切り替えたあと']) {
      if (when !== '初回') {
        await page.locator('#btn-next-level').focus();
        await page.keyboard.press('Enter'); // キーボードで切り替える（マウスで押すと、あとの焦点の移動が :focus-visible にならず、輪が出ない）
        await expect(page.locator('#level-title')).toHaveText('面2 交わる光');
      }
      for (const r of await probe()) {
        expect(r.disabled, `${when} ${r.q} に disabled`).toBe(false);
        expect(r.aria, `${when} ${r.q}`).toBe('true');
        expect(r.tabindex, `${when} ${r.q} は Tab で止まる`).toBe(0);
        expect(r.focused, `${when} ${r.q} に焦点を当てられる`).toBe(true);
        expect(r.opacity, `${when} ${r.q} の輪が不透明度で薄くならない`).toBe('1');
        expect(r.outline, `${when} ${r.q} の輪の色（ほかのボタンと同じ）`).toBe('3px solid rgb(124, 196, 255)');
      }
    }
    await expectClean(page, seen);
  });

  test('C2 「盤を文で読む」の焦点の輪は、ほかのボタンと同じ角丸', async ({ page }) => {
    const seen = await open(page);
    await page.locator('#board-text summary').focus();
    const summary = await page.locator('#board-text summary').evaluate((e) => getComputedStyle(e).borderRadius);
    const button = await page.locator('#btn-wait').evaluate((e) => getComputedStyle(e).borderRadius);
    expect(summary).toBe(button);
    expect(summary).toBe('12px');
    await expectClean(page, seen);
  });

  test('C3 あそびかた：開いた直後の焦点は「とじる」（設定のスイッチではない）。本文が窓の高さを超えるときは、続きがあると分かる上下のぼかしが付く', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 450 });
    const seen = await open(page);
    await page.locator('#btn-howto').click();
    await expect(page.locator('#btn-howto-close')).toBeFocused();
    await expect(page.locator('#opt-letter-keys')).toHaveAttribute('aria-checked', 'true');
    const body = await page.locator('#howto-dialog .dialog__body').evaluate((e) => { const c = getComputedStyle(e); return { scrolls: e.scrollHeight > e.clientHeight + 1, image: c.backgroundImage, attach: c.backgroundAttachment }; });
    expect(body.scrolls, '720×450 では本文が窓の高さを超える').toBe(true);
    expect((body.image.match(/linear-gradient/g) ?? []).length, '上下の覆いと影の4層').toBe(4);
    expect(body.attach).toContain('local');
    expect(body.attach).toContain('scroll');
    // 面の一覧・共有の窓の最初の焦点は、今までどおり窓の中（先頭の押せるもの）
    await page.keyboard.press('Escape');
    await page.locator('#btn-levels').click();
    expect(await page.evaluate(() => document.querySelector('#level-dialog').contains(document.activeElement))).toBe(true);
    await expectClean(page, seen);
  });

  test('D1 成功の欄：下の余白が見つかった欄と同じ。「コピーしました」の空き欄が無い。結果を送るボタンは揃った2段（広い欄では1行）', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    const seen = await open(page);
    const gap = async (panel) => page.evaluate((q) => {
      const p = document.querySelector(q);
      const kids = [...p.children].filter((c) => c.getBoundingClientRect().height > 0);
      return p.getBoundingClientRect().bottom - Math.max(...kids.map((c) => c.getBoundingClientRect().bottom));
    }, panel);
    await tap(page, 'DD');
    await expect(page.locator('#panel-caught')).toBeVisible();
    const caughtGap = await gap('#panel-caught');
    await page.locator('#btn-caught-undo').click();
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE);
    await page.goto(`${PATH}?level=1`);
    await tap(page, LEVELS[0].solution);
    await expect(page.locator('#panel-clear')).toBeVisible();
    const clearGap = await gap('#panel-clear');
    expect(Math.abs(clearGap - caughtGap), `成功の欄の下の余白 ${clearGap}px と、見つかった欄 ${caughtGap}px`).toBeLessThanOrEqual(2);
    expect(clearGap).toBeLessThanOrEqual(16);
    const said = await page.locator('#share-said').boundingBox();
    expect(said === null || said.height < 2, '空けておく欄が無い').toBe(true);
    // ボタンは揃う。広い欄（既定の幅）は1行。幅390（欄が狭い）は揃った2段：3つのときは最後が横いっぱい。幅の狭い欄（768×1024の面8）は縦1列で、どれも1行の文字
    const arrange = () => page.locator('#share-row > :visible').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(e); const tops = new Set([...range.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top))); return { top: Math.round(b.top), left: Math.round(b.left), width: Math.round(b.width), lines: tops.size }; }));
    let rects = await arrange();
    const hasShare = await page.evaluate(() => typeof navigator.share === 'function'); // WebKit は「ほかのアプリで送る」が出て4つ
    const count = hasShare ? 4 : 3;
    expect(rects.length).toBe(count);
    expect(new Set(rects.map((r) => r.top)).size, '広い欄は1行').toBe(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'tall');
    rects = await arrange();
    const rows = [...new Set(rects.map((r) => r.top))];
    expect(rows.length, '幅390は揃った2段').toBe(2);
    const firstRow = rects.filter((r) => r.top === rows[0]);
    expect(firstRow.length).toBe(2);
    expect(Math.abs(firstRow[0].width - firstRow[1].width), '1段目の2つは同じ幅').toBeLessThanOrEqual(2);
    if (count === 3) expect(rects.find((r) => r.top === rows[1]).width, '2段目の1つは横いっぱい').toBeGreaterThan(firstRow[0].width * 1.8);
    await page.setViewportSize({ width: 320, height: 568 });
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'tiny');
    rects = await arrange();
    expect(new Set(rects.map((r) => r.top)).size, '幅320も揃った2段').toBe(2);
    await seed(page, SOLVED(LEVELS.slice(0, 7).map((L) => L.id)));
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${PATH}?level=8`);
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'wide');
    await tap(page, LEVELS[7].solution);
    await expect(page.locator('#panel-clear')).toBeVisible();
    rects = await arrange();
    expect(new Set(rects.map((r) => r.top)).size, '右の列が狭い欄は縦に1列').toBe(count);
    for (const r of rects) expect(r.lines, '「LINEで送る」などが2行に割れない').toBe(1);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE);
    await page.goto(`${PATH}?level=1`);
    await tap(page, LEVELS[0].solution);
    await expect(page.locator('#panel-clear')).toBeVisible();
    // 「コピーしました」はボタンの文字の差し替え：差し替えても、欄の高さは変わらない
    const before = await page.locator('#panel-clear').boundingBox();
    await page.locator('#share-copy').click();
    await expect(page.locator('#share-copy')).toHaveText('コピーしました');
    expect((await page.locator('#panel-clear').boundingBox()).height).toBeCloseTo(before.height, 0);
    await expectClean(page, seen);
  });

  test('D2 十字ボタンの「最初へ」は「戻す」より一段弱い（地が透明で縁だけ、文字が補助色）', async ({ page }) => {
    const seen = await open(page);
    await page.keyboard.press('ArrowLeft');
    await steps(page, 1);
    const style = (sel) => page.locator(sel).evaluate((e) => { const c = getComputedStyle(e); return { fill: c.backgroundColor, color: c.color, aria: e.getAttribute('aria-disabled') }; });
    const undo = await style('#btn-undo');
    const restart = await style('#btn-restart');
    expect(undo.aria).toBe('false');
    expect(restart.aria).toBe('false');
    expect(undo.fill, '「戻す」は塗りつぶし').not.toBe('rgba(0, 0, 0, 0)');
    expect(restart.fill, '「最初へ」は地が透明（縁だけ）').toBe('rgba(0, 0, 0, 0)');
    expect(restart.color, '文字が補助色').not.toBe(undo.color);
    await expectClean(page, seen);
  });

  test('D3 自分の駒：淡い輪が付く（見張りの青・光の黄・レーザーの赤と違う色）。見つかったときは赤白の輪に譲る。宝を持つと金の印が付く', async ({ page }) => {
    const seen = await open(page, '?level=1');
    await expect(page.locator('.player .player-ring')).toHaveCount(1);
    await expect(page.locator('.player .player-loot')).toHaveCount(0);
    const stroke = (sel) => page.locator(sel).first().evaluate((e) => getComputedStyle(e).stroke);
    const ring = await stroke('.player-ring');
    // 面1にある見張りの青・光の黄・（面5の）巡回の線とレーザーの赤と、輪の色が違う
    const others = await page.evaluate(() => ['.guard-body', '.hatch-line'].map((q) => { const e = document.querySelector(q); const c = e && getComputedStyle(e); return e ? [q, c.fill, c.stroke] : null; }).filter(Boolean));
    for (const [q, fill, strokeColor] of others) {
      expect(ring, `輪の色が ${q} の塗りと違う`).not.toBe(fill);
      expect(ring, `輪の色が ${q} の線と違う`).not.toBe(strokeColor);
    }
    expect(ring).not.toBe('rgb(243, 207, 99)'); // 光の黄
    expect(ring).not.toBe('rgb(255, 77, 109)'); // レーザーの赤
    expect(ring).not.toBe('rgb(106, 147, 238)'); // 見張りの青
    await tap(page, 'LLDRRDD');
    await expect(page.locator('#app')).toHaveAttribute('data-treasure', '1');
    await settled(page);
    await expect(page.locator('.player .player-loot')).toHaveCount(1); // 宝を持った印
    await page.goto(`${PATH}?level=1`);
    await tap(page, 'DD');
    await expect(page.locator('#panel-caught')).toBeVisible();
    await expect(page.locator('.player .player-ring')).toHaveCount(0); // 見つかった：赤白の二重の輪（.caught-mark）が代わりに付く
    await expect(page.locator('.caught-mark')).toHaveCount(1);
    await expectClean(page, seen);
  });

  test('D4 横向き（844×390）：十字ボタンは右の欄の右寄せ（親指側）。広い画面（1440×900）では左寄せのまま', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    const seen = await open(page);
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'short');
    let c = await viewportBox(page, '#controls');
    const grid = await page.evaluate(() => { const r = [...document.querySelectorAll('#controls .pad')].map((e) => e.getBoundingClientRect()); return Math.max(...r.map((b) => b.right)); });
    expect(c.vw - grid, '押せる列の右端が、画面の右の余白（16px）に近い').toBeLessThanOrEqual(20);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'wide');
    c = await viewportBox(page, '#controls');
    const left = await page.evaluate(() => Math.min(...[...document.querySelectorAll('#controls .pad')].map((e) => e.getBoundingClientRect().left)));
    const column = await page.evaluate(() => document.querySelector('#dock').getBoundingClientRect().left);
    expect(left - column, 'wide では左寄せのまま').toBeLessThanOrEqual(2);
    await expectClean(page, seen);
  });
});

test('JavaScript が無いとき：読み込み中でも HTML だけで帯・題字・面の帯・盤の枠・操作が出て、案内の文が出る', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(PATH);
  await expect(page.getByRole('heading', { name: '箱影の怪盗', level: 1 })).toBeVisible();
  await expect(page.locator('.noscript')).toHaveText('このゲームは JavaScript を使います。');
  await expect(page.locator('#levelbar')).toBeVisible();
  await expect(page.locator('#board')).toBeVisible();
  await expect(page.locator('#controls')).toBeVisible();
  await context.close();
});
