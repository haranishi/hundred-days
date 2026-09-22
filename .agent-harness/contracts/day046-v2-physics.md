# Day046 v2 実装契約（物理・敵・検証核＝Codex）
目的: DESIGN-v2.md §2〜§5・§8 の「1周目」を、境界 day046-v2-boundary.md のとおりに `lib/physics.js` `lib/entities.js` `lib/levels.js` `lib/autopilot.js` と自分のテストへ実装する。
範囲: 所有ファイルのみ。`lib/level-data.js` と `lib/sprites/` と `app.js` は画面担当が同時に編集中＝読むだけ。
やること:
1. `levels.js`: 新フィールドの既定値・`entityOptions` による `M` の軸/位相。
2. `entities.js`: `R`（96tick待機→末尾36tick予告→vy-210/vx48で跳ぶ→着地で待機、往復48px）、`B`（96px以内で方向固定→48tick予告→vx±96で60tick突進→72tick休息）、`J`（乗ると vy=-380・空中ジャンプ回数1）、`%`（乗って48tickで消失、末尾24tick振動、240tickで復帰、重なり中は延期）、`F/S` 収集物、退場 `retireTicks`。予告→動作は画面内から0.5秒以上後。乱数なし。
3. `physics.js`: 能力スロット1個（F=滑空: 重力240・下降上限70、押下中のみ／S=最高速150・加速1000・摩擦1200/氷300、8秒）、失効・置換・被弾消失、連続踏み倍率、得点、任意餅、`pendingStage`、面内得点とミス巻戻し、`clearResult`、`telemetry`。踏み判定に「相対下降量が正」を追加。
4. `autopilot.js`: safe/collect。safe は R/B（止まっている間に越す・跳んだ下を抜ける・上から踏む）と `%`・`J` を扱い、能力なしで主路を通る。
5. テスト: 各機構の単体（予告→動作の時刻、能力の前後差＝§7の C 条件、置換・失効・被弾消失、枝の復帰延期、雪台の押下差、巻戻し、天井保留、決定性＝同じ入力列で全状態一致）。到達テストは `lib/level-data.js` の**その時点の**20面に対して safe で走らせ、落ちた面は「面ID・座標・原因」を報告に書く（面データは直さない）。
検証: `cd <ローカルパス> && node --test day-046-namahage-night/tests/` を自分で実行。他Dayを壊さない（`node --test day-*/tests/`）。
対象外: git操作・ブラウザ・E2E・build・precheck・所有外ファイルの編集。
報告: 変更ファイル、テスト件数、境界から外れた点、到達できなかった面の一覧。
