# PRをマージする前のチェック

普段の変更では、ローカルで `npm run check` を実行し、PRの共通CIが成功してからマージする。
画面や操作を変えた場合は、対象Dayの実操作と下記の目視項目も確認する。

## 共通CIで毎回確認する項目

| 項目 | 検出する問題 |
| --- | --- |
| Git履歴のシークレット検査 | 過去のコミットを含む秘密値の混入 |
| 公開前チェック | トークン・ローカルパス・非公開ファイルの追跡・著者メール設定 |
| 個人NGワード検査 | Secretsに登録した非公開語句の混入。同一リポジトリのPRとmainで実行 |
| JavaScript構文チェック | 自作の `.js`・`.mjs`・`.cjs` の構文エラー |
| 単体テスト | 各Dayのロジックと検査スクリプトの回帰 |
| ビルド | README一覧・共有ファイルの同期漏れと公開サイトの生成失敗 |
| ブラウザテスト | 各Dayの既存テスト、共有機能、セキュリティヘッダなどの回帰 |

ブラウザテストは4台に分割し、各テストファイル内の順序と1 workerを維持する。
CIでは `test.only` をエラーにし、一部のテストだけを実行した状態での成功を防ぐ。
アプリが増えても、変更されたDayだけに絞らず、既存の全ブラウザテストを実行する。

`Build and browser test` は既存のブランチ保護で必須になっている共通CIの集約結果。
前段の検査か4分割のブラウザテストが失敗・キャンセル・skipになると、このチェックも失敗する。
mainへのマージ後も同じ検査を行い、成功した場合に既存の本番デプロイへ進む。
Day56・58・64のソース検証は、引き続き各Day専用ワークフローの対象パス変更時に実行する。

## 手元で同じ検査を実行する

Node.js 24と、ローカル専用の `.precheck-ng.txt` を用意する。
初回設定は [運用手順](ops.md#公開前チェックprecheck) を参照する。

```bash
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
```

対象Dayだけのブラウザ確認では `npm run test:e2e -- tests/e2e/day-066.spec.mjs` のように指定する。
CIの分割を再現する場合は `npm run test:e2e -- --shard=1/4` を使う。
フォークPRでは非公開の語句を渡さず、`npm run precheck -- --public` で共通の漏洩検査を行う。
通常の `npm run precheck` は、NGワード設定が欠落・空・不正な場合に失敗する。

ルートは素のJavaScriptなので、一律のTypeScript・ESLint検査は設けない。
TypeScript製Dayのソースを変える場合は、その `source/package.json` の型検査・lint・テスト・リリース手順も確認する。
構文検査では生成済みのassets/game/dist、vendor、評価用の記録を除く。これらの動作はビルドとブラウザテストで確認する。

## 下書きのDayと横断の検査

共有・OGP・ヘッダーの横断の検査（`shared-share`・`security-headers`）は、このサイトで配信するアプリ本体（`status: "published"`）だけが対象になる。
`external-days` は、外部で公開したDay（`status: "external"`）の一覧のカードと素材を見る検査で、こちらも下書きは対象外。
ビルドは下書きのDayを `dist/` に入れないので、下書きの違反は、公開に切り替えたPRのCIで初めて見つかる。Day70とDay71で続けて起きた。

この穴は2か所で埋めている。
単体テストの静的な契約（`scripts/lib/publish-contract.mjs`）は、canonical・OGP・共有文のように、HTMLと `meta.json` の文字列だけで決まる項目を、下書きを含む全Dayに当てる。共通CIでも `npm run check` でも走る。
44pxの大きさや枠のコントラストのように、ブラウザでしか測れない契約は、公開ゲート `npm run publish:check -- --day <N>` が受け持つ。そのDayだけを公開済みとみなしてビルドし、横断のブラウザテストを流す。ブラウザは上の `npx playwright install chromium` で入れたものを使う。

公開ゲートは `meta.json` を書き換えない。通常の終了・失敗・例外・SIGINT・SIGTERM・SIGHUP・出力先の切断では、検査用のサーバーを止めて、`dist/` を通常のビルドに戻す。
SIGKILL や電源断のようにプロセスがその場で止まると、後始末は走らず、`dist/` に検査用のビルドが残ることがある。そのときと、戻せなかったと表示されたときは、`npm run build` を実行する。
検査用のサーバーも、公開ゲートが自分で立てて、終わりに止める。ポートはOSが空きを選び、公開ゲートはそのサーバーの出力から読むので、ほかのサーバーは拾わない。
判定を変える環境変数 `PUBLISH_CHECK_DAY` は、GitHub Actions では例外で止まる。CIのビルドで下書きが公開されることはない。
契約の一覧と足し方は [公開の契約](../.kiro/steering/publish-contract.md) にある。

## ブラウザテストが失敗したら資料を開く

GitHub Actionsの該当実行で、Artifactsの `browser-failure-1`〜`browser-failure-4` を取得する。
失敗した分割のHTMLレポート、失敗時のスクリーンショット、トレースを7日間保存する。
ブラウザ起動前に失敗した場合など、資料が生成されないケースはジョブログを確認する。

```bash
npx playwright show-report path/to/playwright-report
npx playwright show-trace path/to/test-results/test-name/trace.zip
```

失敗原因を直したら、対象テストを確認してpushし、新しいコミットのCI結果を待つ。
古いコミットの成功や、未実施の検査をマージの根拠にしない。

## 目視・実操作で確認する項目

- 画像・動画・PDFの映り込みとメタデータ、第三者素材の権利・ライセンス。
- README・meta.json・投稿文の機能、数字、日付、URL、本人の体験と記録の一致。
- 変更した画面のスマホ表示・主要操作・音。UIやゲームの改修ではハーネスの視覚・体験評価。
- 本番デプロイ後のURL応答と主要操作。SNS公開時のアカウント・添付・最終プレビュー。

自動テストの成功は、これらの確認を済ませた証拠にはならない。
未確認・問題が残る場合はPR本文に記載し、公開前チェックの方針に従って対応する。
