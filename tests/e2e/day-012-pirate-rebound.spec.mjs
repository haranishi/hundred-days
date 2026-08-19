import { expect, test } from '@playwright/test';

const PATH = '/day-012-pirate-rebound/';

/** 遊べる状態まで進める。音は操作の中でしか始められないので、必ずボタンを押して入る。 */
async function begin(page, hash = '#dev=short') {
  await page.goto(`${PATH}${hash}`);
  await page.getByRole('button', { name: 'はじめる' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing', { timeout: 10_000 });
}

test('空の状態で始まり、合図の読み方と注意が先に出ている', async ({ page }) => {
  await page.goto(PATH);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'empty');
  await expect(page.getByRole('heading', { name: '合図は、いつも音が先です' })).toBeVisible();
  // ずれるのは利用者のせいではない、と先に伝える
  await expect(page.getByText('Bluetoothのイヤホンは音が遅れます')).toBeVisible();
});

test('範囲の外の補正値は不正入力として扱い、0msに戻す', async ({ page }) => {
  await page.goto(`${PATH}#cal=99999`);
  await expect(page.locator('#cal-warning')).toBeVisible();
  await expect(page.locator('#cal-value')).toHaveText('0 ms');
  await expect(page.locator('#app')).toHaveAttribute('data-invalid', '1');
  expect(await page.locator('#app').getAttribute('data-state-log')).toContain('invalid');
});

test('補正値はURLに残り、保存はしない', async ({ page }) => {
  await page.goto(PATH);
  await page.getByRole('button', { name: '音のズレを直す' }).click();
  await page.locator('#cal-range').fill('-25');
  await expect(page.locator('#cal-value')).toHaveText('-25 ms');
  expect(page.url()).toContain('#cal=-25');

  // localStorage はこの段階では解禁されていない。1件も書いていないことを確かめる
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
});

test('4つの状態が実際に通る：空 → 読込中 → 遊べる → 不正入力 → 結果', async ({ page }) => {
  await begin(page);

  // 最初の打点は約2.9秒後なので、ここで押せば必ず拍と無関係な入力になる
  await page.locator('#stage').click({ position: { x: 40, y: 40 } });
  await expect(page.locator('#app')).toHaveAttribute('data-invalid', '1');

  await expect(page.locator('#app')).toHaveAttribute('data-state', 'result', { timeout: 25_000 });
  const log = await page.locator('#app').getAttribute('data-state-log');
  for (const state of ['empty', 'loading', 'playing', 'invalid', 'result']) {
    expect(log, `${state} を通っていない（${log}）`).toContain(state);
  }
});

test('結果には順位と内訳が出て、打点の数と一致する', async ({ page }) => {
  await begin(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'result', { timeout: 25_000 });

  await expect(page.locator('#rank')).not.toBeEmpty();
  const numbers = await page.locator('.tally dd').allTextContents();
  expect(numbers).toHaveLength(4);
  // 短い譜面の打点は5つ。ドンピシャ＋おしい＋ミスが必ずその数になる（から振りは別勘定）
  const [perfect, good, miss] = numbers.slice(0, 3).map(Number);
  expect(perfect + good + miss).toBe(5);
});

/* 打ち返した弾が届くと敵船が崩れる。演出だけでなく、
   「ドンピシャで返した弾だけが届く」という手応えの根っこなので固定する。 */
test('ドンピシャで返すと敵船が崩れていく', async ({ page }) => {
  await begin(page);

  // 打点ちょうどで押し続ける（人の手では±35msを連発できない）
  await page.evaluate(() => {
    const api = window.__day012;
    const done = new Set();
    const step = () => {
      if (api.state() === 'result') return;
      for (const time of api.noteTimes()) {
        if (!done.has(time) && api.songSeconds() >= time) { api.press(performance.now()); done.add(time); }
      }
      requestAnimationFrame(step);
    };
    step();
  });

  await expect(page.locator('#ship')).not.toBeEmpty({ timeout: 15_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'result', { timeout: 25_000 });
  await expect(page.locator('#ship-state')).toContainText('届いた');

  /* 体験評価2周目：敵船を大破させた回と、1発も届かなかった回が同じ順位・同じ助言だった。
     順位・助言・敵船の状態が同じパネルに出るので、三者が食い違っていないことを見る。 */
  const rank = await page.locator('#rank').textContent();
  const note = await page.locator('#rank-note').textContent();
  expect(rank, `全部当てたのに順位が「${rank}」`).not.toBe('まだ船酔い');
  expect(note, '当てているのに「届いていない」旨の助言が出ている').not.toMatch(/当てていない|届かなかった/);
});

test('キーボードだけで最初から最後まで進める', async ({ page }) => {
  await page.goto(`${PATH}#dev=short`);
  await page.locator('body').press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing', { timeout: 10_000 });
  await page.locator('body').press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'result', { timeout: 25_000 });
});

/* 人の手では確かめられない部分。±35msちょうどで押したときに、
   入力の時刻合わせ（getOutputTimestamp）まで含めて本当にドンピシャになるかを見る。 */
test('打点ちょうどで押せば当たりになる', async ({ page }) => {
  await begin(page);
  const verdict = await page.evaluate(async () => {
    const api = window.__day012;
    // カウントインの中にある練習の1発は、遊べる状態になった時点で過ぎている。
    // まだ来ていない打点を選ぶこと
    const next = api.noteTimes().find((time) => time > api.songSeconds() + 0.3);
    await new Promise((done) => {
      const step = () => {
        if (api.songSeconds() >= next) { api.press(performance.now()); done(); }
        else requestAnimationFrame(step);
      };
      step();
    });
    return document.getElementById('verdict-main').textContent;
  });
  expect(['ドンピシャ', 'おしい'], `判定が ${verdict} になった`).toContain(verdict);
});

/* 状態だけ見ていると、画面が真っ白でもテストは全部通る。実際に一度そうなった
   （隠れている間に大きさを測って 1×1 のまま引き伸ばしていた）。画素そのものを見る。 */
test('海と船が実際に描かれている', async ({ page }) => {
  await begin(page);
  await page.waitForTimeout(600);

  const scene = await page.evaluate(() => {
    const canvas = document.getElementById('scene');
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const colors = new Set();
    for (let at = 0; at < data.length; at += 4 * 401) colors.add(`${data[at]},${data[at + 1]},${data[at + 2]}`);
    return { width: canvas.width, height: canvas.height, colors: colors.size };
  });

  expect(scene.width, '描画用の大きさが実寸になっていない').toBeGreaterThan(200);
  expect(scene.height).toBeGreaterThan(120);
  expect(scene.colors, '単色で塗りつぶされている＝何も描けていない').toBeGreaterThan(20);
});

/* 体験評価2周目：390×844で海が224pxしかなく、画面の6割が無地の余白だった。
   敵船が壊れていくのが唯一の報酬なのに、スマホではほぼ見えていなかった。
   原因は枠ではなくcanvas側（高さautoの親に対して height:100% が解決できず、
   canvas自身の属性値のまま小さく固まっていた）。枠と中身の両方を測る。 */
test('遊んでいる間、海が画面を埋める', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await begin(page);

  const size = await page.evaluate(() => {
    const canvas = document.getElementById('scene');
    const stage = document.getElementById('stage').getBoundingClientRect();
    const box = canvas.getBoundingClientRect();
    return {
      stageHeight: stage.height,
      canvasHeight: box.height,
      bufferHeight: canvas.height,
      viewport: window.innerHeight
    };
  });

  expect(size.stageHeight / size.viewport, '海の枠が画面の6割に届いていない').toBeGreaterThan(0.6);
  expect(size.canvasHeight, 'canvasが枠を埋めていない').toBeGreaterThan(size.stageHeight - 4);
  expect(size.bufferHeight, '描画用の大きさが見た目より小さい').toBeGreaterThan(size.canvasHeight - 4);
});

