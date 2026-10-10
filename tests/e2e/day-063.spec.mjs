import { test, expect } from '@playwright/test';
import { RULES_LINE, S_TIME_LIMIT_SEC, STAGES } from '../../day-063-dark-patterns/lib/stages.js';

const PATH = '/day-063-dark-patterns/';
const CANONICAL = 'https://hundred-days.pages.dev/day-063-dark-patterns/';
// 現場名のカットイン。この間は偽サイトが inert（操作できない）で、制限時間も進まない
const CUTIN_MS = 1000;
// 結果画面を出した直後に入力を受け付けない時間（app.js の RESULT_GUARD_MS）
const RESULT_GUARD_MS = 400;
// 解説モーダル・第5現場の最終確認を出した直後と、第4現場の確認ダイアログを閉じた直後に入力を受け付けない時間（app.js の INPUT_GUARD_MS）
const INPUT_GUARD_MS = 450;

/* 第1・第2現場は周ごとに文言と配置が変わり、第3〜5現場は並び順が変わる。
   ロケータは位置や文言ではなく、ID と value で引く。第2現場の折りたたみは、ある周だけ開く。 */
const modal = (page) => page.locator('#modal-cleared');

// 時計を止めたページ（installClock を通したもの）。入力の停止が明けるまで、止めた時計を進める必要がある
const clockedPages = new WeakSet();

/* 出したばかりの部品の入力の停止が明けるまで待つ。時計を止めたテストでは時計を進め、
   実時間のテストでは何もしない（Playwright のクリックは、押せるようになるまで待つ） */
async function passInputGuard(page) {
  if (clockedPages.has(page)) await page.clock.runFor(INPUT_GUARD_MS);
}

async function startGame(page) {
  await page.goto(PATH);
  await page.locator('#btn-start-game').click();
}

async function nextFromModal(page) {
  await expect(modal(page)).toHaveClass(/active/);
  await passInputGuard(page);
  await page.locator('#btn-next-stage').click();
  await expect(modal(page)).not.toHaveClass(/active/);
}

async function retryFromModal(page) {
  await expect(modal(page)).toHaveClass(/active/);
  await passInputGuard(page);
  await page.locator('#btn-retry-stage').click();
  await expect(modal(page)).not.toHaveClass(/active/);
}

async function passStage1(page) {
  await page.locator('#btn-reject-confirmshame').click();
}

async function passStage2(page) {
  const summary = page.locator('.accordion-summary');
  if (await summary.count()) await summary.click();
  await page.locator('#chk-safe-plan').check();
  await page.locator('#btn-sub-start').click();
}

async function passStage3(page) {
  await page.locator('input[value="freecancel"]').check();
  await page.locator('#btn-hotel-submit').click();
}

async function passStage4(page) {
  await page.locator('#chk-opt-sub').click();
  await page.locator('#btn-remove-sub').click();
  await passInputGuard(page); // 確認ダイアログを閉じた直後は、偽サイトを押せない
  await page.locator('#chk-opt-warranty').uncheck();
  await page.locator('#btn-stage1-subtle').click();
}

async function passStage5(page) {
  await page.locator('input[value="leave"]').check();
  await page.locator('#btn-real-cancel').click();
  await passInputGuard(page); // 最終確認は、出た直後は押せない
  await page.locator('#btn-final-leave').click();
}

const PASSES = [passStage1, passStage2, passStage3, passStage4, passStage5];

// 時計を止めた状態で、各現場を「カットイン＋msPerStage」で確定して最後まで進める
async function playWithClock(page, msPerStage) {
  for (const pass of PASSES) {
    await page.clock.runFor(CUTIN_MS);
    await page.clock.runFor(msPerStage);
    await pass(page);
    await nextFromModal(page);
  }
  await expect(page.locator('#screen-result')).toHaveClass(/active/);
  await passResultGuard(page);
}

// 結果画面が入力を受け付け始めるまで（止めた時計を進める）
async function passResultGuard(page) {
  await page.clock.runFor(RESULT_GUARD_MS + 100);
  await expect(page.locator('#screen-result')).not.toHaveAttribute('inert');
}

// 要素の中心を、Playwright の待ち合わせなしで座標クリックする（人の指と同じく、そのとき一番上にあるものに当たる）
async function clickAt(page, selector) {
  const box = await page.locator(selector).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

// カットインが終わり、偽サイトを操作できるようになるまで待つ（時計を止めていないテスト用）
async function waitPlayable(page) {
  await expect(page.locator('#stage-viewport')).not.toHaveAttribute('inert');
}

// 動いているアニメーションと遷移が終わるのを待つ（位置を測る前に。動きを減らす設定と組み合わせる）
async function settleAnimations(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => null))));
}

async function installClock(page) {
  await page.clock.install({ time: new Date('2026-10-10T09:00:00Z') });
  await page.goto(PATH);
  await page.clock.pauseAt(new Date('2026-10-10T09:00:05Z'));
  clockedPages.add(page);
}

function collectDialogs(page) {
  const dialogs = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  return dialogs;
}

test('初期スタート画面が正常に表示され、Sの条件がルール欄にある', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(PATH);
  await expect(page.getByRole('heading', { name: '解約ボタンは、どれ？' })).toBeVisible();
  await expect(page.locator('#btn-start-game')).toBeVisible();
  await expect(page.locator('#btn-start-game')).toContainText('全5現場');
  await expect(page.locator('#rules-rank')).toHaveText(RULES_LINE);
  await expect(page.locator('#rules-rank')).toContainText(`合計${S_TIME_LIMIT_SEC}秒以内`);

  expect(errors).toEqual([]);
});

test('全5現場を完全看破して結果画面に到達する（最後の解説は報告書へ進むボタン）', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const dialogs = collectDialogs(page);

  await startGame(page);
  for (const [index, pass] of PASSES.entries()) {
    await expect(page.locator('#hud-stage-text')).toContainText(`${index + 1} / 5`);
    await pass(page);
    await expect(modal(page)).toHaveClass(/active/);
    await expect(page.locator('#modal-stage-damage')).toContainText('¥0');
    await expect(page.locator('#modal-badge')).toContainText('BUSTED!');
    await expect(page.locator('#btn-next-stage')).toContainText(index === 4 ? '捜査報告書を見る' : '次の現場へ進む');
    await page.locator('#btn-next-stage').click();
  }

  await expect(page.locator('#screen-result')).toHaveClass(/active/);
  await expect(page.locator('#result-total-damage')).toContainText('¥0');
  await expect(page.locator('#result-rank-letter')).toContainText(/S|A/);
  await expect(page.locator('#btn-retry')).toBeVisible();
  await expect(page.locator('#btn-share-x')).toBeVisible();
  await expect(page.locator('#result-stage-list .stage-report-item')).toHaveCount(5);

  // 再挑戦はタイトルを飛ばして第1現場から
  await page.locator('#btn-retry').click();
  await expect(page.locator('#hud-stage-text')).toContainText('1 / 5');

  expect(dialogs).toEqual([]);
  expect(errors).toEqual([]);
});

test('現場リトライボタンで直前の失敗を取り消して即座に再挑戦できる', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await startGame(page);
  await expect(page.locator('#hud-stage-text')).toContainText('1 / 5');
  await page.locator('#btn-accept-coupon').click();
  await expect(modal(page)).toHaveClass(/active/);
  await expect(page.locator('#modal-stage-damage')).toContainText('+¥');
  // 失敗の札は文字だけでなく枠と地も失敗の色
  await expect(page.locator('#modal-badge')).toHaveClass(/is-trapped/);
  await expect(page.locator('#modal-badge')).toContainText('TRAPPED!');

  await page.locator('#btn-retry-stage').click();
  await expect(modal(page)).not.toHaveClass(/active/);
  await expect(page.locator('#hud-stage-text')).toContainText('1 / 5');
  await expect(page.locator('#hud-damage-text')).toContainText('¥0');

  await passStage1(page);
  await expect(page.locator('#modal-stage-damage')).toContainText('¥0');

  expect(errors).toEqual([]);
});

