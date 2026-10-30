# マウント対応の検証記録（2026-10-30）

変更は feat/mount-under-rairakku に未コミットで残した。依存追加、ネットワーク、commit/push/PR、他の作業フォルダへのアクセスは行っていない。

## 変更したファイル（1ファイル1行）

- `.kiro/specs/mount-safe/design.md` — URL生成、検査、配信と回帰防止の設計を記録。
- `.kiro/specs/mount-safe/requirements.md` — 依頼された要件・制約を記録。
- `.kiro/specs/mount-safe/tasks.md` — 実装・検証タスクと引継ぎ状況を記録。
- `.kiro/specs/mount-safe/verification.md` — ファイル別変更理由・検証結果・未実施項目を記録。
- `AGENTS.md` — 新しいDay向けの文書相対参照ルールを追加。CLAUDE.mdは存在しない。
- `README.md` — 中継・canonical・mount例外と検証道具の使い方を追記。
- `day-064-breach-atlas/meta.json` — mount:falseでVite成果物をサブパス配信から除外。
- `day-074-link-dokumi/index.html` — 一覧・プライバシーのリンクを文書相対に変更。
- `day-074-link-dokumi/lib/samples.js` — 見本サイトの資材URLを文書相対に変更（ルートページ上で同じ解決先）。
- `day-074-link-dokumi/tests/fixtures/trace-clean.json` — サンプルと同じ見本データを保つため期待値を同期。
- `day-076-henkan-desk/meta.json` — mount:falseでVite成果物をサブパス配信から除外。
- `scripts/build.mjs` — canonical/OGP/JSON-LD、相対参照、例外リンク、sitemap、404、noindexと検査ゲートを実装。
- `scripts/check-mount-safe.mjs` — dist直下の実名からルート参照を検出し、CLIで行番号と終了コード1を返す。
- `scripts/prepare-x-post.mjs` — 取得URLとcanonicalの相違による公開確認の回帰を防止。実際の投稿準備は実行していない。
- `scripts/serve-mounted.mjs` — prefix付き配信、Pages風リダイレクト・404・Range・ルートAPIスタブを実装。
- `scripts/site/home.css` — 一覧フォントのURLを文書相対に変更。
- `scripts/smoke-mounted.mjs` — 対象DayをChromiumで巡回し、取得・console・pageerrorを集約。
- `scripts/sync-day-index.mjs` — 任意のmountをbooleanとして検査。
- `scripts/tests/check-mount-safe.test.mjs` — 動的な対象名、参照の形式、除外規則を検証。
- `scripts/tests/day-status.test.mjs` — canonicalの期待値と小規模ビルドの依存を更新し、新しい生成物とビルド失敗を検証。
- `scripts/tests/serve-mounted.test.mjs` — 両prefixの配信・転送・Range・APIをソケットなしで検証。
- `scripts/tests/verify-public-page.test.mjs` — 元ホストで取得する中継先canonicalの同一性と一覧の誤受入れ防止を検証。
- `scripts/verify-public-page.mjs` — 取得先と期待canonicalを別々に指定可能にする（既存呼出し互換）。
- `static/privacy.html` — 一覧への戻り先を文書相対に変更。
- `tests/e2e/day-031-shape-where.spec.mjs` — ビルド後のcanonical・共有URLの期待値を新仕様へ更新（ブラウザ実行は未実施）。
- `tests/e2e/day-043.spec.mjs` — ビルド後のcanonical・共有URLの期待値を新仕様へ更新（ブラウザ実行は未実施）。
- `tests/e2e/day-045.spec.mjs` — ビルド後のcanonical・共有URLの期待値を新仕様へ更新（ブラウザ実行は未実施）。
- `tests/e2e/day-048.spec.mjs` — ビルド後のcanonical・共有URLの期待値を新仕様へ更新（ブラウザ実行は未実施）。
- `tests/e2e/day-049.spec.mjs` — ビルド後のcanonical・共有URLの期待値を新仕様へ更新（ブラウザ実行は未実施）。
- `tests/e2e/day-050.spec.mjs` — ビルド後のcanonical・共有URLの期待値を新仕様へ更新（ブラウザ実行は未実施）。
- `tests/e2e/day-053-kotoba-tsuji.spec.mjs` — ビルド後のcanonical・共有URLの期待値を新仕様へ更新（ブラウザ実行は未実施）。
- `tests/e2e/day-057.spec.mjs` — ビルド後のcanonical・共有URLの期待値を新仕様へ更新（ブラウザ実行は未実施）。
- `tests/e2e/day-058.spec.mjs` — ビルド後のcanonical・共有URLの期待値を新仕様へ更新（ブラウザ実行は未実施）。
- `tests/e2e/day-060.spec.mjs` — ビルド後のcanonical・共有URLの期待値を新仕様へ更新（ブラウザ実行は未実施）。
- `tests/e2e/day-061.spec.mjs` — ビルド後のcanonical・共有URLの期待値を新仕様へ更新（ブラウザ実行は未実施）。
- `tests/e2e/day-063.spec.mjs` — ビルド後のcanonical・共有URLの期待値を新仕様へ更新（ブラウザ実行は未実施）。
- `tests/e2e/day-065.spec.mjs` — ビルド後のcanonical・共有URLの期待値を新仕様へ更新（ブラウザ実行は未実施）。
- `tests/e2e/day-066.spec.mjs` — ビルド後のcanonical・共有URLの期待値を新仕様へ更新（ブラウザ実行は未実施）。
- `tests/e2e/day-068.spec.mjs` — ビルド後のcanonical・共有URLの期待値を新仕様へ更新（ブラウザ実行は未実施）。
- `tests/e2e/day-069.spec.mjs` — ビルド後のcanonical・共有URLの期待値を新仕様へ更新（ブラウザ実行は未実施）。
- `tests/e2e/day-073.spec.mjs` — ビルド後のcanonical・共有URLの期待値を新仕様へ更新（ブラウザ実行は未実施）。
- `tests/e2e/day-075.spec.mjs` — ビルド後のcanonical・共有URLの期待値を新仕様へ更新（ブラウザ実行は未実施）。
- `tests/e2e/home.spec.mjs` — ビルド後のcanonical・共有URLの期待値を新仕様へ更新（ブラウザ実行は未実施）。
- `tests/e2e/shared-share.spec.mjs` — ビルド後のcanonical・共有URLの期待値を新仕様へ更新（ブラウザ実行は未実施）。

