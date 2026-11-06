# Day84 ブラウザ版の検証

2026-11-06。本人の原本・私的資料は使わず、自作の日本語PDF3ページで確認した。

## 実装の検証

| 対象 | 結果と証拠 |
|---|---|
| Relay | 実Miniflare/SQLite/Chrome 15/15成功、skip0。認証・別部屋・制限・終了・期限。独立APPROVED |
| Browser | 実Chrome/Miniflare 13/13成功、skip0。日本語PDF・暗号/AAD・wire境界・再同期・ACK・終了。独立APPROVED |
| UI | 実2ブラウザ12工程成功、pageerror/CSP違反0。QRキーボード、採用/取消/失敗、全画面、切断復帰、終了を確認。独立APPROVED |
| UI評価 | 18/20、体験19/20、全項目1点以上。3幅のoverflowなし・操作44px以上、footer contrast約7.73:1 |
| 全体check | 構文エラー0、unit5092件中5091成功/既存skip1/失敗0、16プロジェクト依存監査high/critical0、build成功 |
| 専用配信 | Wrangler dry-run成功、229assets・17.77KiB Worker。SQLite DO・rate・assets設定を確認 |
| 静的E2E | 固有port4184で2/2成功。PDF案内・インストール不要・3幅・公開URLコピー・非配信範囲 |

## レビューで直した点

- inline dblclickがCSPで拒否されたためapp.jsでイベント登録し、実全画面とCSP違反0を追加検証。
- QRでSpaceコピーしたとき共通ショートカットも働いたため、処理済みイベントを除外。ページ不変を検証。
- 補助ボタン/summaryを44px以上にし、小さいページ番号のコントラストを改善。
- Day84を含まない隔離ビルドでpolicyを読まないようにし、関連31/31と新fixture1/1を確認。
- 共通権限検査にDay84のセンサー限定を追加。マイク・カメラ・位置・支払・USBのdenyと他Dayの制限を維持。

## 公開後に確定する項目

最新head必須CI、マージ、専用Worker route反映、本番URLの実2ブラウザ接続は実施結果で記録する。
現時点では本番動作の完了を主張しない。SNS投稿は行わない。

## 確認していない環境・限界

- iOS/Safari実機、物理スマホのQR読み取りは未検証。
- idle alarmの自動配送時刻は未検証。保存時刻・期限拒否・実handler明示配送を区別して確認。
- PPTX/PPT直接読込は非対応。PowerPointからPDFに書き出して使用する。
- PDF・カンペはページメモリだけ。再読込/タブ終了で失われる。接続は最長4時間。

## 配信設定の修正

PR207のCI成功・マージ後、実accountのbase_path未有効（100343）で配信が拒否された。
専用rootの実prefix階層へ変更し、実Wrangler設定を使う13工程E2Eと全SECURITY_HEADERS・開発用/他Day404が成功。独立コードレビューAPPROVED。
初回main公開処理は途中状態の配信を避けるため意図的に停止。修正PRの最新CIと実配信成功を確認してから公開完了とする。
