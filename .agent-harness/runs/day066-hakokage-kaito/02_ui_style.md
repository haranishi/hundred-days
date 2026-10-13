# 見た目の数値（色・文字・間隔・動きのトークン。音は 02_ui_states.md）

夜の美術館。地は暗い紺、光の当たるマスは暖かい黄、影はほぼ黒。三段の明るさ（光＞床＞影）で、どこが危ないかを一目で分ける。
暗い配色だけにする（`color-scheme: dark`・`<meta name="theme-color" content="#0e1320">`）。明るい配色は作らない：光と影の見立てが逆になるため。

## 色（CSS 変数。`:root` に置く）とコントラスト比

比は相対輝度（sRGB・指数2.4・WCAG と同じ式）で計算した。文字は4.5以上、部品の縁と盤の上の区別は3以上を目標にした。

| 変数 | 値 | 使い道 | 比（相手） |
|---|---|---|---|
| --bg | #0e1320 | ページの地 | — |
| --surface | #161d2e | 帯・結果の欄・窓 | — |
| --surface-2 | #212b44 | ボタンの面 | — |
| --ink | #eef1f7 | 本文・ボタンの文字 | 16.39（bg）・14.86（surface）・12.43（surface-2） |
| --ink-sub | #b9c2d6 | ヒント・補足・面の番号 | 10.37（bg）・7.87（surface-2） |
| --line | #6f7c9b | ボタン・窓の縁（1.5px） | 4.44（bg）・4.03（surface） |
| --focus | #7cc4ff | フォーカスの輪（3px） | 9.89（bg） |
| --primary / --primary-ink | #eef1f7 / #0e1320 | 主ボタン（次の面へ・ひとつ戻す）の面と文字 | 16.39 |
| --surface-hover / --surface-press | #2a3654 / #2c3a5c | ボタンに載せた・押している面 | 10.58・9.94（ink） |
| --primary-hover / --primary-press | #ffffff / #d9dee9 | 主ボタンに載せた・押している面 | 18.54・13.75（primary-ink） |
| --danger | #ff6b6b | 見つかった欄の縁と見出し | 6.06（surface） |
| --warn | #ffb347 | 詰みの欄の縁と見出し | 9.44（surface） |
| --ok | #5fd39b | 成功の欄の縁と見出し・開いた出口 | 9.03（surface）・7.56（floor） |
| --floor | #232b40 | 盤の床 | — |
| --grid | #2a3350 | 格子線（1単位） | 飾り。区別には使わない |
| --wall / --wall-top | #3a4256 / #6f7c9b | 壁と、その上面の帯（12単位）・盤の外枠。壁には 3単位の --shadow の縁 | 3.37（wall-top / floor）・4.94（縁 / lit-cell） |
| --shadow | #05070c | 影のマス | 1.43（floor）※明るさの差に加え、箱から伸びるくさびの形で区別する |
| --light | #f3cf63 | 斜線・予告の点線・予告の矢印・懐中電灯 | 9.33（floor）・13.35（shadow） |
| --lit-cell | #8b7d52 | 警備員の光のマスの塗り | 3.46（floor）・4.94（shadow） |
| --laser / --laser-case | #ff4d6d / #2a0710 | レーザーの芯と外側の太線 | 4.38（floor）・4.53（case / lit-cell） |
| --box / --box-edge / --box-tape | #c98f55 / #4a2f12 / #e7c78f | 箱の面・縁（5単位）・テープ | 5.06（box / floor）・3.02（edge / lit-cell） |
| --gold / --gold-edge | #f6c945 / #7a5a0e | 宝・星（塗り） | 8.96（floor） |
| --guard / --guard-rim | #6a93ee / #e6eeff | 警備員の体と縁（5単位） | 4.71（floor）・3.50（rim / lit-cell） |
| --player / --player-rim | #0b0d13 / #f2f5fb | 怪盗のシルエットと縁（5単位） | 3.73（rim / lit-cell）・18.45（rim / shadow） |
| --exit-closed | #5b6886 | 閉じた扉（錠の印つき）。縁 4単位の --line | 3.37（縁 / floor） |
| --badge / --badge-ink | #e6eeff / #0e1320 | 盤の上の番号札・「お手本」の札 | 15.93（文字）・12.10（札 / floor） |

見つかった印の二重枠は、外 `--danger`（床に対し5.08）と内 白（光のマスに対し4.08）。どちらの地の上でも片方が3以上になる。怪盗の上の「！」は --danger の丸（白の縁）に --badge-ink の文字（6.68）。
光のマスの上でも見えるよう、予告の点線・巡回の道・宝・壁には 2〜4単位の --shadow の外線を下に敷く（光のマスに対し4.94）。
色だけに頼らない対応：警備員の光＝斜線、レーザー＝外側の太線＋台の稲妻、予告＝点線の枠、巡回の道＝中心を結ぶ破線、影＝箱から伸びるくさび、出口＝錠と矢印の形、星＝塗りと文字（「星2つ」）。