test('タイムアウト時は未達成として扱われ、最終結果と一貫する（20秒待って時間切れ→B）', async ({ page }) => {
  // 第1現場の制限は20秒。カットイン（約1秒）の間は数えないので、時間切れは開始の約21秒後
  test.setTimeout(75_000);
  await startGame(page);

  await page.waitForTimeout(19_000);
  await expect(modal(page)).not.toHaveClass(/active/);
  await expect(modal(page)).toHaveClass(/active/, { timeout: 6_000 });
  await expect(page.locator('#modal-title')).toContainText('時間切れ！');
  await expect(page.locator('#modal-badge')).toHaveClass(/is-timeout/);
  // 内訳は「時間切れ（手続き未完了）」＋札「未達」。被弾 +¥0 とは出さない
  await expect(page.locator('#modal-stage-detail')).toContainText('時間切れ（手続き未完了）');
  await expect(page.locator('#modal-stage-detail .trap-detail-tag')).toHaveText('未達');
  await expect(page.locator('#modal-stage-detail')).not.toContainText('被弾');
  await page.locator('#btn-next-stage').click();

  for (const pass of PASSES.slice(1)) {
    await pass(page);
    await nextFromModal(page);
  }

  await expect(page.locator('#screen-result')).toHaveClass(/active/);
  await expect(page.locator('#result-total-damage')).toContainText('¥0');
  await expect(page.locator('#result-rank-letter')).toContainText('B');
  const firstItem = page.locator('#result-stage-list .stage-report-item').first();
  await expect(firstItem).toContainText('未達 (時間切れ)');
  await expect(page.locator('#result-goal')).toHaveText('時間切れなしで通すとA以上');

  // 共有文もランクと一致させる（時間切れの周に「クリア」と書かない）
  const href = await page.locator('#btn-share-x').getAttribute('href');
  const text = new URL(href).searchParams.get('text');
  expect(text).toContain('迷えるネット市民（時間切れ）');
  expect(text).toContain('ランクB');
  // 称号に「時間切れ」が入っているので、末尾の注記で2回書かない
  expect(text.match(/時間切れ/g)).toHaveLength(1);
  expect(text).not.toContain('クリア');
});

test('計時は Date.now() の実時間の積算：端数を捨てず、解説を読む時間は入れず、失敗した試行の時間は残す', async ({ page }) => {
  await installClock(page);
  await page.locator('#btn-start-game').click();

  // 第1現場は一度失敗する。失敗した試行の611msは、やり直しても合計に残る
  await page.clock.runFor(CUTIN_MS);
  await page.clock.runFor(611);
  await page.locator('#btn-accept-coupon').click();
  await expect(modal(page)).toHaveClass(/active/);
  await page.clock.runFor(10_000); // 解説を読む10秒は数えない
  await page.locator('#btn-retry-stage').click();

  // 100の倍数でない時間で確定する（表示更新の回数×100msで数える実装なら、ここで合計がずれる）
  const plan = [937, 1234, 1501, 1777, 2003];
  for (const [index, pass] of PASSES.entries()) {
    await page.clock.runFor(CUTIN_MS); // カットインの1秒も数えない
    await page.clock.runFor(plan[index]);
    await pass(page);
    await expect(modal(page)).toHaveClass(/active/);
    await page.clock.runFor(10_000);
    await page.locator('#btn-next-stage').click();
  }

  await expect(page.locator('#screen-result')).toHaveClass(/active/);
  /* 第4・第5現場では、確認ダイアログを閉じた直後と最終確認を出した直後の入力の停止（INPUT_GUARD_MS）が明けるまで待つ。
     その間も操作中なので、待った時間はそのまま合計に入る。解説モーダルの停止は計時が止まっている間なので入らない
     （上で解説を開いたまま10秒進めても、合計は変わらない） */
  const expected = 611 + plan.reduce((sum, ms) => sum + ms, 0) + 2 * INPUT_GUARD_MS;
  await expect(page.locator('#result-total-time')).toHaveAttribute('data-active-ms', String(expected));
  await expect(page.locator('#result-time-num')).toHaveText(String(Math.floor(expected / 1000)));
  await expect(page.locator('#result-rank-letter')).toHaveText('S');
  // やり直した周は「ノーミス」ではなく回数を出す
  await expect(page.locator('#result-retries')).toHaveText('やり直し 1回');
});

test('カットインの間（約1秒）は偽サイトを操作できない：クリックもTabも届かず、終わった瞬間から押せる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installClock(page);
  await page.locator('#btn-start-game').click();

  await page.clock.runFor(CUTIN_MS - 100);
  await expect(page.locator('#stage-viewport')).toHaveAttribute('inert', '');
  for (const selector of ['#btn-reject-confirmshame', '#btn-accept-coupon', '#btn-modal-fake-close']) {
    await clickAt(page, selector);
  }
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement && document.activeElement.closest('#stage-viewport')))).toBe(false);
  }
  await expect(modal(page)).not.toHaveClass(/active/);
  await expect(page.locator('.fake-modal-nag')).toBeHidden();
  await expect(page.locator('#hud-timer-text')).toHaveText('20');
  await expect(page.locator('#hud-damage-text')).toHaveText('¥0');

  // カットインが終わった瞬間から操作でき、制限時間もそこから進む
  await page.clock.runFor(100);
  await expect(page.locator('#stage-viewport')).not.toHaveAttribute('inert');
  await expect(page.locator('.stage-cutin-banner')).toHaveCount(0);
  await page.clock.runFor(1_100);
  await expect(page.locator('#hud-timer-text')).toHaveText('19');
  await clickAt(page, '#btn-reject-confirmshame');
  await expect(modal(page)).toHaveClass(/active/);
  await expect(page.locator('#modal-badge')).toContainText('BUSTED!');
});

test('二度押し：解説の「次の現場へ進む」を素早く2回押しても、次の現場の罠ボタンに届かない（390×844）', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installClock(page);
  await page.locator('#btn-start-game').click();
  for (const pass of PASSES.slice(0, 3)) {
    await page.clock.runFor(CUTIN_MS);
    await pass(page);
    if (pass !== PASSES[2]) await nextFromModal(page);
  }

  // 第3現場の解説から、同じ場所を続けて2回押す（解説の入力の停止が明けてから）
  await expect(modal(page)).toHaveClass(/active/);
  await passInputGuard(page);
  await page.locator('#btn-next-stage').dblclick();
  await expect(page.locator('#hud-stage-text')).toHaveText('4 / 5');
  await expect(modal(page)).not.toHaveClass(/active/);
  // 第4現場の確定ボタンを狙って押しても、カットインの間は届かない
  await clickAt(page, '#btn-stage1-loud');
  await clickAt(page, '#btn-stage1-subtle');
  await expect(modal(page)).not.toHaveClass(/active/);
  await expect(page.locator('#hud-damage-text')).toHaveText('¥0');
  await expect(page.locator('#hud-timer-text')).toHaveText('25');
  await expect(page.locator('#chk-opt-sub')).toBeChecked();
  await page.clock.runFor(CUTIN_MS);
  await expect(page.locator('#hud-timer-text')).toHaveText('25');
  await expect(modal(page)).not.toHaveClass(/active/);
});

