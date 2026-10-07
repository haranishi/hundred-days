# Day060「今年の受賞の解説」実施記録

目的：指定のREQUIREMENTSとCOMMENTARY_RULESに従って、最新の受賞の解説・今週の発表・既存の年齢検索をつなぐ。対象外は解説本文の事実調査と投入、README/meta更新、公開・commit・push。変更範囲はアプリ内（指定の禁止ファイルを除く）、専用E2E、この記録。最大3周。

受け入れ条件：ready・pending・facts、日本時間の先頭選択、出典の初出順採番、原文の受賞理由、期待の札、確認日と作者の注記、同梱への退避、年齢検索の維持。UX5・ユーザーストーリーはREQUIREMENTSにある設計を採用した。最新の賞を上に置き、発表一覧を1か所にまとめ、事実・期待・活動の事実を分けて描く。

## この工程で変更したファイル

- `day-060-prize-explained/index.html`、`app.js`、`app.css`
- `day-060-prize-explained/lib/render.js`、`lib/text.js`
- 新規 `day-060-prize-explained/lib/commentary.js`、`lib/commentary-check.js`、`lib/rights-check.js`
- 新規 `day-060-prize-explained/tools/check-commentary.mjs`、`data/commentary.json`
- `day-060-prize-explained/tests/index.mjs`、`tests/logic.test.mjs`、`tests/render.test.mjs`
- 新規 `day-060-prize-explained/tests/commentary.test.mjs`、`tests/commentary-check.test.mjs`、`tests/rights.test.mjs`、`tests/app.test.mjs`、`tests/fixtures/commentary-test.json`
- `tests/e2e/day-060.spec.mjs`
- `.agent-harness/runs/day060-implement.md`（旧記録を置換）

開始時からDayフォルダ移動、ルート文書・設定、meta、live.js、化学賞の実応答fixtureなどの変更があった。この工程ではそれらを変更していない。shared、README、meta.json、data/laureates.json、他のDayも変更していない。

## 実装

- 解説の純粋モデルは `ready`・`pending`・`facts`。DOM上は指定どおりfactsも `data-commentary="ready"`、`data-mode="facts"` で区別する。
- 出典はwhat→changed→expected→gapの初出順。カードごとにtoday/weekのIDを分け、番号のリンク先の重複を防ぐ。
- 確認日と今日の見出しはAsia/Tokyo。最新版は発表日の降順、同日は発表日程の後の賞。
- 解説の読み込み失敗・不正データは空の扱い。API失敗・保存なしなら同梱のawardsとorgsから発表済みを組み立てる。保存キーとAPIの2本は既存のまま。
- 旧pulse/currentを除き、header→today→week→age→footerに変更。年齢の入力IDはage-input（ageは欄のID）。年齢検索の集計・帯・ページ送りは維持し、共有の末尾だけ新しい題名に変えた。
- 事実は実線、期待は点線と文字の札。年数の図は2点・線・両端の年・中央の年数。出典番号、紹介リンク、共有、開閉は44px以上をCSSで指定。既存のライト・ダーク色と日本語の折り返しを使う。
- 今週の解説を開いた状態は、入力変更と定期再描画でも保持する。
- 検査は全エラーをパスつきで返す。60KBはファイルの実バイト数をCLIで検査。論文はDOI、公式出典はHTML紹介ページ、出典の重複・未使用・参照先も検査する。オンライン検査は --online のときのみ。データが不正なら接続せず検査エラーを返す。
- 提供元の名称禁止は本文・項目名・見出し・共有文に適用し、出典の題名・発行元は許容する。URLのホスト部分は技術的な接続先として除外する（許可された公式ページURL自体に名称が含まれるため）。URLのパス・query・hashは名称禁止の対象。この解釈はメインの確認事項。
- 実データは指定どおり空。fixtureの文章はすべてテスト用の作り話と明記し、架空の出典にした。実在の受賞者についての解説として配っていない。新しい外部素材・ライブラリ・フォントは使用していない。

## コマンドと結果