## 文字のトークン（書体は外から取りに行かない）

| トークン | 値 | 使い道 |
|---|---|---|
| --font | `system-ui, -apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif` | 全部 |
| --fs-h1 | 22px／800（compact・tiny 18px、wide 28px） | h1 |
| --fs-title | 17px／700 | 面の名前・窓の見出し |
| --fs-panel | 20px／800 | 結果の欄の見出し |
| --fs-body | 16px／400・行間 --lh-body 1.6 | 結果の文・あそびかた・ボタン（ボタンは700） |
| --fs-hint | 15px／400・行間1.6 | ヒント・状態のラベル（14px）・操作の「待つ」（700） |
| --fs-num | 18px／700・`tabular-nums` | 手数・最少の数字 |
| --fs-small | 13px／700 | 面の番号「面3/8」・「戻す」「最初へ」・フッター（400）。**これより小さい文字を作らない**（SVG の中は34単位以上＝最小のマスで12.6px） |

折り返し：本文に `word-break: keep-all; overflow-wrap: anywhere;`。区切りたい所に `<wbr>`。`auto-phrase` は使わない。

## 間隔・縁・角丸・影・重なりのトークン

| トークン | 値 | 使い道 |
|---|---|---|
| --space-1〜6 | 4・8・12・16・24・32px | すき間はこの段だけを使う |
| --gutter | 12px（幅<400）／16px | 画面の左右の余白 |
| --gap | 8px（tall・wide）／6px（compact・tiny・short） | 部品と部品の間。layout.mjs の SIZES と一致 |
| --pad / --pad-gap | layout.mjs の SIZES（60/52/48/52/64px） | 十字ボタンの1辺とすき間。JS が `html` に入れる |
| --border | 1.5px | ボタン・窓の縁 |
| --focus-ring | 3px solid --focus・外へ2px | フォーカスの輪 |
| --radius-btn / --radius-panel / --radius-board / --radius-pill | 12px / 16px / 12px / 999px | ボタン／結果の欄・窓／盤の外枠／番号の札 |
| --accent-w | 6px | 結果の欄の左の色の帯（見つかった＝danger・詰み＝warn・成功＝ok）と、同じ色の絵の印（目・錠・星） |
| --shadow-1 / --shadow-2 | `0 8px 24px rgb(0 0 0 / .35)` / `0 16px 48px rgb(0 0 0 / .5)` | 結果の欄・一言／窓 |
| --z-sticky / --z-toast | 10 / 20 | 下に固定した操作／一言（窓は top layer なので使わない） |

## 動きのトークン（使い方の表は 02_ui_states.md）

| トークン | 値 | 動きを減らす設定 |
|---|---|---|
| --dur-move / --dur-fast / --dur-mid / --dur-flash | 150 / 120 / 300 / 1000ms | すべて 0ms（`@media (prefers-reduced-motion: reduce)` で上書き） |
| --dur-toast | 1600ms（一言を見せておく長さ） | そのまま |
| --ease-out / --ease-in-out | `cubic-bezier(.2, .8, .2, 1)` / `cubic-bezier(.4, 0, .2, 1)` | — |

## 部品とトークン（design-system の型。状態は 02_ui_states.md）

| 部品 | 種類 | 大きさ | 使うトークン |
|---|---|---|---|
| 帯 | 1つ | 高さ44px（wide 52px） | --surface・下に --border の --line・--fs-small（ホーム）・--fs-body（共有） |
| 面の帯 | 1つ | 高さ48〜52px・◀▶は44×44 | 中央は --surface-2・2行（「面3/8」と星は --fs-small、名前は --fs-title） |
| 十字ボタン | 矢印・待つ・戻す・最初へ | 1辺 --pad | --surface-2・--radius-btn・--fs-hint（待つ）・--fs-small（戻す・最初へ） |
| ボタン | 主・副・絵だけ | 高さ44px以上・左右の余白 --space-4 | 主 --primary、副 --surface-2、絵だけ 面なし |
| 結果の欄 | 見つかった・詰み・成功 | 余白 --space-3・幅いっぱい | --surface・--radius-panel・--accent-w・--shadow-1 |
| 窓 | あそびかた・面の一覧・共有 | 幅 min(92vw, 480px) | --surface・--radius-panel・--shadow-2・見出し --fs-title |
| 一言 | 1つ | 1行・盤の上端の中央 | --surface-2・--radius-pill・--fs-hint・--shadow-1 |

やってはいけないこと：`--light`（警告の黄）をボタンや飾りに使わない（光＝危険の意味が崩れる）。`:root` の外に色や px を直書きしない（実装の最後に design:design-system の audit で数える）。