test('二度押し：最後の解説の「捜査報告書を見る」を2回押しても、結果画面に留まる（375×667）', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await installClock(page);
  await page.locator('#btn-start-game').click();
  for (const pass of PASSES) {
    await page.clock.runFor(CUTIN_MS);
    await pass(page);
    if (pass !== PASSES[4]) await nextFromModal(page);
  }
  await expect(page.locator('#btn-next-stage')).toContainText('捜査報告書を見る');
  await passInputGuard(page);
  await page.locator('#btn-next-stage').dblclick();
  await expect(page.locator('#screen-result')).toHaveClass(/active/);
  await expect(page.locator('#screen-result')).toHaveAttribute('inert', '');
  // 出した直後に「もう一度」や共有を押しても届かない
  await clickAt(page, '#btn-retry');
  await expect(page.locator('#screen-result')).toHaveClass(/active/);
  await passResultGuard(page);
  await expect(page.locator('#screen-result')).toHaveClass(/active/);
  await expect(page.locator('#screen-game')).not.toHaveClass(/active/);
  await expect(page.locator('#result-title')).toBeFocused();
});

test('二度押し：「もう一度、全現場に挑む」「この現場をやり直す」の2回目も、次の現場を確定しない', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installClock(page);
  await page.locator('#btn-start-game').click();
  await playWithClock(page, 1_000);

  await page.locator('#btn-retry').dblclick();
  await expect(page.locator('#hud-stage-text')).toHaveText('1 / 5');
  await page.clock.runFor(CUTIN_MS);
  await expect(modal(page)).not.toHaveClass(/active/);
  await expect(page.locator('#hud-damage-text')).toHaveText('¥0');
  await expect(page.locator('#hud-timer-text')).toHaveText('20');

  // わざと失敗してから「この現場をやり直す」を2回押す
  await page.locator('#btn-accept-coupon').click();
  await expect(modal(page)).toHaveClass(/active/);
  await passInputGuard(page);
  await page.locator('#btn-retry-stage').dblclick();
  await expect(modal(page)).not.toHaveClass(/active/);
  await expect(page.locator('#hud-damage-text')).toHaveText('¥0');
  await page.clock.runFor(CUTIN_MS);
  await expect(modal(page)).not.toHaveClass(/active/);
  await expect(page.locator('#hud-timer-text')).toHaveText('20');
});

test.describe('タッチ', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 667 } });

  test('二度押し（タッチ）：第2現場の解説から2回タップしても、第3現場の予約確定に届かない（375×667）', async ({ page }) => {
    await installClock(page);
    await page.locator('#btn-start-game').tap();
    for (const pass of PASSES.slice(0, 2)) {
      await page.clock.runFor(CUTIN_MS);
      await pass(page);
      if (pass !== PASSES[1]) await nextFromModal(page);
    }
    await expect(modal(page)).toHaveClass(/active/);
    await passInputGuard(page);
    const box = await page.locator('#btn-next-stage').boundingBox();
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.touchscreen.tap(point.x, point.y);
    await page.touchscreen.tap(point.x, point.y);
    await expect(page.locator('#hud-stage-text')).toHaveText('3 / 5');
    await expect(modal(page)).not.toHaveClass(/active/);
    const submit = await page.locator('#btn-hotel-submit').boundingBox();
    await page.touchscreen.tap(submit.x + submit.width / 2, submit.y + submit.height / 2);
    await page.clock.runFor(CUTIN_MS);
    await expect(modal(page)).not.toHaveClass(/active/);
    await expect(page.locator('#hud-damage-text')).toHaveText('¥0');
    await expect(page.locator('#hud-timer-text')).toHaveText('25');
  });
});

/* 逆向きの二度押し：現場の最後の操作（確定・開始・退会）の2回目が、その場に出たばかりの部品
   （解説モーダル・第5現場の最終確認・確認ダイアログを閉じた直後の偽サイト）に当たらない。
   出た直後の INPUT_GUARD_MS は押せず、明けたら普通に押せる。時計を止め、種を固定して決定的にする */
test('二度押し：確定・解除・退会の2回目は、出たばかりの解説・偽サイト・最終確認に届かない（375×667・マウス）', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  // 第5現場の自動スクロールを一瞬で終わらせ、最終確認が指の下へ来る状況を決定的に作る
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reachStage(page, 3, 63061);

  // (a) 第3現場：キャンセル無料プランで確定を2回。2回目は解説の「この現場をやり直す」に当たらない
  await page.locator('input[value="freecancel"]').check();
  await page.locator('#btn-hotel-submit').dblclick();
  await expect(modal(page)).toHaveClass(/active/);
  await expect(page.locator('#modal-badge')).toContainText('BUSTED!');
  await expect(page.locator('#hud-stage-text')).toHaveText('3 / 5');
  await expect(modal(page)).toHaveAttribute('inert', '');
  await expect(page.locator('#btn-next-stage')).not.toBeFocused();
  // 明けたら主ボタンにフォーカスが移り、普通に押せる
  await page.clock.runFor(INPUT_GUARD_MS);
  await expect(modal(page)).not.toHaveAttribute('inert');
  await expect(modal(page)).toHaveClass(/active/);
  await expect(page.locator('#btn-next-stage')).toBeFocused();
  await page.locator('#btn-next-stage').click();
  await expect(page.locator('#hud-stage-text')).toHaveText('4 / 5');

  // (d) 第4現場：確認ダイアログの「割引を捨てて解除する」を2回。2回目は下の選択肢の行に当たらない
  await page.clock.runFor(CUTIN_MS);
  await page.locator('#chk-opt-sub').click();
  await page.locator('#btn-remove-sub').dblclick();
  await expect(page.locator('.retention-mini-dialog')).toHaveCount(0);
  await expect(page.locator('#chk-opt-sub')).not.toBeChecked();
  await expect(page.locator('#chk-opt-warranty')).toBeChecked();
  // フォーカスは、明けてから定期便のチェックへ戻る
  await expect(page.locator('#chk-opt-sub')).not.toBeFocused();
  await page.clock.runFor(INPUT_GUARD_MS);
  await expect(page.locator('#chk-opt-sub')).toBeFocused();
  await expect(page.locator('#chk-opt-sub')).not.toBeChecked();
  await page.locator('#chk-opt-warranty').uncheck();

  // (b) 赤い大ボタンを2回。上寄り（解説の「次の現場へ進む」と重なる高さ）を押す
  await page.evaluate(() => window.scrollTo(0, 0));
  const loud = await page.locator('#btn-stage1-loud').boundingBox();
  await page.mouse.dblclick(loud.x + loud.width / 2, loud.y + 8);
  await expect(modal(page)).toHaveClass(/active/);
  await expect(page.locator('#modal-badge')).toContainText('BUSTED!');
  await expect(page.locator('#hud-stage-text')).toHaveText('4 / 5');
  // 成功の解説でも、確認ダイアログの引き留めの手口に触れる
  await expect(page.locator('#modal-explanation')).toContainText(`「${STAGES[3].retentionQuestion}」と引き留める`);
  await page.clock.runFor(INPUT_GUARD_MS);
  await expect(modal(page)).toHaveClass(/active/);
  await page.locator('#btn-next-stage').click();
  await expect(page.locator('#hud-stage-text')).toHaveText('5 / 5');

  // (c) 第5現場：「はい」を選び「退会手続きへ進む」を2回。最終確認は出るが、その現場は確定しない
  await page.clock.runFor(CUTIN_MS);
  await page.locator('input[value="leave"]').check();
  await page.locator('#btn-real-cancel').dblclick();
  await expect(page.locator('.final-confirm-box')).toBeVisible();
  await expect(modal(page)).not.toHaveClass(/active/);
  /* 自動スクロールの途中なら、2回目は指の下へ来た最終確認のボタンに当たりうる（スクロールの速さしだいで決定的に
     作れない）。そこで、止まっている間に両方のボタンの真上を押して、どちらも確定しないことを確かめる */
  await clickAt(page, '#btn-final-stay');
  await clickAt(page, '#btn-final-leave');
  await expect(modal(page)).not.toHaveClass(/active/);
  await page.clock.runFor(INPUT_GUARD_MS);
  await expect(modal(page)).not.toHaveClass(/active/);
  await page.locator('#btn-final-leave').click();
  await expect(page.locator('#modal-badge')).toContainText('BUSTED!');
  await nextFromModal(page);

  // どの2回目も「やり直す」を押していない（やり直しは0回のまま）
  await expect(page.locator('#screen-result')).toHaveClass(/active/);
  await passResultGuard(page);
  await expect(page.locator('#result-retries')).toHaveText('ノーミス');
  await expect(page.locator('#result-total-damage')).toContainText('¥0');
});

