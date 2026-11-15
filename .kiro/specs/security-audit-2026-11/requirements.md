# Requirements: 全リポジトリ・セキュリティ監査と修正（2026-11-15）

## 目的
`haranishi/hundred-days` 全体（Pages Functions・Cloudflare Workers・ビルド/CSP/ヘッダ基盤・公開 Day アプリ・Day76/79/84/92 等の個別ソース・依存ロックファイル）に対して、信頼境界起点のセキュリティ監査（`security-and-hardening` / `security-loop`）を実施し、再現可能な脆弱性（セキュリティホール）および修正可能な依存脆弱性を根本原因から修正し、回帰テストを残す。

## 対象範囲
1. **バックエンド・エッジ境界**
   - `functions/api/_middleware.js` および `functions/api/day-*/*.js`
   - `infra/day-redirect/worker.mjs`
   - `day-076-henkan-desk/source/server/**`
   - `day-084-airpresenter/web/worker.mjs`、`day-084-airpresenter/web/policy.mjs`、`day-084-airpresenter/source/server.js`
2. **ビルド・ヘッダ・配信・CI 境界**
   - `scripts/build.mjs`、`scripts/lib/**`、`scripts/precheck.mjs`、`scripts/audit-dependencies.mjs`、`scripts/serve-*.mjs`
   - `static/_headers`（または生成 `dist/_headers`）、`static/_redirects`、`day-*/_headers`
   - `.github/workflows/*.yml`
3. **クライアント入力・XSS・ストレージ・URL 境界**
   - `shared/share.js`、`scripts/site/home.js`、`scripts/site/intro.js`
   - `day-035-front-page/`、`day-074-link-dokumi/`、`day-089-frostline/source/`、`day-092-shuwa/source/` および `day-001`〜`day-092` の HTML/DOM/URL/JSON 取込箇所
4. **依存関係アラート**
   - GitHub Dependabot Open アラート `#60`（`minimatch`）、`#58`（`deepmerge`）、および全18プロジェクトのロックファイル（詳細は `.kiro/specs/dev-deps-security-2026-10/followup-2026-11-15.md`）。

## 必須要件
- **R1（再現性に基づくトリアージ）**: 推測やスタイル指摘でコードを改変せず、`security-loop`（Attacker / Defender / 独立 Verifier）で再現確認された境界違反（`confirmed`）のみを修正対象とする。誤検知は理由を添えて `rejected` とする。
- **R2（根本原因の最小修正と正常系維持）**: すべての確認済み脆弱性について、境界（Origin/メソッド/認証、URL・リダイレクト先検証、HTML/SVG エスケープ、プロトタイプ汚染対策、アーカイブ展開・パス検証、ヘッダ・CSP 設定等）で最小かつ根本的な修正を行い、既存の正常系（positive controls）と公開動作を壊さない。
- **R3（回帰テストの追加）**: 修正した各境界に対して通常の自動テストスイート（`node --test` または `vitest`）へ悪用入力・バイパス亜種・正常入力の回帰テストを追加する。
- **R4（品質ゲートと検証記録）**: `npm run precheck`、`npm run check:syntax`、`npm run test:unit`、`npm run audit:deps`、`npm run build`、対象 Day のテスト、および `validate_run.py`（`security-loop` の契約検証）を通過させ、最終報告では実測結果・非修正項目（上流パッチ未提供の `#58` 等）を事実どおり記録する。