- 初回の `rg --files day-060-prize-explained shared tests/fixtures tests/e2e .agent-harness` は終了2：ルートのtests/fixturesは存在しない。アプリ内のtests/fixturesを読み直した。
- 最初の `TZ=Asia/Tokyo node --test day-060-prize-explained/tests/`：209件、成功209、失敗0。
- app.jsの実行テストを追加した直後の同コマンド：212件、成功210、失敗2。テスト用のResizeObserverをundefinedとしてもプロパティ自体が存在し、既存の存在確認を通ってしまった。テスト用のobserveを持つクラスに修正した。製品の失敗と区別する。
- 修正後の `TZ=Asia/Tokyo node --test day-060-prize-explained/tests/`：212件、成功212、失敗0、cancelled 0、skipped 0、todo 0。
- 最終の `TZ=Asia/Tokyo node --test day-060-prize-explained/tests/`：212件、成功212、失敗0、cancelled 0、skipped 0、todo 0。
- 最終の `TZ=UTC node --test day-060-prize-explained/tests/`：212件、成功212、失敗0、cancelled 0、skipped 0、todo 0。
- `node day-060-prize-explained/tools/check-commentary.mjs`：`検査: 0件、エラー: 0件`、終了0。
- `node --check` をapp.js、lib/render.js、lib/commentary.js、lib/commentary-check.js、lib/rights-check.js、tools/check-commentary.mjs、tests/e2e/day-060.spec.mjsに実行：すべて終了0、出力0件。
- `npx playwright test tests/e2e/day-060.spec.mjs --list`：`Total: 41 tests in 1 file`、終了0。
- `npm run precheck`：終了0、漏洩パターン検出なし。初回は要確認1174件（今回の合成URLにメール扱いの警告1件）。合成URLの組み立てを変更して今回の追加警告を除いた。最終は要確認1173件（既存のメール・バイナリ等）。既存の全バイナリを目視確認したという意味ではない。
- `git diff --check`：終了0、出力0件。新規・変更したファイルを全文読み、コードと指定文言・接続先・保存キーを照合した。

Nodeは既存のルートpackage.jsonにtypeが無いためMODULE_TYPELESS_PACKAGE_JSONの警告を出す。設定は変更禁止なので維持した。

## 壊して確かめた手順

- 単体：fixtureを毎回複製し、schema/year/cat/mode、配列の上下限・型、確認日の前後・不正日付、見出し61字、文・起点の出典欠落、参照先欠落、未使用・重複出典、http・不正URL、各禁止拡張子・uploads・wp-content、kind、DOI以外、gap計算、禁止語・推量・個人情報、日本語名の出典欠落、山括弧、60KB超過などを1項目ずつ壊した。必ず該当パスのエラーが出ることをassertで確認。
- 権利a〜f：E2Eも単体もlib/rights-check.jsを共用。単体ではsnapshotの題名または最初の画面に名称を足す、mediaCountを1にする、外部リクエストを足す、禁止ファイルURLを足す、作者の注記・確認日を消す、期待の札を消す、文学賞・平和賞のfactsに変化・期待・年数の見出しを足す。それぞれ該当関門のエラーになることを確認。
- E2Eにも同じ破壊を組み込んだ：title/h1の置換、videoの追加、uploadsへのaの追加、注記削除、確認日削除、期待の札削除、factsのh4追加、通信snapshotの外部URL追加。正常な画面でエラー0のあとに壊し、該当関門が落ちることを判定する。これらのブラウザ実行は未実施。
- app.js自体を最小のDOMと実応答fixtureで実行：API失敗・保存なしで同梱の先頭と解説が出ること、解説取得失敗でもAPIの受賞者と準備中が出ること、入力26/54と共有文が動くこと、外部APIが2本だけであることを確認。レイアウト・実ブラウザ操作の証拠とは区別する。

## 未実施とメインへの引き継ぎ

