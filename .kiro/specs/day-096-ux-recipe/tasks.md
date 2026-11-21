# 実装タスク（UXレシピ）

グラフ: 0 → (1・2・3・4・5・6 を並行) → 7 → 8 → 9 → 10 → 11 → 12 → 13。1〜6 は担当ごとに隔離したコピーで作り、親が「担当の範囲内のファイルだけ」を回収する。
担当どうしは契約（`lib/contract.js`・`interfaces-*.md`）だけでつながる。完了は、試験の出力か実ブラウザの証拠で判断する（担当の「できました」だけでは受け取らない）。

- [x] 0. 土台と契約（親）
  - 契約・見本の骨格・見本の部品（hero・cta）・描画の道具・ページのCSSの土台と4テーマ・撮影と開発サーバー・契約の試験16件・仕様・根拠調査・依頼書。
  - _Boundary: lib/contract.js, render-kit.js, render.js, page-*.js, blocks/index.js・_generic.js, tests/{core/contract,render/render-contract,fixtures}, tools/, .kiro/specs/_
- [ ] 1. 状態の核（A1・Codex）: state・codec・persist・export-html と試験。 _Requirements: 3・6・7・8・10_
- [ ] 2. 中身と診断（A2・Codex）: blocks・recipes・rules と試験（根拠調査の範囲だけで書く）。 _Requirements: 1・4・12_
- [ ] 3. ページの見た目・前半（B1・Antigravity）: hero pain benefits steps proof voices story team。 _Requirements: 2・5・9_
- [ ] 4. ページの見た目・後半（B2・Antigravity）: menu plans schedule faq compare guarantee limited form cta access footer。 _Requirements: 2・5・9_
- [ ] 5. 画面の骨格（C・Codex）: 目的画面・構成リスト・ドラッグ・プレビュー・部品箱・見るだけ・キー操作。 _Requirements: 1・2・9_
- [ ] 6. パネル群（D・Codex）: 編集・診断・見た目・共有・書き出し・保存・PNG。 _Requirements: 3・4・5・6・7・8_
- [ ] 7. 統合（親）: 範囲内のファイルを回収・契約の食い違いの修正・全試験・実ブラウザで通し・差し戻し（最大3周）。
- [ ] 8. E2E と実機相当（親）: Chromium・WebKit・スマホの指（CDP）・CPU4倍の遅さ・日本語入力・本番CSP。`tests/e2e/day-096.spec.mjs`。
- [ ] 9. 体験の採点（実際に使う・最大3周）: Antigravity（Grok は残高が戻れば加える）。非ゲームの読み替え（初見で着手・完了の速さ・初回の負担・毎日使っても邪魔にならない）。
- [ ] 10. 見た目の採点（画像のみ・最大3周）: Codex（`-i`）・Antigravity（・Grok）。体験が合格してから。固定ショット `tools/scoring-shots.mjs`。
- [ ] 11. 独立コードレビュー（実装者と別系統・読み取り専用）と、文言の事実の照合（根拠調査との突き合わせ）・権利と漏洩の全文確認。
- [ ] 12. 公開の基盤（親）: meta.json（published・X投稿文・AI分担・失敗と直し）・README・screenshot・根の README と THIRD_PARTY・shared の同期・公開ゲート・`npm run check`。
- [ ] 13. PR → 本人の承認 → マージ → 本番確認（`gh pr merge` の方式は個人リポの決まりに従う）。X投稿と実機の確認は本人。
- [x] 14. 宣伝動画（親＋Codex。証拠は verification.md の「宣伝動画」）: 絵コンテ `tools/promo/timeline.mjs` → 撮影・書き出し `render-promo.mjs`（親）／BGM・効果音の合成と数値検査 `promo-audio.mjs`・`verify-audio.mjs`（Codex）→ 画像だけの採点（Grok・Codex・Antigravity・最大3周）→ `demo.mp4`・meta.json・README → PR → 本人の承認 → マージ。BGMは耳で聴くのは本人。 _Requirements: 13_

## 証拠の置き場
`verification.md`（試験の件数・採点の点・独立レビューの指摘と対応・実機の確認を、実施のたびに追記する）。作業記録は `.agent-harness/runs/day096-ux-recipe.md`。

## 作り込みの余地（合格のあとで、時間と採点の結果を見て）
複数画面の流れ・完了画面・文章のトーン切替・部品を足す（v2 候補。design.md）。入れなかったものは README の「まだないこと」に書く。