/* 体験評価2周目：結果に「『音のズレを直す』を＋64あたりに」と書いておきながら、
   結果画面からその画面へ行く手段が無かった（再読込しかなかった）。 */
/* 体験評価3周目：結果画面でcanvasが真っ黒になっていた。
   結果に移ると海の枠が縮み、ResizeObserver が canvas の大きさを入れ直す＝中身が消える。
   その時ループを止めていたので、描き直す者がいなかった。50秒かけて沈めた敵船が消える。 */
test('結果画面でも海と船が残っている', async ({ page }) => {
  await begin(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'result', { timeout: 25_000 });
  await page.waitForTimeout(500);

  const scene = await page.evaluate(() => {
    const canvas = document.getElementById('scene');
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const colors = new Set();
    for (let at = 0; at < data.length; at += 4 * 401) colors.add(`${data[at]},${data[at + 1]},${data[at + 2]}`);
    return { width: canvas.width, colors: colors.size };
  });

  expect(scene.width).toBeGreaterThan(200);
  expect(scene.colors, '結果画面のcanvasが空になっている').toBeGreaterThan(20);
});

test('結果には順位の階段と、次の段までの残りが出る', async ({ page }) => {
  await begin(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'result', { timeout: 25_000 });
  await expect(page.locator('#ladder')).toContainText('まだ船酔い');
  await expect(page.locator('#ladder')).toContainText('キャプテン');
});

test('結果から補正へ行って、結果へ戻れる', async ({ page }) => {
  await begin(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'result', { timeout: 25_000 });

  await page.getByRole('button', { name: '音のズレを直す' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'calibrating');
  await page.getByRole('button', { name: '戻る' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'result', { timeout: 5_000 });
});

test('開発用の口は、URLに dev= が無ければ開かない', async ({ page }) => {
  await page.goto(PATH);
  expect(await page.evaluate(() => Boolean(window.__day012))).toBe(false);
});

test('タブを離れたら黙って続けず、中断したことを伝える', async ({ page }) => {
  await begin(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#error-message')).toContainText('中断しました');
});

test('狭い画面でも横に溢れない', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(PATH);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  await page.getByRole('button', { name: 'はじめる' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing', { timeout: 10_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('外へは1本も通信しない', async ({ page }) => {
  const outside = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4173')) outside.push(request.url());
  });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  await begin(page);
  await page.waitForTimeout(1500);

  expect(outside, `外部への通信: ${outside.join(', ')}`).toHaveLength(0);
  expect(errors, `コンソールのエラー: ${errors.join(' / ')}`).toHaveLength(0);
});