- 指定の環境制約に従い、サーバー起動とE2E実行はしていない。41件は発見された件数で、ブラウザでの成功件数ではない。390/768/1280の実寸、ライト・ダークの見た目、出典への実スクロール、sharedの実操作はメインで確認する。
- npm run buildは未実施。ビルドがルートdistを削除して全Dayを書き出すため、今回の変更許可パスを越える。メインでbuild・E2E・共通共有E2Eを実行する。
- --onlineは未実施。解説が空なので実出典のGETや受賞者照合を行ったという証拠は無い。メインが事実確認した解説を入れ、オンライン照合と文ごとの出典確認を行う。
- READMEとmeta.jsonは開始時の年齢検索の説明のまま。メインで題名・説明・担当・件数・日付・OG情報を更新する。古いscreenshot/demoも未変更・未レビュー。公開の判断は保留。
- UI評価のスクリーンショット・実操作・独立評価は未実施。点数は付けていない。
- commit・push・公開・SNS送信・npm installは行っていない。

## 第2弾（2026-10-07）

指定の3変更と実データの回帰検証を実装。変更は `lib/commentary-check.js`、`lib/commentary.js`、`lib/render.js`、`app.css`、`tests/commentary-check.test.mjs`、`tests/commentary.test.mjs`、`tests/fixtures/commentary-test.json`、専用E2E、この記録の9ファイルのみ。実データ・meta・Day README・同梱受賞者は変更していない。gitは読み取りのみ、npm install・commit・push・公開は未実施。

- gapを1〜2件の配列に変更。2件のlabel、各件の年数・受賞年・文・出典を検査。旧オブジェクト・空配列・3件・label欠落・型違いの負例を追加した。1件の任意labelと同じ起点の2件も通る。
- 出典の初出順はwhat→changed→expected→gapの配列順。共有文は1件と2件を区別。図・label・一文・出典を縦に並べ、aria-labelにもlabelと年数を含めた。fixtureにテスト用の化学2件を追加した。
- checkCommentaryのupperBoundは既定true。loadCommentaryだけfalseとし、下限・ISO形式・実在日付・その他の検査は維持。過去時計での読み込み、未来確認日の上限切替、上限なしでも下限以前・11月31日・形式不正が落ちる例を検査した。CLIは変更せず上限あり。
- 全6分野の発表ページslugを定義し、ready・facts・pending各カードにリンクを1つ追加。共有リンクがある場合はその前。紹介リンクは維持。44px以上のCSSを適用。
- 実commentary.jsonのupperBound:false検査を追加。実データE2Eでは解説のリクエストをroute.continueで実ファイルへ通し、差し替えない。0件なら準備中を検査し、非空なら化学ready・出典番号の実在・医学と物理のdetailsを検査する。skipは使わない。
- 専用E2Eには2件の図が390pxで縦に並び横にはみ出さない検査、全カードの発表ページURL・属性・44px・権利の関門c検査も追加。これらのブラウザ実行はメインに引き継ぐ。

実行コマンドと結果：

- `TZ=Asia/Tokyo node --test day-060-prize-explained/tests/`：初回・最終とも225件、成功225、失敗0、cancelled 0、skipped 0、todo 0、終了0。
- `TZ=UTC node --test day-060-prize-explained/tests/`：初回・最終とも225件、成功225、失敗0、cancelled 0、skipped 0、todo 0、終了0。
- `node --check day-060-prize-explained/lib/commentary-check.js`：終了0、出力0件。
- `node --check day-060-prize-explained/lib/commentary.js`：終了0、出力0件。
- `node --check day-060-prize-explained/lib/render.js`：終了0、出力0件。
- `node --check tests/e2e/day-060.spec.mjs`：最終変更後も終了0、出力0件。
- `npx playwright test tests/e2e/day-060.spec.mjs --list`：最終変更後も `Total: 44 tests in 1 file`、終了0。実行合格数ではない。
- `node day-060-prize-explained/tools/check-commentary.mjs`：`検査: 0件、エラー: 0件`、終了0。実解説は現在0件。
- `git diff --check`：終了0、出力0件。

既存のMODULE_TYPELESS_PACKAGE_JSON警告は継続。指定に従いサーバー起動・E2E実行はしていない。buildは許可範囲外へ出力するため未実施。実ブラウザでの390px表示・44pxの寸法・details操作・実データ非空時の確認はメインが実行する。公開作業は行っていないため公開前precheckは未実施。新しい外部素材・依存は追加していない。

