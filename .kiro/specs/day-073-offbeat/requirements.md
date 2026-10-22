# Day73 — offbeat.

## 1. DJゲームを公開する
- When ページを開く, the offbeat game shall 初回操作前に音を鳴らさず、再生の案内を表示する。
- When 盤面・ミキサー・パッドを操作する, the offbeat game shall スクラッチ・テンポ・同期・EQ・ループ・ミックス・サンプル・反響を音に反映する。
- When ライブを始める, the offbeat game shall 60秒の5ミッションを表示し、演奏を採点する。
- When ライブが終わる, the offbeat game shall 結果・記録と即再挑戦を提供する。
- When 画面を離れる, the offbeat game shall 音と時計を止め、明示操作で再開する。
## 2. 今日のWebアプリへ統合する
- The portfolio shall Day73を公開済みの一覧へ追加する。
- The offbeat game shall サブフォルダ配信で全ての音・操作・素材を利用できる。
- When 共有を選ぶ, the offbeat game shall 共通共有欄から正式な公開URLを渡す。
- The offbeat game shall canonical・OGP・CSPと公開ゲートの契約を満たす。
## 3. 記録と反映
- When 最新コミットのCIが成功する, the delivery process shall PRをマージし、本番の主要操作を確認する。
- The delivery process shall 制作先・PR・本番URL・検証をObsidianに記録する。
## 境界
新しいDayと、その仕様・テスト・自動一覧更新を対象とする。他Dayの機能変更、SNS投稿、第三者へのメッセージ送信は含めない。

## 4. スマホで演奏する
- When 幅640px以下または幅960px以下・高さ500px以下のタッチ端末で開く, the offbeat game shall スマホ専用の演奏画面を表示する。
- The mobile UI shall A・B・ミキサーを切り替え、縦に長い盤面と固定操作の重なりを避ける。
- When タブを切り替える, the audio shall 再生位置・テンポ・ミックス・スコアを保ち、ドラッグ中のスクラッチを解放する。
- The mobile UI shall 再生・4パッド・フェーダー・目標・残り時間・スコア・拍ガイドをスクロールせず使える。
- The mobile UI shall 主要なボタンとスライダーに44px以上のタッチ領域を用意し、320×568px以上で盤面を隠さない。
- When ミキサーを開く, the mobile UI shall A/B両方のEQ・フィルター・音量とECHOを操作できる。
- When 画面を回転またはリサイズする, the mobile UI shall 状態を保って配置を変え、PCでは2デッキを同時表示する。
- The mobile UI shall セーフエリアとブラウザの表示高に対応し、選曲・設定・共有・結果のダイアログをスクロールして閉じられる。
