# 設計: ふたりの着地点

## Boundary Commitments
本仕様はDay086の候補選択・場所指定・画面を所有する。共有とビルドは既存基盤を利用する。
Out of Boundary: 他Day、API提供元のデータ品質、実際の経路、予約、利用履歴。
Allowed Dependencies: ブラウザ標準API、OpenPOI API、共通share.js/css、既存Playwright。
Revalidation Triggers: APIの検索仕様・データ項目、距離換算、配信先、共有基盤の変更。

## ユーザーストーリーとUX5階層
外出中の人として、相手に3問だけ答えてもらい、候補を比較し続けず次の行き先を決めたい。
受け入れ: 回答→場所取得→1軒の提示→別候補か道案内まで途切れない。
- 戦略: 判断の負担を減らし、次の行動を1つ明確にする。
- 要件: 同行者＋3問、徒歩3分/10分、最大3軒。未取得の写真・評価は出さない。
- 構造: 同行者→気分→空間→距離→場所取得/検索→結果。戻ると回答を保持。
- 骨格: 質問と主ボタンを1枚の紙のようなパネルに集める。場所変更を常に利用可能にする。
- 表層: 既存コンセプトの生成り・焦げ茶・テラコッタ。日本語システム書体、独自SVG、控えめな遷移。

## Architecture / File Structure Plan
| ファイル（Day内） | 責任・対応要件 |
| --- | --- |
| lib/choices.js | 質問と回答の定義、1.1–1.4 |
| lib/recommend.js | データ検証・重複除去・距離・条件による候補整列・地図URL、3.1–3.4,3.6 |
| lib/openpoi.js | 固定ホストへの検索、時間切れ・中断・応答検証、2.3,3.5 |
| app.js | 画面状態、位置取得、非同期処理の世代管理、2.1–2.4,3.3,3.5,4.1 |
| index.html / app.css | 質問・結果・場所パネル、共有配置、1.1–1.4,3.2,3.6,4.2,4.3 |
| assets/*.svg / favicon.svg / og.png | 独自イラストと共有画像、4.4 |
| meta.json / README.md / NOTICE.txt | 公開メタ・制約・データ提供元の通知、4.4 |
| tests/*.test.mjs（配信除外） | 距離境界・候補選択・通信契約の検証 |
リポジトリ内: scripts/build.mjsのCONNECT_BY_APPだけ通信先を追加、README一覧とsharedを既存スクリプトで同期。
ブラウザ検証: tests/e2e/day-086.spec.mjs。仕様と検証記録は.kiroと.agent-harnessに置き、アプリへ配信しない。
依存方向: choices → recommend → app、openpoi → app。ロジックはDOMへ依存しない。

## 外部契約と候補選択
- OpenPOI: GET /v1/search?q&center=lng,lat&radius&limit=100。場所指定は /v1/suggest?q&limit=5。
- APIはキー不要・CORS対応。固定ホストhttps://api.openpoiapi.comだけCSPに追加する。
- 応答results/suggestionsを検証。空の座標・不正数値・名前なし・低精度座標を除外する。
- 気分別キーワードで検索後、対象カテゴリと名称を照合し、無関係な施設・重複を除く。
- 徒歩圏: 3分=180m、10分=600m。距離は直線、目安時間は直線距離×1.3÷80m/分の切上げ、最低1分。
- APIの完全一致例外で遠方が返るので、クライアントでも半径を厳守する。
- 空間は大まかな施設種別の優先順位に反映する。静けさを実測したとは表現しない。
- 結果は最大3件。距離を主に、同程度の距離なら回答と合う種別を優先。別候補は一巡後に循環させない。
- Google Maps URLは目的地の緯度経度とtravelmode=walking。現在地をリンクへ埋めず、地図側で出発地を選ぶ。
- 外部文字列はtextContentで表示。URLへは検証した数値と固定のパラメータだけを入れる。

## 状態と失敗からの復帰
状態: companion / question(0..2) / loading / result / empty / error。
場所パネルはdialogで独立。取得・検索中は進行ボタンを止め、キャンセルで待機状態に戻せる。
画面遷移・場所変更ではAbortControllerと世代番号で古い応答を破棄。GPSにも世代番号を適用する。
GPSはenableHighAccuracy:false、timeout:10000、maximumAge:60000。取得後の精度が粗い場合は目安を表示。
APIは10秒の上限、失敗を空配列と混同しない。手動再試行だけ行い、無制限の自動リトライはしない。
場所・回答・結果はメモリだけ。外部へ送る座標・検索語を送信前に説明。共有はcanonicalのみ。

## 検証と公開ゲート
単体: 半径境界/無効座標/重複/気分/空間/同行者/最大3軒/URL、通信パラメータ/失敗/中断。
E2E: 4択×2択×2択、戻る、GPS拒否と場所指定、0件、失敗・再試行、古い応答、結果切替、Googleリンク、共有・フォーカス。
配信CSPを応答に適用してAPI検索を確認する。390/768/1440pxの実操作と画像を残す。
npm run check、Day086 E2E、npm run publish:check -- --day 86。/100days/へのマウントでも主要フローを確認する。
新DayはpublishedのPRを準備するが、マージとSNS投稿は本人の操作として残す。
