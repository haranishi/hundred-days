# Day084公開タスク

要件・設計・タスクは本人のPR作成/マージ依頼と自律進行指示に基づき承認。タスクグラフは独立PASS。

- [x] 1. (P) 検証済みローカル版を配布する
  - 明示した安全なソースだけを継承し、起動README・LICENSEと再現可能なZIPを作る。実資料・過去履歴は持ち込まない。
  - ZIPとソースの一致・禁止物不在・ZIP展開後の起動を検証し、接続鍵を除いた自作サンプル画面とmetaを用意する。
  - source/toolsを静的配信から除外する。
  - _Boundary: Distribution_
  - _Requirements: 1.1, 1.3, 1.4, 2.3_
- [x] 2. (P) 配布ページと導線を整える
  - index/style/favicon、既存shared、Day README、Day84のE2Eを作る。
  - Macのローカル版であること・必要環境・3手順・制約を伝え、3幅/キーボードで使える。
  - 接点はairpresenter-local.zip、preview.png、題名AirPresenterとする。
  - _Boundary: PublicPage_
  - _Requirements: 1.2, 2.1, 2.2, 2.3_
- [ ] 3. 統合してPR・マージ・本番確認を行う
  - 一覧同期、precheck/check/公開ゲート/対象E2E/ローカル版全検証、独立レビューを通す。
  - 明示ファイルだけcommit/pushし、現在headの共通CI成功後にマージ。本番のページ・配布ZIP・配信範囲を確かめ、仕様と既存メモへ記録する。
  - _Boundary: Integration_
  - _Depends: 1, 2_
  - _Requirements: 3.1, 3.2, 3.3_

## 公開前の証拠
全check（単体5090成功・既存skip1、依存監査15件失敗0）、配布3件、ローカル版12件＋ブラウザ、公開ゲート329成功・既存skip1、公開ページ2件がPASS。
独立レビューAPPROVED、UI19/20（0点なし）。PRの現在headのCI・マージ・本番確認はGitHubと既存のDayメモに結果を残す。
