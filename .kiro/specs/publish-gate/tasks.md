# 実装タスク：公開ゲート

境界の名前は [design.md](design.md) の部品。完了は、テストや実挙動の証拠で判断する。

- [x] 1. 公開の判定を共通にする
  - `scripts/lib/day-status.mjs` と単体テスト。`scripts/build.mjs`・`shared-share.spec.mjs`・`external-days.spec.mjs` の判定を、これ経由に切り替える。
  - 証拠：未設定のとき、`dist/` が変更前と同じ内容（全2969ファイルのハッシュが一致）。ビルドの除外規則は `scripts/lib/dist-files.mjs` に出し、ビルドと契約で共有した（独立レビューの指摘3）。
  - _Boundary: day-status / Build_
  - _Requirements: 3.1, 3.3_
- [x] 2. 契約の登録簿と、全Dayへの静的な検査
  - `scripts/lib/publish-contract.mjs`、`scripts/tests/publish-contract.test.mjs`。公開済みの全67Dayが、7契約で違反0件。Day71・Day70の旧い共有文は、失敗する例として試験に持つ。独立レビューの指摘（コメント内の `</head>`・属性値の中のタグ文字列・文字参照・CRLF・配信されない画像）は、先に失敗する試験を足してから直した。
  - _Boundary: publish-contract_
  - _Depends: 1_
  - _Requirements: 1.1〜1.4, 4.1, 4.2_
- [x] 3. `publish:check` コマンド
  - `scripts/publish-check.mjs` と、`package.json` の `publish:check`。純粋な部分は単体テスト。検査用のサーバー（`serve-dist.mjs`）を自分で立てて止める（ポートはOSに選ばせ、起動の完全な1行から読む）、終わりに通常のビルドへ戻す、`meta.json` を触らない。
  - _Boundary: publish-check_
  - _Depends: 1, 2_
  - _Requirements: 2.1〜2.5_
- [x] 4. 手順書
  - `AGENTS.md` の公開前チェック（下書きへの `publish:check`、新Dayは公開用の状態で出す既定）、`docs/ci.md`、`.kiro/steering/publish-contract.md`。
  - _Boundary: Docs_
  - _Depends: 2, 3_
  - _Requirements: 4.3, 5.1〜5.3, 6.1〜6.3_
- [x] 5. 検証（メインが自分で実行する）
  - 結果：`npm run check` 成功（`npm run test:unit` 3607件〔成功3606・スキップ1・失敗0〕を含む）、構文・precheck 成功、通常ビルドは全2969ファイル一致、通常の横断E2E 282件成功、`publish:check -- --day 71` 合格（282件成功・`dist/` は変更前と一致）。
  - Day71の事故の再現：旧い共有文と `draft` に戻すと、静的な契約が `share-text-title` で、ブラウザ試験が `shared-share` で落ちる（CIで落ちたのと同じ失敗）。共有文を直すとdraftのままでも合格する。
  - 中断：SIGTERMを1〜6秒後、SIGINTを30秒後、SIGHUPを2・25秒後に送ると、終了コード1で、サーバーは残らず、`dist/` は通常のビルドに戻る。`| head -n 3` で出力先が先に閉じても、最後まで走って戻す。起動の途中の中断でサーバーが残る不具合は、この検証で見つけて直した。
  - _Boundary: Feature Validation_
  - _Depends: 1〜4_
- [x] 6. 独立レビューと修正
  - 会社用Codex（gpt-6-astra・読み取り専用）が差分を見た。第1周の7件は、すべて採用して直した（記録は `.agent-harness/runs/publish-gate/review-1.md`）。第2周は、途中でクレジットが切れ、経過にあった新規2件（ポート番号を途中の行から読む・属性値の中の `</head>`）を直した。第3周は、会社用Codexが起動の直後にクレジット切れで止まったので、実装とは別のOpusが行った。第2周・第3周の記録は `.agent-harness/runs/publish-gate/review-2.md`。第3周の指摘のうち、SIGHUPと出力先の切断で `dist/` が戻らない問題（中）、題名の `$` でビルドの差し込みが変わる問題、statusの案内の食い違い、警告の文、試験の実時間への依存は、直した。非適合のHTMLの読み違えは、steering に注記した。実装は、会社用Codexのクレジット切れのため、Opusの別サブエージェントが行った。
  - _Depends: 5_
