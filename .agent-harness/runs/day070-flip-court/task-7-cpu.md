# タスク7：承認済CPU版の検証

- 独立レビューAPPROVED。恒久E2E15件が両エンジンで成功、skip/flakyなし。
- キー自動リピートのREDは入力所有者が修正し、承認後に全体を再実行。
- 修正後の標準check：単体3402成功・既存skip1・失敗0、構文1357件エラー0。
- 一覧と共有70件が整合。標準buildはdraftのDay070を除外。
- 隔離fixtureだけで実builderを実行。公開10ファイルとbuilderのhashが現物と一致。
- 実distは両エンジンで起動・操作・着地・終了が成功、CSP/HTTP/consoleエラーなし。
- 親もcurrenthash・33条件のcoverage・raw実行結果・構文・実ビルド画像を確認。
- OS実背景化/実機タッチ/OS共有送信の未観測と、イベント/API検査を区別した。
- 実時間体験はタスク8、追加対人モードは別の未承認更新案。判定：TASK VERIFIED。
