# Day84 ブラウザ版の検証

2026-11-06。本人の原本・私的資料は使わず、自作の日本語PDF3ページで確認した。
最新の配信後結果は[PR208の公開記録](https://github.com/haranishi/hundred-days/pull/208#production-verification)へ追記する。

## 実装と統合

| 対象 | 結果と証拠 |
|---|---|
| Relay | 実Miniflare/SQLite/Chrome15/15、skip0。認証・別部屋・制限・終了・期限。独立APPROVED |
| Browser | 実Chrome/Miniflare13/13、skip0。日本語PDF・暗号/AAD・wire境界・再同期・ACK・終了。独立APPROVED |
| UI | 実configの2ブラウザE2E14工程、例外/CSP違反0。独立APPROVED |
| UI評価 | 18/20、体験19/20、全項目1点以上。3幅のoverflowなし・44px以上、footer contrast約7.73:1 |
| 共通check | Day85取込前のローカルunit5092件（5091成功/既存skip1）、構文0、16依存監査high/critical0、build成功 |
| 最新の配信修正CI | PR208 head80c6e00の[必須CI42152119707](https://github.com/haranishi/hundred-days/actions/runs/42152119707)が全成功 |
| 静的公開ゲート | 329成功/既存skip1、契約・build・復元成功。固有portのDay84静的E2E2/2成功 |
| 互換性 | ChromeとモバイルWebKitの相互操作、WebKitによる日本語PDF表示成功。実機Safariとは区別する |

## 本番公開の記録（ネイティブキー修正前）

PR207は5ce6cafへ、配信修正PR208はea64ae7へマージ。
初回のnon-root assets.base_pathは実accountの100343で拒否されたため、実prefix階層へ変更した。
同名Workerの非公開受付を先に確認し、最新CI成功後に正式routeへ反映した。有料化やaccount flag変更はない。

- URL：https://rairakku.com/100days/day-084-airpresenter/
- Worker version：0222037b-8931-4143-a1ca-79cd372317ac。
- 2026-11-06 03:13 UTC、実URLからPC/スマホの別ブラウザ9工程が成功。
- 暗号化接続、日本語PDF確認/採用、カンペ/時計/暗転/タッチポインター、切断復帰、差替取消/失敗/再試行、3幅/公開コピー/実全画面、終了、古いQR無効化、非配信範囲を確認。
- ページ例外0・CSP違反0・暗号化frame46・PDFのHTTP upload0。元PDFはPC内で処理。
- 証拠：.cache/day084-production/result.json、public-app.png、day084-deploy.log。
- mainのPages/catalogue公開処理は別途進行。最新の状態は上のPR公開記録で確認する。

## 回帰修正

- inline dblclickをイベント登録へ移し、実全画面/CSP違反0を検証。
- QRのSpaceコピーでページが進まないよう、処理済みイベントを除外。
- 補助ボタン/summaryを44px以上にし、小さいページ番号のコントラストを改善。
- Day84を含まない隔離buildの依存読込を修正し、関連31/31と新fixture1/1を確認。
- 専用asset rootを毎回cleanし、Day84だけcopy。rootの_headers実適用とsource/web/tools/tests/他Dayの404を実configのE2Eで確認。
- native summaryのSpaceで1/5→2/5となる追加不具合を本番で再現。回帰E2EもRED。
- native controlのSpace既定動作を保つ1行修正後、開閉時の頁不変と通常の送り/戻りを含む14工程がGREEN。独立レビューAPPROVED。
- 証拠：.cache/day084-native-disclosure-red.log、day084-native-disclosure-green.log。キー修正版の公開後結果はPR公開記録へ追記する。

## 制約

- 実機iPhone/Safari、物理スマホのQR読み取りは未検証。
- idle alarmの自動配送時刻は未検証。保存時刻・期限拒否・実handler明示配送は確認した。
- PPTX/PPT直接読込は非対応。元のPowerPointからPDFに書き出して使用する。
- PDF/カンペはページメモリだけ。再読込/タブ終了で失われ、接続は最長4時間。
- 動画は視覚/技術QCを確認したが、主観的な通し聴きは未実施。SNSは未投稿。
