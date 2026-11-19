# 実装タスク

グラフ: 0 → (1・2・3・4 を並行) → 5 → 6 → 7 → 8。1〜4 は担当ごとにファイルが分かれ、契約（lib/contract.js・interfaces-*.md）だけでつながる。
完了は、テストの実行結果か実機の証拠で判断する（担当の「できました」だけでは受け取らない）。

- [x] 0. 土台と契約を作る（親）
  - フォルダ・vendor/three.js・LICENSE・契約（contract.js・rng.js・noise.js）・見本の骨格・撮影の道具・仕様・テストの入口。
  - _Boundary: day-095-bonsai/lib/contract.js, rng.js, noise.js, tests/{index,shared,fixtures}, tools/, .kiro/specs/day-095-bonsai/_
  - _Requirements: 10.1_
- [ ] 1. 木のモデル（A・Codex）
  - calendar・species・look・tree（苗・成長・切る・曲げる・芽摘み・保存）・pick・history と試験。
  - _Boundary: lib/calendar.js, species.js, look.js, tree.js, pick.js, history.js, tests/core/_
  - _Requirements: 2.1〜2.4, 3.1〜3.3, 4.1〜4.2, 5.1〜5.4, 7.1〜7.2_
- [ ] 2. 木と葉の描画（B・Grok）
  - 幹・枝・根張り・針金の管、葉のカード、質感、光（朝昼夕夜）、季節の粒、カメラ、写真、view3d。
  - _Depends: 0（見本の骨格で先行）_
  - _Boundary: lib/view3d.js, tree-mesh.js, wire-mesh.js, foliage.js, textures-tree.js, stage.js, capture.js, tests/render/_
  - _Requirements: 1.1〜1.3, 2.2, 3.3, 5.3〜5.4, 6.2〜6.3, 8.1, 9.2, 9.7_
- [ ] 3. 卓・鉢・壁（C・Antigravity）
  - diorama（3つの鉢・土・苔・石・卓・和紙の壁）と質感。
  - _Depends: 0_
  - _Boundary: lib/diorama.js, textures-stage.js, tests/render/diorama.test.mjs_
  - _Requirements: 6.1〜6.2_
- [ ] 4. 画面と操作（D・Codex）
  - index.html・css・app・controls・ui・store・audio・lore。モデルと描画は契約どおりに呼ぶ（未完の間は代用品）。
  - _Depends: 0_
  - _Boundary: index.html, app.css, app.js, lib/controls.js, ui.js, audio.js, store.js, lore.js, favicon.svg, tests/ui/_
  - _Requirements: 1.2〜1.4, 2.1, 3.1, 4.1, 5.1, 7.1〜7.2, 8.1〜8.2, 9.1〜9.6_
- [ ] 5. 統合する（親）
  - 代用品の撤去・契約の検証（validateSkeleton）・実ブラウザで通し・固定ショットの撮影・食い違いの修正。
  - _Depends: 1,2,3,4_
- [ ] 6. 公開の基盤を整える（親）
  - meta.json（published）・README・og/screenshot・THIRD_PARTY・根のREADME一覧・shared同期・E2E（指の操作を含む）・公開ゲート・`npm run check`。
  - _Depends: 5_
  - _Boundary: meta.json, README.md, og.png, screenshot.webp, THIRD_PARTY_NOTICES.md, README.md(根), tests/e2e/day-095.spec.mjs_
  - _Requirements: 9.1, 10.1〜10.2_
- [ ] 7. 評価と照合（Grok・Antigravity・Codex・親）
  - 体験の採点（Grok・実際に遊ぶ）・見た目の採点（Antigravity と Grok・画像のみ）を最大3周。独立コードレビュー（Codex・読み取り専用）。文言の事実の照合（Codex・検索つき）。権利・漏洩の全文確認。
  - _Depends: 6_
- [ ] 8. PR とマージ
  - 作業枝を push、公開用（published）でPR、CI の全通過、mainとの衝突の解消、承認を得てマージ、本番の確認。X投稿と実機の確認は本人。
  - _Depends: 7_

## P1 の扱い
梅・直幹/斜幹・水やり・夜の光・早送り・自動で回る・針金を外す・写真の画像つき共有は、P0 の合格のあとで、残り時間と採点の結果を見て入れる。入れなかったものは、PR本文と README の「まだないこと」に書く。

## 証拠の置き場
`verification.md`（試験の件数・採点の点・独立レビューの指摘と対応・実機の確認を、実施のたびに追記する）。