## 実行したコマンドと結果

- `npm run build` — 成功。同期検査・マウント検査を含む。公開Day75件、外部4件。
- `node scripts/check-mount-safe.mjs dist` — 成功、違反0。
- `node --test scripts/tests/*.test.mjs day-074-link-dokumi/tests/` — 既存のポート待受4件が `listen EPERM`。変更に伴う期待値・テスト用依存は修正済み。環境制限の4件は合格とは扱わない。
- 下記の関連単体テストコマンド — 1,271件成功。ポート待受4件を名前で除外。
- `node --test scripts/tests/day-status.test.mjs scripts/tests/check-mount-safe.test.mjs scripts/tests/serve-mounted.test.mjs scripts/tests/verify-public-page.test.mjs` — 最終変更後も20件成功。
- 変更・追加JSへの `node --check` — 32ファイル成功。
- `git diff --check` — 成功。
- Nodeのassertでdistの全公開Day75件のcanonical/og:url/og:image/twitter:imageと一覧のcanonical、例外カード、sitemap、404、ヘッダーを確認 — 成功。sitemapは一覧1 + 対象Day73 = 74 URL。Day064/076は元ホストのcanonicalでsitemapには含まれない。

```sh
node --test --test-skip-pattern='serve-dist は|0以外のポート|検査用のサーバー：' scripts/tests/*.test.mjs day-074-link-dokumi/tests/ day-031-shape-where/tests/share-text.test.mjs day-049-patanyan/tests/unit/share.test.mjs day-049-patanyan/tests/unit/draw.test.mjs day-059-kuchi-sanmai/tests/release.test.mjs day-053-kotoba-tsuji/tests/code.test.mjs day-066-hakokage-kaito/tests/phrase.test.mjs
```

## 直さなかったもの・判断の理由

