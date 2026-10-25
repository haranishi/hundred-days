# Day076 へんかんデスク：設計

## 方針

既存React/Vite/TypeScriptアプリをday-076-henkan-desk/sourceへ移し、公開は静的生成物を配る。
VITE_CLIENT_ONLY=trueだけがOffice3操作を除外する。ローカル版の既存機能と専用サーバーは残す。
公開24ツールの内訳は画像1・PDF9・データ14。アプリの主要導線は入力→設定→変換→保存で統一する。

## 境界

- source/：変換・元の単体/ブラウザ検証・固定依存・リリースscript。
- Day直下：生成済みindex/assets/pdf-assets/licenses、共通share、meta・説明・法的表示。
- scripts/build.mjs：Day限定CSP、全体の一覧とヘッダー。source配信除外はdist-filesへ登録。
- docs/day076/verification/：法的資料、実測と独立レビュー。個人設定は含めない。
- .kiro/specs/day-076-henkan-desk/：今回の統合仕様。既存の変換処理はsourceのコード/契約/検証を継承する。

## UX

戦略：ファイルが提出形式に合わない場面を、登録や送信なしで解決する。
要件：対応形式・上限・端末内処理・失敗理由を示し、利用できる操作だけを選べる。
構造：画像/PDF/データの3カテゴリ、操作選択、入力、設定、結果、法的表示と共通共有。
骨格：PCは入力/設定の2列、スマートフォンは入力→設定→結果の縦配置。
表層：元の白・紺・青の画面を維持し、共通shareと法的リンクを下部へ整える。

## URLと資源

baseは/day-076-henkan-desk/、canonicalは同パスの本番URL。PDF資材もBASE_URL基準。公開PDF描画はuseSystemFonts:falseで同梱のOFLフォントを使う。
共通shareはReactの外に1個だけ据え、アプリのURLだけを共有する。
CSPはDay076のみWASMコンパイル、同一オリジンWorker、PDFフォントのdata/blobを必要な範囲で許す。
JSのevalと任意の外部通信は許さない。公開物にOffice API呼出の導線を作らない。

## 法的表示

legal.htmlに権利・プライバシー・限界・問い合わせを分けて書く。全部免責や0円賠償上限を作らない。
入力の端末内処理とCloudflare配信アクセス情報を区別する。公開Issueへ個人ファイルを添付しないと案内する。
依存の個別LICENSEを公開し、OFLフォントの原本・版・SHA256と由来を保持する。
PDF.jsの版固定補正は生成bundleにも変更告知を残す。

## 要件対応

| 要件 | 実装・証拠 |
|---|---|
| 1.1, 1.2, 1.3, 1.4 | sourceのcatalog/App/変換機能・既存unit・Day076 E2E |
| 2.1, 2.2, 2.3, 2.4 | legal.html・licenses・法的確認記録・配布物検査 |
| 3.1, 3.2, 3.3 | meta・共通share・release script・build/CSP・配信除外 |
| 4.1, 4.2, 4.3 | source検証・precheck/check/publish:check・独立レビュー・CI・本番確認 |
