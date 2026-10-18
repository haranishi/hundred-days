# CPU版の統合検証

対象は本人が承認した6領域33条件。対人モードの追加案は承認待ちで、本判定には含めない。

## Validation Report
- DECISION: GO（承認済みCPU版）
- MECHANICAL_RESULTS:
  - Tests: PASS。現行hash一致のnpm run check exit0、単体3402成功・既存skip1・失敗0。
  - Feature: PASS。単体85件、Chromium/WebKit各15件、skip/flakyなし。
  - Syntax: PASS。1357ファイル・エラー0。
  - TBD/TODOと秘密値の代入パターン: CLEAN。新Dayと専用E2Eを確認。
  - Smoke boot: PASS。実builder産物で開始・入力・着地・結果を両エンジンで確認。
- INTEGRATION:
  - Cross-task contracts: Config→Rules/Match/View→Runtimeの契約が一致。
  - Shared state: 現モデルだけが進行し、入力破棄・新規再戦・単一RAFを確認。
  - Boundary audit: 判定/時計はMatch、入力/DOMはRuntime、Viewはモデルを変えない。
- COVERAGE: 6/6領域・33/33条件をtask7-coverage.jsonへ対応。未対応なし。
- DESIGN:
  - 依存方向とファイル配置は設計どおり。新規依存・外部処理なし。
  - 既存の追跡変更はREADMEの1行とbuildのtools除外1項目だけ。
  - 共有正本を同期し、既存Dayの遊びは変更していない。
- OWNERSHIP: LOCAL
- UPSTREAM_SPEC: N/A
- BLOCKED_TASKS: 承認済みCPU版はなし。local-versus.mdは未承認の追加案。
- REMEDIATION: なし。体験18/20・独立UI19/20、必須修正なし。

## Verification Result
- STATUS: VERIFIED
- CLAIM_TYPE: FEATURE_GO
- CLAIM: 承認済みCPU版の実装・統合検査・実時間体験・独立UI評価を完了。
- EVIDENCE: 全タスクのレビュー、現行hashと全体検査原本、実配布物起動、33条件の対応を照合。
- EVIDENCE: 316111msの実入力5試合と6幅画像、親の原本確認、独立レビューAPPROVED。
- EVIDENCE: 制作記録更新後のprecheck/build/diff checkもexit0。draftの配信除外を維持。
- GAPS: OS実背景化・WebKit実touch・OS共有送信は未観測。イベント/API検査と区別した。
- NOTES: 人間の面白さは未確定。公開・Git反映は未実施。対人設定は追加仕様の承認待ち。
