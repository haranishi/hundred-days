# Security Audit & Loop Verification Record (`security-audit-2026-11`)

- **対象ブランチ**: `fix/security-audit-2026-11-15`（base commit `a34bfbce954855978ea2b2a61c7fd6330dfb9569`）
- **`security-loop` 実行記録**: `.agent-harness/runs/security-loop/20261115-hundred-days/run.json`（`validate_run.py` -> `VALID`）
- **スナップショット**:
  - `source.before`: `tree_sha256 = a3ef4e5d33ff594253767b5b5977ed4489b98f59c0a0515998916d381d7db505`（4639 files）
  - `source.after`: `tree_sha256 = 9e372e0cdb62ca9c4004eb32563e976c67890a74577bbac428f9b5f7e6d51086`（4639 files）
- **サブエージェント役割分離**:
  - Client/SupplyChain Attacker: `513d81a7-6fae-4e64-97e3-619e83b3b995`
  - Backend/Edge QA Reviewer (Attacker): `10858699-57be-4853-b898-39978a9e7cbf`
  - Defender: `e815f5b5-4722-4f35-83a6-080f8dfb385c`
  - Independent Verifier: `60721547-6121-43cf-9883-2e509efb1d34`

## 1. GitHub Dependabot アラートの対応状況（`day-092-shuwa/source/package-lock.json`）

| Alert | Package / Advisory | 判定 | 対応と根拠 |
|---|---|---|---|
| **#60** (Moderate) | `minimatch` (`10.2.6` -> **`11.0.8`** via `glob@14.0.5`) | **解消済み (Fixed)** | `day-092-shuwa/source/package.json` に `"overrides": { "glob": { ".": "14.0.5", "minimatch": "11.0.8" } }` を追加し `--ignore-scripts` で `package-lock.json` を再生成。`glob@14.0.5` / `minimatch@11.0.8` ともに公開 72 時間以上経過・`hasInstallScript: false`。`npm --prefix day-092-shuwa/source audit --json` で Critical/High/Moderate すべて 0、`vitest` 39/39 ファイル（751/751 テスト）合格、`vite build` 後の `dist/day-092-shuwa/` 28 ファイルすべての SHA-256 がベースラインと完全一致。 |
| **#58** (Low) | `deepmerge@4.3.1` (`GHSA-gcqx-w48m-w2h4`) | **上流未修正・開発ビルド専用 (Non-reachable)** | 上流 `deepmerge` は `4.3.1` が最新かつ `first_patched_version: null`（修正版未リリース）。`vite-plugin-pwa -> workbox-build -> @rollup/plugin-node-resolve -> deepmerge` の開発ビルド依存のみに存在し、`dist/day-092-shuwa/` 本番配信バンドルには 0 byte も含まれない。虚偽の解消・無理なメジャーダウングレードは行わず事実どおり記録（GitHub Dependabot 上で「開発専用・パッチ未提供」として Dismiss するか維持するかはメンテナ判断）。 |

## 2. リポジトリ全体のセキュリティ修正と検証結果（9 件修正・3 件棄却）

