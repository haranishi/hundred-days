# タスク一覧：Day 098「残火の鎌倉 — 隠れ谷の灯」（外部Day掲載）

- [x] **H1（カード用スクショ生成）**：`kamakura-no-zanka` 公開ビルドの実ブラウザ画面（PR #222 反映済み）から `day-098-zanka-no-kamakura/screenshot.webp`（1280×720・209 KB）を生成し目視確認済み。
- [x] **H2（Dayフォルダ作成）**：`day-098-zanka-no-kamakura/meta.json` と `README.md` を作成し、事実・数値（78.4 MiB / 約78MB）・URL・ライセンス表記・X加重文字数（本文 248/280、リプライ 272/280・80/280）を照合済み。
- [x] **H3（共通転送とテスト）**：`infra/day-redirect/worker.mjs`、`infra/day-redirect/wrangler.toml`、`scripts/tests/day-redirect.test.mjs`、`tests/e2e/external-days.spec.mjs` を更新済み。
- [x] **H4（一覧同期）**：`npm run index:sync` で `README.md` の Day 一覧を 98 件に更新し、`npm run build` の `--check` 通過を確認済み。
- [x] **H5（公開前ゲート検証）**：`npm run precheck`・`npm run check:syntax`・`npm run audit:deps`（19プロジェクト失敗0）・`npm run build`・`npm run test:unit`（6,637 pass / 0 fail）・`external-days.spec.mjs`（17 passed）を通過し、`verification.md` に記録済み。
- [ ] **H6（PR作成）**：`feat/day098-zanka-no-kamakura` を push して GitHub PR を作成する。
