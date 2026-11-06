# ブラウザ版のタスク

本人のブラウザ完結指示と自律進行指示に基づく。設計のレビュー後に実装する。
- [x] 0. 既存仕様継承・境界・依存環境・設計/タスクレビューを整える。
  - _Boundary: Setup_ / _Requirements: 1.1,1.3,4.3_
- [x] 1. 認証・期限・制限を持つ暗号文中継を実Workers runtimeで実装・検証する。
  - _Boundary: Relay_ / _Requirements: 3.1,3.3,3.4,3.5,4.2,4.3_
  - _Depends: 0_
- [x] 2. ブラウザ内PDF/状態・AES通信・仮想APIを実装・検証する。
  - _Boundary: Browser_ / _Requirements: 1.2,2.1,2.2,2.3,3.2,3.3,3.4,3.5_
  - _Depends: 1_
- [x] 3. 既存画面を接続し、別ブラウザで資料/操作/読込/全画面の実動作を確認する。
  - _Boundary: UI_ / _Requirements: 1.1,1.2,2.4,4.1,4.2_
  - _Depends: 2_
- [ ] 4. 公開ゲート・独立レビュー・Git/CI・専用routeへ反映し、既存URLの実接続を検証する。
  - meta/README/OGP・共通共有・配信除外・既存Day84試験・CIをWeb版へ対応させる。
  - _Boundary: Integration_ / _Requirements: 1.3,4.3,4.4_
  - _Depends: 3_

## Implementation Notes
- Setup：独立設計レビューAPPROVED。固定依存の導入・vendor生成・root build・precheck成功。PDF.js6のrender/destroyは現行APIに従う。
- Relayクライアントはstatus APIで無効/終了済みQRを判別する。close codeは4001/4002/4003。Miniflare5のNode WS close通知差のため終端3ケースは実Chromeで検証し、CIもnpm test前にChromiumを入れる。
- Relay：独立レビューAPPROVED。実Miniflare/Chromeの15/15成功・skip0、構文PASS。idle alarmの自動配送時刻は未検証で、保存時刻/期限拒否/明示配送を分けて確認した。
- Browser：実Miniflare/Chromeの13/13成功・skip0、構文PASS、独立レビューAPPROVED。日本語PDF・wire境界・暗号/AAD・75連続操作・ACK timeout・自分/相手切断・再同期・終了を確認。
- UI：独立レビューAPPROVED。実2ブラウザ12工程成功、pageerror/CSP違反0。QRのSpaceコピーとダブルクリック全画面を修正し、390/768/1440pxの44px操作領域も再検証した。
