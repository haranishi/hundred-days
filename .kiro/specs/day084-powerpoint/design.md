# PowerPoint直接読込の設計案

## 境界とUX
PCでPPTX/PPTを選ぶ→初回準備→ローカル変換→全ページ確認→採用→既存QRリモコン。
戦略は手動PDF作成を省くこと。要件は直接選択と原本保持、構造は既存の採用/取消、骨格は段階/経過時間/中断、表層は既存の操作サイズと状態表示を継承する。
本仕様は形式判定、変換用フレームとWorker、固定版エンジンの公開配信、案内を所有する。暗号・部屋・コマンド形式は変更しない。
私的な元資料、元ローカルアプリ、他Day、認証設定、PowerPoint本体の遠隔操作は境界外。

## 依存と採否
ZetaOffice24.2.8.0.beta1（efaf0670b4d055f838a2849becb10f08aa06a257）の未改変公式Qt/WASMとZetaJS1.2.0を自己配信する。PDF.js6.5.438を再利用する。
matbee2.7.2のheadless版は実資料29枚でPDF/SVG/paintTileが停止したため採用しない。公式Qt版の同資料PDF変換はローカルで約6.5秒、29枚完了を確認した。
Noto Sans CJK JP Regular/BoldのOFL固定版を注入する。原本のフォント指定・背景・XMLを変更しない。
不足フォントは通常フォールバックになるため、見た目差異と静止画化を事前に説明して全ページを確認させる。

## ファイル計画
| 境界 | ファイル | 責任 |
|---|---|---|
| Import | presentation-import.js、powerpoint-import.js | 形式ルーティング、フレーム所有、期限/取消、生成PDF検証 |
| Engine | office/engine.html、engine.js、engine-thread.js | 非表示Qt canvas、公開資産/フォント、UNO、ブラウザ内のMessagePort転送 |
| Fonts | local-fonts.js | 明示操作でPCフォントを取得、既知の同じ書体の名前を対応付け、メモリ保持のみ |
| Browser | browser-api.js、pdf-import.js | importer接続、旧資料保持、生成PDFの既存描画/資源解放 |
| UI | app.js、index.html | 対応形式、段階/経過時間、中断、全ページ確認、静止画/フォントの説明 |
| Assets | web/build-office.mjs、office-sources.json、licenses/office/ | 固定取得/ハッシュ、圧縮分割、manifest、実ソース/ライセンス表記 |
| Delivery | web/office-assets.mjs、worker.mjs、policy.mjs、wrangler.jsonc | 公開GETのstream配信、変換文書用CSP、COEP |
| Integration | web/build.mjs、README、meta、THIRD_PARTY_NOTICES、.gitignore | 配信/説明、巨大資産と私的資料のGit除外 |
| Verification | web/powerpoint.test.mjs、web/e2e.mjs、tests/e2e/day084.spec.mjs | 実エンジン/既存アプリ/2ブラウザ回帰 |
全てday-084-airpresenter/からの相対パス。元資料の複製・新規共通utility・他Day依存を作らない。

## Import契約
importPresentation(file,{signal,onProgress})はPDFを既存importPdfへ、pptx/pptを専用処理へ渡す。
入力はBlobかつ拡張子PDF/PPTX/PPT、空を拒否、25MiB以下。偽装/破損は変換エンジンまたはPDF.jsで失敗させる。
PowerPointの1ジョブにつき非表示の同一originフレームを所有し、初期化180秒/変換120秒、終了/取消/失敗でフレームとそのWorkerを破棄する。
フレームのsandboxはallow-scriptsとallow-same-originだけ。共有メモリ/Qtのため同一originを使うので、別originのセキュリティ隔離とは主張しない。
フレームに渡すのは原本bytes・固定拡張子・任意のPCフォントだけ。元ファイル名・接続鍵・カンペ・room URLは渡さない。
初期化後に実ページ数を取得し、1〜100ページのみPDFへ変換する。ページ数取得の読込も120秒枠に含める。生成PDFは64MiB以下。
生成PDFを内部FileでPDF.jsへ渡す。内部生成だけ最大入力64MiBを許可し、利用者の原本25MiB制限と分ける。PNGは長辺1920px/合計120MiB以下を維持する。
変換用フレームはPDF転送後に破棄する。既存deckの採用/取消/暗号化プレビューを再利用し、取消後の遅延結果を候補に採用しない。
固定公開エンジンのみHTTPキャッシュし、原本/生成PDF/フォント/ページはブラウザメモリだけで扱う。

