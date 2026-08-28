import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* Chrome拡張など、アプリ本体をこのサイトの外で公開しているDay（status: external ＋ externalUrl）の検査。
   コードはこのリポジトリに置かず、一覧のカードが紹介ページへ正しくリンクすることだけを約束する。

   externalUrl へのネットワーク到達性はここでは見ない。外部サイトの停止でこのリポジトリの
   CIが落ちる依存を作らないため。リンク先が200を返すかは公開前チェック（手動）で確認する。 */

const EXTERNAL_DAYS = [
  {
    day: '019',
    title: 'そのままコード',
    dir: 'day-019-sonomama-code',
    url: 'https://rairakku.vercel.app/sonomama-code'
  },
  {
    day: '020',
    title: 'モザイカー',
    dir: 'day-020-mozaiker',
    url: 'https://rairakku.vercel.app/mozaiker'
  }
];

for (const d of EXTERNAL_DAYS) {
  test.describe(`Day ${d.day} ${d.title}（外部で公開）`, () => {
    test('一覧のカードが紹介ページへ新しいタブでリンクする', async ({ page }) => {
      await page.goto('/');
      const card = page.locator(`.card[data-day="${d.day}"]`);
      await expect(card).toHaveCount(1);
      await expect(card.locator('.card__title')).toHaveText(d.title);
      await expect(card.locator('.badge')).toHaveText(/外部で公開/);

      const button = card.getByRole('link', { name: /紹介ページを開く/ });
      await expect(button).toHaveAttribute('href', d.url);
      await expect(button).toHaveAttribute('target', '_blank');
      await expect(button).toHaveAttribute('rel', 'noopener');

      // アプリ本体はこのサイトでは配信しない＝内部リンクの「アプリを開く」を出さない
      await expect(card.getByRole('link', { name: 'アプリを開く' })).toHaveCount(0);

      // サムネイルも同じ紹介ページへ飛ぶ
      const thumbHref = await card.locator('.thumb__link').getAttribute('href');
      expect(thumbHref).toBe(d.url);

      // スクショの実体が配信されている（カードが「DAY 019」のプレースホルダに落ちていないこと）
      const shot = await page.request.get(`/${d.dir}/screenshot.webp`);
      expect(shot.ok(), `スクショが見つからない: /${d.dir}/screenshot.webp`).toBe(true);
    });
  });
}

test('外部で公開したDayも進捗（公開済み N/100）に数えられる', async ({ page }) => {
  // 期待値は meta.json の実値から動的に組み立てる（Dayが増えるたびにこのテストを書き換えない）
  const appsDir = fileURLToPath(new URL('../../apps/', import.meta.url));
  const released = readdirSync(appsDir)
    .filter((name) => name.startsWith('day-'))
    .map((dir) => JSON.parse(readFileSync(`${appsDir}${dir}/meta.json`, 'utf8')))
    .filter((meta) => {
      const status = meta.status || 'published';
      if (status === 'draft') return false;
      return status === 'published' || Boolean(meta.externalUrl);
    }).length;

  await page.goto('/');
  await expect(page.locator('.progress__now')).toHaveText(String(released));
});
