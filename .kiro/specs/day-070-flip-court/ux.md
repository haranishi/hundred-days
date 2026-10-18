# 操作と画面の設計

## ユーザーストーリー
短時間で遊びたい1人が、説明からCPU戦へ進み、自分の一打の反転を見て、結果からもう一度挑戦する。
相手募集や登録を挟まず、スマホでは片手の左右ドラッグ、PCでは左右キーを中心にする。

## UX5階層
| 層 | 判断と画面への反映 |
|---|---|
| 戦略 | 1人で始め、60秒で決着。開始操作と再戦を最優先する |
| 要件 | 6×6盤・CPU・反転・時限・pause・結果・共有を1画面につなぐ |
| 構造 | intro→合図→対戦→結果。説明/共有を開くとpause、再開は明示操作 |
| 骨格 | 上に両陣営の得点と時計、中央に大きなコート、下に補助操作。PCは説明を横に置く |
| 表層 | 紙色と深い緑のスポーツ感。暖色の丸と青緑の菱形で陣営を分ける |

## 見た目
背景は#f6f1e7、本文は#183d34、コートは#184e42。自分は暖色、CPUは青緑。
マスは濃い印を読み取れる明るさにし、丸と菱形でも陣営が分かるようにする。
外部フォントを使わず、system-uiと日本語のシステムフォントを使う。数字はtabular-nums。
装飾のフラッシュや粒は控えめにし、reduced-motionでは抑える。ボール移動はゲームの情報として残す。
PCで盤面を小さく埋もれさせず、スマホでは画面高に合わせてコートを縮める。

## DOM契約
| ID | 役割 |
|---|---|
| app | data-phaseで現在のphaseを示す主領域 |
| court | tabindex=0のCanvas。世界座標600×760を拡大縮小する |
| player-score / cpu-score / timer | 陣地数・残り秒 |
| intro-panel / start | 最初の説明・CPUと対戦する |
| countdown | 合図のテキスト |
| pause-panel / resume | 中断の表示・つづける |
| result-panel / result-title / result-player / result-cpu / replay / result-share | 勝敗・陣地・再戦・共有 |
| feedback | role=status。着地と反転を簡潔に伝える |
| pause / help / share-open | 一時停止・遊び方・共有の44px以上の操作 |
| help-dialog / share-dialog | native dialog。中にdata-close属性の閉じるボタン |
| share | 既存sharedが共有ボタンを配置する場所 |
| unsupported | 描画不可時の案内。通常はhidden |

## RuntimeとViewの契約
ViewのcreateRenderer(canvas)はresizeとrenderを返す。DOMの表示切替はRuntimeが担当する。
ViewはMatchを変更せず、board/ball/playerX/cpuX/lastLandingを描く。
Canvasの実解像度は表示サイズとdevicePixelRatioに合わせる。ポインタも同じ表示矩形から世界座標へ変換する。
ドラッグはpointer capture、up/cancel/lostcaptureで終了し、複数指が割り込んでも操作対象を混ぜない。
PCは左右矢印・A/D。キーを離す・画面から焦点が外れる・pause/再戦で入力を捨てる。
起動時に描画機能を確認し、取得できなければ開始を無効にして案内を表示する。

## 焦点と中断
開始/再開後はCanvas、結果表示後は再戦ボタンへ焦点を移す。
dialogの閉じる操作は起点ボタンへ焦点を戻す。説明/共有から戻っても自動再開しない。
visibilitychangeとwindow blurでは入力を捨て、進行中ならpauseする。
再開と再戦は唯一の描画ループを再始動し、古いフレームを現在の試合へ適用しない。

## 確認する画面
幅360/390/768/1440、intro・対戦・pause・結果・共有を確認する。
色と印、陣地数、反転した場所、次の操作が分かることを実画像で評価する。
日本語の行分け、44px以上の操作、横はみ出し、焦点と共有の失敗復帰も実操作で確認する。
