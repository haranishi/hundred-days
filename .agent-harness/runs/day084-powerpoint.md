# Day84 PowerPoint直接入力の進行記録

## 目的と承認

初期SDDにあったPPTX/PPTの直接選択をブラウザー版へ引き継ぐ。本人の資料の手動PDF書出しを通常手順にしない。
仕様作成・実装・検証・PR・必須CI・マージ・反映確認は本人の自律実行指示の範囲で行う。

## 仕様と作業場所

- 仕様：`.kiro/specs/day084-powerpoint/`。旧PDF限定仕様より優先する。
- 作業場所：専用SSD worktree、branch `fix/day084-powerpoint`、起点main ea64ae7。
- 原本・PC書体はブラウザ内で処理。スマホのプレビュー/カンペ/状態だけを既存方式で暗号化中継する。
- 元のローカル版・他Day・private原本・認証設定は変更しない。試験は自作PPTX/PPT/PDFを使用する。

## 実装とレビュー

- 要件→調査→設計→タスクを引き継ぎ、独立設計/タスクレビューAPPROVED。
- Task1.1：固定公開資産/配信/CSP/出所とライセンス。独立APPROVED。
- Task2.1：変換フレーム/UNO・期限/取消・PC書体。実API RED→GREEN、独立APPROVED。
- Task3.1：PPTX/PPT直接選択、段階/経過時間/中断、採用/取消と説明。独立APPROVED。
- UI18/20・体験19/20、全項目1点以上。390/768/1440pxでoverflowなし。
- Task4.1：完成アプリの実エンジン/PC・スマホ・指定資料、CI接続の最終統合レビューAPPROVED。
- 詳細と制約は[検証記録](../../.kiro/specs/day084-powerpoint/verification.md)を参照。

## 実資料の扱い

ROOTだけが非公開ローカルで29頁資料を検証した。標準/PC書体の2ケースとも全頁画像/プレビュー・採用・スマホ最終頁操作が成功。
実資料の画像・PDF・原本・フォントをGit/配信/宣伝へ含めない。元PowerPointとの画素単位一致とは主張しない。

## 公開と成果物

Task5.1で全必須CI→PRマージ→同Day route反映→本番の自作PPTX/PPT操作を行う。
新しいPowerPoint版の宣伝動画とX草案、Drive/Obsidianの記録を更新する。旧PDF版/ローカル版の成果物は履歴として保持する。
新しい有料サービスや契約変更は行わず、SNSへは投稿しない。公開結果の数値とURLはPRの記録へ追記する。