test('二度押し（キーボード）：確定で Enter を2回押しても、2回目で解説を飛ばして次の現場へ進まない（1440×900）', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await reachStage(page, 3, 63061);
  // 罠のまま（返金不可プランが初期選択）、確定ボタンにフォーカスして Enter を続けて2回
  await page.locator('#btn-hotel-submit').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(modal(page)).toHaveClass(/active/);
  await expect(page.locator('#modal-badge')).toContainText('TRAPPED!');
  await expect(page.locator('#hud-stage-text')).toHaveText('3 / 5');
  // 止まっている間は、主ボタンへフォーカスを移さない（2回目の Enter が届かない）
  await expect(page.locator('#btn-next-stage')).not.toBeFocused();
  await page.clock.runFor(INPUT_GUARD_MS);
  await expect(page.locator('#btn-next-stage')).toBeFocused();
  await expect(modal(page)).toHaveClass(/active/);
  await expect(page.locator('#hud-stage-text')).toHaveText('3 / 5');
  // 明けたあとの Enter は普通に効く。解説を読んだうえで、被害を抱えたまま次へ進める
  await page.keyboard.press('Enter');
  await expect(modal(page)).not.toHaveClass(/active/);
  await expect(page.locator('#hud-stage-text')).toHaveText('4 / 5');
  await expect(page.locator('#hud-damage-text')).not.toHaveText('¥0');
});

test('二度押し（キーボード）：確定で押した Enter を押し続けても、停止が明けたあとの繰り返しで次の現場へ進まない（1440×900）', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await reachStage(page, 3, 63061);
  await page.locator('#btn-hotel-submit').focus();
  // 押し下げたまま離さない。2回目以降の keydown は自動リピート（repeat: true）になる
  await page.keyboard.down('Enter');
  await expect(modal(page)).toHaveClass(/active/);
  await page.keyboard.down('Enter');
  await page.clock.runFor(INPUT_GUARD_MS);
  await expect(page.locator('#btn-next-stage')).toBeFocused();
  await page.keyboard.down('Enter'); // 主ボタンにフォーカスが移ったあとの繰り返し
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(modal(page)).toHaveClass(/active/);
  await expect(page.locator('#hud-stage-text')).toHaveText('3 / 5');
  // 指を離してから押し直した Enter は普通に効く
  await page.keyboard.press('Enter');
  await expect(modal(page)).not.toHaveClass(/active/);
  await expect(page.locator('#hud-stage-text')).toHaveText('4 / 5');
});

for (const size of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test.describe(`タッチ（${size.width}×${size.height}）`, () => {
    test.use({ hasTouch: true, viewport: size });

    test(`二度押し（タッチ）：第2現場の開始・第3現場の確定を2回タップしても、2回目は解説のボタンに届かない（${size.width}×${size.height}）`, async ({ page }) => {
      // 種 63061 では第2現場の注記が折りたたみの中に出る（開くと開始ボタンが下がり、解説のボタンと重なる高さに来る）
      await reachStage(page, 2, 63061);
      const tapTwice = async (selector) => {
        await page.locator(selector).scrollIntoViewIfNeeded();
        const box = await page.locator(selector).boundingBox();
        const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
        await page.touchscreen.tap(x, y);
        await page.touchscreen.tap(x, y);
      };

      // 第2現場：月額プランに切り替えて「無料トライアルを開始する」を2回（2回目が「この現場をやり直す」に当たらない）
      const summary = page.locator('.accordion-summary');
      if (await summary.count()) await summary.tap();
      await page.locator('#chk-safe-plan').check();
      await tapTwice('#btn-sub-start');
      await expect(modal(page)).toHaveClass(/active/);
      await expect(page.locator('#modal-badge')).toContainText('BUSTED!');
      await expect(page.locator('#hud-stage-text')).toHaveText('2 / 5');
      await page.clock.runFor(INPUT_GUARD_MS);
      await expect(modal(page)).toHaveClass(/active/);
      await page.locator('#btn-next-stage').tap();
      await expect(page.locator('#hud-stage-text')).toHaveText('3 / 5');

      // 第3現場：返金不可プランのまま確定を2回（2回目が解説のボタンに当たらず、失敗の解説が残る）
      await page.clock.runFor(CUTIN_MS);
      await tapTwice('#btn-hotel-submit');
      await expect(modal(page)).toHaveClass(/active/);
      await expect(page.locator('#modal-badge')).toContainText('TRAPPED!');
      await expect(page.locator('#hud-stage-text')).toHaveText('3 / 5');
      await expect(page.locator('#hud-damage-text')).not.toHaveText('¥0');
      // 明けたら「この現場をやり直す」も普通に押せる
      await page.clock.runFor(INPUT_GUARD_MS);
      await expect(modal(page)).toHaveClass(/active/);
      await page.locator('#btn-retry-stage').tap();
      await expect(modal(page)).not.toHaveClass(/active/);
      await expect(page.locator('#hud-stage-text')).toHaveText('3 / 5');
      await expect(page.locator('#hud-damage-text')).toHaveText('¥0');
    });
  });
}

test('カットインの間は制限時間を進めず、残り5秒以下は数字そのものが赤くなる', async ({ page }) => {
  await installClock(page);
  await page.locator('#btn-start-game').click();

  await page.clock.runFor(900);
  await expect(page.locator('#hud-timer-text')).toHaveText('20');
  await page.clock.runFor(1100); // カットイン終了から1秒
  await expect(page.locator('#hud-timer-text')).toHaveText('19');
  await expect(page.locator('#hud-timer-text')).toHaveCSS('color', 'rgb(243, 244, 246)');

  await page.clock.runFor(14_600); // 残り4.4秒
  await expect(page.locator('#hud-timer-text')).toHaveText('5');
  await expect(page.locator('#hud-time')).toHaveClass(/is-critical/);
  await expect(page.locator('#hud-timer-text')).toHaveCSS('color', 'rgb(251, 113, 133)');
});

test('結果画面に「Sまであと◯秒」と自己ベストが出る（被害0円・50秒＝A）', async ({ page }) => {
  await installClock(page);
  await page.locator('#btn-start-game').click();
  await playWithClock(page, 10_000);

  await expect(page.locator('#result-rank-letter')).toHaveText('A');
  await expect(page.locator('#result-time-num')).toHaveText('50');
  await expect(page.locator('#result-goal')).toContainText('Sまであと5秒');
  await expect(page.locator('#result-best')).toHaveText('自己ベスト 50秒（A）');
  await expect(page.locator('#result-best-badge')).toHaveText('初記録！');
  await expect(page.locator('#result-retries')).toHaveText('ノーミス');
});

