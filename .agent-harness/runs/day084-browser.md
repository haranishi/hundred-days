# Day84 ブラウザ版の進行記録

## 目的と現在地
本人の「ダウンロードでなくURLから使う」「Webアプリは基本ブラウザだけで完結」に対応する。
既存の公開URLを維持し、Node/ZIPを通常導線から外す。PPTX直接変換は使わず、元のPowerPointからPDF出力して表示する。
共通原則を個人の共通ハーネスとcc-sdd共通手順へ追記済み（リポジトリへ個人設定は転載しない）。

## 作業場所
- 専用worktree：~/Projects/hundred-days-day084-web、SSD実体。
- branch：feat/day084-browser、起点main3d5ccd3309ef01c4432ca0ebb1c464b338dd1ae0。
- Setup commit：5855757。元のローカル3084・ソース・私的原本は維持する。
- 仕様：.kiro/specs/day084-browser/。要件16件・設計/タスクは独立APPROVED。
- 設計レビューでwireサイズとCSP生成元を修正済み。

## 検証済みの準備
- PDF.js6.5.438 legacy、qrcode-generator2.0.4、Wrangler4.157.0、Miniflare5.20261103.0-betaを固定してSSDへ導入。
- npm run build（webから実行）がvendorを生成し、rootの84Day出力とWorker用_headersを生成できる。
- precheckは秘密情報/個人NGの検出なし。依存由来の既存連絡先警告は公開情報で、元パッケージとLICENSEを保持する。
- 予定のCSPで自作日本語PDF3ページをChrome内描画。文字取得・背景/配置・PNG実見、pageerror0・CSP違反0。
- 証拠：.cache/day084-pdf-probe/。元PDFは旧プロモ用の自作資料で、本人の研究資料ではない。

## 実装と検証
- Task1 Relay：実Miniflare/Chromeの15/15成功・skip0、構文PASS、独立レビューAPPROVED。権限・別部屋・status・期限拒否・中継・制限・終了を確認。idle alarmは保存時刻と実handler明示配送を検証し、秒単位自動配送時刻は未検証。
- Task2 Browser：13/13、skip0、独立レビューAPPROVED。PDF・wire境界・暗号化・burst・切断/再同期・終了を実runtime/Chromeで確認。
- Task3 UI：独立レビューAPPROVED。実2ブラウザ12工程成功、pageerror/CSP違反0。レビューでQR Spaceの二重操作とinline dblclickを修正した。
- 3幅のoverflowなし・44pxを確認。独立UI/体験評価は進行中、本番はまだ完成扱いしない。
- Miniflare5はworkers配列schema。実配布のconvertV4MiniflareOptionsで旧形式を正式変換して使う。
- Task4：meta/説明/共有CSP/CIをブラウザ版へ整備中。root unit初回7件のREDは独立ビルドでDay84のpolicyを常時importしたため。含有Dayが84の時だけ読む形にし、関連37件の回帰検査で修正を確認。
- 次：全体check・公開ゲート・PR/必須CI・マージ・専用routeの本番確認。

## 公開の契約
- このDayのパスだけのWorker route、assets.base_path、APIだけrun_worker_first。事業用の既存認証を使う。
- Web/policy.mjsをroot/Worker共通CSPにし、同じCSP下でPDFとWSを実行する。
- wireは現在ページのノートと画像だけ、平文47KiB・外枠64KiB。DBに平文・暗号鍵・資料・暗号文を保存しない。
- 完成後、旧プロモ/投稿文のMacローカル版という説明もWeb版と一致させる。