- Day074 `lib/handlers.js` の `/day-074/` は `https://cache.invalid` を使うサーバー内部Cache APIのキー。ブラウザの参照でも、実際の公開ディレクトリ名でもないので維持した。
- Day074のsamplesは実サイトへ取得しない固定見本だが、検査定義に該当するため文書相対へ変更。見本のURLがルートページなので資材の意味は同じ。対応するfixtureを同期した。
- Day064・076の既存Vite成果物は依頼どおり再ビルドせず、mount:falseで除外した。vendor/toolsの外部ライブラリや道具のURLも変更していない。
- ソースの既存絶対HTTPS URL、meta.publicUrl、READMEの既存Day一覧は元ホストで引き続き有効なので維持。配信時のcanonical等だけビルドで更新する。公開契約の単体テストはソースを検査するため、その旧ホストの見本は維持。
- Day070・071の専用E2Eはdistではなくソースのプレビューを使うため、旧canonicalの期待値を維持。横断E2Eはdistを読むため新canonicalに更新。
- GA4と各アプリの外部通信に関する記載は変更していない。
- 実サーバーの待受・ブラウザ・`npm run test:e2e`・スモークは未実施。ポート待受はEPERM、ブラウザは依頼の環境制約。新サーバーはソケットなしのハンドラーテストで両prefixを確認した。

## 親に確かめてほしいこと

```sh
node scripts/smoke-mounted.mjs --prefix /100days
node scripts/smoke-mounted.mjs --prefix ''
```

両方の取得失敗・console/pageerrorの結果を比較する。外部APIへ接続するDayは実ネットワーク条件にも依存する。必要なら `node scripts/serve-mounted.mjs --prefix /100days --port 4890` とルート配信を手動で切り替え、一覧・プライバシー・Day074・動画のシーク・不存在URLの404・Day064/076の元ホストへの遷移を確認する。スモークのAPIは常に `{ "stub": true }` を返すため、実APIの機能保証には使わない。別リポの中継実装・本番のHTTP状態と主要操作は、この作業の対象外。

## 親の検証（2026-10-30）

Codexの実装を、ブラウザを動かせる環境で確かめた。

- ビルドと単体: CIと同じ `npm run test:unit` が 4,977件のうち失敗0（スキップ1は元から）。検査器を強化し、`href="/"`（サイトのルートへのリンク）も違反にした。
- 擬似マウント（`smoke-mounted.mjs`）: 一覧と公開73Dayの74ページを、`/100days` の下とルート直下で開いた。差は Day079 の `dynamic is not defined` だけで、これは**本番の pages.dev でも出る元からの不具合**（共有ボタン以外が空白。今回の変更とは無関係）。検査の道具は、一覧のGA4に送らないよう、計測先をDNSで止める作りに直した。`--base <URL>` で、プレビューや本番にも同じ検査をかけられる。
- プレビュー: この変更を hundred-days のプレビュー（`mount-preview`）に出し、rairakku.com の中継（プレビュー）を通して、74ページ・Chromium PC・スマホ・WebKit iPhone を確かめた。一覧・Day・戻る・スラッシュなし・404・API・デモ動画が合格。
- 一覧のGA4タグは、Do Not Track・GPC のブラウザでは読み込まず、`gtag` も作らない形に直した（rairakku.com のプライバシーポリシーが同じ約束をしているため）。e2eに3件足した。
- Codexが推測で書き換えた期待値のうち、実際の動作と食い違った Day049・058・060・061 の分は、元に戻した（アプリのコードが公開URLを直接持つため。Day060 は `app.js`、Day049 は `lib/site.js`、Day058・061 は Vite の成果物）。
- e2e（全体）: （結果は本書の末尾に追記する）

## 第2段階（今回の対象外）

- Day064・076 の作り直し（相対 base）。
- 共有で広まるURLを、canonical から作る形へ直す。上の4Dayは確認済み。公開物には、ほかにも古い住所（`hundred-days.pages.dev`）を含むDayがあるが、Wikipedia APIの連絡先や自己検査のガードなど、意味が違う使い方もあるので、Dayごとに見て判断する。
- pages.dev から新URLへの301（中継の行き先と輪にならない見分けが要る）。
- 新しいDayの `meta.publicUrl` を新URLにする（毎日のXの返信リンクを、新しいドメインに集める）。中継が公開されたあとに切り替える。
