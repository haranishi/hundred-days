// ひとり・ふたりの E2E で使う道具。状態は ?test=1 のときだけ出る window.__MMB__ から読む。
//
// 8倍速では回答の時間が実時間0.75秒しかない。マシンが混んでいるとテストの操作が間に合わず、時間切れで落ちる。
// そこで「答える」「答えあわせを確かめる」間だけゲームの時計を止める（window.__MMB__.pause）。
// 止めている間も押す・答えるは受け付けるので、ゲームの流れそのものは変わらない。

import { expect, type BrowserContext, type Page } from '@playwright/test'

/** localhost 以外への通信を全部失敗させ、行き先を記録する（外部への通信が0であることを確かめる） */
export async function blockExternal(context: BrowserContext): Promise<string[]> {
  const external: string[] = []
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return route.continue()
    external.push(url.href)
    return route.abort()
  })
  return external
}

export async function phase(page: Page): Promise<string> {
  return page.evaluate(() => window.__MMB__?.phase() ?? 'none')
}

export async function correctIndex(page: Page): Promise<number> {
  const i = await page.evaluate(() => window.__MMB__?.correctIndex() ?? null)
  if (i === null) throw new Error('正解の番号を読めない（?test=1 が無いか、問題が無い）')
  return i
}

export async function buzzerId(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__MMB__?.state().question?.buzzerId ?? null)
}

export async function waitPhase(page: Page, phases: readonly string[], timeout = 20_000): Promise<string> {
  await page.waitForFunction((ps) => ps.includes(window.__MMB__?.phase() ?? ''), [...phases], { timeout, polling: 20 })
  return phase(page)
}

/** ローカルセッションが公開される時点で止め、端末の描画速度とゲーム時間を分離する。 */
export async function freezeLocalGameOnCreation(page: Page): Promise<void> {
  await page.evaluate(() => {
    let hook: typeof window.__MMB__
    Object.defineProperty(window, '__MMB__', {
      configurable: true,
      get: () => hook,
      set(value: typeof hook) { hook = value; value?.pause() },
    })
  })
}

/** 停止中の時計を実際のcountdown/introの境界まで進める。CPUの早押し前で操作を試す。 */
export async function advanceToBuilding(page: Page): Promise<void> {
  await page.evaluate(() => {
    const hook = window.__MMB__
    if (!hook) throw new Error('ローカル試験の時計がない')
    hook.pause()
    for (let step = 0; step < 3; step++) {
      const state = hook.state()
      if (state.phase === 'building') return
      if (!['countdown', 'intro'].includes(state.phase) || state.phaseEndsAt === null) {
        throw new Error(`組み立て前のphaseではない: ${state.phase}`)
      }
      hook.advance(Math.max(1, state.phaseEndsAt - hook.now()))
    }
    if (hook.phase() !== 'building') throw new Error('組み立てに到達しなかった')
  })
}

export async function pauseGame(page: Page): Promise<void> {
  await page.evaluate(() => window.__MMB__?.pause())
}

export async function resumeGame(page: Page): Promise<void> {
  await page.evaluate(() => window.__MMB__?.resume())
}

/** 選ぶ部品（ラジオボタン）を、見えている文字を押して選ぶ */
export async function pick(page: Page, name: RegExp | string): Promise<void> {
  const radio = page.getByRole('radio', typeof name === 'string' ? { name, exact: true } : { name })
  await radio.check()
  await expect(radio).toBeChecked()
}

/** タイトルから「ひとりで」の設定を選んで始める */
export async function startSolo(page: Page, level: RegExp, scope: string): Promise<void> {
  await page.locator('[data-action="solo"]').click()
  await expect(page.getByRole('heading', { name: 'ひとりで' })).toBeVisible()
  await pick(page, level)
  await pick(page, scope)
  await page.getByRole('button', { name: 'はじめる' }).click()
  await expect(page.locator('.game')).toBeVisible()
}

/** 答えあわせを「次へ」で飛ばす。自動で次へ進んでいたら何もしない */
export async function skipReveal(page: Page): Promise<void> {
  if ((await phase(page)) !== 'reveal') return
  await page
    .locator('.reveal-next')
    .click({ timeout: 2000 })
    .catch(() => {
      // 押す前に自動で次の問題へ進んだ
    })
}

/**
 * 4択が出ている（時計は止めてある）ときに正解を押し、答えあわせのカードを確かめる。時計は戻さない（呼ぶ側が戻す）。
 * 戻り値は選んだ名所の名前と、得た点
 */
export async function answerCorrectly(page: Page, opts: { checkReveal?: boolean } = {}): Promise<{ name: string; points: number }> {
  const answer = page.locator('.answer')
  await expect(answer).toBeVisible()
  await expect(answer.locator('.choice')).toHaveCount(4)
  const i = await correctIndex(page)
  const name = (await answer.locator(`.choice[data-index="${i}"] .choice-name`).textContent()) ?? ''
  await answer.locator(`.choice[data-index="${i}"]`).click()
  const reveal = page.locator('.reveal')
  await expect(reveal).toBeVisible()
  const delta = (await reveal.locator('.reveal-row.is-correct .reveal-delta').textContent()) ?? ''
  if (opts.checkReveal) {
    await expect(reveal.locator('.reveal-name')).toHaveText(name)
    await expect(reveal.locator('.reveal-place')).not.toBeEmpty()
    await expect(reveal.locator('.locator-map .map-marker')).toHaveCount(1)
    expect(delta).toMatch(/^\+(?:\d{3}|1,000)$/)
  }
  return { name, points: Number(delta.replace(/[^\d]/g, '')) }
}

/**
 * ひとりで：押せるようになったら時計を止めて押し、正解して答えあわせを確かめてから時計を戻す。
 * コンピューターが先に押していたら何もしないで false
 */
export async function buzzAndAnswer(page: Page, opts: { checkReveal?: boolean } = {}): Promise<{ name: string; points: number } | null> {
  await pauseGame(page)
  try {
    const ph = await phase(page)
    const buzzer = page.locator('.buzzer[data-player="you"]')
    if ((ph !== 'building' && ph !== 'lastcall') || !(await buzzer.isEnabled())) return null
    await buzzer.click()
    await waitPhase(page, ['answering'])
    return await answerCorrectly(page, opts)
  } finally {
    await resumeGame(page)
  }
}

/**
 * ひとりで：残りの問題を全部、押して正解して進め、結果まで行く。コンピューターが先に押した問題は待つ。
 * 戻り値は自分が答えた問題の数
 */
export async function playSoloToEnd(page: Page, opts: { checkReveal?: boolean; limitMs?: number } = {}): Promise<number> {
  let answered = 0
  const deadline = Date.now() + (opts.limitMs ?? 100_000)
  while (Date.now() < deadline) {
    const ph = await phase(page)
    if (ph === 'finished' || ph === 'none') break
    if (ph === 'building' || ph === 'lastcall') {
      if (await buzzAndAnswer(page, opts)) answered++
      else await page.waitForTimeout(30)
      continue
    }
    if (ph === 'answering') {
      await page.waitForTimeout(30)
      continue
    }
    if (ph === 'reveal') {
      await skipReveal(page)
      continue
    }
    await page.waitForTimeout(30)
  }
  return answered
}
