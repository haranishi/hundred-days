# Day046 v2 2周目契約（物理・自動操作・観測＝Codex）
前提: 1周目の採点 `（評価用の作業フォルダ）/score-round1.md` を読む（TOP5 の 1・2・5 があなたの担当）。境界 day046-v2-boundary.md は据え置き。所有ファイルも1周目と同じ。
やること:
1. **観測ログの契約を固定する**（画面担当と評価が読む）。`state.telemetry` の各要素は
   `{ type: 'stomp'|'hit'|'miss'|'collect'|'ability'|'clear'|'visible', tick, entityId?, kind?, cause? }`。
   - `hit`（被弾）と `miss`（ミス）は必ず `cause: 'fall'|'ground'|'air'|'icicle'|'boar'|'rabbit'`（地上敵=`ground`は犬、空中敵=`air`はカラス、うさぎ・イノシシは固有名）。
   - `visible` は敵（C/D/R/B）が初めてカメラ窓（主人公x−110〜+210px）に入ったtickに1回だけ出す。予告開始は `type:'warning', entityId, tick`、危険動作開始は `type:'moving', entityId, tick` を出す。
   - `collect` は `kind: 'rice'|'mochi'|'secret'|'F'|'S'`。`ability` は取得/置換/失効/被弾消失を `kind` で区別。
2. **safe の自動操作で 1-1 の最初のうさぎを「踏む」**（採点項目1: 開始10秒以内に踏み1回）。前方の R が waiting/warning で床上にいるとき、跳び越すのではなく上から踏むタイミングで跳ぶ（着地点が敵の上面になるよう、距離と滞空から発射位置を決める）。踏めない配置なら従来どおり越す。
3. **collect の自動操作で全回収を狙う**（採点項目6: 米俵6/6＋任意餅1/1）。`routes.reward` と収集物の座標を目標に、J（乗って高く跳ぶ）・%（渡る）・F（押し続けて滑空）・S（助走）を使って上段へ入り、地上へ戻って戸口へ。**面データは直さず**、いまの `lib/level-data.js` に対して面ごとに `米俵n/6・任意餅・到達` を報告する。
4. `tests/helpers.mjs` の「app.js の import 行を正規表現で剥がして差し替える」方式をやめ、`app.js` を素直に読み込める形（DOM と localStorage の最小スタブ＋ `import()`）にする。app.js の中身は変えない（画面担当の所有）。
5. 決定性: 入力列の固定再生で全tick・全状態（`telemetry` を含む）が一致することを、`tests/physics.test.mjs` で20面ぶん確かめる（走行1で入力を記録→走行2で再生→毎tick `JSON.stringify` 比較）。
6. 「能力なし主路」: `F S` を `.` に置き換えた20面で safe が到達することをテストに加える（既存の敵込み到達テストは残す）。
検証: `node --test day-046-namahage-night/tests/` と `node --test day-*/tests/`。git・ブラウザ・E2E・build・precheck はしない。
報告: 変更ファイル、テスト件数、1-1で踏んだtick、collect の面別回収表、決定性の結果。
