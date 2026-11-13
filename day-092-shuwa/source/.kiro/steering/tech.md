# Tech

## 構成と選んだ理由
- **画面**：Preact 10 ＋ TypeScript ＋ Vite。軽さ（スマホの初回表示）と、React と同じ書き方で実装者が迷わないことから選んだ。状態は @preact/signals
- **3D**：three.js。手の形を仕様データから組み立てるので、深さの前後（親指が指の前か後ろか）を正しく描ける仕組みが要る。2Dの重ね描きでは前後を取り違える
- **カメラ判定**：MediaPipe の手の検出（@mediapipe/tasks-vision）。wasm とモデルは自分のサイトに同梱し、使う時だけ読み込む
- **保存**：ブラウザの localStorage に1つのJSONで保存。壊れた・使えない時は、メモリだけで動かして画面で知らせる
- **オフライン**：PWA（vite-plugin-pwa）。カメラ用の大きいファイルは事前に取り込まず、初めて使った時に保存する
- **書体**：Zen Maru Gothic（OFL・@fontsource で文字範囲ごとに分割配信）
- **画面遷移**：URLの # 以降で切り替える（静的ホスティングで、直リンクと再読み込みが壊れない）

## 版の決め方
- 依存は `npm install --before=<2週間前の日付>` で入れる（公開直後の版を避ける）。版は package-lock.json で固定する
- 採用時点：vite 8・vitest 5・preact 10・three 0.18x・@playwright/test 1.6x

## 検証のゲート（全部通るまで次へ進まない）
- `npm run typecheck`（strict）・`npm test`（vitest）・`npm run build`
- `npm run e2e`（Playwright。Chromium と WebKit、スマホの縦 390px・360px と PC 1280px、指の操作を含む）
- アクセシビリティの自動検査（axe）で重大な違反ゼロ
- 100日の `npm run publish:check -- --day 92`：公開時に初めて掛かる検査（共有・OGP・ヘッダー）を、PRの前に本番と同じ条件で流す

## 公開先：100日チャレンジの Day92（2026-11-13 本人指示）
- 置き方は Day89・Day90 と同じ「100日のリポジトリの中のDay」。フォルダは `day-092-<名前>/`、正の住所は `https://rairakku.com/100days/day-092-<名前>/`。フォルダ名はURLに入るので、名前の商標確認の後に決める
- コードの正本はこのリポジトリ。100日へは `tools/build-day092.mjs <Dayのフォルダ>` で、組み立てた本体と元のコード（`source/`・MIT）を写す。`.agent-harness/` の作業記録・ローカルの絶対パスを含む文書は写さない（100日の `npm run precheck` が落ちる）
- 住所はすべて文書相対（Vite の `base: './'`）。画面遷移は # 以降なので、`/100days/…/` の下でも直リンクが壊れない。PWA の範囲も `./`
- OGP と canonical は、100日のサイトの組み立てが meta.json から入れる。こちらの index.html には書かない
- 共有は100日の共通部品（`shared/share.js`）を `<dialog>` の中の `<footer id="share">` に置き、「このアプリを共有する」の入口を読み込み前から静的に置く（全アプリ横断の試験が開いた直後に押す）。結果画面の「記録をシェア」は、進み具合の文を載せる自前の4点で足す
- セキュリティヘッダーは100日の `scripts/build.mjs` が作る。Day92 用に、wasm の実行（`'wasm-unsafe-eval'`）とカメラの許可（`camera=(self)`）をそのDayのパスだけに足す。元のコードは `SOURCE_DIRS_BY_APP` で配信から外す
- 確認は100日の `npm run publish:check -- --day 92`。PR は公開ゲートを通した `status: "published"` で出し、マージとX投稿は本人
- 共通のファイル（`scripts/build.mjs` など）は、並行して作っている Day91 も触る。Day91 が main に入った後、最新の main から作業場所を作って入れる