## フレーム/UNO契約
親はiframe.onload後にMessageChannelを渡す。双方でevent.originとevent.sourceを照合し、1ジョブ1port、既知typeとサイズのみを許可する。
engine.jsは公開日本語フォントを取得し、Module.preRunでmkdirTree→FS.writeFileする。Qt canvasは非表示、uno_scriptsに固定zeta.jsとengine-thread.jsだけを指定する。
Module.uno_mainとスレッドのreadyを待って親へreadyを返す。要求はconvert、応答はprogress/count/result/errorのみ。raw SDKのloaded(idなし)に依存しない。
親からの原本を/tmp/input.pptxまたはinput.ppt、出力を/tmp/output.pdfに固定する。受信データから任意パスやURLを作らない。
UNOはHidden/ReadOnly、MacroExecutionMode=NEVER_EXECUTE、UpdateDocMode=NO_UPDATEで開き、getDrawPages().getCount()を返す。
100ページ超はstoreToURL前に拒否する。impress_pdf_ExportでPDFを生成し、doc.closeとFS.unlink後にArrayBufferをportで親へtransferする。
engine内のprint/console/例外は内容をログへ出さず、親への失敗は一般向けメッセージにする。外部画像/リンク更新とマクロを実行しない。
親はport/messageerror/初期化失敗/timeoutで保留をrejectして破棄する。中断は処理側の応答を待たない。

## PCフォント
UIの任意ボタンだけがqueryLocalFontsを呼ぶ。未許可/未対応は標準のNoto JPへ戻せる。
対象はYuGothic/YuMincho/MS Gothic/MS PGothic/Meiryo/Calibri/Arial/Times New Roman等の既知英日family。最大32face/合計64MiB、個別25MiBまで。
元のfont bytesを変更せず、WASMの使い捨てFSへ注入する。游ゴシック/游ゴシック Bold→取得できたYuGothicのように同じ書体の名前だけをfontconfigで対応付ける。
フォントを公開アセット/キャッシュ/ログ/スマホへ含めない。メタデータはセッション終了で解放する。

## 配信契約
公開資産はvendor/office/の固定版に置く。公式CDN/固定ソースからbuild時だけ取得しraw SHA256を照合する。ブラウザは同一originだけに接続する。
WASM/dataは公式のBrotliを保ち、フォントはgzipで圧縮し、全partを20MiB以下にする。manifestは登録した資産名/MIME/encoding/partsのみ。
仮想資産GETはmanifestの許可名だけを選び、ASSETSのpartを順にstream結合する。全体のarrayBuffer結合はしない。
Content-Encoding、適切なMIME、版付きcache-control、encodeBody:manualを指定する。HEADはbodyなし、他method/不正パス/欠損partは拒否する。
streamはbackpressureを守り、ブラウザ取消時に実行中のpart readerをcancelする。ブラウザが通常の圧縮展開とWASM streaming compileを行う。
run_worker_firstは同Dayのoffice/*とvendor/office/*だけを追加する。既存API/他Dayの経路を変更しない。
変換HTML/JSの応答CSPはscript-src self unsafe-eval wasm-unsafe-eval、connect-src self、worker-src self blob:、frame-ancestors self。object/formは禁止する。
mainのJS unsafe-eval/inline禁止は維持する。全Day84にCOOP same-originとCOEP require-corpを適用して共有メモリを許可する。
スマホremoteはimporterを実行せず、変換フレーム/エンジン/フォントを取得しない。
エンジン全体をMITやMPLだけとは表示せず、ZetaJS MIT、LO/Qt/ビルド依存のライセンス全文・固定ソース・未改変バイナリの出所を同梱する。

## UI/検証
PDF/PowerPoint対応を選択面、accept、サンプル、README/OGP/X文面へ反映する。初回取得→初期化→変換→描画と経過時間を表示し、未計測の率/ETAを表示しない。
中断ボタンを追加し、「現在の資料に戻る」は処理継続と明確に区別する。request期限は180+120秒の準備/処理に合わせ、利用者中断をAbortSignalへ伝える。
- 要件1/2：自作の日本語/英語/通常/太字/白/色背景/画像を含むPPTX/PPTで直接選択→全ページ確認→採用→PC/スマホ送りを確認する。
- 要件2.4/2.5/2.7：ロード/変換中断、不正/過大/100頁超、取得失敗、再選択、旧資料、remoteのengine request0、PCフォントの未許可/取得/解放を検証。
- 要件3.1/3.2：実Miniflare/Chromeで圧縮stream、フレームのみeval許可、main禁止、CSP違反0、原本の外部送信0、取消後のframe/Worker破棄を確認。
- 要件3.4：指定29枚を非公開のローカル実装で再確認。私的画像は公開せず、フォント差/未検証の実機は区別して記録する。
- 要件3.5/3.6：既存PDF/暗号/全画面/差し替え、独立レビュー、全必須CI/マージ、本番で自作PPTX/PPTの直接読込を確認。
エンジン版・フォント・配信圧縮/経路・CSP・importer・候補採用が変われば該当境界を再検証する。
