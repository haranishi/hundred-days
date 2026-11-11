// 滑る道具（スノーボード／スキー）の選び方を、実ブラウザで通して確かめる。
// node tools/shots/gear-check.mjs [--url http://127.0.0.1:5183/]
// 見ること：題字のボタンで替わる・替えた後に Enter で滑り出せる・設定の行で替わる・スキーでは「前に出す足」を隠す・
// 選んだ道具を覚えている（開き直しても同じ）・アドレスの ?gear= は開いたときの道具を決めるだけ（そのあと、画面で替えられる）。
// 単体試験では出ない所（焦点・キー・保存）なので、ブラウザで通す。
import { options, session, fail } from './common.mjs';

const config = options();
const state = page => page.evaluate(() => ({ gear: window.__ginrei.state().gear ?? 'board',
  checked: document.querySelector('[data-gear][aria-checked="true"]')?.dataset.gear ?? null,
  hud: document.querySelector('[data-screen="hud"]')?.hidden === false,
  focus: document.activeElement?.dataset?.start !== undefined ? 'start' : document.activeElement?.dataset?.gear ?? document.activeElement?.tagName ?? null }));
const expect = (label, actual, wanted) => {
  const ok = Object.entries(wanted).every(([k, v]) => actual[k] === v);
  console.log(`${ok ? '合格' : '不合格'}：${label} ${JSON.stringify(actual)}`);
  if (!ok) throw Error(`${label}：期待 ${JSON.stringify(wanted)}・実際 ${JSON.stringify(actual)}`);
};
const withGear = (gear) => { const u = new URL(config.url); if (gear) u.searchParams.set('gear', gear); else u.searchParams.delete('gear'); return u.href; };

try {
  await session({ ...config, url: withGear(null) }, { width: 1280, height: 800 }, async ({ page }) => {
    expect('初めて開くと、スノーボード', await state(page), { gear: 'board', checked: 'board', hud: false });
    await page.locator('[data-gear="ski"]').click();
    expect('題字の「スキー」を押すと、スキーになり、焦点は「滑りはじめる」へ', await state(page), { gear: 'ski', checked: 'ski', focus: 'start' });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('[data-screen="hud"]')?.hidden === false, null, { timeout: 10000 });
    expect('Enter で滑り出す', await state(page), { gear: 'ski', hud: true });
    // 一時停止 → 設定：スキーでは「前に出す足」を隠す。行でスノーボードへ替えると、出る
    await page.keyboard.press('Escape');
    await page.locator('[data-action="settings"]').click();
    const rows = () => page.evaluate(() => ({ stanceHidden: document.querySelector('[data-field="stance"]').hidden, value: document.querySelector('[data-setting="gear"]').value, gear: window.__ginrei.state().gear }));
    expect('設定：スキーでは「前に出す足」を隠す', await rows(), { stanceHidden: true, value: 'ski', gear: 'ski' });
    await page.locator('[data-setting="gear"]').selectOption('board');
    expect('設定の行で、スノーボードへ替わる', await rows(), { stanceHidden: false, value: 'board', gear: 'board' });
    await page.locator('[data-setting="gear"]').selectOption('ski');
    expect('設定の行で、スキーへ戻す', await rows(), { stanceHidden: true, value: 'ski', gear: 'ski' });
    // 開き直しても、選んだ道具を覚えている
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__ginrei);
    await page.evaluate(() => window.__ginrei.ready);
    expect('開き直しても、スキーのまま', await state(page), { gear: 'ski', checked: 'ski' });
    // キーボードだけで選ぶ：左右キーで替えて、Enter で滑り出す
    await page.locator('[data-gear="ski"]').focus();
    await page.keyboard.press('ArrowLeft');
    expect('左キーで、スノーボードへ', await state(page), { gear: 'board', checked: 'board', focus: 'board' });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('[data-screen="hud"]')?.hidden === false, null, { timeout: 10000 });
    expect('道具のボタンの上で Enter を押すと、滑り出す', await state(page), { gear: 'board', hud: true });
  });
  await session({ ...config, url: withGear('ski') }, { width: 1280, height: 800 }, async ({ page }) => {
    expect('アドレスの ?gear=ski で開くと、スキー', await state(page), { gear: 'ski', checked: 'ski' });
    await page.locator('[data-gear="board"]').click();
    expect('そのあと「スノーボード」を押すと、表示も実際も替わる', await state(page), { gear: 'board', checked: 'board' });
  });
  console.log('道具の選び方：合格');
} catch (error) { fail(error); }
