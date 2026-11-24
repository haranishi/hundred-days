# Day99 meibo の公開と本番確認の記録（2026-11-24）

`verification.md` の続き。マージ前のCIの失敗と修正、マージ、本番で確かめたことを残す。

## CIの失敗と修正

- 1回目（PR241・`cb03286`）は、「Pre-publish, syntax, unit and build」の単体試験で落ちた。原因は、`tools/promo/render-promo.mjs` が先頭で `@playwright/test` を読み込んでいたこと。CIは `npm ci` より前（依存が無い状態）に単体試験を走らせるため、道具を読み込むだけで `ERR_MODULE_NOT_FOUND` になった。手元にはルートの `node_modules` があり、気づけなかった。
- `tests/index.mjs` は試験ファイルを順に `await import()` する。1本の読み込みが失敗すると、後ろの試験は登録されない。CIのログでは audio の6件だけが走り、cli と timeline は無言で消えていた。「1件失敗」の裏に、見えていない試験がある。
- 直し（`fdc4125`）: Playwright を、撮影を始める関数の中で `await import()` する。道具の `.mjs` が第三者パッケージを先頭で読まないことは、`tests/promo/cli.test.mjs` が見張る。外部Dayの一覧試験 `tests/e2e/external-days.spec.mjs` に、Day99の行を足した。
- 確かめ方: 依存なし・UTCの複製（`git clone` しただけで `node_modules` が無い状態）で、修正前は同じ失敗が再現し、修正後は単体試験が 6663件中6662件合格（1件スキップ・失敗0）。全Dayを巡るブラウザ試験（`home` / `external-days` / `external-intro` / `security-headers` / `not-found` / `shared-share`）は、手元で 434件合格した。
- 直したあとのCI（run 45308804804）は、全ジョブ成功。ブラウザ試験の分割は、最長で約40分かかった。

## マージ

- PR241を、2026-11-24 11:45（JST）に squash でマージした（`d27d1e8`）。マージは本人の承認を得て行った。AI署名は付けていない。
- main の `CI and Deploy`（run 45314717085）は、`Deploy production` を含めて全ジョブ成功（12:30に完了）。

## 本番での確認（`https://rairakku.com/100days/`・12:31）

| 見たもの | 結果 |
|---|---|
| 一覧のDay099のカード | `data-day="099"`・題名「meibo」・「外部で公開」・「最新」。リンクは meibo のGitHub（新しいタブ・`noopener`）。「アプリを開く」は出ない |
| `/day-099-meibo/screenshot.webp`・`demo.mp4` | どちらも200。63,144 B と 483,167 B で、リポジトリのファイルと MD5 が一致 |
| 配信してはいけない物 | `tools/`・`tests/`・`meta.json`・`README.md` は404 |
| カードの動画の再生（実際のChrome・PC幅1280・スマホ幅390） | ダイアログで再生された。540×960・15.6秒・エラーなし。字幕と画面も確認した |

カードの動画の再生の確認は、計測（GA4）をブラウザのDNSで止めて行った。

## 未了（本人）

BGMの試聴（A・B）／スマホ実機での見え方／Xへの投稿／名前「meibo」の商標の照合／個人情報・営業活動の法規の専門家確認。
