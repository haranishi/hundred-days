# Day076 統合・検証記録

2026-10-25。最新mainから分離したworktreeで、既存変換アプリを100日チャレンジへ統合した。
公開版は画像1・PDF9・データ14の24ツール。Office3操作は元のローカル版へ残した。

## ローカル検証

| 対象 | 結果 |
|---|---|
| 公開前チェック | 個人NGワード/秘密値/ローカルパス/著者確認PASS |
| 共通JavaScript構文 | PASS |
| 共通単体 | 4,905成功、1件skip、失敗0 |
| 全体build | 76件の一覧/共有同期、Day076配信・source除外PASS |
| source型/単体/build | PASS、単体161件（Docker専用9件は既定skip） |
| 静的サブパスE2E | Chromium/WebKit合計54件PASS、画像/PDF/データの実保存 |
| OFLフォント修正後PDF | 両ブラウザ14件PASS、配布TTFのGET200とPage1描画を実見 |
| Day076実CSP E2E | 最終bundleで8件PASS、WebP/PDF/データ/失敗復帰/法的表示/3幅 |
| 公開ゲート | npm run publish:check -- --day 76、302件PASS、静的契約・build・復元もPASS |
| 独立コード | PASS。公開差分・権利表示・配信除外・生成物/フォントSHAを確認 |
| 独立UI/体験 | 19/20・20/20、0点なし。390/768/1440pxで実見と保存 |

公開前チェックの著者確認はnoreply設定をプロセスへ指定して行い、個人設定を変更しない。
共通単体はGitの上書き設定を持たない通常環境で実行し、著者検査自身の回帰も成功した。
フォント変更後は、公開CSPの画像化と配布TTFの実取得を両ブラウザで確認した。

## 権利・プライバシー

[法的確認](legal-review.md)に公式法令・Cloudflare/GitHub規約・依存許諾と対応を記録した。
旧GPLのLiberationフォントを配布せず、公式未改変OFL1.1の2.1.5へ差し替えた。
著作権/利用条件、配信アクセス情報、原本/結果の確認、免責の限界、公開問い合わせを表示した。
入力由来のPOST/外部GET/API呼出は0。共通共有へ渡るのはアプリ紹介と公開URLだけ。
新規PNG9枚は埋込メタデータなし。画像の内容も実見し、通知/タブ/パス/個人資料を含めない。
OGPは24ツール版の実画面へ更新し、旧Office対応の誤表示を除いた。

## 証拠

- [独立UI/体験評価](ui/review.json)と同フォルダの自作入力によるPNG。
- tests/e2e/day-076.spec.mjs：本番CSPを実付与し、実体・内容・共有しない入力を検査。
- source/tests：変換core、上限、取消、HTML安全化、PDFページ順等の既存検証。
- source/vendor/liberation-fonts/provenance.md：公式版・各SHA・未改変・許諾の記録。
- .cache/evidence/：precheck/共通単体/build/Day076E2E/公開ゲートのローカル出力（非配信）。

## PR・マージ後

最新PR headの共通CIとsource再生成CIを確認してからmainへマージする。
デプロイ後に本番URL・ヘッダー・主要変換/保存・利用説明とライセンスへの導線を確認する。
実Safari/iOS機器の保存・メモリと、全法域/個別ファイルの権利までは確認していない。