## 第3弾（2026-10-07）

UI採点1周目と最終点検後のT1〜T6を実装した。REQUIREMENTSの既存ユーザーストーリー・UX5を採用し、平易な説明を先に読む順序、名前から公式紹介へ進む導線、本文の幅と通常の折り返しを優先した。

変更は `day-060-prize-explained/index.html`、`app.css`、`lib/render.js`、`lib/commentary.js`、`lib/commentary-check.js`、`tests/commentary.test.mjs`、`tests/commentary-check.test.mjs`、`tests/render.test.mjs`、`tests/app.test.mjs`、`tests/e2e/day-060.spec.mjs`、この記録の11ファイル。実データ第8版、meta.json、README、REQUIREMENTS、COMMENTARY_RULES、同梱受賞者、SOURCESは変更していない。app.js・lib/live.js・lib/phrase.jsとそのテストも維持した。gitは読み取りのみ。新しい外部素材・依存は追加していない。

- 出典にcompanyと任意のen/jaを許し、不正なlang・kindを拒否する負例を追加。画面では全8種類と英語の印を出す。
- 先頭・今週の受賞者は名前そのものを公式紹介リンクにした。年齢・年齢注記・同じ歳の印は出さない。年齢検索の年齢表示を単体とE2Eで引き続き確認する。
- ready/factsは平易な説明→年数→原文→出典→注記→発表ページ→共有の順。pendingは原文→準備中。compactカードは賞名・受賞者・発表日を繰り返さない。開閉の文言と「上に表示中」のリンクを実装した。
- カード本文のphr/wbrをproseに変更し、auto-phrase/strict/anywhere/prettyで折り返す。短いgap-label・schedule等のphraseと既存年齢検索の折り返しは維持した。
- refsをU+2060で文末に接続し、番号のまとまりをnowrapにした。番号はinline・12px・line-height:0・上付き、疑似要素で上下12px/左右6pxの押せる範囲、番号間4px。
- カードは通常14pxのpadding。390px以下はmain左右16px、カード10px、内枠左右8px/4px、箇条書き1.1emとした。390pxでliの幅はCSSの寸法計算上約304px。実測合格とは扱わず、先頭と開いたカードの300px以上・番号高さ22px以下・番号あり/なしの行高比較をE2Eに追加した。
- カード内外のheadline/note/small/h4の文字サイズ、4本の移動リンクと44px、フッター見出し、指定の冒頭・メタ・問い合わせ先・確認日の定義を更新。
- 共有文はひとこと→「論文の出版年と2026年の差：24年・40年。」→題名、factsは年数行なし。取得日時は日本時間の日付付きで、UTCの日付境界も単体で確認した。
- E2Eには上記の操作・寸法・文字サイズ、実データの英語/企業の印、行頭の禁則文字、番号だけの行がないことを追加。既存の権利a〜fの破壊検査、実データを差し替えない場面、共通共有の確認は残した。

実行したコマンドと結果：

- 最初の `TZ=Asia/Tokyo node --test day-060-prize-explained/tests/`：231件、成功231、失敗0。
- 新規テスト追加後の同コマンド：249件、成功248、失敗1。Intlの月/日だけのformatが「10/7」になることを新しい日時テストが検出。formatToPartsで「10月7日」と組み立てるよう修正した。
- 最終 `TZ=Asia/Tokyo node --test day-060-prize-explained/tests/`：249件、成功249、失敗0、cancelled 0、skipped 0、todo 0、終了0。
- 最終 `TZ=UTC node --test day-060-prize-explained/tests/`：249件、成功249、失敗0、cancelled 0、skipped 0、todo 0、終了0。
- `node day-060-prize-explained/tools/check-commentary.mjs`：`検査: 3件、エラー: 0件`、終了0（第8版の実データ）。
- `node --check day-060-prize-explained/lib/render.js`：終了0、出力0件。
- `node --check day-060-prize-explained/lib/commentary.js`：終了0、出力0件。
- `node --check day-060-prize-explained/lib/commentary-check.js`：終了0、出力0件。
- `node --check day-060-prize-explained/tests/commentary.test.mjs`：終了0、出力0件。
- `node --check day-060-prize-explained/tests/commentary-check.test.mjs`：終了0、出力0件。
- `node --check day-060-prize-explained/tests/render.test.mjs`：終了0、出力0件。
- `node --check day-060-prize-explained/tests/app.test.mjs`：終了0、出力0件。
- `node --check tests/e2e/day-060.spec.mjs`：終了0、出力0件。
- `npx playwright test tests/e2e/day-060.spec.mjs --list`：`Total: 48 tests in 1 file`、終了0。検出数であり、実行合格数ではない。
- `git diff --check`：終了0、出力0件。