1. **`day-076-formula-hyperlink-bypass`**: `day-076-henkan-desk/source/server/documents/content.ts` の `checkFormula` を `text.matchAll(/\bHYPERLINK\s*\(/gi)` に変更し、すべての `HYPERLINK(` 呼び出しの直後引数が `"` リテラル + `[,)]` で閉じ、`https://` または `mailto:` で始まることを検証。回帰テスト `office.test.ts` 追加、ベースライン/バリアントプローブとも `boundary_enforced`。
2. **`day-084-host-origin-request-bypass`**: `day-084-airpresenter/source/server.js` の `validateRequest` で `req.headers.host` の構文・userinfo・パス・正規化一致（`hostUrl.host === rawHost.toLowerCase()`）・許可ホスト・ポートを先に検証し、`new URL(req.url, hostUrl.origin)` 解決後も `url.origin === hostUrl.origin` と正確な `req.headers.origin` 一致を強制。`server.test.cjs` 更新、`tools/package.py` で `airpresenter-local.zip` 再梱包。実 TCP 接続のベースライン/バリアントプローブおよび `server.test.cjs` + `distribution.test.mjs`（14/14）合格。
3. **`day-035-ssrf-reserved-meta-bypass`**: `day-035-front-page/lib/target.js` で明示ポート拒否・予約 TLD（`arpa|corp|example|test|invalid|intranet|private`）拒否・自ホスト（`hundred-days.pages.dev`, `rairakku.com` および配下サブドメイン）拒否を追加。`functions/api/day-035/page.js` `extractMeta` で `canonical` と `image`（`https:` のみ）を `validateTarget` で検証。
4. **`day-023-decodehtml-codepoint-range` / `day-023-opensearch-url-scheme`**: `functions/api/day-023/trend.js` で数値文字参照を `1..0x10FFFF`（サロゲート除外）に制限。共有 `safeHttpUrl`（`day-023-magtrace/lib/format.js`）を OpenSearch `<link>` と `day-023-magtrace/app.js` 描画の両方に適用。
5. **`day-031-wiki-url-scheme`**: `day-031-shape-where/lib/wiki.js` に `safeHttpUrl` を追加して `pickFields.url` と `app.js` の `wikiLink` / `wikiPhotoLink` に適用し `rel="noopener noreferrer"` を設定。
6. **`day-030-windy-url-scheme`**: `functions/api/day-030/windy.js` と `day-030-world-window/lib/links.js` に `safeHttpsUrl`（`https:` 限定）を追加し、`trimDetail` 全 7 URL フィールドと `ui.js`（`externalLink` / `providerUrl` / `renderViewer` / `renderWindy`）へ適用。
7. **`day-013-gov-href-scheme`**: `day-013-gov-answers/lib/gov.js` に `safeSpeechUrl`（`http:` / `https:`）を追加し、`app.js` で不正スキーム時の `<a href>` 生成を抑止（`rel="noopener noreferrer"` 付与）。
8. **`dist-packaging-leaks`**: `scripts/lib/dist-files.mjs` `isServedPath` で全深さのドット始まりファイル・ディレクトリ、`package.json` / `package-lock.json` / 静的 `_headers`、全 Day トップレベルの `tools/` / `scripts/` を除外。`day-073-offbeat/src/*`、`day-084-airpresenter/airpresenter-local.zip`、ビルド後生成 `dist/day-084-airpresenter/_headers`、`assets/tools/og.png` は配信維持を確認。
9. **棄却（正当設計・既存防御あり）**: `day-084-pages-headers-and-zip`（Pages リダイレクト `frame-ancestors 'none'` と Worker `policy.mjs` の役割分担 + 意図的配布 zip）、`day-055-kyaraben-headers-inheritance`（`security-headers.spec.mjs` により継承担保済み）、`day-092-deepmerge-alert-58`（上流パッチなし・開発ビルド限定）。

## 3. プロジェクト全体ゲート実行記録（最終編集後）

| コマンド | 結果 | 補足・スコープ |
|---|---|---|
| `npm run precheck` | **合格 (exit 0)** | NG 0 件 |
| `npm run check:syntax` | **合格 (exit 0)** | 2129 ファイル、エラー 0 件 |
| `npm run build` | **合格 (exit 0)** | 全 92 Day ビルド完了（`dist/` 配下のリーク 0 件をプローブで確認） |
| `npm run audit:deps` | **合格 (exit 0)** | 全 18 プロジェクト監査（17 件 `0 vulnerabilities`、`day-092-shuwa/source` `critical=0 high=0 moderate=0 low=4`） |
| `npm run test:unit` | **合格 (exit 0)** | 5551 件中 5550 合格 / 0 失敗 / 1 スキップ（`day-030` Natural Earth 任意キャッシュ未配置） |
| `npm --prefix day-076-henkan-desk/source run typecheck && npm --prefix day-076-henkan-desk/source test` | **合格 (exit 0)** | 15 ファイル 175 テスト合格、2 ファイル 9 テストスキップ（LibreOffice/Docker 環境依存） |
| `npm --prefix day-092-shuwa/source test && npm --prefix day-092-shuwa/source run build` | **合格 (exit 0)** | 39 ファイル 751 テスト合格、成果物ハッシュ一致 |
| `npm --prefix day-092-shuwa/source run typecheck` | **既存失敗 (exit 1)** | `src/hand/dev/words-main.tsx:27` が未追跡研究ファイル `../../../.agent-harness/research/r2_numbers_words.json` を参照（本 PR 変更外） |
| `node --test day-084-airpresenter/source/tests/server.test.cjs day-084-airpresenter/tests/distribution.test.mjs` | **合格 (exit 0)** | 14 テストすべて合格（実アーカイブ起動・PowerPoint 変換含む） |
| `npm run publish:check -- --day 092 --static-only` | **合格 (exit 0)** | 静的契約合格 |
| `npm run test:api-abuse` | **未実施 (ENOENT)** | ローカル検証環境に `wrangler` 未導入のため実行不可（`probe-guarded-controls.mjs` で `_middleware.js` 単体制御を確認、GitHub Actions で実行） |
| `./node_modules/.bin/playwright test`（対象 12 spec ファイル） | **239 合格 / 1 スキップ / 1 既存失敗** | 変更対象 Day 013/023/030/031/035/073/076/084 および `security-headers.spec.mjs` すべて合格。1 スキップは `external-days.spec.mjs`（Day 83）、1 失敗は未変更 `tests/e2e/day-074.spec.mjs:510`（390x844 `#verdict-actions li` ビューポート位置判定の既存失敗） |
| `python3 <skill>/validate_run.py .agent-harness/runs/security-loop/20261115-hundred-days/run.json` | **合格 (`VALID`, exit 0)** | 役割分離 3 ID・前後スナップショット・プローブ不変性・ポジティブコントロール・バリアント検証すべて整合 |
