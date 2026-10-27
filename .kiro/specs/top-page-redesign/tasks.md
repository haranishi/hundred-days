# 実装タスク：トップページの作り直し

境界は [design.md](design.md) の「置き場所と境界」。完了は、テストと実画面の証拠で判断する。実装は Codex（第1周は会社用・第2周は会社用がクレジット切れのため個人用）、検証と採点は別。

- [x] 1. 純粋な部分と単体テスト
  - `scripts/lib/home-model.mjs`・`scripts/tests/home-model.test.mjs`（9件）。`fold`・`tagKey`＋別名・`splitTitle`・`quickTags`（占有率40%の境）・`buildMatrix`（100超・欠番・記録のみ）。画面側への埋め込みは `runInNewContext` で確認。
  - _Requirements: 2, 3, 4_
- [x] 2. ページの組み立て（HTML・CSS・書体・メタ）
  - `scripts/build.mjs` のページ部分・`scripts/site/home.css`。証拠：`dist/day-*` は本番のmainを再ビルドした結果と全ファイル一致（差は同梱書体4ファイルだけ）。HTMLは約547KB（本番484KB。gzip 153KB対138KB。制作メモは全文のまま）。
  - _Requirements: 1, 6, 7, 11_
- [x] 3. 画面の挙動
  - `scripts/site/home.js`。計測は既存5イベントが同じ名前と値で出ることをE2Eで確認。
  - _Requirements: 2, 3, 4, 5, 12, 13_
- [x] 4. 同梱書体の権利とOG画像
  - `THIRD_PARTY_NOTICES.md`・`LICENSE`・OFL本文・`og.png`（1200×630。目視済み。点灯数は `meta.json` から数える）。
  - _Requirements: 7, 8_
- [x] 5. ブラウザテスト
  - `tests/e2e/home.spec.mjs`：29件（390・768・1440px、JSなし、動きを減らす、計測、段のそろい、プレビューの高さ、追従帯）。変異テスト：第1周で6か所・第2周で6か所・最終で3か所を壊し、すべて落ちることを確認。
  - _Requirements: 2〜6, 12, 13_
- [x] 6. 検証
  - `npm run check`（公開前チェック・構文・単体テスト4,932件〔失敗0〕・ビルド）。既存の一覧を見る試験（`external-days`・`day-007〜010`・`day-050`・`day-051`・`security-headers`）は全て通る。
  - Lighthouse（モバイル）：アクセシビリティ・ベストプラクティス・SEO・Agentic Browsing すべて100。CLS 0。遅い回線・4倍遅い端末でのモバイルLCP 0.74秒（題名の文字）。キーボードだけで全操作、Safari（WebKit）でも同じ。
- [x] 7. 別セッションの採点
  - 第1周 14/20（不合格）→ 実在した指摘を直す → 第2周 18/20（合格・0点なし）。合格後に、残った実在の指摘（段のそろい・追従帯・プレビューの高さ・下線・影のしみ・Xの入口）を直した。**この最後の直しは再採点していない**（テストと自分の画面確認で検証）。記録は `.agent-harness/runs/top-page-redesign.md`。
- [ ] 8. 作業ブランチへのcommit・push・PR（マージと本番反映は本人）
  - 公開前チェック5点：`npm run precheck`（OK）、新規ファイルの全文確認、書体の権利（OFL本文を同梱）、文言と数字の照合（README・`meta.json` と一致）、ビルドと実操作。