既存のMODULE_TYPELESS_PACKAGE_JSON警告は継続。指定に従いE2E実行・サーバー起動・スクリーンショット撮影・UI採点は未実施。ブラウザでの本文幅・行頭禁則・番号の行高/操作・カードの開閉・ライト/ダークの見た目はメインが検証する。buildは許可外のdistへ書き込むため未実施。公開作業を行わないため公開前precheckは未実施。npm install・commit・push・PR・公開・外部送信は行っていない。

## 第4弾（2026-10-07）

目的はUI採点2周目の実測済み指摘T1〜T11への対応。既存のユーザーストーリー・UX5と第4弾の工程契約を採用し、変更範囲を `app.css`、`app.js`、`index.html`、`lib/render.js`、`lib/phrase.js`、`tests/app.test.mjs`、`tests/commentary.test.mjs`、`tests/phrase.test.mjs`、専用E2E、この記録に限定した。解説本文・同梱データ・README・meta・要件・権利ルール・sharedは変更していない。gitは読み取りのみ。

- T1：数とか、日付、数と単位、修飾語、中黒、欧文識別子を保護し、Segmenter境界でwbrを入れる。14字を超える塊は上限内の最後の助詞、非カタカナの中黒を優先して割る。本文・ひとこと・小さな説明・準備中・注記もphrase経由。英語の受賞理由は原文のまま。短い空白入り欧文はnw、確認日全体もnw。refsの前にwbrを入れずU+2060を維持。
- T1の補足判断：実データの「天体（TXS 0506+056）の」「（アイスキューブ・ジェンツー）では、」は助詞・中黒だけでは17/18字が残るため、長い塊の開き括弧前・閉じ括弧後もSegmenter境界で分けた。単語・識別子は割らない。14字を超える分割不能の塊は「ゲッティンゲン大学医療センターの」（16字）、「2010年5月〜2012年5月の」（16字）、「（アイスキューブ・ジェンツー）」（15字）。日付範囲も保護を優先して維持した。全文の17字以上の塊は0で、全文復元・単語境界も単体で確認。
- T2〜T4：フッター本文のリンクをinlineにし、Xの括弧ごとnw、半角空白・指定文言・出典の題の説明を更新。カードの箱は左右10px、390pxはmain左右14px、ulは1em。出典はinline＋疑似要素、補足margin-top 2px、項目間16px、区切りは直前の語へ結合。summaryは文字のspanだけ下線、印に下線なし。
- T5：intro 17px/400、h2 22px/24px・700、賞名20px、節の罫線と余白、答えの数字はh1と同じclamp。指定の賞名20px・広い画面のheadline20pxと「h3 > headline」は両立しないため、厳密な階層の条件を優先しheadlineを全幅18px/650にした。しきい値は下げていない。
- T6〜T9：sharedより詳細なDay60限定セレクタで角丸3px・透明、主ボタンは既存の22%の面を維持。答えの箱は全辺1px。状態は賞名の下、2列時の賞名と人名の文字位置を調整。名前はpersonsのflex、移動リンクを見出しと同期、週のカード末尾で閉じる→summaryへfocus→nearest scroll。PCの本文40rem・年数34rem。gap-labelとscheduleもkeep-allにして明示した折り位置を使う。
- T10：boot-noteとnoscriptを追加し、loadingのsection/footerはvisibility:hidden。APIの初回取得までloadingを維持し、paintとloadが済んでからreadyにする（ローカルデータだけを描いて即readyにすると、APIの賞の切替で再びずれるため）。エラー時は内容を表示。単体で遅延中のloadingとAPI完了後のreadyを確認。
- T11：単体に各規則、全文境界・復元・長さ、phraseのnw/escape/wbr、persons/close-card、boot-note/noscript、委譲した閉じる操作、API待ちを追加。既存の文字比較はwbrを除去。E2EはRange.getClientRectsで禁則・日付/単位/識別子/カタカナ名・Segmenter語中の折れを検査。390/768/1280×化学/物理の全カード、左右余白と300px以上、出典の行と補足間隔、階層・部品・名前・導線・CLSを追加。通常word-breakとvisibility除去の破壊検査も記述。既存の権利・共有・番号22px以下・幅300px以上は維持。

