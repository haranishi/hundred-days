// ひとりで（見習い・日本・試験時計・種固定）：はじめる→押す→正解→答えあわせ→…8問→結果に得点と称号とシェア→「もう一回」
import { expect, test } from '@playwright/test'
import { SITE_URL } from '../../src/client/site'
import { advanceToBuilding, answerCorrectly, blockExternal, freezeLocalGameOnCreation, correctIndex, pauseGame, resumeGame, skipReveal, startSolo, waitPhase } from './helpers'

test('ひとりで：8問を全部正解して結果へ。得点・称号・シェアが出て、「もう一回」で1問目から始まる', async ({ page, context }) => {
  const external = await blockExternal(context)
  await page.goto('/?test=1&seed=7&speed=8&gfx=test')
  await expect(page.getByRole('heading', { name: '名所くみたて早押し' })).toBeVisible()
  await freezeLocalGameOnCreation(page)
  await startSolo(page, /見習いガイド/, '日本')

  // 上の帯：第1問／8、1Pの「あなた」と2Pの見習いガイド
  await expect(page.locator('.q-total')).toHaveText('／8')
  await expect(page.locator('.chip[data-player="you"]')).toContainText('1P')
  await expect(page.locator('.chip[data-player="guide"]')).toContainText('見習いガイド')

  const buzzer = page.locator('.buzzer[data-player="you"]')
  let total = 0
  for (let q = 0; q < 8; q++) {
    await advanceToBuilding(page)
    await expect(page.locator('.q-num')).toHaveText(String(q + 1))
    // 押せるようになる＝組み立てが始まった。帯に「いま押すと◯点」
    await expect(buzzer).toBeEnabled()
    await expect(page.locator('.meter-text')).toContainText(/いま押すと|最後のチャンス/)
    // 押す→4択→正解→答えあわせ（名前・場所・地図の印・誰が何点）
    await buzzer.click()
    await waitPhase(page, ['answering'])
    expect(await page.evaluate(()=>window.__MMB__?.state().question?.buzzerId)).toBe('you')
    const got = await answerCorrectly(page, { checkReveal: true })
    total += got.points
    await skipReveal(page)
  }

  // 結果：勝敗・得点・称号・シェア
  const result = page.locator('.result')
  await expect(result).toBeVisible()
  await expect(result.locator('.result-headline')).toHaveText('あなたの勝ち！')
  await expect(result.locator('.result-score')).toHaveText(`${total.toLocaleString('ja-JP')}点`)
  await expect(result.locator('.result-title-name')).toHaveText(/観光見習い|名所ハンター|ベテラン旅人|世界の名所マスター/)
  await expect(result.locator('.qr')).toHaveCount(8)
  const x = result.locator('[data-share="x"]')
  await expect(x).toHaveAttribute('href', /^https:\/\/x\.com\/intent\/post\?text=.+&url=/)
  expect(decodeURIComponent((await x.getAttribute('href')) ?? '')).toContain(SITE_URL)
  await expect(result.locator('[data-share="line"]')).toHaveAttribute('href', /^https:\/\/social-plugins\.line\.me\/lineit\/share\?url=/)
  await expect(result.locator('[data-share="copy"]')).toBeVisible()
  await expect(result.locator('.share-note')).toContainText('Instagram')

  // もう一回：同じ設定で1問目から
  await result.getByRole('button', { name: 'もう一回' }).click()
  await expect(page.locator('.game')).toBeVisible()
  await expect(page.locator('.q-num')).toHaveText('1')
  await waitPhase(page, ['countdown', 'intro', 'building'])
  await expect(page.locator('.chip[data-player="you"] .chip-score')).toHaveText('0')
  expect(external).toEqual([])
})

test('ひとりで：「やめる」は確認を1回はさみ、「つづける」で戻り、「やめる」でタイトルへ', async ({ page }) => {
  await page.goto('/?test=1&seed=8&speed=8&gfx=test')
  await startSolo(page, /ベテランガイド/, '世界')
  await waitPhase(page, ['intro', 'building', 'lastcall', 'answering'])
  await page.getByRole('button', { name: 'やめる' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('ゲームをやめますか')
  // 確認している間はゲームの時計が止まる（ひとり・ふたりだけ）
  const t1 = await page.evaluate(() => window.__MMB__?.now() ?? -1)
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => window.__MMB__?.now() ?? -2)).toBe(t1)
  await dialog.getByRole('button', { name: 'つづける' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.game')).toBeVisible()
  await page.waitForTimeout(100)
  expect(await page.evaluate(() => window.__MMB__?.now() ?? -1)).toBeGreaterThan(t1)
  await page.getByRole('button', { name: 'やめる' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'やめる' }).click()
  await expect(page.getByRole('heading', { name: '名所くみたて早押し' })).toBeVisible()
  // ゲームは片付いている（自動テストの窓口も消える）
  expect(await page.evaluate(() => window.__MMB__ === undefined)).toBe(true)
})

test('キーボード：Space で押して 1〜4 で答える', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'キーボードの確かめは広い画面だけ')
  await page.goto('/?test=1&seed=9&speed=8&gfx=test')
  await startSolo(page, /見習いガイド/, 'ぜんぶ')
  await expect(page.locator('.buzzer[data-player="you"]')).toBeEnabled()
  await pauseGame(page)
  await page.keyboard.press('Space')
  await waitPhase(page, ['answering'])
  const i = await correctIndex(page)
  await page.keyboard.press(String(i + 1))
  await expect(page.locator('.reveal')).toBeVisible()
  await expect(page.locator('.reveal-row.is-correct')).toBeVisible()
  await resumeGame(page)
})
