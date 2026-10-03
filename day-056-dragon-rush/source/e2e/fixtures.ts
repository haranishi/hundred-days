// OWNER: tests
// E2E の test・expect・collectErrors（各 spec はここから読む）。ブラウザの違いを吸収するのはこのファイルだけにする。
// context の使い回し（テストごとに新しいページだけ作る）は測って見送った：WebKit でも context の作成は1回数十ミリ秒で、
// 24件の合計は3.3分から3.2分にしか縮まず、前のテストの保存を消す仕組みが要るだけ複雑になる。
import type { Page } from '@playwright/test';

export { expect, test, type Page } from '@playwright/test';

/** WebKit が、移動で捨てる側の文書の取得の失敗に付ける文（同じ出どころの取得でも「access control checks」と書く）。 */
const LEAVING_FETCH = /^Fetch API cannot load .+ due to access control checks\.$/;

/**
 * ページのコンソールのエラーと、捕まらなかった例外を集める。
 * ただし、読み込み直し・移動の途中（移動の要求から確定まで）に出る LEAVING_FETCH だけは数えない。
 * WebKit は移動を始めた時点で前の文書の読み込みを止める。音を裏で読んでいる途中だと、止められた取得と、
 * 続けて始めた取得が確定までの間に次々に失敗し、捕まらなかった例外として数件〜百件出る
 * （Chromium は確定まで前の文書の読み込みを続けるので出ない）。遊びの中の失敗ではないので、ここで除く。
 */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  let leaving = false;
  const isMainNavigation = (r: { isNavigationRequest(): boolean; frame(): unknown }): boolean => r.isNavigationRequest() && r.frame() === page.mainFrame();
  page.on('request', (r) => {
    if (isMainNavigation(r)) leaving = true;
  });
  page.on('requestfailed', (r) => {
    if (isMainNavigation(r)) leaving = false;
  });
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) leaving = false;
  });
  const add = (text: string): void => {
    if (!(leaving && LEAVING_FETCH.test(text))) errors.push(text);
  };
  page.on('console', (m) => {
    if (m.type() === 'error') add(m.text());
  });
  page.on('pageerror', (e) => add(String(e)));
  return errors;
}
