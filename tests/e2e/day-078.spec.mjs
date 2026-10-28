import { expect, test } from '@playwright/test';
import { STAGES } from '../../day-078-saki-ni-100/lib/stages.js';
import { createSolver } from '../../day-078-saki-ni-100/lib/solver.js';

const base = '/day-078-saki-ni-100/?seed=1';
const errors = new WeakMap(), external = new WeakMap();
test.use({ reducedMotion: 'reduce' });
test.beforeEach(async ({ page, baseURL }) => {
  errors.set(page, []); external.set(page, []);
  page.on('pageerror', error => errors.get(page).push(error.message));
  const origin = new URL(baseURL).origin;
  page.on('request', request => {
    if (!request.url().startsWith(origin + '/') && !/^(data|blob):/.test(request.url())) external.get(page).push(request.url());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(external.get(page)).toEqual([]);
});
async function waitForHumanOrEnd(page) {
  await expect(page.locator('#turn')).toHaveAttribute('data-turn', /^(human|finished)$/);
}
async function win(page, stage, keyboard = false) {
  const solver = createSolver(stage);
  for (let i = 0; i < stage.target; i++) {
    await waitForHumanOrEnd(page);
    if (await page.locator('#result').isVisible()) break;
    const total = Number(await page.locator('#total').textContent());
    const moves = solver.winningMoves(total);
    expect(moves.length, `面${stage.id} 合計${total}の勝ち手`).toBeGreaterThan(0);
    const move = moves[0];
    if (keyboard) await page.keyboard.press(move === 10 ? '0' : String(move));
    else await page.locator(`#moves [data-move="${move}"]`).click();
  }
  await expect(page.locator('#result')).toHaveAttribute('data-result', 'win');
}

test('初回説明は操作を覆わず、1面を最善手で勝つと次の面が開く', async ({ page }) => {
  await page.goto(base);
  await expect(page.locator('#help-panel')).toBeHidden();
  await expect(page.locator('#intro')).toBeVisible();
  await expect(page.locator('#moves [data-move="2"]')).toBeEnabled();
  await expect(page.locator('#stage-nav [data-stage="2"]')).toBeDisabled();
  await win(page, STAGES[0]);
  await expect(page.locator('#review')).toContainText('2・6・10');
  await expect(page.locator('#stage-nav [data-stage="2"]')).toBeEnabled();
  await page.locator('#next-button').click();
  await expect(page.locator('#stage-nav [data-stage="2"]')).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('#target')).toHaveText('17');
});
test('間違えて負けると分かれ目が出て、もう一度で初期化する', async ({ page }) => {
  await page.goto(base);
  for (let i = 0; i < 10; i++) {
    await waitForHumanOrEnd(page);
    if (await page.locator('#result').isVisible()) break;
    await page.locator('#moves [data-move="1"]').click();
  }
  await expect(page.locator('#result')).toHaveAttribute('data-result', 'lose');
  await expect(page.locator('#review')).toContainText('合計0から1を足した手');
  await expect(page.locator('#review')).toContainText('2を足せば');
  await page.locator('#retry-button').click();
  await expect(page.locator('#total')).toHaveText('0');
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#history')).toContainText('まっさら');
});
test('ヒントは目印、数字の強調の順に出て、使ったクリアには◎を付けない', async ({ page }) => {
  await page.goto(base);
  await page.locator('#hint-button').click();
  await expect(page.locator('#hint-marks')).toBeVisible();
  expect(await page.locator('#markers span').allTextContents()).toEqual(['2','6','10']);
  await expect(page.locator('#moves .recommended')).toHaveCount(0);
  await page.locator('#hint-button').click();
  await expect(page.locator('#moves [data-move="2"]')).toHaveClass(/recommended/);
  await expect(page.locator('#hint-button')).toBeDisabled();
  await win(page, STAGES[0]);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('saki-ni-100.v1')));
  expect(saved.cleared).toEqual([1]); expect(saved.noHint).toEqual([]);
});
test('キーボードだけで1面に勝てる', async ({ page }) => {
  await page.goto(base);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await win(page, STAGES[0], true);
  await expect(page.locator('#result')).toHaveAttribute('data-result', 'win');
});
test('クリアと音設定が再読み込み後も残り、ロック面は選べない', async ({ page }) => {
  await page.goto(base);
  await page.locator('#sound-button').click();
  await win(page, STAGES[0]);
  await page.reload();
  await expect(page.locator('#stage-nav [data-stage="1"]')).toHaveAccessibleName(/ヒントなしでクリア/);
  await expect(page.locator('#stage-nav [data-stage="2"]')).toBeEnabled();
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#stage-nav [data-stage="3"]')).toBeDisabled();
  // 続きから：再読み込み後は、まだクリアしていない最初の面（2面）が開く。
  await expect(page.locator('#stage-nav [data-stage="2"]')).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('#target')).toHaveText('17');
  // ロックされた面は、押しても現在の面が変わらない。
  await page.locator('#stage-nav [data-stage="3"]').evaluate(button => button.click());
  await expect(page.locator('#stage-nav [data-stage="2"]')).toHaveAttribute('aria-current', 'step');
});
test('390pxでも横スクロールがなく、数字は44px以上', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  // Inspect all ten buttons too, without bypassing normal play in the all-clear test.
  await page.evaluate(() => localStorage.setItem('saki-ni-100.v1', JSON.stringify({cleared:Array.from({length:11},(_,i)=>i+1),noHint:[],sound:false})));
  await page.reload();
  for (const id of [1,12]) {
    await page.locator(`#stage-nav [data-stage="${id}"]`).click();
    const sizes = await page.locator('#moves button').evaluateAll(nodes => nodes.map(n => ({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
    for (const size of sizes) { expect(size.width).toBeGreaterThanOrEqual(44); expect(size.height).toBeGreaterThanOrEqual(44); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});
// あいての手の待ち時間は、ページの時計を止めて確かめる（実時間の短い窓に頼らない）。
async function seed(page, cleared) {
  await page.evaluate(value => localStorage.setItem('saki-ni-100.v1', value), JSON.stringify({ cleared, noHint: [], sound: false }));
  await page.reload();
}
// 時計を止めて開く。ここから先は clock.runFor() するまで、あいての手の待ち時間は進まない。
async function openFrozen(page, cleared) {
  if (cleared) await page.addInitScript(([name, value]) => localStorage.setItem(name, value), ['saki-ni-100.v1', JSON.stringify({ cleared, noHint: [], sound: false })]);
  await page.clock.install();
  await page.goto(base);
  await page.clock.pauseAt(new Date(Date.now() + 60_000));
}
test('待ち中に「もう一度」を押すと、前のあいての手は入らない', async ({ page }) => {
  await openFrozen(page);
  await page.locator('#moves [data-move="2"]').click();
  await expect(page.locator('#turn')).toHaveAttribute('data-turn', 'cpu');
  await page.locator('#retry-button').click();
  await page.clock.runFor(2000); // 取り消していなければ、ここで前のあいての手が入る
  await expect(page.locator('#total')).toHaveText('0');
  await expect(page.locator('#history')).toContainText('まっさら');
  await expect(page.locator('#turn')).toHaveAttribute('data-turn', 'human');
});
test('待ち中に面を切り替えると、前のあいての手は新しい面に入らない', async ({ page }) => {
  await openFrozen(page, [1]); // 2面から始まる（1面は選び直せる）
  await expect(page.locator('#target')).toHaveText('17');
  await page.locator('#moves [data-move="1"]').click();
  await expect(page.locator('#turn')).toHaveAttribute('data-turn', 'cpu');
  await page.locator('#stage-nav [data-stage="1"]').click();
  await page.clock.runFor(2000);
  await expect(page.locator('#target')).toHaveText('10');
  await expect(page.locator('#total')).toHaveText('0');
  await expect(page.locator('#turn')).toHaveAttribute('data-turn', 'human');
});
test('タブを隠している間はあいてが打たず、戻ると打つ', async ({ page }) => {
  const visibility = hidden => page.evaluate(value => {
    Object.defineProperty(document, 'hidden', { value, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await openFrozen(page);
  await page.locator('#moves [data-move="2"]').click();
  await expect(page.locator('#turn')).toHaveAttribute('data-turn', 'cpu');
  await visibility(true);
  await page.clock.runFor(3000);
  await expect(page.locator('#total')).toHaveText('2');
  await expect(page.locator('#turn')).toHaveAttribute('data-turn', 'cpu');
  await visibility(false);
  await page.clock.runFor(1000);
  expect(Number(await page.locator('#total').textContent())).toBeGreaterThan(2);
  await expect(page.locator('#turn')).toHaveAttribute('data-turn', /^(human|finished)$/);
});
test('次の面がすでに開いていれば、負けても「次の面へ」で進める', async ({ page }) => {
  await page.goto(base);
  await page.locator('#moves [data-move="1"]').click(); // 最初の負けでは次の面が開いていない
  for (let i = 0; i < 10; i++) {
    await waitForHumanOrEnd(page);
    if (await page.locator('#result').isVisible()) break;
    await page.locator('#moves [data-move="1"]').click();
  }
  await expect(page.locator('#result')).toHaveAttribute('data-result', 'lose');
  await expect(page.locator('#next-button')).toBeHidden();
  await seed(page, [1]);
  await page.locator('#stage-nav [data-stage="1"]').click();
  for (let i = 0; i < 10; i++) {
    await waitForHumanOrEnd(page);
    if (await page.locator('#result').isVisible()) break;
    await page.locator('#moves [data-move="1"]').click();
  }
  await expect(page.locator('#result')).toHaveAttribute('data-result', 'lose');
  await expect(page.locator('#next-button')).toBeVisible();
  await page.locator('#next-button').click();
  await expect(page.locator('#stage-nav [data-stage="2"]')).toHaveAttribute('aria-current', 'step');
});
// 決まった手の列を打つ（あいての手は ?seed=1 で決まっているので、結果は毎回同じ）
async function openAt(page, cleared) {
  await page.addInitScript(([name, value]) => localStorage.setItem(name, value), ['saki-ni-100.v1', JSON.stringify({ cleared, noHint: [], sound: false })]);
  await page.goto(base);
}
async function playMoves(page, moves) {
  for (const n of moves) {
    await waitForHumanOrEnd(page);
    await page.locator(`#moves [data-move="${n}"]`).click();
  }
}
test('8面：足せる数がなくなって負けたとき、その理由が盤に出る', async ({ page }) => {
  await openAt(page, [1, 2, 3, 4, 5, 6, 7]);
  await expect(page.locator('#target')).toHaveText('30');
  await expect(page.locator('#rule-line')).toContainText('足せる数がなくなった人も負け');
  await playMoves(page, [5, 5, 5]); // 5→12→22、あいてが29にして、あなたは足せる数がない
  await expect(page.locator('#result')).toHaveAttribute('data-result', 'lose');
  await expect(page.locator('#total')).toHaveText('29');
  await expect(page.locator('#turn')).toContainText('あなたは足せる数がありません（残り1）');
  await expect(page.locator('#review')).toContainText('足せる数がなくなった人の負け');
});
test('8面：あいてが足せる数をなくしたときは、あなたの勝ち', async ({ page }) => {
  await openAt(page, [1, 2, 3, 4, 5, 6, 7]);
  await playMoves(page, [7, 7, 5]); // 7→19→29、あいては足せる数がない
  await expect(page.locator('#result')).toHaveAttribute('data-result', 'win');
  await expect(page.locator('#total')).toHaveText('29');
  await expect(page.locator('#turn')).toContainText('あいては足せる数がありません');
});
test('負けたあと、勝ち筋を外した手に金の枠と「ここ」が付き、「もう一度」が主操作になる', async ({ page }) => {
  await page.goto(base);
  for (let i = 0; i < 10; i++) {
    await waitForHumanOrEnd(page);
    if (await page.locator('#result').isVisible()) break;
    await page.locator('#moves [data-move="1"]').click();
  }
  await expect(page.locator('#result')).toHaveAttribute('data-result', 'lose');
  expect(await page.locator('#bar-wrap .mistake-frame').count()).toBeGreaterThan(0);
  expect(await page.locator('#history li.mistake').count()).toBeGreaterThan(0);
  await expect(page.locator('#history li.mistake em').first()).toHaveText('ここ');
  await expect(page.locator('#bar-legend')).toBeVisible();
  await expect(page.locator('#retry-button')).toHaveClass(/primary/);
  await page.locator('#retry-button').click();
  await expect(page.locator('#bar-wrap .mistake-frame')).toHaveCount(0);
  await expect(page.locator('#bar-legend')).toBeHidden();
  await expect(page.locator('#retry-button')).not.toHaveClass(/primary/);
});
test('ヒントを出しても、数字ボタンは動かない', async ({ page }) => {
  await page.goto(base);
  // ページ上の位置で比べる（ヒントが見えるよう画面がスクロールしても、数字ボタンの場所は変わらない）
  const top = () => page.locator('#moves').evaluate(e => e.getBoundingClientRect().top + window.scrollY);
  const before = await top();
  await page.locator('#hint-button').click();
  await expect(page.locator('#hint-box')).toBeVisible();
  expect(Math.abs((await top()) - before)).toBeLessThanOrEqual(1);
  await page.locator('#hint-button').click();
  expect(Math.abs((await top()) - before)).toBeLessThanOrEqual(1);
  await expect(page.locator('#bar line.mark')).toHaveCount(2); // 2・6（10は目標なので線にしない）
});
test('勝ち筋を外したのに勝った局は、あいてのミスに助けられたと伝える', async ({ page }) => {
  await page.goto(base);
  // ?seed=1 の1面で、2→1→2 と打つと、あいてが2回間違えて勝つ（2手目の1は、勝ち筋を外した手）
  await playMoves(page, [2, 1, 2]);
  await expect(page.locator('#result')).toHaveAttribute('data-result', 'win');
  await expect(page.locator('#result-label')).toContainText('助けられた');
  await expect(page.locator('#review')).toContainText('勝ち筋を外した手が1回');
  await expect(page.locator('#stamp')).toBeVisible();
  await expect(page.locator('#bar-wrap .mistake-frame')).toHaveCount(1);
  await expect(page.locator('#history li.mistake')).toHaveCount(1);
});
test('足せない数のキーを押すと、その理由が出る', async ({ page }) => {
  await openAt(page, [1, 2, 3, 4, 5, 6, 7]);
  await waitForHumanOrEnd(page);
  await page.keyboard.press('1');
  await expect(page.locator('#move-reason')).toContainText('1は足せません');
  await expect(page.locator('#key-notice')).toContainText('1は足せません');
  await expect(page.locator('#total')).toHaveText('0');
});
test('スマホ：面を選ぶと盤の先頭が見える位置へ戻り、下の欄も盤と同じ幅', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAt(page, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  await page.locator('#stage-nav [data-stage="12"]').scrollIntoViewIfNeeded();
  await page.locator('#stage-nav [data-stage="1"]').click();
  await expect(page.locator('#target')).toHaveText('10');
  await expect.poll(async () => (await page.locator('.board').boundingBox()).y).toBeGreaterThanOrEqual(-1);
  const board = await page.locator('.board').boundingBox();
  const notes = await page.locator('.notes').boundingBox();
  expect(Math.abs(notes.width - board.width)).toBeLessThanOrEqual(1);
});
// 12面を4つの章に分けて通す。前の章まで終えた記録を入れて再読み込みすると、続きの面から始まる。
// 1本にまとめるとCIの遅い描画で時間切れになりうるので、章ごとに時間の上限を持たせる。
for (const [from, to] of [[1, 3], [4, 6], [7, 9], [10, 12]]) {
  test(`${from}〜${to}面を最善手で勝ち進める${to === 12 ? '（全面クリア）' : ''}`, async ({ page }) => {
    test.setTimeout(90000);
    await page.goto(base);
    if (from > 1) {
      const cleared = Array.from({ length: from - 1 }, (_, i) => i + 1);
      await page.evaluate(value => localStorage.setItem('saki-ni-100.v1', value), JSON.stringify({ cleared, noHint: cleared, sound: false }));
      await page.reload();
    }
    for (const stage of STAGES.slice(from - 1, to)) {
      await expect(page.locator(`#stage-nav [data-stage="${stage.id}"]`)).toHaveAttribute('aria-current', 'step');
      await win(page, stage);
      if (stage.id < 12) await page.locator('#next-button').click();
    }
    if (to === 12) {
      await expect(page.locator('#next-button')).toBeHidden();
      await expect(page.locator('#all-clear')).toBeVisible();
      await expect(page.locator('#progress')).toHaveText('12 / 12 クリア');
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('saki-ni-100.v1')));
      expect(saved.cleared).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
      expect(saved.noHint).toEqual(saved.cleared);
    }
  });
}
