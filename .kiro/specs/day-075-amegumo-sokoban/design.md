# Day75 統合の設計と工程契約
## 方針
完成済みの静的ゲームをday-075-amegumo-sokobanへ移植し、共通ビルドとCIへ接続する。
既存20面と全解、音・図解・手帖を維持する。個人向け開発記録やローカルサーバーは公開対象に移さない。
公開URL：https://hundred-days.pages.dev/day-075-amegumo-sokoban/
## UX5階層
戦略：考えるパズルをすぐ遊べる。要件：20面/図解/設定/共有。構造：既存の庭と四章。
骨格・表層：既存の紙・緑・自作SVGを維持し、紹介画像の三景表記を二十の庭へ更新する。
## 境界と責務
- Day本体：HTML/CSS/JS/lib/assets/shared。固定のcanonical/OGPを正本にし、locationで上書きしない。
- Day tools：解探索・手動ブラウザ検証。dist-filesのDay別tools除外に登録し、開発ツールを配信しない。
- Day tests：純粋Rule/音/動き/記録の回帰。既存ルートtest:unitから実行する。
- root：README一覧の同期。既存の共通sharedとCSPを利用し、外部接続例外を追加しない。
- E2E：Day75の実操作と、共有テストで初回案内を閉じる実利用の前処理。
## 脅威モデル
URL/query/hashとlocalStorageは未信頼。表示へはtextContentと既知id/型の抽出を用いる。
保存するのは端末内の手数・既読・音設定。認証情報・利用者データの送信・外部APIはない。
共有は固定のX/LINE先へ符号化し、noopener/noreferrerを保つ。音は標準WebAudioで生成する。
配信は静的成果物だけ。秘密設定・ローカル絶対パス・検証資料を新Dayへ混ぜない。
## 検証と公開ゲート
npm run check、npm run publish:check -- --day 75、Day75 E2E、独立セキュリティ点検を実行。
新規/変更ファイルを全文と画像で確認し、紹介数字・日付・担当・実際の不具合を作業記録に照合する。
CIの成功を同じheadで確認し、ユーザーの明示許可に従いマージと本番確認まで進める。
最大3周、同一失敗2周。未確認を成功扱いせず、他Dayの既知問題は切り分ける。
