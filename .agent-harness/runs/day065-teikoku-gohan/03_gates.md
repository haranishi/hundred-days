# 検査と進め方

## 進め方（この順で。各段階で止まらず次へ。直しは3周まで）

1. 読む（00〜02、levels.json、reference/）。手本 day-062 の構成、tests/index.mjs、index.html の共有部品の取り込みを見る。
2. lib/sim.js（reference/sim.mjs の写し）、lib/levels-data.js（levels.json の写し）、lib/recipes.js。単体テストを緑にする。
3. UI（index.html, app.css, app.js, lib/render.js など）。Playwrightで 390×844 と 1280×800 のスクショを撮り、**自分で画像を読んで**崩れを直す。
4. E2E（tests/e2e/day-065.spec.mjs）。--repeat-each=3 で3回続けて通す。
5. README.md（100行以内）、meta.json（status は draft）、favicon.svg。
6. npm run shared:sync → index:sync → build → test:unit → precheck → E2E（day-065 / shared-share / security-headers）。

準備：node_modules は用意済み。E2Eは PLAYWRIGHT_PORT に空き番号（例 4565）を指定する。Mac画面ロック中は Chromium が落ちることがある。落ちたら報告する。

## 単体テスト（node --test・tests/index.mjs に必ず登録）

- sim：reference と同じ結果。全6面の見本＝★3、初期設定＝失敗、finish・到着・待ちの期待値。
- ルールの最小例（手で組んだ小さな面）：先着優先、手前で待つと後続が塞がる、焦げの境界（猶予ちょうど＝焦げない、+1＝焦げる）、切る駅は焦げない、同時入場は出発順が早い方。
- levels：辺が存在するノードを結ぶ／輪が無い／yard の出口は1本／全ノードから serve に着く／注文の料理名が recipes にある／solve で par と解の数が stats と一致（ソルバーはテスト用に tests/ へ置く）。
- 保存：壊れたJSON・使えないstorage・未知の面IDでも落ちない。
- 結果の文：成功・焦げ・工程違い・遅れの4種類で、相手の料理名と待った分数が文に入る。
- 星の境界：finish が par／par+1／par+2 のとき ★3／★2／★1。見本を使ったクリアは★1。

## E2E（Playwright）

1. 開く：コンソールのエラー0・CSP違反0・外部オリジンへの通信0。
2. 面1：列車をタップ→分岐をタップ（切るを通らない向き）→発車→スキップ→クリアと★3→リロードして保存が残る。
3. 面2：順番違いで失敗→原因の文→2回失敗で「見本のダイヤを見る」→反映→発車→クリア（★1）。
4. 面4：焦げる組み方を作り、「焦げた」の文が出る。
5. 画面幅 390×844・320×568・844×390・1440×900：横スクロールなし。押せるものは44px以上。
6. 共有欄とOGP（共通の shared-share と同じ条件）。動きを減らす設定で再生が飛ぶ。
7. キーボードだけで面1をクリアできる。

## 罠（過去に踏んだもの）

- localStorage の定数名を *_KEY にしない（gitleaks の誤検知）。
- tests/index.mjs に登録し忘れたテストは、一度も走らない。
- インラインscript・on*=属性・外部フォント・外部画像は禁止（CSP は script-src 'self'）。
- 共有欄をダイアログの中に置くと shared-share が落ちる。共有は帯のボタンから開く窓にして、試験の手順（openShare）に合わせる。
- 完了報告は実際の出力を貼る。発注側が再実行して、件数と不安定さ（--repeat-each=3）を照合する。
- 盤の座標と via は levels.json のものを使う。重なって読みにくければ、座標を変える前に報告する。
