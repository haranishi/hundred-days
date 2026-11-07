# PowerPoint直接読込の調査

## 結論と区別
採用候補は公式ZetaOffice Qt/WASMを変換用フレームで実行し、生成PDFを既存PDF.jsへ渡す方式。
以下は一次資料の確認とローカル試作の結果。公開配信と実機での確認は別ゲートとする。

## 元の仕様との関係
初期仕様はPDF/PPTX/PPT直接選択、私的資料の外部送信なし、原本の背景/フォント/XMLを書き換えない方針。
Web版のPDF限定は継承漏れであり、本人指示で修正する。PowerPoint本体の遠隔操作と完全一致は対象外。

## 一次資料
- [matbee v2.7.2](https://github.com/matbeedotcom/libreoffice-document-converter/tree/v2.7.2)：MPL-2.0、PPTX/PPT→PDF、browser.worker.global.jsを明示指定。
- [ブラウザ実装](https://github.com/matbeedotcom/libreoffice-document-converter/blob/v2.7.2/src/browser.ts)：AbortSignalなし。destroyは応答待ちのため、中断はアプリがWorkerを所有してterminateする。
- [Worker実装](https://github.com/matbeedotcom/libreoffice-document-converter/blob/v2.7.2/src/browser.worker.ts)：fontsを初期化前に渡せる。進捗率は実取得量と区別する。
- [エンジン](https://github.com/matbeedotcom/libreoffice-document-converter/blob/v2.7.2/wasm/soffice.js)：初期共有メモリ1GiB。Functionコンストラクターを間接呼出しするためWorker専用unsafe-evalが必要。
- [WorkerのCSP](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#content_security_policy)：URL Workerは自身の応答CSPを使う。mainの制限は緩めない。
- [Cloudflare上限](https://developers.cloudflare.com/workers/platform/limits/)：Static Assetsの1ファイル25MiBに合わせる。
- [Noto CJK固定版](https://github.com/notofonts/noto-cjk/tree/f8d157532fbfaeda587e826d4cd5b21a49186f7c)：JP Regular/Bold、OFL1.1。
- [LibreOfficeソース](https://github.com/LibreOffice/core/tree/d1c9e0e4e1ddeb24fe8f93e56860b3765043f8b1)：配布dataのversionrcに埋め込まれたBuildIdと一致。
- [LibreOfficeライセンス](https://www.libreoffice.org/licenses/)とmatbeeのbuild/patchesを再配布案内に含める。ビルド自体の再現は未実施。

## 配布サイズと方式
npm固定版のintegrityを照合した。WASM147,416,331B、data99,735,918B。
そのままではCF上限を超えるため、build時にgzip圧縮して20MiB以下に分割する。
専用のGET経路が順番にストリーム結合し、Content-Encoding:gzipを返す。資料はこの経路に送らない。
この結合方式は設計案であり、実runtime/本番での確認を実装タスクに含める。

## 試作の観察
- Chromeで自作3ページPPTXをブラウザ内でPDFへ変換できた。ローカルの初期化/変換は約1秒。ネット初回取得速度の測定ではない。
- CJKフォントなしでは日本語が四角になった。PDFのActualText抽出は正常でも描画成功を意味しない。
- JP Regular/Boldを初期化前に注入し、実画像と埋込フォント名で日本語・太字の描画を確認した。
- 既存mainと同じCSPではFunction評価が失敗した。隔離した試作のみでevalを許可して原因を確認し、本番mainは未変更。
- 指定資料は29ページの読込/計数に成功したが、PDF exportは180秒で停止、LOK paintTileも最初の1枚で停止した。公開成功とは扱わず、別の処理系を調査する。私的画像は公開しない。

## 公式Qt版の追加検証
- 公式配布のZetaOffice24.2.8.0.beta1、BuildId efaf0670b4d055f838a2849becb10f08aa06a257を取得しSHA256を記録した。ZetaJS1.2.0固定commit57360bcb0e7726ffa0e66567c8041261b959f8ddと組み合わせる。
- [公式起動仕様](https://github.com/allotropia/zetajs/blob/57360bcb0e7726ffa0e66567c8041261b959f8dd/docs/start.md)に沿って非表示Qt canvasとUNOを使う。
- preRunでフォント用ディレクトリ作成後にNoto JPを注入した。自作画像入り3枚は約0.48秒、指定実資料29枚は約6.45秒でPDF変換完了。初回ネット取得時間は含まない。
- 29枚すべてを画像にし、日本語・白/色背景・図・順序を目視確認した。元ファイル同梱の表紙thumbnailは白紙のため、PowerPoint本体との厳密な画像一致は証明していない。
- 公式版はwindow内のQt loaderが必要で、専用フレームのCSPだけにevalを許可する。same-originフレームを別originの安全境界とは主張しない。

- 任意PCフォント相当の試作も29枚/約6.61秒で完了。元MacのYuGothic Medium/Boldを注入し、同じ書体名だけを対応付け、PDFのYuGo-Medium/YuGo-Bold埋込を確認した。実ブラウザのFont Access許可は実装で検証する。

## 不採用候補と理由
- Office Online埋込は原本の公開URL、Graph変換はアカウント/外部転送を必要とするため今回の通常経路に採用しない。
- Skitionek/serverless-office-converterは小さいが、調査時mainにwrapperのLICENSEがなく、修正PR11は未マージ。CJKも省略されているため同梱しない。
- PPTXを独自HTMLへ再構成する方式は背景・図形・フォントの再現を自作する必要があるため採用しない。

## 使用した補助手順
cc-sddの要件→設計→タスク→実装→検証を維持する。prototypeは本番経路と分離した実変換実験、source-driven-developmentは固定版の現物/API確認に使用した。

## 公開時の途中切れ（Task5.2）
PR209の全必須CI成功/マージ後の実公開で、WASMがHTTP200/loadingFinishedでもraw120,503,064B等に欠ける例を実Chromeで捕捉した。期待raw161,667,499B。
標準/PC書体や旧Worker終了待ちに依存せず、curl/単独ブラウザーの取得は固定SHAと一致する場合もある。直接原因は間欠的な配信欠損。CPU/通信層の根因は未確定。
Cloudflareは通常ReadableStreamの手動Content-Lengthを無視する。FixedLengthStreamとnative pipeToへ変更し、wire長の実保証とJS chunk処理の削減を行う。
一次資料：[Response](https://developers.cloudflare.com/workers/runtime-apis/response/)、[FixedLengthStream](https://developers.cloudflare.com/workers/runtime-apis/streams/transformstream/)。
証拠：非配信.cache/day084-post-release-review/、day084-native-fonts-desktop-debug.log、day084-public-asset-audit.log。公開確認が終わるまで新機能のリリース完了とはしない。