実行したコマンドと結果：

- 初回 `TZ=Asia/Tokyo node --test day-060-prize-explained/tests/` は、wbr導入前の期待値と折り規則のテストが失敗。新構成に合わせて文字比較と出典補足の期待値を更新。追加テストの述語の期待値1件は実際のSegmenter境界に修正した。
- 最終 `TZ=Asia/Tokyo node --test day-060-prize-explained/tests/`：259件、成功259、失敗0、cancelled 0、skipped 0、todo 0、終了0。
- 最終 `TZ=UTC node --test day-060-prize-explained/tests/`：259件、成功259、失敗0、cancelled 0、skipped 0、todo 0、終了0。
- `node day-060-prize-explained/tools/check-commentary.mjs`：`検査: 3件、エラー: 0件`、終了0。
- `node --check day-060-prize-explained/app.js`、`node --check day-060-prize-explained/lib/render.js`、`node --check day-060-prize-explained/lib/phrase.js`、`node --check tests/e2e/day-060.spec.mjs`：すべて終了0。
- `npx playwright test tests/e2e/day-060.spec.mjs --list`：`Total: 63 tests in 1 file`、終了0。検出数であり、実行成功数ではない。
- `npm run shared:sync -- --check`：`shared: 60個のアプリを確認しました`、終了0。
- `git diff --check`：終了0。

未検証：指定どおりE2Eは実行せず、サーバー・スクショ・UI採点・実寸・CLS測定・共通共有E2Eはメインへ引き継ぐ。ブラウザ関門と3周目の16/20合格はまだ確定していない。buildは許可範囲外のdistを書き換えるため未実施。公開作業を行わないため公開前precheckは未実施。既存のMODULE_TYPELESS_PACKAGE_JSON警告は継続。新しい依存・外部素材は追加せず、npm install・commit・push・公開・外部送信は行っていない。

## 第4弾のメインの検収と最終の確認（2026-10-07）

UI採点は3周で合格（1周目11/20・2周目15/20・3周目17/20。0点の項目なし）。第4弾（Codex）の実装を、画面の実測で検収し、次を直した。