test('自己ベストは被害0円・時間切れなしの最短秒数とランクだけを端末に保存し、初回は「初記録！」、縮めたときだけ「更新！」', async ({ page }) => {
  await installClock(page);
  await page.locator('#btn-start-game').click();
  await playWithClock(page, 2_000);
  await expect(page.locator('#result-rank-letter')).toHaveText('S');
  await expect(page.locator('#result-goal')).toContainText('最高ランク達成');
  await expect(page.locator('#result-best')).toHaveText('自己ベスト 10秒（S）');
  await expect(page.locator('#result-best-badge')).toHaveText('初記録！');
  expect(await page.evaluate(() => localStorage.getItem('day063.best.v1'))).toBe('{"sec":10,"rank":"S"}');

  // 2周目は遅い：記録はそのまま、札は出ない
  await page.locator('#btn-retry').click();
  await playWithClock(page, 3_000);
  await expect(page.locator('#result-time-num')).toHaveText('15');
  // 縮められなかった周は、自己ベストまでの差を出す（更新した周と同じ文にしない）
  await expect(page.locator('#result-best')).toHaveText('自己ベスト 10秒（S）まであと5秒');
  await expect(page.locator('#result-best-badge')).toBeHidden();

  // 3周目は縮めた：「更新！」
  await page.locator('#btn-retry').click();
  await playWithClock(page, 1_000);
  await expect(page.locator('#result-best')).toHaveText('自己ベスト 5秒（S）');
  await expect(page.locator('#result-best-badge')).toHaveText('更新！');
  expect(await page.evaluate(() => localStorage.getItem('day063.best.v1'))).toBe('{"sec":5,"rank":"S"}');
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['day063.best.v1']);
});

test('端末への保存が拒否されても動き、ページを開いている間は自己ベストを比べられる', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  });
  await installClock(page);
  await page.locator('#btn-start-game').click();

  // 被害ありの周：記録の条件を案内する
  await page.clock.runFor(CUTIN_MS);
  await page.locator('#btn-accept-coupon').click();
  await nextFromModal(page);
  for (const pass of PASSES.slice(1)) {
    await page.clock.runFor(CUTIN_MS);
    await pass(page);
    await nextFromModal(page);
  }
  await passResultGuard(page);
  await expect(page.locator('#result-best')).toHaveText('自己ベストは、被害0円・時間切れなしの周で記録されます');
  await expect(page.locator('#result-best-badge')).toBeHidden();

  // 被害0円の周：保存はできないが、ページ内の記録として出す。遅い周では書き換えない
  await page.locator('#btn-retry').click();
  await playWithClock(page, 1_000);
  await expect(page.locator('#result-best')).toHaveText('自己ベスト 5秒（S）');
  await expect(page.locator('#result-best-badge')).toHaveText('初記録！');
  await page.locator('#btn-retry').click();
  await playWithClock(page, 2_000);
  await expect(page.locator('#result-best')).toHaveText('自己ベスト 5秒（S）まであと5秒');
  await expect(page.locator('#result-best-badge')).toBeHidden();
  expect(errors).toEqual([]);
});

test('ブラウザの警告ダイアログ（alert）を使わない：×と第5現場の未回答はゲーム内の表示', async ({ page }) => {
  const dialogs = collectDialogs(page);
  // 位置は入場アニメと×の移動が終わってから測る（動きを減らす設定＋アニメの終了待ち）
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startGame(page);
  await waitPlayable(page);

  // 第1現場の×は逃げるが、何度か押すと押せる。押すとポップアップが揺れ、枠内に一言出る
  const nag = page.locator('.fake-modal-nag');
  for (let i = 0; i < 8 && !(await nag.isVisible()); i++) {
    await settleAnimations(page);
    await clickAt(page, '#btn-modal-fake-close');
  }
  await expect(nag).toBeVisible();
  await expect(nag).toContainText('画面内のリンクから選んでください');
  await expect(nag).toHaveAttribute('role', 'alert');
  await expect(modal(page)).not.toHaveClass(/active/);
  // 商品画像は商品名（トレンチコート）に合わせる
  await expect(page.locator('.fake-page-bg .product-thumb')).toHaveText('🧥');
  await passStage1(page);
  await nextFromModal(page);

  for (const pass of PASSES.slice(1, 4)) {
    await pass(page);
    await nextFromModal(page);
  }

  // 第5現場：回答せずに進もうとすると、質問の下に警告が出る。2回目も同じ警告を出し直す
  await waitPlayable(page);
  await page.locator('#btn-real-cancel').click();
  await expect(page.locator('#survey-warning')).toBeVisible();
  await expect(page.locator('#survey-warning')).toHaveAttribute('role', 'alert');
  await page.locator('#btn-real-cancel').click();
  await expect(page.locator('#survey-warning')).toHaveText('アンケートの質問に回答してください');
  await expect(modal(page)).not.toHaveClass(/active/);
  // 罠解除の合図は role="status" だけ（aria-live を重ねて二重に読ませない）
  await expect(page.locator('#hud-toast')).toHaveAttribute('role', 'status');
  expect(await page.locator('#hud-toast').getAttribute('aria-live')).toBeNull();
  await passStage5(page);
  await nextFromModal(page);

  await expect(page.locator('#screen-result')).toHaveClass(/active/);
  expect(dialogs).toEqual([]);
});

test('被害額は被弾したら赤のまま（⚠つき）で、次の現場に進んでも緑に戻らない', async ({ page }) => {
  await startGame(page);
  await page.locator('#btn-accept-coupon').click();
  await nextFromModal(page);

  const damage = page.locator('#hud-damage-text');
  await expect(damage).not.toHaveText('¥0');
  await expect(page.locator('#hud-damage')).toHaveClass(/is-hit/);
  await expect(page.locator('#hud-damage .hud-alert')).toBeVisible();
  await page.waitForTimeout(1_200);
  await expect(damage).toHaveCSS('color', 'rgb(251, 113, 133)');

  for (const pass of PASSES.slice(1, 4)) {
    await pass(page);
    await nextFromModal(page);
  }
  await expect(page.locator('#hud-stage-text')).toContainText('5 / 5');
  await expect(damage).toHaveCSS('color', 'rgb(251, 113, 133)');
  await expect(page.locator('#hud-damage .hud-alert')).toBeVisible();
});

// 時計を止めて第N現場の頭まで進める（それより前の現場は看破）。乱数の種を渡すと並び順も決まる
async function reachStage(page, stageNo, seed) {
  if (seed !== undefined) await seedRandom(page, seed);
  await installClock(page);
  await page.locator('#btn-start-game').click();
  for (const pass of PASSES.slice(0, stageNo - 1)) {
    await page.clock.runFor(CUTIN_MS);
    await pass(page);
    await nextFromModal(page);
  }
  await page.clock.runFor(CUTIN_MS);
}

