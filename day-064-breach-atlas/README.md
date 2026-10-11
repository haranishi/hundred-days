# Day64 漏洩の地図

日本の公表・報道 **4,652記録** と米国政府の公開台帳13,349記録、計 **18,001記録（2000–2026年）** を、年代・原因・同じ単位の規模から探索するWebアプリ。国内は201件から約23.1倍へ拡充し、外部侵入1,622件・ランサムウェア280件を含みます。検索・集計・ソートをRust/WebAssemblyのWorkerで処理します。[公開アプリ](https://hundred-days.pages.dev/day-064-breach-atlas/)で利用できます。

「過去の記録から、これからの備えへ」を目的に、個人の公表内容の確認と、小規模組織・授業の予防学習の入口を目指します。画面を明るくし、主な入口を「地図で見る・一覧で読む・備えを学ぶ」に整理しました。暗い地球儀は地図の中に残し、検索・一覧・詳細と連動します。詳しい条件と補足は必要なときに開けます。

全記録を92の国・地域へ集約します。国内は組織名に都道府県が一意に明記された2,351記録を都道府県へ、残る2,301記録を「日本・地域未特定」へ表示。HHSは報告組織の州、Californiaは通知対象の州です。位置はNatural Earthの地域代表点で、実際の事故・攻撃元・サーバーを示すものではありません。静的な公表記録の地図です。

## 探索の流れ

企業・所管課の名前を検索し、地図または一覧で記録を選びます。詳細で公表規模・日付・原資料を確認でき、原因に応じて「備えを学ぶ」へ進めます。

原因マップはタブを開いたときに読み込み、最新120記録までを描画します。選択中の古い記録は120件の枠内に含めます。全ての記録は時系列・検索・ページ送りで探索できます。全単位・規模不明の球は同じ大きさです。同じ数値単位の球は対数尺度で、直径・面積は数値比そのものではありません。線は共通の原因を示します。

3Dはドラッグ、ホイール・ピンチ、矢印キー、+/−で操作できます。WebGL不可・操作中の描画喪失ではSVGへ復帰し、選択・ノート・フォーカスを保ちます。2Dもドラッグ・拡大縮小・キーボードで操作できます。

## 収録範囲

自治体資料は2026-10-12に追加確認しました。既存の国内公表・米国台帳は2026-10-11取得の静的なスナップショットです。自動更新はしません。

| 資料 | 原資料の行数 | 収録 | 整理した行 |
|---|---:|---:|---:|
| 日本の企業発表・PPC年度事案表・IPA白書等 | 個別資料の取込記録を参照 | 201 | 国内の同一事故の重複・匿名等を整理 |
| 国内インシデント公表アーカイブ | 2,173 | 1,504 | 同一発表・明示された続報576、既存27、除外66 |
| 国内の事例索引・2020年代 | 664 | 569 | 重複74、既存14、除外7 |
| 国内の事例索引・2010年代 | 204 | 173 | 既存22、除外9 |
| 国内の事例索引・2000年代 | 81 | 75 | 重複1、既存1、除外4 |
| 横浜市の公式一括公表66資料（2021年4月–2026年9月） | 2,805 | 2,039 | 個人情報の対象なし等766 |
| さいたま市の公式一括公表29資料（2024年5月–2026年9月） | 344 | 91 | 個人情報の対象なし等253 |
| カリフォルニア州司法長官の通知台帳CSV | 5,350 | 5,336 | 全列一致の重複12、通知元空欄2 |
| HHS OCR・調査中のHIPAA届出CSV | 754 | 752 | 全列一致の重複2 |
| HHS OCR・アーカイブCSV | 7,261 | 7,261 | 0 |
| 合計 | — | **18,001** | 別の日付・団体・台帳の同じ事故は残り得る |

海外分は、事故そのものに加え、組織の通知・当局への届出という掲載記録です。同じ事故の委託元・委託先、複数当局への届出が含まれ得るため、独立した事故数・被害総人数として合算しません。CA台帳の通知元が事故主体と同じとは限らず、人数・原因は未記載のまま残しています。HHSの人数は組織の報告値です。調査中・アーカイブを流出人数や法令違反の確定と同一視しません。

国内の年度表は資料の規模・所管・主な事例という選定条件があります。日本や世界の過去の全事故を保証する台帳ではありません。収録資料・全行の取込/重複/除外理由は画面の「収録範囲・資料」と `data/coverage.json` で確認できます。

国内の追加2,321記録は、公表文の公開アーカイブ1,504記録と事例索引817記録から収録。代表例の原発表を確認し、うち1記録を公式発表に基づく確認状態へ更新しました。他の追加記録は「公表・報道記録」として表示し、人数・情報流出の有無を推定しません。報道一覧の記載日は公表日・発生日・報道日が混在します。同一URL・同じ組織の明示された事案ID・続報への参照・同じ日付を整理していますが、残る別公表を独立した事故数へ置き換えません。100倍の20,100件には達していません。取込と検証の詳細は [国内拡充の報告](../docs/day064/verification/JAPAN_EXPANSION_REPORT.md) を参照してください。

今回の追加は自治体の公式表に掲載された2,130記録（横浜市2,039・さいたま市91）です。所管課・掲載番号・本アプリの整理区分と、資料掲載ページまたはPDFのページ番号を保持しています。主に紛失・誤送付等で、外部侵入・ランサムウェアの追加ではありません。公表人数には漏えいのおそれがある対象も含まれ、報告を受けた日・覚知日を公表日とは区別します。全自治体・全期間の事故一覧ではなく、別資料で公表された同じ事故も残り得ます。検証は [自治体資料追加の報告](../docs/day064/verification/ADDITIONAL_JAPAN_DATA_REPORT.md) を参照してください。

## Rustと軽量化

Rustの検索エンジンは外部Cargo依存なし。ブラウザ向けにコンパイルしたWasmをWorkerで実行し、全件検索・条件別件数・年代/原因/単位の集計・並べ替えを担います。HTML/CSSとDOM操作はブラウザ側のJavaScriptです。Wasm不可時は同じWorker内の代替処理、Worker不可時はページ内処理で閲覧できます。

初期表示は全件の軽い索引と1ページ24件。詳細は100件ずつの181ファイルから必要時だけ読み込みます。地球儀は全ての検索結果を地域でまとめて描画し、操作がない時は描画を続けません。地域絞り込みもRustで処理し、Workerには地域コードだけを含めます。3Dコードは地図を開く時に取得します。全件JSONはgzipで約2.54MBへ圧縮したダウンロード用です。初期表示では取得せず、Cloudflare Pagesの1ファイル上限内で全件を提供します。

地球儀の設計・地理対応・実画面・操作・ビルドの確認は [地球儀の検証記録](../docs/day064/verification/GLOBE_REPORT.md) にあります。国内拡充時点の記録は [国内拡充の検証記録](../docs/day064/verification/JAPAN_EXPANSION_REPORT.md) を参照してください。

新UIの参照メモ・改善点・実画面・検査結果は [UI改善の検証記録](../docs/day064/verification/READABLE_UI_REPORT.md) を参照してください。

## データ・通信・再生成

検索語は端末内で処理し、URL・解析サービスへ送信しません。本アプリは閲覧履歴を記録せず、解析・広告機能を設けていません。ページ・データの読み込みはCloudflare Pagesへ通信し、IPアドレス等のアクセス情報を同サービスが処理し得ます（[Cloudflareのプライバシー方針](https://www.cloudflare.com/privacypolicy/)）。共有IDを含むURLもページアクセス時に配信先へ渡ります。外部フォント・解析・広告はありません。原資料へのリンクは利用者が押したときだけ外部へ開きます。共有リンクは公開記録のIDだけです。共有/クリップボードが使えない場合はリンクのダイアログを表示します。被害者の個人情報の原データ、通知文PDFやHHSの長文説明は配布しません。通知元の名称には、公表台帳にある医療の個人事業所等の原表記も含まれます。利用目的は公表内容の確認と情報セキュリティの学習です。

データの入力は `docs/day064/research/`。政府資料の取得・取込は `source/tools/read-ppc-history.py` / `import-ppc-history.py`、IPAは `read-ipa-history.py` / `import-ipa-history.py`、米国の公開CSVは `read-public-registers.py` / `import-public-registers.py`。取得CSVの行数とSHA-256を保存しています。`assemble-data.mjs` が全件JSON・索引・分割詳細・取込記録を生成します。データ更新時は確認日と一次資料を再確認してください。

国内の公表・報道の追加は `source/tools/import-japan-notices.py --input-dir <取得ファイルの保管先>`。固定コミットのZIPと事例索引3ページを読み、`japan-notices.json`・全行の取込台帳・取得マニフェストを生成します。取得URLと各入力のSHA-256は `japan-notice-manifest.json`、代表例の原発表の照合結果は `japan-notice-reviews.json` に保持します。次に `npm run data` で再生成します。

自治体の取得は `python3 source/tools/read-municipal-notices.py --output <外部SSDの取得先> --as-of 2026-10-12`、取込は `python3 source/tools/import-municipal-notices.py --input-dir <取得先>`（PyMuPDFが必要）です。原資料の全表・表紙の行数を照合し、`municipal-notices.json`、全行の取込台帳、取得マニフェストを生成します。資料で年が省略された報告日は、公表年と月の前後関係から年を補っています。人数不明を補いません。次に `npm run data` で索引と詳細を再生成します。

## 権利確認と映像

公開前に、[規約・著作権・法令の確認記録](../docs/day064/verification/LEGAL_RELEASE_REVIEW.md)で配布実体と公式の利用条件を照合しました。原文・ロゴ・第三者の画像や音源を再配布せず、各記録へ出典を表示します。自治体の件名は独自の共通分類へ整理し、連絡先番号を含めません。資料の権利は元の提供者に帰属します。訂正は[リポジトリのIssues](https://github.com/haranishi/hundred-days/issues)へ、記録IDと原資料を添えてお知らせください。被害者の個人情報は投稿しないでください。

[32秒のプロモーション動画の再生成と使用素材](tools/promo/README.md)。実画面から地図・日本の記録・原資料・備えの学習を紹介し、字幕と独自の合成BGMを加えています。

## ローカル起動と検証

Rust（edition 2024対応）と `wasm32-unknown-unknown` ターゲットを準備し、次を実行します。

```sh
cd day-064-breach-atlas/source
npm install --no-audit --no-fund
npm run data
npm run rust:build
npm run dev
```

URL: http://127.0.0.1:5464/day-064-breach-atlas/

```sh
# source/ でRust・データ・実Wasmの検査、ビルド、ローカル配信物の生成
npm run rust:test
python3 -m unittest discover -s tests -p '*_test.py'
npm run release
node tools/benchmark.mjs

# リポジトリ直下で実ブラウザ検査とサイト全体のビルド
npx playwright test --config tests/e2e/day-064.config.mjs --project=checks
npm run build
```

今回変更した学習・読解・スマホの体験検査は `DAY064_BROWSER_REPORT=purpose-experience-results.json npx playwright test --config tests/e2e/day-064.config.mjs --project=experience --grep 'public-interest reading'`。8場面の実操作を記録します。

地球儀の体験検査は `DAY064_BROWSER_REPORT=experience-results.json npx playwright test --config tests/e2e/day-064.config.mjs --project=experience --grep 'globe exploration'`。約5分・10場面の実Chromium操作を記録します。各場面の画像とノートを主担当が確認する自己点検で、人によるユーザーテストとは区別しています。通常検査は既存機能・地球儀・学習・自治体資料と整理したUIの32項目。390/768/1440/1920px、375px・横向き、1024px、キーボード、動きを減らす設定、WebGL喪失、Wasm/Worker/詳細/地形取得の失敗復帰も確認します。`DAY064_EVIDENCE_DIR=additional-japan` を指定すると今回の検証先へ保存します。Rustのビルドは `CARGO_TARGET_DIR` で外部SSDの出力先を指定できます。OGPのSVGはビルド時に生成、PNGはブラウザ検査で撮影します。

ルートビルドはdraftのDay64を公開物から除外します。commit・push・公開は本人の明示指示の範囲で行い、公開時にはプロジェクトのprecheckとファイルレビューが必要です。

地理データを再生成する場合は、`docs/day064/research/geo-manifest.json` の固定入力3ファイルを同じディレクトリに取得し、`source/` で `node tools/prepare-geography.mjs --input-dir <取得先>`、`npm run data`、`npm run release` を実行します。公開地図APIや外部ジオコーディングは使いません。

## ライセンス

ブラウザの独自コード・Rust検索コードはリポジトリのMIT。`source/tools/read-ipa-history.py`、`read-ppc-history.py`、`import-municipal-notices.py` と、それを読み込む `source/tests/municipal_notices_test.py` は AGPL-3.0-or-later です。PDF抽出に使う [PyMuPDF 1.27.2.3のライセンス](https://pymupdf.readthedocs.io/en/latest/about.html#license-and-copyright) に合わせ、[許諾全文](source/tools/LICENSE-AGPL-3.0.txt) と対応ソースを公開します。再取得用ツールには別途 `PyMuPDF==1.27.2.3` と `certifi` が必要です。PyMuPDF・MuPDF本体やPythonサービスはWebアプリへ同梱しません。プログラムのライセンスと原資料・事実データの権利は別に扱います。

地形・国と地域の代表点はNatural Earthのパブリックドメインデータ。固定コミット・入力のSHA-256と画面のクレジットを保持しています。Kasperskyの地図は見た目の参考で、同サイトのコード・画像・ブランド・検知データは使いません。

Three.js・OrbitControls、Vite/Rolldownの実行時補助、Rust標準ライブラリ・アロケータ等の著作権表示と許諾を `licenses/` に同梱しています。公的台帳は事実メタデータを抽出・加工し、政府が作成・推奨したアプリと誤認させない形で出典を表示します。詳細は [第三者表記](../THIRD_PARTY_NOTICES.md) を参照してください。
