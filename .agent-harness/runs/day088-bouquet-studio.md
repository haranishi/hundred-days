# Day088「Bouquet Studio」の作業記録（外部Day）

2026-11-08。花束を作り、リンクにして贈るWebアプリ。公開先は https://day88.rairakku.com/（Cloudflare Pages）。この記録は、公開の手順と、事実の確認の証拠。

## 公開の構成（Day083と同じ外部Day）

- アプリ本体は専用の Pages プロジェクトに置き、`day88.rairakku.com` で配信する。`meta.json` は `status: external`。
- `https://rairakku.com/day88/` と、100日の正の住所 `https://rairakku.com/100days/day-088-bouquet-studio/`（フォルダ直下だけ）は、共通の転送 Workers で `day88.rairakku.com` へ 302 する（`infra/day-redirect/`）。中継にはしない。
- アプリのコードは公開していない。このフォルダにあるのは、一覧に載せるための記録（meta.json・README・スクリーンショット）。
- 解析・Cookie・外部通信は使わない。配信ヘッダーは CSP（`default-src 'none'`・`connect-src 'none'`）・nosniff・HSTS・Referrer-Policy・Permissions-Policy。存在しないパスは、案内つきの 404（Pages は `404.html` が無いと案内ページを 200 で返すため、専用の 404 ページを置いた）。

## アプリの検証（公開した版）

- 単体 910・画面試験 957（Chromium のPC・スマホ、WebKit）・公開ゲート 100 項目が成功。
- 別のAIが実際に操作して採点した（合格は16点以上かつ0点なし）: 操作性 8→15→16/20、写真の背景 15→17/20。写真の背景の第1周は、小さなスマホで読めないファイルのエラー文が見える範囲の外に出て「エラー時の案内」が0点になり不合格だった。直して第2周で合格。
- 読み取り専用の独立コードレビュー 8件のうち、6件を直した（取り込み中の別操作・保存の食い違い・履歴・画素数・文字色の計算・共有の説明）。2件は理由を仕様に残して見送った。
- 公開後の実URLを、41項目で確認した。全部成功。
  - ページ（/・/gift/・/privacy/）は200。CSP・nosniff・HSTS が付く。canonical と og:url は公開URL。OGP画像は 1200×630。
  - 存在しないパスと、配信してはいけないパス（/tools/・/src/…・/site.config.json など）は 404。
  - 解析の自動注入はない。Cookie は 0。外部への通信は 0。コンソールのエラーも 0。
  - PC とスマホで、3Dの花が描かれる。花束を作ると、贈るリンクが公開URLで作られる。別の文脈で開くと、宛名とメッセージが届く。

## 100日側の変更

- `day-088-bouquet-studio/`（meta.json・README.md・screenshot.webp）
- `README.md` の一覧（`npm run index:sync`）
- `infra/day-redirect/`（`EXTERNAL_DAYS` と `wrangler.toml` の経路）、`scripts/tests/day-redirect.test.mjs`
- `tests/e2e/external-days.spec.mjs`（外部Dayのカードの検査に Day088 を追加）

検査: 単体 5,407 件中 5,406 件成功（既存の1件はスキップ）。`npm run precheck` は漏洩パターンなし。外部Dayのカードの画面試験は Day088 を含めて成功。

## 残り

- 宣伝動画・X投稿文は別のPRで足す。X への投稿は本人が行う。
- 実機（iPhone・Android・Safari）での写真選択（HEIC・大きな写真）は未確認。