async function seedRandom(page, seed) {
  await page.addInitScript((value) => {
    let a = value;
    Math.random = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, seed);
}

const yenOf = (text) => Number(String(text).replace(/[^\d]/g, ''));

test('第4現場：確定ボタンの文言は不変で、どちらのボタンもチェックの状態どおりに請求する（被害額＝内訳の合計）', async ({ page }) => {
  await reachStage(page, 4);
  await expect(page.locator('#btn-stage1-subtle')).toHaveText('選択中の契約・オプションで注文を確定');

  const cases = [
    { name: '目立たない確定ボタン＋2つともチェック', button: '#btn-stage1-subtle', removeSub: false, removeWarranty: false, hits: ['sub', 'warranty'] },
    { name: '目立つ赤ボタン＋2つともチェック', button: '#btn-stage1-loud', removeSub: false, removeWarranty: false, hits: ['sub', 'warranty'] },
    { name: '目立つ赤ボタン＋配送補償だけチェック', button: '#btn-stage1-loud', removeSub: true, removeWarranty: false, hits: ['warranty'] },
    { name: '目立たない確定ボタン＋定期便だけチェック', button: '#btn-stage1-subtle', removeSub: false, removeWarranty: true, hits: ['sub'] },
    { name: '目立つ赤ボタン＋チェックなし', button: '#btn-stage1-loud', removeSub: true, removeWarranty: true, hits: [] }
  ];
  for (const c of cases) {
    // 金額は描くたびに変わるので、画面の文言から読む
    const costs = {
      sub: yenOf(await page.locator('#lbl-sub').evaluate((el) => el.textContent.match(/月額¥([\d,]+)/)[1])),
      warranty: yenOf(await page.locator('#lbl-warranty').evaluate((el) => el.textContent.match(/（\+¥([\d,]+)）/)[1]))
    };
    if (c.removeSub) {
      await page.locator('#chk-opt-sub').click();
      await page.locator('#btn-remove-sub').click();
      await passInputGuard(page);
    }
    if (c.removeWarranty) await page.locator('#chk-opt-warranty').uncheck();
    await page.locator(c.button).click();
    await expect(modal(page)).toHaveClass(/active/);
    await expect(page.locator('#modal-stage-detail .trap-detail-tag.is-hit'), c.name).toHaveCount(c.hits.length);
    const tags = await page.locator('#modal-stage-detail .trap-detail-tag.is-hit').allTextContents();
    const damage = yenOf(await page.locator('#modal-stage-damage').textContent());
    expect(damage, `${c.name}：被害額＝内訳の合計`).toBe(tags.reduce((sum, tag) => sum + yenOf(tag), 0));
    expect(damage, `${c.name}：チェックの状態どおりの金額`).toBe(c.hits.reduce((sum, key) => sum + costs[key], 0));
    await expect(page.locator('#modal-badge')).toHaveClass(c.hits.length ? /is-trapped/ : /^busted-badge$/);
    await retryFromModal(page);
    await page.clock.runFor(CUTIN_MS);
  }
});

test('第4現場：引き留めダイアログで「お得な定期便を続ける」を押して被弾すると、解説の内訳にその1行が出る', async ({ page }) => {
  await reachStage(page, 4);
  await page.locator('#chk-opt-sub').click();
  // ダイアログの見出しは、解説が引く文言と同じ定数から出す
  await expect(page.locator('#retention-title')).toHaveText(`⚠️ ${STAGES[3].retentionQuestion}`);
  await page.locator('#btn-keep-sub').click();
  await passInputGuard(page);
  await page.locator('#chk-opt-warranty').uncheck();
  await page.locator('#btn-stage1-subtle').click();
  await expect(page.locator('#modal-badge')).toHaveClass(/is-trapped/);
  await expect(page.locator('#modal-stage-detail .trap-detail-note')).toHaveText('解除しようとしたとき、確認ダイアログの赤いボタン「お得な定期便を続ける」で定期便に戻されました。');
  // 被弾の解説でも、引き留めの手口に触れる
  await expect(page.locator('#modal-explanation')).toContainText(`「${STAGES[3].retentionQuestion}」と引き留める`);

  // Esc で閉じた場合も、何が起きたかを書く
  await retryFromModal(page);
  await page.clock.runFor(CUTIN_MS);
  await page.locator('#chk-opt-sub').click();
  await page.keyboard.press('Escape');
  await passInputGuard(page);
  await page.locator('#btn-stage1-loud').click();
  await expect(page.locator('#modal-stage-detail .trap-detail-note')).toContainText('確認ダイアログを閉じたので');

  // ダイアログに触れずに被弾したときと、解除してから確定したときは、その1行を出さない
  await retryFromModal(page);
  await page.clock.runFor(CUTIN_MS);
  await page.locator('#btn-stage1-loud').click();
  await expect(page.locator('#modal-stage-detail .trap-detail-tag.is-hit')).toHaveCount(2);
  await expect(page.locator('#modal-stage-detail .trap-detail-note')).toHaveCount(0);
  await retryFromModal(page);
  await page.clock.runFor(CUTIN_MS);
  await page.locator('#chk-opt-sub').click();
  await page.locator('#btn-remove-sub').click();
  await passInputGuard(page);
  await page.locator('#btn-stage1-loud').click();
  await expect(page.locator('#modal-stage-detail .trap-detail-tag.is-hit')).toHaveCount(1);
  await expect(page.locator('#modal-stage-detail .trap-detail-note')).toHaveCount(0);
});

test('第3現場：プランの並びが通常でも逆でも、危険な返金不可プランが必ず初期選択', async ({ page }) => {
  // 乱数の種を固定して、通常の並びと逆の並びの両方を確実に出す
  await reachStage(page, 3, 63003);
  const orders = new Set();
  for (let round = 0; round < 10 && orders.size < 2; round++) {
    orders.add((await page.locator('input[name="hotel-plan"]').evaluateAll((nodes) => nodes.map((n) => n.value))).join(','));
    await expect(page.locator('input[value="nonrefundable"]')).toBeChecked();
    await expect(page.locator('input[value="freecancel"]')).not.toBeChecked();
    await page.locator('#btn-hotel-submit').click();
    await expect(page.locator('#modal-badge')).toHaveClass(/is-trapped/);
    // 同額でも全額が戻らない理由を内訳に添える
    await expect(page.locator('#modal-stage-detail')).toContainText('全額が戻りません');
    await retryFromModal(page);
    await page.clock.runFor(CUTIN_MS);
  }
  expect([...orders].sort()).toEqual(['freecancel,nonrefundable', 'nonrefundable,freecancel']);
  // 第3現場のミッション文に具体的な人数は書かない
  await expect(page.locator('#mission-text')).not.toContainText(/\d+人/);
});

test('第5現場：正しい選択肢を選んだ瞬間に合図が出て、最終確認の4通りの配置のどれでも合図と内訳が画面と食い違わない', async ({ page }) => {
  await reachStage(page, 5, 63005);
  const toast = page.locator('#hud-toast');
  const seen = new Set();
  for (let round = 0; round < 16 && seen.size < 4; round++) {
    // 「はい（…継続する）」を選んだ瞬間に合図。間違った選択肢では出ない
    await page.locator('input[value="stay"]').check();
    await expect(toast).not.toHaveClass(/is-on/);
    await page.locator('input[value="leave"]').check();
    await expect(toast).toHaveText(/罠解除：二重否定の質問を見抜いた$/);
    await page.locator('#btn-real-cancel').dispatchEvent('click');
    const box = page.locator('.final-confirm-box');
    await expect(box).toBeVisible();
    const config = `${await box.getAttribute('data-loud')}/${await box.getAttribute('data-order')}`;
    seen.add(config);
    // 合図の文言は色や左右に依存しない
    await passInputGuard(page);
    await page.locator('#btn-final-leave').click();
    await expect(toast).toHaveText(/罠解除：引き留めを振り切って退会を選んだ$/);
    await expect(page.locator('#modal-badge')).toContainText('BUSTED!');
    await retryFromModal(page);
    await page.clock.runFor(CUTIN_MS);
  }
  expect(seen.size, '最終確認の配置（目立つ色×並び順）').toBe(4);

  // 最終確認で「考え直す」を選んだときの内訳も、色に依存しない文言
  await page.locator('input[value="leave"]').check();
  await page.locator('#btn-real-cancel').dispatchEvent('click');
  await passInputGuard(page);
  await page.locator('#btn-final-stay').click();
  await expect(page.locator('#modal-stage-detail')).toContainText('最終確認で「考え直す」を選んで契約を継続');
  await expect(page.locator('#modal-stage-detail')).not.toContainText('配色');
});

test('期限を過ぎてから押した確定は、成功でも時間切れとして扱い、その前に「罠解除」の合図を出さない（裏に回ったタブで表示の更新が間引かれた場合）', async ({ page }) => {
  const toast = page.locator('#hud-toast');
  // 表示の更新（タイマー）を走らせずに、時刻だけ制限時間の先へ進める
  const jumpPastLimit = async () => {
    const now = await page.evaluate(() => Date.now());
    await page.clock.setSystemTime(new Date(now + 31_000));
  };

  // 第1現場：期限のあとに拒否リンク（正解）を押す
  await reachStage(page, 1);
  await jumpPastLimit();
  await page.locator('#btn-reject-confirmshame').click();
  await expect(modal(page)).toHaveClass(/active/);
  await expect(page.locator('#modal-badge')).toHaveText('TIME UP! 時間切れ');
  await expect(page.locator('#modal-stage-detail .trap-detail-tag')).toHaveText('未達');
  await expect(toast).not.toHaveClass(/is-on/);
  await expect(toast).toHaveText('');

  // 第3現場：期限のあとに安全なプランを選ぶ（選んだ瞬間の合図も出さず、その場で時間切れ）
  await nextFromModal(page);
  await page.clock.runFor(CUTIN_MS);
  await passStage2(page);
  await nextFromModal(page);
  await page.clock.runFor(CUTIN_MS);
  await jumpPastLimit();
  await page.locator('input[value="freecancel"]').check();
  await expect(modal(page)).toHaveClass(/active/);
  await expect(page.locator('#modal-badge')).toHaveText('TIME UP! 時間切れ');
  await expect(toast).not.toHaveClass(/is-on/);
  await expect(toast).toHaveText('');
});

test('カットイン中は、合成のクリック（inert を素通りする）でも確定しない。計時は明けてから', async ({ page }) => {
  await installClock(page);
  await page.locator('#btn-start-game').click();
  await page.clock.runFor(CUTIN_MS - 100);
  await expect(page.locator('#stage-viewport')).toHaveAttribute('inert', '');
  // inert に対応していない古いブラウザでも押せてしまう状況を、dispatchEvent で作る
  for (const selector of ['#btn-reject-confirmshame', '#btn-accept-coupon']) {
    await page.locator(selector).dispatchEvent('click');
  }
  await expect(modal(page)).not.toHaveClass(/active/);
  await expect(page.locator('#hud-toast')).not.toHaveClass(/is-on/);
  await expect(page.locator('#hud-damage-text')).toHaveText('¥0');
  await expect(page.locator('#hud-timer-text')).toHaveText('20');

  // 明けてからは普通に確定でき、時間はそこから数える（カットイン中の確定が0msで記録されていない）
  await page.clock.runFor(100);
  await page.clock.runFor(1_234);
  await passStage1(page);
  await expect(page.locator('#modal-badge')).toContainText('BUSTED!');
  await nextFromModal(page);
  for (const pass of PASSES.slice(1)) {
    await page.clock.runFor(CUTIN_MS);
    await page.clock.runFor(1_000);
    await pass(page);
    await nextFromModal(page);
  }
  await expect(page.locator('#screen-result')).toHaveClass(/active/);
  await expect(page.locator('#result-stage-list .stage-report-item')).toHaveCount(5);
  // 第4・第5現場は、入力の停止が明けるまで待った分も操作時間に入る
  await expect(page.locator('#result-total-time')).toHaveAttribute('data-active-ms', String(1_234 + 4 * 1_000 + 2 * INPUT_GUARD_MS));
});

test('時間切れの現場をやり直すと、その現場の記録は取り消され、使った時間は合計に残る（本人の判断事項・現仕様の固定）', async ({ page }) => {
  await reachStage(page, 1);
  await page.clock.runFor(20_000); // 第1現場の制限20秒を使い切る
  await expect(modal(page)).toHaveClass(/active/);
  await expect(page.locator('#modal-badge')).toHaveClass(/is-timeout/);
  // お金の被害がない時間切れは「この現場の結果：時間切れ（未達）」（「被害：未達」と読み違えないように）
  await expect(page.locator('#modal-stage-damage-label')).toHaveText('この現場の結果：');
  await expect(page.locator('#modal-stage-damage')).toHaveText('時間切れ（未達）');
  await retryFromModal(page);
  for (const pass of PASSES) {
    await page.clock.runFor(CUTIN_MS);
    await page.clock.runFor(1_000);
    await pass(page);
    // 時間切れでない解説では「この現場の被害：」に戻る
    await expect(page.locator('#modal-stage-damage-label')).toHaveText('この現場の被害：');
    await nextFromModal(page);
  }
  await expect(page.locator('#screen-result')).toHaveClass(/active/);
  await expect(page.locator('#result-stage-list')).not.toContainText('未達');
  await expect(page.locator('#result-stage-list .stage-report-item')).toHaveCount(5);
  // 時間切れまでの20秒も合計に入る（第4・第5現場は、入力の停止が明けるまで待った分も入る）
  await expect(page.locator('#result-total-time')).toHaveAttribute('data-active-ms', String(25_000 + 2 * INPUT_GUARD_MS));
  await expect(page.locator('#result-time-num')).toHaveText('25');
});

test('第5現場の時間切れは、翌月の料金が出るので「この現場の被害：+¥1,980」のまま', async ({ page }) => {
  await reachStage(page, 5);
  await page.clock.runFor(30_000); // 第5現場の制限30秒を使い切る
  await expect(modal(page)).toHaveClass(/active/);
  await expect(page.locator('#modal-badge')).toHaveText('TIME UP! 時間切れ');
  await expect(page.locator('#modal-stage-damage-label')).toHaveText('この現場の被害：');
  await expect(page.locator('#modal-stage-damage')).toHaveText('+¥1,980');
  await expect(page.locator('#modal-stage-detail .trap-detail-tag')).toHaveText('未達 +¥1,980');
});

test('第1現場：やり直すたびに拒否リンクの文言と位置（60px以上）が変わる', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startGame(page);
  const seen = [];
  for (let round = 0; round < 4; round++) {
    const link = page.locator('#btn-reject-confirmshame');
    // 入場アニメ（scale 0.85→1）の途中でも値が変わらないよう、transform の影響を受けない offsetTop で測る
    const offset = await link.evaluate((el) => el.offsetTop);
    const text = (await link.textContent()).trim();
    seen.push({ text, offset });
    await link.click();
    await expect(modal(page)).toHaveClass(/active/);
    // 解説は、その周に実際に出た文言をそのまま引く
    await expect(page.locator('#modal-explanation')).toContainText(`「${text}」`);
    await page.locator('#btn-retry-stage').click();
  }
  for (let i = 1; i < seen.length; i++) {
    expect(seen[i].text).not.toBe(seen[i - 1].text);
    expect(Math.abs(seen[i].offset - seen[i - 1].offset)).toBeGreaterThanOrEqual(60);
  }
});

