# 実装タスク（さばき場）

方針: 最初に**アジの三枚おろし**を端から端まで通し（縦の薄い一片）、見た目と動きを確かめてから8種へ広げる。
担当は隔離したコピーで並行し、契約（`lib/contract.js`・`interfaces-*.md`）だけでつながる。親は「担当の範囲内のファイルだけ」を回収する。完了は試験の出力か実ブラウザの証拠で判断する。

- [x] 0. 土台と契約（親）: 仕様・契約・契約の試験・調査R4・three.js の同梱。
- [ ] R. 調査: R1a・R1b 手順（Codex）・R2 形の数値（Antigravity）・R3 安全の公的基準（Codex）。→ `research/`
- [ ] 1. 解剖と形（WP-1・Codex）: anatomy・profile・loft・pieces・bones・fins・head・species/aji・形の試験・`tools/geometry-report.mjs`。 _Requirements: 3・4・11_
- [ ] 2. 時間・包丁・練習の採点（WP-2・Codex）: timeline・knife・easing・practice・アジの手順の叩き台と試験。 _Requirements: 2・4・5_
- [ ] 3. 視点と描画の土台（WP-3・Codex）: view3d・camera・controls・gfx・stage・capture・開発の道具（serve・shots・viewer）。 _Requirements: 3・6・11_
- [ ] 4. 画面の骨格（WP-4・Antigravity）: index.html・app.js・app.css・app-state・persist・router・ui-*・スタブ。 _Requirements: 1・2・6・7・8・9・10_
- [ ] 5. 統合（親＋Codex）: scene-fish（状態→部品・包丁・切り込み）・アジを画面で通す・撮影して見る（最大3周の磨き）。
- [ ] 6. 材質と見た目（WP-B・Antigravity＋Codex）: 皮（うろこ・色・模様）・身（筋節・血合い）・骨・内臓・目・ヒレ・まな板・光。固定ショットで磨く。
- [ ] 7. 8種へ広げる（WP-5・Codex）: species 8・procedures 8・部位と使い道・用語・さばく前に（根拠は research/）。方法ごとの部品の動きを足す。
- [ ] 8. なぞって練習・読み上げ・画面を消さない・結果カード（P1）・左利き・透視の通し。
- [ ] 9. E2E: 全種の全手順・左利き・透視・練習・共有・外部通信0・本番CSP・指（CDP）・WebKit。 `tests/e2e/day-097.spec.mjs`
- [ ] 10. 体験の採点（実際に使う・最大3周）→ 見た目の採点（画像のみ・最大3周）。固定ショット `tools/scoring-shots.mjs`。
- [ ] 11. 独立コードレビュー（実装者と別系統・読み取り専用）／手順と安全の文言を調査と照合／権利と漏洩の全文確認。
- [ ] 12. 公開の基盤: meta.json・README・LICENSE・THIRD_PARTY（three.js）・shared:sync・index:sync・build の除外（tools）・公開ゲート・`npm run check`。
- [ ] 13. PR → 本人の承認 → マージ → 本番確認。X投稿と実機の確認は本人。
- [ ] 14. 宣伝動画（Day96 の `tools/promo/` 方式）。

## 証拠の置き場
`verification.md`（試験の件数・採点の点・独立レビューの指摘と対応・実機の確認を、実施のたびに追記する）。作業記録は `.agent-harness/runs/day097-sabakiba.md`。