- **折り返しの保護が不足**：`<wbr>` を置かないだけでは、keep-all でもブラウザ自身が数字と漢字のあいだや「・」のあとで折る（390pxで「アンリ・｜カガン」、768pxで「2026年9月｜9日」が残った）。折らない表記は nowrap の span で包む形にし、表記の一覧（`tokenPatterns`）を `lib/phrase.js` の一か所に置いて、塊のわけ方と描画が同じものを見るようにした。13字以上のカタカナの名前（アイスキューブ・ジェンツー）だけは、幅の狭い画面で入りきらないので包まず、「・」のあとで折ってよい。
- **出典の補足行で横に58pxはみ出した**：発行元まで nowrap にしていた。発行元は包まず、区切りの「·」だけを直前に改行しない空白（`&nbsp;`）で行頭に来ないようにした。E2Eの関門（`scrollWidth - innerWidth` が0）が検出した。
- **`ready` を公式データの返事のあとに回していた**：返事が遅いと、ページが隠れたまま何も出ない（実測：遅延3秒で3秒ぶん）。同梱の記録で先に出す形に戻し（実測：レイアウトのずれ CLS 0.236 → 0.014）、「返事が1.5秒遅くても解説が先に出る」をE2Eの関門にした。ready を元に戻すと落ちることを、変異で確かめた。
- **幅320pxの救済**：上限（14字）を超える複合語を、単語の境目で割る（「ゲッティンゲン大学医療｜センターの」）。フッターの「アルフレッド・ノーベル」を包む。
- **共有リンクと「解説を閉じる」が横に並んで枠がくっつく／待ちの行の予定の高さ**：余白と上余白を足した（賞名と右の文字の高さの差は3px以内）。
- **採点3周目の指摘（実際に起きていた）**：閉じ括弧のあとの助詞が行頭に来る（「（2018年）／や、」など9件）。括弧と助詞（`）と、`）を一つの表記にして、塊の境目にも包みにも入れた（行頭の助詞：9件→0件）。E2Eの関門にルールD（括弧のあとの助詞が行頭）を足し、包みを外すと落ちることを確かめた。
- **採点の仕上げ（意味は変えない）**：先頭のカードをPCで44remに絞って右端をそろえた／「その歳で、受賞した人」の中の小見出しを18px／出典欄の見出しの下に「論文の題は原題のまま、ウェブページの題は作者が日本語でつけたもの」／出典番号を小さい順（[3][1]→[1][3]）／フッターの見出しを移動リンクと同じ「数え方・データの出典」に／`GitHubのIssue` のリンクの範囲をそろえた／「Nobel Prize Outreach」を割らない。
- **解説の文を3つ、意味を変えずに並べ替え・言い換えた**（物理学賞の「何をした人か」の1つ目、物理学賞の期待の1つ目、化学賞の期待の1つ目）。出典の記録（IceCube の公式ページ・東京理科大学の研究ページ・2018年の論文の要旨）と、主張が変わっていないことを自分で照合し、Codexにも再点検させた。物理学賞の文に、出典に明記のない「原子」があった（並べ替え前から）ので「氷の中で反応したとき」に直し、読みやすさの2点も反映した。

折り返し方式は5通りを390pxで測って比べた（化学賞・物理学賞の約300行）。採用したのは、折ってよい位置を自前で置き、表記を nowrap で包む方式（平均の行の埋まり81%・語の途中の折れ0件・行頭の助詞0件・ブラウザによらず同じ）。ブラウザの文節折りは、埋まり85%でも語の途中の折れが10件（Chrome自身が「来た方｜向は」と割る）で、iPhoneのSafariでは使えない。通常の折りは埋まり95%だが、語の途中の折れが86件。

実行した確認（最終）：
- `TZ=Asia/Tokyo` と `TZ=UTC` の `node --test day-060-prize-explained/tests/`：どちらも265件・成功265・失敗0。
- `node day-060-prize-explained/tools/check-commentary.mjs`：3件、エラー0。
- `npm run build`：成功。`npm run precheck`：成功（漏洩パターンなし）。全Dayの単体テスト（`npm run test:unit`）：2,716件・成功2,715・失敗0・スキップ1（Naturalな地図データが無い環境の既存のスキップ）。
- `npx playwright test tests/e2e/day-060.spec.mjs tests/e2e/shared-share.spec.mjs tests/e2e/security-headers.spec.mjs`：300件成功（Day60が64件、共通が236件）。
- 実測（390px・Chromium 151）：折り返しの違反は、幅360〜1280pxで0件（320pxは、長い名前の「・」のあとの1件だけ＝意図した例外）。横にはみ出さない（320・390px）。CLS 0.014。スマホ想定（CPU4倍遅・1.6Mbps・遅延150ms）で解説カードが出るまで約2.9秒（配信は圧縮なし）。

最後に、あなたの判断（2026-10-07）を反映した：医学賞の期待の欄の「開発会社の承認申請の発表」を、出典2件ごと外した（宣伝に見える恐れと、承認の判断が出れば文が古くなるため）。年齢検索は残す。外した結果、実データには「企業の発表」の印の出典は無い（E2Eの確認を外し、印の表示は単体テストが全8種類で見る）。臨床試験の段階「第I・II相」を折らない表記に足した。再実行：単体265件（2つの時間帯とも）・ブラウザ試験300件が合格。
