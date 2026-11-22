# 検証記録：Day 098「残火の鎌倉 — 隠れ谷の灯」（外部Day掲載）

- 検証日：2026-11-22
- 対象ブランチ：`feat/day098-zanka-no-kamakura`

## 1. 実施した検証と結果

| 検証項目 | コマンド | 結果 |
|---|---|---|
| 秘密・個人情報スキャン | `npm run precheck` | 合格（漏洩パターン検出なし） |
| 構文検査 | `npm run check:syntax` | 合格 |
| 依存監査 | `npm run audit:deps` | 合格（19プロジェクト・失敗0件） |
| 一覧同期・共有検査・サイトビルド | `npm run build` | 合格（98 day(s) / 公開 98（うち外部 11） / スクショ 97 / 動画 71 / OGP付与 87） |
| 全単体テスト（転送・公開URL・ライセンス・公開契約含む） | `npm run test:unit` | 合格（6,638件中 pass 6,637 / fail 0 / skipped 1） |
| 外部Day E2E（Day 098 カード遷移・進捗 98/100） | `npx playwright test tests/e2e/external-days.spec.mjs --reporter=line` | 合格（17 passed / 2 skipped） |
| X投稿文字数チェック（`meta.json` `social.x`） | `prepare-x-post.mjs` 相当の加重文字数計算 | 合格（本文 248/280、リプライ2 272/280、リプライ3 80/280） |
| カード用スクリーンショット目視確認 | `day-098-zanka-no-kamakura/screenshot.webp`（1280×720・209 KB） | 合格（PR #222 反映済みの隠れ谷俯瞰・UI重なりやデバッグ文字なし） |

## 2. 補足・未検証（本番反映後に確認する事項）

- `npm run publish:check -- --day 98` は仕様上 `draft` / `published` かつ `index.html` を持つ Day 専用のため、外部Day（`status: "external"`）である Day 98 は上記の `npm run check`・`day-redirect.test.mjs`・`external-days.spec.mjs` により契約検証を完了した。
- 本番デプロイ（`day98.rairakku.com` の Cloudflare Pages 作成・カスタムドメイン割当・`rairakku-day-redirect` Worker の反映・PRマージ）と、デプロイ後の本番疎通確認（`https://day98.rairakku.com/`・`https://rairakku.com/day98/`・`https://rairakku.com/100days/day-098-zanka-no-kamakura/`）および X 投稿は本人作業として未実施。
