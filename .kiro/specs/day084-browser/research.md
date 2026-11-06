# 技術調査と判断

## 既存仕様
既存airpresenterはNode/LibreOffice/Poppler＋SSEのLAN版。既存day084-airpresenterの公開仕様はZIP配布だけ。今回の本人指示で公開面をオンラインアプリへ変更する。
UI・採用/取消・全画面の重なり修正は継承し、私的原本・3084は変更しない。

## 選定
- PPTXのブラウザ独自描画は以前の崩れを再発させるため採らない。既存要件のPDF代替を標準にする。
- PDF.js6.5.438のlegacy main/workerを同梱する。Apache2.0。qrcode-generator2.0.4はMIT。
- Cloudflare SQLite DOはFree plan対応。既存認証で事業用アカウント・Worker書込/route権限を確認。新たな有料プランを有効化しない。
- assets.base_pathはWrangler4.148以降。既存Wrangler4.157.0を再利用し、Day84だけをrouteにする。
- WebRTCはネットワークのNAT/ICEに依存するため今回採らない。WebSocket中継とWebCrypto AES-GCMで接続の安定性と内容の非保存を両立する。
- 元PDFはPC内だけ。現在ページの縮小画像/カンペはブラウザで暗号化。鍵をfragmentのみで渡し、中継は平文を知らない。

## 根拠
- https://mozilla.github.io/pdf.js/getting_started/
- https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- https://developers.cloudflare.com/workers/static-assets/routing/advanced/serving-a-subdirectory/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

## スキルと設計の収束
cc-sdd/kiro-spec-design、Cloudflare/durable-objects、共通ハーネスを適用。Browser APIは既存UIのAPI形だけを継承し、不要なDB・外部変換・ファイル保存を作らない。
Safariはlegacy版でも完全対応を断言しない。日本語PDFと実ブラウザの描画で確認する。

## 現行PDF.jsの試作確認
6.5.438のlegacy main/worker、disableWorkerRendering:true・enableXfa:false、page.render({canvas,viewport})、loadingTask.destroy()で実行した。削除済みisEvalSupported/pdf.destroyは使わない。
予定CSP下のChromeで自作の日本語PDF3ページを描画し、テキスト取得・背景/配置・PNG実見を確認。pageerror0、CSP違反0。証拠は.cache/day084-pdf-probe/。
同梱のCMaps/標準書体/Wasm/ICCは個別LICENSEを保持する。qrcode-generatorのnpm配布にLICENSEファイルはなく、実コードの著作権/MITヘッダーとMIT本文を同梱する。