test('第2現場：やり直すたびに注記の置き場所かチェックの左右が変わり、開閉記号は1つ', async ({ page }) => {
  // 折りたたみの周を確実に引くため、乱数の種を固定する（どの周でも通るロケータで操作する）
  await page.addInitScript(() => {
    let a = 20261010;
    Math.random = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
  await startGame(page);
  await passStage1(page);
  await nextFromModal(page);

  const box = page.locator('.sub-stage-box');
  const seen = [];
  let checkedAccordion = false;
  for (let round = 0; round < 8; round++) {
    const position = `${await box.getAttribute('data-note')}/${await box.getAttribute('data-check')}`;
    const label = await page.locator('label[for="chk-safe-plan"]').textContent();
    seen.push({ position, label });
    const summary = page.locator('.accordion-summary');
    if (await summary.count()) {
      // 開閉の記号は自前の1つだけ。開いたら▼と「（タップで閉じる）」
      expect(((await summary.textContent()).match(/[▶▼]/g) ?? []).length).toBe(1);
      await expect(summary.locator('.accordion-icon')).toHaveText('▶');
      await summary.click();
      await expect(summary.locator('.accordion-icon')).toHaveText('▼');
      await expect(summary).toContainText('（タップで閉じる）');
      checkedAccordion = true;
    } else {
      await expect(page.locator('.fine-print')).toBeVisible();
    }
    await page.locator('#chk-safe-plan').check();
    await page.locator('#btn-sub-start').click();
    await expect(modal(page)).toHaveClass(/active/);
    await page.locator('#btn-retry-stage').click();
  }
  expect(checkedAccordion).toBe(true);
  for (let i = 1; i < seen.length; i++) {
    expect(seen[i].position).not.toBe(seen[i - 1].position);
    expect(seen[i].label).not.toBe(seen[i - 1].label);
  }
});

for (const size of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test(`最終確認の2ボタンは手でスクロールしなくても画面内に全部出る（${size.width}×${size.height}）`, async ({ page }) => {
    await page.setViewportSize(size);
    await startGame(page);
    for (const pass of PASSES.slice(0, 4)) {
      await pass(page);
      await nextFromModal(page);
    }
    await expect(page.locator('#hud-stage-text')).toContainText('5 / 5');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await page.locator('input[value="leave"]').check();
    // 押すだけ（Playwright に要素までスクロールさせない）
    await page.locator('#btn-real-cancel').dispatchEvent('click');

    for (const id of ['#btn-final-leave', '#btn-final-stay']) {
      await expect(page.locator(id)).toBeInViewport({ ratio: 1 });
    }
    // 上に残るHUDの裏にも隠れていない
    await expect.poll(async () => page.evaluate(() => {
      const hud = document.querySelector('.investigator-hud').getBoundingClientRect();
      const box = document.querySelector('.final-confirm-box').getBoundingClientRect();
      return box.top >= hud.bottom - 0.5 && box.bottom <= window.innerHeight + 0.5;
    })).toBe(true);
  });

  test(`現場の開始と結果画面ではスクロールが先頭に戻り、ミッション全文と統計が見える（${size.width}×${size.height}）`, async ({ page }) => {
    await page.setViewportSize(size);
    await startGame(page);
    await passStage1(page);
    await nextFromModal(page);

    for (const pass of PASSES.slice(1)) {
      // 前の現場で下までスクロールしてから確定する
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await pass(page);
      await nextFromModal(page);
      if (await page.locator('#screen-game.active').count()) {
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
        await expect(page.locator('.mission-bar')).toBeInViewport({ ratio: 1 });
      }
    }

    await expect(page.locator('#screen-result')).toHaveClass(/active/);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    for (const selector of ['#result-title', '.rank-showcase', '#result-total-damage', '#result-total-time']) {
      await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
    }
    if (size.height >= 844) {
      // 390×844 では、見出しから再挑戦ボタンまでが最初の1画面に入る
      await expect(page.locator('#btn-retry')).toBeInViewport({ ratio: 1 });
    }
    // 横スクロールが出ない
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}

test('第4現場の引き留めダイアログ：フォーカスが中に移り、背後は操作できず、Escで閉じて元に戻る', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startGame(page);
  for (const pass of PASSES.slice(0, 3)) {
    await pass(page);
    await nextFromModal(page);
  }

  // カットインの間は偽サイトにフォーカスできない（inert）。操作できるようになってから
  await waitPlayable(page);
  await page.locator('#chk-opt-sub').focus();
  await page.keyboard.press('Space');
  const dialog = page.getByRole('dialog', { name: '本当に定期便を解除しますか？' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  const inDialog = () => page.evaluate(() => Boolean(document.activeElement && document.activeElement.closest('.retention-mini-dialog')));
  expect(await inDialog()).toBe(true);

  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).not.toBe('btn-stage1-subtle');
    expect(await inDialog()).toBe(true);
  }
  // 背後の偽サイトは inert（裏の注文ボタンを押せない）
  expect(await page.evaluate(() => document.querySelector('.ec-stage-content').inert)).toBe(true);

  // 暗い背景を押してフォーカスが外に落ちても、Esc で閉じられる
  const backdrop = await page.locator('.retention-mini-dialog').boundingBox();
  await page.mouse.click(backdrop.x + 4, backdrop.y + 4);
  expect(await inDialog()).toBe(false);
  await page.keyboard.press('Escape');
  await expect(page.locator('.retention-mini-dialog')).toHaveCount(0);
  // フォーカスは、閉じた直後の入力の停止（約0.45秒）が明けてから定期便のチェックへ戻る
  await expect(page.locator('#chk-opt-sub')).toBeFocused();
  await expect(page.locator('#chk-opt-sub')).toBeChecked();
  await expect(modal(page)).not.toHaveClass(/active/);
});

test('共有ダイアログ：開始画面と結果画面だけで開け、Escや閉じるで元のボタンにフォーカスが戻る', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PATH);
  const opener = page.getByRole('button', { name: 'このアプリを共有する', exact: true });
  await expect(opener).toBeVisible();
  const box = await opener.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);

  const dialog = page.locator('#app-share-dialog');
  await opener.click();
  await expect(dialog).toBeVisible();
  await expect(page.locator('.share')).toHaveCount(1);
  await expect(dialog.locator('.share')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  await opener.click();
  await page.locator('#btn-share-close').click();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  // 捜査中は隠す（共有を開いている間も制限時間が進む不公平を避ける）
  await page.locator('#btn-start-game').click();
  await expect(opener).toBeHidden();
  for (const pass of PASSES) {
    await pass(page);
    await nextFromModal(page);
  }
  await expect(page.locator('#screen-result')).toHaveClass(/active/);
  await expect(opener).toBeVisible();
});

test('結果画面のシェア：X・LINE・リンクのコピーがあり、Xの入口は1つ・旧い黒ボタンは無い', async ({ page, context, browserName }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installClock(page);
  await page.locator('#btn-start-game').click();
  await playWithClock(page, 1_000);

  const section = page.locator('.result-share');
  await expect(section.getByRole('heading', { name: '結果をシェア' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Xで投稿' })).toHaveCount(1);
  await expect(page.locator('.btn-share')).toHaveCount(0);

  const xHref = await page.locator('#btn-share-x').getAttribute('href');
  expect(xHref.startsWith('https://x.com/intent/post?')).toBe(true);
  const xUrl = new URL(xHref);
  expect(xUrl.searchParams.get('url')).toBe(CANONICAL);
  expect(xUrl.searchParams.get('text')).toContain('特務UI捜査官（神の洞察眼）');
  expect(xUrl.searchParams.get('text')).toContain('5秒');
  expect(xUrl.searchParams.get('text')).not.toContain('クリア');
  await expect(page.locator('#btn-share-x')).toHaveAttribute('rel', 'noopener noreferrer');

  const lineHref = await page.locator('#btn-share-line').getAttribute('href');
  expect(lineHref.startsWith('https://social-plugins.line.me/lineit/share?')).toBe(true);
  expect(new URL(lineHref).searchParams.get('url')).toBe(CANONICAL);

  const canShare = await page.evaluate(() => typeof navigator.share === 'function');
  await expect(page.locator('#btn-share-native')).toBeVisible({ visible: canShare });
  await expect(page.locator('#result-share-note')).toContainText('Instagram');

  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('#btn-share-copy').click();
    await expect(page.locator('#result-share-said')).toHaveText('結果とリンクをコピーしました');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(CANONICAL);
  }

  // 結果画面は「見出し→ランク→統計→目標→再挑戦→共有→記録→出典」の順
  const order = await page.evaluate(() => ['.result-header', '.rank-showcase', '.result-stats-grid', '.goal-box', '#btn-retry', '.result-share', '.damage-breakdown-box', '.result-footer']
    .map((selector) => document.querySelector(selector).getBoundingClientRect().top));
  expect([...order].sort((a, b) => a - b)).toEqual(order);
});
