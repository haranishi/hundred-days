# Day047 v2 実装契約（面・描画・画面＝Claude Opus）
目的: DESIGN-v2.md §4〜§6・§8 の「1周目」を、境界 day047-v2-boundary.md のとおりに 20面の再配置・描画・HUD・結果・保存・テスト・文書へ実装する。
範囲: 所有ファイルのみ。`lib/physics.js` `lib/entities.js` `lib/levels.js` `lib/autopilot.js` は物理担当が同時に編集中＝読むだけ。物理側の新フィールドがまだ無くても、境界の名前で先に書く（`state.ability ?? null` のように欠けても落ちない書き方）。
やること:
1. `lib/level-data.js`: §6の表と§8の置換で20面を再配置（幅・par秒・敵数は表のとおり）。各面 `o`2・`*`6（主路3＋任意路3）・`P/G`各1。主路は既存記号だけで通れる。穴は最大2マス、段差最大2マス、着地幅48px以上、1画面の敵3体以下、初登場の前後64pxに穴・つらら無し、新規ルール初登場は1面1つ。`secretMochi`・`parTicks`・`entityOptions`・`routes` を各面に書く。4-5は最後16列を安全な雪床にする。
2. 自分で検証: 新記号 `RBFSJ%` を `.` に置き換えた地形で、既存の `tests/helpers.mjs` と同じやり方（`createAutopilot`＋`step`）で20面が戸口に届くことを確かめる（物理側の更新を待たない）。
3. `lib/render.js`: 新エンティティの描画（`phase` に応じた予告の絵・退場の16px上昇・枝の振動）、`M`・`^` を実座標で描く（`drawY` は `G` だけ）、能力アイコンを足元に、得点の浮き文字（+100・×2を60tick）、風の矢印は今回不要。
4. `app.js` `index.html` `app.css`: HUD上端1行（面番号／姿／残機／米俵 n/6／能力＋残秒／時間／お札3枠）、面開始の1行説明（初登場要素だけ3秒）、結果画面（面内得点・ベスト更新・3条件の実数・「次へ」「もう一度」「面えらび」）、面えらびに各面のお札0〜3枚とベスト、4-5の締め文（§6末尾）。`window.__day047` の既存窓口（`begin/setInput/autopilot/recordEvents/events/setManual/advance/unlockAll/snapshot/mode`）は残す。
5. `lib/store.js`: v2 記録の保存・読込・不正値の破棄。
6. テスト（`tests/sprites|store|app.test.mjs`、`tests/index.mjs` に登録）と E2E（`tests/e2e/day-047.spec.mjs`）の更新。E2Eは `npm run build && npx playwright test tests/e2e/day-047.spec.mjs` で自分で回す（先に `lsof -nP -iTCP:4173` で孤児サーバーを確かめる）。
7. `REQUIREMENTS.md` と `README.md` を実装に同期（READMEは100行以内。「人が描いた」とは書かず「生成画像を自動縮小せず1マスずつ置いた」と書く）。
8. 実ブラウザで目視: Playwright（`PLAYWRIGHT=<リポジトリの node_modules/playwright/index.js>`）でミニHTTPサーバーから開き、1-1・1-3・3-3・4-5のスクリーンショットを `（評価用の作業フォルダ）/round1/` に保存する。
検証: `node --test day-047-namahage-night/tests/` と E2E を自分で実行。
対象外: git操作・precheck・所有外ファイルの編集・`lib/sprites/props.js` の既存8原画の変更（配列の転記や追加フレームは可）。
報告: 変更ファイル、テスト件数、20面の到達確認結果、境界から外れた点、スクショの場所。
